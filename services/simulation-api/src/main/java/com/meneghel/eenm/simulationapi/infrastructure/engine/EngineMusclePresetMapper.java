package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

final class EngineMusclePresetMapper {

    List<MusclePreset> toDomain(List<EngineMusclePresetBody> bodies) {
        return bodies.stream().map(this::toDomain).toList();
    }

    private MusclePreset toDomain(EngineMusclePresetBody body) {
        EngineMusclePresetBody.PoolSize pool = body.poolSize();
        boolean complete = body.id() != null && body.label() != null && pool != null
                && Stream.of(pool.slow(), pool.fastResistant(), pool.fastFatigable()).allMatch(Objects::nonNull);
        if (!complete) {
            throw new EngineProtocolException("Engine sent an incomplete muscle preset");
        }
        return new MusclePreset(body.id(), body.label(),
                new MotorUnitCounts(pool.slow(), pool.fastResistant(), pool.fastFatigable()));
    }
}
