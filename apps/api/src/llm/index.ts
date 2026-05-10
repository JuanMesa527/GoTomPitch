import { env } from '../env.js';
import type { CardInput, ClientSnapshot, GeneratedPitch } from '../schemas.js';
import { streamCardsMock } from './mock.js';
import { generatePitchMock } from './mockPitch.js';
import type { PitchInput } from './pitchPrompt.js';

export async function* streamCards(snapshot: ClientSnapshot): AsyncGenerator<CardInput, void, void> {
  if (env.MOCK_MODE) {
    yield* streamCardsMock(snapshot);
    return;
  }
  const { streamCardsDeepseek } = await import('./deepseek.js');
  yield* streamCardsDeepseek(snapshot);
}

export async function generatePitch(input: PitchInput): Promise<GeneratedPitch> {
  if (env.MOCK_MODE) return generatePitchMock(input);
  const { generatePitchDeepseek } = await import('./deepseek.js');
  return generatePitchDeepseek(input);
}
