// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readText, tokensOf } from '@/tests/helpers/css';
import { pdfTheme } from './theme';

const globals = readText('app/globals.css');
const obra = tokensOf(globals, '[data-mode="services"]');
const root = tokensOf(globals, ':root');

describe('PDF theme', () => {
  it('PD-T13: ink, accent, muted and bg are the «obra» tokens of globals.css', () => {
    const hex = (value: string | undefined) => (value ?? '').toUpperCase();
    expect(pdfTheme.ink.toUpperCase()).toBe(hex(obra['--ink']));
    expect(pdfTheme.muted.toUpperCase()).toBe(hex(obra['--muted']));
    expect(pdfTheme.bg.toUpperCase()).toBe(hex(obra['--surface']));
    expect(pdfTheme.accent.toUpperCase()).toBe(hex(root['--accent-obra']));
  });
});
