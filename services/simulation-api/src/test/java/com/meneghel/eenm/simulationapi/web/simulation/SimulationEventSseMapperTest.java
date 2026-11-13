package com.meneghel.eenm.simulationapi.web.simulation;

import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.event.SimulationFailed;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.util.stream.Stream;
import org.json.JSONException;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.skyscreamer.jsonassert.JSONAssert;
import org.skyscreamer.jsonassert.JSONCompareMode;
import org.springframework.http.codec.ServerSentEvent;
import tools.jackson.databind.json.JsonMapper;

class SimulationEventSseMapperTest {

    private final SimulationEventSseMapper mapper = new SimulationEventSseMapper();
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    static Stream<Arguments> eventsAndTheirEngineLines() {
        return Stream.of(
                Arguments.of(SampleEvents.started(), SampleEvents.startedLine()),
                Arguments.of(SampleEvents.startedWithUnits(), SampleEvents.startedWithUnitsLine()),
                Arguments.of(SampleEvents.chunk(0.5), SampleEvents.chunkLine(0.5)),
                Arguments.of(SampleEvents.chunkWithFatigue(), SampleEvents.chunkWithFatigueLine()),
                Arguments.of(SampleEvents.chunkWithUnitEvents(), SampleEvents.chunkWithUnitEventsLine()),
                Arguments.of(SampleEvents.chunkWithJoint(), SampleEvents.chunkWithJointLine()),
                Arguments.of(SampleEvents.startedWithJoint(), SampleEvents.startedWithJointLine()),
                Arguments.of(SampleEvents.startedWithElectrode(), SampleEvents.startedWithElectrodeLine()),
                Arguments.of(SampleEvents.completed(), SampleEvents.completedLine()),
                Arguments.of(new SimulationFailed("solver diverged", "ENGINE_FAILURE"), SampleEvents.errorLine()));
    }

    @ParameterizedTest
    @MethodSource("eventsAndTheirEngineLines")
    void relaysTheSameObjectTheEngineSent(SimulationEvent event, String engineLine) throws JSONException {
        ServerSentEvent<Object> sse = mapper.toSse(event);

        assertThat(sse.event()).isEqualTo(event.type());
        JSONAssert.assertEquals(engineLine, jsonMapper.writeValueAsString(sse.data()), JSONCompareMode.STRICT);
    }
}
