export type ModerationItemKind = "server" | "review";
export type ModerationItemStatus = "open" | "actioned" | "dismissed";
export type ModerationPriority = "high" | "medium" | "low";

export type ModerationQueueItem = {
  id: string;
  kind: ModerationItemKind;
  subjectKey: string;
  subjectLabel: string;
  serverSlug: string;
  reason: string;
  details: string | null;
  status: ModerationItemStatus;
  createdAt: string;
  reviewId?: string | null;
  reviewContent?: string | null;
  reviewRating?: number | null;
  reporterName?: string | null;
};

export type ModerationGroup = {
  subjectKey: string;
  subjectLabel: string;
  serverSlug: string;
  kind: ModerationItemKind;
  status: ModerationItemStatus;
  reportCount: number;
  isRepeated: boolean;
  priority: ModerationPriority;
  firstCreatedAt: string;
  latestCreatedAt: string;
  items: ModerationQueueItem[];
};

const priorityWeights: Record<ModerationPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const highPriorityReasons = new Set([
  "copyright",
  "harassment",
  "inappropriate",
  "offensive",
]);

const mediumPriorityReasons = new Set([
  "conflict_of_interest",
  "false_information",
  "misleading",
  "spam",
]);

export function getModerationPriority(reason: string): ModerationPriority {
  if (highPriorityReasons.has(reason)) return "high";
  if (mediumPriorityReasons.has(reason)) return "medium";
  return "low";
}

export function groupModerationItems(items: ModerationQueueItem[]): ModerationGroup[] {
  const groups = new Map<string, ModerationGroup>();

  for (const item of items) {
    const existing = groups.get(item.subjectKey);
    const itemPriority = getModerationPriority(item.reason);

    if (!existing) {
      groups.set(item.subjectKey, {
        subjectKey: item.subjectKey,
        subjectLabel: item.subjectLabel,
        serverSlug: item.serverSlug,
        kind: item.kind,
        status: item.status,
        reportCount: 1,
        isRepeated: false,
        priority: itemPriority,
        firstCreatedAt: item.createdAt,
        latestCreatedAt: item.createdAt,
        items: [item],
      });
      continue;
    }

    existing.reportCount += 1;
    existing.isRepeated = true;
    existing.items.push(item);
    if (priorityWeights[itemPriority] > priorityWeights[existing.priority]) existing.priority = itemPriority;
    if (item.createdAt < existing.firstCreatedAt) existing.firstCreatedAt = item.createdAt;
    if (item.createdAt > existing.latestCreatedAt) existing.latestCreatedAt = item.createdAt;
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }))
    .sort((a, b) => {
      const priorityDifference = priorityWeights[b.priority] - priorityWeights[a.priority];
      if (priorityDifference) return priorityDifference;
      if (b.reportCount !== a.reportCount) return b.reportCount - a.reportCount;
      return b.latestCreatedAt.localeCompare(a.latestCreatedAt);
    });
}
