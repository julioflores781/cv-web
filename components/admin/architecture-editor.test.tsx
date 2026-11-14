import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sample } from '@/tests/helpers/admin-content';
import { editorItems, openItem, renderArchitecture, reply, saveButton, savedView, stubDialog, stubFetch, view } from '@/tests/helpers/admin-editor';

let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = stubDialog();
});
afterEach(() => {
  restoreDialog();
  vi.unstubAllGlobals();
});

type Adapter = Record<string, unknown>;
type Port = Record<string, unknown> & { adapters: Adapter[] };
type Doc = { core: Record<string, unknown>; ports: Port[] };
type SavedBody = { documents: { es: Doc; en: Doc } };

const copy = (name: 'architecture.es' | 'architecture.en'): Doc => JSON.parse(JSON.stringify(sample(name))) as Doc;
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
/** A control by its visible label: its accessible name adds the hidden context «(español · Puerto 1: …)». */
const named = (scope: HTMLElement, role: 'textbox' | 'combobox' | 'button', label: string) =>
  within(scope).getByRole(role, { name: (name) => name === label || name.startsWith(`${label} (`) });
const allNamed = (scope: HTMLElement, role: 'textbox' | 'combobox' | 'button', label: string) =>
  within(scope).queryAllByRole(role, { name: (name) => name === label || name.startsWith(`${label} (`) });
const adapterRows = (port: HTMLElement) => Array.from(port.querySelectorAll<HTMLElement>('li[data-adapter]'));
/** The first ES/EN column inside `scope` (a port's own column comes before those of its adapters). */
const column = (scope: HTMLElement, lang: 'es' | 'en') => within(scope).getAllByRole('group', { name: lang === 'es' ? 'Español' : 'Inglés' })[0] as HTMLElement;
const preview = () => document.querySelector<HTMLElement>('[data-preview]') as HTMLElement;
const sent = (body: Record<string, unknown> | undefined) => (body as unknown as SavedBody).documents;

