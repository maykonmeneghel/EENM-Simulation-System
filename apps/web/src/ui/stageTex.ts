/**
 * TeX for each stage of docs/model-equations.md: the symbolic form (transcribed verbatim) and the
 * same form with the current values. Pure presentation — every number comes from ModelSnapshot.
 * Texts are in the current locale (``i18n/locale``); decimal commas written as ``{,}`` become points in English.
 */
import type { ModelSnapshot } from '../application/modelView';
import { fmtNumber, getLocale, tr } from '../i18n/locale';
import { CONSTANTS, twitchCalibration } from '../domain/modelEquations';
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
  /** What the chosen condition changes in this stage (shown highlighted). */
  condition?: string[];
}

/** The text in the current locale. */
const L = (pt: string, en: string): string => tr({ 'pt-BR': pt, en });

/** Number for TeX in the current locale (decimal comma as `{,}` in pt-BR); NaN → em dash. */
export function texNum(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '\\text{—}';
  const s = fmtNumber(x, { maximumFractionDigits: digits, useGrouping: false });
  return s.replace('−', '-').replace(',', '{,}');
}
/** Number for plain text in the current locale. */
export function txtNum(x: number, digits = 3): string {
  return Number.isFinite(x) ? fmtNumber(x, { maximumFractionDigits: digits }) : '—';
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
    ? [
        s.variant === 'ORIGINAL'
          ? L(
              'Intervalos = primeira → última unidade simulada de cada tipo (primeiras unidades do pool).',
              'Ranges = first → last simulated unit of each type (first units of the pool).',
            )
          : L(
              'Intervalos = primeira → última unidade simulada de cada tipo (centros de fatias iguais do pool).',
              'Ranges = first → last simulated unit of each type (centres of equal slices of the pool).',
            ),
      ]
    : [L('Contagens automáticas: intervalos do pool inteiro de cada tipo.', 'Automatic counts: ranges of the whole pool of each type.')];
}

function geometryName(g: string): string {
  if (g === 'CYLINDRICAL') return L('cilíndrica', 'cylindrical');
  if (g === 'SPHERICAL') return L('esférica', 'spherical');
  return g;
}

const MODULATION_FACTOR: Record<string, string> = {
  STEP: '1',
  RAMP: 't/T',
  TRIANGLE: '\\begin{cases} t/t_p & t \\le t_p \\\\ 1 - (t - t_p)/(T - t_p) & t > t_p \\end{cases}',
  SINUSOIDAL: '\\sin t',
};

function stage1(s: ModelSnapshot): StageContent {
  const st = s.stimulus;
  if (st.pulseWidthUs !== null) return stage1Stimulator(s);
  const mono = st.waveform === 'MONOPHASIC';
  const otherwise = L('caso contrário', 'otherwise');
  const symbolic = [
    mono
      ? `I(t) = A \\cdot \\frac{\\operatorname{sq}(2\\pi f t,\\ D) + 1}{2}, \\qquad \\operatorname{sq}(x, D) = \\begin{cases} +1 & x \\bmod 2\\pi < \\tfrac{D}{100}2\\pi \\\\ -1 & \\text{${otherwise}} \\end{cases}`
      : 'I(t) = A \\cdot \\operatorname{sq}(2\\pi f t,\\ D)',
    'PW = \\frac{D}{100 \\cdot f}',
  ];
  const substituted = [
    `f = \\frac{${texNum(st.frequencyHz)}}{1000} = ${texNum(st.fKHz, 4)}\\ \\text{kHz}, \\quad D = ${texNum(st.dutyCyclePercent)}\\,\\%, \\quad A = ${texNum(st.amplitude)}`,
    `PW = \\frac{${texNum(st.dutyCyclePercent)}}{100 \\cdot ${texNum(st.fKHz, 4)}} = ${texNum(st.pwMs)}\\ \\text{ms}`,
  ];
  const notes: string[] = [mono ? L('Forma de onda monofásica.', 'Monophasic waveform.') : L('Forma de onda bifásica.', 'Biphasic waveform.')];
  if (st.modulationTarget === 'AMPLITUDE') {
    substituted.push(
      `A(t) = ${texNum(st.amplitude)} \\cdot ${MODULATION_FACTOR[st.modulationShape] ?? '1'}` +
        (st.modulationShape === 'TRIANGLE' ? `, \\quad t_p = ${texNum(st.peakTimeMs)}\\ \\text{ms}` : '') +
        `, \\quad T = ${texNum(st.durationMs)}\\ \\text{ms}`,
    );
  } else {
    notes.push(
      st.modulationTarget === 'FREQUENCY'
        ? L(
            'Modulação de frequência: segue o FES.m literalmente (ver o código); sem forma fechada no documento.',
            'Frequency modulation: follows FES.m literally (see the code); no closed form in the document.',
          )
        : L(
            'Modulação de largura de pulso: segue o FES.m literalmente (ver o código); sem forma fechada no documento.',
            'Pulse-width modulation: follows FES.m literally (see the code); no closed form in the document.',
          ),
    );
  }
  if (st.train) {
    const train = L('trem', 'train');
    const when = L('quando', 'when');
    symbolic.push(`I(t) = 0 \\quad \\text{${when}}\\quad t \\bmod T_{\\text{${train}}} \\ge T_{\\text{${L('ligado', 'on')}}}`);
    substituted.push(`I(t) = 0 \\quad \\text{${when}}\\quad t \\bmod ${texNum(st.train.periodMs)} \\ge ${texNum(st.train.onMs)}\\ \\text{ms}`);
  }
  return { id: '1', title: L('Estímulo', 'Stimulus'), source: 'domain/stimulus.py (FES.m)', symbolic, substituted, notes };
}

