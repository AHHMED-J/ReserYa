// Editor del horario semanal de un recurso (RF-18): varios bloques por día, sin encimarse.
import { Plus, X, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { WEEKDAYS } from './constants';

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const DEFAULT_BLOCK = { start: '09:00', end: '18:00' };

/** [{ weekday, start, end }] → { 0: [{start, end}], ... } */
export const blocksToDays = (blocks = []) => {
  const days = Object.fromEntries(WEEKDAYS.map((d) => [d.value, []]));
  for (const b of blocks) days[b.weekday].push({ start: b.start, end: b.end });
  return days;
};

/** { 0: [...], ... } → [{ weekday, start, end }] */
export const daysToBlocks = (days) =>
  Object.entries(days).flatMap(([weekday, list]) =>
    list.map((b) => ({ weekday: Number(weekday), start: b.start, end: b.end })),
  );

/** Errores por día: { 1: 'mensaje' } */
export function validateDays(days) {
  const errors = {};
  for (const [weekday, list] of Object.entries(days)) {
    if (list.some((b) => !b.start || !b.end)) {
      errors[weekday] = 'Completa las horas';
      continue;
    }
    if (list.some((b) => toMin(b.start) >= toMin(b.end))) {
      errors[weekday] = 'La hora de inicio debe ser antes de la de fin';
      continue;
    }
    const sorted = [...list].sort((a, b) => toMin(a.start) - toMin(b.start));
    if (sorted.some((b, i) => i > 0 && toMin(b.start) < toMin(sorted[i - 1].end)))
      errors[weekday] = 'Hay horarios que se enciman';
  }
  return errors;
}

/** days: { weekday: [{start, end}] }. onChange(newDays). */
export function ScheduleEditor({ days, onChange, errors = {} }) {
  const setDay = (weekday, list) => onChange({ ...days, [weekday]: list });
  const copyToOpen = (weekday) => {
    const src = days[weekday];
    const next = { ...days };
    for (const d of WEEKDAYS) {
      if (d.value !== weekday && next[d.value].length > 0)
        next[d.value] = src.map((b) => ({ ...b }));
    }
    onChange(next);
  };
  const openCount = WEEKDAYS.filter((d) => days[d.value].length > 0).length;

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {WEEKDAYS.map((d) => {
        const list = days[d.value];
        const open = list.length > 0;
        return (
          <div key={d.value} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
            <label className="flex w-36 shrink-0 items-center gap-3 pt-2 text-sm font-bold">
              <Switch
                checked={open}
                onCheckedChange={(on) => setDay(d.value, on ? [{ ...DEFAULT_BLOCK }] : [])}
                aria-label={`${d.label} abierto`}
              />
              {d.label}
            </label>
            <div className="min-w-0 flex-1">
              {!open ? (
                <p className="pt-2 text-sm text-muted-foreground">Cerrado</p>
              ) : (
                <div className="space-y-2">
                  {list.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        step={300}
                        value={b.start}
                        onChange={(e) =>
                          setDay(
                            d.value,
                            list.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                          )
                        }
                        aria-label={`${d.label}, bloque ${i + 1}, desde`}
                        aria-invalid={Boolean(errors[d.value]) || undefined}
                        className="h-10 w-[120px] px-3"
                      />
                      <span className="text-sm text-muted-foreground">a</span>
                      <Input
                        type="time"
                        step={300}
                        value={b.end}
                        onChange={(e) =>
                          setDay(
                            d.value,
                            list.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                          )
                        }
                        aria-label={`${d.label}, bloque ${i + 1}, hasta`}
                        aria-invalid={Boolean(errors[d.value]) || undefined}
                        className="h-10 w-[120px] px-3"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Quitar bloque ${i + 1} del ${d.label}`}
                        onClick={() =>
                          setDay(
                            d.value,
                            list.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  {errors[d.value] && (
                    <p className="text-xs font-semibold text-error" role="alert">
                      {errors[d.value]}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => {
                        const last = list[list.length - 1];
                        const start = last?.end && last.end < '22:00' ? last.end : '16:00';
                        const endMin = Math.min(toMin(start) + 120, 23 * 60 + 55);
                        const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
                        setDay(d.value, [...list, { start, end }]);
                      }}
                    >
                      <Plus /> Agregar horario
                    </Button>
                    {openCount > 1 && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className={cn('text-muted-foreground')}
                        onClick={() => copyToOpen(d.value)}
                      >
                        <Copy /> Copiar a los demás días abiertos
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Texto corto del horario de un día: "09:00–14:00, 15:00–19:00" */
export const dayText = (list) =>
  list
    .slice()
    .sort((a, b) => toMin(a.start) - toMin(b.start))
    .map((b) => `${b.start}–${b.end}`)
    .join(', ');
