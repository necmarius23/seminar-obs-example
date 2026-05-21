# OpenTelemetry Student Guide

A practical introduction to observability using the shop application as a running example. By the end you should be able to explain what traces, metrics, and logs are, read the instrumentation code in this repo, and understand how data flows from the application to Grafana.

---

## 1. The Problem: You Can't Attach a Debugger to Production

When an application runs in production, you have no way to pause it and inspect variables. If something goes wrong — a slow checkout, a spike in errors — you need to figure out what happened after the fact, using the data the application saved while it was running.

That data is called **telemetry**, and the practice of making a system understandable through its telemetry is called **observability**.

OpenTelemetry (OTel) is the industry standard toolkit for generating, collecting, and exporting that telemetry. One framework, one protocol, works with any storage backend.

---

## 2. The Three Signals

Every observability system is built around three complementary types of data:

| Signal | Question it answers | Example |
|--------|---------------------|---------|
| **Traces** | Where did time go across components? | A checkout took 450 ms — 380 ms of that was one slow SQL query |
| **Metrics** | How much / how often over time? | 42 orders created in the last minute |
| **Logs** | What happened and in what order? | `ERROR - Insufficient stock for product 17` |

Each signal is useful alone. Together they are far more powerful because you can **correlate** them: jump from a metric spike to a representative trace, then from that trace to the log lines that fired inside it.

---

## 3. Traces and Spans

### What a Trace Is

A **trace** is the complete record of one request as it travels through the system. It is made up of **spans** — one span per discrete operation.

```
HTTP POST /api/orders/checkout   ← root span (created by the Java Agent)
  └── order.checkout             ← @WithSpan in OrderService
        ├── order.validate_stock ← manual child span
        │     └── product.find   ← @WithSpan in ProductService
        │           └── SELECT * FROM products WHERE id = ?   ← JDBC span (auto)
        └── INSERT INTO orders …  ← JDBC span (auto)
```

Each span records its start time, end time, and a bag of key-value **attributes** that describe what happened. All spans in a trace share the same `traceId`.

### The Java Agent Does Most of the Work

The Java Agent attaches to the JVM with `-javaagent` (see the `Dockerfile`):

```dockerfile
ENTRYPOINT ["java", "-javaagent:/app/opentelemetry-javaagent.jar", "-jar", "app.jar"]
```

Before any application class loads, the agent rewrites framework bytecode to create spans automatically. You get HTTP server spans (Spring MVC), database spans (JDBC), and JVM metrics with **zero changes to application code**.

### Adding Your Own Spans with `@WithSpan`

The agent cannot know about your business logic. You add it manually.

The simplest way is the `@WithSpan` annotation:

```java
// ProductService.java
@WithSpan("product.find")
public Product findById(@SpanAttribute("product.id") Long id) {
    return productRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
}
```

Two things happen here:
- `@WithSpan("product.find")` — a child span named `product.find` is created every time this method is called, and closed when it returns (or throws).
- `@SpanAttribute("product.id")` — the value of the `id` parameter is recorded as an attribute on that span.

Now every trace that touches this method shows a `product.find` span with the queried product ID attached.

### Enriching Spans Manually

For richer context you can talk to the current span directly:

```java
// CartService.java — inside addItem()
@WithSpan("cart.add_item")
public Cart addItem(@SpanAttribute("user.id") String userId,
                    @SpanAttribute("product.id") Long productId,
                    @SpanAttribute("cart.quantity") int quantity) {

    Span current = Span.current();

    Product product = productService.findById(productId);

    // Add attributes that aren't method parameters
    current.setAttribute("product.name", product.getName());
    current.setAttribute("product.category", product.getCategory());
    current.setAttribute("product.price", product.getPrice().doubleValue());

    // ... add item to cart ...

    // Record a discrete event: a named, timestamped point inside this span
    current.addEvent("cart.item.added");

    return cartRepository.save(cart);
}
```

**Span attributes** are searchable in Tempo. You can find all traces where `product.category = "electronics"`.

**Span events** (`addEvent`) are like log lines attached to a span. They show up as markers on the waterfall view in Grafana.

### Nested Manual Spans

Sometimes you want to time a specific sub-operation inside a method. In `OrderService.checkout()` the stock validation step gets its own span:

