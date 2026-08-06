# Monitor de endpoints con cron-job.org

El monitor se ejecuta completo dentro de la función Node.js desplegada en Vercel. cron-job.org solo debe realizar una petición HTTP autenticada; no necesita instalar dependencias ni ejecutar scripts del repositorio.

Configura un job con estos valores:

- Frecuencia: cada 15 minutos.
- Método: `POST`.
- URL: `https://<dominio>/api/internal/monitor/run`.
- Cabecera: `Authorization: Bearer <CRON_MONITOR_SECRET>`.

Configura `CRON_MONITOR_SECRET` como variable de entorno de Vercel en el entorno desplegado. Usa un valor aleatorio de al menos 32 caracteres y el mismo valor únicamente en la cabecera protegida del job. No lo escribas en el repositorio ni en la URL.

La respuesta `200` indica que el monitor terminó o que una ejecución concurrente ya estaba procesando el intervalo. Las respuestas `401`, `405` y `500` indican, respectivamente, credenciales inválidas, método incorrecto o un error interno.
