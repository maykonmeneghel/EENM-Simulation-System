/**
 * TeX for each stage of docs/model-equations.md: the symbolic form (transcribed verbatim) and the
 * same form with the current values. Pure presentation — every number comes from ModelSnapshot.
 */
import type { ModelSnapshot } from '../application/modelView';
import { CONSTANTS, TWITCH_CALIBRATION } from '../domain/modelEquations';
import type { SpanValue, StageId } from '../domain/modelEquations';
import { MOTOR_UNIT_TYPES } from '../domain/simulation';

export interface StageStatus {
  tone: 'good' | 'warn' | 'bad';
  text: string;
}

export interface StageContent {
  id: StageId;
  title: string;
  source: string;
  symbolic: string[];
  substituted: string[];
  notes: string[];
  status?: StageStatus;
}

/** Number for TeX in pt-BR (decimal comma as `{,}`); NaN → em dash. */
export function texNum(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '\\text{—}';
  const s = x.toLocaleString('pt-BR', { maximumFractionDigits: digits, useGrouping: false });
  return s.replace('−', '-').replace(',', '{,}');
}
/** Number for plain text in pt-BR. */
export function txtNum(x: number, digits = 3): string {
  return Number.isFinite(x) ? x.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '—';
}

/** "a \\to b" for a span (a single value when both ends match at the shown precision). */
export function texSpan(sp: SpanValue | null, digits = 3): string {
  if (!sp) return '\\text{—}';
  const a = texNum(sp.from, digits);
  const b = texNum(sp.to, digits);
  return a === b ? a : `${a} \\to ${b}`;
}

/** One TeX line per simulated type: "S\ (n):\ <body>"; types with no units are skipped. */
function perType(s: ModelSnapshot, body: (t: 'S' | 'FR' | 'FF') => string | null): string[] {
  const out: string[] = [];
  for (const t of MOTOR_UNIT_TYPES) {
    const sp = s.typeSpans[t];
    if (sp.count !== null && !(sp.count > 0)) continue;
    const b = body(t);
    if (b === null) continue;
    const n = sp.count === null ? '' : `\\ (${texNum(sp.count, 0)})`;
    out.push(`\\text{${t}}${n}:\\quad ${b}`);
  }
  return out;
}

function countsNote(s: ModelSnapshot): string[] {
  return s.units.counts
    ? ['Intervalos = primeira → última unidade simulada de cada tipo (' + (s.variant === 'ORIGINAL' ? 'primeiras unidades do pool' : 'centros de fatias iguais do pool') + ').']
    : ['Contagens automáticas: intervalos do pool inteiro de cada tipo.'];
}

const GEOMETRY_PT: Record<string, string> = { CYLINDRICAL: 'cilíndrica', SPHERICAL: 'esférica' };

const MODULATION_FACTOR: Record<string, string> = {
  STEP: '1',
  RAMP: 't/T',
  TRIANGLE: '\\begin{cases} t/t_p & t \\le t_p \\\\ 1 - (t - t_p)/(T - t_p) & t > t_p \\end{cases}',
  SINUSOIDAL: '\\sin t',
};

