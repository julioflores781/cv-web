'use client';

import type { ContentLang, ViolationEntry } from '@/lib/api/admin';
import type { DraftStorage } from '@/lib/admin/content/drafts';
import { addPair, movePair, removePair, updatePair, type ContentView } from '@/lib/admin/content/model';
import { fieldId } from '@/lib/admin/content/paths';
import { newService, normalizeCurrency, servicesModel, type ServicePair, type ServicesDraft, type ServiceText } from '@/lib/admin/content/services';
import { suggestId } from '@/lib/admin/content/slug';
import { LIMITS, type SaveCandidate } from '@/lib/admin/content/validate';
import { UI } from '@/lib/admin/messages';
import { EditorFrame, type EditorContext } from './editor-frame';
import { ItemList } from './item-list';
import { useFocusLater } from './use-focus-later';
import { FieldError, PairedFields, TextField } from './paired-field';
import form from './form.module.css';
import styles from './editor.module.css';

interface ServicesEditorProps {
  initial: ContentView;
  path?: string;
  navigate?: (url: string) => void;
  storage?: DraftStorage | null;
  validate?: (kind: 'services' | 'projects' | 'architecture', candidate: SaveCandidate) => ViolationEntry[];
}

const TEXT = UI.services;
const FIELDS = UI.editor.fields;

function ServiceFields({ pair, context }: { pair: ServicePair; context: EditorContext<ServicesDraft> }) {
  const { draft, update, errors } = context;
  const focusLater = useFocusLater();
  const id = (scope: 'common' | ContentLang, field: string) => fieldId({ itemKey: pair.key, scope, field });
  const error = (scope: 'common' | ContentLang, field: string) => errors.fields[id(scope, field)];
  const change = (field: string, scope: 'common' | ContentLang, apply: (pair: ServicePair) => ServicePair) =>
    update((current) => ({ ...current, items: updatePair(current.items, pair.key, apply) }), id(scope, field));

  const setCommon = (field: string, patch: Partial<ServicePair['common']>) => change(field, 'common', (item) => ({ ...item, common: { ...item.common, ...patch } }));

  const setText = (lang: ContentLang, field: keyof ServiceText, value: string) =>
    change(field, lang, (item) => {
      const own = item[lang];
      if (own === null) return item;
      const next: ServicePair = { ...item, [lang]: { ...own, [field]: value } };
      // A new service gets its id from the Spanish title until the id is typed by hand.
      if (!item.saved && lang === 'es' && field === 'title') {
        const taken = draft.items.filter((other) => other.key !== item.key).map((other) => other.common.id);
        if (item.common.id === '' || item.common.id === suggestId(own.title, taken)) next.common = { ...item.common, id: suggestId(value, taken) };
      }
      return next;
    });

  const side = (lang: ContentLang) => {
    const own = pair[lang];
    if (own === null) {
      return (
        <div className={styles.missing}>
          <p>{UI.editor.missingSide(UI.editor.langs[lang]?.toLowerCase() ?? lang)}</p>
          <button
            type="button"
            className={form.secondary}
            onClick={() => {
              change('title', lang, (item) => servicesModel.twin(item, lang));
              // The button gives way to the new fields: the focus goes to the first of them.
              focusLater(id(lang, 'title'));
            }}
          >
            {UI.editor.parity.twin(UI.editor.langShort[lang] ?? lang)}
          </button>
        </div>
      );
    }
    return (
      <>
        <TextField id={id(lang, 'title')} label={FIELDS.title} value={own.title} max={120} error={error(lang, 'title')} onChange={(value) => setText(lang, 'title', value)} />
        <TextField id={id(lang, 'summary')} label={FIELDS.summary} value={own.summary} max={600} multiline error={error(lang, 'summary')} onChange={(value) => setText(lang, 'summary', value)} />
      </>
    );
  };

  const priceError = error('common', 'price');
  const common = (
    <>
      <TextField
        id={id('common', 'id')}
        label={FIELDS.id}
        value={pair.common.id}
        readOnly={pair.saved}
        hint={pair.saved ? UI.editor.idLocked : UI.editor.idHint}
        error={error('common', 'id')}
        onChange={(value) => setCommon('id', { id: value.toLowerCase() })}
      />
      <div className={styles.check}>
        <input
          id={id('common', 'onRequest')}
          type="checkbox"
          checked={pair.common.onRequest}
          aria-describedby={priceError ? `${id('common', 'price')}-error` : undefined}
          onChange={(event) => setCommon('price', { onRequest: event.target.checked })}
        />
        <label htmlFor={id('common', 'onRequest')}>{TEXT.onRequest}</label>
      </div>
      {priceError ? <FieldError id={`${id('common', 'price')}-error`} code={priceError} /> : null}
      {pair.common.onRequest ? null : (
        <div className={styles.row}>
          <TextField
            id={id('common', 'price.from')}
            label={FIELDS.amount}
            value={pair.common.amount}
            inputMode="decimal"
            hint={TEXT.amountHint}
            error={error('common', 'price.from')}
            onChange={(value) => setCommon('price.from', { amount: value })}
          />
          <TextField
            id={id('common', 'price.currency')}
            label={FIELDS.currency}
            value={pair.common.currency}
            hint={TEXT.currencyHint}
            error={error('common', 'price.currency')}
            onChange={(value) => setCommon('price.currency', { currency: normalizeCurrency(value) })}
          />
        </div>
      )}
    </>
  );

  return <PairedFields common={common} es={side('es')} en={side('en')} />;
}

const hasContent = (pair: ServicePair): boolean =>
  pair.common.id.trim() !== '' || pair.common.amount.trim() !== '' || [pair.es, pair.en].some((own) => own !== null && (own.title.trim() !== '' || own.summary.trim() !== ''));

/** Services: ES/EN pairs with a common id and price, in one document saved at once. */
export function ServicesEditor({ initial, path = '/admin/services/', navigate, storage, validate }: ServicesEditorProps) {
  return (
    <EditorFrame
      model={servicesModel}
      initial={initial}
      path={path}
      {...(navigate ? { navigate } : {})}
      {...(storage !== undefined ? { storage } : {})}
      {...(validate ? { validate } : {})}
    >
      {(context) => (
        <ItemList<ServicePair>
          items={context.draft.items}
          max={LIMITS.services}
          addLabel={TEXT.add}
          emptyText={TEXT.empty}
          limitText={TEXT.limit(LIMITS.services)}
          label={(pair, index) => servicesModel.itemLabel(pair, index)}
          detail={(pair) => pair.common.id}
          hasContent={hasContent}
          errorCount={(key) => context.errors.items[key] ?? 0}
          reveal={context.reveal}
          onAdd={() => {
            const fresh = newService();
            context.update((current) => ({ ...current, items: addPair(current.items, fresh) }));
            return fresh.key;
          }}
          onRemove={(key) => context.update((current) => ({ ...current, items: removePair(current.items, key) }))}
          onMove={(key, delta) => context.update((current) => ({ ...current, items: movePair(current.items, key, delta) }))}
        >
          {(pair) => <ServiceFields pair={pair} context={context} />}
        </ItemList>
      )}
    </EditorFrame>
  );
}
