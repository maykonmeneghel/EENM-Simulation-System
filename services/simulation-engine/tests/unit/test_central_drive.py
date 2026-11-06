"""Descending drive (design §3.1) and the axon merge of FES and central spikes (§3.3)."""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest

from eenm_engine.application.events import SimulationChunk
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.central_drive import CentralDrive, CurrentScale, DriveGenerator, ThresholdRule, Tremor
from eenm_engine.domain.cisi_kohn import cisi_kohn_pool, current_factor
from eenm_engine.domain.model_options import ModelOptions, StimulationSite, UnitSelection
from eenm_engine.domain.motor_unit_pool import MotorUnitType, Muscle, proportional_units
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, Waveform
from eenm_engine.infrastructure.compiled_cisi_kohn import CisiKohnIntegration, CompiledCisiKohnIntegrator
from eenm_engine.infrastructure.compiled_motoneuron import CompiledPoolIntegrator
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from eenm_engine.interfaces.http.schemas import SimulationRequest, event_to_json

STEP = 0.025


def _smallest_unit() -> CisiKohnIntegration:
    """The pool's smallest unit (S, index 0; rheobase 3.5 nA) as a Cisi & Kohn motoneuron."""
    config = SimulationConfig(
        model=ModelOptions(unit_selection=UnitSelection.FIRST_OF_POOL),
        units_per_type={MotorUnitType.S: 1, MotorUnitType.FR: 0, MotorUnitType.FF: 0},
    )
    setup = MotorUnitSetup.from_config(config)
    return CisiKohnIntegration(cisi_kohn_pool(setup.groups, Muscle.SOLEUS), STEP)


def test_drive_has_the_requested_mean_noise_and_tremor_and_is_reproducible() -> None:
    drive = CentralDrive(background_na=3.0, voluntary_na=2.0, noise_cv=0.2)
    x = DriveGenerator(drive, 40, 0.01, seed=4).next(30_000)
    assert x.mean() == pytest.approx(5.0, abs=0.05)  # nA
    assert x.std() == pytest.approx(1.0, rel=0.05)  # SD = 0.2 × mean current
    blocks = DriveGenerator(drive, 40, 0.01, seed=4)
    np.testing.assert_allclose(np.vstack([blocks.next(997) for _ in range(30)])[:29_910], x[:29_910], rtol=1e-12)
    tremor = DriveGenerator(replace(drive, noise_cv=0.0, tremor=Tremor(5.0, 2.0)), 40, 0.01, seed=0).next(40_000)
    spectrum = np.abs(np.fft.rfft(tremor[:, 0] - tremor[:, 0].mean()))
    assert np.fft.rfftfreq(40_000, 1e-5)[spectrum.argmax()] == pytest.approx(5.0, abs=0.1)
    assert tremor.max() - tremor.min() == pytest.approx(4.0, rel=1e-3)
    rescaled = DriveGenerator(
        replace(drive, noise_cv=0.0), 1, 0.01, 0, current_factor(replace(drive, scale=CurrentScale.RHEOBASE))
    )
    assert rescaled.next(1)[0, 0] == pytest.approx(5.0 * 3.5 / 4.0)  # smallest rheobase 3.5 nA / Gallego's 4 nA
    assert current_factor(replace(drive, scale=CurrentScale.RHEOBASE, threshold_rule=ThresholdRule.WATANABE_2013)) > 1


def _merge_run(fes_period_ms: float | None, drive_na: float, seconds: float = 2.0) -> dict[str, int]:
    """The smallest unit, constant drive (nA, no noise), FES recruiting it every ``fes_period_ms``."""
    integration = _smallest_unit()
    integration.enable_merge(np.array([600]), 0.9)  # 15 ms soma → muscle, electrode at 13.5 ms
    rows = round(seconds * 1000 / STEP)
    recruit = np.zeros((rows, 1), dtype=bool)
    if fes_period_ms:
        recruit[:: round(fes_period_ms / STEP), 0] = True
        recruit[0, 0] = False
    integration.advance_merged(np.full((rows, 1), drive_na), recruit)
    return integration.axon_events()


def test_fes_alone_fires_the_axon_and_each_antidromic_spike_resets_the_soma_without_a_central_spike() -> None:
    events = _merge_run(fes_period_ms=50.0, drive_na=0.0)
    assert events["fesTransmitted"] == 39 and events["resets"] == 39
    assert events["central"] == 0 and events["collisions"] == 0  # the antidromic soma spikes are not sent


