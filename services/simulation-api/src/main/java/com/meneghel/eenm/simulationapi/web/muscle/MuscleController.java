package com.meneghel.eenm.simulationapi.web.muscle;

import com.meneghel.eenm.simulationapi.application.muscle.ListMusclesUseCase;
import com.meneghel.eenm.simulationapi.web.LanguageParameter;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/muscles")
public class MuscleController {

    private final ListMusclesUseCase listMuscles;

    public MuscleController(ListMusclesUseCase listMuscles) {
        this.listMuscles = listMuscles;
    }

    @GetMapping
    public Mono<List<MusclePresetDto>> muscles(@RequestParam(name = LanguageParameter.NAME, required = false) String lang) {
        return listMuscles.list(LanguageParameter.parse(lang)).map(presets -> presets.stream().map(MusclePresetDto::from).toList());
    }
}
