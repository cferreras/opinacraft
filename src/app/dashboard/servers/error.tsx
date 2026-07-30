"use client";

import { RouteErrorState } from "@/components/route-error-state";

export default function ManagedServersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      title="Unable to load your servers"
    />
  );
}
