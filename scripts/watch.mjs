// Watch X for posts about using Jev, rank each one with Jev, and send the good ones to the site.
//   search (X API v2 recent search, queries in scripts/watch-queries.json)
//   -> rank (the same questions the posting API uses, api/_lib/relevance.ts)
//   -> publish: commit to main | strong review: pull request | the rest: dropped (best first, capped per pass)
// Needs X_BEARER_TOKEN, TYPESAFE_API_KEY and POSTS_API_TOKEN (env or .env.local) and Node 22.18+.
//   npm run watch                      one pass
//   npm run watch -- --dry-run         search and rank, send nothing, keep the state untouched
//   npm run watch -- --pr              never commit: every non-rejected post becomes a pull request
//   npm run watch -- --since-hours 48  how far back to look when a query has no saved position (max 168)
//   npm run watch -- --max 200         most posts to read per query (the daily budget can lower it)
//   npm run watch -- --daily-reads 170 --reads-per-pass 40   X read budget (defaults: watch-queries.json)
//   npm run watch -- --max-publish 3   commits per pass (default 5); the rest wait in the backlog for the next pass
//   npm run watch -- --max-review 3    also open up to 3 pull requests per pass for near-misses (default 0: none)
//   npm run watch -- --publish-floor 0.9 --confidence-floor 0.8   the bar for going live without a person (defaults)
//   npm run watch -- --review-floor 0.8  lowest 'review' score worth a pull request (default 0.75)
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { rankPost, THRESHOLDS, USEFUL_KINDS } from '../api/_lib/relevance.ts';
import { classifyPost } from '../api/_lib/classify.ts';
import { identify } from '../api/_lib/verify.ts';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const num = (name, fallback) => {
  const n = flag(name) ? Number(args[args.indexOf(name) + 1]) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const dryRun = flag('--dry-run');
const sinceHours = Math.min(num('--since-hours', 24), 167);
const maxPerQueryFlag = num('--max', 100);
const maxPublish = num('--max-publish', 5);
const maxReview = num('--max-review', 0); // content pull requests are opt-in: by default a post goes live complete, or not at all
const reviewFloor = num('--review-floor', 0.75);
const publishFloor = num('--publish-floor', 0.9);
const confidenceFloor = num('--confidence-floor', 0.8);

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '');
for (const name of ['X_BEARER_TOKEN', 'TYPESAFE_API_KEY', 'POSTS_API_TOKEN']) {
  process.env[name] ||= env.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1] ?? '';
  if (!process.env[name] && !(dryRun && name === 'POSTS_API_TOKEN')) {
    console.error(`${name} not found. Add it to .env.local (${name}=...) or the environment.`);
    process.exit(1);
  }
}
const API = (process.env.USEJEV_API ?? 'https://usejev.dev').replace(/\/$/, '');

