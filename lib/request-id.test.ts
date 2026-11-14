import { describe, expect, it } from 'vitest';
import { newRequestId } from './request-id';

describe('newRequestId', () => {
  it('W5: gives 32 lowercase hex characters, a different one each time', () => {
    const ids = Array.from({ length: 50 }, () => newRequestId());
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(new Set(ids).size).toBe(50);
  });
});
