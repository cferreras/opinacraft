/**
 * Phase 0 of the semantic search plan: measure what the undocumented parts actually cost.
 *
 * Written as a throwaway and kept on purpose: the numbers are recorded in
 * docs/natural-language-search.md, but the show threshold still has to be recalibrated against the
 * real catalog. Fifty-six of the sixty seed servers have template-generated descriptions, so what
 * this measured about cost, latency and concurrency is solid and what it measured about ranking
 * quality is not.
 *
 * It talks to TypeSafe directly rather than through the route, so it needs no Turnstile session, no
 * database and no dev server — only TYPESAFE_API_KEY.
 *
 * Three things are being measured, because the plan rests on all three and none is documented:
 *
 *   1. Batch size. Does judging 15 servers in one request give the same ranking as judging them
 *      one at a time? If not, batching is off the table and latency has to come from concurrency.
 *   2. Concurrency. How many requests can be in flight before 429s start.
 *   3. Price. The only figure available is derived from one cookbook's totals; this reports the
 *      real token counts for this state shape.
 *
 * Usage:  node --env-file=.env.local scripts/measure-semantic-search.mjs
 */

import { TypeSafeClient, noul } from "@typesafe-ai/sdk";

import { seedServers } from "./seed-local-data.mjs";

const API_KEY = process.env.TYPESAFE_API_KEY;
if (!API_KEY) {
  console.error("TYPESAFE_API_KEY is not set. Run with: node --env-file=.env.local scripts/measure-semantic-search.mjs");
  process.exit(1);
}

/** The five roads the plan says a query can take, one query each. */
const QUERIES = [
  { text: "español", expect: "dictionary: never reaches Jev at all" },
  { text: "redstone republic", expect: "names a server: keyword search" },
  { text: "survival tranquilo", expect: "mixed: mode found AND needs judging" },
  { text: "servidores de chill en latam con pocos jugadores", expect: "latam restricts, the rest is judged" },
  { text: "pocos miembros", expect: "pure semantic: no facet at all" },
];

const MODE_LABELS = {
  survival: "Survival", smp: "SMP", skyblock: "Skyblock", creativo: "Creativo", minijuegos: "Minijuegos",
  pvp: "PvP", factions: "Factions", towny: "Towny", prison: "Prison", roleplay: "Roleplay",
  economia: "Economía", anarquia: "Anarquía", hardcore: "Hardcore", modded: "Modded", vanilla: "Vanilla",
  bedwars: "BedWars", skywars: "SkyWars", parkour: "Parkour", lifesteal: "Lifesteal", oneblock: "OneBlock",
  kitpvp: "KitPvP", uhc: "UHC", earth: "Earth", mmorpg: "MMORPG", aventura: "Aventura", tecnico: "Técnico",
  pixelmon: "Pixelmon", murder: "Murder Mystery", speedrun: "Speedrun", eventos: "Eventos",
};
const COUNTRY_LABELS = {
  es: "España", mx: "México", ar: "Argentina", cl: "Chile", co: "Colombia", pe: "Perú", ve: "Venezuela",
  ec: "Ecuador", uy: "Uruguay", bo: "Bolivia", py: "Paraguay", cr: "Costa Rica", pa: "Panamá",
  do: "Rep. Dominicana", gt: "Guatemala", hn: "Honduras", sv: "El Salvador", ni: "Nicaragua",
  pr: "Puerto Rico", us: "Estados Unidos", global: "Global / Internacional",
};

/** Mirrors src/lib/servers/server-profiles.ts. Kept in sync by hand; this script is temporary. */
function profileOf(server) {
  const editions = [...new Set((server.endpoints ?? []).map((endpoint) => endpoint.edition))];
  const players = (server.endpoints ?? []).find((endpoint) => endpoint.playersCurrent != null);
  return {
    nombre: server.name,
    descripcion: server.description,
    modalidades: (server.gameModes ?? []).map((slug) => MODE_LABELS[slug] ?? slug),
    pais: server.country ? COUNTRY_LABELS[server.country] ?? server.country : null,
    acceso: server.accessType === "whitelist"
      ? "Whitelist: hay que solicitar acceso"
      : server.accountMode === "premium_only" ? "Solo premium" : "Premium y no-premium",
    ediciones: editions,
    version: server.endpoints?.[0]?.version ?? null,
    jugadores: players ? { actuales: players.playersCurrent, maximo: players.playersMax } : null,
    estado: "En línea",
  };
}

const PROFILES = seedServers.map((server) => ({ serverId: server.id, name: server.name, profile: profileOf(server) }));

const client = new TypeSafeClient({ apiKey: API_KEY, timeout: 30_000, retry: { maxRetries: 0 }, logLevel: "error" });

