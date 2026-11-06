package com.meneghel.eenm.simulationapi.web.condition;

import com.meneghel.eenm.simulationapi.application.condition.ListConditionsUseCase;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/conditions")
public class ConditionController {

    private final ListConditionsUseCase listConditions;

    public ConditionController(ListConditionsUseCase listConditions) {
        this.listConditions = listConditions;
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<String> conditions() {
        return listConditions.catalogJson();
    }
}
