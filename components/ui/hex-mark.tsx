import styles from './ui.module.css';

interface HexMarkProps {
  probe?: string;
  children: string;
}

/** The 38x44 hexagon with the initials (decorative: the link around it carries the name). */
export function HexMark({ probe, children }: HexMarkProps) {
  return (
    <span className={`${styles.hexMark} hex display`} data-probe={probe} aria-hidden="true">
      {children}
    </span>
  );
}
