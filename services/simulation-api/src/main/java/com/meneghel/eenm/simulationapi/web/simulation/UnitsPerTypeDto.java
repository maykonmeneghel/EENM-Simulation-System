package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.web.validation.Between;

/** Component names match the JSON keys so validation errors carry the public field path. */
public record UnitsPerTypeDto(
        @Between(min = "0", max = "200") Integer S,
        @Between(min = "0", max = "200") Integer FR,
        @Between(min = "0", max = "200") Integer FF) {
}
