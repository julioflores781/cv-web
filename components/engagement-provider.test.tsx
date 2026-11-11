import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { EngagementProvider, useEngagement } from './engagement-provider';

const wrapper = ({ children }: { children: ReactNode }) => <EngagementProvider titles={['A', 'B', 'C']}>{children}</EngagementProvider>;

describe('EngagementProvider', () => {
  it('extra: the first service starts marked, toggle flips by position and selected keeps the API order', () => {
    const { result } = renderHook(() => useEngagement(), { wrapper });
    expect(result.current?.selected).toEqual(['A']);
    act(() => result.current?.toggle(2));
    act(() => result.current?.toggle(0));
    expect(result.current?.picked).toEqual([false, false, true]);
    act(() => result.current?.toggle(1));
    expect(result.current?.selected).toEqual(['B', 'C']);
  });

  it('extra: without a provider the hook returns null (the profile page has no selection)', () => {
    const { result } = renderHook(() => useEngagement());
    expect(result.current).toBeNull();
  });
});
