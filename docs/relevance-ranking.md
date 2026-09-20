# Relevance ranking: is this post really about Jev?

The posting API asks Jev itself. One request per post, five small questions, and code turns the
typed answers into a score and a verdict: **publish**, **review**, or **reject**. The code is in
`api/_lib/relevance.ts`. Ranking is off until `TYPESAFE_API_KEY` is set; without it everything
behaves as before and a person decides.

## How it follows the official guidance

| Guidance from docs.typesafe.ai | What the ranking does |
| --- | --- |
| Ask one snap judgment per question and combine in code ([primitives](https://docs.typesafe.ai/primitives), [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring)) | Five atomic questions; weights and thresholds live in code |
| Send every question that shares a state in one request ([fan-out](https://docs.typesafe.ai/patterns/fan-out)) | One call per post, about 1,000 input tokens (measured), roughly $0.00004 |
| State is "the material you would present to a panel of experts"; use an object with named fields ([state](https://docs.typesafe.ai/concepts/state)) | `state = { background, post }`. `background` explains what Jev is, because the name is new and also a common nickname. Questions reference `` `post.text` `` and `` `background` `` by path |
| Noul for yes/no with optional criteria; Score for a spectrum with described levels; Choice with a catch-all ([noul](https://docs.typesafe.ai/primitives/noul), [score](https://docs.typesafe.ai/primitives/score), [choice](https://docs.typesafe.ai/primitives/choice)) | See the question table below |
| Noul has no `confidence`; threshold the value. Gate Choice and Score on `confidence`, with 0.5 as the "do not act" floor and a higher bar for riskier actions ([confidence](https://docs.typesafe.ai/confidence), [confidence routing](https://docs.typesafe.ai/patterns/confidence-routing)) | Publishing without review needs every gate to pass; anything uncertain becomes **review** |
| Keep exact matching and arithmetic in code; the model reads literally; adversarial text in the state can move answers ([limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)) | Keyword check is a regex. Scores are only thresholded and weighted, never read as exact magnitudes. The submitter's note is never sent to the model, and callers cannot supply their own `relevance` |
| Aliases move; log the model that answered ([models](https://docs.typesafe.ai/models)) | The versioned model id is stored with every ranking. Set `JEV_MODEL` to pin a version |

## Questions

| ID | Type | Asks |
| --- | --- | --- |
| `about_jev_model` | Noul + criteria | Is `post.text` about the AI model Jev from TypeSafe AI, rather than a person, another product, or another meaning of the word? |
| `usage_depth` | Score, 4 levels | How concretely does it show someone building or using something with Jev? (none, tried it, specific thing, specific thing with details) |
| `first_hand` | Noul | Is the author describing something they built or tried themselves? |
| `kind` | Choice, 7 options | project_demo, tool_or_library, tutorial_or_explainer, benchmark_or_comparison, opinion_or_news, promotion_or_hiring, unrelated |
| `is_spam` | Noul | Crypto or token promotion, giveaway, scam, or engagement bait using a trending name? |

## Score and verdict

```
score = 0.45 * about + 0.35 * usage_depth/3 + 0.10 * first_hand + 0.10 * keyword_hit  -  0.5 * spam
```

| Verdict | When |
| --- | --- |
| **reject** | `is_spam` ≥ 0.8, or `about_jev_model` below 0.25, or score below 0.40 |
| **publish** | score ≥ 0.75, `about_jev_model` ≥ 0.85, `is_spam` below 0.4, the text mentions Jev or TypeSafe, both confidences ≥ 0.5, and `kind` is a demo, tool, tutorial or benchmark |
| **review** | everything in between; the response lists the reasons |

These numbers are starting points, not measurements. Tune them with the calibration set.

## Where it is used

| Path | Effect |
| --- | --- |
| Public form, `POST /api/submit/` | **reject** → the visitor is told the post does not look like a use of Jev and no pull request is opened. Otherwise the pull request title gets `[likely 0.93]` or `[check 0.58]` and the body shows every signal |
| `POST /api/posts/` with `"mode": "auto"` | **publish** → commit to `main`; **review** → pull request; **reject** → `422`, nothing written. If ranking is unavailable, falls back to a pull request |
| `POST /api/posts/` with `commit` or `pr` | Ranking is recorded and returned but does not block: the token holder decides |
| Stored entry | `relevance: { score, verdict, kind, model, checkedAt }` |
| `/community/` | Sorted by `relevance.score`, highest first, with a "Latest" toggle. Unranked posts go last. The comparator is `byRelevance` in `src/lib/sightings.ts` |

If Jev cannot be reached (timeout, 5xx, exhausted retries on 429/529) the ranking is `null` and the
flow continues without it. A ranking failure never loses a submission.

## Setup and calibration

```sh
echo "TYPESAFE_API_KEY=..." >> .env.local                 # local scripts
npx vercel env add TYPESAFE_API_KEY production            # the deployed API
npm run rank -- https://x.com/someone/status/123          # rank one post
npm run rank -- "text of a post"
npm run rank:eval                                         # calibration table
npm run rank:write                                        # rank published posts, store the score
npm run rank:write -- --force                             # re-rank posts that already have one
```

`rank:write` is how posts added by hand (or before ranking existed) get a score. It skips drafts
and ignores the verdict: those posts were already reviewed by a person, so only the order changes.

`rank:eval` runs the published posts in `src/content/sightings/` (real, expected to pass) and the
synthetic negatives and borderline cases in `scripts/rank-fixtures.json`. It reports exact
matches and **harmful errors**: junk ranked *publish*, or a real post ranked *reject*. Off-by-one
results (publish vs review) only cost a manual look. When it misfires, read the per-signal values,
then change the question wording first (the model reads literally) and the weights second. Add
every surprising real post to the fixtures so the set grows with experience.

## First run on the real model

Run on 2026-09-19 against `jev-1.13.0` with the weights and thresholds above: 7 real posts and
8 synthetic fixtures, 15,222 input tokens in total (about $0.0006).

- 0 harmful errors. All 5 synthetic negatives were rejected (scores 0.00 to 0.12) and all
  3 borderline fixtures landed in **review**.
- Real posts scored 0.53 to 0.90. 3 of 7 ranked **publish**; the other 4 ranked **review**, either
  for `about_jev_model` just under 0.85 or because the text is an announcement with little usage
  detail. That is the safe direction, so the thresholds were left alone: 7 posts is too few to
  tune on.
- Scores are not perfectly repeatable. The same post moved by up to 0.03 between two runs minutes
  apart, so treat differences that small as ties.

## Limits

- It judges the text only. A post that is just a video with "wow" will rank low; send those with
  `"mode": "pr"` or `commit`.
- English works best. Other languages rank lower; rely on review for them.
- It is a model judgment. It reduces review work; it does not replace reading the post.
