"""Electrode characteristics (``domain.electrode``): the validation plan of ``docs/design/electrode.md`` §8."""

from __future__ import annotations

import itertools
import math
from dataclasses import replace

import numpy as np
import pytest

from eenm_engine.application.events import SimulationChunk, SimulationStarted
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.axon_stimulation import AxonExcitability
from eenm_engine.domain.electrode import (
    DEFAULT_ELECTRODES,
    Calibration,
    Electrode,
    ElectrodeShape,
    SizeEffect,
    apply_electrode,
    centre_depolarisation,
    depolarisation,
    electrode_setup,
    peak_depolarisation,
    size_factor,
)
from eenm_engine.domain.motor_unit_pool import Muscle
from eenm_engine.interfaces.http.schemas import ElectrodeDto, SimulationRequest, event_to_json
from tests.fakes import FailingSolver


def _radius(area_cm2: float) -> float:
    return math.sqrt(area_cm2 / math.pi)


def _request(muscle: Muscle, electrode: dict[str, object] | None = None, **extra: object) -> SimulationRequest:
    body: dict[str, object] = {
        "modelVariant": "LITERATURE",
        "stimulationSite": "SKIN_SURFACE",
        "muscle": muscle.value,
        "stimulus": {"durationMs": 300, "frequencyHz": 40, "pulseWidthUs": 300, "amplitude": 80},
        **extra,
    }
    if electrode is not None:
        body["electrode"] = electrode
    return SimulationRequest.model_validate(body)


def _force(request: SimulationRequest) -> np.ndarray:
    events = RunSimulation(FailingSolver()).execute(request.to_config())
    return np.concatenate([e.force_total for e in events if isinstance(e, SimulationChunk)])


# ---- V0: defaults reproduce today's results ----


@pytest.mark.parametrize("muscle", list(Muscle))
def test_default_electrode_of_each_muscle_leaves_the_run_unchanged(muscle: Muscle) -> None:
    """The derived option is the default, so G must be exactly 1 at each muscle's default electrode, fat and depth."""
    request = _request(muscle)
    config = request.to_config()
    assert config.electrode is not None and config.electrode.effect is SizeEffect.HALF_SPACE_AF
    assert config.electrode.threshold_factor == 1.0
    # what the model was before the electrode existed: the literature excitability, untouched
    before = replace(config, model=replace(config.model, axon_excitability=AxonExcitability()), electrode=None)
    assert config.model.axon_excitability == AxonExcitability()
    explicit = _request(muscle, {"effectModel": "HALF_SPACE_AF"})
    none = _request(muscle, {"effectModel": "NONE"})
    events = RunSimulation(FailingSolver()).execute(before)
    reference = np.concatenate([e.force_total for e in events if isinstance(e, SimulationChunk)])
    assert reference.max() > 0
    for r in (request, explicit, none):
        np.testing.assert_array_equal(_force(r), reference)


def test_electrode_is_ignored_outside_the_skin_surface_literature_run() -> None:
    big = {"shape": "RECTANGLE", "widthCm": 9.0, "lengthCm": 9.0}
    for extra in ({"stimulationSite": "MOTONEURON_POOL"}, {"modelVariant": "ORIGINAL"}):
        config = _request(Muscle.SOLEUS, big, **extra).to_config()
        assert config.electrode is None
        assert config.model.axon_excitability.threshold_factor == 1.0


def test_started_echoes_the_electrode_its_factor_and_the_amplitude_unit() -> None:
    config = _request(Muscle.FLEXOR_CARPI_RADIALIS).to_config()
    started = next(iter(RunSimulation(FailingSolver()).execute(config)))
    assert isinstance(started, SimulationStarted)
    body = event_to_json(started)
    assert body["amplitudeUnit"] == "MODEL_UNIT"
    electrode = body["electrode"]
    assert isinstance(electrode, dict)
    assert electrode["shape"] == "ROUND" and electrode["diameterCm"] == 2.5
    assert electrode["thresholdFactor"] == 1.0 and electrode["effectModel"] == "HALF_SPACE_AF"
    assert electrode["areaCm2"] == pytest.approx(math.pi * 2.5**2 / 4, abs=1e-6)


# ---- V1, V2: the activating function ----


