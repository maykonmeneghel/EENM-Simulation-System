package com.meneghel.eenm.simulationapi.web.error;

/** A {@code lang} query parameter other than {@code pt-BR} or {@code en}. */
public final class UnsupportedLanguageException extends RuntimeException {

    public UnsupportedLanguageException(String tag) {
        super("unsupported language: " + tag);
    }
}
