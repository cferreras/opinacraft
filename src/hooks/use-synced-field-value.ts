"use client";

import { useState } from "react";

// The catalog filter bar renders on the same route as its results, so "Borrar filtros", an active
// filter chip or the back button re-render these controls instead of remounting them — and an
// uncontrolled field would keep displaying the value the URL no longer carries. Local state keeps
// the control instant when the visitor picks something, and following the incoming value keeps it
// honest once the navigation lands.
//
// `resetWhen` covers what a change of value cannot see: an unsent draft in the search box sits on
// top of an incoming value that stays "" across the navigation, so nothing about the value itself
// says the bar was emptied. The catalog turns it on the moment the URL goes back to carrying no
// filters, and only that transition resets — a draft survives a facet the visitor narrows by,
// which is why this is not simply "reset on every navigation".
export function useSyncedFieldValue(incoming: string, resetWhen = false) {
  const [value, setValue] = useState(incoming);
  const [last, setLast] = useState({ incoming, resetWhen });

  if (incoming !== last.incoming || (resetWhen && !last.resetWhen)) {
    setLast({ incoming, resetWhen });
    setValue(incoming);
  } else if (resetWhen !== last.resetWhen) {
    setLast({ incoming, resetWhen });
  }

  return [value, setValue] as const;
}
