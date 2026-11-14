'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Asks for the focus to go to the element with a given DOM id once the next render is on screen: for controls that replace the button that was
 * just pressed («Crear gemelo» swaps itself for the fields it creates), so the focus is never left on a node that is gone.
 */
export function useFocusLater(): (id: string) => void {
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const id = pending.current;
    if (id === null) return;
    pending.current = null;
    document.getElementById(id)?.focus();
  });
  return useCallback((id: string) => {
    pending.current = id;
  }, []);
}
