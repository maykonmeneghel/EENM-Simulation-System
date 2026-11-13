"""Surface electrode characteristics and their effect on axon recruitment (``docs/design/electrode.md``).

Every effect is one muscle-level factor ``G`` on the Weiss threshold of every axon (design §2):

    A ≥ G · I_rh,k · (1 + τ_SD / PW)

``G`` shifts the whole recruitment curve along the amplitude axis; it changes neither its shape nor the order of
recruitment (design decisions 5 and 7). Sources and read levels are in ``docs/research/electrode-literature.md``.

* **Size effect, one option per article** (design decision 4; the author chose the derived option as the default on
  2026-11-12):

  - ``HALF_SPACE_AF`` (default): the activating function (Rattay; as stated in Baier et al. 2024, full text) of a
    uniform-current disk on a homogeneous half-space, over an axon parallel to the skin at depth ``d = f + h``. With a
    fixed AF threshold the threshold current scales as 1 / (peak AF along the axon), so
    ``G = AF_peak(a_ref, d_ref) / AF_peak(a, d)``. **Derived here; magnitude illustrative, not validated.** It gets
    the verified directions right (larger area or thicker fat → higher threshold; Alon 1994, Doheny 2010, Flodin 2022,
    abstracts / full text) but overstates the size effect at shallow depth: it does not reproduce the lower current
    density at threshold of larger electrodes (Flodin 2022, full text; validation V5, an ``xfail`` test).
  - ``NONE``: electrode size is not a main determinant of the response (Lieber & Kelly 1991, abstract): ``G = 1``.

* **Shape** enters only through the area: a rectangle becomes the disk of equal area (assumption; shape data: none
  verified).
* **Material and skin impedance: verified zero effect.** The stimulator is current-controlled, so the current in the
  tissue does not depend on the electrode–skin boundary within the compliance voltage (Farmer et al. 2021, full text;
  textile = hydrogel, Jafari et al. 2025, full text). Nothing to compute.
* **mA calibration** (design §2.2, optional): from the user's measured motor threshold ``I_MT`` (and full-recruitment
  current ``I_full``) at pulse width ``PW_c`` with an electrode of area ``S_c``, ``I_rh,min = I_MT / (1 + τ_SD/PW_c)``,
  ``R = I_full / I_MT`` (else the inherited range) and ``G = AF_peak(S_c) / AF_peak(S)`` at the run's depth. The
  amplitude is then in mA.
* **Not modelled** (listed in the interface with sources): position relative to the motor point, inter-electrode
  distance, monopolar / bipolar configuration.

Per-muscle defaults (design §4) are where ``G = 1``, so a default run is numerically unchanged.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from enum import StrEnum

import numpy as np

from eenm_engine.domain.axon_stimulation import AxonExcitability
from eenm_engine.domain.motor_unit_pool import Muscle


class ElectrodeShape(StrEnum):
    RECTANGLE = "RECTANGLE"
    ROUND = "ROUND"


class SizeEffect(StrEnum):
    """How electrode size, fat and axon depth change the threshold (one option per source)."""

    HALF_SPACE_AF = "HALF_SPACE_AF"
    """Derived: activating function of a disk on a homogeneous half-space (magnitude illustrative, not validated)."""
    NONE = "NONE"
    """No effect of electrode size (Lieber & Kelly 1991, abstract): G = 1."""


DEFAULT_SIZE_EFFECT = SizeEffect.HALF_SPACE_AF
"""The author's choice on 2026-11-12 (design decision 4)."""


@dataclass(frozen=True)
class Electrode:
    """The active electrode over the muscle and the tissue under it, in cm."""

    shape: ElectrodeShape
    width_cm: float | None = None
    """RECTANGLE only."""
    length_cm: float | None = None
    """RECTANGLE only."""
    diameter_cm: float | None = None
    """ROUND only."""
    fat_thickness_cm: float = 0.75
    """Subcutaneous fat over the muscle (with the skin where the source measured them together)."""
    axon_depth_cm: float = 0.5
    """Depth of the motor axons below the fat (illustrative; Kuhn et al. 2010 used 0.1–1.1 cm)."""

    def __post_init__(self) -> None:
        if self.shape is ElectrodeShape.ROUND:
            if self.diameter_cm is None or self.diameter_cm <= 0:
                raise ValueError("a ROUND electrode needs a positive diameter_cm")
        elif self.width_cm is None or self.length_cm is None or self.width_cm <= 0 or self.length_cm <= 0:
            raise ValueError("a RECTANGLE electrode needs a positive width_cm and length_cm")
        if self.fat_thickness_cm < 0 or self.axon_depth_cm <= 0:
            raise ValueError("fat thickness must be >= 0 and axon depth > 0")

    @property
    def area_cm2(self) -> float:
        if self.shape is ElectrodeShape.ROUND:
            assert self.diameter_cm is not None
            return math.pi * self.diameter_cm**2 / 4
        assert self.width_cm is not None and self.length_cm is not None
        return self.width_cm * self.length_cm

    @property
    def radius_cm(self) -> float:
        """Radius of the disk of equal area (the shape enters only through the area)."""
        return math.sqrt(self.area_cm2 / math.pi)

    @property
    def depth_cm(self) -> float:
        """Skin surface to axon: ``d = f + h``."""
        return self.fat_thickness_cm + self.axon_depth_cm


