"""Motor-unit pool: motoneuron geometry and muscle-fibre properties per unit.

Port of ``Mathematical Model/createUMs.m`` and ``demangeMNs.m``. The original repeats the same
block for each unit type (S, FR, FF) and each property; here the numbers live in one table
(``TYPE_RANGES``) and one function spreads them over the pool.

Every property uses the original's "Linear Interpolation" distribution: the values go linearly from
``first`` to ``last`` across the *whole* muscle pool (e.g. 800 S units in the soleus). ``demangeMNs``
then simulates only the first units of each type, so the simulated units are the smallest ones.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.model_options import UnitSelection

GRID_STEP = 1e-4
"""Step of MATLAB's ``Min:1e-04:Max`` ranges, which fixes the last value actually reached."""


class MotorUnitType(Enum):
    S = "S"
    FR = "FR"
    FF = "FF"


class Muscle(Enum):
    SOLEUS = "SOLEUS"
    GASTROCNEMIUS_MEDIAL = "GASTROCNEMIUS_MEDIAL"
    GASTROCNEMIUS_LATERAL = "GASTROCNEMIUS_LATERAL"
    TIBIALIS_ANTERIOR = "TIBIALIS_ANTERIOR"


class Geometry(Enum):
    CYLINDRICAL = "CYLINDRICAL"
    SPHERICAL = "SPHERICAL"


@dataclass(frozen=True)
class MusclePreset:
    muscle: Muscle
    label: str
    pool_size: dict[MotorUnitType, int]


MUSCLE_PRESETS: dict[Muscle, MusclePreset] = {
    preset.muscle: preset
    for preset in (
        MusclePreset(Muscle.SOLEUS, "Soleus", {MotorUnitType.S: 800, MotorUnitType.FR: 50, MotorUnitType.FF: 50}),
        MusclePreset(
            Muscle.GASTROCNEMIUS_MEDIAL,
            "Gastrocnemius Medial",
            {MotorUnitType.S: 250, MotorUnitType.FR: 125, MotorUnitType.FF: 125},
        ),
        MusclePreset(
            Muscle.GASTROCNEMIUS_LATERAL,
            "Gastrocnemius Lateral",
            {MotorUnitType.S: 200, MotorUnitType.FR: 100, MotorUnitType.FF: 100},
        ),
        MusclePreset(
            Muscle.TIBIALIS_ANTERIOR,
            "Tibial Anterior",
            {MotorUnitType.S: 250, MotorUnitType.FR: 50, MotorUnitType.FF: 50},
        ),
    )
}


@dataclass(frozen=True)
class ValueRange:
    """``Min``/``Max`` of one property in ``createUMs.m`` (``Max`` may be smaller than ``Min``)."""

    first: float
    last: float


@dataclass(frozen=True)
class TypeRanges:
    soma_diameter_um: ValueRange
    soma_length_um: ValueRange
    dendrite_diameter_um: ValueRange
    dendrite_length_mm: ValueRange
    muap_scale: ValueRange  # APSF — action potential scale factor
    muap_time_factor: ValueRange  # APTF — action potential time factor
    muap_arrival: ValueRange  # APAT — action potential arrival time (conduction factor)
    twitch_peak: ValueRange  # MT   — twitch amplitude
    twitch_time_to_peak_ms: ValueRange  # MTTP — twitch time to peak
    tetanic_force: ValueRange  # MTF  — tetanic force (defined but unused by the original model)


