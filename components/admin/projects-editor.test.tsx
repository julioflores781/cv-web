import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectsModel } from '@/lib/admin/content/projects';
import { sample } from '@/tests/helpers/admin-content';
import { editorItems, openItem, renderProjects, reply, saveButton, savedView, stubDialog, stubFetch, view } from '@/tests/helpers/admin-editor';

let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = stubDialog();
});
afterEach(() => {
  restoreDialog();
  vi.unstubAllGlobals();
});

const PUBLIC = 'Proyecto público de ejemplo';
const ANONYMOUS = 'Proyecto anónimo de ejemplo';
const column = (item: HTMLElement, lang: 'es' | 'en') => within(item).getByRole('group', { name: lang === 'es' ? 'Español' : 'Inglés' });
const field = (scope: HTMLElement, label: string) => within(scope).getByLabelText(label) as HTMLInputElement;
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
const press = (input: HTMLElement, key: string) => fireEvent.keyDown(input, { key });
const chips = (scope: HTMLElement) => within(scope).queryAllByRole('button', { name: /^Quitar «.*» de tecnologías \(/ }).map((button) => /«(.*)»/.exec(button.getAttribute('aria-label') ?? '')?.[1]);
/** A button of a project by its visible label (its accessible name adds the hidden context «(español · Proyecto 1: …)»). */
const button = (scope: HTMLElement, label: string) => within(scope).getByRole('button', { name: (name) => name.startsWith(`${label} (`) });
const imageBlock = (item: HTMLElement) => within(item).getByRole('group', { name: 'Imágenes' });
type SavedBody = { documents: { es: { projects: Array<Record<string, unknown>> }; en: { projects: Array<Record<string, unknown>> } } };

describe('ProjectsEditor', () => {
  it('T343: turning a project anonymous disables and empties its client with an explanation and a notice; back to public it stays empty', () => {
    renderProjects();
    const item = openItem(PUBLIC);
    const client = field(item, 'Cliente');
    expect(client.value).toBe('Ejemplo S.A.');
    expect(client).toBeEnabled();
    fireEvent.change(field(item, 'Visibilidad'), { target: { value: 'anonymous' } });
    expect(client).toBeDisabled();
    expect(client.value).toBe('');
    expect(client).toHaveAccessibleDescription(/Un proyecto anónimo no puede indicar el cliente/);
    // This project also has an image, which an anonymous project cannot keep: both changes are announced.
    expect(within(item).getByText(/^Se ha vaciado el cliente porque el proyecto ahora es anónimo\. Este proyecto ya no admite imágenes/)).toHaveAttribute('role', 'status');
    fireEvent.change(field(item, 'Visibilidad'), { target: { value: 'public' } });
    expect(client).toBeEnabled();
    expect(client.value).toBe('');
    expect(client).toHaveAccessibleDescription(/Opcional/);
  });

  it('T344: an employer + public project without a client gets CLIENT_REQUIRED on the field; for own + public the client is optional', async () => {
    const saved = projectsModel.serialize(projectsModel.pair(sample('projects.es'), sample('projects.en')));
    const { mock, bodies } = stubFetch(reply(200, savedView(saved, { es: 2, en: 2 })));
    renderProjects();
    const item = openItem(ANONYMOUS);
    fireEvent.change(field(item, 'Visibilidad'), { target: { value: 'public' } });
    const client = field(item, 'Cliente');
    expect(client).toBeEnabled();
    expect(client).toHaveAccessibleDescription(/Obligatorio en un proyecto público de empleador/);
    fireEvent.click(saveButton());
    expect(mock).not.toHaveBeenCalled();
    expect(client).toHaveAttribute('aria-invalid', 'true');
    expect(client).toHaveAccessibleDescription(/Error: Un proyecto de empleador público debe indicar el cliente/);
    expect(screen.getByRole('alert', { name: /Hay errores/ })).toHaveTextContent(`${ANONYMOUS} · Cliente (Común a los dos idiomas)`);

    fireEvent.change(field(item, 'Relación'), { target: { value: 'own' } });
    expect(client).not.toHaveAttribute('aria-invalid');
    expect(client).toHaveAccessibleDescription(/Opcional/);
    fireEvent.click(saveButton());
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    const sent = (bodies[0] as unknown as SavedBody).documents.es.projects[1];
    expect(sent).toMatchObject({ relation: 'own', disclosure: 'public' });
    expect(sent).not.toHaveProperty('client');
  });

  it('T345: a project that is not own + public has its image block disabled with a note; images left after a change warn and block saving until removed, never on their own', async () => {
    const { mock } = stubFetch(reply(200, savedView(projectsModel.serialize(projectsModel.pair(sample('projects.es'), sample('projects.en'))), { es: 2, en: 2 })));
    renderProjects();
    const hidden = openItem(ANONYMOUS);
    expect(imageBlock(hidden)).toHaveTextContent('Solo los proyectos propios y públicos admiten imágenes.');
    expect(within(imageBlock(hidden)).queryAllByRole('textbox')).toHaveLength(0);

    const item = openItem(PUBLIC);
    expect(within(imageBlock(item)).getAllByRole('textbox')).toHaveLength(2);
    fireEvent.change(field(item, 'Relación'), { target: { value: 'employer' } });
    // Announced at once, like the client notice, not only at save time.
    expect(within(item).getByText(/^Este proyecto ya no admite imágenes/, { selector: '[role="status"]' })).toBeInTheDocument();
    const block = imageBlock(item);
    expect(block).toHaveAccessibleDescription(/ya no admite imágenes .* Quítalas del proyecto para poder guardar; no se borran del almacenamiento/);
    // Still there: nothing is removed on its own.
    expect(within(block).getByText('Imagen 1')).toBeInTheDocument();
    expect(within(block).getByText('00000000….webp')).toBeInTheDocument();
    expect(within(block).queryAllByRole('textbox')).toHaveLength(0);
    fireEvent.click(saveButton());
    expect(mock).not.toHaveBeenCalled();
    expect(block).toHaveAttribute('data-invalid', 'true');
    expect(block).toHaveAccessibleDescription(/Error: Solo los proyectos propios y públicos admiten imágenes/);

    fireEvent.click(button(block, 'Quitar la imagen 1 del proyecto'));
    expect(block).toHaveTextContent('Solo los proyectos propios y públicos admiten imágenes.');
    expect(within(block).queryByText('Imagen 1')).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    const sent = (JSON.parse(String(mock.mock.calls[0]?.[1]?.body)) as SavedBody).documents;
    expect(sent.es.projects[0]).not.toHaveProperty('images');
    expect(sent.en.projects[0]).not.toHaveProperty('images');
  });

  it('T346: dates 2024-13, abc, an end before the start and an end without a start give INVALID_DATE; an empty end means «en curso»', () => {
    const { mock } = stubFetch(reply(200, {}));
    renderProjects();
    const item = openItem(PUBLIC);
    const start = field(item, 'Inicio');
    const end = field(item, 'Fin');
    expect(end.value).toBe('');
    expect(end).toHaveAccessibleDescription(/Vacío = en curso/);
    const invalid = /Error: La fecha debe tener el formato AAAA-MM/;
    for (const value of ['2024-13', 'abc']) {
      type(start, value);
      fireEvent.click(saveButton());
      expect(start, value).toHaveAccessibleDescription(invalid);
    }
    type(start, '2024-05');
    type(end, '2024-01');
    fireEvent.click(saveButton());
    expect(start).not.toHaveAttribute('aria-invalid');
    expect(end).toHaveAccessibleDescription(invalid);
    type(start, '');
    type(end, '2024-06');
    fireEvent.click(saveButton());
    expect(end).toHaveAccessibleDescription(invalid);
    expect(mock).not.toHaveBeenCalled();
    type(start, '2024-05');
    expect(end).not.toHaveAttribute('aria-invalid');
  });

  it('T347: the stack adds with Enter or a comma, removes with a labelled button, caps at 30×60, ignores blanks and «Copiar» copies ES to EN', () => {
    renderProjects();
    const item = openItem(PUBLIC);
    const es = column(item, 'es');
    const input = field(es, 'Tecnologías');
    type(input, 'Vitest');
    press(input, 'Enter');
    type(input, 'Docker,');
    expect(chips(es)).toEqual(['Java', 'Quarkus', 'PostgreSQL', 'Vitest', 'Docker']);
    expect(input.value).toBe('');
    expect(screen.getByText('«Docker» añadida.')).toHaveAttribute('role', 'status');
    type(input, '   ');
    press(input, 'Enter');
    expect(chips(es)).toHaveLength(5);
    fireEvent.click(button(es, 'Quitar «Java» de tecnologías'));
    expect(chips(es)).toEqual(['Quarkus', 'PostgreSQL', 'Vitest', 'Docker']);
    expect(input).toHaveFocus();

    type(input, 'x'.repeat(61));
    press(input, 'Enter');
    expect(chips(es)).toHaveLength(4);
    expect(input.value).toBe('x'.repeat(61));
    expect(input).toHaveAccessibleDescription(/Error: Cada tecnología admite hasta 60 caracteres/);
    type(input, 'y'.repeat(60));
    press(input, 'Enter');
    expect(chips(es)).toHaveLength(5);
    expect(input).not.toHaveAttribute('aria-invalid');

    for (let i = chips(es).length; i < 30; i += 1) {
      type(input, `t${i}`);
      press(input, 'Enter');
    }
    expect(chips(es)).toHaveLength(30);
    expect(within(es).getByText('30 de 30 tecnologías')).toBeInTheDocument();
    type(input, 'una más');
    press(input, 'Enter');
    expect(chips(es)).toHaveLength(30);
    expect(input).toHaveAccessibleDescription(/máximo de 30 tecnologías/);

    const en = column(item, 'en');
    expect(chips(en)).toEqual(['Java', 'Quarkus', 'PostgreSQL']);
    fireEvent.click(button(en, 'Copiar tecnologías ES → EN'));
    expect(chips(en)).toEqual(chips(es));
    expect(within(item).getByText('Tecnologías copiadas del español.')).toHaveAttribute('role', 'status');
  });

  it('T348: highlights and links add, remove and move; links cap at 10, a label over 80 is TOO_LONG and an http:// URL is INVALID_URL', () => {
    const { mock } = stubFetch(reply(200, {}));
    renderProjects();
    const item = openItem(PUBLIC);
    const es = column(item, 'es');
    const highlights = within(es).getByRole('group', { name: 'Logros' });
    fireEvent.click(button(highlights, 'Añadir logro'));
    const second = field(highlights, 'Logro 2');
    expect(second).toHaveFocus();
    type(second, 'Segundo logro');
    fireEvent.click(button(highlights, 'Bajar el logro 1'));
    expect([field(highlights, 'Logro 1').value, field(highlights, 'Logro 2').value]).toEqual(['Segundo logro', 'Un logro de ejemplo']);
    expect(button(highlights, 'Bajar el logro 2')).toHaveFocus();
    expect(button(highlights, 'Bajar el logro 2')).toHaveAttribute('aria-disabled', 'true');
    expect(within(highlights).getByText(/Movido a la posición 2 de 2/)).toHaveAttribute('role', 'status');
    fireEvent.click(button(highlights, 'Quitar el logro 1'));
    expect(within(highlights).getAllByRole('textbox').map((input) => (input as HTMLTextAreaElement).value)).toEqual(['Un logro de ejemplo']);

    const links = within(es).getByRole('group', { name: 'Enlaces' });
    const add = button(links, 'Añadir enlace');
    for (let i = 1; i < 10; i += 1) fireEvent.click(add);
    expect(within(links).getAllByLabelText(/^URL del enlace/)).toHaveLength(10);
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).toHaveAccessibleDescription('Se ha alcanzado el máximo de 10 enlaces.');
    fireEvent.click(add);
    expect(within(links).getAllByLabelText(/^URL del enlace/)).toHaveLength(10);
    for (let i = 9; i >= 2; i -= 1) fireEvent.click(button(links, `Quitar el enlace ${i + 1}`));
    type(field(links, 'Texto del enlace 2'), 'E'.repeat(81));
    type(field(links, 'URL del enlace 2'), 'https://example.test/dos');
    type(field(links, 'URL del enlace 1'), 'http://example.com/proyecto');
    fireEvent.click(button(links, 'Subir el enlace 2'));
    expect(field(links, 'URL del enlace 1').value).toBe('https://example.test/dos');
    fireEvent.click(saveButton());
    expect(mock).not.toHaveBeenCalled();
    expect(field(links, 'Texto del enlace 1')).toHaveAccessibleDescription(/Error: El texto es demasiado largo/);
    expect(field(links, 'URL del enlace 2')).toHaveAccessibleDescription(/Error: La dirección debe ser una URL https/);
    expect(field(links, 'URL del enlace 1')).not.toHaveAttribute('aria-invalid');
  });

  it('T349: an accordion whose header shows title · id · relation · visibility · images and the error badge; a new project is employer + anonymous; empty state; the cap of 50', () => {
    const { unmount } = renderProjects();
    const toggles = editorItems().map((item) => within(item).getAllByRole('button')[0] as HTMLElement);
    expect(toggles[0]).toHaveTextContent(PUBLIC);
    expect(toggles[0]).toHaveTextContent('proyecto-publico · Propio · Público · 1 imagen');
    expect(toggles[1]).toHaveTextContent('proyecto-anonimo · De empleador · Anónimo · 0 imágenes');
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Añadir proyecto' }));
    const fresh = editorItems()[2] as HTMLElement;
    expect(field(fresh, 'Identificador')).toHaveFocus();
    expect(field(fresh, 'Relación').value).toBe('employer');
    expect(field(fresh, 'Visibilidad').value).toBe('anonymous');
    expect(field(fresh, 'Cliente')).toBeDisabled();
    fireEvent.click(saveButton());
    expect(within(fresh).getAllByRole('button')[0]).toHaveTextContent(/\d+ errores/);
    unmount();

    const empty = renderProjects({ initial: view(null, null, { es: 0, en: 0 }) });
    expect(screen.getByText('Todavía no hay proyectos publicados.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir proyecto' }));
    expect(editorItems()).toHaveLength(1);
    empty.unmount();

    const many = { projects: Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, title: `Proyecto ${i}`, summary: 'R', relation: 'own', disclosure: 'public' })) };
    renderProjects({ initial: view(many, many) });
    const add = screen.getByRole('button', { name: 'Añadir proyecto' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).toHaveAccessibleDescription('Se ha alcanzado el máximo de 50 proyectos.');
    fireEvent.click(add);
    expect(editorItems()).toHaveLength(50);
  });

  it('T350: removing a project with images asks first and warns that its images stay in the storage', () => {
    renderProjects();
    fireEvent.click(screen.getByRole('button', { name: `Quitar «${PUBLIC}» (posición 1)` }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(`Se quitará «${PUBLIC}» en español y en inglés. Su imagen sigue en el almacenamiento`);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: `Quitar «${ANONYMOUS}» (posición 2)` }));
    expect(screen.getByRole('dialog')).not.toHaveTextContent('almacenamiento');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar' }));
    expect(editorItems()).toHaveLength(1);
  });

  it('T351: server errors on es.projects[1].links[0].url, en.projects[0].images and es.projects[1].client land on the link field, the image block and the common client field', async () => {
    const es = sample('projects.es') as { projects: Array<Record<string, unknown>> };
    const en = sample('projects.en') as { projects: Array<Record<string, unknown>> };
    for (const document of [es, en]) document.projects[1] = { ...document.projects[1], links: [{ label: 'Ver', url: 'https://example.test/ver' }] };
    stubFetch(
      reply(422, {
        code: 'CONTENT_INVALID',
        requestId: 'a'.repeat(32),
        errors: [
          { path: 'es.projects[1].links[0].url', code: 'INVALID_URL' },
          { path: 'en.projects[0].images', code: 'IMAGES_NOT_ALLOWED_FOR_PROJECT' },
          { path: 'es.projects[1].client', code: 'CLIENT_REQUIRED' },
        ],
      }),
    );
    renderProjects({ initial: view(es, en), validate: () => [] });
    const first = openItem(PUBLIC);
    type(field(column(first, 'es'), 'Rol'), 'Rol cambiado');
    fireEvent.click(saveButton());
    const summary = await screen.findByRole('alert', { name: /Hay errores/ });
    await waitFor(() => expect(summary).toHaveFocus());
    const second = openItem(ANONYMOUS);
    const url = field(column(second, 'es'), 'URL del enlace 1');
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(url).toHaveAccessibleDescription(/Error: La dirección debe ser una URL https/);
    expect(field(column(second, 'en'), 'URL del enlace 1')).not.toHaveAttribute('aria-invalid');
    expect(imageBlock(first)).toHaveAccessibleDescription(/Error: Solo los proyectos propios y públicos admiten imágenes/);
    const client = field(second, 'Cliente');
    expect(client).toHaveAttribute('aria-invalid', 'true');
    expect(client.closest('fieldset')).toHaveAccessibleName('Común a los dos idiomas');
    // The summary lists them by path, each linked to where it landed.
    expect(within(summary).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([`#${imageBlock(first).id}`, `#${client.id}`, `#${url.id}`]);
  });

  it('T353: every input and every button of the projects (toolbar included) has a unique accessible name, also with two projects of the same title', () => {
    const collect = () => {
      const names = new Map<HTMLElement, string>();
      for (const role of ['textbox', 'combobox', 'checkbox', 'spinbutton', 'button'] as const) {
        screen.queryAllByRole(role, {
          name: (name, element) => {
            // Every control of the items: their bodies, headers and toolbars (the save bar is one per page).
            if (role !== 'button' || element.closest('[data-item]')) names.set(element as HTMLElement, name);
            return true;
          },
        });
      }
      return [...names.values()];
    };
    const check = (all: string[]) => {
      expect(all.every((name) => name.trim() !== '')).toBe(true);
      expect(all.filter((name, i) => all.indexOf(name) !== i)).toEqual([]);
    };

    const first = renderProjects();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir proyecto' }));
    openItem(PUBLIC);
    openItem(ANONYMOUS);
    // Both columns share tags and links (the usual case after «Copiar ES → EN»).
    fireEvent.click(button(column(openItem(PUBLIC), 'en'), 'Copiar tecnologías ES → EN'));
    const all = collect();
    expect(all.length).toBeGreaterThan(60);
    check(all);
    expect(all).toContain(`Título (español · Proyecto 1: ${PUBLIC})`);
    expect(all).toContain(`Título (inglés · Proyecto 1: ${PUBLIC})`);
    expect(all).toContain(`Cliente (común · Proyecto 2: ${ANONYMOUS})`);
    expect(all).toContain(`Texto alternativo de la imagen 1 (EN) (inglés · Proyecto 1: ${PUBLIC})`);
    expect(all).toContain('Identificador (común · Proyecto 3)');
    for (const label of ['Añadir tecnología', 'Quitar «Java» de tecnologías', 'Añadir logro', 'Quitar el logro 1', 'Añadir enlace', 'Subir el enlace 1']) {
      expect(all).toContain(`${label} (español · Proyecto 1: ${PUBLIC})`);
      expect(all).toContain(`${label} (inglés · Proyecto 1: ${PUBLIC})`);
    }
    expect(all).toContain(`Quitar la imagen 1 del proyecto (común · Proyecto 1: ${PUBLIC})`);
    expect(all).toContain(`Copiar enlaces ES → EN (inglés · Proyecto 1: ${PUBLIC})`);
    first.unmount();

    // Two projects with the same title (and images in both) still read apart by their position.
    const twin = (document: Record<string, unknown>) => {
      const projects = (document as { projects: Array<Record<string, unknown>> }).projects;
      return { projects: [projects[0], { ...projects[0], id: 'proyecto-copia' }] };
    };
    renderProjects({ initial: view(twin(sample('projects.es')), twin(sample('projects.en'))) });
    for (const toggle of screen.getAllByRole('button', { expanded: false })) fireEvent.click(toggle);
    const same = collect();
    check(same);
    expect(same).toContain(`Título (español · Proyecto 1: ${PUBLIC})`);
    expect(same).toContain(`Título (español · Proyecto 2: ${PUBLIC})`);
    expect(same).toContain(`Quitar la imagen 1 del proyecto (común · Proyecto 2: ${PUBLIC})`);
    // The accordion toolbar reads them apart by position too.
    for (const position of [1, 2]) {
      for (const tool of ['Subir', 'Bajar', 'Quitar']) expect(same).toContain(`${tool} «${PUBLIC}» (posición ${position})`);
    }
  });

  it('regresion extra: server marks on a link (by position) go away when the links are reordered or one is removed; the data stays and the summary drops them', async () => {
    const es = sample('projects.es') as { projects: Array<Record<string, unknown>> };
    const en = sample('projects.en') as { projects: Array<Record<string, unknown>> };
    const links = [
      { label: 'Uno', url: 'https://example.test/uno' },
      { label: 'Dos', url: 'https://example.test/dos' },
    ];
    for (const document of [es, en]) document.projects[0] = { ...document.projects[0], links };
    stubFetch(reply(422, { code: 'CONTENT_INVALID', requestId: 'a'.repeat(32), errors: [{ path: 'es.projects[0].links[1].url', code: 'INVALID_URL' }, { path: 'es.projects[0].role', code: 'TOO_LONG' }] }));
    renderProjects({ initial: view(es, en), validate: () => [] });
    const item = openItem(PUBLIC);
    type(field(column(item, 'es'), 'Rol'), 'Rol cambiado');
    fireEvent.click(saveButton());
    const summary = await screen.findByRole('alert', { name: /Hay errores/ });
    expect(field(column(item, 'es'), 'URL del enlace 2')).toHaveAttribute('aria-invalid', 'true');
    expect(within(summary).getAllByRole('link')).toHaveLength(2);

    // «Dos» moves to the first row: the mark was on row 2 (by position), so it must not stay on «Uno» nor move with a wrong meaning.
    fireEvent.click(button(column(item, 'es'), 'Subir el enlace 2'));
    const urls = within(column(item, 'es')).getAllByLabelText(/^URL del enlace/) as HTMLInputElement[];
    expect(urls.map((input) => input.value)).toEqual(['https://example.test/dos', 'https://example.test/uno']);
    for (const input of urls) expect(input).not.toHaveAttribute('aria-invalid');
    // Other marks of the item stay; the summary keeps only them.
    expect(field(column(item, 'es'), 'Rol')).toHaveAttribute('aria-invalid', 'true');
    expect(within(screen.getByRole('alert', { name: /Hay errores/ })).getAllByRole('link')).toHaveLength(1);
    // The English column was not touched: its links keep their order and value.
    expect((within(column(item, 'en')).getAllByLabelText(/^URL del enlace/) as HTMLInputElement[]).map((input) => input.value)).toEqual(['https://example.test/uno', 'https://example.test/dos']);
  });

  it('regresion extra: «Crear gemelo» of a project moves the focus to the title it creates', async () => {
    const es = sample('projects.es') as { projects: Array<Record<string, unknown>> };
    const en = sample('projects.en') as { projects: Array<Record<string, unknown>> };
    en.projects.splice(1, 1);
    renderProjects({ initial: view(es, en) });
    const item = openItem(ANONYMOUS);
    fireEvent.click(within(column(item, 'en')).getByRole('button', { name: 'Crear gemelo en EN' }));
    await waitFor(() => expect(field(column(item, 'en'), 'Título')).toHaveFocus());
  });
});
