package com.meneghel.eenm.simulationapi.infrastructure.engine;

import io.netty.channel.ChannelOption;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(EngineProperties.class)
public class EngineClientConfiguration {

    @Bean
    WebClientSimulationEngine simulationEngine(WebClient.Builder builder, EngineProperties properties,
            ObjectMapper objectMapper) {
        WebClient webClient = builder.clone()
                .baseUrl(properties.baseUrl().toString())
                .clientConnector(new ReactorClientHttpConnector(httpClient(properties)))
                .codecs(codecs -> codecs.defaultCodecs()
                        .maxInMemorySize(Math.toIntExact(properties.maxLineSize().toBytes())))
                .build();
        return new WebClientSimulationEngine(webClient, objectMapper);
    }

    private static HttpClient httpClient(EngineProperties properties) {
        return HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, Math.toIntExact(properties.connectTimeout().toMillis()));
    }
}
