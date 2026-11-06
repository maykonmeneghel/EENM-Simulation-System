package com.meneghel.eenm.simulationapi.domain.language;

import java.util.Arrays;
import java.util.Optional;

/** Language of the catalog texts the engine sends (labels, effects, findings, value notes). */
public enum Language {
    PT_BR("pt-BR"),
    EN("en");

    private final String tag;

    Language(String tag) {
        this.tag = tag;
    }

    /** The BCP 47 tag sent as {@code ?lang=}. */
    public String tag() {
        return tag;
    }

    public static Optional<Language> fromTag(String tag) {
        return Arrays.stream(values()).filter(language -> language.tag.equals(tag)).findFirst();
    }
}
