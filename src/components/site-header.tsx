"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconBrandDiscord, IconBrandTiktok, IconBrandYoutube } from "@tabler/icons-react";
import {
  BookOpen,
  ChevronRight,
  LayoutGrid,
  Menu,
  Plus,
  Server,
  ShieldCheck,
  User,
  X,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { BrandMark } from "@/components/brand-mark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeMenuItems, ThemeSegmented } from "@/components/theme-toggle";
import { discordInviteUrl, tiktokProfileUrl, youtubeChannelUrl } from "@/lib/site/community";

const navigation = [
  { label: "Servidores", href: "/", icon: LayoutGrid },
  { label: "Blog", href: "/blog", icon: BookOpen },
  { label: "Mis servidores", href: "/dashboard/servers", icon: Server },
] as const;

const communityLinks = [
  { label: "Únete a nuestro Discord", href: discordInviteUrl, icon: IconBrandDiscord },
  { label: "Nuestro canal de YouTube", href: youtubeChannelUrl, icon: IconBrandYoutube },
  { label: "Síguenos en TikTok", href: tiktokProfileUrl, icon: IconBrandTiktok },
] as const;

type PlatformRole = "moderator" | "admin";

const moderationNavigation = { label: "Moderación", href: "/admin", icon: ShieldCheck } as const;

type NavigationItem = (typeof navigation)[number] | typeof moderationNavigation;

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-[1.0625rem] font-extrabold tracking-[-0.02em]">
      <BrandMark size={compact ? 24 : 26} className="text-primary" />
      {!compact && <span>OpinaCraft</span>}
    </span>
  );
}

function isNavigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || (pathname.startsWith("/servers/") && pathname !== "/servers/new" && !pathname.endsWith("/manage"));
  if (href === "/dashboard/servers") return pathname.startsWith("/dashboard") || pathname.endsWith("/manage");
  if (href === "/servers/new") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function avatarLabel(session: { user?: { name?: string | null; email?: string | null } } | null | undefined) {
  const value = session?.user?.name || session?.user?.email || "OC";
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "OC";
}

// `Mis servidores` points at `/dashboard/servers`, which robots.txt disallows. Rendering it to
// everyone meant every crawl of every page followed a link it was then told to ignore; it is also
// no use to someone who is not signed in.
function visibleNavigation(signedIn: boolean) {
  return signedIn ? navigation : navigation.filter((item) => item.href !== "/dashboard/servers");
}

