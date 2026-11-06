"""What each simulated unit looks like, for the 3D view (``docs/design/3d-view.md`` §4): the geometry of the motoneuron
model that actually ran, the conduction times of its axon and the pool units it stands for.

Nothing here feeds the simulation; it restates, per unit, values the run already uses.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain import cisi_kohn
from eenm_engine.domain.central_drive import split_at_electrode
from eenm_engine.domain.model_options import StimulationSite
from eenm_engine.domain.motor_unit_pool import (
    MUSCLE_PRESETS,
    TYPE_RANGES,
    MotorUnitType,
    interpolated_values,
)
from eenm_engine.domain.simulation import UNIT_TYPES, MotorUnitSetup, SimulationConfig


class MotoneuronModel(Enum):
    BOOTH_1997 = "BOOTH_1997"
    """The original model's motoneuron (``motor_unit_pool.TYPE_RANGES``)."""
    CISI_KOHN_2008 = "CISI_KOHN_2008"
    """The motoneuron that receives the central drive (``cisi_kohn.TYPE_PARAMETERS``)."""


@dataclass(frozen=True)
class UnitAnatomy:
    """One entry per simulated unit, in the column order of ``MotorUnitSetup`` (S, FR, FF)."""

    motoneuron: MotoneuronModel
    unit_type: list[MotorUnitType]
    pool_index: NDArray[np.int64]
    """Position of the unit within its type in the muscle pool (0 = the smallest)."""
    soma_diameter_um: NDArray[np.float64]
    """Soma diameter; the soma is a cylinder as long as it is wide in both models."""
    dendrite_diameter_um: NDArray[np.float64]
    dendrite_length_mm: NDArray[np.float64]
    """The dendrite is one equivalent cylinder, not a branched tree."""
    conduction_ms: NDArray[np.float64]
    """Soma → muscle delay the run applies (``muap_delay_samples`` × step)."""
    to_electrode_ms: NDArray[np.float64] | None
    """Soma → electrode and electrode → muscle parts (``split_at_electrode``); ``None`` when the stimulus goes into the
    soma (no electrode on the axon)."""
    to_muscle_ms: NDArray[np.float64] | None
    weight: NDArray[np.float64]
    """Pool units this simulated unit stands for (1 without ``represent_pool``)."""
    axon_rheobase: NDArray[np.float64]
    """Rheobase of the unit's axon at the electrode, in the stimulus's units (Weiss; used with axon stimulation)."""

    @property
    def size(self) -> int:
        return int(self.pool_index.size)


def unit_anatomy(setup: MotorUnitSetup, config: SimulationConfig) -> UnitAnatomy:
    pool = MUSCLE_PRESETS[config.muscle].pool_size
    drive = config.model.central_drive is not None
    model = MotoneuronModel.CISI_KOHN_2008 if drive else MotoneuronModel.BOOTH_1997
    types: list[MotorUnitType] = []
    index_blocks: list[NDArray[np.int64]] = []
    delay: list[NDArray[np.int64]] = []
    soma: list[NDArray[np.float64]] = []
    dend_d: list[NDArray[np.float64]] = []
    dend_l: list[NDArray[np.float64]] = []
    weight: list[NDArray[np.float64]] = []
    offset = 0
    for t in UNIT_TYPES:
        group = setup.groups[t]
        n = group.size
        if n:
            rank = group.pool_rank if group.pool_rank is not None else np.arange(n, dtype=np.int64) + offset
            index = np.asarray(rank - offset, dtype=np.int64)
            if drive:
                p = cisi_kohn.TYPE_PARAMETERS[t]
                soma.append(cisi_kohn._spread(p.soma_diameter_um, pool[t], index))
                dend_d.append(cisi_kohn._spread(p.dendrite_diameter_um, pool[t], index))
                dend_l.append(cisi_kohn._spread(p.dendrite_length_um, pool[t], index) / 1000.0)
            else:
                r = TYPE_RANGES[t]
                soma.append(interpolated_values(r.soma_diameter_um, pool[t])[index])
                dend_d.append(interpolated_values(r.dendrite_diameter_um, pool[t])[index])
                dend_l.append(interpolated_values(r.dendrite_length_mm, pool[t])[index])
            types.extend([t] * n)
            index_blocks.append(index)
            delay.append(group.muap_delay_samples)
            weight.append(np.full(n, pool[t] / n if config.model.represent_pool else 1.0))
        offset += pool[t]

    def floats(blocks: list[NDArray[np.float64]]) -> NDArray[np.float64]:
        return np.concatenate(blocks).astype(np.float64) if blocks else np.empty(0, np.float64)

    def ints(blocks: list[NDArray[np.int64]]) -> NDArray[np.int64]:
        return np.concatenate(blocks).astype(np.int64) if blocks else np.empty(0, np.int64)

    step = config.stimulus.step_ms
    delay_samples = ints(delay)
    to_electrode: NDArray[np.float64] | None = None
    to_muscle: NDArray[np.float64] | None = None
    if config.model.stimulation_site is not StimulationSite.MOTONEURON_SOMA:
        a, b = split_at_electrode(delay_samples, config.model.electrode_fraction)
        to_electrode, to_muscle = (a * step).astype(np.float64), (b * step).astype(np.float64)
    return UnitAnatomy(
        motoneuron=model,
        unit_type=types,
        pool_index=ints(index_blocks),
        soma_diameter_um=floats(soma),
        dendrite_diameter_um=floats(dend_d),
        dendrite_length_mm=floats(dend_l),
        conduction_ms=(delay_samples * step).astype(np.float64),
        to_electrode_ms=to_electrode,
        to_muscle_ms=to_muscle,
        weight=floats(weight),
        axon_rheobase=np.asarray(setup.axon_rheobase, dtype=np.float64),
    )
