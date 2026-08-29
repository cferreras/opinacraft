import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const helperPath = path.resolve("src/lib/servers/draft-progress.ts");
const readProjectFile = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");

const emptyDraft = {
  name: "",
  host: "",
  javaEnabled: true,
  javaPort: "25565",
  bedrockEnabled: false,
  bedrockPort: "19132",
  logoName: null as string | null,
};

async function loadHelper() {
  assert.equal(existsSync(helperPath), true, "the new server draft should have a shared progress helper");
  return import(pathToFileURL(helperPath).href);
}

test("counts no required field as done in an untouched draft", async () => {
  const { serverDraftRequiredProgress } = await loadHelper();

  assert.deepEqual(serverDraftRequiredProgress(emptyDraft), { completed: 0, total: 3 });
});

test("counts each required field once the draft fills it", async () => {
  const { serverDraftRequiredProgress } = await loadHelper();

  assert.deepEqual(
    serverDraftRequiredProgress({ ...emptyDraft, name: "Astral SMP" }),
    { completed: 1, total: 3 },
  );
  assert.deepEqual(
    serverDraftRequiredProgress({ ...emptyDraft, name: "Astral SMP", host: "play.astralsmp.es" }),
    { completed: 3, total: 3 },
  );
});

test("stops counting the edition requirement when every edition is disabled", async () => {
  const { serverDraftRequiredProgress } = await loadHelper();

  assert.deepEqual(
    serverDraftRequiredProgress({
      ...emptyDraft,
      name: "Astral SMP",
      host: "play.astralsmp.es",
      javaEnabled: false,
    }),
    { completed: 2, total: 3 },
  );
});

test("stops counting the edition requirement when the enabled port is out of range", async () => {
  const { serverDraftRequiredProgress } = await loadHelper();

  assert.deepEqual(
    serverDraftRequiredProgress({
      ...emptyDraft,
      name: "Astral SMP",
      host: "play.astralsmp.es",
      javaPort: "80",
    }),
    { completed: 2, total: 3 },
  );
});

test("marks the identity section complete only once the name reaches its minimum length", async () => {
  const { serverDraftSections } = await loadHelper();
  const identityOf = (draft: typeof emptyDraft) =>
    serverDraftSections(draft).find((section: { id: string }) => section.id === "identity");

  assert.equal(identityOf({ ...emptyDraft, name: "AS" })?.complete, false);
  assert.equal(identityOf({ ...emptyDraft, name: "Astral SMP" })?.complete, true);
});

test("keeps the logo section optional and complete only with a chosen file", async () => {
  const { serverDraftSections } = await loadHelper();
  const logoOf = (draft: typeof emptyDraft) =>
    serverDraftSections(draft).find((section: { id: string }) => section.id === "logo");

  assert.equal(logoOf(emptyDraft)?.optional, true);
  assert.equal(logoOf(emptyDraft)?.complete, false);
  assert.equal(logoOf({ ...emptyDraft, logoName: "astral-mark.png" })?.complete, true);
});

test("numbers the four draft sections in the order the form presents them", async () => {
  const { serverDraftSections } = await loadHelper();

  assert.deepEqual(
    serverDraftSections(emptyDraft).map((section: { id: string; number: string }) => [section.number, section.id]),
    [["01", "identity"], ["02", "logo"], ["03", "endpoints"], ["04", "access"]],
  );
});

test("lists the addresses players will copy, hiding the default ports", async () => {
  const { serverDraftAddresses } = await loadHelper();

  assert.deepEqual(
    serverDraftAddresses({ ...emptyDraft, host: "play.astralsmp.es", bedrockEnabled: true }),
    [
      { edition: "java", address: "play.astralsmp.es" },
      { edition: "bedrock", address: "play.astralsmp.es" },
    ],
  );
  assert.deepEqual(
    serverDraftAddresses({ ...emptyDraft, host: "play.astralsmp.es", javaPort: "25577" }),
    [{ edition: "java", address: "play.astralsmp.es:25577" }],
  );
});

test("omits disabled editions and unusable hosts from the draft addresses", async () => {
  const { serverDraftAddresses } = await loadHelper();

  assert.deepEqual(serverDraftAddresses({ ...emptyDraft, host: "   " }), []);
  assert.deepEqual(
    serverDraftAddresses({ ...emptyDraft, host: "play.astralsmp.es", javaEnabled: false }),
    [],
  );
});

test("renders the new server page as a sticky rail beside the form", () => {
  const formSource = readProjectFile("src/components/server-form.tsx");
  const railPath = path.resolve("src/components/server-draft-rail.tsx");

  assert.equal(existsSync(railPath), true, "the draft rail should be a dedicated component");
  assert.match(formSource, /lg:grid-cols-\[17\.5rem_minmax\(0,1fr\)\]/);
  assert.match(formSource, /<ServerDraftRail/);
  assert.match(readProjectFile("src/components/server-draft-rail.tsx"), /lg:sticky lg:top-20/);
});

test("drops the standalone publishing aside now that the rail carries that context", () => {
  const pageSource = readProjectFile("src/app/servers/new/page.tsx");

  assert.doesNotMatch(pageSource, /publishingSteps/);
  assert.doesNotMatch(pageSource, /Qué ocurre después/);
  assert.match(pageSource, /<ServerForm \/>/);
});

test("keeps the draft preview in sync with the identity and access fields", () => {
  const formSource = readProjectFile("src/components/server-form.tsx");
  const accessSource = readProjectFile("src/components/server-access-fields.tsx");
  const modesSource = readProjectFile("src/components/game-mode-picker.tsx");

  assert.match(accessSource, /onAccessChange\?:/);
  assert.match(modesSource, /onSelectedChange\?:/);
  assert.match(formSource, /onAccessChange=/);
  assert.match(formSource, /onSelectedChange=/);
});
