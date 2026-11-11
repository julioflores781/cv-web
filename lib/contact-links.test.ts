// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { publicProfiles } from './contact-links';

describe('publicProfiles', () => {
  it('BA-T40: keeps only LinkedIn and GitHub (any letter case) with a safe http(s) URL, in the original order', () => {
    const contact = {
      email: 'ada@example.test',
      profiles: [
        { network: 'github', url: 'https://github.com/ada-ejemplo' },
        { network: 'Twitter', url: 'https://twitter.example.test/ada' },
        { network: 'LINKEDIN', url: 'https://www.linkedin.com/in/ada-ejemplo' },
        { network: 'GitHub', url: 'javascript:alert(1)' },
        { network: ' LinkedIn ', url: 'not a url' },
        { network: 'LinkedIn', url: 'data:text/html,x' },
      ],
    };
    expect(publicProfiles(contact)).toEqual([
      { network: 'github', href: 'https://github.com/ada-ejemplo' },
      { network: 'LINKEDIN', href: 'https://www.linkedin.com/in/ada-ejemplo' },
    ]);
  });

  it('extra: no profiles gives an empty list', () => {
    expect(publicProfiles({ email: 'ada@example.test', profiles: [] })).toEqual([]);
  });
});
