---
name: blog-post-images
description: Crea las imágenes de un post del blog de OpinaCraft. Cubre la portada (eligiendo el objeto y escribiendo el prompt para ChatGPT en estilo Minecraft de bloques, como cubusfera.com/blog), las figuras dentro del artículo, cómo procesar la imagen recibida y cómo enlazarla en src/lib/blog/posts.ts. Úsalo siempre que se cree un post nuevo, se cambie una portada o se añadan imágenes a un artículo, aunque solo se pida «el prompt de la portada».
---

# Imágenes de los posts del blog

Cada post necesita una **portada**. Las **figuras** dentro del artículo son opcionales. Las portadas las genera el usuario en ChatGPT con el prompt que le das tú. Después tú las procesas y las enlazas. Para procesarlas no hay script en el repositorio: escribe uno temporal en el scratchpad cada vez, siguiendo el paso 5.

| Pieza | Archivo | Tamaño | Campo en `src/lib/blog/posts.ts` |
| --- | --- | --- | --- |
| Portada (obligatoria) | `public/blog/portada-<slug>.webp` | 16:9, 1920×1080 o el tamaño original si es menor (nunca ampliada, mínimo 1536 de ancho), < 120 KB | `cover`, `coverAlt` |
| Figura (opcional) | `public/blog/<slug>-<tema>.webp` | 1600×900 (16:9), < 120 KB | `figure` de una sección (`BlogFigure`: `src`, `alt`, `width`, `height`, `caption?`) |

`tests/blog.test.ts` exige que todos los archivos existan y pesen menos de 120 KB, que cada portada sea única y que el `width`/`height` declarado de cada figura coincida con el archivo real. También exige que cada `<Image>` del blog lleve `quality={blogImageQuality}` (90). `next/image` vuelve a comprimir todo lo que sirve, y con su 75 por defecto los fondos lisos y los bordes de las portadas se ven pixelados. Si pintas portadas o figuras en un sitio nuevo, pásale también esa calidad.

## Estilo de portada: objetos de Minecraft hechos de bloques

