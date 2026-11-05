package com.meneghel.eenm.simulationapi.web.error;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.exc.MismatchedInputException;

/**
 * Explains why a JSON body could not be read: an unknown enum constant or a value of the wrong type
 * becomes a field error with the JSON path of the offending value.
 */
final class RequestBodyErrorTranslator {

    Optional<InvalidField> translate(Throwable error) {
        return findMismatch(error).flatMap(mismatch -> fieldPath(mismatch)
                .map(path -> new InvalidField(path, messageFor(mismatch))));
    }

    private static Optional<MismatchedInputException> findMismatch(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof MismatchedInputException mismatch) {
                return Optional.of(mismatch);
            }
        }
        return Optional.empty();
    }

    private static Optional<String> fieldPath(JacksonException error) {
        String path = error.getPath().stream()
                .map(JacksonException.Reference::getPropertyName)
                .filter(Objects::nonNull)
                .collect(Collectors.joining("."));
        return path.isEmpty() ? Optional.empty() : Optional.of(path);
    }

    private static String messageFor(MismatchedInputException mismatch) {
        Class<?> target = mismatch.getTargetType();
        if (target != null && target.isEnum()) {
            List<String> allowed = Arrays.stream(target.getEnumConstants()).map(Object::toString).toList();
            return "must be one of " + allowed;
        }
        return "has an invalid value";
    }
}
