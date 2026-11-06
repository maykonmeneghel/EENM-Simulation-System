"""Where every value of a muscle preset comes from, and the twitch calibration of the wrist muscles.

The leg presets are the original model's table (``createUMs.m``). The wrist presets (FCR, ECR) use the few verified
human values that exist (``docs/research/wrist-muscles-literature.md``) and inherit the rest from the soleus preset,
the model's default muscle; each field says which, so the interface can mark it. Nothing here is fitted except the
FCR twitch (``validation/calibrate.py fcr``) and the ECR time scale, which is computed (``ECR_SINGLE_UNIT_SCALE``).
Titles and DOIs checked against Crossref / PubMed on 2026-11-05.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum

from eenm_engine.domain.conditions import Evidence, Source
from eenm_engine.domain.model_options import CalibrationTarget, ModelOptions, StimulationSite
from eenm_engine.domain.motor_unit_pool import Muscle
from eenm_engine.domain.twitch import TwitchShape


class Provenance(Enum):
    MEASURED = "MEASURED"
    """Read in a human study of this muscle."""
    FITTED = "FITTED"
    """Fitted or computed so the model reproduces a measured value of this muscle."""
    INHERITED = "INHERITED"
    """No verified data for this muscle: the soleus preset's value."""


@dataclass(frozen=True)
class FieldSource:
    field: str
    """What the value is (pt-BR)."""
    provenance: Provenance
    value: str
    """The value used, and any assumption behind it (pt-BR)."""
    source: Source | None = None
    evidence: Evidence | None = None
    target: CalibrationTarget | None = None
    """Only for this calibration target (``None``: always)."""


_MIZUNO = Source(
    "Mizuno et al. 1994",
    "31P-NMR spectroscopy, rsEMG, and histochemical fiber types of human wrist flexor muscles",
    doi="10.1152/jappl.1994.76.2.531",
)
_BEHRENS = Source(
    "Behrens et al. 2019",
    "Neuromuscular Properties of the Human Wrist Flexors as a Function of the Wrist Joint Angle",
    doi="10.3389/fbioe.2019.00181",
)
_AIMONETTI = Source(
    "Aimonetti et al. 2000",
    "Distribution of presynaptic inhibition on type-identified motoneurones in the extensor carpi radialis pool in man",
    doi="10.1111/j.1469-7793.2000.t01-1-00125.xm",
)

_INHERITED_ALWAYS = (
    FieldSource(
        "Número de unidades motoras",
        Provenance.INHERITED,
        "900, o total do sóleo: não há estimativa do número de unidades (MUNE) deste músculo em humanos.",
    ),
    FieldSource(
        "Motoneurônio, MUAP, condução e amplitude dos abalos",
        Provenance.INHERITED,
        "Faixas por tipo (S, FR, FF) da tabela do modelo original, as mesmas do sóleo.",
    ),
    FieldSource(
        "Fadigabilidade",
        Provenance.INHERITED,
        "Mapeamento de Potvin & Fuglevand 2017 sobre as forças do pool; não há índice de fadiga deste músculo "
        "medido em pessoas saudáveis.",
    ),
)

