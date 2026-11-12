import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Project } from '@/lib/api/types';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { LEAKED_CLIENT, projectsEs } from '@/tests/fixtures/content';
import { Projects } from './projects';

const [own, employer, anonymous] = projectsEs as [Project, Project, Project];

function view(projects: Project[], images: Record<string, string> = {}, lang: 'es' | 'en' = 'es') {
  return render(<Projects projects={projects} images={images} lang={lang} dict={getDictionary(lang)} index={3} />);
}
const featured = (container: HTMLElement) => container.querySelector('[data-probe="featured"]') as HTMLElement;
const cards = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-probe="card"]'));

describe('Projects', () => {
  it('CO-T22: 3 projects are 1 featured (giant h3) and 2 cards', () => {
    const { container } = view(projectsEs);
    expect(featured(container).querySelector('h3')?.textContent).toBe(own.title);
    expect(cards(container).map((card) => card.querySelector('h3')?.textContent)).toEqual([employer.title, anonymous.title]);
  });

  it('CO-T23: the public featured shows badge, role, facts from highlights, buttons from links (first primary) and the client', () => {
    const { container } = view([{ ...own, client: 'Cliente Ejemplo S.A.' }]);
    const box = featured(container);
    expect(box).toHaveTextContent('EN PRODUCCIÓN');
    expect(box).toHaveTextContent('web + app');
    expect(Array.from(box.querySelectorAll('ul > li')).map((li) => li.textContent)).toContain('h-01Primer logro de ejemplo');
    expect(box).toHaveTextContent('h-02');
    const links = Array.from(box.querySelectorAll('a'));
    expect(links.map((a) => a.textContent)).toEqual(['Abrir ejemplo', 'Ver demo']);
    expect(links[0]?.className).not.toBe(links[1]?.className);
    expect(box).toHaveTextContent('cliente · Cliente Ejemplo S.A.');
  });

  it('CO-T24: current -> «EN PRODUCCIÓN»; a closed period -> «2019 — 2020»; no period -> no badge', () => {
    expect(featured(view([own]).container)).toHaveTextContent('EN PRODUCCIÓN');
    const closed = view([{ ...own, period: { start: '2019-03', end: '2020-11', current: false } }]);
    expect(featured(closed.container)).toHaveTextContent('2019 — 2020');
    expect(featured(closed.container)).not.toHaveTextContent('EN PRODUCCIÓN');
    closed.unmount();
    const none = view([{ ...own, period: null, role: null }]);
    expect(featured(none.container).querySelector('[data-probe="featured-left"]')?.firstElementChild?.tagName).toBe('H3');
  });

  it('CO-T25: an anonymous project shows only its clientLabel, never the real name', () => {
    const { container } = view([own, { ...anonymous, client: LEAKED_CLIENT }]);
    expect(container.textContent).toContain('Empresa ficticia del sector salud');
    expect(container.textContent).not.toContain(LEAKED_CLIENT);
  });

  it('CO-T26: props with disclosure anonymous and a client filled in are not shown by the component either (featured and card)', () => {
    const leaked = { ...anonymous, client: LEAKED_CLIENT };
    expect(view([leaked]).container.textContent).not.toContain(LEAKED_CLIENT);
    expect(view([own, leaked]).container.textContent).not.toContain(LEAKED_CLIENT);
  });

  it('CO-T27: a public project with client null shows only the clientLabel, with no empty label', () => {
    const { container } = view([{ ...employer, client: null }]);
    expect(featured(container)).toHaveTextContent('cliente · Empresa ficticia de logística');
    const bare = view([{ ...employer, client: null, clientLabel: null }]);
    expect(featured(bare.container).textContent).not.toContain('cliente');
  });

  it('CO-T28: https links open in a new tab with noopener noreferrer; a javascript: link produces no anchor', () => {
    const { container } = view([{ ...own, links: [{ label: 'Bien', url: 'https://ejemplo.example.test/' }, { label: 'Mal', url: 'javascript:alert(1)' }] }]);
    const anchors = Array.from(container.querySelectorAll('article a'));
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveAttribute('target', '_blank');
    expect(anchors[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('CO-T29: without role, highlights, links or stack there are no empty tags, lists or buttons, and the featured has one column', () => {
    const { container } = view([{ ...own, role: null, highlights: [], links: [], stack: [], period: null }]);
    const box = featured(container);
    expect(box.querySelector('ul')).toBeNull();
    expect(box.querySelector('a')).toBeNull();
    expect(box.querySelector('[data-probe="featured-side"]')).toBeNull();
    expect(Array.from(box.querySelectorAll('p, span, li')).filter((node) => !node.textContent?.trim())).toEqual([]);
  });

  it('CO-T30: a single project renders only the featured case, with no card grid', () => {
    const { container } = view([own]);
    expect(featured(container)).not.toBeNull();
    expect(cards(container)).toHaveLength(0);
  });

  it('CO-T31: with 1 or 3 projects the section title is the same', () => {
    const one = view([own]);
    const title = screen.getByRole('heading', { level: 2 }).textContent;
    one.unmount();
    view(projectsEs);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(title);
    expect(title).toBe('Proyectos');
  });

  it('T44: an empty list keeps #projects with its h2 and the empty text in its language, no featured, cards or links', () => {
    for (const lang of ['es', 'en'] as const) {
      const { container, unmount } = view([], {}, lang);
      const dict = getDictionary(lang);
      const section = container.querySelector('#projects') as HTMLElement;
      expect(section).not.toBeNull();
      expect(section.getAttribute('aria-labelledby')).toBe('projects-title');
      expect(section.querySelector('h2#projects-title')?.textContent).toBe(dict.sections.projects.title);
      expect(section).toHaveTextContent(dict.empty.projects);
      expect(featured(container)).toBeNull();
      expect(cards(container)).toHaveLength(0);
      expect(container.querySelector('a, img, h3')).toBeNull();
      unmount();
    }
  });

  it('CO-T32: an own + public project with an image shows an img with alt, width, height and lazy loading (featured and card)', () => {
    const second = { ...own, id: 'otro-propio', title: 'Otro propio' };
    const { container } = view([own, second], { [own.id]: '/projects/proyecto-propio.webp', 'otro-propio': '/projects/otro-propio.webp' });
    const images = Array.from(container.querySelectorAll('img'));
    expect(images).toHaveLength(2);
    for (const img of images) {
      expect(img.getAttribute('alt')).toBeTruthy();
      expect(img).toHaveAttribute('width');
      expect(img).toHaveAttribute('height');
      expect(img).toHaveAttribute('loading', 'lazy');
    }
    expect(featured(container).querySelector('img')).toHaveAttribute('src', '/projects/proyecto-propio.webp');
  });

  it('CO-T33: an employer or anonymous project never shows an image, even when one is available', () => {
    const { container } = view([employer, anonymous], { [employer.id]: '/projects/a.webp', [anonymous.id]: '/projects/b.webp' });
    expect(container.querySelector('img')).toBeNull();
  });

  it('CO-T34: without a file the card uses the .gridbg block with the client or relation, no img and no «captura» text', () => {
    const { container } = view(projectsEs);
    const blocks = cards(container).map((card) => card.querySelector('.gridbg'));
    expect(blocks.map((block) => block?.textContent)).toEqual(['Cliente Ejemplo S.A.', 'Empresa ficticia del sector salud']);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent?.toLowerCase()).not.toContain('captura');
    const relation = view([own, { ...employer, client: null, clientLabel: null }]);
    expect(cards(relation.container)[0]?.querySelector('.gridbg')).toHaveTextContent('proyecto para empresa');
  });
});
