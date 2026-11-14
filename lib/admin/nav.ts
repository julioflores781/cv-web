export interface NavItem {
  href: string;
  label: string;
}

/** Sections of the panel, in order. Each content slice adds its own entry. */
export const ADMIN_NAV: readonly NavItem[] = [
  { href: '/admin/', label: 'Inicio' },
  { href: '/admin/services/', label: 'Servicios' },
  { href: '/admin/projects/', label: 'Proyectos' },
  { href: '/admin/architecture/', label: 'Arquitectura' },
  { href: '/admin/images/', label: 'Imágenes' },
  { href: '/admin/messages/', label: 'Mensajes' },
  { href: '/admin/settings/', label: 'Ajustes' },
];
