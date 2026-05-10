import type { GeneratedPitch } from '../schemas.js';
import type { PitchInput } from './pitchPrompt.js';

/**
 * Mock determinístico: arma un pitch creíble entrelazando los campos de
 * commercial_approach + business_intelligence con las cards seleccionadas.
 * No llama a ningún LLM — sirve para QA del flujo y para previsualizar el shape.
 */
export async function generatePitchMock(input: PitchInput): Promise<GeneratedPitch> {
  const { snapshot, cards } = input;
  const instr = input.instructions?.trim();
  const wantShorter = !!instr && /corto|breve|concis|reducir/i.test(instr);
  const wantLonger = !!instr && /largo|extens|detallad|profund/i.test(instr);
  const wantInformal = !!instr && /informal|relaja|cercano|tuteo/i.test(instr);
  const wantAggressive = !!instr && /agresiv|directo|firme|cerrar/i.test(instr);
  const wantNumbers = !!instr && /(roi|n[uú]mero|m[eé]trica|datos|cifras)/i.test(instr);
  const ca = snapshot.commercial_approach;
  const cf = ca?.commercial_foundation;
  const bi = snapshot.business_intelligence;
  const name = snapshot.name;
  const category = snapshot.category ?? 'su rubro';

  const opps = cards.filter((c) => c.category === 'opportunity');
  const tips = cards.filter((c) => c.category === 'tip');
  const criticals = cards.filter((c) => c.category === 'critical');
  const risks = cards.filter((c) => c.category === 'risk');

  const opening =
    ca?.opening_line ??
    `Hola, equipo de ${name}. Te llamo porque vi un detalle de su operación que me parece relevante compartirles.`;

  const aperturaInformal = wantInformal
    ? ' Te tuteo de una para no formalear de más, ¿va?'
    : '';
  const apertura = `${opening} Antes de meterme en cualquier propuesta quiero confirmar algo con ustedes — si no encaja con lo que están viviendo hoy, no les hago perder tiempo.${aperturaInformal}`;

  const contextoBase =
    cf?.common_ground ??
    `Sabemos que en ${category} la competencia es alta y cada cliente que se va sin volver es un ingreso que ya no vuelve.`;
  const contexto = [
    contextoBase,
    criticals[0]?.body ?? bi?.why_viable ?? '',
    'Por eso esta conversación tiene sentido en este momento, no en seis meses.',
  ]
    .filter(Boolean)
    .join(' ');

  const oportunidadCore = opps
    .slice(0, 2)
    .map((c) => c.body)
    .join(' ');
  const oportunidad =
    `Hoy, mirando lo que está visible de su operación, hay un par de cosas que están dejando dinero sobre la mesa. ${oportunidadCore || (bi?.pain_points ?? []).slice(0, 2).join(' ')} ` +
    `No es una crítica — es lo que pasa cuando un negocio crece más rápido de lo que el sistema manual puede acompañar.`;

  const valueProp =
    cf?.personalized_value_prop ??
    `Lo que les propongo es una forma simple de automatizar todo ese seguimiento manual sin tener que cambiar cómo trabajan hoy.`;
  const propuestaTalk = (ca?.talk_track ?? []).slice(2, 3).join(' ');
  const mm = snapshot.marketing_metrics;
  const numbersBlock =
    wantNumbers && mm?.estimated_ltv_usd
      ? ` Para que veamos números concretos: estamos hablando de un LTV estimado de USD ${mm.estimated_ltv_usd.toLocaleString()}, con un ratio LTV/CAC de ${mm.ltv_cac_ratio}× y un ROI proyectado de ${mm.estimated_roi}×.`
      : '';
  const propuesta =
    `${valueProp} ${propuestaTalk}${numbersBlock} ` +
    (tips[0]?.body ? `Y un detalle táctico que vale la pena mencionar: ${tips[0].body}` : '');

  const objection = cf?.objection_prep ?? '';
  const riskBody = risks[0]?.body ?? '';
  const cierreOpener = wantAggressive
    ? 'Vamos a lo concreto:'
    : wantShorter
      ? 'Cierro:'
      : 'Yo lo dejaría así:';
  const cierreCore = wantShorter
    ? ` 14 días sin compromiso. Si no ven diferencia, lo dejamos.`
    : ` probemos esto con ustedes durante 14 días, sin compromiso. Si en dos semanas no ven la diferencia en cómo gestionan los clientes que tienen, lo dejamos ahí y no perdimos nada.`;
  const cta = wantAggressive
    ? ' Agendamos esta semana — ¿martes 10am o jueves 3pm?'
    : ' ¿Les hace sentido agendar 20 minutos esta semana para verlo en su contexto?';
  const cierre =
    `${cierreOpener}${cierreCore} ` +
    (objection
      ? `Probablemente piensen "${objection.split(':')[1]?.trim() ?? objection}" — es la objeción más común y tiene respuesta.`
      : '') +
    (riskBody && !wantShorter ? ` Algo más a considerar: ${riskBody}` : '') +
    cta;

  // Si el vendedor agregó notas, las incorporamos al final como un cierre custom
  const notesAdds = cards
    .filter((c) => c.note && c.note.trim().length > 0)
    .map((c) => c.note!.trim());

  const sections: GeneratedPitch['sections'] = wantShorter
    ? [
        { title: 'Apertura', body: apertura },
        { title: 'Oportunidad', body: oportunidad },
        { title: 'Propuesta', body: propuesta },
        { title: 'Cierre', body: cierre },
      ]
    : [
        { title: 'Apertura', body: apertura },
        { title: 'Contexto', body: contexto },
        { title: 'Oportunidad', body: oportunidad },
        { title: 'Propuesta', body: propuesta },
        { title: 'Cierre', body: cierre },
      ];

  if (notesAdds.length > 0) {
    sections.push({
      title: 'Ángulos personales (notas del vendedor)',
      body: notesAdds.join(' · '),
    });
  }

  if (instr) {
    sections.push({
      title: 'Indicaciones aplicadas',
      body: `Esta versión fue regenerada siguiendo: "${instr}"`,
    });
  }

  const tone = wantInformal
    ? 'informal y cercano'
    : wantAggressive
      ? 'directo y firme'
      : (ca?.conversation_tone ?? 'consultivo');
  const duration = wantShorter ? 3 : wantLonger ? 5 : 4;

  return {
    client_name: name,
    duration_minutes: duration,
    tone,
    channel: ca?.recommended_channel ?? null,
    sections,
  };
}
