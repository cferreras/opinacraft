import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type Env = { NODE_ENV?: string; VOTIFIER_ALLOW_PRIVATE_HOSTS?: string };

/**
 * Whether Votifier may point at a private address, for testing against a server on the same
 * machine. Read from the process at call time rather than through the env schema, so loading the
 * Votifier client never requires the whole server configuration. The variable is still declared
 * in `src/env/server.ts`; production ignores it whatever its value.
 */
export function localVotifierHostsAllowed(env: Env = process.env, nodeEnv = process.env.NODE_ENV) {
  return env.VOTIFIER_ALLOW_PRIVATE_HOSTS === "true" && env.NODE_ENV !== "production" && nodeEnv !== "production";
}

/** Resolution without the public-address check, used only when the override above is on. */
export async function resolveLocalVotifierTargets(host: string, port: number) {
  if (isIP(host)) return [{ connectHost: host, port }];
  const addresses = await lookup(host, { all: true, verbatim: true });
  return addresses.map(({ address }) => ({ connectHost: address, port }));
}
