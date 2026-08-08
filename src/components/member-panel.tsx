import { UserPlus, Users } from "lucide-react";

import { addMemberAction, changeMemberRoleAction, removeMemberAction } from "@/app/servers/[slug]/manage/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Member = { userId: string; name: string; email: string; role: "owner" | "admin" | "editor" };

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function MemberPanel({ serverId, slug, members, canManage }: { serverId: string; slug: string; members: Member[]; canManage: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="size-4 text-primary" /> Miembros</CardTitle><p className="text-sm text-muted-foreground">Gestiona el acceso de tu equipo con el nivel adecuado.</p></CardHeader>
      <CardContent className="grid gap-3">
        {members.map((member) => (
          <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex min-w-0 items-center gap-3"><Avatar className="size-8"><AvatarFallback className="text-xs">{initials(member.name || member.email)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-semibold">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p></div></div>
            <div className="flex items-center gap-2">
              {canManage && member.role !== "owner" ? <form action={changeMemberRoleAction} className="flex items-center gap-2"><input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="targetUserId" value={member.userId} /><NativeSelect name="role" defaultValue={member.role} aria-label={`Rol de ${member.email}`}><option value="admin">Administrador</option><option value="editor">Editor</option></NativeSelect><Button type="submit" variant="outline" size="sm" className="h-8">Guardar</Button></form> : <Badge variant="secondary" className="capitalize">{member.role === "owner" ? "propietario" : member.role === "admin" ? "administrador" : "editor"}</Badge>}
              {canManage && member.role !== "owner" ? <form action={removeMemberAction}><input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="targetUserId" value={member.userId} /><Button type="submit" variant="link" size="sm" className="h-auto p-0 text-destructive">Quitar</Button></form> : null}
            </div>
          </div>
        ))}

        {canManage ? <form action={addMemberAction} className="grid gap-3 rounded-lg border border-dashed p-4"><p className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="size-4 text-primary" />Añadir compañero</p><input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end"><Field><FieldLabel htmlFor="member-email">Email</FieldLabel><Input id="member-email" name="email" type="email" required placeholder="miembro@ejemplo.com" /></Field><Field><FieldLabel htmlFor="member-role">Rol</FieldLabel><NativeSelect id="member-role" name="role" defaultValue="editor"><option value="editor">Editor</option><option value="admin">Administrador</option></NativeSelect></Field><Button type="submit">Añadir</Button></div></form> : null}
      </CardContent>
    </Card>
  );
}
