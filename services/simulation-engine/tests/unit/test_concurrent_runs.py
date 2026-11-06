"""Two simulations at the same time (as two streams in the HTTP server) must not abort the process.

Numba's default threading layer aborts on concurrent entry into parallel kernels; the run happens in a subprocess so
a regression shows as a failed test instead of killing the test session.
"""

from __future__ import annotations

import subprocess
import sys

SCRIPT = """
import threading
from dataclasses import replace
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.central_drive import CentralDrive, Tremor
from eenm_engine.domain.model_options import ModelOptions, StimulationSite
from eenm_engine.domain.motor_unit_pool import Muscle, proportional_units
from eenm_engine.domain.simulation import SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, Waveform
from eenm_engine.infrastructure.compiled_cisi_kohn import CompiledCisiKohnIntegrator
from eenm_engine.infrastructure.compiled_motoneuron import CompiledPoolIntegrator
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver

def config(site, drive):
    model = ModelOptions.literature(site=site)
    if drive:
        model = replace(model, central_drive=CentralDrive(tremor=Tremor()))
    return SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=400, step_ms=0.025, frequency_hz=30, pulse_width_us=300, amplitude=153,
                                  waveform=Waveform.BIPHASIC_SYMMETRIC),
        model=model, muscle=Muscle.FLEXOR_CARPI_RADIALIS,
        units_per_type=proportional_units(Muscle.FLEXOR_CARPI_RADIALIS, 60), output_step_ms=1)

run = RunSimulation(
    ScipyBdfSolver(), pool_integrator=CompiledPoolIntegrator(), drive_integrator=CompiledCisiKohnIntegrator()
)
cases = [(s, d) for s in StimulationSite for d in (False, True)]
done = []
def go(case):
    done.append(sum(1 for _ in run.execute(config(*case))))
threads = [threading.Thread(target=go, args=(c,)) for c in cases * 2]
for t in threads: t.start()
for t in threads: t.join()
assert len(done) == len(threads) and all(n > 2 for n in done), done
print("ok", len(done))
"""


def test_concurrent_simulations_do_not_abort_the_process() -> None:
    result = subprocess.run([sys.executable, "-c", SCRIPT], capture_output=True, text=True, timeout=600)
    assert result.returncode == 0, result.stderr[-2000:]
    assert result.stdout.strip().startswith("ok 8")
