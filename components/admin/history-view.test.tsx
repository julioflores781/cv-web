import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VersionSnapshot, VersionSummary } from '@/lib/api/admin';
import { saveDraft } from '@/lib/admin/content/drafts';
import { memoryStorage, reply, SERVICES_EN, SERVICES_ES, stubDialog, stubFetch, view } from '@/tests/helpers/admin-editor';
import { HistoryView, type HistoryViewProps } from './history-view';

let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = stubDialog();
});
afterEach(() => {
  restoreDialog();
  vi.unstubAllGlobals();
});

const summary = (version: number, comment: string | null, source = 'admin'): VersionSummary => ({
  version,
  active: false,
  publishedAt: `2026-11-0${version}T10:00:00Z`,
  source,
  comment,
});
/** Spanish v1 (seed), v2 and v3 (active); English at v3. */
const VERSIONS = [summary(3, 'Precio nuevo'), summary(2, null), summary(1, null, 'seed')];
const V1_ES = { services: [{ id: 'servicio-ejemplo', title: 'Servicio antiguo', summary: 'Un servicio ficticio.', price: null }] };
const current = (es = 3, en = 3, differences: Array<{ path: string; code: string }> = []) => ({ kind: 'services', ...view(SERVICES_ES, SERVICES_EN, { es, en }, differences) });
const snapshot = (version: number, content: Record<string, unknown> = V1_ES): VersionSnapshot => ({ kind: 'services', lang: 'es', version, active: false, publishedAt: '2026-11-01T10:00:00Z', source: 'seed', comment: null, content });

function renderHistory(props: Partial<HistoryViewProps> = {}) {
  const navigate = vi.fn();
  const storage = props.storage === undefined ? memoryStorage() : props.storage;
  const utils = render(<HistoryView kind="services" lang="es" versions={VERSIONS} current={current()} snapshot={null} navigate={navigate} storage={storage} {...props} />);
  return { ...utils, navigate, storage };
}

/** `next/link` drops the trailing slash of a path in jsdom (`trailingSlash` adds it back in the app). */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const link = (path: string) => {
  const [pathname = '', query] = path.split('?');
  return expect.stringMatching(`^${escape(pathname.replace(/\/$/, ''))}/?${query === undefined ? '' : `\\?${escape(query)}`}$`);
};
const row = (n: number) => screen.getByRole('listitem', { name: `v${n}` });
const restoreButton = (n: number) => screen.getByRole('button', { name: `Restaurar la versión ${n} (ES)` });
const dialog = () => screen.getByRole('dialog');
const confirm = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Restaurar' }));

