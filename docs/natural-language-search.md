# Búsqueda en lenguaje natural

El buscador del catálogo entiende frases como «survival tranquilo en España» y las convierte en
filtros normales del catálogo (`?mode=`, `?country=`, `?access=`, `?edition=`). La interpretación
la hace **Jev** (TypeSafe System One), que no genera texto: recibe la consulta y unos catálogos
cerrados, y devuelve un valor de cada uno con su confianza.

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
| Llamada a Jev (6 preguntas en una petición) | `src/lib/search/jev.ts` | 1 llamada |
| Bandas de confianza y política | `src/lib/search/bands.ts`, `interpret.ts` | 0 |

Si el diccionario resuelve **todos** los términos, no se llama a Jev. Solo las consultas que llegan
a Jev necesitan sesión de Turnstile; el diccionario, la caché y las palabras clave van libres.

## Las seis preguntas

Una sola petición con seis juicios independientes sobre el mismo estado
(`src/lib/search/jev.ts`):

- `modalidad_principal` — Choice sobre los 30 slugs de `game-modes.ts` + `sin-modalidad`.
- `modalidad_secundaria` — el mismo catálogo, para «survival con economía».
- `pais` — Choice sobre los 21 códigos de `countries.ts`, **más las regiones** (`latam`), +
  `sin-pais`. Una sola pregunta responde país o región, y se lee en el campo al que pertenezca.
- `acceso` — Choice sobre las **intenciones** de `catalog-filters.ts` (`premium`, `no-premium`,
  `whitelist`) + `sin-acceso`.
- `edicion` — Choice sobre `java` / `bedrock` + `sin-edicion`.
- `busca_por_nombre` — Noul: la consulta nombra un servidor o una IP en vez de describir cómo
  quiere jugar la persona.

Todo lo que devuelve se valida contra los catálogos antes de salir del módulo, así que no puede
producir un filtro que la base de datos no conozca.

### Grupos: regiones e intenciones

Dos de las facetas se piden con una palabra que vale por varios valores, y ninguna de las dos es un
parámetro nuevo — el grupo viaja **dentro** del parámetro que ya existía y se expande al leerlo:

| Lo que se escribe | Lo que viaja en la URL | Lo que llega a la base de datos |
| --- | --- | --- |
| «servidores latinos» | `?country=latam` | los 18 países de Latinoamérica (sin España) |
| «no premium», «pirata» | `?access=no-premium` | `non-premium` **y** `semi-premium` |

La segunda fila es la que importa: los dos valores almacenados aceptan cuentas sin licencia y solo
se diferencian en si las premium escriben contraseña, así que responder con uno solo esconde
servidores que hacen exactamente lo que se pidió.

Por eso `?country=` y `?access=` se leen como «cualquiera de estos», igual que `?mode=`. El chip de
filtro activo y el selector de la barra muestran el grupo, no sus valores: una región se quita con
un clic, no con dieciocho.

### El diccionario gana donde ha acertado literalmente

Los modos se **unen** entre diccionario y Jev, porque una consulta puede nombrar dos formas de
jugar de verdad. País y acceso no: ahí el diccionario ha casado una palabra que la persona escribió
y Jev está conjeturando sobre esas mismas palabras, así que un «mx» confiado pero equivocado no
debe ensanchar una consulta que ya decía «España». Dos países conviven cuando el **diccionario**
leyó los dos («españa y mexico»), que es una decisión suya.

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

## Valoración servidor por servidor

Las facetas no pueden expresar todo. «Pocos miembros», «de chill», «sin tóxicos» no son modalidad,
país, acceso ni edición, y ningún vocabulario los convertirá en eso: son preguntas sobre **cómo es**
un servidor concreto, y solo puede responderlas algo que haya leído ese servidor. Para esas consultas
Jev puntúa cada servidor visible con un **Noul** — la probabilidad de que sea lo que se pidió — y el
catálogo se ordena por esa puntuación.

### Quién decide el camino

La decisión no cuesta una petición extra: es la séptima pregunta de la petición que ya se hacía
(`pide_algo_no_categorizable`). Antes de llegar a ella:

| La consulta | El camino | Coste |
| --- | --- | --- |
| `español` | el diccionario la resuelve entera | 0 |
| `cubusfera` | `busca_por_nombre` alto → texto | 1 petición |
| `survival en españa` | facetas | 0 |
| `survival tranquilo` | faceta **y** valoración | 1 + una por servidor |
| `pocos miembros` | valoración pura | 1 + una por servidor |

Los centinelas (`sin-modalidad`, `sin-pais`…) casi bastarían, pero se les escapa el caso importante:
`survival tranquilo` **sí** resuelve una modalidad, así que por esa regla devolvería *todos* los
survival y «tranquilo» se caería. La pregunta explícita lo atrapa. Su umbral es 0.7, sesgado hacia el
camino barato: quien decide gastar es un juicio del modelo.

### Sin prefiltro léxico

