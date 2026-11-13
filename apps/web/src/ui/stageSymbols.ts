/**
 * Glossary of the symbols of each stage of the equations view (stageTex.ts): what each one means, its unit and where
 * its value comes from. Shown in the right sidebar, so the equation card keeps its plain explanation and sources and
 * the sidebar explains the variables instead of repeating them.
 *
 * Meanings and units come from the engine (services/simulation-engine/src/eenm_engine/domain/*) and
 * docs/model-equations.md. Where the code gives a number without a unit or a physical meaning, the entry says so.
 * `forms` are the ways the symbol is written in the stage's TeX; stageSymbols.test.ts checks that every symbol of every rendered stage has
 * an entry and that every entry still appears somewhere.
 */
import type { ModelSnapshot } from '../application/modelView';
import type { StageId } from '../domain/modelEquations';
import type { Localized } from '../i18n/locale';
import { tr } from '../i18n/locale';

/** What changes which symbols a stage shows (the same choices stageTex.ts makes). */
export interface SymbolContext {
  /** Stage 1 in stimulator mode (pulse width in µs, envelope with ramps) instead of the FES.m duty cycle. */
  stimulator: boolean;
  original: boolean;
  /** FES.m amplitude modulation (A(t) and T are shown). */
  amplitudeModulation: boolean;
  triangle: boolean;
  train: boolean;
  drive: boolean;
  invasive: boolean;
  /** Cisi & Kohn 2008 threshold rule (V_th = I_rh·R_in) instead of Watanabe 2013's thresholds in mV. */
  rule2008: boolean;
  fastShift: boolean;
  forceFactors: boolean;
}

export function symbolContext(s: ModelSnapshot): SymbolContext {
  return {
    stimulator: s.stimulus.pulseWidthUs !== null,
    original: s.variant === 'ORIGINAL',
    amplitudeModulation: s.stimulus.modulationTarget === 'AMPLITUDE',
    triangle: s.stimulus.modulationShape === 'TRIANGLE',
    train: s.stimulus.train !== null,
    drive: s.drive !== null,
    invasive: s.drive?.invasive ?? false,
    rule2008: s.drive?.thresholdRule !== 'WATANABE_2013',
    fastShift: s.condition.effects.fastShift !== 0,
    forceFactors: s.condition.effects.forceFactors.length > 0,
  };
}

export interface GlossaryEntry {
  /** The symbol, rendered with KaTeX as in the equation. */
  tex: string;
  /** Every way the symbol is written in the stage's TeX. */
  forms: readonly string[];
  /** A bare letter that also has a function form elsewhere (A and A(t)): it never matches before a parenthesis. */
  bare?: boolean;
  meaning: Localized;
  unit: Localized;
  /** Where the value comes from: a form field, the muscle preset, a fit, the literature or the original model. */
  source: Localized;
  /** Shown only when the stage's TeX has the symbol for these settings. */
  when?: (c: SymbolContext) => boolean;
}

export interface StageSymbol {
  tex: string;
  meaning: string;
  unit: string;
  source: string;
}

const L = (pt: string, en: string): Localized => ({ 'pt-BR': pt, en });
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A matcher for one TeX form of a symbol: not preceded by a letter, a backslash or a subscript mark (so `t` does not
 * match inside `\text`, `dt` or `\alpha_t`) and not followed by a letter or a subscript (so `T` does not match `T_k`).
 * `bare` also refuses a following parenthesis, for a letter that has a separate function form (A and A(t)).
 */
export function symbolPattern(form: string, bare = false): RegExp {
  return new RegExp(`(?<![\\\\A-Za-z_])${escape(form)}(?![A-Za-z_${bare ? '(' : ''}])`, 'g');
}

const entry = (
  tex: string,
  forms: readonly string[],
  meaning: Localized,
  unit: Localized,
  source: Localized,
  when?: (c: SymbolContext) => boolean,
  bare = false,
): GlossaryEntry => ({ tex, forms, meaning, unit, source, ...(bare ? { bare } : {}), ...(when ? { when } : {}) });

// ---- shared texts ----
const DIMENSIONLESS = L('adimensional', 'dimensionless');
const MS = L('ms', 'ms');
const MV = L('mV', 'mV');
const MS_CM2 = L('mS/cm²', 'mS/cm²');
const UA_CM2 = L('µA/cm²', 'µA/cm²');
const AMPLITUDE_UNIT = L(
  'unidade de amplitude do modelo (u.m.; µA/cm² no modelo do soma, sem conversão verificada para mA)',
  'model amplitude unit (m.u.; µA/cm² in the soma model, with no verified conversion to mA)',
);
const FORCE_UNIT = L('unidade de força do modelo (relativa)', 'model force unit (relative)');
const COMPUTED = L('calculado pelo modelo', 'computed by the model');
const ORIGINAL_TABLE = L(
  'tabela por tipo do modelo original (createUMs.m), sem fonte publicada; vai linearmente da primeira à última unidade do tipo no pool do músculo',
  'per-type table of the original model (createUMs.m), with no published source; goes linearly from the first to the last unit of the type in the muscle pool',
);
const BOOTH = L(
  'constante do modelo original (createUMs.m; modelo de dois compartimentos de Booth et al. 1997)',
  'constant of the original model (createUMs.m; two-compartment model of Booth et al. 1997)',
);
const CK_TABLE = L(
  'geometria de Cisi & Kohn 2008 (Tabela 2), espalhada linearmente entre as unidades de cada tipo',
  'geometry of Cisi & Kohn 2008 (Table 2), spread linearly over the units of each type',
);
const DURATION_FIELD = L('campo “Duração” (grupo Simulação, etapa Simulação)', 'the “Duration” field (Simulation group, Simulation step)');
const NO_UNIT_IN_CODE = L('não definida no código', 'not defined in the code');

const stimulatorOnly = (c: SymbolContext) => c.stimulator;
const fesOnly = (c: SymbolContext) => !c.stimulator;

// ---- reused entries ----
const current = (stageText: Localized) =>
  entry(
    'I(t)',
    ['I(t)'],
    stageText,
    AMPLITUDE_UNIT,
    L('calculada a partir dos controles do Estimulador (etapa 1)', 'computed from the controls of the Stimulator (step 1)'),
  );

const amplitude = (meaning: Localized) =>
  entry('A', ['A'], meaning, AMPLITUDE_UNIT, L('controle “Amplitude” do Estimulador (etapa 1)', 'the “Amplitude” control of the Stimulator (step 1)'), undefined, true);

const pulseWidthStimulator = (meaning: Localized, when?: (c: SymbolContext) => boolean) =>
  entry(
    'PW',
    ['PW'],
    meaning,
    MS,
    L('controle “Largura de pulso” do Estimulador (etapa 1), em µs por fase (÷ 1000)', 'the “Pulse width” control of the Stimulator (step 1), in µs per phase (÷ 1000)'),
    when,
  );

const peakTwitch = entry(
  'P_k',
  ['P_k'],
  L(
    'Força de pico do abalo (twitch) da unidade k: a força máxima que um único disparo produz (MT no código original). As unidades FF são as mais fortes e as S as mais fracas: S 0,103–0,123, FR 0,123–0,294, FF 0,294–0,491.',
    'Peak force of the twitch of unit k: the largest force a single spike produces (MT in the original code). FF units are the strongest and S the weakest: S 0.103–0.123, FR 0.123–0.294, FF 0.294–0.491.',
  ),
  FORCE_UNIT,
  ORIGINAL_TABLE,
);

const unitForce = entry(
  'f_k(t)',
  ['f_k(t)', 'f^{S}_k(t)', 'f^{FR}_k(t)', 'f^{FF}_k(t)'],
  L(
    'Força da unidade k no instante t: a soma dos abalos de todos os seus disparos (etapa 5). Nas linhas com valores, o índice de cima diz o tipo (S, FR, FF).',
    'Force of unit k at time t: the sum of the twitches of all its spikes (stage 5). In the lines with values, the superscript gives the type (S, FR, FF).',
  ),
  FORCE_UNIT,
  COMPUTED,
);

const muscleForce = (meaning: Localized, source: Localized) => entry('F(t)', ['F(t)'], meaning, FORCE_UNIT, source);

const soma2a = entry(
  'V_s',
  ['V_s'],
  L(
    'Potencial de membrana do soma: a voltagem que o modelo integra no tempo. Um potencial de ação no soma é um disparo do motoneurônio.',
    'Membrane potential of the soma: the voltage the model integrates over time. An action potential in the soma is a spike of the motoneuron.',
  ),
  L('mV (repouso em −60 mV)', 'mV (rest at −60 mV)'),
  L('calculado pelo modelo, a partir do estado inicial do código original (setInit.m)', 'computed by the model, from the initial state of the original code (setInit.m)'),
);

const rateTime = (meaning: Localized) =>
  entry('T_k', ['T_k'], meaning, MS, L('etapa 5 (tempo de contração da unidade)', 'stage 5 (contraction time of the unit)'));