@dataclass(frozen=True)
class Calibration:
    """The user's own measurement, which puts the amplitude in mA (design §2.2)."""

    motor_threshold_ma: float
    pulse_width_us: float
    full_recruitment_ma: float | None = None
    """``None``: keep the inherited rheobase range."""
    electrode_area_cm2: float | None = None
    """Area of the electrode the measurement was made with; ``None`` = the run's electrode."""

    def __post_init__(self) -> None:
        if self.motor_threshold_ma <= 0 or self.pulse_width_us <= 0:
            raise ValueError("motor threshold and pulse width must be positive")
        if self.full_recruitment_ma is not None and self.full_recruitment_ma <= self.motor_threshold_ma:
            raise ValueError("full recruitment current must exceed the motor threshold")
        if self.electrode_area_cm2 is not None and self.electrode_area_cm2 <= 0:
            raise ValueError("calibration electrode area must be positive")


FCR_FAT_CM = 0.56
"""Subcutaneous fat over the anterior forearm, 1/3 proximal between the wrist line and the antecubital fossa (the FCR
site): 5.6 ± 2.8 mm, B-mode ultrasound without compression, control group n = 78 (Doğan et al. 2022, full text,
Table 2). Fat only: the skin (1.5 ± 0.2 mm) was measured separately and is not added here."""
ECR_FAT_CM = 0.48
"""No verified posterior-forearm value (``docs/research/electrode-literature.md`` §4b): the biceps value of Petrofsky et
al. 2008 (0.48 ± 0.16 cm, ultrasound, abstract), INHERITED."""
LEG_FAT_CM = 0.75
"""Petrofsky et al. 2008 (abstract): 0.75 ± 0.13 cm over the quadriceps and the lateral gastrocnemius (ultrasound)."""
AXON_DEPTH_CM = 0.5
"""Illustrative, inside the 0.1–1.1 cm nerve-depth range of Kuhn et al. 2010's forearm model (abstract)."""

DEFAULT_ELECTRODES: dict[Muscle, Electrode] = {
    # Baier et al. 2024 (full text): round 25 mm active electrode over FCR and ECRB (the 3D view's pad)
    Muscle.FLEXOR_CARPI_RADIALIS: Electrode(ElectrodeShape.ROUND, diameter_cm=2.5, fat_thickness_cm=FCR_FAT_CM),
    Muscle.EXTENSOR_CARPI_RADIALIS: Electrode(ElectrodeShape.ROUND, diameter_cm=2.5, fat_thickness_cm=ECR_FAT_CM),
    # Lyons et al. 2004 (abstract): round 19.63 cm² (Ø 5 cm) was the most comfortable on the gastrocnemius
    Muscle.GASTROCNEMIUS_MEDIAL: Electrode(ElectrodeShape.ROUND, diameter_cm=5.0, fat_thickness_cm=LEG_FAT_CM),
    Muscle.GASTROCNEMIUS_LATERAL: Electrode(ElectrodeShape.ROUND, diameter_cm=5.0, fat_thickness_cm=LEG_FAT_CM),
    # Flodin et al. 2022 (full text, quadriceps): 5 × 5 cm, INHERITED; fat inherited from the gastrocnemius
    Muscle.SOLEUS: Electrode(ElectrodeShape.RECTANGLE, width_cm=5.0, length_cm=5.0, fat_thickness_cm=LEG_FAT_CM),
    Muscle.TIBIALIS_ANTERIOR: Electrode(
        ElectrodeShape.RECTANGLE, width_cm=5.0, length_cm=5.0, fat_thickness_cm=LEG_FAT_CM
    ),
}

_QUADRATURE_NODES = 4000
_PEAK_GRID = 200
_GOLDEN = (math.sqrt(5) - 1) / 2


def depolarisation(x_cm: float, radius_cm: float, depth_cm: float) -> float:
    """−AF(x) per unit current and ρ/(2π): the depolarising drive of a cathodic uniform-current disk of radius ``a`` on
    an insulated half-space, at ``x`` along an axon parallel to the skin at depth ``d`` (x = 0 under the centre),
    in cm⁻³.

    The x' integral of ∂²/∂x² (1/R) is done in closed form, ``[(x − x')/R³]`` at the chord ends ``±c(y)``; the y
    integral by the midpoint rule in θ (y = a sin θ), whose integrand is smooth and periodic, so it converges fast.
    """
    a, d = radius_cm, depth_cm
    theta = (np.arange(_QUADRATURE_NODES) + 0.5) * (math.pi / 2) / _QUADRATURE_NODES
    y, c = a * np.sin(theta), a * np.cos(theta)
    yd = y * y + d * d
    near, far = x_cm - c, x_cm + c
    terms = far / (far * far + yd) ** 1.5 - near / (near * near + yd) ** 1.5
    # both halves of the disk (θ ∈ [−π/2, π/2] is even), dy = a cos θ dθ, / (π a²) for the current density
    integral = 2.0 * float(np.sum(terms * c)) * (math.pi / 2) / _QUADRATURE_NODES
    return integral / (math.pi * a * a)


