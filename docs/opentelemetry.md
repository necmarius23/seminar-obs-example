# OpenTelemetry — Concepts & Theory

This document covers the foundational theory behind OpenTelemetry and how it applies to this project. It is intended to give a new team member enough background to understand what is being instrumented, why, and how the pieces fit together.

---

## 1. What is Observability

Observability is the ability to understand the internal state of a system by examining its external outputs. In distributed systems, you cannot attach a debugger to a live production environment — you need data that tells you *what* happened, *where*, and *why*.

Observability is traditionally described through three complementary signal types, often called the **three pillars**:

| Pillar | What it answers | Example |
|--------|-----------------|---------|
| **Logs** | What happened and when | `ERROR OrderService - Payment declined for order 42` |
| **Metrics** | How much / how often | `http_requests_total{status="500"} = 17` |
| **Traces** | Where time was spent across components | A 450 ms request showing 380 ms in a slow SQL query |

Each pillar is powerful on its own but incomplete. A spike in error-rate metrics tells you *something is wrong*. Logs tell you what the error message was. A trace tells you *exactly which service call* caused the failure and how long each step took. Together they give you the full picture — which is why correlating them (e.g., embedding a trace ID in log lines, attaching exemplar trace IDs to metric data points) is so valuable.

---

## 2. What is OpenTelemetry

**OpenTelemetry (OTel)** is an open-source observability framework and toolkit. Its goal is to provide a single, vendor-neutral standard for generating, collecting, and exporting telemetry data (traces, metrics, logs).

Key facts:

- **CNCF graduated project** (graduated 2024): production-ready with broad industry adoption.
- **Vendor-neutral**: OTel defines APIs, SDKs, a wire protocol (OTLP), and semantic conventions. You instrument once and can send data to any compatible backend (Jaeger, Tempo, Datadog, Honeycomb, New Relic, etc.) without changing application code.
- **Replaces fragmented tooling**: Before OTel, teams used OpenTracing for traces, OpenCensus for metrics, and various logging libraries — all with incompatible APIs. OTel merges these under one umbrella.
- **Language support**: SDKs exist for Java, Go, Python, JavaScript/TypeScript, .NET, Rust, C++, PHP, Ruby, and more.

The project ships three layers:

1. **API** — interfaces your application code calls (no implementation, no dependencies on backend).
2. **SDK** — the in-process implementation (samplers, exporters, processors).
3. **Instrumentation libraries** — ready-made adapters for popular frameworks (Spring, JDBC, gRPC, etc.).

---

## 3. The OTel Data Model

### 3.1 Traces

A **trace** represents the end-to-end journey of a single request through your system. It is composed of **spans**.

A **span** is a single named, timed operation. Each span records:

| Field | Description |
|-------|-------------|
| `traceId` | 16-byte identifier shared by all spans in the same trace |
| `spanId` | 8-byte identifier unique to this span |
| `parentSpanId` | The spanId of the caller (absent for the root span) |
| `name` | Human-readable operation name (e.g., `GET /api/orders/{id}`) |
| `startTimeUnixNano` / `endTimeUnixNano` | Wall-clock timestamps |
| `attributes` | Key-value pairs describing the operation (see Semantic Conventions) |
| `events` | Named, timestamped points within the span (e.g., `cart.item.added`) |
| `status` | `UNSET`, `OK`, or `ERROR` |
| `kind` | `SERVER`, `CLIENT`, `PRODUCER`, `CONSUMER`, or `INTERNAL` |

**Parent-child relationships** form a tree. The root span (no parent) typically represents the incoming HTTP request. Child spans represent outgoing calls, database queries, or internal processing steps. Together they form a directed acyclic graph (DAG) called a **trace**.

**Context propagation** is how trace identity crosses process boundaries. OTel uses the **W3C TraceContext** standard (RFC 7540): a `traceparent` HTTP header carries the `traceId` and `spanId` so the downstream service can link its spans into the same trace. A `tracestate` header carries vendor-specific metadata. OTel also supports B3 propagation for compatibility with older systems.

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
              ^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^ ^^
              version         traceId                 spanId      flags
