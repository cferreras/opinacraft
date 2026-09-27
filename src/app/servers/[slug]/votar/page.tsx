import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { ServerLogo } from "@/components/server-logo";
import { SiteHeader } from "@/components/site-header";
import { VoteForm } from "@/components/vote-form";
import { clientEnv } from "@/env/client";
import { requestIp } from "@/lib/search/request-ip";
import { ogCardImage, serverVoteCardPath } from "@/lib/og/model";
import { buildOpenGraph } from "@/lib/seo/open-graph";
import { getCachedPublishedServer } from "@/lib/servers/cached-queries";
import { getServerSession } from "@/lib/session";
import { getCachedServerVoteStats, votesEnabled } from "@/lib/votes/cached";
import { daysLeftLabel, monthlyReset } from "@/lib/votes/month";
import { getVoterCooldown, isVoteEligible } from "@/lib/votes/service";
import { rankLine } from "@/lib/votes/vote-copy";

type VotePageProps = { params: Promise<{ slug: string }> };

const overline = "text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground";

export async function generateMetadata({ params }: VotePageProps): Promise<Metadata> {
  const { slug } = await params;
  const server = votesEnabled() ? await getCachedPublishedServer(slug) : null;
  // A form behind a captcha has nothing for a search engine; the ficha is the page to rank.
  if (!server) return { title: "Servidor no encontrado | OpinaCraft", robots: { index: false, follow: false } };
  return {
    title: `Votar por ${server.name} | OpinaCraft`,
    robots: { index: false, follow: false },
    // Kept out of the index, but this is the link a server posts on its Discord to ask for votes.
    openGraph: buildOpenGraph({
      title: `Vota por ${server.name}`,
      description: "Vota cada día y ayúdale a subir en el ranking mensual de OpinaCraft.",
      path: `/servers/${server.slug}/votar`,
      images: ogCardImage(serverVoteCardPath(server.slug), `Vota por ${server.name} en OpinaCraft.`),
    }),
  };
}

export default async function VotePage({ params }: VotePageProps) {
  await connection();
  if (!votesEnabled()) notFound();
  const { slug } = await params;
  const server = await getCachedPublishedServer(slug);
  if (!server) notFound();

  const [eligible, session, requestHeaders] = await Promise.all([isVoteEligible(server.id), getServerSession(), headers()]);
  const crumbs = <Breadcrumbs trail={[{ label: "Servidores", href: "/" }, { label: server.name, href: `/servers/${server.slug}` }]} current="Votar" />;

  if (!eligible) {
    return (
      <PageShell>
        {crumbs}
        <section className="grid justify-items-center gap-4 rounded-xl bg-card px-4 py-8 text-center ring-1 ring-foreground/10 sm:px-8">
          <span className="flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning">
            <ShieldAlert aria-hidden="true" className="size-7" />
          </span>
          <h1 className="text-balance text-xl font-extrabold tracking-tight">Este servidor no puede recibir votos ahora mismo</h1>
          <p className="text-pretty text-[0.9375rem] text-muted-foreground">
            La dirección de {server.name} está pendiente de verificación. Solo los servidores con la dirección verificada entran en el ranking y aceptan votos.
          </p>
          <Button asChild variant="outline" className="h-11 px-5 font-bold">
            <Link href={`/servers/${server.slug}`}>Volver a la ficha de {server.name}</Link>
          </Button>
        </section>
      </PageShell>
    );
  }

  const now = new Date();
  const [stats, cooldown] = await Promise.all([
    getCachedServerVoteStats(server.id),
    getVoterCooldown(server.id, { ip: requestIp(requestHeaders), userId: session?.user.id ?? null, now }),
  ]);
  const reset = monthlyReset(now);

  return (
    <PageShell>
      {crumbs}
      <VoteForm
        slug={server.slug}
        serverName={server.name}
        monthName={reset.monthName}
        resetLabel={reset.resetLabel}
        daysLeft={daysLeftLabel(reset.daysLeft)}
        signedIn={Boolean(session)}
        turnstileSiteKey={clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        initialCooldown={cooldown ? { nickname: cooldown.nickname, votedAt: cooldown.votedAt.toISOString(), nextVoteAt: cooldown.nextVoteAt.toISOString() } : null}
        initialNow={now.toISOString()}
        header={(
          <header className="flex items-center gap-4">
            <ServerLogo name={server.name} media={server.media} size={56} monogram className="size-14 rounded-[0.8125rem] text-[1.5rem]" />
            <div className="grid min-w-0 gap-0.5">
              <p className={overline}>Vota por</p>
              <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">{server.name}</h1>
              <p className="text-[0.8125rem] font-semibold text-muted-foreground tabular-nums">{rankLine(stats.position, reset.monthName, stats.votes)}</p>
            </div>
          </header>
        )}
      />
    </PageShell>
  );
}

/** A narrow column: the page is one form, usually on a phone opened from a Discord link. */
function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 pb-14 pt-9 sm:px-6">{children}</main>
    </>
  );
}
