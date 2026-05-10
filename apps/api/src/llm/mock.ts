import { env } from '../env.js';
import type { CardInput, ClientSnapshot } from '../schemas.js';

function shorten(text: string, max = 70): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut) + '…';
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/**
 * Mock que arma battlecards reaccionando a la forma del snapshot. Soporta tanto el shape
 * legacy (painPoints/recentNews planos) como el shape del pipeline upstream
 * (business_intelligence + commercial_approach + viability + marketing_metrics + contact).
 *
 * Reglas para que las cards sean *útiles* y no genéricas:
 *  - Citar siempre el dato concreto que disparó la card en `body` (números, frases textuales).
 *  - Adaptar tono cuando `priority` es MID/LOW vs HIGH (no tratar a un MICRO como una mid-market).
 *  - Si `digital_presence_score === 0` o `metric_confidence === 'LOW'`, marcar incertidumbre
 *    como `risk` antes que asumir que el negocio está listo para tickets grandes.
 *  - Capar el total a ~12 cards para que el panel del vendedor no quede saturado.
 */
export async function* streamCardsMock(snapshot: ClientSnapshot): AsyncGenerator<CardInput, void, void> {
  const cards: CardInput[] = [];

  const bi = snapshot.business_intelligence;
  const ca = snapshot.commercial_approach;
  const cf = ca?.commercial_foundation;
  const mm = snapshot.marketing_metrics;
  const v = snapshot.viability;
  const sb = v?.score_breakdown ?? {};
  const contact = snapshot.contact ?? {};
  const name = snapshot.name;
  const category = snapshot.category ?? 'el rubro';
  const priority = (v?.priority ?? '').toUpperCase();
  const isLowPriority = priority === 'MID' || priority === 'LOW';

  // ── opportunity ────────────────────────────────────────────────────────
  const pains = bi?.pain_points ?? snapshot.painPoints ?? [];
  pains.slice(0, 3).forEach((p, i) => {
    cards.push({
      category: 'opportunity',
      title: shorten(p, 75),
      body: `Pain declarado: "${p}". Confirmarlo en discovery con una pregunta abierta antes de proponer solución, así el cliente lo formula con sus propias palabras.`,
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
  if (bi?.why_viable) {
    cards.push({
      category: 'opportunity',
      title: 'Hipótesis de fit (por qué es viable)',
      body: bi.why_viable,
      sourceRefs: ['business_intelligence.why_viable'],
    });
  }

  // ── tip ────────────────────────────────────────────────────────────────
  if (ca?.opening_line) {
    cards.push({
      category: 'tip',
      title: 'Gancho de apertura sugerido',
      body: `Arrancar con: "${ca.opening_line}". Personalizado al negocio — evita el saludo genérico y baja la guardia desde la primera frase.`,
      sourceRefs: ['commercial_approach.opening_line'],
    });
  }
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
      title: `Tono ${ca?.conversation_tone ?? 'consultivo'} · ${ca?.recommended_channel ?? 'canal sugerido'}`,
      body: `Mantener un tono ${ca?.conversation_tone ?? 'consultivo'} con ${name}. Mejor ventana de contacto: ${ca?.best_contact_time ?? 'horario laboral'}.`,
      sourceRefs: ['commercial_approach.conversation_tone', 'commercial_approach.best_contact_time'],
    });
  }
  if (cf?.trust_signal) {
    cards.push({
      category: 'tip',
      title: 'Señal de confianza para abrir',
      body: cf.trust_signal,
      sourceRefs: ['commercial_approach.commercial_foundation.trust_signal'],
    });
  }
  if (cf?.common_ground) {
    cards.push({
      category: 'tip',
      title: 'Punto de conexión',
      body: cf.common_ground,
      sourceRefs: ['commercial_approach.commercial_foundation.common_ground'],
    });
  }
  if (cf?.personalized_value_prop) {
    cards.push({
      category: 'tip',
      title: 'Value prop a usar textual',
      body: cf.personalized_value_prop,
      sourceRefs: ['commercial_approach.commercial_foundation.personalized_value_prop'],
    });
  }

  // ── critical ───────────────────────────────────────────────────────────
  if (typeof v?.icp_score === 'number') {
    const breakdownBits = [
      typeof sb.size_score === 'number' ? `size ${sb.size_score}` : null,
      typeof sb.intent_score === 'number' ? `intent ${sb.intent_score}` : null,
      typeof sb.fit_score === 'number' ? `fit ${sb.fit_score}` : null,
      typeof sb.financial_score === 'number' ? `fin ${sb.financial_score}` : null,
    ].filter(Boolean).join(' · ');
    cards.push({
      category: 'critical',
      title: `ICP ${v.icp_score} · prioridad ${v.priority ?? '—'}`,
      body: `Tamaño ${bi?.estimated_size ?? '—'} · presencia digital ${bi?.digital_presence_score ?? '—'}/5${breakdownBits ? ` · breakdown: ${breakdownBits}` : ''}.`,
      sourceRefs: ['viability.icp_score', 'viability.score_breakdown', 'business_intelligence.estimated_size'],
    });
  }
  if (mm?.estimated_ltv_usd && mm?.ltv_cac_ratio) {
    cards.push({
      category: 'critical',
      title: `LTV ${fmtUsd(mm.estimated_ltv_usd)} · LTV/CAC ${mm.ltv_cac_ratio}×`,
      body: `ACV ${mm.estimated_acv_usd ? fmtUsd(mm.estimated_acv_usd) : '—'} · ACL ${mm.estimated_acl_months ?? '—'} meses · CAC ${mm.estimated_cac_usd ? fmtUsd(mm.estimated_cac_usd) : '—'} · ROAS ${mm.projected_roas ?? '—'}× · ROI ${mm.estimated_roi ?? '—'}× (confianza ${mm.metric_confidence ?? 'media'}).`,
      sourceRefs: ['marketing_metrics'],
    });
  }
  const contactBits = [
    contact.phone ? `📞 ${contact.phone}` : null,
    contact.email ? `✉️ ${contact.email}` : null,
    contact.website ? `🌐 ${contact.website}` : null,
  ].filter(Boolean);
  if (contactBits.length || ca?.recommended_channel) {
    const channel = ca?.recommended_channel ?? 'cold_call';
    const noContactNote =
      contactBits.length === 0 && channel === 'presencial'
        ? ' Sin contacto digital cargado: planificar visita en frío en horario sugerido.'
        : contactBits.length === 0
        ? ' ⚠️ Sin contacto cargado — buscar en GMB / Instagram antes de la primera llamada.'
        : '';
    cards.push({
      category: 'critical',
      title: `Canal recomendado: ${channel}`,
      body: `${contactBits.length ? contactBits.join(' · ') : 'Sin canales digitales'}.${ca?.best_contact_time ? ` Ventana: ${ca.best_contact_time}.` : ''}${noContactNote}`,
      sourceRefs: ['contact', 'commercial_approach.recommended_channel'],
    });
  }
  if (snapshot.category) {
    cards.push({
      category: 'critical',
      title: `Contexto · ${snapshot.category}${typeof snapshot.rank === 'number' ? ` (rank #${snapshot.rank})` : ''}`,
      body: `${name} opera en ${category}${bi?.estimated_size ? `, tamaño estimado ${bi.estimated_size}` : ''}. Usar lenguaje y casos del rubro, no analogías de software enterprise.`,
      sourceRefs: ['category', 'rank', 'business_intelligence.estimated_size'],
    });
  }

  // ── risk ───────────────────────────────────────────────────────────────
  if (cf?.objection_prep) {
    cards.push({
      category: 'risk',
      title: 'Objeción esperada · respuesta lista',
      body: cf.objection_prep,
      sourceRefs: ['commercial_approach.commercial_foundation.objection_prep'],
    });
  }
  const flags = bi?.risk_flags ?? [];
  flags.slice(0, 2).forEach((r, i) => {
    cards.push({
      category: 'risk',
      title: shorten(r, 75),
      body: `Risk flag detectado: ${r} Validar en los primeros 5 minutos para no perder tiempo si el bloqueo es real.`,
      sourceRefs: [`business_intelligence.risk_flags[${i}]`],
    });
  });
  if (bi?.digital_presence_score === 0) {
    cards.push({
      category: 'risk',
      title: 'Presencia digital nula',
      body: `${name} no tiene web/sociales detectables: probable resistencia a herramientas digitales y onboarding más lento. Demo presencial > demo en pantalla compartida.`,
      sourceRefs: ['business_intelligence.digital_presence_score'],
    });
  }
  if (mm?.metric_confidence && mm.metric_confidence.toUpperCase() === 'LOW') {
    cards.push({
      category: 'risk',
      title: 'Métricas con baja confianza',
      body: `Las cifras de LTV/CAC/ROAS están marcadas como ${mm.metric_confidence}. No basar el cierre en ROI proyectado: usar dolor declarado como ancla principal y los números solo como refuerzo.`,
      sourceRefs: ['marketing_metrics.metric_confidence'],
    });
  }
  if (isLowPriority) {
    cards.push({
      category: 'risk',
      title: `Prioridad ${priority} — calibrar esfuerzo`,
      body: `Este lead está clasificado como ${priority}. Limitar la inversión inicial: 1 contacto + 1 follow-up, no entrar en nurtures largos hasta validar interés real.`,
      sourceRefs: ['viability.priority'],
    });
  }
  if (typeof sb.size_score === 'number' && sb.size_score <= 5) {
    cards.push({
      category: 'risk',
      title: `Tamaño bajo (size_score ${sb.size_score})`,
      body: `Negocio ${bi?.estimated_size ?? 'pequeño'}: el ticket esperado es chico. Evitar features enterprise en el pitch — vender simpleza y ahorro de tiempo, no escalabilidad.`,
      sourceRefs: ['viability.score_breakdown.size_score'],
    });
  }
  if (mm?.estimated_cac_usd && mm.estimated_acv_usd && mm.estimated_cac_usd > mm.estimated_acv_usd * 0.6) {
    cards.push({
      category: 'risk',
      title: 'CAC alto vs ACV',
      body: `CAC estimado ${fmtUsd(mm.estimated_cac_usd)} sobre ACV ${fmtUsd(mm.estimated_acv_usd)}: el ciclo debe cerrarse rápido o el ROI se degrada. Forzar decisión en la 2ª reunión.`,
      sourceRefs: ['marketing_metrics.estimated_cac_usd', 'marketing_metrics.estimated_acv_usd'],
    });
  }
  if (flags.length === 0 && bi?.digital_presence_score !== 0) {
    cards.push({
      category: 'risk',
      title: 'Competencia local probable',
      body: `En "${category}" suele haber competidores ya instalados. Preguntar en discovery: "¿qué usan hoy?" para no asumir greenfield.`,
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

  // Cap defensivo: si el snapshot es muy rico no queremos saturar el panel.
  const capped = cards.slice(0, 12);
  for (const card of capped) {
    await new Promise((r) => setTimeout(r, env.MOCK_LLM_DELAY_MS));
    yield card;
  }
}
