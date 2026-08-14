import assert from "node:assert/strict";
import test from "node:test";

import { describeMonitorError } from "../src/workers/monitor-worker-errors.ts";

test("describes a Drizzle error using its PostgreSQL cause and parameter count", () => {
  const cause = Object.assign(new Error("relation \"server_monitor_schedules\" does not exist"), {
    code: "42P01",
    detail: "The relation was not found in the connected database.",
    hint: "Check the production migration.",
  });
  const error = Object.assign(new Error("Failed query: select ...\nparams: ..."), {
    name: "DrizzleQueryError",
    query: "select ... from server_monitor_schedules where id = $1",
    params: ["server-id", new Date("2026-08-14T12:00:00.000Z")],
    cause,
  });

  assert.deepEqual(describeMonitorError(error), {
    name: "DrizzleQueryError",
    message: "relation \"server_monitor_schedules\" does not exist",
    code: "42P01",
    detail: "The relation was not found in the connected database.",
    hint: "Check the production migration.",
    query: "select ... from server_monitor_schedules where id = $1",
    parameterCount: 2,
  });
});

test("describes non-Error failures without throwing while logging", () => {
  assert.deepEqual(describeMonitorError("database failed"), {
    name: "unknown",
    message: "database failed",
  });
});
