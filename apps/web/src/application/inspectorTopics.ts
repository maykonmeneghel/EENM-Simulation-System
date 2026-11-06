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
}

/** `forceStages`: the force stages of the current model (twitch, rate saturation, aggregation). */
export function topicView(topic: InspectorTopic, forceStages: readonly StageId[], stageTitle: (s: StageId) => string): TopicView {
  switch (topic.kind) {
    case 'stage':
      return { title: `Etapa ${topic.stage} · ${stageTitle(topic.stage)}`, stages: [topic.stage], path: false, drive: topic.stage === '2a', axon: false };
    case 'chart':
      if (topic.chart === 'force')
        return { title: 'Força muscular', stages: forceStages, path: true, drive: true, axon: true };
      if (topic.chart === 'stimulus')
        return { title: 'Corrente de estímulo', stages: ['1'], path: false, drive: false, axon: false };
      return { title: 'EMG', stages: ['3', '4'], path: false, drive: false, axon: true };
    case 'fatigue':
      return { title: 'Fadiga', stages: ['7'], path: false, drive: false, axon: false };
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
