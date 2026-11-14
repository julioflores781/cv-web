import Link from 'next/link';
import { mailtoHref, messagesUrl, parseCursor } from '@/lib/admin/contact-messages';
import { UI } from '@/lib/admin/messages';
import type { ContactMessage } from '@/lib/api/admin';
import { LocalTime } from './local-time';
import editor from './editor.module.css';
import styles from './messages.module.css';

const T = UI.messages;

export interface MessagesListProps {
  /** One page, in the order of the API (newest first). */
  messages: readonly ContactMessage[];
  /** Cursor this page was asked with; `null` on the newest page. */
  before: number | null;
  /** `next` of the API: the cursor of the following page, or `null` on the last one. */
  next: string | null;
}

/**
 * Read-only list of contact messages. Everything a visitor wrote (name, email, text) is rendered as a React text node, never as markup;
 * the only link made from it is a `mailto:` of an address that passes `mailtoHref`. No client code: paging is plain links.
 */
export function MessagesList({ messages, before, next }: MessagesListProps) {
  const older = parseCursor(next);
  return (
    // The heading names the list (announced once, with its size); the section is only a wrapper, not a second landmark with the same name.
    <section className={styles.section}>
      <h2 id="mensajes-lista" className={styles.heading}>
        {T.listTitle}
      </h2>
      {messages.length === 0 ? (
        <p className={editor.empty}>{before === null ? T.empty : T.noOlder}</p>
      ) : (
        // `list-style: none` makes Safari/VoiceOver drop the list semantics unless the role is explicit.
        <ul role="list" className={styles.rows} aria-labelledby="mensajes-lista">
          {messages.map((message) => {
            const mailto = mailtoHref(message.email);
            const titleId = `mensaje-${message.id}`;
            return (
              <li key={message.id}>
                <article className={styles.row} aria-labelledby={titleId}>
                  <h3 id={titleId} className={styles.name}>
                    {message.name}
                  </h3>
                  <dl className={styles.facts}>
                    <dt>{T.id}</dt>
                    <dd className="mono">{message.id}</dd>
                    <dt>{T.received}</dt>
                    <dd>
                      <LocalTime value={message.createdAt} />
                    </dd>
                    <dt>{T.email}</dt>
                    <dd>
                      {mailto ? (
                        <a className={styles.email} href={mailto}>
                          {message.email}
                        </a>
                      ) : (
                        message.email
                      )}
                    </dd>
                  </dl>
                  <div className={styles.text}>
                    <h4 className={styles.label}>{T.body}</h4>
                    <p className={styles.body} data-part="body">
                      {message.body}
                    </p>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
      {before !== null || older !== null ? (
        <nav aria-label={T.pages}>
          <ul className={styles.pages}>
            {before !== null ? (
              <li>
                <Link className={styles.page} href={messagesUrl(null)}>
                  {T.newest}
                </Link>
              </li>
            ) : null}
            {older !== null ? (
              <li>
                <Link className={styles.page} href={messagesUrl(older)}>
                  {T.older}
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}
