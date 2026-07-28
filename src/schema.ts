import { serial, snakeCase, text } from 'drizzle-orm/pg-core';

export const testsTable = snakeCase.table('tests', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});
