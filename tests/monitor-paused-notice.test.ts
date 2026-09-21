import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Changing a listing's host clears every endpoint verification, which deletes
// the monitor schedule and pulls the listing from the directory. That is the
// intended behaviour; what was missing is that the owner was never told, and
// the card went on advertising a cadence nothing was going to meet.

test("the reported cadence comes from the schedule, not from the target", () => {
  const source = readFileSync("src/lib/monitor/repository.ts", "utf8");

  assert.match(source, /left join monitor_schedules sc on sc\.server_id = t\.server_id/);
  assert.match(source, /select t\.server_id, sc\.cadence_minutes/);
  // The target keeps a non-null cadence column even while nothing is scheduled,
  // so reading it is what made an unmonitored server claim to be monitored.
  assert.doesNotMatch(source, /select t\.server_id, t\.cadence_minutes/);
});

test("a save that loses the last verified endpoint reports the paused monitor", () => {
  const source = readFileSync("src/lib/servers/service.ts", "utf8");

  assert.match(source, /monitoringPaused: !verifiedEndpoint/);
});

test("the manage action carries the paused monitor into the redirect", () => {
  const source = readFileSync("src/app/servers/[slug]/manage/actions.ts", "utf8");

  assert.match(source, /\(\{ monitoringPaused \} = await updateServer\(/);
  assert.match(source, /monitoringPaused \? "&monitorPaused=1" : ""/);
});

test("the manage page replaces the plain success notice with the paused warning", () => {
  const source = readFileSync("src/app/servers/[slug]/manage/page.tsx", "utf8");

  assert.match(source, /query\.updated && !query\.monitorPaused \? <Notice>/);
  assert.match(source, /query\.updated && query\.monitorPaused \? <Notice tone="warning">/);
  assert.match(source, /la monitorización queda en pausa/);
});

test("the connection form warns before the address is changed", () => {
  const source = readFileSync("src/components/server-manage-form.tsx", "utf8");

  assert.match(source, /la monitorización se pausa y deja de aparecer en el directorio/);
});

test("a server the worker is not probing is labelled as paused", () => {
  const source = readFileSync("src/components/player-history-card.tsx", "utf8");

  assert.match(source, /if \(!minutes\) return "monitorización en pausa";/);
  assert.doesNotMatch(source, /sin cadencia/);
});
