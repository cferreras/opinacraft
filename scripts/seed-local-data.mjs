const countryCodes = [
  "es", "mx", "ar", "cl", "co", "pe", "ve", "ec", "uy", "bo", "py",
  "cr", "pa", "do", "gt", "hn", "sv", "ni", "pr", "us", "global",
];

const modeSets = [
  ["skyblock", "aventura", "economia"],
  ["survival", "smp", "economia"],
  ["survival", "towny", "economia"],
  ["tecnico", "survival", "vanilla"],
  ["smp", "vanilla", "eventos"],
  ["creativo", "parkour", "eventos"],
  ["minijuegos", "bedwars", "skywars"],
  ["pvp", "factions", "lifesteal"],
  ["prison", "economia", "pvp"],
  ["roleplay", "mmorpg", "aventura"],
  ["anarquia", "hardcore", "survival"],
  ["modded", "pixelmon", "aventura"],
  ["oneblock", "skyblock", "survival"],
  ["kitpvp", "pvp", "eventos"],
  ["uhc", "hardcore", "survival"],
  ["earth", "towny", "roleplay"],
  ["murder", "minijuegos", "eventos"],
  ["speedrun", "parkour", "eventos"],
  ["vanilla", "tecnico", "smp"],
  ["creativo", "minijuegos", "parkour"],
];

const versions = ["1.21.8", "Paper 1.21.7", "1.8-1.21", "1.20.6", "1.21.4"];

const curatedServers = [
  {
    name: "Skyforge Realms",
    description: "Una red de aventuras aéreas, islas flotantes y temporadas cooperativas para construir tu propia leyenda.",
    country: "es",
    gameModes: ["skyblock", "aventura", "economia"],
    media: [{ kind: "banner", sourceFile: "skyforge-realms-banner.png", outputFile: "skyforge-realms-banner.webp" }],
  },
  {
    name: "Astral Network",
    description: "Supervivencia con economía, misiones y una progresión compartida entre Java y Bedrock.",
    country: "mx",
    gameModes: ["survival", "smp", "economia"],
    media: [{ kind: "logo", sourceFile: "astral-network-logo.png", outputFile: "astral-network-logo.webp" }],
  },
  {
    name: "Verdant Isles",
    description: "Islas verdes, ruinas antiguas y una comunidad relajada para explorar, construir y comerciar.",
    country: "ar",
    gameModes: ["survival", "towny", "economia"],
    media: [{ kind: "logo", sourceFile: "verdant-isles-logo.png", outputFile: "verdant-isles-logo.webp" }],
  },
  {
    name: "Redstone Republic",
    description: "Un servidor técnico para automatizar, compartir diseños y llevar cada granja hasta el límite.",
    country: "cl",
    gameModes: ["tecnico", "survival", "vanilla"],
    media: [{ kind: "logo", sourceFile: "redstone-republic-logo.png", outputFile: "redstone-republic-logo.webp" }],
  },
];

const themes = [
  { name: "Aurora", motif: "biomas luminosos y expediciones cooperativas" },
  { name: "Bruma", motif: "historias tranquilas y pueblos que crecen sin prisas" },
  { name: "Cobalto", motif: "grandes construcciones, redstone y retos técnicos" },
  { name: "Nube", motif: "islas suspendidas y progresión por temporadas" },
  { name: "Pixel", motif: "minijuegos ágiles y eventos para toda la comunidad" },
  { name: "Ember", motif: "combate competitivo, clanes y conquistas semanales" },
  { name: "Obsidiana", motif: "mazmorras exigentes y una economía dirigida por jugadores" },
  { name: "Lumen", motif: "creatividad compartida y parcelas para construir en equipo" },
  { name: "Coral", motif: "exploración oceánica, comercio y aventuras narrativas" },
  { name: "Titán", motif: "progresión desafiante y proyectos comunitarios a gran escala" },
  { name: "Sakura", motif: "roleplay ligero, ciudades cuidadas y eventos sociales" },
  { name: "Andes", motif: "supervivencia en español y una comunidad cercana" },
  { name: "Quetzal", motif: "temporadas, torneos y mundos llenos de secretos" },
  { name: "Solstice", motif: "aventuras multiversión y objetivos cooperativos" },
];