function stage1(s: ModelSnapshot): StageContent {
  const st = s.stimulus;
  const mono = st.waveform === 'MONOPHASIC';
  const symbolic = [
    mono
      ? 'I(t) = A \\cdot \\frac{\\operatorname{sq}(2\\pi f t,\\ D) + 1}{2}, \\qquad \\operatorname{sq}(x, D) = \\begin{cases} +1 & x \\bmod 2\\pi < \\tfrac{D}{100}2\\pi \\\\ -1 & \\text{caso contrário} \\end{cases}'
      : 'I(t) = A \\cdot \\operatorname{sq}(2\\pi f t,\\ D)',
    'PW = \\frac{D}{100 \\cdot f}',
  ];
  const substituted = [
    `f = \\frac{${texNum(st.frequencyHz)}}{1000} = ${texNum(st.fKHz, 4)}\\ \\text{kHz}, \\quad D = ${texNum(st.dutyCyclePercent)}\\,\\%, \\quad A = ${texNum(st.amplitude)}`,
    `PW = \\frac{${texNum(st.dutyCyclePercent)}}{100 \\cdot ${texNum(st.fKHz, 4)}} = ${texNum(st.pwMs)}\\ \\text{ms}`,
  ];
  const notes: string[] = [mono ? 'Forma de onda monofásica.' : 'Forma de onda bifásica.'];
  if (st.modulationTarget === 'AMPLITUDE') {
    substituted.push(
      `A(t) = ${texNum(st.amplitude)} \\cdot ${MODULATION_FACTOR[st.modulationShape] ?? '1'}` +
        (st.modulationShape === 'TRIANGLE' ? `, \\quad t_p = ${texNum(st.peakTimeMs)}\\ \\text{ms}` : '') +
        `, \\quad T = ${texNum(st.durationMs)}\\ \\text{ms}`,
    );
  } else {
    notes.push(
      `Modulação de ${st.modulationTarget === 'FREQUENCY' ? 'frequência' : 'largura de pulso'}: segue o FES.m literalmente (ver o código); sem forma fechada no documento.`,
    );
  }
  if (st.train) {
    symbolic.push('I(t) = 0 \\quad \\text{quando}\\quad t \\bmod T_{\\text{trem}} \\ge T_{\\text{ligado}}');
    substituted.push(
      `I(t) = 0 \\quad \\text{quando}\\quad t \\bmod ${texNum(st.train.periodMs)} \\ge ${texNum(st.train.onMs)}\\ \\text{ms}`,
    );
  }
  return { id: '1', title: 'Estímulo', source: 'domain/stimulus.py (FES.m)', symbolic, substituted, notes };
}

function stage2a(s: ModelSnapshot): StageContent {
  const m = s.motoneuron;
  const c = CONSTANTS.conductances;
  const e = CONSTANTS.reversal;
  return {
    id: '2a',
    title: 'Motoneurônio (soma + dendrito)',
    source: 'domain/motoneuron.py (rates.m)',
    symbolic: [
      'C_s \\frac{dV_s}{dt} = I_{s} - g_{Na}\\, m_\\infty^3(V_s)\\, h\\,(V_s - E_{Na}) - g_{Ca}\\, m_{Ca}^2 h_{Ca}(V_s - E_{Ca}) - g_K\\, n^4 (V_s - E_K) - g_{KCa}\\frac{[Ca]_s}{K_d + [Ca]_s}(V_s - E_K) - g_L (V_s - E_L) + \\frac{g_c}{p}(V_d - V_s)',
      'C_d \\frac{dV_d}{dt} = I_{d} - g_{Ca,d}\\, m_{Ca,d}(V_d - E_{Ca}) - g_{NaP}\\, m_{NaP} h_{NaP}(V_d - E_{Na}) - g_{KCa,d}\\frac{[Ca]_d}{K_d + [Ca]_d}(V_d - E_K) - g_L (V_d - E_L) + \\frac{g_c}{1-p}(V_s - V_d)',
      '\\frac{dx}{dt} = \\varphi\\,\\frac{x_\\infty(V) - x}{\\tau_x(V)}, \\qquad \\varphi = 3^{(T_{^\\circ C} - 6{,}3)/10}, \\qquad \\frac{d[Ca]}{dt} = \\varphi\\,(-f \\alpha I_{Ca} - f k_{Ca} [Ca])',
    ],
    substituted: [
      `\\varphi = 3^{(${texNum(m.temperatureCelsius)} - 6{,}3)/10} = ${texNum(m.phi, 4)}`,
      m.injectionSite === 'SOMA'
        ? 'I_s = I(t),\\quad I_d = 0 \\quad (\\text{injeção no soma})'
        : 'I_d = I(t),\\quad I_s = 0 \\quad (\\text{injeção no dendrito})',
      `E_{Na} = ${e.ENa},\\ E_K = ${e.EK},\\ E_L = ${e.EL},\\ E_{Ca} = ${e.ECa}\\ \\text{mV}`,
      `g_{Na} = ${c.gNa},\\ g_K = ${c.gK},\\ g_{Ca} = ${c.gCa},\\ g_{KCa} = ${c.gKCa},\\ g_L = ${texNum(c.gL)},\\ g_c = ${texNum(c.gc)},\\ g_{NaP} = ${texNum(c.gNaP)},\\ g_{Ca,d} = ${texNum(c.gCaD)},\\ C = ${c.C}`,
    ],
    notes: [
      `p = A_s/(A_s + A_d) a partir da geometria: soma ${GEOMETRY_PT[m.somaGeometry] ?? m.somaGeometry}, dendrito ${GEOMETRY_PT[m.dendriteGeometry] ?? m.dendriteGeometry}.`,
      'Potenciais de reversão expressos como v + v_rest.',
    ],
  };
}

