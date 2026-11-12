import type { AdapterStatus } from '@/lib/api/types';
import type { Lang } from './config';

interface Step {
  title: string;
  text: string;
}

type FieldErrors<Code extends string> = Record<Code, string>;

interface Layer {
  tag: string;
  title: string;
  text: string;
}

export interface Dictionary {
  skip: string;
  header: { navLabel: string; langLabel: string; modeLabel: string };
  nav: { projects: string; contact: string };
  mode: { profile: string; services: string };
  hero: {
    profile: { h1: string; cta: string; trajectoryCta: string };
    services: { eyebrow: string; h1: string; lead: string; cta: string; projectsCta: string };
  };
  cajetin: {
    author: string;
    specialty: string;
    since: string;
    location: string;
    sheet: string;
    sheets: { profile: string; services: string };
  };
  sections: {
    impact: string;
    trajectory: { label: string; title: string };
    architecture: { label: string; title: string; intro: string };
    services: { label: string; title: string; intro: string };
    projects: { label: string; title: string; intro: string };
    contact: { label: string };
  };
  /** The 4-step process of the services page; the section is omitted when absent (ES and EN must agree). */
  process?: { label: string; title: string; steps: Step[] };
  services: {
    included: string;
    add: string;
    /** Template with `{amount}`. */
    priceFrom: string;
    onRequest: string;
  };
  engagement: { title: string; empty: string; reply: string; cta: string };
  projects: {
    inProduction: string;
    client: string;
    stack: string;
    relation: { own: string; employer: string };
  };
  form: {
    name: string;
    email: string;
    message: { profile: string; services: string };
    send: string;
    sending: string;
    /** Prefix of the message with the picked services; `{services}` is replaced by «A + B». */
    prefix: string;
    selection: string;
    noSelection: string;
    honeypot: string;
    noscript: string;
    success: string;
    errors: {
      name: FieldErrors<'required' | 'too-long'>;
      email: FieldErrors<'required' | 'too-long' | 'invalid-format'>;
      message: FieldErrors<'too-short' | 'too-long'>;
    };
    failures: {
      invalid: string;
      rateLimited: string;
      network: string;
      offline: string;
      timeout: string;
      server: string;
      /** Appended to every failure; `{email}` is the contact address. */
      fallback: string;
    };
  };
  education: { education: string; certificate: string; course: string };
  layers: { label: string; adapters: Layer; ports: Layer; domain: Layer };
  stack: { label: string };
  /** Shown inside a section whose list came back empty from the API (not an error). */
  empty: { services: string; projects: string; architecture: string };
  plane: {
    /** Mono tag of the core hexagon. */
    core: string;
    /** Accessible name of the group of port buttons. */
    groupLabel: string;
    legend: { adapters: string; ports: string; contract: string; hint: string };
    status: Record<AdapterStatus, string>;
    /** Legend of the adapter radios; `{port}` is replaced by the port name. */
    adapterLegend: string;
  };
  contact: {
    profile: { title: string; text: string };
    services: { title: string; text: string };
    email: string;
  };
  /** The downloadable CV: button label and PDF section headings. */
  pdf: { button: string; summary: string; experience: string; skills: string; education: string; languages: string };
  period: { present: string };
  footer: { built: string };
  meta: { fallbackDescription: string; services: { title: string; description: string } };
}

