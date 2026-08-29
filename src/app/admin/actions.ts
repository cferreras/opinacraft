"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/session";
import { grantPlatformRole, moderateReport, moderateReviewReport } from "@/lib/admin";
import { ReportAlreadyOpenError } from "@/lib/servers/reports";
import { ReviewReportAlreadyOpenError } from "@/lib/servers/reviews";
import { getServerIdBySlug } from "@/lib/servers/queries";
import { invalidateReviewCache } from "@/lib/servers/cache-tags";

export async function moderateReportAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/admin");
  const reportId = String(formData.get("reportId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!reportId || !["dismissed", "hidden", "restored", "reopened"].includes(decision)) redirect("/admin?error=invalid");
  let transitioned = false;
  try {
    transitioned = await moderateReport(session.user.id, reportId, decision as "dismissed" | "hidden" | "restored" | "reopened");
  } catch (error) {
    if (error instanceof ReportAlreadyOpenError) redirect("/admin?error=report-open");
    redirect("/admin?error=forbidden");
  }
  if (!transitioned) redirect("/admin?error=transition");
  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin?updated=1");
}

export async function moderateReviewReportAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/admin");
  const reportId = String(formData.get("reportId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const slug = String(formData.get("serverSlug") ?? "");
  if (!reportId || !["dismissed", "hidden", "restored", "reopened"].includes(decision)) redirect("/admin?error=invalid");
  let transitioned = false;
  try {
    transitioned = await moderateReviewReport(session.user.id, reportId, decision as "dismissed" | "hidden" | "restored" | "reopened");
  } catch (error) {
    if (error instanceof ReviewReportAlreadyOpenError) redirect("/admin?error=review-report-open");
    redirect("/admin?error=forbidden");
  }
  if (!transitioned) redirect("/admin?error=transition");
  if (slug) {
    const serverId = await getServerIdBySlug(slug);
    if (serverId) invalidateReviewCache(serverId);
  }
  revalidatePath("/admin");
  revalidatePath("/");
  if (slug) revalidatePath(`/servers/${slug}`);
  redirect("/admin?updated=1");
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