function stage2b(s: ModelSnapshot): StageContent {
  const st = s.stimulus;
  const r = s.recruitment;
  const sd = 1 + CONSTANTS.tauSdMs / st.pwMs;
  let status: StageStatus | undefined;
  if (r) {
    const lo = txtNum(r.thresholdMin, 1);
    const hi = txtNum(r.thresholdMax, 1);
    const a = txtNum(st.amplitude);
    status =
      r.status === 'all'
        ? { tone: 'good', text: `A = ${a} ≥ ${hi}: todas as unidades recrutadas` }
        : r.status === 'partial'
          ? {
              tone: 'warn',
              text: `${lo} ≤ A = ${a} < ${hi}: recrutamento parcial (≈ ${txtNum(r.fraction * 100, 0)} % dos axônios)`,
            }
          : { tone: 'bad', text: `A = ${a} < ${lo}: nenhuma unidade recrutada` };
  }
  const notes = [
    'I_rh,k distribuído linearmente em [I_rh,min; R·I_rh,min], em ordem aleatória definida pela semente (recrutamento não seletivo, Gregory & Bickel 2005). Com pulso de 0,3 ms a primeira unidade é recrutada em 56,9 e todas em 102,1. O disparo ocorre no fim do pulso.',
  ];
  if (r?.status === 'partial') notes.push('A porcentagem trata a distribuição linear como contínua (aproximação).');
  if (st.modulationTarget === 'AMPLITUDE' && st.modulationShape !== 'STEP') {
    notes.push('Com modulação de amplitude, A é o valor de pico; o recrutamento varia ao longo do tempo.');
  }
  if (st.modulationTarget !== 'AMPLITUDE') {
    notes.push('Com modulação de frequência ou largura de pulso, PW e o limiar variam ao longo do tempo.');
  }
  return {
    id: '2b',
    title: 'Axônio motor (Weiss)',
    source: 'domain/axon_stimulation.py',
    symbolic: [
      'A \\;\\ge\\; I_{rh,k}\\left(1 + \\frac{\\tau_{SD}}{PW}\\right), \\qquad \\tau_{SD} = 0{,}459\\ \\text{ms} \\;\\text{(Mogyoros et al. 1996)}',
      'I_{rh,k} \\in [I_{rh,\\min},\\ R\\, I_{rh,\\min}], \\qquad I_{rh,\\min} = \\frac{56{,}9}{1 + 0{,}459/0{,}3}, \\qquad R = \\frac{102{,}1}{56{,}9}',
    ],
    substituted: [
      `I_{rh,\\min} = ${texNum(CONSTANTS.rheobaseMin, 4)}, \\qquad R = ${texNum(CONSTANTS.rheobaseSpread, 4)}`,
      `${texNum(st.amplitude)} \\;\\ge\\; I_{rh,k}\\left(1 + \\frac{0{,}459}{${texNum(st.pwMs)}}\\right) = ${texNum(sd, 3)}\\, I_{rh,k}`,
      r
        ? `I_{rh,\\min}\\left(1 + \\frac{\\tau_{SD}}{PW}\\right) = ${texNum(CONSTANTS.rheobaseMin, 3)} \\cdot ${texNum(sd, 3)} = ${texNum(r.thresholdMin, 1)} \\;\\ldots\\; \\times R = ${texNum(r.thresholdMax, 1)}`
        : '\\text{PW inválido}',
    ],
    notes,
    ...(status ? { status } : {}),
  };
}

