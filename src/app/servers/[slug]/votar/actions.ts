"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";

import { consumeRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { requestIp } from "@/lib/search/request-ip";
import { verifyVisitorChallenge } from "@/lib/search/runtime";
import { getCachedPublishedServer } from "@/lib/servers/cached-queries";
import { getServerSession } from "@/lib/session";
import { voterTag, votesEnabled, votesTag } from "@/lib/votes/cached";
import { normalizeNickname } from "@/lib/votes/month";
import { castVote } from "@/lib/votes/service";
import type { VoteDeliveryCopy } from "@/lib/votes/vote-copy";

/** Everything crosses to the client, so dates travel as ISO strings. `now` is the server's clock, for the countdown's first frame. */
export type VoteActionState =
  | { status: "ok"; nickname: string; votes: number; position: number | null; nextVoteAt: string; delivery: VoteDeliveryCopy; linkedToAccount: boolean; now: string }
  | { status: "cooldown"; nickname: string; votedAt: string; nextVoteAt: string; now: string }
  | { status: "not-eligible" }
  | { status: "error"; message: string; nickname: string; fieldError?: string };

const NICKNAME_ERROR = "Usa de 3 a 16 letras, números o guion bajo, sin espacios.";
const CAPTCHA_ERROR = "La comprobación anti-bots ha caducado. Vuelve a resolverla y pulsa Reintentar; tu nick se mantiene.";
const UNEXPECTED_ERROR = "No hemos podido guardar el voto. Inténtalo de nuevo en unos minutos.";

/** Generous for a person retrying a captcha, tight enough that a script cycling nicks gets nowhere. */
const VOTE_ATTEMPTS_PER_IP = 10;
const VOTE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const serverSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function passesTurnstile(token: string, remoteIp: string) {
  const result = await verifyVisitorChallenge(token, remoteIp === "unknown" ? undefined : remoteIp);
  if (result !== "unconfigured") return result;
  // Local development without Cloudflare keys still has to be able to vote. Production never does.
  if (process.env.NODE_ENV !== "production") {
    console.warn("[votes] Turnstile is not configured; skipping the captcha outside production");
    return "ok" as const;
  }
  return "misconfigured" as const;
}

export async function castVoteAction(_previous: VoteActionState | null, formData: FormData): Promise<VoteActionState> {
  const rawNickname = formValue(formData, "nickname").slice(0, 64);
  const slug = formValue(formData, "slug");
  if (!votesEnabled() || slug.length > 100 || !serverSlugPattern.test(slug)) return { status: "not-eligible" };

  const normalized = normalizeNickname(rawNickname);
  if (!normalized) return { status: "error", message: NICKNAME_ERROR, nickname: rawNickname.trim(), fieldError: NICKNAME_ERROR };

  try {
    // The slug, not a posted id, decides the server: a vote can only land on a published ficha.
    const server = await getCachedPublishedServer(slug);
    if (!server) return { status: "not-eligible" };

    const ip = requestIp(await headers());
    await consumeRateLimit(`vote:ip:${ip}`, VOTE_ATTEMPTS_PER_IP, VOTE_ATTEMPT_WINDOW_MS);

    const captcha = await passesTurnstile(formValue(formData, "cf-turnstile-response"), ip);
    if (captcha === "failed") return { status: "error", message: CAPTCHA_ERROR, nickname: normalized.nickname };
    if (captcha === "misconfigured") {
      console.error("[votes] Turnstile is not configured in production");
      return { status: "error", message: UNEXPECTED_ERROR, nickname: normalized.nickname };
    }

    const session = await getServerSession();
    const result = await castVote({ serverId: server.id, nickname: normalized.nickname, nicknameKey: normalized.key, ip, userId: session?.user.id ?? null });
    const now = new Date().toISOString();

    if (result.status === "not-eligible") return result;
    if (result.status === "cooldown") {
      return { status: "cooldown", nickname: result.nickname, votedAt: result.votedAt.toISOString(), nextVoteAt: result.nextVoteAt.toISOString(), now };
    }

    updateTag(votesTag());
    updateTag(voterTag(server.id));
    return {
      status: "ok",
      nickname: normalized.nickname,
      votes: result.votes,
      position: result.position,
      nextVoteAt: result.nextVoteAt.toISOString(),
      delivery: result.delivery,
      linkedToAccount: result.linkedToAccount,
      now,
    };
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { status: "error", message: error.message, nickname: normalized.nickname };
    console.error("[votes] vote failed", error instanceof Error ? error.name : "unknown");
    return { status: "error", message: UNEXPECTED_ERROR, nickname: normalized.nickname };
  }
}
