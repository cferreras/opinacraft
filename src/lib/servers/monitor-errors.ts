import { MinecraftOfflineError, MinecraftResponseError, MinecraftTimeoutError } from "@/lib/minecraft/ping";
import { BedrockOfflineError } from "@/lib/minecraft/bedrock-ping";
import { BlockedMinecraftTargetError, MinecraftAbortError, MinecraftDnsError } from "@/lib/minecraft/network";

export type MonitorFailureCode =
  | "unreachable"
  | "timeout"
  | "invalid_response"
  | "dns_error"
  | "blocked_target"
  | "monitor_error";

export function classifyProbeError(error: unknown): MonitorFailureCode {
  if (error instanceof MinecraftAbortError) return "timeout";
  if (error instanceof BlockedMinecraftTargetError) return "blocked_target";
  if (error instanceof MinecraftDnsError) return "dns_error";
  if (error instanceof MinecraftTimeoutError) return "timeout";
  if (error instanceof MinecraftResponseError) return "invalid_response";
  if (error instanceof MinecraftOfflineError || error instanceof BedrockOfflineError) return "unreachable";
  return "monitor_error";
}
