import { randomUUID } from 'node:crypto';

/** Opaque id (32 hex) that ties a web log line to the API calls of the same request; carries nothing about the visitor. */
export function newRequestId(): string {
  return randomUUID().replaceAll('-', '');
}
