export type MinecraftEdition = "java" | "bedrock";

export const MINECRAFT_PORT_MIN = 1_024;
export const MINECRAFT_PORT_MAX = 65_535;

export const MINECRAFT_EDITION_LABELS: Record<MinecraftEdition, string> = {
  java: "Java",
  bedrock: "Bedrock",
};

export const MINECRAFT_EDITION_DESCRIPTIONS: Record<MinecraftEdition, string> = {
  java: "Para Minecraft Java Edition",
  bedrock: "Para Minecraft Bedrock Edition",
};

export const MINECRAFT_DEFAULT_PORTS: Record<MinecraftEdition, number> = {
  java: 25_565,
  bedrock: 19_132,
};

export function defaultMinecraftPort(edition: MinecraftEdition) {
  return MINECRAFT_DEFAULT_PORTS[edition];
}

export function parseEnabledPort(value: string | undefined, enabled: boolean) {
  if (!enabled) return undefined;
  const trimmed = value?.trim();
  if (!trimmed) return Number.NaN;
  const port = Number(trimmed);
  return Number.isInteger(port) ? port : Number.NaN;
}
