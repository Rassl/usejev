// Assumptions for the worked cost example in /guides/jev-vs-llm-classification/.
// Shared by the MDX page and the Markdown/llms.txt exports so the numbers cannot drift.
import { PRICE_PER_MTOK } from './site';

export const ITEMS = 1_000_000;
export const IN_TOK = 400;
export const LLM_PROMPT_OVERHEAD = 150;
export const OUT_TOK = 20;

// Illustrative round numbers, not quotes for any vendor or model.
export const tiers = [
  { name: 'Small LLM tier', inPrice: 0.1, outPrice: 0.4 },
  { name: 'Mid LLM tier', inPrice: 1, outPrice: 5 },
  { name: 'Frontier LLM tier', inPrice: 10, outPrice: 50 },
];

export const jevCost = (ITEMS * IN_TOK * PRICE_PER_MTOK) / 1e6;
export const llmCost = (t: { inPrice: number; outPrice: number }) =>
  (ITEMS * ((IN_TOK + LLM_PROMPT_OVERHEAD) * t.inPrice + OUT_TOK * t.outPrice)) / 1e6;
export const usd = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function costTableMarkdown(): string {
  const rows = [
    '| Option | Input price / MTok | Output price / MTok | Cost for 1M items | Multiple of Jev |',
    '| --- | --- | --- | --- | --- |',
    `| Jev | $${PRICE_PER_MTOK} | free | ${usd(jevCost)} | 1x |`,
    ...tiers.map(
      (t) => `| ${t.name} (illustrative) | ${usd(t.inPrice)} | ${usd(t.outPrice)} | ${usd(llmCost(t))} | ${Math.round(llmCost(t) / jevCost)}x |`,
    ),
  ];
  return rows.join('\n');
}
