import json

from fastapi.testclient import TestClient

from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.interfaces.http.app import create_app
from tests.fakes import FailingSolver, SpikingSolver

client = TestClient(create_app(RunSimulation(SpikingSolver())))
SHORT = {"stimulus": {"durationMs": 50}, "outputStepMs": 1}


def events(response) -> list[dict]:  # type: ignore[no-untyped-def,type-arg]
    return [json.loads(line) for line in response.text.splitlines() if line]


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_muscles_lists_the_four_presets_in_camel_case() -> None:
    body = client.get("/v1/muscles").json()
    assert [m["id"] for m in body] == ["SOLEUS", "GASTROCNEMIUS_MEDIAL", "GASTROCNEMIUS_LATERAL", "TIBIALIS_ANTERIOR"]
    assert body[0]["poolSize"] == {"S": 800, "FR": 50, "FF": 50}


def test_stream_is_ndjson_started_chunks_completed() -> None:
    response = client.post("/v1/simulations/stream", json=SHORT)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    body = events(response)
    assert body[0]["type"] == "started" and body[0]["motorUnits"] == {"S": 5, "FR": 2, "FF": 2}
    assert body[-1]["type"] == "completed"
    assert set(body[-1]["summary"]) == {"peakForce", "meanForce", "timeToPeakMs"}
    chunk = body[1]
    assert chunk["type"] == "chunk"
    assert set(chunk["force"]) == {"total", "S", "FR", "FF"}
    assert len(chunk["timeMs"]) == len(chunk["stimulus"]) == len(chunk["emg"]) == len(chunk["force"]["total"])


def test_empty_body_uses_main_m_defaults() -> None:
    from eenm_engine.interfaces.http.schemas import SimulationRequest

    config = SimulationRequest().to_config()
    assert config.stimulus.duration_ms == 1000 and config.stimulus.frequency_hz == 40
    assert config.axon_length_percent == 80 and config.output_step_ms == 0.1


def test_invalid_requests_get_422() -> None:
    assert client.post("/v1/simulations/stream", json={"unitsPerType": {"S": 900}}).status_code == 422
    triangle_without_peak = {"stimulus": {"modulation": {"shape": "TRIANGLE"}}}
    assert client.post("/v1/simulations/stream", json=triangle_without_peak).status_code == 422
    assert client.post("/v1/simulations/stream", json={"muscle": "BICEPS"}).status_code == 422
    assert client.post("/v1/simulations/stream", json={"unknownField": 1}).status_code == 422


def test_failure_after_streaming_started_is_reported_in_band() -> None:
    failing = TestClient(create_app(RunSimulation(FailingSolver())))
    body = events(failing.post("/v1/simulations/stream", json=SHORT))
    assert body[0]["type"] == "started"
    assert body[-1] == {"type": "error", "message": "solver exploded", "code": "ENGINE_FAILURE"}


def test_literature_variant_defaults_to_120_proportional_units_and_streams() -> None:
    body = events(
        client.post(
            "/v1/simulations/stream",
            json={
                "modelVariant": "LITERATURE",
                "stimulus": {"durationMs": 50, "dutyCyclePercent": 1.2, "amplitude": 153},
            },
        )
    )
    assert body[0]["motorUnits"] == {"S": 106, "FR": 7, "FF": 7}
    assert body[-1]["type"] == "completed"
    assert body[-1]["summary"]["peakForce"] > 0


def test_literature_variant_maps_to_the_validated_options() -> None:
    from eenm_engine.domain.model_options import ModelOptions, StimulationSite
    from eenm_engine.interfaces.http.schemas import SimulationRequest

    config = SimulationRequest.model_validate({"modelVariant": "LITERATURE"}).to_config()
    assert config.model == ModelOptions.literature()
    assert config.model.stimulation_site is StimulationSite.MOTOR_AXONS
    explicit = SimulationRequest.model_validate(
        {"modelVariant": "LITERATURE", "unitsPerType": {"S": 3, "FR": 1, "FF": 1}}
    )
    assert sum(explicit.to_config().units_per_type.values()) == 5


def test_trains_are_passed_to_the_stimulus() -> None:
    from eenm_engine.interfaces.http.schemas import SimulationRequest

    config = SimulationRequest.model_validate({"stimulus": {"trainOnMs": 330, "trainPeriodMs": 1000}}).to_config()
    assert (config.stimulus.train_on_ms, config.stimulus.train_period_ms) == (330, 1000)
    assert client.post("/v1/simulations/stream", json={"stimulus": {"trainOnMs": 330}}).status_code == 422
