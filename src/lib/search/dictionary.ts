/**
 * The free tier of the search pipeline: the terms we already know how to translate into catalog
 * filters, without spending a Jev call on them.
 *
 * Every alias points at a value that already exists in a closed catalog — a mode slug from
 * `game-modes.ts` or a country code from `countries.ts` — so this file can never invent a filter
 * the database cannot answer. It earns its keep on the queries visitors actually type: a couple of
 * words naming a mode and a country resolve here, the request stays a plain SQL query, and Jev is
 * asked only about the words nobody anticipated.
 *
 * Adding an alias is deliberately a code change, like adding a mode: the dictionary is part of the
 * product vocabulary, not user data.
 */

import { MAX_SERVER_GAME_MODES, gameModes } from "@/lib/servers/game-modes";
import { serverCountries } from "@/lib/servers/countries";
import { normalizeSearchQuery, searchQueryTokens } from "./normalize";

export type DictionaryResolution = {
  /** Mode slugs, in catalog order, capped at what a single server may advertise. */
  modes: string[];
  country?: string;
  /** Words that mean something to the visitor and nothing to us yet — the reason to ask Jev. */
  unresolved: string[];
};

/**
 * Words that carry no filter meaning: articles, prepositions, the verbs people open a search with,
 * and the nouns for the thing being searched. They are dropped rather than left unresolved, so
 * "quiero un servidor de survival" spends nothing on inference.
 *
 * `mejor`/`mejores`/`top` belong here too: the catalog already orders by rating by default, so
 * they ask for the behaviour the visitor is getting anyway. Adjectives we cannot honour — "activo",
 * "gratis", "sin lag" — are deliberately absent: they are real intent, and leaving them unresolved
 * is what gives Jev the chance to say something useful about them.
 */
const stopWords = new Set([
  "a", "al", "algun", "alguno", "buen", "buena", "buenas", "bueno", "buenos", "busco", "buscar",
  "como", "con", "cual", "cuales", "dame", "de", "del", "do", "donde", "el", "en", "encontrar",
  "ensename", "es", "hay", "juego", "jugar", "juegos", "la", "las", "los", "mc", "me", "mejor",
  "mejores", "minecraft", "modalidad", "modalidades", "modo", "modos", "muestrame", "ni", "o",
  "pa", "para", "pais", "paises", "por", "que", "quiero", "recomienda", "recomiendame", "serv",
  "server", "servers", "servidor", "servidores", "sobre", "son", "top", "un", "una", "unas",
  "unos", "ve", "y",
]);

/**
 * The words above that are also two-letter country codes ("es", "ni", "ve", "pa", "do") are listed
 * as stop words on purpose. The alias lookup runs first, so a code introduced as a country still
 * resolves; what the stop-word entry buys is that the leftover verb in "cual es el mejor servidor
 * de survival" is discarded instead of counting as an unanswered term and paying for a Jev call.
 */

/**
 * Words that can legitimately introduce a country right after them. They are the licence a
 * two-letter ISO code needs to be read as a country at all (see {@link ambiguousShortCode}).
 */
const countryLocators = new Set(["de", "del", "desde", "en", "pais", "para"]);

/** Aliases per mode slug. The slug and its label are added automatically. */
const modeAliases: Record<string, readonly string[]> = {
  survival: ["supervivencia", "sobrevivir", "surv"],
  smp: ["survival multiplayer"],
  skyblock: ["sky block", "islas flotantes"],
  creativo: ["creative", "construir", "construccion", "plots", "parcelas"],
  minijuegos: ["minijuego", "mini juegos", "minigames", "minigame", "mini games"],
  pvp: ["combate", "pelear", "luchar"],
  factions: ["faction", "faccion", "facciones", "clanes"],
  towny: ["towns", "pueblos", "pueblo", "naciones", "nacion"],
  prison: ["prision", "prisiones", "carcel"],
  roleplay: ["rol", "rp", "role play", "interpretacion"],
  economia: ["economy", "economico", "tiendas", "tienda", "mercado", "subastas"],
  anarquia: ["anarchy", "anarquico", "sin reglas"],
  hardcore: ["hard core", "una vida"],
  modded: ["mods", "mod", "modpack", "modpacks", "forge", "fabric", "moddeado"],
  vanilla: ["sin plugins", "sin mods"],
  bedwars: ["bed wars", "camas"],
  skywars: ["sky wars"],
  parkour: ["parcour", "saltos"],
  lifesteal: ["life steal", "robar corazones", "corazones"],
  oneblock: ["one block", "un bloque"],
  kitpvp: ["kit pvp", "kits"],
  uhc: ["ultra hardcore"],
  earth: ["earthmc", "tierra", "geopolitica", "mapa mundial"],
  mmorpg: ["mmo", "rpg"],
  aventura: ["adventure", "aventuras", "mapas de aventura", "narrativo"],
  tecnico: ["technical", "redstone", "granjas", "automatizacion", "tech"],
  pixelmon: ["pokemon", "cobblemon"],
  murder: ["murder mystery", "asesino", "asesinos"],
  speedrun: ["speed run", "speedrunning"],
  eventos: ["evento", "torneo", "torneos"],
};

