import type { ReactNode } from 'react';
import type { StageId } from '../domain/modelEquations';
import type { Localized } from '../i18n/locale';
import { tr } from '../i18n/locale';

/** What the right sidebar explains: a visual component of the centre column the user clicked. */
export type InspectorTopic =
  /** `from`: the equation card (which already shows the plain explanation and the sources) or a diagram block. */
  | { kind: 'stage'; stage: StageId; from?: 'equations' | 'diagram' }
  | { kind: 'chart'; chart: 'force' | 'stimulus' | 'emg' }
  | { kind: 'fatigue' }
  | { kind: 'scope'; scope: 'pulse' | 'envelope' }
  | { kind: 'recruitment' }
  | { kind: 'mode' }
  /** The text of a "?" help button of the settings. */
  | { kind: 'help'; label: string; content: ReactNode };

export interface TopicView {
  title: string;
  /** Model stages explained. */
  stages: readonly StageId[];
  /** Show each stage's plain explanation and sources (false where the centre column already shows them). */
  stageText: boolean;
  /** Show the glossary of each stage's symbols (where the symbols are on screen or one click away). */
  symbols: boolean;
  /** Show the signal path of the current mode. */
  path: boolean;
  /** Show the central drive (when active), its sources and the known limits. */
  drive: boolean;
  /** Show the live axon-merge counts (non-invasive mode with a drive). */
  axon: boolean;
  /** How to read the component: what it plots and what its features mean (charts and scopes). */
  reading?: readonly string[];
}

const READINGS: Readonly<Record<'force' | 'stimulus' | 'emg' | 'fatigue', Localized<readonly string[]>>> = {
  force: {
    'pt-BR': [
      'Mostra a força do músculo ao longo da simulação, em % da força máxima do músculo saudável (o tétano com todas as unidades disparando a 100 Hz, sem fadiga). Sem essa referência, em unidades do modelo.',
      'A linha azul é o total; as outras são a parte de cada tipo de unidade motora: S (lentas), FR (rápidas resistentes à fadiga) e FF (rápidas fatigáveis).',
      'A subida inicial é a soma dos abalos (somação); a ondulação no platô mostra a fusão incompleta, maior em frequências baixas; uma queda de trem para trem é a fadiga; uma oscilação de 4–6 Hz é o tremor, quando ligado.',
    ],
    en: [
      'Shows the muscle force over the simulation, in % of the maximum force of the healthy muscle (the tetanus with every unit firing at 100 Hz, without fatigue). Without that reference, in model units.',
      'The blue line is the total; the others are the share of each motor unit type: S (slow), FR (fast fatigue-resistant) and FF (fast fatigable).',
      'The initial rise is the summation of twitches; the ripple on the plateau shows incomplete fusion, larger at low frequencies; a drop from train to train is fatigue; a 4–6 Hz oscillation is the tremor, when on.',
    ],
  },
  stimulus: {
    'pt-BR': [
      'Mostra a corrente que o estimulador aplica, em µA/cm² (unidade do modelo, sem conversão verificada para mA).',
      'Cada traço vertical é um pulso; no bifásico, a fase positiva é seguida de uma negativa igual. As rampas aparecem como pulsos que crescem ou diminuem; os trens, como blocos separados por silêncio.',
    ],
    en: [
      'Shows the current the stimulator applies, in µA/cm² (model unit, with no verified conversion to mA).',
      'Each vertical stroke is a pulse; in the biphasic waveform, the positive phase is followed by an equal negative one. Ramps show as growing or shrinking pulses; trains, as blocks separated by silence.',
    ],
  },
  emg: {
    'pt-BR': [
      'Mostra o EMG simulado: o potencial de ação médio das unidades motoras, em unidades do modelo.',
      'Cada disparo que chega ao músculo produz uma onda; com FES as ondas se alinham aos pulsos (onda M), e com o drive central ou o tremor aparecem disparos espalhados ou em salvas no ritmo do tremor.',
    ],
    en: [
      'Shows the simulated EMG: the mean motor unit action potential, in model units.',
      'Each spike that reaches the muscle produces a wave; with FES the waves line up with the pulses (M wave), and with the central drive or the tremor, scattered spikes or bursts at the tremor rhythm appear.',
    ],
  },
  fatigue: {
    'pt-BR': [
      'Mostra a capacidade de força que resta em cada tipo de unidade (1 = descansada) e, com trens, o índice de fadiga: o pico de cada trem dividido pelo do primeiro, como na clínica.',
      'As unidades FF perdem capacidade primeiro, as S por último; não há recuperação no modelo.',
    ],
    en: [
      'Shows the force capacity left in each unit type (1 = rested) and, with trains, the fatigue index: the peak of each train divided by that of the first, as in the clinic.',
      'FF units lose capacity first, S units last; there is no recovery in the model.',
    ],
  },
};

/** `forceStages`: the force stages of the current model (twitch, rate saturation, aggregation). */
export function topicView(topic: InspectorTopic, forceStages: readonly StageId[], stageTitle: (s: StageId) => string): TopicView {
  switch (topic.kind) {
    case 'stage':
      return {
        title: `${tr({ 'pt-BR': 'Etapa', en: 'Stage' })} ${topic.stage} · ${stageTitle(topic.stage)}`,
        stages: [topic.stage],
        // the equation card already shows "In words" and the sources: the sidebar explains the symbols instead
        stageText: topic.from !== 'equations',
        symbols: true,
        path: false,
        drive: topic.stage === '2c',
        axon: false,
      };
    case 'chart':
      if (topic.chart === 'force')
        return { title: tr({ 'pt-BR': 'Força muscular', en: 'Muscle force' }), stageText: true, symbols: false, stages: forceStages, path: true, drive: true, axon: true, reading: tr(READINGS.force) };
      if (topic.chart === 'stimulus')
        return { title: tr({ 'pt-BR': 'Corrente de estímulo', en: 'Stimulus current' }), stageText: true, symbols: false, stages: ['1'], path: false, drive: false, axon: false, reading: tr(READINGS.stimulus) };
      return { title: 'EMG', stageText: true, symbols: false, stages: ['3', '4'], path: false, drive: false, axon: true, reading: tr(READINGS.emg) };
    case 'fatigue':
      return { title: tr({ 'pt-BR': 'Fadiga', en: 'Fatigue' }), stageText: true, symbols: false, stages: ['7'], path: false, drive: false, axon: false, reading: tr(READINGS.fatigue) };
    case 'scope':
      return {
        title: topic.scope === 'pulse' ? tr({ 'pt-BR': 'Forma do pulso', en: 'Pulse shape' }) : tr({ 'pt-BR': 'Envelope e trens', en: 'Envelope and trains' }),
        stages: ['1'],
        stageText: true,
        symbols: false,
        path: false,
        drive: false,
        axon: false,
      };
    case 'recruitment':
      return { title: tr({ 'pt-BR': 'Recrutamento dos axônios', en: 'Axon recruitment' }), stageText: true, symbols: false, stages: ['2b'], path: false, drive: false, axon: false };
    case 'mode':
      return { title: tr({ 'pt-BR': 'Modo de aplicação', en: 'Application mode' }), stageText: true, symbols: false, stages: [], path: true, drive: true, axon: true };
    case 'help':
      return { title: topic.label, stageText: true, symbols: false, stages: [], path: false, drive: false, axon: false };
  }
}
