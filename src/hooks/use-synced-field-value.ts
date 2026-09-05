"use client";

import { useState } from "react";

// The catalog filter bar renders on the same route as its results, so "Borrar filtros", an active
// filter chip or the back button re-render these controls instead of remounting them — and an
// uncontrolled field would keep displaying the value the URL no longer carries. Local state keeps
// the control instant when the visitor picks something, and following the incoming value keeps it
// honest once the navigation lands.
export function useSyncedFieldValue(incoming: string) {
  const [value, setValue] = useState(incoming);
  const [lastIncoming, setLastIncoming] = useState(incoming);

  if (incoming !== lastIncoming) {
    setLastIncoming(incoming);
    setValue(incoming);
  }

  return [value, setValue] as const;
}