/** Stimulator mode: pulses defined in time, envelope with ramps (domain/stimulus.py, `pulse_width_us`). */
function stage1Stimulator(s: ModelSnapshot): StageContent {
  const st = s.stimulus;
  const bi = st.waveform === 'BIPHASIC_SYMMETRIC';
  const period = 1000 / st.frequencyHz;
  const on = st.train ? st.train.onMs : st.durationMs;
  const otherwise = L('caso contrário', 'otherwise');
  const train = L('trem', 'train');
  const symbolic = [
    'I(t) = A \\cdot E(t) \\cdot p(t)',
    bi
      ? `p(t) = \\begin{cases} +1 & \\tau < PW \\\\ -1 & PW \\le \\tau < 2\\,PW \\\\ 0 & \\text{${otherwise}} \\end{cases}, \\qquad \\tau = t \\bmod T_p`
      : `p(t) = \\begin{cases} 1 & \\tau < PW \\\\ 0 & \\text{${otherwise}} \\end{cases}, \\qquad \\tau = t \\bmod T_p`,
    `E(t) = \\min\\left(1,\\ \\frac{u}{t_{\\uparrow}},\\ \\frac{T_{\\text{on}} - u}{t_{\\downarrow}}\\right),\\quad u = t \\bmod T_{\\text{${train}}};\\quad E = 0 \\text{ ${L('se', 'if')} } u \\ge T_{\\text{on}}`,
  ];
  const substituted = [
    `T_p = \\frac{1000}{${texNum(st.frequencyHz)}} = ${texNum(period)}\\ \\text{ms}, \\quad PW = ${texNum(st.pulseWidthUs ?? NaN, 0)}\\ \\mu\\text{s}, \\quad A = ${texNum(st.amplitude)}`,
    `t_{\\uparrow} = ${texNum(st.rampUpMs)}\\ \\text{ms}, \\quad t_{\\downarrow} = ${texNum(st.rampDownMs)}\\ \\text{ms}, \\quad T_{\\text{on}} = ${texNum(on)}\\ \\text{ms}` +
      (st.train ? `, \\quad T_{\\text{${train}}} = ${texNum(st.train.periodMs)}\\ \\text{ms}` : ''),
  ];
  const notes = [
    bi
      ? L(
          'Pulso bifásico simétrico (carga balanceada): só a primeira fase excita o axônio; a segunda cai no período refratário.',
          'Symmetric biphasic pulse (charge-balanced): only the first phase excites the axon; the second falls in the refractory period.',
        )
      : L('Pulso monofásico.', 'Monophasic pulse.'),
    L(
      'Largura de pulso independente da frequência, como num estimulador. Sem trens, as rampas valem para a simulação inteira.',
      'Pulse width independent of the frequency, as in a stimulator. Without trains, the ramps apply to the whole simulation.',
    ),
  ];
  return {
    id: '1',
    title: L('Estímulo (estimulador)', 'Stimulus (stimulator)'),
    source: L('domain/stimulus.py (modo estimulador)', 'domain/stimulus.py (stimulator mode)'),
    symbolic,
    substituted,
    notes,
  };
}

function stage2a(s: ModelSnapshot): StageContent {
  const m = s.motoneuron;
  const c = CONSTANTS.conductances;
  const e = CONSTANTS.reversal;
  return {
    id: '2a',
    title: L('Motoneurônio (soma + dendrito)', 'Motoneuron (soma + dendrite)'),
    source: 'domain/motoneuron.py (rates.m)',
    symbolic: [
      'C_s \\frac{dV_s}{dt} = I_{s} - g_{Na}\\, m_\\infty^3(V_s)\\, h\\,(V_s - E_{Na}) - g_{Ca}\\, m_{Ca}^2 h_{Ca}(V_s - E_{Ca}) - g_K\\, n^4 (V_s - E_K) - g_{KCa}\\frac{[Ca]_s}{K_d + [Ca]_s}(V_s - E_K) - g_L (V_s - E_L) + \\frac{g_c}{p}(V_d - V_s)',
      'C_d \\frac{dV_d}{dt} = I_{d} - g_{Ca,d}\\, m_{Ca,d}(V_d - E_{Ca}) - g_{NaP}\\, m_{NaP} h_{NaP}(V_d - E_{Na}) - g_{KCa,d}\\frac{[Ca]_d}{K_d + [Ca]_d}(V_d - E_K) - g_L (V_d - E_L) + \\frac{g_c}{1-p}(V_s - V_d)',
      '\\frac{dx}{dt} = \\varphi\\,\\frac{x_\\infty(V) - x}{\\tau_x(V)}, \\qquad \\varphi = 3^{(T_{^\\circ C} - 6{,}3)/10}, \\qquad \\frac{d[Ca]}{dt} = \\varphi\\,(-f \\alpha I_{Ca} - f k_{Ca} [Ca])',
    ],
    substituted: [
      `\\varphi = 3^{(${texNum(m.temperatureCelsius)} - 6{,}3)/10} = ${texNum(m.phi, 4)}`,
      m.injectionSite === 'SOMA'
        ? `I_s = I(t),\\quad I_d = 0 \\quad (\\text{${L('injeção no soma', 'injection into the soma')}})`
        : `I_d = I(t),\\quad I_s = 0 \\quad (\\text{${L('injeção no dendrito', 'injection into the dendrite')}})`,
      `E_{Na} = ${e.ENa},\\ E_K = ${e.EK},\\ E_L = ${e.EL},\\ E_{Ca} = ${e.ECa}\\ \\text{mV}`,
      `g_{Na} = ${c.gNa},\\ g_K = ${c.gK},\\ g_{Ca} = ${c.gCa},\\ g_{KCa} = ${c.gKCa},\\ g_L = ${texNum(c.gL)},\\ g_c = ${texNum(c.gc)},\\ g_{NaP} = ${texNum(c.gNaP)},\\ g_{Ca,d} = ${texNum(c.gCaD)},\\ C = ${c.C}`,
    ],
    notes: [
      L(
        `p = A_s/(A_s + A_d) a partir da geometria: soma ${geometryName(m.somaGeometry)}, dendrito ${geometryName(m.dendriteGeometry)}.`,
        `p = A_s/(A_s + A_d) from the geometry: ${geometryName(m.somaGeometry)} soma, ${geometryName(m.dendriteGeometry)} dendrite.`,
      ),
      L('Potenciais de reversão expressos como v + v_rest.', 'Reversal potentials expressed as v + v_rest.'),
    ],
  };
}

