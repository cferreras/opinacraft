import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
} from "node:crypto";

import { serverEnv } from "../../env/server.ts";

const CODE_PREFIX = "OPINACRAFT-";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class VerificationConfigurationError extends Error {
  constructor() {
    super("Server verification is not configured.");
    this.name = "VerificationConfigurationError";
  }
}

function keyMaterial() {
  const secret = serverEnv.SERVER_VERIFICATION_SECRET;
  if (!secret) throw new VerificationConfigurationError();
  return {
    hmac: Buffer.from(hkdfSync("sha256", secret, "opinacraft", "motd-hmac", KEY_LENGTH)),
    encryption: Buffer.from(
      hkdfSync("sha256", secret, "opinacraft", "motd-encryption", KEY_LENGTH),
    ),
  };
}

export function generateVerificationCode() {
  let value = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    value += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `${CODE_PREFIX}${value.slice(0, 5)}-${value.slice(5)}`;
}

export function canonicalVerificationCode(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function hashVerificationCode(code: string) {
  const { hmac } = keyMaterial();
  return createHmac("sha256", hmac)
    .update(canonicalVerificationCode(code), "utf8")
    .digest("hex");
}

export function encryptVerificationCode(code: string) {
  const { encryption } = keyMaterial();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryption, iv);
  const ciphertext = Buffer.concat([
    cipher.update(canonicalVerificationCode(code), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptVerificationCode(payload: Buffer) {
  const { encryption } = keyMaterial();
  if (payload.length <= 1 + IV_LENGTH + TAG_LENGTH || payload[0] !== 1) {
    throw new Error("Invalid verification token payload.");
  }
  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const tag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", encryption, iv);
  decipher.setAuthTag(tag);
  return canonicalVerificationCode(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"),
  );
}
