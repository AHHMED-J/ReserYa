import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/**
 * Botón que pide confirmación antes de hacer algo destructivo.
 * trigger: props del botón que abre ({ variant, size, children, 'aria-label' }).
 */
export function ConfirmButton({ trigger, title, description, confirmLabel, onConfirm, busy }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" {...trigger} onClick={() => setOpen(true)} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-extrabold">{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive-solid"
              disabled={busy}
              onClick={async () => {
                await onConfirm();
                setOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
