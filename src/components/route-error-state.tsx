"use client";

import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RouteErrorState({
  error,
  reset,
  title,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
}) {
  useEffect(() => {
    console.error("Route failed", { name: error.name, message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-[60vh] place-items-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <Alert>
            <AlertTitle>Señal del sistema</AlertTitle>
            <AlertDescription>Vuelve a intentarlo dentro de un momento.</AlertDescription>
          </Alert>
          <Button type="button" onClick={reset}>Reintentar</Button>
        </CardContent>
      </Card>
    </main>
  );
}
