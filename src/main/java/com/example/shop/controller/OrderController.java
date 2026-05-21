package com.example.shop.controller;

import com.example.shop.model.Order;
import com.example.shop.service.OrderService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/user/{userId}")
    public List<Order> listByUser(@PathVariable String userId) {
        return orderService.findByUser(userId);
    }

    @GetMapping("/{orderId}")
    public Order get(@PathVariable Long orderId) {
        return orderService.findById(orderId);
    }

    @PostMapping("/user/{userId}/checkout")
    @ResponseStatus(HttpStatus.CREATED)
    public Order checkout(@PathVariable String userId) {
        return orderService.checkout(userId);
    }

    @PatchMapping("/{orderId}/status")
    public Order updateStatus(@PathVariable Long orderId,
                              @RequestParam Order.OrderStatus status) {
        return orderService.updateStatus(orderId, status);
    }
}
