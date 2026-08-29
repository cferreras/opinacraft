import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type SeedEndpoint = {
  edition: string;
  host: string;
  latencyMs: number | null;
};

type SeedServer = {
  id: string;
  name: string;
  slug: string;
  country: string;
  gameModes: string[];
  publicationStatus: string;
  verificationStatus: string;
  endpoints: SeedEndpoint[];
};

async function loadSeedServers() {
  const fixturesPath = path.resolve("scripts/seed-local-data.mjs");
  try {
    const imported = await import(pathToFileURL(fixturesPath).href);
    return imported.seedServers as SeedServer[];
  } catch (error) {
    assert.fail(`The local seed fixtures must be importable: ${String(error)}`);
  }
}

const allowedCountries = new Set([
  "es", "mx", "ar", "cl", "co", "pe", "ve", "ec", "uy", "bo", "py",
  "cr", "pa", "do", "gt", "hn", "sv", "ni", "pr", "us", "global",
]);

const allowedGameModes = new Set([
  "survival", "smp", "skyblock", "creativo", "minijuegos", "pvp", "factions",
  "towny", "prison", "roleplay", "economia", "anarquia", "hardcore", "modded",
  "vanilla", "bedwars", "skywars", "parkour", "lifesteal", "oneblock", "kitpvp",
  "uhc", "earth", "mmorpg", "aventura", "tecnico", "pixelmon", "murder",
  "speedrun", "eventos",
]);

test("builds exactly 60 unique public server fixtures", async () => {
  const servers = await loadSeedServers();

  assert.equal(servers.length, 60);
  assert.equal(new Set(servers.map((server) => server.id)).size, 60);
  assert.equal(new Set(servers.map((server) => server.slug)).size, 60);
  assert.ok(servers.every((server) => server.name.trim().length > 0));
  assert.ok(servers.every((server) => server.publicationStatus === "published"));
  assert.ok(servers.every((server) => server.verificationStatus === "verified"));
});

test("gives every fixture a valid country and one to three valid modes", async () => {
  const servers = await loadSeedServers();

  assert.ok(servers.every((server) => allowedCountries.has(server.country)));
  assert.ok(new Set(servers.map((server) => server.country)).size >= 12);
  assert.ok(servers.every((server) => server.gameModes.length >= 1 && server.gameModes.length <= 3));
  assert.ok(servers.every((server) => server.gameModes.every((mode) => allowedGameModes.has(mode))));
  assert.ok(new Set(servers.flatMap((server) => server.gameModes)).size >= 12);
});

test("keeps seeded monitoring varied without inventing measured latency", async () => {
  const servers = await loadSeedServers();
  const endpoints = servers.flatMap((server) => server.endpoints);

  assert.ok(servers.every((server) => server.endpoints.length >= 1));
  assert.equal(new Set(endpoints.map((endpoint) => `${endpoint.edition}:${endpoint.host}`)).size, endpoints.length);
  assert.ok(endpoints.every((endpoint) => endpoint.latencyMs === null));
  assert.ok(endpoints.some((endpoint) => endpoint.edition === "java"));
  assert.ok(endpoints.some((endpoint) => endpoint.edition === "bedrock"));
});
