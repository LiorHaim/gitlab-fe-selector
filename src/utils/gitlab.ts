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

/**
 * Fetches all pages from a paginated GitLab API endpoint.
 * Uses the X-Next-Page response header to walk through pages.
 */
export async function fetchAllPages<T>(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const response = await fetch(
      `${baseUrl}${separator}page=${page}&per_page=100`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const data = (await response.json()) as T[];
    results.push(...data);

    const nextPage = response.headers.get('X-Next-Page');
    if (!nextPage) break;
    page = parseInt(nextPage, 10);
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
  const [host, query] = formData.split('?');
  if (!host || !query) return null;

  const params = new URLSearchParams(query);
  const owner = params.get('owner');
  const repo = params.get('repo');
  if (!owner || !repo) return null;

  return { host, owner, repo };
}