```java
// OrderService.java — inside checkout()
@WithSpan("order.checkout")
public Order checkout(@SpanAttribute("user.id") String userId) {

    Span checkoutSpan = Span.current();
    checkoutSpan.addEvent("checkout.started");

    // Create a child span manually for the stock check loop
    Span stockSpan = tracer.spanBuilder("order.validate_stock").startSpan();
    try (Scope scope = stockSpan.makeCurrent()) {
        for (CartItem item : cart.getItems()) {
            productService.decreaseStock(item.getProduct().getId(), item.getQuantity());
        }
        stockSpan.addEvent("stock.validated");
    } catch (Exception e) {
        // Mark the span as failed and attach the exception
        stockSpan.setStatus(StatusCode.ERROR, e.getMessage());
        stockSpan.recordException(e);
        throw e;
    } finally {
        stockSpan.end();   // always end manually-started spans
    }

    checkoutSpan.setAttribute("order.id", saved.getId());
    checkoutSpan.addEvent("checkout.completed");
    return saved;
}
```

Key rules when starting spans manually:
1. Always call `.end()` — use `try/finally` to guarantee it.
2. Call `.makeCurrent()` inside a `try-with-resources` to set the span as the active span so child spans link to it correctly.
3. Record exceptions with `.recordException(e)` and set `.setStatus(ERROR)` so error-rate dashboards pick them up.

---

## 4. Metrics

Metrics are **aggregated numbers over time**. Unlike spans (which store the full detail of every request), metrics are pre-aggregated and cheap to store at high volume.

### Instrument Types

OTel offers several instrument types. The shop uses three:

| Instrument | Behavior | Used for |
|------------|----------|----------|
| **Counter** | Only goes up | Total orders, total product views |
| **Histogram** | Tracks the distribution of values | Order amounts (so you can see p50, p95, p99) |
| **Gauge** | Snapshot of a value right now | Number of active carts |

### Creating Instruments

All custom metrics live in `ShopMetrics.java`. Instruments are created once at startup:

```java
// ShopMetrics.java
Meter meter = GlobalOpenTelemetry.getMeter("com.example.shop");

// Counter: only goes up, represents "how many times did X happen"
LongCounter ordersCreated = meter
    .counterBuilder("shop.orders.created")
    .setDescription("Total orders successfully placed")
    .setUnit("{order}")
    .build();

// Histogram: records a value each time, backend computes percentiles
DoubleHistogram orderValue = meter
    .histogramBuilder("shop.orders.value")
    .setDescription("Monetary value of completed orders")
    .setUnit("{USD}")
    .build();

// Gauge (observable): polled by the SDK on each export interval
LongGauge activeCarts = meter
    .gaugeBuilder("shop.carts.active")
    .ofLongs()
    .buildWithCallback(m -> m.record(activeCartsGauge.get(), Attributes.empty()));
```

### Recording Measurements

Instruments are used where the business event happens:

```java
// ShopMetrics.java
public void recordOrderCreated(int itemsCount, double totalAmount) {
    String sizeBucket = itemsCount <= 2 ? "small" : itemsCount <= 5 ? "medium" : "large";
    Attributes attrs = Attributes.of(AttributeKey.stringKey("order.size_bucket"), sizeBucket);

    ordersCreated.add(1, attrs);      // +1 to the counter
    orderValue.record(totalAmount, attrs);  // record this order's dollar value
}
```

This is called from `OrderService.checkout()` after a successful save:

```java
metrics.recordOrderCreated(cart.getItems().size(), total.doubleValue());
```

In Grafana you can then ask: *"How many orders were placed per minute over the last hour?"* using PromQL:

```promql
rate(shop_orders_created_total[5m])
```

### Cardinality: The Most Important Metric Rule

Every unique combination of (metric name + label values) creates a separate **time series**. More time series = more memory in Prometheus.

If you labeled a metric with `user.id` (millions of unique users), you would create millions of time series. This is called **cardinality explosion** and it crashes metrics backends.

**The rule:** put high-cardinality data on spans, not metrics.

```
Good metric label:  order.size_bucket = "small" | "medium" | "large"  (3 values)
Bad metric label:   user.id = "a84f..." (unbounded)

Good span attribute: order.id = "9f3a-..."  (fine, it's stored verbatim, not aggregated)
```

In this app every metric label is a small, bounded set: `order.size_bucket`, `product.category`, `failure.reason`.

---

## 5. Logs

Logs are the simplest signal: text messages emitted as the application runs.

```java
// OrderService.java
log.info("Order created: orderId={} userId={} total={}", saved.getId(), userId, total);
log.error("Checkout failed for userId={}: {}", userId, e.getMessage());
```

The application uses standard **SLF4J / Logback**. The OTel Java Agent installs a **Logback bridge appender** automatically (enabled by `OTEL_INSTRUMENTATION_LOGBACK_APPENDER_ENABLED: true` in `docker-compose.yml`). The bridge intercepts every log record and forwards it to the OTel SDK, which exports it via OTLP to the Collector, which sends it to Loki.

