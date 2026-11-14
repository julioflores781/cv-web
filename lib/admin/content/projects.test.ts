import { describe, expect, it } from 'vitest';
import { sample } from '@/tests/helpers/admin-content';
import { canonical, countChanges, diffContent } from './diff';
import { mapViolations } from './paths';
import { canHaveImages, clientRequired, newProject, projectsModel, withDisclosure, withoutImage } from './projects';
import { validateSave } from './validate';

describe('projects model', () => {
  it('T342: the projects sample pairs common = id, relation, disclosure, client, dates, images(key, width, height) and per language title, summary, role, clientLabel, stack, highlights, links, alt; the round trip is identical', () => {
    const es = sample('projects.es');
    const en = sample('projects.en');
    const draft = projectsModel.pair(es, en);
    expect(draft.items).toHaveLength(2);
    const [open, hidden] = draft.items;
    expect(open?.common).toEqual({
      id: 'proyecto-publico',
      relation: 'own',
      disclosure: 'public',
      client: 'Ejemplo S.A.',
      startDate: '2022-01',
      endDate: '',
      images: [{ key: 'site/projects/00000000-0000-4000-8000-000000000001.webp', width: 1280, height: 720 }],
    });
    expect(Object.keys(open?.es ?? {}).sort()).toEqual(['alts', 'clientLabel', 'highlights', 'links', 'role', 'stack', 'summary', 'title']);
    expect(open?.es?.alts).toEqual(['Panel de reservas con la agenda semanal de ejemplo']);
    expect(open?.en?.alts).toEqual(['Sample booking dashboard with the weekly agenda']);
    expect(open?.en?.links).toEqual([{ label: 'See the project', url: 'https://example.com/proyecto' }]);
    expect(hidden?.common).toMatchObject({ relation: 'employer', disclosure: 'anonymous', client: '', startDate: '2019-03', endDate: '2020-11', images: [] });
    expect(hidden?.en?.clientLabel).toBe('sample health insurer');

    const back = projectsModel.serialize(draft);
    expect(canonical(back.es)).toBe(canonical(es));
    expect(canonical(back.en)).toBe(canonical(en));
    expect(countChanges(diffContent('projects', { es, en }, back))).toBe(0);
    expect(validateSave('projects', { comment: '', documents: back })).toEqual([]);
  });

  it('extra: privacy helpers — anonymous empties the client and it stays empty when public again; only own + public take images; removing an image drops its alt in both languages', () => {
    const fresh = newProject();
    expect(fresh.common).toMatchObject({ relation: 'employer', disclosure: 'anonymous', client: '' });
    const named = { ...fresh.common, disclosure: 'public', client: 'Ejemplo S.A.' };
    expect(clientRequired(named)).toBe(true);
    const hidden = withDisclosure(named, 'anonymous');
    expect(hidden.client).toBe('');
    expect(withDisclosure(hidden, 'public').client).toBe('');
    expect(canHaveImages({ relation: 'own', disclosure: 'public' })).toBe(true);
    expect(canHaveImages({ relation: 'own', disclosure: 'anonymous' })).toBe(false);
    expect(canHaveImages({ relation: 'employer', disclosure: 'public' })).toBe(false);

    const [open] = projectsModel.pair(sample('projects.es'), sample('projects.en')).items;
    const stripped = withoutImage(open!, 0);
    expect(stripped.common.images).toEqual([]);
    expect(stripped.es?.alts).toEqual([]);
    expect(stripped.en?.alts).toEqual([]);
    expect(projectsModel.serialize({ items: [stripped] }).es.projects).toEqual([expect.not.objectContaining({ images: expect.anything() })]);
  });

  it('extra: violation paths land on the project fields (common, per language, list rows, the image block and its rows)', () => {
    const draft = projectsModel.pair(sample('projects.es'), sample('projects.en'));
    const [first, second] = draft.items.map((pair) => pair.key);
    const map = mapViolations(projectsModel, draft, [
      { path: 'es.projects[1].links[0].url', code: 'INVALID_URL' },
      { path: 'en.projects[0].images', code: 'IMAGES_NOT_ALLOWED_FOR_PROJECT' },
      { path: 'es.projects[1].client', code: 'CLIENT_REQUIRED' },
      { path: 'en.projects[1].client', code: 'CLIENT_REQUIRED' },
      { path: 'es.projects[0].images[0].alt', code: 'REQUIRED' },
      { path: 'es.projects[0].images[0].key', code: 'IMAGE_KEY_INVALID' },
      { path: 'projects[0].images[0].width', code: 'PARITY_MISMATCH' },
      { path: 'en.projects[0].stack[3]', code: 'TOO_LONG' },
      { path: 'es.projects[0].highlights[2]', code: 'TOO_LONG' },
      { path: 'es.projects[0].links', code: 'TOO_MANY' },
      { path: 'es.projects[0].nope', code: 'UNKNOWN_FIELD' },
    ]);
    expect(map.fields).toEqual({
      [`campo-${second}-es-links-0-url`]: 'INVALID_URL',
      [`campo-${first}-common-images`]: 'IMAGES_NOT_ALLOWED_FOR_PROJECT',
      [`campo-${second}-common-client`]: 'CLIENT_REQUIRED',
      [`campo-${first}-es-images-0-alt`]: 'REQUIRED',
      [`campo-${first}-common-images-0`]: 'IMAGE_KEY_INVALID',
      [`campo-${first}-en-stack`]: 'TOO_LONG',
      [`campo-${first}-es-highlights-2`]: 'TOO_LONG',
      [`campo-${first}-es-links`]: 'TOO_MANY',
    });
    // The ES and EN copies of the common client show once; the unknown field goes to the summary with its item.
    expect(map.entries.filter((entry) => entry.code === 'CLIENT_REQUIRED')).toHaveLength(1);
    expect(map.entries.find((entry) => entry.code === 'UNKNOWN_FIELD')).toMatchObject({ fieldId: null, location: { itemKey: first } });
    expect(projectsModel.fieldLabel('links.0.url')).toBe('URL del enlace 1');
    expect(projectsModel.fieldLabel('images.1.alt')).toBe('Texto alternativo de la imagen 2');
    expect(projectsModel.fieldLabel('highlights.2')).toBe('Logro 3');
    expect(projectsModel.fieldLabel('disclosure')).toBe('Visibilidad');
  });

  it('extra: a draft read back from sessionStorage is checked field by field', () => {
    const draft = projectsModel.pair(sample('projects.es'), sample('projects.en'));
    expect(projectsModel.isDraft(JSON.parse(JSON.stringify(draft)))).toBe(true);
    expect(projectsModel.isDraft({ items: [{ ...draft.items[0], common: { ...draft.items[0]?.common, images: [{ key: 1 }] } }] })).toBe(false);
    expect(projectsModel.isDraft({ items: [{ ...draft.items[0], es: { title: 'x' } }] })).toBe(false);
  });
});
