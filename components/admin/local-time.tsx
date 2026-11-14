'use client';

import { useSyncExternalStore } from 'react';

const FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
const noop = () => () => undefined;

/** An instant in Spanish in the browser's own time zone; the server renders the ISO date (no time zone is assumed there). */
export function LocalTime({ value }: { value: string }) {
  const local = useSyncExternalStore(
    noop,
    () => new Intl.DateTimeFormat('es-ES', FORMAT).format(new Date(value)),
    () => value.slice(0, 10),
  );
  return <time dateTime={value}>{local}</time>;
}
