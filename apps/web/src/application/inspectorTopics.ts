import type { StageId } from '../domain/modelEquations';

/** What the right sidebar explains: a visual component of the centre column the user clicked. */
export type InspectorTopic =
  | { kind: 'stage'; stage: StageId }
  | { kind: 'chart'; chart: 'force' | 'stimulus' | 'emg' }
  | { kind: 'fatigue' }
  | { kind: 'scope'; scope: 'pulse' | 'envelope' }
  | { kind: 'recruitment' }
  | { kind: 'mode' };

export interface TopicView {
  title: string;
  /** Model stages whose plain explanation and sources are shown. */
  stages: readonly StageId[];
  /** Show the signal path of the current mode. */
  path: boolean;
  /** Show the central drive (when active), its sources and the known limits. */
  drive: boolean;
  /** Show the live axon-merge counts (non-invasive mode with a drive). */
  axon: boolean;
  /** How to read the component: what it plots and what its features mean (charts and scopes). */
  reading?: readonly string[];
}

const READINGS = {
  force: [
    'Mostra a força do músculo ao longo da simulação, em % da força máxima do músculo saudável (o tétano com todas as unidades disparando a 100 Hz, sem fadiga). Sem essa referência, em unidades do modelo.',
    'A linha azul é o total; as outras são a parte de cada tipo de unidade motora: S (lentas), FR (rápidas resistentes à fadiga) e FF (rápidas fatigáveis).',
    'A subida inicial é a soma dos abalos (somação); a ondulação no platô mostra a fusão incompleta, maior em frequências baixas; uma queda de trem para trem é a fadiga; uma oscilação de 4–6 Hz é o tremor, quando ligado.',
  ],
  stimulus: [
    'Mostra a corrente que o estimulador aplica, em µA/cm² (unidade do modelo, sem conversão verificada para mA).',
    'Cada traço vertical é um pulso; no bifásico, a fase positiva é seguida de uma negativa igual. As rampas aparecem como pulsos que crescem ou diminuem; os trens, como blocos separados por silêncio.',
  ],
  emg: [
    'Mostra o EMG simulado: o potencial de ação médio das unidades motoras, em unidades do modelo.',
    'Cada disparo que chega ao músculo produz uma onda; com FES as ondas se alinham aos pulsos (onda M), e com o drive central ou o tremor aparecem disparos espalhados ou em salvas no ritmo do tremor.',
  ],
  fatigue: [
    'Mostra a capacidade de força que resta em cada tipo de unidade (1 = descansada) e, com trens, o índice de fadiga: o pico de cada trem dividido pelo do primeiro, como na clínica.',
    'As unidades FF perdem capacidade primeiro, as S por último; não há recuperação no modelo.',
  ],
} as const;

/** `forceStages`: the force stages of the current model (twitch, rate saturation, aggregation). */
export function topicView(topic: InspectorTopic, forceStages: readonly StageId[], stageTitle: (s: StageId) => string): TopicView {
  switch (topic.kind) {
    case 'stage':
      return { title: `Etapa ${topic.stage} · ${stageTitle(topic.stage)}`, stages: [topic.stage], path: false, drive: topic.stage === '2a', axon: false };
    case 'chart':
      if (topic.chart === 'force')
        return { title: 'Força muscular', stages: forceStages, path: true, drive: true, axon: true, reading: READINGS.force };
      if (topic.chart === 'stimulus')
        return { title: 'Corrente de estímulo', stages: ['1'], path: false, drive: false, axon: false, reading: READINGS.stimulus };
      return { title: 'EMG', stages: ['3', '4'], path: false, drive: false, axon: true, reading: READINGS.emg };
    case 'fatigue':
      return { title: 'Fadiga', stages: ['7'], path: false, drive: false, axon: false, reading: READINGS.fatigue };
    case 'scope':
      return {
        title: topic.scope === 'pulse' ? 'Forma do pulso' : 'Envelope e trens',
        stages: ['1'],
        path: false,
        drive: false,
        axon: false,
      };
    case 'recruitment':
      return { title: 'Recrutamento dos axônios', stages: ['2b'], path: false, drive: false, axon: false };
    case 'mode':
      return { title: 'Modo de aplicação', stages: [], path: true, drive: true, axon: true };
  }
}
