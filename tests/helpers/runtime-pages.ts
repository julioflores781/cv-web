import { JSDOM } from 'jsdom';
import { TEST_SITE, type StandaloneServer } from './standalone';

export type Mode = 'profile' | 'services';

export interface PageSpec {
  path: string;
  lang: 'es' | 'en';
  mode: Mode;
  canonical: string;
}

export const PAGES: PageSpec[] = [
  { path: '/', lang: 'es', mode: 'profile', canonical: `${TEST_SITE}/` },
  { path: '/servicios/', lang: 'es', mode: 'services', canonical: `${TEST_SITE}/servicios/` },
  { path: '/en/', lang: 'en', mode: 'profile', canonical: `${TEST_SITE}/en/` },
  { path: '/en/services/', lang: 'en', mode: 'services', canonical: `${TEST_SITE}/en/services/` },
];

export interface Fetched {
  status: number;
  headers: Headers;
  text: string;
}

export async function get(server: StandaloneServer, pathname: string, init: RequestInit = {}): Promise<Fetched> {
  const response = await fetch(`${server.url}${pathname}`, { redirect: 'manual', ...init });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

/**
 * The RSC payload of a page, as a client-side navigation fetches it. The standalone answers `RSC: 1` on the page URL with a 307 to `?_rsc=…`
 * (empty body), so the redirect is followed; anything but a 200 `text/x-component` throws, so a check over it can never pass on an empty body.
 */
export async function getRsc(server: StandaloneServer, pathname: string): Promise<string> {
  const response = await fetch(`${server.url}${pathname}`, { headers: { RSC: '1' } });
  const type = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (response.status !== 200 || !type.startsWith('text/x-component') || text.length === 0) {
    throw new Error(`RSC payload of ${pathname}: ${response.status} ${type} (${text.length} bytes)`);
  }
  return text;
}

export interface Rendered extends Fetched {
  doc: Document;
  /** Visible text: no scripts or styles, whitespace collapsed. */
  visible: string;
}

export async function render(server: StandaloneServer, page: PageSpec): Promise<Rendered> {
  const fetched = await get(server, page.path);
  const doc = new JSDOM(fetched.text).window.document;
  const copy = new JSDOM(fetched.text).window.document;
  copy.querySelectorAll('script, style').forEach((node) => node.remove());
  return { ...fetched, doc, visible: (copy.body.textContent ?? '').replace(/\s+/g, ' ').trim() };
}

/** Section eyebrows «NN / name», in order. */
export function eyebrows(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('section h2'))
    .map((h2) => h2.closest('section')?.querySelector('p')?.textContent ?? '')
    .filter((text) => /^\d{2} \//.test(text));
}

/** The URLs of the page's scripts and stylesheets (same origin). */
export function assetUrls(doc: Document, selector: 'script[src]' | 'link[rel="stylesheet"][href]'): string[] {
  const attr = selector === 'script[src]' ? 'src' : 'href';
  return Array.from(doc.querySelectorAll(selector)).map((node) => node.getAttribute(attr) as string);
}
