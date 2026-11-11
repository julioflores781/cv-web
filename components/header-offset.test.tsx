import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderOffset } from './header-offset';

type Callback = () => void;

describe('HeaderOffset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('BA-T53: --header-h follows the real header height (73 px desktop, 187 px mobile) and is removed on unmount', () => {
    let height = 73;
    let notify: Callback = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: Callback) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const header = document.createElement('header');
    header.id = 'site-header';
    header.getBoundingClientRect = () => ({ height }) as DOMRect;
    document.body.append(header);

    const { unmount } = render(<HeaderOffset targetId="site-header" />);
    expect(document.documentElement.style.getPropertyValue('--header-h')).toBe('73px');
    height = 187;
    notify();
    expect(document.documentElement.style.getPropertyValue('--header-h')).toBe('187px');
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--header-h')).toBe('');
  });
});
