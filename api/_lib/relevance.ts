// "Is this post really about Jev?" judged by Jev itself.
//
// Design, following the official docs (https://docs.typesafe.ai):
// - One request, several small single-purpose questions (primitives page, speculative fan-out).
// - The state is an object with named fields, and carries the reference material the model needs:
//   Jev launched after most training data was written, so `background` says what Jev is
//   (state page: "the material you would present to a panel of experts").
// - Only the post goes in the state. The submitter's note is left out on purpose: text that
//   argues for its own classification can move answers (jaggedness page, adversarial content).
// - Keyword matching and all arithmetic stay in code (jaggedness page, math and numbers).
// - Scores are normalized by their top level and combined with weights we control
//   (composite scoring pattern). Noul values are thresholded directly; they have no confidence.
// - The verdict is gated on Choice/Score confidence, with a higher bar for the action that
//   publishes without review (confidence-gated routing pattern).
// Thresholds and weights are starting points. Tune them with `npm run rank:eval`.

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export const BACKGROUND = [
  'Jev is an AI model made by the company TypeSafe AI (typesafe.ai, @typesafeai on X), released in September 2026.',
  'TypeSafe calls it a "System One" model. Developers send it a state plus typed questions and get back typed answers:',
  'Choice (pick one option), Score (rate on a scale), and Noul (yes/no probability), each with probabilities and confidence.',
  'It does not generate text. People use it for fast, cheap classification, routing, scoring, filtering and ranking inside software,',
  'for example browser agents, ad blockers, spreadsheets, search, moderation and trading experiments.',
  '"Jev" can also be a person\'s name or nickname, or an unrelated word. Those uses are not about the AI model.',
].join(' ');

export const QUESTIONS = {
  about_jev_model: {
    type: 'noul',
    instructions:
      'Is `post.text` about the AI model Jev made by TypeSafe AI, as described in `background`, rather than a person, another product, or a different meaning of the word?',
    criteria: {
      true: 'The post talks about the Jev model, TypeSafe AI, or System One models as a technology',
      false: 'The post is about something else, or the word Jev refers to a person, place or unrelated thing',
    },
  },
  usage_depth: {
    type: 'score',
    instructions: 'How concretely does `post.text` show someone building or using something with the Jev model?',
    criteria: [
      'No use of Jev is described. The post is news, opinion, a joke, a question, or unrelated',
      'The author says they tried Jev or plan to, without describing what they did',
      'The author describes a specific thing built or done with Jev',
      'The author describes a specific thing built with Jev and gives details such as what it decides, results, speed, cost, code or a demo',
    ],
  },
  first_hand: {
    type: 'noul',
    instructions: 'Is the author of `post.text` describing something they built or tried themselves?',
  },
  kind: {
    type: 'choice',
    instructions: 'What kind of post is `post.text`?',
    criteria: {
      project_demo: 'Shows a project, app, agent, extension or experiment built with Jev',
      tool_or_library: 'Announces a library, CLI, SDK, plugin or integration that lets others use Jev',
      tutorial_or_explainer: 'Teaches how Jev works or how to do something with it',
      benchmark_or_comparison: 'Compares Jev with other models on speed, cost or quality',
      opinion_or_news: 'Commentary, reaction, announcement or news without a concrete use',
      promotion_or_hiring: 'Advertising, hiring, fundraising or engagement bait',
      unrelated: 'Not about the Jev model',
    },
  },
  is_spam: {
    type: 'noul',
    instructions:
      'Is `post.text` spam, such as a crypto or token promotion, a giveaway, a scam, or engagement bait that uses a trending name to get attention?',
  },
} as const;

export const WEIGHTS = { about: 0.45, usage: 0.35, firstHand: 0.1, keyword: 0.1 };
export const THRESHOLDS = {
  publish: 0.75, // composite needed to publish without review
  review: 0.4, // below this, reject
  aboutFloor: 0.25, // about_jev_model below this is a reject regardless of the composite
  aboutPublish: 0.85,
  spamReject: 0.8,
  spamReview: 0.4,
  confidenceFloor: 0.5, // TypeSafe's "do not act" floor for Choice and Score
};
export const USEFUL_KINDS = ['project_demo', 'tool_or_library', 'tutorial_or_explainer', 'benchmark_or_comparison'];

export type Verdict = 'publish' | 'review' | 'reject';

export interface Relevance {
  score: number; // 0 to 1 composite
  verdict: Verdict;
  reasons: string[];
  kind: string;
  signals: {
    aboutJevModel: number;
    usageDepth: number; // normalized 0 to 1
    usageConfidence: number;
    firstHand: number;
    isSpam: number;
    kindConfidence: number;
    keywordHit: boolean;
  };
  model: string;
  inputTokens: number;
  checkedAt: string;
}

export interface PostForRanking {
  text: string;
  source: string;
  authorName?: string;
  authorHandle?: string;
}

// Exact string matching is code's job, not the model's.
export const keywordHit = (p: PostForRanking) =>
  /\bjev\b|typesafe|system[\s-]?one model/i.test(`${p.text} ${p.authorHandle ?? ''}`);