function questionsFor(batch) {
  const questions = {};
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

function stateFor(query, batch) {
  return {
    contexto: "Buscador de un directorio de servidores de Minecraft en español. La persona describe el servidor que quiere encontrar.",
    consulta: query,
    servidores: batch.map((entry) => entry.profile),
  };
}

function batched(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

const stats = { requests: 0, inputTokens: 0, outputTokens: 0, failures: 0, rateLimited: 0, latencies: [] };

async function scoreBatch(query, batch) {
  const startedAt = Date.now();
  try {
    const answers = await client.systemOne({ state: stateFor(query, batch), questions: questionsFor(batch) });
    stats.requests += 1;
    stats.latencies.push(Date.now() - startedAt);
    stats.inputTokens += answers.usage?.input_tokens ?? 0;
    stats.outputTokens += answers.usage?.output_tokens ?? 0;
    return batch.map((entry, index) => ({
      name: entry.name,
      score: answers.answers[`s${index}`]?.noul ?? null,
    }));
  } catch (error) {
    stats.failures += 1;
    const message = String(error?.message ?? error);
    if (message.includes("429") || error?.name === "RateLimitError") stats.rateLimited += 1;
    stats.latencies.push(Date.now() - startedAt);
    console.error(`      ! batch failed: ${error?.name ?? "unknown"} ${message.slice(0, 120)}`);
    return batch.map((entry) => ({ name: entry.name, score: null }));
  }
}

async function pool(items, concurrency, run) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results.push(await run(items[index]));
    }
  }));
  return results.flat();
}

async function measure(label, query, batchSize, concurrency) {
  const before = { ...stats, latencies: [...stats.latencies] };
  const startedAt = Date.now();
  const scored = await pool(batched(PROFILES, batchSize), concurrency, (batch) => scoreBatch(query, batch));
  const wallMs = Date.now() - startedAt;

  const ranked = scored.filter((entry) => entry.score != null).sort((a, b) => b.score - a.score);
  const requests = stats.requests - before.requests;
  const inputTokens = stats.inputTokens - before.inputTokens;

  console.log(`\n  ${label}  (lote ${batchSize}, concurrencia ${concurrency})`);
  console.log(`    peticiones ${requests}  ·  tokens entrada ${inputTokens}  ·  pared ${(wallMs / 1000).toFixed(1)}s  ·  fallos ${stats.failures - before.failures}`);
  console.log(`    top 5: ${ranked.slice(0, 5).map((entry) => `${entry.name} ${entry.score.toFixed(2)}`).join(" | ") || "(ninguno)"}`);
  console.log(`    por encima de 0.5: ${ranked.filter((entry) => entry.score >= 0.5).length} de ${PROFILES.length}`);

  return { ranked, requests, inputTokens, wallMs };
}

/** Do two configurations agree on who the best servers are? That is what batching must not break. */
function topOverlap(a, b, size = 5) {
  const top = (ranked) => new Set(ranked.slice(0, size).map((entry) => entry.name));
  const left = top(a);
  const right = top(b);
  let shared = 0;
  for (const name of left) if (right.has(name)) shared += 1;
  return `${shared}/${Math.min(size, Math.max(left.size, right.size))}`;
}

console.log(`Midiendo con ${PROFILES.length} servidores del seed.\n${"=".repeat(78)}`);

for (const { text, expect } of QUERIES) {
  console.log(`\n${"=".repeat(78)}\nCONSULTA: "${text}"\n  esperado: ${expect}`);

  const one = await measure("1 por petición ", text, 1, 12);
  const fifteen = await measure("15 por petición", text, 15, 4);
  const all = await measure("60 en una      ", text, 60, 1);

  console.log(`\n    ¿coinciden los cinco mejores?  1-vs-15: ${topOverlap(one.ranked, fifteen.ranked)}   1-vs-60: ${topOverlap(one.ranked, all.ranked)}`);
}

const sorted = [...stats.latencies].sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
// Rate derived from the reranking cookbook's own totals ($0.0645 / 1.536M input tokens).
const DERIVED_USD_PER_MTOK = 0.042;

console.log(`\n${"=".repeat(78)}\nTOTAL`);
console.log(`  peticiones ${stats.requests}  ·  fallos ${stats.failures} (429: ${stats.rateLimited})`);
console.log(`  tokens: ${stats.inputTokens} entrada, ${stats.outputTokens} salida`);
console.log(`  latencia por petición: mediana ${sorted[Math.floor(sorted.length / 2)] ?? 0}ms  ·  p95 ${p95}ms`);
console.log(`  coste estimado del experimento: $${((stats.inputTokens / 1e6) * DERIVED_USD_PER_MTOK).toFixed(4)}`);
console.log(`\n  Extrapolación a 300 servidores, lotes de 15 (20 peticiones):`);
const perServer = stats.requests > 0 ? stats.inputTokens / (PROFILES.length * QUERIES.length * 3) : 0;
console.log(`    ~${Math.round(perServer * 300)} tokens de entrada por consulta  ·  ~$${(((perServer * 300) / 1e6) * DERIVED_USD_PER_MTOK).toFixed(5)} por consulta nueva`);
