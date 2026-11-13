/**
 * The surface electrode (engine `domain/electrode.py`; docs/design/electrode.md), computed in the browser for the
 * Stimulator panel's Electrode section and recruitment meter. Kept equal to the engine by `electrode.fixture.json`
 * (`validation/electrode_fixture.py`).
 *
 * Every effect is one factor G on the Weiss threshold of every axon: A ≥ G · I_rh,k (1 + τ_SD/PW). Sources and read
 * levels: docs/research/electrode-literature.md.
 */
import type { Localized } from '../i18n/locale';
import type { MuscleId } from './simulation';

export const ELECTRODE_SHAPES = ['RECTANGLE', 'ROUND'] as const;
export type ElectrodeShape = (typeof ELECTRODE_SHAPES)[number];
/** HALF_SPACE_AF: derived (default, the author's choice on 2026-11-12); NONE: Lieber & Kelly 1991. */
export const EFFECT_MODELS = ['HALF_SPACE_AF', 'NONE'] as const;
export type EffectModel = (typeof EFFECT_MODELS)[number];
export const DEFAULT_EFFECT_MODEL: EffectModel = 'HALF_SPACE_AF';

/** The request's `electrode` (all optional for the engine; the web sends every field). */
export interface ElectrodeRequest {
  shape?: ElectrodeShape;
  widthCm?: number | null;
  lengthCm?: number | null;
  diameterCm?: number | null;
  fatThicknessCm?: number | null;
  axonDepthCm?: number | null;
  effectModel?: EffectModel;
  calibration?: CalibrationRequest | null;
}

export interface CalibrationRequest {
  motorThresholdMa: number;
  pulseWidthUs: number;
  fullRecruitmentMa?: number | null;
  /** Area of the electrode the measurement was made with; null = the run's electrode. */
  electrodeAreaCm2?: number | null;
}

/** `started.electrode`: what the engine used. */
export interface RunElectrode {
  shape: ElectrodeShape;
  widthCm: number | null;
  lengthCm: number | null;
  diameterCm: number | null;
  areaCm2: number;
  fatThicknessCm: number;
  axonDepthCm: number;
  effectModel: EffectModel;
  thresholdFactor: number;
  calibration: { motorThresholdMa: number; fullRecruitmentMa: number | null; pulseWidthUs: number; electrodeAreaCm2: number | null } | null;
}

export interface Electrode {
  shape: ElectrodeShape;
  widthCm: number | null;
  lengthCm: number | null;
  diameterCm: number | null;
  fatThicknessCm: number;
  axonDepthCm: number;
}

/** Ranges of the inputs (the API's, docs/design/electrode.md §5). */
export const ELECTRODE_RANGES = {
  sideCm: { min: 0.5, max: 15 },
  diameterCm: { min: 0.5, max: 11.3 },
  areaCm2: { min: 0.5, max: 100 },
  fatThicknessCm: { min: 0, max: 3 },
  axonDepthCm: { min: 0.1, max: 1.1 },
  currentMa: { min: 0.1, max: 200 },
  pulseWidthUs: { min: 20, max: 1000 },
} as const;

const FCR_FAT_CM = 0.56;
const ECR_FAT_CM = 0.48;
const LEG_FAT_CM = 0.75;
const AXON_DEPTH_CM = 0.5;

const round = (diameterCm: number, fatThicknessCm: number): Electrode => ({
  shape: 'ROUND',
  widthCm: null,
  lengthCm: null,
  diameterCm,
  fatThicknessCm,
  axonDepthCm: AXON_DEPTH_CM,
});
const square = (sideCm: number, fatThicknessCm: number): Electrode => ({
  shape: 'RECTANGLE',
  widthCm: sideCm,
  lengthCm: sideCm,
  diameterCm: null,
  fatThicknessCm,
  axonDepthCm: AXON_DEPTH_CM,
});

/** Per-muscle defaults (design §4), where G = 1. */
export const DEFAULT_ELECTRODES: Readonly<Record<MuscleId, Electrode>> = {
  FLEXOR_CARPI_RADIALIS: round(2.5, FCR_FAT_CM),
  EXTENSOR_CARPI_RADIALIS: round(2.5, ECR_FAT_CM),
  GASTROCNEMIUS_MEDIAL: round(5, LEG_FAT_CM),
  GASTROCNEMIUS_LATERAL: round(5, LEG_FAT_CM),
  SOLEUS: square(5, LEG_FAT_CM),
  TIBIALIS_ANTERIOR: square(5, LEG_FAT_CM),
};

