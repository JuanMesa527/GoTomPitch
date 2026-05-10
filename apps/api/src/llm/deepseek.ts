import OpenAI from 'openai';
import { env } from '../env.js';
import {
  CardSchema,
  GeneratedPitchSchema,
  type CardInput,
  type ClientSnapshot,
  type GeneratedPitch,
} from '../schemas.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import { PITCH_SYSTEM_PROMPT, buildPitchUserPrompt, type PitchInput } from './pitchPrompt.js';

const client = new OpenAI({
  apiKey: env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1',
});

/**
 * Llama a DeepSeek con streaming y emite cada card validada apenas se completa una línea NDJSON.
 * El parser mantiene un buffer y va liberando líneas terminadas en \n.
 */
export async function* streamCardsDeepseek(snapshot: ClientSnapshot): AsyncGenerator<CardInput, void, void> {
  const stream = await client.chat.completions.create({
    model: env.DEEPSEEK_MODEL,
    stream: true,
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(snapshot) },
    ],
  });

  let buffer = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (!delta) continue;
    buffer += delta;

    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      const card = tryParseLine(line);
      if (card) yield card;
    }
  }

  // flush final
  const tail = buffer.trim();
  if (tail) {
    const card = tryParseLine(tail);
    if (card) yield card;
  }
}

/**
 * Genera el pitch final como JSON estructurado. Usa response_format json_object para reducir
 * el riesgo de salida con backticks/markdown.
 */
export async function generatePitchDeepseek(input: PitchInput): Promise<GeneratedPitch> {
  const completion = await client.chat.completions.create({
    model: env.DEEPSEEK_MODEL,
    temperature: 0.5,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PITCH_SYSTEM_PROMPT },
      { role: 'user', content: buildPitchUserPrompt(input) },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? '';
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(cleaned);
  return GeneratedPitchSchema.parse(parsed);
}

function tryParseLine(line: string): CardInput | null {
  if (!line) return null;
  // tolera líneas con backticks, comas finales, o prefijos accidentales
  const cleaned = line.replace(/^```(?:json)?/i, '').replace(/```$/, '').replace(/,\s*$/, '').trim();
  if (!cleaned.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(cleaned);
    const result = CardSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
