import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { serverTags, tags, tagAliases } from "@/schema";
import { requireServerCapability } from "@/lib/servers/permissions";
import { requirePlatformRole } from "@/lib/admin";

export const MAX_SERVER_TAGS = 8;
export const MAX_TAG_SUGGESTIONS = 8;

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class TagInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TagInputError";
  }
}

export class TagBlockedError extends Error {
  constructor() {
    super("This tag is not available.");
    this.name = "TagBlockedError";
  }
}

export function normalizeTagSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function normalizeTagInputs(input: string[] | undefined) {
  const values = (input ?? [])
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  if (values.length > MAX_SERVER_TAGS) {
    throw new TagInputError(`Choose up to ${MAX_SERVER_TAGS} tags.`);
  }

  const unique = new Map<string, string>();
  for (const label of values) {
    if (label.length > 40) throw new TagInputError("Tags must be 40 characters or fewer.");
    const slug = normalizeTagSlug(label);
    if (!slug) throw new TagInputError("Enter a valid tag.");
    unique.set(slug, label);
  }

  return [...unique.entries()].map(([slug, label]) => ({ slug, label }));
}

async function refreshUsageCounts(tx: DatabaseTransaction, tagIds: string[]) {
  for (const tagId of tagIds) {
    const [result] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(serverTags)
      .where(eq(serverTags.tagId, tagId));
    await tx
      .update(tags)
      .set({ usageCount: Number(result?.count ?? 0) })
      .where(eq(tags.id, tagId));
  }
}

export async function replaceServerTagsForServer(
  tx: DatabaseTransaction,
  serverId: string,
  input: string[] | undefined,
  options: { allowCreate?: boolean } = {},
) {
  const normalized = normalizeTagInputs(input);
  const previous = await tx
    .select({ tagId: serverTags.tagId })
    .from(serverTags)
    .where(eq(serverTags.serverId, serverId));
  const touched = new Set(previous.map(({ tagId }) => tagId));

  const resolved: string[] = [];
  for (const item of normalized) {
    const existing = await tx.select({ id: tags.id }).from(tags).where(eq(tags.slug, item.slug)).limit(1);
    if (!existing[0]) {
      const [alias] = await tx.select({ tagId: tagAliases.tagId }).from(tagAliases).where(eq(tagAliases.aliasSlug, item.slug)).limit(1);
      if (alias) {
        const [canonical] = await tx.select({ id: tags.id }).from(tags).where(eq(tags.id, alias.tagId)).limit(1);
        if (canonical) existing.push(canonical);
      }
    }
    if (!existing[0] && options.allowCreate === false) throw new TagInputError("Solo el propietario puede crear etiquetas nuevas.");
    if (!existing[0]) await tx.insert(tags).values({ label: item.label, slug: item.slug }).onConflictDoNothing({ target: tags.slug });

    const [tag] = await tx
      .select({ id: tags.id, status: tags.status, aliasOf: tags.aliasOf })
      .from(tags)
      .where(existing[0] ? eq(tags.id, existing[0].id) : eq(tags.slug, item.slug))
      .limit(1);

    if (!tag || tag.status === "blocked" || (tag.status === "merged" && !tag.aliasOf)) throw new TagBlockedError();
    const tagId = tag.aliasOf && tag.status === "merged" ? tag.aliasOf : tag.id;
    if (!resolved.includes(tagId)) resolved.push(tagId);
    touched.add(tagId);
  }

  await tx.delete(serverTags).where(eq(serverTags.serverId, serverId));
  if (resolved.length > 0) {
    await tx.insert(serverTags).values(
      resolved.map((tagId) => ({ serverId, tagId })),
    );
  }
  await refreshUsageCounts(tx, [...touched]);
  return resolved;
}

export async function replaceServerTags(
  serverId: string,
  userId: string,
  input: string[] | undefined,
) {
  await requireServerCapability(serverId, userId, "content:edit");
  return db.transaction((tx) => replaceServerTagsForServer(tx, serverId, input));
}

