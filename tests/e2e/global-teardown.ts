import { closePool } from "./helpers";

export default async function globalTeardown() {
  await closePool();
}