export function defaultElectrode(muscle: string): Electrode {
  return DEFAULT_ELECTRODES[muscle as MuscleId] ?? DEFAULT_ELECTRODES.SOLEUS;
}

/** The request's `electrode` for a muscle's default (what the form sends untouched). */
export function defaultElectrodeRequest(muscle: string): ElectrodeRequest {
  const e = defaultElectrode(muscle);
  return {
    shape: e.shape,
    ...(e.shape === 'ROUND' ? { diameterCm: e.diameterCm } : { widthCm: e.widthCm, lengthCm: e.lengthCm }),
    fatThicknessCm: e.fatThicknessCm,
    axonDepthCm: e.axonDepthCm,
    effectModel: DEFAULT_EFFECT_MODEL,
  };
}

export function electrodeArea(e: Pick<Electrode, 'shape' | 'widthCm' | 'lengthCm' | 'diameterCm'>): number {
  if (e.shape === 'ROUND') return e.diameterCm !== null ? (Math.PI * e.diameterCm * e.diameterCm) / 4 : NaN;
  return e.widthCm !== null && e.lengthCm !== null ? e.widthCm * e.lengthCm : NaN;
}

/** Radius of the disk of equal area: the shape enters only through the area. */
export const equivalentRadius = (areaCm2: number) => Math.sqrt(areaCm2 / Math.PI);

const NODES = 4000;
const GRID = 200;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** −AF(x) per unit current and ρ/(2π) of a uniform-current disk (engine `depolarisation`; the same quadrature). */
export function depolarisation(x: number, radiusCm: number, depthCm: number): number {
  const a = radiusCm;
  const d2 = depthCm * depthCm;
  const h = Math.PI / 2 / NODES;
  let sum = 0;
  for (let i = 0; i < NODES; i++) {
    const theta = (i + 0.5) * h;
    const y = a * Math.sin(theta);
    const c = a * Math.cos(theta);
    const yd = y * y + d2;
    const near = x - c;
    const far = x + c;
    sum += (far / (far * far + yd) ** 1.5 - near / (near * near + yd) ** 1.5) * c;
  }
  return (2 * sum * h) / (Math.PI * a * a);
}

/** Closed form under the centre, 1/(a² + d²)^{3/2}. */
export const centreDepolarisation = (radiusCm: number, depthCm: number) => 1 / (radiusCm ** 2 + depthCm ** 2) ** 1.5;

/** Largest depolarisation along the axon (it moves under the edge of wide, shallow electrodes). */
export function peakDepolarisation(radiusCm: number, depthCm: number): { x: number; peak: number } {
  const span = radiusCm + depthCm;
  const xs = Array.from({ length: GRID }, (_, i) => (span * i) / (GRID - 1));
  const values = xs.map((x) => depolarisation(x, radiusCm, depthCm));
  let best = 0;
  for (let i = 1; i < GRID; i++) if (values[i]! > values[best]!) best = i;
  let lo = xs[Math.max(0, best - 1)]!;
  let hi = xs[Math.min(GRID - 1, best + 1)]!;
  let x1 = hi - GOLDEN * (hi - lo);
  let x2 = lo + GOLDEN * (hi - lo);
  let f1 = depolarisation(x1, radiusCm, depthCm);
  let f2 = depolarisation(x2, radiusCm, depthCm);
  while (hi - lo > 1e-9 * span) {
    if (f1 >= f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - GOLDEN * (hi - lo);
      f1 = depolarisation(x1, radiusCm, depthCm);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + GOLDEN * (hi - lo);
      f2 = depolarisation(x2, radiusCm, depthCm);
    }
  }
  const [x, f] = f1 >= f2 ? [x1, f1] : [x2, f2];
  return values[best]! > f ? { x: xs[best]!, peak: values[best]! } : { x, peak: f };
}

const peakCache = new Map<string, number>();
function cachedPeak(radiusCm: number, depthCm: number): number {
  const key = `${radiusCm}|${depthCm}`;
  let p = peakCache.get(key);
  if (p === undefined) {
    p = peakDepolarisation(radiusCm, depthCm).peak;
    if (peakCache.size > 200) peakCache.clear();
    peakCache.set(key, p);
  }
  return p;
}

/** G = AF_peak(reference) / AF_peak(electrode); exactly 1 at the reference. */
export function sizeFactor(radiusCm: number, depthCm: number, refRadiusCm: number, refDepthCm: number): number {
  if (radiusCm === refRadiusCm && depthCm === refDepthCm) return 1;
  return cachedPeak(refRadiusCm, refDepthCm) / cachedPeak(radiusCm, depthCm);
}

