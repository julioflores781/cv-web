import type { ReactElement } from 'react';
import type { Architecture } from '@/lib/api/types';
import { buildHexModel } from '@/lib/architecture/model';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { HexPlane } from './hex-plane';

/** The hero plane for the API diagram, or `null` when there is nothing to draw (the hero then has one column). */
export function buildHexPlane(architecture: Architecture, dict: Dictionary): ReactElement | null {
  const model = buildHexModel(architecture);
  return model ? <HexPlane model={model} labels={dict.plane} /> : null;
}
