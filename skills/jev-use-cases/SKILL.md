---
name: jev-use-cases
description: Design and implement decisions with Jev, TypeSafe AI's System One model (typed Choice, Score and Noul questions with probabilities and confidence). Use when the user wants to classify, route, score, filter, re-rank, or gate actions with Jev or the TypeSafe API, or asks for Jev examples. Unofficial community skill.
---

# Jev use cases (unofficial)

Community skill from https://usejev.dev. Not affiliated with TypeSafe AI. The official docs
(https://docs.typesafe.ai, index at https://docs.typesafe.ai/llms.txt) are authoritative; re-check
them before relying on any API detail here.

## Workflow

1. **Check the fit.** Jev suits closed-set snap judgments consumed by software: routing,
   classification, scoring, yes/no flags, re-ranking. It cannot generate text, and it is
   unreliable at counting, arithmetic, date comparison, and multi-hop reasoning. Keep those in
   code or use an LLM.
2. **Find the closest worked example.** Fetch https://usejev.dev/use-cases.json, pick by
   `primitives` and `category`, then read its `markdown` URL. Inside a clone of the repo, read
   `src/content/use-cases/<slug>.mdx` instead.
3. **Design questions.** One judgment per question. Put the full question in `instructions`
   (question IDs are not sent to the model). Choice: up to 255 options, include `other` or `none`.
   Score: ordered level descriptions, at least two. Noul: a precise yes/no condition. Reference
   state fields by path in backticks. Send every question that shares a state in one request.
4. **Trim the state** to the fields the decision needs. Irrelevant content lowers accuracy.
5. **Write decision logic in code.** Gate on `confidence` for Choice and Score (it is not the top
   probability). Noul has no `confidence`; threshold the `noul` value with two cutoffs. Raise
   thresholds with the cost of a mistake, keep a human fallback, and tune on labelled data. See
   https://usejev.dev/guides/confidence-thresholds.md.
6. **Estimate cost** from `usage.input_tokens`: tokens x $0.042 / 1,000,000; output is free.

## Verified API shape

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <TYPESAFE_API_KEY>
```

Body: `state` (string, object, or array), `model` (`"jev-latest"`), `questions` (map of id to
`{ type: "choice" | "score" | "noul", instructions, criteria }`). Response: `model`, `answers`
(same ids), `usage`.

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient  # pip install typesafe-sdk

client = TypeSafeClient()  # reads TYPESAFE_API_KEY
response = client.system_one(
    state={"subject": "...", "body": "..."},
    questions={
        "queue": Choice(instructions="Which team should handle `body`?",
                        criteria={"billing": "Charges and refunds", "technical": "Bugs", "other": None}),
        "severity": Score(instructions="How severe is the problem in `body`?",
                          criteria=["Minor", "Degraded", "Down"]),
        "is_spam": Noul(instructions="Is this message spam?"),
    },
)
response.answers["queue"].choice, response.answers["queue"].confidence
response.answers["severity"].score      # probability-weighted, may be fractional
response.answers["is_spam"].noul        # 0 to 1; no confidence field
```

```ts
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk"; // npm i @typesafe-ai/sdk

const client = new TypeSafeClient();
const response = await client.systemOne({
  state: { subject: "...", body: "..." },
  questions: {
    queue: choice("Which team should handle `body`?", { billing: "Charges and refunds", technical: "Bugs", other: null }),
    severity: score("How severe is the problem in `body`?", ["Minor", "Degraded", "Down"]),
    is_spam: noul("Is this message spam?"),
  },
});
response.answers.queue.choice;
```

Full notes with sources: https://github.com/Rassl/usejev/blob/main/docs/jev-api-notes.md

## Do not

- Invent fields, endpoints, or parameters. If it is not in the official docs, do not use it.
- Read `confidence` as accuracy, or copy a threshold from a Choice to a Noul.
- Feed one answer into another question in the same request; they are independent. Make a second
  request only when code needs the first answer to build it.
- Claim Jev "cannot be wrong". It cannot fabricate text, but it can pick the wrong option.
