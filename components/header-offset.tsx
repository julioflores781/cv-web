'use client';

import { useEffect } from 'react';

/**
 * Publishes the real height of the sticky header as `--header-h` on <html>, so `scroll-margin-top` keeps anchors clear of it
 * whatever the breakpoint or language (the header wraps to ~187 px at 390 px). The CSS fallback in globals.css covers the first paint.
 */
export function HeaderOffset({ targetId }: { targetId: string }) {
  useEffect(() => {
    const header = document.getElementById(targetId);
    if (!header) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--header-h', `${header.getBoundingClientRect().height}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(header);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--header-h');
    };
  }, [targetId]);
  return null;
}