/** What the electrode does to the axons' thresholds. */
export interface Excitability {
  /** G. */
  g: number;
  /** Lowest rheobase (u.m., or mA when calibrated) and highest / lowest. */
  rheobaseMin: number;
  rheobaseSpread: number;
  unit: 'MODEL_UNIT' | 'MA';
}

export interface ElectrodeInput {
  electrode: Electrode;
  effectModel: EffectModel;
  calibration: CalibrationRequest | null;
}

/** Engine `electrode_setup` + `apply_electrode` (null when the inputs are not finite). */
export function excitability(
  muscle: string,
  input: ElectrodeInput,
  base: { tauSdMs: number; rheobaseMin: number; rheobaseSpread: number },
): Excitability | null {
  const e = input.electrode;
  const area = electrodeArea(e);
  const depth = e.fatThicknessCm + e.axonDepthCm;
  if (!(area > 0) || !(depth > 0)) return null;
  const radius = equivalentRadius(area);
  const c = input.calibration;
  let g = 1;
  if (input.effectModel === 'HALF_SPACE_AF') {
    if (c) {
      const refRadius = c.electrodeAreaCm2 ? equivalentRadius(c.electrodeAreaCm2) : radius;
      g = sizeFactor(radius, depth, refRadius, depth);
    } else {
      const ref = defaultElectrode(muscle);
      g = sizeFactor(radius, depth, equivalentRadius(electrodeArea(ref)), ref.fatThicknessCm + ref.axonDepthCm);
    }
  }
  if (!c) return { g, rheobaseMin: base.rheobaseMin, rheobaseSpread: base.rheobaseSpread, unit: 'MODEL_UNIT' };
  if (!(c.motorThresholdMa > 0) || !(c.pulseWidthUs > 0)) return null;
  const rheobaseMin = c.motorThresholdMa / (1 + base.tauSdMs / (c.pulseWidthUs / 1000));
  const full = c.fullRecruitmentMa;
  const rheobaseSpread = full !== null && full !== undefined && full > c.motorThresholdMa ? full / c.motorThresholdMa : base.rheobaseSpread;
  return { g, rheobaseMin, rheobaseSpread, unit: 'MA' };
}

// ---- sources (shown with the evidence badges of ui/evidence.ts) ----

export type Evidence = 'FULL_TEXT' | 'ABSTRACT';
export type Provenance = 'MEASURED' | 'INHERITED' | 'ILLUSTRATIVE' | 'DERIVED';

export interface SourcedValue {
  /** Short citation shown in the badge. */
  citation: string;
  doi: string | null;
  evidence: Evidence | null;
  provenance: Provenance;
  note: Localized;
}

export interface FatOption extends SourcedValue {
  valueCm: number;
}

const L = (pt: string, en: string): Localized => ({ 'pt-BR': pt, en });

