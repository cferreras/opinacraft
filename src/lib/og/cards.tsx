import type { CSSProperties, ReactNode } from "react";

import { BRAND_MARK_PATH } from "@/lib/brand/mark-path";
import { blogCategories } from "@/lib/blog/posts";

import { displayHost, ogColors as c, serverInitial, serverNameFontSize } from "./model";

/*
 * The share cards, as Satori JSX. Satori lays out flexbox only: every element with more than one
 * child is `display: flex`, there is no grid, and icons go in as SVG data URIs, which also keeps
 * the brand mark's even-odd cut-out intact.
 */

const mono = "'JetBrains Mono'";

function svgUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const markUri = (color: string) =>
  svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path fill="${color}" fill-rule="evenodd" d="${BRAND_MARK_PATH}"/></svg>`);

const starUri = (color: string) =>
  svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon fill="${color}" points="12 2 15.1 8.6 22 9.3 16.8 14 18.2 21 12 17.3 5.8 21 7.2 14 2 9.3 8.9 8.6"/></svg>`);

const strokeUri = (paths: string, color: string, width = 2) =>
  svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`);

const row: CSSProperties = { display: "flex", alignItems: "center" };
/** Satori only clamps text laid out as a block; one line ends in an ellipsis, more are cut. */
const oneLine: CSSProperties = { display: "block", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
const clamp = (lines: number): CSSProperties => ({ display: "block", lineClamp: lines });
const column: CSSProperties = { display: "flex", flexDirection: "column" };

function Frame({ children, direction = "column", gap = 0 }: { children: ReactNode; direction?: "row" | "column"; gap?: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: direction,
        justifyContent: "space-between",
        gap,
        padding: "60px 72px",
        position: "relative",
        backgroundColor: c.ground,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        color: c.text,
        fontFamily: "Manrope",
      }}
    >
      {children}
    </div>
  );
}

function Lockup({ size = 36, suffix }: { size?: number; suffix?: string }) {
  return (
    <div style={{ ...row, gap: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image */}
      <img src={markUri(c.accent)} width={size} height={size} alt="" />
      <span style={{ fontSize: Math.round(size * 0.67), fontWeight: 800, letterSpacing: -0.5 }}>OpinaCraft</span>
      {suffix ? <span style={{ fontSize: Math.round(size * 0.67), fontWeight: 500, color: c.muted }}>{suffix}</span> : null}
    </div>
  );
}

function Url({ path }: { path: string }) {
  return <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 500, color: c.accentInk }}>{`${displayHost()}${path}`}</span>;
}

function Eyebrow({ children, color = c.accentInk }: { children: string; color?: string }) {
  return <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color }}>{children}</span>;
}

function Star({ size, color = c.rating }: { size: number; color?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image
  return <img src={starUri(color)} width={size} height={size} alt="" />;
}

/** The server's logo, or its initial on the accent when it has none. */
function ServerMark({ name, logo, size, radius }: { name: string; logo: string | null; size: number; radius: number }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image
    return <img src={logo} width={size} height={size} alt="" style={{ borderRadius: radius, objectFit: "cover" }} />;
  }
  return (
    <div style={{ ...row, justifyContent: "center", width: size, height: size, flexShrink: 0, borderRadius: radius, background: c.accent, color: c.onAccent, fontSize: Math.round(size * 0.53), fontWeight: 800 }}>
      {serverInitial(name)}
    </div>
  );
}

function StatBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ ...column, flex: 1, gap: 8, padding: "22px 24px", borderRadius: 18, background: c.surface, border: `1px solid ${c.line}` }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: c.muted }}>{label}</span>
      <div style={{ ...row, gap: 8 }}>{children}</div>
    </div>
  );
}

const statValue: CSSProperties = { fontSize: 44, fontWeight: 800, lineHeight: 1 };

export type ServerCardData = {
  name: string;
  logo: string | null;
  address: string | null;
  status: "online" | "offline" | "unknown";
  rating: string | null;
  reviewCount: number;
  playersCurrent: number | null;
  playersMax: number | null;
  /** Null while the vote system is off: the box shows the game modes instead. */
  monthlyVotes: string | null;
  modes: string | null;
  editions: string;
};

export function ServerCard(data: ServerCardData) {
  const nameSize = serverNameFontSize(data.name);
  return (
    <Frame>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <Lockup />
        {data.status === "unknown" ? null : (
          <div style={{ ...row, gap: 10, fontSize: 20, fontWeight: 700, padding: "10px 18px", borderRadius: 999, background: data.status === "online" ? "rgba(47,191,120,0.14)" : "rgba(240,122,106,0.14)", color: data.status === "online" ? c.accentInk : c.offline }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: data.status === "online" ? c.accent : c.offline }} />
            {data.status === "online" ? "En línea" : "Fuera de línea"}
          </div>
        )}
      </div>
      <div style={{ ...row, gap: 28 }}>
        <ServerMark name={data.name} logo={data.logo} size={120} radius={24} />
        <div style={{ ...column, gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: nameSize, lineHeight: 1.02, fontWeight: 800, letterSpacing: -nameSize * 0.03, ...clamp(2) }}>{data.name}</span>
          {data.address ? <span style={{ fontFamily: mono, fontSize: 26, fontWeight: 500, color: c.muted }}>{data.address}</span> : null}
        </div>
      </div>
      <div style={{ ...row, gap: 16, alignItems: "stretch" }}>
        <StatBox label={data.reviewCount === 1 ? "Valoración · 1 opinión" : `Valoración · ${data.reviewCount} opiniones`}>
          {data.rating ? (
            <>
              <Star size={38} />
              <span style={{ ...statValue, color: c.rating }}>{data.rating}</span>
            </>
          ) : (
            <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.55, color: c.muted }}>Sin opiniones</span>
          )}
        </StatBox>
        <StatBox label="Jugadores">
          {data.playersCurrent === null ? (
            <span style={{ ...statValue, color: c.muted }}>—</span>
          ) : (
            <>
              <span style={statValue}>{data.playersCurrent.toLocaleString("es-ES")}</span>
              {data.playersMax ? <span style={{ fontSize: 24, fontWeight: 700, color: c.muted, alignSelf: "flex-end" }}>{`/ ${data.playersMax.toLocaleString("es-ES")}`}</span> : null}
            </>
          )}
        </StatBox>
        {data.monthlyVotes !== null ? (
          <StatBox label="Votos del mes">
            <span style={{ ...statValue, color: c.accentInk }}>{data.monthlyVotes}</span>
          </StatBox>
        ) : (
          <StatBox label="Modalidad">
            <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.55, ...oneLine }}>{data.modes ?? "—"}</span>
          </StatBox>
        )}
        <StatBox label="Edición">
          <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.55 }}>{data.editions}</span>
        </StatBox>
      </div>
    </Frame>
  );
}

export type VoteCardData = {
  name: string;
  slug: string;
  logo: string | null;
  monthName: string;
  /** Null until the server has a vote this month: a place among zeros means nothing. */
  position: number | null;
  votes: string;
};

export function VoteCard(data: VoteCardData) {
  return (
    <Frame direction="row" gap={48}>
      <div style={{ ...column, flex: 1, minWidth: 0, justifyContent: "space-between" }}>
        <Lockup />
        <div style={{ ...column, gap: 18 }}>
          <div style={{ ...row, gap: 18 }}>
            <ServerMark name={data.name} logo={data.logo} size={72} radius={16} />
            <span style={{ fontSize: 34, fontWeight: 700, color: c.muted, minWidth: 0, ...oneLine }}>{data.name}</span>
          </div>
          <div style={{ ...column, fontSize: 104, lineHeight: 0.95, fontWeight: 800, letterSpacing: -3.5 }}>
            <span>Tu voto</span>
            <span>cuenta.</span>
          </div>
          <span style={{ fontSize: 26, fontWeight: 500, color: c.muted }}>Vota cada día y ayúdale a subir en el ranking.</span>
        </div>
        <Url path={`/servers/${data.slug}/votar`} />
      </div>
      <div style={{ ...column, width: 330, flexShrink: 0, justifyContent: "space-between", borderRadius: 28, background: c.accent, color: c.onAccent, padding: "40px 36px" }}>
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1.5 }}>{`RANKING · ${data.monthName.toUpperCase()}`}</span>
        {data.position ? (
          <span style={{ fontSize: data.position > 99 ? 104 : 180, fontWeight: 800, lineHeight: 0.85, letterSpacing: -8 }}>{`#${data.position}`}</span>
        ) : (
          <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>Sé el primero en votar</span>
        )}
        <div style={{ ...column, gap: 4, borderTop: "2px solid rgba(7,19,13,0.25)", paddingTop: 20 }}>
          <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, letterSpacing: -1.5 }}>{data.votes}</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>votos este mes</span>
        </div>
      </div>
    </Frame>
  );
}

