import type { SkillGroup } from '@/lib/api/types';
import styles from './stack-list.module.css';

interface StackListProps {
  groups: SkillGroup[];
  label: string;
}

/** Technology stack grouped by area (extension D7). Groups without keywords are skipped; none → nothing. */
export function StackList({ groups, label }: StackListProps) {
  const visible = groups.filter((group) => group.keywords.length > 0);
  if (visible.length === 0) return null;
  return (
    <div className={styles.stack} role="group" aria-label={label}>
      <p className={`${styles.label} mono`}>{label}</p>
      <ul className={styles.groups}>
        {visible.map((group) => (
          <li key={group.key} className={styles.group}>
            <h3 className={`${styles.name} mono`}>{group.name}</h3>
            <ul className={styles.keywords}>
              {group.keywords.map((keyword, index) => (
                <li key={`${index}|${keyword}`} className={`${styles.keyword} mono`}>
                  {keyword}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
