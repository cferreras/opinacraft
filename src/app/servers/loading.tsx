import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingServersPage() {
  return <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8"><Skeleton className="h-4 w-32" /><Skeleton className="mt-5 h-10 w-80 max-w-full" /><Skeleton className="mt-3 h-5 w-96 max-w-full" /><Card className="mt-8"><CardHeader><Skeleton className="h-9 w-full" /></CardHeader><CardContent className="grid gap-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></CardContent></Card></main>;
}