export type HomeCardData = {
  title: string;
  /** "MÁS VOTADOS · SEPTIEMBRE", or the rating fallback while votes are off. */
  listLabel: string;
  entries: Array<{ name: string; logo: string | null; value: string; star: boolean }>;
};

export function HomeCard({ title, listLabel, entries }: HomeCardData) {
  return (
    <Frame direction="row" gap={48}>
      <div style={{ ...column, flex: 1, minWidth: 0, justifyContent: "space-between" }}>
        <Lockup size={44} />
        <div style={{ ...column, gap: 20 }}>
          <span style={{ fontSize: entries.length ? 76 : 92, lineHeight: 1, fontWeight: 800, letterSpacing: -2.5 }}>{title}</span>
          <span style={{ fontSize: 26, fontWeight: 500, color: c.muted, lineHeight: 1.35 }}>Estado en tiempo real, votos y opiniones de quienes ya juegan en ellos.</span>
        </div>
        <Url path="" />
      </div>
      {entries.length ? (
        <div style={{ ...column, width: 430, flexShrink: 0, alignSelf: "center", gap: 14, padding: 28, borderRadius: 24, background: c.surface, border: `1px solid ${c.line}` }}>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2, color: c.muted }}>{listLabel}</span>
          {entries.map((entry, index) => (
            <div key={entry.name} style={{ ...row, gap: 14, padding: 14, borderRadius: 16, background: index === 0 ? "rgba(47,191,120,0.12)" : "transparent" }}>
              <span style={{ width: 30, fontSize: 26, fontWeight: 800, color: index === 0 ? c.accentInk : c.muted }}>{String(index + 1)}</span>
              <ServerMark name={entry.name} logo={entry.logo} size={48} radius={12} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 22, fontWeight: 700, ...oneLine }}>{entry.name}</span>
              <div style={{ ...row, gap: 6 }}>
                {entry.star ? <Star size={20} /> : null}
                <span style={{ fontSize: 20, fontWeight: 800, color: index === 0 ? c.accentInk : c.muted }}>{entry.value}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Frame>
  );
}

const categoryColors: Record<(typeof blogCategories)[number], { ink: string; fill: string }> = {
  "Guías": { ink: c.accentInk, fill: "rgba(47,191,120,0.16)" },
  "Comparativas": { ink: "#8ecbf5", fill: "rgba(90,170,235,0.16)" },
  "Rendimiento": { ink: c.rating, fill: "rgba(242,193,78,0.16)" },
  "Para admins": { ink: "#c9aef5", fill: "rgba(180,140,240,0.16)" },
};

export function BlogCard() {
  return (
    <Frame>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <Lockup />
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, color: c.accentInk }}>BLOG</span>
      </div>
      <div style={{ ...column, gap: 22 }}>
        <span style={{ fontSize: 84, lineHeight: 1, fontWeight: 800, letterSpacing: -2.5 }}>Guías y comparativas de servidores de Minecraft</span>
        <span style={{ fontSize: 26, fontWeight: 500, color: c.muted }}>Lo que aprendemos monitorizando servidores y leyendo reseñas, contado sin humo.</span>
      </div>
      <div style={{ ...row, gap: 12 }}>
        {blogCategories.map((category) => (
          <span key={category} style={{ padding: "10px 18px", borderRadius: 999, fontSize: 20, fontWeight: 700, background: categoryColors[category].fill, color: categoryColors[category].ink }}>
            {category}
          </span>
        ))}
      </div>
    </Frame>
  );
}

