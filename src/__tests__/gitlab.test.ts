import {
  hasRequiredScope,
  buildRepoUrl,
  parseRepoUrl,
  fetchAllPages,
  AUTH_ENVIRONMENTS,
} from '../utils/gitlab';

// --- hasRequiredScope ---

describe('hasRequiredScope', () => {
  it('returns true for read_api', () => {
    expect(hasRequiredScope('read_api')).toBe(true);
  });

  it('returns true for api', () => {
    expect(hasRequiredScope('api')).toBe(true);
  });

  it('returns true when read_api is among multiple scopes', () => {
    expect(hasRequiredScope('read_user read_api openid')).toBe(true);
  });

  it('returns false when no required scope is present', () => {
    expect(hasRequiredScope('read_user read_repository')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasRequiredScope('')).toBe(false);
  });

  it('does not partial-match (e.g. "read_api_v2" should not match)', () => {
    expect(hasRequiredScope('read_api_v2')).toBe(false);
  });
});

// --- buildRepoUrl / parseRepoUrl round-trip ---

describe('buildRepoUrl', () => {
  it('produces the expected format', () => {
    expect(buildRepoUrl('gitlab.com', 'my-org/team', 'my-app')).toBe(
      'gitlab.com?owner=my-org%2Fteam&repo=my-app',
    );
  });

  it('handles special characters in group path', () => {
    const url = buildRepoUrl('gitlab.example.com', 'org/sub group', 'repo');
    expect(url).toContain('owner=org%2Fsub%20group');
  });
});

describe('parseRepoUrl', () => {
  it('parses a valid URL', () => {
    expect(
      parseRepoUrl('gitlab.com?owner=my-org%2Fteam&repo=my-app'),
    ).toEqual({ host: 'gitlab.com', owner: 'my-org/team', repo: 'my-app' });
  });

  it('returns null for empty string', () => {
    expect(parseRepoUrl('')).toBeNull();
  });

  it('returns null when query string is missing', () => {
    expect(parseRepoUrl('gitlab.com')).toBeNull();
  });

  it('returns null when owner is missing', () => {
    expect(parseRepoUrl('gitlab.com?repo=my-app')).toBeNull();
  });

  it('returns null when repo is missing', () => {
    expect(parseRepoUrl('gitlab.com?owner=grp')).toBeNull();
  });
});

describe('buildRepoUrl ↔ parseRepoUrl round-trip', () => {
  it('round-trips correctly', () => {
    const host = 'gitlab.example.com';
    const owner = 'org/sub/deep';
    const repo = 'my-service';
    const url = buildRepoUrl(host, owner, repo);
    expect(parseRepoUrl(url)).toEqual({ host, owner, repo });
  });
});

// --- fetchAllPages ---

describe('fetchAllPages', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches a single page when X-Next-Page is absent', async () => {
    const items = [{ id: 1 }, { id: 2 }];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(items),
      headers: new Headers(),
    });

    const result = await fetchAllPages('https://api.test/items', {});
    expect(result).toEqual(items);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('fetches multiple pages using X-Next-Page header', async () => {
    const page1 = [{ id: 1 }];
    const page2 = [{ id: 2 }];

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(page1),
        headers: new Headers({ 'X-Next-Page': '2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(page2),
        headers: new Headers(),
      });

    const result = await fetchAllPages('https://api.test/items?filter=x', {});
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      statusText: 'Forbidden',
      headers: new Headers(),
    });

    await expect(
      fetchAllPages('https://api.test/items', {}),
    ).rejects.toThrow('Failed to fetch: Forbidden');
  });
});

// --- AUTH_ENVIRONMENTS ---

describe('AUTH_ENVIRONMENTS', () => {
  it('tries development first', () => {
    expect(AUTH_ENVIRONMENTS[0]).toBe('development');
  });

  it('contains the four expected environments', () => {
    expect(AUTH_ENVIRONMENTS).toEqual([
      'development',
      'production',
      'staging',
      'default',
    ]);
  });
});
