# Copias de seguridad de PostgreSQL

OpinaCraft genera una copia lógica diaria de la base de datos Neon desde
GitHub Actions y la guarda en un bucket privado de Cloudflare R2. El workflow
usa `pg_dump` en formato custom y conserva, dentro de un prefijo propio, las
siguientes copias:

- 7 copias diarias;
- 4 copias semanales (una por semana ISO);
- 6 copias mensuales (una por mes UTC).

La copia semanal y mensual se actualiza con la última ejecución correcta del
periodo. Si una ejecución falla, la copia anterior se conserva y la poda no se
ejecuta hasta que otra copia se haya subido y verificado correctamente.

## Configuración de Neon

Usa una URL directa de Neon, nunca una URL `-pooler`. Para limitar el alcance,
crea un rol dedicado de solo lectura en la base de producción. Ejecuta como
propietario de la base o administrador:

```sql
CREATE ROLE opinacraft_backup LOGIN PASSWORD 'genera-una-clave-larga-y-unica';
GRANT CONNECT ON DATABASE opinacraft TO opinacraft_backup;
GRANT pg_read_all_data TO opinacraft_backup;
```

Si el nombre de la base es diferente, ajusta el `GRANT CONNECT`. Guarda en
GitHub la URL directa completa de ese rol, incluyendo `sslmode=require`.

## Configuración de R2

1. Crea un bucket privado dedicado para los backups.
2. En R2, crea un token S3 con `Object Read & Write` limitado únicamente a
   ese bucket. El workflow necesita listar, escribir, leer metadatos y borrar
   objetos antiguos.
3. No habilites acceso público ni un dominio público para el bucket.

Configura estos GitHub Repository Secrets, no valores en archivos del repo:

| Secret | Valor |
| --- | --- |
| `NEON_BACKUP_DATABASE_URL` | URL directa y no pooled del rol de backup |
| `R2_ACCOUNT_ID` | Account ID de Cloudflare, 32 caracteres hexadecimales |
| `R2_ACCESS_KEY_ID` | Access Key ID del token R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key del token R2 |
| `R2_BUCKET_NAME` | Nombre exacto del bucket privado |

El workflow no usa `DATABASE_URL`, `DIRECT_DATABASE_URL`, secretos de Vercel
ni el entorno protegido de migraciones. Esto permite que la ejecución
programada no quede esperando una aprobación manual.

## Ejecución manual

1. Abre **Actions** en GitHub.
2. Selecciona **PostgreSQL database backup**.
3. Pulsa **Run workflow**, selecciona `main` y confirma.
4. Revisa el resumen de la ejecución y confirma en R2 que existen las claves
   bajo `opinacraft/postgres/daily/`, `weekly/` y `monthly/`.

El horario automático es `03:17 UTC` cada día. Las fechas de las claves se
calculan en UTC, no en la zona horaria del navegador.

## Restauración segura

Una copia custom solo contiene una base PostgreSQL; no contiene roles globales
ni tablespaces del clúster. Primero restaura siempre en una base vacía y
aislada de Neon, por ejemplo una base nueva dentro de una rama de prueba, y
valida la aplicación antes de tocar producción.

Descarga una clave concreta con un cliente S3 configurado para el endpoint de
R2. Mantén las credenciales fuera del historial del shell:

```bash
aws s3 cp \
  s3://BUCKET/opinacraft/postgres/daily/opinacraft-YYYY-MM-DD.dump \
  opinacraft-restore.dump \
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com
```

Comprueba el archivo antes de restaurarlo:

```bash
sha256sum opinacraft-restore.dump
pg_restore --list opinacraft-restore.dump
```

Compara el SHA-256 con el metadato `sha256` de `head-object` en R2. Después,
usa una URL directa del destino aislado:

```bash
pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --single-transaction \
  opinacraft-restore.dump
```

Verifica migraciones, tablas principales, cuentas, servidores y el arranque de
la aplicación restaurada. Para una recuperación productiva, prepara una
ventana de mantenimiento, conserva una copia de seguridad adicional y define
el cambio de conexión antes de ejecutarlo. No uses `--clean` directamente
contra producción sin un procedimiento revisado: una restauración ejecuta SQL
proveniente del archivo y puede eliminar objetos existentes.
