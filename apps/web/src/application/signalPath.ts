import type { FormValues } from './formModel';
import { driveActive, tremorActive } from './formModel';

/** A form number shown with a decimal comma. */
export const formatDecimal = (raw: string) => raw.replace('.', ',');
const fmt = formatDecimal;

/** The signal path of the current mode, step by step (plain Portuguese). */
export function signalPath(values: FormValues): string[] {
  const invasive = values.stimulationSite === 'MOTONEURON_POOL';
  const drive = driveActive(values);
  const tremor = tremorActive(values);
  const central = drive
    ? `O sistema nervoso central manda aos motoneurônios uma corrente de fundo${
        Number(values['centralDrive.voluntaryNa'].replace(',', '.')) > 0 ? ', um comando voluntário' : ''
      }${tremor ? `, uma oscilação de ${fmt(values['centralDrive.tremor.frequencyHz'])} Hz (tremor)` : ''} e ruído.`
    : null;
  const tail = [
    'Cada disparo que chega ao músculo gera um potencial de ação da unidade motora (o EMG) e um abalo de força.',
    'Os abalos somam-se, saturam com a frequência de disparo e enfraquecem com a fadiga; a força é mostrada em % do máximo do músculo saudável.',
  ];
  if (invasive) {
    return [
      ...(central ? [central] : []),
      `O estimulador injeta a corrente direto no soma dos motoneurônios (modo invasivo)${central ? ', somada ao drive' : ''}.`,
      'Cada motoneurônio (Hodgkin–Huxley, dois compartimentos) dispara quando sua voltagem passa do limiar.',
      'Os disparos descem pelo axônio até o músculo.',
      ...tail,
    ];
  }
  if (drive) {
    return [
      central!,
      'Os motoneurônios (Hodgkin–Huxley) disparam pelo drive; os disparos descem pelo axônio.',
      `O eletrodo na pele dispara o axônio sob ele (lei de Weiss), a ${Math.round(
        Number(values['centralDrive.electrodeFraction'].replace(',', '.')) * 100,
      )} % do caminho do soma ao músculo.`,
      'No axônio, os dois se encontram: o disparo do FES que sobe colide com o disparo central que desce (ambos somem); se o eletrodo acabou de ser atravessado, o pulso não dispara (período refratário de 1,6 ms); se o disparo que sobe chega ao soma, ele reinicia o motoneurônio.',
      ...tail,
    ];
  }
  return [
    'O eletrodo na pele dispara os axônios motores sob ele quando o pulso passa do limiar de cada um (lei de Weiss); o motoneurônio não é simulado.',
    'Cada pulso que passa do limiar faz o axônio disparar uma vez.',
    ...tail,
  ];
}