export async function suggestTags(query: string) {
  const slug = normalizeTagSlug(query);
  if (!slug) return [];
  const direct = await db
    .select({ label: tags.label, slug: tags.slug, usageCount: tags.usageCount })
    .from(tags)
    .where(
      and(
        eq(tags.status, "active"),
        sql`${tags.slug} like ${`%${slug}%`}`,
      ),
    )
    .orderBy(
      desc(tags.usageCount),
      desc(sql`case when ${tags.slug} = ${slug} then 3 when ${tags.slug} like ${`${slug}%`} then 2 when ${tags.label} ilike ${`${query}%`} then 1 else 0 end`),
      asc(tags.slug),
    )
    .limit(MAX_TAG_SUGGESTIONS);
  const aliases = await db
    .select({ label: tags.label, slug: tagAliases.aliasSlug, usageCount: tags.usageCount })
    .from(tagAliases)
    .innerJoin(tags, eq(tagAliases.tagId, tags.id))
    .where(and(eq(tags.status, "active"), sql`${tagAliases.aliasSlug} like ${`%${slug}%`}`))
    .limit(MAX_TAG_SUGGESTIONS);
  const tie = (value: string) => value === slug ? 3 : value.startsWith(slug) ? 2 : value.includes(slug) ? 1 : 0;
  return [...direct, ...aliases].sort((a, b) => b.usageCount - a.usageCount || tie(b.slug) - tie(a.slug) || a.slug.localeCompare(b.slug)).slice(0, MAX_TAG_SUGGESTIONS);
}

export async function listServerTags(serverIds: string[]) {
  if (serverIds.length === 0) return [];
  return db
    .select({ serverId: serverTags.serverId, label: tags.label, slug: tags.slug })
    .from(serverTags)
    .innerJoin(tags, eq(serverTags.tagId, tags.id))
    .where(and(inArray(serverTags.serverId, serverIds), eq(tags.status, "active")))
    .orderBy(asc(serverTags.serverId), asc(tags.slug));
}

export async function listModerationTags() {
  return db.select({ id: tags.id, label: tags.label, slug: tags.slug, status: tags.status, usageCount: tags.usageCount }).from(tags).orderBy(desc(tags.usageCount), asc(tags.slug)).limit(200);
}

export async function renameTag(userId: string, tagId: string, label: string) {
  await requirePlatformRole(userId);
  const nextLabel = label.trim().replace(/\s+/g, " ");
  const nextSlug = normalizeTagSlug(nextLabel);
  if (!nextSlug) throw new TagInputError("Etiqueta no válida.");
  return db.transaction(async (tx) => {
    const [tag] = await tx.select({ id: tags.id, slug: tags.slug }).from(tags).where(eq(tags.id, tagId)).for("update").limit(1);
    if (!tag) throw new TagInputError("Etiqueta no encontrada.");
    await tx.insert(tagAliases).values({ aliasSlug: tag.slug, tagId }).onConflictDoNothing();
    await tx.update(tags).set({ label: nextLabel, slug: nextSlug, updatedAt: new Date() }).where(eq(tags.id, tagId));
    return { slug: nextSlug };
  });
}

export async function blockTag(userId: string, tagId: string) {
  await requirePlatformRole(userId);
  await db.update(tags).set({ status: "blocked", updatedAt: new Date() }).where(eq(tags.id, tagId));
}

export async function mergeTags(userId: string, sourceId: string, canonicalId: string) {
  await requirePlatformRole(userId);
  if (sourceId === canonicalId) throw new TagInputError("Selecciona dos etiquetas distintas.");
  await db.transaction(async (tx) => {
    const [source] = await tx.select({ id: tags.id, slug: tags.slug }).from(tags).where(eq(tags.id, sourceId)).for("update").limit(1);
    const [canonical] = await tx.select({ id: tags.id }).from(tags).where(eq(tags.id, canonicalId)).for("update").limit(1);
    if (!source || !canonical) throw new TagInputError("Etiqueta no encontrada.");
    const relations = await tx.select({ serverId: serverTags.serverId }).from(serverTags).where(eq(serverTags.tagId, sourceId));
    await tx.delete(serverTags).where(eq(serverTags.tagId, sourceId));
    if (relations.length) await tx.insert(serverTags).values(relations.map((row) => ({ serverId: row.serverId, tagId: canonicalId }))).onConflictDoNothing();
    await tx.insert(tagAliases).values({ aliasSlug: source.slug, tagId: canonicalId }).onConflictDoUpdate({ target: tagAliases.aliasSlug, set: { tagId: canonicalId } });
    await tx.update(tags).set({ status: "merged", aliasOf: canonicalId, updatedAt: new Date() }).where(eq(tags.id, sourceId));
    await refreshUsageCounts(tx, [sourceId, canonicalId]);
  });
}
