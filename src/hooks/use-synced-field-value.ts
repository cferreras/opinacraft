"use client";

import { useCallback, useState } from "react";

export type SyncedFieldState = { value: string; incoming: string; resetWhen: boolean };
export type SyncedFieldInput = { incoming: string; resetWhen: boolean; hold: boolean };

/**
 * The one transition this hook makes, as a function, so the sequence that matters can be tested
 * without a browser.
 *
 * The catalog filter bar renders on the same route as its results, so "Borrar filtros", an active
 * filter chip or the back button re-render these controls instead of remounting them — and an
 * uncontrolled field would keep displaying the value the URL no longer carries. Local state keeps
 * the control instant when the visitor picks something, and following the incoming value keeps it
 * honest once the navigation lands.
 *
 * `resetWhen` covers what a change of value cannot see: an unsent draft in the search box sits on
 * top of an incoming value that stays "" across the navigation, so nothing about the value itself
 * says the bar was emptied. The catalog turns it on the moment the URL goes back to carrying no
 * filters, and only that transition resets — a draft survives a facet the visitor narrows by,
 * which is why this is not simply "reset on every navigation".
 *
 * `hold` is what the search box needs once it navigates on its own, on a debounce, while the
 * visitor is still typing. Those navigations make the URL a *result* of the field rather than its
 * source: adopting the value they carry would put back the text as it was when the search left and
 * erase everything typed since. While the field is held, the incoming value is still recorded —
 * otherwise leaving the field would apply, late, a change that arrived mid-sentence — but it is
 * not displayed. Clearing the filters still wins, because that is a decision the visitor took
 * about the whole bar.
 */
export function syncedFieldState(state: SyncedFieldState, { incoming, resetWhen, hold }: SyncedFieldInput): SyncedFieldState {
  const incomingChanged = incoming !== state.incoming;
  const clearing = resetWhen && !state.resetWhen;

  if (!incomingChanged && !clearing) {
    return resetWhen === state.resetWhen ? state : { ...state, resetWhen };
  }

  return { value: hold && !clearing ? state.value : incoming, incoming, resetWhen };
}

export function useSyncedFieldValue(incoming: string, resetWhen = false, hold = false) {
  const [state, setState] = useState<SyncedFieldState>({ value: incoming, incoming, resetWhen });
  const next = syncedFieldState(state, { incoming, resetWhen, hold });
  if (next !== state) setState(next);

  const setValue = useCallback((value: string) => setState((current) => ({ ...current, value })), []);
  return [next.value, setValue] as const;
}
