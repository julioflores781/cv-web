import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ContactMessage } from '@/lib/api/admin';
import { readText, rules } from '@/tests/helpers/css';
import { MessagesList } from './messages-list';

const message = (id: number, extra: Partial<ContactMessage> = {}): ContactMessage => ({
  id,
  name: `Ada Ejemplo ${id}`,
  email: `ada${id}@example.test`,
  body: `Mensaje ficticio ${id}.`,
  createdAt: `2026-11-0${id}T10:00:00Z`,
  ...extra,
});

const items = () => within(screen.getByRole('list', { name: 'Mensajes recibidos' })).getAllByRole('listitem');

describe('MessagesList', () => {
  it('T402 (component): one row per message in the order received, each with id, date (<time dateTime>), name, email and body', () => {
    render(<MessagesList messages={[message(3), message(2), message(1)]} before={null} next={null} />);
    const rows = items();
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => within(row).getByRole('heading', { level: 3 }).textContent)).toEqual(['Ada Ejemplo 3', 'Ada Ejemplo 2', 'Ada Ejemplo 1']);
    const first = rows[0] as HTMLElement;
    expect(within(first).getByText('Id').nextElementSibling).toHaveTextContent('3');
    const time = first.querySelector('time');
    expect(time).toHaveAttribute('dateTime', '2026-11-03T10:00:00Z');
    expect(within(first).getByText('Recibido').nextElementSibling).toContainElement(time);
    expect(within(first).getByText('Email').nextElementSibling).toHaveTextContent('ada3@example.test');
    expect(within(first).getByText('Mensaje ficticio 3.')).toBeInTheDocument();
  });

  it('T403: markup in name, email and body is shown as text and creates no element; line breaks are kept and long strings wrap', () => {
    const script = '<script>window.hacked = true</script>';
    const img = '"><img src=x onerror="window.hacked = true">';
    const body = `Primera línea\nSegunda línea ${script}\n\n${img} ${'x'.repeat(400)}`;
    const { container } = render(
      <MessagesList messages={[message(1, { name: `Ada ${script}`, email: `ada${img}@example.test`, body })]} before={null} next={null} />,
    );
    expect(container.querySelectorAll('script, img, iframe, [onerror]')).toHaveLength(0);
    expect(container.innerHTML).not.toContain('<script');
    expect(container.innerHTML).not.toContain('<img');
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
    const row = items()[0] as HTMLElement;
    expect(within(row).getByRole('heading', { level: 3 })).toHaveTextContent(`Ada ${script}`);
    expect(within(row).getByText('Email').nextElementSibling?.textContent).toBe(`ada${img}@example.test`);
    const text = row.querySelector('[data-part="body"]') as HTMLElement;
    expect(text.textContent).toBe(body); // exactly what was sent, line breaks included
    expect(text.children).toHaveLength(0);
    expect(within(row).queryByRole('link')).toBeNull();

    const css = readText('components/admin/messages.module.css');
    const ruleOf = (selector: string) => rules(css).find((rule) => rule.selector === selector)?.body ?? '';
    expect(ruleOf('.body')).toMatch(/white-space:\s*pre-wrap;/);
    for (const selector of ['.body', '.name', '.facts dd']) expect(ruleOf(selector), selector).toMatch(/overflow-wrap:\s*anywhere;/);
  });

  it('T404: a valid email is a mailto link; an odd one stays plain text', () => {
    render(<MessagesList messages={[message(2), message(1, { email: 'ada@example.test?bcc=otra@example.test' })]} before={null} next={null} />);
    const [valid, odd] = items() as [HTMLElement, HTMLElement];
    const link = within(valid).getByRole('link', { name: 'ada2@example.test' });
    expect(link).toHaveAttribute('href', 'mailto:ada2@example.test');
    expect(link).not.toHaveAttribute('target');
    expect(within(odd).queryByRole('link')).toBeNull();
    expect(within(odd).getByText('ada@example.test?bcc=otra@example.test')).toBeInTheDocument();
  });

  it('T405 (links): with a next cursor there is «Más antiguos» to ?before=<next>; on the last page there is none; a cursor that is not a number gives no link', () => {
    const first = render(<MessagesList messages={[message(3), message(2)]} before={null} next="2" />);
    const nav = screen.getByRole('navigation', { name: 'Páginas de mensajes' });
    expect(within(nav).getByRole('link', { name: 'Más antiguos' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/messages\/?\?before=2$/));
    expect(within(nav).queryByRole('link', { name: 'Volver a los más recientes' })).toBeNull();
    first.unmount();

    const last = render(<MessagesList messages={[message(1)]} before={2} next={null} />);
    expect(screen.queryByRole('link', { name: 'Más antiguos' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Volver a los más recientes' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/messages\/?$/));
    last.unmount();

    const only = render(<MessagesList messages={[message(1)]} before={null} next={null} />);
    expect(screen.queryByRole('navigation', { name: 'Páginas de mensajes' })).toBeNull();
    only.unmount();

    render(<MessagesList messages={[message(1)]} before={null} next={'2&limit=100'} />);
    expect(screen.queryByRole('link', { name: 'Más antiguos' })).toBeNull();
  });

  it('T406 (empty): without messages it says so; past the last page it says there are no older ones and links back', () => {
    const empty = render(<MessagesList messages={[]} before={null} next={null} />);
    expect(screen.getByText('Aún no hay mensajes.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    empty.unmount();

    render(<MessagesList messages={[]} before={999} next={null} />);
    expect(screen.getByText('No hay mensajes más antiguos.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a los más recientes' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/messages\/?$/));
  });

  it('T409 (accessible, stacked): a labelled list with a heading per message and labelled facts; one column on a phone, columns only from 900 px; 44 px targets and visible focus', () => {
    render(<MessagesList messages={[message(2), message(1)]} before={null} next="1" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Mensajes recibidos' })).toBeInTheDocument();
    // The role is explicit (VoiceOver drops it with list-style: none) and the name is announced once: the list has it, the section does not.
    expect(screen.getByRole('list', { name: 'Mensajes recibidos' })).toHaveAttribute('role', 'list');
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.querySelectorAll('[aria-labelledby="mensajes-lista"]')).toHaveLength(1);
    const rows = items();
    for (const row of rows) {
      const article = within(row).getByRole('article');
      expect(article).toHaveAccessibleName(within(row).getByRole('heading', { level: 3 }).textContent as string);
      expect([...row.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['Id', 'Recibido', 'Email']);
      expect(within(row).getByText('Mensaje', { selector: 'h4' })).toBeInTheDocument();
    }

    const css = readText('components/admin/messages.module.css');
    const base = css.slice(0, css.indexOf('@media'));
    expect(base).toMatch(/\.row\s*\{[^}]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/@media \(min-width: 900px\)\s*\{\s*\.row\s*\{[^}]*grid-template-columns:/);
    expect(css).not.toMatch(/max-width:\s*\d+px\)/); // mobile first: nothing is undone for small screens
    expect(css).toMatch(/\.page\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.email\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--ink\)/);
    // Only design tokens: no colour literals.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});
