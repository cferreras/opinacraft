"use client";

import { IconCheck, IconShieldCheck } from "@tabler/icons-react";

import {
  checkVerificationAction,
  startVerificationAction,
} from "@/app/servers/[slug]/manage/actions";

type Display = {
  id: string;
  status: string;
  attemptCount: number;
  lastFailureCode: string | null;
  expiresAt: Date;
  code: string | null;
} | null;

export function VerificationPanel({
  serverId,
  slug,
  verification,
  edition = "java",
}: {
  serverId: string;
  slug: string;
  verification: Display;
  edition?: "java" | "bedrock";
}) {
  const active = verification?.status === "pending" && verification.code;
  const label = edition === "java" ? "Java" : "Bedrock";
  const verified = verification?.status === "verified";

  return (
    <section className="rounded-2xl border border-[#e0e6eb] bg-white p-5 shadow-[0_1px_2px_rgba(16,30,45,0.02)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f1ff] text-[#2d34cf]"><IconShieldCheck aria-hidden="true" size={17} stroke={1.7} /></span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a86a0]">Ownership check</p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Verificación de propiedad · {label}</h2>
            <p className="mt-1.5 text-[11px] leading-5 text-[#667287]">Add a temporary code to the {label} server MOTD to prove you control this address.</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${verified ? "bg-[#e6f8ef] text-[#0c8950]" : active ? "bg-[#fff4df] text-[#9a6717]" : "bg-[#f1f3f6] text-[#69768b]"}`}>
          {verified ? <IconCheck aria-hidden="true" size={13} stroke={2} /> : <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#d18b1d]" : "bg-[#9aa5b3]"}`} />}
          {verification?.status ?? "unverified"}
        </span>
      </div>

      {active ? (
        <div className="mt-5 rounded-xl border border-dashed border-[#cbd2ff] bg-[#fbfcff] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a86a0]">Temporary MOTD code</p>
          <code className="mt-2 block text-[22px] font-semibold tracking-[0.16em] text-[#2d34cf]">{verification.code}</code>
          <p className="mt-2 text-[11px] leading-5 text-[#718097]">
            Expires {verification.expiresAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Attempts used: {verification.attemptCount}/5.
          </p>
          <p className="mt-1.5 text-[11px] leading-5 text-[#718097]">After the check succeeds, you can remove this code from the MOTD.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <form action={checkVerificationAction}>
              <input type="hidden" name="serverId" value={serverId} />
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="verificationId" value={verification.id} />
              <input type="hidden" name="edition" value={edition} />
              <button className="inline-flex h-10 items-center rounded-lg bg-[#3029e7] px-4 text-[11px] font-semibold text-white shadow-[0_4px_10px_rgba(48,41,231,0.13)] transition hover:bg-[#2821c8]">Comprobar MOTD</button>
            </form>
            <button type="button" onClick={() => navigator.clipboard?.writeText(verification.code ?? "")} className="inline-flex h-10 items-center rounded-lg border border-[#dce2e7] bg-white px-4 text-[11px] font-semibold text-[#59677c] transition hover:border-[#bfc8d4] hover:bg-[#f7f8fa]">Copiar código</button>
          </div>
        </div>
      ) : (
        <form action={startVerificationAction} className="mt-5 rounded-xl bg-[#f7f8fa] p-4">
          <input type="hidden" name="serverId" value={serverId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="edition" value={edition} />
          <p className="text-[11px] leading-5 text-[#718097]">Generate a code and place it in the server MOTD before checking this endpoint.</p>
          <button className="mt-3 inline-flex h-10 items-center rounded-lg bg-[#3029e7] px-4 text-[11px] font-semibold text-white shadow-[0_4px_10px_rgba(48,41,231,0.13)] transition hover:bg-[#2821c8]">Generar código de verificación</button>
        </form>
      )}

      {verification?.lastFailureCode ? <p className="mt-4 rounded-lg bg-[#fff9ec] px-3 py-2.5 text-[11px] text-[#8a641e]">Last result: {verification.lastFailureCode.replaceAll("_", " ")}</p> : null}
    </section>
  );
}