/** Cisi & Kohn (2008) motoneuron, which receives the central drive (domain/cisi_kohn.py). */
function stage2c(s: ModelSnapshot): StageContent {
  const d = s.drive;
  const rule2008 = d?.thresholdRule !== 'WATANABE_2013';
  const factor = d?.scale === 'RHEOBASE' ? (rule2008 ? 3.5 / 4 : 5.63 / 4) : 1;
  const drive = d
    ? `I_{drive}(t) = ${texNum(d.backgroundNa * factor, 3)} + ${texNum(d.voluntaryNa * factor, 3)}${
        d.tremor ? ` + ${texNum(d.tremor.amplitudeNa * factor, 3)}\\,\\sin(2\\pi\\,${texNum(d.tremor.frequencyHz, 2)}\\,t)` : ''
      } + \\eta_k(t)\\ \\text{nA}`
    : 'I_{drive} = 0';
  return {
    id: '2c',
    title: L('Motoneurônio de Cisi & Kohn (drive central)', 'Cisi & Kohn motoneuron (central drive)'),
    source: 'domain/cisi_kohn.py · infrastructure/compiled_cisi_kohn.py',
    symbolic: [
      'C_s \\frac{dV_s}{dt} = -g_{L,s} V_s - g_c (V_s - V_d) - \\bar g_{Na}\\, m^3 h\\,(V_s - E_{Na}) - \\bar g_{Kf}\\, n^4 (V_s - E_K) - \\bar g_{Ks}\\, q^2 (V_s - E_K) + I(t)',
      'C_d \\frac{dV_d}{dt} = -g_{L,d} V_d - g_c (V_d - V_s), \\qquad g_c = \\frac{2}{\\frac{R_i l_d}{\\pi r_d^2} + \\frac{R_i l_s}{\\pi r_s^2}}',
      L(
        '\\text{pulso de } 0{,}6\\ \\text{ms após } V_s > V_{th}: \\ x \\to 1 + (x_0 - 1)e^{-\\alpha_x t}\\ (m, n, q), \\ h \\to h_0 e^{-\\beta_h t}; \\ \\text{fora do pulso: } x \\to x_0 e^{-\\beta_x t},\\ h \\to 1 + (h_0 - 1) e^{-\\alpha_h t}',
        '0{,}6\\ \\text{ms pulse after } V_s > V_{th}: \\ x \\to 1 + (x_0 - 1)e^{-\\alpha_x t}\\ (m, n, q), \\ h \\to h_0 e^{-\\beta_h t}; \\ \\text{outside the pulse: } x \\to x_0 e^{-\\beta_x t},\\ h \\to 1 + (h_0 - 1) e^{-\\alpha_h t}',
      ),
    ],
    substituted: [
      `E_{Na} = 120,\\ E_K = -10,\\ E_L = 0\\ \\text{mV (${L('repouso', 'rest')} = 0)},\\quad C_m = 1\\ \\mu F/cm^2,\\quad R_i = 70\\ \\Omega\\,cm`,
      '\\bar g_{Na} = 30,\\quad \\bar g_{Kf} = 4 / 4 / 0{,}5,\\quad \\bar g_{Ks} = 17 / 37{,}5 / 8\\ \\text{mS/cm}^2\\ (S / FR / FF)',
      rule2008
        ? 'V_{th} = I_{rh} \\cdot R_{in},\\quad I_{rh} = 3{,}5 \\to 6{,}5\\ (S),\\ 6{,}5 \\to 17{,}5\\ (FR),\\ 17{,}5 \\to 25{,}1\\ (FF)\\ \\text{nA}'
        : 'V_{th} = 12{,}35 \\to 16{,}45\\ (S),\\ 16{,}45 \\to 19{,}30\\ (FR),\\ 19{,}30 \\to 20{,}90\\ (FF)\\ \\text{mV}',
      drive,
      ...(d
        ? [
            `\\eta_k:\\ \\text{${L('ruído independente por unidade', 'independent noise per unit')}}, < 100\\ \\text{Hz},\\quad \\sigma = ${texNum(d.noiseCv, 2)} \\times ${texNum((d.backgroundNa + d.voluntaryNa) * factor, 3)}\\ \\text{nA}`,
          ]
        : []),
      ...(d && !d.invasive
        ? [
            L(
              `\\text{eletrodo a } ${texNum(d.electrodeFraction * 100, 0)}\\,\\%\\ \\text{do caminho soma} \\to \\text{músculo (encontro dos disparos no axônio)}`,
              `\\text{electrode at } ${texNum(d.electrodeFraction * 100, 0)}\\,\\%\\ \\text{of the soma} \\to \\text{muscle path (where the spikes meet on the axon)}`,
            ),
          ]
        : []),
      d?.invasive
        ? 'I(t) = I_{drive}(t) + I_{FES}(t) \\cdot C_s \\quad (\\mu A/cm^2 \\to nA)'
        : `I(t) = I_{drive}(t)\\quad (\\text{${L('o FES age no axônio', 'FES acts on the axon')}})`,
    ],
    notes: [
      L(
        'Período refratário de 5 ms; um disparo antidrômico que chega ao soma conta como disparo do soma e não desce pelo axônio.',
        'Refractory period of 5 ms; an antidromic spike reaching the soma counts as a soma spike and does not travel down the axon.',
      ),
      rule2008
        ? L(
            'Limiares pela regra de 2008: a reobase de cada unidade é a publicada (menor unidade 3,5 nA, perto dos 4 nA de Gallego).',
            'Thresholds by the 2008 rule: the rheobase of each unit is the published one (smallest unit 3.5 nA, close to the 4 nA of Gallego).',
          )
        : L(
            'Limiares de Watanabe 2013: as reobases saem ≈ 1,6× maiores (menor unidade 5,6 nA).',
            'Thresholds of Watanabe 2013: the rheobases come out ≈ 1.6× larger (smallest unit 5.6 nA).',
          ),
      L(
        'Validado contra a Tabela 5 do artigo: resistência de entrada, constante de tempo, reobases, inclinação f–I e pós-hiperpolarização das unidades S.',
        'Validated against Table 5 of the article: input resistance, time constant, rheobases, f–I slope and afterhyperpolarization of the S units.',
      ),
    ],
  };
}

