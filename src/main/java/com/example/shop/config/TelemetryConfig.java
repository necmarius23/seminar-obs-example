package com.example.shop.config;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Tracer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Exposes the shared OTel Tracer as a Spring bean.
 * GlobalOpenTelemetry is populated by the Java agent before the Spring context starts,
 * so both manual spans and agent-generated spans share the same TracerProvider and exporter pipeline.
 */
@Configuration
public class TelemetryConfig {

    @Bean
    public Tracer shopTracer() {
        return GlobalOpenTelemetry.getTracer("com.example.shop", "1.0.0");
    }
}
