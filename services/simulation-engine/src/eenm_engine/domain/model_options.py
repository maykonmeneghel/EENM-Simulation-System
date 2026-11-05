"""Switchable corrections to the original model.

Every correction is opt-in: ``ModelOptions()`` reproduces the MATLAB model exactly (see
``docs/matlab-port-notes.md``), so the faithful port stays available as a reference and each change can
be validated against the literature on its own (``docs/validation/literature-comparison.md``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from eenm_engine.domain.axon_stimulation import AxonExcitability
from eenm_engine.domain.fatigue import FatigueModel
from eenm_engine.domain.twitch import TwitchShape


class UnitSelection(Enum):
    """Which units of each type's pool are simulated."""

    FIRST_OF_POOL = "FIRST_OF_POOL"
    """``demangeMNs``: the first units of the interpolated pool, i.e. the smallest and slowest (Q8)."""

    SPREAD_ACROSS_POOL = "SPREAD_ACROSS_POOL"
    """One unit at the centre of each of ``n`` equal slices of the pool, so the simulated units span
    the whole range of sizes and twitch speeds of their type."""


class TwitchDrive(Enum):
    """What triggers each unit's twitches."""

    SUMMED_MUAP_PEAKS = "SUMMED_MUAP_PEAKS"
    """``Main.m``: peaks of the type's *summed* MUAP, weighted by the peak value, shared by all units (Q2)."""

    OWN_SPIKES = "OWN_SPIKES"
    """Each unit's own action potentials, on arrival at the muscle (peak + conduction delay), weight 1."""


class ForceAggregation(Enum):
    MEAN_PER_TYPE = "MEAN_PER_TYPE"
    """``Main.m``: mean over each type's units, then the sum of the three means (Q7)."""

    SUM = "SUM"
    """Linear sum of all unit forces (Potvin & Fuglevand 2017), so force grows with recruitment."""


class StimulationSite(Enum):
    MOTONEURON_SOMA = "MOTONEURON_SOMA"
    """The original: the stimulus current enters the motoneuron compartments (Q1)."""

    MOTOR_AXONS = "MOTOR_AXONS"
    """Surface stimulation of motor axons through the analytic recruitment layer (``axon_stimulation``)."""


@dataclass(frozen=True)
class ModelOptions:
    unit_selection: UnitSelection = UnitSelection.FIRST_OF_POOL
    twitch_shape: TwitchShape = field(default_factory=TwitchShape)
    twitch_time_scale: float = 1.0
    """Multiplies every unit's twitch contraction time (MTTP), keeping the S/FR/FF proportions."""
    twitch_drive: TwitchDrive = TwitchDrive.SUMMED_MUAP_PEAKS
    rate_gain: bool = False
    """Force saturation with firing rate (``twitch.RateGain``); requires ``OWN_SPIKES``."""
    force_aggregation: ForceAggregation = ForceAggregation.MEAN_PER_TYPE
    stimulation_site: StimulationSite = StimulationSite.MOTONEURON_SOMA
    axon_excitability: AxonExcitability = field(default_factory=AxonExcitability)
    fixed_conduction_delay: bool = False
    """MUAP/twitch delay = axon length / conduction velocity (APAT read as m/s), independent of the simulated
    duration. The original multiplies by ``tmax/step`` (Q4), which is only right for ``tmax = 1000 ms``."""
    fatigue: FatigueModel | None = None
    """Peripheral fatigue (Potvin & Fuglevand 2017); needs ``rate_gain`` and the generalised twitch."""
    represent_pool: bool = False
    """Weight each simulated unit by the number of pool units it stands for (pool size / simulated units of
    its type), so the summed force has the composition and scale of the whole muscle. Requires ``SUM``."""

    def __post_init__(self) -> None:
        if self.twitch_time_scale <= 0:
            raise ValueError("twitch_time_scale must be positive")
        if self.represent_pool and self.force_aggregation is not ForceAggregation.SUM:
            raise ValueError("represent_pool weights a sum of unit forces (force_aggregation = SUM)")
        if self.fatigue is not None and (not self.rate_gain or self.twitch_shape.is_original):
            raise ValueError("fatigue needs rate_gain (normalised force) and a twitch exponent other than 1")
        if self.rate_gain and self.twitch_drive is not TwitchDrive.OWN_SPIKES:
            raise ValueError("rate_gain needs each unit's own spikes (twitch_drive = OWN_SPIKES)")

    @classmethod
    def original(cls) -> ModelOptions:
        return cls()

    @classmethod
    def literature(cls) -> ModelOptions:
        """Every correction validated in ``docs/validation/literature-comparison.md`` (steps 1–5).

        Twitch scale and exponent were fitted by ``validation/calibrate.py axons`` on 120 units in the soleus
        pool's proportions; use it with ``proportional_units`` (see ``LITERATURE_UNITS``).
        """
        return cls(
            unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
            twitch_shape=TwitchShape(exponent=3.9461),
            twitch_time_scale=1.2772,
            twitch_drive=TwitchDrive.OWN_SPIKES,
            rate_gain=True,
            force_aggregation=ForceAggregation.SUM,
            stimulation_site=StimulationSite.MOTOR_AXONS,
            fixed_conduction_delay=True,
            fatigue=FatigueModel(),
            represent_pool=True,
        )


LITERATURE_UNITS = 120
"""Simulated units with ``ModelOptions.literature()`` (as in Potvin & Fuglevand 2017)."""
