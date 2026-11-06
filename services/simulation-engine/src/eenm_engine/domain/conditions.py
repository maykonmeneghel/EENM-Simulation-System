"""Clinical conditions as switchable, per-article adjustments of the corrected (LITERATURE) model.

Each adjustment changes one model parameter by a value read in one paper (``docs/research/disease-literature.md``);
overlapping or conflicting findings are separate adjustments, so the user chooses. Every adjustment records how
the value was read (full text or abstract only) and where it was measured (muscle, population), since most data
are not from the soleus. Nothing here is fitted except ``SCI_FATIGABILITY``, whose shift is fitted to a measured
fatigue index (``validation/conditions.py``). Titles and DOIs checked against Crossref / PubMed on 2026-11-05.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from enum import Enum

from eenm_engine.domain.fatigue import FatigueModel
from eenm_engine.domain.model_options import ModelOptions
from eenm_engine.domain.twitch import TwitchShape


class Condition(Enum):
    NORMAL = "NORMAL"
    PARKINSON = "PARKINSON"
    SCI_CHRONIC = "SCI_CHRONIC"
    """Chronic (> 1–2 years), motor-complete spinal cord injury: the population that uses FES."""


class Evidence(Enum):
    FULL_TEXT = "FULL_TEXT"
    ABSTRACT = "ABSTRACT"


@dataclass(frozen=True)
class Source:
    citation: str
    title: str
    doi: str | None = None
    pmid: str | None = None


@dataclass(frozen=True)
class Adjustment:
    id: str
    condition: Condition
    label: str
    """Short name (pt-BR)."""
    effect: str
    """What it changes in the model, with the value (pt-BR)."""
    finding: str
    """What the paper measured (pt-BR)."""
    source: Source
    evidence: Evidence
    measured_in: str
    """Muscle and population of the measurement (pt-BR); "sóleo" means it matches the default muscle."""
    default: bool
    available: bool
    apply: Callable[[ModelOptions], ModelOptions]


SCI_FAST_SHIFT = 0.997
"""``FatigueModel.fast_shift`` that gives the chronic-SCI soleus fatigue index 0.19
(``condition-sci-fatigability.json``: 0.192 achieved; 0.916 for the unmodified model in the same protocol)."""


def _fast_twitch(options: ModelOptions) -> ModelOptions:
    """Scott 2006: contraction 14 % and relaxation 38 % faster → CT × 0.86, HRT × 0.62 (HRT/CT × 0.62 / 0.86)."""
    ratio = options.twitch_shape.half_relaxation_ratio() * (0.62 / 0.86)
    return replace(
        options,
        twitch_time_scale=options.twitch_time_scale * 0.86,
        twitch_shape=TwitchShape.from_half_relaxation_ratio(ratio),
    )


def _scale_force(factor: float) -> Callable[[ModelOptions], ModelOptions]:
    return lambda o: replace(o, force_scale=o.force_scale * factor)


def _fatigability(options: ModelOptions) -> ModelOptions:
    base = options.fatigue or FatigueModel()
    return replace(options, fatigue=replace(base, fast_shift=SCI_FAST_SHIFT))


def _chronaxie(options: ModelOptions) -> ModelOptions:
    # τ only: the rheobases stay as they are (the abstract reports higher thresholds but gives no value)
    current = options.axon_excitability
    return replace(options, axon_excitability=replace(current, chronaxie_ms=0.13))


def _not_available(options: ModelOptions) -> ModelOptions:
    raise ValueError("this adjustment needs the central layer (not implemented)")


ADJUSTMENTS: tuple[Adjustment, ...] = (
    Adjustment(
        id="SCI_FATIGABILITY",
        condition=Condition.SCI_CHRONIC,
        label="Fadigabilidade lenta → rápida",
        effect="Fadigabilidade de cada unidade deslocada 99,7 % em direção à da unidade mais rápida (força das fibras "
        "mantida); ajustada para reproduzir o índice de fadiga 0,19.",
        finding="Índice de fadiga do sóleo 0,19 ± 0,06 na lesão crônica contra 0,89 ± 0,08 na aguda (20 Hz, 330 ms a "
        "cada 1 s, 120 trens).",
        source=Source(
            "Chang & Shields 2011",
            "Doublet electrical stimulation enhances torque production in people with spinal cord injury",
            doi="10.1177/1545968310390224",
        ),
        evidence=Evidence.FULL_TEXT,
        measured_in="sóleo; lesão completa (ASIA A) há ≥ 3 anos, n = 11",
        default=True,
        available=True,
        apply=_fatigability,
    ),
    Adjustment(
        id="SCI_FAST_TWITCH",
        condition=Condition.SCI_CHRONIC,
        label="Abalo mais rápido",
        effect="Tempo de contração × 0,86 e meia-relaxação × 0,62.",
        finding="Quadríceps paralisado contraiu 14 % e relaxou 38 % mais rápido que o de controles.",
        source=Source(
            "Scott et al. 2006",
            "Contractile properties and the force-frequency relationship of the paralyzed human quadriceps "
            "femoris muscle",
            pmid="16737404",
        ),
        evidence=Evidence.ABSTRACT,
        measured_in="quadríceps (outro músculo); lesão motora completa, 11–24 anos, n = 13",
        default=False,
        available=True,
        apply=_fast_twitch,
    ),
    Adjustment(
        id="SCI_ATROPHY",
        condition=Condition.SCI_CHRONIC,
        label="Atrofia",
        effect="Força do músculo × 0,56 (1,36 / 2,44 kg).",
        finding="Massa muscular da coxa 1,36 ± 0,77 kg contra 2,44 ± 0,47 kg em controles (RM).",
        source=Source(
            "Modlesky et al. 2004",
            "Assessment of skeletal muscle mass in men with spinal cord injury using dual-energy X-ray "
            "absorptiometry and magnetic resonance imaging",
            doi="10.1152/japplphysiol.00207.2003",
        ),
        evidence=Evidence.ABSTRACT,
        measured_in="coxa (outro músculo); lesão completa há > 2 anos, n = 8",
        default=False,
        available=True,
        apply=_scale_force(1.36 / 2.44),
    ),
    Adjustment(
        id="SCI_CHRONAXIE",
        condition=Condition.SCI_CHRONIC,
        label="Constante intensidade–duração menor",
        effect="τ de Weiss 0,459 → 0,13 ms (reobases mantidas). Cuidado: sozinho, isso BAIXA o limiar dos pulsos "
        "curtos, enquanto o artigo relata limiares mais altos (sem valor no resumo).",
        finding="τSD 0,13 ± 0,02 ms na lesão contra 0,43 ± 0,02 ms em controles (média ± EP).",
        source=Source(
            "Lin et al. 2007",
            "Axonal changes in spinal cord injured patients distal to the site of injury",
            doi="10.1093/brain/awl339",
        ),
        evidence=Evidence.ABSTRACT,
        measured_in="nervos mediano e fibular comum (o resumo não diz de qual vem o τ); n = 15",
        default=False,
        available=True,
        apply=_chronaxie,
    ),
    Adjustment(
        id="PD_MOTOR_UNIT_LOSS",
        condition=Condition.PARKINSON,
        label="Perda leve de unidades motoras",
        effect="Força do músculo × 0,845 (109 / 129); a reinervação que pode compensar não é modelada.",
        finding="MUNIX hipotenar 109 ± 39,1 contra 129 ± 45,1 em controles.",
        source=Source(
            "Krenovsky et al. 2020",
            "Interrelation between sarcopenia and the number of motor neurons in patients with parkinsonian syndromes",
            doi="10.1159/000505590",
        ),
        evidence=Evidence.ABSTRACT,
        measured_in="hipotenar (mão, outro músculo); grupo inclui parkinsonismo atípico, n = 74",
        default=True,
        available=True,
        apply=_scale_force(109 / 129),
    ),
    Adjustment(
        id="PD_NEUROPATHY",
        condition=Condition.PARKINSON,
        label="Polineuropatia",
        effect="Força do músculo × 0,49 (CMAP 5,35 / 10,90 mV), lida como perda de axônios motores excitáveis.",
        finding="CMAP tibial 5,35 ± 3,79 mV com polineuropatia contra 10,90 ± 3,35 mV sem (pacientes com Parkinson).",
        source=Source(
            "Kwon et al. 2024",
            "Longitudinal evaluation of polyneuropathy in Parkinson's disease",
            doi="10.1007/s00415-024-12579-8",
        ),
        evidence=Evidence.FULL_TEXT,
        measured_in="nervo tibial (perna); só quem tem polineuropatia (66 % da coorte), n = 41",
        default=False,
        available=True,
        apply=_scale_force(5.35 / 10.90),
    ),
    Adjustment(
        id="PD_TREMOR",
        condition=Condition.PARKINSON,
        label="Tremor de repouso 4–6 Hz",
        effect="Requer a camada central (drive descendente oscilatório nos motoneurônios); ainda não implementado.",
        finding="Frequência típica do tremor de repouso 4–6 Hz (revisão).",
        source=Source(
            "Zach et al. 2015",
            "The clinical evaluation of Parkinson's tremor",
            doi="10.3233/JPD-150650",
        ),
        evidence=Evidence.FULL_TEXT,
        measured_in="revisão; sem amplitude em força",
        default=False,
        available=False,
        apply=_not_available,
    ),
)

BY_ID: dict[str, Adjustment] = {a.id: a for a in ADJUSTMENTS}


def defaults(condition: Condition) -> tuple[str, ...]:
    return tuple(a.id for a in ADJUSTMENTS if a.condition is condition and a.default and a.available)


def apply_condition(
    options: ModelOptions, condition: Condition, adjustment_ids: tuple[str, ...] | None
) -> ModelOptions:
    """``options`` with the chosen adjustments of ``condition`` (its defaults when ``adjustment_ids`` is None)."""
    ids = defaults(condition) if adjustment_ids is None else adjustment_ids
    for adjustment_id in ids:
        adjustment = BY_ID.get(adjustment_id)
        if adjustment is None or adjustment.condition is not condition:
            raise ValueError(f"adjustment {adjustment_id} does not belong to {condition.value}")
        if not adjustment.available:
            raise ValueError(f"adjustment {adjustment_id} is not available yet")
        options = adjustment.apply(options)
    return options