function stage3(s: ModelSnapshot): StageContent {
  const c = s.conduction;
  const st = s.stimulus;
  const orig = s.variant === 'ORIGINAL';
  const symbolic = orig
    ? [
        'V_J = V_s \\cdot \\frac{0{,}070\\,\\lambda}{2}\\, e^{-x/\\lambda}, \\qquad \\lambda = \\sqrt{1/0{,}070}, \\qquad x = \\frac{\\text{axonLengthPercent}}{100}',
        '\\Delta_k = \\frac{x}{v_k}\\cdot \\frac{T}{\\delta t}\\ \\text{amostras (ORIGINAL, Q4)}',
      ]
    : ['\\Delta_k = \\frac{x}{v_k}\\cdot\\frac{1000}{\\delta t}\\ \\text{amostras (LITERATURE)}, \\qquad x = \\frac{\\text{axonLengthPercent}}{100}'];
  const scale = orig ? texNum(st.durationMs) : '1000';
  const substituted = [
    ...(orig
      ? [`V_J = V_s \\cdot ${texNum(c.junctionGain, 4)} \\quad (\\lambda = ${texNum(Math.sqrt(1 / CONSTANTS.junctionG), 3)},\\ x = ${texNum(c.x)})`]
      : []),
    ...c.delays.map(
      (d) =>
        `v = ${d.velocity}\\ \\text{m/s}: \\ \\Delta = \\frac{${texNum(c.x)}}{${d.velocity}}\\cdot\\frac{${scale}}{${texNum(st.stepMs, 4)}} = ${texNum(d.samples, 0)}\\ \\text{amostras} = ${texNum(d.ms, 2)}\\ \\text{ms}`,
    ),
  ];
  substituted.push(
    ...perType(s, (t) => {
      const sp = s.typeSpans[t];
      return `v_k = ${texSpan(sp.velocity, 2)}\\ \\text{m/s} \\;\\Rightarrow\\; \\Delta_k = ${texSpan(sp.delayMs, 2)}\\ \\text{ms}`;
    }),
  );
  return {
    id: '3',
    title: 'Condução até o músculo',
    source: 'domain/force_pipeline.py, domain/motor_unit_pool.py',
    symbolic,
    substituted,
    notes: orig
      ? [
          'Somente soma; V_J passa por filtro de mediana 3×3.',
          'x em metros (axonLengthPercent/100), v_k (APAT) em m/s, 44–53. No ORIGINAL o atraso em ms é x/v·T, escalando com a duração T (Q4).',
          ...countsNote(s),
        ]
      : ['x em metros (axonLengthPercent/100), v_k (APAT) em m/s, 44–53; atraso em ms = x/v·1000, independente da duração.', ...countsNote(s)],
  };
}

function stage4(s: ModelSnapshot): StageContent {
  const orig = s.variant === 'ORIGINAL';
  return {
    id: '4',
    title: 'Potencial de ação da unidade motora e EMG',
    source: 'domain/force_pipeline.py',
    symbolic: [
      '\\text{MUAP}_k(t) = H \\cdot S_k \\cdot \\begin{cases} t\\, e^{-u^2} & \\text{(forma 0)} \\\\ (1 - 2u^2)\\, e^{-u^2} & \\text{(forma 1)} \\end{cases}, \\qquad u = t/\\lambda_m',
    ],
    substituted: [
      `H = ${orig ? '\\max V_J' : '1'}, \\qquad t \\in [-1{,}25;\\ 1{,}25]\\ \\text{ms}, \\qquad \\text{seed} = ${texNum(s.seed, 0)}`,
      ...perType(s, (t) => `S_k = ${texSpan(s.typeSpans[t].apsf, 4)}, \\quad \\lambda_m = ${texSpan(s.typeSpans[t].aptf, 4)}`),
    ],
    notes: [
      `Escrito Δ_k amostras após cada disparo (${orig ? 'pico da junção' : 'disparo do axônio'}). S_k = APSF, λ_m = APTF; forma sorteada por unidade a partir da semente.`,
      'EMG exibido = soma, sobre os tipos, do MUAP médio.',
    ],
  };
}

