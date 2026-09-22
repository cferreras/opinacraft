import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Two reported faults in the same component, both of them silence where something should have
// happened: the verification spun forever, and the hint line held a gap open when it had nothing
// to say.

const source = () => readFileSync("src/components/ai-search-box.tsx", "utf8");

test("a challenge that turns interactive stops being invisible", () => {
  const code = source();

  // The cause of the endless spinner: `appearance: "interaction-only"` draws the checkbox inside the
  // widget's own container the moment Cloudflare wants an answer, and that container was `sr-only` —
  // 1x1px and clipped. Nothing was broken from Turnstile's side, so no error fired; it just waited
  // for an answer nobody could give it.
  assert.match(code, /"before-interactive-callback": \(\) => setChallengeVisible\(true\)/);
  assert.match(code, /"after-interactive-callback": \(\) => setChallengeVisible\(false\)/);
  // And the container has to actually respond to that.
  assert.match(code, /challengeVisible \? "flex min-h-\[65px\] items-center" : "sr-only"/);
  assert.doesNotMatch(code, /ref=\{invisibleRef\}\s+className="sr-only"/, "the container must not be unconditionally hidden");
});

test("every way a challenge can end is wired, so none of them can hang", () => {
  const code = source();

  for (const callback of [
    "callback",
    "error-callback",
    // An interactive challenge left unsolved. Unwired, the widget simply stops and the box waits.
    "timeout-callback",
    // Turnstile cannot run in this browser at all.
    "unsupported-callback",
    "expired-callback",
  ]) {
    assert.ok(code.includes(`${callback}"`) || code.includes(`${callback}:`), `${callback} is not wired`);
  }
});

test("a focus before the script arrives is remembered instead of dropped", () => {
  const code = source();

  // The script loads with `lazyOnload`, so an early focus found no `window.turnstile` and returned.
  // The visitor typed, nothing verified, and the AI layer stayed asleep until they clicked away and
  // back again.
  assert.match(code, /challengeWantedRef\.current = true/);
  assert.match(code, /if \(challengeWantedRef\.current && widgetId\)/);
});

test("the hint line takes no room when it has nothing to say", () => {
  const code = source();

  // It used to be one `<p>` with `min-h-5`, which reserved its line either way — and as a flex child
  // of a `gap-3` card it cost the gap as well, so an idle box carried a visible hole.
  assert.doesNotMatch(code, /id="server-search-hint"[^>]*min-h-5/);
  assert.match(code, /\{hint \? \(/, "the visible line is conditional");
  // But the live region stays: an aria-live element has to exist before its content changes, or the
  // change is never announced.
  assert.match(code, /id="server-search-hint" aria-live="polite" className="sr-only"/);
  // One derivation feeds both, so the announced text and the shown text cannot drift apart.
  assert.match(code, /const hint: \{ text: string; icon\?: ReactNode; action\?: ReactNode \} \| null/);
});
