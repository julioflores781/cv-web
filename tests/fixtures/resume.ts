import type { Resume } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';

/** Fictional data only ("Ada Ejemplo"); never copy content from the real CV. */
export const resumeEs: Resume = {
  language: 'es',
  profile: {
    name: 'Ada Ejemplo',
    label: 'Ingeniera de software de ejemplo',
    tagline: 'Sistemas de ejemplo que no fallan',
    city: 'Ciudad Ejemplo',
    countryCode: 'ES',
    summary: 'Resumen ficticio de Ada Ejemplo para las pruebas automáticas.',
    availability: 'Disponible para proyectos de ejemplo',
  },
  contact: {
    email: 'ada@example.test',
    profiles: [
      { network: 'LinkedIn', url: 'https://www.linkedin.com/in/ada-ejemplo' },
      { network: 'GitHub', url: 'https://github.com/ada-ejemplo' },
    ],
  },
  impact: [
    { value: '+1.000', text: 'mensajes de ejemplo al día' },
    { value: '+20', text: 'servicios ficticios' },
    { value: '+7', text: 'integraciones de prueba' },
    { value: '+9 años', text: 'de experiencia inventada' },
  ],
  experience: [
    {
      id: 'acme',
      company: 'Acme Ejemplo',
      position: 'Desarrolladora de ejemplo',
      location: 'Ciudad Ejemplo',
      period: { start: '2017-10', end: null, current: true },
      summary: 'Trabajo ficticio en Acme para las pruebas.',
      phases: [{ title: 'Fase uno', client: 'Cliente Ejemplo' }],
      highlights: ['Logro ficticio'],
    },
    {
      id: 'globex',
      company: 'Globex Ejemplo',
      position: 'Analista de ejemplo',
      period: { start: '2014-03', end: '2016-11', current: false },
      summary: 'Segundo trabajo ficticio.',
      phases: [],
      highlights: [],
    },
    {
      id: 'initech',
      company: 'Initech Ejemplo',
      position: 'Soporte de ejemplo',
      period: { start: '2010-01', end: '2012-12', current: false },
      summary: 'Tercer trabajo ficticio.',
      phases: [],
      highlights: [],
    },
  ],
  skills: [
    { key: 'backend', name: 'Servidor', keywords: ['Lenguaje Uno', 'Marco Dos', 'Biblioteca Tres'] },
    { key: 'data', name: 'Datos', keywords: ['Base Alfa', 'Cola Beta'] },
    { key: 'frontend', name: 'Interfaz', keywords: ['Vista Gamma', 'Estilo Delta'] },
    { key: 'cloud', name: 'Infraestructura', keywords: ['Contenedor Épsilon', 'Nube Zeta'] },
    { key: 'quality', name: 'Calidad', keywords: ['Prueba Eta'] },
    { key: 'tools', name: 'Herramientas', keywords: ['Editor Theta', 'Control Iota'] },
  ],
  education: {
    education: [{ institution: 'Universidad Ejemplo', studyType: 'Grado', area: 'Informática' }],
    certificates: [{ name: 'Certificado Ejemplo', issuer: 'Entidad Ejemplo' }],
    courses: [{ name: 'Curso Ejemplo' }],
  },
  languages: [{ language: 'Español', fluency: 'Nativo' }],
};

export const resumeEn: Resume = {
  ...resumeEs,
  language: 'en',
  profile: {
    name: 'Ada Ejemplo',
    label: 'Example software engineer',
    tagline: 'Example systems that do not fail',
    city: 'Example City',
    countryCode: 'ES',
    summary: 'Fictional summary of Ada Ejemplo for the automated tests.',
    availability: 'Available for example projects',
  },
  impact: [
    { value: '+1,000', text: 'example messages per day' },
    { value: '+20', text: 'fictional services' },
    { value: '+7', text: 'test integrations' },
    { value: '+9 years', text: 'of invented experience' },
  ],
  experience: resumeEs.experience.map((job) => ({
    ...job,
    position: `${job.position} (EN)`,
    summary: `${job.summary ?? ''} (EN)`,
  })),
  skills: [
    { key: 'backend', name: 'Server', keywords: ['Language One', 'Framework Two', 'Library Three'] },
    { key: 'data', name: 'Data', keywords: ['Store Alpha', 'Queue Beta'] },
    { key: 'frontend', name: 'Interface', keywords: ['View Gamma', 'Style Delta'] },
    { key: 'cloud', name: 'Infrastructure', keywords: ['Container Epsilon', 'Cloud Zeta'] },
    { key: 'quality', name: 'Quality', keywords: ['Test Eta'] },
    { key: 'tools', name: 'Tooling', keywords: ['Editor Theta', 'Control Iota'] },
  ],
  education: {
    education: [{ institution: 'Example University', studyType: 'Degree', area: 'Computing' }],
    certificates: [{ name: 'Example Certificate', issuer: 'Example Body' }],
    courses: [{ name: 'Example Course' }],
  },
};

export function fixtureFor(lang: Lang): Resume {
  return lang === 'es' ? resumeEs : resumeEn;
}

/** Only the required fields; every optional field is absent or null. */
export function minimalResume(lang: Lang = 'es'): Resume {
  return {
    language: lang,
    profile: { name: 'Ada Ejemplo', label: 'Ingeniera de ejemplo', tagline: null, summary: null, availability: null },
    contact: { email: 'ada@example.test', profiles: [] },
    impact: [],
    experience: [
      {
        id: 'solo',
        company: 'Solo Ejemplo',
        position: 'Puesto de ejemplo',
        period: { start: '2020-01', current: false },
        phases: [],
        highlights: [],
      },
    ],
    skills: [],
    education: { education: [], certificates: [], courses: [] },
    languages: [],
  };
}

/** Valid resume whose lists are all empty. */
export function emptyListsResume(lang: Lang = 'es'): Resume {
  return { ...minimalResume(lang), experience: [] };
}

/** A resume with `count` fictional jobs, each with highlights, to force several PDF pages. */
export function manyJobsResume(count: number, lang: Lang = 'es'): Resume {
  const base = fixtureFor(lang);
  return {
    ...base,
    experience: Array.from({ length: count }, (_, index) => ({
      id: `job-${index}`,
      company: `Empresa Ejemplo ${index}`,
      position: `Puesto de ejemplo ${index}`,
      period: { start: '2010-01', end: '2012-12', current: false },
      summary: 'Trabajo ficticio con un resumen algo más largo para ocupar espacio en la página del documento de prueba.',
      phases: [],
      highlights: ['Logro ficticio uno con texto de relleno', 'Logro ficticio dos con texto de relleno', 'Logro ficticio tres con texto de relleno'],
    })),
  };
}
