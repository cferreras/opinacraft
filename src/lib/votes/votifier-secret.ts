import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { serverEnv } from "@/env/server";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PAYLOAD_VERSION = 1;

export class VotifierConfigurationError extends Error {
  constructor() {
    super("Votifier secret storage is not configured.");
    this.name = "VotifierConfigurationError";
  }
}

export function votifierSecretConfigured() {
  return Boolean(serverEnv.VOTIFIER_SECRET);
}

function encryptionKey() {
  const secret = serverEnv.VOTIFIER_SECRET;
  if (!secret) throw new VotifierConfigurationError();
  return Buffer.from(hkdfSync("sha256", secret, "opinacraft", "votifier-encryption", KEY_LENGTH));
}

export function encryptVotifierSecret(plain: string): Buffer {
  const key = encryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([PAYLOAD_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptVotifierSecret(payload: Buffer): string {
  const key = encryptionKey();
  if (payload.length <= 1 + IV_LENGTH + TAG_LENGTH || payload[0] !== PAYLOAD_VERSION) {
    throw new Error("Invalid Votifier secret payload.");
  }
  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const tag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