interface JevAnswers {
  about_jev_model: { noul: number };
  usage_depth: { score: number; confidence: number };
  first_hand: { noul: number };
  kind: { choice: string; confidence: number };
  is_spam: { noul: number };
}

export function decide(a: JevAnswers, keyword: boolean, model = 'unknown', inputTokens = 0): Relevance {
  const usage = a.usage_depth.score / (QUESTIONS.usage_depth.criteria.length - 1);
  const composite =
    WEIGHTS.about * a.about_jev_model.noul + WEIGHTS.usage * usage + WEIGHTS.firstHand * a.first_hand.noul + WEIGHTS.keyword * (keyword ? 1 : 0);
  const score = Math.round(Math.max(0, composite - 0.5 * a.is_spam.noul) * 1000) / 1000;

  const reasons: string[] = [];
  let verdict: Verdict;
  if (a.is_spam.noul >= THRESHOLDS.spamReject) {
    verdict = 'reject';
    reasons.push('looks like spam');
  } else if (a.about_jev_model.noul < THRESHOLDS.aboutFloor) {
    verdict = 'reject';
    reasons.push('does not appear to be about the Jev model');
  } else if (score < THRESHOLDS.review) {
    verdict = 'reject';
    reasons.push('no concrete use of Jev described');
  } else {
    verdict = 'publish';
    const hold = (why: string) => {
      verdict = 'review';
      reasons.push(why);
    };
    if (score < THRESHOLDS.publish) hold('composite score below the publish threshold');
    if (a.about_jev_model.noul < THRESHOLDS.aboutPublish) hold('not certain it is about the Jev model');
    if (a.is_spam.noul >= THRESHOLDS.spamReview) hold('possible spam');
    if (!keyword) hold('no mention of Jev or TypeSafe found in the text');
    if (a.usage_depth.confidence < THRESHOLDS.confidenceFloor) hold('model unsure how concrete the usage is');
    if (a.kind.confidence < THRESHOLDS.confidenceFloor) hold('model unsure what kind of post this is');
    if (!USEFUL_KINDS.includes(a.kind.choice)) hold(`classified as ${a.kind.choice}`);
    if (verdict === 'publish') reasons.push('about Jev, concrete usage, confident answers');
  }

  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    score,
    verdict,
    reasons,
    kind: a.kind.choice,
    signals: {
      aboutJevModel: r3(a.about_jev_model.noul),
      usageDepth: r3(usage),
      usageConfidence: r3(a.usage_depth.confidence),
      firstHand: r3(a.first_hand.noul),
      isSpam: r3(a.is_spam.noul),
      kindConfidence: r3(a.kind.confidence),
      keywordHit: keyword,
    },
    model,
    inputTokens,
    checkedAt: new Date().toISOString(),
  };
}

export const rankingEnabled = () => Boolean(process.env.TYPESAFE_API_KEY);

// Returns null when ranking is not configured or Jev cannot be reached; callers then fall back
// to human review instead of failing the submission.
export async function rankPost(post: PostForRanking): Promise<Relevance | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  const body = JSON.stringify({
    model: process.env.JEV_MODEL ?? 'jev-latest',
    state: {
      background: BACKGROUND,
      post: { source: post.source, author_name: post.authorName ?? null, author_handle: post.authorHandle ?? null, text: post.text.slice(0, 4000) },
    },
    questions: QUESTIONS,
  });

  // 429 and 529 are retryable with backoff (API reference, "Handling rate limits").
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 429 || res.status === 529) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      if (!res.ok) return null;
      const data = (await res.json()) as { model: string; answers: JevAnswers; usage?: { input_tokens?: number } };
      return decide(data.answers, keywordHit(post), data.model, data.usage?.input_tokens ?? 0);
    } catch {
      return null;
    }
  }
  return null;
}

// What gets stored with the entry and shown in pull requests.
export const stored = (r: Relevance) => ({ score: r.score, verdict: r.verdict, kind: r.kind, model: r.model, checkedAt: r.checkedAt });

export function markdownReport(r: Relevance | null): string {
  if (!r) return '_Relevance ranking was not run (no `TYPESAFE_API_KEY`, or Jev was unreachable)._';
  const s = r.signals;
  return [
    `**Jev relevance: ${r.score.toFixed(2)} → ${r.verdict}** (${r.reasons.join('; ')})`,
    '',
    '| Signal | Value |',
    '| --- | --- |',
    `| About the Jev model (Noul) | ${s.aboutJevModel} |`,
    `| Usage depth (Score, normalized) | ${s.usageDepth} (confidence ${s.usageConfidence}) |`,
    `| First-hand (Noul) | ${s.firstHand} |`,
    `| Kind (Choice) | ${r.kind} (confidence ${s.kindConfidence}) |`,
    `| Spam (Noul) | ${s.isSpam} |`,
    `| Mentions Jev or TypeSafe (code) | ${s.keywordHit ? 'yes' : 'no'} |`,
    '',
    `Model \`${r.model}\`, ${r.inputTokens} input tokens. A model judgment, not a guarantee: check the post yourself.`,
  ].join('\n');
}
