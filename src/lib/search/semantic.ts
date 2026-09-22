/**
 * Judging every server in the catalog against one query.
 *
 * This is the answer to the queries the facet pipeline cannot express. "Pocos miembros" is not a
 * mode, a country, an access type or an edition, and no amount of vocabulary will make it one —
 * it is a question about what a particular server *is like*, which only something that has read
 * that server can answer. So each server gets a Noul: the probability that it is what the visitor
 * asked for. The number is the answer; a Noul has no separate confidence.
 *
 * **There is no lexical shortlist, and that is the point.** Picking candidates with `ilike` or
 * trigram similarity before asking would be circular: it would use the weakest signal available to
 * decide which servers the strongest signal is allowed to see, and on exactly the queries this
 * exists to fix ("pocos miembros" against "comunidad pequeña") it returns nothing at all. What may
 * narrow the field is a constraint the visitor actually wrote: the caller passes only the servers
 * that satisfy what the dictionary matched literally, which is a restriction rather than a guess.
 *
 * One server per request, measured rather than assumed — batching turned out to change the answers
 * rather than merely speed them up, for the reason spelled out on {@link DEFAULT_BATCH_SIZE}. The
 * batch machinery stays because the size is a parameter, and each question addresses its own server
 * by the backticked state path TypeSafe documents for nested references.
 *
 * Nothing here throws. A batch that times out, is refused or comes back malformed is a batch whose
 * servers have no score, and the search is answered with the ones that did — a shorter list of real
 * results beats an error about inference.
 */

import { noul } from "@typesafe-ai/sdk";

import type { IdentifiedServerProfile } from "@/lib/servers/server-profiles";

/**
 * One server per request, which was measured rather than assumed.
 *
 * Batching is cheaper and faster — fifteen to a request cut tokens and wall time by roughly four —
 * but it changes the answers: with several servers in one state the model judges them against each
 * other, so a server's score depends on which servers it travelled with. Measured on the local seed,
 * "pocos miembros" put eight servers above 0.5 in batches of fifteen and none at all one at a time,
 * and the two configurations agreed on only two of their top five.
 *
 * That is fatal for the score cache, not merely untidy: if batch membership decides the score, then
 * adding one server reshuffles the batches and invalidates all three hundred scores, which is exactly
 * what the cache exists to prevent. One server per request keeps the property TypeSafe documents —
 * Noul values comparable across requests — and with it a threshold that means one thing and a cached
 * score that stays true.
 *
 * It remains a parameter, so speed can be bought back later at that price, deliberately.
 */
export const DEFAULT_BATCH_SIZE = 1;
/**
 * Measured at 25 and 50 with sixty requests each: no 429, no failures, median latency unchanged at
 * ~320ms. Three hundred servers land in about five seconds. Set below the highest tested value
 * because nothing documents a ceiling, and the first sign of one is a refused search.
 */
export const DEFAULT_CONCURRENCY = 32;

/**
 * At or above this, a server is shown. Lower than the 0.9 the facet pipeline applies, and
 * deliberately: there, acting wrongly means filtering a catalog down to the wrong slice, while
 * here it means one mildly irrelevant server further down a list. TypeSafe's guidance is to raise
 * a threshold when a false positive is expensive, and this one is cheap.
 */
export const DEFAULT_SHOW_THRESHOLD = 0.5;

/**
 * How many servers to show when nothing clears the threshold.
 *
 * Judging one server at a time has no comparative frame, so a terse query gets conservative
 * numbers: measured on the seed, "comunidad pequeña y tranquila" put eleven servers above 0.5 while
 * "pocos miembros" — the same request, fewer words — peaked at 0.44 and would have shown nothing.
 *
 * An empty page is the worst possible answer when a usable ranking exists, so the best few are shown
 * and the interface says they are approximate. The ordering is the part worth trusting; the absolute
 * number is what varies with how much the visitor wrote.
 */
export const APPROXIMATE_RESULT_COUNT = 6;

export type ServerScore = {
  serverId: string;
  /** Probability that this server is what the visitor asked for, 0 to 1. */
  score: number;
  profileHash: string;
};

