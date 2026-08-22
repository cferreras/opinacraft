export function buildHistorySourceQuery({ table, alias, columns, orderBy }) {
  return [
    `select ${columns.join(", ")}`,
    `from ${table} ${alias}`,
    `where ${alias}.server_id = any($1::uuid[])`,
    `order by ${orderBy}`,
  ].join(" ");
}
