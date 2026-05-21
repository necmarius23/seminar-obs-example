package com.example.shop.service;

import com.example.shop.dto.ProductRequest;
import com.example.shop.exception.ResourceNotFoundException;
import com.example.shop.model.Product;
import com.example.shop.observability.ShopMetrics;
import com.example.shop.repository.ProductRepository;
import io.opentelemetry.instrumentation.annotations.SpanAttribute;
import io.opentelemetry.instrumentation.annotations.WithSpan;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class ProductService {

    private static final Logger log = LoggerFactory.getLogger(ProductService.class);

    private final ProductRepository productRepository;
    private final ShopMetrics metrics;

    public ProductService(ProductRepository productRepository, ShopMetrics metrics) {
        this.productRepository = productRepository;
        this.metrics = metrics;
    }

    @WithSpan("product.list")
    public List<Product> findAll() {
        log.debug("Listing all products");
        return productRepository.findAll();
    }

    @WithSpan("product.find")
    public Product findById(@SpanAttribute("product.id") Long id) {
        log.debug("Fetching product id={}", id);
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
        metrics.recordProductViewed(product.getCategory());
        return product;
    }

    @WithSpan("product.list_by_category")
    public List<Product> findByCategory(@SpanAttribute("product.category") String category) {
        log.debug("Listing products in category={}", category);
        return productRepository.findByCategory(category);
    }

    @WithSpan("product.create")
    @Transactional
    public Product create(ProductRequest request) {
        Product product = new Product();
        product.setName(request.name());
        product.setDescription(request.description());
        product.setPrice(request.price());
        product.setStockQuantity(request.stockQuantity());
        product.setCategory(request.category());
        Product saved = productRepository.save(product);
        log.info("Created product id={} name={}", saved.getId(), saved.getName());
        return saved;
    }

    @WithSpan("product.update_stock")
    @Transactional
    public void decreaseStock(@SpanAttribute("product.id") Long productId, int quantity) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + productId));
        if (product.getStockQuantity() < quantity) {
            throw new com.example.shop.exception.InsufficientStockException(
                    "Insufficient stock for product '%s': requested %d, available %d"
                            .formatted(product.getName(), quantity, product.getStockQuantity()));
        }
        product.setStockQuantity(product.getStockQuantity() - quantity);
        productRepository.save(product);
        log.debug("Decreased stock for product id={} by {}", productId, quantity);
    }
}