const SYMBOLS: Record<StageId, readonly GlossaryEntry[]> = {
  '1': [
    current(
      L(
        'Corrente que o estimulador aplica no instante t. É a entrada do resto do modelo: na pele ela excita os axônios motores (etapa 2b); no modo invasivo ela entra no motoneurônio (etapas 2a e 2c).',
        'Current the stimulator applies at time t. It is the input of the rest of the model: on the skin it excites the motor axons (stage 2b); in the invasive mode it enters the motoneuron (stages 2a and 2c).',
      ),
    ),
    amplitude(
      L(
        'Amplitude: a altura de cada pulso de corrente. Quanto maior, mais forte o estímulo e mais axônios (ou motoneurônios) passam do limiar.',
        'Amplitude: the height of each current pulse. The larger it is, the stronger the stimulus and the more axons (or motoneurons) cross the threshold.',
      ),
    ),
    entry(
      't',
      ['t'],
      L('Tempo desde o início da simulação.', 'Time since the start of the simulation.'),
      MS,
      L('relógio da simulação, de 0 até a “Duração” (etapa Simulação)', 'the simulation clock, from 0 to the “Duration” (Simulation step)'),
    ),
    // FES.m (duty cycle) mode
    entry(
      'f',
      ['f'],
      L(
        'Frequência dos pulsos: quantos pulsos por segundo. Aqui em kHz porque o tempo está em ms (f = frequência em Hz ÷ 1000).',
        'Pulse frequency: how many pulses per second. In kHz here because time is in ms (f = frequency in Hz ÷ 1000).',
      ),
      L('kHz', 'kHz'),
      L('controle “Frequência” do Estimulador (etapa 1), em Hz', 'the “Frequency” control of the Stimulator (step 1), in Hz'),
      fesOnly,
    ),
    entry(
      'D',
      ['D'],
      L(
        'Ciclo de trabalho: a porcentagem de cada período em que o pulso fica ligado. Junto com f, define a largura de pulso.',
        'Duty cycle: the percentage of each period during which the pulse is on. Together with f, it sets the pulse width.',
      ),
      L('%', '%'),
      L(
        'campo dutyCyclePercent do pedido, do modelo original (FES.m); o formulário não tem controle para ele: vale o padrão (20 %) ou o de uma simulação salva',
        'the dutyCyclePercent field of the request, from the original model (FES.m); the form has no control for it: the default (20 %) or that of a saved simulation applies',
      ),
      fesOnly,
    ),
    entry(
      '\\operatorname{sq}(x, D)',
      ['\\operatorname{sq}'],
      L(
        'Onda quadrada: vale +1 durante os primeiros D % de cada ciclo e −1 no resto. No pulso monofásico ela é levada para 1 e 0 ((sq + 1)/2).',
        'Square wave: +1 during the first D % of each cycle and −1 for the rest. In the monophasic pulse it is shifted to 1 and 0 ((sq + 1)/2).',
      ),
      DIMENSIONLESS,
      L('função do código original (FES.m)', 'function of the original code (FES.m)'),
      fesOnly,
    ),
    entry(
      'x',
      ['x'],
      L(
        'Argumento da onda quadrada: a fase do ciclo de pulsos (2πft); o pulso está ligado na fração D/100 inicial de cada volta de 2π.',
        'Argument of the square wave: the phase of the pulse cycle (2πft); the pulse is on during the first D/100 of each 2π turn.',
      ),
      L('radianos', 'radians'),
      COMPUTED,
      fesOnly,
    ),
    entry(
      'PW',
      ['PW'],
      L(
        'Largura de pulso: quanto tempo cada pulso fica ligado. Aqui ela não é escolhida: sai do ciclo de trabalho e da frequência.',
        'Pulse width: how long each pulse stays on. Here it is not chosen: it follows from the duty cycle and the frequency.',
      ),
      MS,
      L('calculada: PW = D/(100·f)', 'computed: PW = D/(100·f)'),
      fesOnly,
    ),
    entry(
      'A(t)',
      ['A(t)'],
      L(
        'Amplitude modulada: A multiplicada pela forma da modulação (degrau = 1, rampa = t/T, triângulo com pico em t_p, seno).',
        'Modulated amplitude: A multiplied by the shape of the modulation (step = 1, ramp = t/T, triangle peaking at t_p, sine).',
      ),
      AMPLITUDE_UNIT,
      L(
        'campo modulation do pedido (modelo original); o formulário não tem controle para ele',
        'the modulation field of the request (original model); the form has no control for it',
      ),
      (c) => !c.stimulator && c.amplitudeModulation,
    ),
    entry(
      'T',
      ['T'],
      L('Duração total da simulação; a modulação em rampa vai de 0 a T.', 'Total duration of the simulation; the ramp modulation goes from 0 to T.'),
      MS,
      DURATION_FIELD,
      (c) => !c.stimulator && c.amplitudeModulation,
    ),
    entry(
      't_p',
      ['t_p'],
      L(
        'Instante do pico da modulação triangular: a amplitude sobe até t_p e desce até o fim da simulação.',
        'Time of the peak of the triangular modulation: the amplitude rises until t_p and falls until the end of the simulation.',
      ),
      MS,
      L('campo modulation.peakTimeMs do pedido; sem controle no formulário', 'the modulation.peakTimeMs field of the request; no control in the form'),
      (c) => !c.stimulator && c.amplitudeModulation && c.triangle,
    ),
    entry(
      'T_{\\text{train}}',
      ['T_{\\text{trem}}', 'T_{\\text{train}}'],
      L(
        'Período do trem: um ciclo ligado + desligado; o padrão se repete a cada período. Sem trens não há período (u = t).',
        'Train period: one on + off cycle; the pattern repeats every period. Without trains there is no period (u = t).',
      ),
      MS,
      L(
        'controle “Período do trem” do Estimulador (etapa 1), com “Trens (ligado / desligado)” ativado',
        'the “Train period” control of the Stimulator (step 1), with “Trains (on / off)” switched on',
      ),
      (c) => c.stimulator || c.train,
    ),
    entry(
      'T_{\\text{on}}',
      ['T_{\\text{ligado}}', 'T_{\\text{on}}'],
      L(
        'Tempo ligado de cada trem, incluindo as rampas; depois dele a corrente é zero até o próximo trem. Sem trens, é a duração inteira da simulação.',
        'On time of each train, ramps included; after it the current is zero until the next train. Without trains, it is the whole duration of the simulation.',
      ),
      MS,
      L(
        'controle “Tempo ligado” do Estimulador (etapa 1), em % do período do trem; sem trens, o campo “Duração” (etapa Simulação)',
        'the “On time” control of the Stimulator (step 1), in % of the train period; without trains, the “Duration” field (Simulation step)',
      ),
      (c) => c.stimulator || c.train,
    ),
    // stimulator mode
    entry(
      'E(t)',
      ['E(t)', 'E'],
      L(
        'Envelope: fator entre 0 e 1 que multiplica a amplitude. Sobe de 0 a 1 na rampa de subida, fica em 1, desce a 0 na rampa de descida no fim do tempo ligado, e é 0 fora dele.',
        'Envelope: a factor between 0 and 1 that multiplies the amplitude. It rises from 0 to 1 during the ramp-up, stays at 1, falls to 0 during the ramp-down at the end of the on time, and is 0 outside it.',
      ),
      DIMENSIONLESS,
      L('calculado a partir das rampas e dos trens', 'computed from the ramps and the trains'),
      stimulatorOnly,
    ),
    entry(
      'p(t)',
      ['p(t)'],
      L(
        'Forma de um pulso: 1 durante a largura de pulso; no bifásico simétrico, −1 durante uma segunda fase igual (carga balanceada); 0 no resto do período.',
        'Shape of one pulse: 1 during the pulse width; in the symmetric biphasic waveform, −1 during an equal second phase (charge-balanced); 0 for the rest of the period.',
      ),
      DIMENSIONLESS,
      L('controle “Forma de onda” do Estimulador (etapa 1)', 'the “Waveform” control of the Stimulator (step 1)'),
      stimulatorOnly,
    ),
    pulseWidthStimulator(
      L(
        'Largura de pulso: quanto tempo cada fase do pulso dura. Independe da frequência, como num estimulador clínico.',
        'Pulse width: how long each phase of the pulse lasts. It does not depend on the frequency, as in a clinical stimulator.',
      ),
      stimulatorOnly,
    ),
    entry(
      '\\tau',
      ['\\tau'],
      L('Tempo desde o início do período de pulso atual (t módulo T_p).', 'Time since the start of the current pulse period (t modulo T_p).'),
      MS,
      COMPUTED,
      stimulatorOnly,
    ),
    entry(
      'T_p',
      ['T_p'],
      L('Período entre o início de dois pulsos seguidos: 1000/f, o inverso da frequência.', 'Period between the onsets of two consecutive pulses: 1000/f, the inverse of the frequency.'),
      MS,
      L('calculado do controle “Frequência” do Estimulador (etapa 1)', 'computed from the “Frequency” control of the Stimulator (step 1)'),
      stimulatorOnly,
    ),
    entry(
      't_{\\uparrow}',
      ['t_{\\uparrow}'],
      L(
        'Duração da rampa de subida: tempo para a amplitude ir de 0 ao valor cheio no começo de cada trem (ou da simulação, sem trens); 0 = início abrupto.',
        'Duration of the ramp-up: time for the amplitude to go from 0 to full at the start of each train (or of the simulation, without trains); 0 = abrupt start.',
      ),
      MS,
      L('controle “Rampa de subida” do Estimulador (etapa 1)', 'the “Ramp up” control of the Stimulator (step 1)'),
      stimulatorOnly,
    ),
    entry(
      't_{\\downarrow}',
      ['t_{\\downarrow}'],
      L(
        'Duração da rampa de descida: tempo para a amplitude ir do valor cheio a 0 no fim do tempo ligado; 0 = fim abrupto.',
        'Duration of the ramp-down: time for the amplitude to go from full to 0 at the end of the on time; 0 = abrupt end.',
      ),
      MS,
      L('controle “Rampa de descida” do Estimulador (etapa 1)', 'the “Ramp down” control of the Stimulator (step 1)'),
      stimulatorOnly,
    ),
    entry(
      'u',
      ['u'],
      L('Tempo desde o início do trem atual (t módulo T_trem); sem trens, u = t.', 'Time since the start of the current train (t modulo T_train); without trains, u = t.'),
      MS,
      COMPUTED,
      stimulatorOnly,
    ),
  ],

  '2a': [
    entry(
      'C_s,\\ C_d,\\ C',
      ['C_s', 'C_d', 'C'],
      L(
        'Capacitância da membrana do soma (C_s) e do dendrito (C_d), por área: quanta carga a membrana guarda por mV. Quanto maior, mais devagar a voltagem muda. Os dois valem C.',
        'Membrane capacitance of the soma (C_s) and of the dendrite (C_d), per area: how much charge the membrane holds per mV. The larger it is, the slower the voltage changes. Both equal C.',
      ),
      L('µF/cm²', 'µF/cm²'),
      BOOTH,
    ),
    soma2a,
    entry(
      'V_d',
      ['V_d'],
      L(
        'Potencial de membrana do dendrito. Ele se comunica com o soma pela condutância de acoplamento g_c.',
        'Membrane potential of the dendrite. It talks to the soma through the coupling conductance g_c.',
      ),
      L('mV (repouso em −60 mV)', 'mV (rest at −60 mV)'),
      L('calculado pelo modelo, a partir do estado inicial do código original (setInit.m)', 'computed by the model, from the initial state of the original code (setInit.m)'),
    ),
    entry(
      'I_s,\\ I_d',
      ['I_{s}', 'I_s', 'I_{d}', 'I_d'],
      L(
        'Corrente injetada no soma (I_s) e no dendrito (I_d): o compartimento escolhido recebe o estímulo I(t) da etapa 1 e o outro recebe zero.',
        'Current injected into the soma (I_s) and into the dendrite (I_d): the chosen compartment receives the stimulus I(t) of stage 1 and the other receives zero.',
      ),
      UA_CM2,
      L('campo “Local de injeção” (grupo Motoneurônio, etapa Fisiologia)', 'the “Injection site” field (Motoneuron group, Physiology step)'),
    ),
    current(L('Corrente do estímulo, da etapa 1.', 'Stimulus current, from stage 1.')),
    entry(
      'g_{Na}',
      ['g_{Na}'],
      L(
        'Condutância máxima dos canais de sódio rápidos do soma: a corrente de entrada que gera a subida do potencial de ação.',
        'Maximal conductance of the fast sodium channels of the soma: the inward current that makes the action potential rise.',
      ),
      MS_CM2,
      BOOTH,
    ),
    entry(
      'm_\\infty(V_s)',
      ['m_\\infty'],
      L(
        'Ativação do sódio em equilíbrio: a fração dos portões de ativação abertos na voltagem V_s, tratada como instantânea (metade aberta em −35 mV).',
        'Steady-state sodium activation: the fraction of activation gates open at the voltage V_s, treated as instantaneous (half open at −35 mV).',
      ),
      L('adimensional (0 a 1)', 'dimensionless (0 to 1)'),
      L('função do código original (snaminf.m)', 'function of the original code (snaminf.m)'),
    ),
    entry(
      'h',
      ['h'],
      L(
        'Inativação do sódio do soma: 1 = canais disponíveis, 0 = inativados. Fecha com a despolarização e se recupera com uma constante de tempo que depende da voltagem.',
        'Inactivation of the soma sodium: 1 = channels available, 0 = inactivated. It closes with depolarization and recovers with a voltage-dependent time constant.',
      ),
      L('adimensional (0 a 1)', 'dimensionless (0 to 1)'),
      COMPUTED,
    ),
    entry(
      'E_{Na},\\ E_K,\\ E_L,\\ E_{Ca}',
      ['E_{Na}', 'E_K', 'E_L', 'E_{Ca}'],
      L(
        'Potenciais de reversão do sódio, do potássio, do vazamento e do cálcio: a voltagem em que a corrente de cada canal se anula. Cada corrente puxa a voltagem em direção ao seu E.',
        'Reversal potentials of sodium, potassium, leak and calcium: the voltage at which the current of each channel is zero. Each current pulls the voltage towards its E.',
      ),
      MV,
      L(
        'constantes do modelo original, escritas como v + v_rest com repouso em −60 mV: 115, −20, 0 e 140 mV acima do repouso',
        'constants of the original model, written as v + v_rest with rest at −60 mV: 115, −20, 0 and 140 mV above rest',
      ),
    ),
    entry(
      'g_{Ca},\\ m_{Ca},\\ h_{Ca}',
      ['g_{Ca}', 'm_{Ca}', 'h_{Ca}'],
      L(
        'Canal de cálcio do soma: condutância máxima g_Ca, ativação m_Ca (ao quadrado, constante de tempo de 4 ms) e inativação h_Ca (40 ms). A corrente de cálcio também enche o cálcio interno [Ca]_s.',
        'Calcium channel of the soma: maximal conductance g_Ca, activation m_Ca (squared, 4 ms time constant) and inactivation h_Ca (40 ms). The calcium current also fills the internal calcium [Ca]_s.',
      ),
      L('g_Ca em mS/cm²; m_Ca e h_Ca adimensionais', 'g_Ca in mS/cm²; m_Ca and h_Ca dimensionless'),
      BOOTH,
    ),
    entry(
      'g_K,\\ n',
      ['g_K', 'n'],
      L(
        'Canal de potássio do soma (do tipo Hodgkin–Huxley): condutância máxima g_K e ativação n, elevada à 4ª potência. Repolariza a membrana depois do pico do potencial de ação.',
        'Potassium channel of the soma (Hodgkin–Huxley type): maximal conductance g_K and activation n, raised to the 4th power. It repolarizes the membrane after the peak of the action potential.',
      ),
      L('g_K em mS/cm²; n adimensional', 'g_K in mS/cm²; n dimensionless'),
      BOOTH,
    ),
    entry(
      'g_{KCa}',
      ['g_{KCa}'],
      L(
        'Condutância máxima do potássio ativado por cálcio do soma: abre quando o cálcio interno sobe e puxa a voltagem para E_K, freando novos disparos.',
        'Maximal conductance of the calcium-activated potassium of the soma: it opens when the internal calcium rises and pulls the voltage towards E_K, slowing further spikes.',
      ),
      MS_CM2,
      BOOTH,
    ),
    entry(
      '[Ca]_s,\\ [Ca]_d,\\ [Ca]',
      ['[Ca]_s', '[Ca]_d', '[Ca]'],
      L(
        'Concentração de cálcio dentro do soma ([Ca]_s) e do dendrito ([Ca]_d); [Ca] é qualquer uma das duas. Ativa o potássio dependente de cálcio.',
        'Calcium concentration inside the soma ([Ca]_s) and the dendrite ([Ca]_d); [Ca] is either of them. It activates the calcium-dependent potassium.',
      ),
      NO_UNIT_IN_CODE,
      COMPUTED,
    ),
    entry(
      'K_d',
      ['K_d'],
      L(
        'Concentração de cálcio em que o potássio dependente de cálcio fica meio ativado.',
        'Calcium concentration at which the calcium-dependent potassium is half activated.',
      ),
      L('a mesma de [Ca] (não definida no código)', 'the same as [Ca] (not defined in the code)'),
      L('constante do modelo original (kd = 0,2)', 'constant of the original model (kd = 0.2)'),
    ),
    entry(
      'g_L',
      ['g_L'],
      L(
        'Condutância de vazamento: canais sempre abertos que puxam a voltagem de volta ao repouso. A mesma no soma e no dendrito.',
        'Leak conductance: always-open channels that pull the voltage back to rest. The same in the soma and in the dendrite.',
      ),
      MS_CM2,
      BOOTH,
    ),
    entry(
      'g_c',
      ['g_c'],
      L(
        'Condutância de acoplamento entre soma e dendrito: quanto de corrente passa de um compartimento para o outro.',
        'Coupling conductance between soma and dendrite: how much current flows from one compartment to the other.',
      ),
      MS_CM2,
      BOOTH,
    ),
    entry(
      'p',
      ['p'],
      L(
        'Fração da área da membrana que é do soma, p = A_s/(A_s + A_d). Divide a corrente de acoplamento entre os dois compartimentos.',
        'Fraction of the membrane area that belongs to the soma, p = A_s/(A_s + A_d). It splits the coupling current between the two compartments.',
      ),
      DIMENSIONLESS,
      L(
        'calculada para cada unidade a partir dos campos “Geometria do soma” e “Geometria do dendrito” (grupo Motoneurônio, etapa Fisiologia) e das dimensões do tipo de unidade',
        'computed for each unit from the “Soma geometry” and “Dendrite geometry” fields (Motoneuron group, Physiology step) and the dimensions of the unit type',
      ),
    ),
    entry(
      'g_{Ca,d},\\ m_{Ca,d}',
      ['g_{Ca,d}', 'm_{Ca,d}'],
      L(
        'Canal de cálcio do dendrito: condutância máxima g_Ca,d e ativação m_Ca,d (constante de tempo de 40 ms). Sem inativação nesta equação, essa corrente pode se manter e sustentar platôs.',
        'Calcium channel of the dendrite: maximal conductance g_Ca,d and activation m_Ca,d (40 ms time constant). With no inactivation in this equation, the current can last and sustain plateaus.',
      ),
      L('g_Ca,d em mS/cm²; m_Ca,d adimensional', 'g_Ca,d in mS/cm²; m_Ca,d dimensionless'),
      BOOTH,
    ),
    entry(
      'g_{NaP},\\ m_{NaP},\\ h_{NaP}',
      ['g_{NaP}', 'm_{NaP}', 'h_{NaP}'],
      L(
        'Sódio persistente do dendrito: condutância máxima g_NaP, ativação m_NaP (constante de tempo de 40 ms) e inativação lenta h_NaP (1000 ms).',
        'Persistent sodium of the dendrite: maximal conductance g_NaP, activation m_NaP (40 ms time constant) and slow inactivation h_NaP (1000 ms).',
      ),
      L('g_NaP em mS/cm²; m_NaP e h_NaP adimensionais', 'g_NaP in mS/cm²; m_NaP and h_NaP dimensionless'),
      BOOTH,
    ),
    entry(
      'g_{KCa,d}',
      ['g_{KCa,d}'],
      L(
        'Condutância máxima do potássio ativado por cálcio do dendrito, controlada por [Ca]_d.',
        'Maximal conductance of the calcium-activated potassium of the dendrite, controlled by [Ca]_d.',
      ),
      MS_CM2,
      L(
        'constante do modelo original: 1 (não aparece na linha com os valores)',
        'constant of the original model: 1 (not shown in the line with the values)',
      ),
    ),
    entry(
      'x,\\ x_\\infty(V),\\ \\tau_x(V)',
      ['x', 'x_\\infty(V)', '\\tau_x(V)'],
      L(
        'Regra comum a todos os portões: cada portão x (h, n, m_Ca, h_Ca…) caminha para o seu valor de equilíbrio x_∞ na voltagem V do seu compartimento, com a constante de tempo τ_x.',
        'Rule shared by every gate: each gate x (h, n, m_Ca, h_Ca…) moves towards its steady-state value x_∞ at the voltage V of its compartment, with the time constant τ_x.',
      ),
      L('x e x_∞ adimensionais; τ_x em ms', 'x and x_∞ dimensionless; τ_x in ms'),
      L('funções e constantes do código original (rates.m e um arquivo .m por portão)', 'functions and constants of the original code (rates.m and one .m file per gate)'),
    ),
    entry(
      '\\varphi',
      ['\\varphi'],
      L(
        'Fator de temperatura (Q10 = 3): acelera todos os portões e o cálcio quando a temperatura sobe acima de 6,3 °C, e os freia abaixo dela.',
        'Temperature factor (Q10 = 3): it speeds up every gate and the calcium when the temperature rises above 6.3 °C, and slows them below it.',
      ),
      DIMENSIONLESS,
      L('calculado do campo “Temperatura” (grupo Motoneurônio, etapa Fisiologia)', 'computed from the “Temperature” field (Motoneuron group, Physiology step)'),
    ),
    entry(
      'T_{^\\circ C}',
      ['T_{^\\circ C}'],
      L(
        'Temperatura usada nas cinéticas dos canais; as constantes do modelo foram definidas a 6,3 °C.',
        'Temperature used in the channel kinetics; the model constants were defined at 6.3 °C.',
      ),
      L('°C', '°C'),
      L('campo “Temperatura” (grupo Motoneurônio, etapa Fisiologia)', 'the “Temperature” field (Motoneuron group, Physiology step)'),
    ),
    entry(
      'f',
      ['f'],
      L(
        'Fator que multiplica tanto a entrada quanto a remoção de cálcio. O código traz só o número; não diz o significado físico.',
        'Factor that multiplies both the entry and the removal of calcium. The code gives only the number; it does not state the physical meaning.',
      ),
      NO_UNIT_IN_CODE,
      L('constante do modelo original (f = 0,01)', 'constant of the original model (f = 0.01)'),
    ),
    entry(
      '\\alpha',
      ['\\alpha'],
      L(
        'Converte a corrente de cálcio em aumento da concentração de cálcio interno.',
        'Converts the calcium current into a rise of the internal calcium concentration.',
      ),
      NO_UNIT_IN_CODE,
      L('constante do modelo original (α = 0,009 no soma e no dendrito)', 'constant of the original model (α = 0.009 in the soma and in the dendrite)'),
    ),
    entry(
      'I_{Ca}',
      ['I_{Ca}'],
      L(
        'Corrente de cálcio do compartimento: no soma, g_Ca m_Ca² h_Ca (V_s − E_Ca); no dendrito, g_Ca,d m_Ca,d (V_d − E_Ca).',
        'Calcium current of the compartment: in the soma, g_Ca m_Ca² h_Ca (V_s − E_Ca); in the dendrite, g_Ca,d m_Ca,d (V_d − E_Ca).',
      ),
      UA_CM2,
      COMPUTED,
    ),
    entry(
      'k_{Ca}',
      ['k_{Ca}'],
      L(
        'Taxa de remoção do cálcio interno: quanto maior, mais depressa o cálcio volta a zero depois dos disparos.',
        'Removal rate of the internal calcium: the larger it is, the faster the calcium returns to zero after the spikes.',
      ),
      NO_UNIT_IN_CODE,
      L('constante do modelo original (kca = 2)', 'constant of the original model (kca = 2)'),
    ),
  ],

  '2c': [
    entry(
      'C_s,\\ C_d',
      ['C_s', 'C_d'],
      L(
        'Capacitância do soma e do dendrito: C_m vezes a área de cada compartimento. Unidades maiores têm mais área, mais capacitância e precisam de mais corrente para disparar.',
        'Capacitance of the soma and of the dendrite: C_m times the area of each compartment. Larger units have more area, more capacitance and need more current to fire.',
      ),
      L('nF no motor (C_m × área)', 'nF in the engine (C_m × area)'),
      CK_TABLE,
    ),
    entry(
      'V_s,\\ V_d',
      ['V_s', 'V_d'],
      L(
        'Potencial de membrana do soma (ativo) e do dendrito (passivo), medidos a partir do repouso (repouso = 0 mV).',
        'Membrane potential of the soma (active) and of the dendrite (passive), measured from rest (rest = 0 mV).',
      ),
      L('mV em relação ao repouso', 'mV relative to rest'),
      COMPUTED,
    ),
    entry(
      'g_{L,s},\\ g_{L,d}',
      ['g_{L,s}', 'g_{L,d}'],
      L(
        'Condutância de vazamento do soma e do dendrito: área do compartimento dividida pela resistência específica da sua membrana.',
        'Leak conductance of the soma and of the dendrite: area of the compartment divided by the specific resistance of its membrane.',
      ),
      L('µS no motor', 'µS in the engine'),
      L(
        'resistências específicas de Cisi & Kohn 2008 (Tabela 2), espalhadas linearmente entre as unidades de cada tipo',
        'specific resistances of Cisi & Kohn 2008 (Table 2), spread linearly over the units of each type',
      ),
    ),
    entry(
      'g_c',
      ['g_c'],
      L(
        'Condutância de acoplamento entre soma e dendrito: o inverso da resistência do citoplasma ao longo dos dois compartimentos (a fórmula ao lado).',
        'Coupling conductance between soma and dendrite: the inverse of the cytoplasm resistance along the two compartments (the formula next to it).',
      ),
      L('µS no motor', 'µS in the engine'),
      L('calculada da geometria (Cisi & Kohn 2008, Eq 4)', 'computed from the geometry (Cisi & Kohn 2008, Eq 4)'),
    ),
    entry(
      '\\bar g_{Na},\\ \\bar g_{Kf},\\ \\bar g_{Ks}',
      ['\\bar g_{Na}', '\\bar g_{Kf}', '\\bar g_{Ks}'],
      L(
        'Condutâncias máximas do soma: sódio (gera o potencial de ação), potássio rápido (repolariza) e potássio lento (produz a pós-hiperpolarização, que espaça os disparos). Valores por tipo S / FR / FF.',
        'Maximal conductances of the soma: sodium (makes the action potential), fast potassium (repolarizes) and slow potassium (makes the afterhyperpolarization, which spaces the spikes). Values per type S / FR / FF.',
      ),
      MS_CM2,
      L(
        'código aberto do grupo de Kohn (projectPR): o sódio confere com Watanabe et al. 2013 (Tabela 1); os dois potássios diferem um pouco do publicado e o código é o usado',
        'open code of Kohn’s group (projectPR): the sodium agrees with Watanabe et al. 2013 (Table 1); both potassiums differ a little from the published values and the code is the one used',
      ),
    ),
    entry(
      'm,\\ h,\\ n,\\ q',
      ['m', 'h', 'n', 'q'],
      L(
        'Portões do soma: m ativa o sódio (ao cubo) e h o inativa; n ativa o potássio rápido (4ª potência); q ativa o potássio lento (ao quadrado). 0 = fechado, 1 = aberto.',
        'Gates of the soma: m activates sodium (cubed) and h inactivates it; n activates the fast potassium (4th power); q activates the slow potassium (squared). 0 = closed, 1 = open.',
      ),
      L('adimensional (0 a 1)', 'dimensionless (0 to 1)'),
      COMPUTED,
    ),
    entry(
      'E_{Na},\\ E_K,\\ E_L',
      ['E_{Na}', 'E_K', 'E_L'],
      L(
        'Potenciais de reversão do sódio, do potássio e do vazamento, medidos a partir do repouso: cada corrente puxa a voltagem em direção ao seu E.',
        'Reversal potentials of sodium, potassium and leak, measured from rest: each current pulls the voltage towards its E.',
      ),
      L('mV em relação ao repouso', 'mV relative to rest'),
      L('Cisi & Kohn 2008: 120, −10 e 0 mV', 'Cisi & Kohn 2008: 120, −10 and 0 mV'),
    ),
    current(
      L(
        'Corrente total que entra no soma: o drive central e, no modo invasivo, também o estímulo.',
        'Total current entering the soma: the central drive and, in the invasive mode, the stimulus too.',
      ),
    ),
    entry(
      'R_i',
      ['R_i'],
      L('Resistividade do citoplasma, usada para calcular g_c.', 'Resistivity of the cytoplasm, used to compute g_c.'),
      L('Ω·cm', 'Ω·cm'),
      L('Cisi & Kohn 2008: 70 Ω·cm', 'Cisi & Kohn 2008: 70 Ω·cm'),
    ),
    entry(
      'l_s,\\ r_s,\\ l_d,\\ r_d',
      ['l_s', 'r_s', 'l_d', 'r_d'],
      L(
        'Comprimento e raio do soma (comprimento = diâmetro) e do dendrito. Crescem das unidades S às FF.',
        'Length and radius of the soma (length = diameter) and of the dendrite. They grow from S to FF units.',
      ),
      L('µm no motor', 'µm in the engine'),
      CK_TABLE,
    ),
    entry(
      'V_{th}',
      ['V_{th}'],
      L(
        'Limiar de disparo: quando V_s passa dele (e já se passaram 5 ms do último disparo), os canais abrem por 0,6 ms e a unidade dispara.',
        'Firing threshold: when V_s crosses it (and 5 ms have passed since the last spike), the channels open for 0.6 ms and the unit fires.',
      ),
      L('mV em relação ao repouso', 'mV relative to rest'),
      L(
        'campo “Limiar do motoneurônio” (grupo Drive central, etapa Fisiologia): I_rh·R_in (Cisi & Kohn 2008) ou o valor em mV de Watanabe et al. 2013',
        'the “Motoneuron threshold” field (Central drive group, Physiology step): I_rh·R_in (Cisi & Kohn 2008) or the value in mV of Watanabe et al. 2013',
      ),
    ),
    entry(
      'x,\\ x_0',
      ['x', 'x_0'],
      L(
        'x é qualquer portão de ativação (m, n ou q); x_0 é o seu valor quando o pulso começa ou termina. No pulso de 0,6 ms as ativações sobem para 1; fora dele decaem para 0.',
        'x is any activation gate (m, n or q); x_0 is its value when the pulse starts or ends. During the 0.6 ms pulse the activations rise towards 1; outside it they decay towards 0.',
      ),
      DIMENSIONLESS,
      COMPUTED,
    ),
    entry(
      'h_0',
      ['h_0'],
      L(
        'Valor da inativação do sódio quando o pulso começa ou termina: no pulso h cai para 0; fora dele, volta para 1.',
        'Value of the sodium inactivation when the pulse starts or ends: during the pulse h falls towards 0; outside it, it returns to 1.',
      ),
      DIMENSIONLESS,
      COMPUTED,
    ),
    entry(
      '\\alpha_x,\\ \\beta_x,\\ \\alpha_h,\\ \\beta_h',
      ['\\alpha_x', '\\beta_x', '\\alpha_h', '\\beta_h'],
      L(
        'Constantes de taxa dos portões: α é a velocidade com que um portão sobe para 1, β a velocidade com que cai para 0. O β de q, o mais lento, define a duração da pós-hiperpolarização.',
        'Rate constants of the gates: α is how fast a gate rises towards 1, β how fast it falls towards 0. The β of q, the slowest, sets the duration of the afterhyperpolarization.',
      ),
      L('1/ms', '1/ms'),
      L(
        'Watanabe et al. 2013 (Tabela 1), pelo código aberto do grupo de Kohn (projectPR); o β de q das unidades FR e FF segue o código',
        'Watanabe et al. 2013 (Table 1), through the open code of Kohn’s group (projectPR); the β of q of FR and FF units follows the code',
      ),
    ),
    entry(
      't',
      ['t'],
      L(
        'Tempo. No pulso, contado desde o início (ou o fim) do pulso, em ms; no seno do tremor, em segundos (a frequência está em Hz).',
        'Time. In the pulse, counted from the start (or the end) of the pulse, in ms; in the tremor sine, in seconds (the frequency is in Hz).',
      ),
      L('ms (pulso) ou s (tremor)', 'ms (pulse) or s (tremor)'),
      COMPUTED,
    ),
    entry(
      'C_m',
      ['C_m'],
      L('Capacitância específica da membrana: capacitância por área.', 'Specific membrane capacitance: capacitance per area.'),
      L('µF/cm²', 'µF/cm²'),
      L('Cisi & Kohn 2008: 1 µF/cm²', 'Cisi & Kohn 2008: 1 µF/cm²'),
    ),
    entry(
      'I_{rh}',
      ['I_{rh}'],
      L(
        'Reobase: a menor corrente constante que faz a unidade disparar. Unidades S têm reobase baixa (são recrutadas primeiro pelo drive), FF alta.',
        'Rheobase: the smallest steady current that makes the unit fire. S units have a low rheobase (the drive recruits them first), FF a high one.',
      ),
      L('nA', 'nA'),
      L('Cisi & Kohn 2008 (Tabela 2), espalhada linearmente entre as unidades de cada tipo', 'Cisi & Kohn 2008 (Table 2), spread linearly over the units of each type'),
      (c) => c.rule2008,
    ),
    entry(
      'R_{in}',
      ['R_{in}'],
      L(
        'Resistência de entrada do soma com a célula em repouso (soma e dendrito passivos): quanto a voltagem sobe por nA injetado.',
        'Input resistance of the soma with the cell at rest (passive soma and dendrite): how much the voltage rises per nA injected.',
      ),
      L('MΩ', 'MΩ'),
      L('calculada de g_L,s, g_L,d e g_c', 'computed from g_L,s, g_L,d and g_c'),
      (c) => c.rule2008,
    ),
    entry(
      'I_{drive}(t)',
      ['I_{drive}(t)', 'I_{drive}'],
      L(
        'Drive central: a corrente que desce do cérebro e da medula até cada motoneurônio. Soma do fundo, do comando voluntário, do tremor (quando ligado) e do ruído; com a escala “pela reobase”, tudo multiplicado pela razão entre a menor reobase e os 4 nA de Gallego.',
        'Central drive: the current that comes down from the brain and the spinal cord to each motoneuron. Sum of the background, the voluntary command, the tremor (when on) and the noise; with the “by rheobase” scale, all multiplied by the ratio of the smallest rheobase to Gallego’s 4 nA.',
      ),
      L('nA', 'nA'),
      L(
        'campos “Corrente de fundo”, “Comando voluntário”, “Amplitude do tremor”, “Frequência do tremor” e “Escala das correntes” (grupo Drive central, etapa Fisiologia); valores de Gallego et al. 2015',
        'the “Background current”, “Voluntary command”, “Tremor amplitude”, “Tremor frequency” and “Current scale” fields (Central drive group, Physiology step); values of Gallego et al. 2015',
      ),
    ),
    entry(
      '\\eta_k(t)',
      ['\\eta_k(t)', '\\eta_k'],
      L(
        'Ruído próprio de cada unidade k: ruído branco filtrado abaixo de 100 Hz, independente entre unidades. Faz as unidades dispararem de forma irregular, como na vida real.',
        'Own noise of each unit k: white noise filtered below 100 Hz, independent between units. It makes the units fire irregularly, as in real life.',
      ),
      L('nA', 'nA'),
      L('sorteado a partir do campo “Semente” (etapa Simulação)', 'drawn from the “Seed” field (Simulation step)'),
    ),
    entry(
      '\\sigma',
      ['\\sigma'],
      L(
        'Desvio padrão do ruído: uma fração (o “Ruído”) da corrente média, fundo + voluntário.',
        'Standard deviation of the noise: a fraction (the “Noise”) of the mean current, background + voluntary.',
      ),
      L('nA', 'nA'),
      L('campo “Ruído (DP / média)” (grupo Drive central, etapa Fisiologia)', 'the “Noise (SD / mean)” field (Central drive group, Physiology step)'),
    ),
    entry(
      'I_{FES}(t)',
      ['I_{FES}(t)'],
      L(
        'Corrente do estimulador (etapa 1), somada ao drive no modo invasivo. Multiplicá-la por C_s (em nF, numericamente a área do soma × 1000 com C_m = 1 µF/cm²) converte µA/cm² em nA.',
        'Stimulator current (stage 1), added to the drive in the invasive mode. Multiplying it by C_s (in nF, numerically the soma area × 1000 with C_m = 1 µF/cm²) turns µA/cm² into nA.',
      ),
      UA_CM2,
      L('controles do Estimulador (etapa 1)', 'controls of the Stimulator (step 1)'),
      (c) => c.invasive,
    ),
  ],

  '2b': [
    amplitude(
      L(
        'Amplitude do pulso. O axônio k dispara quando A é maior ou igual ao seu limiar, I_rh,k (1 + τ_SD/PW).',
        'Pulse amplitude. Axon k fires when A is greater than or equal to its threshold, I_rh,k (1 + τ_SD/PW).',
      ),
    ),
    entry(
      'I_{rh,k}',
      ['I_{rh,k}'],
      L(
        'Reobase do axônio k: a menor corrente que o excita com um pulso muito longo. Cada axônio tem a sua, sorteada sem relação com o tipo (S, FR, FF): na FES de superfície o recrutamento não segue o tamanho da unidade.',
        'Rheobase of axon k: the smallest current that excites it with a very long pulse. Each axon has its own, drawn with no relation to the type (S, FR, FF): in surface FES, recruitment does not follow unit size.',
      ),
      AMPLITUDE_UNIT,
      L(
        'espalhada linearmente entre I_rh,min e R·I_rh,min, em ordem definida pelo campo “Semente” (grupo Simulação, etapa Simulação); recrutamento não seletivo de Gregory & Bickel 2005',
        'spread linearly between I_rh,min and R·I_rh,min, in an order set by the “Seed” field (Simulation group, Simulation step); non-selective recruitment of Gregory & Bickel 2005',
      ),
    ),
    entry(
      '\\tau_{SD}',
      ['\\tau_{SD}'],
      L(
        'Constante de tempo intensidade–duração (próxima da cronaxia): a largura de pulso em que o limiar é o dobro da reobase. Quanto maior, mais o limiar sobe com pulsos curtos.',
        'Strength–duration time constant (close to the chronaxie): the pulse width at which the threshold is twice the rheobase. The larger it is, the more the threshold rises with short pulses.',
      ),
      MS,
      L(
        'Mogyoros et al. 1996 (nervo humano): 0,459 ms; com o ajuste de cronaxia da lesão medular (grupo Condição), 0,13 ms (Lin 2007)',
        'Mogyoros et al. 1996 (human nerve): 0.459 ms; with the chronaxie adjustment of spinal cord injury (Condition group), 0.13 ms (Lin 2007)',
      ),
    ),
    pulseWidthStimulator(
      L(
        'Largura de pulso. Pulsos curtos exigem mais corrente: o fator (1 + τ_SD/PW) cresce quando PW diminui.',
        'Pulse width. Short pulses need more current: the factor (1 + τ_SD/PW) grows as PW shrinks.',
      ),
    ),
    entry(
      'I_{rh,\\min}',
      ['I_{rh,\\min}'],
      L(
        'Menor reobase do pool de axônios: escolhida para que, com pulso de 0,3 ms, a primeira unidade seja recrutada com amplitude 56,9.',
        'Lowest rheobase of the axon pool: chosen so that, with a 0.3 ms pulse, the first unit is recruited at amplitude 56.9.',
      ),
      AMPLITUDE_UNIT,
      L('reproduz o modelo original (sem medida publicada)', 'reproduces the original model (no published measurement)'),
    ),
    entry(
      'R',
      ['R'],
      L(
        'Razão entre a maior e a menor reobase (102,1/56,9 ≈ 1,79): com pulso de 0,3 ms, todas as unidades são recrutadas com amplitude 102,1.',
        'Ratio of the highest to the lowest rheobase (102.1/56.9 ≈ 1.79): with a 0.3 ms pulse, every unit is recruited at amplitude 102.1.',
      ),
      DIMENSIONLESS,
      L('reproduz o modelo original (sem medida publicada)', 'reproduces the original model (no published measurement)'),
    ),
  ],

  '3': [
    entry(
      'V_J',
      ['V_J'],
      L(
        'Potencial que chega à junção neuromuscular: o do soma, atenuado ao longo do axônio como num cabo elétrico. Seus picos marcam os disparos que chegam ao músculo.',
        'Potential reaching the neuromuscular junction: that of the soma, attenuated along the axon as in an electrical cable. Its peaks mark the spikes that reach the muscle.',
      ),
      L('mV vezes um fator do código cuja unidade não é definida', 'mV times a code factor whose unit is not defined'),
      L('fórmula do código original (Main.m), que cita Hald 2012', 'formula of the original code (Main.m), which cites Hald 2012'),
      (c) => c.original,
    ),
    { ...soma2a, meaning: L('Potencial do soma calculado na etapa 2a.', 'Soma potential computed in stage 2a.'), when: (c) => c.original },
    entry(
      '\\lambda',
      ['\\lambda'],
      L(
        'Constante de comprimento do cabo: a distância em que o sinal cai a 1/e. Aqui λ = √(1/0,070) ≈ 3,78.',
        'Length constant of the cable: the distance over which the signal falls to 1/e. Here λ = √(1/0.070) ≈ 3.78.',
      ),
      NO_UNIT_IN_CODE,
      L(
        '0,070 é a condutância de vazamento citada no código original (Hald 2012, um artigo sobre vasos sanguíneos)',
        '0.070 is the leak conductance cited in the original code (Hald 2012, an article about blood vessels)',
      ),
      (c) => c.original,
    ),
    entry(
      'x',
      ['x'],
      L(
        'Comprimento do axônio, do motoneurônio até o músculo: 80 % → 0,8 m.',
        'Length of the axon, from the motoneuron to the muscle: 80 % → 0.8 m.',
      ),
      L('m', 'm'),
      L(
        'campo “Comprimento do axônio” (grupo Músculo / unidades motoras, etapa Fisiologia), em % (÷ 100)',
        'the “Axon length” field (Muscle / motor units group, Physiology step), in % (÷ 100)',
      ),
    ),
    entry(
      '\\text{axonLengthPercent}',
      ['\\text{axonLengthPercent}'],
      L('O nome do campo “Comprimento do axônio” no pedido de simulação.', 'The name of the “Axon length” field in the simulation request.'),
      L('%', '%'),
      L('campo “Comprimento do axônio” (grupo Músculo / unidades motoras, etapa Fisiologia)', 'the “Axon length” field (Muscle / motor units group, Physiology step)'),
    ),
    entry(
      '\\Delta_k',
      ['\\Delta_k', '\\Delta'],
      L(
        'Atraso de condução da unidade k: quanto o potencial de ação leva para ir do motoneurônio ao músculo, em amostras (passos de integração) e em ms.',
        'Conduction delay of unit k: how long the action potential takes to travel from the motoneuron to the muscle, in samples (integration steps) and in ms.',
      ),
      L('amostras (e ms)', 'samples (and ms)'),
      COMPUTED,
    ),
    entry(
      'v_k',
      ['v_k', 'v'],
      L(
        'Velocidade de condução do axônio da unidade k (APAT no código original). Unidades maiores conduzem mais rápido: S 44–47, FR 47–50, FF 50–53 m/s.',
        'Conduction velocity of the axon of unit k (APAT in the original code). Larger units conduct faster: S 44–47, FR 47–50, FF 50–53 m/s.',
      ),
      L('m/s', 'm/s'),
      ORIGINAL_TABLE,
    ),
    entry(
      'T',
      ['T'],
      L(
        'Duração da simulação. No modelo original o atraso em ms escala com T (questão Q4 do porte).',
        'Duration of the simulation. In the original model the delay in ms scales with T (question Q4 of the port).',
      ),
      MS,
      DURATION_FIELD,
      (c) => c.original,
    ),
    entry(
      '\\delta t',
      ['\\delta t'],
      L('Passo de integração: o intervalo entre duas amostras da simulação.', 'Integration step: the interval between two samples of the simulation.'),
      MS,
      L('campo “Passo de integração” (grupo Simulação, etapa Simulação)', 'the “Integration step” field (Simulation group, Simulation step)'),
    ),
    entry(
      'f',
      ['f'],
      L(
        'Posição do eletrodo de FES no axônio, como fração do caminho do soma (0) ao músculo (1). Muda onde os disparos centrais e os do FES se encontram, não o atraso total.',
        'Position of the FES electrode on the axon, as a fraction of the path from the soma (0) to the muscle (1). It changes where the central and FES spikes meet, not the total delay.',
      ),
      DIMENSIONLESS,
      L('campo “Posição do eletrodo no axônio” (grupo Drive central, etapa Fisiologia)', 'the “Electrode position on the axon” field (Central drive group, Physiology step)'),
      (c) => c.drive && !c.invasive,
    ),
    entry(
      '\\Delta_1,\\ \\Delta_2',
      ['\\Delta_1', '\\Delta_2'],
      L(
        'As duas partes do atraso: Δ_1 do soma ao eletrodo e Δ_2 do eletrodo ao músculo. Um disparo central que sai do soma até Δ_1 antes ou depois de um pulso colide com o disparo do FES (janela de 2Δ_1).',
        'The two parts of the delay: Δ_1 from the soma to the electrode and Δ_2 from the electrode to the muscle. A central spike that leaves the soma up to Δ_1 before or after a pulse collides with the FES spike (window of 2Δ_1).',
      ),
      MS,
      L('calculado de Δ_k e f (algoritmo de colisão de Formento et al. 2018)', 'computed from Δ_k and f (collision algorithm of Formento et al. 2018)'),
      (c) => c.drive && !c.invasive,
    ),
  ],

  '4': [
    entry(
      '\\text{MUAP}_k(t)',
      ['\\text{MUAP}_k(t)', '\\text{MUAP}_k'],
      L(
        'Potencial de ação da unidade motora k: a onda elétrica que as fibras da unidade produzem a cada disparo. O EMG mostrado é a soma, sobre os tipos, da média dessas ondas.',
        'Motor unit action potential of unit k: the electrical wave the fibers of the unit produce at each spike. The EMG shown is the sum, over the types, of the mean of these waves.',
      ),
      L('unidade do modelo', 'model unit'),
      COMPUTED,
    ),
    entry(
      'H',
      ['H'],
      L(
        'Altura do disparo: no modelo original, o valor do pico de V_J que gerou o MUAP; no modelo corrigido, 1 (todo disparo do axônio vale igual).',
        'Height of the spike: in the original model, the value of the V_J peak that triggered the MUAP; in the corrected model, 1 (every axon spike counts the same).',
      ),
      L('a de V_J no modelo original; adimensional no corrigido', 'that of V_J in the original model; dimensionless in the corrected one'),
      COMPUTED,
    ),
    entry(
      'V_J',
      ['V_J'],
      L('Potencial na junção neuromuscular (etapa 3).', 'Potential at the neuromuscular junction (stage 3).'),
      L('a da etapa 3', 'that of stage 3'),
      L('etapa 3', 'stage 3'),
      (c) => c.original,
    ),
    entry(
      'S_k',
      ['S_k'],
      L(
        'Fator de escala do MUAP da unidade k (APSF no código original): unidades maiores têm MUAPs maiores (S 0,105–0,125, FR 0,125–0,3, FF 0,3–0,5).',
        'Scale factor of the MUAP of unit k (APSF in the original code): larger units have larger MUAPs (S 0.105–0.125, FR 0.125–0.3, FF 0.3–0.5).',
      ),
      DIMENSIONLESS,
      ORIGINAL_TABLE,
    ),
    entry(
      '\\lambda_m',
      ['\\lambda_m'],
      L(
        'Fator de tempo do MUAP (APTF no código original): a largura da onda; unidades maiores têm ondas mais estreitas (S 0,8–0,7, FR 0,7–0,6, FF 0,6–0,5).',
        'Time factor of the MUAP (APTF in the original code): the width of the wave; larger units have narrower waves (S 0.8–0.7, FR 0.7–0.6, FF 0.6–0.5).',
      ),
      MS,
      ORIGINAL_TABLE,
    ),
    entry(
      'u',
      ['u'],
      L('O tempo medido em larguras da onda: t/λ_m.', 'Time measured in wave widths: t/λ_m.'),
      DIMENSIONLESS,
      COMPUTED,
    ),
    entry(
      't',
      ['t'],
      L(
        'Tempo em relação ao centro do MUAP, de −1,25 a 1,25 ms; a onda é escrita Δ_k amostras depois do disparo.',
        'Time relative to the centre of the MUAP, from −1.25 to 1.25 ms; the wave is written Δ_k samples after the spike.',
      ),
      MS,
      COMPUTED,
    ),
    entry(
      '\\text{seed}',
      ['\\text{seed}'],
      L(
        'Semente do sorteio: escolhe a forma (0 ou 1) do MUAP de cada unidade e, no modelo corrigido, a ordem das reobases (etapa 2b). A mesma semente repete a simulação.',
        'Seed of the draw: it picks the shape (0 or 1) of the MUAP of each unit and, in the corrected model, the order of the rheobases (stage 2b). The same seed repeats the simulation.',
      ),
      DIMENSIONLESS,
      L('campo “Semente” (grupo Simulação, etapa Simulação)', 'the “Seed” field (Simulation group, Simulation step)'),
    ),
  ],

  '5a': [
    entry(
      'h_k(t)',
      ['h_k(t)'],
      L(
        'Abalo (twitch) da unidade k: a força que um único disparo produz, t ms depois dele. A força da unidade é a soma dos abalos dos seus disparos.',
        'Twitch of unit k: the force a single spike produces, t ms after it. The force of the unit is the sum of the twitches of its spikes.',
      ),
      FORCE_UNIT,
      COMPUTED,
    ),
    peakTwitch,
    entry(
      'T_k',
      ['T_k'],
      L(
        'Tempo de contração: do disparo ao pico do abalo (MTTP no código original). Longo nas unidades lentas (S: 100–110 ms) e curto nas rápidas (FR 55,5–73,5, FF 56,9–82,3 ms).',
        'Contraction time: from the spike to the peak of the twitch (MTTP in the original code). Long in slow units (S: 100–110 ms) and short in fast ones (FR 55.5–73.5, FF 56.9–82.3 ms).',
      ),
      MS,
      ORIGINAL_TABLE,
    ),
    entry('t', ['t'], L('Tempo desde o disparo.', 'Time since the spike.'), MS, COMPUTED),
    entry(
      '\\text{MT}_k,\\ \\text{MTTP}_k',
      ['\\text{MT}_k', '\\text{MTTP}_k'],
      L(
        'Nomes do código original: MT = amplitude do abalo (P_k), MTTP = tempo até o pico (T_k).',
        'Names in the original code: MT = twitch amplitude (P_k), MTTP = time to peak (T_k).',
      ),
      L('como P_k e T_k', 'as P_k and T_k'),
      ORIGINAL_TABLE,
    ),
  ],

  '5b': [
    entry(
      'h_k(t)',
      ['h_k(t)'],
      L(
        'Abalo (twitch) da unidade k: a força que um único disparo produz, t ms depois dele. A força da unidade é a soma dos abalos dos seus disparos.',
        'Twitch of unit k: the force a single spike produces, t ms after it. The force of the unit is the sum of the twitches of its spikes.',
      ),
      FORCE_UNIT,
      COMPUTED,
    ),
    peakTwitch,
    entry(
      'T_k',
      ['T_k'],
      L(
        'Tempo de contração: do disparo ao pico do abalo. Longo nas unidades lentas (S) e curto nas rápidas (FR, FF). É o MTTP do modelo original multiplicado pelo fator ajustado aos dados humanos; na lesão medular, ainda × 0,86.',
        'Contraction time: from the spike to the peak of the twitch. Long in slow units (S) and short in fast ones (FR, FF). It is the MTTP of the original model multiplied by the factor fitted to human data; in spinal cord injury, also × 0.86.',
      ),
      MS,
      L(
        'MTTP da tabela por tipo do modelo original × a escala da “Calibração do twitch” (grupo Modelo, etapa Fisiologia)',
        'MTTP of the per-type table of the original model × the scale of the “Twitch calibration” (Model group, Physiology step)',
      ),
    ),
    entry('t', ['t'], L('Tempo desde o disparo.', 'Time since the spike.'), MS, COMPUTED),
    entry(
      'm',
      ['m'],
      L(
        'Expoente da forma do abalo: m = 1 é o abalo clássico de Fuglevand 1993; m maior faz o abalo relaxar mais depressa depois do pico, sem mudar o pico nem o tempo de contração.',
        'Exponent of the twitch shape: m = 1 is the classic Fuglevand 1993 twitch; a larger m makes the twitch relax faster after the peak, without changing the peak or the contraction time.',
      ),
      DIMENSIONLESS,
      L(
        'ajustado a dados humanos conforme a “Calibração do twitch” (grupo Modelo, etapa Fisiologia): músculo inteiro (Sale 1982, Zoughaib 2026) ou unidade isolada (Macefield 1996); FCR e ECR têm ajustes próprios',
        'fitted to human data according to the “Twitch calibration” (Model group, Physiology step): whole muscle (Sale 1982, Zoughaib 2026) or single unit (Macefield 1996); FCR and ECR have their own fits',
      ),
    ),
    entry(
      '\\text{MTTP}_k',
      ['\\text{MTTP}_k'],
      L('Tempo até o pico do abalo na tabela do código original, antes da escala ajustada.', 'Time to peak of the twitch in the table of the original code, before the fitted scale.'),
      MS,
      ORIGINAL_TABLE,
    ),
  ],

  '6': [
    entry(
      'NR',
      ['NR'],
      L(
        'Frequência normalizada: o tempo de contração dividido pelo intervalo entre disparos. NR alto = cada abalo chega antes de o anterior relaxar, e os abalos se somam.',
        'Normalized rate: the contraction time divided by the interval between spikes. A high NR = each twitch arrives before the previous one relaxes, and the twitches sum.',
      ),
      DIMENSIONLESS,
      COMPUTED,
    ),
    rateTime(L('Tempo de contração da unidade: do disparo ao pico do abalo.', 'Contraction time of the unit: from the spike to the peak of the twitch.')),
    entry(
      '\\text{ISI}',
      ['\\text{ISI}'],
      L(
        'Intervalo entre dois disparos seguidos da mesma unidade. Só com FES, é o intervalo entre pulsos, 1000/f.',
        'Interval between two consecutive spikes of the same unit. With FES alone, it is the interval between pulses, 1000/f.',
      ),
      MS,
      L(
        'calculado dos disparos; com FES vem do controle “Frequência” do Estimulador (etapa 1)',
        'computed from the spikes; with FES it comes from the “Frequency” control of the Stimulator (step 1)',
      ),
    ),
    entry(
      'NF(NR)',
      ['NF(NR)', 'NF'],
      L(
        'Força normalizada: a fração da força máxima (tetânica) que a unidade atinge nessa frequência. Cresce em linha reta até NR = 0,4 e depois satura em 1.',
        'Normalized force: the fraction of the maximal (tetanic) force the unit reaches at that rate. It grows in a straight line up to NR = 0.4 and then saturates at 1.',
      ),
      L('adimensional (0 a 1)', 'dimensionless (0 to 1)'),
      L('Potvin & Fuglevand 2017, Eqs 4–6', 'Potvin & Fuglevand 2017, Eqs 4–6'),
    ),
    entry(
      'g',
      ['g'],
      L(
        'Ganho de cada abalo, para que a soma dos abalos siga NF: 1 até NR = 0,4 e menor acima, quando a força satura.',
        'Gain of each twitch, so that the sum of the twitches follows NF: 1 up to NR = 0.4 and smaller above, where the force saturates.',
      ),
      DIMENSIONLESS,
      L('derivação nossa das equações de Potvin & Fuglevand 2017', 'our derivation from the equations of Potvin & Fuglevand 2017'),
    ),
  ],

  '7': [
    entry(
      'FAT_k',
      ['FAT_k'],
      L(
        'Fatigabilidade da unidade k: quanto da capacidade de força ela perde por segundo disparando na força máxima. Cresce exponencialmente da unidade mais fraca (0,0125 %/s) à mais forte (180 vezes mais).',
        'Fatigability of unit k: how much of its force capacity it loses per second while firing at maximal force. It grows exponentially from the weakest unit (0.0125 %/s) to the strongest (180 times more).',
      ),
      L('%/s', '%/s'),
      L(
        'Potvin & Fuglevand 2017 (Eq 9), indexada pela força do abalo P_k (adaptação nossa)',
        'Potvin & Fuglevand 2017 (Eq 9), indexed by the twitch force P_k (our adaptation)',
      ),
    ),
    peakTwitch,
    entry(
      'P_{\\min},\\ P_{\\max}',
      ['P_{\\min}', 'P_{\\max}'],
      L(
        'Força de abalo da unidade mais fraca e da mais forte do pool inteiro do músculo (0,103 e 0,491).',
        'Twitch force of the weakest and of the strongest unit of the whole muscle pool (0.103 and 0.491).',
      ),
      FORCE_UNIT,
      ORIGINAL_TABLE,
    ),
    entry(
      'C_k',
      ['C_k'],
      L(
        'Capacidade restante da unidade k: 1 = descansada. Multiplica o abalo, cai a cada disparo e não se recupera.',
        'Remaining capacity of unit k: 1 = rested. It multiplies the twitch, falls with each spike and does not recover.',
      ),
      L('adimensional (0 a 1)', 'dimensionless (0 to 1)'),
      COMPUTED,
    ),
    entry(
      'NF(t)',
      ['NF(t)'],
      L(
        'Força normalizada no ritmo atual da unidade (etapa 6): quanto mais perto da força máxima a unidade dispara, mais depressa ela cansa.',
        'Normalized force at the current rate of the unit (stage 6): the closer to maximal force the unit fires, the faster it fatigues.',
      ),
      L('adimensional (0 a 1)', 'dimensionless (0 to 1)'),
      L('etapa 6 (Potvin & Fuglevand 2017, Eq 10)', 'stage 6 (Potvin & Fuglevand 2017, Eq 10)'),
    ),
    rateTime(
      L(
        'Tempo de contração da unidade: aumenta 0,379 % para cada 1 % de capacidade perdida, ou seja, o abalo fica mais lento com a fadiga.',
        'Contraction time of the unit: it grows 0.379 % for each 1 % of capacity lost, so the twitch slows down with fatigue.',
      ),
    ),
    entry(
      'f_k',
      ['f_k'],
      L(
        'Posição da unidade k entre a mais fraca (0) e a mais forte (1), na escala logarítmica da força do abalo. Na lesão medular, cada unidade anda parte do caminho até 1 e fica mais fatigável.',
        'Position of unit k between the weakest (0) and the strongest (1), on the log scale of twitch force. In spinal cord injury, each unit moves part of the way to 1 and becomes more fatigable.',
      ),
      DIMENSIONLESS,
      L(
        'ajuste de fadigabilidade da lesão medular (grupo Condição, etapa Fisiologia; Chang & Shields 2011)',
        'fatigability adjustment of spinal cord injury (Condition group, Physiology step; Chang & Shields 2011)',
      ),
      (c) => c.fastShift,
    ),
    entry(
      't',
      ['t'],
      L('Tempo da simulação, de 0 até a duração.', 'Simulation time, from 0 to the duration.'),
      L('s', 's'),
      DURATION_FIELD,
    ),
    entry(
      'NR',
      ['NR'],
      L(
        'Frequência normalizada (etapa 6). Abaixo de 0,25 o abalo anterior já relaxou: o intervalo conta como pausa e não cansa.',
        'Normalized rate (stage 6). Below 0.25 the previous twitch has relaxed: the interval counts as a pause and causes no fatigue.',
      ),
      DIMENSIONLESS,
      COMPUTED,
    ),
  ],

  '8a': [
    muscleForce(
      L(
        'Força do músculo: soma, sobre os tipos S, FR e FF, da força média das unidades simuladas de cada tipo.',
        'Muscle force: sum, over the types S, FR and FF, of the mean force of the simulated units of each type.',
      ),
      L('regra do modelo original (Main.m)', 'rule of the original model (Main.m)'),
    ),
    unitForce,
  ],

  '8b': [
    muscleForce(
      L(
        'Força do músculo: soma das forças de todas as unidades simuladas, cada uma pesada pelo número de unidades reais que representa. Nos gráficos, em % da força máxima do músculo saudável.',
        'Muscle force: sum of the forces of every simulated unit, each weighted by the number of real units it stands for. In the charts, in % of the maximal force of the healthy muscle.',
      ),
      L('Potvin & Fuglevand 2017 (força do músculo como soma das unidades)', 'Potvin & Fuglevand 2017 (muscle force as the sum of the units)'),
    ),
    unitForce,
    entry(
      'N_{\\text{pool}}',
      ['N_{\\text{pool,tipo}}', 'N_{\\text{pool,type}}', 'N_{\\text{pool}}'],
      L(
        'Número de unidades motoras do tipo no músculo real (por exemplo, sóleo: 800 S, 50 FR, 50 FF).',
        'Number of motor units of the type in the real muscle (for example, soleus: 800 S, 50 FR, 50 FF).',
      ),
      L('unidades', 'units'),
      L('preset do músculo (campo “Músculo”, grupo Músculo / unidades motoras, etapa Fisiologia)', 'muscle preset (the “Muscle” field, Muscle / motor units group, Physiology step)'),
    ),
    entry(
      'N_{\\text{sim}}',
      ['N_{\\text{sim,tipo}}', 'N_{\\text{sim,type}}', 'N_{\\text{sim}}'],
      L(
        'Número de unidades do tipo que são de fato simuladas.',
        'Number of units of the type that are actually simulated.',
      ),
      L('unidades', 'units'),
      L(
        'campos “Unidades S / FR / FF” com contagens manuais; senão automático (120 unidades na proporção do músculo, informadas pelo servidor)',
        'the “S / FR / FF units” fields with manual counts; otherwise automatic (120 units in the proportion of the muscle, reported by the server)',
      ),
    ),
    entry(
      'w_{S},\\ w_{FR},\\ w_{FF}',
      ['w_{S}', 'w_{FR}', 'w_{FF}'],
      L(
        'Peso de cada unidade simulada do tipo: N_pool/N_sim, quantas unidades reais ela representa.',
        'Weight of each simulated unit of the type: N_pool/N_sim, how many real units it stands for.',
      ),
      DIMENSIONLESS,
      COMPUTED,
    ),
    entry(
      's',
      ['s'],
      L(
        'Fator da condição sobre a força do músculo: o produto dos ajustes ativos (atrofia, perda de unidades motoras, polineuropatia).',
        'Factor of the condition on the muscle force: the product of the active adjustments (atrophy, loss of motor units, polyneuropathy).',
      ),
      DIMENSIONLESS,
      L(
        'ajustes do grupo Condição (etapa Fisiologia): Modlesky 2004, Krenovsky 2020, Kwon 2024',
        'adjustments of the Condition group (Physiology step): Modlesky 2004, Krenovsky 2020, Kwon 2024',
      ),
      (c) => c.forceFactors,
    ),
  ],
};

