// POST /api/posts  (authenticated)
// For trusted callers such as the tracker. Validates, verifies X posts against X's oEmbed
// endpoint, then commits src/content/sightings/<id>.json (or opens a pull request with mode "pr").
import { z } from 'zod';
import { sightingInput, USE_CASE_SLUGS } from './_lib/schema.js';
import { resolve } from './_lib/verify.js';
import { commitFile, fileExists, openPullRequest, GitHubError } from './_lib/github.js';
import { json, readJson, tokenMatches } from './_lib/http.js';
import { rankPost, rankingEnabled, stored, markdownReport } from './_lib/relevance.js';

export async function POST(request: Request): Promise<Response> {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  if (!tokenMatches(bearer, process.env.POSTS_API_TOKEN)) return json(401, { error: 'Missing or invalid bearer token' });

  let input;
  try {
    input = sightingInput.parse(await readJson(request));
  } catch (e) {
    return json(422, { error: 'Invalid request body', details: e instanceof z.ZodError ? z.flattenError(e) : String(e) });
  }

  const unknown = input.useCases.filter((s) => !(USE_CASE_SLUGS as readonly string[]).includes(s));
  if (unknown.length) return json(422, { error: `Unknown use case slug(s): ${unknown.join(', ')}`, valid: USE_CASE_SLUGS });

  try {
    const post = await resolve(input.url);
    if (post.source === 'x' && !post.verified) {
      return json(422, { error: 'X did not confirm this post. It may be deleted, private, or the URL is wrong.' });
    }
    const author = input.author ?? post.author;
    const text = input.text ?? post.text;
    if (!author || !text) return json(422, { error: 'author and text are required for sources other than X' });
    if (await fileExists(post.id)) return json(409, { error: 'This post is already on the site', id: post.id });

    // A supplied ranking wins, except for "auto", where the server must make its own decision.
    const supplied = input.mode === 'auto' ? undefined : input.relevance;
    const relevance = supplied ? null : await rankPost({ text, source: input.source ?? post.source, authorName: author.name, authorHandle: author.handle });

    // "auto" is confidence-gated routing: publish, send to review, or refuse.
    let { mode } = input;
    if (mode === 'auto') {
      if (!relevance) mode = 'pr'; // ranking unavailable: a person decides
      else if (relevance.verdict === 'reject') return json(422, { error: 'Ranked as not about Jev; nothing was written', relevance });
      else mode = relevance.verdict === 'publish' ? 'commit' : 'pr';
    }

    const { mode: _requested, relevance: _supplied, ...rest } = input;
    const entry = {
      ...rest,
      source: input.source ?? post.source,
      url: post.url,
      author,
      postedAt: (input.postedAt ?? post.postedAt ?? new Date()).toISOString(),
      text,
      ...(supplied ? { relevance: supplied } : relevance ? { relevance: stored(relevance) } : {}),
    };
    const title = `Add post ${post.id}${author.handle ? ` by @${author.handle}` : ''}`;
    const result =
      mode === 'pr'
        ? await openPullRequest(post.id, entry, title, `Submitted through the posting API.\n\nOriginal: ${post.url}\n\n${markdownReport(relevance)}`)
        : await commitFile(post.id, entry, title);
    return json(201, { id: post.id, mode, requestedMode: input.mode, verified: post.verified, relevance: relevance ?? supplied ?? null, entry, ...result });
  } catch (e) {
    if (e instanceof GitHubError) return json(e.status === 409 ? 409 : 502, { error: e.message });
    return json(500, { error: 'Unexpected error' });
  }
}

export const GET = () =>
  json(200, {
    endpoint: 'POST /api/posts',
    auth: 'Authorization: Bearer <POSTS_API_TOKEN>',
    docs: 'https://github.com/Rassl/usejev/blob/main/docs/posting-api.md',
    useCases: USE_CASE_SLUGS,
    ranking: rankingEnabled() ? 'enabled' : 'disabled (TYPESAFE_API_KEY not set)',
  });
