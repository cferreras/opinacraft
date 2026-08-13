# Fase 3: beta pública de OpinaCraft

## Objetivo

Lanzar en 4–6 semanas una beta pública para España, completamente en español y
con un catálogo útil de servidores de Minecraft. La fase prioriza descubrimiento,
control de la propiedad, disponibilidad, moderación y el mínimo operativo y legal
necesario para trabajar con usuarios reales.

El producto ya dispone de autenticación, gestión de servidores y miembros,
publicación, verificación Java por MOTD, directorio público y pruebas unitarias,
de integración y E2E. Esta fase no incluirá reseñas, votos, pagos, invitaciones,
transferencia de propiedad ni un histórico completo de uptime.

## Hito 1: confianza, idioma y navegación

- Traducir toda la interfaz y los correos al español de España.
- Establecer `lang="es"`, fechas `es-ES`, metadatos, errores y estados vacíos en
  español. No se añadirá todavía infraestructura de internacionalización.
- Respetar `callbackURL` en email/password y Discord, aceptando únicamente rutas
  internas para impedir redirecciones abiertas.
- Activar la verificación de email de Better Auth con Resend:
  - enviar el enlace durante el registro;
  - permitir reenvíos con rate limit;
  - exigir email verificado para crear, publicar, reportar o subir imágenes;
  - no marcar automáticamente como verificadas las cuentas existentes.
- Generalizar el servicio de correo para verificación, recuperación de
  contraseña, cambios de disponibilidad y decisiones de moderación.

## Hito 2: fichas, imágenes, etiquetas y descubrimiento

### Imágenes y almacenamiento

Vercel Blob en el plan Hobby será el proveedor inicial. La aplicación no asumirá
que Blob es ilimitado ni acoplará el dominio a su SDK.

- Crear una interfaz `MediaStorage` con operaciones de subida autorizada,
  asociación, sustitución y borrado.
- Implementar `VercelBlobStorage` como primer adaptador. Los formularios y los
  registros de medios no dependerán de URLs o tipos propios de Vercel, para
  permitir una futura migración a Cloudflare R2 o S3.
- Aceptar PNG, JPEG y WebP como archivos de entrada.
- Aplicar estos límites después de optimizar:
  - logo: WebP, máximo 500 KB;
  - banner: WebP, máximo 1,5 MB.
- Eliminar metadatos, limitar dimensiones, conservar una relación de aspecto
  apropiada y rechazar el archivo si no puede quedar dentro del límite sin una
  pérdida inaceptable.
- Autorizar la subida directa únicamente a miembros con capacidad para editar
  contenido del servidor.
- Usar nombres no predecibles y verificar tipo real, dimensiones, propietario y
  servidor antes de asociar el blob.
- Eliminar imágenes sustituidas, medios de servidores o cuentas borrados y
  subidas abandonadas. Los fallos de borrado se registrarán en una cola
  `media_cleanup_jobs` con reintentos idempotentes.
- Medir almacenamiento y operaciones del proyecto y avisar al operador al 70%,
  85% y 95% de la cuota incluida.
- Si se alcanza la cuota de Hobby, bloquear nuevas subidas con un mensaje
  controlado. Las imágenes existentes y el resto de OpinaCraft deben continuar
  funcionando.

La capacidad inicial se diseña para la cuota de Hobby vigente: 1 GB de
almacenamiento medio mensual, 10 GB de transferencia, 10.000 operaciones simples
y 2.000 operaciones avanzadas. Antes de Production se confirmarán de nuevo los
límites publicados por Vercel.

### Etiquetas

- Permitir hasta ocho etiquetas por servidor.
- Una etiqueta nueva podrá ser creada por un propietario con email verificado.
- Guardar una etiqueta con nombre visible, slug normalizado único, estado y
  contador de uso.
- El autocompletado devolverá hasta ocho coincidencias por prefijo, priorizando
  coincidencias exactas, comienzo del término y número de usos. Por ejemplo,
  `pv` podrá sugerir `pvp (121)`, `pve (76)` y `premium (32)`.
- Los moderadores podrán renombrar, bloquear y fusionar etiquetas.
- Las fusiones conservarán alias para que los filtros y enlaces antiguos sigan
  resolviendo a la etiqueta canónica.

### Directorio

- Buscar por nombre, descripción y etiquetas.
- Filtrar de forma acumulativa por etiquetas, edición y estado online.
- Ordenar por relevancia cuando exista texto de búsqueda; sin texto, mostrar
  primero servidores online y después los actualizados recientemente.
- Mantener páginas de 24 resultados y preservar todos los filtros al paginar.
- Mostrar logo, banner, etiquetas, estado, jugadores, versión, última
  comprobación y una dirección copiable.
- Añadir sitemap, canonicales y metadatos sociales para las fichas públicas.

## Hito 3: verificación y disponibilidad por endpoint

- Sustituir la verificación global por verificación independiente por endpoint:
  `motd_java` y `motd_bedrock`.
- Usar un código temporal en el MOTD para demostrar el control de endpoints Java
  y Bedrock.
