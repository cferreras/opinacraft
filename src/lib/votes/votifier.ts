import { constants, createHmac, createPublicKey, publicEncrypt, type KeyObject } from "node:crypto";
import { Socket } from "node:net";

import {
  BlockedMinecraftTargetError,
  MinecraftAbortError,
  MinecraftDnsError,
  resolveMinecraftTargetCandidates,
} from "@/lib/minecraft/network";
import { localVotifierHostsAllowed, resolveLocalVotifierTargets } from "./local-votifier";

export type VotifierKeyType = "token" | "rsa";

export type VotifierVote = {
  serviceName: string;
  username: string;
  address: string;
  timestamp: number;
};

export type VotifierResult =
  | { ok: true; latencyMs: number }
  | {
      ok: false;
      code: "blocked" | "dns" | "timeout" | "refused" | "rejected" | "protocol" | "invalid-key";
      latencyMs: number;
    };

type VotifierFailureCode = Extract<VotifierResult, { ok: false }>["code"];

export type VotifierTarget = { connectHost: string; port: number };

export type VotifierOptions = {
  timeoutMs?: number;
  /** Must only return addresses that passed the SSRF guard. Tests swap it to reach a local server. */
  resolve?: (host: string, port: number, signal: AbortSignal) => Promise<VotifierTarget[]>;
  /** Returns a socket that is already connecting to `target`. */
  connect?: (target: { host: string; port: number }) => Socket;
};

export const votifierErrorMessages: Record<VotifierFailureCode, string> = {
  rejected: "El servidor rechazó la clave. Cópiala otra vez de plugins/Votifier/config.yml.",
  timeout: "No hay respuesta en ese puerto: revisa que Votifier esté activo y el puerto abierto.",
  dns: "No se encuentra el dominio.",
  blocked: "Esa dirección no es pública.",
  refused: "El servidor rechazó la conexión en ese puerto.",
  protocol: "Lo que respondió no parece Votifier.",
  "invalid-key": "La clave no tiene un formato válido.",
};

const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_READ_BYTES = 4_096;
// v1 never answers, so once the block is written we only wait this long for
// the server to hang up before calling it delivered.
const V1_SETTLE_MS = 500;
const V2_MAGIC = 0x733a;
// NuVotifier reads the length as a signed Java short.
const V2_MAX_MESSAGE_BYTES = 0x7fff;
// Votifier only accepts a single 256-byte block, i.e. a 2048-bit key.
const RSA_MODULUS_BITS = 2048;
const MAX_TOKEN_LENGTH = 512;

class VotifierFailure extends Error {
  readonly code: VotifierFailureCode;
  // Only failures before anything was written may move on to another address,
  // so a vote is never delivered twice.
  readonly retryable: boolean;

  constructor(code: VotifierFailureCode, retryable = false) {
    super(code);
    this.name = "VotifierFailure";
    this.code = code;
    this.retryable = retryable;
  }
}

export function parseVotifierPublicKey(input: string): KeyObject {
  const trimmed = input.trim();
  let key: KeyObject;
  if (trimmed.includes("-----BEGIN")) {
    key = createPublicKey(trimmed);
  } else {
    // Votifier's public.key is the base64 of an X.509 SubjectPublicKeyInfo.
    const compact = trimmed.replace(/\s+/g, "");
    if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
      throw new Error("The Votifier public key is not base64.");
    }
    const der = Buffer.from(compact, "base64");
    try {
      key = createPublicKey({ key: der, format: "der", type: "spki" });
    } catch {
      key = createPublicKey({ key: der, format: "der", type: "pkcs1" });
    }
  }
  if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails?.modulusLength !== RSA_MODULUS_BITS) {
    throw new Error("The Votifier public key must be a 2048-bit RSA key.");
  }
  return key;
}

