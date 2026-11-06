import type { FormValues } from './formModel';
import { driveActive, tremorActive } from './formModel';
import { decimalSeparator, tr } from '../i18n/locale';

/** A form number shown with the decimal separator of the current locale. */
export const formatDecimal = (raw: string) => raw.replace(/[.,]/, decimalSeparator());
const fmt = formatDecimal;

/** The signal path of the current mode, step by step (plain words, in the current locale). */
export function signalPath(values: FormValues): string[] {
  const invasive = values.stimulationSite === 'MOTONEURON_POOL';
  const drive = driveActive(values);
  const tremor = tremorActive(values);
  const voluntary = Number(values['centralDrive.voluntaryNa'].replace(',', '.')) > 0;
  const tremorHz = fmt(values['centralDrive.tremor.frequencyHz']);
  const central = drive
    ? tr({
        'pt-BR': `O sistema nervoso central manda aos motoneurônios uma corrente de fundo${voluntary ? ', um comando voluntário' : ''}${
          tremor ? `, uma oscilação de ${tremorHz} Hz (tremor)` : ''
        } e ruído.`,
        en: `The central nervous system sends the motoneurons a background current${voluntary ? ', a voluntary command' : ''}${
          tremor ? `, a ${tremorHz} Hz oscillation (tremor)` : ''
        } and noise.`,
      })
    : null;
  const tail = [
    tr({
      'pt-BR': 'Cada disparo que chega ao músculo gera um potencial de ação da unidade motora (o EMG) e um abalo de força.',
      en: 'Each spike that reaches the muscle produces a motor unit action potential (the EMG) and a force twitch.',
    }),
    tr({
      'pt-BR': 'Os abalos somam-se, saturam com a frequência de disparo e enfraquecem com a fadiga; a força é mostrada em % do máximo do músculo saudável.',
      en: 'The twitches sum, saturate with the firing rate and weaken with fatigue; the force is shown in % of the healthy muscle maximum.',
    }),
  ];
  if (invasive) {
    return [
      ...(central ? [central] : []),
      tr({
        'pt-BR': `O estimulador injeta a corrente direto no soma dos motoneurônios (modo invasivo)${central ? ', somada ao drive' : ''}.`,
        en: `The stimulator injects the current straight into the motoneuron somas (invasive mode)${central ? ', added to the drive' : ''}.`,
      }),
      tr({
        'pt-BR': 'Cada motoneurônio (Hodgkin–Huxley, dois compartimentos) dispara quando sua voltagem passa do limiar.',
        en: 'Each motoneuron (Hodgkin–Huxley, two compartments) fires when its voltage crosses the threshold.',
      }),
      tr({ 'pt-BR': 'Os disparos descem pelo axônio até o músculo.', en: 'The spikes travel down the axon to the muscle.' }),
      ...tail,
    ];
  }
  if (drive) {
    const percent = Math.round(Number(values['centralDrive.electrodeFraction'].replace(',', '.')) * 100);
    return [
      central!,
      tr({
        'pt-BR': 'Os motoneurônios (Hodgkin–Huxley) disparam pelo drive; os disparos descem pelo axônio.',
        en: 'The motoneurons (Hodgkin–Huxley) fire under the drive; their spikes travel down the axon.',
      }),
      tr({
        'pt-BR': `O eletrodo na pele dispara o axônio sob ele (lei de Weiss), a ${percent} % do caminho do soma ao músculo.`,
        en: `The skin electrode fires the axon beneath it (Weiss's law), at ${percent} % of the way from the soma to the muscle.`,
      }),
      tr({
        'pt-BR':
          'No axônio, os dois se encontram: o disparo do FES que sobe colide com o disparo central que desce (ambos somem); se o eletrodo acabou de ser atravessado, o pulso não dispara (período refratário de 1,6 ms); se o disparo que sobe chega ao soma, ele reinicia o motoneurônio.',
        en: 'On the axon the two meet: the ascending FES spike collides with the descending central spike (both vanish); if a spike has just passed the electrode, the pulse does not fire (1.6 ms refractory period); if the ascending spike reaches the soma, it resets the motoneuron.',
      }),
      ...tail,
    ];
  }
  return [
    tr({
      'pt-BR':
        'O eletrodo na pele dispara os axônios motores sob ele quando o pulso passa do limiar de cada um (lei de Weiss); o motoneurônio não é simulado.',
      en: "The skin electrode fires the motor axons beneath it when the pulse crosses each one's threshold (Weiss's law); the motoneuron is not simulated.",
    }),
    tr({
      'pt-BR': 'Cada pulso que passa do limiar faz o axônio disparar uma vez.',
      en: 'Each pulse above threshold makes the axon fire once.',
    }),
    ...tail,
  ];
}
