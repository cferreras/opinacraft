"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  IconCube3dSphere,
  IconMenu2,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

const navigation = [{ label: "Servidores", href: "/servers" }];

function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.04em] text-[#141b23]">
      <IconCube3dSphere aria-hidden="true" className="text-[#172ee5]" size={27} stroke={1.7} />
      OpinaCraft
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    router.push(nextQuery ? `/servers?q=${encodeURIComponent(nextQuery)}` : "/servers");
    setSearchOpen(false);
  }

  return (
    <header className="relative z-30 border-b border-[#e4e8eb] bg-white">
      <div className="mx-auto hidden h-[76px] w-full max-w-[1180px] items-center px-7 md:flex">
        <Link href="/" aria-label="OpinaCraft, inicio">
          <Brand />
        </Link>

        <nav className="ml-14 flex h-full items-stretch gap-7" aria-label="Navegación principal">
          {navigation.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`relative inline-flex items-center px-1 text-[13px] transition-colors ${
                  active
                    ? "font-semibold text-[#182de0] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#182de0]"
                    : "text-[#56616e] hover:text-[#141b23]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form onSubmit={submitSearch} className="mx-auto flex h-[38px] w-full max-w-[460px] items-center rounded-lg border border-[#dce2e7] bg-white px-3.5 shadow-[0_1px_2px_rgba(20,30,40,0.02)] focus-within:border-[#4655e8] focus-within:ring-2 focus-within:ring-[#4655e8]/10">
          <IconSearch aria-hidden="true" className="shrink-0 text-[#56657b]" size={18} stroke={1.7} />
          <label htmlFor="header-search" className="sr-only">Buscar servidores</label>
          <input
            id="header-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            className="ml-3 h-full min-w-0 flex-1 bg-transparent text-[12px] text-[#27324a] outline-none placeholder:text-[#5e6a80]"
          />
        </form>

        <div className="ml-7 flex shrink-0 items-center gap-5">
          <Link href="/sign-in" className="text-[12px] text-[#26304b] transition-colors hover:text-[#182de0]">
            Iniciar sesión
          </Link>
          <Link href="/servers/new" className="inline-flex h-9 items-center rounded-[7px] bg-[#2d2de4] px-4 text-[12px] font-semibold text-white shadow-[0_3px_8px_rgba(45,45,228,0.18)] transition hover:bg-[#2424c9]">
            Añadir servidor
          </Link>
        </div>
      </div>

      <div className="mx-auto flex h-[58px] w-full max-w-[1180px] items-center justify-between px-4 md:hidden">
        <button
          type="button"
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#536177] transition hover:bg-[#f2f5f6] hover:text-[#141b23]"
        >
          {menuOpen ? <IconX aria-hidden="true" size={20} /> : <IconMenu2 aria-hidden="true" size={20} />}
        </button>
        <Link href="/" aria-label="OpinaCraft, inicio">
          <Brand />
        </Link>
        <button
          type="button"
          aria-label="Buscar servidores"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((open) => !open)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#536177] transition hover:bg-[#f2f5f6] hover:text-[#141b23]"
        >
          <IconSearch aria-hidden="true" size={18} stroke={1.7} />
        </button>
      </div>

      {searchOpen ? (
        <form onSubmit={submitSearch} className="border-t border-[#edf0f2] bg-white px-4 py-3 md:hidden">
          <div className="flex h-10 items-center rounded-lg border border-[#dce2e7] px-3">
            <IconSearch aria-hidden="true" className="text-[#56657b]" size={17} />
            <label htmlFor="mobile-header-search" className="sr-only">Buscar servidores</label>
            <input id="mobile-header-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" className="ml-2 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#7d8795]" />
          </div>
        </form>
      ) : null}

      {menuOpen ? (
        <div id="mobile-navigation" className="absolute inset-x-0 top-full border-b border-[#e4e8eb] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(21,35,45,0.08)] md:hidden">
          <nav className="grid gap-1" aria-label="Navegación móvil">
            {navigation.map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="rounded-md bg-[#f1f2ff] px-3 py-2.5 text-sm font-semibold text-[#2830cf]">
                {item.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#edf0f2] pt-3">
              <Link href="/sign-in" onClick={() => setMenuOpen(false)} className="inline-flex h-10 items-center justify-center rounded-md border border-[#dbe1e5] text-sm font-medium text-[#33404c]">
                Iniciar sesión
              </Link>
              <Link href="/servers/new" onClick={() => setMenuOpen(false)} className="inline-flex h-10 items-center justify-center rounded-md bg-[#2d2de4] text-sm font-semibold text-white">
                Añadir servidor
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
