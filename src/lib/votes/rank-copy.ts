/**
 * Sentences the server page builds from vote figures. Kept free of React and the database so the
 * wording can be tested on its own.
 */

import { VOTING_TIME_ZONE } from "./month";

export type RankTrend = { direction: "up" | "down" | "same"; label: string };

/** Month-over-month movement, or null when there is nothing to compare against. */
export function rankTrend(position: number | null, previousPosition: number | null, previousMonthName: string): RankTrend | null {
  if (position === null || previousPosition === null) return null;
  const places = previousPosition - position;
  if (places === 0) return { direction: "same", label: `Igual que en ${previousMonthName}` };
  const count = Math.abs(places);
  const noun = count === 1 ? "puesto" : "puestos";
  return places > 0
    ? { direction: "up", label: `Sube ${count} ${noun} respecto a ${previousMonthName}` }
    : { direction: "down", label: `Baja ${count} ${noun} respecto a ${previousMonthName}` };
}

export function votesThisMonthLabel(votes: number) {
  return votes === 1 ? "voto este mes" : "votos este mes";
}

const dayAndMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: VOTING_TIME_ZONE });

/** "hace 3 h" within the last day, "el 4 de septiembre" before that: how recent the vote reads in the review form. */
export function voteAgoLabel(votedAt: Date, now = new Date()) {
  const hours = Math.floor((now.getTime() - votedAt.getTime()) / 3_600_000);
  if (hours < 1) return "hace menos de 1 h";
  if (hours < 24) return `hace ${hours} h`;
  return `el ${dayAndMonth.format(votedAt)}`;
}
