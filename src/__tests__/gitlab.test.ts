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
      status: 500,
      statusText: 'Forbidden',
      headers: new Headers(),
    });

    await expect(
      fetchAllPages('https://api.test/items', {}),
    ).rejects.toThrow('Failed to fetch: Forbidden');
  });

  it('throws when response is not an array', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'error' }),
      headers: new Headers(),
    });

    await expect(
      fetchAllPages('https://api.test/items', {}),
    ).rejects.toThrow('Unexpected response: expected array');
  });

  it('stops when X-Next-Page is NaN', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 1 }]),
      headers: new Headers({ 'X-Next-Page': 'abc' }),
    });

    const result = await fetchAllPages('https://api.test/items', {});
    expect(result).toEqual([{ id: 1 }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('stops when X-Next-Page does not advance', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 1 }]),
      headers: new Headers({ 'X-Next-Page': '1' }),
    });

    const result = await fetchAllPages('https://api.test/items', {});
    expect(result).toEqual([{ id: 1 }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('stops after a bounded number of pages to prevent infinite loops', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: callCount }]),
        headers: new Headers({ 'X-Next-Page': String(callCount + 1) }),
      });
    });

    const result = await fetchAllPages('https://api.test/items', {});
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(callCount).toBeLessThanOrEqual(100);
  });

  it('retries once on 429 rate limit', async () => {
    const items = [{ id: 1 }];
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '0' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(items),
        headers: new Headers(),
      });

    const result = await fetchAllPages('https://api.test/items', {});
    expect(result).toEqual(items);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws if 429 persists after retry', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'Retry-After': '0' }),
    });

    await expect(
      fetchAllPages('https://api.test/items', {}),
    ).rejects.toThrow('Failed to fetch: Too Many Requests');
    expect(global.fetch).toHaveBeenCalledTimes(2);
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
