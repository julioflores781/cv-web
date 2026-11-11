import type { Architecture, ArchitecturePort, PortAdapter, Project, Service } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';

/** Fictional data only («Ada Ejemplo»); the real diagram never enters the repo. */
export const architectureEs: Architecture = {
  core: { name: 'Dominio de ejemplo', description: 'Núcleo ficticio.' },
  ports: [
    {
      id: 'database',
      name: 'Base de datos de ejemplo',
      description: 'Dónde se guarda lo ficticio.',
      adapters: [
        { id: 'store-alpha', name: 'Almacén Alfa', status: 'in-this-api', note: null },
        { id: 'store-beta', name: 'Almacén Beta', status: 'production', note: 'Nota de ejemplo' },
      ],
    },
    {
      id: 'messaging',
      name: 'Mensajería de ejemplo',
      description: null,
      adapters: [{ id: 'queue-gamma', name: 'Cola Gamma', status: 'experiment', note: 'Solo en pruebas' }],
    },
    {
      id: 'identity',
      name: 'Identidad de ejemplo',
      description: 'Quién es quién.',
      adapters: [{ id: 'login-delta', name: 'Acceso Delta', status: 'production', note: null }],
    },
  ],
};

export const architectureEn: Architecture = {
  core: { name: 'Example domain', description: 'Fictional core.' },
  ports: [
    {
      id: 'database',
      name: 'Example database',
      description: 'Where fictional things are kept.',
      adapters: [
        { id: 'store-alpha', name: 'Alpha store', status: 'in-this-api', note: null },
        { id: 'store-beta', name: 'Beta store', status: 'production', note: 'Example note' },
      ],
    },
    {
      id: 'messaging',
      name: 'Example messaging',
      description: null,
      adapters: [{ id: 'queue-gamma', name: 'Gamma queue', status: 'experiment', note: 'Tests only' }],
    },
    {
      id: 'identity',
      name: 'Example identity',
      description: 'Who is who.',
      adapters: [{ id: 'login-delta', name: 'Delta login', status: 'production', note: null }],
    },
  ],
};

export function architectureFor(lang: Lang): Architecture {
  return lang === 'es' ? architectureEs : architectureEn;
}

export function adapter(id: string, overrides: Partial<PortAdapter> = {}): PortAdapter {
  return { id, name: `Adaptador ${id}`, status: 'production', note: null, ...overrides };
}

/** `count` ports with one adapter each (ids `p1..pN`). */
export function portsOf(count: number): ArchitecturePort[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Puerto ${i + 1}`,
    description: `Descripción ${i + 1}`,
    adapters: [adapter(`a${i + 1}`)],
  }));
}

export function architectureOf(count: number): Architecture {
  return { core: { name: 'Núcleo', description: null }, ports: portsOf(count) };
}

export const EMPTY_ARCHITECTURE: Architecture = { core: { name: '', description: null }, ports: [] };

/** Real client name of an anonymous project, sent by a hostile API: it must never be published nor saved. */
export const LEAKED_CLIENT = 'CLIENTE-SENTINELA-ANONIMO';

export const servicesEs: Service[] = [
  { id: 'web', title: 'Web de ejemplo', summary: 'Una web ficticia de principio a fin.', price: { from: 1500, currency: 'EUR' } },
  { id: 'api', title: 'API de ejemplo', summary: 'Un servicio ficticio.', price: null },
  { id: 'audit', title: 'Auditoría de ejemplo', summary: 'Una revisión ficticia.', price: { from: 0, currency: 'EUR' } },
];

export const servicesEn: Service[] = [
  { id: 'web', title: 'Example website', summary: 'A fictional website, start to finish.', price: { from: 1500, currency: 'EUR' } },
  { id: 'api', title: 'Example API', summary: 'A fictional service.', price: null },
  { id: 'audit', title: 'Example audit', summary: 'A fictional review.', price: { from: 0, currency: 'EUR' } },
];

export const projectsEs: Project[] = [
  {
    id: 'proyecto-propio',
    title: 'Proyecto Propio de ejemplo',
    summary: 'Un producto ficticio con usuarios ficticios.',
    relation: 'own',
    disclosure: 'public',
    role: 'web + app',
    client: null,
    clientLabel: null,
    period: { start: '2025-01', end: null, current: true },
    stack: ['Lenguaje Uno', 'Marco Dos'],
    highlights: ['Primer logro de ejemplo', 'Segundo logro de ejemplo'],
    links: [
      { label: 'Abrir ejemplo', url: 'https://ejemplo.example.test/' },
      { label: 'Ver demo', url: 'https://ejemplo.example.test/demo' },
    ],
  },
  {
    id: 'proyecto-empresa',
    title: 'Proyecto de Empresa de ejemplo',
    summary: 'Un encargo ficticio.',
    relation: 'employer',
    disclosure: 'public',
    role: null,
    client: 'Cliente Ejemplo S.A.',
    clientLabel: 'Empresa ficticia de logística',
    period: { start: '2019-03', end: '2020-11', current: false },
    stack: ['Lenguaje Tres'],
    highlights: [],
    links: [],
  },
  {
    id: 'proyecto-anonimo',
    title: 'Proyecto Anónimo de ejemplo',
    summary: 'Otro encargo ficticio.',
    relation: 'employer',
    disclosure: 'anonymous',
    role: null,
    client: null,
    clientLabel: 'Empresa ficticia del sector salud',
    period: null,
    stack: [],
    highlights: [],
    links: [],
  },
];

const EN_TITLES: Record<string, string> = {
  'proyecto-propio': 'Example Own Project',
  'proyecto-empresa': 'Example Company Project',
  'proyecto-anonimo': 'Example Anonymous Project',
};

export const projectsEn: Project[] = projectsEs.map((project) => ({
  ...project,
  title: EN_TITLES[project.id] ?? project.title,
  summary: `${project.summary} (EN)`,
  clientLabel: project.clientLabel ? `${project.clientLabel} (EN)` : null,
}));

export const servicesFor = (lang: Lang): Service[] => (lang === 'es' ? servicesEs : servicesEn);
export const projectsFor = (lang: Lang): Project[] => (lang === 'es' ? projectsEs : projectsEn);

/** The projects as a hostile API would send them: the anonymous ones carry their real client. */
export function withLeakedClient(projects: readonly Project[]): Array<Record<string, unknown>> {
  return projects.map((project) => (project.disclosure === 'anonymous' ? { ...project, client: LEAKED_CLIENT } : { ...project }));
}