export function isValidVotifierSecret(keyType: VotifierKeyType, secret: string): boolean {
  if (keyType === "token") {
    const token = secret.trim();
    return token.length > 0 && token.length <= MAX_TOKEN_LENGTH && !/\s/.test(token);
  }
  try {
    parseVotifierPublicKey(secret);
    return true;
  } catch {
    return false;
  }
}

function assertVoteField(name: string, value: string) {
  // Newlines would let one field forge the others in the v1 plaintext.
  if (typeof value !== "string" || !value || /[\r\n]/.test(value)) {
    throw new RangeError(`Invalid Votifier vote field: ${name}`);
  }
}

type Encoder = (greeting: string) => Buffer | null;

function tokenEncoder(token: string, vote: VotifierVote): Encoder {
  return (greeting) => {
    const [banner, , challenge] = greeting.split(" ");
    // A v1-only Votifier sends no challenge, so it cannot take a token.
    if (banner !== "VOTIFIER" || !challenge) return null;
    const payload = JSON.stringify({
      serviceName: vote.serviceName,
      username: vote.username,
      address: vote.address,
      timestamp: vote.timestamp,
      challenge,
    });
    const signature = createHmac("sha256", token).update(payload, "utf8").digest("base64");
    const message = Buffer.from(JSON.stringify({ payload, signature }), "utf8");
    if (message.length > V2_MAX_MESSAGE_BYTES) return null;
    const header = Buffer.alloc(4);
    header.writeUInt16BE(V2_MAGIC, 0);
    header.writeUInt16BE(message.length, 2);
    return Buffer.concat([header, message]);
  };
}

function rsaEncoder(key: KeyObject, vote: VotifierVote): Encoder {
  return (greeting) => {
    if (greeting.split(" ")[0] !== "VOTIFIER") return null;
    const plaintext = `VOTE\n${vote.serviceName}\n${vote.username}\n${vote.address}\n${vote.timestamp}\n`;
    return publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(plaintext, "utf8"));
  };
}

function connectionErrorCode(error: unknown): VotifierFailureCode {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ETIMEDOUT") return "timeout";
  return "refused";
}

function exchange(socket: Socket, encode: Encoder, expectsResponse: boolean, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let phase: "connecting" | "greeting" | "response" | "settling" = "connecting";
    let buffer = Buffer.alloc(0);
    let received = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    const finish = (failure?: VotifierFailure) => {
      if (done) return;
      done = true;
      if (settleTimer) clearTimeout(settleTimer);
      signal.removeEventListener("abort", onAbort);
      socket.removeAllListeners();
      // Late errors from a destroyed socket must not become unhandled.
      socket.on("error", () => {});
      socket.destroy();
      if (failure) reject(failure);
      else resolve();
    };

    const onAbort = () => finish(new VotifierFailure("timeout"));

    const readResponse = (atClose: boolean) => {
      const newline = buffer.indexOf(0x0a);
      if (newline === -1 && !atClose) return;
      const text = (newline === -1 ? buffer : buffer.subarray(0, newline)).toString("utf8").trim();
      if (!text) return finish(new VotifierFailure("protocol"));
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return finish(new VotifierFailure("protocol"));
      }
      const status = (parsed as { status?: unknown } | null)?.status;
      if (status === "ok") return finish();
      if (status === "error") return finish(new VotifierFailure("rejected"));
      finish(new VotifierFailure("protocol"));
    };

    const onGreeting = () => {
      const newline = buffer.indexOf(0x0a);
      if (newline === -1) return;
      const greeting = buffer.subarray(0, newline).toString("utf8").trim();
      buffer = buffer.subarray(newline + 1);
      const packet = encode(greeting);
      if (!packet) return finish(new VotifierFailure("protocol"));
      phase = expectsResponse ? "response" : "settling";
      socket.write(packet, (error) => {
        if (done) return;
        if (error) return finish(new VotifierFailure("refused"));
        if (!expectsResponse) settleTimer = setTimeout(() => finish(), V1_SETTLE_MS);
      });
      if (expectsResponse && buffer.length) readResponse(false);
    };

    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });

    socket.on("connect", () => {
      phase = "greeting";
    });
    socket.on("data", (chunk: Buffer) => {
      if (done) return;
      received += chunk.length;
      if (received > MAX_READ_BYTES) return finish(new VotifierFailure("protocol"));
      if (phase === "connecting") phase = "greeting";
      if (phase === "settling") return;
      buffer = Buffer.concat([buffer, chunk]);
      if (phase === "greeting") onGreeting();
      else if (phase === "response") readResponse(false);
    });
    socket.on("error", (error) => {
      if (phase === "connecting") return finish(new VotifierFailure(connectionErrorCode(error), true));
      // v1 servers may reset instead of closing once they have the block.
      if (phase === "settling") return finish();
      finish(new VotifierFailure("protocol"));
    });
    socket.on("close", () => {
      if (phase === "connecting") return finish(new VotifierFailure("refused", true));
      if (phase === "settling") return finish();
      if (phase === "response") return readResponse(true);
      finish(new VotifierFailure("protocol"));
    });
  });
}

