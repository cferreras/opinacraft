"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/session";
import { grantPlatformRole, moderateReport, moderateReviewReport } from "@/lib/admin";
import { blockTag, mergeTags, renameTag } from "@/lib/servers/tags";

export async function moderateReportAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/admin");
  const reportId = String(formData.get("reportId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!reportId || !["dismissed", "hidden", "restored", "reopened"].includes(decision)) redirect("/admin?error=invalid");
  try {
    await moderateReport(session.user.id, reportId, decision as "dismissed" | "hidden" | "restored" | "reopened");
  } catch {
    redirect("/admin?error=forbidden");
  }
  revalidatePath("/admin");
  revalidatePath("/servers");
  redirect("/admin?updated=1");
}

export async function moderateReviewReportAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/admin");
  const reportId = String(formData.get("reportId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const slug = String(formData.get("serverSlug") ?? "");
  if (!reportId || !["dismissed", "hidden", "restored", "reopened"].includes(decision)) redirect("/admin?error=invalid");
  try {
    await moderateReviewReport(session.user.id, reportId, decision as "dismissed" | "hidden" | "restored" | "reopened");
  } catch {
    redirect("/admin?error=forbidden");
  }
  revalidatePath("/admin");
  revalidatePath("/servers");
  if (slug) revalidatePath(`/servers/${slug}`);
  redirect("/admin?updated=1");
}

export async function moderateTagAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/admin");
  const action = String(formData.get("tagAction") ?? "");
  try {
    if (action === "block") await blockTag(session.user.id, String(formData.get("tagId") ?? ""));
    else if (action === "rename") await renameTag(session.user.id, String(formData.get("tagId") ?? ""), String(formData.get("label") ?? ""));
    else if (action === "merge") await mergeTags(session.user.id, String(formData.get("tagId") ?? ""), String(formData.get("canonicalId") ?? ""));
    else throw new Error("invalid tag action");
  } catch { redirect("/admin?error=tag"); }
  revalidatePath("/admin"); revalidatePath("/servers"); redirect("/admin?updated=1");
}

export async function grantRoleAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/admin");
  try {
    const role = String(formData.get("role") ?? "");
    if (role !== "admin" && role !== "moderator") throw new Error("invalid role");
    await grantPlatformRole(session.user.id, String(formData.get("email") ?? ""), role);
  } catch { redirect("/admin?error=role"); }
  revalidatePath("/admin"); redirect("/admin?updated=1");
}
