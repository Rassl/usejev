# usejev.dev

An unofficial, community catalog of practical use cases for **Jev**, TypeSafe AI's System One
model. Static site built with [Astro](https://astro.build), deployed to Vercel at
**https://usejev.dev**.

> Unofficial community resource. Not affiliated with TypeSafe AI.
> Official docs: https://docs.typesafe.ai

## Local development

Requires Node.js 20 or newer.

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # type-checks (astro check), then builds to dist/
npm run preview    # serves dist/ locally
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run og` | Regenerates the shared Open Graph image `public/og.png` from `scripts/make-og.mjs` |
| `npm run check:dist` | After a build, checks every page in `dist/`: titles, descriptions, canonicals, one `<h1>`, heading order, JSON-LD, internal links, click depth, word counts, sitemap, RSS |
| `npm run indexnow` | Submits every URL in the built sitemap to IndexNow (see below) |

## Project layout

```
astro.config.mjs            site: https://usejev.dev, static output, trailing slashes
docs/jev-api-notes.md       the verified Jev API shape; every code sample must stay inside it
vercel.json                 build settings, noindex for *.vercel.app, www redirect, cache headers
public/robots.txt           allows all crawlers, points to the sitemap
public/<key>.txt            IndexNow key file
scripts/indexnow.mjs        IndexNow submission
src/content.config.ts       use-case frontmatter schema (strict; the build fails on violations)
src/content/use-cases/      one .mdx file per use case
src/pages/                  home, use-case index + template, guides, about, 404, rss.xml
src/layouts/                Base (SEO tags, JSON-LD), Article, Guide (FAQ + FAQPage JSON-LD)
src/components/             CodeTabs, CostTable, UseCaseCard
src/lib/site.ts             site constants, official doc links, Jev price
src/lib/markdown.ts         Markdown exports behind llms.txt, llms-full.txt and the .md endpoints
AGENTS.md                   guidance for AI agents reading or editing the repo
skills/jev-use-cases/       drop-in agent skill
```

## Using this repo as a knowledge source

The content is published in machine-readable forms so that LLMs, coding agents, and RAG pipelines
can use it without scraping HTML:

| Resource | URL or path |
| --- | --- |
| Index for LLMs | https://usejev.dev/llms.txt |
| All content in one Markdown file | https://usejev.dev/llms-full.txt |
| Any page as Markdown | append `.md` instead of the trailing slash, e.g. https://usejev.dev/use-cases/lead-scoring.md |
| Use-case index as JSON | https://usejev.dev/use-cases.json |
| Verified Jev API notes, with sources | `docs/jev-api-notes.md` |
| Instructions for agents working in this repo | `AGENTS.md` |
| Agent skill (Claude Code and compatible agents) | `skills/jev-use-cases/SKILL.md` |

To use the skill, copy `skills/jev-use-cases/` into your project's `.claude/skills/` directory (or
your agent's equivalent). The `.md` and `llms-full.txt` exports are served with
`X-Robots-Tag: noindex` so they do not compete with the HTML pages in search; each HTML page
advertises its Markdown twin with `<link rel="alternate" type="text/markdown">`.

## Adding a new use case

1. Re-read `docs/jev-api-notes.md` and the [official docs](https://docs.typesafe.ai/llms.txt).
   Do not use an API field, endpoint, or SDK method that is not documented. If something cannot be
   verified, mark the sample `// illustrative, check the docs`.
2. Copy `src/content/use-cases/support-ticket-routing.mdx` to a new file named after the slug.
3. Fill in the frontmatter:

   | Field | Rule |
   | --- | --- |
   | `title` | 60 characters max, include "Jev" |
   | `description` | 140 to 165 characters (aim for 150 to 160) |
   | `slug` | lowercase, hyphenated; becomes `/use-cases/<slug>/` |
   | `category` | one of the enum values in `src/content.config.ts` |
   | `industry` | list; reuse existing values so the home page filter stays tidy |
   | `primitives` | any of `Choice`, `Score`, `Noul` |
   | `difficulty` | `Beginner`, `Intermediate`, or `Advanced` |
   | `tokensPerItem` | input tokens per item; `<CostTable>` computes the dollar figures from it |
   | `related` | exactly 3 existing slugs; the build fails if one does not exist |
   | `publishedAt`, `updatedAt` | ISO dates |

4. Keep the H2 sections in order: The problem, Why Jev fits, Question design, Code, Example
   response, Decision logic, Cost estimate, Pitfalls. The layout renders "Related use cases".
5. Use `<CodeTabs>` with `python` and `ts` slots for code, and
   `<CostTable tokens={frontmatter.tokensPerItem} unit="tickets" />` for costs. Never type dollar
   totals by hand.
6. In MDX prose, avoid raw `<`, `>`, `{`, `}` outside code fences.
7. `npm run build`. The page is added to the home grid, the index, the sitemap, and the RSS feed
   automatically.

If TypeSafe changes its price, update `PRICE_PER_MTOK` in `src/lib/site.ts`.

## Deploy to Vercel

The site is a static Astro build, so no adapter is needed. `vercel.json` sets the build command
(`npm run build`), the output directory (`dist`), trailing slashes, cache headers, the preview
`noindex` header, and the www redirect.

1. Push this repo to GitHub.
2. Vercel dashboard → Add New → Project → import the repo. The Astro preset is detected; keep
   build command **`npm run build`** and output directory **`dist`**. Or from the CLI:
   `npx vercel link`, `npx vercel git connect`, then `npx vercel --prod`.
3. Every push to `main` deploys to production; other branches and PRs get preview URLs.

Every `*.vercel.app` host (production alias and previews) sends `X-Robots-Tag: noindex` via
`vercel.json`, so those URLs never compete with usejev.dev in search. After the first deploy,
verify:

```sh
curl -sI https://<project>.vercel.app/ | grep -i x-robots-tag   # expect: noindex
curl -sI https://usejev.dev/ | grep -i x-robots-tag             # expect: no output
```

### Connect usejev.dev

1. Project → Settings → **Domains** → add **`usejev.dev`** and **`www.usejev.dev`**
   (CLI: `npx vercel domains add usejev.dev` and `npx vercel domains add www.usejev.dev`).
2. At your DNS provider, create the records Vercel shows: an `A` record for the apex
   (`76.76.21.21` unless Vercel shows a different value) and a `CNAME` for `www` pointing to
   `cname.vercel-dns.com`. Alternatively move the nameservers to Vercel.
3. www → apex: `vercel.json` already 301-redirects `www.usejev.dev/*` to `https://usejev.dev/*`.
   In the Domains screen, keep `usejev.dev` as the primary domain. If Vercel offers to redirect
   the apex to www, decline.
4. Check it: `curl -sI https://www.usejev.dev/use-cases/` should return `301` with
   `location: https://usejev.dev/use-cases/`.

The canonical URLs, sitemap, RSS feed, Open Graph URLs, and JSON-LD all come from
`site: 'https://usejev.dev'` in `astro.config.mjs`. There are no localhost or preview URLs in the
output.

## IndexNow

The key file lives at `public/280f60ee41bf80fbea66b7cac87d4386.txt` and is served from
`https://usejev.dev/280f60ee41bf80fbea66b7cac87d4386.txt`. After **each production deploy**:

```sh
npm run build
npm run indexnow               # submits all sitemap URLs for host usejev.dev
npm run indexnow -- --dry-run  # prints the payload without sending
```

HTTP 200 or 202 means accepted. A 403 means the key file is not reachable yet, so wait for the
deploy to finish. To rotate the key, rename the file, change its contents to the new key, and
update `KEY` in `scripts/indexnow.mjs`.

## Post-launch SEO checklist

- [ ] **Google Search Console:** add usejev.dev as a **Domain property** and verify it with the
      DNS TXT record (add it at your DNS provider). Submit `https://usejev.dev/sitemap-index.xml`.
      Use URL Inspection → Request indexing for `/`, `/use-cases/`, `/guides/what-is-jev/`,
      `/guides/jev-vs-llm-classification/`, and two or three of the strongest use cases.
- [ ] **Bing Webmaster Tools:** sign in and **import from GSC**, confirm the sitemap came across,
      then run `npm run indexnow`.
- [ ] Validate structured data for the home page, one use case, and one guide with the
      [Rich Results Test](https://search.google.com/test/rich-results) and the
      [Schema Markup Validator](https://validator.schema.org/).
- [ ] Run Lighthouse (mobile) against production for `/`, one use case, and one guide. Target 95+
      in all four categories.
- [ ] Check the social preview with a card validator (title, description, `og.png`).
- [ ] **Launch posts:** Show HN ("Show HN: Unofficial Jev use cases with verified code"), a dev.to
      article (canonical URL pointing back to the matching guide), relevant subreddits where
      self-promotion is allowed (for example r/MachineLearning weekly thread, r/LocalLLaMA,
      r/webdev Showoff Saturday), and X.
- [ ] Ask in TypeSafe's community (their Discord is linked from the official docs) whether they
      would be willing to link to the site as a community resource. Be clear that it is unofficial.
- [ ] After two to four weeks, review GSC queries and write the next use cases around the terms
      that get impressions but no clicks.

## Content rules

- Never use TypeSafe's logo, brand colors, or wording that implies this is an official site.
- The footer disclaimer must stay on every page.
- Link every fact or number to the official docs or blog.
- No fabricated benchmarks, testimonials, or quotes. Label illustrative numbers as illustrative.