function defaultConnect(target: { host: string; port: number }) {
  const socket = new Socket();
  socket.connect({ host: target.host, port: target.port });
  return socket;
}

async function defaultResolve(host: string, port: number, signal: AbortSignal) {
  if (localVotifierHostsAllowed()) return resolveLocalVotifierTargets(host, port);
  const targets = await resolveMinecraftTargetCandidates(host, port, signal);
  // On 25565 the guard follows the _minecraft._tcp SRV record, which points at
  // the game server rather than Votifier.
  return targets.filter((target) => target.port === port);
}

export async function sendVotifierVote(
  config: { host: string; port: number; keyType: VotifierKeyType; secret: string },
  vote: VotifierVote,
  options: VotifierOptions = {},
): Promise<VotifierResult> {
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  const fail = (code: VotifierFailureCode): VotifierResult => ({ ok: false, code, latencyMs: elapsed() });

  assertVoteField("serviceName", vote.serviceName);
  assertVoteField("username", vote.username);
  assertVoteField("address", vote.address);
  if (!Number.isSafeInteger(vote.timestamp) || vote.timestamp < 0) {
    throw new RangeError("Invalid Votifier vote field: timestamp");
  }

  let encode: Encoder;
  if (config.keyType === "token") {
    if (!isValidVotifierSecret("token", config.secret)) return fail("invalid-key");
    encode = tokenEncoder(config.secret.trim(), vote);
  } else {
    let key: KeyObject;
    try {
      key = parseVotifierPublicKey(config.secret);
    } catch {
      return fail("invalid-key");
    }
    encode = rsaEncoder(key, vote);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const resolveTargets = options.resolve ?? defaultResolve;
  const connect = options.connect ?? defaultConnect;

  try {
    let targets: VotifierTarget[];
    try {
      targets = await resolveTargets(config.host, config.port, controller.signal);
    } catch (error) {
      if (error instanceof BlockedMinecraftTargetError) return fail("blocked");
      if (error instanceof MinecraftAbortError || controller.signal.aborted) return fail("timeout");
      if (error instanceof MinecraftDnsError) return fail("dns");
      return fail("dns");
    }
    if (!targets.length) return fail("dns");

    let lastFailure: VotifierFailureCode = "refused";
    for (const target of targets) {
      if (controller.signal.aborted) return fail("timeout");
      try {
        const socket = connect({ host: target.connectHost, port: target.port });
        await exchange(socket, encode, config.keyType === "token", controller.signal);
        return { ok: true, latencyMs: elapsed() };
      } catch (error) {
        if (!(error instanceof VotifierFailure)) return fail("protocol");
        if (!error.retryable) return fail(error.code);
        lastFailure = error.code;
      }
    }
    return fail(lastFailure);
  } finally {
    clearTimeout(timer);
  }
}
