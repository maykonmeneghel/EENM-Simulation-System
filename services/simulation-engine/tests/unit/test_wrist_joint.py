"""Wrist joint (central-layer design §3.5): the 1-DOF dynamics and its limits."""

from __future__ import annotations

import math

import numpy as np
import pytest

from eenm_engine.domain.motor_unit_pool import Muscle
from eenm_engine.domain.wrist_joint import WristIntegrator, WristJoint, muscle_torque

STEP_MS = 0.1


DEFAULT = WristJoint()


def _run(torque: np.ndarray, joint: WristJoint = DEFAULT, step_ms: float = STEP_MS) -> np.ndarray:
    return WristIntegrator(joint, step_ms).advance(torque)


def test_a_small_constant_torque_settles_at_torque_over_stiffness() -> None:
    angle = _run(np.full(30_000, 0.1))  # 3 s
    assert angle[-1] == pytest.approx(0.1 / 0.992, rel=1e-3)


def test_released_it_rings_at_the_damped_natural_frequency_and_returns_to_rest() -> None:
    torque = np.concatenate([np.full(20_000, 0.1), np.zeros(40_000)])  # hold 2 s, release for 4 s
    angle = _run(torque)
    free = angle[20_000:]
    crossings = np.flatnonzero(np.diff(np.sign(free)) != 0)
    period_s = 2 * np.mean(np.diff(crossings)) * STEP_MS / 1000
    zeta = 0.028 / (2 * math.sqrt(0.992 * 0.003))
    damped_hz = math.sqrt(0.992 / 0.003) * math.sqrt(1 - zeta**2) / (2 * math.pi)
    assert 1 / period_s == pytest.approx(damped_hz, rel=0.01)  # ≈ 2.8 Hz: I, B, K are the ones used
    assert abs(free[-1]) < 1e-3 * abs(free[0])


def test_the_angle_stops_at_the_limits() -> None:
    flexed = _run(np.full(10_000, 6.0))  # a maximal FCR: 407.9 N × 14.9 mm ≈ 6.1 N·m
    assert flexed.max() == pytest.approx(math.radians(54))
    extended = _run(np.full(10_000, -6.0))
    assert extended.min() == pytest.approx(-math.radians(60))


def test_the_result_does_not_depend_on_the_output_step() -> None:
    fine = _run(np.full(10_001, 0.2))[::10]
    coarse = _run(np.full(1_001, 0.2), step_ms=1.0)
    np.testing.assert_allclose(fine, coarse, atol=2e-3)


def test_flexor_flexes_extensor_extends_leg_muscles_do_not_act() -> None:
    full = np.ones(1)
    fcr = muscle_torque(Muscle.FLEXOR_CARPI_RADIALIS, full)
    ecr = muscle_torque(Muscle.EXTENSOR_CARPI_RADIALIS, full)
    assert fcr is not None and ecr is not None
    assert fcr[0] == pytest.approx(0.0149 * 407.9) and ecr[0] == pytest.approx(-0.0115 * 589.8)
    assert muscle_torque(Muscle.SOLEUS, full) is None


def test_a_forearm_run_streams_the_wrist_angle_and_a_leg_run_does_not() -> None:
    import json

    from fastapi.testclient import TestClient

    from eenm_engine.interfaces.http.app import create_app

    client = TestClient(create_app())
    body = {"modelVariant": "LITERATURE", "stimulus": {"durationMs": 300, "amplitude": 153}}
    fcr = [
        json.loads(x)
        for x in client.post(
            "/v1/simulations/stream", json={**body, "muscle": "FLEXOR_CARPI_RADIALIS"}
        ).text.splitlines()
    ]
    assert fcr[0]["joint"]["momentArmMm"] == pytest.approx(14.9)
    angle = [a for e in fcr if e["type"] == "chunk" for a in e["joint"]["angleDeg"]]
    time = [t for e in fcr if e["type"] == "chunk" for t in e["timeMs"]]
    assert len(angle) == len(time) and angle[0] == 0.0
    assert 5 < max(angle) <= 54.0 + 1e-9  # a 40 Hz supramaximal train flexes the wrist, up to the limit
    ecr = [
        json.loads(x)
        for x in client.post(
            "/v1/simulations/stream", json={**body, "muscle": "EXTENSOR_CARPI_RADIALIS"}
        ).text.splitlines()
    ]
    assert min(a for e in ecr if e["type"] == "chunk" for a in e["joint"]["angleDeg"]) < -5  # the extensor extends
    soleus = [
        json.loads(x)
        for x in client.post("/v1/simulations/stream", json={**body, "muscle": "SOLEUS"}).text.splitlines()
    ]
    assert soleus[0]["joint"] is None and all(e["joint"] is None for e in soleus if e["type"] == "chunk")
