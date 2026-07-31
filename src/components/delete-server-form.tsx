import { deleteServerAction } from "@/app/servers/[slug]/manage/actions";

export function DeleteServerForm({ serverId, slug }: { serverId: string; slug: string }) {
  return <details className="rounded-xl border border-red-200 p-4 dark:border-red-900"><summary className="cursor-pointer text-sm font-semibold text-red-700 dark:text-red-300">Delete server</summary><form action={deleteServerAction} className="mt-4 flex flex-wrap items-end gap-3"><input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><label className="text-sm text-zinc-600 dark:text-zinc-400">Type DELETE to confirm<input name="confirmation" required className="mt-2 h-10 rounded-lg border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" /></label><button className="h-10 rounded-lg bg-red-700 px-4 text-sm font-medium text-white">Delete permanently</button></form></details>;
}
