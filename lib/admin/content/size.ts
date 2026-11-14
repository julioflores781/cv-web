/** Largest body the API takes for one save (`CONTENT_TOO_LARGE` above it). */
export const MAX_SAVE_BYTES = 98_304;

/** UTF-8 size of a body exactly as `JSON.stringify` sends it. */
export const jsonBytes = (body: unknown): number => new TextEncoder().encode(JSON.stringify(body)).length;

export const fitsSave = (body: unknown): boolean => jsonBytes(body) <= MAX_SAVE_BYTES;
