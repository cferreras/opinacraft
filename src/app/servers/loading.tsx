import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingServersPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-9 sm:px-6 lg:px-8">
      <Skeleton className="h-9 w-[28rem] max-w-full" />
      <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Skeleton className="h-10 min-w-0 flex-1" />
        <Skeleton className="h-10 w-full sm:w-56" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:items-start">
        <Skeleton className="hidden h-96 w-full lg:block" />
        <div className="min-w-0">
          <Card className="gap-0 overflow-hidden border-0 bg-transparent py-0 shadow-none ring-0 lg:bg-card lg:ring-1">
            <div className="px-4 py-3"><Skeleton className="h-5 w-56 max-w-full" /></div>
            <CardContent className="flex flex-col gap-2 p-0 lg:block">
              <Skeleton className="h-24 w-full lg:h-20 lg:rounded-none" />
              <Skeleton className="h-24 w-full lg:h-20 lg:rounded-none" />
              <Skeleton className="h-24 w-full lg:h-20 lg:rounded-none" />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