### Trace Correlation

The most valuable OTel log feature: when a log is emitted inside a traced operation, the SDK **automatically injects the active `traceId` and `spanId`** into the log record.

The log pattern in `application.yml` makes this visible in the console:

```
%d{...} [%thread] [%X{traceId}/%X{spanId}] %-5level %logger - %msg%n
```

Output:
```
2026-05-20 12:34:01.123 [http-nio-8080-exec-1] [4bf92f3577b34da6/00f067aa0ba902b7] INFO  OrderService - Order created: orderId=42 ...
```

In Grafana, you can click a span in the trace waterfall and immediately see the log lines that fired during that exact span — because they share the same `traceId`.

---

## 6. How Data Flows: The Full Pipeline

```
Spring Boot app (with Java Agent)
    │
    │  OTLP/gRPC  (port 4317)
    ▼
OTel Collector   ←── single entry point for all three signals
    │
    ├─► Tempo        (traces)      ◄── queried by Grafana TraceQL
    ├─► Prometheus   (metrics)     ◄── queried by Grafana PromQL
    └─► Loki         (logs)        ◄── queried by Grafana LogQL
```

The Collector's job is to receive, process, and route signals. In `otel/otel-collector-config.yml`:

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

Benefits of routing everything through the Collector:
- The application only needs to know one endpoint (`otel-collector:4317`).
- You can add, remove, or swap backends without touching application code.
- The `batch` processor groups data into larger payloads, reducing network overhead.
- The `memory_limiter` processor drops data before the Collector crashes under load.

---

## 7. Practical Exercises

Start the stack:

```bash
docker compose up --build
```

Then open Grafana at `http://localhost:3000` (admin / admin).

### Exercise A — Follow a Checkout Trace

1. Open the React frontend at `http://localhost:3001`, add items to a cart, and click **Checkout**.
2. In Grafana go to **Explore → Tempo** and search for service `shop-service`, span name `order.checkout`.
3. Click the trace. You should see:
   - The root HTTP span (`POST /api/orders/checkout`) created by the agent
   - The `order.checkout` child span from `@WithSpan`
   - The `order.validate_stock` nested span created manually
   - Span events like `checkout.started` and `checkout.completed`
   - Attributes like `order.id`, `order.total`, `order.items_count`

### Exercise B — Find the Logs for That Trace

1. While viewing the trace in Tempo, click the **Logs** button (or copy the `traceId`).
2. In **Explore → Loki** run: `{service_name="shop-service"} | traceID = "<paste traceId>"`
3. You should see the `Order created` log line from `OrderService`, emitted during the same trace.

### Exercise C — Watch Business Metrics

1. In Grafana go to the pre-built **Shop** dashboard.
2. The **Business KPIs** section shows order rate, revenue, cart activity, and checkout failures.
3. In the **Explore → Prometheus** view, run:
   ```promql
   rate(shop_orders_created_total[1m])
   ```
4. Find where in the source code that counter is incremented: `ShopMetrics.java` → `recordOrderCreated()` → called from `OrderService.checkout()`.

### Exercise D — Trigger an Error Trace

1. Try to check out with an empty cart (the traffic simulator does this automatically, or you can call the API directly).
2. Find the trace in Tempo. Notice:
   - The `order.checkout` span has `status = ERROR`
   - The `recordException` call attached the stack trace to the span
   - The checkout failure counter `shop.checkout.failures` increments in the metrics dashboard

---

## 8. Quick Reference

| Concept | Where to see it in this project |
|---------|--------------------------------|
| Auto-instrumented HTTP span | Tempo — root span on any `/api/` request |
| Auto-instrumented JDBC span | Tempo — `SELECT`/`INSERT` child spans inside service spans |
| `@WithSpan` | `CartService.java`, `OrderService.java`, `ProductService.java` |
| Manual span (nested) | `OrderService.java` — `order.validate_stock` span |
| Span attributes | `CartService.java` — `product.category`, `product.price` |
| Span events | `OrderService.java` — `checkout.started`, `checkout.completed` |
| Span error recording | `OrderService.java` — `setStatus(ERROR)` + `recordException()` |
| Counter metric | `ShopMetrics.java` — `shop.orders.created` |
| Histogram metric | `ShopMetrics.java` — `shop.orders.value` |
| Gauge metric | `ShopMetrics.java` — `shop.carts.active` |
| Log correlation | `application.yml` log pattern — `[%X{traceId}/%X{spanId}]` |
| Collector pipelines | `otel/otel-collector-config.yml` |

For deeper reading on any of these topics, see `docs/opentelemetry.md` (theory) and `docs/architecture.md` (implementation decisions).