const PETROFSKY_LEG: FatOption = {
  valueCm: LEG_FAT_CM,
  citation: 'Petrofsky 2008',
  doi: '10.1016/j.medengphy.2007.12.007',
  evidence: 'ABSTRACT',
  provenance: 'MEASURED',
  note: L('ultrassom, quadríceps e gastrocnêmio lateral, 0,75 ± 0,13 cm, n = 25', 'ultrasound, quadriceps and lateral gastrocnemius, 0.75 ± 0.13 cm, n = 25'),
};
const PETROFSKY_LEG_INHERITED: FatOption = {
  ...PETROFSKY_LEG,
  provenance: 'INHERITED',
  note: L('herdado do gastrocnêmio (sem valor verificado para este músculo)', 'inherited from the gastrocnemius (no verified value for this muscle)'),
};
const PETROFSKY_BICEPS: FatOption = {
  valueCm: ECR_FAT_CM,
  citation: 'Petrofsky 2008',
  doi: '10.1016/j.medengphy.2007.12.007',
  evidence: 'ABSTRACT',
  provenance: 'INHERITED',
  note: L('bíceps (braço), 0,48 ± 0,16 cm: herdado, sem valor verificado no antebraço posterior', 'biceps (upper arm), 0.48 ± 0.16 cm: inherited, no verified posterior-forearm value'),
};
const DOGAN: FatOption = {
  valueCm: FCR_FAT_CM,
  citation: 'Doğan 2022',
  doi: '10.1007/s11657-022-01109-6',
  evidence: 'FULL_TEXT',
  provenance: 'MEASURED',
  note: L(
    'antebraço anterior, 1/3 proximal (FCR); só gordura, 5,6 ± 2,8 mm; ultrassom sem compressão; controles, n = 78, IMC 26,8',
    'anterior forearm, proximal 1/3 (FCR); fat only, 5.6 ± 2.8 mm; ultrasound without compression; controls, n = 78, BMI 26.8',
  ),
};
const CHATLAONG_F: FatOption = {
  valueCm: 0.7,
  citation: 'Chatlaong 2026 (F)',
  doi: '10.1016/j.mvr.2025.104865',
  evidence: 'FULL_TEXT',
  provenance: 'MEASURED',
  note: L('flexores do antebraço; pele + gordura, 0,70 ± 0,23 cm; mulheres, n = 23', 'forearm flexors; skin + fat, 0.70 ± 0.23 cm; women, n = 23'),
};
const CHATLAONG_M: FatOption = {
  valueCm: 0.51,
  citation: 'Chatlaong 2026 (M)',
  doi: '10.1016/j.mvr.2025.104865',
  evidence: 'FULL_TEXT',
  provenance: 'MEASURED',
  note: L('flexores do antebraço; pele + gordura, 0,51 ± 0,18 cm; homens, n = 22', 'forearm flexors; skin + fat, 0.51 ± 0.18 cm; men, n = 22'),
};
const ARUNA_M: FatOption = {
  valueCm: 0.48,
  citation: 'Aruna 2023 (M)',
  doi: '10.4103/jmu.jmu_28_22',
  evidence: 'FULL_TEXT',
  provenance: 'MEASURED',
  note: L(
    'antebraço lateral, 30 % entre estiloide e cabeça do rádio; 4,8 ± 0,40 mm; homens jovens; DP pequenos demais (cautela)',
    'lateral forearm, 30 % between radial styloid and head; 4.8 ± 0.40 mm; young men; implausibly small SDs (caution)',
  ),
};
const ARUNA_F: FatOption = {
  ...ARUNA_M,
  valueCm: 0.54,
  citation: 'Aruna 2023 (F)',
  note: L(
    'antebraço lateral, 30 % entre estiloide e cabeça do rádio; 5,4 ± 0,26 mm; mulheres jovens; DP pequenos demais (cautela)',
    'lateral forearm, 30 % between radial styloid and head; 5.4 ± 0.26 mm; young women; implausibly small SDs (caution)',
  ),
};

/** Measured fat thicknesses to choose from, per muscle; the first is the default (one option per article). */
export const FAT_OPTIONS: Readonly<Record<MuscleId, readonly FatOption[]>> = {
  FLEXOR_CARPI_RADIALIS: [DOGAN, CHATLAONG_F, CHATLAONG_M, PETROFSKY_BICEPS],
  EXTENSOR_CARPI_RADIALIS: [PETROFSKY_BICEPS, ARUNA_M, ARUNA_F, { ...DOGAN, provenance: 'INHERITED', note: L('antebraço anterior (FCR), outro lado do antebraço', 'anterior forearm (FCR), the other side of the forearm') }],
  GASTROCNEMIUS_MEDIAL: [PETROFSKY_LEG],
  GASTROCNEMIUS_LATERAL: [PETROFSKY_LEG],
  SOLEUS: [PETROFSKY_LEG_INHERITED],
  TIBIALIS_ANTERIOR: [PETROFSKY_LEG_INHERITED],
};

export const fatOptions = (muscle: string): readonly FatOption[] => FAT_OPTIONS[muscle as MuscleId] ?? FAT_OPTIONS.SOLEUS;

/** Source of the default electrode size of each muscle. */
export const SIZE_SOURCES: Readonly<Record<MuscleId, SourcedValue>> = (() => {
  const baier: SourcedValue = {
    citation: 'Baier 2024',
    doi: '10.3389/fbioe.2024.1384617',
    evidence: 'FULL_TEXT',
    provenance: 'MEASURED',
    note: L('eletrodo ativo redondo de 25 mm sobre FCR e ECRB (gêmeo digital do antebraço)', 'round 25 mm active electrode over FCR and ECRB (forearm digital twin)'),
  };
  const lyons: SourcedValue = {
    citation: 'Lyons 2004',
    doi: '10.1016/j.medengphy.2004.08.003',
    evidence: 'ABSTRACT',
    provenance: 'MEASURED',
    note: L('redondo de 19,63 cm² (Ø 5 cm): o mais confortável no gastrocnêmio', 'round 19.63 cm² (Ø 5 cm): the most comfortable on the gastrocnemius'),
  };
  const flodin: SourcedValue = {
    citation: 'Flodin 2022',
    doi: '10.1186/s13102-022-00403-7',
    evidence: 'FULL_TEXT',
    provenance: 'INHERITED',
    note: L('5 × 5 cm no quadríceps: herdado, sem estudo verificado para este músculo', '5 × 5 cm on the quadriceps: inherited, no verified study for this muscle'),
  };
  return {
    FLEXOR_CARPI_RADIALIS: baier,
    EXTENSOR_CARPI_RADIALIS: baier,
    GASTROCNEMIUS_MEDIAL: lyons,
    GASTROCNEMIUS_LATERAL: lyons,
    SOLEUS: flodin,
    TIBIALIS_ANTERIOR: flodin,
  };
})();

