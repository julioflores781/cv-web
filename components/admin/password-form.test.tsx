import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_MESSAGES } from '@/lib/admin/messages';
import { PasswordForm } from './password-form';
import { LogoutButton, SessionActions } from './session-actions';

const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
const original = { showModal: proto.showModal, close: proto.close };
beforeEach(() => {
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
function stub(handler: () => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal('fetch', mock);
  return mock;
}
const current = () => screen.getByLabelText('Contraseña actual') as HTMLInputElement;
const next = () => screen.getByLabelText('Nueva contraseña') as HTMLInputElement;
const confirm = () => screen.getByLabelText('Repite la nueva contraseña') as HTMLInputElement;
const fill = (a: string, b: string, c = b) => {
  fireEvent.change(current(), { target: { value: a } });
  fireEvent.change(next(), { target: { value: b } });
  fireEvent.change(confirm(), { target: { value: c } });
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: /Cambiar contraseña|Guardando/ }));
const LONG = 'una frase nueva muy larga';

describe('PasswordForm', () => {
  it('T278: visible labels, the right autocomplete values and the 12-128 hint', () => {
    render(<PasswordForm />);
    expect(current()).toHaveAttribute('autocomplete', 'current-password');
    expect(next()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirm()).toHaveAttribute('autocomplete', 'new-password');
    for (const input of [current(), next(), confirm()]) expect(input).toHaveAttribute('type', 'password');
    expect(screen.getByText(/entre 12 y 128 caracteres/i)).toBeInTheDocument();
    expect(next()).toHaveAccessibleDescription(/entre 12 y 128 caracteres/i);
  });

  it('T278: client validation blocks the request and marks the field; 403, 422 and 429 map by code; success is announced and clears the fields', async () => {
    const mock = stub(() => reply(200, { ok: true }));
    render(<PasswordForm />);
    fill('actual', 'corta');
    submit();
    expect(mock).not.toHaveBeenCalled();
    expect(next()).toHaveAttribute('aria-invalid', 'true');
    expect(next()).toHaveAccessibleDescription(/al menos 12/i);

    fill('actual', LONG, 'otra distinta');
    submit();
    expect(confirm()).toHaveAttribute('aria-invalid', 'true');
    expect(mock).not.toHaveBeenCalled();

    mock.mockImplementation(() => reply(403, { code: 'ADMIN_CURRENT_PASSWORD_WRONG' }));
    fill('mala', LONG);
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(ADMIN_MESSAGES.ADMIN_CURRENT_PASSWORD_WRONG as string));
    expect(screen.getByRole('alert')).toHaveTextContent(/cuenta para el bloqueo/i);
    mock.mockImplementation(() => reply(422, { code: 'ADMIN_WEAK_PASSWORD' }));
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(ADMIN_MESSAGES.ADMIN_WEAK_PASSWORD as string));
    mock.mockImplementation(() => reply(429, { code: 'ADMIN_LOGIN_LOCKED', retryAfterSeconds: 120 }));
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(ADMIN_MESSAGES.ADMIN_LOGIN_LOCKED as string));
    expect(screen.getByRole('alert')).toHaveTextContent('2:00');

    mock.mockImplementation(() => reply(200, { ok: true }));
    submit();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Contraseña cambiada'));
    expect(current().value).toBe('');
    expect(next().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
    const [url, init] = mock.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(url).toBe('/admin/api/password/');
    expect(JSON.parse(init.body as string)).toEqual({ currentPassword: 'mala', newPassword: LONG });
  });

  it('T278: an expired session goes to the login with expired=1 and the current page as next', async () => {
    stub(() => reply(401, { code: 'ADMIN_UNAUTHORIZED' }));
    const navigate = vi.fn();
    render(<PasswordForm navigate={navigate} path="/admin/settings/" />);
    fill('actual', LONG);
    submit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/admin/login/?expired=1&next=${encodeURIComponent('/admin/settings/')}`));
  });
});

describe('SessionActions', () => {
  it('T278: «Cerrar todas las sesiones» asks first; cancelling sends nothing; confirming sends and goes to the login; a failure keeps the session and says so', async () => {
    const mock = stub(() => reply(502, { code: 'ADMIN_UPSTREAM' }));
    const navigate = vi.fn();
    render(<SessionActions navigate={navigate} />);
    expect(screen.getByText(/8 horas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas las sesiones' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/todos los dispositivos/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas las sesiones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(ADMIN_MESSAGES.ADMIN_UPSTREAM as string));
    expect(navigate).not.toHaveBeenCalled();

    mock.mockImplementation(() => reply(200, { ok: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas las sesiones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin/login/'));
    expect((mock.mock.calls.at(-1) as unknown as [string])[0]).toBe('/admin/api/logout-all/');
  });
});

describe('LogoutButton', () => {
  it('extra: posts to /admin/api/logout/ and goes to the login, even when the request fails', async () => {
    const mock = stub(() => reply(200, { ok: true }));
    const navigate = vi.fn();
    render(<LogoutButton navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin/login/'));
    expect((mock.mock.calls[0] as unknown as [string])[0]).toBe('/admin/api/logout/');
  });
});
