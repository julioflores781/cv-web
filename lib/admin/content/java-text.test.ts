import { describe, expect, it } from 'vitest';
import { isHttpsUrl, isJavaBlank, javaStrip } from './java-text';

// Expected values were produced by Java 21 (`String.isBlank()`, `strip()` and `new java.net.URI(text)` with an https scheme and a host), the rule
// of the API's `ContentValidator`; a 200 000-case random comparison against Java found no difference (see the impl.md of web-admin-projects).
describe('Java text rules', () => {
  it('extra: blank and strip follow Character.isWhitespace (non-breaking spaces and U+FEFF are text; U+001C–U+001F and U+3000 are blank)', () => {
    for (const blank of ['', ' ', '\t\n', '\u001c', '\u001f', '　', ' ', ' ', '  \u001d']) expect(isJavaBlank(blank), JSON.stringify(blank)).toBe(true);
    for (const text of [' ', ' ', ' ', '﻿', '\u0085', '​', ' a ']) expect(isJavaBlank(text), JSON.stringify(text)).toBe(false);
    expect(javaStrip(' \u001fa　')).toBe('a');
    expect(javaStrip(' a ')).toBe(' a ');
    expect(javaStrip('﻿a')).toBe('﻿a');
  });

  it('extra: https links are what java.net.URI accepts with scheme https and a host', () => {
    const valid = [
      'https://example.test',
      'HTTPS://EXAMPLE.TEST/Ruta',
      'https://example.test:8443/a?b=[c]#frag',
      'https://user@example.test/',
      'https://u:p@example.test',
      'https://192.168.0.1/',
      'https://123/',
      'https://example.test/ruta/ñandú',
      'https://example.test./',
      'https://X-Y.Z/',
      'https://[::1]/',
      'https://[::ffff:1.2.3.4]/',
      'https://[1:2:3:4:5:6:7:8]/',
      'https://[fe80::1%25eth0]/',
      'https://example.test:/',
      'https://example.test/%2F',
      'https://example.test/﻿',
      'https://example.test?q#f',
      'https://a.test/\u{1f600}',
      `https://example.test/${'a'.repeat(279)}`,
    ];
    const invalid = [
      'http://example.test',
      'ftp://x.test',
      'https://ex_ample.test/',
      'https://ejemplo.españa.test/',
      'https://example.test/a|b',
      'https://example.test/%zz',
      'https://x.test/%a',
      'https://example.test#a#b',
      'https://example.test/a\\b',
      'https://x.test/a"b',
      'https://x.test/{}',
      'https://-a.test/',
      'https://a-.test/',
      'https://a..b/',
      'https://1.2.3/',
      'https://256.1.1.1/',
      'https://a.1b/',
      'https:/example.test',
      'https:example.test',
      'https://',
      'https:///x',
      'https://a@b@c.test',
      'https://example.test:99999999999/',
      'https://x.test:8a/',
      'https://[::g]/',
      'https://[1:2:3:4:5:6:7:8:9]/',
      'https://exa mple.test',
      'https://a.test/ ',
      'https://exa mple.test',
      `https://example.test/${'a'.repeat(280)}`,
    ];
    for (const url of valid) expect(isHttpsUrl(url), url).toBe(true);
    for (const url of invalid) expect(isHttpsUrl(url), url).toBe(false);
  });
});