```

**Span attributes** are arbitrary key-value pairs (string, int, double, bool, or arrays of these). Use semantic conventions for standard attributes and add custom ones for business context. Keep in mind that attribute values on spans are *not* aggregated — they are stored verbatim and are therefore safe for high-cardinality data.

**Span events** are timestamped log-like records attached to a span. They are ideal for capturing discrete things that happened *during* an operation (e.g., a retry attempt, an item being added to a cart) without creating a separate span.

**Span status** communicates success or failure to the backend. Setting `ERROR` status with a description is important for error-rate dashboards and alerting.

### 3.2 Metrics

OTel metrics follow a push model from the SDK to an exporter. The data model is built around **instruments**:

| Instrument | What it measures | Example |
|------------|------------------|---------|
| **Counter** | Monotonically increasing value | Total orders created |
| **UpDownCounter** | Value that can increase or decrease | Items currently in a cart |
| **Histogram** | Distribution of a value | Order value in USD |
| **Gauge** | Instantaneous snapshot | JVM heap used bytes |
| **ObservableCounter** | Async-polled counter | CPU time |
| **ObservableGauge** | Async-polled gauge | Thread count |

**Temporality** describes how measurements are reported over time:

- **Cumulative**: values are monotonically accumulated from a start point (Prometheus-friendly, default for counters).
- **Delta**: values represent the change since the last collection interval (preferred by some backends for counters).

**Exemplars** are sample data points (including a trace ID and timestamp) embedded in a metric data point. They bridge metrics and traces: when you see a latency spike in Grafana, an exemplar lets you jump directly to a representative trace for that spike.

### 3.3 Logs

OTel defines a **Log Record** with these key fields:

| Field | Description |
|-------|-------------|
| `Timestamp` | When the event occurred |
| `SeverityNumber` / `SeverityText` | e.g., `9` / `INFO`, `17` / `ERROR` |
| `Body` | The log message string |
| `Resource` | Describes the emitting entity (e.g., `service.name`, `service.version`) |
| `InstrumentationScope` | Library or component that emitted the record |
| `TraceId` / `SpanId` | Correlation to an active trace (auto-populated when in-context) |
| `Attributes` | Additional key-value metadata |

The crucial difference from traditional logging: OTel logs are **correlated with traces by default**. When you call a logger inside a traced operation, the SDK automatically injects the active `traceId` and `spanId` into the log record. This means in Grafana you can click a trace and see the logs that happened during that exact span — and vice versa.

OTel logs are not a replacement for your logging library. Instead, the **OTel Logback Appender** (or Log4j2 appender) acts as a bridge: your application keeps using `slf4j`/`Logback`, and the appender forwards log records to the OTel SDK which exports them via OTLP.

---

## 4. The OTel SDK vs the OTel API

The **API** is a set of stable, minimal interfaces (e.g., `Tracer`, `Meter`, `Logger`). It has *no* implementation. Calling `Tracer.spanBuilder("foo").startSpan()` through the API alone produces a no-op span — nothing is recorded, nothing is exported.

The **SDK** provides the implementation: samplers, exporters (OTLP, Jaeger, Zipkin, stdout), processors (batch, simple), and the `SdkTracerProvider`. It is the thing that actually sends data.

**Why keep them separate?**

- Library authors instrument with the API only — their code has no opinion about which backend you use, or whether you use one at all.
- Application owners configure and ship the SDK once, without touching all their libraries.
- In production with the Java Agent, the *agent* provides the SDK. If application code also bundled the SDK, there would be two registries, causing conflicts.

The **Java Agent** is what bridges the two at runtime: it registers a fully configured SDK with `GlobalOpenTelemetry` before `main()` runs, so all API calls are backed by a real implementation without any SDK dependency in the application's `pom.xml`.

---

## 5. The Java Agent

The **OpenTelemetry Java Agent** provides **zero-code instrumentation** — you attach it to a JVM and your application emits traces, metrics, and logs with no source code changes.

### How it works

The agent uses the **Java Instrumentation API** (`-javaagent` flag). At JVM startup, before any application class is loaded, the agent installs a **Byte Buddy**-based bytecode transformer. When a class like `DispatcherServlet` is loaded, the transformer rewrites its bytecode on the fly to add span creation, context propagation, and attribute recording. This is completely transparent to application code.

### What it auto-instruments (relevant subset)

| Library / Framework | What is captured |
|---------------------|-----------------|
| **Spring MVC** | HTTP server spans, `http.route`, status codes, request duration |
| **JDBC** | Database client spans, `db.statement`, connection pool metrics |
| **JVM** | Heap/non-heap memory, GC pause durations, thread counts, class loader |
| **Logback** | Log records forwarded to OTel LogRecordExporter via bridge appender |
| **Spring `@Scheduled`** | Span per scheduled invocation |
| **ExecutorService** | Context propagation across thread boundaries |

### GlobalOpenTelemetry

The agent registers the configured `OpenTelemetry` instance with `GlobalOpenTelemetry`. Manual instrumentation code (in `@Service` classes, etc.) obtains the same instance via `GlobalOpenTelemetry.get()` or `GlobalOpenTelemetry.getMeter("...")`. This is the correct pattern when the agent is present — **do not** call `OpenTelemetrySdk.builder().build()` in application code, as that would create a second, disconnected registry.

---

## 6. Manual Instrumentation

The agent handles framework-level spans, but business logic requires **manual instrumentation** for full observability.

### `@WithSpan`

```java
@WithSpan("OrderService.createOrder")
public Order createOrder(@SpanAttribute("order.userId") Long userId, ...) {
    // A child span is created automatically around this method.
    // The userId parameter is recorded as a span attribute.
}
```

`@WithSpan` (from `opentelemetry-instrumentation-annotations`) tells the agent to create a child span each time the annotated method is called. The span name defaults to `ClassName.methodName` and can be overridden. `@SpanAttribute` records a method parameter as a span attribute.

### Custom Metrics

```java
Meter meter = GlobalOpenTelemetry.getMeter("com.example.shop");

