import type { ReactElement } from 'react';
import type { Architecture } from '@/lib/api/types';
import { buildHexModel } from '@/lib/architecture/model';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { HexOutline } from './hex-outline';
import { HexPlane } from './hex-plane';
import { EmptyState } from './ui/empty-state';
import styles from './hex-plane.module.css';

/** Plane without ports: the central hexagon when the API names a core, and always the empty-state text. No nodes, panel or legend. */
function EmptyPlane({ coreName, dict }: { coreName: string; dict: Dictionary }) {
  return (
    <div className={styles.plane} role="region" aria-label={dict.plane.groupLabel} data-probe="plane-empty">
      {coreName ? (
        <div className={styles.box}>
          <svg className={styles.svg} viewBox="0 0 100 100" aria-hidden="true">
            <HexOutline />
          </svg>
          <div className={`${styles.core} hex`} data-probe="core">
            <span className={`${styles.coreTag} mono`}>{dict.plane.core}</span>
            <span className={`${styles.coreLabel} display`}>{coreName}</span>
          </div>
        </div>
      ) : null}
      <EmptyState>{dict.empty.architecture}</EmptyState>
    </div>
  );
}

/** The hero plane for the API diagram; without anything to draw it is the empty state (the section never disappears). */
export function buildHexPlane(architecture: Architecture | null, dict: Dictionary): ReactElement {
  const model = architecture ? buildHexModel(architecture) : null;
  if (model) return <HexPlane model={model} labels={dict.plane} />;
  return <EmptyPlane coreName={architecture?.core.name.trim() ?? ''} dict={dict} />;
}
