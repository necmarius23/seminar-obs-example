package com.example.shop.service;

import com.example.shop.exception.ResourceNotFoundException;
import com.example.shop.model.*;
import com.example.shop.observability.ShopMetrics;
import com.example.shop.repository.CartRepository;
import com.example.shop.repository.OrderRepository;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;
import io.opentelemetry.instrumentation.annotations.SpanAttribute;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
@Transactional
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private final OrderRepository orderRepository;
    private final CartRepository cartRepository;
    private final ProductService productService;
    private final ShopMetrics metrics;
    private final Tracer tracer;

    public OrderService(OrderRepository orderRepository, CartRepository cartRepository,
                        ProductService productService, ShopMetrics metrics, Tracer tracer) {
        this.orderRepository = orderRepository;
        this.cartRepository = cartRepository;
        this.productService = productService;
        this.metrics = metrics;
        this.tracer = tracer;
    }

    /**
     * Checkout: manually creates a child span to demonstrate nested manual instrumentation
     * alongside the @WithSpan annotation on the outer method.
     */
    @WithSpan("order.checkout")
    public Order checkout(@SpanAttribute("user.id") String userId) {
        metrics.recordCheckoutAttempt();
        Span checkoutSpan = Span.current();
        checkoutSpan.addEvent("checkout.started");

        Cart cart = cartRepository.findFirstByUserIdAndStatus(userId, Cart.CartStatus.ACTIVE)
                .orElseThrow(() -> new IllegalStateException("No active cart found for user: " + userId));

        if (cart.getItems().isEmpty()) {
            metrics.recordCheckoutFailure("empty_cart");
            throw new IllegalStateException("Cannot checkout an empty cart");
        }

        // Nested manual span for stock validation sub-step
        Span stockSpan = tracer.spanBuilder("order.validate_stock")
                .startSpan();
        try (Scope scope = stockSpan.makeCurrent()) {
            for (CartItem item : cart.getItems()) {
                productService.decreaseStock(item.getProduct().getId(), item.getQuantity());
            }
            stockSpan.addEvent("stock.validated");
        } catch (Exception e) {
            stockSpan.setStatus(StatusCode.ERROR, e.getMessage());
            stockSpan.recordException(e);
            metrics.recordCheckoutFailure("insufficient_stock");
            throw e;
        } finally {
            stockSpan.end();
        }

        // Build order
        Order order = new Order();
        order.setUserId(userId);

        BigDecimal total = BigDecimal.ZERO;
        for (CartItem cartItem : cart.getItems()) {
            OrderItem orderItem = new OrderItem();
            orderItem.setOrder(order);
            orderItem.setProduct(cartItem.getProduct());
            orderItem.setQuantity(cartItem.getQuantity());
            orderItem.setUnitPrice(cartItem.getUnitPrice());
            order.getItems().add(orderItem);
            total = total.add(cartItem.getSubtotal());
        }
        order.setTotalAmount(total);

        Order saved = orderRepository.save(order);

        // Mark cart as checked out
        cart.setStatus(Cart.CartStatus.CHECKED_OUT);
        cartRepository.save(cart);

        // Enrich the parent span with order outcome
        checkoutSpan.setAttribute("order.id", saved.getId());
        checkoutSpan.setAttribute("order.total", total.doubleValue());
        checkoutSpan.setAttribute("order.items_count", cart.getItems().size());
        checkoutSpan.addEvent("checkout.completed");

        metrics.recordOrderCreated(cart.getItems().size(), total.doubleValue());
        log.info("Order created: orderId={} userId={} total={} items={}",
                saved.getId(), userId, total, cart.getItems().size());

        return saved;
    }

    @WithSpan("order.list_by_user")
    @Transactional(readOnly = true)
    public List<Order> findByUser(@SpanAttribute("user.id") String userId) {
        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @WithSpan("order.find")
    @Transactional(readOnly = true)
    public Order findById(@SpanAttribute("order.id") Long orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));
    }

    @WithSpan("order.update_status")
    public Order updateStatus(@SpanAttribute("order.id") Long orderId,
                              @SpanAttribute("order.status") Order.OrderStatus newStatus) {
        Order order = findById(orderId);
        Order.OrderStatus previous = order.getStatus();
        order.setStatus(newStatus);
        Order saved = orderRepository.save(order);
        log.info("Order status updated: orderId={} {} -> {}", orderId, previous, newStatus);
        Span.current().addEvent("order.status_changed");
        return saved;
    }
}