export const AXON_DEPTH_SOURCE: SourcedValue = {
  citation: 'Kuhn 2010',
  doi: '10.1109/TNSRE.2009.2039807',
  evidence: 'ABSTRACT',
  provenance: 'ILLUSTRATIVE',
  note: L('ilustrativo: 0,5 cm escolhido dentro da faixa 0,1–1,1 cm do modelo de antebraço de Kuhn', "illustrative: 0.5 cm chosen inside the 0.1–1.1 cm range of Kuhn's forearm model"),
};

export interface EffectOption {
  value: EffectModel;
  label: Localized;
  sources: readonly SourcedValue[];
  note: Localized;
}

export const EFFECT_OPTIONS: readonly EffectOption[] = [
  {
    value: 'HALF_SPACE_AF',
    label: L('Fórmula derivada (função de ativação)', 'Derived formula (activating function)'),
    sources: [
      { citation: 'Doheny 2010', doi: '10.1016/j.medengphy.2010.03.004', evidence: 'ABSTRACT', provenance: 'DERIVED', note: L('direção: limiar sobe com tamanho e gordura', 'direction: threshold rises with size and fat') },
      { citation: 'Alon 1994', doi: '10.2519/jospt.1994.20.1.29', evidence: 'ABSTRACT', provenance: 'DERIVED', note: L('direção: eletrodo maior, mais corrente', 'direction: larger electrode, more current') },
    ],
    note: L(
      'modelo derivado, magnitude ilustrativa, não validada: disco de corrente uniforme num meio semi-infinito homogêneo; exagera o efeito do tamanho para alvos rasos (teste V5, falha esperada).',
      'derived model, illustrative magnitude, not validated: a uniform-current disk on a homogeneous half-space; it overstates the size effect for shallow targets (test V5, expected failure).',
    ),
  },
  {
    value: 'NONE',
    label: L('Sem efeito — Lieber & Kelly 1991', 'No effect — Lieber & Kelly 1991'),
    sources: [
      { citation: 'Lieber & Kelly 1991', doi: '10.1093/ptj/71.10.715', evidence: 'ABSTRACT', provenance: 'MEASURED', note: L('o tamanho do eletrodo não determina o torque (n = 40, quadríceps)', 'electrode size does not determine torque (n = 40, quadriceps)') },
    ],
    note: L('G = 1: o tamanho, a gordura e a profundidade ficam registrados e desenhados, mas não mudam o limiar.', 'G = 1: size, fat and depth are recorded and drawn but do not change the threshold.'),
  },
];

/** Verified zero effect: the stimulator is current-controlled. */
export const MATERIAL_SOURCES: readonly SourcedValue[] = [
  { citation: 'Farmer 2021', doi: '10.3389/fnhum.2020.568051', evidence: 'FULL_TEXT', provenance: 'MEASURED', note: L('corrente controlada: a corrente no tecido não depende da interface eletrodo–pele', 'current control: the current in the tissue does not depend on the electrode–skin boundary') },
  { citation: 'Jafari 2025', doi: '10.1038/s41598-025-91452-8', evidence: 'FULL_TEXT', provenance: 'MEASURED', note: L('têxtil = hidrogel: corrente mínima 23 vs 24 mA, p = 0,500', 'textile = hydrogel: minimum current 23 vs 24 mA, p = 0.500') },
];

export interface NotModelled {
  label: Localized;
  sources: readonly string[];
}

export const NOT_MODELLED: readonly NotModelled[] = [
  { label: L('posição em relação ao ponto motor', 'position relative to the motor point'), sources: ['Gobbo 2011', 'Botter 2011'] },
  { label: L('distância entre eletrodos', 'inter-electrode distance'), sources: ['Vieira 2016', 'Doheny 2010'] },
  { label: L('configuração monopolar / bipolar', 'monopolar / bipolar configuration'), sources: ['Gobbo 2014'] },
  { label: L('forma (sem dado verificado; entra só pela área)', 'shape (no verified data; enters only through the area)'), sources: [] },
];
