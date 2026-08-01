export type ReviewReplyRole = "owner" | "admin" | "editor";

export function canPublishOfficialReply(role: ReviewReplyRole | null) {
  return role === "owner" || role === "admin";
}
