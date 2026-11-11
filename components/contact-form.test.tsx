import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { ContactForm } from './contact-form';
import { ContactSection } from './contact-section';
import { EngagementProvider } from './engagement-provider';
import { ServiceCards } from './service-cards';
import { servicesEs } from '@/tests/fixtures/content';
import { resumeEs } from '@/tests/fixtures/resume';

const API = 'http://api.example.test';
const EMAIL = 'ada@example.test';
const es = getDictionary('es');
const en = getDictionary('en');
const labelsOf = (dict: typeof es, page: 'profile' | 'services' = 'profile') => ({ ...dict.form, message: dict.form.message[page] });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function stubFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  const mock = vi.fn((url: string, init: RequestInit) => handler(url, init));
  vi.stubGlobal('fetch', mock);
  return mock;
}
const created = () => Promise.resolve(new Response(null, { status: 201 }));
const problem = (status: number, code: string, detail = 'detalle de la API') =>
  Promise.resolve(new Response(JSON.stringify({ title: 't', detail, status, code }), { status, headers: { 'Content-Type': 'application/problem+json' } }));
const bodyOf = (mock: ReturnType<typeof stubFetch>) => JSON.parse((mock.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, string>;

const NAME = /^Nombre/;
const field = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const message = () => screen.getByLabelText(/^Mensaje|^Cuéntame/) as HTMLTextAreaElement;
const send = () => screen.getByRole('button', { name: /Enviar|Enviando/ });
const fill = (text = 'Quiero una web de ejemplo') => {
  fireEvent.change(field(NAME), { target: { value: 'Ada' } });
  fireEvent.change(field(/^Email/), { target: { value: EMAIL } });
  fireEvent.change(message(), { target: { value: text } });
};
const submit = () => fireEvent.click(send());

function form(props: { dict?: typeof es; lang?: 'es' | 'en'; page?: 'profile' | 'services' } = {}) {
  const { dict = es, lang = 'es', page = 'profile' } = props;
  return <ContactForm apiUrl={API} lang={lang} email={EMAIL} labels={labelsOf(dict, page)} />;
}

describe('ContactForm structure', () => {
  it('CO-T55: form noValidate method post, three fields with visible labels and autocomplete name/email, and a «Enviar» button', () => {
    const { container } = render(form());
    const element = container.querySelector('form') as HTMLFormElement;
    expect(element).toHaveAttribute('method', 'post');
    expect(element.noValidate).toBe(true);
    expect(field(NAME)).toHaveAttribute('autocomplete', 'name');
    expect(field(/^Email/)).toHaveAttribute('autocomplete', 'email');
    expect(message().tagName).toBe('TEXTAREA');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
  });

  it('CO-T56: the honeypot is an aria-hidden off-screen container with tabindex -1, autocomplete off, neutral name/id, sent as website', async () => {
    const mock = stubFetch(created);
    const { container } = render(form());
    const trap = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    const input = trap.querySelector('input') as HTMLInputElement;
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(`${input.name}${input.id}`).not.toMatch(/website/i);
    expect(input.id).toBe('contact-extra');
    fill();
    submit();
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(bodyOf(mock).website).toBe('');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Mensaje enviado'));
    fill();
    fireEvent.change(input, { target: { value: 'bot' } });
    submit();
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(((mock.mock.calls[1] as [string, RequestInit])[1].body) as string).website).toBe('bot');
  });

  it('CO-T57: the server render has fieldset disabled and a noscript with the notice and the email; after mounting the fieldset is enabled', () => {
    const html = renderToString(form());
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect(html).toContain('<noscript>');
    expect(html).toContain('El formulario necesita JavaScript');
    expect(html).toContain(EMAIL);
    const { container } = render(form());
    expect(container.querySelector('fieldset')).not.toBeDisabled();
  });

  it('CO-T69: the status and alert regions exist from the first render and are empty', () => {
    render(form());
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    expect(renderToString(form())).toMatch(/role="status"[^>]*><\/div>.*role="alert"[^>]*><\/div>/);
  });

  it('CO-T66: typing updates the counter, which is outside any live region and described by the textarea', () => {
    render(form());
    const counter = screen.getByText('0/2000');
    expect(message().getAttribute('aria-describedby')).toContain(counter.id);
    fireEvent.change(message(), { target: { value: 'hola' } });
    expect(screen.getByText('4/2000')).toBe(counter);
    expect(counter.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();
  });
});

describe('ContactForm validation and submit', () => {
  it('CO-T58: an empty submit does not call fetch; each invalid field has aria-invalid and a message by aria-describedby; focus goes to the first', () => {
    const mock = stubFetch(created);
    render(form());
    submit();
    expect(mock).not.toHaveBeenCalled();
    for (const control of [field(NAME), field(/^Email/), message()]) {
      expect(control).toHaveAttribute('aria-invalid', 'true');
      const ids = (control.getAttribute('aria-describedby') ?? '').split(' ');
      expect(ids.some((id) => document.getElementById(id)?.textContent)).toBe(true);
    }
    expect(document.activeElement).toBe(field(NAME));
    fireEvent.change(field(NAME), { target: { value: 'Ada' } });
    expect(field(NAME)).not.toHaveAttribute('aria-invalid');
  });

  it('CO-T59: a valid submit pressed twice makes one call, shows aria-disabled «Enviando…» and keeps the focus', async () => {
    let resolve: (response: Response) => void = () => undefined;
    const mock = stubFetch(() => new Promise<Response>((done) => (resolve = done)));
    render(form());
    fill();
    send().focus();
    submit();
    submit();
    expect(mock).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: 'Enviando…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(busy);
    await act(async () => resolve(new Response(null, { status: 201 })));
  });

  it('CO-T60: a 201 empties the fields, shows the success in role=status and moves the focus there', async () => {
    stubFetch(created);
    render(form());
    fill();
    submit();
    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Mensaje enviado'));
    expect(field(NAME).value).toBe('');
    expect(message().value).toBe('');
    expect(document.activeElement).toBe(status);
    expect(screen.getByRole('button', { name: 'Enviar' })).not.toHaveAttribute('aria-disabled');
  });

  it('CO-T61: a 400 with field email marks that field, focuses it and shows the API detail', async () => {
    stubFetch(() => problem(400, 'CONTACT_INVALID', 'El campo «email» no es válido.'));
    render(form());
    fill();
    submit();
    await waitFor(() => expect(field(/^Email/)).toHaveAttribute('aria-invalid', 'true'));
    expect(document.activeElement).toBe(field(/^Email/));
    expect(document.getElementById(field(/^Email/).getAttribute('aria-describedby') ?? '')).toHaveTextContent('El campo «email» no es válido.');
    expect(field(NAME).value).toBe('Ada');
  });

  it('CO-T62: a 429 shows «demasiados mensajes» in role=alert with focus, keeps the values and does not lock the form', async () => {
    stubFetch(() => problem(429, 'CONTACT_RATE_LIMITED'));
    render(form());
    fill();
    submit();
    const alert = screen.getByRole('alert');
    await waitFor(() => expect(alert).toHaveTextContent(/demasiados mensajes/));
    expect(document.activeElement).toBe(alert);
    expect(message().value).toBe('Quiero una web de ejemplo');
    expect(screen.getByRole('button', { name: 'Enviar' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Enviar' }).closest('fieldset')).not.toBeDisabled();
  });

  it('CO-T63: a network failure says network/blocking when online and «sin conexión» when offline', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const view = render(form());
    fill();
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/red o bloqueo del navegador/));
    view.unmount();
    online.mockReturnValue(false);
    render(form());
    fill();
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no tienes conexión/));
  });

  it('CO-T64: a timeout and an http-error each have their own message and the button stays active to resend the same values', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const mock = stubFetch(
      (_url, init) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))),
    );
    render(form());
    fill();
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/tarda demasiado/);
    expect(screen.getByRole('button', { name: 'Enviar' })).not.toHaveAttribute('aria-disabled');
    vi.useRealTimers();

    mock.mockImplementation(() => Promise.resolve(new Response('<html></html>', { status: 502 })));
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/problema del servidor/));
    expect(mock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(((mock.mock.calls[1] as [string, RequestInit])[1].body) as string)).toMatchObject({ name: 'Ada', email: EMAIL, message: 'Quiero una web de ejemplo' });
  });

  it('CO-T65: every API or network failure includes the mailto of the API email', async () => {
    const cases: Array<() => Promise<Response>> = [
      () => problem(429, 'CONTACT_RATE_LIMITED'),
      () => problem(500, 'UNEXPECTED'),
      () => problem(400, 'CONTACT_INVALID', 'Algo sin campo.'),
      () => problem(400, 'CONTACT_INVALID', 'El campo «name» no es válido.'),
      () => Promise.resolve(new Response(null, { status: 403 })),
      () => Promise.reject(new TypeError('x')),
    ];
    for (const handler of cases) {
      stubFetch(handler);
      const { unmount } = render(form());
      fill();
      submit();
      await waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement());
      const link = within(screen.getByRole('alert')).getByRole('link', { name: EMAIL });
      expect(link).toHaveAttribute('href', `mailto:${EMAIL}`);
      unmount();
    }
  });

  it('CO-T67: no flow touches localStorage, sessionStorage, indexedDB nor document.cookie', async () => {
    const storage = [vi.spyOn(Storage.prototype, 'setItem'), vi.spyOn(Storage.prototype, 'getItem')];
    const cookie = vi.spyOn(Document.prototype, 'cookie', 'set');
    const indexedDB = vi.fn();
    vi.stubGlobal('indexedDB', { open: indexedDB });
    stubFetch(created);
    render(form());
    submit();
    fill();
    submit();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Mensaje enviado'));
    for (const spy of storage) expect(spy).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(indexedDB).not.toHaveBeenCalled();
  });

  it('CO-T68: in English the labels, errors and states come from the EN dictionary and the call carries ?lang=en', async () => {
    const mock = stubFetch(created);
    render(form({ dict: en, lang: 'en' }));
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: EMAIL } });
    fireEvent.change(screen.getByLabelText(/^Message/), { target: { value: 'A message long enough' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect((mock.mock.calls[0] as unknown as [string])[0]).toBe(`${API}/api/v1/contact/messages?lang=en`);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Message sent'));
  });
});

