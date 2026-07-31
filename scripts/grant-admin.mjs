import "dotenv/config";
import pg from "pg";

const args = process.argv.slice(2);
const email = args[args.indexOf("--email") + 1];
const role = args[args.indexOf("--role") + 1];
if (!email || !["admin", "moderator"].includes(role)) {
  console.error("Uso: pnpm admin:grant -- --email <email> --role admin|moderator");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL });
try {
  const account = await pool.query('select id from "user" where lower(email) = lower($1) limit 1', [email]);
  if (!account.rows[0]) throw new Error("No existe una cuenta con ese email.");
  await pool.query('insert into platform_roles (user_id, role) values ($1, $2) on conflict (user_id) do update set role = excluded.role', [account.rows[0].id, role]);
  console.log(`Rol ${role} concedido a ${email}.`);
} finally { await pool.end(); }