const config = JSON.parse(await readFile(new URL('./watch-queries.json', import.meta.url), 'utf8'));
// Use-case pages are the options Jev picks from, read from their frontmatter so new pages count.
const useCaseDir = new URL('../src/content/use-cases/', import.meta.url);
const useCases = [];
for (const f of (await readdir(useCaseDir)).filter((f) => f.endsWith('.mdx'))) {
  const front = (await readFile(new URL(f, useCaseDir), 'utf8')).split('---')[1] ?? '';
  const field = (k) => front.match(new RegExp(`^${k}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1] ?? '';
  useCases.push({ slug: field('slug') || f.replace(/\.mdx$/, ''), title: field('title'), description: field('description') });
}
const excluded = new Set(config.excludeHandles.map((h) => h.toLowerCase()));

// State is a convenience, not the source of truth: without it a pass re-reads the last
// `--since-hours`, and the site's own de-duplication (409) keeps the result the same.
const stateUrl = new URL('../.scratch/watch-state.json', import.meta.url);
const state = { sinceId: {}, seen: [], retry: [], reads: {}, ...JSON.parse(await readFile(stateUrl, 'utf8').catch(() => '{}')) };

// X bills per post read (about $0.0048), so reading is budgeted per UTC day and split across the
// queries. X will not return fewer than 10 per request; when less than that is left for each
// query, this pass reads nothing and only publishes from the backlog.
const today = new Date().toISOString().slice(0, 10);
const dailyReads = num('--daily-reads', config.dailyReads ?? Infinity);
const readToday = state.reads.day === today ? state.reads.count : 0;
const share = Math.floor((dailyReads - readToday) / config.queries.length);
const perPass = Math.floor(num('--reads-per-pass', config.readsPerPass ?? Infinity) / config.queries.length);
const maxPerQuery = Math.min(maxPerQueryFlag, share, perPass);
const canSearch = maxPerQuery >= 10;
const seen = new Set(state.seen);
for (const f of await readdir(new URL('../src/content/sightings/', import.meta.url))) seen.add(f.replace(/\.json$/, ''));

// Recent search only reaches back 7 days, and rejects a since_id older than that.
const postedAt = (id) => identify(`https://x.com/i/status/${id}`).postedAt;
const tooOld = (id) => Date.now() - postedAt(id).getTime() > 6.5 * 864e5;
const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function search({ topic, query }) {
  const found = [];
  const params = new URLSearchParams({
    query: `(${query}) ${config.suffix}`,
    max_results: String(Math.min(100, Math.max(10, maxPerQuery))),
    'tweet.fields': 'created_at,note_tweet,attachments',
    expansions: 'author_id,attachments.media_keys',
    'user.fields': 'name,username',
    'media.fields': 'type,url,preview_image_url,alt_text',
  });
  const since = state.sinceId[topic];
  if (since && !tooOld(since)) params.set('since_id', since);
  else params.set('start_time', new Date(Date.now() - sinceHours * 36e5).toISOString());

  let newest;
  while (found.length < maxPerQuery) {
    // Never ask for more than the budget allows; 10 is the smallest page X serves.
    params.set('max_results', String(Math.min(100, Math.max(10, maxPerQuery - found.length))));
    const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`X search "${topic}" failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const page = await res.json();
    newest ??= page.meta?.newest_id;
    const users = new Map((page.includes?.users ?? []).map((u) => [u.id, u]));
    const mediaByKey = new Map((page.includes?.media ?? []).map((m) => [m.media_key, m]));
    for (const t of page.data ?? []) {
      const user = users.get(t.author_id);
      if (!user) continue;
      const media = pickMedia((t.attachments?.media_keys ?? []).map((k) => mediaByKey.get(k)), user.name);
      found.push({ media: media ?? null, id: `x-${t.id}`, url: `https://x.com/${user.username}/status/${t.id}`, text: unescape(t.note_tweet?.text ?? t.text), authorName: user.name, authorHandle: user.username, topic });
    }
    if (!page.meta?.next_token) break;
    params.set('next_token', page.meta.next_token);
  }
  return { found, newest };
}

const pickMedia = (list, authorName) => {
  // First attachment only: photos have `url`, videos and GIFs have `preview_image_url`.
  const m = list.find((m) => m && (m.url || m.preview_image_url));
  return m ? { type: m.type === 'photo' ? 'image' : 'video', thumbnail: m.url ?? m.preview_image_url, alt: (m.alt_text || `${m.type === 'photo' ? 'Image' : 'Video'} from the post by ${authorName}`).slice(0, 200) } : null;
};

async function lookupMedia(post) {
  const params = new URLSearchParams({ ids: post.id.slice(2), 'tweet.fields': 'attachments', expansions: 'attachments.media_keys', 'media.fields': 'type,url,preview_image_url,alt_text' });
  const res = await fetch(`https://api.x.com/2/tweets?${params}`, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  return pickMedia((await res.json()).includes?.media ?? [], post.authorName);
}

async function send(post, mode) {
  const res = await fetch(`${API}/api/posts/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.POSTS_API_TOKEN}`, 'Content-Type': 'application/json' },
    // The score goes along: it was made from the full post, and the server only sees the excerpt.
    body: JSON.stringify({ url: post.url, mode, relevance: { score: post.rank.score, verdict: post.rank.verdict, kind: post.rank.kind, model: post.rank.model ?? process.env.JEV_MODEL ?? 'jev-latest', checkedAt: post.rank.checkedAt ?? new Date().toISOString() }, media: post.media ?? undefined, category: post.card?.category, useCases: post.card?.useCases, primitives: post.card?.primitives }),
    signal: AbortSignal.timeout(30000),
  });
  const out = await res.json().catch(() => ({}));
  return { status: res.status, where: out.pullRequest ?? out.file ?? out.error ?? '' };
}

// 1. Search. Posts left over from a failed earlier pass go first.
const candidates = new Map(state.retry.map((p) => [p.id, p]));
const newest = {};
const searches = [];
const searchErrors = [];
let failed = 0;
const readIds = new Set();
if (!canSearch) console.log(`note     daily X budget used (${readToday} of ${dailyReads} posts read today): publishing from the backlog only`);
for (const q of canSearch ? config.queries : []) {
  try {
    const r = await search(q);
    for (const p of r.found) readIds.add(p.id);
    if (r.newest) newest[q.topic] = r.newest;
    // X bills a post once however many queries return it; `topics` shows which queries overlap.
    for (const p of r.found) {
      const known = candidates.get(p.id);
      if (known) known.topics = [...new Set([...(known.topics ?? [known.topic]), p.topic])];
      else candidates.set(p.id, p);
    }
    searches.push({ topic: q.topic, found: r.found.length });
    console.log(`search   ${String(r.found.length).padStart(3)} posts  ${q.topic}`);
  } catch (e) {
    failed++;
    searchErrors.push(e.message.slice(0, 240));
    console.error(e.message);
  }
}

// 2. Rank everything first, so the caps below keep the best posts rather than the first ones.
const counts = { publish: 0, review: 0, reject: 0, held: 0, waiting: 0, skipped: 0, error: 0, jevErrors: 0, siteErrors: 0 };
const retry = [];
const report = [];
const queue = [];
let tokens = 0;
// Every ranked post of every pass (dry runs too) goes to the run log that `npm run watch:ui` reads.
const pass = new Date().toISOString();
const lines = [];
const record = (post, outcome, detail) =>
  lines.push({ type: 'post', pass, id: post.id, url: post.url, text: post.text, authorName: post.authorName, authorHandle: post.authorHandle, topics: post.topics ?? [post.topic], rank: post.rank, card: post.card, media: post.media, outcome, detail });
const log = (label, post, note) => console.log(`${label.padEnd(8)} ${post.rank ? post.rank.score.toFixed(2) : '----'}  ${post.url}  ${post.rank?.kind ?? ''}  (${note})`);
for (const post of candidates.values()) {
  if (seen.has(post.id) || excluded.has(post.authorHandle.toLowerCase()) || tooOld(post.id.slice(2))) {
    counts.skipped++;
    continue;
  }
  if (!post.rank) {
    const r = await rankPost({ text: post.text, source: 'x', authorName: post.authorName, authorHandle: post.authorHandle });
    if (!r) {
      // Jev unreachable: keep the post for the next pass instead of guessing.
      counts.error++;
      counts.jevErrors++;
      retry.push(post);
      record(post, 'error', 'Jev could not be reached');
      log('ERROR', post, 'Jev could not be reached');
      continue;
    }
    tokens += r.inputTokens;
    post.rank = { score: r.score, verdict: r.verdict, kind: r.kind, reasons: r.reasons.join('; '), signals: r.signals, model: r.model, checkedAt: r.checkedAt };
  }
  const { verdict, score, kind, reasons } = post.rank;
  // A pull request costs a person's attention. Commentary about Jev is plentiful and is not what
  // the site collects, so only near-misses of a useful kind are worth a look.
  const worthReview = verdict === 'review' && score >= reviewFloor && USEFUL_KINDS.includes(kind);
  // Going live without a person takes more than a publish verdict: a high composite and Jev
  // being sure of both its Score and its Choice. Other publish verdicts get a pull request.
  const sig = post.rank.signals;
  post.auto = verdict === 'publish' && score >= publishFloor && Boolean(sig) && sig.usageConfidence >= confidenceFloor && sig.kindConfidence >= confidenceFloor;
  // Without a pull-request lane (the default), only posts that can go live are queued.
  const prLane = maxReview > 0 || flag('--pr');
  if (post.auto || (prLane && (verdict === 'publish' || worthReview))) queue.push(post);
  else {
    counts[verdict === 'reject' ? 'reject' : 'held']++;
    seen.add(post.id);
    record(post, verdict === 'reject' ? 'rejected' : 'held');
    log(verdict === 'reject' ? 'reject' : 'held', post, verdict === 'reject' ? reasons : `not sent for review: ${reasons}`);
  }
}

// 3. Send the best few. The caps bound both a bad pass and a busy day; the rest wait in the
// backlog (already ranked) and compete again next pass, until they age out of the 7-day window.
queue.sort((a, b) => b.rank.score - a.rank.score);
for (const post of queue) {
  const publish = post.auto && !flag('--pr');
  if (publish ? counts.publish >= maxPublish : counts.review >= maxReview) {
    counts.waiting++;
    retry.push(post);
    record(post, 'backlog');
    continue;
  }
  const mode = publish ? 'commit' : 'pr';
  // Only posts that are about to be sent are worth a second question set. If Jev cannot be
  // reached the card simply goes out without these fields.
  if (!post.card) {
    const card = await classifyPost(post.text, useCases);
    if (card) {
      tokens += card.inputTokens;
      post.card = { category: card.category, useCases: card.useCases, primitives: card.primitives, confidence: card.confidence };
    }
  }
  post.card ??= { useCases: [], primitives: [] };
  // Backlog posts ranked before the watcher asked X for media: look the preview up now (one read).
  if (post.media === undefined) post.media = await lookupMedia(post).catch(() => null);
  let outcome = `would ${publish ? 'publish' : 'open a pull request'}`;
  if (!dryRun) {
    const sent = await send(post, mode).catch((e) => ({ status: 0, where: e.message }));
    if (sent.status === 201) outcome = `${publish ? 'published' : 'pull request'} ${sent.where}`;
    else if (sent.status === 409 || sent.status === 422) {
      seen.add(post.id);
      counts.skipped++;
      record(post, 'refused', `site answered ${sent.status}`);
      log('skip', post, sent.status === 409 ? 'already on the site or waiting for review' : `refused by the site: ${sent.where}`);
      continue;
    } else {
      counts.error++;
      counts.siteErrors++;
      retry.push(post);
      record(post, 'error', `site answered ${sent.status}`);
      log('ERROR', post, `site answered ${sent.status}: ${sent.where}`);
      continue;
    }
  }
  counts[publish ? 'publish' : 'review']++;
  seen.add(post.id);
  record(post, publish ? 'published' : 'pull_request', outcome);
  log(publish ? 'publish' : 'review', post, `${outcome}; ${post.media ? `${post.media.type}, ` : ''}${post.card?.category ?? 'no category'}${post.card?.useCases.length ? `, ${post.card.useCases[0]}` : ''}${post.card?.primitives.length ? `, ${post.card.primitives.join('+')}` : ''}`);
  report.push(`| ${publish ? 'published' : 'pull request'} | ${post.rank.score.toFixed(2)} | ${post.rank.kind} | ${post.url} | ${post.text.slice(0, 80).replace(/[\n|]/g, ' ')} |`);
}

const budgetNote = Number.isFinite(dailyReads) ? `; X reads ${readIds.size} this pass, ${readToday + readIds.size} of ${dailyReads} today (~$${((readToday + readIds.size) * 0.0048).toFixed(2)})` : '';
const summary = `${counts.publish} published, ${counts.review} sent for review, ${counts.waiting} waiting in the backlog, ${counts.held} not worth a review, ${counts.reject} rejected, ${counts.skipped} already known, ${counts.error} errors; ${tokens} Jev input tokens (~$${((tokens * 0.042) / 1e6).toFixed(5)})${budgetNote}${dryRun ? ' [dry run, nothing sent]' : ''}`;
console.log(`\n${summary}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const table = report.length ? `\n\n| Verdict | Score | Kind | Post | Text |\n| --- | --- | --- | --- | --- |\n${report.join('\n')}` : '';
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `**Jev watcher:** ${summary}${table}\n`);
}

await mkdir(new URL('./', stateUrl), { recursive: true });
lines.push({ type: 'pass', pass, dryRun, prOnly: flag('--pr'), searches, counts, tokens, reads: { thisPass: readIds.size, today: readToday + readIds.size, dailyBudget: Number.isFinite(dailyReads) ? dailyReads : null }, settings: { maxPublish, maxReview, reviewFloor, publishFloor, confidenceFloor, publish: THRESHOLDS.publish, review: THRESHOLDS.review } });
await appendFile(new URL('./watch-runs.jsonl', stateUrl), lines.map((l) => `${JSON.stringify(l)}\n`).join(''));

const reads = { day: today, count: readToday + readIds.size };
if (dryRun && readIds.size) {
  // A dry run sends nothing and keeps its place, but it did read posts, and X bills for them.
  const kept = JSON.parse(await readFile(stateUrl, 'utf8').catch(() => '{}'));
  await writeFile(stateUrl, `${JSON.stringify({ ...kept, reads }, null, 2)}\n`);
}
if (!dryRun) {
  // Rejected ids are remembered so overlapping queries and passes do not pay to rank them again.
  const next = { reads, sinceId: { ...state.sinceId, ...newest }, seen: [...seen].filter((id) => /^x-\d+$/.test(id) && !tooOld(id.slice(2))).slice(-5000), retry };
  await writeFile(stateUrl, `${JSON.stringify(next, null, 2)}\n`);
}
// Exit non-zero only for what needs a person. Single failures are retried next pass on their own:
// a post Jev timed out on stays queued, and a query that failed keeps its position.
const ranked = lines.filter((l) => l.type === 'post').length;
const problems = [
  canSearch && failed === config.queries.length && `every X search failed (token, credits or rate limit): ${searchErrors[0]}`,
  counts.siteErrors > 0 && `the site refused ${counts.siteErrors} post(s) with an unexpected error (posting token, GitHub token or an outage)`,
  counts.jevErrors > Math.max(5, ranked * 0.2) && `Jev could not be reached for ${counts.jevErrors} of ${ranked} posts`,
].filter(Boolean);
const notes = [failed > 0 && failed < config.queries.length && `${failed} X search(es) failed and will be retried: ${searchErrors.join(' | ')}`, counts.jevErrors > 0 && !problems.some((p) => p.startsWith('Jev')) && `${counts.jevErrors} post(s) wait for Jev and will be retried`].filter(Boolean);
for (const n of notes) console.log(`note     ${n}`);
for (const p of problems) console.error(`PROBLEM  ${p}`);
if (process.env.GITHUB_STEP_SUMMARY && (notes.length || problems.length)) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${[...problems.map((p) => `**Problem:** ${p}`), ...notes.map((n) => `Note: ${n}`)].join('  \n')}\n`);
process.exit(problems.length ? 1 : 0);
