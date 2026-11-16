import { monthAbbr, dayNum } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Cajita con mes y día: NOV / 18 */
export function DateBox({ date, className }) {
  return (
    <div
      className={cn(
        'flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-soft py-2',
        className,
      )}
    >
      <span className="text-[11px] font-extrabold tracking-wide text-primary">
        {monthAbbr(date)}
      </span>
      <span className="text-[22px] leading-7 font-extrabold">{dayNum(date)}</span>
    </div>
  );
}
