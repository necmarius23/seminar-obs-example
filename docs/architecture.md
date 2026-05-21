# Application Architecture & Observability Pipeline

This document describes what the application does, how its services are wired together, and how telemetry signals flow from the application to the observability backends. Read `opentelemetry.md` first for the underlying theory.

---

## 1. Overview

The application is a small **online shop** used as an observability example. It simulates realistic production traffic so that Grafana dashboards have meaningful data to display.

**Domain objects:**

- **Products** — a catalog of items with name, price, and category.
- **Carts** — a per-user shopping cart that accumulates items before checkout.
- **Orders** — a completed purchase, with lifecycle states (`PENDING` → `CONFIRMED` → `SHIPPED` → `DELIVERED`, or `CANCELLED`).

**Technology stack:**

| Layer | Technology |
|-------|-----------|
| Backend | Spring Boot 3.3, Java 21 |
| Persistence | PostgreSQL 16 (JPA / Hibernate) |
| Frontend | React 18 + Nginx |
| Observability SDK | OpenTelemetry Java Agent 2.x + OTel API annotations |
| Metrics bridge | Micrometer → OTel SDK (via `micrometer-registry-otlp`) |
| Containerization | Docker Compose |

---

## 2. Service Map

All services run as Docker Compose containers. The table below shows each service, its exposed port(s), and its role.

| Service | Image / Runtime | Ports | Role |
|---------|----------------|-------|------|
| `shop` | Spring Boot JAR + OTel Java Agent | `8080` | Backend API (REST). The primary instrumented application. |
| `frontend` | React build served by Nginx | `3001` | UI for browsing products, managing carts, and placing orders. Proxies API calls to `shop:8080`. |
| `postgres` | `postgres:16` | `5432` | Relational database. Stores products, carts, orders, and order items. |
| `otel-collector` | `otelcol-contrib:0.152.0` | `4317` (gRPC OTLP), `4318` (HTTP OTLP), `8889` (Prometheus scrape), `13133` (health check) | Central telemetry hub. Receives all signals from the app and routes them to the correct backend. |
| `tempo` | `grafana/tempo` | `3200` | Distributed tracing backend. Stores trace data and serves it to Grafana via its native query API. |
| `loki` | `grafana/loki` | `3100` | Log aggregation backend. Stores log streams indexed by labels. |
| `prometheus` | `prom/prometheus` | `9090` | Metrics storage and query engine. Scrapes the Collector's Prometheus endpoint every 15 s. |
| `grafana` | `grafana/grafana` | `3000` | Visualization layer. Pre-provisioned with Tempo, Loki, and Prometheus data sources and dashboards. |
| `traffic-sim` | Python script | — (no exposed port) | Load generator. Continuously issues HTTP requests to the `shop` API to populate dashboards with realistic signal. |

---

## 3. Signal Flow

### Traces

```
Spring Boot app (Java Agent bytecode instrumentation)
  └─► OTLP gRPC (:4317) ──► OTel Collector (otlp receiver)
                                └─► otlp/tempo exporter ──► Tempo (:4317 internal)
                                                               └─► Grafana (Tempo data source)
```

1. The **Java Agent** intercepts Spring MVC, JDBC, and other frameworks at class-load time and creates spans automatically.
2. Manual `@WithSpan` annotations create additional child spans for service-layer methods.
3. The SDK batches completed spans and exports them via **OTLP gRPC** to the Collector on port `4317`.
4. The Collector's `otlp/tempo` exporter forwards spans to Tempo using OTLP gRPC.
5. Grafana queries Tempo using the **Tempo data source** (TraceQL and search).

### Metrics

```
Java Agent (JVM + HTTP metrics)  ─┐
Micrometer (Spring Boot actuator) ─┤─► OTLP ──► OTel Collector (otlp receiver)
Manual Meter API (business KPIs)  ─┘                └─► prometheus exporter (:8889)
                                                           └─◄ Prometheus (scrape every 15s)
                                                                  └─► Grafana (Prometheus data source)
```

1. The **Java Agent** produces JVM metrics (heap, GC, threads) and HTTP server duration histograms automatically.
2. **Micrometer** produces Spring Boot actuator metrics (datasource pool, Hikari, servlet).
3. **Manual `Meter` API calls** produce custom business metrics (orders, revenue, cart activity).
4. All metrics flow via OTLP to the Collector, which exposes a **Prometheus scrape endpoint** on port `8889`.
5. **Prometheus** scrapes that endpoint and stores the time series.
6. **Grafana** queries Prometheus using PromQL.

