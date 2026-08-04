import { AlertTriangle } from "lucide-react";

import { deleteServerAction } from "@/app/servers/[slug]/manage/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function DeleteServerForm({ serverId, slug }: { serverId: string; slug: string }) {
  return (
    <Alert variant="destructive" className="flex items-center justify-between gap-4">
      <div>
        <AlertTitle className="flex items-center gap-2"><AlertTriangle className="size-4" />Eliminar servidor</AlertTitle>
        <AlertDescription>Elimina el servidor, sus direcciones y el acceso del equipo de forma permanente.</AlertDescription>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">Eliminar</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este servidor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Escribe DELETE para confirmar la eliminación permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={deleteServerAction} className="grid gap-4">
            <input type="hidden" name="serverId" value={serverId} />
            <input type="hidden" name="slug" value={slug} />
            <Field>
              <FieldLabel htmlFor="delete-confirmation">Confirmación</FieldLabel>
              <Input id="delete-confirmation" name="confirmation" required autoComplete="off" />
              <FieldDescription>Introduce exactamente DELETE.</FieldDescription>
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <Button type="submit" variant="destructive">Eliminar permanentemente</Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Alert>
  );
}
