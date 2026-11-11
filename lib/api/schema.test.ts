// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(path.resolve(__dirname, 'schema.d.ts'), 'utf8');

describe('generated schema privacy', () => {
  it('T71: schema.d.ts carries no @example lines, e-mail-like strings or URLs', () => {
    expect(schema.split('\n').filter((line) => /@example\b/.test(line))).toEqual([]);
    const withoutTags = schema.replace(/@(description|enum|default|deprecated)\b/g, '');
    expect(withoutTags.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).toEqual([]);
    expect(schema.match(/https?:\/\//g) ?? []).toEqual([]);
  });

  it('T72 / HX-T5: generate:api runs scripts/generate-api.mjs, which strips the examples before replacing the schema', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['generate:api']).toContain('scripts/generate-api.mjs');
    const script = readFileSync(path.resolve(__dirname, '../../scripts/generate-api.mjs'), 'utf8');
    expect(script).toMatch(/import \{ stripExamples \} from '\.\/strip-examples\.mjs'/);
    expect(script).toContain('stripExamples(');
  });
});

describe('generated schema content', () => {
  it('HX-T1: schema.d.ts has the 5 paths of the site and the architecture, service and project schemas', () => {
    for (const route of ['resume', 'contact/messages', 'services', 'projects', 'architecture']) {
      expect(schema, route).toContain(`"/api/v1/${route}": {`);
    }
    for (const name of ['Architecture', 'ArchitecturePort', 'PortAdapter', 'Service', 'Project']) {
      expect(schema, name).toMatch(new RegExp(`^\\s+${name}: \\{`, 'm'));
    }
  });
});