function stage5(s: ModelSnapshot): StageContent {
  if (s.variant === 'ORIGINAL') {
    return {
      id: '5a',
      title: 'Twitch (Fuglevand 1993)',
      source: 'domain/twitch.py',
      symbolic: ['h_k(t) = P_k \\frac{t}{T_k} e^{1 - t/T_k}'],
      substituted: [
        'P_k = \\text{MT}_k, \\qquad T_k = \\text{MTTP}_k',
        ...perType(s, (t) => `P_k = ${texSpan(s.typeSpans[t].mt, 4)}, \\quad T_k = ${texSpan(s.typeSpans[t].tkMs, 2)}\\ \\text{ms}`),
      ],
      notes: [
        'Criticamente amortecido; P_k e T_k variam por unidade.',
        ...countsNote(s),
        'Força da unidade = soma dos twitches disparados pelos picos do MUAP somado do tipo, ponderados pelo valor do pico (Q2).',
      ],
    };
  }
  const fit = TWITCH_CALIBRATION[s.calibrationTarget];
  const k = fit.timeScale;
  const m = fit.m;
  return {
    id: '5b',
    title: 'Twitch generalizado',
    source: 'domain/twitch.py',
    symbolic: ['h_k(t) = P_k \\left(\\frac{t}{T_k}\\right)^{m} e^{m(1 - t/T_k)}'],
    substituted: [
      `m = ${texNum(m, 4)}, \\qquad T_k \\leftarrow ${texNum(k, 4)}\\,\\text{MTTP}_k`,
      `h_k(t) = P_k \\left(\\frac{t}{${texNum(k, 4)}\\,\\text{MTTP}_k}\\right)^{${texNum(m, 4)}} e^{${texNum(m, 4)}\\left(1 - \\frac{t}{${texNum(k, 4)}\\,\\text{MTTP}_k}\\right)}`,
      ...perType(s, (t) => `P_k = ${texSpan(s.typeSpans[t].mt, 4)}, \\quad T_k = ${texSpan(s.typeSpans[t].tkMs, 2)}\\ \\text{ms}`),
    ],
    notes: [
      `Ajustado ao ${fit.fittedTo}: CT ${txtNum(fit.ctMs)} ms, HRT ${txtNum(fit.hrtMs)} ms.`,
      'Força da unidade = soma dos twitches dos seus próprios disparos, peso 1.',
      ...countsNote(s),
    ],
  };
}

function stage6(s: ModelSnapshot): StageContent {
  const r = s.rate;
  return {
    id: '6',
    title: 'Saturação por frequência',
    source: 'twitch.RateGain (Potvin & Fuglevand 2017, Eqs 4–6)',
    symbolic: [
      'NR = \\frac{T_k}{\\text{ISI}}, \\qquad NF(NR) = \\begin{cases} 0{,}3\\,NR & NR \\le 0{,}4 \\\\ 1 - e^{-2 NR^3} & NR > 0{,}4 \\end{cases}, \\qquad g = \\frac{NF(NR)}{0{,}3\\,NR}',
    ],
    substituted: [
      `\\text{ISI} = \\frac{1000}{${texNum(s.stimulus.frequencyHz)}} = ${texNum(r.isiMs, 2)}\\ \\text{ms}, \\qquad NR = \\frac{T_k}{${texNum(r.isiMs, 2)}}`,
      `NR \\le 0{,}4 \\iff T_k \\le ${texNum(r.kneeTkMs, 2)}\\ \\text{ms} \\quad (g = 1)`,
    ],
    notes: [
      'ISI aqui = intervalo entre pulsos do estímulo (cada pulso dispara os axônios recrutados).',
      'Cada twitch é multiplicado por g, para que a soma dos twitches siga NF.',
    ],
  };
}

