"""The build-time warm-up of the Lambda image (Dockerfile.lambda) covers every cached kernel."""

from eenm_engine import warmup
from eenm_engine.interfaces.http.schemas import SimulationRequest


def test_every_cached_kernel_is_found() -> None:
    names = {name.rsplit(".", 1)[1] for name, _ in warmup.kernels()}
    assert {"_median_3x3", "_scan_peaks", "_advance_muap", "_rate_gain", "_twitch_sum", "_integrate",
            "_integrate_merged"} <= names


def test_warmup_requests_are_valid_and_cover_every_mode() -> None:
    bodies = [SimulationRequest.model_validate(b) for b in warmup.WARMUP_REQUESTS]
    assert {(b.model_variant.value, b.stimulation_site.value, b.central_drive.enabled) for b in bodies} >= {
        ("ORIGINAL", "SKIN_SURFACE", False),
        ("LITERATURE", "SKIN_SURFACE", False),
        ("LITERATURE", "MOTONEURON_POOL", False),
        ("LITERATURE", "SKIN_SURFACE", True),
        ("LITERATURE", "MOTONEURON_POOL", True),
    }
    assert any(b.output.unit_events for b in bodies)


def test_after_a_run_every_kernel_has_been_used() -> None:
    warmup.run()
    unused = [name for name, d in warmup.kernels() if not d.signatures]
    assert unused == []