function stage2b(s: ModelSnapshot): StageContent {
  const st = s.stimulus;
  const r = s.recruitment;
  const tau = s.condition.effects.tauSdMs;
  const sd = 1 + tau / st.pwMs;
  let status: StageStatus | undefined;
  if (r) {
    const lo = txtNum(r.thresholdMin, 1);
    const hi = txtNum(r.thresholdMax, 1);
    const a = txtNum(st.amplitude);
    status =
      r.status === 'all'
        ? { tone: 'good', text: `A = ${a} ≥ ${hi}: ${L('todas as unidades recrutadas', 'all units recruited')}` }
        : r.status === 'partial'
          ? {
              tone: 'warn',
              text: `${lo} ≤ A = ${a} < ${hi}: ${L('recrutamento parcial', 'partial recruitment')} (≈ ${txtNum(r.fraction * 100, 0)} % ${L('dos axônios', 'of the axons')})`,
            }
          : { tone: 'bad', text: `A = ${a} < ${lo}: ${L('nenhuma unidade recrutada', 'no unit recruited')}` };
  }
  const notes = [
    L(
      'I_rh,k distribuído linearmente em [I_rh,min; R·I_rh,min], em ordem aleatória definida pela semente (recrutamento não seletivo, Gregory & Bickel 2005). Com pulso de 0,3 ms a primeira unidade é recrutada em 56,9 e todas em 102,1. O disparo ocorre no fim do pulso.',
      'I_rh,k spread linearly over [I_rh,min; R·I_rh,min], in a random order set by the seed (non-selective recruitment, Gregory & Bickel 2005). With a 0.3 ms pulse the first unit is recruited at 56.9 and all at 102.1. The spike occurs at the end of the pulse.',
    ),
  ];
  if (r?.status === 'partial') {
    notes.push(L('A porcentagem trata a distribuição linear como contínua (aproximação).', 'The percentage treats the linear distribution as continuous (approximation).'));
  }
  if (st.modulationTarget === 'AMPLITUDE' && st.modulationShape !== 'STEP') {
    notes.push(
      L(
        'Com modulação de amplitude, A é o valor de pico; o recrutamento varia ao longo do tempo.',
        'With amplitude modulation, A is the peak value; recruitment varies over time.',
      ),
    );
  }
  if (st.modulationTarget !== 'AMPLITUDE') {
    notes.push(
      L(
        'Com modulação de frequência ou largura de pulso, PW e o limiar variam ao longo do tempo.',
        'With frequency or pulse-width modulation, PW and the threshold vary over time.',
      ),
    );
  }
  const condition =
    tau !== CONSTANTS.tauSdMs
      ? [
          L(
            `Constante intensidade–duração menor (lesão medular, Lin 2007): τ = ${txtNum(tau, 2)} ms em vez de ${txtNum(CONSTANTS.tauSdMs, 3)} ms — muda os limiares acima.`,
            `Shorter strength–duration time constant (spinal cord injury, Lin 2007): τ = ${txtNum(tau, 2)} ms instead of ${txtNum(CONSTANTS.tauSdMs, 3)} ms — changes the thresholds above.`,
          ),
        ]
      : undefined;
  const e = s.electrode;
  const x = e?.excitability ?? null;
  const g = x?.g ?? 1;
  const rhMin = x?.rheobaseMin ?? CONSTANTS.rheobaseMin;
  const spread = x?.rheobaseSpread ?? CONSTANTS.rheobaseSpread;
  const calibration = e?.input.calibration ?? null;
  const unitText = x?.unit === 'MA' ? '\\ \\text{mA}' : '';
  const symbolic = [
    e
      ? 'A \\;\\ge\\; G\\, I_{rh,k}\\left(1 + \\frac{\\tau_{SD}}{PW}\\right), \\qquad \\tau_{SD} = 0{,}459\\ \\text{ms} \\;\\text{(Mogyoros et al. 1996)}'
      : 'A \\;\\ge\\; I_{rh,k}\\left(1 + \\frac{\\tau_{SD}}{PW}\\right), \\qquad \\tau_{SD} = 0{,}459\\ \\text{ms} \\;\\text{(Mogyoros et al. 1996)}',
    calibration
      ? `I_{rh,k} \\in [I_{rh,\\min},\\ R\\, I_{rh,\\min}], \\qquad I_{rh,\\min} = \\frac{I_{MT}}{1 + \\tau_{SD}/PW_c}, \\qquad R = ${
          calibration.fullRecruitmentMa ? '\\frac{I_{full}}{I_{MT}}' : '\\frac{102{,}1}{56{,}9}'
        }`
      : 'I_{rh,k} \\in [I_{rh,\\min},\\ R\\, I_{rh,\\min}], \\qquad I_{rh,\\min} = \\frac{56{,}9}{1 + 0{,}459/0{,}3}, \\qquad R = \\frac{102{,}1}{56{,}9}',
  ];
  const substituted = [
    `I_{rh,\\min} = ${texNum(rhMin, 4)}${unitText}, \\qquad R = ${texNum(spread, 4)}`,
    `${texNum(st.amplitude)} \\;\\ge\\; ${e ? `${texNum(g, 3)}\\, ` : ''}I_{rh,k}\\left(1 + \\frac{${texNum(tau, 3)}}{${texNum(st.pwMs)}}\\right) = ${texNum(g * sd, 3)}\\, I_{rh,k}`,
    r
      ? `${e ? 'G\\, ' : ''}I_{rh,\\min}\\left(1 + \\frac{\\tau_{SD}}{PW}\\right) = ${e ? `${texNum(g, 3)} \\cdot ` : ''}${texNum(rhMin, 3)} \\cdot ${texNum(sd, 3)} = ${texNum(r.thresholdMin, 1)} \\;\\ldots\\; \\times R = ${texNum(r.thresholdMax, 1)}${unitText}`
      : `\\text{${L('PW inválido', 'invalid PW')}}`,
  ];
  if (e) {
    if (e.effectModel === 'HALF_SPACE_AF') {
      symbolic.push(
        'G = \\frac{\\max_{x} \\mathrm{AF}(a_{ref},\\, d_{ref},\\, x)}{\\max_{x} \\mathrm{AF}(a,\\, d,\\, x)}, \\qquad a = \\sqrt{S/\\pi}, \\qquad d = f + h',
        '\\mathrm{AF}(0) = -\\frac{\\rho\\, I}{2\\pi\\,(a^2 + d^2)^{3/2}} \\quad \\text{(' + L('disco sobre meio semi-infinito; o máximo pode ficar sob a borda', 'disk on a half-space; the maximum may lie under the edge') + ')}',
      );
      substituted.push(
        `S = ${texNum(e.areaCm2, 2)}\\ \\text{cm}^2,\\ a = ${texNum(e.radiusCm, 3)},\\ f = ${texNum(e.input.electrode.fatThicknessCm, 2)},\\ h = ${texNum(e.input.electrode.axonDepthCm, 2)},\\ d = ${texNum(e.depthCm, 3)}\\ \\text{cm}`,
        `a_{ref} = ${texNum(e.refRadiusCm, 3)},\\ d_{ref} = ${texNum(e.refDepthCm, 3)}\\ \\text{cm} \\;\\Rightarrow\\; G = ${texNum(g, 3)}`,
      );
      if (calibration) symbolic.push('a_{ref} = \\sqrt{S_c/\\pi}, \\qquad d_{ref} = d \\quad \\text{(' + L('eletrodo da medida', 'measurement electrode') + ')}');
    } else {
      symbolic.push('G = 1 \\quad \\text{(Lieber \\& Kelly 1991)}');
      substituted.push(`G = 1`);
    }
    notes.push(
      e.effectModel === 'HALF_SPACE_AF'
        ? L(
            'Eletrodo: fórmula derivada — modelo derivado, magnitude ilustrativa, não validada. A direção bate com as medidas (eletrodo maior ou gordura mais grossa pedem mais corrente: Alon 1994, Doheny 2010, Flodin 2022), mas o meio homogêneo exagera o efeito do tamanho para alvos rasos (teste V5, falha esperada). No eletrodo, gordura e profundidade padrão do músculo, G = 1.',
            'Electrode: derived formula — derived model, illustrative magnitude, not validated. The direction matches the measurements (a larger electrode or thicker fat needs more current: Alon 1994, Doheny 2010, Flodin 2022), but the homogeneous medium overstates the size effect for shallow targets (test V5, expected failure). At the muscle\'s default electrode, fat and depth, G = 1.',
          )
        : L('Eletrodo: sem efeito do tamanho (Lieber & Kelly 1991), G = 1.', 'Electrode: no effect of size (Lieber & Kelly 1991), G = 1.'),
    );
    if (calibration)
      notes.push(
        L(
          'Calibrado com a sua medida: a amplitude está em mA; I_rh,min e R vêm do limiar motor (e do recrutamento total) medidos.',
          'Calibrated with your measurement: the amplitude is in mA; I_rh,min and R come from the measured motor threshold (and full recruitment).',
        ),
      );
  }
  return {
    ...(condition ? { condition } : {}),
    id: '2b',
    title: L('Axônio motor (Weiss)', 'Motor axon (Weiss)'),
    source: e ? 'domain/axon_stimulation.py, domain/electrode.py' : 'domain/axon_stimulation.py',
    symbolic,
    substituted,
    notes,
    ...(status ? { status } : {}),
  };
}