/**
 * Resolves to `null` when the batch could not be judged at all. The model travels with the scores
 * because the cache records it: a ranking that changed because the model changed is a different
 * thing from one that changed because a threshold was retuned, and only the stored model tells them
 * apart afterwards.
 */
export type SemanticScorer = (
  query: string,
  batch: readonly IdentifiedServerProfile[],
) => Promise<{ scores: ServerScore[]; model: string } | null>;

/** The state one request judges: the query once, and the servers it is judged against. */
function batchState(query: string, batch: readonly IdentifiedServerProfile[]) {
  return {
    contexto: "Buscador de un directorio de servidores de Minecraft en español. La persona describe el servidor que quiere encontrar.",
    consulta: query,
    servidores: batch.map((entry) => entry.profile),
  };
}

/**
 * One question per server, each pointing at its own element of the state.
 *
 * The instructions name the path rather than the server, so the question cannot be answered by
 * remembering a name from a neighbouring entry, and the criteria spell out the failure mode worth
 * guarding: a server that is merely *in the same category* is not a server that matches.
 */
function batchQuestions(batch: readonly IdentifiedServerProfile[]) {
  const questions: Record<string, ReturnType<typeof noul>> = {};

  batch.forEach((_entry, index) => {
    questions[`s${index}`] = noul(
      `El servidor descrito en \`servidores[${index}]\` es lo que busca la persona que escribió \`consulta\`.`,
      {
        true: "El servidor cumple lo que la consulta pide, incluyendo lo que se describe con palabras que no son categorías (el ambiente, el tamaño de la comunidad, el tipo de gente, la forma de jugar).",
        false: "El servidor no cumple algo que la consulta pide, o solo coincide en la categoría general sin cumplir lo que de verdad se pedía.",
      },
    );
  });

  return questions;
}

/** The minimum of the SDK this file uses, so a test can stand in for it. */
export type SemanticCaller = {
  systemOne: (
    request: { state: unknown; questions: Record<string, unknown> },
    options?: { timeout?: number; signal?: AbortSignal; retry?: { maxRetries?: number } },
  ) => Promise<{ model: string; answers: Record<string, { noul?: number } | undefined> }>;
};

export type SemanticScorerOptions = {
  client: SemanticCaller;
  timeoutMs: number;
  onBatch?: (query: string, scores: ServerScore[], model: string) => void;
  onFailure?: (query: string, error: unknown) => void;
};

function readNoul(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(Math.max(value, 0), 1);
}

export function createSemanticScorer({ client, timeoutMs, onBatch, onFailure }: SemanticScorerOptions): SemanticScorer {
  return async (query, batch) => {
    if (batch.length === 0) return { scores: [], model: "" };

    try {
      const answers = await client.systemOne(
        { state: batchState(query, batch), questions: batchQuestions(batch) },
        { timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs), retry: { maxRetries: 0 } },
      );

      const scores: ServerScore[] = [];
      batch.forEach((entry, index) => {
        const score = readNoul(answers.answers[`s${index}`]?.noul);
        // A missing answer is one server without a score, not a failed batch: the others are still
        // real judgements about real servers.
        if (score === null) return;
        scores.push({ serverId: entry.serverId, score, profileHash: entry.profileHash });
      });

      onBatch?.(query, scores, answers.model);
      return { scores, model: answers.model };
    } catch (error) {
      onFailure?.(query, error);
      return null;
    }
  };
}

export function batched<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  const step = Math.max(1, Math.floor(size));
  for (let index = 0; index < items.length; index += step) batches.push(items.slice(index, index + step));
  return batches;
}

/**
 * Runs the batches with a bounded number in flight, and keeps going when one fails.
 *
 * A worker pool rather than `Promise.all` over everything: three hundred servers is twenty
 * requests, and firing twenty at once is how a search earns a 429 that costs more than the
 * concurrency saved.
 */
async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<R>,
  isPastDeadline: () => boolean,
): Promise<{ results: R[]; ranOut: boolean }> {
  const results: R[] = [];
  let next = 0;
  let ranOut = false;

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      // Checked before picking up work rather than by racing a timer: abandoning a request already
      // in flight would pay for an answer and then throw it away.
      if (isPastDeadline()) {
        ranOut = true;
        return;
      }
      const index = next++;
      if (index >= items.length) return;
      results.push(await run(items[index]));
    }
  });

  await Promise.all(workers);
  return { results, ranOut };
}

