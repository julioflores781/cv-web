import type { ReactNode } from 'react';
import type { Contact as ContactData } from '@/lib/api/types';
import { publicProfiles } from '@/lib/contact-links';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { PageId } from '@/lib/i18n/routes';
import { SectionShell } from './ui/section-shell';
import { SectionHead } from './ui/section-head';
import styles from './contact.module.css';

interface ContactProps {
  contact: ContactData;
  page: PageId;
  dict: Dictionary;
  index: number;
  /** Line under the text (the services page shows the picked blocks here). */
  selection?: ReactNode;
  /** The form column. */
  form?: ReactNode;
}

/** Contact section layout: title, text, optional selection line and the public links on the left; the form on the right. */
export function Contact({ contact, page, dict, index, selection = null, form = null }: ContactProps) {
  const { title, text } = dict.contact[page];
  return (
    <SectionShell id="contact" labelledBy="contact-title" alt last probe="contact">
      <SectionHead index={index} label={dict.sections.contact.label} title={title} titleId="contact-title" text={text} large wide>
        {selection}
        <ul className={`${styles.links} mono`}>
          <li>
            <a className={styles.link} href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </li>
          {publicProfiles(contact).map((profile, i) => (
            <li key={`${i}|${profile.href}`}>
              <a className={styles.link} href={profile.href} target="_blank" rel="noopener noreferrer">
                {profile.network}
              </a>
            </li>
          ))}
        </ul>
      </SectionHead>
      {form}
    </SectionShell>
  );
}
