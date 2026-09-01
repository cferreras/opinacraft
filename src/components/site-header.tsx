"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  Menu,
  Plus,
  Search,
  Server,
  ShieldCheck,
  User,
  X,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { BrandMark } from "@/components/brand-mark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { label: "Mis servidores", href: "/dashboard/servers", icon: Server },
  { label: "Blog", href: "/blog", icon: BookOpen },
] as const;

type PlatformRole = "moderator" | "admin";

const moderationNavigation = { label: "Moderación", href: "/admin", icon: ShieldCheck } as const;

type NavigationItem = (typeof navigation)[number] | typeof moderationNavigation;

const emptySubscribe = () => () => {};
const getMacPlatform = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const getServerPlatform = () => false;

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-[0.9375rem] font-bold tracking-tight">
      <BrandMark size={compact ? 26 : 28} className="text-primary" />
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

function NavigationLinks({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Navegación principal" className="flex h-16 items-stretch gap-0.5">
      {navigation.map((item) => {
        const active = isNavigationActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center rounded-sm px-3 text-sm transition-colors ${active ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"}`}
          >
            {item.label}
            {active ? <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 rounded-t-full bg-primary" /> : null}
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

function MobileNavigation({ pathname, canModerate, onNavigate }: { pathname: string; canModerate: boolean; onNavigate: () => void }) {
  const publicItems: readonly NavigationItem[] = [navigation[1]];
  const managementItems: readonly NavigationItem[] = canModerate
    ? [navigation[0], moderationNavigation]
    : [navigation[0]];

  return (
    <nav aria-label="Navegación móvil" className="space-y-5">
      <MobileNavigationSection label="Explorar" items={publicItems} pathname={pathname} onNavigate={onNavigate} />
      <MobileNavigationSection label="Gestionar" items={managementItems} pathname={pathname} onNavigate={onNavigate} />
    </nav>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [platformAccess, setPlatformAccess] = useState<{ userId: string; role: PlatformRole | null }>({ userId: "", role: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const isMac = useSyncExternalStore(emptySubscribe, getMacPlatform, getServerPlatform);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (window.matchMedia("(max-width: 1023px)").matches) setSearchOpen(true);
        else desktopSearchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    router.push(nextQuery ? `/?q=${encodeURIComponent(nextQuery)}` : "/");
    setSearchOpen(false);
    setMenuOpen(false);
  }

  const displayName = session?.user?.name || session?.user?.email?.split("@")[0] || "Invitado";
  const canModerate = platformAccess.userId === session?.user?.id && platformAccess.role !== null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú"><Menu className="size-5" /></Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="gap-0 overflow-hidden bg-background p-0 data-[side=left]:w-[calc(100%_-_2rem)] data-[side=left]:max-w-80 data-[side=left]:sm:inset-y-auto data-[side=left]:sm:left-3 data-[side=left]:sm:top-3 data-[side=left]:sm:h-auto data-[side=left]:sm:max-h-[calc(100vh_-_1.5rem)] data-[side=left]:sm:max-w-80 data-[side=left]:sm:rounded-xl data-[side=left]:sm:border"
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
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
              <MobileNavigation pathname={pathname} canModerate={canModerate} onNavigate={() => setMenuOpen(false)} />
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
                <Button variant="outline" asChild className="mb-3 h-10 w-full"><Link href="/sign-in" onClick={() => setMenuOpen(false)}>Iniciar sesión</Link></Button>
              )}
              <Button asChild size="lg" className="h-10 w-full shadow-none">
                <Link href="/servers/new" onClick={() => setMenuOpen(false)}><Plus className="size-4" /> Publicar servidor</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/" aria-label="OpinaCraft, inicio" className="inline-flex shrink-0 items-center"><Brand compact={false} /></Link>
        <div className="hidden lg:block"><NavigationLinks pathname={pathname} /></div>

        <form onSubmit={submitSearch} className="relative ml-auto hidden w-full max-w-xs lg:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="header-search" className="sr-only">Buscar servidores</label>
          <Input ref={desktopSearchRef} id="header-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar servidores" className="h-9 bg-muted pl-8 pr-14" />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground">{isMac ? "⌘ K" : "Ctrl K"}</kbd>
        </form>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border lg:block" />
          <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex"><Link href="/contact" aria-label="Ayuda"><CircleHelp className="size-4" /></Link></Button>
          <ThemeToggle />
          <Button size="lg" asChild className="hidden sm:inline-flex"><Link href="/servers/new"><Plus className="size-4" /> Publicar</Link></Button>
          {sessionPending ? <Skeleton className="size-8 rounded-full" /> : session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Abrir mi perfil">
                  <Avatar className="size-7"><AvatarImage src={session.user.image ?? undefined} alt="" /><AvatarFallback>{avatarLabel(session)}</AvatarFallback></Avatar>
                  <span className="hidden max-w-28 truncate text-sm font-medium md:inline">{displayName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem asChild><Link href="/profile"><User className="size-4" /> Mi perfil</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/dashboard/servers"><Server className="size-4" /> Mis servidores</Link></DropdownMenuItem>
                {canModerate ? <DropdownMenuItem asChild><Link href="/admin"><ShieldCheck className="size-4" /> Moderación</Link></DropdownMenuItem> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex"><Link href="/sign-in">Iniciar sesión</Link></Button>}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSearchOpen(true)} aria-label="Buscar servidores"><Search className="size-5" /></Button>
        </div>
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Buscar servidores</DialogTitle>
            <DialogDescription>Busca por nombre, dirección o etiquetas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitSearch} className="flex gap-2">
            <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. survival" className="h-9" />
            <Button type="submit" size="lg"><Search className="size-4" /> Buscar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
