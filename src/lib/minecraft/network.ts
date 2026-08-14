import dns from "node:dns/promises";
import { isIP } from "node:net";

import { isPublicAddress } from "./address.ts";
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

export class MinecraftAbortError extends Error {
  constructor() {
    super("The Minecraft network operation was cancelled.");
    this.name = "AbortError";
  }
}

export type MinecraftTarget = {
  handshakeHost: string;
  connectHost: string;
  port: number;
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new MinecraftAbortError();
}

async function withTimeout<T>(promise: Promise<T>, signal?: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  try {
    const abortPromise = signal
      ? new Promise<T>((_, reject) => {
          abortHandler = () => reject(new MinecraftAbortError());
          if (signal.aborted) abortHandler();
          else signal.addEventListener("abort", abortHandler, { once: true });
        })
      : null;
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new MinecraftDnsError()), DNS_TIMEOUT_MS);
      }),
      ...(abortPromise ? [abortPromise] : []),
    ]);
  } catch (error) {
    if (error instanceof MinecraftAbortError) throw error;
    throw new MinecraftDnsError();
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
  }
}

async function resolveAddresses(host: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new BlockedMinecraftTargetError();
    return [host];
  }

  if (!isPublicHost(host)) throw new BlockedMinecraftTargetError();

  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    withTimeout(dns.resolve4(host), signal),
    withTimeout(dns.resolve6(host), signal),
  ]);
  throwIfAborted(signal);
  let addresses = [
    ...(ipv4Result.status === "fulfilled" ? ipv4Result.value : []),
    ...(ipv6Result.status === "fulfilled" ? ipv6Result.value : []),
  ];

  // Node's c-ares resolver can fail for domains that the operating-system
  // resolver handles correctly. The fallback remains SSRF-safe because every
  // returned address is validated before it can be used by the TCP connector.
  if (!addresses.length) {
    const lookupResults = await withTimeout(dns.lookup(host, { all: true, verbatim: true }), signal);
    addresses = lookupResults.map(({ address }) => address);
  }

  addresses = [...new Set(addresses)];
  if (!addresses.length) throw new MinecraftDnsError();
  if (addresses.some((address) => !isPublicAddress(address))) {
    throw new BlockedMinecraftTargetError();
  }

  return addresses;
}

export async function resolveMinecraftTargetCandidates(hostInput: string, portInput: number, signal?: AbortSignal) {
  const host = normalizeHost(hostInput);
  if (!isPublicHost(host)) throw new BlockedMinecraftTargetError();
  const port = Number(portInput);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new BlockedMinecraftTargetError();
  }

  throwIfAborted(signal);
  if (port === 25565 && isIP(host) === 0) {
    let records: Awaited<ReturnType<typeof dns.resolveSrv>> = [];
    try {
      records = await withTimeout(dns.resolveSrv(`_minecraft._tcp.${host}`), signal);
    } catch (error) {
      if (error instanceof MinecraftAbortError) throw error;
    }
    if (records.length) {
      const ordered = [...records].sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      let blockedRecord = false;
      const targets: MinecraftTarget[] = [];

      for (const record of ordered) {
        throwIfAborted(signal);
        if (record.port < 1024 || record.port > 65535) continue;

        try {
          const addresses = await resolveAddresses(record.name.replace(/\.$/, ""), signal);
          targets.push(...addresses.map((connectHost) => ({
            handshakeHost: host,
            connectHost,
            port: record.port,
          })));
        } catch (error) {
          if (error instanceof BlockedMinecraftTargetError) blockedRecord = true;
        }
      }

      if (targets.length) return targets;
      if (blockedRecord || ordered.every((record) => record.port < 1024 || record.port > 65535)) {
        throw new BlockedMinecraftTargetError();
      }
      throw new MinecraftDnsError();
    }
  }

  const addresses = await resolveAddresses(host, signal);
  return addresses.map((connectHost) => ({ handshakeHost: host, connectHost, port } satisfies MinecraftTarget));
}

export async function resolveMinecraftTarget(hostInput: string, portInput: number) {
  const [target] = await resolveMinecraftTargetCandidates(hostInput, portInput);
  if (!target) throw new MinecraftDnsError();
  return target;
}

/** Resolve a Bedrock endpoint while preserving the public host/port used in
 * the RakNet packet. Bedrock commonly advertises `_minecraft._udp` SRV
 * records; every resolved address is validated before a datagram is sent. */
export async function resolveMinecraftBedrockTargetCandidates(hostInput: string, portInput: number, signal?: AbortSignal) {
  const host = normalizeHost(hostInput);
  if (!isPublicHost(host)) throw new BlockedMinecraftTargetError();
  const requestedPort = Number(portInput);
  if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) {
    throw new BlockedMinecraftTargetError();
  }

  let addresses: string[] = [];
  if (isIP(host) === 0 && requestedPort === 19132) {
    let records: Awaited<ReturnType<typeof dns.resolveSrv>> = [];
    try {
      records = await withTimeout(dns.resolveSrv(`_minecraft._udp.${host}`), signal);
    } catch (error) {
      if (error instanceof MinecraftAbortError) throw error;
    }
    const ordered = [...records].sort((a, b) => a.priority - b.priority || b.weight - a.weight);
    const targets: MinecraftTarget[] = [];
    for (const record of ordered) {
      throwIfAborted(signal);
      if (record.port < 1024 || record.port > 65535) continue;
      try {
        const recordAddresses = await resolveAddresses(record.name.replace(/\.$/, ""), signal);
        targets.push(...recordAddresses.map((connectHost) => ({ handshakeHost: host, connectHost, port: record.port })));
      } catch (error) {
        if (error instanceof BlockedMinecraftTargetError) throw error;
      }
    }
    if (targets.length) return targets;
  }
  if (!addresses.length) addresses = await resolveAddresses(host, signal);
  return addresses.map((connectHost) => ({ handshakeHost: host, connectHost, port: requestedPort } satisfies MinecraftTarget));
}

export async function resolveMinecraftBedrockTarget(hostInput: string, portInput: number) {
  const [target] = await resolveMinecraftBedrockTargetCandidates(hostInput, portInput);
  if (!target) throw new MinecraftDnsError();
  return target;
}
