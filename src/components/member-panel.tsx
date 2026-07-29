import {
  addMemberAction,
  changeMemberRoleAction,
  removeMemberAction,
} from "@/app/servers/[slug]/manage/actions";

type Member = { userId: string; name: string; email: string; role: "owner" | "admin" | "editor" };

export function MemberPanel({ serverId, slug, members, canManage }: { serverId: string; slug: string; members: Member[]; canManage: boolean }) {
  return (
    <section className="rounded-2xl bg-white p-6 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Members</h2>
      <div className="mt-4 grid gap-3">
        {members.map((member) => (
          <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div><p className="font-medium">{member.name}</p><p className="text-xs text-zinc-500">{member.email}</p></div>
            <div className="flex items-center gap-2">
              {canManage && member.role !== "owner" ? (
                <form action={changeMemberRoleAction} className="flex gap-2">
                  <input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="targetUserId" value={member.userId} />
                  <select name="role" defaultValue={member.role} className="h-9 rounded border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"><option value="admin">Admin</option><option value="editor">Editor</option></select>
                  <button className="text-xs font-medium underline" type="submit">Save</button>
                </form>
              ) : <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs capitalize dark:bg-zinc-800">{member.role}</span>}
              {canManage && member.role !== "owner" ? <form action={removeMemberAction}><input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="targetUserId" value={member.userId} /><button type="submit" className="text-xs text-red-700 underline">Remove</button></form> : null}
            </div>
          </div>
        ))}
      </div>
      {canManage ? <form action={addMemberAction} className="mt-5 grid gap-2 sm:grid-cols-[1fr_130px_auto]"><input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><input name="email" type="email" required placeholder="member@example.com" className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" /><select name="role" defaultValue="editor" className="h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="editor">Editor</option><option value="admin">Admin</option></select><button className="h-10 rounded-lg bg-zinc-950 px-4 text-sm text-white dark:bg-white dark:text-zinc-950">Add</button></form> : null}
    </section>
  );
}
