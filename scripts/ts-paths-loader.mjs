import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
    const raw = path.join(root, specifier.slice(2));
    const candidate = path.extname(raw) ? raw : `${raw}.ts`;
    return nextResolve(pathToFileURL(candidate).href, context);
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const parent = path.dirname(fileURLToPath(context.parentURL));
    const raw = path.resolve(parent, specifier);
    const candidate = path.extname(raw) ? raw : `${raw}.ts`;
    if (fs.existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
  }
  return nextResolve(specifier, context);
}
