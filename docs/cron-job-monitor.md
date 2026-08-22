# Monitor desacoplado de OpinaCraft

La monitorización frecuente vive en Dokploy:

```text
Minecraft -> Monitor worker -> PostgreSQL Monitor
```

Neon sigue siendo la fuente de verdad de servidores, endpoints, usuarios y
negocio. El worker no importa `@/db`, no abre `DATABASE_URL` y no escribe en
Neon durante un check. La web usa Neon para el catálogo principal y Monitor API
para estados, catálogo monitorizado e histórico.

## Servicios de Dokploy

### PostgreSQL Monitor

Crea una base PostgreSQL independiente, con credenciales propias y acceso de
red limitado al worker y Monitor API. Ejecuta la migración específica con:

```text
MONITOR_DATABASE_URL=postgresql://...
pnpm monitor:db:migrate
```

La migración crea `monitor_targets`, estados, schedules, históricos, eventos de
negocio y las tablas internas de pg-boss. Todos los campos temporales son
`timestamptz`; habilita `pgcrypto` para los UUIDs y las conexiones establecen la
sesión PostgreSQL en UTC.

### Monitor worker

Usa `Dockerfile.monitor-worker` y configura:

- `MONITOR_DATABASE_URL`: conexión exclusiva de PostgreSQL Monitor.
- `MONITOR_DATABASE_SSL=true` solo si la instancia de Dokploy expone TLS; por
  defecto la conexión interna puede usar la red privada sin forzar `sslmode`.
- `MONITOR_WORKER_ID`: identificador estable de la instancia.
- `MONITOR_PROBE_CONCURRENCY`: concurrencia de probes.
- `MONITOR_HEALTH_PORT=3001`.

No configures `DATABASE_URL` de Neon en este contenedor. El worker reutiliza la
lógica existente de Java/Bedrock, SSRF, DNS/SRV, timeouts, normalización,
selección canónica y umbral de tres fallos.

Cada check calcula la siguiente fecha con jitter acotado y envía el job a
pg-boss con `startAfter` y un `singletonKey` específico del servidor y slot.
`next_due_at` y el sweeper de cinco minutos son solo recuperación y
observabilidad; no son el scheduler principal.

### Monitor API

Usa `Dockerfile.monitor-api`, expón internamente el puerto 3002 y configura:

- `MONITOR_DATABASE_URL`.
- `MONITOR_API_SECRET`.
- `MONITOR_API_PORT=3002`.

Publica el dominio interno que consumirá Vercel como `MONITOR_API_URL`. La API
acepta `PUT/DELETE /v1/targets/:serverId`, inventario de targets, estados batch, consultas globales de
catálogo, eventos pendientes e histórico. Todas las fechas de entrada y salida
son ISO 8601 UTC terminadas en `Z`.

### Monitor business-events processor

Usa `Dockerfile.monitor-events` como un servicio separado del worker de checks y
configura:

- `DATABASE_URL`: conexión de Neon para operaciones de negocio poco frecuentes;
  este proceso no abre Neon mientras Monitor API no devuelva eventos.
- `MONITOR_DATABASE_URL`: conexión de PostgreSQL Monitor, usada por pg-boss para
  scheduling y reintentos.
- `MONITOR_API_URL` y `MONITOR_API_SECRET`: endpoint y secreto de Monitor API.
- `MONITOR_BUSINESS_EVENTS_WORKER_ID`: identificador estable del procesador.
- `MONITOR_BUSINESS_EVENTS_BATCH_SIZE`: tamaño máximo del lote, por defecto 100.

El servicio registra en pg-boss la cola `monitor-business-events` con el
schedule `0 * * * *` y zona `UTC`. Cada job reclama primero el lote mediante
Monitor API; si está vacío termina sin importar ni abrir Neon. Si Monitor API no
está disponible, el job falla y pg-boss lo reintenta. Solo un lote no vacío
importa dinámicamente la lógica de Neon y procesa auto-ocultados y
notificaciones en una transacción agrupada.

## Vercel

Configura:

- `DATABASE_URL` para Neon.
- `CRON_MONITOR_SECRET` para las rutas internas.
- `MONITOR_API_URL` y `MONITOR_API_SECRET` para Monitor API.

Las acciones de crear, editar o eliminar un servidor escriben un outbox en la
misma transacción de Neon. Después intentan entregarlo inmediatamente; la ruta
`/api/internal/monitor/sync` queda disponible para reintentos manuales y la
reconciliación `/api/internal/monitor/reconcile` vuelve a comparar el catálogo
una vez al día. Vercel solo programa esta reconciliación diaria para mantener la
compatibilidad con el plan Hobby.

El endpoint `/api/internal/monitor/events` conserva la misma barrera como
compatibilidad o ejecución manual, pero ya no tiene un cron de Vercel. El
procesador de Dokploy ejecuta esa misma lógica aproximadamente cada hora: las
notificaciones se agrupan por lote y el auto-ocultado se genera en Monitor DB
después de siete días offline.

## Catálogo y caché

Cuando `/servers` necesita estado, disponibilidad, jugadores, versión, latencia
u ordenación monitorizada, Neon entrega todos los IDs candidatos y Monitor API
calcula el filtro, el orden global, la página y `totalCount`. En la escala actual
esta es la solución deliberada; se revisará si crecen mucho el catálogo, el
tamaño de las peticiones o la latencia.

Los datos públicos de Neon usan Cache Components con TTL de varios minutos y
tags de servidor. Los estados de Monitor API usan una caché aproximada de 45
segundos. Las reviews públicas tienen una tag común
`reviews:list:<serverId>` para invalidar todas sus páginas, además de
`reviews:summary:<serverId>` para el resumen. La sesión y `isMine` no entran en
la caché compartida.

## Fechas

Monitor DB y Monitor API conservan instantes UTC. La web no convierte fechas en
Vercel, Dokploy ni Minecraft: `LocalizedTimestamp` espera un instante UTC,
mantiene un placeholder estable durante SSR/hidratación y, tras hidratarse,
usa locale y zona horaria del navegador con `Intl.RelativeTimeFormat` y
`Intl.DateTimeFormat`. Se aplica a última comprobación, offline, recuperación,
histórico y cualquier fecha visible del monitor.

## Cutover

1. Crea PostgreSQL Monitor y ejecuta `pnpm monitor:db:migrate`.
2. Despliega Monitor API y valida `/healthz`.
3. Despliega el worker sin `DATABASE_URL` de Neon y observa health, jobs y
   leases.
4. Despliega `Dockerfile.monitor-events` con acceso a `DATABASE_URL` de Neon y
   las credenciales de Monitor API/Monitor DB. Comprueba primero un lote vacío:
   no debe crear conexiones a Neon.
5. Ejecuta `pnpm monitor:db:backfill` con acceso temporal de solo lectura a Neon
   y escritura a Monitor DB para trasladar targets, estado actual y el histórico
   canónico existente. El script es idempotente y no forma parte del worker.
6. Activa `MONITOR_API_URL` en Vercel y compara estados, histórico y paginación.
7. Mantén temporalmente las columnas/tablas antiguas de monitorización en Neon.
8. Retíralas solo después de validar sincronización, reconciliación, outbox y
   tráfico público.

No se añade Redis.
