import { Link } from 'react-router';
import { Notice } from '@/components/Notice';
import { agoText } from '@/lib/format';
import { useCalendarStatus } from './hooks';

/**
 * Aviso corto del estado de Google Calendar para el panel del dueño:
 * "Google Calendar está conectado. Última sincronización hace 2 minutos."
 */
export function CalendarStatusBanner({ className }) {
  const { data } = useCalendarStatus();
  if (!data?.enabled) return null;
  if (data.connected) {
    return (
      <Notice kind={data.failedJobs ? 'warn' : 'ok'} className={className}>
        Google Calendar está conectado.
        {data.lastSyncAt && ` Última sincronización ${agoText(data.lastSyncAt)}.`}
        {data.failedJobs > 0 && (
          <>
            {' '}
            Hay {data.failedJobs} {data.failedJobs === 1 ? 'cita' : 'citas'} sin sincronizar.{' '}
            <Link to="/negocio/dueno/google" className="font-bold text-primary underline">
              Revisar
            </Link>
          </>
        )}
      </Notice>
    );
  }
  return (
    <Notice kind={data.connectionLost ? 'error' : 'blue'} className={className}>
      {data.connectionLost
        ? 'Se perdió la conexión con Google Calendar. '
        : 'Conecta Google Calendar para ver tus citas en el calendario de cada persona. '}
      <Link to="/negocio/dueno/google" className="font-bold text-primary underline">
        {data.connectionLost ? 'Volver a conectar' : 'Conectar'}
      </Link>
    </Notice>
  );
}