TYPE_RANGES: dict[MotorUnitType, TypeRanges] = {
    MotorUnitType.S: TypeRanges(
        soma_diameter_um=ValueRange(77.5, 82.5),
        soma_length_um=ValueRange(77.5, 82.5),
        dendrite_diameter_um=ValueRange(41.5, 62.5),
        dendrite_length_mm=ValueRange(5.5, 6.8),
        muap_scale=ValueRange(0.105, 0.125),
        muap_time_factor=ValueRange(0.8, 0.7),
        muap_arrival=ValueRange(44, 47),
        twitch_peak=ValueRange(0.103, 0.123),
        twitch_time_to_peak_ms=ValueRange(110, 100),
        tetanic_force=ValueRange(0.392, 0.491),
    ),
    MotorUnitType.FR: TypeRanges(
        soma_diameter_um=ValueRange(82.5, 87.5),
        soma_length_um=ValueRange(82.5, 87.5),
        dendrite_diameter_um=ValueRange(62.5, 83.5),
        dendrite_length_mm=ValueRange(6.8, 8.1),
        muap_scale=ValueRange(0.125, 0.3),
        muap_time_factor=ValueRange(0.7, 0.6),
        muap_arrival=ValueRange(47, 50),
        twitch_peak=ValueRange(0.123, 0.294),
        twitch_time_to_peak_ms=ValueRange(73.5, 55.5),
        tetanic_force=ValueRange(0.491, 1.177),
    ),
    MotorUnitType.FF: TypeRanges(
        soma_diameter_um=ValueRange(87.5, 113),
        soma_length_um=ValueRange(87.5, 113),
        dendrite_diameter_um=ValueRange(83.5, 92.5),
        dendrite_length_mm=ValueRange(8.1, 10.6),
        muap_scale=ValueRange(0.3, 0.5),
        muap_time_factor=ValueRange(0.6, 0.5),
        muap_arrival=ValueRange(50, 53),
        twitch_peak=ValueRange(0.294, 0.491),
        twitch_time_to_peak_ms=ValueRange(82.3, 56.9),
        tetanic_force=ValueRange(1.177, 1.962),
    ),
}


@dataclass(frozen=True)
class MotorUnitGroup:
    """The simulated units of one type; every array has one entry per unit."""

    unit_type: MotorUnitType
    soma_area_fraction: NDArray[np.float64]  # ``Parameters...Area``: soma area / (soma + dendrite area)
    muap_scale: NDArray[np.float64]
    muap_time_factor: NDArray[np.float64]
    muap_delay_samples: NDArray[np.int64]
    twitch_peak: NDArray[np.float64]
    twitch_time_to_peak_ms: NDArray[np.float64]
    pool_rank: NDArray[np.int64] | None = None
    """Rank of each unit by twitch amplitude in the whole muscle pool (S first, then FR, then FF)."""

    @property
    def size(self) -> int:
        return int(self.soma_area_fraction.size)


def interpolated_values(value_range: ValueRange, count: int) -> NDArray[np.float64]:
    """MATLAB ``interp1(1:L, a:±1e-4:b, linspace(1, L, count))``.

    Equivalent to ``linspace(a, last, count)`` where ``last`` is the final element MATLAB's colon
    range actually reaches. With ``count == 1`` MATLAB's ``linspace(1, L, 1)`` returns ``L``, i.e. the
    *last* value (NumPy would return the first).
    """
    if count < 1:
        return np.empty(0)
    a, b = value_range.first, value_range.last
    step = GRID_STEP if b >= a else -GRID_STEP
    steps = math.floor((b - a) / step + 1e-9)
    last = a + steps * step
    if count == 1:
        return np.array([last])
    return np.linspace(a, last, count)


def proportional_units(muscle: Muscle, total: int) -> dict[MotorUnitType, int]:
    """``total`` simulated units split across types in the proportions of the muscle's pool.

    Largest-remainder rounding (ties to the smaller type); every type present in the pool gets at least
    one unit when ``total`` allows it.
    """
    pool = MUSCLE_PRESETS[muscle].pool_size
    size = sum(pool.values())
    if not 1 <= total <= size:
        raise ValueError(f"total must be between 1 and {size}")
    exact = {t: total * n / size for t, n in pool.items()}
    counts = {t: max(1, math.floor(v)) if total >= len(pool) else math.floor(v) for t, v in exact.items()}
    # ties go to the smaller type, for which one more unit improves the representation the most
    by_remainder = sorted(pool, key=lambda t: (round(exact[t] - math.floor(exact[t]), 9), -exact[t]), reverse=True)
    i = 0
    while sum(counts.values()) < total:
        counts[by_remainder[i % len(by_remainder)]] += 1
        i += 1
    while sum(counts.values()) > total:  # only possible after the minimum-one rule
        largest = max(counts, key=lambda t: counts[t])
        counts[largest] -= 1
    return counts


