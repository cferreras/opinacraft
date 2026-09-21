# Búsqueda en lenguaje natural

El buscador del catálogo entiende frases como «survival tranquilo en España» y las convierte en
filtros normales del catálogo (`?mode=`, `?country=`). La interpretación la hace **Jev** (TypeSafe
System One), que no genera texto: recibe la consulta y dos catálogos cerrados, y devuelve un valor
de cada uno con su confianza.

Todo esto es una capa **encima** de la búsqueda por palabras clave que ya existía. Si falta una
clave, si Jev tarda más de 2 s, si se agota el tope diario o si Turnstile falla, el buscador sigue
funcionando exactamente como antes.

## El orden en que se gasta dinero

```
normalizar → diccionario → caché → tope diario → sesión → Jev → filtros
```

| Paso | Fichero | Coste |
| --- | --- | --- |
| Normalizar (minúsculas, sin tildes, espacios, 80 caracteres) | `src/lib/search/normalize.ts` | 0 |
| Diccionario de sinónimos propio | `src/lib/search/dictionary.ts` | 0 |
| Caché de interpretaciones en Postgres | `src/lib/search/cache.ts`, `store.ts` | 1 consulta |
| Tope diario global | `src/lib/search/budget.ts` | 1 consulta |
| Cupo por sesión verificada | `src/lib/search/runtime.ts` | 1 consulta |
| Llamada a Jev (4 preguntas en una petición) | `src/lib/search/jev.ts` | 1 llamada |
| Bandas de confianza y política | `src/lib/search/bands.ts`, `interpret.ts` | 0 |

Si el diccionario resuelve **todos** los términos, no se llama a Jev. Solo las consultas que llegan
a Jev necesitan sesión de Turnstile; el diccionario, la caché y las palabras clave van libres.

## Las cuatro preguntas

Una sola petición con cuatro juicios independientes sobre el mismo estado
(`src/lib/search/jev.ts`):

- `modalidad_principal` — Choice sobre los 30 slugs de `game-modes.ts` + `sin-modalidad`.
- `modalidad_secundaria` — el mismo catálogo, para «survival con economía».
- `pais` — Choice sobre los 21 códigos de `countries.ts` + `sin-pais`.
- `busca_por_nombre` — Noul: la consulta nombra un servidor o una IP en vez de describir cómo
  quiere jugar la persona.

Todo lo que devuelve se valida contra los catálogos antes de salir del módulo, así que no puede
producir un filtro que la base de datos no conozca.

### Bandas de confianza

| Confianza | Qué pasa |
| --- | --- |
| ≥ 0.9 | El filtro se aplica |
| 0.5 – 0.9 | Se ofrece como chip quitable («¿Querías decir?») |
| < 0.5 | Se ignora |

Son los umbrales de partida que recomienda la documentación de TypeSafe, no una medición sobre
nuestros datos. Cada lectura se registra en los logs (`[search] jev reading`, con la consulta
normalizada, el modelo y las confianzas, sin IP ni nada identificativo) para poder ajustarlos con
datos reales. Cambiar una banda **no** invalida la caché: la caché guarda el juicio y la política se
aplica al leerla.

### Filtros y palabras clave se excluyen

La condición de palabras clave busca la frase completa contra el nombre y la descripción, así que
combinarla con un filtro de modalidad cruzaría dos conjuntos estrechos y casi siempre daría cero
resultados. Por eso: si entendimos la consulta, filtramos; si no, buscamos el texto. Y cuando Jev
dice que la consulta nombra un servidor concreto, gana la búsqueda por texto y los filtros pasan a
ser sugerencias.

## Turnstile

- Widget en modo **Managed**, renderizado con `execution: "execute"` y `appearance:
  "interaction-only"`, que se ejecuta cuando la persona hace foco en el buscador (no al cargar la
  página: quien no busca no recibe ningún reto). Con esa combinación el widget es invisible en la
  práctica — «Most visitors will never see the widget, but suspected bots will encounter the
  interactive challenge» — y sigue pudiendo presentar un reto cuando Cloudflare lo considere
  necesario.
- El modo **Invisible** del panel, pese al nombre, es el que *no* sirve aquí: «Invisible widgets are
  never shown regardless of the appearance setting», así que la opción «¿Eres humano? Verifícate» no
  tendría nada que mostrar.
- El backend valida el token con `siteverify` y emite una cookie firmada (HMAC-SHA256, 30 min,
  `HttpOnly`). El token lleva solo un id opaco y una expiración: **el cupo no viaja en el token**,
  porque una copia antigua podría recargarlo. El cupo vive en Postgres, indexado por ese id.
- Si Turnstile falla: se muestra «Búsqueda con IA no disponible ahora mismo» y la opción «¿Eres
  humano? Verifícate», que abre el widget interactivo. La búsqueda normal no se interrumpe.

## Qué hay que configurar a mano

### 1. Variables de entorno

Están documentadas en `.env.example`. Resumen:

