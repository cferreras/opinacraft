/**
 * The catalog vocabulary for "how do you play here".
 *
 * This list is deliberately closed and lives in code: free-text tags let four spellings of
 * "survival" coexist until a moderator merged them by hand, and the filter bar needs a plain
 * `<select>` whose options are known before the first server exists. Adding a mode is a code
 * change, which is the point — the list only grows when we decide it should.
 *
 * `group` splits the picker into the handful of modes most servers advertise and the long tail
 * of formats that only a few communities run. Slugs are the public URL contract (`?mode=`), so
 * rename a `label` freely but never a `slug`.
 */
export type GameModeGroup = "popular" | "niche";

export type GameMode = {
  slug: string;
  label: string;
  group: GameModeGroup;
  description: string;
};

export const MAX_SERVER_GAME_MODES = 3;

export const gameModes: readonly GameMode[] = [
  { slug: "survival", label: "Survival", group: "popular", description: "Supervivencia clásica con recursos y construcción libre." },
  { slug: "smp", label: "SMP", group: "popular", description: "Supervivencia en comunidad, con reglas y confianza entre jugadores." },
  { slug: "skyblock", label: "Skyblock", group: "popular", description: "Islas flotantes que se amplían a base de recursos limitados." },
  { slug: "creativo", label: "Creativo", group: "popular", description: "Bloques infinitos y parcelas para construir sin límites." },
  { slug: "minijuegos", label: "Minijuegos", group: "popular", description: "Varias partidas cortas dentro de una misma red." },
  { slug: "pvp", label: "PvP", group: "popular", description: "El combate entre jugadores es el centro de la experiencia." },
  { slug: "factions", label: "Factions", group: "popular", description: "Clanes que reclaman terreno, asaltan bases y compiten." },
  { slug: "towny", label: "Towny", group: "popular", description: "Pueblos y naciones con terrenos protegidos y política interna." },
  { slug: "prison", label: "Prison", group: "popular", description: "Progresión por rangos picando y vendiendo minerales." },
  { slug: "roleplay", label: "Roleplay", group: "popular", description: "Los jugadores interpretan personajes dentro de una historia." },
  { slug: "economia", label: "Economía", group: "popular", description: "Tiendas, subastas y mercado entre jugadores." },
  { slug: "anarquia", label: "Anarquía", group: "popular", description: "Sin reglas ni protecciones: todo vale." },
  { slug: "hardcore", label: "Hardcore", group: "popular", description: "Una sola vida: al morir se pierde el progreso o el acceso." },
  { slug: "modded", label: "Modded", group: "popular", description: "Requiere un pack de mods para conectar." },
  { slug: "vanilla", label: "Vanilla", group: "popular", description: "Minecraft tal cual, sin plugins que cambien el juego." },
  { slug: "bedwars", label: "BedWars", group: "popular", description: "Equipos que defienden su cama y destruyen las rivales." },
  { slug: "skywars", label: "SkyWars", group: "popular", description: "Combate rápido entre islas hasta que queda uno." },
  { slug: "parkour", label: "Parkour", group: "popular", description: "Circuitos de saltos y precisión contra el reloj." },

  { slug: "lifesteal", label: "Lifesteal", group: "niche", description: "Matar roba corazones a la víctima." },
  { slug: "oneblock", label: "OneBlock", group: "niche", description: "Todo el mundo nace de un único bloque que se regenera." },
  { slug: "kitpvp", label: "KitPvP", group: "niche", description: "Arenas con equipamiento predefinido y respawn inmediato." },
  { slug: "uhc", label: "UHC", group: "niche", description: "Supervivencia sin regeneración natural, por temporadas." },
  { slug: "earth", label: "Earth", group: "niche", description: "Mapa a escala del mundo real con naciones y geopolítica." },
  { slug: "mmorpg", label: "MMORPG", group: "niche", description: "Clases, niveles, misiones y mazmorras con jefes." },
  { slug: "aventura", label: "Aventura", group: "niche", description: "Mapas narrativos y mazmorras diseñadas para recorrer." },
  { slug: "tecnico", label: "Técnico", group: "niche", description: "Redstone, granjas y automatización como objetivo." },
  { slug: "pixelmon", label: "Pixelmon", group: "niche", description: "Captura y combate de criaturas al estilo Pokémon." },
  { slug: "murder", label: "Murder Mystery", group: "niche", description: "Un asesino oculto entre jugadores que deben descubrirlo." },
  { slug: "speedrun", label: "Speedrun", group: "niche", description: "Carreras por terminar el juego en el menor tiempo." },
  { slug: "eventos", label: "Eventos", group: "niche", description: "Temporadas y torneos puntuales con inscripción." },
] as const;

const gameModesBySlug = new Map(gameModes.map((mode) => [mode.slug, mode]));

export const popularGameModes = gameModes.filter((mode) => mode.group === "popular");
export const nicheGameModes = gameModes.filter((mode) => mode.group === "niche");

export function isGameModeSlug(value: string | undefined): value is string {
  return value !== undefined && gameModesBySlug.has(value);
}

export function findGameMode(slug: string) {
  return gameModesBySlug.get(slug) ?? null;
}

export function gameModeLabel(slug: string) {
  return gameModesBySlug.get(slug)?.label ?? slug;
}

/** The catalog filters by a single mode, so anything unknown falls back to "no filter". */
export function parseGameModeParam(value: string | undefined) {
  const slug = value?.trim().toLowerCase();
  return isGameModeSlug(slug) ? slug : undefined;
}

/**
 * Form input: unknown slugs are dropped rather than rejected so a stale open tab cannot block a
 * save, and the order of {@link gameModes} wins so two servers with the same modes list them alike.
 */
export function normalizeGameModeInputs(input: readonly string[] | undefined) {
  const selected = new Set((input ?? []).map((value) => value.trim().toLowerCase()).filter((value) => gameModesBySlug.has(value)));
  return gameModes.filter((mode) => selected.has(mode.slug)).slice(0, MAX_SERVER_GAME_MODES).map((mode) => mode.slug);
}
