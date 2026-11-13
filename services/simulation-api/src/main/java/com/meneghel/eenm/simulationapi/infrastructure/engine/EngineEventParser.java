package com.meneghel.eenm.simulationapi.infrastructure.engine;

import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.integers;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.longs;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.number;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.numbers;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.object;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.text;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.texts;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.unitCounts;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.domain.event.AxonEvents;
import com.meneghel.eenm.simulationapi.domain.event.FatigueSnapshot;
import com.meneghel.eenm.simulationapi.domain.event.ForceSeries;
import com.meneghel.eenm.simulationapi.domain.event.SimulationChunk;
import com.meneghel.eenm.simulationapi.domain.event.SimulationCompleted;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.event.SimulationFailed;
import com.meneghel.eenm.simulationapi.domain.event.RunElectrode;
import com.meneghel.eenm.simulationapi.domain.event.SimulationStarted;
import com.meneghel.eenm.simulationapi.domain.event.SimulationSummary;
import com.meneghel.eenm.simulationapi.domain.event.UnitAnatomy;
import com.meneghel.eenm.simulationapi.domain.event.UnitEvents;
import com.meneghel.eenm.simulationapi.domain.event.JointSeries;
import com.meneghel.eenm.simulationapi.domain.event.WristJoint;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Turns one NDJSON line from the engine into a domain event. A line that is not valid JSON or misses a
 * required field raises {@link EngineProtocolException}; an unknown event type is skipped so the engine
 * can add event types without breaking the API.
 */
final class EngineEventParser {

    private static final Logger LOGGER = LoggerFactory.getLogger(EngineEventParser.class);

    private final ObjectMapper objectMapper;

    EngineEventParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    Optional<SimulationEvent> parse(String line) {
        JsonNode node = readObject(line);
        String type = text(node, "type");
        return switch (type) {
            case SimulationStarted.TYPE -> Optional.of(started(node));
            case SimulationChunk.TYPE -> Optional.of(chunk(node));
            case SimulationCompleted.TYPE -> Optional.of(completed(node));
            case SimulationFailed.TYPE -> Optional.of(failed(node));
            default -> skipUnknown(type);
        };
    }

    private JsonNode readObject(String line) {
        try {
            JsonNode node = objectMapper.readTree(line);
            if (node == null || !node.isObject()) {
                throw new EngineProtocolException("Engine sent a line that is not a JSON object");
            }
            return node;
        } catch (JacksonException malformed) {
            throw new EngineProtocolException("Engine sent a line that is not valid JSON", malformed);
        }
    }

    private SimulationStarted started(JsonNode node) {
        return new SimulationStarted(
                text(node, "simulationId"),
                number(node, "durationMs"),
                number(node, "outputStepMs"),
                unitCounts(node, "motorUnits"),
                text(node, "muscle"),
                optionalNumber(node, "maxForce"),
                optionalNumber(node, "electrodeFraction"),
                units(node.get("units")),
                optionalNumber(node, "stepMs"),
                wristJoint(node.get("joint")),
                runElectrode(node.get("electrode")),
                optionalText(node, "amplitudeUnit"));
    }

