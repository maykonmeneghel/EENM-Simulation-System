import { lazyRecord, localizedRecord } from '../i18n/lazy';
import type { StageId } from '../domain/modelEquations';
import type { ReferenceId } from '../domain/references';
import type { Localized } from '../i18n/locale';
import { tr } from '../i18n/locale';

export interface StageExplanation {
  /** The equation in plain words. */
  plain: string;
  /** Published sources, each with what it supports here. */
  refs: { id: ReferenceId; supports: string }[];
  /** Parts taken from the original MATLAB model without a published source. */
  inherited?: string;
}

interface LocalizedExplanation {
  plain: Localized;
  refs: { id: ReferenceId; supports: Localized }[];
  inherited?: Localized;
}


const EXPLANATIONS: Record<StageId, LocalizedExplanation> = {
  '1': {
    plain: {
      'pt-BR':
        'O estimulador gera pulsos de corrente: cada pulso dura PW (a largura de pulso) e se repete f vezes por segundo. ' +
        'No pulso bifásico, logo após a fase positiva vem uma fase negativa igual, para não acumular carga no tecido. ' +
        'A amplitude é multiplicada por um envelope E(t), que sobe na rampa de subida, fica constante e desce na rampa de ' +
        'descida; entre os trens a corrente é zero.',
      en:
        'The stimulator delivers current pulses: each pulse lasts PW (the pulse width) and repeats f times per second. ' +
        'In the biphasic pulse, the positive phase is followed at once by an equal negative phase, so no charge builds up ' +
        'in the tissue. The amplitude is multiplied by an envelope E(t) that rises during the ramp-up, stays constant and ' +
        'falls during the ramp-down; between trains the current is zero.',
    },
    refs: [{ id: 'doucet2012', supports: { 'pt-BR': 'larguras de pulso usadas em FES (300–600 µs)', en: 'pulse widths used in FES (300–600 µs)' } }],
  },
  '2a': {
    plain: {
      'pt-BR':
        'Cada motoneurônio é um pequeno circuito elétrico com dois compartimentos, o soma e o dendrito. Canais de sódio e ' +
        'potássio geram o potencial de ação (Hodgkin–Huxley) e canais de cálcio podem sustentar platôs. A corrente do ' +
        'estímulo entra no soma ou no dendrito; quando a voltagem do soma passa do limiar, o motoneurônio dispara.',
      en:
        'Each motoneuron is a small electrical circuit with two compartments, the soma and the dendrite. Sodium and ' +
        'potassium channels generate the action potential (Hodgkin–Huxley) and calcium channels can sustain plateaus. The ' +
        'stimulus current enters the soma or the dendrite; when the soma voltage crosses the threshold, the motoneuron fires.',
    },
    refs: [
      { id: 'booth1997', supports: { 'pt-BR': 'modelo de dois compartimentos e suas condutâncias', en: 'two-compartment model and its conductances' } },
      {
        id: 'cisiKohn2008',
        supports: {
          'pt-BR': 'pool de motoneurônios dos tipos S, FR e FF construído com esse modelo',
          en: 'motoneuron pool of S, FR and FF types built with this model',
        },
      },
    ],
  },
  '2c': {
    plain: {
      'pt-BR':
        'Com o drive central, os motoneurônios são os de Cisi & Kohn (2008), os mesmos do modelo de tremor de Gallego ' +
        '(2015): soma ativo e dendrito passivo. Quando a voltagem do soma passa do limiar, os canais de sódio e potássio ' +
        'abrem durante um pulso de 0,6 ms e geram o potencial de ação; o potássio lento (q) produz a pós-hiperpolarização, ' +
        'que espaça os disparos. Assim cada unidade dispara devagar perto do limiar (≈ 7–11 Hz) e mais rápido com mais ' +
        'corrente. A corrente é a soma do drive (fundo, comando voluntário, tremor e ruído) e, no modo invasivo, do estímulo.',
      en:
        'With the central drive, the motoneurons are those of Cisi & Kohn (2008), the same as in the tremor model of ' +
        'Gallego (2015): active soma and passive dendrite. When the soma voltage crosses the threshold, the sodium and ' +
        'potassium channels open during a 0.6 ms pulse and generate the action potential; the slow potassium (q) produces ' +
        'the afterhyperpolarization, which spaces the spikes. So each unit fires slowly near threshold (≈ 7–11 Hz) and ' +
        'faster with more current. The current is the sum of the drive (background, voluntary command, tremor and noise) ' +
        'and, in the invasive mode, the stimulus.',
    },
    refs: [
      {
        id: 'cisiKohn2008',
        supports: {
          'pt-BR': 'equações, geometria, resistências e reobases por tipo (Tabelas 2 e 5)',
          en: 'equations, geometry, resistances and rheobases per type (Tables 2 and 5)',
        },
      },
      {
        id: 'watanabe2013',
        supports: { 'pt-BR': 'condutâncias, constantes de taxa e limiares (Tabela 1)', en: 'conductances, rate constants and thresholds (Table 1)' },
      },
      {
        id: 'gallego2015',
        supports: { 'pt-BR': 'o mesmo motoneurônio no modelo de tremor; valores do drive', en: 'the same motoneuron in the tremor model; drive values' },
      },
    ],
  },
  '2b': {
    plain: {
      'pt-BR':
        'Na FES de superfície a corrente excita os axônios motores. Um pulso curto precisa de mais corrente que um pulso ' +
        'longo para excitar o mesmo axônio: o limiar é a reobase multiplicada por (1 + τ/PW). Cada axônio tem sua própria ' +
        'reobase; quanto maior a amplitude, mais axônios passam do limiar, sem preferência por tipo de unidade.',
      en:
        'In surface FES the current excites the motor axons. A short pulse needs more current than a long pulse to excite ' +
        'the same axon: the threshold is the rheobase multiplied by (1 + τ/PW). Each axon has its own rheobase; the larger ' +
        'the amplitude, the more axons cross the threshold, with no preference for a unit type.',
    },
    refs: [
      { id: 'mogyoros1996', supports: { 'pt-BR': 'lei de Weiss em nervo humano e τ = 0,459 ms', en: 'Weiss law in human nerve and τ = 0.459 ms' } },
      {
        id: 'gregoryBickel2005',
        supports: {
          'pt-BR': 'recrutamento não seletivo e espacialmente fixo na estimulação elétrica',
          en: 'non-selective, spatially fixed recruitment in electrical stimulation',
        },
      },
    ],
    inherited: {
      'pt-BR':
        'A faixa de reobases (primeira unidade em 56,9 e todas em 102,1 com pulso de 0,3 ms) reproduz o modelo original; ' +
        'não vem de medida publicada.',
      en:
        'The rheobase range (first unit at 56.9 and all at 102.1 with a 0.3 ms pulse) reproduces the original model; it ' +
        'does not come from a published measurement.',
    },
  },
  '3': {
    plain: {
      'pt-BR':
        'O potencial de ação percorre o axônio até o músculo com velocidade v; o atraso é a distância dividida por v. No ' +
        'modelo original, o sinal que chega à junção diminui exponencialmente com a distância, como num cabo elétrico.',
      en:
        'The action potential travels along the axon to the muscle at velocity v; the delay is the distance divided by v. ' +
        'In the original model, the signal reaching the junction decays exponentially with distance, as in an electrical cable.',
    },
    refs: [
      {
        id: 'hald2012',
        supports: {
          'pt-BR': 'fórmula do cabo citada no código original (o artigo trata de vasos sanguíneos, não de nervos)',
          en: 'cable formula cited in the original code (the article is about blood vessels, not nerves)',
        },
      },
    ],
    inherited: {
      'pt-BR': 'As velocidades de condução (44–53 m/s) vêm do modelo original (createUMs.m), sem fonte citada.',
      en: 'The conduction velocities (44–53 m/s) come from the original model (createUMs.m), with no cited source.',
    },
  },
  '4': {
    plain: {
      'pt-BR':
        'Cada disparo gera na fibra muscular um potencial de ação da unidade motora (MUAP) com forma fixa. Somando os ' +
        'MUAPs de todas as unidades obtém-se o EMG simulado.',
      en:
        'Each spike produces in the muscle fiber a motor unit action potential (MUAP) of fixed shape. Summing the MUAPs of ' +
        'all units gives the simulated EMG.',
    },
    refs: [],
    inherited: {
      'pt-BR': 'A forma do MUAP e seus parâmetros vêm do modelo original (Main.m), sem fonte publicada citada.',
      en: 'The MUAP shape and its parameters come from the original model (Main.m), with no cited published source.',
    },
  },
  '5a': {
    plain: {
      'pt-BR':
        'Cada disparo produz um abalo (twitch): a força sobe até o pico P no tempo T e depois cai. A força da unidade é a ' +
        'soma dos abalos de todos os seus disparos.',
      en:
        'Each spike produces a twitch: the force rises to the peak P at time T and then falls. The force of the unit is the ' +
        'sum of the twitches of all its spikes.',
    },
    refs: [
      {
        id: 'fuglevand1993',
        supports: {
          'pt-BR': 'abalo criticamente amortecido usado em modelos de pools de unidades motoras',
          en: 'critically damped twitch used in motor unit pool models',
        },
      },
    ],
  },
  '5b': {
    plain: {
      'pt-BR':
        'Como o abalo anterior, mas o expoente m controla a forma: com m maior o abalo relaxa mais depressa. T e m foram ' +
        'ajustados a dados humanos: ao abalo do músculo inteiro ou à média de unidades motoras isoladas, conforme a ' +
        'calibração escolhida na barra lateral.',
      en:
        'Like the previous twitch, but the exponent m controls the shape: with a larger m the twitch relaxes faster. T and ' +
        'm were fitted to human data: to the whole-muscle twitch or to the mean of single motor units, according to the ' +
        'calibration chosen in the sidebar.',
    },
    refs: [
      {
        id: 'raikova2013',
        supports: {
          'pt-BR': 'modelos de unidade motora com tempos de contração e de relaxamento independentes',
          en: 'motor unit models with independent contraction and relaxation times',
        },
      },
      {
        id: 'sale1982',
        supports: { 'pt-BR': 'abalo do tríceps sural humano (alvo "músculo inteiro")', en: 'human triceps surae twitch ("whole muscle" target)' },
      },
      {
        id: 'zoughaib2026',
        supports: { 'pt-BR': 'abalo do tríceps sural humano (alvo "músculo inteiro")', en: 'human triceps surae twitch ("whole muscle" target)' },
      },
      {
        id: 'macefield1996',
        supports: {
          'pt-BR': 'abalo de unidades motoras humanas isoladas (alvo "unidade isolada")',
          en: 'twitch of single human motor units ("single unit" target)',
        },
      },
    ],
  },
  '6': {
    plain: {
      'pt-BR':
        'Quando a unidade dispara mais depressa, os abalos se somam, mas a força não cresce sem limite: ela satura. NR ' +
        'compara o tempo de contração com o intervalo entre disparos, e NF(NR) diz que fração da força máxima a unidade ' +
        'atinge nessa frequência.',
      en:
        'When the unit fires faster, the twitches sum, but the force does not grow without limit: it saturates. NR ' +
        'compares the contraction time with the interspike interval, and NF(NR) gives the fraction of the maximal force ' +
        'the unit reaches at that rate.',
    },
    refs: [
      {
        id: 'potvinFuglevand2017',
        supports: { 'pt-BR': 'curva força–frequência das unidades motoras (Eqs 4–6)', en: 'force–frequency curve of the motor units (Eqs 4–6)' },
      },
    ],
  },
  '7': {
    plain: {
      'pt-BR':
        'Cada disparo consome um pouco da capacidade de força da unidade. As unidades mais fortes (FF) cansam mais depressa ' +
        'que as mais fracas (S), e o abalo fica mais lento à medida que a unidade cansa. O modelo não tem recuperação.',
      en:
        'Each spike uses up a little of the force capacity of the unit. The strongest units (FF) fatigue faster than the ' +
        'weakest (S), and the twitch slows down as the unit fatigues. The model has no recovery.',
    },
    refs: [
      {
        id: 'potvinFuglevand2017',
        supports: { 'pt-BR': 'modelo de fadiga por unidade motora (Eqs 9–11 e 14)', en: 'per-motor-unit fatigue model (Eqs 9–11 and 14)' },
      },
      {
        id: 'changShields2011',
        supports: {
          'pt-BR': 'índice de fadiga medido no sóleo humano, usado na validação',
          en: 'fatigue index measured in the human soleus, used in the validation',
        },
      },
    ],
  },
  '8a': {
    plain: {
      'pt-BR': 'A força do músculo é a soma das forças médias de cada tipo de unidade, como no modelo original.',
      en: 'The muscle force is the sum of the mean forces of each unit type, as in the original model.',
    },
    refs: [],
    inherited: { 'pt-BR': 'Regra do modelo original (Main.m).', en: 'Rule of the original model (Main.m).' },
  },
  '8b': {
    plain: {
      'pt-BR':
        'A força do músculo é a soma das forças de todas as unidades simuladas, cada uma multiplicada pelo número de ' +
        'unidades reais do músculo que ela representa. Nos gráficos ela aparece em % da força máxima do músculo ' +
        'saudável: o tétano com todas as unidades disparando a 100 Hz, sem fadiga e sem os ajustes da condição.',
      en:
        'The muscle force is the sum of the forces of all simulated units, each multiplied by the number of real units of ' +
        'the muscle it represents. The charts show it in % of the maximal force of the healthy muscle: the tetanus with ' +
        'every unit firing at 100 Hz, without fatigue and without the adjustments of the condition.',
    },
    refs: [
      {
        id: 'potvinFuglevand2017',
        supports: { 'pt-BR': 'força do músculo como soma das forças das unidades', en: 'muscle force as the sum of the unit forces' },
      },
    ],
  },
};

