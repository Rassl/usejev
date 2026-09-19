# AGENTS.md

Guidance for AI agents (and people) reading or editing this repository.

## What this repo is

The source of https://usejev.dev, an **unofficial** catalog of use cases for Jev, TypeSafe AI's
System One model. It is also meant to be read directly as a knowledge source. It is not affiliated
with TypeSafe AI; when this repo and https://docs.typesafe.ai disagree, the official docs win.

## Using this repo as knowledge

| You want | Read |
| --- | --- |
| The verified Jev API shape (HTTP, Python SDK, JS SDK, limits, prices) | `docs/jev-api-notes.md` |
| A worked example for a task | `src/content/use-cases/<slug>.mdx` (one file per use case) |
| Concepts: what Jev is, Jev vs LLMs, confidence thresholds | `src/pages/guides/*.mdx` |
| Everything as plain Markdown without cloning | https://usejev.dev/llms.txt, https://usejev.dev/llms-full.txt |
| A machine-readable index | https://usejev.dev/use-cases.json |
| A drop-in agent skill | `skills/jev-use-cases/SKILL.md` |

Every use case follows the same sections: The problem, Why Jev fits, Question design, Code,
Example response, Decision logic, Cost estimate, Pitfalls. Example responses are illustrative
(documented shape, made-up numbers). Cost tables are computed from `tokensPerItem` in the
frontmatter at $0.042 per million input tokens.

Facts agents most often get wrong about Jev:

- Noul answers have **no** `confidence` field; only Choice and Score do.
- `confidence` summarizes the shape of the distribution; it is not the top option's probability.
- All questions in a request are independent. One answer is never context for another.
- Jev does not generate text, count, do arithmetic, or compare dates reliably. Keep those in code.
- A Choice takes at most 255 options. Larger label sets need a cascade.

## Editing rules

- Never invent API fields, endpoints, or SDK methods. Check `docs/jev-api-notes.md`, then the
  official docs (index: https://docs.typesafe.ai/llms.txt). If you verify something new, add it
  to the notes file with its source URL. If you cannot verify it, mark the sample
  `// illustrative, check the docs`.
- No fabricated benchmarks, testimonials, customers, or quotes. Label illustrative numbers.
- Link facts and numbers to the official docs or blog with descriptive link text.
- Keep the unofficial disclaimer. Do not use TypeSafe branding or imply endorsement.
- Never type dollar totals by hand; use `<CostTable>`.
- In MDX prose, avoid raw `<`, `>`, `{`, `}` outside code fences. No em dashes.
- Community posts live in `src/content/sightings/*.json`; the schema and rules are in `README.md`
  under "Community sightings". Quote short excerpts only, always link the original, and never
  restate a post's claims as fact. Do not alter a quote except to replace a stripped link with
  "[link]", and verify each post against the original before publishing.
- The "At a glance" panel on each use case is generated from that page's own `## Question design`
  and `## Example response` JSON blocks, so keep both as valid JSON.
- To add a use case, follow "Adding a new use case" in `README.md`.

## Commands

```sh
npm run dev          # local server
npm run build        # astro check + static build to dist/
npm run check:dist   # SEO and integrity checks over dist/ (must pass before pushing)
```

Pushing to `main` deploys to production on Vercel.
