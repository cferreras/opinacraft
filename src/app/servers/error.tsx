"use client";

import { RouteErrorState } from "@/components/route-error-state";

export default function ServersError({
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
      title="Unable to load the server directory"
    />
  );
}
