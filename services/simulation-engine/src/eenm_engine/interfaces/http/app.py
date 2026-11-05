"""FastAPI application: the engine's HTTP interface (internal; the public API is the Java service)."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.motor_unit_pool import MUSCLE_PRESETS
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from eenm_engine.interfaces.http.schemas import MusclePresetDto, SimulationRequest, event_to_json

NDJSON = "application/x-ndjson"

logger = logging.getLogger(__name__)


def create_app(run_simulation: RunSimulation | None = None) -> FastAPI:
    """Composition root. Tests inject a ``RunSimulation`` with a fake solver."""
    use_case = run_simulation or RunSimulation(ScipyBdfSolver())
    app = FastAPI(title="EENM simulation engine", version="0.1.0")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/muscles", response_model=list[MusclePresetDto], response_model_by_alias=True)
    def muscles() -> list[MusclePresetDto]:
        return [MusclePresetDto.of(p) for p in MUSCLE_PRESETS.values()]

    @app.post("/v1/simulations/stream")
    def simulate(request: SimulationRequest) -> StreamingResponse:
        config = request.to_config()

        def lines() -> Iterator[str]:
            # A sync generator: Starlette runs it in a worker thread, one event at a time, and stops
            # pulling (so the simulation stops) when the client disconnects.
            try:
                for event in use_case.execute(config):
                    yield json.dumps(event_to_json(event), separators=(",", ":")) + "\n"
            except Exception as error:  # the stream has started: report in-band, per the contract
                logger.exception("simulation failed")
                yield json.dumps({"type": "error", "message": str(error), "code": "ENGINE_FAILURE"}) + "\n"

        return StreamingResponse(lines(), media_type=NDJSON)

    return app


app = create_app()
