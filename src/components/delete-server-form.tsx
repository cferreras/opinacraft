import { IconAlertTriangle } from "@tabler/icons-react";

import { deleteServerAction } from "@/app/servers/[slug]/manage/actions";

export function DeleteServerForm({ serverId, slug }: { serverId: string; slug: string }) {
  return (
    <details className="rounded-2xl border border-[#f1d5d7] bg-[#fffafa] p-5 sm:p-6">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[0.8125rem] font-semibold text-[#b33642] marker:hidden">
        <IconAlertTriangle aria-hidden="true" size="1.0625rem" stroke={1.7} />
        Delete server
      </summary>
      <p className="mt-3 max-w-[35rem] text-[0.6875rem] leading-5 text-[#8c6570]">This removes the server, its addresses and its team access permanently. Use this only if you are sure.</p>
      <form action={deleteServerAction} className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="serverId" value={serverId} />
        <input type="hidden" name="slug" value={slug} />
        <label className="block min-w-0 text-[0.6875rem] font-semibold text-[#7f4d58]">
          <span className="block">Type DELETE to confirm</span>
          <input name="confirmation" required className="mt-2 h-10 w-full rounded-lg border border-[#e5c4c8] bg-white px-3 text-[0.6875rem] text-[#27324a] outline-none focus:border-[#c43b45] focus:ring-2 focus:ring-[#c43b45]/10 sm:max-w-64" />
        </label>
        <button className="inline-flex h-10 items-center justify-center rounded-lg bg-[#b33642] px-4 text-[0.6875rem] font-semibold text-white transition hover:bg-[#982b36]">Delete permanently</button>
      </form>
    </details>
  );
}
