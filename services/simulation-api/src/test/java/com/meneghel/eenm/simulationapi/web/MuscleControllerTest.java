package com.meneghel.eenm.simulationapi.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.domain.language.Language;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.muscle.PresetFieldSource;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
class MuscleControllerTest {

    @Autowired
    private WebTestClient client;

    @MockitoBean
    private SimulationEngine engine;

    @Test
    void relaysTheEnginePresets() {
        when(engine.listMuscles(any())).thenReturn(Mono.just(List.of(SampleEvents.soleus())));

        client.get().uri("/api/v1/muscles").exchange()
                .expectStatus().isOk()
                .expectBody().json("[{\"id\":\"SOLEUS\",\"label\":\"Soleus\",\"poolSize\":{\"S\":800,\"FR\":50,\"FF\":50},"
                        + "\"provenance\":[]}]");
    }

    @Test
    void relaysWhereEachPresetValueComesFrom() {
        var source = new PresetFieldSource("Composição S / FR / FF", "MEASURED", "368 / 267 / 265",
                new PresetFieldSource.Reference("Mizuno et al. 1994", "T", "10.1152/jappl.1994.76.2.531", null),
                "FULL_TEXT", null);
        when(engine.listMuscles(any())).thenReturn(Mono.just(List.of(new MusclePreset("FLEXOR_CARPI_RADIALIS", "FCR",
                new MotorUnitCounts(368, 267, 265), List.of(source)))));

        client.get().uri("/api/v1/muscles").exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$[0].provenance[0].provenance").isEqualTo("MEASURED")
                .jsonPath("$[0].provenance[0].source.doi").isEqualTo("10.1152/jappl.1994.76.2.531")
                .jsonPath("$[0].provenance[0].calibrationTarget").doesNotExist();
    }

    @Test
    void forwardsTheLanguageAndDefaultsToPortuguese() {
        when(engine.listMuscles(Language.EN)).thenReturn(Mono.just(List.of(new MusclePreset("TIBIALIS_ANTERIOR",
                "Tibialis Anterior", new MotorUnitCounts(250, 50, 50), List.of()))));
        when(engine.listMuscles(Language.PT_BR)).thenReturn(Mono.just(List.of(new MusclePreset("TIBIALIS_ANTERIOR",
                "Tibial Anterior", new MotorUnitCounts(250, 50, 50), List.of()))));

        client.get().uri("/api/v1/muscles?lang=en").exchange()
                .expectStatus().isOk()
                .expectBody().jsonPath("$[0].label").isEqualTo("Tibialis Anterior");
        client.get().uri("/api/v1/muscles").exchange()
                .expectStatus().isOk()
                .expectBody().jsonPath("$[0].label").isEqualTo("Tibial Anterior");
    }

    @Test
    void unsupportedLanguageIsABadRequestProblem() {
        client.get().uri("/api/v1/muscles?lang=pt").exchange()
                .expectStatus().isBadRequest()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody().jsonPath("$.errors[0].field").isEqualTo("lang");
    }

    @Test
    void unreachableEngineIsBadGateway() {
        when(engine.listMuscles(any())).thenReturn(Mono.error(new EngineUnavailableException("connection refused")));

        client.get().uri("/api/v1/muscles").exchange()
                .expectStatus().isEqualTo(502)
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON);
    }

    @Test
    void allowsTheWebAppOrigin() {
        when(engine.listMuscles(any())).thenReturn(Mono.just(List.of()));

        client.options().uri("/api/v1/simulations")
                .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173");
    }

    @Test
    void rejectsOtherOrigins() {
        client.options().uri("/api/v1/simulations")
                .header(HttpHeaders.ORIGIN, "http://evil.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .exchange()
                .expectStatus().isForbidden();
    }
}
