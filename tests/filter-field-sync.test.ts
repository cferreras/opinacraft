import assert from "node:assert/strict";
import test from "node:test";

import { syncedFieldState, type SyncedFieldState } from "@/hooks/use-synced-field-value";

/** A field being used: the visitor types, navigations land, and the value is whatever it shows. */
function field(initial = "") {
  let state: SyncedFieldState = { value: initial, incoming: initial, resetWhen: false };

  return {
    get value() {
      return state.value;
    },
    get state() {
      return state;
    },
    type(text: string) {
      state = { ...state, value: text };
    },
    /** A navigation lands: `hold` is true while the visitor is still inside the field. */
    navigation({ incoming, resetWhen = false, hold = false }: { incoming: string; resetWhen?: boolean; hold?: boolean }) {
      state = syncedFieldState(state, { incoming, resetWhen, hold });
    },
  };
}

test("a search the box itself launched does not put back the text it was launched with", () => {
  const box = field();

  // The visitor types enough to trigger the debounced search...
  box.type("survival");
  // ...and keeps typing while it is in flight.
  box.type("survival en españa");
  // The search lands carrying the query it left with.
  box.navigation({ incoming: "survival", hold: true });

  assert.equal(box.value, "survival en españa", "the text typed while searching must survive the search");
});

test("the text also survives a search that resolved to filters and dropped the query", () => {
  const box = field();

  box.type("algo tranquilo para construir");
  // A confident reading replaces the text with filters, so the URL comes back with no `q` at all.
  box.navigation({ incoming: "", hold: true });

  assert.equal(box.value, "algo tranquilo para construir");
});

test("a change that arrived mid-sentence is not applied later, on leaving the field", () => {
  const box = field();

  box.type("survival en españa");
  box.navigation({ incoming: "survival", hold: true });
  // The visitor leaves the box. Nothing new has arrived, so nothing should change — the value that
  // was held has to count as seen, or it would be adopted now, one navigation late.
  box.navigation({ incoming: "survival", hold: false });

  assert.equal(box.value, "survival en españa");
});

test("a navigation the visitor caused elsewhere still wins", () => {
  const box = field("survival");

  // Removing the "Búsqueda: survival" chip navigates to a URL with no query.
  box.navigation({ incoming: "", hold: false });
  assert.equal(box.value, "");

  // And the back button brings the query back.
  box.navigation({ incoming: "survival", hold: false });
  assert.equal(box.value, "survival");
});

test("clearing the filters empties the box even while it is being typed in", () => {
  const box = field();

  box.type("un borrador sin enviar");
  // "Borrar filtros" is a decision about the whole bar, and the incoming value never changed: only
  // `resetWhen` says the catalog is unfiltered again.
  box.navigation({ incoming: "", resetWhen: true, hold: true });

  assert.equal(box.value, "");
});

test("a draft survives narrowing by another facet", () => {
  const box = field();

  box.type("un borrador sin enviar");
  // Picking a country navigates without sending the draft: the query stays "" and the bar is still
  // filtered, so nothing about this navigation says the draft should go.
  box.navigation({ incoming: "", resetWhen: false, hold: false });

  assert.equal(box.value, "un borrador sin enviar");
});

test("a navigation that changes nothing returns the same state, so no render can loop", () => {
  const box = field("survival");
  const before = box.state;

  box.navigation({ incoming: "survival", hold: false });
  assert.equal(box.state, before, "an unchanged input must not produce a new state object");

  box.navigation({ incoming: "survival", hold: true });
  assert.equal(box.state, before);
});

test("the filter pills keep following the URL, since they never hold", () => {
  const pill = field("");

  pill.navigation({ incoming: "survival" });
  assert.equal(pill.value, "survival");
  pill.navigation({ incoming: "skyblock" });
  assert.equal(pill.value, "skyblock");
  pill.navigation({ incoming: "" });
  assert.equal(pill.value, "");
});
