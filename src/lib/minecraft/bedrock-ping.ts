import dgram from "node:dgram";
import crypto from "node:crypto";

import type { MinecraftTarget } from "@/lib/minecraft/network";

const MAGIC = Buffer.from("00ffff00fefefefefdfdfdfd12345678", "hex");
const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export class BedrockOfflineError extends Error {
  constructor(message = "El servidor Bedrock no respondió.") {
    super(message);
    this.name = "BedrockOfflineError";
  }
}

export type BedrockPingResult = {
  description: string;
  version: { name: string; protocol: number };
  players: { online: number; max: number };
};

export async function pingBedrockServer(target: MinecraftTarget): Promise<BedrockPingResult> {
  const socket = dgram.createSocket(target.connectHost.includes(":") ? "udp6" : "udp4");
  const timestamp = BigInt(Date.now());
  const guid = crypto.randomBytes(8);
  const packet = Buffer.alloc(1 + 8 + MAGIC.length + guid.length);
  packet.writeUInt8(0x01, 0);
  packet.writeBigInt64BE(timestamp, 1);
  MAGIC.copy(packet, 9);
  guid.copy(packet, 9 + MAGIC.length);

  return await new Promise<BedrockPingResult>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: BedrockPingResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error); else resolve(value!);
    };
    socket.once("error", () => finish(new BedrockOfflineError()));
    socket.on("message", (message) => {
      if (message.length > MAX_RESPONSE_BYTES) return finish(new BedrockOfflineError("Respuesta Bedrock demasiado grande."));
      if (message.length < 35 || message[0] !== 0x1c || !message.subarray(17, 33).equals(MAGIC)) return;
      const payloadLength = message.readUInt16BE(33);
      if (payloadLength <= 0 || 35 + payloadLength > message.length) return finish(new BedrockOfflineError("Respuesta Bedrock inválida."));
      const fields = message.subarray(35, 35 + payloadLength).toString("utf8").split(";");
      const online = Number.parseInt(fields[4] ?? "0", 10);
      const max = Number.parseInt(fields[5] ?? "0", 10);
      const protocol = Number.parseInt(fields[2] ?? "0", 10);
      const description = fields[1]?.trim() || "Servidor Bedrock";
      if (!Number.isFinite(online) || !Number.isFinite(max)) return finish(new BedrockOfflineError("Jugadores Bedrock inválidos."));
      finish(undefined, { description, version: { name: fields[3] ?? "Bedrock", protocol: Number.isFinite(protocol) ? protocol : 0 }, players: { online, max } });
    });
    const timer = setTimeout(() => finish(new BedrockOfflineError()), TIMEOUT_MS);
    socket.send(packet, target.port, target.connectHost, (error) => {
      if (error) finish(new BedrockOfflineError());
    });
  });
}