const es: Dictionary = {
  skip: 'Saltar al contenido',
  header: { navLabel: 'Principal', langLabel: 'Idioma', modeLabel: 'Modo de la web' },
  nav: { projects: 'proyectos', contact: 'contacto' },
  mode: { profile: 'Perfil', services: 'Servicios' },
  hero: {
    profile: { h1: 'Construyo el núcleo que hace que todo funcione.', cta: 'Escríbeme', trajectoryCta: 'Ver trayectoria' },
    services: {
      eyebrow: 'desarrollo a medida · webs, APIs y plataformas',
      h1: 'Tu producto, con una arquitectura que aguanta.',
      lead: 'Desarrollo webs, APIs y plataformas modernas de principio a fin. Código limpio, desplegado y preparado para crecer contigo.',
      cta: 'Pedir presupuesto',
      projectsCta: 'Ver proyectos',
    },
  },
  cajetin: {
    author: 'Autor',
    specialty: 'Especialidad',
    since: 'En activo desde',
    location: 'Ubicación',
    sheet: 'Hoja',
    sheets: { profile: '01 / 02 · Perfil', services: '02 / 02 · Servicios' },
  },
  sections: {
    impact: 'Impacto',
    trajectory: { label: 'trayectoria', title: 'Una trayectoria en sistemas donde la fiabilidad importa.' },
    architecture: {
      label: 'arquitectura',
      title: 'Cómo pienso un sistema.',
      intro: 'Sección A–A′ del hexágono: tres capas, de fuera hacia dentro. Lo de fuera se cambia; lo de dentro se protege.',
    },
    services: {
      label: 'servicios',
      title: 'Qué puedo construir para ti.',
      intro: 'Marca los bloques que necesitas y monta tu encargo. La selección viaja contigo hasta el formulario.',
    },
    projects: { label: 'proyectos', title: 'Proyectos', intro: 'Cada caso: el problema, la arquitectura elegida y el resultado.' },
    contact: { label: 'contacto' },
  },
  process: {
    label: 'proceso',
    title: 'Cómo trabajamos.',
    steps: [
      { title: 'Descubrimiento', text: 'Una llamada para entender el problema y el objetivo.' },
      { title: 'Propuesta', text: 'Arquitectura, alcance, plazos y precio cerrados.' },
      { title: 'Desarrollo', text: 'Entregas cortas que puedes ver y probar.' },
      { title: 'Lanzamiento', text: 'Despliegue, documentación y soporte posterior.' },
    ],
  },
  services: { included: 'incluido', add: '+ añadir', priceFrom: 'desde {amount} + impuestos', onRequest: 'a consultar' },
  engagement: {
    title: 'Tu encargo',
    empty: 'Aún no has marcado ningún bloque. Elige los que necesitas y aparecerán aquí.',
    reply: 'Te respondo con una propuesta en menos de 48 horas: arquitectura, alcance, plazos y precio cerrados.',
    cta: 'Pedir presupuesto',
  },
  projects: {
    inProduction: 'EN PRODUCCIÓN',
    client: 'cliente',
    stack: 'stack',
    relation: { own: 'producto propio', employer: 'proyecto para empresa' },
  },
  form: {
    name: 'Nombre',
    email: 'Email',
    message: { profile: 'Mensaje', services: 'Cuéntame tu proyecto' },
    send: 'Enviar',
    sending: 'Enviando…',
    prefix: 'Servicios de interés: {services}',
    selection: 'selección →',
    noSelection: 'sin bloques marcados',
    honeypot: 'Déjalo vacío',
    noscript: 'El formulario necesita JavaScript. Escríbeme a {email}.',
    success: 'Mensaje enviado. Te responderé lo antes posible.',
    errors: {
      name: { required: 'Escribe tu nombre.', 'too-long': 'El nombre admite hasta {max} caracteres.' },
      email: {
        required: 'Escribe tu email.',
        'invalid-format': 'Revisa el email: parece incompleto.',
        'too-long': 'El email admite hasta {max} caracteres.',
      },
      message: {
        'too-short': 'Cuéntame un poco más: mínimo {min} caracteres.',
        'too-long': 'El mensaje admite hasta {max} caracteres.',
      },
    },
    failures: {
      invalid: 'Revisa los campos marcados.',
      rateLimited: 'Has enviado demasiados mensajes seguidos. Inténtalo de nuevo en un rato.',
      network: 'No se pudo contactar con el servidor (red o bloqueo del navegador).',
      offline: 'Parece que no tienes conexión. Revísala e inténtalo de nuevo.',
      timeout: 'El servidor tarda demasiado en responder. Inténtalo de nuevo.',
      server: 'No se pudo enviar el mensaje por un problema del servidor.',
      fallback: 'También puedes escribirme a {email}.',
    },
  },
  education: { education: 'Formación', certificate: 'Certificado', course: 'Curso' },
  layers: {
    label: 'Capas de la arquitectura',
    adapters: {
      tag: 'adaptadores',
      title: 'Tecnología intercambiable',
      text: 'Bases de datos, identidad, mensajería y despliegue: piezas que se conectan, no que atan.',
    },
    ports: { tag: 'puertos', title: 'Contratos claros', text: 'APIs tipadas, fáciles de probar y de cambiar.' },
    domain: {
      tag: 'dominio',
      title: 'El negocio, en el centro',
      text: 'Arquitectura hexagonal: la lógica no depende del framework ni de la base de datos.',
    },
  },
  stack: { label: 'stack' },
  empty: {
    services: 'Los servicios se publicarán aquí en breve. Mientras tanto, cuéntame tu proyecto en el formulario de contacto.',
    projects: 'Aún no hay proyectos publicados. Pronto añadiré los primeros casos.',
    architecture: 'El diagrama de arquitectura aún no está disponible.',
  },
  plane: {
    core: 'core/',
    groupLabel: 'Puertos del hexágono',
    legend: { adapters: 'adaptadores', ports: 'puertos', contract: 'contrato', hint: 'toca un nodo para trazar la llamada' },
    status: { 'in-this-api': 'implementado en esta API', production: 'en producción', experiment: 'proyecto de prueba' },
    adapterLegend: 'Adaptador de {port}',
  },
  contact: {
    profile: {
      title: '¿Buscas a alguien para tu equipo?',
      text: 'Abierto a conversar sobre nuevos retos.',
    },
    services: {
      title: '¿Tienes un proyecto en mente?',
      text: 'Cuéntame la idea y te respondo con una propuesta en menos de 48 horas.',
    },
    email: 'email',
  },
  pdf: { button: 'Descargar CV (PDF)', summary: 'Resumen', experience: 'Experiencia', skills: 'Habilidades', education: 'Formación', languages: 'Idiomas' },
  period: { present: 'hoy' },
  footer: { built: 'Hecho con Next.js y una API propia.' },
  meta: {
    fallbackDescription: '{name} — {label}. Currículum web.',
    services: {
      title: 'Servicios de desarrollo a medida — {name}',
      description: 'Webs, APIs y plataformas a medida, de principio a fin: código limpio, desplegado y preparado para crecer contigo.',
    },
  },
};

