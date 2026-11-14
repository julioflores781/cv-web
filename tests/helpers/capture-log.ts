import { vi } from 'vitest';

export interface LogLine {
  /** `stdout` for info lines, `stderr` for warn and error. */
  stream: 'stdout' | 'stderr';
  /** The line exactly as written. */
  raw: string;
  /** The parsed JSON line. */
  entry: Record<string, unknown>;
}

export interface CapturedLogs {
  /** Every line `logEvent` wrote since the capture started, in order (each is checked to be a single JSON line). */
  lines: () => LogLine[];
  /** All the lines joined, to scan for leaked values. */
  text: () => string;
  /** The parsed entries of one event. */
  events: (event: string) => Array<Record<string, unknown>>;
  restore: () => void;
}

/** Replaces the console methods `logEvent` uses and records what it writes. Call `restore()` (or `vi.restoreAllMocks()`) when done. */
export function captureLogs(): CapturedLogs {
  const written: Array<Pick<LogLine, 'stream' | 'raw'>> = [];
  const spies = [
    vi.spyOn(console, 'info').mockImplementation((raw: unknown) => void written.push({ stream: 'stdout', raw: String(raw) })),
    vi.spyOn(console, 'warn').mockImplementation((raw: unknown) => void written.push({ stream: 'stderr', raw: String(raw) })),
    vi.spyOn(console, 'error').mockImplementation((raw: unknown) => void written.push({ stream: 'stderr', raw: String(raw) })),
  ];
  const lines = (): LogLine[] => written.map((line) => ({ ...line, entry: JSON.parse(line.raw) as Record<string, unknown> }));
  return {
    lines,
    text: () => written.map((line) => line.raw).join('\n'),
    events: (event) => lines().filter((line) => line.entry.event === event).map((line) => line.entry),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}
