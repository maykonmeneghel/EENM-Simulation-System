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


def test_muscles_lists_the_presets_in_camel_case() -> None:
    body = client.get("/v1/muscles").json()
    assert [m["id"] for m in body] == [
        "SOLEUS",
        "GASTROCNEMIUS_MEDIAL",
        "GASTROCNEMIUS_LATERAL",
        "TIBIALIS_ANTERIOR",
        "FLEXOR_CARPI_RADIALIS",
        "EXTENSOR_CARPI_RADIALIS",
    ]
    assert body[0]["poolSize"] == {"S": 800, "FR": 50, "FF": 50} and body[0]["provenance"] == []
    fcr = body[4]["provenance"][0]
    assert set(fcr) == {"field", "provenance", "value", "source", "evidence", "calibrationTarget"}


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


def test_calibration_target_selects_the_literature_twitch() -> None:
    from eenm_engine.domain.model_options import CalibrationTarget, ModelOptions
    from eenm_engine.interfaces.http.schemas import SimulationRequest

    def model(body: dict[str, object]) -> ModelOptions:
        return SimulationRequest.model_validate(body).to_config().model

    assert model({"modelVariant": "LITERATURE"}) == ModelOptions.literature(CalibrationTarget.WHOLE_MUSCLE)
    single = model({"modelVariant": "LITERATURE", "calibrationTarget": "SINGLE_UNIT"})
    assert single == ModelOptions.literature(CalibrationTarget.SINGLE_UNIT)
    assert model({"calibrationTarget": "SINGLE_UNIT"}) == ModelOptions()  # no effect on ORIGINAL
    assert client.post("/v1/simulations/stream", json={"calibrationTarget": "FASTEST"}).status_code == 422


def test_stimulation_site_selects_skin_or_motoneuron_pool() -> None:
    from eenm_engine.domain.model_options import CalibrationTarget, ModelOptions, StimulationSite
    from eenm_engine.interfaces.http.schemas import SimulationRequest

    def model(body: dict[str, object]) -> ModelOptions:
        return SimulationRequest.model_validate(body).to_config().model

    skin = model({"modelVariant": "LITERATURE"})
    pool = model({"modelVariant": "LITERATURE", "stimulationSite": "MOTONEURON_POOL"})
    assert skin.stimulation_site is StimulationSite.MOTOR_AXONS
    assert pool.stimulation_site is StimulationSite.MOTONEURON_SOMA
    assert (pool.twitch_time_scale, pool.twitch_shape.exponent) == (1.2775, 3.9482)  # pool120 fit
    single = model(
        {"modelVariant": "LITERATURE", "stimulationSite": "MOTONEURON_POOL", "calibrationTarget": "SINGLE_UNIT"}
    )
    assert single == ModelOptions.literature(CalibrationTarget.SINGLE_UNIT, StimulationSite.MOTONEURON_SOMA)
    assert model({"stimulationSite": "MOTONEURON_POOL"}) == ModelOptions()  # ORIGINAL ignores it
    assert client.post("/v1/simulations/stream", json={"stimulationSite": "SKIN"}).status_code == 422


def test_motoneuron_pool_site_streams_force() -> None:
    body = events(
        client.post(
            "/v1/simulations/stream",
            json={
                "modelVariant": "LITERATURE",
                "stimulationSite": "MOTONEURON_POOL",
                "unitsPerType": {"S": 3, "FR": 1, "FF": 1},
                "stimulus": {"durationMs": 60, "pulseWidthUs": 300, "waveform": "BIPHASIC_SYMMETRIC", "amplitude": 153},
            },
        )
    )
    assert body[-1]["type"] == "completed"
    assert body[-1]["summary"]["peakForce"] > 0


def test_stimulator_fields_are_passed_to_the_stimulus() -> None:
    from eenm_engine.domain.stimulus import Waveform
    from eenm_engine.interfaces.http.schemas import SimulationRequest

    body = {
        "modelVariant": "LITERATURE",
        "stimulus": {
            "durationMs": 2000,
            "pulseWidthUs": 300,
            "waveform": "BIPHASIC_SYMMETRIC",
            "trainOnMs": 1000,
            "trainPeriodMs": 2000,
            "rampUpMs": 200,
            "rampDownMs": 300,
        },
    }
    stimulus = SimulationRequest.model_validate(body).to_config().stimulus
    assert (stimulus.pulse_width_us, stimulus.ramp_up_ms, stimulus.ramp_down_ms) == (300, 200, 300)
    assert stimulus.waveform is Waveform.BIPHASIC_SYMMETRIC and stimulus.pulse_width_ms == 0.3
    too_long = {"stimulus": {"rampUpMs": 900, "rampDownMs": 900}}  # 1800 ms of ramps in a 1000 ms run
    assert client.post("/v1/simulations/stream", json=too_long).status_code == 422


def test_trains_are_passed_to_the_stimulus() -> None:
    from eenm_engine.interfaces.http.schemas import SimulationRequest

    config = SimulationRequest.model_validate({"stimulus": {"trainOnMs": 330, "trainPeriodMs": 1000}}).to_config()
    assert (config.stimulus.train_on_ms, config.stimulus.train_period_ms) == (330, 1000)
    assert client.post("/v1/simulations/stream", json={"stimulus": {"trainOnMs": 330}}).status_code == 422


def test_pulse_times_are_passed_to_the_stimulus_and_validated() -> None:
    from eenm_engine.interfaces.http.schemas import SimulationRequest

    doublet = {"durationMs": 50, "pulseWidthUs": 500, "pulseTimesMs": [0, 6, 20]}
    stimulus = SimulationRequest.model_validate({"stimulus": doublet}).to_config().stimulus
    assert stimulus.pulse_times_ms == (0.0, 6.0, 20.0) and stimulus.pulse_count == 3
    assert SimulationRequest().to_config().stimulus.pulse_times_ms is None  # absent = the periodic train
    response = client.post("/v1/simulations/stream", json={"stimulus": doublet, "outputStepMs": 1})
    assert response.status_code == 200 and events(response)[-1]["type"] == "completed"
    unsorted = {"stimulus": {**doublet, "pulseTimesMs": [6, 0]}}
    without_width = {"stimulus": {"durationMs": 50, "pulseTimesMs": [0, 6]}}
    for body in (unsorted, without_width):
        assert client.post("/v1/simulations/stream", json=body).status_code == 422
    assert "strictly increasing" in client.post("/v1/simulations/stream", json=unsorted).text
