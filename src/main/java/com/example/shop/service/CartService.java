package com.example.shop.service;

import com.example.shop.exception.ResourceNotFoundException;
import com.example.shop.model.Cart;
import com.example.shop.model.CartItem;
import com.example.shop.model.Product;
import com.example.shop.observability.ShopMetrics;
import com.example.shop.repository.CartItemRepository;
import com.example.shop.repository.CartRepository;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.instrumentation.annotations.SpanAttribute;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class CartService {

    private static final Logger log = LoggerFactory.getLogger(CartService.class);

    private final CartRepository cartRepository;
    private final CartItemRepository cartItemRepository;
    private final ProductService productService;
    private final ShopMetrics metrics;
    private final Tracer tracer;

    public CartService(CartRepository cartRepository, CartItemRepository cartItemRepository,
                       ProductService productService, ShopMetrics metrics, Tracer tracer) {
        this.cartRepository = cartRepository;
        this.cartItemRepository = cartItemRepository;
        this.productService = productService;
        this.metrics = metrics;
        this.tracer = tracer;
    }

    @WithSpan("cart.get_or_create")
    public Cart getOrCreateCart(@SpanAttribute("user.id") String userId) {
        return cartRepository.findFirstByUserIdAndStatus(userId, Cart.CartStatus.ACTIVE)
                .orElseGet(() -> {
                    log.info("Creating new cart for userId={}", userId);
                    Cart cart = new Cart();
                    cart.setUserId(userId);
                    Cart saved = cartRepository.save(cart);
                    metrics.setActiveCarts(cartRepository.findAll().stream()
                            .filter(c -> c.getStatus() == Cart.CartStatus.ACTIVE).count());
                    return saved;
                });
    }

    @WithSpan("cart.add_item")
    public Cart addItem(@SpanAttribute("user.id") String userId,
                        @SpanAttribute("product.id") Long productId,
                        @SpanAttribute("cart.quantity") int quantity) {

        // Manual span enrichment: attach business context as span events
        Span current = Span.current();
        current.addEvent("cart.item.lookup_started");

        Cart cart = getOrCreateCart(userId);
        Product product = productService.findById(productId);

        current.setAttribute("product.name", product.getName());
        current.setAttribute("product.category", product.getCategory());
        current.setAttribute("product.price", product.getPrice().doubleValue());

        // Check if item already in cart and update, otherwise add
        CartItem existingItem = cart.getItems().stream()
                .filter(i -> i.getProduct().getId().equals(productId))
                .findFirst()
                .orElse(null);

        if (existingItem != null) {
            existingItem.setQuantity(existingItem.getQuantity() + quantity);
            cartItemRepository.save(existingItem);
            log.info("Updated cart item: userId={} productId={} newQty={}", userId, productId, existingItem.getQuantity());
        } else {
            CartItem item = new CartItem();
            item.setCart(cart);
            item.setProduct(product);
            item.setQuantity(quantity);
            item.setUnitPrice(product.getPrice());
            cart.getItems().add(item);
            cartItemRepository.save(item);
            log.info("Added item to cart: userId={} productId={} qty={}", userId, productId, quantity);
        }

        current.addEvent("cart.item.added");
        metrics.recordCartItemAdded(product.getCategory(), quantity);
        return cartRepository.save(cart);
    }

    @WithSpan("cart.update_item")
    public Cart updateItem(@SpanAttribute("user.id") String userId,
                           @SpanAttribute("cart_item.id") Long itemId, int quantity) {
        Cart cart = getOrCreateCart(userId);
        CartItem item = cart.getItems().stream()
                .filter(i -> i.getId().equals(itemId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Cart item not found: " + itemId));

        item.setQuantity(quantity);
        cartItemRepository.save(item);
        log.info("Updated cart item id={} qty={}", itemId, quantity);
        return cartRepository.save(cart);
    }

    @WithSpan("cart.remove_item")
    public Cart removeItem(@SpanAttribute("user.id") String userId,
                           @SpanAttribute("cart_item.id") Long itemId) {
        Cart cart = getOrCreateCart(userId);
        cart.getItems().removeIf(i -> i.getId().equals(itemId));
        log.info("Removed cart item id={} for userId={}", itemId, userId);
        return cartRepository.save(cart);
    }

    @WithSpan("cart.clear")
    public void clearCart(@SpanAttribute("user.id") String userId) {
        Cart cart = getOrCreateCart(userId);
        cart.getItems().clear();
        cartRepository.save(cart);
        log.info("Cleared cart for userId={}", userId);
    }
}
