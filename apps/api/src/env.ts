import 'dotenv/config';
import { z } from 'zod';

const boolish = z
  .union([z.string(), z.boolean()])
  .transform((v) => v === true || v === 'true' || v === '1');

const base = z.object({
  PORT: z.coerce.number().default(3001),
  MOCK_MODE: boolish.default(false),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  INTERNAL_API_KEY: z.string().min(8),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  MOCK_LLM_DELAY_MS: z.coerce.number().default(350),
});

const parsed = base.parse(process.env);

// En modo real exigimos Supabase + DeepSeek; en mock pueden faltar.
if (!parsed.MOCK_MODE) {
  const missing: string[] = [];
  if (!parsed.DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY');
  if (!parsed.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!parsed.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length > 0) {
    throw new Error(
      `Faltan envs (${missing.join(', ')}). Define MOCK_MODE=true para correr sin Supabase/DeepSeek.`,
    );
  }
}

export const env = parsed;
