import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Violation {
  path: string;
  code: string;
}

export type FakeFaultMode = '500' | 'silence' | 'invalid-json';

export interface FakeFault {
  mode: FakeFaultMode;
  /** Pause before the fault is applied. */
  latencyMs?: number;
  /** Applies to this many requests, then the operation behaves again. Always, when absent. */
  remaining?: number;
}

/** Stored documents by kind and language: `{ services: { es: {services: [...]}, en: {...} } }`. */
export type AdminSeed = Partial<Record<'services' | 'projects' | 'architecture', Partial<Record<'es' | 'en', Record<string, unknown>>>>>;

export interface AdminFakeOptions {
  /** Password of the single account (default `una frase larga y secreta`). */
  adminPassword?: string;
  /** Milliseconds clock; inject one to age images and expire sessions. */
  clock?: () => number;
  /** `false` answers 503 `IMAGE_STORAGE_UNAVAILABLE` on every image operation. */
  storage?: boolean;
  /** Public origin of the image bucket (default `https://media.example.test`). */
  mediaBase?: string;
  seed?: AdminSeed;
  /** Messages with an extra `ipHash`, which must never be returned. */
  messages?: Array<{ id: number; name: string; email: string; body: string; createdAt: string; ipHash?: string }>;
  maxFailures?: number;
  lockMs?: number;
  sessionMs?: number;
}

export interface ReceivedRequest {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
}

export interface AdminFakeState {
  sessionVersion: number;
  failures: number;
  lockedUntil: number;
  storage: boolean;
  received: ReceivedRequest[];
  content: Map<string, Record<'es' | 'en', { versions: Array<{ version: number; publishedAt: number; source: string; comment: string | null; content: Record<string, unknown> }>; active: number }>>;
  /** `sha256` and `fileName` record what arrived (for tests); the API never returns them. Seeded images may lack them. */
  images: Map<string, { id: string; key: string; contentType: string; bytes: number; width: number; height: number; lastModified: number; sha256?: string; fileName?: string | null }>;
  messages: Array<Record<string, unknown>>;
}

export interface AdminFake {
  /** Answers an admin route or a public read of stored content; resolves `false` (nothing written) for anything else. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  state: AdminFakeState;
  unlock(): void;
  inject(operation: string, fault: FakeFault): void;
  clearFaults(): void;
  setStorage(available: boolean): void;
}

export function createAdminFake(options?: AdminFakeOptions): AdminFake;
export function validateDocument(kind: string, root: string, document: unknown): Violation[];
export function compareParity(kind: string, es: Record<string, unknown> | null, en: Record<string, unknown> | null): Violation[];
export function toPublic(kind: string, document: Record<string, unknown>, mediaBase: string): unknown;
export function fromPublic(kind: string, body: unknown): Record<string, unknown>;
