import type {
  Certificate,
  Contact,
  Course,
  Education,
  Experience,
  Impact,
  Link,
  Period,
  Profile,
  Qualifications,
  Resume,
  SkillGroup,
  SpokenLanguage,
} from './types';

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Optional string: absent/null/undefined are valid; a non-string is not. Returns `false` when invalid. */
function optStr(value: unknown): string | null | undefined | false {
  if (value === undefined || value === null) return value;
  return typeof value === 'string' ? value : false;
}

function list<T>(value: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

/** Copies optional string fields (`key?: string | null`), dropping `undefined`. Returns null if any is invalid. */
function withOptional<K extends string>(
  source: Obj,
  keys: readonly K[],
): { [P in K]?: string | null } | null {
  const out: { [P in K]?: string | null } = {};
  for (const key of keys) {
    const value = optStr(source[key]);
    if (value === false) return null;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function parseProfile(raw: unknown): Profile | null {
  if (!isObj(raw)) return null;
  const name = str(raw.name);
  const label = str(raw.label);
  const optional = withOptional(raw, ['tagline', 'city', 'countryCode', 'summary', 'availability']);
  if (name === null || label === null || optional === null) return null;
  return { name, label, ...optional };
}

function parseLink(raw: unknown): Link | null {
  if (!isObj(raw)) return null;
  const network = str(raw.network);
  const url = str(raw.url);
  return network === null || url === null ? null : { network, url };
}

function parseContact(raw: unknown): Contact | null {
  if (!isObj(raw)) return null;
  const email = str(raw.email);
  const profiles = list(raw.profiles, parseLink);
  return email === null || profiles === null ? null : { email, profiles };
}

function parseImpact(raw: unknown): Impact | null {
  if (!isObj(raw)) return null;
  const value = str(raw.value);
  const text = str(raw.text);
  return value === null || text === null ? null : { value, text };
}

export function parsePeriod(raw: unknown): Period | null {
  if (!isObj(raw)) return null;
  const start = str(raw.start);
  const end = optStr(raw.end);
  if (start === null || end === false || typeof raw.current !== 'boolean') return null;
  return end === undefined ? { start, current: raw.current } : { start, end, current: raw.current };
}

function parsePhase(raw: unknown): { title: string; client?: string | null } | null {
  if (!isObj(raw)) return null;
  const title = str(raw.title);
  const optional = withOptional(raw, ['client']);
  return title === null || optional === null ? null : { title, ...optional };
}

function parseExperience(raw: unknown): Experience | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const company = str(raw.company);
  const position = str(raw.position);
  const period = parsePeriod(raw.period);
  const phases = list(raw.phases, parsePhase);
  const highlights = list(raw.highlights, str);
  const optional = withOptional(raw, ['location', 'summary']);
  if (
    id === null || company === null || position === null || period === null ||
    phases === null || highlights === null || optional === null
  ) {
    return null;
  }
  return { id, company, position, period, phases, highlights, ...optional };
}

function parseSkillGroup(raw: unknown): SkillGroup | null {
  if (!isObj(raw)) return null;
  const key = str(raw.key);
  const name = str(raw.name);
  const keywords = list(raw.keywords, str);
  return key === null || name === null || keywords === null ? null : { key, name, keywords };
}

function parseEducationEntry(raw: unknown): Education | null {
  if (!isObj(raw)) return null;
  const institution = str(raw.institution);
  const optional = withOptional(raw, ['studyType', 'area']);
  return institution === null || optional === null ? null : { institution, ...optional };
}

function parseCertificate(raw: unknown): Certificate | null {
  if (!isObj(raw)) return null;
  const name = str(raw.name);
  const optional = withOptional(raw, ['issuer']);
  return name === null || optional === null ? null : { name, ...optional };
}

function parseCourse(raw: unknown): Course | null {
  if (!isObj(raw)) return null;
  const name = str(raw.name);
  const optional = withOptional(raw, ['issuer']);
  return name === null || optional === null ? null : { name, ...optional };
}

function parseSpokenLanguage(raw: unknown): SpokenLanguage | null {
  if (!isObj(raw)) return null;
  const language = str(raw.language);
  const optional = withOptional(raw, ['fluency']);
  return language === null || optional === null ? null : { language, ...optional };
}

function parseQualifications(raw: unknown): Qualifications | null {
  if (!isObj(raw)) return null;
  const education = list(raw.education, parseEducationEntry);
  const certificates = list(raw.certificates, parseCertificate);
  const courses = list(raw.courses, parseCourse);
  if (education === null || certificates === null || courses === null) return null;
  return { education, certificates, courses };
}

/**
 * Validates an untrusted API payload and projects it onto the known `Resume` fields.
 * Unknown fields (for example a future `phone`) are dropped, so they can never reach the HTML.
 * Returns null when the payload is not a valid resume.
 */
export function parseResume(raw: unknown): Resume | null {
  if (!isObj(raw)) return null;
  const language = raw.language;
  if (language !== 'es' && language !== 'en') return null;
  const profile = parseProfile(raw.profile);
  const contact = parseContact(raw.contact);
  const impact = list(raw.impact, parseImpact);
  const experience = list(raw.experience, parseExperience);
  const skills = list(raw.skills, parseSkillGroup);
  const education = parseQualifications(raw.education);
  const languages = list(raw.languages, parseSpokenLanguage);
  if (
    profile === null || contact === null || impact === null || experience === null ||
    skills === null || education === null || languages === null
  ) {
    return null;
  }
  return {
    language,
    profile,
    contact,
    impact,
    experience,
    skills,
    education,
    languages,
  };
}

export function isResume(raw: unknown): raw is Resume {
  return parseResume(raw) !== null;
}