function stage3(s: ModelSnapshot): StageContent {
  const c = s.conduction;
  const st = s.stimulus;
  const orig = s.variant === 'ORIGINAL';
  const samples = L('amostras', 'samples');
  const symbolic: string[] = orig
    ? [
        'V_J = V_s \\cdot \\frac{0{,}070\\,\\lambda}{2}\\, e^{-x/\\lambda}, \\qquad \\lambda = \\sqrt{1/0{,}070}, \\qquad x = \\frac{\\text{axonLengthPercent}}{100}',
        `\\Delta_k = \\frac{x}{v_k}\\cdot \\frac{T}{\\delta t}\\ \\text{${samples} (ORIGINAL, Q4)}`,
      ]
    : [`\\Delta_k = \\frac{x}{v_k}\\cdot\\frac{1000}{\\delta t}\\ \\text{${samples} (LITERATURE)}, \\qquad x = \\frac{\\text{axonLengthPercent}}{100}`];
  const scale = orig ? texNum(st.durationMs) : '1000';
  const substituted: string[] = [
    ...(orig
      ? [`V_J = V_s \\cdot ${texNum(c.junctionGain, 4)} \\quad (\\lambda = ${texNum(Math.sqrt(1 / CONSTANTS.junctionG), 3)},\\ x = ${texNum(c.x)})`]
      : []),
    ...c.delays.map(
      (d) =>
        `v = ${d.velocity}\\ \\text{m/s}: \\ \\Delta = \\frac{${texNum(c.x)}}{${d.velocity}}\\cdot\\frac{${scale}}{${texNum(st.stepMs, 4)}} = ${texNum(d.samples, 0)}\\ \\text{${samples}} = ${texNum(d.ms, 2)}\\ \\text{ms}`,
    ),
  ];
  substituted.push(
    ...perType(s, (t) => {
      const sp = s.typeSpans[t];
      return `v_k = ${texSpan(sp.velocity, 2)}\\ \\text{m/s} \\;\\Rightarrow\\; \\Delta_k = ${texSpan(sp.delayMs, 2)}\\ \\text{ms}`;
    }),
  );
  // non-invasive mode with a central drive: the electrode splits the axon, and FES and central spikes meet on its
  // soma side (``domain/central_drive.split_at_electrode``, ``infrastructure/axon_merge.py``)
  const e = s.drive && !s.drive.invasive ? s.drive.electrodeFraction : null;
  if (e !== null) {
    const electrode = L('eletrodo', 'electrode');
    const muscle = L('músculo', 'muscle');
    const window = L('janela', 'window');
    symbolic.push(
      `\\Delta_k = \\underbrace{f\\,\\Delta_k}_{\\Delta_1:\\ \\text{soma}\\to\\text{${electrode}}} + \\underbrace{(1-f)\\,\\Delta_k}_{\\Delta_2:\\ \\text{${electrode}}\\to\\text{${muscle}}}`,
      L(
        '\\text{colisão: o disparo central sai do soma até } \\Delta_1 \\text{ antes do pulso ou até } \\Delta_1 \\text{ depois} \\;\\Rightarrow\\; \\text{janela} = 2\\,\\Delta_1',
        '\\text{collision: the central spike leaves the soma up to } \\Delta_1 \\text{ before the pulse or up to } \\Delta_1 \\text{ after it} \\;\\Rightarrow\\; \\text{window} = 2\\,\\Delta_1',
      ),
    );
    substituted.push(
      `f = ${texNum(e, 2)}`,
      ...perType(s, (t) => {
        const d = s.typeSpans[t].delayMs;
        if (!d) return null;
        const part = (k: number) => texSpan({ from: d.from * k, to: d.to * k }, 2);
        return `\\Delta_1 = ${part(e)},\\quad \\Delta_2 = ${part(1 - e)},\\quad \\text{${window}} = ${part(2 * e)}\\ \\text{ms}`;
      }),
    );
  }
  const electrodeNotes =
    e !== null
      ? [
          L(
            'f = posição do eletrodo (fração do caminho soma → músculo). Ela muda onde os disparos se encontram, não o atraso total: sem FES, a força é a mesma em qualquer posição.',
            'f = electrode position (fraction of the soma → muscle path). It changes where the spikes meet, not the total delay: without FES, the force is the same at any position.',
          ),
          L(
            'Quanto mais longe do soma, maior a janela e mais disparos centrais o FES anula: consequência da regra de colisão (algoritmo de Formento et al. 2018).',
            'The farther from the soma, the wider the window and the more central spikes FES cancels: a consequence of the collision rule (algorithm of Formento et al. 2018).',
          ),
        ]
      : [];
  return {
    id: '3',
    title: L('Condução até o músculo', 'Conduction to the muscle'),
    source: e !== null ? 'domain/force_pipeline.py, domain/central_drive.py, infrastructure/axon_merge.py' : 'domain/force_pipeline.py, domain/motor_unit_pool.py',
    symbolic,
    substituted,
    notes: [...electrodeNotes, ...(orig
      ? [
          L('Somente soma; V_J passa por filtro de mediana 3×3.', 'Soma only; V_J goes through a 3×3 median filter.'),
          L(
            'x em metros (axonLengthPercent/100), v_k (APAT) em m/s, 44–53. No ORIGINAL o atraso em ms é x/v·T, escalando com a duração T (Q4).',
            'x in metres (axonLengthPercent/100), v_k (APAT) in m/s, 44–53. In ORIGINAL the delay in ms is x/v·T, scaling with the duration T (Q4).',
          ),
          ...countsNote(s),
        ]
      : [
          L(
            'x em metros (axonLengthPercent/100), v_k (APAT) em m/s, 44–53; atraso em ms = x/v·1000, independente da duração.',
            'x in metres (axonLengthPercent/100), v_k (APAT) in m/s, 44–53; delay in ms = x/v·1000, independent of the duration.',
          ),
          ...countsNote(s),
        ])],
  };
}

