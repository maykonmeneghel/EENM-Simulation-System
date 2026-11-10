"""Hosted-deployment guards: server limits and the engine key (docs/deployment.md). Off unless configured."""

import json

import pytest
from fastapi.testclient import TestClient

from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.interfaces.http.app import create_app
from eenm_engine.interfaces.http.limits import ServerLimits
from eenm_engine.interfaces.http.schemas import SimulationRequest
from tests.fakes import SpikingSolver

SHORT = {"stimulus": {"durationMs": 50}, "outputStepMs": 1}
STREAM = "/v1/simulations/stream"


def guarded(limits: ServerLimits | None = None, secret: str = "") -> TestClient:
    return TestClient(create_app(RunSimulation(SpikingSolver()), limits=limits or ServerLimits(), engine_secret=secret))


def details(response) -> dict[str, str]:  # type: ignore[no-untyped-def]
    assert response.status_code == 422, response.text
    return {".".join(str(p) for p in d["loc"][1:]): d["msg"] for d in response.json()["detail"]}


def test_no_variable_means_no_limit() -> None:
    assert ServerLimits.from_env({}) == ServerLimits()
    config = SimulationRequest.model_validate(
        {"stimulus": {"durationMs": 300000, "stepMs": 0.005}, "outputStepMs": 0.005}
    ).to_config()
    assert ServerLimits().violations(config) == []


def test_limits_are_read_from_the_environment() -> None:
    env = {
        "EENM_MAX_DURATION_MS": "5000",
        "EENM_MIN_STEP_MS": "0.01",
        "EENM_MAX_FREQUENCY_HZ": "100",
        "EENM_MAX_UNITS_PER_TYPE": "120",
        "EENM_MAX_TOTAL_UNITS": "120",
        "EENM_MAX_OUTPUT_POINTS": "100000",
        "EENM_MAX_UNIT_EVENTS_DURATION_MS": "5000",
    }
    assert ServerLimits.from_env(env) == ServerLimits(5000, 0.01, 100, 120, 120, 100000, 5000)
    assert ServerLimits.from_env({"EENM_MAX_DURATION_MS": " "}) == ServerLimits()


@pytest.mark.parametrize(
    "env", [{"EENM_MAX_DURATION_MS": "-1"}, {"EENM_MAX_TOTAL_UNITS": "1.5"}, {"EENM_MIN_STEP_MS": "x"}]
)
def test_bad_limit_values_fail_at_start(env: dict[str, str]) -> None:
    with pytest.raises(ValueError):
        ServerLimits.from_env(env)


def test_each_cap_rejects_with_the_field_in_fastapi_format() -> None:
    client = guarded(ServerLimits(5000, 0.01, 100, 120, 150, 50000, 3000))
    body = {
        "stimulus": {"durationMs": 6000, "stepMs": 0.005, "frequencyHz": 150},
        "unitsPerType": {"S": 121, "FR": 20, "FF": 20},
        "outputStepMs": 0.1,
        "output": {"unitEvents": True},
    }
    found = details(client.post(STREAM, json=body))
    assert set(found) == {
        "stimulus.durationMs",
        "stimulus.stepMs",
        "stimulus.frequencyHz",
        "unitsPerType.S",
        "unitsPerType",
        "outputStepMs",
        "output.unitEvents",
    }
    assert found["stimulus.durationMs"] == "must be less than or equal to 5000 (server limit)"


def test_requests_within_the_caps_stream() -> None:
    client = guarded(ServerLimits(max_duration_ms=50, max_total_units=9, max_output_points=50))
    response = client.post(STREAM, json=SHORT)
    assert response.status_code == 200
    assert json.loads(response.text.splitlines()[-1])["type"] == "completed"


def test_the_literature_default_units_count_against_the_total() -> None:
    client = guarded(ServerLimits(max_total_units=100))
    found = details(client.post(STREAM, json={**SHORT, "modelVariant": "LITERATURE"}))  # 120 units chosen
    assert set(found) == {"unitsPerType"}


def test_engine_key_is_required_when_configured_except_for_health() -> None:
    client = guarded(secret="s3cret")
    assert client.get("/health").status_code == 200
    assert client.post(STREAM, json=SHORT).status_code == 403
    assert client.get("/v1/muscles").status_code == 403
    assert client.post(STREAM, json=SHORT, headers={"X-Engine-Key": "s3cre"}).status_code == 403
    ok = client.post(STREAM, json=SHORT, headers={"X-Engine-Key": "s3cret"})
    assert ok.status_code == 200 and ok.headers["content-type"].startswith("application/x-ndjson")
    assert client.get("/v1/muscles", headers={"X-Engine-Key": "s3cret"}).status_code == 200


def test_engine_key_is_off_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EENM_ENGINE_SECRET", raising=False)
    client = TestClient(create_app(RunSimulation(SpikingSolver())))
    assert client.post(STREAM, json=SHORT).status_code == 200


def test_engine_key_and_limits_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EENM_ENGINE_SECRET", "k")
    monkeypatch.setenv("EENM_MAX_DURATION_MS", "40")
    client = TestClient(create_app(RunSimulation(SpikingSolver())))
    assert client.post(STREAM, json=SHORT).status_code == 403
    assert set(details(client.post(STREAM, json=SHORT, headers={"X-Engine-Key": "k"}))) == {"stimulus.durationMs"}
