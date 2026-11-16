import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding font-bold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:bg-border disabled:text-disabled disabled:border-transparent aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-pressed',
        outline: 'border-field bg-white text-foreground hover:bg-surface',
        'outline-primary': 'border-primary-line bg-white text-primary hover:bg-primary-soft',
        soft: 'bg-primary-soft text-primary hover:bg-primary-line',
        secondary: 'bg-surface text-foreground hover:bg-neutral-soft',
        dark: 'bg-foreground text-white hover:bg-foreground/90',
        destructive: 'border-field bg-white text-error hover:bg-error-soft',
        'destructive-solid': 'bg-error text-white hover:bg-error/90',
        ghost: 'text-foreground hover:bg-surface',
        link: 'h-auto! px-0! text-primary hover:underline underline-offset-4',
      },
      size: {
        default: 'h-10 px-4 text-sm',
        sm: "h-8 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-4",
        lg: 'h-12 px-5 text-[15px]',
        icon: 'size-10',
        'icon-sm': "size-8 [&_svg:not([class*='size-'])]:size-4",
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({ className, variant = 'default', size = 'default', ...props }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
