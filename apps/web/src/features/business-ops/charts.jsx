// Apoyos para las gráficas (recharts) con los colores sólidos del tema. Sin degradados.
import { ResponsiveContainer } from 'recharts';

export const CHART = {
  primary: '#0A7DB2',
  soft: '#8CC6E0',
  error: '#C23A3A',
  grid: '#E3E9EF',
  muted: '#5D6B79',
  text: '#0E1A26',
  cursor: '#EAF5FB',
};

/** Contenedor que se ajusta al ancho, con una descripción para lectores de pantalla. */
export function ChartBox({ height = 240, label, children }) {
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Tooltip con el estilo de las tarjetas: título y una fila por serie. */
export function ChartTooltip({ active, payload, label, format = (v) => v, labelFormat }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] shadow-sm">
      <p className="mb-1 font-bold">{labelFormat ? labelFormat(label, payload) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          {payload.length > 1 && (
            <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
          )}
          {payload.length > 1 && `${p.name}: `}
          <span className="font-bold text-foreground">{format(p.value, p)}</span>
        </p>
      ))}
    </div>
  );
}
