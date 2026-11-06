"""The compiled fixed-step pool integrator against an accurate BDF reference.

Reference: SciPy BDF with rtol 1e-7 / atol 1e-10. Requirement: the compiled integrator is at least as close to the
reference as the production BDF (rtol 1e-3, ode23s's tolerance) in spike counts, and within 0.1 ms in spike times.
Near-threshold units (short pulses into the soma) are where both solvers disagree with the reference.
"""

from __future__ import annotations

import numpy as np
import pytest

from eenm_engine.domain.force_pipeline import find_peaks_matlab
from eenm_engine.domain.model_options import ModelOptions, StimulationSite
from eenm_engine.domain.motoneuron import InjectionSite, MotoneuronPool
from eenm_engine.domain.motor_unit_pool import Muscle, proportional_units
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, Waveform, stimulus_current, stimulus_series
from eenm_engine.infrastructure.compiled_motoneuron import CompiledPoolIntegrator
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver


def _bdf(pool: MotoneuronPool, p: StimulusProtocol, rtol: float, atol: float) -> np.ndarray:
    times = p.time_grid()
    integration = ScipyBdfSolver(rtol=rtol, atol=atol).start(
        lambda t, y: pool.derivatives(t, y, lambda u: stimulus_current(u, p)),
        pool.initial_state(),
        0.0,
        float(times[-1]),
        pool.jacobian_sparsity(),
        max_step=p.solver_max_step_ms(),
    )
    rest = pool.soma_voltage(pool.initial_state()[:, None], pool.n_units)
    return np.vstack([rest, pool.soma_voltage(integration.advance(times[1:]), pool.n_units)])


def _compiled(pool: MotoneuronPool, p: StimulusProtocol) -> np.ndarray:
    rest = pool.soma_voltage(pool.initial_state()[:, None], pool.n_units)
    return np.vstack([rest, CompiledPoolIntegrator().start(pool, p.step_ms).advance(stimulus_series(p)[:-1])])


def _score(reference: np.ndarray, voltage: np.ndarray, step: float) -> tuple[int, float]:
    """(units whose spike count differs, worst spike-time shift in ms among the others)."""
    differ, worst = 0, 0.0
    for k in range(reference.shape[1]):
        a, _ = find_peaks_matlab(reference[:, k], 0.0)
        b, _ = find_peaks_matlab(voltage[:, k], 0.0)
        if a.size != b.size:
            differ += 1
        elif a.size:
            worst = max(worst, float(np.abs(a - b).max()) * step)
    return differ, worst


CASES = {
    "Main.m: 9 units, 5 ms pulses": SimulationConfig(stimulus=StimulusProtocol(duration_ms=200)),
    "corrected pool in the soma: 30 units, 300 µs biphasic": SimulationConfig(
        stimulus=StimulusProtocol(
            duration_ms=150, frequency_hz=40, pulse_width_us=300, amplitude=153, waveform=Waveform.BIPHASIC_SYMMETRIC
        ),
        model=ModelOptions.literature(site=StimulationSite.MOTONEURON_SOMA),
        units_per_type=proportional_units(Muscle.SOLEUS, 30),
    ),
}


@pytest.mark.parametrize("case", list(CASES))
def test_compiled_pool_is_at_least_as_accurate_as_the_production_solver(case: str) -> None:
    config = CASES[case]
    pool, p = MotorUnitSetup.from_config(config).motoneurons, config.stimulus
    reference = _bdf(pool, p, 1e-7, 1e-10)
    production = _score(reference, _bdf(pool, p, 1e-3, 1e-6), p.step_ms)
    compiled = _score(reference, _compiled(pool, p), p.step_ms)
    assert compiled[0] <= production[0], (compiled, production)
    assert compiled[1] <= 0.1


def test_each_unit_can_receive_its_own_current() -> None:
    config = CASES["Main.m: 9 units, 5 ms pulses"]
    pool, p = MotorUnitSetup.from_config(config).motoneurons, config.stimulus
    stim = stimulus_series(p)[:-1]
    shared = CompiledPoolIntegrator().start(pool, p.step_ms).advance(stim)
    per_unit = np.repeat(stim[:, None], pool.n_units, axis=1)
    per_unit[:, 0] = 0.0  # unit 0 receives nothing
    separate = CompiledPoolIntegrator().start(pool, p.step_ms).advance(per_unit)
    np.testing.assert_array_equal(separate[:, 1:], shared[:, 1:])
    assert find_peaks_matlab(separate[:, 0], 0.0)[0].size == 0 < find_peaks_matlab(shared[:, 0], 0.0)[0].size


def test_dendritic_injection_and_temperature_follow_the_reference() -> None:
    base = CASES["Main.m: 9 units, 5 ms pulses"]
    area = MotorUnitSetup.from_config(base).motoneurons.soma_area_fraction
    pool = MotoneuronPool(area, temperature_c=20.0, injection_site=InjectionSite.DENDRITE)
    p = base.stimulus
    reference = _bdf(pool, p, 1e-7, 1e-10)
    differ, worst = _score(reference, _compiled(pool, p), p.step_ms)
    assert differ <= 1 and worst <= 0.1
