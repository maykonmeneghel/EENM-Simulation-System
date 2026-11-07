"""Wrist joint (central-layer design §3.5): the 1-DOF dynamics, force–velocity, passive models and limits."""

from __future__ import annotations

import json
import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from eenm_engine.domain.motor_unit_pool import Muscle
from eenm_engine.domain.wrist_joint import (
    WRIST_MUSCLES,
    PassiveModel,
    PeakForce,
    WristIntegrator,
    WristJoint,
    WristOptions,
    wrist_setup,
)
from eenm_engine.interfaces.http.app import create_app

STEP_MS = 0.1
FCR = Muscle.FLEXOR_CARPI_RADIALIS
ECR = Muscle.EXTENSOR_CARPI_RADIALIS
FCR_TORQUE = 0.0149 * 407.9  # isometric N·m per unit force fraction
DEFAULT = WristOptions()


def _run(
    fraction: np.ndarray, options: WristOptions = DEFAULT, muscle: Muscle = FCR, step_ms: float = STEP_MS
) -> tuple[np.ndarray, np.ndarray]:
    setup = wrist_setup(muscle, options)
    assert setup is not None
    return WristIntegrator(setup, step_ms).advance(fraction)


def test_a_small_constant_torque_settles_at_torque_over_stiffness() -> None:
    angle, torque = _run(np.full(30_000, 0.1 / FCR_TORQUE))  # 3 s
    assert torque[-1] == pytest.approx(0.1)  # still: f_v = 1
    assert angle[-1] == pytest.approx(0.1 / 0.992, rel=1e-3)


def test_released_it_rings_at_the_damped_natural_frequency_and_returns_to_rest() -> None:
    fraction = np.concatenate([np.full(20_000, 0.1 / FCR_TORQUE), np.zeros(40_000)])  # hold 2 s, release for 4 s
    free = _run(fraction)[0][20_000:]
    crossings = np.flatnonzero(np.diff(np.sign(free)) != 0)
    period_s = 2 * np.mean(np.diff(crossings)) * STEP_MS / 1000
    zeta = 0.028 / (2 * math.sqrt(0.992 * 0.003))
    damped_hz = math.sqrt(0.992 / 0.003) * math.sqrt(1 - zeta**2) / (2 * math.pi)
    assert 1 / period_s == pytest.approx(damped_hz, rel=0.01)  # ≈ 2.8 Hz: I, B, K are the ones used
    assert abs(free[-1]) < 1e-3 * abs(free[0])


def test_force_velocity_follows_thelen_2003() -> None:
    j = WristJoint()
    assert j.force_velocity(0.0) == 1.0
    assert j.force_velocity(1.0) == 0.0 and j.force_velocity(1.5) == 0.0  # no force at or beyond Vmax
    assert j.force_velocity(0.25) == pytest.approx(0.75 / 2)  # Hill: (1 − v)/(1 + v/Af), Af = 0.25
    assert j.force_velocity(-1e-3) > 1.0  # lengthening raises the force ...
    assert j.force_velocity(-1e6) == pytest.approx(1.4, rel=1e-4)  # ... towards Flen


def test_shortening_slows_the_flexion_and_lowers_the_torque() -> None:
    angle, torque = _run(np.full(2_000, 0.3))  # 200 ms at 30 % of the peak force
    moving = np.argmax(np.diff(angle))  # fastest sample
    assert torque[moving] < 0.3 * FCR_TORQUE  # f_v < 1 while shortening
    no_fv = WristJoint(max_contraction_velocity=1e9)  # Vmax → ∞: f_v ≡ 1 when shortening
    assert no_fv.force_velocity(1e-9) == pytest.approx(1.0)


def test_end_range_passive_moment_of_delp_1996() -> None:
    j = WristJoint(passive=PassiveModel.END_RANGE)
    assert j.passive_moment(math.radians(75)) == 0.0 and j.passive_moment(math.radians(-40)) == 0.0
    assert j.passive_moment(math.radians(90)) == pytest.approx(-0.5)  # opposes flexion
    assert j.passive_moment(math.radians(-90)) == pytest.approx(1.2)  # opposes extension
    linear = WristJoint()
    assert linear.passive_moment(0.5) == pytest.approx(-0.992 * 0.5)


