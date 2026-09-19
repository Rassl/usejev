// POST /api/submit  (public)
// Backs the form at /submit/. Never publishes: it verifies the post exists and opens a pull
// request containing a draft entry for a maintainer to complete and merge.
import { z } from 'zod';
import { publicSubmission } from './_lib/schema.js';
import { resolve } from './_lib/verify.js';
import { fileExists, openPullRequest, openSubmissionCount, GitHubError } from './_lib/github.js';
import { json, readJson } from './_lib/http.js';

const MAX_OPEN_SUBMISSIONS = 25; // stops a flood from filling the repo with pull requests
const MIN_FORM_TIME_MS = 2500;

export async function POST(request: Request): Promise<Response> {
  let input;
  try {
    input = publicSubmission.parse(await readJson(request, 4096));
  } catch (e) {
    return json(422, { error: 'Please check the form and try again.', details: e instanceof z.ZodError ? z.flattenError(e) : undefined });
  }
  // Bots fill every field and submit instantly. Answer as if it worked.
  if (input.website || (input.elapsedMs !== undefined && input.elapsedMs < MIN_FORM_TIME_MS)) return json(202, { ok: true });

  try {
    const post = await resolve(input.url);
    if (!post.verified) {
      return json(422, { error: 'We could not confirm that post exists. Check the link, and make sure the post is public.' });
    }
    if (await fileExists(post.id)) return json(409, { error: 'That post is already on the site. Thank you.' });
    if ((await openSubmissionCount()) >= MAX_OPEN_SUBMISSIONS) {
      return json(429, { error: 'The review queue is full right now. Please try again in a few days.' });
    }

    const entry = {
      source: post.source,
      url: post.url,
      author: post.author ?? { name: 'TODO' },
      postedAt: (post.postedAt ?? new Date()).toISOString(),
      text: post.text ?? 'TODO: short verbatim excerpt',
      useCases: [],
      primitives: [],
      draft: true,
    };
    const clean = (s?: string) => (s ?? '').replace(/[<>`]/g, '').replace(/@/g, '@​').trim();
    const body = [
      'Submitted through the public form at https://usejev.dev/submit/.',
      '',
      `- Original: ${post.url}`,
      `- Submitted by: ${clean(input.submitter) || 'anonymous'}`,
      `- Note: ${clean(input.note) || 'none'}`,
      '',
      'Before merging: confirm it really shows a Jev use, fix `postedAt`, add `title`, `summary`, `category`, `useCases`, then set `draft` to `false`.',
    ].join('\n');
    const pr = await openPullRequest(post.id, entry, `Community submission: ${post.id}`, body);
    return json(201, { ok: true, review: pr.pullRequest });
  } catch (e) {
    if (e instanceof GitHubError && e.status === 409) return json(409, { error: 'That post is already waiting for review. Thank you.' });
    return json(502, { error: 'Something went wrong on our side. Please try again later.' });
  }
}
