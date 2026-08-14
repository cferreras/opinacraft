# Monitorización escalable con Dokploy

La monitorización de servidores ya no ejecuta pings dentro de Vercel. El
worker persistente reclama jobs con leases, realiza una única consulta canónica
por servidor y guarda el histórico agregado. La ruta de Vercel solo reconcilia
la cola y responde `202`; no hace conexiones Minecraft.

## Despliegue en Dokploy

1. Crea una **Application** desde este repositorio.
2. Selecciona `Dockerfile.monitor-worker` como Dockerfile.
3. Configura las variables del entorno de producción:

   - `DATABASE_URL`
   - `MONITOR_WORKER_ID`
   - `MONITOR_HEALTH_PORT=3001`
   - `MONITOR_POLL_INTERVAL_MS=10000`
   - `MONITOR_BATCH_SIZE=50`
   - `MONITOR_PROBE_CONCURRENCY=10`
   - `MONITOR_MAINTENANCE_ENABLED=false` (recomendado inicialmente)

4. No asignes un dominio público. El worker solo necesita su health check
   interno en `GET /healthz`.
5. Activa el reinicio automático y el health check de Docker.
6. Revisa en los logs el identificador del worker, la edad de la cola y los
   errores de jobs.

El contenedor no ejecuta migraciones al arrancar. Publica primero la migración,
comprueba el esquema de producción y después activa el worker.

`MONITOR_MAINTENANCE_ENABLED=false` mantiene el worker independiente de
Resend, Blob y los secretos de la aplicación. Si se activa, también debes
configurar las variables de email/Blob y los secretos de runtime que validan
esos módulos.

## Reconciliación manual desde Vercel

La ruta interna conserva un uso administrativo para despertar la reconciliación:

```text
POST https://<dominio>/api/internal/monitor/run
Authorization: Bearer <CRON_MONITOR_SECRET>
```

Una respuesta `202` tiene esta forma:

```json
{
  "ok": true,
  "enqueued": 12,
  "due": 12,
  "oldestDueAt": "2026-08-14T10:00:00.000Z"
}
```

No es necesario configurar un cron de Vercel para el funcionamiento normal: el
worker reclama sus propios jobs. El workflow de GitHub queda únicamente como
accionamiento manual de emergencia y no sustituye al worker.

## Base de datos y migraciones

La base de datos local y la de producción son entornos distintos. No ejecutes
esta migración usando `.env.local`, `DATABASE_URL` local ni una credencial de
desarrollo esperando modificar producción. Tampoco se ejecuta ninguna
migración desde el Dockerfile.

Para producción:

1. Revisa `src/migrations/20260814120000_monitor_server_worker/migration.sql`.
2. Crea un punto de recuperación en el proveedor si está disponible.
3. Ejecuta el workflow manual `Production database migration` desde `main`,
   con la protección del entorno `production` y el secreto
   `DIRECT_DATABASE_URL` directo de la base de producción.
4. Inspecciona el esquema resultante antes de activar el worker.

Si se necesita probar el esquema localmente, usa una base de datos local o de
pruebas explícita y separada. Nunca uses `TEST_DATABASE_URL` para producción;
las pruebas y los backfills deben apuntar a una base de datos dedicada.

## Cambio de operación

Durante el cambio, valida durante 24–48 horas:

- edad del job más antiguo pendiente;
- jobs en `processing` con leases expirados;
- proporción de jobs `failed`;
- muestras canónicas por servidor;
- consumo y latencia de PostgreSQL.

Cuando el worker esté estable, elimina cualquier cron externo que invoque la
ruta de Vercel. La ruta puede mantenerse para reconciliación manual, pero no
debe volver a ejecutar el monitor síncrono.
