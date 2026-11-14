export const MAX_ID_LENGTH = 64;

/** `Reserva de turnos` -> `reserva-de-turnos`; `Ñandú & Co.` -> `nandu-co`. Always empty or `[a-z0-9]+(-[a-z0-9]+)*`, at most 64 characters. */
export function slugify(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, MAX_ID_LENGTH).replace(/-+$/, '');
}

/** An id for a new item from its title, made unique among `taken` with `-2`, `-3`… (still at most 64 characters). Empty when the title gives nothing. */
export function suggestId(title: string, taken: Iterable<string>): string {
  const base = slugify(title);
  if (base === '') return '';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_ID_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