def pool_twitch_range(muscle: Muscle) -> tuple[float, float]:
    """Weakest and strongest twitch amplitude (MT) in the whole pool of the muscle."""
    values = [interpolated_values(TYPE_RANGES[t].twitch_peak, n) for t, n in MUSCLE_PRESETS[muscle].pool_size.items()]
    every = np.concatenate(values)
    return float(every.min()), float(every.max())


def selected_units(pool_size: int, count: int, selection: UnitSelection) -> NDArray[np.int64]:
    """Indices, within the pool, of the units to simulate (increasing)."""
    if selection is UnitSelection.FIRST_OF_POOL:
        return np.arange(count, dtype=np.int64)
    return np.floor((np.arange(count) + 0.5) * pool_size / count).astype(np.int64) if count else np.empty(0, np.int64)


def _area(radius_cm: NDArray[np.float64], length_cm: NDArray[np.float64], geometry: Geometry) -> NDArray[np.float64]:
    if geometry is Geometry.SPHERICAL:
        return 4.0 * np.pi * radius_cm**2
    return 2.0 * np.pi * radius_cm * length_cm


def build_group(
    unit_type: MotorUnitType,
    muscle: Muscle,
    simulated_units: int,
    axon_length_percent: float,
    samples_per_duration: float,
    soma_geometry: Geometry = Geometry.CYLINDRICAL,
    dendrite_geometry: Geometry = Geometry.CYLINDRICAL,
    selection: UnitSelection = UnitSelection.FIRST_OF_POOL,
) -> MotorUnitGroup:
    """Build one type's units as ``createUMs`` + ``demangeMNs`` do.

    ``samples_per_duration`` is ``tmax / step`` from ``currentEENM``: the original converts the
    arrival-time factor into a delay in samples with it, so the delay depends on the simulated duration.
    """
    pool_size = MUSCLE_PRESETS[muscle].pool_size[unit_type]
    if not 0 <= simulated_units <= pool_size:
        raise ValueError(f"{unit_type.value}: simulated units must be between 0 and {pool_size}")
    r = TYPE_RANGES[unit_type]
    chosen = selected_units(pool_size, simulated_units, selection)

    def spread(value_range: ValueRange) -> NDArray[np.float64]:
        return interpolated_values(value_range, pool_size)[chosen]

    soma_radius_cm = spread(r.soma_diameter_um) / 2 * 1e-4
    dendrite_radius_cm = spread(r.dendrite_diameter_um) / 2 * 1e-4
    soma_length_cm = spread(r.soma_length_um) * 1e-4
    dendrite_length_cm = spread(r.dendrite_length_mm) * 0.1
    soma_area = _area(soma_radius_cm, soma_length_cm, soma_geometry)
    dendrite_area = _area(dendrite_radius_cm, dendrite_length_cm, dendrite_geometry)

    arrival = spread(r.muap_arrival)
    # MATLAB's round() rounds halves away from zero; np.round() would round them to even.
    delay = np.floor((axon_length_percent / 100.0) / arrival * samples_per_duration + 0.5).astype(np.int64)

    return MotorUnitGroup(
        unit_type=unit_type,
        soma_area_fraction=soma_area / (soma_area + dendrite_area),
        muap_scale=spread(r.muap_scale),
        muap_time_factor=spread(r.muap_time_factor),
        muap_delay_samples=delay,
        twitch_peak=spread(r.twitch_peak),
        twitch_time_to_peak_ms=spread(r.twitch_time_to_peak_ms),
        pool_rank=_type_offset(muscle, unit_type) + chosen,
    )


def _type_offset(muscle: Muscle, unit_type: MotorUnitType) -> int:
    """Units of the types before this one in the pool order S, FR, FF (increasing twitch amplitude)."""
    pool = MUSCLE_PRESETS[muscle].pool_size
    order = (MotorUnitType.S, MotorUnitType.FR, MotorUnitType.FF)
    return sum(pool[t] for t in order[: order.index(unit_type)])
