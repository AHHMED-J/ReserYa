import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-lg border border-field bg-white px-4 text-[15px] font-medium text-foreground transition-colors outline-none placeholder:font-normal placeholder:text-disabled focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-surface disabled:text-disabled aria-invalid:border-error aria-invalid:ring-1 aria-invalid:ring-error file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-bold',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