/** Every glossary entry of a stage with the settings that select it (for the coverage test). */
export function glossaryEntries(stage: StageId, c: SymbolContext): readonly GlossaryEntry[] {
  return SYMBOLS[stage].filter((e) => !e.when || e.when(c));
}

/** All entries of a stage, whatever the settings (for the coverage test). */
export function allGlossaryEntries(stage: StageId): readonly GlossaryEntry[] {
  return SYMBOLS[stage];
}

/** The glossary of a stage for the current settings, in the current locale. */
export function stageSymbols(stage: StageId, c: SymbolContext): StageSymbol[] {
  return glossaryEntries(stage, c).map((e) => ({ tex: e.tex, meaning: tr(e.meaning), unit: tr(e.unit), source: tr(e.source) }));
}

/** Stages whose equations use the unit index k and the S / FR / FF types. */
const INDEXED: ReadonlySet<StageId> = new Set(['2b', '2c', '3', '4', '5a', '5b', '6', '7', '8a', '8b']);

/** The subscript conventions, said once at the top of the glossary. */
export function subscriptNote(stage: StageId): string | null {
  if (!INDEXED.has(stage)) return null;
  return tr({
    'pt-BR':
      'O índice k numera as unidades motoras: cada unidade tem seus próprios valores. S, FR e FF são os tipos de unidade: lentas, rápidas resistentes à fadiga e rápidas fatigáveis. Nas linhas com valores, “S (106)” diz o tipo e quantas unidades dele foram simuladas, e a → b vai da primeira à última unidade do tipo.',
    en:
      'The index k numbers the motor units: each unit has its own values. S, FR and FF are the unit types: slow, fast fatigue-resistant and fast fatigable. In the lines with values, “S (106)” gives the type and how many of its units were simulated, and a → b goes from the first to the last unit of the type.',
  });
}
