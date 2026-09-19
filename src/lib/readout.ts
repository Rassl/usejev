// Pulls the example state and example response out of a use case's MDX body so the page can
// draw them as a readout. The numbers stay in one place: the JSON the author wrote.

export type Answer =
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; legend?: Record<string, string>; probabilities: Record<string, number>; confidence: number }
  | { type: 'noul'; noul: number };

function jsonBlockAfter(body: string, heading: string): unknown {
  const start = body.indexOf(`## ${heading}`);
  if (start < 0) return undefined;
  const next = body.indexOf('\n## ', start + 3);
  const section = body.slice(start, next < 0 ? undefined : next);
  const block = section.match(/```json\n([\s\S]*?)```/)?.[1];
  if (!block) return undefined;
  try {
    return JSON.parse(block);
  } catch {
    return undefined;
  }
}

export function exampleAnswers(body: string): Record<string, Answer> | undefined {
  const parsed = jsonBlockAfter(body, 'Example response') as { answers?: Record<string, Answer> } | undefined;
  const answers = parsed?.answers;
  if (!answers || typeof answers !== 'object') return undefined;
  const ok = Object.values(answers).every((a) => a && ['choice', 'score', 'noul'].includes(a.type));
  return ok ? answers : undefined;
}

export function exampleState(body: string): string | undefined {
  const parsed = jsonBlockAfter(body, 'Question design');
  if (parsed === undefined) return undefined;
  const lines = JSON.stringify(parsed, null, 2).split('\n');
  const max = 16;
  return lines.length > max ? [...lines.slice(0, max), '  …'].join('\n') : lines.join('\n');
}
