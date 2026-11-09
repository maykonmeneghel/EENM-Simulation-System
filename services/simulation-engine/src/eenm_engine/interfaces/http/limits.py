"""Server-side caps on the request parameters that multiply compute or memory (``docs/deployment.md``).

Defence in depth: the public API enforces the same caps (same environment variables) before it calls the engine.
Every cap is off unless its variable is set, so a local engine behaves as before.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

from eenm_engine.domain.simulation import UNIT_TYPES, SimulationConfig

MAX_DURATION_MS = "EENM_MAX_DURATION_MS"
MIN_STEP_MS = "EENM_MIN_STEP_MS"
MAX_FREQUENCY_HZ = "EENM_MAX_FREQUENCY_HZ"
MAX_UNITS_PER_TYPE = "EENM_MAX_UNITS_PER_TYPE"
MAX_TOTAL_UNITS = "EENM_MAX_TOTAL_UNITS"
MAX_OUTPUT_POINTS = "EENM_MAX_OUTPUT_POINTS"
MAX_UNIT_EVENTS_DURATION_MS = "EENM_MAX_UNIT_EVENTS_DURATION_MS"

_TOLERANCE = 1e-9


@dataclass(frozen=True)
class ServerLimits:
    """``None`` = no cap. ``max_output_points`` caps ``durationMs / outputStepMs`` (samples per streamed series)."""

    max_duration_ms: float | None = None
    min_step_ms: float | None = None
    max_frequency_hz: float | None = None
    max_units_per_type: int | None = None
    max_total_units: int | None = None
    max_output_points: int | None = None
    max_unit_events_duration_ms: float | None = None

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> ServerLimits:
        source = os.environ if env is None else env

        def number(name: str) -> float | None:
            raw = source.get(name, "").strip()
            if raw == "":
                return None
            value = float(raw)
            if not value > 0:
                raise ValueError(f"{name} must be a positive number (got {raw!r})")
            return value

        def integer(name: str) -> int | None:
            value = number(name)
            if value is not None and not value.is_integer():
                raise ValueError(f"{name} must be a whole number (got {value:g})")
            return None if value is None else int(value)

        return cls(
            max_duration_ms=number(MAX_DURATION_MS),
            min_step_ms=number(MIN_STEP_MS),
            max_frequency_hz=number(MAX_FREQUENCY_HZ),
            max_units_per_type=integer(MAX_UNITS_PER_TYPE),
            max_total_units=integer(MAX_TOTAL_UNITS),
            max_output_points=integer(MAX_OUTPUT_POINTS),
            max_unit_events_duration_ms=number(MAX_UNIT_EVENTS_DURATION_MS),
        )

    def violations(self, config: SimulationConfig) -> list[tuple[tuple[str, ...], str]]:
        """``(location, message)`` per exceeded cap, the location in the request's camelCase field names."""
        found: list[tuple[tuple[str, ...], str]] = []
        s = config.stimulus
        if self.max_duration_ms is not None and s.duration_ms > self.max_duration_ms + _TOLERANCE:
            found.append(
                (("stimulus", "durationMs"), f"must be less than or equal to {self.max_duration_ms:g} (server limit)")
            )
        if self.min_step_ms is not None and s.step_ms < self.min_step_ms - _TOLERANCE:
            found.append(
                (("stimulus", "stepMs"), f"must be greater than or equal to {self.min_step_ms:g} (server limit)")
            )
        if self.max_frequency_hz is not None and s.frequency_hz > self.max_frequency_hz + _TOLERANCE:
            found.append(
                (("stimulus", "frequencyHz"), f"must be less than or equal to {self.max_frequency_hz:g} (server limit)")
            )
        counts = {t: config.units_per_type.get(t, 0) for t in UNIT_TYPES}
        if self.max_units_per_type is not None:
            for t, n in counts.items():
                if n > self.max_units_per_type:
                    found.append(
                        (
                            ("unitsPerType", t.value),
                            f"must be less than or equal to {self.max_units_per_type} (server limit)",
                        )
                    )
        if self.max_total_units is not None and sum(counts.values()) > self.max_total_units:
            found.append(
                (("unitsPerType",), f"must contain at most {self.max_total_units} motor units in total (server limit)")
            )
        output_step = config.output_stride * s.step_ms
        if self.max_output_points is not None and s.duration_ms / output_step > self.max_output_points + _TOLERANCE:
            least = s.duration_ms / self.max_output_points
            found.append(
                (
                    ("outputStepMs",),
                    f"must be at least {least:g} for this duration (at most {self.max_output_points} points per "
                    "series, server limit)",
                )
            )
        if (
            self.max_unit_events_duration_ms is not None
            and config.unit_events
            and s.duration_ms > self.max_unit_events_duration_ms + _TOLERANCE
        ):
            found.append(
                (
                    ("output", "unitEvents"),
                    f"needs stimulus.durationMs at most {self.max_unit_events_duration_ms:g} (server limit)",
                )
            )
        return found
