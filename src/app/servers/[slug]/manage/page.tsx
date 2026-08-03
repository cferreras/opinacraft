import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconPhoto,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";

import { DeleteServerForm } from "@/components/delete-server-form";
import { MediaUploadForm } from "@/components/media-upload-form";
import { MemberPanel } from "@/components/member-panel";
import { ServerLogo } from "@/components/server-logo";
import { ServerManageForm } from "@/components/server-manage-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VerificationPanel } from "@/components/verification-panel";
import { formatEndpoint } from "@/lib/servers/format";
import { listServerMembers } from "@/lib/servers/members";
import { getManagedServerBySlug } from "@/lib/servers/queries";
import { getVerificationDisplay } from "@/lib/servers/verification";
import { requireServerSession } from "@/lib/session";

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

  const [members, javaVerification, bedrockVerification] = await Promise.all([
    server.role === "owner" || server.role === "admin"
      ? listServerMembers(server.id, session.user.id)
      : Promise.resolve([]),
    server.role === "owner"
      ? getVerificationDisplay(server.id, session.user.id)
      : Promise.resolve(null),
    server.role === "owner"
      ? getVerificationDisplay(server.id, session.user.id, "bedrock")
      : Promise.resolve(null),
  ]);

  return (
    <div className="app-shell">
      <SiteHeader />

      <main className="app-main page-shell px-4 pb-14 sm:px-6 lg:px-7 2xl:px-8">
        <div className="pt-7 sm:pt-8">
          <header className="flex flex-col gap-5 border-b border-[#e7ebef] pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link href="/dashboard/servers" className="inline-flex min-h-8 items-center gap-1.5 text-[0.6875rem] font-medium text-[#68758b] transition hover:text-[#2d34cf]">
                <IconArrowLeft aria-hidden="true" size="0.9375rem" stroke={1.8} />
                Back to managed servers
              </Link>

              <div className="mt-5 flex items-center gap-3.5">
                <ServerLogo name={server.name} media={server.media} className="h-14 w-14 rounded-xl sm:h-16 sm:w-16" />
                <div className="min-w-0">
                  <p className="text-[0.625rem] font-semibold uppercase tracking-[0.13em] text-[#2d34cf]">Server workspace</p>
                  <h1 className="mt-1 truncate text-[1.875rem] font-bold leading-none tracking-[-0.06em] text-[#101722] sm:text-[2.25rem]">Manage {server.name}</h1>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.6875rem] text-[#667287]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe4ea] bg-[#fafbfc] px-2.5 py-1">
                  <span className="font-medium text-[#35415b]">Role:</span>
                  <span className="capitalize font-semibold text-[#17202a]">{server.role}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe4ea] bg-[#fafbfc] px-2.5 py-1">
                  <span className="font-medium text-[#35415b]">Verification:</span>
                  <span className="capitalize font-semibold text-[#17202a]">{server.verificationStatus}</span>
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${server.publicationStatus === "published" ? "bg-[#e6f8ef] text-[#0c8950]" : "bg-[#fff4df] text-[#9a6717]"}`}>
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${server.publicationStatus === "published" ? "bg-[#0e9a55]" : "bg-[#d18b1d]"}`} />
                  {publicationLabel(server.publicationStatus)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {server.publicationStatus === "published" ? (
                <Link href={`/servers/${server.slug}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#cbd2ff] bg-white px-3.5 text-[0.6875rem] font-semibold text-[#2d34cf] transition hover:bg-[#f0f1ff]">
                  <IconEye aria-hidden="true" size="1rem" stroke={1.7} />
                  View public page
                  <IconExternalLink aria-hidden="true" size="0.875rem" stroke={1.7} />
                </Link>
              ) : (
                <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e0e6eb] bg-[#fafbfc] px-3.5 text-[0.6875rem] font-medium text-[#7a8698]">
                  <IconEye aria-hidden="true" size="1rem" stroke={1.7} />
                  Draft preview
                </span>
              )}
            </div>
          </header>

          <nav className="mt-5 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Manage server sections">
            <SectionLink href="#details" icon={<IconFileText aria-hidden="true" size="0.9375rem" stroke={1.7} />}>Details</SectionLink>
            <SectionLink href="#media" icon={<IconPhoto aria-hidden="true" size="0.9375rem" stroke={1.7} />}>Branding</SectionLink>
            {server.role === "owner" ? <SectionLink href="#verification" icon={<IconShieldCheck aria-hidden="true" size="0.9375rem" stroke={1.7} />}>Verification</SectionLink> : null}
            {(server.role === "owner" || server.role === "admin") ? <SectionLink href="#team" icon={<IconUsers aria-hidden="true" size="0.9375rem" stroke={1.7} />}>Members</SectionLink> : null}
          </nav>

          <div className="mt-5 grid gap-2.5">
            {query.created ? <Notice>Draft created. Review it and publish it when ready.</Notice> : null}
            {query.updated ? <Notice>Server details saved.</Notice> : null}
            {query.verification === "verified" ? <Notice>Ownership verified. You can remove the code from the MOTD.</Notice> : null}
            {query.verification === "code_not_found" ? <Notice tone="warning">The code was not found in the MOTD.</Notice> : null}
            {query.verification === "offline" ? <Notice tone="warning">The server was offline or did not respond in time.</Notice> : null}
            {query.verification === "timeout" ? <Notice tone="warning">The check timed out before the server responded.</Notice> : null}
            {query.verification === "blocked_target" ? <Notice tone="warning">This target is blocked because it is not a public server address.</Notice> : null}
            {query.verification === "invalid_response" ? <Notice tone="warning">The server returned an invalid status response.</Notice> : null}
            {query.verification === "endpoint_taken" ? <Notice tone="warning">That endpoint is already verified by another server.</Notice> : null}
            {query.verification === "stale" ? <Notice tone="warning">That verification is no longer active. Generate a new code.</Notice> : null}
            {query.verification === "expired" ? <Notice tone="warning">The verification code has expired. Generate a new one.</Notice> : null}
            {query.verificationError === "already-verified" ? <Notice>This endpoint is already verified; you do not need to generate another code.</Notice> : null}
            {query.verificationError === "pending" ? <Notice tone="warning">There is already a pending code for this endpoint. Add it to the MOTD before checking.</Notice> : null}
            {query.verificationError && query.verificationError !== "already-verified" && query.verificationError !== "pending" ? <Notice tone="warning">Verification could not start or complete: {query.verificationError.replaceAll("-", " ")}.</Notice> : null}
            {query.memberUpdated ? <Notice>Member list updated.</Notice> : null}
            {query.memberError ? <Notice tone="warning">Member action failed: {query.memberError.replaceAll("-", " ")}.</Notice> : null}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_17.875rem] lg:items-start">
            <div className="min-w-0 space-y-5">
              <section id="details" className="scroll-mt-5 rounded-2xl border border-[#e0e6eb] bg-white p-5 shadow-[0_0.0625rem_0.125rem_rgba(16,30,45,0.02)] sm:p-6">
                <PanelHeading eyebrow="Core listing" title="Server details" description="Keep the public listing clear, useful and ready for players to join." />
                <div className="mt-6"><ServerManageForm server={server} /></div>
              </section>

              <div id="media" className="scroll-mt-5"><MediaUploadForm serverId={server.id} /></div>

              {server.role === "owner" ? (
                <div id="verification" className="scroll-mt-5 space-y-5">
                  <VerificationPanel serverId={server.id} slug={server.slug} verification={javaVerification} edition="java" />
                  <VerificationPanel serverId={server.id} slug={server.slug} verification={bedrockVerification} edition="bedrock" />
                </div>
              ) : null}

              {(server.role === "owner" || server.role === "admin") ? <div id="team" className="scroll-mt-5"><MemberPanel serverId={server.id} slug={server.slug} members={members} canManage={server.role === "owner"} /></div> : null}

              {server.role === "owner" ? <DeleteServerForm serverId={server.id} slug={server.slug} /> : null}
            </div>

  <aside className="order-first min-w-0 lg:order-none lg:sticky lg:top-5 lg:self-start">
    <div className="space-y-4">
                <section className="rounded-2xl border border-[#e0e6eb] bg-[#fbfcff] p-5" aria-labelledby="workspace-summary">
                  <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[#7a86a0]">Public preview</p>
                  <div className="mt-4 flex items-center gap-3">
                    <ServerLogo name={server.name} media={server.media} className="h-11 w-11 rounded-lg" />
                    <div className="min-w-0">
                      <h2 id="workspace-summary" className="truncate text-[0.875rem] font-semibold text-[#17202a]">{server.name}</h2>
                      <p className="mt-0.5 text-[0.625rem] text-[#7a8698]">/{server.slug}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-[#e2e7ec] bg-white p-3">
                    <div className="flex items-center justify-between gap-3 text-[0.6875rem]">
                      <span className="text-[#68758b]">Listing status</span>
                      <span className={`font-semibold ${server.publicationStatus === "published" ? "text-[#0c8950]" : "text-[#9a6717]"}`}>{publicationLabel(server.publicationStatus)}</span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-3 text-[0.6875rem]">
                      <span className="text-[#68758b]">Verified identity</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#0c8950]"><IconCheck aria-hidden="true" size="0.875rem" stroke={2} />{server.verificationStatus === "verified" ? "Ready" : "Pending"}</span>
                    </div>
                  </div>
                  {server.publicationStatus === "published" ? <Link href={`/servers/${server.slug}`} className="mt-3 inline-flex h-10 w-full items-center justify-between rounded-lg bg-[#3029e7] px-3.5 text-[0.6875rem] font-semibold text-white shadow-[0_0.3125rem_0.75rem_rgba(48,41,231,0.14)] transition hover:bg-[#2821c8]">Open public page <IconChevronRight aria-hidden="true" size="1rem" stroke={1.8} /></Link> : <p className="mt-3 rounded-lg bg-[#fff4df] px-3 py-2.5 text-[0.625rem] leading-4 text-[#8b641e]">Publish the listing from Server details when it is ready to be discovered.</p>}
                </section>

                <section className="rounded-2xl border border-[#e0e6eb] bg-white p-5" aria-labelledby="workspace-nav-heading">
                  <h2 id="workspace-nav-heading" className="text-[0.875rem] font-semibold tracking-[-0.02em] text-[#17202a]">Workspace</h2>
                  <p className="mt-1.5 text-[0.6875rem] leading-5 text-[#718097]">Make changes, verify ownership and keep your team in sync.</p>
                  <div className="mt-4 grid gap-1">
                    <RailLink href="#details" icon={<IconFileText aria-hidden="true" size="1rem" stroke={1.7} />}>Edit listing</RailLink>
                    <RailLink href="#media" icon={<IconPhoto aria-hidden="true" size="1rem" stroke={1.7} />}>Manage branding</RailLink>
                    {server.role === "owner" ? <RailLink href="#verification" icon={<IconShieldCheck aria-hidden="true" size="1rem" stroke={1.7} />}>Verify endpoints</RailLink> : null}
                    {(server.role === "owner" || server.role === "admin") ? <RailLink href="#team" icon={<IconUsers aria-hidden="true" size="1rem" stroke={1.7} />}>Manage members</RailLink> : null}
                  </div>
                </section>

                <section className="rounded-2xl border border-[#e0e6eb] bg-white p-5" aria-labelledby="connection-summary-heading">
                  <h2 id="connection-summary-heading" className="text-[0.875rem] font-semibold tracking-[-0.02em] text-[#17202a]">Connection</h2>
                  <p className="mt-1.5 text-[0.6875rem] leading-5 text-[#718097]">The addresses currently attached to this listing.</p>
                  <div className="mt-4 grid gap-2.5">
                    {server.endpoints.length ? server.endpoints.map((endpoint) => (
                      <div key={endpoint.edition} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[#e3e7ec] bg-[#fbfcff] px-3 py-2.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${endpoint.verificationStatus === "verified" ? "bg-[#0e9a55]" : "bg-[#d18b1d]"}`} />
                        <div className="min-w-0">
                          <p className="text-[0.625rem] font-semibold capitalize text-[#35415b]">{endpoint.edition}</p>
                          <code className="mt-0.5 block truncate text-[0.625rem] text-[#718097]">{formatEndpoint(endpoint)}</code>
                        </div>
                      </div>
                    )) : <p className="rounded-lg bg-[#f5f7f9] p-3 text-[0.6875rem] text-[#6c788b]">No connection addresses yet.</p>}
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function Notice({ children, tone = "normal" }: { children: React.ReactNode; tone?: "normal" | "warning" }) {
  return <p className={`ui-notice px-3 py-2.5 text-[0.6875rem] leading-5 ${tone === "warning" ? "ui-notice-warning" : ""}`}>{children}</p>;
}

function publicationLabel(status: "draft" | "published" | "hidden") {
  if (status === "published") return "Published";
  if (status === "hidden") return "Hidden";
  return "Draft";
}

function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="ui-eyebrow">{eyebrow}</p>
      <h2 className="mt-1.5 text-[1.25rem] font-semibold tracking-[-0.03em] text-[#101722]">{title}</h2>
      <p className="mt-1.5 max-w-[32.5rem] text-[0.75rem] leading-5 text-[#667287]">{description}</p>
    </div>
  );
}

function SectionLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <a href={href} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-transparent px-3 text-[0.6875rem] font-medium text-[#68758b] transition hover:border-[#dfe4ea] hover:bg-[#fafbfc] hover:text-[#2d34cf]">{icon}{children}</a>;
}

function RailLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <a href={href} className="group flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[0.6875rem] font-medium text-[#59677c] transition hover:bg-[#f1f2ff] hover:text-[#2d34cf]"><span className="text-[#7a86a0] transition group-hover:text-[#2d34cf]">{icon}</span><span className="flex-1">{children}</span><IconChevronRight aria-hidden="true" size="0.875rem" stroke={1.7} className="text-[#b0b8c5] transition group-hover:text-[#6c75dc]" /></a>;
}
