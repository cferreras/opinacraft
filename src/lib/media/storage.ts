import { del, put } from "@vercel/blob";

import { serverEnv } from "@/env/server";

export class MediaStorageNotConfiguredError extends Error {
  constructor() {
    super("Media storage is not configured.");
    this.name = "MediaStorageNotConfiguredError";
  }
}

export type StoredMedia = { key: string; url: string };

export interface MediaStorage {
  upload(key: string, body: Buffer, contentType: string): Promise<StoredMedia>;
  remove(key: string): Promise<void>;
}

class VercelBlobStorage implements MediaStorage {
  private ensureConfigured() {
    if (!serverEnv.BLOB_READ_WRITE_TOKEN) throw new MediaStorageNotConfiguredError();
  }

  async upload(key: string, body: Buffer, contentType: string) {
    this.ensureConfigured();
    const blob = await put(key, body, {
      access: "public",
      addRandomSuffix: false,
      contentType,
      cacheControlMaxAge: 31_536_000,
      token: serverEnv.BLOB_READ_WRITE_TOKEN,
    });
    return { key: blob.pathname, url: blob.url };
  }

  async remove(key: string) {
    this.ensureConfigured();
    await del(key, { token: serverEnv.BLOB_READ_WRITE_TOKEN });
  }
}

class E2EMemoryStorage implements MediaStorage {
  async upload(key: string, body: Buffer, contentType: string) {
    return {
      key,
      url: `data:${contentType};base64,${body.toString("base64")}`,
    };
  }

  async remove(key: string) {
    void key;
  }
}

function createMediaStorage(): MediaStorage {
  if (serverEnv.E2E_MEDIA_STORAGE === "memory") {
    if (serverEnv.NODE_ENV === "production") {
      throw new Error("E2E memory media storage is not allowed in production.");
    }
    return new E2EMemoryStorage();
  }

  if (serverEnv.NODE_ENV === "production" && !serverEnv.BLOB_READ_WRITE_TOKEN) {
    throw new MediaStorageNotConfiguredError();
  }
  return new VercelBlobStorage();
}

export const mediaStorage = createMediaStorage();