- Exigir email verificado y al menos un endpoint verificado para publicar.
- Mostrar públicamente solo direcciones verificadas.
- Cambiar una dirección invalidará únicamente ese endpoint.
- Si un servidor se queda sin endpoints verificados, dejará de ser visible sin
  perder la intención de publicación de su propietario.
- Guardar en cada endpoint:
  - estado `unknown`, `online` u `offline`;
  - jugadores actuales y máximos;
  - versión, latencia y última comprobación;
  - última disponibilidad y número de fallos consecutivos.
- No almacenar un histórico completo de comprobaciones durante esta fase.

### Ejecución del monitor

- cron-job.org invocará cada 15 minutos el endpoint interno desplegado en Vercel Hobby.
- `POST /api/internal/monitor/run` exigirá
  `Authorization: Bearer <CRON_MONITOR_SECRET>`.
- Cada ejecución procesará hasta 200 endpoints con concurrencia máxima 10,
  timeout de cinco segundos y bloqueo para impedir trabajos solapados.
- Las conexiones TCP y UDP reutilizarán las protecciones existentes contra
  SSRF, DNS rebinding y direcciones privadas.
- Tres fallos consecutivos marcarán un endpoint como offline y enviarán un único
  aviso.
- Una comprobación satisfactoria recuperará el estado online.
- Datos con más de 30 minutos se mostrarán como desconocidos.
- Si todos los endpoints permanecen offline durante siete días, la ficha se
  ocultará automáticamente.
- Al recuperarse un endpoint, la ficha volverá a mostrarse únicamente si el
  propietario sigue queriendo publicarla y no existe un bloqueo de moderación.
- Preview deberá demostrar conectividad TCP Java y UDP Bedrock dentro de la misma
  función, sin enviar credenciales ni resultados a un worker externo.

## Hito 4: moderación, ciclo de vida y lanzamiento

- Crear roles globales `moderator` y `admin`, independientes de los roles de los
  servidores.
- Añadir un comando operativo para conceder el primer rol de administrador por
  email.
- Permitir reportes solo a usuarios con email verificado:
  - motivo predefinido;
  - detalle opcional;
  - un único reporte abierto por usuario y servidor.
- Crear `/admin` con cola, detalle, asignación, descarte, ocultación,
  restauración y registro inmutable de decisiones.
- Mantener separados:
  - la intención de publicación del propietario;
  - el bloqueo de moderación;
  - la ocultación automática por disponibilidad.
- Permitir al propietario borrar un servidor mediante confirmación escrita,
  eliminando datos relacionados y encolando sus medios.
- Añadir exportación JSON y borrado de cuenta. Los reportes y eventos que deban
  conservarse quedarán anonimizados.
- Publicar privacidad, términos y contacto en español. No se añadirá un banner
  de cookies mientras solo existan cookies técnicas y no se active analítica no
  esencial.

## Cambios de datos e interfaces

- Nuevas tablas: `tags`, `tag_aliases`, `server_tags`, `platform_roles`,
  `server_reports`, `moderation_events` y `media_cleanup_jobs`.
- Los servidores incorporarán referencias de medios, estado de moderación y
  ocultación automática.
- Los endpoints incorporarán verificación independiente y estado operativo.
- `PublicServer` expondrá medios, etiquetas y salud de los endpoints.
- `GET /api/tags/suggest?q=` devolverá `label`, `slug` y `usageCount`.
- El endpoint de subida emitirá credenciales temporales únicamente después de
  autenticar al usuario y comprobar sus permisos.
- Las migraciones serán aditivas y se ejecutarán manualmente antes del
  despliegue correspondiente, nunca durante `pnpm build`.

## Pruebas y aceptación

- Unitarias: etiquetas y alias, búsqueda, elegibilidad de publicación,
  `callbackURL`, transiciones online/offline y reglas de siete días.
- Integración: verificación Java/Bedrock, invalidación por endpoint,
  concurrencia del monitor, reportes, fusión de etiquetas, permisos y borrado.
- Medios: tipo real, dimensiones, optimización, cuotas simuladas, sustitución,
  subida abandonada y reintento de limpieza.
- E2E: registro y verificación de email, creación, subida de imágenes,
  etiquetado, verificación, publicación, búsqueda, reporte y resolución.
- Accesibilidad: autocompletado operable con teclado y lector de pantalla, foco
  visible, mensajes anunciados y reflow móvil.
- Regresión obligatoria con el runtime de Node disponible: `pnpm lint`, `pnpm test`,
  `pnpm test:integration`, `pnpm test:e2e`, `pnpm build` y
  `git diff --check`.

## Supuestos y fuera de alcance

- Beta para España y exclusivamente en español.
- Vercel Hobby, Neon, Resend, Vercel Blob y GitHub Actions como infraestructura
  inicial, sin añadir otro servicio de pago.
- Catálogo inicial inferior a 200 endpoints publicados.
- Sin reseñas, votos, pagos, invitaciones, transferencia de propiedad,
  analítica ni histórico completo de uptime.
- Los textos legales recibirán revisión profesional antes de Production.
- Una futura migración de medios deberá poder cambiar solo el adaptador y las
  referencias persistidas, sin modificar formularios ni reglas de negocio.

