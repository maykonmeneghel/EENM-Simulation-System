package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;

/** Strict readers for required fields of engine JSON; a missing or mistyped field is a protocol error. */
final class JsonFields {

    private JsonFields() {
    }

    static JsonNode object(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        if (!node.isObject()) {
            throw missing(field, "an object");
        }
        return node;
    }

    static String text(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        if (!node.isString()) {
            throw missing(field, "a string");
        }
        return node.stringValue();
    }

    static double number(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        if (!node.isNumber()) {
            throw missing(field, "a number");
        }
        return node.doubleValue();
    }

    static int integer(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        if (!node.isIntegralNumber() || !node.canConvertToInt()) {
            throw missing(field, "an integer");
        }
        return node.intValue();
    }

    static List<Double> numbers(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        if (!node.isArray()) {
            throw missing(field, "an array of numbers");
        }
        List<Double> values = new ArrayList<>(node.size());
        for (JsonNode element : node.values()) {
            if (!element.isNumber()) {
                throw missing(field, "an array of numbers");
            }
            values.add(element.doubleValue());
        }
        return values;
    }

    static List<Integer> integers(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        if (!node.isArray()) {
            throw missing(field, "an array of integers");
        }
        List<Integer> values = new ArrayList<>(node.size());
        for (JsonNode element : node.values()) {
            if (!element.isIntegralNumber() || !element.canConvertToInt()) {
                throw missing(field, "an array of integers");
            }
            values.add(element.intValue());
        }
        return values;
    }

    static List<String> texts(JsonNode parent, String field) {
        JsonNode node = parent.path(field);
        if (!node.isArray()) {
            throw missing(field, "an array of strings");
        }
        List<String> values = new ArrayList<>(node.size());
        for (JsonNode element : node.values()) {
            if (!element.isString()) {
                throw missing(field, "an array of strings");
            }
            values.add(element.stringValue());
        }
        return values;
    }

    static MotorUnitCounts unitCounts(JsonNode parent, String field) {
        JsonNode node = object(parent, field);
        return new MotorUnitCounts(integer(node, "S"), integer(node, "FR"), integer(node, "FF"));
    }

    private static EngineProtocolException missing(String field, String expected) {
        return new EngineProtocolException("Engine field '" + field + "' must be " + expected);
    }
}