@pytest.mark.parametrize(("a", "d"), [(0.5, 1.0), (2.8, 1.25), (3.8, 1.25), (1.25, 0.35)])
def test_v1_numeric_af_at_the_centre_matches_the_closed_form(a: float, d: float) -> None:
    assert depolarisation(0.0, a, d) == pytest.approx(centre_depolarisation(a, d), rel=1e-5)


def test_v1_small_disk_tends_to_the_point_source() -> None:
    assert depolarisation(0.0, 1e-3, 1.0) == pytest.approx(1.0, rel=1e-5)  # 1/d³


def test_v2_the_peak_moves_under_the_edge_of_a_wide_shallow_electrode() -> None:
    x, peak = peak_depolarisation(2.8, 0.35)
    assert peak / centre_depolarisation(2.8, 0.35) == pytest.approx(2.36, abs=0.05)
    assert 2.0 < x < 2.8  # under the electrode, near its edge (design probe: 2.45 cm)
    x_deep, peak_deep = peak_depolarisation(2.8, 2.5)
    assert peak_deep / centre_depolarisation(2.8, 2.5) == pytest.approx(1.0, abs=1e-6)
    assert x_deep == pytest.approx(0.0, abs=0.05)


# ---- V3, V4: verified directions ----


def test_v3_larger_area_raises_the_threshold() -> None:
    d = 1.25
    areas = [4.0, 16.0, 25.0, 45.0, 81.0]
    g = [size_factor(_radius(s), d, _radius(25.0), d) for s in areas]
    assert all(b > a for a, b in itertools.pairwise(g))
    assert g[3] / g[2] == pytest.approx(1.95, abs=0.01)  # 5×9 / 5×5 (design §2.1)


def test_v4_thicker_fat_raises_the_threshold_and_lowers_the_size_sensitivity() -> None:
    ref_r, ref_d, h = _radius(25.0), 1.25, 0.5
    g = [size_factor(ref_r, f + h, ref_r, ref_d) for f in (0.25, 0.75, 2.0)]
    assert g[0] < 1.0 == g[1] < g[2]
    assert g[0] == pytest.approx(0.68, abs=0.01) and g[2] == pytest.approx(1.84, abs=0.01)

    def slope(f: float) -> float:  # d ln G / d ln S between 4×4 and 5×9
        d = f + h
        g16, g45 = (size_factor(_radius(s), d, ref_r, ref_d) for s in (16.0, 45.0))
        return math.log(g45 / g16) / math.log(45.0 / 16.0)

    assert slope(2.0) < slope(0.25)


@pytest.mark.xfail(
    strict=True,
    reason="V5: a homogeneous half-space keeps the current density at threshold flat at shallow depth; Flodin 2022 "
    "(full text) measured it falling with area (2×2 > 5×5 > 5×9). Expected to fail until a better conductor model.",
)
def test_v5_larger_area_lowers_the_current_density_at_threshold() -> None:
    d = 0.75 + 0.5
    density = [size_factor(_radius(s), d, _radius(25.0), d) / s for s in (4.0, 25.0, 45.0)]
    assert density[0] > density[1] * 1.05 and density[1] > density[2] * 1.05


def test_v6_material_and_impedance_are_not_a_choice() -> None:
    """Verified zero effect under current control (Farmer 2021; Jafari 2025): the request has nothing to set."""
    assert not {"material", "impedance", "hydrogel"} & set(ElectrodeDto.model_fields)
    with pytest.raises(ValueError):
        ElectrodeDto.model_validate({"material": "TEXTILE"})


# ---- G in the run ----


def test_a_larger_electrode_needs_more_amplitude_to_recruit() -> None:
    small = _request(Muscle.SOLEUS)
    large = _request(Muscle.SOLEUS, {"shape": "RECTANGLE", "widthCm": 5.0, "lengthCm": 9.0})
    g = large.to_config().electrode.threshold_factor  # type: ignore[union-attr]
    assert g > 1.5
    assert _force(large).max() < _force(small).max()
    # the same recruitment comes back with G times the amplitude
    scaled = _request(
        Muscle.SOLEUS,
        {"shape": "RECTANGLE", "widthCm": 5.0, "lengthCm": 9.0},
        stimulus={"durationMs": 300, "frequencyHz": 40, "pulseWidthUs": 300, "amplitude": 80 * g * (1 + 1e-12)},
    )
    np.testing.assert_allclose(_force(scaled), _force(small), rtol=1e-12, atol=1e-12)