def centre_depolarisation(radius_cm: float, depth_cm: float) -> float:
    """Closed form under the centre: 1 / (a² + d²)^{3/2} (design §2.1; the test oracle)."""
    return float(1.0 / (radius_cm**2 + depth_cm**2) ** 1.5)


def peak_depolarisation(radius_cm: float, depth_cm: float) -> tuple[float, float]:
    """``(x_peak, D_peak)``: the largest depolarisation along the axon. Under a wide, shallow electrode it sits under
    the edge, not the centre (design §2.1), so it is searched for: a grid over [0, a + d], then a golden-section
    search."""
    span = radius_cm + depth_cm
    xs = [span * i / (_PEAK_GRID - 1) for i in range(_PEAK_GRID)]
    values = [depolarisation(x, radius_cm, depth_cm) for x in xs]
    best = max(range(_PEAK_GRID), key=lambda i: values[i])
    lo, hi = xs[max(0, best - 1)], xs[min(_PEAK_GRID - 1, best + 1)]
    x1, x2 = hi - _GOLDEN * (hi - lo), lo + _GOLDEN * (hi - lo)
    f1, f2 = depolarisation(x1, radius_cm, depth_cm), depolarisation(x2, radius_cm, depth_cm)
    while hi - lo > 1e-9 * span:
        if f1 >= f2:
            hi, x2, f2 = x2, x1, f1
            x1 = hi - _GOLDEN * (hi - lo)
            f1 = depolarisation(x1, radius_cm, depth_cm)
        else:
            lo, x1, f1 = x1, x2, f2
            x2 = lo + _GOLDEN * (hi - lo)
            f2 = depolarisation(x2, radius_cm, depth_cm)
    x, f = (x1, f1) if f1 >= f2 else (x2, f2)
    if values[best] > f:  # the grid point itself (the centre, x = 0, is the edge of the search)
        return xs[best], values[best]
    return x, f


def size_factor(radius_cm: float, depth_cm: float, ref_radius_cm: float, ref_depth_cm: float) -> float:
    """``G = AF_peak(reference) / AF_peak(electrode)``; exactly 1 at the reference."""
    if radius_cm == ref_radius_cm and depth_cm == ref_depth_cm:
        return 1.0
    return peak_depolarisation(ref_radius_cm, ref_depth_cm)[1] / peak_depolarisation(radius_cm, depth_cm)[1]


@dataclass(frozen=True)
class ElectrodeSetup:
    """The resolved electrode of a run, what it does to the threshold, and the amplitude unit."""

    electrode: Electrode
    effect: SizeEffect
    calibration: Calibration | None
    threshold_factor: float
    """``G``."""

    @property
    def amplitude_unit(self) -> str:
        return "MA" if self.calibration is not None else "MODEL_UNIT"


def electrode_setup(
    muscle: Muscle,
    electrode: Electrode | None = None,
    effect: SizeEffect = DEFAULT_SIZE_EFFECT,
    calibration: Calibration | None = None,
) -> ElectrodeSetup:
    """``G`` of the run's electrode: relative to the calibration electrode when calibrated, else to the muscle's
    default electrode (design §2.2)."""
    e = electrode or DEFAULT_ELECTRODES[muscle]
    if effect is SizeEffect.NONE:
        g = 1.0
    elif calibration is not None:
        area = calibration.electrode_area_cm2
        ref_radius = e.radius_cm if area is None else math.sqrt(area / math.pi)
        g = size_factor(e.radius_cm, e.depth_cm, ref_radius, e.depth_cm)
    else:
        ref = DEFAULT_ELECTRODES[muscle]
        g = size_factor(e.radius_cm, e.depth_cm, ref.radius_cm, ref.depth_cm)
    return ElectrodeSetup(electrode=e, effect=effect, calibration=calibration, threshold_factor=g)


def apply_electrode(excitability: AxonExcitability, setup: ElectrodeSetup) -> AxonExcitability:
    """The axons' excitability with the electrode's ``G`` and, when calibrated, the measured rheobases (in mA).

    Uses the excitability's own τ_SD (a condition may have changed it), so a calibrated first unit fires at ``I_MT``
    with ``PW_c``.
    """
    c = setup.calibration
    if c is None:
        return replace(excitability, threshold_factor=setup.threshold_factor)
    lowest = c.motor_threshold_ma / (1 + excitability.chronaxie_ms / (c.pulse_width_us / 1000))
    spread = (
        excitability.rheobase_range if c.full_recruitment_ma is None else c.full_recruitment_ma / c.motor_threshold_ma
    )
    return replace(excitability, lowest_rheobase=lowest, rheobase_range=spread, threshold_factor=setup.threshold_factor)
