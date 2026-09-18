# Jev API notes (verified against the official docs)

Verified on 2026-09-19 against https://docs.typesafe.ai (index: https://docs.typesafe.ai/llms.txt)
and https://typesafe.ai. Every code sample on usejev.dev must stay inside the shape below.
If a field, method, or number is not in this file, do not use it without re-checking the docs.

## Sources

| Fact | Source |
| --- | --- |
| HTTP API shape | https://docs.typesafe.ai/api |
| Primitives, fan-out, dependencies | https://docs.typesafe.ai/primitives |
| 255-option Choice limit | https://docs.typesafe.ai/primitives/choice |
| Confidence | https://docs.typesafe.ai/confidence |
| Price, rate limits, context, aliases, language | https://docs.typesafe.ai/models |
| Known failure modes | https://docs.typesafe.ai/model-jaggedness/jev-1.13 |
| Python SDK | https://docs.typesafe.ai/sdk/python, https://docs.typesafe.ai/sdk/python/usage |
| JavaScript SDK | https://docs.typesafe.ai/sdk/javascript, https://docs.typesafe.ai/sdk/javascript/api |
| 70–500 ms latency, launch date, founder | https://typesafe.ai/blog/introducing-system-one-models-and-jev |

## HTTP API

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

Request body:

- `state` (required): `string | object | array`. Text only; no image/audio/video.
- `model` (required over raw HTTP): use `"jev-latest"`. Aliases: `jev-latest`, `jev-preview`
  (both currently → `jev-1.13.0`). Pin `jev-1.13.0` if thresholds were tuned on it.
- `questions` (required): `map<string, Question>`. Keys are yours; they are **not** sent to the
  model, so the full question must be in `instructions`.

Question types (all have `type` and `instructions: string | object | array`):

| `type` | `criteria` | Notes |
| --- | --- | --- |
| `"noul"` | optional `{ "true": string, "false": string }` | yes/no |
| `"choice"` | required `map<option, string \| null>` | up to 255 options; add `other`/`none` |
| `"score"` | required ordered `array` of level descriptions, ≥ 2 | levels indexed from 0 |

Response body: `model`, `answers` (same keys), `usage: { input_tokens, output_tokens }`.

Answer types:

- Noul: `{ type: "noul", noul: number }`. Probability of yes, 0–1. **No `confidence` field.**
- Choice: `{ type: "choice", choice, probabilities: map<option, number>, confidence }`.
- Score: `{ type: "score", score, legend: map<"0".., string>, probabilities: map<"0".., number>, confidence }`.
  `score` is probability-weighted and can land between levels. Do not interpolate exact
  magnitudes from it (jaggedness page); threshold it instead.

Errors: `401`, `422` (validation), `429` (rate limit), `529` (overloaded). Retry 429/529 with
exponential backoff; the SDKs do this by default.

`GET /v1/models` lists models/aliases (`name`, `description`, `release_date`).

## Python SDK (`pip install typesafe-sdk`, Python ≥ 3.10)

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

client = TypeSafeClient()  # reads TYPESAFE_API_KEY; default model jev-latest
response = client.system_one(
    state=...,            # str | dict | list
    questions={
        "id": Choice(instructions="...", criteria={"a": "desc", "b": None}),
        "id2": Score(instructions="...", criteria=["low", "mid", "high"]),
        "id3": Noul(instructions="..."),
    },
)
response.answers["id"].choice / .probabilities / .confidence
response.answers["id2"].score / .probabilities / .confidence
response.answers["id3"].noul
```

Also verified: `AsyncTypeSafeClient` (`async with`, `await client.system_one(...)`), typed
accessors `result.choices[...]`, `result.scores[...]`, `result.nouls[...]`, `TypeSafeClient(model=...)`,
`RetryPolicy(max_retries=, backoff_max=, timeout=)` via `retry=`, `TypeSafeAPIError`
(`.status`, `.request_id`), `response_model=` with `SystemOneResponse`, raw dict questions.

Noul criteria in Python: `Noul(instructions=..., criteria=NoulCriteria(true="...", false="..."))`,
with `NoulCriteria` imported from `typesafe_sdk` (verified in
https://docs.typesafe.ai/sdk/python/api/types/questions). The site's samples mostly omit Noul
criteria for brevity.

## JavaScript SDK (`npm install @typesafe-ai/sdk`, Node ≥ 20)

```ts
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient(); // reads TYPESAFE_API_KEY
const response = await client.systemOne({
  state: ...,                        // string | JSON object | array
  questions: {
    id: choice("instructions", { a: "desc", b: null }),
    id2: score("instructions", ["low", "mid", "high"]),
    id3: noul("instructions", { true: "...", false: "..." }), // criteria optional
  },
  // model?: string  (optional override)
});
response.answers.id.choice / .probabilities / .confidence
response.answers.id2.score / .probabilities / .legend / .confidence
response.answers.id3.noul
response.model, response.usage
```

Answer types are inferred from the questions. Error classes include `APIError`,
`RateLimitError`, `APITimeoutError`, `AuthenticationError`.

## Numbers

- Price: $0.042 per million input tokens ($42 per billion). Output tokens are free.
- Latency: 70–500 ms end to end (vendor claim, launch blog post).
- Rate limits (subject to change): 250,000 tokens/s, 1,200 requests/min.
- Context: 64k tokens per request (state + all questions); 32k for state + longest question.
  (The Primitives page says "around 32,000 tokens". Treat 32k as the practical budget.)
- English is the primary language; test other languages before relying on them.
- Same weights for every account; no fine-tuning. Customer data is not used for training.

## Design rules from TypeSafe

- One snap judgment per question; split complex judgments and combine in code (composite scoring).
- Send all questions that share a state in one request (speculative fan-out); questions are
  evaluated in parallel and independently. One answer is never context for another.
- Make a second request only when code needs the first answer to build it (e.g. hierarchical
  classification, fetching more state).
- Reference state fields by path in backticks, e.g. `` `ticket.messages[0].text` ``.
- Confidence: below ~0.5, do not act; raise the bar (e.g. > 0.9) for high-stakes actions. Tune on your data.

## Known limitations (jev-1.13 jaggedness page)

Literal reading; no reliable counting/math; dates compared as text; indirection and double
negatives hurt; large irrelevant state hurts ("context rot"); adversarial content in state can
move answers; contradictory instructions/criteria; no structural invariants between questions
(a Noul and a yes/no Choice can disagree; do not reuse thresholds across types); no text generation.

## Marketing claims to handle carefully

TypeSafe says Jev "can't hallucinate" / "Zero Hallucinations". Accurate framing for this site:
Jev cannot fabricate text or return a value outside your options, but it can still pick the
wrong option. Their own FAQ includes "Can Jev still get things wrong?".
