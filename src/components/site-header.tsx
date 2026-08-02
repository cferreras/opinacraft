"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  IconChevronDown,
  IconHelpCircle,
  IconLayoutDashboard,
  IconMenu2,
  IconPlus,
  IconSearch,
  IconServer,
  IconSettings,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";

import { authClient } from "@/lib/auth-client";

const navigation = [
  { label: "Inicio", href: "/", icon: IconLayoutDashboard },
  { label: "Explorar", href: "/servers", icon: IconSearch },
  { label: "Mis servidores", href: "/dashboard/servers", icon: IconServer },
] as const;

const workspaceNavigation = [
  { label: "Publicar servidor", href: "/servers/new", icon: IconPlus },
  { label: "Moderación", href: "/admin", icon: IconShieldCheck },
  { label: "Mi perfil", href: "/profile", icon: IconSettings },
] as const;

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`app-brand ${compact ? "app-brand-compact" : ""}`}>
      <Image
        src="/brand/opinacraft-mark-v2-faceted.svg"
        alt=""
        aria-hidden="true"
        width={compact ? 25 : 30}
        height={compact ? 25 : 30}
        priority
        className="app-brand-mark"
      />
      <span className="app-brand-name">OpinaCraft</span>
    </span>
  );
}

function isNavigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/dashboard/servers") {
    return pathname.startsWith("/dashboard") || pathname.endsWith("/manage");
  }
  if (href === "/servers/new") return pathname === href;
  if (href === "/servers") {
    return pathname === href || (
      pathname.startsWith("/servers/") &&
      pathname !== "/servers/new" &&
      !pathname.endsWith("/manage")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function avatarLabel(session: { user?: { name?: string | null; email?: string | null } } | null | undefined) {
  const value = session?.user?.name || session?.user?.email || "OC";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "OC";
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const desktopSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (window.matchMedia("(max-width: 1023px)").matches) {
          setSearchOpen(true);
          setMenuOpen(false);
        } else {
          desktopSearchRef.current?.focus();
        }
      }

      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    router.push(nextQuery ? `/servers?q=${encodeURIComponent(nextQuery)}` : "/servers");
    setSearchOpen(false);
    setMenuOpen(false);
  }

  const displayName = session?.user?.name || session?.user?.email?.split("@")[0] || "Invitado";
  const initials = avatarLabel(session);

  return (
    <header className="app-topbar">
      <div className="app-topbar-desktop">
        <Link href="/" aria-label="OpinaCraft, inicio" className="app-topbar-brand">
          <Brand />
        </Link>

        <nav className="app-topbar-nav" aria-label="Navegación principal">
          {navigation.map((item) => {
            const active = isNavigationActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`app-topbar-nav-link ${active ? "is-active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form onSubmit={submitSearch} className="app-topbar-search">
          <IconSearch aria-hidden="true" size={17} stroke={1.8} />
          <label htmlFor="header-search" className="sr-only">Buscar servidores</label>
          <input
            ref={desktopSearchRef}
            id="header-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Buscar servidores"
          />
          <span className="app-search-shortcut" aria-hidden="true">Ctrl K</span>
        </form>

        <div className="app-topbar-actions">
          <Link href="/contact" className="app-icon-button" aria-label="Ayuda" title="Ayuda">
            <IconHelpCircle aria-hidden="true" size={18} stroke={1.7} />
          </Link>
          <Link href="/servers/new" className="app-topbar-publish">
            <IconPlus aria-hidden="true" size={15} stroke={2} />
            Publicar
          </Link>
          {sessionPending ? (
            <span className="app-account-loading" aria-label="Cargando cuenta" role="status" />
          ) : session ? (
            <Link href="/profile" className="app-account-chip" aria-label="Abrir mi perfil">
              <span className="app-avatar" aria-hidden="true">{initials}</span>
              <span className="app-account-chip-copy"><strong>{displayName}</strong><small>Mi perfil</small></span>
              <IconChevronDown aria-hidden="true" size={15} stroke={1.8} />
            </Link>
          ) : (
            <Link href="/sign-in" className="app-sign-in-link">Iniciar sesión</Link>
          )}
        </div>
      </div>

      <div className="app-topbar-mobile">
        <button
          type="button"
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => {
            setMenuOpen((open) => !open);
            setSearchOpen(false);
          }}
          className="app-icon-button"
        >
          {menuOpen ? <IconX aria-hidden="true" size={20} /> : <IconMenu2 aria-hidden="true" size={20} />}
        </button>
        <Link href="/" aria-label="OpinaCraft, inicio"><Brand compact /></Link>
        <button
          type="button"
          aria-label="Buscar servidores"
          aria-expanded={searchOpen}
          aria-controls="mobile-header-search-form"
          onClick={() => {
            setSearchOpen((open) => !open);
            setMenuOpen(false);
          }}
          className="app-icon-button"
        >
          <IconSearch aria-hidden="true" size={19} stroke={1.7} />
        </button>
      </div>

      {searchOpen ? (
        <form id="mobile-header-search-form" onSubmit={submitSearch} className="app-mobile-search">
          <IconSearch aria-hidden="true" size={17} stroke={1.8} />
          <label htmlFor="mobile-header-search" className="sr-only">Buscar servidores</label>
          <input
            id="mobile-header-search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Buscar servidores"
          />
        </form>
      ) : null}

      {menuOpen ? (
        <div id="mobile-navigation" className="app-mobile-menu">
          <nav aria-label="Navegación móvil" className="app-mobile-menu-list">
            {[...navigation, ...workspaceNavigation].map((item) => {
              const active = isNavigationActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`app-mobile-menu-link ${active ? "is-active" : ""}`}
                >
                  <Icon aria-hidden="true" size={18} stroke={1.7} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="app-mobile-menu-actions">
            {session ? <Link href="/profile" onClick={() => setMenuOpen(false)} className="ui-button-secondary">Mi perfil</Link> : <Link href="/sign-in" onClick={() => setMenuOpen(false)} className="ui-button-secondary">Iniciar sesión</Link>}
            <Link href="/servers/new" onClick={() => setMenuOpen(false)} className="ui-button-primary">Publicar</Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