function stage4(s: ModelSnapshot): StageContent {
  const orig = s.variant === 'ORIGINAL';
  const shape = L('forma', 'shape');
  return {
    id: '4',
    title: L('Potencial de ação da unidade motora e EMG', 'Motor unit action potential and EMG'),
    source: 'domain/force_pipeline.py',
    symbolic: [
      `\\text{MUAP}_k(t) = H \\cdot S_k \\cdot \\begin{cases} t\\, e^{-u^2} & \\text{(${shape} 0)} \\\\ (1 - 2u^2)\\, e^{-u^2} & \\text{(${shape} 1)} \\end{cases}, \\qquad u = t/\\lambda_m`,
    ],
    substituted: [
      `H = ${orig ? '\\max V_J' : '1'}, \\qquad t \\in [-1{,}25;\\ 1{,}25]\\ \\text{ms}, \\qquad \\text{seed} = ${texNum(s.seed, 0)}`,
      ...perType(s, (t) => `S_k = ${texSpan(s.typeSpans[t].apsf, 4)}, \\quad \\lambda_m = ${texSpan(s.typeSpans[t].aptf, 4)}`),
    ],
    notes: [
      orig
        ? L(
            'Escrito Δ_k amostras após cada disparo (pico da junção). S_k = APSF, λ_m = APTF; forma sorteada por unidade a partir da semente.',
            'Written Δ_k samples after each spike (junction peak). S_k = APSF, λ_m = APTF; shape drawn per unit from the seed.',
          )
        : L(
            'Escrito Δ_k amostras após cada disparo (disparo do axônio). S_k = APSF, λ_m = APTF; forma sorteada por unidade a partir da semente.',
            'Written Δ_k samples after each spike (axon spike). S_k = APSF, λ_m = APTF; shape drawn per unit from the seed.',
          ),
      L('EMG exibido = soma, sobre os tipos, do MUAP médio.', 'Displayed EMG = sum, over the types, of the mean MUAP.'),
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
        L('Criticamente amortecido; P_k e T_k variam por unidade.', 'Critically damped; P_k and T_k vary per unit.'),
        ...countsNote(s),
        L(
          'Força da unidade = soma dos twitches disparados pelos picos do MUAP somado do tipo, ponderados pelo valor do pico (Q2).',
          'Unit force = sum of the twitches triggered by the peaks of the summed MUAP of the type, weighted by the peak value (Q2).',
        ),
      ],
    };
  }
  const fit = twitchCalibration(s.calibrationTarget, s.muscle);
  const fast = s.condition.effects.twitchTimeFactor;
  const k = fit.timeScale * fast;
  const m = fit.m;
  return {
    ...(fast !== 1
      ? {
          condition: [
            L(
              `Abalo mais rápido (lesão medular, Scott 2006): tempo de contração × ${txtNum(fast, 2)} (T_k ← ${txtNum(fit.timeScale, 4)} × ${txtNum(fast, 2)} = ${txtNum(k, 4)} × MTTP) e meia-relaxação × ${txtNum(0.62, 2)} (m recalculado no motor).`,
              `Faster twitch (spinal cord injury, Scott 2006): contraction time × ${txtNum(fast, 2)} (T_k ← ${txtNum(fit.timeScale, 4)} × ${txtNum(fast, 2)} = ${txtNum(k, 4)} × MTTP) and half-relaxation × ${txtNum(0.62, 2)} (m recomputed in the engine).`,
            ),
          ],
        }
      : {}),
    id: '5b',
    title: L('Twitch generalizado', 'Generalized twitch'),
    source: 'domain/twitch.py',
    symbolic: ['h_k(t) = P_k \\left(\\frac{t}{T_k}\\right)^{m} e^{m(1 - t/T_k)}'],
    substituted: [
      `m = ${texNum(m, 4)}, \\qquad T_k \\leftarrow ${texNum(k, 4)}\\,\\text{MTTP}_k`,
      `h_k(t) = P_k \\left(\\frac{t}{${texNum(k, 4)}\\,\\text{MTTP}_k}\\right)^{${texNum(m, 4)}} e^{${texNum(m, 4)}\\left(1 - \\frac{t}{${texNum(k, 4)}\\,\\text{MTTP}_k}\\right)}`,
      ...perType(s, (t) => `P_k = ${texSpan(s.typeSpans[t].mt, 4)}, \\quad T_k = ${texSpan(s.typeSpans[t].tkMs, 2)}\\ \\text{ms}`),
    ],
    notes: [
      L(
        `Ajustado ao ${tr(fit.fittedTo)}: CT ${txtNum(fit.ctMs)} ms, HRT ${txtNum(fit.hrtMs)} ms.`,
        `Fitted to the ${tr(fit.fittedTo)}: CT ${txtNum(fit.ctMs)} ms, HRT ${txtNum(fit.hrtMs)} ms.`,
      ),
      L('Força da unidade = soma dos twitches dos seus próprios disparos, peso 1.', 'Unit force = sum of the twitches of its own spikes, weight 1.'),
      ...countsNote(s),
    ],
  };
}