const aboutPoints = [
  { label: "Estado monitorizado", icon: '<path d="M3 12h4l3-8 4 16 3-8h4"/>' },
  { label: "Propiedad verificada", icon: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>' },
  { label: "Opiniones con normas", icon: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>' },
];

export function AboutCard() {
  return (
    <Frame>
      <Lockup />
      <div style={{ ...column, gap: 16 }}>
        <Eyebrow>QUIÉNES SOMOS</Eyebrow>
        <span style={{ fontSize: 76, lineHeight: 1.02, fontWeight: 800, letterSpacing: -2.5 }}>Cómo verificamos cada servidor</span>
      </div>
      <div style={{ ...row, gap: 16, alignItems: "stretch" }}>
        {aboutPoints.map((point) => (
          <div key={point.label} style={{ ...column, flex: 1, gap: 14, padding: 24, borderRadius: 18, background: c.surface, border: `1px solid ${c.line}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image */}
            <img src={strokeUri(point.icon, c.accentInk)} width={32} height={32} alt="" />
            <span style={{ fontSize: 24, fontWeight: 700 }}>{point.label}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

const contactChannels = ["Incidencias", "Privacidad", "Derechos sobre contenidos", "Moderación"];

export function ContactCard() {
  return (
    <Frame direction="row" gap={56}>
      <div style={{ ...column, flex: 1, minWidth: 0, justifyContent: "space-between" }}>
        <Lockup />
        <div style={{ ...column, gap: 20 }}>
          <span style={{ fontSize: 120, lineHeight: 0.95, fontWeight: 800, letterSpacing: -4 }}>Contacto</span>
          <span style={{ fontSize: 26, fontWeight: 500, color: c.muted, lineHeight: 1.35 }}>Escríbenos por el canal adecuado y te responde quien lo lleva.</span>
        </div>
        <Url path="/contact" />
      </div>
      <div style={{ ...column, width: 400, flexShrink: 0, alignSelf: "center", gap: 12 }}>
        {contactChannels.map((channel) => (
          <div key={channel} style={{ ...row, gap: 14, padding: "20px 24px", borderRadius: 16, background: c.surface, border: `1px solid ${c.line}`, fontSize: 24, fontWeight: 700 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: c.accent }} />
            {channel}
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function PublishCard() {
  const features = ["Estado en vivo", "Votos con Votifier", "Opiniones de jugadores"];
  return (
    <Frame direction="row" gap={48}>
      <div style={{ ...column, flex: 1, minWidth: 0, justifyContent: "space-between" }}>
        <Lockup />
        <div style={{ ...column, gap: 18 }}>
          <Eyebrow>PARA DUEÑOS DE SERVIDORES</Eyebrow>
          <span style={{ fontSize: 92, lineHeight: 0.98, fontWeight: 800, letterSpacing: -3 }}>Publica tu servidor.</span>
          <span style={{ fontSize: 26, fontWeight: 500, color: c.muted }}>Que los jugadores te encuentren, te voten y opinen.</span>
        </div>
        <Url path="/servers/new" />
      </div>
      <div style={{ ...column, width: 330, flexShrink: 0, justifyContent: "space-between", borderRadius: 28, background: c.accent, color: c.onAccent, padding: 36 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image */}
        <img src={strokeUri('<path d="M12 5v14M5 12h14"/>', c.onAccent, 2.5)} width={56} height={56} alt="" />
        <div style={{ ...column, gap: 14, fontSize: 24, fontWeight: 800 }}>
          {features.map((feature, index) => (
            <span key={feature} style={{ paddingBottom: index < features.length - 1 ? 14 : 0, borderBottom: index < features.length - 1 ? "2px solid rgba(7,19,13,0.2)" : "none" }}>
              {feature}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** Legal pages and anything else without a card of its own: the title and where it lives. */
export function GenericCard({ title, path }: { title: string; path: string }) {
  return (
    <Frame>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image */}
      <img src={markUri(c.accent)} width={520} height={520} alt="" style={{ position: "absolute", right: -90, bottom: -110, opacity: 0.07 }} />
      <Lockup />
      <div style={{ ...column, gap: 20, maxWidth: 860 }}>
        <span style={{ fontSize: 88, lineHeight: 1, fontWeight: 800, letterSpacing: -3 }}>{title}</span>
        <div style={{ width: 72, height: 6, borderRadius: 3, background: c.accent }} />
      </div>
      <Url path={path} />
    </Frame>
  );
}
