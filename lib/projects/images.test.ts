// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Project } from '@/lib/api/types';
import { projectsEs, sampleImage } from '@/tests/fixtures/content';
import { clientName, safeLinks } from './display';
import { canShowImage, coverOf } from './images';

const [own, employer, anonymous] = projectsEs as [Project, Project, Project];
const withImages = (project: Project, ...images: Project['images']): Project => ({ ...project, images });

describe('coverOf', () => {
  it('T413 (CO-T32): an own + public project gets its first image as the cover, with its url, alt and size', () => {
    const cover = coverOf(withImages(own, sampleImage(1), sampleImage(2)));
    expect(cover).toEqual({ ...sampleImage(1), url: new URL(sampleImage(1).url).toString() });
    expect(canShowImage(own)).toBe(true);
  });

  it('T413 (CO-T33): an employer or anonymous project never gets a cover, even if its props carry images', () => {
    for (const project of [employer, anonymous, { ...own, disclosure: 'anonymous' as const }, { ...own, relation: 'employer' as const }]) {
      expect(coverOf(withImages(project, sampleImage(1))), project.id).toBeUndefined();
    }
    expect(canShowImage(employer)).toBe(false);
  });

  it('T413 (CO-T34): no images, or a first image whose url is not absolute https (plain http included), give no cover (no fallback to the next one)', () => {
    expect(coverOf(own)).toBeUndefined();
    for (const url of [
      'http://media.example.test/a.webp',
      'HTTP://media.example.test/a.webp',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '/projects/proyecto-propio.webp',
      'media.example.test/a.webp',
      '//media.example.test/a.webp',
      'ftp://media.example.test/a.webp',
      '',
    ]) {
      expect(coverOf(withImages(own, { ...sampleImage(1), url }, sampleImage(2))), url).toBeUndefined();
    }
    expect(coverOf(withImages(own, { ...sampleImage(1), url: 'HTTPS://media.example.test/a.webp' }))?.url).toBe('https://media.example.test/a.webp');
  });

  it('extra: a url with credentials is refused (it could smuggle a user:password into the HTML)', () => {
    expect(coverOf(withImages(own, { ...sampleImage(1), url: 'https://user:pw@media.example.test/a.webp' }))).toBeUndefined();
  });
});

describe('project display helpers', () => {
  it('extra: clientName prefers the real client only for public projects; safeLinks drops non-http URLs', () => {
    expect(clientName({ disclosure: 'public', client: 'A', clientLabel: 'B' })).toBe('A');
    expect(clientName({ disclosure: 'public', client: null, clientLabel: 'B' })).toBe('B');
    expect(clientName({ disclosure: 'anonymous', client: 'A', clientLabel: 'B' })).toBe('B');
    expect(clientName({ disclosure: 'anonymous', client: 'A', clientLabel: null })).toBeNull();
    expect(safeLinks([{ label: 'a', url: 'https://x.test' }, { label: 'b', url: 'javascript:alert(1)' }])).toEqual([
      { label: 'a', href: 'https://x.test/' },
    ]);
  });
});
