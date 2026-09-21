/**
 * The only place the TypeSafe SDK is touched.
 *
 * Jev does not write our filters: it is handed the visitor's query plus the two closed catalogs
 * the catalog can actually filter by, and it answers with one value from each and a confidence.
 * Everything it returns is checked back against `game-modes.ts` and `countries.ts` before it
 * leaves this file, so a model that answered with something inventive still cannot produce a
 * filter the database has never heard of.
 *
 * The four questions are independent judgements over the same state, so they travel as one
 * request and are answered in parallel — see the TypeSafe guidance on composing questions.
 *
 * This function never throws. A timeout, a 429, an overloaded service or a malformed answer all
 * come back as `null`, which the pipeline reads as "fall back to the keyword search".
 */

import { TypeSafeClient, choice, noul } from "@typesafe-ai/sdk";
import type { SystemOneResult } from "@typesafe-ai/sdk";

import { isGameModeSlug, gameModes } from "@/lib/servers/game-modes";
import { isServerCountryCode, serverCountries } from "@/lib/servers/countries";

/**
 * The "nothing matches" options. A closed question needs a way to say "the query mentions no
 * modality at all", or the model has to pick one of thirty anyway. The values are deliberately
 * unlike any slug or country code, and a test holds that apart.
 */
export const NO_MODE_OPTION = "sin-modalidad";
export const NO_COUNTRY_OPTION = "sin-pais";

/** What the pipeline gets back: values already known to the catalogs, each with its confidence. */
export type JevReading = {
  model: string;
  modes: Array<{ slug: string; confidence: number }>;
  country: { code: string; confidence: number } | null;
  /**
   * Probability that the visitor is naming a specific server, brand or address instead of
   * describing how they want to play. High means the keyword search still has work to do.
   */
  nameSearchProbability: number;
};

/** The seam the pipeline and its tests talk to. Resolves to `null` whenever Jev cannot answer. */
export type JevAsk = (query: string) => Promise<JevReading | null>;

function modeCriteria() {
  const criteria: Record<string, string> = {};
  for (const mode of gameModes) criteria[mode.slug] = `${mode.label}: ${mode.description}`;
  criteria[NO_MODE_OPTION] = "La consulta no menciona ninguna de las modalidades anteriores.";
  return criteria;
}

function countryCriteria() {
  const criteria: Record<string, string> = {};
  for (const country of serverCountries) {
    criteria[country.code] = country.code === "global"
      ? "La consulta no pide un país concreto: busca comunidades internacionales o de cualquier país."
      : `La consulta busca comunidades de ${country.label}.`;
  }
  criteria[NO_COUNTRY_OPTION] = "La consulta no menciona ningún país, región ni nacionalidad.";
  return criteria;
}

/**
 * Both modality questions share one catalog, and the second one exists because a query can name
 * two ways of playing ("survival con economía"). A second Choice costs a few tokens; one Noul per
 * modality would cost thirty questions.
 */
const searchQuestions = {
  modalidad_principal: choice(
    "¿Qué modalidad de juego pide la consulta? Elige la que mejor describa cómo quiere jugar la persona.",
    modeCriteria(),
  ),
  modalidad_secundaria: choice(
    "Si la consulta pide más de una modalidad, ¿cuál es la segunda? Elige «sin-modalidad» si solo pide una o ninguna.",
    modeCriteria(),
  ),
  pais: choice(
    "¿De qué país o región pide servidores la consulta? Fíjate en el país de la comunidad, no en dónde esté alojada la máquina.",
    countryCriteria(),
  ),
  busca_por_nombre: noul(
    "La consulta nombra un servidor, una marca o una dirección concretos (por ejemplo «hypixel» o «mc.ejemplo.net») en vez de describir cómo quiere jugar la persona.",
  ),
};

export type SearchQuestions = typeof searchQuestions;
export type SearchAnswers = SystemOneResult<SearchQuestions>;

/** The state Jev judges: the query, plus the context that makes the query legible. */
function searchState(query: string) {
  return {
    contexto: "Consulta escrita en el buscador de un directorio de servidores de Minecraft en español.",
    consulta: query,
  };
}

/** The minimum of the SDK client this file uses, so a test can stand in for it. */
export type SystemOneCaller = {
  systemOne: (
    request: { state: unknown; questions: SearchQuestions },
    options?: { timeout?: number; signal?: AbortSignal; retry?: { maxRetries?: number } },
  ) => Promise<SearchAnswers>;
};

export function createJevClient({ apiKey, timeoutMs }: { apiKey: string; timeoutMs: number }) {
  // Retries are off at the client too: this call sits in front of a visitor waiting for results,
  // and a second attempt would spend the whole latency budget the first one already used.
  return new TypeSafeClient({ apiKey, timeout: timeoutMs, retry: { maxRetries: 0 }, logLevel: "warn" }) as unknown as SystemOneCaller;
}

function choiceValue(answer: { choice: string; confidence: number } | undefined) {
  if (!answer || typeof answer.choice !== "string" || typeof answer.confidence !== "number") return null;
  if (!Number.isFinite(answer.confidence)) return null;
  return { value: answer.choice, confidence: Math.min(Math.max(answer.confidence, 0), 1) };
}

export function readAnswers(answers: SearchAnswers): JevReading {
  const primary = choiceValue(answers.answers.modalidad_principal);
  const secondary = choiceValue(answers.answers.modalidad_secundaria);
  const country = choiceValue(answers.answers.pais);
  const nameSearch = answers.answers.busca_por_nombre?.noul;

  const modes: JevReading["modes"] = [];
  for (const candidate of [primary, secondary]) {
    if (!candidate || !isGameModeSlug(candidate.value)) continue;
    if (modes.some((mode) => mode.slug === candidate.value)) continue;
    modes.push({ slug: candidate.value, confidence: candidate.confidence });
  }

  return {
    model: answers.model,
    modes,
    country: country && isServerCountryCode(country.value) ? { code: country.value, confidence: country.confidence } : null,
    nameSearchProbability: typeof nameSearch === "number" && Number.isFinite(nameSearch) ? Math.min(Math.max(nameSearch, 0), 1) : 0,
  };
}

export type JevAskOptions = {
  client: SystemOneCaller;
  timeoutMs: number;
  /** Called with every answered reading, for calibrating the confidence bands on real queries. */
  onReading?: (query: string, reading: JevReading) => void;
  onFailure?: (query: string, error: unknown) => void;
};

export function createJevAsk({ client, timeoutMs, onReading, onFailure }: JevAskOptions): JevAsk {
  return async (query: string) => {
    try {
      const answers = await client.systemOne(
        { state: searchState(query), questions: searchQuestions },
        // `timeout` is per attempt and the SDK keeps no total budget, so the signal is what
        // guarantees the visitor waits no longer than this even if a retry ever slips back in.
        { timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs), retry: { maxRetries: 0 } },
      );
      const reading = readAnswers(answers);
      onReading?.(query, reading);
      return reading;
    } catch (error) {
      onFailure?.(query, error);
      return null;
    }
  };
}