function NavigationLinks({ pathname, signedIn }: { pathname: string; signedIn: boolean }) {
  return (
    <nav aria-label="Navegación principal" className="flex h-16 items-stretch gap-5.25">
      {visibleNavigation(signedIn).map((item) => {
        const active = isNavigationActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center rounded-sm text-sm font-semibold transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNavigationSection({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: readonly NavigationItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div>
      <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="grid gap-1">
        {items.map((item) => {
          const active = isNavigationActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Button
              key={item.href}
              variant="ghost"
              asChild
              className={`relative h-10 w-full justify-start gap-3 rounded-md px-3 ${active ? "bg-accent text-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary hover:bg-accent" : "text-foreground"}`}
            >
              <Link href={item.href} aria-current={active ? "page" : undefined} onClick={onNavigate}>
                <Icon className={`size-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function MobileNavigation({ pathname, canModerate, signedIn, onNavigate }: { pathname: string; canModerate: boolean; signedIn: boolean; onNavigate: () => void }) {
  const publicItems: readonly NavigationItem[] = [navigation[0], navigation[1]];
  const managementItems: readonly NavigationItem[] = signedIn
    ? canModerate
      ? [navigation[2], moderationNavigation]
      : [navigation[2]]
    : [];

  return (
    <nav aria-label="Navegación móvil" className="space-y-5">
      <MobileNavigationSection label="Explorar" items={publicItems} pathname={pathname} onNavigate={onNavigate} />
      {managementItems.length > 0 ? <MobileNavigationSection label="Gestionar" items={managementItems} pathname={pathname} onNavigate={onNavigate} /> : null}
    </nav>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [platformAccess, setPlatformAccess] = useState<{ userId: string; role: PlatformRole | null }>({ userId: "", role: null });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const userId = session?.user?.id;

    if (!userId) {
      return () => { active = false; };
    }

    void fetch("/api/account/platform-role", { cache: "no-store" })
      .then(async (response) => (response.ok ? (await response.json()) as { role?: string | null } : null))
      .then((result) => {
        if (!active) return;
        setPlatformAccess({ userId, role: result?.role === "admin" || result?.role === "moderator" ? result.role : null });
      })
      .catch(() => {
        if (active) setPlatformAccess({ userId, role: null });
      });

    return () => { active = false; };
  }, [session?.user?.id]);

  const displayName = session?.user?.name || session?.user?.email?.split("@")[0] || "Invitado";
  const canModerate = platformAccess.userId === session?.user?.id && platformAccess.role !== null;

  return (
    <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6 lg:gap-3 lg:px-8">
        <Link href="/" aria-label="OpinaCraft, inicio" className="mr-auto inline-flex shrink-0 items-center lg:mr-0"><Brand compact={false} /></Link>

        <div className="ml-5.5 hidden lg:block"><NavigationLinks pathname={pathname} signedIn={Boolean(session)} /></div>

        <div className="ml-auto hidden items-center gap-1 lg:flex">
          {communityLinks.map((item) => (
            <Button key={item.href} variant="ghost" size="icon" asChild className="size-10 text-muted-foreground hover:text-foreground">
              <a href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.label} title={item.label}><item.icon aria-hidden="true" className="size-5" /></a>
            </Button>
          ))}
        </div>

        {sessionPending ? <Skeleton className="size-8 rounded-full" /> : session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="hidden h-10 gap-2 px-1.5 lg:inline-flex" aria-label="Abrir mi perfil">
                <Avatar className="size-7"><AvatarImage src={session.user.image ?? undefined} alt="" /><AvatarFallback>{avatarLabel(session)}</AvatarFallback></Avatar>
                <span className="max-w-28 truncate text-sm font-semibold">{displayName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild><Link href="/profile"><User className="size-4" /> Mi perfil</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/dashboard/servers"><Server className="size-4" /> Mis servidores</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/servers/new"><Plus className="size-4" /> Publicar servidor</Link></DropdownMenuItem>
              {canModerate ? <DropdownMenuItem asChild><Link href="/admin"><ShieldCheck className="size-4" /> Moderación</Link></DropdownMenuItem> : null}
              <DropdownMenuSeparator />
              <ThemeMenuItems />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild className="hidden h-10 rounded-[0.625rem] bg-foreground px-4 text-sm font-bold text-background hover:bg-foreground/90 lg:inline-flex">
            <Link href="/sign-in">Iniciar sesión</Link>
          </Button>
        )}

        {/* A phone bar has room for one: Discord. The menu carries every community link. */}
        <Button variant="ghost" size="icon" asChild className="size-11 lg:hidden">
          <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer" aria-label="Únete a nuestro Discord"><IconBrandDiscord aria-hidden="true" className="size-5" /></a>
        </Button>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-2 size-11 lg:hidden" aria-label="Abrir menú"><Menu className="size-5" /></Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="gap-0 overflow-hidden bg-background p-0 data-[side=right]:w-[calc(100%_-_2rem)] data-[side=right]:max-w-80 data-[side=right]:sm:inset-y-auto data-[side=right]:sm:right-3 data-[side=right]:sm:top-3 data-[side=right]:sm:h-auto data-[side=right]:sm:max-h-[calc(100vh_-_1.5rem)] data-[side=right]:sm:max-w-80 data-[side=right]:sm:rounded-xl data-[side=right]:sm:border"
          >
            <SheetClose asChild>
              <Button variant="ghost" size="icon-lg" className="absolute right-3 top-3 z-10 size-10" aria-label="Cerrar menú">
                <X className="size-4" />
              </Button>
            </SheetClose>
            <SheetHeader className="border-b px-5 py-5 pr-16 text-left">
              <SheetTitle><Brand /></SheetTitle>
              <SheetDescription>Encuentra, publica y gestiona servidores.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-5">
              <MobileNavigation pathname={pathname} canModerate={canModerate} signedIn={Boolean(session)} onNavigate={() => setMenuOpen(false)} />
              <div>
                <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tema</p>
                <ThemeSegmented className="mx-3" />
              </div>
              <div>
                <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Síguenos</p>
                <div className="flex gap-1 px-1.5">
                  {communityLinks.map((item) => (
                    <Button key={item.href} variant="ghost" size="icon" asChild className="size-11 text-muted-foreground hover:text-foreground">
                      <a href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.label}><item.icon aria-hidden="true" className="size-5" /></a>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-auto border-t p-4">
              {session ? (
                <Button variant="ghost" asChild className="mb-3 h-auto w-full justify-start gap-3 px-2 py-2">
                  <Link href="/profile" onClick={() => setMenuOpen(false)}>
                    <Avatar className="size-9"><AvatarImage src={session.user.image ?? undefined} alt="" /><AvatarFallback className="bg-accent font-semibold text-accent-foreground">{avatarLabel(session)}</AvatarFallback></Avatar>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-semibold">{displayName}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">Cuenta y preferencias</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </Button>
              ) : (
                <Button asChild className="mb-3 h-10 w-full rounded-[0.625rem] bg-foreground font-bold text-background hover:bg-foreground/90"><Link href="/sign-in" onClick={() => setMenuOpen(false)}>Iniciar sesión</Link></Button>
              )}
              <Button asChild variant="outline" size="lg" className="h-10 w-full shadow-none">
                <Link href="/servers/new" onClick={() => setMenuOpen(false)}><Plus className="size-4" /> Publicar servidor</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