| Variable | Dónde | Notas |
| --- | --- | --- |
| `JEV_SEARCH_ENABLED` | Dev / Preview / Prod | `false` desactiva la función sin desplegar |
| `TYPESAFE_API_KEY` | solo servidor | la lee el SDK por su nombre estándar |
| `JEV_DAILY_CALL_LIMIT` | todos | por defecto 5000 |
| `JEV_TIMEOUT_MS` | todos | por defecto 2000, máximo 10000 |
| `JEV_CACHE_TTL_HOURS` | todos | por defecto 72 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | cliente | pública por diseño |
| `TURNSTILE_SECRET_KEY` | solo servidor | distinta por entorno |
| `AI_SEARCH_SESSION_SECRET` | solo servidor | ≥ 32 caracteres, distinta por entorno |
| `AI_SEARCH_SESSION_QUOTA` | todos | búsquedas con IA por sesión de 30 min |

La función se activa solo si `JEV_SEARCH_ENABLED=true` **y** están las tres claves. Con cualquiera
de ellas ausente, el buscador es el de siempre y no se renderiza ningún widget.

### 2. Cloudflare Turnstile

1. Crear un widget en modo **Managed** (no *Invisible*: ver arriba).
2. Dominios: `www.opinacraft.com` para el widget de producción, y `preview.opinacraft.com` más
   `localhost` para el de no-producción.
3. Copiar la *site key* a `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y la *secret key* a
   `TURNSTILE_SECRET_KEY`.

Para desarrollo, Cloudflare publica claves de prueba que no requieren widget propio:

| Site key | Secret key | Qué prueba |
| --- | --- | --- |
| `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | camino feliz: siempre pasa |
| `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` | siempre falla → «No disponible ahora mismo» |
| `3x00000000000000000000FF` | `1x0000000000000000000000000000000AA` | fuerza reto interactivo → «¿Eres humano? Verifícate» |

Las claves de prueba emiten tokens `XXXX.DUMMY.TOKEN.XXXX` que una *secret key* real rechaza, así
que hay que emparejarlas siempre con su secreta de prueba.

### 3. Rate limiting en Cloudflare

Las rutas ya llevan su propio contador en Postgres (30 interpretaciones/min y 10 verificaciones/min
por IP), pero conviene una regla delante para que el tráfico basura no llegue ni a gastar una
consulta. En *Security → WAF → Rate limiting rules*:

| Ruta | Expresión | Límite | Acción |
| --- | --- | --- | --- |
| `/api/search/interpret` | `http.request.uri.path eq "/api/search/interpret" and http.request.method eq "POST"` | 30 req/min por IP | Managed Challenge |
| `/api/search/session` | `http.request.uri.path eq "/api/search/session"` | 10 req/min por IP | Managed Challenge |

Managed Challenge en lugar de Block: un falso positivo se resuelve solo. Conviene usar los mismos
números que la aplicación, o depurar una diferencia entre las dos capas será innecesariamente
confuso.

El plan de Cloudflare limita cuántas reglas de este tipo se pueden tener (en Free, una sola y con
ventanas restringidas). Si es el caso, la prioritaria es la de `/api/search/interpret`, que es la
que cuesta dinero; el tope de `/api/search/session` ya está cubierto por la aplicación.

`requestIp` (`src/lib/search/request-ip.ts`) lee el primer valor de `x-forwarded-for`, que es lo que
ponen Cloudflare y Vercel. Si algún día se mete otro proxy por delante, ese orden hay que revisarlo.

### 4. Migración

```
pnpm db:migrate
```

Aplica `src/migrations/20260921120000_search_interpretations/`, que crea la tabla de caché. Es una
caché: se puede vaciar en cualquier momento y el único coste es una llamada más a Jev.

### 5. CSP

`next.config.ts` ya incluye `https://challenges.cloudflare.com` en `script-src` y `frame-src`. La
política sigue siendo `Report-Only`; si algún día pasa a modo bloqueo, esos dos directivos son los
que Turnstile necesita.

## Tests

| Fichero | Qué cubre |
| --- | --- |
| `tests/search-dictionary.test.ts` | normalización, sinónimos, códigos ambiguos («es» como verbo), cuándo *no* se llama a Jev |
| `tests/search-fallback.test.ts` | timeout, 429, 529, 401, confianza baja, tope agotado, caché fresca y caducada |
| `tests/search-budget.test.ts` | tope diario, reinicio por día, contador roto, bandas de confianza |
| `tests/search-session.test.ts` | firma y expiración de la sesión, Turnstile, y que las claves no salgan del servidor |

Ninguno toca la red: la frontera con Jev es `src/lib/search/jev.ts` y se inyecta un doble.

## Lo que queda por medir

La calibración de Jev sobre consultas reales de Minecraft en español está sin verificar. Los
umbrales 0.9 / 0.5 son un punto de partida; con los logs de `[search] jev reading` de unas semanas
se pueden ajustar, y el sitio para hacerlo es `src/lib/search/bands.ts`, sin tocar el resto.