def test_shape_enters_only_through_the_area() -> None:
    square = electrode_setup(Muscle.SOLEUS, Electrode(ElectrodeShape.RECTANGLE, width_cm=4.0, length_cm=4.0))
    disk = electrode_setup(Muscle.SOLEUS, Electrode(ElectrodeShape.ROUND, diameter_cm=2 * _radius(16.0)))
    assert square.threshold_factor == pytest.approx(disk.threshold_factor, rel=1e-12)


def test_no_effect_option_keeps_g_at_one() -> None:
    big = Electrode(ElectrodeShape.RECTANGLE, width_cm=9.0, length_cm=9.0, fat_thickness_cm=2.0)
    assert electrode_setup(Muscle.SOLEUS, big, SizeEffect.NONE).threshold_factor == 1.0


def test_defaults_per_muscle() -> None:
    fcr = DEFAULT_ELECTRODES[Muscle.FLEXOR_CARPI_RADIALIS]
    assert fcr.shape is ElectrodeShape.ROUND and fcr.diameter_cm == 2.5
    gm = DEFAULT_ELECTRODES[Muscle.GASTROCNEMIUS_MEDIAL]
    assert gm.area_cm2 == pytest.approx(19.63, abs=0.01)  # Lyons 2004
    assert DEFAULT_ELECTRODES[Muscle.SOLEUS].area_cm2 == DEFAULT_ELECTRODES[Muscle.TIBIALIS_ANTERIOR].area_cm2 == 25.0


# ---- V7: the mA calibration ----


@pytest.mark.parametrize("chronaxie", [0.459, 0.13])
def test_v7_calibrated_first_and_last_units_fire_at_the_measured_currents(chronaxie: float) -> None:
    c = Calibration(motor_threshold_ma=18.0, pulse_width_us=300.0, full_recruitment_ma=42.0)
    setup = electrode_setup(Muscle.SOLEUS, calibration=c)
    assert setup.amplitude_unit == "MA" and setup.threshold_factor == 1.0
    excitability = apply_electrode(AxonExcitability(chronaxie_ms=chronaxie), setup)
    rheobase = excitability.rheobases(120, seed=1)
    thresholds = excitability.threshold(rheobase, 0.3)
    assert thresholds.min() == pytest.approx(18.0, rel=1e-12)
    assert thresholds.max() == pytest.approx(42.0, rel=1e-12)
    # at another pulse width the thresholds follow Weiss
    longer = excitability.threshold(rheobase, 0.5)
    assert longer.min() == pytest.approx(18.0 * (1 + chronaxie / 0.5) / (1 + chronaxie / 0.3), rel=1e-12)


def test_v7_calibration_without_full_recruitment_keeps_the_inherited_range() -> None:
    setup = electrode_setup(Muscle.SOLEUS, calibration=Calibration(motor_threshold_ma=20.0, pulse_width_us=300.0))
    excitability = apply_electrode(AxonExcitability(), setup)
    assert excitability.rheobase_range == AxonExcitability().rheobase_range


def test_v7_calibration_with_another_electrode_scales_by_their_factor() -> None:
    measured_with_small = Calibration(motor_threshold_ma=18.0, pulse_width_us=300.0, electrode_area_cm2=16.0)
    run = Electrode(ElectrodeShape.RECTANGLE, width_cm=5.0, length_cm=9.0)
    setup = electrode_setup(Muscle.SOLEUS, run, calibration=measured_with_small)
    d = run.depth_cm
    assert setup.threshold_factor == pytest.approx(size_factor(_radius(45.0), d, _radius(16.0), d), rel=1e-12)
    assert setup.threshold_factor > 1


def test_calibration_must_be_consistent() -> None:
    with pytest.raises(ValueError):
        Calibration(motor_threshold_ma=20.0, pulse_width_us=300.0, full_recruitment_ma=10.0)
    with pytest.raises(ValueError):
        Electrode(ElectrodeShape.ROUND)
