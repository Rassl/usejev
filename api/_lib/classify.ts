// Card metadata that Jev can decide: category, matching use case, and which primitives the post
// names. Titles and summaries stay a person's job: Jev does not generate text.
//
// One request, all questions share the state (fan-out). Choice answers are only used above the
// 0.5 confidence floor; the catch-all options mean "leave the field empty", which is always safe.
// `primitives` follows the README rule: only when the post itself states the question type, so
// the Noul bar is high.

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

// Keep the first four as they are: they are already in use on /community/.
export const CATEGORIES = {
  Agents: 'An AI agent, agent harness or tool-calling loop where Jev makes routing or control decisions',
  'Browser extensions': 'A browser extension or something that acts on web pages in the browser',
  'Developer tools': 'A library, SDK, CLI, MCP server, plugin or other tool for developers',
  Productivity: 'Personal or office workflows such as email, notes, expenses, spreadsheets, documents',
  Games: 'Jev playing or powering a game',
  'Trading and finance': 'Markets, trading experiments, betting, pricing or financial data',
  Robotics: 'Robots, simulation of robots, or control of physical devices',
  'Search and data': 'Search, ranking, recommendation, data labeling, extraction or analytics',
  'Moderation and safety': 'Content moderation, spam or ad filtering, security, prompt-injection screening',
  Benchmarks: 'Measuring Jev or comparing it with other models on speed, cost or quality',
  other: 'None of these fit',
} as const;

export interface UseCaseOption {
  slug: string;
  title: string;
  description: string;
}

export interface CardFields {
  category?: string;
  useCases: string[];
  primitives: ('Choice' | 'Score' | 'Noul')[];
  confidence: { category: number; useCase: number };
  inputTokens: number;
}

const CONFIDENCE_FLOOR = 0.5;
const PRIMITIVE_BAR = 0.8;

export async function classifyPost(text: string, useCases: UseCaseOption[]): Promise<CardFields | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  const names = (p: string) => `Does \`post\` explicitly name Jev's ${p} question type as something the author used?`;
  const body = JSON.stringify({
    model: process.env.JEV_MODEL ?? 'jev-latest',
    state: {
      background:
        'Jev is an AI model from TypeSafe AI. Developers send it a state plus typed questions: Choice (pick one option), Score (rate on a scale) and Noul (yes/no probability). `post` is a social media post about something built with Jev.',
      post: text.slice(0, 4000),
    },
    questions: {
      category: { type: 'choice', instructions: 'Which category best describes what was built or shown in `post`?', criteria: CATEGORIES },
      use_case: {
        type: 'choice',
        instructions: 'Which of these documented use cases is `post` an example of? Pick `none` unless one clearly matches.',
        criteria: { ...Object.fromEntries(useCases.map((u) => [u.slug, `${u.title}. ${u.description}`])), none: 'None of these clearly matches' },
      },
      names_choice: { type: 'noul', instructions: names('Choice') },
      names_score: { type: 'noul', instructions: names('Score') },
      names_noul: { type: 'noul', instructions: names('Noul') },
    },
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(8000) });
      if (res.status === 429 || res.status === 529) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      if (!res.ok) return null;
      const { answers: a, usage } = (await res.json()) as {
        answers: { category: { choice: string; confidence: number }; use_case: { choice: string; confidence: number } } & Record<'names_choice' | 'names_score' | 'names_noul', { noul: number }>;
        usage?: { input_tokens?: number };
      };
      const sure = (c: { choice: string; confidence: number }, catchAll: string) => c.confidence >= CONFIDENCE_FLOOR && c.choice !== catchAll;
      // Exact word matching is code's job: a primitive only counts if the word is in the text.
      const named = (word: 'Choice' | 'Score' | 'Noul', noul: number) => noul >= PRIMITIVE_BAR && new RegExp(`\\b${word}\\b`, 'i').test(text);
      return {
        category: sure(a.category, 'other') ? a.category.choice : undefined,
        useCases: sure(a.use_case, 'none') ? [a.use_case.choice] : [],
        primitives: ([['Choice', a.names_choice.noul], ['Score', a.names_score.noul], ['Noul', a.names_noul.noul]] as const).filter(([w, n]) => named(w, n)).map(([w]) => w),
        confidence: { category: a.category.confidence, useCase: a.use_case.confidence },
        inputTokens: usage?.input_tokens ?? 0,
      };
    } catch {
      return null;
    }
  }
  return null;
}
