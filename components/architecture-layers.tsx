import type { Dictionary } from '@/lib/i18n/dictionaries';
import styles from './architecture-layers.module.css';

interface ArchitectureLayersProps {
  dict: Dictionary;
}

/** Section A–A′ of the hexagon: adapters, ports and domain, from the outside in. */
export function ArchitectureLayers({ dict }: ArchitectureLayersProps) {
  const { label, adapters, ports, domain } = dict.layers;
  return (
    <div className={styles.layers} role="group" aria-label={label} data-probe="layers">
      <div className={styles.row} data-layer="adapters">
        <span className={`${styles.tag} ${styles.tagAdapters} mono`}>{adapters.tag}</span>
        <div className={styles.text}>
          <h3 className={`${styles.title} display`} data-probe="layers-title">
            {adapters.title}
          </h3>
          <p className={styles.copy}>{adapters.text}</p>
        </div>
      </div>
      <div className={styles.middle} data-layer="ports" data-probe="layers-mid">
        <div className={styles.row}>
          <span className={`${styles.tag} ${styles.tagPorts} mono`}>{ports.tag}</span>
          <div className={styles.text}>
            <h3 className={`${styles.title} display`}>{ports.title}</h3>
            <p className={styles.copy}>{ports.text}</p>
          </div>
        </div>
        <div className={styles.core} data-layer="domain" data-probe="layers-core">
          <span className={`${styles.tag} ${styles.tagDomain} ${styles.coreTag} mono`}>{domain.tag}</span>
          <div className={styles.text}>
            <h3 className={`${styles.title} ${styles.coreTitle} display`} data-probe="layers-core-title">
              {domain.title}
            </h3>
            <p className={`${styles.copy} ${styles.coreCopy}`}>{domain.text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