describe('ArchitectureEditor', () => {
  it('T355: core, ports and adapters can be added, removed and moved; the status offers the 3 values as text plus their StatusShape; the note has a 200 limit', async () => {
    renderArchitecture();
    const core = screen.getByRole('region', { name: 'Núcleo' });
    expect(named(column(core, 'es'), 'textbox', 'Nombre del núcleo')).toHaveValue('Dominio');
    expect(named(column(core, 'en'), 'textbox', 'Descripción del núcleo')).toHaveValue('The business rules, unaware of what sits outside.');

    // The legend shows each status once with its shape and text.
    const legend = screen.getByRole('list', { name: 'Estados de un adaptador' });
    expect(within(legend).getAllByRole('listitem').map((item) => [item.querySelector('svg')?.getAttribute('data-shape'), item.textContent])).toEqual([
      ['in-this-api', 'implementado en esta API'],
      ['production', 'en producción'],
      ['experiment', 'proyecto de prueba'],
    ]);

    const port = openItem('Base de datos');
    const rows = adapterRows(port);
    expect(rows).toHaveLength(2);
    const status = named(rows[1] as HTMLElement, 'combobox', 'Estado del adaptador 2') as HTMLSelectElement;
    expect(Array.from(status.options).map((option) => [option.value, option.text])).toEqual([
      ['in-this-api', 'implementado en esta API'],
      ['production', 'en producción'],
      ['experiment', 'proyecto de prueba'],
    ]);
    expect(status.value).toBe('production');
    // Next to the select, the shape of the chosen status with its text.
    expect((rows[1] as HTMLElement).querySelector('[data-status-view] svg')?.getAttribute('data-shape')).toBe('production');
    fireEvent.change(status, { target: { value: 'experiment' } });
    expect((rows[1] as HTMLElement).querySelector('[data-status-view]')).toHaveTextContent('proyecto de prueba');
    expect((rows[1] as HTMLElement).querySelector('[data-status-view] svg')?.getAttribute('data-shape')).toBe('experiment');

    const note = named(column(rows[1] as HTMLElement, 'es'), 'textbox', 'Nota del adaptador 2');
    expect(note).toHaveAccessibleDescription(/15 de 200 caracteres/);

    // Add an adapter: the focus goes to its Spanish name; move it up (focus stays, position announced); remove it (focus to the neighbour).
    fireEvent.click(named(port, 'button', 'Añadir adaptador'));
    expect(adapterRows(port)).toHaveLength(3);
    const fresh = adapterRows(port)[2] as HTMLElement;
    await waitFor(() => expect(named(column(fresh, 'es'), 'textbox', 'Nombre del adaptador 3')).toHaveFocus());
    type(named(column(fresh, 'es'), 'textbox', 'Nombre del adaptador 3'), 'Redis');
    type(named(column(fresh, 'en'), 'textbox', 'Nombre del adaptador 3'), 'Redis');
    type(named(column(fresh, 'es'), 'textbox', 'Nota del adaptador 3'), 'n'.repeat(201));
    const up = named(fresh, 'button', 'Subir el adaptador 3');
    fireEvent.click(up);
    expect(adapterRows(port).map((row) => within(row).getAllByRole('textbox')[1] as HTMLInputElement).map((input) => input.value)).toEqual(['PostgreSQL', 'Redis', 'MongoDB']);
    await waitFor(() => expect(named(adapterRows(port)[1] as HTMLElement, 'button', 'Subir el adaptador 2')).toHaveFocus());
    expect(within(port).getByText('«Redis» está ahora en la posición 2 de 3.')).toHaveAttribute('role', 'status');
    expect(named(adapterRows(port)[0] as HTMLElement, 'button', 'Subir el adaptador 1')).toHaveAttribute('aria-disabled', 'true');

    // Saving: the 201-character note is refused with TOO_LONG on its field, nothing sent.
    const { mock } = stubFetch(reply(200, {}));
    fireEvent.click(saveButton());
    expect(mock).not.toHaveBeenCalled();
    const longNote = named(column(adapterRows(port)[1] as HTMLElement, 'es'), 'textbox', 'Nota del adaptador 2');
    expect(longNote).toHaveAttribute('aria-invalid', 'true');
    expect(longNote).toHaveAccessibleDescription(/Error: El texto es demasiado largo/);

    fireEvent.click(named(adapterRows(port)[1] as HTMLElement, 'button', 'Quitar el adaptador 2'));
    expect(adapterRows(port)).toHaveLength(2);
    await waitFor(() => expect(named(column(adapterRows(port)[1] as HTMLElement, 'es'), 'textbox', 'Nombre del adaptador 2')).toHaveFocus());

    // Ports: move and remove (asks, since it was published), add one.
    fireEvent.click(screen.getByRole('button', { name: 'Bajar «Base de datos» (posición 1)' }));
    expect(editorItems().map((item) => item.querySelector('[id$="-toggle"]')?.textContent)).toEqual([expect.stringContaining('Colas'), expect.stringContaining('Base de datos')]);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar «Colas» (posición 1)' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar' }));
    expect(editorItems()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir puerto' }));
    expect(editorItems()).toHaveLength(2);
  });

  it('T356: with 20 ports «Añadir puerto» is disabled with a message; with 20 adapters «Añadir adaptador» too', () => {
    const adapters = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `Adaptador ${i}`, status: 'production' }));
    const ports = (n: number, first: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Puerto ${i}`, adapters: adapters(i === 0 ? first : 1) }));
    const doc = (n: number, first: number) => ({ core: { name: 'Núcleo' }, ports: ports(n, first) });
    const full = renderArchitecture({ initial: view(doc(20, 20), doc(20, 20)) });
    const add = screen.getByRole('button', { name: 'Añadir puerto' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).toHaveAccessibleDescription('Se ha alcanzado el máximo de 20 puertos.');
    fireEvent.click(add);
    expect(editorItems()).toHaveLength(20);
    const port = openItem('Puerto 0');
    const addAdapter = named(port, 'button', 'Añadir adaptador');
    expect(addAdapter).toHaveAttribute('aria-disabled', 'true');
    expect(addAdapter).toHaveAccessibleDescription('Se ha alcanzado el máximo de 20 adaptadores en este puerto.');
    fireEvent.click(addAdapter);
    expect(adapterRows(port)).toHaveLength(20);
    full.unmount();

    renderArchitecture({ initial: view(doc(19, 19), doc(19, 19)) });
    expect(screen.getByRole('button', { name: 'Añadir puerto' })).not.toHaveAttribute('aria-disabled');
    expect(named(openItem('Puerto 0'), 'button', 'Añadir adaptador')).not.toHaveAttribute('aria-disabled');
  });

  it('T357: new ids come from the Spanish name and are unique in their scope (ports among ports, adapters inside their port); published ids are read-only', () => {
    renderArchitecture();
    const database = openItem('Base de datos');
    expect(named(database, 'textbox', 'Identificador')).toHaveAttribute('readonly');
    expect(named(adapterRows(database)[0] as HTMLElement, 'textbox', 'Identificador del adaptador 1')).toHaveAttribute('readonly');

    fireEvent.click(screen.getByRole('button', { name: 'Añadir puerto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir puerto' }));
    const [, , first, second] = editorItems() as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    type(named(column(first, 'es'), 'textbox', 'Nombre'), 'Colas');
    expect(named(first, 'textbox', 'Identificador')).toHaveValue('colas');
    expect(named(first, 'textbox', 'Identificador')).not.toHaveAttribute('readonly');
    type(named(column(second, 'es'), 'textbox', 'Nombre'), 'Colas');
    expect(named(second, 'textbox', 'Identificador')).toHaveValue('colas-2');

    // Adapters: unique inside their port only.
    const kafka = (port: HTMLElement) => {
      fireEvent.click(named(port, 'button', 'Añadir adaptador'));
      const row = adapterRows(port).at(-1) as HTMLElement;
      const n = adapterRows(port).length;
      type(named(column(row, 'es'), 'textbox', `Nombre del adaptador ${n}`), 'Kafka');
      return named(row, 'textbox', `Identificador del adaptador ${n}`) as HTMLInputElement;
    };
    expect(kafka(first).value).toBe('kafka');
    expect(kafka(first).value).toBe('kafka-2');
    expect(kafka(second).value).toBe('kafka');
    // A new adapter in a published port has an editable id; the queue port already has a «kafka».
    const queue = openItem('Colas');
    const added = kafka(queue);
    expect(added.value).toBe('kafka-2');
    expect(added).not.toHaveAttribute('readonly');
    // Typed by hand, the id stops following the name.
    type(added, 'kafka-propio');
    type(named(column(adapterRows(queue)[1] as HTMLElement, 'es'), 'textbox', 'Nombre del adaptador 2'), 'Kafka Streams');
    expect(added.value).toBe('kafka-propio');
  });

  it('T358: the preview (data-mode="profile") follows the draft with buildHexModel + HexPlane, switches between ES and EN and uses the public dictionary labels', () => {
    renderArchitecture();
    const box = preview();
    expect(box).toHaveAttribute('data-mode', 'profile');
    expect(box).toHaveAttribute('lang', 'es');
    expect(box.querySelector('[data-probe="core"]')).toHaveTextContent('core/');
    expect(box.querySelector('[data-probe="core"]')).toHaveTextContent('Dominio');
    expect(within(box).getByRole('group', { name: 'Puertos del hexágono' })).toBeInTheDocument();
    expect(within(box).getAllByRole('button').map((node) => node.textContent)).toEqual(['Base de datos', 'Colas']);
    expect(box.querySelector('[data-probe="panel"]')).toHaveTextContent('implementado en esta API');

    // Edits show at once.
    type(named(column(screen.getByRole('region', { name: 'Núcleo' }), 'es'), 'textbox', 'Nombre del núcleo'), 'Dominio renovado');
    const queue = openItem('Colas');
    type(named(column(queue, 'es'), 'textbox', 'Nombre'), 'Mensajería');
    expect(box.querySelector('[data-probe="core"]')).toHaveTextContent('Dominio renovado');
    expect(within(box).getAllByRole('button').map((node) => node.textContent)).toEqual(['Base de datos', 'Mensajería']);
    fireEvent.click(within(box).getByRole('button', { name: 'Mensajería' }));
    fireEvent.change(named(adapterRows(queue)[0] as HTMLElement, 'combobox', 'Estado del adaptador 1'), { target: { value: 'production' } });
    expect(box.querySelector('[data-probe="panel"]')).toHaveTextContent('en producción');

    // English: the English texts and the English dictionary.
    const switcher = screen.getByRole('group', { name: 'Idioma de la vista previa' });
    fireEvent.click(within(switcher).getByRole('button', { name: 'Inglés' }));
    expect(within(switcher).getByRole('button', { name: 'Inglés' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(switcher).getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'false');
    expect(preview()).toHaveAttribute('lang', 'en');
    expect(preview().querySelector('[data-probe="core"]')).toHaveTextContent('Domain');
    expect(within(preview()).getByRole('group', { name: 'Hexagon ports' })).toBeInTheDocument();
    expect(within(preview()).getAllByRole('button').map((node) => node.textContent)).toEqual(['Database', 'Queues']);
    expect(preview().querySelector('[data-probe="panel"]')).toHaveTextContent('implemented in this API');
  });

  it('T359: ports without adapters, adapters without a name and more than 6 ports are flagged in the form; an empty model shows a message in the preview', () => {
    const es = copy('architecture.es');
    const en = copy('architecture.en');
    const first = renderArchitecture({ initial: view(es, en) });
    const queue = openItem('Colas');
    fireEvent.click(named(adapterRows(queue)[0] as HTMLElement, 'button', 'Quitar el adaptador 1'));
    expect(within(queue).getByText('Este puerto no tiene adaptadores: no se dibuja en el plano.')).toBeInTheDocument();
    expect(within(preview()).getAllByRole('button').map((node) => node.textContent)).toEqual(['Base de datos']);

    const database = openItem('Base de datos');
    const name = named(column(adapterRows(database)[1] as HTMLElement, 'en'), 'textbox', 'Nombre del adaptador 2');
    type(name, '');
    expect(name).toHaveAccessibleDescription(/Sin nombre no se dibuja\./);
    expect(named(column(adapterRows(database)[1] as HTMLElement, 'es'), 'textbox', 'Nombre del adaptador 2')).not.toHaveAccessibleDescription(/no se dibuja/);
    type(named(column(adapterRows(database)[0] as HTMLElement, 'en'), 'textbox', 'Nombre del adaptador 1'), ' ');
    // No named adapter left in English: the port is not drawn there.
    expect(within(column(database, 'en')).getByText('No se dibuja en esta versión: le falta el nombre o algún adaptador con nombre.')).toBeInTheDocument();
    expect(within(column(database, 'es')).queryByText(/No se dibuja en esta versión/)).toBeNull();

    // The Spanish preview still has its port; nothing is left to draw once its adapters go.
    fireEvent.click(named(adapterRows(database)[1] as HTMLElement, 'button', 'Quitar el adaptador 2'));
    fireEvent.click(named(adapterRows(database)[0] as HTMLElement, 'button', 'Quitar el adaptador 1'));
    expect(within(preview()).getByText('Nada que dibujar todavía: añade un puerto con al menos un adaptador con nombre.')).toBeInTheDocument();
    expect(within(preview()).getByText('El diagrama de arquitectura aún no está disponible.')).toBeInTheDocument();
    expect(preview().querySelector('[data-probe="core"]')).toHaveTextContent('Dominio');

    // More than 6 drawn ports go in a list under the plane: the form says so.
    const many = (doc: Doc) => ({ ...doc, ports: Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `Puerto ${i}`, adapters: [{ id: 'a', name: 'A', status: 'production' }] })) });
    first.unmount();
    renderArchitecture({ initial: view(many(es), many(en)) });
    expect(screen.getAllByText(/con más de 6, el plano los muestra en una lista bajo el hexágono/).map((node) => node.textContent)).toEqual([
      'En español se dibujan 7 puertos: con más de 6, el plano los muestra en una lista bajo el hexágono.',
      'En inglés se dibujan 7 puertos: con más de 6, el plano los muestra en una lista bajo el hexágono.',
    ]);
    expect(preview().querySelector('[data-layout="list"]')).not.toBeNull();
  });

  it('T360: version 0 (or a core without a name) starts empty and a core without a name cannot be published', async () => {
    const { mock } = stubFetch(reply(200, {}));
    const empty = renderArchitecture({ initial: view(null, null, { es: 0, en: 0 }) });
    expect(screen.getByText('Todavía no hay puertos publicados.')).toBeInTheDocument();
    const core = screen.getByRole('region', { name: 'Núcleo' });
    expect(named(column(core, 'es'), 'textbox', 'Nombre del núcleo')).toHaveValue('');
    expect(within(preview()).getByText('Nada que dibujar todavía: añade un puerto con al menos un adaptador con nombre.')).toBeInTheDocument();
    type(named(column(core, 'es'), 'textbox', 'Nombre del núcleo'), 'Núcleo nuevo');
    fireEvent.click(saveButton());
    expect(mock).not.toHaveBeenCalled();
    const english = named(column(core, 'en'), 'textbox', 'Nombre del núcleo');
    expect(english).toHaveAttribute('aria-invalid', 'true');
    expect(english).toHaveAccessibleDescription(/Error: Este campo es obligatorio/);
    const summary = screen.getByRole('alert', { name: /Hay errores/ });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(summary).toHaveTextContent('Nombre del núcleo (EN)');
    expect(within(summary).getByRole('link', { name: /Nombre del núcleo \(EN\)/ })).toHaveAttribute('href', `#${english.id}`);
    // Fixing it clears the error.
    type(english, 'New core');
    expect(english).not.toHaveAttribute('aria-invalid');
    empty.unmount();

    const es = { ...copy('architecture.es'), core: { name: '' } };
    renderArchitecture({ initial: view(es, copy('architecture.en')) });
    type(named(column(openItem('Colas'), 'es'), 'textbox', 'Nombre'), 'Colas renovadas');
    fireEvent.click(saveButton());
    expect(mock).not.toHaveBeenCalled();
    expect(named(column(screen.getByRole('region', { name: 'Núcleo' }), 'es'), 'textbox', 'Nombre del núcleo')).toHaveAttribute('aria-invalid', 'true');
  });

  it('T361: server errors on es.ports[2].adapters[0].status and en.core land on that select and on the English core', async () => {
    const third = (lang: 'es' | 'en'): Port => ({ id: 'cache', name: lang === 'es' ? 'Caché' : 'Cache', adapters: [{ id: 'redis', name: 'Redis', status: 'production' }] });
    const es = copy('architecture.es');
    const en = copy('architecture.en');
    es.ports.push(third('es'));
    en.ports.push(third('en'));
    stubFetch(
      reply(422, {
        code: 'CONTENT_INVALID',
        requestId: 'b'.repeat(32),
        errors: [
          { path: 'es.ports[2].adapters[0].status', code: 'INVALID_VALUE' },
          { path: 'en.core', code: 'REQUIRED' },
        ],
      }),
    );
    renderArchitecture({ initial: view(es, en), validate: () => [] });
    type(named(column(screen.getByRole('region', { name: 'Núcleo' }), 'es'), 'textbox', 'Descripción del núcleo'), 'Otra descripción');
    fireEvent.click(saveButton());
    const summary = await screen.findByRole('alert', { name: /Hay errores/ });
    await waitFor(() => expect(summary).toHaveFocus());
    const cache = openItem('Caché');
    const select = named(adapterRows(cache)[0] as HTMLElement, 'combobox', 'Estado del adaptador 1');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription(/Error: El valor no es válido/);
    const englishCore = within(screen.getByRole('region', { name: 'Núcleo' })).getByRole('group', { name: 'Inglés' });
    expect(englishCore).toHaveAttribute('data-invalid', 'true');
    expect(englishCore).toHaveAccessibleDescription(/Error: Este campo es obligatorio/);
    expect(within(screen.getByRole('region', { name: 'Núcleo' })).getByRole('group', { name: 'Español' })).not.toHaveAttribute('data-invalid');
    expect(within(summary).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([`#${englishCore.id}`, `#${select.id}`]);
    expect(summary).toHaveTextContent('Núcleo (EN)');
    expect(summary).toHaveTextContent('Caché · Estado del adaptador 1 (Común a los dos idiomas)');
  });

  it('T362: a status that differs between ES and EN in stored data is flagged by the parity panel and «Igualar EN a ES» fixes it', async () => {
    const es = copy('architecture.es');
    const en = copy('architecture.en');
    (en.ports[0]?.adapters[1] as Adapter).status = 'experiment';
    const { mock, bodies } = stubFetch(reply(200, savedView({ es, en }, { es: 2, en: 2 })));
    renderArchitecture({ initial: view(es, en, { es: 1, en: 1 }, [{ path: 'ports[0].adapters[1].status', code: 'PARITY_MISMATCH' }]) });
    const panel = screen.getByRole('region', { name: 'Paridad ES/EN' });
    expect(within(panel).getByRole('status')).toHaveTextContent('2 diferencias entre español e inglés.');
    expect(panel).toHaveTextContent('«Base de datos · MongoDB»: el estado en inglés (proyecto de prueba) no coincide con el español (en producción).');
    // The form says it too, next to the select.
    const row = adapterRows(openItem('Base de datos'))[1] as HTMLElement;
    expect(within(row).getByText('En inglés el estado publicado es «proyecto de prueba». Usa «Igualar EN a ES» en el panel de paridad o elige un estado para los dos idiomas.')).toBeInTheDocument();
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Igualar EN a ES «Base de datos · MongoDB»' }));
    // The button goes away: the focus lands on the panel title (no other repair left), not on the body.
    await waitFor(() => expect(within(panel).getByRole('heading', { name: 'Paridad ES/EN' })).toHaveFocus());
    expect(panel).not.toHaveTextContent('no coincide con el español');
    expect(within(row).queryByText(/En inglés el estado publicado es/)).toBeNull();
    // Only the published difference is left (until the save).
    expect(within(panel).getByRole('status')).toHaveTextContent('1 diferencia entre español e inglés.');
    expect(screen.getByText('1 cambio sin guardar')).toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    const documents = sent(bodies[0]);
    expect(documents.en.ports[0]?.adapters[1]?.status).toBe('production');
    expect(documents.es.ports[0]?.adapters[1]?.status).toBe('production');
  });

  it('extra (CR-2): with two status mismatches, «Igualar EN a ES» moves the focus to the next repair, then to the panel title', async () => {
    const es = copy('architecture.es');
    const en = copy('architecture.en');
    (en.ports[0]?.adapters[0] as Adapter).status = 'experiment';
    (en.ports[0]?.adapters[1] as Adapter).status = 'experiment';
    renderArchitecture({ initial: view(es, en) });
    const panel = screen.getByRole('region', { name: 'Paridad ES/EN' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Igualar EN a ES «Base de datos · PostgreSQL»' }));
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Igualar EN a ES «Base de datos · MongoDB»' })).toHaveFocus());
    fireEvent.click(within(panel).getByRole('button', { name: 'Igualar EN a ES «Base de datos · MongoDB»' }));
    await waitFor(() => expect(within(panel).getByRole('heading', { name: 'Paridad ES/EN' })).toHaveFocus());
    expect(within(panel).queryAllByRole('button', { name: /^Igualar EN a ES/ })).toHaveLength(0);
  });

  it('T364: the preview DOM holds no port or adapter ids', () => {
    const doc = (lang: 'es' | 'en') => ({
      core: { name: lang === 'es' ? 'Núcleo' : 'Core' },
      ports: [
        { id: 'puerto-oculto-uno', name: lang === 'es' ? 'Datos' : 'Data', adapters: [{ id: 'adaptador-oculto-a', name: 'Postgres', status: 'in-this-api' }, { id: 'adaptador-oculto-b', name: 'Mongo', status: 'experiment', note: 'Nota' }] },
        { id: 'puerto-oculto-dos', name: lang === 'es' ? 'Colas' : 'Queues', adapters: [{ id: 'adaptador-oculto-c', name: 'Kafka', status: 'production' }] },
      ],
    });
    renderArchitecture({ initial: view(doc('es'), doc('en')) });
    const ids = ['puerto-oculto-uno', 'puerto-oculto-dos', 'adaptador-oculto-a', 'adaptador-oculto-b', 'adaptador-oculto-c'];
    for (const lang of ['Español', 'Inglés']) {
      fireEvent.click(within(screen.getByRole('group', { name: 'Idioma de la vista previa' })).getByRole('button', { name: lang }));
      // Every port selected in turn, so each panel (and its adapters) is rendered once.
      let html = '';
      for (const node of within(preview()).getAllByRole('button')) {
        fireEvent.click(node);
        html += preview().outerHTML;
      }
      expect(html).toContain('Mongo');
      expect(html).toContain('Kafka');
      for (const id of ids) expect(html, `${lang} ${id}`).not.toContain(id);
    }
  });

  it('extra (AC26): every input and button of the ports (toolbar included) has a unique accessible name', () => {
    renderArchitecture();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir puerto' }));
    openItem('Base de datos');
    openItem('Colas');
    const names: string[] = [];
    for (const role of ['textbox', 'combobox', 'button'] as const) {
      screen.queryAllByRole(role, {
        name: (name, element) => {
          if (role !== 'button' || element.closest('[data-item]')) names.push(name);
          return true;
        },
      });
    }
    expect(names.length).toBeGreaterThan(40);
    expect(names).toContain('Bajar «Base de datos» (posición 1)');
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
    expect(names).toContain('Nombre (español · Puerto 1: Base de datos)');
    expect(names).toContain('Nombre del adaptador 1 (inglés · Puerto 1: Base de datos)');
    expect(names).toContain('Estado del adaptador 2 (común · Puerto 1: Base de datos)');
    expect(names).toContain('Quitar el adaptador 1 (común · Puerto 2: Colas)');
    expect(names).toContain('Identificador (común · Puerto 3)');
    expect(names).toContain('Nombre del núcleo (español · Núcleo)');
    expect(allNamed(document.body, 'button', 'Añadir adaptador')).toHaveLength(3);
  });

  it('extra: an adapter in one language only is marked in the other column with «Crear gemelo»', async () => {
    const es = copy('architecture.es');
    const en = copy('architecture.en');
    en.ports[0]?.adapters.splice(1, 1);
    renderArchitecture({ initial: view(es, en) });
    const row = adapterRows(openItem('Base de datos'))[1] as HTMLElement;
    expect(within(column(row, 'en')).getByText('Sin versión en inglés.')).toBeInTheDocument();
    fireEvent.click(named(column(row, 'en'), 'button', 'Crear gemelo en EN'));
    expect(named(column(row, 'en'), 'textbox', 'Nombre del adaptador 2')).toHaveValue('');
    // The button gave way to the fields: the focus is on the first of them, not lost.
    await waitFor(() => expect(named(column(row, 'en'), 'textbox', 'Nombre del adaptador 2')).toHaveFocus());
  });

  it('regresion extra: «Crear gemelo» of a port moves the focus to the name it creates', async () => {
    const es = copy('architecture.es');
    const en = copy('architecture.en');
    en.ports.splice(1, 1);
    renderArchitecture({ initial: view(es, en) });
    const port = openItem('Colas');
    fireEvent.click(named(column(port, 'en'), 'button', 'Crear gemelo en EN'));
    await waitFor(() => expect(named(column(port, 'en'), 'textbox', 'Nombre')).toHaveFocus());
  });

  it('regresion extra: server marks on an adapter (by position) go away when the adapters of its port move; names and notes stay', async () => {
    stubFetch(reply(422, { code: 'CONTENT_INVALID', requestId: 'a'.repeat(32), errors: [{ path: 'es.ports[0].adapters[1].note', code: 'TOO_LONG' }, { path: 'es.ports[0].name', code: 'TOO_LONG' }] }));
    renderArchitecture({ validate: () => [] });
    const port = openItem('Base de datos');
    type(named(column(port, 'es'), 'textbox', 'Descripción'), 'Descripción cambiada');
    fireEvent.click(saveButton());
    await screen.findByRole('alert', { name: /Hay errores/ });
    const marked = named(column(adapterRows(port)[1] as HTMLElement, 'es'), 'textbox', 'Nota del adaptador 2');
    expect(marked).toHaveAttribute('aria-invalid', 'true');
    const notes = () => adapterRows(port).map((row) => (named(column(row, 'es'), 'textbox', `Nota del adaptador ${adapterRows(port).indexOf(row) + 1}`) as HTMLInputElement).value);
    const before = notes();

    fireEvent.click(named(adapterRows(port)[1] as HTMLElement, 'button', 'Subir el adaptador 2'));
    expect(notes()).toEqual([before[1], before[0]]);
    for (const row of adapterRows(port)) expect(within(row).queryAllByRole('textbox').filter((input) => input.getAttribute('aria-invalid') === 'true')).toEqual([]);
    expect(named(column(port, 'es'), 'textbox', 'Nombre')).toHaveAttribute('aria-invalid', 'true');
  });
});