describe('HistoryView', () => {
  it('T392: an ES|EN selector, the versions newest first with number, date, source, comment and «Activa» (text + shape), «Ver» and «Restaurar» (inert on the active one)', () => {
    renderHistory();
    const langs = screen.getByRole('navigation', { name: 'Idioma del historial' });
    expect(within(langs).getByRole('link', { name: 'Español' })).toHaveAttribute('aria-current', 'page');
    expect(within(langs).getByRole('link', { name: 'Inglés' })).toHaveAttribute('href', link('/admin/history/services/?lang=en'));
    expect(screen.getByRole('heading', { level: 2, name: 'Versiones en español' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Versiones en español' })).getAllByRole('listitem');
    expect(rows.map((node) => within(node).getByText(/^v\d+$/).textContent)).toEqual(['v3', 'v2', 'v1']);
    expect(rows[0]).toHaveAccessibleName('v3');
    const active = row(3);
    const badge = within(active).getByText('Activa');
    expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(within(row(2)).queryByText('Activa')).toBeNull();
    expect(active.querySelector('time')).toHaveAttribute('dateTime', '2026-11-03T10:00:00Z');
    expect(active).toHaveTextContent('Panel');
    expect(row(1)).toHaveTextContent('Inicial');
    expect(active).toHaveTextContent('Precio nuevo');
    expect(row(2)).toHaveTextContent('Sin comentario');
    expect(within(row(2)).getByRole('link', { name: 'Ver la versión 2 (ES)' })).toHaveAttribute('href', link('/admin/history/services/?lang=es&v=2'));
    expect(restoreButton(3)).toHaveAttribute('aria-disabled', 'true');
    expect(restoreButton(3)).toHaveAccessibleDescription('Es la versión activa.');
    expect(restoreButton(2)).not.toHaveAttribute('aria-disabled');
    // Inert: clicking the active one opens nothing.
    fireEvent.click(restoreButton(3));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Activa ahora: ES v3 · EN v3.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar servicios' })).toHaveAttribute('href', link('/admin/services/'));
  });

  it('T393: one version says there is nothing to go back to; none says «Nunca publicado» with a link to publish the first one', () => {
    const { unmount } = renderHistory({ versions: [summary(1, null, 'seed')], current: current(1, 1) });
    expect(screen.getByText('Solo hay una versión: no hay otra a la que volver.')).toBeInTheDocument();
    expect(restoreButton(1)).toHaveAttribute('aria-disabled', 'true');
    unmount();
    renderHistory({ versions: [], current: view(null, null, { es: 0, en: 0 }) });
    expect(screen.getByText('Nunca publicado en español.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Publicar el primero' })).toHaveAttribute('href', link('/admin/services/'));
    expect(screen.queryByRole('list', { name: 'Versiones en español' })).toBeNull();
  });

  it('T394: ?v=N shows a read-only snapshot with what would change against the active one; a version that does not exist is a friendly 404', () => {
    const { unmount } = renderHistory({ snapshot: { kind: 'ok', data: snapshot(1) } });
    const region = screen.getByRole('region', { name: 'Versión 1 · Español' });
    expect(region).toHaveTextContent('Solo lectura');
    expect(region).toHaveTextContent('Si la restauras, esto cambia frente a la activa (v3):');
    expect(region).toHaveTextContent('Quitados: servicio-a-consultar');
    expect(region).toHaveTextContent('Modificados: servicio-ejemplo (Precio, Título)');
    expect(within(region).getByRole('list', { name: 'Contenido de la versión' })).toHaveTextContent('servicio-ejemplo — Servicio antiguo');
    expect(within(region).queryByRole('textbox')).toBeNull();
    expect(within(region).getByRole('button', { name: 'Restaurar esta versión' })).not.toHaveAttribute('aria-disabled');
    expect(within(region).getByRole('link', { name: 'Volver a la lista' })).toHaveAttribute('href', link('/admin/history/services/?lang=es'));
    unmount();

    const active = renderHistory({ snapshot: { kind: 'ok', data: { ...snapshot(3, SERVICES_ES), active: true } } });
    expect(screen.getByRole('region', { name: 'Versión 3 · Español' })).toHaveTextContent('Es la versión activa: restaurarla no cambiaría nada.');
    expect(screen.getByRole('button', { name: 'Restaurar esta versión' })).toHaveAttribute('aria-disabled', 'true');
    active.unmount();

    renderHistory({ snapshot: { kind: 'missing', version: 9 } });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('La versión 9 no existe en español. Elige otra de la lista.');
    expect(screen.getByRole('list', { name: 'Versiones en español' })).toBeInTheDocument();
  });

  it('T395: «Restaurar» asks first («ES pasa de v3 a v1 (se conserva el historial)», EN does not change); cancelling sends nothing; confirming sends baseVersion and targetVersion once', async () => {
    const { mock, bodies } = stubFetch(reply(200, current(1, 3)));
    renderHistory();
    fireEvent.click(restoreButton(1));
    expect(dialog()).toHaveAccessibleName('Restaurar versión');
    expect(dialog()).toHaveAccessibleDescription(/^ES pasa de v3 a v1 \(se conserva el historial: la v3 sigue en la lista y puedes volver a ella\)\. EN no cambia \(sigue en v3\)\./);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));
    expect(mock).not.toHaveBeenCalled();

    fireEvent.click(restoreButton(1));
    confirm();
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(mock.mock.calls[0]?.[0]).toBe('/admin/api/content/services/es/rollback/');
    expect(mock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(bodies).toEqual([{ baseVersion: 3, targetVersion: 1 }]);
    await screen.findByText(/Restaurada la v1 en español/);
  });

  it('extra (drafts): with an unsaved draft of the kind, the dialog warns that it is kept, and after restoring it is still in sessionStorage', async () => {
    const storage = memoryStorage();
    saveDraft(storage, 'services', { es: 3, en: 3 }, { items: [] }, Date.parse('2026-11-10T09:30:00Z'));
    const stored = storage.data.get('cv-admin-draft:services');
    stubFetch(reply(200, current(1, 3)));
    renderHistory({ storage });
    fireEvent.click(restoreButton(1));
    expect(dialog()).toHaveAccessibleDescription(/Tienes un borrador sin guardar de servicios \(.+\)\. No se borra: el editor te lo ofrecerá/);
    confirm();
    await screen.findByText(/Tu borrador sin guardar sigue a salvo/);
    expect(storage.data.get('cv-admin-draft:services')).toBe(stored);
  });

  it('T397: a 409 says the active one changed (now vN) with «Recargar»; 404 and 422 explain that it cannot be restored and the version stays inactive; nothing is retried', async () => {
    const { mock } = stubFetch(
      reply(409, { code: 'CONTENT_VERSION_CONFLICT', requestId: 'ref-409', latest: current(4, 3) }),
      reply(404, { code: 'CONTENT_VERSION_NOT_FOUND', requestId: 'ref-404' }),
      reply(422, { code: 'CONTENT_INVALID', requestId: 'ref-422', errors: [{ path: 'es.services[0].title', code: 'REQUIRED' }] }),
    );
    const { navigate } = renderHistory();

    fireEvent.click(restoreButton(1));
    confirm();
    const conflict = await screen.findByRole('alert');
    expect(conflict).toHaveTextContent('La versión activa en español cambió mientras mirabas (ahora es la v4). No se ha restaurado nada');
    expect(conflict).toHaveTextContent('Referencia: ref-409');
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    expect(navigate).toHaveBeenCalledWith('/admin/history/services/?lang=es');
    expect(within(row(3)).getByText('Activa')).toBeInTheDocument();

    fireEvent.click(restoreButton(2));
    confirm();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se puede restaurar: la versión 2 ya no existe. La activa sigue siendo la v3.'));

    fireEvent.click(restoreButton(1));
    confirm();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se puede restaurar la versión 1: ya no cumple las reglas actuales (1 error). La activa sigue siendo la v3.'));
    expect(screen.getByRole('alert')).toHaveTextContent('services[0].title: Este campo es obligatorio.');
    expect(within(row(1)).queryByText('Activa')).toBeNull();
    expect(within(row(3)).getByText('Activa')).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it('extra: a 401 keeps nothing pending and goes to the login with the page as next; a network failure is not retried and says so', async () => {
    const { mock } = stubFetch(reply(401, { code: 'ADMIN_UNAUTHORIZED' }), new TypeError('network'));
    const { navigate } = renderHistory();
    fireEvent.click(restoreButton(1));
    confirm();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/admin/login/?expired=1&next=${encodeURIComponent('/admin/history/services/?lang=es')}`));
    fireEvent.click(restoreButton(1));
    confirm();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/No se ha podido contactar con el servidor.*No se ha reintentado/));
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('T398: on success the «Activa» badge moves, it is announced, and a broken parity shows a notice with a link to the editor', async () => {
    stubFetch(reply(200, current(1, 3, [{ path: 'services[1]', code: 'PARITY_MISMATCH' }])));
    renderHistory({ snapshot: { kind: 'ok', data: snapshot(1) } });
    fireEvent.click(restoreButton(1));
    confirm();
    const status = await screen.findByText('Restaurada la v1 en español: ahora es la activa (antes, la v3). EN no cambia.');
    expect(status.closest('[role="status"]')).not.toBeNull();
    expect(within(row(1)).getByText('Activa')).toBeInTheDocument();
    expect(within(row(3)).queryByText('Activa')).toBeNull();
    expect(restoreButton(1)).toHaveAttribute('aria-disabled', 'true');
    expect(restoreButton(3)).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('Activa ahora: ES v1 · EN v3.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Versión 1 · Español' })).toHaveTextContent('Es la versión activa');
    expect(screen.getByText(/Tras restaurar, el español y el inglés no coinciden en 1 dato común/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar la paridad en el editor' })).toHaveAttribute('href', link('/admin/services/'));
  });

  it('T401: a long comment is cut with the full text in title; a comment with <script> is shown as text', () => {
    const long = `Comentario largo ${'muy '.repeat(40)}final`;
    const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const { container } = renderHistory({ versions: [summary(3, long), summary(2, hostile), summary(1, null, 'seed')] });
    const cut = within(row(3)).getByTitle(long);
    expect(cut.textContent?.endsWith('…')).toBe(true);
    expect(Array.from(cut.textContent ?? '').length).toBeLessThanOrEqual(81);
    expect(row(2)).toHaveTextContent(hostile);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