LongCounter ordersCounter = meter
    .counterBuilder("shop.orders.created")
    .setDescription("Total number of orders created")
    .setUnit("{order}")
    .build();

// In business logic:
ordersCounter.add(1, Attributes.of(ATTR_STATUS, "success"));
```

Custom metrics capture business KPIs that the agent cannot know about: orders created, revenue, cart activity, checkout failures.

### Span Events and Attributes

```java
Span.current()
    .addEvent("cart.item.added", Attributes.of(
        AttributeKey.stringKey("product.id"), productId.toString(),
        AttributeKey.longKey("quantity"), quantity
    ));
```

Span events are cheap, timestamped annotations — ideal for discrete domain events that should be visible on a trace without creating a new span.

### When to use manual instrumentation

- **Business metrics** the agent cannot infer (order value, product views, checkout failures).
- **Domain context on spans** (userId, orderId, productId as attributes).
- **Internal method spans** for code paths worth profiling (complex service methods).
- **Error recording**: explicitly call `span.setStatus(StatusCode.ERROR, message)` and `span.recordException(e)`.

---

## 7. OTLP — The OpenTelemetry Protocol

**OTLP** (OpenTelemetry Protocol) is the native wire format for OTel data. It is defined as **Protocol Buffers** schemas and transmitted over either:

| Transport | Default port | Notes |
|-----------|-------------|-------|
| **gRPC** | 4317 | Preferred; efficient binary framing, streaming, backpressure |
| **HTTP/protobuf** | 4318 | Easier to debug (Wireshark/curl), works through more proxies |
| **HTTP/JSON** | 4318 | Human-readable, useful for testing |

OTLP is the preferred export format because:

1. It is designed specifically for OTel's data model — no lossy translation.
2. All three signal types (traces, metrics, logs) use the same protocol and connection.
3. Every major vendor and open-source backend now accepts OTLP natively.
4. It supports partial success responses, so the exporter knows which records were accepted.

---

## 8. The OTel Collector

The **OpenTelemetry Collector** is a standalone, vendor-agnostic proxy for telemetry data. It sits between your application and your storage backends.

### Pipeline architecture

```
[Receivers] → [Processors] → [Exporters]
```

| Component type | What it does | Examples |
|----------------|-------------|---------|
| **Receiver** | Accepts data in a given format | `otlp` (gRPC + HTTP), `prometheus`, `jaeger` |
| **Processor** | Transforms, filters, or batches data | `batch`, `memory_limiter`, `resource`, `filter` |
| **Exporter** | Sends data to a backend | `otlp` (Tempo), `prometheus`, `otlphttp` (Loki), `debug` |

A **pipeline** wires one or more receivers through zero or more processors to one or more exporters, per signal type:

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/loki]
```

