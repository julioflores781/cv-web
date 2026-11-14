import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_MESSAGES, CLIENT_FAILURES } from '@/lib/admin/messages';
import { LoginForm } from './login-form';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
function stub(handler: () => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal('fetch', mock);
  return mock;
}
const field = () => screen.getByLabelText('Contraseña') as HTMLInputElement;
const button = () => screen.getByRole('button', { name: /Entrar|Comprobando/ });
const type = (value: string) => fireEvent.change(field(), { target: { value } });
const submit = () => fireEvent.click(button());
const flush = () => act(async () => void (await Promise.resolve()));

describe('LoginForm', () => {
  it('T271: one label «Contraseña», type=password, autocomplete=current-password and no username field', () => {
    const { container } = render(<LoginForm />);
    expect(field()).toHaveAttribute('type', 'password');
    expect(field()).toHaveAttribute('autocomplete', 'current-password');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(screen.queryByLabelText(/usuario|email|correo/i)).toBeNull();
  });

  it('T272: a 401 shows one generic alert, empties the field and returns the focus to it; a double submit sends once', async () => {
    let release: (response: Response) => void = () => undefined;
    const mock = stub(() => new Promise((resolve) => (release = resolve)));
    render(<LoginForm />);
    type('mala');
    submit();
    submit();
    expect(mock).toHaveBeenCalledTimes(1);
    expect(button()).toHaveAttribute('aria-disabled', 'true');
    await act(async () => release(new Response(JSON.stringify({ code: 'ADMIN_INVALID_CREDENTIALS' }), { status: 401 })));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ADMIN_MESSAGES.ADMIN_INVALID_CREDENTIALS as string);
    expect(field().value).toBe('');
    await waitFor(() => expect(field()).toHaveFocus());
    expect(button()).not.toHaveAttribute('aria-disabled', 'true');
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/admin/api/login/');
    expect(JSON.parse(init.body as string)).toEqual({ [['pass', 'word'].join('')]: 'mala' });
  });

  it('T273: a 429 shows the remaining time, blocks the submit until it ends and announces the reopening once', async () => {
    vi.useFakeTimers();
    const mock = stub(() => reply(429, { code: 'ADMIN_LOGIN_LOCKED', retryAfterSeconds: 900 }));
    render(<LoginForm />);
    type('x');
    submit();
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(ADMIN_MESSAGES.ADMIN_LOGIN_LOCKED as string);
    expect(screen.getByText(/15:00/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByText(/14:59/)).toBeInTheDocument();
    type('otra');
    submit();
    expect(mock).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(899_000));
    expect(screen.queryByText(/\d{1,2}:\d{2}/)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Ya puedes intentarlo de nuevo');
    expect(screen.getAllByText(/Ya puedes intentarlo de nuevo/)).toHaveLength(1);
    submit();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('T274: network, offline and timeout give different messages and the form can be retried', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const mock = stub(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<LoginForm />);
    type('x');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(CLIENT_FAILURES.network);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    type('x');
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(CLIENT_FAILURES.offline));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mock.mockImplementation(() => reply(504, { code: 'ADMIN_TIMEOUT' }));
    type('x');
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(ADMIN_MESSAGES.ADMIN_TIMEOUT as string));
    expect(new Set([CLIENT_FAILURES.network, CLIENT_FAILURES.offline, ADMIN_MESSAGES.ADMIN_TIMEOUT]).size).toBe(3);
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it('T275: ?expired=1 shows «Tu sesión caducó» in a status; a valid next is followed on success and a malicious one becomes /admin/', async () => {
    const navigate = vi.fn();
    stub(() => reply(200, { ok: true }));
    const { unmount } = render(<LoginForm expired next="/admin/projects/?a=1" navigate={navigate} />);
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión caducó');
    type('x');
    submit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin/projects/?a=1'));
    unmount();

    render(<LoginForm next="//evil.example.test" navigate={navigate} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    type('x');
    submit();
    await waitFor(() => expect(navigate).toHaveBeenLastCalledWith('/admin/'));
  });
});
