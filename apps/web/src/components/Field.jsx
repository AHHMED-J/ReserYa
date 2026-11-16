import { useId, cloneElement } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Etiqueta + control + error/ayuda, con id y aria conectados (RNF-04).
 * <Field label="Correo" error={err}><Input type="email" /></Field>
 */
export function Field({ label, error, hint, className, children, optional }) {
  const id = useId();
  const msgId = `${id}-msg`;
  const control = cloneElement(children, {
    id: children.props.id ?? id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? msgId : undefined,
  });
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <Label htmlFor={children.props.id ?? id}>
          {label}
          {optional && <span className="font-medium text-muted-foreground">(opcional)</span>}
        </Label>
      )}
      {control}
      {(error || hint) && (
        <p
          id={msgId}
          className={cn('text-xs', error ? 'font-semibold text-error' : 'text-muted-foreground')}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
