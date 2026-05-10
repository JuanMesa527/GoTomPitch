import type { ClientSnapshot, GeneratedPitch } from '../schemas.js';

export type PitchInput = {
  snapshot: ClientSnapshot;
  cards: { category: string; title: string; body: string; note?: string | null }[];
  /** Indicaciones libres del vendedor para regenerar/ajustar el pitch. */
  instructions?: string;
};

export const PITCH_SYSTEM_PROMPT = `Eres un coach senior de ventas B2B. Tu tarea: tomar un set ordenado de battlecards seleccionadas por el vendedor + el snapshot del cliente, y producir un pitch listo para decirse en voz alta.

OBJETIVO:
- Pitch de 3 a 5 minutos hablado (~600 a 1100 palabras totales).
- Tono natural, hablado, en español neutro LATAM. Cero relleno corporativo.
- Conectar con el cliente concreto — usar su nombre, su contexto, sus números.

USAR (cuando estén en el snapshot):
- commercial_approach.opening_line como base/ancla del arranque.
- commercial_approach.commercial_foundation.common_ground en el segundo bloque.
- commercial_approach.talk_track como guion subyacente del flujo.
- commercial_approach.commercial_foundation.personalized_value_prop como núcleo del pitch.
- commercial_approach.commercial_foundation.objection_prep para anticipar la objeción más probable.
- business_intelligence.pain_points y growth_signals para dar evidencia.
- viability.icp_score / marketing_metrics solo si refuerza un argumento; nunca leer cifras secas.

REGLAS DE SALIDA — críticas:
- Devolver EXCLUSIVAMENTE un objeto JSON válido. Nada de markdown, nada de texto fuera.
- Esquema EXACTO:
{
  "client_name": string,
  "duration_minutes": number,        // entero entre 3 y 5
  "tone": string | null,
  "channel": string | null,
  "sections": [{ "title": string, "body": string }]
}
- 4 a 6 sections. Cada section.body es un bloque hablado fluido, sin listas ni viñetas.
- Estructura sugerida de sections (adaptar nombres si encaja mejor):
  1) Apertura — saludar y anclar con un dato del cliente.
  2) Contexto — mostrar que entendemos su realidad (common_ground + pain).
  3) Oportunidad — qué está dejando sobre la mesa hoy.
  4) Propuesta — qué resuelve y cómo, con la value prop personalizada.
  5) Cierre — call to action concreta y manejo preventivo de objeción.
- Las cards seleccionadas son la columna vertebral: aparece su contenido tejido a lo largo del pitch, no como bullets.
- Si el vendedor agregó una nota a una card, integrar el ángulo de esa nota.`;

export function buildPitchUserPrompt(input: PitchInput): string {
  const lines: string[] = [];
  lines.push('SNAPSHOT DEL CLIENTE:');
  lines.push(JSON.stringify(input.snapshot, null, 2));
  lines.push('');
  lines.push('CARDS SELECCIONADAS POR EL VENDEDOR (en orden, son la columna vertebral del pitch):');
  input.cards.forEach((c, i) => {
    lines.push(`\n[${i + 1}] (${c.category}) ${c.title}`);
    lines.push(c.body);
    if (c.note) lines.push(`  └ nota del vendedor: ${c.note}`);
  });
  const instr = input.instructions?.trim();
  if (instr) {
    lines.push('');
    lines.push('━━━ INDICACIONES DEL VENDEDOR (PRIORIZAR sobre el guion default) ━━━');
    lines.push(instr);
    lines.push('━━━ fin indicaciones ━━━');
  }

  lines.push('');
  lines.push('Genera el pitch como JSON ahora.');
  return lines.join('\n');
}

/** Helper para serializar un pitch a markdown copiable. */
export function pitchToMarkdown(p: GeneratedPitch): string {
  const out: string[] = [];
  out.push(`# Pitch — ${p.client_name}`);
  out.push('');
  out.push(`_Duración estimada: ${p.duration_minutes} min · tono ${p.tone ?? 'consultivo'}${p.channel ? ` · canal ${p.channel}` : ''}_`);
  out.push('');
  for (const s of p.sections) {
    out.push(`## ${s.title}`);
    out.push('');
    out.push(s.body);
    out.push('');
  }
  return out.join('\n');
}