Desde el 9 de noviembre de 2026, las portadas nuevas siguen el estilo de [cubusfera.com/blog](https://cubusfera.com/blog). Las anteriores (objetos 3D lisos sobre fondo casi blanco) se quedan como están: no las rehagas salvo que te lo pidan.

- **Un único objeto de Minecraft** (un ítem, un bloque o un objeto del juego) que sirva de metáfora del post. Va **construido con cubos visibles (vóxeles)**, como una figura de juguete de bloques: las curvas se leen como escalones pixelados, nunca como superficies lisas.
- **Render 3D suave**, mate, tipo arcilla o plástico blando. Las aristas de los cubos están apenas redondeadas y cada cubo es de un color liso, **sin las texturas pixeladas de 16×16 del juego**. La luz de estudio es difusa y llega desde arriba a la izquierda. El objeto flota un poco y tiene una sombra de contacto suave debajo.
- **Paleta monocroma de la categoría en tres tonos**: claro en las caras de arriba, base en las caras principales y oscuro en las sombras y los detalles. Las partes de cristal, como las ampollas de un reloj de arena, pueden ser translúcidas en el tono claro.
- **Fondo liso pastel del color de la categoría**, sin degradados, sin suelo y sin escenario.
- **Encuadre**: vista en tres cuartos, un poco desde arriba. El objeto va centrado, ocupa un tercio del ancho y tiene mucho aire alrededor, porque al recortar a 16:9 se pierde algo de arriba y de abajo.
- **Nunca**: texto, letras, logotipos, personajes o mobs (Steve, Creeper…), espadas, picos ni otras armas. Tampoco varios objetos ni escenas. Única excepción: un número de versión hecho de bloques cuando el post trata de esa versión.
- **No repitas objeto.** Antes de elegir, revisa los `coverAlt` de `src/lib/blog/posts.ts`. Tampoco copies tal cual el objeto y el encuadre de una portada de cubusfera para el mismo tema: el estilo es compartido, las portadas no.

### Paleta por categoría

| Categoría | Tono claro | Base | Oscuro | Fondo |
| --- | --- | --- | --- | --- |
| Guías (verde, hue 160) | `#7FDBAB` | `#00B272` | `#007B45` | `#E0F7E9` |
| Comparativas (azul, hue 230) | `#8ACFF0` | `#2EA2D0` | `#006D94` | `#DDF5FF` |
| Rendimiento (ámbar, hue 80) | `#E8BD73` | `#C58800` | `#8A5700` | `#FBEEDA` |
| Para admins (violeta, hue 300) | `#CDB7F7` | `#A281D9` | `#6E529B` | `#F3ECFF` |

Estos colores salen de los tokens `--category-*` de `src/app/globals.css`. Si cambian esos tokens, recalcula la tabla con el mismo tono: claro con L 0.82, base con L 0.67, oscuro con L 0.50 y fondo con L 0.955 y C 0.03, todos en OKLCH.

### Ideas de objeto según el tema

- **Guías** (empezar, elegir, cómo funciona algo): brújula, mapa, libro y pluma, catalejo, cartel, linterna, cofre, cama.
- **Comparativas**: comparador de redstone, puerta, portal, dos bloques enfrentados, yunque.
- **Rendimiento** (ping, lag, TPS, hardware): reloj, repetidor o antorcha de redstone, vagoneta sobre raíl propulsor, cohete de fuegos artificiales, observador, tolva.
- **Para admins** (gestionar, promocionar, comunidad): atril, campana, faro (beacon), mesa de cartografía, etiqueta de nombre, cofre.

Propón un objeto y una alternativa, con una frase sobre por qué encaja. Describe la forma en bloques: ChatGPT acierta mucho más si sabe de qué cubos está hecho el objeto.

## Flujo para un post nuevo

1. **Elige el objeto** a partir del título, la categoría y la idea central del post.
2. **Rellena el prompt** de abajo con el objeto, su forma en bloques y la paleta de la categoría.
3. **Entrégaselo al usuario** con estas instrucciones: que adjunte en ChatGPT una portada de referencia en este estilo, la más reciente de OpinaCraft que lo siga o, mientras no haya ninguna, una de cubusfera.com/blog (por ejemplo `https://cubusfera.com/images/blog/como-evitar-expulsion-inactividad.webp`). Añade también las correcciones de la sección «Si ChatGPT falla». Pídele además que **descargue la imagen con el botón de descarga de ChatGPT (PNG) y te pase la ruta del archivo**. Si la guarda con clic derecho o la pega en el chat, llega una copia WebP recomprimida que ya viene pixelada, y eso no se arregla después.
4. **Mientras llega la imagen**, el post no pasa el test de portada. Si el usuario quiere publicarlo ya, pon una portada provisional y díselo. Si no, no añadas el post a `blogPosts` hasta tener la imagen.
5. **Procesa la imagen** que te pase con `sharp`, que ya es dependencia del proyecto. Cárgalo con `createRequire` desde el `package.json` del proyecto, porque el script temporal vive en el scratchpad:
   - **Mira cómo llega.** Si es un WebP de pocos KB (menos de unos 60 KB a más de 1500 px de ancho), es una copia recomprimida: pide el PNG original antes de seguir.
   - **Recorta a 16:9 desde el centro, sin ampliar nunca.** Si mide 1920 px de ancho o más, usa `resize(1920, 1080, { fit: "cover", position: "centre" })`. Si es más estrecha, recorta con `extract` la mayor caja 16:9 exacta que quepa (ancho múltiplo de 16 y alto múltiplo de 9), centrada y a su tamaño original. Ampliar emborrona y no aporta nada: el blog nunca muestra la portada a más de 1600 px reales. Por debajo de 1536 px de ancho, pide la imagen original. Como el objeto va centrado con aire, el recorte solo quita fondo por arriba y por abajo.
   - **Si tiene transparencia**, pide otra con fondo liso en vez de rellenarla.
   - **Guarda en WebP** con `quality: 95, effort: 6`. Con fondos lisos suele quedar entre 30 y 60 KB. Si pesa 120 KB o más, baja la calidad de 3 en 3. Si ni con 85 baja de 120 KB, el fondo tiene ruido o un degradado: pide un fondo liso en vez de comprimir más.
   - **Mide el fondo**: haz la media de color de un cuadrado de 24 px en cada esquina y compárala con el fondo de la categoría en la tabla. Si las cuatro esquinas no coinciden entre sí, el fondo tiene un degradado o el recorte corta el objeto.
   - **Escribe el archivo** en `public/blog/portada-<slug>.webp`. Si ya existía, por ejemplo una portada provisional, sustitúyelo.
6. **Mira el resultado** (abre el `.webp` con Read). Comprueba que el objeto se reconoce, que está hecho de bloques, que va en los colores de la categoría, que no lleva texto y que no ha quedado cortado.
7. **Enlázala** en `posts.ts`: `cover: "/blog/portada-<slug>.webp"` y un `coverAlt` que describa lo que se ve y para qué sirve, por ejemplo: «Ilustración en 3D de un comparador de redstone hecho de bloques azules sobre fondo azul claro, la imagen que abre la comparativa de hostings para servidores.»
8. **Verifica**:
   ```bash
   node --experimental-strip-types --experimental-loader ./scripts/ts-paths-loader.mjs --test tests/blog.test.ts
   ```

`scripts/generate-blog-covers.mjs` es del primer estilo de portadas y genera PNG: no lo uses.

## Prompt para ChatGPT (portada)

Sustituye todo lo que va entre llaves. `{FORMA}` es la descripción del objeto en bloques, en una a tres frases. Por ejemplo, para una brújula: «un disco octogonal escalonado, con un marco de cubos en el tono oscuro, una esfera en el tono claro y una aguja en diagonal de tres o cuatro cubos en el tono oscuro».

```text
Crea una ilustración 3D para la portada de un artículo de blog, en formato horizontal 16:9 (1920×1080).

Objeto: un único {OBJETO} de Minecraft construido con bloques cúbicos (vóxeles) bien visibles, como una figura de juguete hecha de cubos: la forma se lee por sus escalones pixelados, no por curvas lisas. {FORMA}

Estilo: render 3D suave con acabado mate tipo arcilla o plástico blando, aristas de los cubos apenas redondeadas, cada cubo de un color liso y sin texturas pixeladas. Iluminación de estudio difusa desde arriba a la izquierda. El objeto flota ligeramente y proyecta una sombra de contacto suave y difuminada debajo.

Color: paleta monocroma en {COLOR} con tres tonos: {CLARO} en las caras superiores e iluminadas, {BASE} en las caras principales y {OSCURO} en las caras en sombra y los detalles. Fondo liso de color {COLOR} muy claro ({FONDO}), sin degradados marcados, sin suelo ni escenario.

Encuadre: vista en tres cuartos, ligeramente desde arriba, con el objeto centrado y ocupando aproximadamente un tercio del ancho de la imagen, con mucho espacio libre alrededor.

No incluyas texto, letras, números, logotipos, personajes, mobs ni armas. Estética limpia y minimalista, coherente con una serie de portadas en la que cada una es un único objeto de bloques en el color de su categoría.
```

Si el objeto es un número de versión, quita «números» de la última frase y describe los dígitos en `{FORMA}`.

### Si ChatGPT falla

| Problema | Qué pedirle |
| --- | --- |
| Sale liso, sin bloques | «Constrúyelo con cubos visibles, que en los bordes curvos se vean los escalones de los bloques.» |
| Lleva las texturas pixeladas del juego | «Sin texturas: cada cubo de un color liso y mate.» |
| Fondo blanco, con degradado o con suelo | «Fondo liso {FONDO}, sin degradado ni suelo.» |
| Aparece texto o un logotipo | «Quita todo el texto y los logotipos.» |
| Hay varios objetos o una escena | «Solo el {OBJETO}, nada más.» |
| Demasiado grande o pegado al borde | «Hazlo más pequeño, que ocupe un tercio del ancho y quede centrado.» |
| Colores fuera de la categoría | «Usa solo estos tres tonos: {CLARO}, {BASE} y {OSCURO}.» |

## Figuras dentro del artículo

Añade figuras solo cuando expliquen algo que el texto no puede: un antes y un después, unos pasos, cómo se ve algo en la web. Hay dos tipos:

- **Ilustrativas** (un objeto o un concepto, sin texto): mismo estilo de bloques que la portada. Usa el prompt de arriba y cambia el formato a 16:9 (1600×900). Procésalas igual que la portada, pero a 1600×900 y guardadas en `public/blog/<slug>-<tema>.webp`.
- **Explicativas** (comparativas, diagramas, capturas, cualquier cosa con texto): no van en estilo Minecraft, porque el texto tiene que leerse. Se maquetan en HTML con los tokens de la web (fondo `oklch(0.985 0.004 160)`, tinta `oklch(0.145 0.01 160)`, verde `oklch(0.52 0.16 160)`, tarjetas blancas con borde `oklch(0.91 0.006 160)` y radio 36 px) y Manrope de Google Fonts. Se renderizan a 1600×900 con Playwright (`@playwright/test`, cargado con `createRequire` desde el `package.json` del proyecto). Espera a `document.fonts.ready` y pasa la captura a WebP con `sharp` (calidad 95, effort 6). El script vive en el scratchpad, no en el repositorio. El texto de las figuras va en español.

Cada figura necesita un `alt` que describa lo que muestra y, si aporta algo, un `caption` corto. Declara su `width` y `height` reales (1600 y 900).