### Logs

```
Application code (SLF4J / Logback)
  └─► OTel Logback Appender (bridge)
        └─► OTLP ──► OTel Collector (otlp receiver)
                          └─► otlphttp/loki exporter ──► Loki (:3100)
                                                            └─► Grafana (Loki data source)
```

1. Application code logs with standard **SLF4J / Logback**.
2. The **OTel Logback Appender** (configured in `logback-spring.xml`) intercepts each log record and forwards it to the OTel SDK.
3. The SDK automatically attaches the active `traceId` and `spanId` to every log record emitted within a traced context — enabling trace-to-log correlation in Grafana.
4. Log records flow via OTLP to the Collector, which exports them to **Loki** via `otlphttp/loki`.
5. **Grafana** queries Loki using LogQL and displays logs alongside traces.

---

## 4. Manual Instrumentation Details

The Java Agent handles framework-level signals. The following items were instrumented manually to capture business context.

### `@WithSpan` on Service Methods

Service methods (`OrderService.createOrder`, `CartService.addItem`, etc.) are annotated with `@WithSpan` so that a dedicated child span is created for each invocation. This makes it possible to see the time spent in business logic separately from the HTTP handler span.

```java
@WithSpan("OrderService.createOrder")
public Order createOrder(@SpanAttribute("order.userId") Long userId,
                         @SpanAttribute("order.cartId") Long cartId) {
    // ...
}
```

`@SpanAttribute` on parameters records those values directly on the span, providing searchable context in Tempo without needing to add attribute calls inside the method body.

### Custom Business Metrics

Business metrics are registered once at application startup using `GlobalOpenTelemetry.getMeter()`:

| Metric name | Instrument | Unit | What it measures |
|-------------|-----------|------|-----------------|
| `shop.orders.created` | Counter | `{order}` | Total orders successfully created |
| `shop.orders.value` | Histogram | `{USD}` | Monetary value of each order |
| `shop.cart.items.added` | Counter | `{item}` | Total cart add-item operations |
| `shop.products.viewed` | Counter | `{view}` | Product detail page views |
| `shop.checkout.failures` | Counter | `{failure}` | Checkout attempts that did not result in an order |

Example registration:

```java
Meter meter = GlobalOpenTelemetry.getMeter("com.example.shop");

DoubleHistogram orderValue = meter
    .histogramBuilder("shop.orders.value")
    .setDescription("Monetary value of completed orders")
    .setUnit("{USD}")
    .build();
```

These metrics appear in Prometheus after the Collector scrapes port `8889`, and are visualized in the **Business KPIs** dashboard panel.

### Span Events and Attributes

In `CartService` and `OrderService`, span events record discrete domain actions:

```java
// In CartService.addItem()
Span.current().addEvent("cart.item.added", Attributes.of(
    AttributeKey.stringKey("product.id"), productId.toString(),
    AttributeKey.longKey("quantity"), (long) quantity
));

// In OrderService, when an invalid state transition is attempted:
Span.current()
    .setStatus(StatusCode.ERROR, "Invalid order status transition")
    .recordException(ex);
```

Span events appear on the trace waterfall in Grafana/Tempo and provide a structured audit trail of what happened during a request.

### Why `GlobalOpenTelemetry` Instead of the SDK Directly

When the Java Agent is present, it registers the SDK with `GlobalOpenTelemetry` before `main()` runs. Application code must obtain `Tracer` and `Meter` instances from `GlobalOpenTelemetry.get()` / `GlobalOpenTelemetry.getMeter(...)`. Calling `OpenTelemetrySdk.builder().build()` in application code would create a *second, disconnected* OpenTelemetry instance — spans and metrics from it would not be exported, and the two providers would conflict. The correct approach is to **not include the OTel SDK JAR on the application classpath at all** (see Key Design Decisions).

---

## 5. OTel Collector Pipeline

The Collector configuration (`otel/otelcol-config.yaml`) defines one pipeline per signal type.

