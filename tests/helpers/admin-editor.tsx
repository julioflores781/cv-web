import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { ArchitectureEditor } from '@/components/admin/architecture-editor';
import { ProjectsEditor } from '@/components/admin/projects-editor';
import { ServicesEditor } from '@/components/admin/services-editor';
import type { DraftStorage } from '@/lib/admin/content/drafts';
import type { ContentView, Obj } from '@/lib/admin/content/model';
import type { SaveCandidate } from '@/lib/admin/content/validate';
import type { ViolationEntry } from '@/lib/api/admin';
import type { ImageLibrary } from '@/lib/admin/images';
import type { ProjectImagesBlockProps } from '@/components/admin/project-images-block';
import { sample } from './admin-content';

/** Helpers for the jsdom tests of the content editors (fictional data only). */

export const SERVICES_ES = {
  services: [
    { id: 'servicio-ejemplo', title: 'Servicio de ejemplo', summary: 'Un servicio ficticio.', price: { from: 1500, currency: 'EUR' } },
    { id: 'servicio-a-consultar', title: 'Servicio a consultar', summary: 'Sin precio.', price: null },
  ],
};
export const SERVICES_EN = {
  services: [
    { id: 'servicio-ejemplo', title: 'Sample service', summary: 'A made-up service.', price: { from: 1500, currency: 'EUR' } },
    { id: 'servicio-a-consultar', title: 'Service on request', summary: 'No price.', price: null },
  ],
};

export function view(es: Obj | null, en: Obj | null, versions = { es: 1, en: 1 }, differences: ViolationEntry[] = []): ContentView {
  const lang = (content: Obj | null, version: number) => ({ version, publishedAt: version > 0 ? '2026-11-01T10:00:00.000Z' : null, source: version > 0 ? 'seed' : null, content });
  return { languages: { es: lang(es, versions.es), en: lang(en, versions.en) }, parity: { ok: differences.length === 0, differences } };
}

/** In-memory `sessionStorage` stand-in. */
export function memoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
}

export const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Replaces `fetch` with a queue of answers (the last one repeats); records the JSON bodies sent. */
export function stubFetch(...answers: Array<Response | Error | Promise<Response>>) {
  const bodies: Array<Record<string, unknown>> = [];
  let call = 0;
  const mock = vi.fn((_url: string, init?: RequestInit) => {
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body) as Record<string, unknown>);
    const answer = answers[Math.min(call, answers.length - 1)];
    call += 1;
    if (answer instanceof Error) return Promise.reject(answer);
    return answer instanceof Response ? Promise.resolve(answer.clone()) : (answer as Promise<Response>);
  });
  vi.stubGlobal('fetch', mock);
  return { mock, bodies };
}

/** Saved content as the handler returns it: the documents sent, with the given versions. */
export const savedView = (documents: { es: Obj; en: Obj }, versions: { es: number; en: number }) => ({ kind: 'services', ...view(documents.es, documents.en, versions) });

interface RenderOptions {
  initial?: ContentView;
  storage?: DraftStorage | null;
  navigate?: (url: string) => void;
  validate?: (kind: 'services' | 'projects' | 'architecture', candidate: SaveCandidate) => ViolationEntry[];
  /** Projects only: the storage listing and the upload stand-in. */
  library?: ImageLibrary;
  upload?: ProjectImagesBlockProps['upload'];
}

export function renderServices(options: RenderOptions = {}) {
  const storage = options.storage === undefined ? memoryStorage() : options.storage;
  const navigate = options.navigate ?? vi.fn();
  const utils = render(
    <ServicesEditor initial={options.initial ?? view(SERVICES_ES, SERVICES_EN)} storage={storage} navigate={navigate} {...(options.validate ? { validate: options.validate } : {})} />,
  );
  return { ...utils, storage, navigate };
}

export function renderProjects(options: RenderOptions = {}) {
  const storage = options.storage === undefined ? memoryStorage() : options.storage;
  const navigate = options.navigate ?? vi.fn();
  const utils = render(
    <ProjectsEditor
      initial={options.initial ?? view(sample('projects.es'), sample('projects.en'))}
      storage={storage}
      navigate={navigate}
      {...(options.validate ? { validate: options.validate } : {})}
      {...(options.library ? { library: options.library } : {})}
      {...(options.upload ? { upload: options.upload } : {})}
    />,
  );
  return { ...utils, storage, navigate };
}

export function renderArchitecture(options: RenderOptions = {}) {
  const storage = options.storage === undefined ? memoryStorage() : options.storage;
  const navigate = options.navigate ?? vi.fn();
  const utils = render(
    <ArchitectureEditor
      initial={options.initial ?? view(sample('architecture.es'), sample('architecture.en'))}
      storage={storage}
      navigate={navigate}
      {...(options.validate ? { validate: options.validate } : {})}
    />,
  );
  return { ...utils, storage, navigate };
}

/** The accordion items of an editor (nested lists inside an item are not counted). */
export const editorItems = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('li[data-item]'));

/** Opens an item (if closed) and returns its `<li>`. */
export function openItem(title: string | RegExp): HTMLElement {
  const toggle = screen.getAllByRole('button').find((button) => button.getAttribute('aria-expanded') !== null && (typeof title === 'string' ? button.textContent?.includes(title) : title.test(button.textContent ?? ''))) as HTMLElement;
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
  return toggle.closest('li[data-item]') as HTMLElement;
}

/** [ES, EN] inputs with a given label inside an item. */
export const pairOf = (item: HTMLElement, label: string): [HTMLInputElement, HTMLInputElement] => within(item).getAllByLabelText(label) as [HTMLInputElement, HTMLInputElement];

export const saveButton = (): HTMLElement => screen.getByRole('button', { name: /^(Guardar|Guardando…)$/ });

export function stubDialog(): () => void {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  const original = { showModal: proto.showModal, close: proto.close };
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  return () => {
    proto.showModal = original.showModal;
    proto.close = original.close;
  };
}
