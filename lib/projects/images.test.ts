// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectsEs } from '@/tests/fixtures/content';
import { clientName, safeLinks } from './display';
import { canShowImage, resolveProjectImages } from './images';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'cv-web-images-'));
  mkdirSync(path.join(dir, 'projects'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const touch = (id: string) => writeFileSync(path.join(dir, 'projects', `${id}.webp`), 'x');

describe('resolveProjectImages', () => {
  it('CO-T32: an own + public project with public/projects/<id>.webp gets its URL', () => {
    touch('proyecto-propio');
    expect(resolveProjectImages(projectsEs, dir)).toEqual({ 'proyecto-propio': '/projects/proyecto-propio.webp' });
  });

  it('CO-T33: an employer or anonymous project never gets an image even when the file exists', () => {
    touch('proyecto-empresa');
    touch('proyecto-anonimo');
    expect(resolveProjectImages(projectsEs, dir)).toEqual({});
    expect(canShowImage(projectsEs[1] as (typeof projectsEs)[number])).toBe(false);
  });

  it('CO-T34: a missing file yields no image; an id that is not a plain slug is never looked up', () => {
    expect(resolveProjectImages(projectsEs, dir)).toEqual({});
    touch('x');
    const odd = { ...(projectsEs[0] as (typeof projectsEs)[number]), id: '../projects/x' };
    expect(resolveProjectImages([odd], dir)).toEqual({});
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
