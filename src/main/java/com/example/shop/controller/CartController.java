package com.example.shop.controller;

import com.example.shop.dto.AddCartItemRequest;
import com.example.shop.dto.UpdateCartItemRequest;
import com.example.shop.model.Cart;
import com.example.shop.service.CartService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/cart/{userId}")
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @GetMapping
    public Cart getCart(@PathVariable String userId) {
        return cartService.getOrCreateCart(userId);
    }

    @PostMapping("/items")
    public Cart addItem(@PathVariable String userId,
                        @Valid @RequestBody AddCartItemRequest request) {
        return cartService.addItem(userId, request.productId(), request.quantity());
    }

    @PutMapping("/items/{itemId}")
    public Cart updateItem(@PathVariable String userId,
                           @PathVariable Long itemId,
                           @Valid @RequestBody UpdateCartItemRequest request) {
        return cartService.updateItem(userId, itemId, request.quantity());
    }

    @DeleteMapping("/items/{itemId}")
    public Cart removeItem(@PathVariable String userId,
                           @PathVariable Long itemId) {
        return cartService.removeItem(userId, itemId);
    }

    @DeleteMapping
    public void clearCart(@PathVariable String userId) {
        cartService.clearCart(userId);
    }
}