/** Aliases per country code. The code and its label are added automatically. */
const countryAliases: Record<string, readonly string[]> = {
  es: ["spain", "esp", "espanol", "espanola", "espanoles", "iberico"],
  mx: ["mexicano", "mexicana", "mexicanos", "mejico"],
  ar: ["argentino", "argentinos", "arg"],
  cl: ["chileno", "chilena", "chilenos"],
  co: ["colombiano", "colombiana", "colombianos", "col"],
  pe: ["peruano", "peruana", "peruanos"],
  ve: ["venezolano", "venezolana", "venezolanos", "vzla"],
  ec: ["ecuatoriano", "ecuatoriana"],
  uy: ["uruguayo", "uruguaya"],
  bo: ["boliviano", "boliviana"],
  py: ["paraguayo", "paraguaya"],
  cr: ["costa rica", "costarricense"],
  pa: ["panameno", "panamena"],
  do: ["republica dominicana", "rep dominicana", "dominicana", "dominicano", "rd"],
  gt: ["guatemalteco", "guatemalteca", "guate"],
  hn: ["hondureno", "hondurena"],
  sv: ["el salvador", "salvador", "salvadoreno", "salvadorena"],
  ni: ["nicaraguense", "nica"],
  pr: ["puerto rico", "puertorriqueno", "puertorriquena", "boricua"],
  us: ["estados unidos", "usa", "eeuu", "estadounidense", "united states"],
  global: ["internacional", "international", "mundial", "worldwide", "cualquier pais", "todos los paises"],
};

type AliasTarget = { kind: "mode"; value: string } | { kind: "country"; value: string };

/** Alias phrases are folded through the same normalizer as the query so both sides always agree. */
function aliasKey(phrase: string) {
  return searchQueryTokens(normalizeSearchQuery(phrase)).join(" ");
}

function buildAliasIndex() {
  const index = new Map<string, AliasTarget>();
  let longestPhrase = 1;

  const register = (phrase: string, target: AliasTarget) => {
    const key = aliasKey(phrase);
    if (!key) return;
    // First registration wins, which keeps the tables above readable: a phrase listed under two
    // catalogs is a bug to fix in the data, not something to resolve at runtime.
    if (!index.has(key)) index.set(key, target);
    longestPhrase = Math.max(longestPhrase, key.split(" ").length);
  };

  for (const mode of gameModes) {
    register(mode.slug, { kind: "mode", value: mode.slug });
    register(mode.label, { kind: "mode", value: mode.slug });
    for (const alias of modeAliases[mode.slug] ?? []) register(alias, { kind: "mode", value: mode.slug });
  }

  for (const country of serverCountries) {
    register(country.code, { kind: "country", value: country.code });
    register(country.label, { kind: "country", value: country.code });
    for (const alias of countryAliases[country.code] ?? []) register(alias, { kind: "country", value: country.code });
  }

  return { index, longestPhrase };
}

const { index: aliasIndex, longestPhrase: longestAliasPhrase } = buildAliasIndex();

/**
 * Two-letter country codes double as everyday Spanish words: "es", "ni", "ve", "do", "pa", "co".
 * Read literally, "cual es el mejor servidor" would come out filtered to Spain. So a bare code
 * only counts as a country when something introduces it as one — "servidores en es" — or when the
 * query is short enough that there is nothing else it could be. Mode abbreviations ("rp", "pvp")
 * collide with nothing, so they are exempt.
 */
function ambiguousShortCode(phrase: string, target: AliasTarget) {
  return target.kind === "country" && phrase.length <= 2;
}

export function resolveFromDictionary(query: string): DictionaryResolution {
  const tokens = searchQueryTokens(normalizeSearchQuery(query));
  const modes = new Set<string>();
  const unresolved: string[] = [];
  let country: string | undefined;

  for (let position = 0; position < tokens.length; ) {
    const remaining = tokens.length - position;
    let matched = false;

    // Longest phrase first, so "costa rica" is a country rather than an unresolved "costa" plus a
    // second unresolved "rica".
    for (let length = Math.min(longestAliasPhrase, remaining); length >= 1 && !matched; length -= 1) {
      const phrase = tokens.slice(position, position + length).join(" ");
      const target = aliasIndex.get(phrase);
      if (!target) continue;
      if (ambiguousShortCode(phrase, target) && !(tokens.length <= 2 || countryLocators.has(tokens[position - 1] ?? ""))) continue;

      if (target.kind === "mode") {
        modes.add(target.value);
      } else if (country === undefined) {
        country = target.value;
      } else if (country !== target.value) {
        // "servidores de espana y mexico" asks for something a single-valued facet cannot express.
        // The first country stands and the second becomes a question for Jev, rather than being
        // dropped behind the visitor's back.
        unresolved.push(phrase);
      }

      position += length;
      matched = true;
    }

    if (matched) continue;

    const token = tokens[position];
    if (!stopWords.has(token) && !unresolved.includes(token)) unresolved.push(token);
    position += 1;
  }

  return {
    // Catalog order, so two queries naming the same modes produce the same URL.
    modes: gameModes.filter((mode) => modes.has(mode.slug)).map((mode) => mode.slug).slice(0, MAX_SERVER_GAME_MODES),
    country,
    unresolved,
  };
}

/** Everything the visitor asked for is already a filter, so there is nothing left to infer. */
export function isFullyResolved(resolution: DictionaryResolution) {
  return resolution.unresolved.length === 0 && (resolution.modes.length > 0 || resolution.country !== undefined);
}
