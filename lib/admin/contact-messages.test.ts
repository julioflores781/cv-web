import { describe, expect, it } from 'vitest';
import { MESSAGES_LIMIT, mailtoHref, messagesUrl, parseCursor } from './contact-messages';

describe('contact messages helpers', () => {
  it('T405 (cursor): only a plain positive integer inside the safe range is a cursor; anything else is ignored', () => {
    expect(parseCursor('40')).toBe(40);
    expect(parseCursor('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    for (const raw of [undefined, '', 'abc', '0', '-1', '+5', '1.5', '1e3', ' 7', '7 ', '0x10', '9007199254740992', '99999999999999999999', ['3', '2'], [], '3&limit=100']) {
      expect(parseCursor(raw), String(raw)).toBeNull();
    }
    expect(MESSAGES_LIMIT).toBe(50);
    expect(messagesUrl(null)).toBe('/admin/messages/');
    expect(messagesUrl(40)).toBe('/admin/messages/?before=40');
  });

  it('T404 (rule): a plain address gives a mailto; anything that could carry headers, spaces or markup gives none', () => {
    expect(mailtoHref('ada@example.test')).toBe('mailto:ada@example.test');
    expect(mailtoHref('ada.lovelace+cv@mail.example.org')).toBe('mailto:ada.lovelace+cv@mail.example.org');
    for (const raw of [
      '',
      'ada',
      'ada@',
      '@example.test',
      'ada@example',
      'ada@example.test?bcc=otra@example.test',
      'ada@example.test&subject=x',
      'ada%0Abcc@example.test',
      'ada @example.test',
      'ada@example.test\nbcc: x@example.test',
      'Ada <ada@example.test>',
      'javascript:alert(1)',
      '"><img src=x onerror=alert(1)>@example.test',
      'a@b@example.test',
      `${'a'.repeat(250)}@example.test`,
    ]) {
      expect(mailtoHref(raw), raw).toBeNull();
    }
  });
});
