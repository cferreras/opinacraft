import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

const serverScript = path.resolve(".agents/skills/brainstorming/scripts/server.cjs");
const helperScript = path.resolve(".agents/skills/brainstorming/scripts/helper.js");
const startScript = path.resolve(".agents/skills/brainstorming/scripts/start-server.sh");

function helperWebSocketUrl(protocol: string) {
  let url = "";

  class FakeWebSocket {
    static OPEN = 1;
    readyState = FakeWebSocket.OPEN;

    constructor(nextUrl: string) {
      url = nextUrl;
    }

    send() {}
    close() {}
  }

  const window = {
    location: { protocol, host: "companion.example" },
    sessionStorage: { getItem: () => "session-key" },
  };
  const document = {
    addEventListener() {},
    querySelector() {
      return null;
    },
  };

  vm.runInNewContext(readFileSync(helperScript, "utf8"), {
    WebSocket: FakeWebSocket,
    clearTimeout,
    console,
    Date,
    document,
    queueMicrotask,
    setTimeout,
    window,
  });

  return url;
}

function startServer(overrides: Record<string, string> = {}) {
  const sessionDir = mkdtempSync(path.join(os.tmpdir(), "opinacraft-brainstorm-"));
  const token = overrides.BRAINSTORM_TOKEN ?? "a".repeat(32);
  const port = 49152 + (process.pid % 1000);
  const output = { stderr: "", stdout: "" };
  let infoResolve!: (info: { port: number }) => void;
  let infoReject!: (error: Error) => void;
  const infoPromise = new Promise<{ port: number }>((resolve, reject) => {
    infoResolve = resolve;
    infoReject = reject;
  });
  const child = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      BRAINSTORM_DIR: sessionDir,
      BRAINSTORM_IDLE_TIMEOUT_MS: "60000",
      BRAINSTORM_LIFECYCLE_CHECK_MS: "1000",
      BRAINSTORM_OPEN: "",
      BRAINSTORM_PORT: String(port),
      BRAINSTORM_TOKEN: token,
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output.stdout += chunk;
    for (const line of output.stdout.split(/\r?\n/)) {
      try {
        const value = JSON.parse(line) as { type?: string; port?: number };
        if (value.type === "server-started" && typeof value.port === "number") {
          infoResolve({ port: value.port });
          return;
        }
      } catch {
        // Ignore non-JSON startup output.
      }
    }
  });
  child.stderr.on("data", (chunk: string) => { output.stderr += chunk; });
  child.once("error", infoReject);
  child.once("exit", (code, signal) => {
    infoReject(new Error(`brainstorm server exited before startup (${code ?? signal})`));
  });

  return {
    child,
    infoPromise,
    output,
    sessionDir,
    token,
    cleanup() {
      if (!child.killed) child.kill();
      rmSync(sessionDir, { force: true, recursive: true });
    },
  };
}

test("uses secure WebSocket transport on HTTPS pages", () => {
  assert.equal(helperWebSocketUrl("https:"), "wss://companion.example/?key=session-key");
  assert.equal(helperWebSocketUrl("http:"), "ws://companion.example/?key=session-key");
});

test("escapes an arbitrary session token before embedding it in an inline script", async () => {
  const runtime = startServer({ BRAINSTORM_TOKEN: "</script><script>window.injected=1</script>" });
  try {
    const info = await runtime.infoPromise;
    const response = await fetch(`http://127.0.0.1:${info.port}/?key=${encodeURIComponent(runtime.token)}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.ok(html.includes("\\u003c/script\\u003e"));
    assert.doesNotMatch(html, /<\/script><script>window\.injected/);
  } finally {
    runtime.cleanup();
  }
});

test("falls back from an invalid explicit port with a warning", async () => {
  const runtime = startServer({ BRAINSTORM_PORT: "not-a-port" });
  try {
    const info = await runtime.infoPromise;

    assert.ok(info.port > 1023 && info.port < 65536);
    assert.match(runtime.output.stderr, /Invalid BRAINSTORM_PORT/);
  } finally {
    runtime.cleanup();
  }
});

test("rejects a value-taking launcher option without hanging", () => {
  const bash = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";
  const script = startScript.replaceAll("\\", "/");
  const result = spawnSync(bash, [script, "--host"], { encoding: "utf8", timeout: 2_000 });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\{"error":"--host requires a value"\}/);
});
