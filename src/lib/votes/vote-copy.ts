/**
 * The vote page's wording, kept free of React and the database so it can be tested on its own.
 * Every clock reading is Madrid's: the cooldown and the ranking both run on Spanish time, and a
 * voter in Buenos Aires is still told when the page will let them vote again in that frame.
 */

import { formatVotes, VOTING_TIME_ZONE } from "./month";

export type VoteDeliveryCopy = "delivered" | "failed" | "not_configured";

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: VOTING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const clock = new Intl.DateTimeFormat("es-ES", { timeZone: VOTING_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekday = new Intl.DateTimeFormat("es-ES", { timeZone: VOTING_TIME_ZONE, weekday: "long" });

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Whole hours, minutes and seconds left, never negative. Seconds round up so "00:00:00" means done. */
export function splitRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

export function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The countdown's accessible summary, to the minute: reading seconds aloud every tick is noise. */
export function countdownSummary(ms: number) {
  const { hours, minutes } = splitRemaining(ms);
  if (hours === 0 && minutes === 0) return ms > 0 ? "menos de un minuto" : "ya puedes votar";
  if (hours === 0) return plural(minutes, "minuto", "minutos");
  if (minutes === 0) return plural(hours, "hora", "horas");
  return `${plural(hours, "hora", "horas")} y ${plural(minutes, "minuto", "minutos")}`;
}

/** "hace 3 h 12 min", for the already-voted state. */
export function elapsedLabel(votedAt: Date, now: Date) {
  const elapsed = Math.max(0, now.getTime() - votedAt.getTime());
  if (elapsed < MINUTE_MS) return "hace un momento";
  const hours = Math.floor(elapsed / HOUR_MS);
  const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
  if (hours === 0) return `hace ${minutes} min`;
  return minutes === 0 ? `hace ${hours} h` : `hace ${hours} h ${minutes} min`;
}

/** "mañana a las 14:05". The cooldown is under a day, so "hoy" and "mañana" cover almost every case. */
export function nextVoteLabel(nextVoteAt: Date, now: Date) {
  const time = clock.format(nextVoteAt);
  const target = dayKey.format(nextVoteAt);
  if (target === dayKey.format(now)) return `hoy a las ${time}`;
  if (target === dayKey.format(new Date(now.getTime() + 24 * HOUR_MS))) return `mañana a las ${time}`;
  return `el ${weekday.format(nextVoteAt)} a las ${time}`;
}

export function votesLabel(votes: number) {
  return `${formatVotes(votes)} ${votes === 1 ? "voto" : "votos"}`;
}

/** The identity header's line: "#3 en septiembre · 1.204 votos". */
export function rankLine(position: number | null, monthName: string, votes: number) {
  return position ? `#${position} en ${monthName} · ${votesLabel(votes)}` : `${votesLabel(votes)} en ${monthName}`;
}

export function successSentence(input: { nickname: string; serverName: string; votes: number; position: number | null; monthName: string }) {
  const tally = `${input.serverName} suma ahora ${votesLabel(input.votes)}`;
  return input.position
    ? `Gracias, ${input.nickname}. ${tally} y va ${input.position}.º en ${input.monthName}.`
    : `Gracias, ${input.nickname}. ${tally} en ${input.monthName}.`;
}

/** Null when the server has no Votifier set up: there is nothing to report either way. */
export function deliveryLine(delivery: VoteDeliveryCopy) {
  if (delivery === "delivered") return "Recompensa enviada al servidor";
  if (delivery === "failed") return "El servidor no respondió: la recompensa puede no llegar, pero tu voto cuenta";
  return null;
}

/** How much of the cooldown has passed, from 0 to 1, for the progress bar. */
export function cooldownProgress(votedAt: Date, nextVoteAt: Date, now: Date) {
  const span = nextVoteAt.getTime() - votedAt.getTime();
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - votedAt.getTime()) / span));
}
