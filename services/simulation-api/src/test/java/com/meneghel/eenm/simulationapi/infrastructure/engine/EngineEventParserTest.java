package com.meneghel.eenm.simulationapi.infrastructure.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.domain.event.AxonEvents;
import com.meneghel.eenm.simulationapi.domain.event.SimulationChunk;
import com.meneghel.eenm.simulationapi.domain.event.SimulationFailed;
import com.meneghel.eenm.simulationapi.domain.event.SimulationStarted;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

class EngineEventParserTest {

    private final EngineEventParser parser = new EngineEventParser(JsonMapper.builder().build());

    @Test
    void parsesEveryEventType() {
        assertThat(parser.parse(SampleEvents.startedLine())).contains(SampleEvents.started());
        assertThat(parser.parse(SampleEvents.chunkLine(0.5))).contains(SampleEvents.chunk(0.5));
        assertThat(parser.parse(SampleEvents.completedLine())).contains(SampleEvents.completed());
        assertThat(parser.parse(SampleEvents.errorLine()))
                .contains(new SimulationFailed("solver diverged", "ENGINE_FAILURE"));
    }

    @Test
    void parsesTheFatigueSnapshotOfAChunkWithEmptyTypesAsNull() {
        assertThat(parser.parse(SampleEvents.chunkWithFatigueLine())).contains(SampleEvents.chunkWithFatigue());
    }

    @Test
    void parsesTheElectrodeOfASkinSurfaceRunAndItsAmplitudeUnit() {
        assertThat(parser.parse(SampleEvents.startedWithElectrodeLine())).contains(SampleEvents.startedWithElectrode());
    }

    @Test
    void parsesTheWristOfAForearmRun() {
        assertThat(parser.parse(SampleEvents.startedWithJointLine())).contains(SampleEvents.startedWithJoint());
        assertThat(parser.parse(SampleEvents.chunkWithJointLine())).contains(SampleEvents.chunkWithJoint());
    }

    @Test
    void jointSeriesOfDifferentLengthsAreAProtocolError() {
        String broken = SampleEvents.chunkWithJointLine().replace("\"torqueNm\":[0.0,0.5]", "\"torqueNm\":[0.0]");

        assertThatThrownBy(() -> parser.parse(broken))
                .isInstanceOf(EngineProtocolException.class).hasMessageContaining("joint");
    }

    @Test
    void parsesTheUnitEventsOfAChunk() {
        assertThat(parser.parse(SampleEvents.chunkWithUnitEventsLine())).contains(SampleEvents.chunkWithUnitEvents());
    }

    @Test
    void unitEventListsOfDifferentLengthsAreAProtocolError() {
        String broken = SampleEvents.chunkWithUnitEventsLine().replace("\"kind\":[1,7]", "\"kind\":[1]");

        assertThatThrownBy(() -> parser.parse(broken))
                .isInstanceOf(EngineProtocolException.class).hasMessageContaining("unitEvents");
    }

    @Test
    void parsesTheUnitAnatomyOfAStartedEvent() {
        assertThat(parser.parse(SampleEvents.startedWithUnitsLine())).contains(SampleEvents.startedWithUnits());
    }

    @Test
    void unitsWithoutAnElectrodeHaveNoSplit() {
        String soma = SampleEvents.startedWithUnitsLine().replace("\"electrodeFraction\":0.9", "\"electrodeFraction\":null")
                .replace("[16.36,13.58]", "null").replace("[1.82,1.51]", "null");

        SimulationStarted started = (SimulationStarted) parser.parse(soma).orElseThrow();

        assertThat(started.electrodeFraction()).isNull();
        assertThat(started.units().toElectrodeMs()).isNull();
        assertThat(started.units().toMuscleMs()).isNull();
    }

    @Test
    void unitColumnsOfDifferentLengthsAreAProtocolError() {
        String broken = SampleEvents.startedWithUnitsLine().replace("\"weight\":[160.0,25.0]", "\"weight\":[160.0]");

        assertThatThrownBy(() -> parser.parse(broken))
                .isInstanceOf(EngineProtocolException.class).hasMessageContaining("units");
    }

    @Test
    void anElectrodeSplitOnOnlyOneSideIsAProtocolError() {
        String broken = SampleEvents.startedWithUnitsLine().replace("[1.82,1.51]", "null");

        assertThatThrownBy(() -> parser.parse(broken))
                .isInstanceOf(EngineProtocolException.class).hasMessageContaining("units");
    }

    @Test
    void aStartedEventFromAnOlderEngineHasNoUnits() {
        String older = SampleEvents.startedLine().replace(",\"electrodeFraction\":null,\"units\":null,\"stepMs\":null,\"joint\":null", "");

        SimulationStarted started = (SimulationStarted) parser.parse(older).orElseThrow();

        assertThat(started.units()).isNull();
        assertThat(started.electrodeFraction()).isNull();
    }

    @Test
    void aStartedEventWithoutMaxForceHasNone() {
        String original = SampleEvents.startedLine().replace(",\"maxForce\":5.1754", "");

        assertThat(((SimulationStarted) parser.parse(original).orElseThrow()).maxForce()).isNull();
    }

    @Test
    void aChunkWithoutTheFatigueFieldHasNone() {
        String olderEngine = SampleEvents.chunkLine(0.5).replace(",\"fatigue\":null", "");

        assertThat(((SimulationChunk) parser.parse(olderEngine).orElseThrow()).fatigue()).isNull();
    }

    @Test
    void aChunkCarriesTheAxonMergeCounts() {
        String merged = SampleEvents.chunkLine(0.5).replace("\"axonEvents\":null", "\"axonEvents\":"
                + "{\"central\":12,\"centralTransmitted\":9,\"fesTransmitted\":30,\"collisions\":3,"
                + "\"fesBlocked\":1,\"resets\":27}");

        assertThat(((SimulationChunk) parser.parse(merged).orElseThrow()).axonEvents())
                .isEqualTo(new AxonEvents(12, 9, 30, 3, 1, 27));
        assertThat(((SimulationChunk) parser.parse(SampleEvents.chunkLine(0.5)).orElseThrow()).axonEvents()).isNull();
    }

    @Test
    void aChunkWithMalformedAxonCountsIsAProtocolError() {
        String bad = SampleEvents.chunkLine(0.5).replace("\"axonEvents\":null", "\"axonEvents\":{}");

        assertThatThrownBy(() -> parser.parse(bad)).isInstanceOf(EngineProtocolException.class);
    }

    @Test
    void skipsUnknownEventTypes() {
        assertThat(parser.parse("{\"type\":\"heartbeat\"}")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "not json",
        "{\"type\":\"chunk\",",
        "[1,2,3]",
        "{\"noType\":true}",
        "{\"type\":\"started\",\"simulationId\":\"x\"}",
        "{\"type\":\"chunk\",\"progress\":0.5,\"timeMs\":[\"a\"],\"stimulus\":[],\"force\":{},\"emg\":[]}",
        "{\"type\":\"completed\",\"elapsedSeconds\":\"fast\",\"summary\":{}}"
    })
    void rejectsMalformedOrIncompleteLines(String line) {
        assertThatThrownBy(() -> parser.parse(line)).isInstanceOf(EngineProtocolException.class);
    }
}
