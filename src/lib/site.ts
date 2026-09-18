export const SITE = {
  url: 'https://usejev.dev',
  name: 'usejev.dev: Jev Use Cases (Unofficial)',
  shortName: 'usejev.dev',
  description:
    'Practical, unofficial use cases for Jev, the System One model from TypeSafe AI. Question designs, verified Python and TypeScript code, and cost math.',
  disclaimer: 'Unofficial community resource. Not affiliated with TypeSafe AI.',
  ogImage: '/og.png',
};

export const DOCS = {
  home: 'https://docs.typesafe.ai',
  api: 'https://docs.typesafe.ai/api',
  primitives: 'https://docs.typesafe.ai/primitives',
  choice: 'https://docs.typesafe.ai/primitives/choice',
  score: 'https://docs.typesafe.ai/primitives/score',
  noul: 'https://docs.typesafe.ai/primitives/noul',
  confidence: 'https://docs.typesafe.ai/confidence',
  models: 'https://docs.typesafe.ai/models',
  jaggedness: 'https://docs.typesafe.ai/model-jaggedness/jev-1.13',
  python: 'https://docs.typesafe.ai/sdk/python',
  javascript: 'https://docs.typesafe.ai/sdk/javascript',
  launchPost: 'https://typesafe.ai/blog/introducing-system-one-models-and-jev',
  vendor: 'https://typesafe.ai',
};

// USD per million input tokens. Source: https://docs.typesafe.ai/models
export const PRICE_PER_MTOK = 0.042;

export function costFor(tokensPerItem: number, items: number): string {
  const usd = (tokensPerItem * items * PRICE_PER_MTOK) / 1_000_000;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString('en-US')}`;
}

export const GUIDES = [
  {
    href: '/guides/what-is-jev/',
    title: 'What is Jev?',
    blurb: 'System One vs LLMs, the three primitives, confidence, pricing, and limitations.',
  },
  {
    href: '/guides/jev-vs-llm-classification/',
    title: 'Jev vs LLMs for classification',
    blurb: 'Cost and latency math, and an honest list of when an LLM is the better tool.',
  },
  {
    href: '/guides/confidence-thresholds/',
    title: 'Confidence thresholds',
    blurb: 'How to gate automated actions on confidence and tune the thresholds on your data.',
  },
];
