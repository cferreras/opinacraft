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

type PingClient = {
  setSocket: (socket: net.Socket) => void;
};

export function createMinecraftPingOptions(target: MinecraftTarget, socket: net.Socket) {
  return {
    host: target.handshakeHost,
    port: target.port,
    closeTimeout: CONNECT_TIMEOUT_MS,
    noPongTimeout: CONNECT_TIMEOUT_MS,
    connect: (client: PingClient) => {
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
  const promise = (ping(createMinecraftPingOptions(target, socket) as never) as Promise<NewPingResult>)
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
        () => reject(tooLarge ? new MinecraftResponseError() : new MinecraftTimeoutError()),
        CONNECT_TIMEOUT_MS,
      );
    });
    const result = await Promise.race([promise, timeout, ...(abortPromise ? [abortPromise] : [])]);
    if (tooLarge) throw new MinecraftResponseError();
    const latencyMs = Number.isFinite(result.latency) && result.latency >= 0 ? result.latency : null;
    return { ...result, latencyMs };
  } catch (error) {
    if (tooLarge) throw new MinecraftResponseError();
    if (error instanceof MinecraftResponseError || error instanceof MinecraftOfflineError || error instanceof MinecraftTimeoutError || error instanceof MinecraftAbortError) throw error;
    if (error instanceof Error && error.message === "ETIMEDOUT") throw new MinecraftTimeoutError();
    throw new MinecraftOfflineError();
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
    socket.destroy();
  }
}
