// Minimal GitHub REST client for writing sighting files. Needs a fine-grained token with
// "Contents: read and write" and "Pull requests: read and write" on the repository.

const REPO = process.env.GITHUB_REPO ?? 'Rassl/usejev';
const BRANCH = process.env.GITHUB_BRANCH ?? 'main';
const DIR = 'src/content/sightings';

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new GitHubError(500, 'GITHUB_TOKEN is not configured');
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'usejev-posting-api',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new GitHubError(res.status, `GitHub ${init.method ?? 'GET'} ${path}: ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function fileExists(id: string, ref = BRANCH): Promise<boolean> {
  try {
    await gh(`/contents/${DIR}/${id}.json?ref=${encodeURIComponent(ref)}`);
    return true;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return false;
    throw e;
  }
}

const encode = (data: unknown) => Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64');

export async function commitFile(id: string, data: unknown, message: string, branch = BRANCH) {
  const out = await gh<{ content: { html_url: string }; commit: { sha: string } }>(`/contents/${DIR}/${id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: encode(data), branch }),
  });
  return { file: out.content.html_url, commit: out.commit.sha };
}

export async function openPullRequest(id: string, data: unknown, title: string, body: string) {
  const branch = `post/${id}`;
  const head = await gh<{ object: { sha: string } }>(`/git/ref/heads/${BRANCH}`);
  try {
    await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: head.object.sha }) });
  } catch (e) {
    if (e instanceof GitHubError && e.status === 422) throw new GitHubError(409, 'A submission for this post is already waiting for review');
    throw e;
  }
  await commitFile(id, data, title, branch);
  const pr = await gh<{ html_url: string; number: number }>('/pulls', {
    method: 'POST',
    body: JSON.stringify({ title, head: branch, base: BRANCH, body }),
  });
  return { pullRequest: pr.html_url, number: pr.number };
}

export async function openSubmissionCount(): Promise<number> {
  const prs = await gh<{ head: { ref: string } }[]>(`/pulls?state=open&per_page=100`);
  return prs.filter((p) => p.head.ref.startsWith('post/')).length;
}
