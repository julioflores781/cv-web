import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveDraft } from '@/lib/admin/content/drafts';
import { servicesModel } from '@/lib/admin/content/services';
import {
  memoryStorage,
  openItem,
  pairOf,
  renderServices,
  reply,
  saveButton,
  savedView,
  SERVICES_EN,
  SERVICES_ES,
  stubDialog,
  stubFetch,
  view,
} from '@/tests/helpers/admin-editor';
import { ServicesEditor } from './services-editor';

let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = stubDialog();
});
afterEach(() => {
  restoreDialog();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const DRAFT_KEY = 'cv-admin-draft:services';
const editEsTitle = (value: string) => {
  const item = openItem('Servicio de ejemplo');
  fireEvent.change(pairOf(item, 'Título')[0], { target: { value } });
  return item;
};
const latestWith = (title: string, versions = { es: 2, en: 2 }) => {
  const es = structuredClone(SERVICES_ES);
  es.services[0]!.title = title;
  return { kind: 'services', ...view(es, versions.en === 1 ? SERVICES_EN : structuredClone(SERVICES_EN), versions) };
};
const deferred = () => {
  let resolve: (value: Response) => void = () => undefined;
  const promise = new Promise<Response>((done) => (resolve = done));
  return { promise, resolve };
};

describe('EditorFrame', () => {
  it('T319: the bar tells no changes / N changes / saving / saved; «Guardar» is inert without changes or while saving; beforeunload only while dirty', async () => {
    const pending = deferred();
    stubFetch(pending.promise);
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    renderServices();
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(added.mock.calls.some(([type]) => type === 'beforeunload')).toBe(false);

    editEsTitle('Servicio cambiado');
    expect(screen.getByText('1 cambio sin guardar')).toBeInTheDocument();
    expect(saveButton()).not.toHaveAttribute('aria-disabled');
    expect(added.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true);

    fireEvent.click(saveButton());
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Guardando…').length).toBeGreaterThan(0);
    await act(async () => pending.resolve(reply(200, savedView(servicesModel.serialize(servicesModel.pair({ services: [{ ...SERVICES_ES.services[0], title: 'Servicio cambiado' }, SERVICES_ES.services[1]] }, SERVICES_EN)), { es: 2, en: 2 }))));
    await waitFor(() => expect(screen.getAllByText('Guardado: ES v2, EN v2.').length).toBeGreaterThan(0));
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(removed.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true);
  });

  it('T320: the comment has a counter; at 201 characters the error shows and nothing is cut', () => {
    renderServices();
    const comment = screen.getByLabelText('Comentario del guardado') as HTMLInputElement;
    fireEvent.change(comment, { target: { value: 'c'.repeat(200) } });
    expect(screen.getByText('200 de 200 caracteres')).toBeInTheDocument();
    expect(comment).not.toHaveAttribute('aria-invalid');
    fireEvent.change(comment, { target: { value: 'c'.repeat(201) } });
    expect(comment.value).toHaveLength(201);
    expect(comment).toHaveAttribute('aria-invalid', 'true');
    expect(comment).toHaveAccessibleDescription(/El texto es demasiado largo/);
    expect(comment).not.toHaveAttribute('maxlength');
  });

  it('T321: with client errors nothing is sent; the summary (role=alert) gets the focus and links to the field, which is marked and clears once fixed', async () => {
    const { mock } = stubFetch(reply(200, {}));
    renderServices();
    const item = editEsTitle('   ');
    fireEvent.click(saveButton());
    expect(mock).not.toHaveBeenCalled();
    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    const field = pairOf(item, 'Título')[0];
    const link = within(summary).getByRole('link', { name: /Título \(ES\).*obligatorio/ });
    expect(link).toHaveAttribute('href', `#${field.id}`);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/Error: Este campo es obligatorio/);
    fireEvent.click(link);
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'Título arreglado' } });
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('T322: a successful save clears dirty and the draft, announces the versions in role=status and the next save uses the new baseVersions', async () => {
    const first = { es: { services: [{ ...SERVICES_ES.services[0], title: 'Uno' }, SERVICES_ES.services[1]] }, en: SERVICES_EN };
    const second = { es: { services: [{ ...SERVICES_ES.services[0], title: 'Dos' }, SERVICES_ES.services[1]] }, en: SERVICES_EN };
    const { bodies } = stubFetch(reply(200, savedView(first, { es: 2, en: 2 })), reply(200, savedView(second, { es: 3, en: 3 })));
    const storage = memoryStorage();
    renderServices({ storage });
    editEsTitle('Uno');
    saveDraft(storage, 'services', { es: 1, en: 1 }, servicesModel.pair(first.es, first.en));
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getAllByRole('status').some((node) => node.textContent === 'Guardado: ES v2, EN v2.')).toBe(true));
    expect(bodies[0]?.baseVersions).toEqual({ es: 1, en: 1 });
    expect(storage.data.has(DRAFT_KEY)).toBe(false);
    expect(screen.getByText('Guardado: ES v2, EN v2.', { selector: 'p:not([role])' })).toBeInTheDocument();
    fireEvent.change(pairOf(openItem('Uno'), 'Título')[0], { target: { value: 'Dos' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]?.baseVersions).toEqual({ es: 2, en: 2 });
  });

  it('T323: a 409 shows the banner with language and versions, keeps what was typed, lists the diff, and overwrite / discard ask first', async () => {
    const latest = latestWith('Título de otra sesión');
    const { bodies } = stubFetch(reply(409, { code: 'CONTENT_VERSION_CONFLICT', requestId: 'r1', latest }), reply(200, savedView({ es: SERVICES_ES, en: SERVICES_EN }, { es: 3, en: 3 })));
    const storage = memoryStorage();
    renderServices({ storage });
    const item = editEsTitle('Mi título');
    fireEvent.click(saveButton());
    const banner = await screen.findByText(/Alguien ha cambiado esto/);
    expect(banner.textContent).toMatch(/ES \(v1 → v2\), EN \(v1 → v2\)/);
    expect(pairOf(item, 'Título')[0].value).toBe('Mi título');
    expect(storage.data.has(DRAFT_KEY)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Ver qué cambió' }));
    expect(screen.getByText(/Modificados: servicio-ejemplo \(Título\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar encima' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar encima' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]?.baseVersions).toEqual({ es: 2, en: 2 });
    expect((bodies[1]?.documents as { es: { services: Array<{ title: string }> } }).es.services[0]?.title).toBe('Mi título');
  });

  it('T323: «Descartar los míos y cargar lo nuevo» (confirmed) loads the latest content', async () => {
    stubFetch(reply(409, { code: 'CONTENT_VERSION_CONFLICT', requestId: 'r1', latest: latestWith('Título de otra sesión') }));
    renderServices();
    editEsTitle('Mi título');
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar los míos y cargar lo nuevo' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Descartar los míos y cargar lo nuevo' }));
    const item = openItem('Título de otra sesión');
    expect(pairOf(item, 'Título')[0].value).toBe('Título de otra sesión');
    expect(screen.queryByText(/Alguien ha cambiado esto/)).toBeNull();
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();
  });

  it('T324: a conflict in one language names only that one, and overwrite sends both bases from latest', async () => {
    const latest = latestWith('Solo español', { es: 2, en: 1 });
    const { bodies } = stubFetch(reply(409, { code: 'CONTENT_VERSION_CONFLICT', requestId: 'r1', latest }), reply(200, savedView({ es: SERVICES_ES, en: SERVICES_EN }, { es: 3, en: 2 })));
    renderServices();
    editEsTitle('Mío');
    fireEvent.click(saveButton());
    const banner = await screen.findByText(/Alguien ha cambiado esto/);
    expect(banner.textContent).toMatch(/Cambió: ES \(v1 → v2\)\./);
    expect(banner.textContent).not.toMatch(/EN \(/);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar encima' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar encima' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]?.baseVersions).toEqual({ es: 2, en: 1 });
  });

  it('T325: a server 422 (client check skipped) puts each error on its field with its message, the unknown in the summary, and focuses the summary', async () => {
    stubFetch(
      reply(422, {
        code: 'CONTENT_INVALID',
        requestId: 'r2',
        errors: [
          { path: 'es.services[0].title', code: 'TOO_LONG' },
          { path: 'en.services[1].summary', code: 'REQUIRED' },
          { path: 'es.mystery[3]', code: 'UNKNOWN_FIELD' },
        ],
      }),
    );
    renderServices({ validate: () => [] });
    editEsTitle('Algo');
    fireEvent.click(saveButton());
    const summary = await screen.findByRole('alert');
    await waitFor(() => expect(summary).toHaveFocus());
    const first = pairOf(openItem('Algo'), 'Título')[0];
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(first).toHaveAccessibleDescription(/El texto es demasiado largo/);
    const second = pairOf(openItem('Servicio a consultar'), 'Resumen')[1];
    expect(second).toHaveAccessibleDescription(/Este campo es obligatorio/);
    expect(within(summary).getByText(/es\.mystery\[3\]/)).toBeInTheDocument();
    expect(within(summary).getByText(/General: Campo desconocido/)).toBeInTheDocument();
  });

  it('T326: CONTENT_PARITY_BROKEN with unprefixed paths marks the common fields and shows an explaining banner', async () => {
    stubFetch(reply(422, { code: 'CONTENT_PARITY_BROKEN', requestId: 'r3', errors: [{ path: 'services[0].price', code: 'PARITY_MISMATCH' }, { path: 'services[1].id', code: 'PARITY_MISMATCH' }] }));
    renderServices({ validate: () => [] });
    editEsTitle('Algo');
    fireEvent.click(saveButton());
    expect(await screen.findByText(/el español y el inglés no coinciden en los datos comunes/)).toBeInTheDocument();
    const item = openItem('Algo');
    expect(within(item).getByLabelText(/A consultar/)).toHaveAccessibleDescription(/debe ser igual en español y en inglés/);
    const id = within(openItem('Servicio a consultar')).getByLabelText('Identificador');
    expect(id).toHaveAttribute('aria-invalid', 'true');
    expect(within(screen.getByRole('alert')).getAllByText(/Común a los dos idiomas/).length).toBe(2);
  });

  it('T327: a network failure shows an inline error with retry and keeps the draft', async () => {
    const { mock } = stubFetch(new TypeError('Failed to fetch'), reply(200, savedView({ es: SERVICES_ES, en: SERVICES_EN }, { es: 2, en: 2 })));
    renderServices();
    const item = editEsTitle('No se pierde');
    fireEvent.click(saveButton());
    expect(await screen.findByText(/No se ha podido contactar con el servidor/)).toBeInTheDocument();
    expect(pairOf(item, 'Título')[0].value).toBe('No se pierde');
    expect(screen.getByText('1 cambio sin guardar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
  });

  it('T328: a 401 copies the draft to sessionStorage and goes to login?expired=1&next=<page>; back on the page, «Restaurar borrador» brings it back', async () => {
    stubFetch(reply(401, { code: 'ADMIN_UNAUTHORIZED', requestId: 'r4' }));
    const storage = memoryStorage();
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const guards = (spy: typeof added) => spy.mock.calls.filter(([type]) => type === 'beforeunload').map(([, listener]) => listener);
    let armedAtRedirect: unknown[] = [];
    const navigate = vi.fn(() => {
      armedAtRedirect = guards(added).filter((listener) => !guards(removed).includes(listener));
    });
    const { unmount } = renderServices({ storage, navigate });
    editEsTitle('Escrito antes de caducar');
    expect(guards(added)).toHaveLength(1);
    fireEvent.click(saveButton());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin/login/?expired=1&next=%2Fadmin%2Fservices%2F'));
    // No «leave the site?» prompt on top of the redirect: the guard is gone before navigating.
    expect(armedAtRedirect).toEqual([]);
    expect(storage.data.has(DRAFT_KEY)).toBe(true);
    unmount();

    renderServices({ storage });
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar borrador' }));
    const item = openItem('Escrito antes de caducar');
    expect(pairOf(item, 'Título')[0].value).toBe('Escrito antes de caducar');
    expect(screen.getByText('1 cambio sin guardar')).toBeInTheDocument();
  });

  it('T329: a draft on the same versions can be restored or discarded; on other versions the panel warns and shows the diff', () => {
    const edited = servicesModel.pair({ services: [{ ...SERVICES_ES.services[0], title: 'Borrador' }, SERVICES_ES.services[1]] }, SERVICES_EN);
    const storage = memoryStorage();
    saveDraft(storage, 'services', { es: 1, en: 1 }, edited);
    const first = render(<ServicesEditor initial={view(SERVICES_ES, SERVICES_EN)} storage={storage} navigate={vi.fn()} />);
    expect(screen.queryByText(/se ha publicado otra versión/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    expect(storage.data.has(DRAFT_KEY)).toBe(false);
    expect(screen.queryByRole('button', { name: 'Restaurar borrador' })).toBeNull();
    first.unmount();

    saveDraft(storage, 'services', { es: 1, en: 1 }, edited);
    render(<ServicesEditor initial={view(SERVICES_ES, SERVICES_EN, { es: 4, en: 4 })} storage={storage} navigate={vi.fn()} />);
    expect(screen.getByText(/se ha publicado otra versión/)).toBeInTheDocument();
    expect(screen.getByText(/Modificados: servicio-ejemplo \(Título\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar borrador' }));
    expect(pairOf(openItem('Borrador'), 'Título')[0].value).toBe('Borrador');
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Borrador restaurado.')).toBe(true);
  });

  it('T329: saving a restored draft of older versions never overwrites silently: it sends the old bases, gets the 409 and overwriting needs a confirmation', async () => {
    const edited = servicesModel.pair({ services: [{ ...SERVICES_ES.services[0], title: 'Borrador viejo' }, SERVICES_ES.services[1]] }, SERVICES_EN);
    const storage = memoryStorage();
    saveDraft(storage, 'services', { es: 1, en: 1 }, edited);
    const latest = latestWith('Publicado después', { es: 4, en: 4 });
    const { bodies } = stubFetch(reply(409, { code: 'CONTENT_VERSION_CONFLICT', requestId: 'r5', latest }), reply(200, savedView({ es: SERVICES_ES, en: SERVICES_EN }, { es: 5, en: 5 })));
    render(<ServicesEditor initial={view(latest.languages.es.content, latest.languages.en.content, { es: 4, en: 4 })} storage={storage} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar borrador' }));
    fireEvent.click(saveButton());
    const banner = await screen.findByText(/Alguien ha cambiado esto/);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.baseVersions).toEqual({ es: 1, en: 1 });
    expect(banner.textContent).toMatch(/ES \(v1 → v4\), EN \(v1 → v4\)/);
    fireEvent.click(screen.getByRole('button', { name: 'Ver qué cambió' }));
    expect(screen.getByText(/Modificados: servicio-ejemplo \(Título\)/)).toBeInTheDocument();
    // The draft stays tied to its old versions until the overwrite is confirmed.
    expect(JSON.parse(storage.data.get(DRAFT_KEY) ?? '{}').baseVersions).toEqual({ es: 1, en: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar encima' }));
    expect(bodies).toHaveLength(1);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar encima' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]?.baseVersions).toEqual({ es: 4, en: 4 });
    expect((bodies[1]?.documents as { es: { services: Array<{ title: string }> } }).es.services[0]?.title).toBe('Borrador viejo');
  });

  it('T329: after a 409 without latest, saving again sends the same old bases (another 409), never an overwrite', async () => {
    const { bodies } = stubFetch(reply(409, { code: 'CONTENT_VERSION_CONFLICT', requestId: 'r6' }));
    renderServices();
    editEsTitle('Sin latest');
    fireEvent.click(saveButton());
    expect(await screen.findByText(/recarga la página para recuperarlo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar encima' })).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies.map((body) => body.baseVersions)).toEqual([{ es: 1, en: 1 }, { es: 1, en: 1 }]);
  });

  it('extra: a stored draft equal to what is published is not offered and is cleared', () => {
    const storage = memoryStorage();
    saveDraft(storage, 'services', { es: 1, en: 1 }, servicesModel.pair(SERVICES_ES, SERVICES_EN));
    renderServices({ storage });
    expect(screen.queryByRole('button', { name: 'Restaurar borrador' })).toBeNull();
    expect(storage.data.has(DRAFT_KEY)).toBe(false);
  });
});
