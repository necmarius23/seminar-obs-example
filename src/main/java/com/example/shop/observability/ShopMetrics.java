package com.example.shop.observability;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.metrics.DoubleHistogram;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.metrics.ObservableLongGauge;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Business metrics via the OTel API, resolved through the shared GlobalOpenTelemetry registry.
 * The Java agent populates that registry before Spring starts, so these metrics flow through
 * the same OTLP pipeline as the auto-instrumented signals (traces, JVM metrics, logs).
 *
 * Attribute cardinality rule: only low-cardinality dimensions (category, size bucket,
 * failure reason) are used as metric attributes to avoid Prometheus label explosion.
 * High-cardinality values like userId or productId belong on spans, not metrics.
 */
@Component
public class ShopMetrics {

    // ── Attribute keys ────────────────────────────────────────────────────────
    static final AttributeKey<String> PRODUCT_CATEGORY  = AttributeKey.stringKey("product.category");
    static final AttributeKey<String> ORDER_SIZE_BUCKET = AttributeKey.stringKey("order.size_bucket");
    static final AttributeKey<String> FAILURE_REASON    = AttributeKey.stringKey("failure.reason");

    // ── Instruments ───────────────────────────────────────────────────────────
    private final LongCounter ordersCreated;
    private final DoubleHistogram orderValue;
    private final LongCounter cartItemsAdded;
    private final LongCounter productsViewed;
    private final LongCounter checkoutAttempts;
    private final LongCounter checkoutFailures;

    private final AtomicLong activeCartsGauge = new AtomicLong(0);
    @SuppressWarnings("unused")
    private final ObservableLongGauge activeCarts;

    public ShopMetrics() {
        Meter meter = GlobalOpenTelemetry.getMeter("com.example.shop");

        ordersCreated = meter.counterBuilder("shop.orders.created")
                .setDescription("Total number of orders placed")
                .setUnit("{order}")
                .build();

        orderValue = meter.histogramBuilder("shop.orders.value")
                .setDescription("Distribution of order total amounts")
                .setUnit("{USD}")
                .build();

        cartItemsAdded = meter.counterBuilder("shop.cart.items.added")
                .setDescription("Total number of items added to carts")
                .setUnit("{item}")
                .build();

        productsViewed = meter.counterBuilder("shop.products.viewed")
                .setDescription("Total number of product detail page views")
                .setUnit("{view}")
                .build();

        checkoutAttempts = meter.counterBuilder("shop.checkout.attempts")
                .setDescription("Total checkout attempts")
                .setUnit("{attempt}")
                .build();

        checkoutFailures = meter.counterBuilder("shop.checkout.failures")
                .setDescription("Total checkout failures, sliceable by reason")
                .setUnit("{failure}")
                .build();

        activeCarts = meter.gaugeBuilder("shop.carts.active")
                .setDescription("Number of active (non-checked-out) carts")
                .setUnit("{cart}")
                .ofLongs()
                .buildWithCallback(measurement -> measurement.record(activeCartsGauge.get(), Attributes.empty()));
    }

    // ── Recording methods ─────────────────────────────────────────────────────

    /**
     * @param itemsCount number of distinct line items — used to derive order.size_bucket
     * @param totalAmount order grand total in USD
     */
    public void recordOrderCreated(int itemsCount, double totalAmount) {
        Attributes attrs = Attributes.of(ORDER_SIZE_BUCKET, sizeBucket(itemsCount));
        ordersCreated.add(1, attrs);
        orderValue.record(totalAmount, attrs);
    }

    /**
     * @param category product.category of the added item (low-cardinality)
     * @param quantity  number of units added in this operation
     */
    public void recordCartItemAdded(String category, int quantity) {
        Attributes attrs = Attributes.of(PRODUCT_CATEGORY, category);
        cartItemsAdded.add(quantity, attrs);
    }

    /**
     * @param category product.category of the viewed product (low-cardinality)
     */
    public void recordProductViewed(String category) {
        Attributes attrs = Attributes.of(PRODUCT_CATEGORY, category);
        productsViewed.add(1, attrs);
    }

    public void recordCheckoutAttempt() {
        checkoutAttempts.add(1, Attributes.empty());
    }

    /**
     * @param reason low-cardinality failure cause, e.g. "empty_cart", "insufficient_stock"
     */
    public void recordCheckoutFailure(String reason) {
        Attributes attrs = Attributes.of(FAILURE_REASON, reason);
        checkoutFailures.add(1, attrs);
    }

    public void setActiveCarts(long count) {
        activeCartsGauge.set(count);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Buckets item count into a fixed set of labels to keep cardinality bounded. */
    private static String sizeBucket(int itemsCount) {
        if (itemsCount <= 2) return "small";
        if (itemsCount <= 5) return "medium";
        return "large";
    }
}
