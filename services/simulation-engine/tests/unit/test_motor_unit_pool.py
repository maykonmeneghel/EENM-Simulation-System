import math

import numpy as np
import pytest

from eenm_engine.domain.motor_unit_pool import (
    Geometry,
    MotorUnitType,
    Muscle,
    ValueRange,
    build_group,
    interpolated_values,
)


def test_interpolation_spans_the_range_reached_by_matlab_colon() -> None:
    values = interpolated_values(ValueRange(77.5, 82.5), 800)
    assert values[0] == pytest.approx(77.5) and values[-1] == pytest.approx(82.5)
    assert np.all(np.diff(values) > 0)


def test_interpolation_supports_decreasing_ranges() -> None:
    values = interpolated_values(ValueRange(110, 100), 3)
    np.testing.assert_allclose(values, [110, 105, 100])


def test_single_unit_takes_the_last_value_like_matlab_linspace() -> None:
    assert interpolated_values(ValueRange(1.0, 2.0), 1)[0] == pytest.approx(2.0)


def test_last_value_is_truncated_to_the_1e4_grid() -> None:
    assert interpolated_values(ValueRange(0.0, 0.00015), 2)[-1] == pytest.approx(0.0001)


def test_simulated_units_are_the_first_of_the_whole_muscle_pool() -> None:
    group = build_group(MotorUnitType.S, Muscle.SOLEUS, 5, 80, 1e5)
    full = interpolated_values(ValueRange(0.105, 0.125), 800)
    np.testing.assert_allclose(group.muap_scale, full[:5])


def test_soma_area_fraction_for_cylindrical_compartments() -> None:
    group = build_group(MotorUnitType.S, Muscle.SOLEUS, 1, 80, 1e5)
    soma = 2 * math.pi * (77.5 / 2 * 1e-4) * (77.5 * 1e-4)
    dendrite = 2 * math.pi * (41.5 / 2 * 1e-4) * (5.5 * 0.1)
    assert group.soma_area_fraction[0] == pytest.approx(soma / (soma + dendrite))


def test_spherical_geometry_uses_sphere_area() -> None:
    group = build_group(MotorUnitType.S, Muscle.SOLEUS, 1, 80, 1e5, Geometry.SPHERICAL, Geometry.SPHERICAL)
    soma = 4 * math.pi * (77.5 / 2 * 1e-4) ** 2
    dendrite = 4 * math.pi * (41.5 / 2 * 1e-4) ** 2
    assert group.soma_area_fraction[0] == pytest.approx(soma / (soma + dendrite))


def test_muap_delay_in_samples_depends_on_axon_length_and_duration() -> None:
    group = build_group(MotorUnitType.S, Muscle.SOLEUS, 1, 80, 1e5)
    assert group.muap_delay_samples[0] == round(0.8 / 44 * 1e5)  # 1818


def test_muap_delay_rounds_halves_away_from_zero_like_matlab() -> None:
    # 0.5 / 44 * 220 = 2.5 -> MATLAB round = 3 (NumPy's round-half-even would give 2)
    group = build_group(MotorUnitType.S, Muscle.SOLEUS, 1, 50, 220)
    assert group.muap_delay_samples[0] == 3


def test_more_units_than_the_muscle_has_is_rejected() -> None:
    with pytest.raises(ValueError):
        build_group(MotorUnitType.FR, Muscle.SOLEUS, 51, 80, 1e5)


def test_first_of_pool_selection_takes_the_first_units() -> None:
    from eenm_engine.domain.model_options import UnitSelection
    from eenm_engine.domain.motor_unit_pool import selected_units

    assert selected_units(800, 5, UnitSelection.FIRST_OF_POOL).tolist() == [0, 1, 2, 3, 4]


def test_spread_selection_takes_the_centre_of_equal_slices() -> None:
    from eenm_engine.domain.model_options import UnitSelection
    from eenm_engine.domain.motor_unit_pool import selected_units

    assert selected_units(800, 5, UnitSelection.SPREAD_ACROSS_POOL).tolist() == [80, 240, 400, 560, 720]
    assert selected_units(50, 2, UnitSelection.SPREAD_ACROSS_POOL).tolist() == [12, 37]
    assert selected_units(50, 1, UnitSelection.SPREAD_ACROSS_POOL).tolist() == [25]


def test_spread_selection_covers_fast_and_slow_units_of_a_type() -> None:
    from eenm_engine.domain.model_options import UnitSelection

    first = build_group(MotorUnitType.FF, Muscle.SOLEUS, 2, 80, 1e5)
    spread = build_group(MotorUnitType.FF, Muscle.SOLEUS, 2, 80, 1e5, selection=UnitSelection.SPREAD_ACROSS_POOL)
    assert first.twitch_time_to_peak_ms.min() > 81  # the two slowest FF units (82.3, 81.8 ms)
    assert spread.twitch_time_to_peak_ms.min() < 66  # reaches into the fast half of the range


def test_proportional_units_follow_the_pool_composition() -> None:
    from eenm_engine.domain.motor_unit_pool import proportional_units

    counts = proportional_units(Muscle.SOLEUS, 120)  # pool 800 / 50 / 50
    assert sum(counts.values()) == 120
    assert counts[MotorUnitType.S] == 106
    assert {counts[MotorUnitType.FR], counts[MotorUnitType.FF]} == {7}
    tiny = proportional_units(Muscle.SOLEUS, 3)
    assert all(n == 1 for n in tiny.values())  # every type represented


def test_proportional_units_rejects_impossible_totals() -> None:
    from eenm_engine.domain.motor_unit_pool import proportional_units

    with pytest.raises(ValueError):
        proportional_units(Muscle.SOLEUS, 0)


def test_fixed_conduction_delay_equals_the_original_at_one_second_and_ignores_duration() -> None:
    from eenm_engine.domain.model_options import ModelOptions
    from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
    from eenm_engine.domain.stimulus import StimulusProtocol

    def delay(duration_ms: float, fixed: bool) -> int:
        config = SimulationConfig(
            stimulus=StimulusProtocol(duration_ms=duration_ms), model=ModelOptions(fixed_conduction_delay=fixed)
        )
        return int(MotorUnitSetup.from_config(config).groups[MotorUnitType.S].muap_delay_samples[0])

    assert delay(1000, fixed=True) == delay(1000, fixed=False) == 1818  # 0.8 m / 44 m/s = 18.18 ms
    assert delay(50, fixed=True) == 1818
    assert delay(50, fixed=False) == 91  # the original's duration-dependent delay (Q4)