def test_stimulation_above_the_natural_rate_silences_the_central_spikes_and_slow_stimulation_does_not() -> None:
    natural = _merge_run(None, 6.0)
    assert natural["central"] > 15 and natural["collisions"] == 0
    assert natural["centralTransmitted"] >= natural["central"] - 1  # minus one still between soma and electrode
    # 100 Hz, above the natural rate (Formento 2018: ~100 % of the natural spikes lost): each antidromic spike makes a
    # soma spike before the soma fires on its own, so no central spike reaches the muscle
    fast = _merge_run(10.0, 6.0)
    assert fast["centralTransmitted"] < 0.1 * natural["centralTransmitted"] and fast["resets"] > 150
    slow = _merge_run(500.0, 6.0)  # 2 Hz: most natural spikes still get through
    assert slow["centralTransmitted"] > 0.6 * natural["centralTransmitted"]
    for e in (fast, slow):  # every central spike is sent, annihilated or still on its way
        assert e["central"] - e["centralTransmitted"] - e["collisions"] in (0, 1)


def _drive_config(site: StimulationSite, amplitude: float, seconds: float = 2.0, units: int = 60) -> SimulationConfig:
    drive = CentralDrive(tremor=Tremor(4.4, 3.0))
    return SimulationConfig(
        stimulus=StimulusProtocol(
            duration_ms=seconds * 1000,
            step_ms=STEP,
            frequency_hz=30,
            pulse_width_us=300,
            amplitude=amplitude,
            waveform=Waveform.BIPHASIC_SYMMETRIC,
        ),
        model=replace(ModelOptions.literature(site=site), central_drive=drive),
        muscle=Muscle.FLEXOR_CARPI_RADIALIS,
        units_per_type=proportional_units(Muscle.FLEXOR_CARPI_RADIALIS, units),
        output_step_ms=1.0,
    )


def _chunks(config: SimulationConfig) -> list[SimulationChunk]:
    run = RunSimulation(
        ScipyBdfSolver(), pool_integrator=CompiledPoolIntegrator(), drive_integrator=CompiledCisiKohnIntegrator()
    )
    return [e for e in run.execute(config) if isinstance(e, SimulationChunk)]


@pytest.mark.parametrize("site", list(StimulationSite))
def test_rest_tremor_shows_in_the_force_at_the_drive_frequency_in_both_modes(site: StimulationSite) -> None:
    chunks = _chunks(_drive_config(site, amplitude=0.0, seconds=4.0, units=120))
    t = np.concatenate([c.time_ms for c in chunks])
    x = np.concatenate([c.force_total for c in chunks])[t >= 1000]  # after the motoneurons' slow transient
    x = x - np.polyval(np.polyfit(np.arange(x.size), x, 1), np.arange(x.size))
    power = np.abs(np.fft.rfft(x * np.hanning(x.size))) ** 2
    hz = np.fft.rfftfreq(x.size, 1e-3)
    band = (hz >= 2) & (hz <= 15)
    assert hz[band][power[band].argmax()] == pytest.approx(4.4, abs=0.7)
    assert (chunks[-1].axon_events is not None) == (site is StimulationSite.MOTOR_AXONS)


def test_non_invasive_mode_reports_collisions_with_fes_on() -> None:
    last = _chunks(_drive_config(StimulationSite.MOTOR_AXONS, amplitude=153.0))[-1]
    assert last.axon_events is not None
    assert last.axon_events["central"] > 0 and last.axon_events["collisions"] > 0
    assert event_to_json(last)["axonEvents"] == last.axon_events


def _at_electrode(fraction: float, amplitude: float) -> list[SimulationChunk]:
    config = _drive_config(StimulationSite.MOTOR_AXONS, amplitude=amplitude, seconds=1.0, units=30)
    return _chunks(replace(config, model=replace(config.model, electrode_fraction=fraction)))


def test_without_fes_the_electrode_position_does_not_change_when_central_spikes_reach_the_muscle() -> None:
    # soma → electrode + electrode → muscle is the whole soma → muscle delay; before the fix the force pipeline added
    # the whole delay again after the electrode, so the force started 16 ms later at 1.0 than at 0.1
    near, far = (np.concatenate([c.force_total for c in _at_electrode(f, 0.0)]) for f in (0.1, 1.0))
    assert near.max() > 0
    np.testing.assert_allclose(near, far, rtol=0, atol=1e-12)


