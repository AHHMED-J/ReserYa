// Valores fijos de la configuración del negocio.

/** Días en el orden que se muestran (lunes primero). value: 0 = domingo ... 6 = sábado. */
export const WEEKDAYS = [
  { value: 1, short: 'Lun', label: 'Lunes' },
  { value: 2, short: 'Mar', label: 'Martes' },
  { value: 3, short: 'Mié', label: 'Miércoles' },
  { value: 4, short: 'Jue', label: 'Jueves' },
  { value: 5, short: 'Vie', label: 'Viernes' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 0, short: 'Dom', label: 'Domingo' },
];

/** Anticipación mínima (RF-19). */
export const MIN_NOTICE = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 180, label: '3 h' },
  { value: 300, label: '5 h' },
  { value: 720, label: '12 h' },
  { value: 1440, label: '24 h' },
];

/** Cada cuánto empiezan los horarios. */
export const SLOT_INTERVALS = [10, 15, 20, 30, 60];

/** Misma paleta que la API (8 colores sólidos). */
export const RESOURCE_COLORS = [
  { value: '#0A7DB2', label: 'Azul' },
  { value: '#1F8F78', label: 'Verde' },
  { value: '#A35F00', label: 'Ámbar' },
  { value: '#8360C4', label: 'Morado' },
  { value: '#C24F78', label: 'Rosa' },
  { value: '#C23A3A', label: 'Rojo' },
  { value: '#3D5A80', label: 'Azul marino' },
  { value: '#4A5967', label: 'Gris' },
];

export const MAX_PHOTOS = 8;
export const MAX_PHOTO_MB = 5;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Correo de soporte que se muestra al negocio rechazado o suspendido. */
export const SUPPORT_EMAIL = 'soporte@reserya.test';

/** A qué página del modo dueño lleva cada paso de la lista de configuración. */
export const STEP_LINKS = {
  profile: '/negocio/dueno/perfil',
  services: '/negocio/dueno/servicios',
  resources: '/negocio/dueno/equipo',
  schedules: '/negocio/dueno/equipo',
  rules: '/negocio/dueno/reglas',
  pin: '/negocio/dueno/reglas',
};
