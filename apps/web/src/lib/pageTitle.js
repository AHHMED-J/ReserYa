import { useEffect } from 'react';
import { useLocation } from 'react-router';

const APP = 'ReserYa';

/** Título de la pestaña según la ruta. Las pantallas con título propio (perfil del negocio, agenda en vivo) no van aquí. */
const TITLES = [
  [/^\/$/, 'Inicio'],
  [/^\/buscar$/, 'Buscar negocios'],
  [/^\/negocios\/[^/]+\/reservar$/, 'Reservar'],
  [/^\/reservas$/, 'Mis reservas'],
  [/^\/reservas\/[^/]+\/enviada$/, 'Solicitud enviada'],
  [/^\/reservas\/[^/]+\/resena$/, 'Calificar cita'],
  [/^\/reservas\/[^/]+$/, 'Detalle de la reserva'],
  [/^\/volver-a-agendar$/, 'Volver a agendar'],
  [/^\/perfil$/, 'Mi perfil'],
  [/^\/entrar$/, 'Iniciar sesión'],
  [/^\/registro$/, 'Crear cuenta'],
  [/^\/completar-perfil$/, 'Completa tu perfil'],
  [/^\/verificar-correo$/, 'Verificar correo'],
  [/^\/recuperar$/, 'Recuperar contraseña'],
  [/^\/restablecer$/, 'Nueva contraseña'],
  [/^\/privacidad$/, 'Aviso de privacidad'],
  [/^\/terminos$/, 'Términos de uso'],
  [/^\/negocio\/registro$/, 'Registrar mi negocio'],
  [/^\/negocio\/restablecer-pin$/, 'Restablecer PIN'],
  [/^\/negocio$/, 'Mi negocio'],
  [/^\/negocio\/estado$/, 'Estado del negocio'],
  [/^\/negocio\/configuracion$/, 'Configuración inicial'],
  [/^\/negocio\/solicitudes$/, 'Solicitudes'],
  [/^\/negocio\/agenda$/, 'Agenda del día'],
  [/^\/negocio\/reservas$/, 'Reservas'],
  [/^\/negocio\/dueno$/, 'Modo dueño'],
  [/^\/negocio\/dueno\/servicios$/, 'Servicios'],
  [/^\/negocio\/dueno\/equipo$/, 'Equipo y recursos'],
  [/^\/negocio\/dueno\/reglas$/, 'Reglas y políticas'],
  [/^\/negocio\/dueno\/perfil$/, 'Perfil del negocio'],
  [/^\/negocio\/dueno\/estadisticas$/, 'Estadísticas'],
  [/^\/negocio\/dueno\/pagos$/, 'Pagos y reembolsos'],
  [/^\/negocio\/dueno\/link-en-vivo$/, 'Link de agenda en vivo'],
  [/^\/negocio\/dueno\/google$/, 'Google Calendar'],
  [/^\/admin$/, 'Administración'],
  [/^\/admin\/pendientes$/, 'Negocios pendientes'],
  [/^\/admin\/negocios$/, 'Negocios'],
  [/^\/admin\/negocios\/[^/]+$/, 'Detalle del negocio'],
  [/^\/admin\/claves$/, 'Claves de registro'],
];

export const titleFor = (pathname) => {
  const clean = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const hit = TITLES.find(([re]) => re.test(clean));
  return hit ? `${hit[1]} · ${APP}` : null;
};

/** Pone el título de la pestaña según la ruta actual (se monta una vez en la raíz). */
export function useRouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleFor(pathname) ?? APP;
  }, [pathname]);
}

/** Título propio de una pantalla (p. ej. el nombre del negocio); sin valor no cambia nada. */
export function usePageTitle(title) {
  useEffect(() => {
    if (title) document.title = `${title} · ${APP}`;
  }, [title]);
}
