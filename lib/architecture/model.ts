import type { AdapterStatus, Architecture } from '@/lib/api/types';
import { MAX_RADIAL, SLOTS } from './slots';

export interface HexAdapter {
  name: string;
  status: AdapterStatus;
  note: string | null;
}

export interface HexPort {
  name: string;
  description: string | null;
  adapters: HexAdapter[];
}

export interface HexModel {
  core: { name: string };
  ports: HexPort[];
  layout: 'radial' | 'list';
  /** Plane position of each port (`radial` only). */
  slots: readonly number[];
}

function clean(text: string | null): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Projects the API diagram onto what the plane draws: ports without adapters and adapters without a name are dropped,
 * texts are trimmed and the API order is kept. `null` when nothing is left to draw. The API ids never reach the DOM.
 */
export function buildHexModel(architecture: Architecture): HexModel | null {
  const ports: HexPort[] = [];
  for (const port of architecture.ports) {
    const name = port.name.trim();
    const adapters: HexAdapter[] = [];
    for (const adapter of port.adapters) {
      const adapterName = adapter.name.trim();
      if (adapterName) adapters.push({ name: adapterName, status: adapter.status, note: clean(adapter.note) });
    }
    if (name && adapters.length > 0) ports.push({ name, description: clean(port.description), adapters });
  }
  if (ports.length === 0) return null;
  const radial = ports.length <= MAX_RADIAL;
  return {
    core: { name: architecture.core.name.trim() },
    ports,
    layout: radial ? 'radial' : 'list',
    slots: radial ? (SLOTS[ports.length] ?? []) : [],
  };
}
