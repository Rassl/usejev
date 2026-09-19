# Posting API

Two endpoints add community posts ("sightings") to the site. Both end as a JSON file in
`src/content/sightings/`; the site stays static and the repository stays the source of truth.
Deploys take about a minute after a commit lands on `main`.

| Endpoint | Who | Result |
| --- | --- | --- |
| `POST https://usejev.dev/api/posts` | You and your tools (bearer token) | Commits the file to `main` (live on next deploy), or opens a pull request with `"mode": "pr"` |
| `POST https://usejev.dev/api/submit` | Anyone, through the form at `/submit/` | Opens a pull request with a **draft** entry for a maintainer to complete. Never publishes. |

## Setup (once)

Set these environment variables on the Vercel project (Production):

| Variable | Value |
| --- | --- |
| `GITHUB_TOKEN` | A fine-grained personal access token limited to the `Rassl/usejev` repository with **Contents: Read and write** and **Pull requests: Read and write**. Create it at https://github.com/settings/personal-access-tokens/new |
| `POSTS_API_TOKEN` | A long random secret, e.g. `openssl rand -hex 32`. Callers send it as a bearer token. |
| `GITHUB_REPO`, `GITHUB_BRANCH` | Optional. Default to `Rassl/usejev` and `main`. |

```sh
npx vercel env add GITHUB_TOKEN production
npx vercel env add POSTS_API_TOKEN production
npx vercel deploy --prod        # env changes apply to new deployments only
```

## `POST /api/posts`

```sh
curl -sS https://usejev.dev/api/posts \
  -H "Authorization: Bearer $POSTS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://x.com/someone/status/2100000000000000000",
    "title": "Our own short headline",
    "category": "Agents",
    "summary": "Neutral one-line description of what they built.",
    "useCases": ["intent-routing-chatbots-agents"]
  }'
```

Only `url` is required for X posts. The API confirms the post with X's public oEmbed endpoint
and fills `author`, `text` (links stripped, mid-sentence links become `[link]`), and `postedAt`
(decoded from the post id). For every other source, send `author` and `text` yourself.

| Field | Type | Notes |
| --- | --- | --- |
| `url` | https URL, required | X, Hacker News, Reddit, GitHub, or any page. Normalized; tracking parameters are dropped. |
| `title` | string ≤ 70 | Our headline, not the author's words |
| `category` | string ≤ 40 | Free-form, e.g. `Agents`, `Developer tools`, `Productivity` |
| `summary` | string ≤ 200 | Neutral description. Do not restate unverifiable claims as fact. |
| `useCases` | string[] ≤ 4 | Use-case slugs. `GET /api/posts` lists the valid ones. |
| `primitives` | `Choice` \| `Score` \| `Noul` [] | Only when the post says which question types it used |
| `media` | `{ type: "image" \| "video", thumbnail, alt }` | Thumbnail is hot-linked lazily, never copied |
| `author` | `{ name, handle?, url? }` | Required unless the source is X |
| `text` | string ≤ 600 | Short verbatim excerpt. Required unless the source is X |
| `postedAt` | ISO date | Optional override |
| `source` | enum | Optional; inferred from the URL |
| `draft` | boolean, default `false` | `true` keeps the card out of production |
| `mode` | `commit` (default) \| `pr` | `pr` opens a pull request instead of committing to `main` |

Unknown fields are rejected.

| Status | Meaning |
| --- | --- |
| `201` | Created. Body has `id`, the stored `entry`, and `file` + `commit` or `pullRequest`. |
| `401` | Missing or wrong bearer token |
| `409` | The post is already on the site, or already waiting for review |
| `422` | Validation failed, unknown use-case slug, or X did not confirm the post |
| `502` | GitHub rejected the write (check the token's permissions) |

The file id is derived from the URL (`x-<status id>`, `hn-<item id>`, ...), so re-sending the same
post is safe: it returns `409` instead of duplicating.

## `POST /api/submit`

Body: `{ "url": "https://…", "note": "optional, ≤ 500", "submitter": "optional, ≤ 100" }`.

The post must be publicly reachable (X posts are confirmed through oEmbed). The pull request
contains a `draft: true` entry with the verified author and text, plus the submitter's note. To
publish: add `title`, `summary`, `category`, `useCases`, set `draft` to `false`, and merge.

Abuse controls: a honeypot field and a minimum time on the form (both answer `202` so bots learn
nothing), a 4 KB body limit, existence checks before any write, de-duplication by post id, and
a cap of 25 open submission pull requests (then `429`). If spam still gets through, add Vercel's
firewall rate limiting on `/api/submit` or a Turnstile challenge.

## Local testing

`npx vercel dev` serves the site and the functions together. The handlers are plain
`Request -> Response` functions in `api/`, shared code is in `api/_lib/`.
