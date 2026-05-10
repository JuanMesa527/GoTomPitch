import { z } from 'zod';

/**
 * Sub-shapes que vienen del pipeline upstream (Find/Qualify/Engage). Snake_case porque
 * así llegan estandarizados desde los servicios anteriores.
 */
const ContactSchema = z
  .object({
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
  })
  .partial();

const ViabilitySchema = z
  .object({
    icp_score: z.number().optional(),
    priority: z.string().optional(),
    viable: z.boolean().optional(),
    score_breakdown: z.record(z.string(), z.number()).optional(),
  })
  .partial();

const MarketingMetricsSchema = z
  .object({
    estimated_acv_usd: z.number().optional(),
    estimated_acl_months: z.number().optional(),
    estimated_ltv_usd: z.number().optional(),
    estimated_cac_usd: z.number().optional(),
    ltv_cac_ratio: z.number().optional(),
    projected_roas: z.number().optional(),
    estimated_roi: z.number().optional(),
    cpr_estimate: z.number().optional(),
    metric_confidence: z.string().optional(),
  })
  .partial();

const BusinessIntelligenceSchema = z
  .object({
    estimated_size: z.string().optional(),
    digital_presence_score: z.number().optional(),
    pain_points: z.array(z.string()).optional(),
    growth_signals: z.array(z.string()).optional(),
    risk_flags: z.array(z.string()).optional(),
    why_viable: z.string().optional(),
  })
  .partial();

const CommercialFoundationSchema = z
  .object({
    trust_signal: z.string().optional(),
    common_ground: z.string().optional(),
    personalized_value_prop: z.string().optional(),
    objection_prep: z.string().optional(),
  })
  .partial();

const CommercialApproachSchema = z
  .object({
    recommended_channel: z.string().optional(),
    conversation_tone: z.string().optional(),
    best_contact_time: z.string().optional(),
    opening_line: z.string().optional(),
    talk_track: z.array(z.string()).optional(),
    commercial_foundation: CommercialFoundationSchema.optional(),
  })
  .partial();

/**
 * Forma estandarizada del prospecto al que se le va a hacer pitch.
 * Mezcla campos legacy (name, recentNews, painPoints) con la forma actual del pipeline
 * (snake_case + secciones business_intelligence / commercial_approach / etc.).
 */
export const ClientSnapshotSchema = z
  .object({
    clientId: z.string(),
    name: z.string(),

    // Legacy / planos
    website: z.string().url().optional(),
    industry: z.string().optional(),
    size: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    techStack: z.array(z.string()).optional(),
    decisionMakers: z
      .array(z.object({ name: z.string(), role: z.string().optional(), linkedin: z.string().optional() }))
      .optional(),
    recentNews: z
      .array(
        z.object({
          title: z.string(),
          date: z.string().optional(),
          url: z.string().optional(),
          summary: z.string().optional(),
        }),
      )
      .optional(),
    painPoints: z.array(z.string()).optional(),
    competitors: z.array(z.string()).optional(),
    socialSignals: z.array(z.string()).optional(),

    // Pipeline upstream (snake_case)
    category: z.string().optional(),
    rank: z.number().optional(),
    contact: ContactSchema.optional(),
    viability: ViabilitySchema.optional(),
    marketing_metrics: MarketingMetricsSchema.optional(),
    business_intelligence: BusinessIntelligenceSchema.optional(),
    commercial_approach: CommercialApproachSchema.optional(),
  })
  .passthrough();
export type ClientSnapshot = z.infer<typeof ClientSnapshotSchema>;

export const CardCategory = z.enum(['opportunity', 'tip', 'critical', 'risk']);
export type CardCategory = z.infer<typeof CardCategory>;

export const CardSchema = z.object({
  category: CardCategory,
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  sourceRefs: z.array(z.string()).optional(),
});
export type CardInput = z.infer<typeof CardSchema>;

export const PitchItemSchema = z.object({
  cardId: z.string().uuid(),
  position: z.number().int().nonnegative(),
  note: z.string().max(1000).optional(),
});
export type PitchItem = z.infer<typeof PitchItemSchema>;

export const CreateSessionSchema = z.object({
  clientId: z.string().min(1),
  clientSnapshot: ClientSnapshotSchema,
  // Quién es dueño de la sesión. Opcional para no romper flujos legacy / MOCK_MODE sin auth,
  // pero el front lo manda siempre que haya usuario logueado.
  userId: z.string().uuid().optional(),
});

export const PatchPitchSchema = z.object({
  items: z.array(PitchItemSchema),
});

/**
 * Pitch generado: estructura fija para que la UI lo renderice de forma consistente
 * y se pueda copiar/leer en voz alta sin parsear markdown.
 */
export const PitchSectionSchema = z.object({
  title: z.string(),
  body: z.string(),
});
export type PitchSection = z.infer<typeof PitchSectionSchema>;

export const GeneratedPitchSchema = z.object({
  client_name: z.string(),
  duration_minutes: z.number().min(2).max(8),
  tone: z.string().nullable(),
  channel: z.string().nullable(),
  sections: z.array(PitchSectionSchema).min(3).max(7),
});
export type GeneratedPitch = z.infer<typeof GeneratedPitchSchema>;
