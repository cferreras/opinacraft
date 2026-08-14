import assert from "node:assert/strict";
import test from "node:test";

import { getAvailabilityTransition } from "../src/lib/servers/monitor-availability.ts";

const now = new Date("2026-08-14T12:00:00.000Z");

test("fresh visible servers hide after seven days without an online observation", () => {
  assert.equal(getAvailabilityTransition({
    publicationStatus: "published",
    moderationStatus: "active",
    availabilityHiddenAt: null,
    healthStatus: "offline",
    lastCheckedAt: new Date("2026-08-14T11:45:00.000Z"),
    lastOnlineAt: new Date("2026-08-07T11:59:00.000Z"),
  }, now), "hidden");
});

test("hidden servers restore only after a fresh online observation", () => {
  assert.equal(getAvailabilityTransition({
    publicationStatus: "published",
    moderationStatus: "active",
    availabilityHiddenAt: new Date("2026-08-14T10:00:00.000Z"),
    healthStatus: "online",
    lastCheckedAt: new Date("2026-08-14T11:00:00.000Z"),
    lastOnlineAt: new Date("2026-08-14T11:00:00.000Z"),
  }, now), "restored");

  assert.equal(getAvailabilityTransition({
    publicationStatus: "published",
    moderationStatus: "active",
    availabilityHiddenAt: new Date("2026-08-14T10:00:00.000Z"),
    healthStatus: "online",
    lastCheckedAt: new Date("2026-08-14T09:00:00.000Z"),
    lastOnlineAt: new Date("2026-08-14T09:00:00.000Z"),
  }, now), null);
});