function stage7(s: ModelSnapshot): StageContent {
  return {
    id: '7',
    title: 'Fadiga periférica',
    source: 'domain/fatigue.py (Potvin & Fuglevand 2017, Eqs 9–11, 14)',
    symbolic: [
      'FAT_k = 0{,}0125\\cdot 180^{\\frac{\\ln(P_k/P_{\\min})}{\\ln(P_{\\max}/P_{\\min})}}\\ \\%/\\text{s}, \\qquad \\frac{dC_k}{dt} = -\\frac{FAT_k\\, NF(t)}{100}, \\qquad T_k \\leftarrow T_k\\,(1 + 0{,}379\\,(1 - C_k))',
    ],
    substituted: [
      `FAT_k = 0{,}0125\\cdot 180^{\\frac{\\ln(P_k/${texNum(s.poolMt.min, 3)})}{\\ln(${texNum(s.poolMt.max, 3)}/${texNum(s.poolMt.min, 3)})}}\\ \\%/\\text{s}`,
      ...perType(s, (t) => `P_k = ${texSpan(s.typeSpans[t].mt, 4)} \\;\\Rightarrow\\; FAT_k = ${texSpan(s.typeSpans[t].fatigue, 3)}\\ \\%/\\text{s}`),
      `t \\in [0,\\ ${texNum(s.stimulus.durationMs / 1000, 3)}]\\ \\text{s}, \\qquad NR < 0{,}25 \\iff T_k < ${texNum(s.rate.pauseTkMs, 2)}\\ \\text{ms}\\ \\text{(pausa)}`,
    ],
    notes: [
      'C_k = capacidade restante (multiplica o twitch). Intervalos com NR < 0,25 são pausas (sem fadiga). Sem recuperação.',
      'P_min / P_max = MT mais fraco / mais forte do pool inteiro (0,103 / 0,491).',
      ...countsNote(s),
      ...(s.stimulus.train ? ['Com trens intermitentes, os intervalos desligados não recuperam a capacidade.'] : []),
    ],
  };
}

function stage8(s: ModelSnapshot): StageContent {
  const counts = s.units.counts;
  if (s.variant === 'ORIGINAL') {
    const terms = counts
      ? MOTOR_UNIT_TYPES.map((t) => `\\frac{1}{${texNum(counts[t], 0)}}\\sum_{k=1}^{${texNum(counts[t], 0)}} f^{${t}}_k(t)`).join(' + ')
      : '\\text{—}';
    return {
      id: '8a',
      title: 'Força muscular',
      source: 'domain/simulation.py',
      symbolic: ['F(t) = \\sum_{\\text{tipo}} \\operatorname{mean}_k f_k(t)'],
      substituted: [`F(t) = ${terms}`],
      notes: ['Média por tipo, somada (Q7). Tipos com 0 unidades não contribuem.'],
    };
  }
  const pool = s.pool;
  const w = s.weights;
  const substituted: string[] = [];
  const notes: string[] = ['Cada unidade simulada representa sua parcela do pool (sóleo 800/50/50 simulado como 106/7/7).'];
  if (counts && pool && w) {
    substituted.push(
      'F(t) = ' +
        MOTOR_UNIT_TYPES.map((t) => `\\frac{${pool[t]}}{${texNum(counts[t], 0)}}\\sum_{k=1}^{${texNum(counts[t], 0)}} f^{${t}}_k(t)`).join(' + '),
    );
    substituted.push(
      MOTOR_UNIT_TYPES.map((t) => `w_{${t}} = ${w[t] === null ? '\\text{—}' : texNum(w[t] as number, 3)}`).join(',\\quad '),
    );
    notes.push(s.units.source === 'started' ? 'N_sim informado pelo evento started da última simulação.' : 'N_sim definido manualmente.');
  } else if (!pool) {
    substituted.push('N_{\\text{pool}}\\ \\text{desconhecido (lista de músculos indisponível)}');
  } else {
    substituted.push(
      `N_{\\text{pool}} = ${pool.S} / ${pool.FR} / ${pool.FF}, \\qquad N_{\\text{sim}} = \\text{automático}`,
    );
    notes.push('Automático: 120 unidades na proporção do músculo; os pesos aparecem após a primeira simulação.');
  }
  return {
    id: '8b',
    title: 'Força muscular (ponderada pelo pool)',
    source: 'domain/simulation.py',
    symbolic: ['F(t) = \\sum_{\\text{tipo}} \\frac{N_{\\text{pool,tipo}}}{N_{\\text{sim,tipo}}} \\sum_k f_k(t)'],
    substituted,
    notes,
  };
}

const BUILDERS: Record<StageId, (s: ModelSnapshot) => StageContent> = {
  '1': stage1,
  '2a': stage2a,
  '2b': stage2b,
  '3': stage3,
  '4': stage4,
  '5a': stage5,
  '5b': stage5,
  '6': stage6,
  '7': stage7,
  '8a': stage8,
  '8b': stage8,
};

export function buildStageContents(s: ModelSnapshot): StageContent[] {
  return s.stages.map((id) => BUILDERS[id](s));
}