### Why use a Collector instead of exporting directly?

- **Decoupling**: The application does not need to know about backend endpoints, credentials, or retry logic.
- **Fan-out**: Send the same data to multiple backends simultaneously (e.g., Tempo for traces *and* a cloud vendor).
- **Processing**: Filter sensitive attributes, add resource metadata, tail-sample traces, or enforce cardinality limits centrally.
- **Buffering**: The Collector absorbs spikes and handles retries so your application's OTLP exporter can fail fast.
- **Protocol translation**: Convert between Jaeger, Zipkin, OTLP, and Prometheus formats.

---

## 9. Semantic Conventions

**Semantic Conventions** are OTel's standardized naming scheme for span names, attribute keys, and metric names. They ensure that instrumentation from different libraries and vendors is consistent and queryable.

Examples:

| Attribute | Meaning |
|-----------|---------|
| `service.name` | Logical name of the service (e.g., `shop`) |
| `http.request.method` | HTTP verb (`GET`, `POST`, …) |
| `http.route` | Matched route template (`/api/orders/{id}`) |
| `http.response.status_code` | HTTP response status |
| `db.system` | Database type (`postgresql`) |
| `db.statement` | SQL query text |
| `url.full` | Full URL of an outgoing request |
| `server.address` | Hostname of the server |
| `exception.type` | Exception class name |
| `exception.message` | Exception message |

Why they matter:

- Dashboards and alerts written against semantic attribute names work across any OTel-instrumented service, regardless of language or framework.
- Backends like Grafana Tempo can automatically build service maps from `server.address` + `http.route`.
- You can correlate spans across services using consistent attribute names without any backend-specific configuration.

When defining custom attributes, follow the same snake_case, dot-separated naming convention (e.g., `order.id`, `product.category`).

---

## 10. Cardinality

**Cardinality** is the number of unique time series in a metrics backend. Each unique combination of metric name + label set is a separate time series.

High-cardinality labels cause **cardinality explosion**: if you label a metric with `user_id` and you have 1 million users, you have 1 million time series for that metric. This exhausts memory in Prometheus, degrades query performance, and can crash your metrics backend.

### The golden rule

> **Put high-cardinality data on spans. Put low-cardinality aggregates on metrics.**

| Data type | Right place | Wrong place |
|-----------|------------|-------------|
| `user_id = 42` | Span attribute | Metric label |
| `order_id = 9f3a...` | Span attribute | Metric label |
| `http.route = /api/orders/{id}` (low cardinality — templated) | Metric label | — |
| `url.full = /api/orders/12345` (high cardinality — concrete) | Span attribute | Metric label |
| `status = success/failure` (2 values) | Metric label | — |
| Exception message (unbounded) | Span attribute / event | Metric label |

In this project:

- Custom metric labels are limited to low-cardinality values (`status`, `payment_method`, `product_category`).
- High-cardinality identifiers (`order.id`, `user.id`) are recorded as span attributes or span events.
- The HTTP route metric from the agent uses `http.route` (templated), not `url.path` (concrete), keeping cardinality bounded.
