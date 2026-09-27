/**
 * The calendar the ranking runs on. Months turn over at midnight in Spain, whatever the voter's or
 * the server's own clock says, so every vote cast on the 30th at 23:30 in Madrid counts for that
 * month everywhere.
 */

export const VOTING_TIME_ZONE = "Europe/Madrid";

/** 23 rather than 24: someone who votes at the same time every day never drifts later. */
export const VOTE_COOLDOWN_HOURS = 23;
export const VOTE_COOLDOWN_MS = VOTE_COOLDOWN_HOURS * 60 * 60 * 1000;

/** How long the IP hash is kept. It only exists to enforce the cooldown and spot abuse. */
export const VOTE_IP_RETENTION_DAYS = 30;

const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: VOTING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const offsetParts = new Intl.DateTimeFormat("en-US", { timeZone: VOTING_TIME_ZONE, timeZoneName: "longOffset" });
const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" });
const dayAndMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });

function madridDate(date: Date) {
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** Minutes Madrid is ahead of UTC at `date` (60 in winter, 120 in summer). */
function madridOffsetMinutes(date: Date) {
  const name = offsetParts.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** The instant Madrid's clock reads 00:00 on that calendar day. */
function madridMidnight(year: number, month: number, day: number) {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const offset = madridOffsetMinutes(new Date(guess.getTime() - madridOffsetMinutes(guess) * 60_000));
  return new Date(guess.getTime() - offset * 60_000);
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function votingMonth(date = new Date()) {
  const { year, month } = madridDate(date);
  return monthKey(year, month);
}

export function previousVotingMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber === 1 ? monthKey(year - 1, 12) : monthKey(year, monthNumber - 1);
}

/** The instant today started in Madrid, for "votes today". */
export function startOfVotingDay(date = new Date()) {
  const { year, month, day } = madridDate(date);
  return madridMidnight(year, month, day);
}

export function monthlyReset(now = new Date()) {
  const { year, month, day } = madridDate(now);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    month: monthKey(year, month),
    resetsAt: madridMidnight(nextYear, nextMonth, 1),
    daysLeft: daysInMonth - day + 1,
    monthName: monthName.format(new Date(Date.UTC(year, month - 1, 15))),
    previousMonthName: monthName.format(new Date(Date.UTC(month === 1 ? year - 1 : year, month === 1 ? 11 : month - 2, 15))),
    resetLabel: dayAndMonth.format(new Date(Date.UTC(nextYear, nextMonth - 1, 1, 12))),
  };
}

export function daysLeftLabel(daysLeft: number) {
  return daysLeft === 1 ? "queda 1 día" : `quedan ${daysLeft} días`;
}

export function formatVotes(votes: number) {
  return votes.toLocaleString("es-ES");
}

/** Java nicknames: 3–16 letters, digits or underscores. Bedrock gamertags are longer and allow spaces, but Votifier plugins key rewards by the Java name. */
export const NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

export function normalizeNickname(input: unknown) {
  if (typeof input !== "string") return null;
  const nickname = input.trim();
  if (!NICKNAME_PATTERN.test(nickname)) return null;
  return { nickname, key: nickname.toLowerCase() };
}
