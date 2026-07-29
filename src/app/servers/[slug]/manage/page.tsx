import Link from "next/link";
import { notFound } from "next/navigation";

import { MemberPanel } from "@/components/member-panel";
import { ServerManageForm } from "@/components/server-manage-form";
import { VerificationPanel } from "@/components/verification-panel";
import { requireServerSession } from "@/lib/session";
import { getManagedServerBySlug } from "@/lib/servers/queries";
import { listServerMembers } from "@/lib/servers/members";
import { getVerificationDisplay } from "@/lib/servers/verification";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export const runtime = "nodejs";

export default async function ManageServerPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const session = await requireServerSession(`/servers/${slug}/manage`);
  const server = await getManagedServerBySlug(slug, session.user.id);
  if (!server) notFound();

  const [members, verification] = await Promise.all([
    server.role === "owner" || server.role === "admin"
      ? listServerMembers(server.id, session.user.id)
      : Promise.resolve([]),
    server.role === "owner"
      ? getVerificationDisplay(server.id, session.user.id)
      : Promise.resolve(null),
  ]);

  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-12 dark:bg-zinc-950">
      <section className="mx-auto grid w-full max-w-5xl gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/dashboard/servers" className="text-sm text-zinc-500 hover:underline">Back to managed servers</Link>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight">Manage {server.name}</h1>
            <p className="mt-2 text-sm text-zinc-500">Role: <span className="capitalize">{server.role}</span> &middot; Verification: <span className="capitalize">{server.verificationStatus}</span></p>
          </div>
          {server.publicationStatus === "published" ? <Link href={`/servers/${server.slug}`} className="text-sm font-medium underline">View public page</Link> : null}
        </div>
        {query.created ? <Notice>Draft created. Review it and publish it when ready.</Notice> : null}
        {query.updated ? <Notice>Server details saved.</Notice> : null}
        {query.verification === "verified" ? <Notice>Ownership verified. You can remove the code from the MOTD.</Notice> : null}
        {query.verification === "code_not_found" ? <Notice tone="warning">The code was not found in the MOTD.</Notice> : null}
        {query.verification === "offline" ? <Notice tone="warning">The server was offline or did not respond in time.</Notice> : null}
        {query.verification === "timeout" ? <Notice tone="warning">The check timed out before the server responded.</Notice> : null}
        {query.verification === "blocked_target" ? <Notice tone="warning">This target is blocked because it is not a public server address.</Notice> : null}
        {query.verification === "invalid_response" ? <Notice tone="warning">The server returned an invalid status response.</Notice> : null}
        {query.verification === "stale" ? <Notice tone="warning">That verification is no longer active. Generate a new code.</Notice> : null}
        {query.verification === "expired" ? <Notice tone="warning">The verification code has expired. Generate a new one.</Notice> : null}
        {query.verificationError ? <Notice tone="warning">Verification could not start or complete: {query.verificationError.replaceAll("-", " ")}.</Notice> : null}
        {query.memberUpdated ? <Notice>Member list updated.</Notice> : null}
        {query.memberError ? <Notice tone="warning">Member action failed: {query.memberError.replaceAll("-", " ")}.</Notice> : null}
        <section className="rounded-2xl bg-white p-6 dark:bg-zinc-900"><h2 className="mb-5 text-lg font-semibold">Server details</h2><ServerManageForm server={server} /></section>
        {server.role === "owner" ? <VerificationPanel serverId={server.id} slug={server.slug} verification={verification} /> : null}
        {(server.role === "owner" || server.role === "admin") ? <MemberPanel serverId={server.id} slug={server.slug} members={members} canManage={server.role === "owner"} /> : null}
      </section>
    </main>
  );
}

function Notice({ children, tone = "normal" }: { children: React.ReactNode; tone?: "normal" | "warning" }) {
  return <p className={`rounded-lg px-3 py-2 text-sm ${tone === "warning" ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>{children}</p>;
}
