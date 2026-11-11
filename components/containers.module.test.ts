import { describe, expect, it } from 'vitest';
import { readText, rules } from '@/tests/helpers/css';

// PA-D: in the v2 artifact the 1280px containers have the default `content-box` (no global reset): 1280px of content
// plus 24px of padding per side, 1328px in total, so the content starts at x=80 at 1440px.
const CONTAINERS: Array<[file: string, selector: string]> = [
  ['components/site-header.module.css', '.nav'],
  ['components/hero.module.css', '.inner'],
  ['components/cajetin.module.css', '.list'],
  ['components/impact-band.module.css', '.list'],
  ['components/ui/ui.module.css', '.inner'],
  ['components/site-footer.module.css', '.inner'],
];

// Bordered controls with a min-height are content-box in the design too: 52px + 2px border = 54px, 48px + 2px = 50px.
const CONTROLS: Array<[file: string, selector: string]> = [
  ['components/ui/ui.module.css', '.ctaOutline'],
  ['components/contact-form.module.css', '.field'],
  ['components/engagement-aside.module.css', '.aside'],
];

describe('page containers', () => {
  it.each(CONTAINERS)('PA: %s %s is a content-box 1280px container', (file, selector) => {
    const body = rules(readText(file)).find((rule) => rule.selector === selector)?.body ?? '';
    expect(body).toMatch(/max-width:\s*1280px/);
    expect(body).toMatch(/box-sizing:\s*content-box/);
  });

  it.each(CONTROLS)('PA: %s %s is content-box', (file, selector) => {
    const body = rules(readText(file)).find((rule) => rule.selector === selector)?.body ?? '';
    expect(body).toMatch(/box-sizing:\s*content-box/);
  });

  it('PA: the timeline and layers columns carry their frame in the flex basis (549px and 570px), as the content-box design does', () => {
    const ui = rules(readText('components/ui/ui.module.css'));
    expect(ui.find((rule) => rule.selector === '.bodyRuled')?.body).toMatch(/flex-basis:\s*549px/);
    expect(ui.find((rule) => rule.selector === '.bodyBoxed')?.body).toMatch(/flex-basis:\s*570px/);
  });
});