def test_the_angle_stops_at_90_degrees() -> None:
    flexed = _run(np.ones(10_000))[0]
    assert flexed.max() == pytest.approx(math.radians(90))
    extended = _run(np.ones(10_000), muscle=ECR)[0]
    assert extended.min() == pytest.approx(-math.radians(90))


def test_the_result_does_not_depend_on_the_output_step() -> None:
    fine = _run(np.full(10_001, 0.03))[0][::10]
    coarse = _run(np.full(1_001, 0.03), step_ms=1.0)[0]
    np.testing.assert_allclose(fine, coarse, atol=2e-3)


def test_peak_force_options_and_leg_muscles() -> None:
    fcr = WRIST_MUSCLES[FCR]
    assert fcr.peak_force(PeakForce.SAUL_2015) == 407.9
    assert fcr.peak_force(PeakForce.DIRECT_SPECIFIC_TENSION) == pytest.approx(407.9 * 17.1 / 50.8)  # ≈ 137 N
    ecr = wrist_setup(ECR, WristOptions())
    assert ecr is not None and ecr.muscle.moment_arm_m < 0  # the extensor extends
    assert ecr.muscle.optimal_fiber_length_m == pytest.approx((337.3 * 8.1 + 252.5 * 5.9) / 589.8 / 100)
    assert wrist_setup(Muscle.SOLEUS, WristOptions()) is None


def _stream(client: TestClient, body: dict[str, object]) -> list[dict[str, object]]:
    return [json.loads(x) for x in client.post("/v1/simulations/stream", json=body).text.splitlines()]


def _angles(events: list[dict[str, object]]) -> list[float]:
    return [a for e in events if e["type"] == "chunk" for a in e["joint"]["angleDeg"]]  # type: ignore[index]


def test_a_forearm_run_streams_the_wrist_angle_and_a_leg_run_does_not() -> None:
    client = TestClient(create_app())
    body = {"modelVariant": "LITERATURE", "stimulus": {"durationMs": 300, "amplitude": 153}}
    fcr = _stream(client, {**body, "muscle": FCR.value})
    joint = fcr[0]["joint"]
    assert isinstance(joint, dict)
    assert joint["momentArmMm"] == pytest.approx(14.9)
    assert joint["peakForceN"] == pytest.approx(407.9) and joint["peakForceSource"] == "SAUL_2015"
    assert joint["passive"] == "LINEAR" and joint["flexionLimitDeg"] == 90.0
    angle = _angles(fcr)
    time = [t for e in fcr if e["type"] == "chunk" for t in e["timeMs"]]  # type: ignore[attr-defined]
    assert len(angle) == len(time) and angle[0] == 0.0  # every run starts at rest
    assert 5 < max(angle) <= 90.0 + 1e-9
    ecr = _stream(client, {**body, "muscle": ECR.value})
    assert min(_angles(ecr)) < -5  # the extensor extends
    soleus = _stream(client, {**body, "muscle": "SOLEUS"})
    assert soleus[0]["joint"] is None and all(e["joint"] is None for e in soleus if e["type"] == "chunk")


def test_the_request_chooses_the_peak_force_and_the_passive_model() -> None:
    client = TestClient(create_app())
    body = {
        "modelVariant": "LITERATURE",
        "muscle": FCR.value,
        "stimulus": {"durationMs": 100, "amplitude": 153},
        "joint": {"peakForce": "DIRECT_SPECIFIC_TENSION", "passive": "END_RANGE"},
    }
    events = _stream(client, body)
    joint = events[0]["joint"]
    assert isinstance(joint, dict)
    assert joint["peakForceN"] == pytest.approx(407.9 * 17.1 / 50.8, abs=1e-3)
    assert joint["peakForceSource"] == "DIRECT_SPECIFIC_TENSION" and joint["passive"] == "END_RANGE"
    weaker = max(_angles(events))
    stronger = max(_angles(_stream(client, {**body, "joint": {"passive": "END_RANGE"}})))
    assert weaker < stronger  # the same run with a third of the force flexes less in 100 ms
