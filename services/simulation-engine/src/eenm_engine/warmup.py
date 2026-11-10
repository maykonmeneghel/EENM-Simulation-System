"""Compile (or load) every cached Numba kernel by running each simulation mode briefly.

Used at image build time (``Dockerfile.lambda``) so that the cache ships in the image, and again with
``--expect-cached`` to prove that a fresh process loads every kernel from that cache without compiling::

    python -m eenm_engine.warmup                  # fills the cache (NUMBA_CACHE_DIR)
    python -m eenm_engine.warmup --expect-cached  # exits 1 if any kernel had to be compiled
"""

from __future__ import annotations

import argparse
import sys
import time
from collections.abc import Iterator
from types import ModuleType

from numba.core.registry import CPUDispatcher

from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain import streaming_force
from eenm_engine.infrastructure import axon_merge, compiled_cisi_kohn, compiled_motoneuron
from eenm_engine.infrastructure.compiled_cisi_kohn import CompiledCisiKohnIntegrator
from eenm_engine.infrastructure.compiled_motoneuron import CompiledPoolIntegrator
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from eenm_engine.interfaces.http.schemas import SimulationRequest

_KERNEL_MODULES: tuple[ModuleType, ...] = (streaming_force, axon_merge, compiled_cisi_kohn, compiled_motoneuron)

_STIMULATOR = {"durationMs": 30, "pulseWidthUs": 300, "waveform": "BIPHASIC_SYMMETRIC", "amplitude": 153}
_DRIVE = {"enabled": True}
_UNITS = {"S": 2, "FR": 1, "FF": 1}
WARMUP_REQUESTS: tuple[dict[str, object], ...] = (
    {"stimulus": {"durationMs": 30}, "unitsPerType": _UNITS},
    {"modelVariant": "LITERATURE", "stimulus": _STIMULATOR, "unitsPerType": _UNITS},
    {
        "modelVariant": "LITERATURE",
        "stimulationSite": "MOTONEURON_POOL",
        "stimulus": _STIMULATOR,
        "unitsPerType": _UNITS,
    },
    {"modelVariant": "LITERATURE", "centralDrive": _DRIVE, "stimulus": _STIMULATOR, "unitsPerType": _UNITS},
    {
        "modelVariant": "LITERATURE",
        "stimulationSite": "MOTONEURON_POOL",
        "centralDrive": _DRIVE,
        "stimulus": _STIMULATOR,
        "unitsPerType": _UNITS,
    },
    {
        "modelVariant": "LITERATURE",
        "muscle": "FLEXOR_CARPI_RADIALIS",
        "centralDrive": _DRIVE,
        "stimulus": _STIMULATOR,
        "unitsPerType": _UNITS,
        "output": {"unitEvents": True},
    },
    {
        "modelVariant": "LITERATURE",
        "muscle": "EXTENSOR_CARPI_RADIALIS",
        "stimulus": {**_STIMULATOR, "trainOnMs": 10, "trainPeriodMs": 20, "rampUpMs": 2, "rampDownMs": 2},
        "unitsPerType": _UNITS,
        "output": {"unitEvents": True},
    },
)


def kernels() -> Iterator[tuple[str, CPUDispatcher]]:
    """The cached kernels; ``inline="always"`` ones are compiled into their callers, never on their own."""
    for module in _KERNEL_MODULES:
        for name, value in vars(module).items():
            if isinstance(value, CPUDispatcher) and value.targetoptions.get("inline") != "always":
                yield f"{module.__name__}.{name}", value


def run() -> None:
    use_case = RunSimulation(
        ScipyBdfSolver(), pool_integrator=CompiledPoolIntegrator(), drive_integrator=CompiledCisiKohnIntegrator()
    )
    for body in WARMUP_REQUESTS:
        for _ in use_case.execute(SimulationRequest.model_validate(body).to_config()):
            pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expect-cached", action="store_true", help="fail if any kernel was compiled")
    args = parser.parse_args(argv)
    start = time.perf_counter()
    run()
    elapsed = time.perf_counter() - start
    misses = 0
    for name, dispatcher in kernels():
        hits, missed = sum(dispatcher.stats.cache_hits.values()), sum(dispatcher.stats.cache_misses.values())
        if hits or missed:
            print(f"{name}: {hits} loaded from cache, {missed} compiled")
        misses += missed
    print(f"warm-up: {len(WARMUP_REQUESTS)} runs in {elapsed:.1f} s, {misses} kernel(s) compiled")
    return 1 if args.expect_cached and misses else 0


if __name__ == "__main__":
    sys.exit(main())