export type ScoreCatalogOptions = {
  scorer: SemanticScorer;
  batchSize?: number;
  concurrency?: number;
  /** Scores already known for this query, by server id, that need not be asked about again. */
  cached?: readonly ServerScore[];
  /**
   * How long the whole scoring may take, after which no further servers are asked about and the
   * ranking is built from what came back. A visitor waiting on a search is the reason this exists:
   * a partial ranking in three seconds beats a complete one in thirty.
   */
  deadlineMs?: number;
  now?: () => number;
};

export type ScoredCatalog = {
  scores: ServerScore[];
  /** Scores produced by this run, which is what a cache should be asked to remember. */
  fresh: ServerScore[];
  /** True when a batch failed or the deadline cut the run short, so the ranking is incomplete. */
  partial: boolean;
  /** The model that produced `fresh`, for the cache to record. Empty when nothing was judged. */
  model: string;
};

/**
 * Scores a whole set of profiles, asking only about the ones whose score is not already known and
 * still current. With a bounded catalog this is what makes the feature affordable: a repeated query
 * costs nothing, and a server whose description was edited costs one request rather than three
 * hundred.
 */
export async function scoreCatalog(
  query: string,
  profiles: readonly IdentifiedServerProfile[],
  { scorer, batchSize = DEFAULT_BATCH_SIZE, concurrency = DEFAULT_CONCURRENCY, cached = [], deadlineMs, now = () => Date.now() }: ScoreCatalogOptions,
): Promise<ScoredCatalog> {
  const current = new Map(cached.map((score) => [score.serverId, score]));
  const reusable: ServerScore[] = [];
  const pending: IdentifiedServerProfile[] = [];

  for (const entry of profiles) {
    const known = current.get(entry.serverId);
    // A cached score belongs to the profile it was given. A changed profile is a changed question.
    if (known && known.profileHash === entry.profileHash) reusable.push(known);
    else pending.push(entry);
  }

  const startedAt = now();
  const isPastDeadline = deadlineMs === undefined ? () => false : () => now() - startedAt >= deadlineMs;

  const batches = batched(pending, batchSize);
  const { results: answered, ranOut } = await runPool(batches, concurrency, (batch) => scorer(query, batch), isPastDeadline);

  const fresh: ServerScore[] = [];
  let partial = ranOut;
  let model = "";
  for (const result of answered) {
    if (result === null) partial = true;
    else {
      fresh.push(...result.scores);
      if (result.model) model = result.model;
    }
  }

  return { scores: [...reusable, ...fresh], fresh, partial, model };
}

export type Ranking = {
  scores: ServerScore[];
  /** True when nothing cleared the threshold and these are the best of a weak field. */
  approximate: boolean;
};

/** Best first, ties broken by id so one query is one order however the scores arrived. */
function byScore(scores: readonly ServerScore[]) {
  return [...scores].sort((a, b) => b.score - a.score || a.serverId.localeCompare(b.serverId));
}

/**
 * What the catalog should show. Above the threshold when anything is, and otherwise the best few
 * marked as approximate — see {@link APPROXIMATE_RESULT_COUNT} for why an empty page is not an
 * acceptable answer to a query we did manage to rank.
 */
export function rankScores(
  scores: readonly ServerScore[],
  threshold = DEFAULT_SHOW_THRESHOLD,
  approximateCount = APPROXIMATE_RESULT_COUNT,
): Ranking {
  const ordered = byScore(scores);
  const confident = ordered.filter((entry) => entry.score >= threshold);
  if (confident.length > 0) return { scores: confident, approximate: false };

  // A score of zero is a judgement that the server does not match, not a weak match: showing it
  // would be inventing a result rather than admitting there is none.
  const plausible = ordered.filter((entry) => entry.score > 0);
  return { scores: plausible.slice(0, Math.max(0, approximateCount)), approximate: plausible.length > 0 };
}
