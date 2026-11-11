'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface Engagement {
  /** Titles of every service, by position. */
  titles: readonly string[];
  /** `picked[i]` is whether service `i` is marked. */
  picked: readonly boolean[];
  /** Titles of the marked services, in the API order. */
  selected: readonly string[];
  toggle: (index: number) => void;
}

const EngagementContext = createContext<Engagement | null>(null);

interface EngagementProviderProps {
  titles: readonly string[];
  children: ReactNode;
}

/** Selection of services shared by the cards, the «Tu encargo» aside and the contact form. The first service starts marked, as in the design. */
export function EngagementProvider({ titles, children }: EngagementProviderProps) {
  const [picked, setPicked] = useState<readonly boolean[]>(() => titles.map((_, i) => i === 0));
  const toggle = useCallback((index: number) => {
    setPicked((current) => current.map((value, i) => (i === index ? !value : value)));
  }, []);
  const value = useMemo<Engagement>(
    () => ({ titles, picked, selected: titles.filter((_, i) => picked[i]), toggle }),
    [titles, picked, toggle],
  );
  return <EngagementContext.Provider value={value}>{children}</EngagementContext.Provider>;
}

/** The shared selection, or `null` outside the services page (no provider). */
export function useEngagement(): Engagement | null {
  return useContext(EngagementContext);
}

/** For components that only exist inside the provider (cards, aside). */
export function useRequiredEngagement(): Engagement {
  const engagement = useContext(EngagementContext);
  if (!engagement) throw new Error('EngagementProvider is missing');
  return engagement;
}