    /** Absent or {@code null} outside skin-surface LITERATURE runs (or from an engine older than the field). */
    private static RunElectrode runElectrode(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isObject()) {
            throw new EngineProtocolException("Engine field 'electrode' must be an object");
        }
        JsonNode c = node.get("calibration");
        RunElectrode.Calibration calibration = c == null || c.isNull() ? null
                : new RunElectrode.Calibration(number(c, "motorThresholdMa"), optionalNumber(c, "fullRecruitmentMa"),
                        number(c, "pulseWidthUs"), optionalNumber(c, "electrodeAreaCm2"));
        return new RunElectrode(text(node, "shape"), optionalNumber(node, "widthCm"), optionalNumber(node, "lengthCm"),
                optionalNumber(node, "diameterCm"), number(node, "areaCm2"), number(node, "fatThicknessCm"),
                number(node, "axonDepthCm"), text(node, "effectModel"), number(node, "thresholdFactor"), calibration);
    }

    private static String optionalText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : text(node, field);
    }

    /** Absent or {@code null} outside forearm runs (or from an engine older than the field). */
    private static WristJoint wristJoint(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new WristJoint(number(node, "momentArmMm"), number(node, "peakForceN"), text(node, "peakForceSource"),
                number(node, "optimalFiberLengthMm"), number(node, "maxContractionVelocity"), number(node, "fvShapeAf"),
                number(node, "fvMaxLengthening"), number(node, "inertiaKgM2"), number(node, "dampingNmsRad"),
                text(node, "passive"), number(node, "stiffnessNmRad"), number(node, "endRangeStartDeg"),
                number(node, "flexionMomentAt90Nm"), number(node, "extensionMomentAt90Nm"),
                number(node, "flexionLimitDeg"), number(node, "extensionLimitDeg"));
    }

    private static JointSeries jointSeries(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        try {
            return new JointSeries(numbers(node, "angleDeg"), numbers(node, "torqueNm"));
        } catch (IllegalArgumentException inconsistent) {
            throw new EngineProtocolException("Engine field 'joint' is inconsistent: " + inconsistent.getMessage());
        }
    }

    /** Absent or {@code null} from an engine older than the field. */
    private static UnitAnatomy units(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isObject()) {
            throw new EngineProtocolException("Engine field 'units' must be an object");
        }
        try {
            return new UnitAnatomy(text(node, "motoneuron"), texts(node, "type"), integers(node, "poolIndex"),
                    numbers(node, "somaDiameterUm"), numbers(node, "dendriteDiameterUm"),
                    numbers(node, "dendriteLengthMm"), numbers(node, "conductionMs"),
                    optionalNumbers(node, "toElectrodeMs"), optionalNumbers(node, "toMuscleMs"),
                    numbers(node, "weight"), numbers(node, "axonRheobase"));
        } catch (IllegalArgumentException inconsistent) {
            throw new EngineProtocolException("Engine field 'units' is inconsistent: " + inconsistent.getMessage());
        }
    }

    private static List<Double> optionalNumbers(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : numbers(node, field);
    }

    private SimulationChunk chunk(JsonNode node) {
        JsonNode force = object(node, "force");
        return new SimulationChunk(
                number(node, "progress"),
                numbers(node, "timeMs"),
                numbers(node, "stimulus"),
                new ForceSeries(numbers(force, "total"), numbers(force, "S"), numbers(force, "FR"), numbers(force, "FF")),
                numbers(node, "emg"),
                fatigue(node.get("fatigue")),
                axonEvents(node.get("axonEvents")),
                unitEvents(node.get("unitEvents")),
                jointSeries(node.get("joint")));
    }

    /** Absent or {@code null} unless the request asked for them. */
    private static UnitEvents unitEvents(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isObject()) {
            throw new EngineProtocolException("Engine field 'unitEvents' must be an object");
        }
        try {
            return new UnitEvents(longs(node, "sample"), integers(node, "unit"), integers(node, "kind"),
                    longs(node, "origin"));
        } catch (IllegalArgumentException inconsistent) {
            throw new EngineProtocolException("Engine field 'unitEvents' is inconsistent: " + inconsistent.getMessage());
        }
    }

    /** Absent or {@code null} outside the axon merge (or from an engine older than the field). */
    private static AxonEvents axonEvents(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new AxonEvents(count(node, "central"), count(node, "centralTransmitted"), count(node, "fesTransmitted"),
                count(node, "collisions"), count(node, "fesBlocked"), count(node, "resets"));
    }

    private static long count(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToLong()) {
            throw new EngineProtocolException("Engine event field '" + field + "' is not an integer");
        }
        return value.asLong();
    }

    /** Absent or {@code null} without fatigue (ORIGINAL, or an engine older than the field). */
    private static FatigueSnapshot fatigue(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new FatigueSnapshot(number(node, "timeMs"), number(node, "muscle"), optionalNumber(node, "S"),
                optionalNumber(node, "FR"), optionalNumber(node, "FF"));
    }

    private static Double optionalNumber(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : number(node, field);
    }

    private SimulationCompleted completed(JsonNode node) {
        JsonNode summary = object(node, "summary");
        return new SimulationCompleted(
                number(node, "elapsedSeconds"),
                new SimulationSummary(
                        number(summary, "peakForce"), number(summary, "meanForce"), number(summary, "timeToPeakMs")));
    }

    private SimulationFailed failed(JsonNode node) {
        return new SimulationFailed(text(node, "message"), text(node, "code"));
    }

    private Optional<SimulationEvent> skipUnknown(String type) {
        LOGGER.warn("Skipping engine event of unknown type '{}'", type);
        return Optional.empty();
    }
}
