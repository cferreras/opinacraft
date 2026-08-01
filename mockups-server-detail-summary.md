# Exploración visual — ficha pública de servidor

Servidor compartido: **NovaCraft** (`/servers/novacraft`). Las cuatro propuestas usan el mismo contenido ficticio para que la comparación se centre en la estructura y no en los datos.

Archivos entregados:

- [mockup-server-detail-01.png](D:/code/opinacraft/mockup-server-detail-01.png)
- [mockup-server-detail-02.png](D:/code/opinacraft/mockup-server-detail-02.png)
- [mockup-server-detail-03.png](D:/code/opinacraft/mockup-server-detail-03.png)
- [mockup-server-detail-04.png](D:/code/opinacraft/mockup-server-detail-04.png)

Cada imagen combina una vista de escritorio completa con una vista móvil compacta. Las resoluciones son las naturales de generación y mantienen un lienzo de escritorio amplio: 1536×1024, 1549×1015, 1608×978 y 1536×1024 px.

## Propuesta 1 — Ficha editorial

**Idea principal.** Una página de lectura pausada: el logo y la descripción construyen identidad, mientras la conexión queda en un panel lateral persistente y las opiniones se presentan como contenido editorial.

**Ventaja principal.** Es la propuesta que mejor transmite confianza y calidad. La jerarquía del nombre, la descripción y la reputación es clara sin sentirse como un panel administrativo.

**Desventaja principal.** Para comparar rápidamente muchos servidores exige más recorrido visual que la propuesta informativa.

- **Claridad de conexión:** alta; Java y Bedrock están juntos en un panel dedicado y la acción `Copiar dirección` es dominante.
- **Claridad de métricas:** media-alta; estado, jugadores, versión, latencia y valoración forman una línea fácil de leer, pero ocupan más espacio vertical.
- **Tratamiento de opiniones:** editorial y humano; incluye distribución, formulario, opinión positiva, crítica y respuesta oficial.
- **Comportamiento móvil:** sólido; el panel lateral se convierte en bloques apilados y conserva la dirección antes de las opiniones.
- **Complejidad de implementación:** media; requiere un layout de dos columnas y un estado sticky o equivalente en escritorio.

## Propuesta 2 — Panel informativo

**Idea principal.** Una ficha pública orientada a escanear disponibilidad y compatibilidad: rail de métricas, navegación interna, conexión persistente y opiniones en filas compactas.

**Ventaja principal.** Es la más eficiente para comparar jugadores, versión, ping, edición, estado y puntuación en pocos segundos.

**Desventaja principal.** Se acerca más a una herramienta de datos; si se densifica más podría perder parte del carácter comunitario.

- **Claridad de conexión:** muy alta; el rail derecho mantiene visibles ambas direcciones y los estados `Copiada`.
- **Claridad de métricas:** muy alta; la franja de métricas es el foco funcional de la página.
- **Tratamiento de opiniones:** compacto y eficiente; la respuesta oficial destaca sin convertirse en un hilo de foro.
- **Comportamiento móvil:** bueno; la información se apila y conserva la navegación interna, aunque la densidad requiere cuidar tamaños táctiles.
- **Complejidad de implementación:** media-alta; necesita columnas persistentes, navegación por anclas y varios estados visuales.

## Propuesta 3 — Identidad modular

**Idea principal.** La identidad de NovaCraft nace del logo prismático y de una retícula geométrica discreta. Conexión, pulso, opiniones y descripción son módulos con pesos visuales distintos.

**Ventaja principal.** Es la dirección más memorable y diferenciada sin recurrir a un banner, una captura del juego ni texturas temáticas.

**Desventaja principal.** El sistema modular necesita disciplina para no convertir cada sección futura en otra tarjeta o elemento decorativo.

- **Claridad de conexión:** alta; el módulo `Conexión` aparece primero y separa claramente Java y Bedrock.
- **Claridad de métricas:** alta; `Pulso del servidor` agrupa estado, jugadores, versión, latencia y última comprobación.
- **Tratamiento de opiniones:** muy visible y bien integrado; el bloque central da espacio a distribución y respuesta oficial.
- **Comportamiento móvil:** bueno; los módulos se apilan con una identidad visual consistente, pero el espacio disponible es más exigente.
- **Complejidad de implementación:** alta; requiere un sistema de módulos, geometría decorativa responsiva y reglas claras de composición.

## Propuesta 4 — Northstar Hybrid

**Idea principal.** La opción finalista combina una cabecera editorial compacta con una cinta `Conecta en segundos`, un grupo de métricas, navegación interna sencilla y opiniones integradas en el mismo flujo.

**Ventaja principal.** Equilibra mejor a usuarios nuevos, jugadores experimentados y servidores Java/Bedrock: identidad, estado, puntuación y dirección son visibles sin competir entre sí.

**Desventaja principal.** Tiene más decisiones de jerarquía que una página editorial simple; habrá que definir con precisión qué elementos quedan sticky y cuáles desaparecen primero en estados pequeños.

- **Claridad de conexión:** excelente; las dos IP aparecen inmediatamente bajo la cabecera, con edición y confirmación de copia.
- **Claridad de métricas:** alta; el bloque de estado y valoración acompaña a la conexión sin duplicar información.
- **Tratamiento de opiniones:** equilibrado; mantiene resumen, distribución, formulario de sesión iniciada/no iniciada, crítica y respuesta oficial.
- **Comportamiento móvil:** el más sólido; el orden móvil prioriza logo, verificación, estado, valoración, CTA, conexión y después contenido largo.
- **Complejidad de implementación:** media-alta; reutiliza patrones existentes pero necesita una nueva composición de página y responsive cuidadoso.

## Recomendación

Recomendaría implementar la **Propuesta 4 — Northstar Hybrid**. Es la que mejor resuelve el objetivo principal de la ficha: entender el servidor y poder conectarse en pocos segundos, sin sacrificar contexto, reputación ni personalidad. Además escala razonablemente a estados offline/desconocido, servidores sin logo, servidores sin web y fichas con pocas o muchas opiniones.

Rescataría de las demás propuestas:

- de la **Ficha editorial**, el ritmo de lectura, la descripción amplia y el tratamiento humano de las opiniones;
- del **Panel informativo**, la franja de métricas, la navegación `Resumen / Información / Opiniones / Equipo` y el rail de conexión;
- de la **Identidad modular**, el logo como origen de la geometría, el fallback de monograma y los acentos visuales discretos.

La exploración se ha mantenido en formato imagen. No se ha implementado React, no se ha conectado Neon, no se han cambiado consultas, esquema ni migraciones, y la ruta real `/servers/[slug]` no se ha sustituido.
