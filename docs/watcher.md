# The X watcher

`scripts/watch.mjs` finds posts about using Jev on X, asks Jev whether each one is worth showing,
and sends the good ones to the site. It runs every 3 hours from `.github/workflows/watch.yml`,
or by hand with `npm run watch`.

```
X recent search ──► skip known ──► rank with Jev ──► high confidence → complete the card → commit to main, live in ~1 min
(watch-queries.json)  and excluded   (relevance.ts)    everything else → dropped, remembered

complete the card = category, use case, primitives (Jev) + media preview (X)
```

Nothing waits for a person: no content pull requests, no drafts. A post either clears the
auto-publish bar and goes live as a complete card, or it is dropped. Cards have no `title` or `summary`: those are written text, which Jev does not
produce, and the watcher uses no other model.

```
npm run watch -- --max-review 3    # opt back in to pull requests for near-misses
```

| Step | Detail |
| --- | --- |
| Search | X API v2 `GET /2/tweets/search/recent`, one call per entry in `scripts/watch-queries.json`. Each query remembers the newest post it saw (`since_id`), so a pass only reads new posts. Without a saved position it looks back `--since-hours` (default 24; the endpoint reaches 7 days at most) |
| Skip | Posts already in `src/content/sightings/`, posts ranked in an earlier pass, and authors in `excludeHandles` (the official account and ours) |
| Rank | `rankPost` from `api/_lib/relevance.ts`: the same five questions, weights and thresholds the posting API uses, so `docs/relevance-ranking.md` and `npm run rank:eval` apply unchanged |
| Select | Everything is ranked first, then sorted by score; posts over the bar below are committed, best first. Pull requests are off by default (`--max-review 0`). With `--max-review N`, *publish* verdicts under the bar and *review* verdicts of at least 0.75 (`--review-floor`) of a useful kind become pull requests |
| Auto-publish bar | Going live without a person needs a *publish* verdict **and** score ≥ 0.90 (`--publish-floor`) **and** both of Jev's confidences ≥ 0.80 (`--confidence-floor`). Chosen from the first real pass: above it were clear demos; between 0.75 and 0.80 sat posts where Jev's confidence was near 0.5. *publish* verdicts under the bar are dropped (or become pull requests with `--max-review`) |
| Categorize | Posts about to be sent get a second Jev request (`api/_lib/classify.ts`, about 1,700 tokens): a Choice over the category list, a Choice over the use-case pages (options are read from their frontmatter, with a `none` catch-all), and one Noul per primitive. A Choice is used only at confidence ≥ 0.5; a primitive only at ≥ 0.8 **and** if the word is in the text. Anything unsure is left empty |
| Media | The search asks X for attachments (`expansions=attachments.media_keys`); the first photo, or a video's preview image, becomes the card's `media` with the author's alt text when there is one. Hot-linked, never copied. Backlog posts from before this existed get a one-read lookup when they are sent |
| Send | The URL plus `media`, `category`, `useCases` and `primitives`. The site confirms the post through oEmbed and writes the entry, so a post deleted since the search is refused (`422`), and a duplicate answers `409` |

The ranking happens in the watcher, not with `"mode": "auto"`, so rejected posts never reach the
site's API and the watcher works whether or not ranking is switched on in production.

## Safeguards

- **Caps per pass.** At most 5 commits (`--max-publish`).
  The overflow waits, already ranked, in the state file's backlog and competes again on the next
  pass until it ages out of X's 7-day window. A busy day becomes a steady drip of the best posts,
  not a flood. The first real pass (2026-09-19, 72 hours) found 361 posts: 84 *publish*, 244
  *review*, 33 *reject*.
- **`--pr`** turns off committing entirely; *publish* verdicts then share the pull-request cap. Use it after changing queries or thresholds.
- **Nothing is lost on failure.** If Jev or the site cannot be reached, the post is kept in
  `retry` and tried first on the next pass. The run only exits non-zero (a red workflow and an
  email) for what needs a person: every X search failed, the site refused a post with an
  unexpected error, or Jev was unreachable for more than a fifth of the posts. Anything less is a
  note in the run summary.
- **State is disposable.** `.scratch/watch-state.json` (positions, ranked ids, retries) travels
  between workflow runs through the Actions cache. If it disappears, the next pass re-reads the
  last 24 hours and the site's de-duplication keeps the result the same.
- To change the categories, edit `CATEGORIES` in
  `api/_lib/classify.ts`; keep names that are already in use, since they drive the `/community/` filter.

## Seeing what it did

```sh
npm run watch:ui        # http://localhost:4322, read-only, local only
```

Every pass, dry runs included, appends one line per ranked post to `.scratch/watch-runs.jsonl`
(text, the queries that found it, Jev's signals, score, verdict, and what happened to it). The
page reads that file and the state file:

| Panel | Use it to |
| --- | --- |
| Pipeline | See one pass as a funnel: posts read from X (billed) → unique → ranked → publish verdicts → sent |
| Score distribution | See where posts fall against the thresholds. The slider shows how many pull requests a different `--review-floor` would have produced, without calling anything |
| Query yield | Find queries that waste X credits: many reads, few publish verdicts, or nothing "only here" |
| Posts | Filter and sort; click a row for the full text, Jev's per-question signals and the reasons |
| Backlog, Passes | What is waiting for the next pass; the history with Jev cost |

The log is local and gitignored. Scheduled runs on GitHub keep their own; their results are in
each run's summary.

## Setup

1. X API access: create an app at https://developer.x.com and copy its **bearer token**. Recent
   search is not in the free tier. X bills per post read, so cost follows `--max` (posts per
   query, default 100) times the number of queries times passes per day; the Jev side is about
   $0.00004 per post.
2. Locally, add the three keys to `.env.local`:
   ```sh
   X_BEARER_TOKEN=...
   TYPESAFE_API_KEY=...
   POSTS_API_TOKEN=...
   ```
   ```sh
   npm run watch -- --dry-run     # search and rank, send nothing, leave the state alone
   npm run watch -- --pr          # send, but only as pull requests
   npm run watch
   ```
3. For the schedule, add the same three names as repository secrets
   (GitHub → Settings → Secrets and variables → Actions, or `gh secret set X_BEARER_TOKEN`). Scheduled workflows only run from the default branch, so
   the schedule starts once this is merged to `main`. "Run workflow" in the Actions tab has a
   dry-run switch, and each run's summary lists what was published or sent to review.

## Tuning the topics

Edit `scripts/watch-queries.json`. `suffix` is appended to every query (no retweets, no replies,
English). "Jev" alone is also a well-known nickname, so every query pairs it with a second word;
precision beyond that is the ranking's job, and a rejected post costs a fraction of a cent.
After a change, run `npm run watch -- --dry-run --since-hours 72` and read the verdicts. Add
surprising real posts to `scripts/rank-fixtures.json` so `rank:eval` keeps covering them.

Needs Node 22.18 or newer: the script imports the API's TypeScript modules directly.
