type MotdValue = string | MotdValue[] | { [key: string]: unknown } | null | undefined;

const MAX_DEPTH = 16;
const MAX_NODES = 256;
const FORMAT_CODE = /\u00a7(?:x(?:\u00a7[0-9a-f]){6}|[0-9a-fk-or])/gi;

export class MotdFormatError extends Error {
  constructor() {
    super("The server returned an invalid MOTD.");
    this.name = "MotdFormatError";
  }
}

export function flattenMotd(value: unknown) {
  let nodes = 0;

  function visit(current: MotdValue, depth: number): string {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) {
      throw new MotdFormatError();
    }
    if (typeof current === "string") return current;
    if (Array.isArray(current)) return current.map((item) => visit(item, depth + 1)).join("");
    if (!current || typeof current !== "object") return "";

    const object = current as Record<string, unknown>;
    let result = "";
    if (typeof object.text === "string") result += object.text;
    if (typeof object.translate === "string") result += object.translate;
    if (Array.isArray(object.extra)) result += visit(object.extra, depth + 1);
    if (Array.isArray(object.with)) result += visit(object.with, depth + 1);
    return result;
  }

  return visit(value as MotdValue, 0);
}

export function normalizeMotd(value: unknown) {
  return flattenMotd(value)
    .replace(FORMAT_CODE, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFKC")
    .toUpperCase();
}

export function motdContainsCode(motd: unknown, code: string) {
  return normalizeMotd(motd).includes(code.normalize("NFKC").toUpperCase());
}
