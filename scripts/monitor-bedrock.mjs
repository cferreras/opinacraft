import crypto from "node:crypto";
import dgram from "node:dgram";

const url = process.env.MONITOR_URL;
const secret = process.env.MONITOR_SECRET;
const run = JSON.parse(process.env.MONITOR_RUN_JSON ?? "{}");
if (!url || !secret || !run.runId || !run.nonce) process.exit(0);
const magic = Buffer.from("00ffff00fefefefefdfdfdfd12345678", "hex");
function ping(endpoint) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const started = Date.now();
    const packet = Buffer.alloc(33); packet[0] = 1; packet.writeBigInt64BE(BigInt(Date.now()), 1); magic.copy(packet, 9); crypto.randomBytes(8).copy(packet, 25);
    const timer = setTimeout(() => { socket.close(); resolve({ ...endpoint, online: false, latencyMs: null }); }, 5000);
    socket.on("message", (message) => {
      if (message[0] !== 0x1c || message.length < 35 || !message.subarray(17, 33).equals(magic)) return;
      clearTimeout(timer); socket.close(); const length = message.readUInt16BE(33); const fields = message.subarray(35, 35 + length).toString().split(";");
      resolve({ ...endpoint, online: true, playersCurrent: Number(fields[4]) || 0, playersMax: Number(fields[5]) || 0, version: fields[3], latencyMs: Date.now() - started });
    });
    socket.on("error", () => { clearTimeout(timer); socket.close(); resolve({ ...endpoint, online: false, latencyMs: null }); });
    socket.send(packet, endpoint.port, endpoint.host);
  });
}
const results = await Promise.all((run.fallback ?? []).map(ping));
const payload = JSON.stringify({ runId: run.runId, nonce: run.nonce, results });
const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
await fetch(`${url}/api/internal/monitor/results`, { method: "POST", headers: { "content-type": "application/json", "x-monitor-signature": signature }, body: payload });
