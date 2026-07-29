import dns from "node:dns/promises";
import { isIP } from "node:net";

import ipaddr from "ipaddr.js";

import { isPublicHost, normalizeHost } from "../servers/validation.ts";

const DNS_TIMEOUT_MS = 2_000;

export class BlockedMinecraftTargetError extends Error {
  constructor() {
    super("This server address cannot be checked.");
    this.name = "BlockedMinecraftTargetError";
  }
}

export class MinecraftDnsError extends Error {
  constructor() {
    super("The Minecraft server address could not be resolved.");
    this.name = "MinecraftDnsError";
  }
}

export type MinecraftTarget = {
  handshakeHost: string;
  connectHost: string;
  port: number;
};

function isPublicAddress(value: string) {
  try {
    let address = ipaddr.parse(value) as ipaddr.IPv4 | ipaddr.IPv6;
    if (address.kind() === "ipv6") {
      const ipv6 = address as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) {
        address = (ipv6 as unknown as { toIPv4: () => ipaddr.IPv4 }).toIPv4();
      }
    }
    if (address.kind() === "ipv4") {
      const normalized = address.toString();
      if (new Set(["168.63.129.16", "169.254.169.254", "100.100.100.200"]).has(normalized)) {
        return false;
      }
    }
    return address.range() === "unicast";
  } catch {
    return false;
  }
}

async function withTimeout<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new MinecraftDnsError()), DNS_TIMEOUT_MS);
      }),
    ]);
  } catch {
    throw new MinecraftDnsError();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveAddresses(host: string) {
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new BlockedMinecraftTargetError();
    return [host];
  }

  if (!isPublicHost(host)) throw new BlockedMinecraftTargetError();

  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    withTimeout(dns.resolve4(host)),
    withTimeout(dns.resolve6(host)),
  ]);
  let addresses = [
    ...(ipv4Result.status === "fulfilled" ? ipv4Result.value : []),
    ...(ipv6Result.status === "fulfilled" ? ipv6Result.value : []),
  ];

  // Node's c-ares resolver can fail for domains that the operating-system
  // resolver handles correctly. The fallback remains SSRF-safe because every
  // returned address is validated before it can be used by the TCP connector.
  if (!addresses.length) {
    const lookupResults = await withTimeout(
      dns.lookup(host, { all: true, verbatim: true }),
    );
    addresses = lookupResults.map(({ address }) => address);
  }

  addresses = [...new Set(addresses)];
  if (!addresses.length) throw new MinecraftDnsError();
  if (addresses.some((address) => !isPublicAddress(address))) {
    throw new BlockedMinecraftTargetError();
  }

  return addresses;
}

export async function resolveMinecraftTarget(hostInput: string, portInput: number) {
  const host = normalizeHost(hostInput);
  if (!isPublicHost(host)) throw new BlockedMinecraftTargetError();
  const port = Number(portInput);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new BlockedMinecraftTargetError();
  }

  let effectiveHost = host;
  let effectivePort = port;
  if (port === 25565 && isIP(host) === 0) {
    const records = await withTimeout(
      dns.resolveSrv(`_minecraft._tcp.${host}`),
    ).catch(() => []);
    if (records.length) {
      const ordered = [...records].sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      const resolved = await Promise.all(
        ordered.map(async (record) => ({
          record,
          addresses: await resolveAddresses(record.name.replace(/\.$/, "")),
        })),
      );
      if (resolved.some(({ record }) => record.port < 1024 || record.port > 65535)) {
        throw new BlockedMinecraftTargetError();
      }
      effectiveHost = resolved[0]!.record.name.replace(/\.$/, "");
      effectivePort = resolved[0]!.record.port;
      return {
        handshakeHost: host,
        connectHost: resolved[0]!.addresses[0]!,
        port: effectivePort,
      } satisfies MinecraftTarget;
    }
  }

  const addresses = await resolveAddresses(effectiveHost);
  return {
    handshakeHost: host,
    connectHost: addresses[0]!,
    port: effectivePort,
  } satisfies MinecraftTarget;
}