const en: Dictionary = {
  skip: 'Skip to content',
  header: { navLabel: 'Main', langLabel: 'Language', modeLabel: 'Site mode' },
  nav: { projects: 'projects', contact: 'contact' },
  mode: { profile: 'Profile', services: 'Services' },
  hero: {
    profile: { h1: 'I build the core that makes everything work.', cta: 'Get in touch', trajectoryCta: 'See career' },
    services: {
      eyebrow: 'custom development · web, APIs and platforms',
      h1: 'Your product, on an architecture that holds up.',
      lead: 'I build modern websites, APIs and platforms from start to finish. Clean code, deployed and ready to grow with you.',
      cta: 'Request a quote',
      projectsCta: 'See projects',
    },
  },
  cajetin: {
    author: 'Author',
    specialty: 'Specialty',
    since: 'Active since',
    location: 'Location',
    sheet: 'Sheet',
    sheets: { profile: '01 / 02 · Profile', services: '02 / 02 · Services' },
  },
  sections: {
    impact: 'Impact',
    trajectory: { label: 'career', title: 'A career in systems where reliability matters.' },
    architecture: {
      label: 'architecture',
      title: 'How I think about a system.',
      intro: 'Section A–A′ of the hexagon: three layers, from the outside in. What is outside can be swapped; what is inside is protected.',
    },
    services: {
      label: 'services',
      title: 'What I can build for you.',
      intro: 'Tick the blocks you need and put your engagement together. Your selection travels with you to the form.',
    },
    projects: { label: 'projects', title: 'Projects', intro: 'Each case: the problem, the chosen architecture and the result.' },
    contact: { label: 'contact' },
  },
  process: {
    label: 'process',
    title: 'How we work.',
    steps: [
      { title: 'Discovery', text: 'A call to understand the problem and the goal.' },
      { title: 'Proposal', text: 'Architecture, scope, timeline and a fixed price.' },
      { title: 'Development', text: 'Short deliveries you can see and try.' },
      { title: 'Launch', text: 'Deployment, documentation and follow-up support.' },
    ],
  },
  services: { included: 'included', add: '+ add', priceFrom: 'from {amount} + taxes', onRequest: 'on request' },
  engagement: {
    title: 'Your engagement',
    empty: 'You have not ticked any block yet. Pick the ones you need and they will show up here.',
    reply: 'I will reply with a proposal within 48 hours: architecture, scope, timeline and a fixed price.',
    cta: 'Request a quote',
  },
  projects: {
    inProduction: 'IN PRODUCTION',
    client: 'client',
    stack: 'stack',
    relation: { own: 'own product', employer: 'project for a company' },
  },
  form: {
    name: 'Name',
    email: 'Email',
    message: { profile: 'Message', services: 'Tell me about your project' },
    send: 'Send',
    sending: 'Sending…',
    prefix: 'Services of interest: {services}',
    selection: 'selection →',
    noSelection: 'no blocks selected',
    honeypot: 'Leave empty',
    noscript: 'The form needs JavaScript. Write to me at {email}.',
    success: 'Message sent. I will reply as soon as I can.',
    errors: {
      name: { required: 'Enter your name.', 'too-long': 'The name can have up to {max} characters.' },
      email: {
        required: 'Enter your email.',
        'invalid-format': 'Check the email: it looks incomplete.',
        'too-long': 'The email can have up to {max} characters.',
      },
      message: {
        'too-short': 'Tell me a bit more: at least {min} characters.',
        'too-long': 'The message can have up to {max} characters.',
      },
    },
    failures: {
      invalid: 'Check the highlighted fields.',
      rateLimited: 'You have sent too many messages in a row. Try again in a while.',
      network: 'Could not reach the server (network or browser blocking).',
      offline: 'You seem to be offline. Check your connection and try again.',
      timeout: 'The server is taking too long to answer. Try again.',
      server: 'The message could not be sent because of a server problem.',
      fallback: 'You can also write to me at {email}.',
    },
  },
  education: { education: 'Education', certificate: 'Certificate', course: 'Course' },
  layers: {
    label: 'Architecture layers',
    adapters: {
      tag: 'adapters',
      title: 'Swappable technology',
      text: 'Databases, identity, messaging and deployment: pieces that plug in, not ones that lock you in.',
    },
    ports: { tag: 'ports', title: 'Clear contracts', text: 'Typed APIs that are easy to test and easy to change.' },
    domain: {
      tag: 'domain',
      title: 'The business, at the center',
      text: 'Hexagonal architecture: the logic depends on neither the framework nor the database.',
    },
  },
  stack: { label: 'stack' },
  empty: {
    services: 'Services will be published here soon. In the meantime, tell me about your project in the contact form.',
    projects: 'No projects are published yet. The first cases will be added soon.',
    architecture: 'The architecture diagram is not available yet.',
  },
  plane: {
    core: 'core/',
    groupLabel: 'Hexagon ports',
    legend: { adapters: 'adapters', ports: 'ports', contract: 'contract', hint: 'tap a node to trace the call' },
    status: { 'in-this-api': 'implemented in this API', production: 'in production', experiment: 'test project' },
    adapterLegend: 'Adapter for {port}',
  },
  contact: {
    profile: {
      title: 'Looking for someone for your team?',
      text: 'Open to talking about new challenges.',
    },
    services: {
      title: 'Have a project in mind?',
      text: 'Tell me the idea and I will reply with a proposal within 48 hours.',
    },
    email: 'email',
  },
  pdf: { button: 'Download CV (PDF)', summary: 'Summary', experience: 'Experience', skills: 'Skills', education: 'Education', languages: 'Languages' },
  period: { present: 'Present' },
  footer: { built: 'Built with Next.js and my own API.' },
  meta: {
    fallbackDescription: '{name} — {label}. Online CV.',
    services: {
      title: 'Custom development services — {name}',
      description: 'Websites, APIs and platforms built to order, start to finish: clean code, deployed and ready to grow with you.',
    },
  },
};

export const dictionaries: Record<Lang, Dictionary> = { es, en };

export function getDictionary(lang: Lang): Dictionary {
  return dictionaries[lang];
}
