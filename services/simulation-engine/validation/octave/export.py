"""Run the ORIGINAL engine on Main.m's defaults (production solver and force pipeline); save per-unit data.

Run: uv run python -m validation.octave.export <duration_ms> <out.mat> [temperature_c] [seed]
The optional arguments perturb the Python side only (negative controls for the comparison).
"""

from __future__ import annotations

import sys
import time

import numpy as np
from numpy.typing import NDArray
from scipy.io import savemat

from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.force_pipeline import type_signals
from eenm_engine.domain.motoneuron import REFERENCE_TEMPERATURE_C
from eenm_engine.domain.simulation import ForceSeries, MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver


class _CollectVoltages:
    """Stands in for ``IncrementalForce``: keeps the soma voltages the solver produces."""

    def __init__(self) -> None:
        self.parts: list[NDArray[np.float64]] = []

    def add(self, voltage: NDArray[np.float64]) -> ForceSeries | None:
        self.parts.append(voltage)
        return None


def main(duration_ms: float, out: str, temperature_c: float, seed: int) -> None:
    config = SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=duration_ms), temperature_c=temperature_c, seed=seed
    )
    setup = MotorUnitSetup.from_config(config)
    times = config.stimulus.time_grid()
    collected = _CollectVoltages()
    clock = time.perf_counter()
    runner = RunSimulation(ScipyBdfSolver())
    list(runner._integrate_in_blocks(setup.motoneurons, config, times, collected))  # type: ignore[arg-type]
    voltage = np.concatenate(collected.parts, axis=0)
    print(f"python ODE: {time.perf_counter() - clock:.1f}s, Vs {voltage.shape}")

    result: dict[str, NDArray[np.float64]] = {"time": times, "Vs": voltage}
    force = np.zeros(times.size)
    for unit_type, columns in setup.column_slices().items():
        signals = type_signals(
            voltage[:, columns],
            setup.groups[unit_type],
            setup.muap_shapes[unit_type],
            config.axon_length_percent,
            config.stimulus.step_ms,
        )
        result[f"shape_{unit_type.value}"] = setup.muap_shapes[unit_type].astype(np.float64)
        result[f"f_{unit_type.value}"] = signals.force
        force += signals.mean_force()
    result["force"] = force
    savemat(out, result)


if __name__ == "__main__":
    main(
        float(sys.argv[1]),
        sys.argv[2],
        float(sys.argv[3]) if len(sys.argv) > 3 else REFERENCE_TEMPERATURE_C,
        int(sys.argv[4]) if len(sys.argv) > 4 else 0,
    )
