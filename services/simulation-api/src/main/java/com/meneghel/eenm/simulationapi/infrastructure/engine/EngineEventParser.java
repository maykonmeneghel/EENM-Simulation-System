package com.meneghel.eenm.simulationapi.infrastructure.engine;

import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.number;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.numbers;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.object;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.text;
import static com.meneghel.eenm.simulationapi.infrastructure.engine.JsonFields.unitCounts;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.domain.event.AxonEvents;
import com.meneghel.eenm.simulationapi.domain.event.FatigueSnapshot;
import com.meneghel.eenm.simulationapi.domain.event.ForceSeries;
import com.meneghel.eenm.simulationapi.domain.event.SimulationChunk;
import com.meneghel.eenm.simulationapi.domain.event.SimulationCompleted;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.event.SimulationFailed;
import com.meneghel.eenm.simulationapi.domain.event.SimulationStarted;
import com.meneghel.eenm.simulationapi.domain.event.SimulationSummary;
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
                optionalNumber(node, "maxForce"));
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
                axonEvents(node.get("axonEvents")));
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
