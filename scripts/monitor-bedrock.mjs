import crypto from "node:crypto";
import dgram from "node:dgram";
import dns from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

const url = process.env.MONITOR_URL;
const secret = process.env.MONITOR_SECRET;
const run = JSON.parse(process.env.MONITOR_RUN_JSON ?? "{}");
if (!url || !secret || !run.runId || !run.nonce) process.exit(0);
const magic = Buffer.from("00ffff00fefefefefdfdfdfd12345678", "hex");
function isPublicAddress(value) {
  try {
    let address = ipaddr.parse(value);
    if (address.kind() === "ipv6" && address.isIPv4MappedAddress()) address = address.toIPv4Address();
    if (address.kind() === "ipv4" && ["168.63.129.16", "169.254.169.254", "100.100.100.200"].includes(address.toString())) return false;
    return address.range() === "unicast";
  } catch {
    return false;
  }
}

async function resolvePublicAddress(host) {
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new Error("Blocked monitor target");
    return host;
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("Blocked monitor target");
  return addresses[0].address;
}

async function ping(endpoint) {
  let address;
  try {
    address = await resolvePublicAddress(endpoint.host);
  } catch {
    return { ...endpoint, online: false, failureCode: "blocked_target", latencyMs: null };
  }
  return new Promise((resolve) => {
    const socket = dgram.createSocket(isIP(address) === 6 ? "udp6" : "udp4");
    const started = Date.now();
    const timestamp = BigInt(Date.now());
    const packet = Buffer.alloc(33); packet[0] = 1; packet.writeBigInt64BE(timestamp, 1); magic.copy(packet, 9); crypto.randomBytes(8).copy(packet, 25);
    let settled = false;
    let timer;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve(value);
    };
    timer = setTimeout(() => settle({ ...endpoint, online: false, failureCode: "timeout", latencyMs: null }), 5000);
    socket.on("message", (message) => {
      if (message.length < 35 || message[0] !== 0x1c || message.readBigInt64BE(1) !== timestamp || !message.subarray(17, 33).equals(magic)) return;
      const length = message.readUInt16BE(33);
      if (length <= 0 || 35 + length > message.length) return;
      const fields = message.subarray(35, 35 + length).toString().split(";");
      const playersCurrent = Number(fields[4]);
      const playersMax = Number(fields[5]);
      if (!Number.isInteger(playersCurrent) || playersCurrent < 0 || !Number.isInteger(playersMax) || playersMax < 0) {
        settle({ ...endpoint, online: false, failureCode: "invalid_response", latencyMs: null });
        return;
      }
      settle({ ...endpoint, online: true, playersCurrent, playersMax, version: fields[3], latencyMs: Date.now() - started });
    });
    socket.on("error", () => settle({ ...endpoint, online: false, failureCode: "unreachable", latencyMs: null }));
    socket.send(packet, endpoint.port, address, (error) => {
      if (error) settle({ ...endpoint, online: false, failureCode: "unreachable", latencyMs: null });
    });
  });
}
async function runPool(items, concurrency, task) {
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()));
}
const results = [];
await runPool(run.fallback ?? [], 10, async (endpoint) => {
  results.push(await ping(endpoint));
});
const payload = JSON.stringify({ runId: run.runId, nonce: run.nonce, results });
const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
for (let attempt = 0; attempt < 3; attempt += 1) {
  try {
    const response = await fetch(`${url}/api/internal/monitor/results`, { method: "POST", headers: { "content-type": "application/json", "x-monitor-signature": signature }, body: payload, signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`Monitor results rejected with HTTP ${response.status}`);
    break;
  } catch (error) {
    if (attempt === 2) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
}
