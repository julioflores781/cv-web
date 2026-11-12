// Character classes keep this file from matching its own patterns.
const TOKEN_PATTERN = /gh[p]_|AKI[A]|-----BEGI[N]|xo[x][bp]-/;
const KEY_PATTERN = /\b(?:password|secret):[ \t]*(.*)$/i;
const SECRET_REFERENCE = /^\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}$/;

function isAllowedValue(raw: string): boolean {
  const value = raw.trim().replace(/^['"]|['"]$/g, '');
  return value === '' || value.startsWith('CAMBIA-') || SECRET_REFERENCE.test(value);
}

/** True when the text holds a known token shape or a password or SECRET key with a literal value. */
export function containsSecret(content: string): boolean {
  if (TOKEN_PATTERN.test(content)) return true;
  return content.split('\n').some((line) => {
    const match = KEY_PATTERN.exec(line);
    return match !== null && !isAllowedValue(match[1] as string);
  });
}
