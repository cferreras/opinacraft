import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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

test("passes a shaped payload to the server manage client boundary", () => {
  const source = readProjectFile("src/app/servers/[slug]/manage/page.tsx");

  assert.match(source, /toServerManageFormData/);
  assert.match(source, /<ServerManageForm server=\{serverFormData\}/);
  assert.doesNotMatch(source, /<ServerManageForm server=\{server\}/);
});

test("narrows profile effects to the authenticated user identity", () => {
  const source = readProjectFile("src/app/profile/page.tsx");

  assert.match(source, /session\?\.user\?\.id/);
  assert.doesNotMatch(source, /\}, \[session\]\);/);
});

test("keeps sortable header hover compact without rounded edges", () => {
  const source = readProjectFile("src/app/servers/page.tsx");
  const headerSource = source.slice(
    source.indexOf("function SortableColumnHeader"),
    source.indexOf("function countLabel"),
  );
  const linkClass = headerSource.match(/<Link[\s\S]*?className="([^"]+)"/)?.[1];

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

test("synchronizes the catalog sort control with sortable table state", () => {
  const source = readProjectFile("src/app/servers/page.tsx");

  assert.match(source, /const activeTableSort = tableSort \?\?/);
  assert.match(source, /const activeTableDirection(?:[^=]*)= tableSort \?/);
  assert.match(source, /defaultValue=\{tableSort \? "table" : sort\}/);
  assert.match(source, /<option value="table" disabled>/);
});

test("preserves table sorting when the catalog filters submit", () => {
  const pageSource = readProjectFile("src/app/servers/page.tsx");
  const filterSource = readProjectFile("src/components/filter-select.tsx");

  assert.match(pageSource, /name="tableSort" value=\{tableSort\}/);
  assert.match(pageSource, /name="tableDirection" value=\{tableDirection\}/);
  assert.match(pageSource, /clearFieldsOnChange=\{tableSort \? \["tableSort", "tableDirection"\] : undefined\}/);
  assert.match(filterSource, /clearFieldsOnChange\?: string\[\]/);
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