function withServices(lang: 'es' | 'en' = 'es') {
  const dict = lang === 'es' ? es : en;
  const titles = ['A', 'B', 'C'];
  const services = titles.map((title, i) => ({ ...(servicesEs[i % 3] as (typeof servicesEs)[number]), id: `s${i}`, title }));
  return (
    <EngagementProvider titles={titles}>
      <ServiceCards services={services} lang={lang} labels={{ ...dict.services, from: dict.services.priceFrom }} />
      <ContactSection contact={resumeEs.contact} route={{ lang, page: 'services' }} dict={dict} index={4} apiUrl={API} />
    </EngagementProvider>
  );
}
const pick = (title: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));

describe('selection to form', () => {
  it('CO-T35: with 2 services marked the line reads «selección → A + B»; with none «sin bloques marcados»; the profile has no line', () => {
    render(withServices());
    pick('^S-02');
    expect(screen.getByText('selección → A + B')).toBeInTheDocument();
    pick('^S-01');
    pick('^S-02');
    expect(screen.getByText('sin bloques marcados')).toBeInTheDocument();
    const profile = render(<ContactSection contact={resumeEs.contact} route={{ lang: 'es', page: 'profile' }} dict={es} index={4} apiUrl={API} />);
    expect(profile.container.querySelector('[data-probe="selection-line"]')).toBeNull();
  });

  it('CO-T36: with {A, B} and a text the body message is «Servicios de interés: A + B\\n\\ntext» (EN «Services of interest: …»)', async () => {
    const mock = stubFetch(created);
    const view = render(withServices());
    pick('^S-02');
    fill('Quiero una web de ejemplo');
    submit();
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(bodyOf(mock).message).toBe('Servicios de interés: A + B\n\nQuiero una web de ejemplo');
    view.unmount();
    const mockEn = stubFetch(created);
    render(withServices('en'));
    pick('^S-02');
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: EMAIL } });
    fireEvent.change(screen.getByLabelText(/^Tell me/), { target: { value: 'I want an example site' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockEn).toHaveBeenCalledTimes(1));
    expect(bodyOf(mockEn).message).toBe('Services of interest: A + B\n\nI want an example site');
  });

  it('CO-T37: without a selection the message sent is just the text', async () => {
    const mock = stubFetch(created);
    render(withServices());
    pick('^S-01');
    fill('Solo el texto de ejemplo');
    submit();
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(bodyOf(mock).message).toBe('Solo el texto de ejemplo');
  });

  it('CO-T38: a user text of 9 characters with a selection is too-short (the prefix does not count)', () => {
    const mock = stubFetch(created);
    render(withServices());
    fill('m'.repeat(9));
    submit();
    expect(mock).not.toHaveBeenCalled();
    expect(message()).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(`${message().id}-error`)).toHaveTextContent(/mínimo 10/);
  });

  it('CO-T39: a 100-character prefix and a 1950-character text is too-long, and the counter shows the effective maximum 1900', () => {
    const mock = stubFetch(created);
    const title = 'T'.repeat(76);
    render(
      <EngagementProvider titles={[title]}>
        <ContactSection contact={resumeEs.contact} route={{ lang: 'es', page: 'services' }} dict={es} index={4} apiUrl={API} />
      </EngagementProvider>,
    );
    expect(screen.getByText('0/1900')).toBeInTheDocument();
    fill('m'.repeat(1950));
    submit();
    expect(mock).not.toHaveBeenCalled();
    expect(document.getElementById(`${message().id}-error`)).toHaveTextContent(/hasta 1900/);
  });

  it('CO-T40: marking and unmarking services keeps what was typed in the textarea', () => {
    render(withServices());
    fireEvent.change(message(), { target: { value: 'Texto a medias' } });
    pick('^S-02');
    pick('^S-03');
    pick('^S-01');
    expect(message().value).toBe('Texto a medias');
  });
});
