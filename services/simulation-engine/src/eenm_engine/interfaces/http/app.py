"""FastAPI application: the engine's HTTP interface (internal; the public API is the Java service)."""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterator

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse

from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.motor_unit_pool import MUSCLE_PRESETS
from eenm_engine.domain.texts_en import Lang
from eenm_engine.infrastructure.compiled_cisi_kohn import CompiledCisiKohnIntegrator
from eenm_engine.infrastructure.compiled_motoneuron import CompiledPoolIntegrator
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from eenm_engine.interfaces.http.engine_key import ENGINE_SECRET, EngineKeyMiddleware
from eenm_engine.interfaces.http.limits import ServerLimits
from eenm_engine.interfaces.http.schemas import (
    ConditionDto,
    MusclePresetDto,
    SimulationRequest,
    condition_catalog,
    event_to_json,
)

NDJSON = "application/x-ndjson"

logger = logging.getLogger(__name__)


def create_app(
    run_simulation: RunSimulation | None = None,
    limits: ServerLimits | None = None,
    engine_secret: str | None = None,
) -> FastAPI:
    """Composition root. Tests inject a ``RunSimulation`` with a fake solver.

    ``limits`` (default: from the ``EENM_MAX_*`` / ``EENM_MIN_*`` environment variables, none set = no caps) and
    ``engine_secret`` (default: ``EENM_ENGINE_SECRET``; unset or empty = no key required) are the hosted-deployment
    guards of ``docs/deployment.md``.
    """
    use_case = run_simulation or RunSimulation(
        ScipyBdfSolver(), pool_integrator=CompiledPoolIntegrator(), drive_integrator=CompiledCisiKohnIntegrator()
    )
    server_limits = limits if limits is not None else ServerLimits.from_env()
    secret = engine_secret if engine_secret is not None else os.environ.get(ENGINE_SECRET, "")
    app = FastAPI(title="EENM simulation engine", version="0.1.0")
    if secret:
        app.add_middleware(EngineKeyMiddleware, secret=secret)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/muscles", response_model=list[MusclePresetDto], response_model_by_alias=True)
    def muscles(lang: Lang = "pt-BR") -> list[MusclePresetDto]:
        return [MusclePresetDto.of(p, lang) for p in MUSCLE_PRESETS.values()]

    @app.get("/v1/conditions", response_model=list[ConditionDto], response_model_by_alias=True)
    def conditions(lang: Lang = "pt-BR") -> list[ConditionDto]:
        return condition_catalog(lang)

    @app.post("/v1/simulations/stream")
    def simulate(request: SimulationRequest) -> StreamingResponse:
        config = request.to_config()
        exceeded = server_limits.violations(config)
        if exceeded:
            # the FastAPI 422 format, so the API names the fields as for any other engine rejection
            raise RequestValidationError(
                [{"type": "server_limit", "loc": ("body", *loc), "msg": msg, "input": None} for loc, msg in exceeded]
            )

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