### Receivers

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
```

A single `otlp` receiver accepts all three signal types over both gRPC and HTTP. The application uses gRPC (port 4317).

### Processors

```yaml
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 400
    spike_limit_mib: 128
  batch:
    timeout: 1s
    send_batch_size: 512
```

- **`memory_limiter`**: Drops data and signals back-pressure to the SDK if memory usage approaches the limit. Prevents OOM crashes under load.
- **`batch`**: Groups data points into larger payloads before export, reducing network overhead and backend write amplification.

### Exporters

```yaml
exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true

  prometheus:
    endpoint: 0.0.0.0:8889

  otlphttp/loki:
    endpoint: http://loki:3100/otlp
```

| Exporter | Signal | Protocol | Destination |
|----------|--------|----------|------------|
| `otlp/tempo` | Traces | OTLP gRPC | Tempo's internal OTLP receiver |
| `prometheus` | Metrics | Prometheus scrape | Prometheus scrapes this endpoint |
| `otlphttp/loki` | Logs | OTLP HTTP | Loki's OTLP ingest endpoint |

### Pipelines

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

Each pipeline is independent. A failure in the Loki exporter (logs) does not affect trace or metric export.

---

## 6. Grafana Dashboards

Grafana is pre-provisioned (via `grafana/provisioning/`) with data sources and a dashboard. The dashboard is divided into sections:

### Business KPIs

Uses the **Prometheus** data source and PromQL against custom metrics.

| Panel | Metric | Description |
|-------|--------|-------------|
| Orders created (rate) | `rate(shop_orders_created_total[5m])` | Order throughput over time |
| Revenue (rate) | `rate(shop_orders_value_USD_sum[5m])` | Revenue rate from histogram sum |
| Cart items added | `rate(shop_cart_items_added_total[5m])` | Shopping activity indicator |
| Product views | `rate(shop_products_viewed_total[5m])` | Catalog engagement |
| Checkout failure rate | `rate(shop_checkout_failures_total[5m])` | Funnel drop-off |

### HTTP Traffic

Uses the **Prometheus** data source and the **agent-auto-instrumented** histogram `http_server_request_duration_seconds` (semantic convention: `http.server.request.duration`).

| Panel | Query pattern | Description |
|-------|--------------|-------------|
| Request rate | `rate(..._count[5m])` | Requests per second by route |
| Error rate | `rate(...{status_code=~"5.."}[5m])` | 5xx errors per second |
| P50 / P95 / P99 latency | `histogram_quantile(0.95, ...)` | Latency percentiles by route |

### JVM Panels

Uses the **Prometheus** data source and agent-produced JVM metrics.

| Panel | Metric | Description |
|-------|--------|-------------|
| Heap used/committed | `jvm_memory_used_bytes{area="heap"}` | Heap memory over time |
| Non-heap used | `jvm_memory_used_bytes{area="nonheap"}` | Metaspace, code cache |
| CPU usage | `process_cpu_usage` | JVM process CPU |
| Thread count | `jvm_threads_live_threads` | Active thread count |
| GC pause duration | `rate(jvm_gc_duration_seconds_sum[5m])` | GC overhead |
| Loaded classes | `jvm_classes_loaded_classes` | Class loader activity |

### Traces Table

Uses the **Tempo** data source with a **TraceQL** search panel. Displays recent traces with their duration, root service, and root span name. Clicking a row opens the full waterfall view.

### Application Logs / Error Logs

Uses the **Loki** data source and **LogQL**.

| Panel | Query | Description |
|-------|-------|-------------|
| All application logs | `{service_name="shop"}` | Full log stream |
| Error logs only | `{service_name="shop"} \| detected_level = "error"` | Filtered to ERROR severity |

The `detected_level` label is a **pipeline-stage filter** (not a stream selector) — Loki infers it from the log body. This avoids creating separate Loki streams per log level, which would inflate stream cardinality.

---

## 7. Traffic Simulator

The `traffic-sim` container runs a Python script that loops through a set of HTTP request flows against the `shop` API. Its purpose is to ensure dashboards always have data to display, even when no human is using the frontend.

| Flow name | What it does | Why it exists |
|-----------|-------------|---------------|
| `browse` | Lists products, views a product detail | Produces product view metrics and read-path traces |
| `shop` | Adds items to cart, checks out, completes an order | Produces the happy-path business metrics (orders, revenue) |
| `cancel` | Creates an order then cancels it | Exercises the cancellation state transition and metric label |
| `not-found` | Requests a non-existent product ID | Produces 404 responses for error-rate panels |
| `empty-checkout` | Attempts checkout with an empty cart | Triggers a checkout failure metric increment |
| `bad-cart-item` | Sends an invalid add-to-cart request | Produces 4xx errors and validation exception spans |
| `bad-status-transition` | Tries an illegal order status change | Exercises the error path in `OrderService` and ERROR span status |

The mix of happy-path and error flows means all dashboard panels (including error rates and checkout failures) show non-zero values from the start.

---

## 8. Key Design Decisions

- **OTel API only on the application classpath (no SDK JAR).**
  The `pom.xml` declares `opentelemetry-api` and `opentelemetry-instrumentation-annotations` as dependencies but *not* `opentelemetry-sdk`. The Java Agent provides the SDK at runtime via `-javaagent`. Including the SDK JAR would cause `GlobalOpenTelemetry` to be initialized twice — once by the application and once by the agent — resulting in a runtime exception or silently dropped telemetry.

- **`{USD}` unit annotation on the order value histogram.**
  OTel's metric naming convention appends the unit to the metric name (e.g., a metric named `shop.orders.value` with unit `seconds` becomes `shop_orders_value_seconds`). Using the annotation unit `{USD}` (a "unit annotation" in UCUM notation) keeps the Prometheus metric name as `shop_orders_value_USD_*` which is readable, rather than a raw currency code that might be misinterpreted. The curly-brace form signals to OTel that this is a custom annotation, not a standard SI unit, so no transformation is applied.

- **`findFirstByUserIdAndStatus` in CartRepository.**
  Under concurrent requests (e.g., from the traffic simulator), two requests for the same user can race to create a cart. Rather than enforcing a unique constraint (which would require distributed locking or complex retry logic), the application tolerates duplicates by always querying `findFirst` and working with the most recently created active cart.

- **`user: "0"` on Loki and Tempo Docker Compose services.**
  Docker named volumes are created with root ownership by default. Tempo and Loki write data to named volumes. Running them as the default container user (non-root) causes permission-denied errors on first write. Setting `user: "0"` runs these containers as root, which matches the volume ownership. In a production Kubernetes environment, init containers or a `securityContext.fsGroup` would be the correct approach.

- **`otlphttp/loki` exporter instead of `loki`.**
  The standalone `loki` exporter was removed from the OTel Collector Contrib distribution after version 0.115. Applications that still reference it will fail to start the Collector. The correct modern approach is the `otlphttp` exporter pointed at Loki's OTLP ingest endpoint (`/otlp`), which Loki has supported since version 2.9.

- **`detected_level` as a pipeline filter, not a stream selector.**
  Loki labels (stream selectors) define the index structure. If `level` or `severity` were a stream label, every unique log level would create a separate stream — and every new combination of service + level would be a new stream, multiplying cardinality. Instead, `detected_level` is a value Loki extracts from the log body at query time and exposes as a pipeline label. Filtering with `| detected_level = "error"` scans only the existing `service_name="shop"` stream and evaluates the filter per log line, keeping stream cardinality bounded.

---

## 9. Running Locally

**Prerequisites:** Docker Desktop (or Docker Engine + Compose plugin) with at least 4 GB RAM allocated.

```bash
# Clone the repository and start all services
docker compose up --build

# Watch for the shop service to be ready:
# "Started ShopApplication in X.XXX seconds"
```

Once all containers are healthy:

| URL | Service |
|-----|---------|
| `http://localhost:3001` | React frontend (shop UI) |
| `http://localhost:3000` | Grafana (admin / admin) |
| `http://localhost:9090` | Prometheus |
| `http://localhost:8080/api` | Spring Boot API (direct) |
| `http://localhost:13133` | OTel Collector health check |

**Useful commands:**

```bash
# Tail application logs
docker compose logs -f shop

# Tail collector logs (useful to verify signal flow)
docker compose logs -f otel-collector

# Stop all services and remove containers (keeps volumes)
docker compose down

# Stop and remove volumes (full reset including database and metric data)
docker compose down -v
```

**Expected startup time:** approximately 30–60 seconds for all services to be healthy. Grafana dashboards will show data within 30 seconds of startup as the traffic simulator begins sending requests.