`ilike` y `similarity` **no** eligen a quién se valora. Sería circular —usar la señal más débil para
decidir qué puede ver la más fuerte— y en las consultas que justifican esto (`pocos miembros` contra
«comunidad pequeña») devuelven cero. Lo único que recorta el conjunto es lo que la persona **escribió
literalmente** y el diccionario casó: en `chill en latam con pocos jugadores`, `latam` deja fuera a
España sin perder nada, porque un servidor español no satisface «en latam» por alta que sea su nota.
Las facetas que *Jev infirió* no recortan: son conjeturas sobre las mismas palabras que el juicio ya
pondera.

### Lo que Jev ve, y lo que no

El perfil lleva nombre, descripción, modalidades, país, acceso, ediciones, versión, jugadores y
estado. **Las reseñas quedan fuera** (`reviewAverage`, `reviewCount` y el texto de las opiniones), y
hay un test que lo sujeta: serializa el perfil y falla si aparece cualquier rastro de ellas. Buscar
«survival tranquilo» no debe convertirse en «survival tranquilo que además está bien valorado» — el
catálogo ya ordena por nota, y mezclarlo esconderría un servidor nuevo que encaja perfectamente.

Los jugadores y la versión **no** salen de `servers.monitor_*`: esa copia dejó de escribirse cuando el
monitor se mudó a su base de datos, y un recuento obsoleto respondería «pocos jugadores» con
seguridad y mal. Se piden a la API del monitor, y si no contesta el perfil dice que no hay datos.

### Medido, no estimado

Contra los 60 servidores del seed, con `jev-1.13.0`:

| | Medido |
| --- | --- |
| Latencia por petición | mediana 302 ms, p95 445 ms |
| Tokens de entrada por servidor | 462 |
| Coste por consulta nueva (300 servidores) | ~$0,0058 |
| Concurrencia 25 y 50 | 60/60, **cero 429** |
| 300 servidores a concurrencia 50 | ~5 s |

**Un servidor por petición, y los lotes descartados.** Agrupar quince por petición era cuatro veces
más rápido y barato, pero cambiaba las respuestas: con varios servidores en un estado el modelo los
juzga **entre sí**, así que la nota de un servidor depende de con quién viajó. `pocos miembros` puso 8
servidores sobre 0.5 en lotes de quince y **ninguno** de uno en uno; el solape de los cinco mejores
fue 2/5. El mismo servidor sacó 0.75 acompañado y 0.32 solo. Eso es fatal para la caché: si la
pertenencia al lote decide la nota, añadir un servidor rebaraja los lotes e invalida las 300 notas —
justo lo que la caché existe para evitar. Uno por petición conserva la propiedad que documenta
TypeSafe (Noul comparable entre peticiones) y con ella un umbral que significa algo.

**Y por eso no hay porcentaje por servidor en la interfaz.** El valor absoluto se mueve con cuánto
escribió la persona; el **orden** es la parte fiable. Mostrar «90 % de coincidencia» sería presumir de
una precisión que la medición no respalda.

### Cuando nada llega al umbral

Juzgando en aislamiento no hay marco comparativo, así que una consulta telegráfica recibe números
conservadores: `comunidad pequeña y tranquila` dejó once servidores sobre 0.5, y `pocos miembros` —la
misma petición con menos palabras— se quedó en 0.44 y no habría mostrado **nada**. Así que si nada
pasa el umbral pero hay un orden, se muestran los mejores y la interfaz dice que son aproximados. Un
cero sí se descarta: es un «no», no un «sí débil».

### La caché, y por qué expira por hash y no por reloj

`search_server_scores` guarda `(query_hash, server_id) → noul`, con el **hash del perfil** que se
envió. Editar una descripción recuesta **ese** servidor y deja en pie las otras 299; un TTL solo
habría elegido entre retener una respuesta rancia días o tirar trescientas buenas porque una cambió.
El hash ve *bandas* de jugadores, no el número: con el número crudo cada servidor cambiaría de hash
varias veces por hora sin que ninguna respuesta mejorara.

### Los topes

Contados en **peticiones**, no en búsquedas: un tope que cuenta una búsqueda de 300 peticiones como
una unidad no es un tope.

| Tope | Por defecto |
| --- | --- |
| `SEMANTIC_SEARCHES_PER_MINUTE` / `_PER_HOUR` por IP | 4 / 30 |
| `SEMANTIC_SESSION_REQUEST_QUOTA` | 900 (~3 búsquedas nuevas) |
| `SEMANTIC_DAILY_REQUEST_LIMIT` | 30.000 (~100 búsquedas nuevas) |
| `SEMANTIC_DEADLINE_MS` | 12.000 — lo valorado hasta ahí es lo que se ordena |

El contador diario es **separado** del de facetas, para que un día de búsquedas caras no deje sin
funcionar la búsqueda barata de la que depende todo el catálogo. Los topes se consultan **después** de
saber cuántas peticiones faltan de verdad: cobrar 300 cuando la caché ya tiene 290 cerraría el camino
sin motivo. Y solo se dispara **al enviar**, nunca en el debounce de 300 ms.

`scripts/measure-semantic-search.mjs` reproduce la medición. Se conserva porque el umbral hay que
recalibrarlo contra el catálogo real: 56 de los 60 servidores del seed tienen descripciones generadas
por plantilla, así que sus conclusiones de coste, latencia y concurrencia son sólidas y las de calidad
del ranking, limitadas.
