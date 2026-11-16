import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-24 w-full rounded-lg border border-field bg-white px-4 py-3 text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-disabled focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-surface aria-invalid:border-error',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
