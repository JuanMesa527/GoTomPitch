import { env } from '../env.js';
import type { CardInput, ClientSnapshot } from '../schemas.js';

function shorten(text: string, max = 70): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut) + '…';
}

/**
 * Mock que arma battlecards reaccionando a la forma del snapshot. Soporta tanto el shape
 * legacy (painPoints/recentNews planos) como el shape del pipeline upstream
 * (business_intelligence + commercial_approach + viability + marketing_metrics).
 */
export async function* streamCardsMock(snapshot: ClientSnapshot): AsyncGenerator<CardInput, void, void> {
  const cards: CardInput[] = [];

  const bi = snapshot.business_intelligence;
  const ca = snapshot.commercial_approach;
  const mm = snapshot.marketing_metrics;
  const v = snapshot.viability;
  const name = snapshot.name;

  // ── opportunity ────────────────────────────────────────────────────────
  const pains = bi?.pain_points ?? snapshot.painPoints ?? [];
  pains.slice(0, 3).forEach((p, i) => {
    cards.push({
      category: 'opportunity',
      title: shorten(p, 75),
      body: `${p} Atacar este pain de frente conecta con dolor declarado por el negocio.`,
      sourceRefs: [`business_intelligence.pain_points[${i}]`],
    });
  });
  if (bi?.growth_signals?.length) {
    bi.growth_signals.slice(0, 1).forEach((g, i) => {
      cards.push({
        category: 'opportunity',
        title: 'Señal de crecimiento detectada',
        body: g,
        sourceRefs: [`business_intelligence.growth_signals[${i}]`],
      });
    });
  }

  // ── tip ────────────────────────────────────────────────────────────────
  const talk = ca?.talk_track ?? [];
  talk.slice(0, 3).forEach((step, i) => {
    cards.push({
      category: 'tip',
      title: `Talk track · paso ${i + 1}`,
      body: step,
      sourceRefs: [`commercial_approach.talk_track[${i}]`],
    });
  });
  if (ca?.conversation_tone || ca?.best_contact_time) {
    cards.push({
      category: 'tip',
      title: `Tono ${ca?.conversation_tone ?? 'consultivo'}`,
      body: `Mantener un tono ${ca?.conversation_tone ?? 'consultivo'} con ${name}. Mejor horario: ${ca?.best_contact_time ?? 'horario laboral'}.`,
      sourceRefs: ['commercial_approach.conversation_tone', 'commercial_approach.best_contact_time'],
    });
  }
  if (ca?.commercial_foundation?.common_ground) {
    cards.push({
      category: 'tip',
      title: 'Punto de conexión',
      body: ca.commercial_foundation.common_ground,
      sourceRefs: ['commercial_approach.commercial_foundation.common_ground'],
    });
  }

  // ── critical ───────────────────────────────────────────────────────────
  if (bi?.why_viable) {
    cards.push({
      category: 'critical',
      title: 'Por qué es viable',
      body: bi.why_viable,
      sourceRefs: ['business_intelligence.why_viable'],
    });
  }
  if (mm?.estimated_ltv_usd && mm?.ltv_cac_ratio) {
    cards.push({
      category: 'critical',
      title: `LTV ${mm.estimated_ltv_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`,
      body: `Ratio LTV/CAC ${mm.ltv_cac_ratio}× · ROI proyectado ${mm.estimated_roi ?? '-'}× · confianza métrica ${mm.metric_confidence ?? 'media'}.`,
      sourceRefs: ['marketing_metrics'],
    });
  }
  if (snapshot.contact?.phone || ca?.recommended_channel) {
    const phone = snapshot.contact?.phone ?? 'sin teléfono';
    cards.push({
      category: 'critical',
      title: `Canal: ${ca?.recommended_channel ?? 'cold_call'}`,
      body: `Contacto sugerido: ${phone}. ${ca?.best_contact_time ? `Mejor ventana: ${ca.best_contact_time}.` : ''}`.trim(),
      sourceRefs: ['contact.phone', 'commercial_approach.recommended_channel'],
    });
  }
  if (v?.icp_score) {
    cards.push({
      category: 'critical',
      title: `ICP score ${v.icp_score} · ${v.priority ?? 'HIGH'}`,
      body: `Tamaño ${bi?.estimated_size ?? '-'} · presencia digital ${bi?.digital_presence_score ?? '-'}/5. Score breakdown disponible en el snapshot.`,
      sourceRefs: ['viability.icp_score', 'business_intelligence.estimated_size'],
    });
  }

  // ── risk ───────────────────────────────────────────────────────────────
  if (ca?.commercial_foundation?.objection_prep) {
    cards.push({
      category: 'risk',
      title: 'Objeción esperada',
      body: ca.commercial_foundation.objection_prep,
      sourceRefs: ['commercial_approach.commercial_foundation.objection_prep'],
    });
  }
  const flags = bi?.risk_flags ?? [];
  flags.slice(0, 2).forEach((r, i) => {
    cards.push({
      category: 'risk',
      title: 'Risk flag',
      body: r,
      sourceRefs: [`business_intelligence.risk_flags[${i}]`],
    });
  });
  if (flags.length === 0) {
    cards.push({
      category: 'risk',
      title: 'Competencia local probable',
      body: `En categoría "${snapshot.category ?? 'su rubro'}" suele haber competidores ya instalados. Preguntar en discovery: "¿qué usan hoy?" para no asumir greenfield.`,
    });
  }
  if (mm?.estimated_cac_usd && mm.estimated_cac_usd > 250) {
    cards.push({
      category: 'risk',
      title: `CAC alto: USD ${mm.estimated_cac_usd}`,
      body: 'CAC estimado por encima del promedio del segmento — el ciclo debe cerrarse rápido o el ROI se degrada. Evitar nurtures largos.',
      sourceRefs: ['marketing_metrics.estimated_cac_usd'],
    });
  }

  // Fallback si el snapshot vino casi vacío
  if (cards.length < 4) {
    cards.push(
      { category: 'opportunity', title: `${name} — oportunidad declarada`, body: 'Sin pain points cargados; iniciar discovery clásico para mapear dolor.' },
      { category: 'tip', title: 'Validar antes de proponer', body: 'Pregunta abierta primero, demo después. No quemar la primera reunión con slides.' },
      { category: 'critical', title: name, body: snapshot.description ?? 'Snapshot mínimo — ampliar info en próxima iteración del scraper.' },
      { category: 'risk', title: 'Snapshot incompleto', body: 'Hay poca data disponible — el pitch va a requerir más discovery en vivo.' },
    );
  }

  for (const card of cards) {
    await new Promise((r) => setTimeout(r, env.MOCK_LLM_DELAY_MS));
    yield card;
  }
}