const formats = [
  { suffix: "SMP", promise: "Una experiencia persistente pensada para jugar a diario." },
  { suffix: "Network", promise: "Varios modos conectados desde una sola dirección." },
  { suffix: "Realms", promise: "Cada temporada abre un mundo y una historia nuevos." },
  { suffix: "Craft", promise: "Normas claras, administración activa y espacio para crear." },
];

const generatedServers = themes.flatMap((theme) =>
  formats.map((format) => ({
    name: `${theme.name} ${format.suffix}`,
    description: `Una comunidad centrada en ${theme.motif}. ${format.promise}`,
    media: [],
  })),
);

const blueprints = [...curatedServers, ...generatedServers];
if (blueprints.length !== 60) throw new Error(`Expected 60 local seed blueprints, received ${blueprints.length}.`);

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function endpointState(index) {
  if (index % 10 === 8) return "offline";
  if (index % 10 === 9) return "unknown";
  return "online";
}

function buildEndpoint({ edition, index, slug }) {
  const healthStatus = endpointState(index);
  const isOnline = healthStatus === "online";
  const isUnknown = healthStatus === "unknown";
  const basePlayers = 35 + ((index * 137 + (edition === "bedrock" ? 71 : 0)) % 1_900);
  const playersMax = Math.max(250, basePlayers + 180 + ((index * 43) % 900));

  return {
    edition,
    host: `${edition === "java" ? "play" : "bedrock"}.${slug}.seed.test`,
    port: edition === "java" ? 25565 : 19132,
    healthStatus,
    playersCurrent: isUnknown ? null : isOnline ? basePlayers : 0,
    playersMax: isUnknown ? null : playersMax,
    version: isUnknown ? null : versions[index % versions.length],
    // Runtime monitoring owns measured latency; fixtures intentionally leave it empty.
    latencyMs: null,
    minutesAgo: isUnknown ? null : (index % 12) + 1,
    lastOnlineDaysAgo: isUnknown ? null : isOnline ? 0 : (index % 4) + 1,
    consecutiveFailures: healthStatus === "offline" ? (index % 4) + 2 : 0,
  };
}

function buildEndpoints(index, slug) {
  const profile = index % 4;
  if (profile === 1) return [buildEndpoint({ edition: "bedrock", index, slug })];
  if (profile === 2) {
    return [
      buildEndpoint({ edition: "java", index, slug }),
      buildEndpoint({ edition: "bedrock", index, slug }),
    ];
  }
  return [buildEndpoint({ edition: "java", index, slug })];
}

function buildServer(blueprint, index) {
  const slug = slugify(blueprint.name);
  const createdAt = new Date(Date.UTC(2026, 6, 1 + index, 9 + (index % 8))).toISOString();
  const verifiedAt = new Date(new Date(createdAt).getTime() + 2 * 60 * 60 * 1_000).toISOString();
  const accessType = index % 5 === 0 ? "whitelist" : "open";
  const accountMode = index % 3 === 0 ? "premium_and_non_premium" : "premium_only";

  return {
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: blueprint.name,
    slug,
    description: blueprint.description,
    websiteUrl: `https://${slug}.example`,
    storeUrl: index % 4 === 0 ? `https://store.${slug}.example` : null,
    discordUrl: `https://discord.example/${slug}`,
    country: blueprint.country ?? countryCodes[index % countryCodes.length],
    accessType,
    accessFormUrl: accessType === "whitelist" ? `https://apply.${slug}.example` : null,
    accountMode,
    authMode: accountMode === "premium_only" ? "direct" : index % 2 === 0 ? "password_non_premium" : "password_all",
    publicationStatus: "published",
    verificationStatus: "verified",
    verifiedAt,
    createdAt,
    gameModes: blueprint.gameModes ?? modeSets[index % modeSets.length],
    endpoints: buildEndpoints(index, slug),
    media: blueprint.media,
    review: index % 5 === 4
      ? null
      : {
          rating: 3 + (index % 3),
          content: `La comunidad de ${blueprint.name} ofrece una experiencia cuidada y fácil de recomendar.`,
        },
  };
}

export const seedServers = blueprints.map(buildServer);