def test_with_fes_on_a_longer_soma_to_electrode_path_makes_more_collisions() -> None:
    near, far = (_at_electrode(f, 153.0)[-1].axon_events for f in (0.1, 1.0))
    assert near is not None and far is not None
    assert far["collisions"] > near["collisions"]


def test_request_turns_the_drive_on_and_adds_the_tremor_only_with_the_parkinson_adjustment() -> None:
    base = {"modelVariant": "LITERATURE", "stimulationSite": "SKIN_SURFACE"}
    assert SimulationRequest.model_validate(base).to_config().model.central_drive is None
    on = SimulationRequest.model_validate({**base, "centralDrive": {"enabled": True, "voluntaryNa": 5}})
    drive = on.to_config().model.central_drive
    assert drive is not None and drive.voluntary_na == 5 and drive.tremor is None
    pd = SimulationRequest.model_validate(
        {
            **base,
            "condition": "PARKINSON",
            "conditionAdjustments": ["PD_TREMOR"],
            "centralDrive": {"tremor": {"frequencyHz": 5.9, "amplitudeNa": 2}},
        }
    ).to_config()
    assert pd.model.central_drive is not None and pd.model.central_drive.tremor == Tremor(5.9, 2.0)
    normal_with_tremor_params = SimulationRequest.model_validate(
        {**base, "centralDrive": {"enabled": True, "tremor": {"frequencyHz": 5.9}}}
    ).to_config()
    assert normal_with_tremor_params.model.central_drive is not None
    assert normal_with_tremor_params.model.central_drive.tremor is None


def _scripted(fes_samples: list[int]) -> tuple[np.ndarray, dict[str, int]]:
    """Smallest unit at 6 nA (no noise), soma → muscle 400 samples (electrode at 360); FES pulses at given samples.
    Returns the samples at which spikes leave the electrode, and the counts."""
    integration = _smallest_unit()
    integration.enable_merge(np.array([400]), 0.9)
    rows = round(1500 / STEP)
    recruit = np.zeros((rows, 1), dtype=bool)
    for n in fes_samples:
        recruit[n - 1, 0] = True  # row j is sample j + 1
    out = integration.advance_merged(np.full((rows, 1), 6.0), recruit)
    return np.flatnonzero(out[:, 0]) + 1, integration.axon_events()


def test_scripted_collisions_and_refractoriness_follow_the_event_rules() -> None:
    passes, natural = _scripted([])
    soma = passes - 360  # soma spike samples (each spike reaches the electrode 360 samples later)
    s0, s1 = int(soma[5]), int(soma[6])
    assert s1 - s0 > 360  # one spike in flight at a time: the scenarios below are unambiguous

    # FES while spike s0 travels between soma and electrode: its antidromic spike annihilates it
    out, ev = _scripted([s0 + 100])
    assert ev["collisions"] == 1 and ev["fesTransmitted"] == 1 and ev["resets"] == 0
    assert s0 + 360 not in out and s0 + 100 in out

    # FES one sample after s0 passed the electrode: the axon is refractory there, the pulse does nothing
    out, ev = _scripted([s0 + 361])
    assert ev["fesBlocked"] == 1 and ev["fesTransmitted"] == 0 and np.array_equal(out, passes)

    # FES shortly before the soma fires again, nothing in flight: the antidromic spike meets the new soma spike
    out, ev = _scripted([s1 - 160])
    assert ev["collisions"] == 1 and ev["resets"] == 0 and s1 + 360 not in out and s1 - 160 in out
    assert natural["collisions"] == 0


def test_an_antidromic_spike_reaching_the_soma_restarts_its_interval() -> None:
    passes, _ = _scripted([])
    soma = passes - 360
    s0, s1 = int(soma[5]), int(soma[6])
    pulse = s0 + 360 + 100  # s0 passed the electrode 2.5 ms before (refractory 1.6 ms); its antidromic spike reaches
    # the soma before s1 fires
    assert pulse + 360 < s1
    out, ev = _scripted([pulse])
    assert ev["resets"] == 1 and ev["collisions"] == 0
    after = out[out > pulse] - 360  # soma samples of the next central spikes
    assert after[0] > s1 + 200  # delayed: the interval restarted at the antidromic arrival (rule 3)
