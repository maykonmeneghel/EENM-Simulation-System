package com.meneghel.eenm.simulationapi.web;

import com.meneghel.eenm.simulationapi.domain.language.Language;
import com.meneghel.eenm.simulationapi.web.error.UnsupportedLanguageException;

/** Reads the optional {@code lang} query parameter of the catalog endpoints ({@code pt-BR} when absent). */
public final class LanguageParameter {

    public static final String NAME = "lang";

    private LanguageParameter() {
    }

    public static Language parse(String tag) {
        if (tag == null) {
            return Language.PT_BR;
        }
        return Language.fromTag(tag).orElseThrow(() -> new UnsupportedLanguageException(tag));
    }
}
