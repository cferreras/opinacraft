import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { ESLint } from "eslint";

const readProjectFile = (filePath: string) =>
  readFileSync(path.resolve(filePath), "utf8");

test("optimizes the icon package imports used across the app", () => {
  const source = readProjectFile("next.config.ts");

  assert.match(source, /optimizePackageImports:/);
  assert.match(source, /["']lucide-react["']/);
  assert.match(source, /["']@tabler\/icons-react["']/);
});

test("starts public server viewer data with the other page queries", () => {
  const source = readProjectFile("src/app/servers/[slug]/page.tsx");

  assert.match(source, /const viewerPromise = session \?/);
  assert.match(source, /viewerPromise/);
  assert.doesNotMatch(source, /const viewer = session \? await getReviewViewerState/);
});

test("uses an overflow-aware preview for long public server descriptions", () => {
  const previewPath = path.resolve("src/components/server-description-preview.tsx");
  const previewSource = existsSync(previewPath) ? readFileSync(previewPath, "utf8") : "";
  const cardSource = readProjectFile("src/components/public-server-card.tsx");

  assert.equal(existsSync(previewPath), true, "the description preview should be a dedicated component");
  assert.match(previewSource, /ResizeObserver/);
  assert.match(previewSource, /Ver más/);
  assert.match(cardSource, /<ServerDescriptionPreview/);
});

test("passes a shaped payload to the server manage client boundary", () => {
  const source = readProjectFile("src/app/servers/[slug]/manage/page.tsx");

  assert.match(source, /toServerManageFormData/);
  assert.match(source, /<ServerManageForm server=\{serverFormData\}/);
  assert.doesNotMatch(source, /<ServerManageForm server=\{server\}/);
});

test("keeps the public preview rail below the sticky site header", () => {
  const pageSource = readProjectFile("src/app/servers/[slug]/manage/page.tsx");
  const headerSource = readProjectFile("src/components/site-header.tsx");

  assert.match(headerSource, /<div className="mx-auto flex h-16 /);
  assert.match(pageSource, /<aside className="order-first min-w-0 lg:order-none lg:sticky lg:top-\[calc\(4rem\+1\.25rem\)\]/);
  assert.doesNotMatch(pageSource, /lg:sticky lg:top-5/);
});

test("narrows profile effects to the authenticated user identity", () => {
  const source = readProjectFile("src/app/profile/page.tsx");

  assert.match(source, /session\?\.user\?\.id/);
  assert.doesNotMatch(source, /\}, \[session\]\);/);
});

test("keeps every profile tab active surface white", () => {
  const source = readProjectFile("src/app/profile/page.tsx");

  assert.match(source, /<TabsTrigger value="identity" className="data-active:bg-white">Identidad<\/TabsTrigger>/);
  assert.match(source, /<TabsTrigger value="security" className="data-active:bg-white">Seguridad<\/TabsTrigger>/);
  assert.match(source, /<TabsTrigger value="account" className="data-active:bg-white">Cuenta<\/TabsTrigger>/);
});

test("gives managed-server empty states a white surface", () => {
  const source = readProjectFile("src/app/dashboard/servers/page.tsx");

  assert.match(source, /<Empty className="mt-6 rounded-xl border bg-white dark:bg-card">/);
  assert.match(source, /<Empty className="mt-4 rounded-xl border bg-white dark:bg-card">/);
});

test("keeps moderation access out of the header layout flow", () => {
  const source = readProjectFile("src/components/site-header.tsx");
  const navigationStart = source.indexOf("function NavigationLinks");
  const mobileNavigationStart = source.indexOf("function MobileNavigationSection");
  const navigationSource = source.slice(navigationStart, mobileNavigationStart);
  const menuStart = source.indexOf("<DropdownMenuContent");
  const menuEnd = source.indexOf("</DropdownMenuContent>", menuStart);
  const menuSource = source.slice(menuStart, menuEnd);

  assert.doesNotMatch(navigationSource, /canModerate|moderationNavigation/);
  assert.match(menuSource, /canModerate/);
  assert.match(menuSource, /Moderación/);
});

test("requires confirmation before applying moderation report actions", () => {
  const source = readProjectFile("src/app/admin/page.tsx");
  const workbenchSource = readProjectFile("src/components/admin-moderation-workbench.tsx");

  assert.match(source, /AdminModerationWorkbench/);
  assert.match(workbenchSource, /AlertDialogTrigger/);
  assert.match(workbenchSource, /target=\{item\.kind\}/);
  assert.match(workbenchSource, /AlertDialogCancel[\s\S]*Cancelar/);
  assert.match(workbenchSource, /Sí, descartar/);
  assert.match(workbenchSource, /Sí, ocultar/);
  assert.match(workbenchSource, /Sí, restaurar/);
});

test("groups moderation queue items by target and surfaces repeated activity", async () => {
  const helperPath = path.resolve("src/lib/moderation-workbench.ts");

  assert.equal(
    existsSync(helperPath),
    true,
    "the moderation workbench should have a tested grouping helper",
  );

  const { groupModerationItems } = await import(pathToFileURL(helperPath).href);
  const groups = groupModerationItems([
    {
      id: "report-1",
      kind: "server",
      subjectKey: "server:one",
      subjectLabel: "Servidor Uno",
      serverSlug: "servidor-uno",
      reason: "offline",
      details: null,
      status: "open",
      createdAt: "2026-08-19T10:00:00.000Z",
    },
    {
      id: "report-2",
      kind: "server",
      subjectKey: "server:one",
      subjectLabel: "Servidor Uno",
      serverSlug: "servidor-uno",
      reason: "inappropriate",
      details: "Contenido que revisar",
      status: "open",
      createdAt: "2026-08-19T11:00:00.000Z",
    },
    {
      id: "report-3",
      kind: "review",
      subjectKey: "review:three",
      subjectLabel: "Servidor Dos",
      serverSlug: "servidor-dos",
      reason: "spam",
      details: null,
      status: "open",
      createdAt: "2026-08-19T12:00:00.000Z",
    },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].subjectKey, "server:one");
  assert.equal(groups[0].reportCount, 2);
  assert.equal(groups[0].isRepeated, true);
  assert.equal(groups[0].priority, "high");
  assert.equal(groups[1].reportCount, 1);
});

test("keeps dismissed reports recoverable through the moderation UI", () => {
  const pageSource = readProjectFile("src/app/admin/page.tsx");
  const actionSource = readProjectFile("src/app/admin/actions.ts");
  const adminSource = readProjectFile("src/lib/admin.ts");
  const schemaSource = readProjectFile("src/schema.ts");

  assert.match(pageSource, /status === "dismissed"/);
  assert.match(actionSource, /reopened/);
  assert.match(adminSource, /decision === "reopened"/);
  assert.match(schemaSource, /"reopened"/);
});

test("does not report a stale moderation transition as successful", () => {
  const source = readProjectFile("src/app/admin/actions.ts");

  assert.match(source, /transitioned = await moderateReport/);
  assert.match(source, /if \(!transitioned\) redirect\("\/admin\?error=transition"\)/);
  assert.match(source, /transitioned = await moderateReviewReport/);
  assert.match(source, /if \(!transitioned\) redirect\("\/admin\?error=transition"\)/);
});

test("guards moderation transitions against conflicting reports and hidden server reports", () => {
  const source = readProjectFile("src/lib/admin.ts");

  assert.match(source, /ReportAlreadyOpenError/);
  assert.match(source, /ReviewReportAlreadyOpenError/);
  assert.match(source, /decision === "reopened"[\s\S]*createdAt/);
  assert.match(source, /hasAnotherHiddenLatestAction/);
  assert.match(source, /moderateReport[\s\S]*hasAnotherHiddenLatestAction/);
  assert.match(source, /moderateReviewReport[\s\S]*hasAnotherHiddenLatestAction/);
});

test("keeps sortable header hover compact without rounded edges", () => {
  const source = readProjectFile("src/app/servers/page.tsx");
  const headerSource = source.slice(
    source.indexOf("function SortableColumnHeader"),
    source.indexOf("function ActiveFilterChip"),
  );
  const linkClassMatch = headerSource.match(/<Link[\s\S]*?className=(?:"([^"]+)"|\{`([^`]+)`\})/);
  const linkClass = linkClassMatch?.[1] ?? linkClassMatch?.[2];

  assert.doesNotMatch(
    headerSource,
    /<div role="columnheader"[^>]*className="[^\"]*hover:bg-muted\/60[^\"]*"/,
  );
  assert.ok(linkClass, "sortable header link should have a class list");
  assert.match(linkClass, /\binline-flex\b/);
  assert.doesNotMatch(linkClass, /(?:^|\s)w-full(?:\s|$)/);
  assert.doesNotMatch(linkClass, /\brounded-md\b/);
  assert.match(linkClass, /\bpx-1\b/);
  assert.match(linkClass, /\bhover:bg-muted\/60\b/);
});

test("keeps catalog ordering in the results table, not in the filter bar", () => {
  const source = readProjectFile("src/app/servers/page.tsx");
  const barSource = readProjectFile("src/components/catalog-filter-bar.tsx");

  assert.match(source, /const activeTableSort = tableSort \?\?/);
  assert.match(source, /const activeTableDirection(?:[^=]*)= tableSort \?/);
  assert.match(source, /tableSortHref\(column\.key\)/);
  assert.doesNotMatch(barSource, /sortValue|catalogSortOptions/);
});

test("preserves ordering and health when the catalog filters submit", () => {
  const pageSource = readProjectFile("src/app/servers/page.tsx");

  // The bar only carries facets, so every other piece of catalog state rides along as a hidden
  // field: without these a facet change would silently reset the visitor's ordering.
  assert.match(pageSource, /name="tableSort" value=\{tableSort\}/);
  assert.match(pageSource, /name="tableDirection" value=\{tableDirection\}/);
  assert.match(pageSource, /name="sort" value=\{sort\}/);
  assert.match(pageSource, /name="status" value=\{status\}/);
});

test("does not apply app lint rules to bundled skill scripts", async () => {
  const eslint = new ESLint();
  const results = await eslint.lintFiles([
    ".agents/skills/brainstorming/scripts/server.cjs",
    ".claude/skills/brainstorming/scripts/server.cjs",
  ]);
  const errors = results.flatMap((result) =>
    result.messages.filter((message) => message.severity === 2),
  );

  assert.deepEqual(errors, []);
});

test("code-splits the Recharts history visualization", () => {
  const cardSource = readProjectFile("src/components/player-history-card.tsx");
  const chartPath = path.resolve("src/components/player-history-chart.tsx");

  assert.equal(
    existsSync(chartPath),
    true,
    "the Recharts visualization should live in its own component",
  );

  const chartSource = readFileSync(chartPath, "utf8");

  assert.match(cardSource, /next\/dynamic/);
  assert.match(cardSource, /ssr:\s*false/);
  assert.doesNotMatch(cardSource, /from ["']recharts["']/);
  assert.match(chartSource, /from ["']recharts["']/);
});

test("renders player history as interval bars", () => {
  const chartSource = readProjectFile("src/components/player-history-chart.tsx");

  assert.match(chartSource, /\bBarChart\b/);
  assert.match(chartSource, /\bBar\b/);
  assert.match(chartSource, /<Bar[\s\S]*dataKey="serverPeak"/);
  assert.doesNotMatch(chartSource, /\bLineChart\b/);
  assert.doesNotMatch(chartSource, /\bLine\b/);
});

test("loads public player history after hydration instead of embedding the monitor cache", () => {
  const pageSource = readProjectFile("src/app/servers/[slug]/page.tsx");
  const cardSource = readProjectFile("src/components/player-history-card.tsx");

  assert.doesNotMatch(pageSource, /getCachedMonitorHistory/);
  assert.doesNotMatch(pageSource, /historyPromise/);
  assert.match(cardSource, /const shouldLoadOnMount = mode === "public" \|\| loadOnMount/);
  assert.match(cardSource, /useState\(shouldLoadOnMount \? 1 : 0\)/);
  assert.match(cardSource, /useState\(shouldLoadOnMount\)/);
});

test("loads managed player history from the current API on initial hydration", () => {
  const pageSource = readProjectFile("src/app/servers/[slug]/manage/page.tsx");
  const cardSource = readProjectFile("src/components/player-history-card.tsx");

  assert.doesNotMatch(pageSource, /queryPlayerHistory/);
  assert.match(pageSource, /emptyPlayerHistoryResponse\("24h"\)/);
  assert.match(pageSource, /<PlayerHistoryCard[^>]*loadOnMount/);
  assert.match(cardSource, /loadOnMount\?: boolean/);
  assert.match(cardSource, /mode === "public" \|\| loadOnMount/);
});

test("presents server verification as one generic identity check", () => {
  const panelSource = readProjectFile("src/components/verification-panel.tsx");
  const pageSource = readProjectFile("src/app/servers/[slug]/manage/page.tsx");

  assert.match(panelSource, /Verificar identidad/);
  assert.doesNotMatch(panelSource, /Verificación de propiedad/);
  assert.doesNotMatch(panelSource, /edition === ["']java["'] \? ["']Java["'] : ["']Bedrock["']/);
  assert.match(pageSource, /const verificationTarget =/);
  assert.match(pageSource, /selectIdentityVerificationTarget/);
  assert.doesNotMatch(pageSource, /javaVerification/);
  assert.doesNotMatch(pageSource, /bedrockVerification/);
});

test("keeps opinion and official reply editors behind accessible dialogs", () => {
  const sectionSource = readProjectFile("src/components/review-section.tsx");
  const replyFormSource = readProjectFile("src/components/official-reply-form.tsx");
  const replyEditorSource = readProjectFile("src/components/official-reply-editor.tsx");
  const editDialogPath = path.resolve("src/components/review-edit-dialog.tsx");

  assert.equal(
    existsSync(editDialogPath),
    true,
    "the opinion editor should be a dedicated dialog component",
  );
  const editDialogSource = readFileSync(editDialogPath, "utf8");

  assert.match(sectionSource, /ReviewEditDialog/);
  assert.doesNotMatch(sectionSource, /<ReviewForm[^>]*action=\{updateReviewAction\}/);
  assert.match(editDialogSource, /DialogTrigger/);
  assert.match(editDialogSource, /DialogContent/);
  assert.match(editDialogSource, /<ReviewForm[\s\S]*editing/);
  assert.match(replyFormSource, /DialogTrigger/);
  assert.match(replyFormSource, /DialogContent/);
  assert.match(replyEditorSource, /DialogTrigger/);
  assert.match(replyEditorSource, /DialogContent/);
});

test("groups official reply edit and delete actions together", () => {
  const source = readProjectFile("src/components/review-card.tsx");
  const actionsStart = source.indexOf('<div className="flex flex-wrap items-center justify-between gap-2">');
  const contentStart = source.indexOf('<p className="mt-2 text-sm leading-6 text-muted-foreground">{review.reply.content}</p>');

  assert.ok(actionsStart >= 0, "official reply actions should have a shared action row");
  assert.ok(contentStart > actionsStart, "official reply content should follow the action row");
  const actionSource = source.slice(actionsStart, contentStart);

  assert.match(actionSource, /deleteOfficialReplyAction/);
  assert.match(actionSource, /<OfficialReplyEditor/);
});

test("shows a completed state for an already verified identity", () => {
  const source = readProjectFile("src/components/verification-panel.tsx");

  assert.match(source, /\{verified \? \(/);
  assert.match(source, /La identidad de este servidor ya está verificada/);
});

test("adds server access constraints without blocking the migration scan", () => {
  const source = readProjectFile("src/migrations/20260817120000_server_access_details/migration.sql");

  assert.match(source, /servers_access_form_url_check[\s\S]*?NOT VALID/);
  assert.match(source, /servers_account_auth_mode_check[\s\S]*?NOT VALID/);
  assert.match(source, /VALIDATE CONSTRAINT "servers_access_form_url_check"/);
  assert.match(source, /VALIDATE CONSTRAINT "servers_account_auth_mode_check"/);
});

test("keeps the E2E server fixture aligned with the shared host input", () => {
  const source = readProjectFile("tests/e2e/helpers.ts");

  assert.match(source, /input\[name="host"\]/);
  assert.doesNotMatch(source, /input\[name="javaHost"\]/);
});

test("uses complete identities for verified endpoints and one directory grid template", () => {
  const detailSource = readProjectFile("src/app/servers/[slug]/page.tsx");
  const directorySource = readProjectFile("src/app/servers/page.tsx");
  const rowSource = readProjectFile("src/components/public-server-row.tsx");

  assert.match(detailSource, /<EndpointRow key=\{`\$\{item\.edition\}:\$\{item\.host\}:\$\{item\.port\}`\} endpoint=\{item\} \/>/);
  assert.doesNotMatch(detailSource, /<EndpointRow key=\{item\.edition\}/);
  assert.match(directorySource, /export const tableGridTemplate =/);
  assert.match(rowSource, /import \{ tableGridTemplate \} from ["']@\/app\/servers\/page["']/);
  assert.match(rowSource, /\$\{tableGridTemplate\}/);
});

test("describes relevance ordering when a search has no explicit table sort", () => {
  const source = readProjectFile("src/app/servers/page.tsx");

  assert.match(source, /function orderSummary\([^)]*hasQuery/);
  assert.match(source, /if \(hasQuery && !activeSort\) return "Ordenado por relevancia";/);
  assert.match(source, /orderSummary\(activeTableSort, activeTableDirection, sort, hasQuery\)/);
});

test("only reports a successful share when the share or clipboard capability succeeds", () => {
  const source = readProjectFile("src/components/server-utility-actions.tsx");

  assert.match(source, /if \(!navigator\.clipboard\?\.writeText\) throw new Error\("Clipboard API unavailable"\);/);
  assert.match(source, /\{shared \? "Compartido" : "Compartir"\}/);
  assert.doesNotMatch(source, /else await navigator\.clipboard\?\.writeText\(url\)/);
});

test("shows the platform-specific search shortcut without changing its keyboard behavior", () => {
  const source = readProjectFile("src/components/site-header.tsx");

  assert.match(source, /useSyncExternalStore/);
  assert.match(source, /const isMac = useSyncExternalStore\(emptySubscribe, getMacPlatform, getServerPlatform\);/);
  assert.doesNotMatch(source, /setIsMac/);
  assert.match(source, /\{isMac \? "⌘ K" : "Ctrl K"\}/);
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "k"/);
});

test("shares server status and edition presentation helpers", () => {
  const formatSource = readProjectFile("src/lib/servers/format.ts");
  const rowSource = readProjectFile("src/components/public-server-row.tsx");
  const detailSource = readProjectFile("src/app/servers/[slug]/page.tsx");

  assert.match(formatSource, /export function editionLabel/);
  assert.match(rowSource, /import \{ StatusPill \} from ["']@\/components\/server-status-pill["']/);
  assert.doesNotMatch(rowSource, /function statusLabel/);
  assert.doesNotMatch(rowSource, /function StatusPill/);
  assert.match(rowSource, /editionLabel\(server\)/);
  assert.match(detailSource, /editionLabel\(server\)/);
  assert.match(detailSource, /statusLabel\(server\.aggregateStatus\)/);
  assert.doesNotMatch(detailSource, /const editions = \[\.\.\.new Set/);
  assert.doesNotMatch(detailSource, /const compactStatus =/);
});

test("uses a stable test id for the Discord icon in both server E2E flows", () => {
  const detailSource = readProjectFile("src/app/servers/[slug]/page.tsx");
  const lifecycleSource = readProjectFile("tests/e2e/server-lifecycle.spec.ts");
  const utilitySource = readProjectFile("tests/e2e/server-utility-actions.spec.ts");

  assert.match(detailSource, /data-testid=\{iconTestId\}/);
  assert.match(detailSource, /iconTestId="discord-icon"/);
  for (const source of [lifecycleSource, utilitySource]) {
    assert.match(source, /discordLink\.getByTestId\("discord-icon"\)/);
    assert.doesNotMatch(source, /tabler-icon-brand-discord/);
  }
});

test("answers the verification forms in place instead of redirecting to the top of the manage page", () => {
  const actionsSource = readProjectFile("src/app/servers/[slug]/manage/actions.ts");
  const panelSource = readProjectFile("src/components/verification-panel.tsx");
  const pageSource = readProjectFile("src/app/servers/[slug]/manage/page.tsx");

  assert.doesNotMatch(actionsSource, /verification=|verificationError=/, "the verification actions should not redirect with a query flag");
  assert.match(actionsSource, /export async function checkVerificationAction\(_previousState: VerificationState/);
  assert.match(actionsSource, /return \{ outcome: result\.result \};/);
  assert.match(panelSource, /useActionState\(checkVerificationAction, null\)/);
  assert.match(panelSource, /useActionState\(startVerificationAction, null\)/);
  assert.doesNotMatch(pageSource, /query\.verification/, "the verification result now renders inside the panel");
});
