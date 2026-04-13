export interface GitLabGroup {
  id: number;
  full_path: string;
  name: string;
}

export interface GitLabProject {
  id: number;
  path_with_namespace: string;
  name: string;
  path: string;
  web_url: string;
}

const REQUIRED_SCOPES = ['read_api', 'api'];

export const AUTH_ENVIRONMENTS = [
  'development',
  'production',
  'staging',
  'default',
];

export const hasRequiredScope = (tokenScope: string): boolean => {
  const scopes = tokenScope.split(' ');
  return REQUIRED_SCOPES.some(required => scopes.includes(required));
};

export const isValidHost = (host: string): boolean =>
  host.length > 0 &&
  host.length <= 253 &&
  !/[/\\?#\s]/.test(host) &&
  !host.includes('..');

export const isValidSecretsKey = (key: string): boolean =>
  /^[\w.-]+$/.test(key);

const MAX_PAGES = 100;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_AFTER_SECONDS = 10;

/**
 * Fetches all pages from a paginated GitLab API endpoint.
 * Uses the X-Next-Page response header to walk through pages.
 * Guards against infinite loops, malformed headers, and rate limiting
 * with up to MAX_RATE_LIMIT_RETRIES retries per page on HTTP 429.
 */
export async function fetchAllPages<T>(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  for (let pageCount = 0; pageCount < MAX_PAGES; pageCount++) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}page=${page}&per_page=100`;

    let response = await fetch(url, { headers });

    for (
      let attempt = 0;
      attempt < MAX_RATE_LIMIT_RETRIES && response.status === 429;
      attempt++
    ) {
      const raw = parseInt(
        response.headers.get('Retry-After') || '2',
        10,
      );
      const delay = Math.min(isNaN(raw) ? 2 : raw, MAX_RETRY_AFTER_SECONDS);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
      response = await fetch(url, { headers });
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(
        `Unexpected response: expected array, got ${typeof data}`,
      );
    }
    results.push(...(data as T[]));

    const nextPage = response.headers.get('X-Next-Page');
    if (!nextPage) break;
    const parsed = parseInt(nextPage, 10);
    if (isNaN(parsed) || parsed <= page) break;
    page = parsed;
  }

  return results;
}

export function buildRepoUrl(
  host: string,
  groupPath: string,
  repoName: string,
): string {
  return `${host}?owner=${encodeURIComponent(groupPath)}&repo=${encodeURIComponent(repoName)}`;
}

export function parseRepoUrl(
  formData: string,
): { host: string; owner: string; repo: string } | null {
  if (!formData) return null;
  const qIndex = formData.indexOf('?');
  if (qIndex === -1) return null;
  const host = formData.slice(0, qIndex);
  const query = formData.slice(qIndex + 1);
  if (!host || !query) return null;

  const params = new URLSearchParams(query);
  const owner = params.get('owner');
  const repo = params.get('repo');
  if (!owner || !repo) return null;

  return { host, owner, repo };
}