/** "Em palavras" and sources of every stage of the equations view (docs/model-equations.md), in the current locale. */
export const STAGE_EXPLANATIONS: Readonly<Record<StageId, StageExplanation>> = lazyRecord(EXPLANATIONS, (e) => ({
  plain: tr(e.plain),
  refs: e.refs.map((r) => ({ id: r.id, supports: tr(r.supports) })),
  ...(e.inherited ? { inherited: tr(e.inherited) } : {}),
}));

const TITLES: Record<StageId, Localized> = {
  '1': { 'pt-BR': 'Estímulo', en: 'Stimulus' },
  '2a': { 'pt-BR': 'Motoneurônio (soma + dendrito)', en: 'Motoneuron (soma + dendrite)' },
  '2b': { 'pt-BR': 'Axônio motor (Weiss)', en: 'Motor axon (Weiss)' },
  '2c': { 'pt-BR': 'Motoneurônio de Cisi & Kohn (drive central)', en: 'Cisi & Kohn motoneuron (central drive)' },
  '3': { 'pt-BR': 'Condução até o músculo', en: 'Conduction to the muscle' },
  '4': { 'pt-BR': 'Potencial de ação da unidade motora e EMG', en: 'Motor unit action potential and EMG' },
  '5a': { 'pt-BR': 'Twitch (Fuglevand 1993)', en: 'Twitch (Fuglevand 1993)' },
  '5b': { 'pt-BR': 'Twitch generalizado', en: 'Generalized twitch' },
  '6': { 'pt-BR': 'Saturação por frequência', en: 'Rate saturation' },
  '7': { 'pt-BR': 'Fadiga periférica', en: 'Peripheral fatigue' },
  '8a': { 'pt-BR': 'Força muscular', en: 'Muscle force' },
  '8b': { 'pt-BR': 'Força muscular (ponderada pelo pool)', en: 'Muscle force (weighted by the pool)' },
};

/** Short titles of the stages (as in the equations view), in the current locale. */
export const STAGE_TITLES: Readonly<Record<StageId, string>> = localizedRecord(TITLES);
