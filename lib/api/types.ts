import type { components } from './schema';

export type { Lang } from '@/lib/i18n/config';

type Schemas = components['schemas'];

export type Resume = Schemas['Resume'];
export type Profile = Schemas['Profile'];
export type Contact = Schemas['Contact'];
export type Link = Schemas['Link'];
export type Impact = Schemas['Impact'];
export type Experience = Schemas['Experience'];
export type Period = Schemas['Period'];
export type SkillGroup = Schemas['SkillGroup'];
export type Education = Schemas['Education'];
export type Certificate = Schemas['Certificate'];
export type Course = Schemas['Course'];
export type Qualifications = Schemas['Qualifications'];
export type SpokenLanguage = Schemas['SpokenLanguage'];
export type Problem = Schemas['Problem'];

/** Same shape as the API's schema, with the nullable optionals normalised to `null`. */
export type PortAdapter = Required<Schemas['PortAdapter']> & { note: string | null };
export type ArchitecturePort = Omit<Schemas['ArchitecturePort'], 'adapters' | 'description'> & {
  description: string | null;
  adapters: PortAdapter[];
};
export interface Architecture {
  core: { name: string; description: string | null };
  ports: ArchitecturePort[];
}
export type AdapterStatus = PortAdapter['status'];

/** A service offered; `price: null` means «on request». */
export interface Service {
  id: string;
  title: string;
  summary: string;
  price: { from: number; currency: string } | null;
}

export type ProjectLink = Schemas['ProjectLink'];

/** `client` is only ever set for a `public` project: the parser drops it for an `anonymous` one. */
export interface Project {
  id: string;
  title: string;
  summary: string;
  relation: Schemas['Project']['relation'];
  disclosure: Schemas['Project']['disclosure'];
  role: string | null;
  client: string | null;
  clientLabel: string | null;
  period: Period | null;
  stack: string[];
  highlights: string[];
  links: ProjectLink[];
}

export type ContentSource = 'api' | 'cache';
export type ResumeSource = ContentSource;

export interface ResumeResult {
  resume: Resume;
  source: ResumeSource;
}
