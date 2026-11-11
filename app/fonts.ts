import localFont from 'next/font/local';

// Static latin woff2 files copied from @fontsource/*@5.3.0 (identity checked by app/fonts.test.ts).
// `globals.css` composes these faces into `--font-head|text|mono` with their fallbacks.

const head = localFont({
  src: [
    { path: './fonts/barlow-condensed-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/barlow-condensed-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--face-head',
  display: 'swap',
});

const text = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--face-text',
  display: 'swap',
});

const mono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--face-mono',
  display: 'swap',
});

/** Class names that define the three font variables; goes on `<html>`. */
export const fontVariables = [head.variable, text.variable, mono.variable].join(' ');
