package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.muscle.PresetFieldSource;
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
        List<PresetFieldSource> provenance = body.provenance() == null
                ? List.of()
                : body.provenance().stream().map(this::toDomain).toList();
        return new MusclePreset(body.id(), body.label(),
                new MotorUnitCounts(pool.slow(), pool.fastResistant(), pool.fastFatigable()), provenance);
    }

    private PresetFieldSource toDomain(EngineMusclePresetBody.FieldSource f) {
        if (f == null || f.field() == null || f.provenance() == null || f.value() == null) {
            throw new EngineProtocolException("Engine sent an incomplete muscle preset source");
        }
        EngineMusclePresetBody.Source s = f.source();
        PresetFieldSource.Reference reference =
                s == null ? null : new PresetFieldSource.Reference(s.citation(), s.title(), s.doi(), s.pmid());
        return new PresetFieldSource(f.field(), f.provenance(), f.value(), reference, f.evidence(),
                f.calibrationTarget());
    }
}
