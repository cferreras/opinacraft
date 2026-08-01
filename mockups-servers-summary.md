# Mockups de `/servers`

## Contexto revisado

La línea base previa de `/servers` mostraba hasta 24 servidores publicados por página y filtraba por búsqueda, tags, edición (`java` / `bedrock`) y estado (`online` / `offline` / `unknown`). El comportamiento final implementado en este PR conserva esos filtros, añade ordenación por valoración, jugadores o fecha y muestra el resumen agregado de reseñas junto con nombre, descripción, endpoints, verificación, estado de salud, jugadores, versión, latencia, última comprobación, tags y enlace a la ficha. El componente también contempla banners, pero estas propuestas los excluyen deliberadamente y dan prioridad a logos cuadrados o fallbacks geométricos.

Las puntuaciones y el número de opiniones aparecen en los mockups como datos ficticios de diseño; la ruta final ya obtiene un resumen agregado de reseñas. La ordenación representada en las propuestas se incorporó al comportamiento final con los parámetros de la ruta.

## Propuesta 1 — Directorio editorial

- **Idea principal:** listado horizontal espacioso, con logo grande, contenido editorial en el centro y métricas/acción alineadas a la derecha.
- **Ventaja:** lectura muy clara y sensación de directorio fiable; funciona especialmente bien para nombres, descripciones y opiniones.
- **Desventaja:** consume más altura y permite comparar menos servidores de un vistazo.
- **Densidad:** baja-media.
- **Facilidad de comparación:** media.
- **Atractivo visual:** alto, sobrio y editorial.
- **Comportamiento móvil:** filas convertidas en tarjetas compactas; búsqueda arriba y filtros resumidos en un control tipo drawer.
- **Complejidad estimada:** media.

## Propuesta 2 — Explorador compacto

- **Idea principal:** rail lateral de filtros y listado estructurado con columnas repetibles para estado, jugadores, versión, latencia, edición y valoración.
- **Ventaja:** la mejor lectura para comparar muchos servidores y escanear rápidamente estados técnicos.
- **Desventaja:** requiere más atención visual y el rail debe transformarse con cuidado en móvil.
- **Densidad:** alta.
- **Facilidad de comparación:** muy alta.
- **Atractivo visual:** medio-alto, más orientado a herramienta que a escaparate.
- **Comportamiento móvil:** el rail se convierte en un bottom sheet con `Filtros (2)`; las filas pasan a tarjetas sin scroll horizontal.
- **Complejidad estimada:** media-alta.

## Propuesta 3 — Cuadrícula de identidades

- **Idea principal:** tarjetas verticales con logos grandes, acentos geométricos controlados y una cuadrícula responsive.
- **Ventaja:** mayor reconocimiento de cada comunidad y más atractivo para el público de Minecraft sin recurrir a banners.
- **Desventaja:** las métricas técnicas pierden algo de protagonismo y las alturas de texto/tag pueden variar.
- **Densidad:** media.
- **Facilidad de comparación:** media.
- **Atractivo visual:** muy alto.
- **Comportamiento móvil:** una columna de tarjetas, manteniendo logo, nombre, estado, jugadores, valoración y acción táctil; filtros en sheet.
- **Complejidad estimada:** media.

## Propuesta 4 — Catálogo híbrido recomendado

- **Idea principal:** toolbar horizontal simple, un resultado destacado para orientar a usuarios nuevos, lista compacta para exploración y tarjetas secundarias para escalar.
- **Ventaja:** equilibra descubrimiento, comparación rápida, identidad de logos, opiniones y escalabilidad para cientos de servidores.
- **Desventaja:** introduce más estados de layout —destacado, lista y grid— y requiere definir bien el criterio del servidor destacado.
- **Densidad:** media-alta.
- **Facilidad de comparación:** alta.
- **Atractivo visual:** alto sin alejarse del lenguaje sobrio actual.
- **Comportamiento móvil:** búsqueda primero, `Filtros (2)` como acción accesible y tarjetas apiladas con un drawer de edición/estado/tags.
- **Complejidad estimada:** media-alta.

## Recomendación

Recomendaría implementar la **Propuesta 4 — Catálogo híbrido recomendado**. Mantiene la sencillez del sistema actual de OpinaCraft —zinc, superficies blancas, bordes finos, inputs y botones sobrios— pero crea una jerarquía más útil para nuevos jugadores y para usuarios que ya comparan servidores habitualmente. También deja espacio para incorporar de forma gradual los agregados de reseñas, la ordenación y la paginación sin convertir `/servers` en una tabla administrativa.

Estas entregas documentan propuestas visuales y sirvieron como base de diseño. El PR también modifica funcionalmente `/servers`, sus consultas y sus componentes: incorpora filtros, ordenación, paginación y resúmenes de reseñas; los mockups no representan por sí solos toda la implementación final.