PROFILES: dict[Muscle, tuple[FieldSource, ...]] = {
    Muscle.FLEXOR_CARPI_RADIALIS: (
        FieldSource(
            "Composição S / FR / FF",
            Provenance.MEASURED,
            "368 / 267 / 265 unidades: fibras lentas 40,9 ± 17,4 %, IIA 29,7 % e “fast-b” 29,4 % (n = 7), "
            "com a fração de fibras usada como fração de unidades (suposição: unidades rápidas têm mais fibras).",
            _MIZUNO,
            Evidence.FULL_TEXT,
        ),
        FieldSource(
            "Tempo do abalo",
            Provenance.FITTED,
            "Abalo do músculo inteiro ajustado a contração 67,3 ms e meia-relaxação 57,6 ms (punho neutro, "
            "estímulo único no nervo mediano, n = 18; flexores do punho em conjunto, não só o FCR).",
            _BEHRENS,
            Evidence.FULL_TEXT,
            CalibrationTarget.WHOLE_MUSCLE,
        ),
        FieldSource(
            "Tempo do abalo",
            Provenance.INHERITED,
            "Não há abalo de unidade isolada do FCR em humanos: ajuste do sóleo às unidades de Macefield 1996.",
            target=CalibrationTarget.SINGLE_UNIT,
        ),
        *_INHERITED_ALWAYS,
    ),
    Muscle.EXTENSOR_CARPI_RADIALIS: (
        FieldSource(
            "Composição S / FR / FF",
            Provenance.INHERITED,
            "800 / 50 / 50, a do sóleo: não há composição de fibras do ECR adulto verificada.",
        ),
        FieldSource(
            "Tempo de contração das unidades",
            Provenance.FITTED,
            "Escala de tempo calculada para a média das unidades simuladas ser 51,0 ms (25 unidades, 19,5–89,3 ms, "
            "7 homens; unidades registradas em força baixa, o que favorece as lentas).",
            _AIMONETTI,
            Evidence.FULL_TEXT,
            CalibrationTarget.SINGLE_UNIT,
        ),
        FieldSource(
            "Meia-relaxação das unidades",
            Provenance.INHERITED,
            "Razão meia-relaxação / contração do ajuste do sóleo às unidades de Macefield 1996 (não há dado do ECR).",
            target=CalibrationTarget.SINGLE_UNIT,
        ),
        FieldSource(
            "Tempo do abalo",
            Provenance.INHERITED,
            "Não há abalo do músculo inteiro do ECR verificado: ajuste do sóleo ao tríceps sural.",
            target=CalibrationTarget.WHOLE_MUSCLE,
        ),
        *_INHERITED_ALWAYS,
    ),
}


def profile(muscle: Muscle, target: CalibrationTarget | None = None) -> tuple[FieldSource, ...]:
    """The preset's field sources (none for the leg presets), restricted to ``target`` when given."""
    return tuple(f for f in PROFILES.get(muscle, ()) if target is None or f.target in (None, target))


ECR_SINGLE_UNIT_SCALE = 0.50605
"""Twitch time scale giving a mean contraction time of 51.0 ms (Aimonetti 2000) over the 120 simulated ECR units,
each weighted by the pool units it represents (``tests/unit/test_muscle_profiles.py``)."""

FCR_WHOLE_MUSCLE: dict[StimulationSite, tuple[float, float]] = {
    # (twitch_time_scale, exponent) fitted by ``validation/calibrate.py <pipeline> whole-muscle fcr`` to Behrens 2019
    # (CT 67.31, HRT 57.63 ms; both achieved): pipeline ``axons`` and ``pool120``, results/calibration-*-fcr.json
    StimulationSite.MOTOR_AXONS: (0.9524, 3.6741),
    StimulationSite.MOTONEURON_SOMA: (0.9524, 3.6733),
}


def literature_options(
    muscle: Muscle,
    target: CalibrationTarget = CalibrationTarget.WHOLE_MUSCLE,
    site: StimulationSite = StimulationSite.MOTOR_AXONS,
) -> ModelOptions:
    """``ModelOptions.literature`` with the muscle's own twitch calibration where one exists."""
    options = ModelOptions.literature(target, site)
    if muscle is Muscle.FLEXOR_CARPI_RADIALIS and target is CalibrationTarget.WHOLE_MUSCLE:
        scale, exponent = FCR_WHOLE_MUSCLE[site]
        return replace(options, twitch_time_scale=scale, twitch_shape=TwitchShape(exponent=exponent))
    if muscle is Muscle.EXTENSOR_CARPI_RADIALIS and target is CalibrationTarget.SINGLE_UNIT:
        return replace(options, twitch_time_scale=ECR_SINGLE_UNIT_SCALE)  # exponent: the soleus single-unit fit
    return options