function stage6(s: ModelSnapshot): StageContent {
  const r = s.rate;
  return {
    id: '6',
    title: L('Saturação por frequência', 'Rate saturation'),
    source: 'twitch.RateGain (Potvin & Fuglevand 2017, Eqs 4–6)',
    symbolic: [
      'NR = \\frac{T_k}{\\text{ISI}}, \\qquad NF(NR) = \\begin{cases} 0{,}3\\,NR & NR \\le 0{,}4 \\\\ 1 - e^{-2 NR^3} & NR > 0{,}4 \\end{cases}, \\qquad g = \\frac{NF(NR)}{0{,}3\\,NR}',
    ],
    substituted: [
      `\\text{ISI} = \\frac{1000}{${texNum(s.stimulus.frequencyHz)}} = ${texNum(r.isiMs, 2)}\\ \\text{ms}, \\qquad NR = \\frac{T_k}{${texNum(r.isiMs, 2)}}`,
      `NR \\le 0{,}4 \\iff T_k \\le ${texNum(r.kneeTkMs, 2)}\\ \\text{ms} \\quad (g = 1)`,
    ],
    notes: [
      L(
        'ISI aqui = intervalo entre pulsos do estímulo (cada pulso dispara os axônios recrutados).',
        'ISI here = interval between stimulus pulses (each pulse fires the recruited axons).',
      ),
      L('Cada twitch é multiplicado por g, para que a soma dos twitches siga NF.', 'Each twitch is multiplied by g, so that the sum of the twitches follows NF.'),
    ],
  };
}

function stage7(s: ModelSnapshot): StageContent {
  const shift = s.condition.effects.fastShift;
  const pause = L('pausa', 'pause');
  return {
    ...(shift
      ? {
          condition: [
            L(
              `Fadigabilidade lenta → rápida (lesão medular, Chang & Shields 2011): o expoente de cada unidade anda ${txtNum(shift * 100, 1)} % do caminho até o da unidade mais fatigável — f_k ← f_k + ${txtNum(shift, 3)}·(1 − f_k).`,
              `Slow → fast fatigability (spinal cord injury, Chang & Shields 2011): the exponent of each unit moves ${txtNum(shift * 100, 1)} % of the way to that of the most fatigable unit — f_k ← f_k + ${txtNum(shift, 3)}·(1 − f_k).`,
            ),
          ],
        }
      : {}),
    id: '7',
    title: L('Fadiga periférica', 'Peripheral fatigue'),
    source: 'domain/fatigue.py (Potvin & Fuglevand 2017, Eqs 9–11, 14)',
    symbolic: [
      'FAT_k = 0{,}0125\\cdot 180^{\\frac{\\ln(P_k/P_{\\min})}{\\ln(P_{\\max}/P_{\\min})}}\\ \\%/\\text{s}, \\qquad \\frac{dC_k}{dt} = -\\frac{FAT_k\\, NF(t)}{100}, \\qquad T_k \\leftarrow T_k\\,(1 + 0{,}379\\,(1 - C_k))',
    ],
    substituted: [
      `FAT_k = 0{,}0125\\cdot 180^{\\frac{\\ln(P_k/${texNum(s.poolMt.min, 3)})}{\\ln(${texNum(s.poolMt.max, 3)}/${texNum(s.poolMt.min, 3)})}}\\ \\%/\\text{s}`,
      ...(shift
        ? [`FAT_k = 0{,}0125\\cdot 180^{\\,f_k + ${texNum(shift, 3)}(1 - f_k)}, \\quad f_k = \\frac{\\ln(P_k/P_{\\min})}{\\ln(P_{\\max}/P_{\\min})}`]
        : []),
      ...perType(s, (t) => `P_k = ${texSpan(s.typeSpans[t].mt, 4)} \\;\\Rightarrow\\; FAT_k = ${texSpan(s.typeSpans[t].fatigue, 3)}\\ \\%/\\text{s}`),
      `t \\in [0,\\ ${texNum(s.stimulus.durationMs / 1000, 3)}]\\ \\text{s}, \\qquad NR < 0{,}25 \\iff T_k < ${texNum(s.rate.pauseTkMs, 2)}\\ \\text{ms}\\ \\text{(${pause})}`,
    ],
    notes: [
      L(
        'C_k = capacidade restante (multiplica o twitch). Intervalos com NR < 0,25 são pausas (sem fadiga). Sem recuperação.',
        'C_k = remaining capacity (multiplies the twitch). Intervals with NR < 0.25 are pauses (no fatigue). No recovery.',
      ),
      L(
        'P_min / P_max = MT mais fraco / mais forte do pool inteiro (0,103 / 0,491).',
        'P_min / P_max = weakest / strongest MT of the whole pool (0.103 / 0.491).',
      ),
      ...countsNote(s),
      ...(s.stimulus.train
        ? [L('Com trens intermitentes, os intervalos desligados não recuperam a capacidade.', 'With intermittent trains, the off intervals do not restore the capacity.')]
        : []),
    ],
  };
}

