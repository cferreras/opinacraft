import { IconUserPlus, IconUsers } from "@tabler/icons-react";

import {
  addMemberAction,
  changeMemberRoleAction,
  removeMemberAction,
} from "@/app/servers/[slug]/manage/actions";

type Member = { userId: string; name: string; email: string; role: "owner" | "admin" | "editor" };

export function MemberPanel({ serverId, slug, members, canManage }: { serverId: string; slug: string; members: Member[]; canManage: boolean }) {
  return (
    <section className="rounded-2xl border border-[#e0e6eb] bg-white p-5 shadow-[0_0.0625rem_0.125rem_rgba(16,30,45,0.02)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f1ff] text-[#2d34cf]"><IconUsers aria-hidden="true" size="1.0625rem" stroke={1.7} /></span>
        <div>
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[#7a86a0]">Shared access</p>
          <h2 className="mt-1 text-[1.125rem] font-semibold tracking-[-0.025em] text-[#101722]">Members</h2>
          <p className="mt-1.5 text-[0.6875rem] leading-5 text-[#667287]">Give trusted teammates the right level of access to this server listing.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2.5">
        {members.map((member) => (
          <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e1e6eb] bg-[#fbfcff] p-3">
            <div className="min-w-0">
              <p className="truncate text-[0.75rem] font-semibold text-[#1b2638]">{member.name}</p>
              <p className="mt-0.5 truncate text-[0.625rem] text-[#7a8698]">{member.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {canManage && member.role !== "owner" ? (
                <form action={changeMemberRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="serverId" value={serverId} />
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="targetUserId" value={member.userId} />
                  <select name="role" defaultValue={member.role} aria-label={`Role for ${member.email}`} className="h-9 rounded-lg border border-[#dce2e7] bg-white px-2 text-[0.625rem] text-[#35415b] outline-none focus:border-[#4655e8] focus:ring-2 focus:ring-[#4655e8]/15">
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button className="inline-flex h-9 items-center rounded-lg border border-[#dce2e7] bg-white px-2.5 text-[0.625rem] font-semibold text-[#2d34cf] transition hover:bg-[#f0f1ff]" type="submit">Save</button>
                </form>
              ) : <span className="rounded-full bg-[#f0f1ff] px-2.5 py-1 text-[0.625rem] font-semibold capitalize text-[#2d34cf]">{member.role}</span>}
              {canManage && member.role !== "owner" ? <form action={removeMemberAction}><input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="targetUserId" value={member.userId} /><button type="submit" className="inline-flex h-9 items-center rounded-lg px-2 text-[0.625rem] font-semibold text-[#c43b45] transition hover:bg-[#fff3f3]">Remove</button></form> : null}
            </div>
          </div>
        ))}
      </div>

      {canManage ? (
        <form action={addMemberAction} className="mt-5 rounded-xl border border-dashed border-[#cfd6df] bg-[#fbfcff] p-3">
          <div className="mb-3 flex items-center gap-2 text-[0.6875rem] font-semibold text-[#35415b]"><IconUserPlus aria-hidden="true" size="0.9375rem" stroke={1.7} />Add a teammate</div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8.125rem_auto]">
            <input type="hidden" name="serverId" value={serverId} />
            <input type="hidden" name="slug" value={slug} />
            <input name="email" type="email" required placeholder="member@example.com" className="h-10 rounded-lg border border-[#dce2e7] bg-white px-3 text-[0.6875rem] text-[#27324a] outline-none placeholder:text-[#98a2b1] focus:border-[#4655e8] focus:ring-2 focus:ring-[#4655e8]/15" />
            <select name="role" defaultValue="editor" className="h-10 rounded-lg border border-[#dce2e7] bg-white px-2 text-[0.6875rem] text-[#35415b] outline-none focus:border-[#4655e8] focus:ring-2 focus:ring-[#4655e8]/15"><option value="editor">Editor</option><option value="admin">Admin</option></select>
            <button className="inline-flex h-10 items-center justify-center rounded-lg bg-[#3029e7] px-4 text-[0.6875rem] font-semibold text-white shadow-[0_0.25rem_0.625rem_rgba(48,41,231,0.13)] transition hover:bg-[#2821c8]">Add</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
