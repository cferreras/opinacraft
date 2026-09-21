# Migraciones (Neon / Drizzle)

Cada carpeta de `src/migrations/` contiene dos ficheros:

| Fichero | Para qué sirve |
| --- | --- |
| `migration.sql` | lo que aplica `pnpm db:migrate`, en orden alfabético de carpeta |
| `snapshot.json` | el estado del esquema **después** de esa migración |

`pnpm db:generate` **no mira la base de datos**: compara `src/schema.ts` con el snapshot más
reciente que encuentra. De ahí la única regla importante:

> Si una migración no deja snapshot, todas las siguientes `db:generate` diffean contra un esquema
> viejo.

Cuando eso pasa, `db:generate` propone crear tablas que ya existen y, al no poder decidir si cada
una es nueva o un renombrado, pide un `--hints` por entidad. Es exactamente lo que ocurrió entre
agosto y septiembre de 2026: siete migraciones escritas a mano seguidas, ningún snapshot, y
`db:generate` acabó pidiendo 14 decisiones. `tests/migration-snapshots.test.ts` vigila el invariante
para que vuelva a fallar en CI y no en las manos de quien toca el esquema tres semanas después.

## El orden correcto para cambiar el esquema

1. Editar `src/schema.ts`.
2. `pnpm db:generate` — escribe el `migration.sql` **y** el `snapshot.json` a la vez.
3. Si hace falta, editar el SQL generado a mano: añadir comentarios, una migración de datos, un
   `CHECK`, un `DROP` de algo que Drizzle no conoce. El snapshot ya es correcto y se queda como
   está.
4. `pnpm db:migrate` con `DIRECT_DATABASE_URL` (la conexión directa, nunca la del pooler).

Escribir primero el SQL y no tocar `schema.ts` es lo que rompe la cadena. Si por lo que sea hay que
hacerlo así, hay que reconstruir el snapshot después (ver abajo).

## Reparar la cadena si se ha roto

`db:generate` pide `--hints` porque no sabe si cada entidad es nueva o un renombrado. Cuando la
respuesta es "todas son nuevas, simplemente el snapshot está viejo":

```bash
# Una entrada "create" por cada entidad que liste la salida de db:generate.
npx drizzle-kit generate --name=snapshot_catchup --hints '[{"type":"create","kind":"table","entity":["public","mi_tabla"]},{"type":"create","kind":"enum","entity":["public","mi_enum"]}]'
```

Eso genera una carpeta con:

- un `migration.sql` que **hay que descartar**: crea tablas que las migraciones escritas a mano ya
  crearon, así que aplicarlo fallaría con "already exists";
- un `snapshot.json` correcto, con el esquema completo y `prevIds` apuntando al snapshot anterior.

Mueve ese `snapshot.json` a la carpeta de la última migración real y borra la carpeta generada:

```bash
mv src/migrations/<catchup>/snapshot.json src/migrations/<ultima-migracion-real>/snapshot.json
rm -rf src/migrations/<catchup>
pnpm db:generate   # debe decir: No schema changes, nothing to migrate
```

El snapshot describe el estado *después* de esa migración, y como es la última, ese estado es el
esquema completo de hoy. La comprobación final es la de arriba: sin cambios pendientes, y un cambio
nuevo en `schema.ts` debe producir un único `ALTER TABLE`, sin preguntas.

## Nota sobre la deriva

`db:generate` nunca consulta la base de datos, así que un `migration.sql` escrito a mano que nombre
un índice o una constraint de forma distinta a como lo haría Drizzle produce una divergencia que
Drizzle no puede ver. Los nombres de las migraciones manuales de este repo coinciden con los que
genera Drizzle; conviene mantenerlo así. `pnpm db:inspect` sirve para comparar contra la base de
datos real cuando haya dudas.

## El monitor va aparte

`src/monitor-migrations/` es otra base de datos (PostgreSQL en Dokploy, nunca Neon) con su propio
runner, `pnpm monitor:db:migrate`, que lleva la cuenta en `monitor_schema_migrations`. No usa
Drizzle Kit ni snapshots.
