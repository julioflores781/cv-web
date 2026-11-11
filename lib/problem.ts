/** The parts of an RFC 7807 problem the site relies on. */
export interface ProblemInfo {
  title: string;
  detail: string;
  status: number;
  code: string;
}

/** Returns the problem only when it is complete (title, detail, status and code); anything else is `null`. */
export function parseProblem(raw: unknown): ProblemInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { title, detail, status, code } = raw as Record<string, unknown>;
  if (typeof title !== 'string' || typeof detail !== 'string' || typeof status !== 'number' || typeof code !== 'string') {
    return null;
  }
  return { title, detail, status, code };
}
