import { classifyProbeError } from "@/lib/servers/monitor-errors";
import {
  MinecraftAbortError,
  resolveMinecraftBedrockTargetCandidates,
  resolveMinecraftTargetCandidates,
  type MinecraftTarget,
} from "@/lib/minecraft/network";
import { pingBedrockServer, type BedrockPingResult } from "@/lib/minecraft/bedrock-ping";
import { MinecraftOfflineError, MinecraftTimeoutError, pingJavaServer, type JavaPingResult } from "@/lib/minecraft/ping";
import type { CanonicalMonitorEndpoint, CanonicalProbeResponse } from "@/lib/servers/monitor-worker-core";

const DEFAULT_PROBE_TIMEOUT_MS = 8_000;

export type MonitorProbeDependencies = {
  resolveJavaTargets: (host: string, port: number, signal?: AbortSignal) => Promise<readonly MinecraftTarget[]>;
  resolveBedrockTargets: (host: string, port: number, signal?: AbortSignal) => Promise<readonly MinecraftTarget[]>;
  pingJavaServer: (target: MinecraftTarget, signal?: AbortSignal) => Promise<JavaPingResult>;
  pingBedrockServer: (target: MinecraftTarget, signal?: AbortSignal) => Promise<BedrockPingResult>;
};

const defaultDependencies: MonitorProbeDependencies = {
  resolveJavaTargets: resolveMinecraftTargetCandidates,
  resolveBedrockTargets: resolveMinecraftBedrockTargetCandidates,
  pingJavaServer,
  pingBedrockServer,
};

function pingData(value: unknown) {
  const result = value as { latencyMs?: number | null; players?: { online?: number; max?: number }; version?: { name?: string } };
  return {
    playersCurrent: Number.isInteger(result.players?.online) && (result.players?.online ?? 0) >= 0 ? result.players?.online ?? null : null,
    playersMax: Number.isInteger(result.players?.max) && (result.players?.max ?? 0) >= 0 ? result.players?.max ?? null : null,
    version: typeof result.version?.name === "string" ? result.version.name.slice(0, 100) : null,
    latencyMs: Number.isInteger(result.latencyMs) && (result.latencyMs ?? 0) >= 0 ? result.latencyMs ?? null : null,
  };
}

function offlineResponse(error: unknown): CanonicalProbeResponse {
  const failureCode = classifyProbeError(error);
  if (failureCode === "monitor_error") throw error;
  return {
    status: "offline",
    failureCode,
    playersCurrent: null,
    playersMax: null,
    version: null,
    latencyMs: null,
  };
}

export async function probeCanonicalEndpoint(
  endpoint: CanonicalMonitorEndpoint,
  dependencies: MonitorProbeDependencies = defaultDependencies,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<CanonicalProbeResponse> {
  const controller = new AbortController();
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

  const operation = (async () => {
    const targets = endpoint.edition === "bedrock"
      ? await dependencies.resolveBedrockTargets(endpoint.host, endpoint.port, controller.signal)
      : await dependencies.resolveJavaTargets(endpoint.host, endpoint.port, controller.signal);
    let lastError: unknown = new MinecraftOfflineError();

    for (const target of targets) {
      if (controller.signal.aborted) throw new MinecraftAbortError();
      try {
        const result = endpoint.edition === "bedrock"
          ? await dependencies.pingBedrockServer(target, controller.signal)
          : await dependencies.pingJavaServer(target, controller.signal);
        return { status: "online" as const, failureCode: null, ...pingData(result) };
      } catch (error) {
        lastError = error;
        if (controller.signal.aborted) throw error;
      }
    }

    throw lastError;
  })();

  const timeout = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => {
      controller.abort();
      reject(new MinecraftTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } catch (error) {
    if (controller.signal.aborted) return offlineResponse(new MinecraftTimeoutError());
    return offlineResponse(error);
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    controller.abort();
  }
}
