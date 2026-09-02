import net from "node:net";

import type { NewPingResult } from "minecraft-protocol";

import { MinecraftAbortError, type MinecraftTarget } from "@/lib/minecraft/network";

const CONNECT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

async function getMinecraftPing() {
  const protocolModule = await import("minecraft-protocol");
  const minecraftProtocol = protocolModule.default ?? protocolModule;
  return minecraftProtocol.ping;
}

export class MinecraftOfflineError extends Error {
  constructor() {
    super("The Minecraft server is offline or did not respond in time.");
    this.name = "MinecraftOfflineError";
  }
}

export class MinecraftTimeoutError extends Error {
  constructor() {
    super("The Minecraft server did not respond before the timeout.");
    this.name = "MinecraftTimeoutError";
  }
}

export class MinecraftResponseError extends Error {
  constructor() {
    super("The Minecraft server returned an invalid status response.");
    this.name = "MinecraftResponseError";
  }
}

type StatusPacket = { response?: unknown };

type PingClient = {
  setSocket: (socket: net.Socket) => void;
  prependOnceListener?: (event: string, listener: (packet: StatusPacket) => void) => unknown;
  emit?: (event: string, ...args: unknown[]) => boolean;
};

// A payload the dependency's `JSON.parse` is guaranteed to reject, so every
// unusable status response follows the single containment path below.
const UNPARSABLE_STATUS_RESPONSE = "[invalid]";

function isUsableStatusResponse(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return Boolean(parsed) && typeof parsed === "object";
  } catch {
    return false;
  }
}

/**
 * minecraft-protocol parses the status JSON inside its own `server_info`
 * listener, which runs on the socket's stream callback stack. A throw there
 * escapes every promise handler and terminates the whole process, so a
 * malicious endpoint could kill the shared monitor worker with a few malformed
 * bytes. Responses the dependency would mishandle are rewritten so its parse
 * fails immediately, and any listener throw is contained and converted into a
 * normal promise rejection.
 */
function containMinecraftClientCallbacks(
  client: PingClient,
  socket: net.Socket,
  onInvalidResponse: () => void,
) {
  client.prependOnceListener?.("server_info", (packet) => {
    if (packet && typeof packet === "object" && isUsableStatusResponse(packet.response)) return;
    onInvalidResponse();
    if (packet && typeof packet === "object") packet.response = UNPARSABLE_STATUS_RESPONSE;
  });

  const emit = client.emit;
  if (typeof emit !== "function") return;
  client.emit = (event: string, ...args: unknown[]) => {
    try {
      return emit.call(client, event, ...args);
    } catch {
      onInvalidResponse();
      if (event === "error") {
        socket.destroy();
        return false;
      }
      setImmediate(() => {
        try {
          emit.call(client, "error", new MinecraftResponseError());
        } catch {
          socket.destroy();
        }
      });
      return false;
    }
  };
}

export function createMinecraftPingOptions(
  target: MinecraftTarget,
  socket: net.Socket,
  onInvalidResponse: () => void = () => undefined,
) {
  return {
    host: target.handshakeHost,
    port: target.port,
    closeTimeout: CONNECT_TIMEOUT_MS,
    noPongTimeout: CONNECT_TIMEOUT_MS,
    connect: (client: PingClient) => {
      containMinecraftClientCallbacks(client, socket, onInvalidResponse);
      client.setSocket(socket);
      socket.connect({ host: target.connectHost, port: target.port });
    },
  };
}

export type JavaPingResult = NewPingResult & {
  latencyMs: number | null;
};

export async function pingJavaServer(target: MinecraftTarget, signal?: AbortSignal): Promise<JavaPingResult> {
  const socket = new net.Socket();
  let bytes = 0;
  let tooLarge = false;
  let invalidResponse = false;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  socket.on("error", () => undefined);
  socket.on("data", (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_RESPONSE_BYTES) {
      tooLarge = true;
      socket.destroy();
    }
  });

  if (signal?.aborted) throw new MinecraftAbortError();
  const ping = await getMinecraftPing();
  if (signal?.aborted) throw new MinecraftAbortError();
  const promise = (ping(createMinecraftPingOptions(target, socket, () => { invalidResponse = true; }) as never) as Promise<NewPingResult>)
    .catch((error: unknown) => {
      if (error instanceof SyntaxError) throw new MinecraftResponseError();
      throw error;
    });

  try {
    const abortPromise = signal
      ? new Promise<never>((_, reject) => {
          abortHandler = () => {
            socket.destroy();
            reject(new MinecraftAbortError());
          };
          if (signal.aborted) abortHandler();
          else signal.addEventListener("abort", abortHandler, { once: true });
        })
      : null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(
        () => reject(tooLarge || invalidResponse ? new MinecraftResponseError() : new MinecraftTimeoutError()),
        CONNECT_TIMEOUT_MS,
      );
    });
    const result = await Promise.race([promise, timeout, ...(abortPromise ? [abortPromise] : [])]);
    if (tooLarge || invalidResponse) throw new MinecraftResponseError();
    if (!result || typeof result !== "object") throw new MinecraftResponseError();
    const latencyMs = Number.isFinite(result.latency) && result.latency >= 0 ? result.latency : null;
    return { ...result, latencyMs };
  } catch (error) {
    if (tooLarge || invalidResponse) throw new MinecraftResponseError();
    if (error instanceof MinecraftResponseError || error instanceof MinecraftOfflineError || error instanceof MinecraftTimeoutError || error instanceof MinecraftAbortError) throw error;
    if (error instanceof Error && error.message === "ETIMEDOUT") throw new MinecraftTimeoutError();
    throw new MinecraftOfflineError();
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
    socket.destroy();
  }
}
