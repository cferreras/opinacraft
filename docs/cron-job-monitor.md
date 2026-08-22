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

## Vercel

Configura:

- `DATABASE_URL` para Neon.
- `CRON_MONITOR_SECRET` para las rutas internas.
- `MONITOR_API_URL` y `MONITOR_API_SECRET` para Monitor API.

Las acciones de crear, editar o eliminar un servidor escriben un outbox en la
misma transacción de Neon. Después intentan entregarlo inmediatamente; la ruta
`/api/internal/monitor/sync` reintenta cada cinco minutos y la reconciliación
`/api/internal/monitor/reconcile` vuelve a comparar el catálogo una vez al día.

El procesador horario de `/api/internal/monitor/events` reclama primero un lote
en Monitor API. Si el lote está vacío, termina sin importar ni abrir Neon. Solo
cuando existe un lote dinámico importa el procesador Neon, aplica en una
transacción idempotente auto-ocultados y notificaciones, y confirma cada evento
con su lease. Las notificaciones se agrupan aproximadamente cada hora; el
auto-ocultado se genera en Monitor DB después de siete días offline y se procesa
por lote.

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
4. Ejecuta `pnpm monitor:db:backfill` con acceso temporal de solo lectura a Neon
   y escritura a Monitor DB para trasladar targets, estado actual y el histórico
   canónico existente. El script es idempotente y no forma parte del worker.
5. Activa `MONITOR_API_URL` en Vercel y compara estados, histórico y paginación.
6. Mantén temporalmente las columnas/tablas antiguas de monitorización en Neon.
7. Retíralas solo después de validar sincronización, reconciliación, outbox y
   tráfico público.

No se añade Redis.