function forceLabel(id: string): string {
  switch (id) {
    case 'SCI_ATROPHY':
      return L('atrofia (Modlesky 2004)', 'atrophy (Modlesky 2004)');
    case 'PD_MOTOR_UNIT_LOSS':
      return L('perda de unidades motoras (Krenovsky 2020)', 'loss of motor units (Krenovsky 2020)');
    case 'PD_NEUROPATHY':
      return L('polineuropatia (Kwon 2024)', 'polyneuropathy (Kwon 2024)');
    default:
      return id;
  }
}

function stage8(s: ModelSnapshot): StageContent {
  const counts = s.units.counts;
  const type = L('tipo', 'type');
  if (s.variant === 'ORIGINAL') {
    const terms = counts
      ? MOTOR_UNIT_TYPES.map((t) => `\\frac{1}{${texNum(counts[t], 0)}}\\sum_{k=1}^{${texNum(counts[t], 0)}} f^{${t}}_k(t)`).join(' + ')
      : '\\text{—}';
    return {
      id: '8a',
      title: L('Força muscular', 'Muscle force'),
      source: 'domain/simulation.py',
      symbolic: [`F(t) = \\sum_{\\text{${type}}} \\operatorname{mean}_k f_k(t)`],
      substituted: [`F(t) = ${terms}`],
      notes: [L('Média por tipo, somada (Q7). Tipos com 0 unidades não contribuem.', 'Mean per type, summed (Q7). Types with 0 units do not contribute.')],
    };
  }
  const pool = s.pool;
  const w = s.weights;
  const substituted: string[] = [];
  const notes: string[] = [
    L(
      'Cada unidade simulada representa sua parcela do pool (sóleo 800/50/50 simulado como 106/7/7).',
      'Each simulated unit represents its share of the pool (soleus 800/50/50 simulated as 106/7/7).',
    ),
  ];
  if (counts && pool && w) {
    substituted.push(
      'F(t) = ' +
        MOTOR_UNIT_TYPES.map((t) => `\\frac{${pool[t]}}{${texNum(counts[t], 0)}}\\sum_{k=1}^{${texNum(counts[t], 0)}} f^{${t}}_k(t)`).join(' + '),
    );
    substituted.push(
      MOTOR_UNIT_TYPES.map((t) => `w_{${t}} = ${w[t] === null ? '\\text{—}' : texNum(w[t] as number, 3)}`).join(',\\quad '),
    );
    notes.push(
      s.units.source === 'started'
        ? L('N_sim informado pelo evento started da última simulação.', 'N_sim reported by the started event of the last simulation.')
        : L('N_sim definido manualmente.', 'N_sim set manually.'),
    );
  } else if (!pool) {
    substituted.push(
      `N_{\\text{pool}}\\ \\text{${L('desconhecido (lista de músculos indisponível)', 'unknown (muscle list unavailable)')}}`,
    );
  } else {
    substituted.push(
      `N_{\\text{pool}} = ${pool.S} / ${pool.FR} / ${pool.FF}, \\qquad N_{\\text{sim}} = \\text{${L('automático', 'automatic')}}`,
    );
    notes.push(
      L(
        'Automático: 120 unidades na proporção do músculo; os pesos aparecem após a primeira simulação.',
        'Automatic: 120 units in the proportion of the muscle; the weights appear after the first simulation.',
      ),
    );
  }
  const eff = s.condition.effects;
  if (eff.forceFactors.length) {
    substituted.push(
      `F(t) \\leftarrow s\\,F(t), \\qquad s = ${eff.forceFactors.map((f) => f.tex).join(' \\cdot ')} = ${texNum(eff.forceScale, 3)}`,
    );
  }
  return {
    ...(eff.forceFactors.length
      ? {
          condition: [
            L(
              `Força do músculo × ${txtNum(eff.forceScale, 3)}: ${eff.forceFactors.map((f) => `${forceLabel(f.id)} × ${txtNum(f.factor, 3)}`).join(', ')}.`,
              `Muscle force × ${txtNum(eff.forceScale, 3)}: ${eff.forceFactors.map((f) => `${forceLabel(f.id)} × ${txtNum(f.factor, 3)}`).join(', ')}.`,
            ),
          ],
        }
      : {}),
    id: '8b',
    title: L('Força muscular (ponderada pelo pool)', 'Muscle force (weighted by the pool)'),
    source: 'domain/simulation.py',
    symbolic: [`F(t) = \\sum_{\\text{${type}}} \\frac{N_{\\text{pool,${type}}}}{N_{\\text{sim,${type}}}} \\sum_k f_k(t)`],
    substituted,
    notes,
  };
}

const BUILDERS: Record<StageId, (s: ModelSnapshot) => StageContent> = {
  '1': stage1,
  '2a': stage2a,
  '2c': stage2c,
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

/** In English the decimal commas written in the TeX constants (`0{,}459`) become points. */
function localizeTex(lines: string[]): string[] {
  return getLocale() === 'en' ? lines.map((l) => l.replace(/\{,\}/g, '.')) : lines;
}

export function buildStageContents(s: ModelSnapshot): StageContent[] {
  return s.stages.map((id) => {
    const c = BUILDERS[id](s);
    return { ...c, symbolic: localizeTex(c.symbolic), substituted: localizeTex(c.substituted) };
  });
}
