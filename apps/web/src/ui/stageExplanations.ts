import type { StageId } from '../domain/modelEquations';
import type { ReferenceId } from '../domain/references';

export interface StageExplanation {
  /** The equation in plain Portuguese. */
  plain: string;
  /** Published sources, each with what it supports here. */
  refs: { id: ReferenceId; supports: string }[];
  /** Parts taken from the original MATLAB model without a published source. */
  inherited?: string;
}

/** "Em palavras" and sources of every stage of the equations view (docs/model-equations.md). */
export const STAGE_EXPLANATIONS: Record<StageId, StageExplanation> = {
  '1': {
    plain:
      'O estimulador gera pulsos de corrente: cada pulso dura PW (a largura de pulso) e se repete f vezes por segundo. ' +
      'No pulso bifásico, logo após a fase positiva vem uma fase negativa igual, para não acumular carga no tecido. ' +
      'A amplitude é multiplicada por um envelope E(t), que sobe na rampa de subida, fica constante e desce na rampa de ' +
      'descida; entre os trens a corrente é zero.',
    refs: [{ id: 'doucet2012', supports: 'larguras de pulso usadas em FES (300–600 µs)' }],
  },
  '2a': {
    plain:
      'Cada motoneurônio é um pequeno circuito elétrico com dois compartimentos, o soma e o dendrito. Canais de sódio e ' +
      'potássio geram o potencial de ação (Hodgkin–Huxley) e canais de cálcio podem sustentar platôs. A corrente do ' +
      'estímulo entra no soma ou no dendrito; quando a voltagem do soma passa do limiar, o motoneurônio dispara.',
    refs: [
      { id: 'booth1997', supports: 'modelo de dois compartimentos e suas condutâncias' },
      { id: 'cisiKohn2008', supports: 'pool de motoneurônios dos tipos S, FR e FF construído com esse modelo' },
    ],
  },
  '2b': {
    plain:
      'Na FES de superfície a corrente excita os axônios motores. Um pulso curto precisa de mais corrente que um pulso ' +
      'longo para excitar o mesmo axônio: o limiar é a reobase multiplicada por (1 + τ/PW). Cada axônio tem sua própria ' +
      'reobase; quanto maior a amplitude, mais axônios passam do limiar, sem preferência por tipo de unidade.',
    refs: [
      { id: 'mogyoros1996', supports: 'lei de Weiss em nervo humano e τ = 0,459 ms' },
      { id: 'gregoryBickel2005', supports: 'recrutamento não seletivo e espacialmente fixo na estimulação elétrica' },
    ],
    inherited:
      'A faixa de reobases (primeira unidade em 56,9 e todas em 102,1 com pulso de 0,3 ms) reproduz o modelo original; ' +
      'não vem de medida publicada.',
  },
  '3': {
    plain:
      'O potencial de ação percorre o axônio até o músculo com velocidade v; o atraso é a distância dividida por v. No ' +
      'modelo original, o sinal que chega à junção diminui exponencialmente com a distância, como num cabo elétrico.',
    refs: [
      {
        id: 'hald2012',
        supports: 'fórmula do cabo citada no código original (o artigo trata de vasos sanguíneos, não de nervos)',
      },
    ],
    inherited: 'As velocidades de condução (44–53 m/s) vêm do modelo original (createUMs.m), sem fonte citada.',
  },
  '4': {
    plain:
      'Cada disparo gera na fibra muscular um potencial de ação da unidade motora (MUAP) com forma fixa. Somando os ' +
      'MUAPs de todas as unidades obtém-se o EMG simulado.',
    refs: [],
    inherited: 'A forma do MUAP e seus parâmetros vêm do modelo original (Main.m), sem fonte publicada citada.',
  },
  '5a': {
    plain:
      'Cada disparo produz um abalo (twitch): a força sobe até o pico P no tempo T e depois cai. A força da unidade é a ' +
      'soma dos abalos de todos os seus disparos.',
    refs: [{ id: 'fuglevand1993', supports: 'abalo criticamente amortecido usado em modelos de pools de unidades motoras' }],
  },
  '5b': {
    plain:
      'Como o abalo anterior, mas o expoente m controla a forma: com m maior o abalo relaxa mais depressa. T e m foram ' +
      'ajustados a dados humanos: ao abalo do músculo inteiro ou à média de unidades motoras isoladas, conforme a ' +
      'calibração escolhida na barra lateral.',
    refs: [
      { id: 'raikova2013', supports: 'modelos de unidade motora com tempos de contração e de relaxamento independentes' },
      { id: 'sale1982', supports: 'abalo do tríceps sural humano (alvo "músculo inteiro")' },
      { id: 'zoughaib2026', supports: 'abalo do tríceps sural humano (alvo "músculo inteiro")' },
      { id: 'macefield1996', supports: 'abalo de unidades motoras humanas isoladas (alvo "unidade isolada")' },
    ],
  },
  '6': {
    plain:
      'Quando a unidade dispara mais depressa, os abalos se somam, mas a força não cresce sem limite: ela satura. NR ' +
      'compara o tempo de contração com o intervalo entre disparos, e NF(NR) diz que fração da força máxima a unidade ' +
      'atinge nessa frequência.',
    refs: [{ id: 'potvinFuglevand2017', supports: 'curva força–frequência das unidades motoras (Eqs 4–6)' }],
  },
  '7': {
    plain:
      'Cada disparo consome um pouco da capacidade de força da unidade. As unidades mais fortes (FF) cansam mais depressa ' +
      'que as mais fracas (S), e o abalo fica mais lento à medida que a unidade cansa. O modelo não tem recuperação.',
    refs: [
      { id: 'potvinFuglevand2017', supports: 'modelo de fadiga por unidade motora (Eqs 9–11 e 14)' },
      { id: 'changShields2011', supports: 'índice de fadiga medido no sóleo humano, usado na validação' },
    ],
  },
  '8a': {
    plain: 'A força do músculo é a soma das forças médias de cada tipo de unidade, como no modelo original.',
    refs: [],
    inherited: 'Regra do modelo original (Main.m).',
  },
  '8b': {
    plain:
      'A força do músculo é a soma das forças de todas as unidades simuladas, cada uma multiplicada pelo número de ' +
      'unidades reais do músculo que ela representa. Nos gráficos ela aparece em % da força máxima do músculo ' +
      'saudável: o tétano com todas as unidades disparando a 100 Hz, sem fadiga e sem os ajustes da condição.',
    refs: [{ id: 'potvinFuglevand2017', supports: 'força do músculo como soma das forças das unidades' }],
  },
};

/** Short titles of the stages (as in the equations view). */
export const STAGE_TITLES: Record<StageId, string> = {
  '1': 'Estímulo',
  '2a': 'Motoneurônio (soma + dendrito)',
  '2b': 'Axônio motor (Weiss)',
  '3': 'Condução até o músculo',
  '4': 'Potencial de ação da unidade motora e EMG',
  '5a': 'Twitch (Fuglevand 1993)',
  '5b': 'Twitch generalizado',
  '6': 'Saturação por frequência',
  '7': 'Fadiga periférica',
  '8a': 'Força muscular',
  '8b': 'Força muscular (ponderada pelo pool)',
};
