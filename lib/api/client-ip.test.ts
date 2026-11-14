// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validIp } from './client-ip';

describe('validIp', () => {
  it('T204: accepts one IPv4 or IPv6 address (trimmed) and rejects empty values, text, lists, long values and inner spaces', () => {
    expect(validIp('203.0.113.7')).toBe('203.0.113.7');
    expect(validIp('  2001:db8::1 ')).toBe('2001:db8::1');
    for (const bad of [undefined, null, '', '   ', 'not-an-ip', '203.0.113.7, 198.51.100.1', '203.0.113. 7', `${'1'.repeat(46)}`, '2001:db8::1'.padEnd(60, ' x')]) {
      expect(validIp(bad)).toBeUndefined();
    }
  });
});
