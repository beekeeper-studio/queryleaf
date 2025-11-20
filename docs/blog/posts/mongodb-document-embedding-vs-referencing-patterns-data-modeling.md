---
title: "MongoDB Document Embedding vs Referencing Patterns: Advanced Data Modeling for High-Performance Applications"
description: "Master MongoDB document embedding and referencing patterns for optimal data modeling. Learn when to embed vs reference, denormalization strategies, relationship optimization, and SQL-familiar data structure design patterns for scalable applications."
date: 2025-11-19
tags: [mongodb, data-modeling, document-embedding, referencing, denormalization, relationships, performance, sql]
---

# MongoDB Document Embedding vs Referencing Patterns: Advanced Data Modeling for High-Performance Applications

Effective data modeling is fundamental to application performance, scalability, and maintainability, particularly in document-oriented databases where developers have the flexibility to structure data in multiple ways. Traditional relational databases enforce normalized structures through foreign key relationships, but this approach often requires complex joins that become performance bottlenecks as data volumes and query complexity increase.

MongoDB's document model enables sophisticated data modeling strategies through document embedding and referencing patterns that can dramatically improve query performance and simplify application logic. Unlike relational databases that require expensive joins across multiple tables, MongoDB allows developers to embed related data directly within documents or use efficient referencing patterns optimized for document retrieval and updates.

## The Traditional Relational Modeling Challenge

Relational database modeling often requires complex normalization and expensive join operations:

```sql
-- Traditional PostgreSQL normalized schema - complex joins required

-- Order management system with multiple related tables
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(500) NOT NULL,
    email VARCHAR(320) NOT NULL UNIQUE,
    phone VARCHAR(20),
    
    -- Address information (could be separate table)
    billing_address_line1 VARCHAR(200) NOT NULL,
    billing_address_line2 VARCHAR(200),
    billing_city VARCHAR(100) NOT NULL,
    billing_state VARCHAR(50) NOT NULL,
    billing_postal_code VARCHAR(20) NOT NULL,
    billing_country VARCHAR(3) NOT NULL DEFAULT 'USA',
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    base_price DECIMAL(10,2) NOT NULL,
    category_id UUID NOT NULL,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (category_id) REFERENCES product_categories(category_id)
);

CREATE TABLE product_categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name VARCHAR(200) NOT NULL,
    parent_category_id UUID,
    category_path TEXT, -- Materialized path for hierarchy
    
    FOREIGN KEY (parent_category_id) REFERENCES product_categories(category_id)
);

CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    order_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- Order totals
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    shipping_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    
    -- Shipping information
    shipping_address_line1 VARCHAR(200),
    shipping_address_line2 VARCHAR(200),
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(50),
    shipping_postal_code VARCHAR(20),
    shipping_country VARCHAR(3),
    
    -- Timestamps
    order_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    shipped_date TIMESTAMP,
    delivered_date TIMESTAMP,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    
    CONSTRAINT chk_order_status 
        CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'))
);

CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    
    -- Product snapshot data (denormalized for historical accuracy)
    product_sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(500) NOT NULL,
    product_description TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    
    CONSTRAINT chk_quantity_positive CHECK (quantity > 0),
    CONSTRAINT chk_unit_price_positive CHECK (unit_price >= 0),
    CONSTRAINT chk_line_total_calculation CHECK (line_total = quantity * unit_price)
);

CREATE TABLE order_status_history (
    status_history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    status_changed_by UUID, -- User who changed the status
    status_change_reason TEXT,
    status_changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

-- Complex query to get complete order information - expensive joins
SELECT 
    -- Order information
    o.order_id,
    o.order_number,
    o.order_status,
    o.total_amount,
    o.order_date,
    
    -- Customer information (requires join)
    c.customer_id,
    c.company_name,
    c.email as customer_email,
    c.phone as customer_phone,
    
    -- Customer billing address
    c.billing_address_line1,
    c.billing_address_line2,
    c.billing_city,
    c.billing_state,
    c.billing_postal_code,
    c.billing_country,
    
    -- Order shipping address
    o.shipping_address_line1,
    o.shipping_address_line2,
    o.shipping_city,
    o.shipping_state,
    o.shipping_postal_code,
    o.shipping_country,
    
    -- Order items aggregation (requires complex subquery)
    (
        SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
                'product_id', oi.product_id,
                'product_sku', oi.product_sku,
                'product_name', oi.product_name,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'line_total', oi.line_total,
                'category', pc.category_name,
                'category_path', pc.category_path
            ) ORDER BY oi.created_at
        )
        FROM order_items oi
        JOIN products p ON oi.product_id = p.product_id
        JOIN product_categories pc ON p.category_id = pc.category_id
        WHERE oi.order_id = o.order_id
    ) as order_items,
    
    -- Order status history (requires another subquery)
    (
        SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
                'previous_status', osh.previous_status,
                'new_status', osh.new_status,
                'changed_at', osh.status_changed_at,
                'reason', osh.status_change_reason
            ) ORDER BY osh.status_changed_at DESC
        )
        FROM order_status_history osh
        WHERE osh.order_id = o.order_id
    ) as status_history

FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.order_id = $1;

-- Performance problems with traditional approach:
-- 1. Multiple JOIN operations create expensive query execution plans
-- 2. N+1 query problems when loading order lists with items
-- 3. Complex aggregations require subqueries and temporary result sets
-- 4. Schema changes require coordinated migrations across multiple tables
-- 5. Maintaining referential integrity across tables adds overhead
-- 6. Distributed transactions become complex with multiple related tables
-- 7. Caching strategies are complicated by normalized data spread across tables
-- 8. Application code becomes complex managing relationships between entities
-- 9. Query optimization requires deep understanding of join algorithms and indexing
-- 10. Scaling reads requires careful replication and read-replica routing strategies
```

MongoDB provides flexible document modeling with embedding and referencing patterns:

```javascript
// MongoDB Document Modeling - flexible embedding and referencing patterns
const { MongoClient, ObjectId } = require('mongodb');

// Advanced MongoDB Document Modeling Manager
class MongoDocumentModelingManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.modelingStrategies = new Map();
    this.performanceMetrics = new Map();
  }

  async initialize() {
    console.log('Initializing MongoDB Document Modeling Manager...');
    
    // Connect with optimized settings for document operations
    this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017', {
      // Optimized for document operations
      maxPoolSize: 20,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      
      // Read preferences for document modeling
      readPreference: 'primaryPreferred',
      readConcern: { level: 'local' },
      
      // Write concern for consistency
      writeConcern: { w: 1, j: true },
      
      // Compression for large documents
      compressors: ['zlib'],
      
      appName: 'DocumentModelingManager'
    });

    await this.client.connect();
    this.db = this.client.db('ecommerce');
    
    // Initialize document modeling strategies
    await this.setupModelingStrategies();
    
    console.log('✅ MongoDB Document Modeling Manager initialized');
  }

  async setupModelingStrategies() {
    console.log('Setting up document modeling strategies...');
    
    const strategies = {
      // Embedding strategy for one-to-few relationships
      'embed_small_related': {
        name: 'Embed Small Related Data',
        description: 'Embed small, frequently accessed related documents',
        useCases: ['order_items', 'user_preferences', 'product_variants'],
        benefits: ['Single query retrieval', 'Atomic updates', 'Better performance'],
        limitations: ['Document size limits', 'Update complexity for arrays'],
        maxDocumentSize: 16777216, // 16MB MongoDB limit
        maxArrayElements: 1000     // Practical limit for embedded arrays
      },
      
      // Referencing strategy for one-to-many relationships
      'reference_large_collections': {
        name: 'Reference Large Collections',
        description: 'Use references for large or independently managed collections',
        useCases: ['user_orders', 'product_reviews', 'transaction_history'],
        benefits: ['Flexible querying', 'Independent updates', 'Smaller documents'],
        limitations: ['Multiple queries needed', 'No atomic cross-document updates'],
        maxReferencedDocuments: 1000000 // Practical query limit
      },
      
      // Hybrid strategy for complex relationships
      'hybrid_denormalization': {
        name: 'Hybrid Denormalization',
        description: 'Combine embedding and referencing with selective denormalization',
        useCases: ['order_with_customer_summary', 'product_with_category_details'],
        benefits: ['Optimized for read patterns', 'Reduced query complexity', 'Good performance'],
        limitations: ['Data duplication', 'Update coordination needed'],
        denormalizationFields: ['frequently_accessed', 'rarely_changed', 'small_size']
      }
    };

    for (const [strategyKey, strategy] of Object.entries(strategies)) {
      this.modelingStrategies.set(strategyKey, strategy);
    }

    console.log('✅ Document modeling strategies initialized');
  }

  // Embedding Pattern Implementation
  async createEmbeddedOrderDocument(orderData) {
    console.log('Creating embedded order document...');
    
    try {
      const embeddedOrder = {
        _id: new ObjectId(),
        orderNumber: orderData.orderNumber,
        orderDate: new Date(),
        status: 'pending',
        
        // Embedded customer information (frequently accessed, rarely changes)
        customer: {
          customerId: orderData.customer.customerId,
          companyName: orderData.customer.companyName,
          email: orderData.customer.email,
          phone: orderData.customer.phone,
          
          // Embedded billing address
          billingAddress: {
            line1: orderData.customer.billingAddress.line1,
            line2: orderData.customer.billingAddress.line2,
            city: orderData.customer.billingAddress.city,
            state: orderData.customer.billingAddress.state,
            postalCode: orderData.customer.billingAddress.postalCode,
            country: orderData.customer.billingAddress.country
          }
        },
        
        // Embedded shipping address
        shippingAddress: {
          line1: orderData.shippingAddress.line1,
          line2: orderData.shippingAddress.line2,
          city: orderData.shippingAddress.city,
          state: orderData.shippingAddress.state,
          postalCode: orderData.shippingAddress.postalCode,
          country: orderData.shippingAddress.country
        },
        
        // Embedded order items (one-to-few relationship)
        items: orderData.items.map(item => ({
          itemId: new ObjectId(),
          productId: item.productId,
          
          // Denormalized product information (snapshot for historical accuracy)
          product: {
            sku: item.product.sku,
            name: item.product.name,
            description: item.product.description,
            category: item.product.category,
            categoryPath: item.product.categoryPath
          },
          
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.quantity * item.unitPrice,
          
          // Item-specific metadata
          addedAt: new Date(),
          notes: item.notes || null
        })),
        
        // Order totals (calculated from items)
        totals: {
          subtotal: orderData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0),
          taxAmount: orderData.taxAmount || 0,
          shippingAmount: orderData.shippingAmount || 0,
          discountAmount: orderData.discountAmount || 0,
          total: 0 // Will be calculated
        },
        
        // Embedded status history
        statusHistory: [{
          previousStatus: null,
          newStatus: 'pending',
          changedAt: new Date(),
          changedBy: orderData.createdBy,
          reason: 'Order created'
        }],
        
        // Payment information (embedded for atomic updates)
        payment: {
          paymentMethod: orderData.payment.method,
          paymentStatus: 'pending',
          transactions: []
        },
        
        // Metadata
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: orderData.createdBy,
          version: 1,
          dataModelingStrategy: 'embedded'
        }
      };

      // Calculate total
      embeddedOrder.totals.total = 
        embeddedOrder.totals.subtotal + 
        embeddedOrder.totals.taxAmount + 
        embeddedOrder.totals.shippingAmount - 
        embeddedOrder.totals.discountAmount;

      // Insert the complete embedded document
      const result = await this.db.collection('orders_embedded').insertOne(embeddedOrder);
      
      console.log('✅ Embedded order document created:', result.insertedId);
      
      return {
        success: true,
        orderId: result.insertedId,
        strategy: 'embedded',
        documentSize: JSON.stringify(embeddedOrder).length,
        embeddedCollections: ['customer', 'items', 'statusHistory', 'payment']
      };

    } catch (error) {
      console.error('Error creating embedded order document:', error);
      return { success: false, error: error.message };
    }
  }

  // Referencing Pattern Implementation
  async createReferencedOrderDocument(orderData) {
    console.log('Creating referenced order document...');
    
    const session = this.client.startSession();
    
    try {
      return await session.withTransaction(async () => {
        // Create main order document with references
        const referencedOrder = {
          _id: new ObjectId(),
          orderNumber: orderData.orderNumber,
          orderDate: new Date(),
          status: 'pending',
          
          // Reference to customer document
          customerId: new ObjectId(orderData.customer.customerId),
          
          // Embedded shipping address (order-specific, not shared)
          shippingAddress: {
            line1: orderData.shippingAddress.line1,
            line2: orderData.shippingAddress.line2,
            city: orderData.shippingAddress.city,
            state: orderData.shippingAddress.state,
            postalCode: orderData.shippingAddress.postalCode,
            country: orderData.shippingAddress.country
          },
          
          // Order totals
          totals: {
            subtotal: 0, // Will be calculated from items
            taxAmount: orderData.taxAmount || 0,
            shippingAmount: orderData.shippingAmount || 0,
            discountAmount: orderData.discountAmount || 0,
            total: 0
          },
          
          // Reference to payment document
          paymentId: null, // Will be set after payment creation
          
          // Metadata
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: orderData.createdBy,
            version: 1,
            dataModelingStrategy: 'referenced'
          }
        };

        // Insert main order document
        const orderResult = await this.db.collection('orders_referenced')
          .insertOne(referencedOrder, { session });

        // Create separate order items documents
        const orderItems = orderData.items.map(item => ({
          _id: new ObjectId(),
          orderId: orderResult.insertedId,
          productId: new ObjectId(item.productId),
          
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.quantity * item.unitPrice,
          
          // Metadata
          addedAt: new Date(),
          notes: item.notes || null
        }));

        const itemsResult = await this.db.collection('order_items_referenced')
          .insertMany(orderItems, { session });

        // Calculate and update order totals
        const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
        const total = subtotal + referencedOrder.totals.taxAmount + 
                     referencedOrder.totals.shippingAmount - 
                     referencedOrder.totals.discountAmount;

        await this.db.collection('orders_referenced').updateOne(
          { _id: orderResult.insertedId },
          { 
            $set: { 
              'totals.subtotal': subtotal,
              'totals.total': total,
              'metadata.updatedAt': new Date()
            }
          },
          { session }
        );

        // Create initial status history document
        await this.db.collection('order_status_history').insertOne({
          _id: new ObjectId(),
          orderId: orderResult.insertedId,
          previousStatus: null,
          newStatus: 'pending',
          changedAt: new Date(),
          changedBy: orderData.createdBy,
          reason: 'Order created'
        }, { session });

        console.log('✅ Referenced order documents created');
        
        return {
          success: true,
          orderId: orderResult.insertedId,
          strategy: 'referenced',
          relatedCollections: {
            orderItems: Object.values(itemsResult.insertedIds).length,
            statusHistory: 1
          }
        };
      });

    } catch (error) {
      console.error('Error creating referenced order document:', error);
      return { success: false, error: error.message };
    } finally {
      await session.endSession();
    }
  }

  // Hybrid Pattern Implementation
  async createHybridOrderDocument(orderData) {
    console.log('Creating hybrid order document with selective denormalization...');
    
    try {
      const hybridOrder = {
        _id: new ObjectId(),
        orderNumber: orderData.orderNumber,
        orderDate: new Date(),
        status: 'pending',
        
        // Hybrid customer approach: embed summary, reference full document
        customer: {
          // Denormalized frequently accessed fields
          customerId: new ObjectId(orderData.customer.customerId),
          companyName: orderData.customer.companyName,
          email: orderData.customer.email,
          
          // Reference for complete customer information
          customerRef: {
            collection: 'customers',
            id: new ObjectId(orderData.customer.customerId)
          }
        },
        
        // Embedded shipping address
        shippingAddress: {
          line1: orderData.shippingAddress.line1,
          line2: orderData.shippingAddress.line2,
          city: orderData.shippingAddress.city,
          state: orderData.shippingAddress.state,
          postalCode: orderData.shippingAddress.postalCode,
          country: orderData.shippingAddress.country
        },
        
        // Hybrid items approach: embed summary, reference details for large catalogs
        itemsSummary: {
          totalItems: orderData.items.length,
          totalQuantity: orderData.items.reduce((sum, item) => sum + item.quantity, 0),
          uniqueProducts: [...new Set(orderData.items.map(item => item.productId))].length,
          
          // Embed small item summaries for quick display
          quickView: orderData.items.slice(0, 5).map(item => ({
            productId: new ObjectId(item.productId),
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.quantity * item.unitPrice
          }))
        },
        
        // Reference to complete items collection for large orders
        itemsCollection: orderData.items.length > 10 ? {
          collection: 'order_items_detailed',
          orderId: null // Will be set after document creation
        } : null,
        
        // Embed all items for small orders (< 10 items)
        items: orderData.items.length <= 10 ? orderData.items.map(item => ({
          itemId: new ObjectId(),
          productId: new ObjectId(item.productId),
          
          // Denormalized product summary
          product: {
            sku: item.product.sku,
            name: item.product.name,
            category: item.product.category
          },
          
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.quantity * item.unitPrice
        })) : [],
        
        // Order totals with embedded calculations
        totals: {
          subtotal: orderData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0),
          taxAmount: orderData.taxAmount || 0,
          shippingAmount: orderData.shippingAmount || 0,
          discountAmount: orderData.discountAmount || 0,
          total: 0 // Will be calculated
        },
        
        // Recent status embedded, full history referenced
        currentStatus: {
          status: 'pending',
          updatedAt: new Date(),
          updatedBy: orderData.createdBy
        },
        
        statusHistoryRef: {
          collection: 'order_status_history',
          orderId: null // Will be set after document creation
        },
        
        // Metadata with modeling strategy information
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: orderData.createdBy,
          version: 1,
          dataModelingStrategy: 'hybrid',
          embeddingDecisions: {
            customer: 'partial_denormalization',
            items: orderData.items.length <= 10 ? 'embedded' : 'referenced_with_summary',
            statusHistory: 'current_embedded_history_referenced'
          }
        }
      };

      // Calculate total
      hybridOrder.totals.total = 
        hybridOrder.totals.subtotal + 
        hybridOrder.totals.taxAmount + 
        hybridOrder.totals.shippingAmount - 
        hybridOrder.totals.discountAmount;

      // Insert the hybrid order document
      const result = await this.db.collection('orders_hybrid').insertOne(hybridOrder);
      
      // If large order, create separate detailed items collection
      if (orderData.items.length > 10) {
        const detailedItems = orderData.items.map(item => ({
          _id: new ObjectId(),
          orderId: result.insertedId,
          productId: new ObjectId(item.productId),
          
          // Full product information for detailed operations
          product: {
            sku: item.product.sku,
            name: item.product.name,
            description: item.product.description,
            category: item.product.category,
            categoryPath: item.product.categoryPath,
            specifications: item.product.specifications
          },
          
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.quantity * item.unitPrice,
          
          // Additional item metadata
          addedAt: new Date(),
          notes: item.notes || null,
          customizations: item.customizations || {}
        }));

        await this.db.collection('order_items_detailed').insertMany(detailedItems);
        
        // Update reference in main document
        await this.db.collection('orders_hybrid').updateOne(
          { _id: result.insertedId },
          { $set: { 'itemsCollection.orderId': result.insertedId } }
        );
      }

      // Create initial status history
      await this.db.collection('order_status_history').insertOne({
        _id: new ObjectId(),
        orderId: result.insertedId,
        previousStatus: null,
        newStatus: 'pending',
        changedAt: new Date(),
        changedBy: orderData.createdBy,
        reason: 'Order created'
      });

      // Update status history reference
      await this.db.collection('orders_hybrid').updateOne(
        { _id: result.insertedId },
        { $set: { 'statusHistoryRef.orderId': result.insertedId } }
      );

      console.log('✅ Hybrid order document created:', result.insertedId);
      
      return {
        success: true,
        orderId: result.insertedId,
        strategy: 'hybrid',
        embeddingDecisions: hybridOrder.metadata.embeddingDecisions,
        documentSize: JSON.stringify(hybridOrder).length,
        separateCollections: orderData.items.length > 10 ? ['order_items_detailed'] : []
      };

    } catch (error) {
      console.error('Error creating hybrid order document:', error);
      return { success: false, error: error.message };
    }
  }

  async performModelingStrategyComparison(orderData) {
    console.log('Performing modeling strategy comparison...');
    
    const strategies = ['embedded', 'referenced', 'hybrid'];
    const results = {};
    
    for (const strategy of strategies) {
      const startTime = Date.now();
      let result;
      
      try {
        switch (strategy) {
          case 'embedded':
            result = await this.createEmbeddedOrderDocument(orderData);
            break;
          case 'referenced':
            result = await this.createReferencedOrderDocument(orderData);
            break;
          case 'hybrid':
            result = await this.createHybridOrderDocument(orderData);
            break;
        }
        
        const executionTime = Date.now() - startTime;
        
        // Perform read performance test
        const readStartTime = Date.now();
        await this.retrieveOrderByStrategy(result.orderId, strategy);
        const readTime = Date.now() - readStartTime;
        
        results[strategy] = {
          success: result.success,
          orderId: result.orderId,
          creationTime: executionTime,
          readTime: readTime,
          documentSize: result.documentSize || null,
          collections: this.getCollectionCountForStrategy(strategy),
          advantages: this.getStrategyAdvantages(strategy),
          limitations: this.getStrategyLimitations(strategy)
        };
        
      } catch (error) {
        results[strategy] = {
          success: false,
          error: error.message,
          creationTime: Date.now() - startTime
        };
      }
    }
    
    // Generate comparison analysis
    const analysis = this.analyzeStrategyComparison(results, orderData);
    
    return {
      timestamp: new Date(),
      orderData: {
        itemCount: orderData.items.length,
        customerType: orderData.customer.type,
        orderValue: orderData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
      },
      results: results,
      analysis: analysis,
      recommendation: this.generateStrategyRecommendation(results, orderData)
    };
  }

  async retrieveOrderByStrategy(orderId, strategy) {
    switch (strategy) {
      case 'embedded':
        return await this.db.collection('orders_embedded').findOne({ _id: orderId });
        
      case 'referenced':
        const order = await this.db.collection('orders_referenced').findOne({ _id: orderId });
        if (order) {
          // Simulate additional queries needed for referenced data
          const items = await this.db.collection('order_items_referenced')
            .find({ orderId: orderId }).toArray();
          const customer = await this.db.collection('customers')
            .findOne({ _id: order.customerId });
          const statusHistory = await this.db.collection('order_status_history')
            .find({ orderId: orderId }).toArray();
          
          return { ...order, items, customer, statusHistory };
        }
        return order;
        
      case 'hybrid':
        const hybridOrder = await this.db.collection('orders_hybrid').findOne({ _id: orderId });
        if (hybridOrder && hybridOrder.itemsCollection) {
          // Load detailed items if referenced
          const detailedItems = await this.db.collection('order_items_detailed')
            .find({ orderId: orderId }).toArray();
          hybridOrder.detailedItems = detailedItems;
        }
        return hybridOrder;
        
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  getCollectionCountForStrategy(strategy) {
    const collectionCounts = {
      embedded: 1,    // Only orders_embedded
      referenced: 3,  // orders_referenced, order_items_referenced, order_status_history
      hybrid: 2       // orders_hybrid, order_status_history (+ conditional order_items_detailed)
    };
    return collectionCounts[strategy] || 0;
  }

  getStrategyAdvantages(strategy) {
    const advantages = {
      embedded: [
        'Single query retrieval for complete order',
        'Atomic updates across related data',
        'Better read performance for order details',
        'Simplified application logic',
        'Natural data locality'
      ],
      referenced: [
        'Flexible independent querying of entities',
        'Smaller individual document sizes',
        'Easy to update individual components',
        'Better for large item collections',
        'Familiar relational-style patterns'
      ],
      hybrid: [
        'Optimized for specific access patterns',
        'Best read performance for common operations',
        'Balanced document sizes',
        'Flexibility for both embedded and referenced data',
        'Adaptive to data volume changes'
      ]
    };
    return advantages[strategy] || [];
  }

  getStrategyLimitations(strategy) {
    const limitations = {
      embedded: [
        'Document size limits (16MB)',
        'Complex updates for large arrays',
        'Potential for data duplication',
        'Less flexible for independent querying',
        'Growth limitations for embedded collections'
      ],
      referenced: [
        'Multiple queries needed for complete data',
        'No atomic cross-document transactions',
        'More complex application logic',
        'Potential N+1 query problems',
        'Reduced read performance'
      ],
      hybrid: [
        'Increased complexity in data modeling decisions',
        'Potential for data synchronization issues',
        'More maintenance overhead',
        'Complexity in query optimization',
        'Requires careful planning for access patterns'
      ]
    };
    return limitations[strategy] || [];
  }

  analyzeStrategyComparison(results, orderData) {
    const analysis = {
      performance: {},
      scalability: {},
      complexity: {},
      dataIntegrity: {}
    };
    
    // Performance analysis
    const fastest = Object.entries(results).reduce((fastest, [strategy, result]) => {
      if (result.success && (!fastest || result.readTime < fastest.readTime)) {
        return { strategy, readTime: result.readTime };
      }
      return fastest;
    }, null);
    
    analysis.performance.fastestRead = fastest;
    analysis.performance.readTimeComparison = Object.fromEntries(
      Object.entries(results).map(([strategy, result]) => [
        strategy, 
        result.success ? result.readTime : 'failed'
      ])
    );
    
    // Scalability analysis based on order characteristics
    const itemCount = orderData.items.length;
    if (itemCount <= 5) {
      analysis.scalability.recommendation = 'embedded';
      analysis.scalability.reason = 'Small item count ideal for embedding';
    } else if (itemCount <= 20) {
      analysis.scalability.recommendation = 'hybrid';
      analysis.scalability.reason = 'Medium item count benefits from hybrid approach';
    } else {
      analysis.scalability.recommendation = 'referenced';
      analysis.scalability.reason = 'Large item count requires referencing to avoid document size limits';
    }
    
    // Complexity analysis
    analysis.complexity.applicationLogic = {
      embedded: 'Low - single document operations',
      referenced: 'High - multiple collection coordination',
      hybrid: 'Medium - selective complexity based on data size'
    };
    
    // Data integrity analysis
    analysis.dataIntegrity = {
      embedded: 'High - atomic document updates',
      referenced: 'Medium - requires transaction coordination',
      hybrid: 'Medium - mixed atomic and coordinated updates'
    };
    
    return analysis;
  }

  generateStrategyRecommendation(results, orderData) {
    const itemCount = orderData.items.length;
    const orderValue = orderData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    
    // Decision matrix based on order characteristics
    if (itemCount <= 5 && orderValue < 1000) {
      return {
        recommendedStrategy: 'embedded',
        confidence: 'high',
        reasoning: 'Small order with few items ideal for embedded document pattern',
        benefits: [
          'Fastest read performance',
          'Simplest application logic',
          'Atomic updates',
          'Best for order display and processing'
        ],
        considerations: [
          'Monitor document growth over time',
          'Consider hybrid if order complexity increases'
        ]
      };
    } else if (itemCount <= 20) {
      return {
        recommendedStrategy: 'hybrid',
        confidence: 'high',
        reasoning: 'Medium-sized order benefits from selective embedding and referencing',
        benefits: [
          'Optimized for common access patterns',
          'Balanced performance and flexibility',
          'Handles growth well',
          'Good read performance with manageable complexity'
        ],
        considerations: [
          'Requires careful design of embedded vs referenced data',
          'Monitor access patterns to optimize embedding decisions'
        ]
      };
    } else {
      return {
        recommendedStrategy: 'referenced',
        confidence: 'medium',
        reasoning: 'Large order requires referencing to manage document size and complexity',
        benefits: [
          'Avoids document size limits',
          'Flexible querying of individual components',
          'Better for large-scale data management',
          'Easier to update individual items'
        ],
        considerations: [
          'Requires multiple queries for complete order data',
          'Consider caching strategies for performance',
          'Use transactions for data consistency'
        ]
      };
    }
  }

  async getModelingMetrics() {
    const collections = [
      'orders_embedded',
      'orders_referenced', 
      'order_items_referenced',
      'orders_hybrid',
      'order_items_detailed',
      'order_status_history'
    ];
    
    const metrics = {
      timestamp: new Date(),
      collections: {},
      summary: {
        totalOrders: 0,
        embeddedOrders: 0,
        referencedOrders: 0,
        hybridOrders: 0,
        averageDocumentSize: 0
      }
    };
    
    for (const collectionName of collections) {
      try {
        const collection = this.db.collection(collectionName);
        const stats = await this.db.command({ collStats: collectionName });
        
        metrics.collections[collectionName] = {
          documentCount: stats.count,
          storageSize: stats.storageSize,
          averageDocumentSize: stats.avgObjSize,
          indexCount: stats.nindexes,
          indexSize: stats.totalIndexSize
        };
        
        // Count orders by strategy
        if (collectionName.includes('orders')) {
          if (collectionName.includes('embedded')) {
            metrics.summary.embeddedOrders = stats.count;
          } else if (collectionName.includes('referenced')) {
            metrics.summary.referencedOrders = stats.count;
          } else if (collectionName.includes('hybrid')) {
            metrics.summary.hybridOrders = stats.count;
          }
        }
        
      } catch (error) {
        metrics.collections[collectionName] = { error: error.message };
      }
    }
    
    metrics.summary.totalOrders = 
      metrics.summary.embeddedOrders + 
      metrics.summary.referencedOrders + 
      metrics.summary.hybridOrders;
    
    return metrics;
  }

  async shutdown() {
    console.log('Shutting down MongoDB Document Modeling Manager...');
    
    if (this.client) {
      await this.client.close();
      console.log('✅ MongoDB connection closed');
    }
    
    this.modelingStrategies.clear();
    this.performanceMetrics.clear();
  }
}

// Export the document modeling manager
module.exports = { MongoDocumentModelingManager };

// Benefits of MongoDB Document Modeling:
// - Flexible embedding and referencing patterns eliminate complex join operations
// - Atomic document operations provide strong consistency for related data
// - Optimized read performance through denormalization and data locality
// - Adaptive modeling strategies that scale with data volume and access patterns
// - Simplified application logic through single-document operations
// - Natural data relationships that map to application object models
// - Hybrid approaches that balance performance, flexibility, and maintainability
// - Reduced query complexity through strategic data embedding
// - Better cache utilization through document-based data access
// - SQL-compatible document modeling patterns through QueryLeaf integration
```

## Understanding MongoDB Document Relationships

### Embedding vs Referencing Decision Framework

Choose the optimal modeling strategy based on data characteristics and access patterns:

```javascript
// Advanced decision framework for embedding vs referencing
class DocumentModelingDecisionEngine {
  constructor() {
    this.decisionRules = new Map();
    this.performanceProfiles = new Map();
    this.scalabilityThresholds = new Map();
  }

  async analyzeRelationshipPattern(relationshipData) {
    console.log('Analyzing relationship pattern for optimal modeling strategy...');
    
    const analysis = {
      relationship: relationshipData,
      characteristics: this.analyzeDataCharacteristics(relationshipData),
      accessPatterns: this.analyzeAccessPatterns(relationshipData),
      scalabilityFactors: this.analyzeScalabilityFactors(relationshipData),
      recommendation: null
    };
    
    // Apply decision framework
    analysis.recommendation = this.generateModelingRecommendation(analysis);
    
    return analysis;
  }

  analyzeDataCharacteristics(relationshipData) {
    return {
      cardinality: this.determineCardinality(relationshipData),
      dataVolume: this.assessDataVolume(relationshipData),
      dataStability: this.assessDataStability(relationshipData),
      documentComplexity: this.assessDocumentComplexity(relationshipData)
    };
  }

  determineCardinality(relationshipData) {
    const { parentCollection, childCollection, relationshipType } = relationshipData;
    
    if (relationshipType === 'one-to-one') {
      return {
        type: 'one-to-one',
        recommendation: 'embed',
        confidence: 'high',
        reasoning: 'One-to-one relationships benefit from embedding for atomic operations'
      };
    } else if (relationshipType === 'one-to-few') {
      return {
        type: 'one-to-few',
        recommendation: 'embed',
        confidence: 'high',
        reasoning: 'Small collections (< 100 items) should be embedded for performance'
      };
    } else if (relationshipType === 'one-to-many') {
      return {
        type: 'one-to-many',
        recommendation: 'reference',
        confidence: 'medium',
        reasoning: 'Large collections may exceed document size limits if embedded'
      };
    } else if (relationshipType === 'many-to-many') {
      return {
        type: 'many-to-many',
        recommendation: 'reference',
        confidence: 'high',
        reasoning: 'Many-to-many relationships require referencing to avoid duplication'
      };
    }
    
    return { type: 'unknown', recommendation: 'analyze_further' };
  }

  assessDataVolume(relationshipData) {
    const { estimatedChildDocuments, averageChildSize, maxChildSize } = relationshipData;
    
    const estimatedEmbeddedSize = estimatedChildDocuments * averageChildSize;
    const maxEmbeddedSize = estimatedChildDocuments * maxChildSize;
    
    // MongoDB 16MB document limit
    const documentSizeLimit = 16 * 1024 * 1024; // 16MB
    const practicalLimit = documentSizeLimit * 0.8; // 80% of limit for safety
    
    return {
      estimatedSize: estimatedEmbeddedSize,
      maxPotentialSize: maxEmbeddedSize,
      exceedsLimit: maxEmbeddedSize > practicalLimit,
      volumeRecommendation: maxEmbeddedSize > practicalLimit ? 'reference' : 'embed',
      sizingDetails: {
        documentLimit: documentSizeLimit,
        practicalLimit: practicalLimit,
        utilizationPercent: (estimatedEmbeddedSize / practicalLimit) * 100
      }
    };
  }

  assessDataStability(relationshipData) {
    const { updateFrequency, childDocumentMutability, parentDocumentMutability } = relationshipData;
    
    if (updateFrequency === 'high' && childDocumentMutability === 'high') {
      return {
        stability: 'low',
        recommendation: 'reference',
        reasoning: 'High update frequency on embedded arrays can cause performance issues'
      };
    } else if (updateFrequency === 'low' && childDocumentMutability === 'low') {
      return {
        stability: 'high',
        recommendation: 'embed',
        reasoning: 'Stable data benefits from embedding for read performance'
      };
    } else {
      return {
        stability: 'medium',
        recommendation: 'hybrid',
        reasoning: 'Mixed stability patterns may benefit from selective embedding'
      };
    }
  }

  assessDocumentComplexity(relationshipData) {
    const { childDocumentStructure, nestingLevels, arrayComplexity } = relationshipData;
    
    const complexityScore = 
      (nestingLevels * 2) + 
      (arrayComplexity === 'high' ? 3 : arrayComplexity === 'medium' ? 2 : 1) +
      (Object.keys(childDocumentStructure).length * 0.1);
    
    return {
      complexityScore: complexityScore,
      level: complexityScore > 10 ? 'high' : complexityScore > 5 ? 'medium' : 'low',
      recommendation: complexityScore > 10 ? 'reference' : 'embed',
      reasoning: complexityScore > 10 
        ? 'High complexity documents should be referenced to maintain manageable parent documents'
        : 'Low to medium complexity allows for efficient embedding'
    };
  }

  analyzeAccessPatterns(relationshipData) {
    const { 
      parentReadFrequency, 
      childReadFrequency, 
      jointReadFrequency,
      independentChildQueries,
      bulkChildOperations 
    } = relationshipData.accessPatterns;
    
    return {
      primaryPattern: jointReadFrequency > (parentReadFrequency + childReadFrequency) / 2 
        ? 'joint_access' : 'independent_access',
      jointAccessRatio: jointReadFrequency / (parentReadFrequency + childReadFrequency),
      independentQueriesFrequent: independentChildQueries === 'high',
      bulkOperationsFrequent: bulkChildOperations === 'high',
      
      accessRecommendation: this.generateAccessBasedRecommendation(relationshipData.accessPatterns)
    };
  }

  generateAccessBasedRecommendation(accessPatterns) {
    const { jointReadFrequency, independentChildQueries, bulkChildOperations } = accessPatterns;
    
    if (jointReadFrequency === 'high' && independentChildQueries === 'low') {
      return {
        strategy: 'embed',
        confidence: 'high',
        reasoning: 'High joint read frequency with low independent queries favors embedding'
      };
    } else if (independentChildQueries === 'high' || bulkChildOperations === 'high') {
      return {
        strategy: 'reference',
        confidence: 'high',
        reasoning: 'High independent child operations favor referencing for query flexibility'
      };
    } else {
      return {
        strategy: 'hybrid',
        confidence: 'medium',
        reasoning: 'Mixed access patterns may benefit from hybrid approach with summary embedding'
      };
    }
  }

  analyzeScalabilityFactors(relationshipData) {
    const { growthProjections, performanceRequirements, maintenanceComplexity } = relationshipData;
    
    return {
      projectedGrowth: growthProjections,
      performanceTargets: performanceRequirements,
      maintenanceBurden: maintenanceComplexity,
      
      scalabilityRecommendation: this.generateScalabilityRecommendation(relationshipData)
    };
  }

  generateScalabilityRecommendation(relationshipData) {
    const { growthProjections, performanceRequirements } = relationshipData;
    
    if (growthProjections.childDocuments === 'exponential') {
      return {
        strategy: 'reference',
        confidence: 'high',
        reasoning: 'Exponential growth requires referencing to prevent document size issues',
        scalingConsiderations: [
          'Implement pagination for large result sets',
          'Consider sharding strategies for high-volume collections',
          'Monitor document size growth patterns'
        ]
      };
    } else if (performanceRequirements.readLatency === 'critical') {
      return {
        strategy: 'embed',
        confidence: 'high',
        reasoning: 'Critical read performance requirements favor embedding for single-query retrieval',
        scalingConsiderations: [
          'Monitor embedded array growth',
          'Implement size-based migration to referencing',
          'Consider read replicas for scaling reads'
        ]
      };
    } else {
      return {
        strategy: 'hybrid',
        confidence: 'medium',
        reasoning: 'Balanced growth and performance requirements suit hybrid approach',
        scalingConsiderations: [
          'Start with embedding, migrate to referencing as data grows',
          'Implement adaptive strategies based on document size',
          'Monitor access patterns for optimization opportunities'
        ]
      };
    }
  }

  generateModelingRecommendation(analysis) {
    const recommendations = {
      embedding: 0,
      referencing: 0,
      hybrid: 0
    };
    
    // Weight different factors
    const factors = [
      { factor: analysis.characteristics.cardinality, weight: 3 },
      { factor: analysis.characteristics.dataVolume, weight: 4 },
      { factor: analysis.characteristics.dataStability, weight: 2 },
      { factor: analysis.accessPatterns.accessRecommendation, weight: 3 },
      { factor: analysis.scalabilityFactors.scalabilityRecommendation, weight: 2 }
    ];
    
    // Score each strategy based on factor recommendations
    factors.forEach(({ factor, weight }) => {
      const strategy = factor.strategy || factor.recommendation;
      if (strategy && recommendations.hasOwnProperty(strategy.replace('embed', 'embedding').replace('reference', 'referencing'))) {
        const strategyKey = strategy.replace('embed', 'embedding').replace('reference', 'referencing');
        recommendations[strategyKey] += weight;
      }
    });
    
    // Find highest scoring strategy
    const recommendedStrategy = Object.entries(recommendations)
      .reduce((best, [strategy, score]) => score > best.score ? { strategy, score } : best, 
              { strategy: 'hybrid', score: 0 });
    
    return {
      strategy: recommendedStrategy.strategy,
      confidence: this.calculateConfidence(recommendations, recommendedStrategy.score),
      scores: recommendations,
      reasoning: this.generateDetailedReasoning(analysis, recommendedStrategy.strategy),
      implementation: this.generateImplementationGuidance(recommendedStrategy.strategy, analysis),
      monitoring: this.generateMonitoringRecommendations(recommendedStrategy.strategy, analysis)
    };
  }

  calculateConfidence(scores, topScore) {
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const confidence = topScore / totalScore;
    
    if (confidence > 0.7) return 'high';
    if (confidence > 0.5) return 'medium';
    return 'low';
  }

  generateDetailedReasoning(analysis, strategy) {
    const reasons = [];
    
    // Add reasoning based on analysis factors
    if (analysis.characteristics.cardinality.recommendation === strategy.replace('embedding', 'embed').replace('referencing', 'reference')) {
      reasons.push(`Cardinality pattern (${analysis.characteristics.cardinality.type}) supports ${strategy}`);
    }
    
    if (analysis.characteristics.dataVolume.volumeRecommendation === strategy.replace('embedding', 'embed').replace('referencing', 'reference')) {
      reasons.push(`Data volume analysis supports ${strategy} (${analysis.characteristics.dataVolume.utilizationPercent.toFixed(1)}% of document limit)`);
    }
    
    if (analysis.accessPatterns.accessRecommendation.strategy === strategy.replace('embedding', 'embed').replace('referencing', 'reference')) {
      reasons.push(`Access patterns favor ${strategy} (${analysis.accessPatterns.primaryPattern})`);
    }
    
    return reasons;
  }

  generateImplementationGuidance(strategy, analysis) {
    const baseGuidance = {
      embedding: {
        steps: [
          'Design parent document to include embedded child array/object',
          'Implement atomic update operations for parent and children',
          'Create indexes on embedded fields for query performance',
          'Monitor document size growth'
        ],
        patterns: ['embed_small_collections', 'denormalize_frequently_accessed', 'atomic_updates']
      },
      referencing: {
        steps: [
          'Create separate collections for parent and child entities',
          'Establish reference fields (foreign keys)',
          'Implement application-level joins or aggregation pipelines',
          'Use transactions for cross-collection consistency'
        ],
        patterns: ['reference_large_collections', 'independent_querying', 'flexible_relationships']
      },
      hybrid: {
        steps: [
          'Identify frequently accessed child data for embedding',
          'Embed summaries, reference full details',
          'Implement dual-path queries for different use cases',
          'Monitor access patterns and optimize embedding decisions'
        ],
        patterns: ['selective_denormalization', 'summary_embedding', 'adaptive_modeling']
      }
    };
    
    return baseGuidance[strategy] || baseGuidance.hybrid;
  }

  generateMonitoringRecommendations(strategy, analysis) {
    const monitoring = {
      metrics: [],
      alerts: [],
      optimizations: []
    };
    
    if (strategy === 'embedding') {
      monitoring.metrics.push(
        'Document size growth rate',
        'Embedded array length distribution',
        'Update operation performance on embedded data'
      );
      monitoring.alerts.push(
        'Document size approaching 80% of 16MB limit',
        'Embedded array length exceeding 1000 elements',
        'Update performance degradation on large embedded arrays'
      );
      monitoring.optimizations.push(
        'Consider referencing if documents exceed size thresholds',
        'Implement array size limits and archiving strategies',
        'Monitor for embedded array update bottlenecks'
      );
    } else if (strategy === 'referencing') {
      monitoring.metrics.push(
        'Query performance for multi-collection operations',
        'Reference integrity maintenance overhead',
        'Aggregation pipeline performance'
      );
      monitoring.alerts.push(
        'High latency on multi-collection queries',
        'Reference consistency violations',
        'Excessive aggregation pipeline complexity'
      );
      monitoring.optimizations.push(
        'Implement caching for frequently accessed references',
        'Consider selective denormalization for hot data paths',
        'Optimize aggregation pipelines and indexing strategies'
      );
    }
    
    return monitoring;
  }
}

// Export the decision engine
module.exports = { DocumentModelingDecisionEngine };
```

## SQL-Style Document Modeling with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB document modeling operations:

```sql
-- QueryLeaf document modeling with SQL-familiar patterns

-- Create embedded document structures
CREATE COLLECTION orders_embedded AS
SELECT 
  order_id,
  order_number,
  order_date,
  status,
  
  -- Embed customer information
  JSON_OBJECT(
    'customer_id', customer_id,
    'company_name', company_name,
    'email', email,
    'phone', phone,
    'billing_address', JSON_OBJECT(
      'line1', billing_address_line1,
      'line2', billing_address_line2,
      'city', billing_city,
      'state', billing_state,
      'postal_code', billing_postal_code,
      'country', billing_country
    )
  ) as customer,
  
  -- Embed order items array
  (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'item_id', item_id,
        'product_id', product_id,
        'product', JSON_OBJECT(
          'sku', product_sku,
          'name', product_name,
          'category', product_category
        ),
        'quantity', quantity,
        'unit_price', unit_price,
        'line_total', line_total
      )
    )
    FROM order_items oi
    WHERE oi.order_id = o.order_id
  ) as items,
  
  -- Embed totals object
  JSON_OBJECT(
    'subtotal', subtotal,
    'tax_amount', tax_amount,
    'shipping_amount', shipping_amount,
    'total_amount', total_amount
  ) as totals,
  
  -- Metadata
  JSON_OBJECT(
    'created_at', created_at,
    'updated_at', updated_at,
    'modeling_strategy', 'embedded'
  ) as metadata

FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days';

-- Query embedded documents with SQL syntax
SELECT 
  order_number,
  status,
  customer->>'company_name' as customer_name,
  customer->'billing_address'->>'city' as billing_city,
  totals->>'total_amount'::DECIMAL as order_total,
  
  -- Query embedded array elements
  JSON_ARRAY_LENGTH(items) as item_count,
  
  -- Extract specific item information
  (
    SELECT SUM((item->>'quantity')::INTEGER)
    FROM JSON_ARRAY_ELEMENTS(items) as item
  ) as total_quantity,
  
  -- Get product categories from embedded items
  (
    SELECT ARRAY_AGG(DISTINCT item->'product'->>'category')
    FROM JSON_ARRAY_ELEMENTS(items) as item
  ) as product_categories

FROM orders_embedded
WHERE status = 'pending'
  AND customer->>'email' LIKE '%@company.com'
ORDER BY totals->>'total_amount'::DECIMAL DESC;

-- Create referenced document structures
CREATE COLLECTION orders_referenced AS
SELECT 
  order_id,
  order_number,
  order_date,
  status,
  customer_id, -- Reference to customers collection
  
  -- Order totals (calculated fields)
  subtotal,
  tax_amount,
  shipping_amount,
  total_amount,
  
  JSON_OBJECT(
    'created_at', created_at,
    'updated_at', updated_at,
    'modeling_strategy', 'referenced'
  ) as metadata

FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';

-- Query referenced documents with joins (QueryLeaf aggregation syntax)
SELECT 
  o.order_number,
  o.status,
  o.total_amount,
  
  -- Join with customer collection
  c.company_name,
  c.email,
  
  -- Aggregate order items
  (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'product_sku', oi.product_sku,
        'product_name', oi.product_name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'line_total', oi.line_total
      )
    )
    FROM order_items_referenced oi
    WHERE oi.order_id = o.order_id
  ) as items,
  
  -- Get status history
  (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'status', new_status,
        'changed_at', status_changed_at,
        'reason', status_change_reason
      ) ORDER BY status_changed_at DESC
    )
    FROM order_status_history osh
    WHERE osh.order_id = o.order_id
  ) as status_history

FROM orders_referenced o
LEFT JOIN customers c ON o.customer_id = c.customer_id
WHERE o.status IN ('pending', 'processing')
ORDER BY o.order_date DESC;

-- Hybrid document modeling approach
CREATE COLLECTION orders_hybrid AS
SELECT 
  order_id,
  order_number,
  order_date,
  status,
  
  -- Hybrid customer: embed summary, reference full details
  JSON_OBJECT(
    'customer_id', customer_id,
    'company_name', company_name,
    'email', email,
    'customer_ref', JSON_OBJECT(
      'collection', 'customers',
      'id', customer_id
    )
  ) as customer,
  
  -- Hybrid items: embed summary for quick access
  JSON_OBJECT(
    'total_items', (SELECT COUNT(*) FROM order_items WHERE order_id = o.order_id),
    'unique_products', (SELECT COUNT(DISTINCT product_id) FROM order_items WHERE order_id = o.order_id),
    'total_quantity', (SELECT SUM(quantity) FROM order_items WHERE order_id = o.order_id),
    
    -- Embed small item previews
    'quick_view', (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'product_sku', product_sku,
          'product_name', product_name,
          'quantity', quantity,
          'line_total', line_total
        )
      )
      FROM (
        SELECT * FROM order_items 
        WHERE order_id = o.order_id 
        ORDER BY line_total DESC 
        LIMIT 3
      ) top_items
    ),
    
    -- Reference for complete items if needed
    'items_collection', CASE 
      WHEN (SELECT COUNT(*) FROM order_items WHERE order_id = o.order_id) > 10 
      THEN JSON_OBJECT('collection', 'order_items_detailed', 'order_id', order_id)
      ELSE NULL
    END
  ) as items_summary,
  
  -- Embed current status, reference full history
  JSON_OBJECT(
    'current_status', status,
    'status_updated_at', updated_at,
    'status_history_ref', JSON_OBJECT(
      'collection', 'order_status_history',
      'order_id', order_id
    )
  ) as status_info,
  
  -- Totals
  JSON_OBJECT(
    'subtotal', subtotal,
    'tax_amount', tax_amount,
    'shipping_amount', shipping_amount,
    'total_amount', total_amount
  ) as totals,
  
  -- Metadata with modeling decisions
  JSON_OBJECT(
    'created_at', created_at,
    'updated_at', updated_at,
    'modeling_strategy', 'hybrid',
    'embedding_decisions', JSON_OBJECT(
      'customer', 'partial_denormalization',
      'items', CASE 
        WHEN (SELECT COUNT(*) FROM order_items WHERE order_id = o.order_id) <= 10 
        THEN 'embedded' 
        ELSE 'referenced_with_summary' 
      END,
      'status', 'current_embedded_history_referenced'
    )
  ) as metadata

FROM orders o
JOIN customers c ON o.customer_id = c.customer_id;

-- Performance analysis for document modeling strategies
WITH modeling_performance AS (
  SELECT 
    'embedded' as strategy,
    COUNT(*) as document_count,
    AVG(LENGTH(JSON_SERIALIZE(items))) as avg_items_size,
    AVG(JSON_ARRAY_LENGTH(items)) as avg_item_count,
    MAX(JSON_ARRAY_LENGTH(items)) as max_item_count,
    
    -- Query performance metrics
    AVG(query_execution_time_ms) as avg_query_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY query_execution_time_ms) as p95_query_time
    
  FROM orders_embedded_performance_log
  WHERE query_date >= CURRENT_DATE - INTERVAL '7 days'
  
  UNION ALL
  
  SELECT 
    'referenced' as strategy,
    COUNT(*) as document_count,
    NULL as avg_items_size,
    AVG((
      SELECT COUNT(*) 
      FROM order_items_referenced oir 
      WHERE oir.order_id = orp.order_id
    )) as avg_item_count,
    MAX((
      SELECT COUNT(*) 
      FROM order_items_referenced oir 
      WHERE oir.order_id = orp.order_id
    )) as max_item_count,
    
    AVG(query_execution_time_ms) as avg_query_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY query_execution_time_ms) as p95_query_time
    
  FROM orders_referenced_performance_log orp
  WHERE query_date >= CURRENT_DATE - INTERVAL '7 days'
  
  UNION ALL
  
  SELECT 
    'hybrid' as strategy,
    COUNT(*) as document_count,
    AVG(LENGTH(JSON_SERIALIZE(items_summary))) as avg_items_size,
    AVG(items_summary->>'total_items'::INTEGER) as avg_item_count,
    MAX(items_summary->>'total_items'::INTEGER) as max_item_count,
    
    AVG(query_execution_time_ms) as avg_query_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY query_execution_time_ms) as p95_query_time
    
  FROM orders_hybrid_performance_log
  WHERE query_date >= CURRENT_DATE - INTERVAL '7 days'
)

SELECT 
  strategy,
  document_count,
  avg_item_count,
  max_item_count,
  
  -- Performance comparison
  ROUND(avg_query_time::NUMERIC, 2) as avg_query_time_ms,
  ROUND(p95_query_time::NUMERIC, 2) as p95_query_time_ms,
  
  -- Performance rating
  CASE 
    WHEN avg_query_time <= 50 THEN 'excellent'
    WHEN avg_query_time <= 200 THEN 'good'
    WHEN avg_query_time <= 500 THEN 'acceptable'
    ELSE 'needs_optimization'
  END as performance_rating,
  
  -- Strategy recommendations
  CASE strategy
    WHEN 'embedded' THEN
      CASE 
        WHEN max_item_count > 100 THEN 'Consider hybrid approach for large orders'
        WHEN avg_query_time > 200 THEN 'Monitor document size and query complexity'
        ELSE 'Strategy performing well for current data patterns'
      END
    WHEN 'referenced' THEN
      CASE 
        WHEN avg_query_time > 500 THEN 'Consider hybrid with summary embedding for performance'
        WHEN p95_query_time > 1000 THEN 'Optimize indexes and aggregation pipelines'
        ELSE 'Strategy suitable for large, complex data relationships'
      END
    WHEN 'hybrid' THEN
      CASE 
        WHEN avg_query_time > avg_query_time * 1.5 THEN 'Review embedding decisions and access patterns'
        ELSE 'Balanced approach providing good performance and flexibility'
      END
  END as strategy_recommendation

FROM modeling_performance
ORDER BY avg_query_time;

-- Document modeling decision support system
CREATE VIEW document_modeling_recommendations AS
WITH relationship_analysis AS (
  SELECT 
    table_name as parent_collection,
    related_table as child_collection,
    relationship_type,
    
    -- Data volume analysis
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = related_table) as child_document_count,
    AVG(pg_column_size(row_to_json(r.*))) as avg_child_size,
    MAX(pg_column_size(row_to_json(r.*))) as max_child_size,
    
    -- Relationship cardinality
    CASE 
      WHEN relationship_type = 'one_to_one' THEN 1
      WHEN relationship_type = 'one_to_few' THEN 10
      WHEN relationship_type = 'one_to_many' THEN 1000
      ELSE 10000
    END as estimated_child_count,
    
    -- Update patterns
    (
      SELECT COUNT(*) 
      FROM update_frequency_log ufl 
      WHERE ufl.table_name = related_table 
        AND ufl.log_date >= CURRENT_DATE - INTERVAL '7 days'
    ) as weekly_updates,
    
    -- Access patterns
    (
      SELECT COUNT(*) 
      FROM query_log ql 
      WHERE ql.query_text LIKE '%JOIN%' 
        AND ql.query_text LIKE '%' || table_name || '%'
        AND ql.query_text LIKE '%' || related_table || '%'
        AND ql.query_date >= CURRENT_DATE - INTERVAL '7 days'
    ) as joint_queries_weekly,
    
    (
      SELECT COUNT(*) 
      FROM query_log ql 
      WHERE ql.query_text LIKE '%' || related_table || '%'
        AND ql.query_text NOT LIKE '%JOIN%'
        AND ql.query_date >= CURRENT_DATE - INTERVAL '7 days'
    ) as independent_queries_weekly
    
  FROM relationship_metadata rm
  WHERE rm.target_system = 'mongodb'
)

SELECT 
  parent_collection,
  child_collection,
  relationship_type,
  
  -- Volume-based recommendation
  CASE 
    WHEN estimated_child_count * avg_child_size > 10485760 THEN 'reference' -- 10MB threshold
    WHEN estimated_child_count <= 100 AND avg_child_size <= 10240 THEN 'embed' -- Small documents
    ELSE 'hybrid'
  END as volume_recommendation,
  
  -- Access pattern recommendation
  CASE 
    WHEN joint_queries_weekly > independent_queries_weekly * 2 THEN 'embed'
    WHEN independent_queries_weekly > joint_queries_weekly * 2 THEN 'reference'
    ELSE 'hybrid'
  END as access_pattern_recommendation,
  
  -- Update frequency recommendation
  CASE 
    WHEN weekly_updates > 1000 THEN 'reference'
    WHEN weekly_updates < 100 THEN 'embed'
    ELSE 'hybrid'
  END as update_frequency_recommendation,
  
  -- Combined recommendation with confidence
  CASE 
    WHEN 
      (CASE WHEN estimated_child_count * avg_child_size > 10485760 THEN 1 ELSE 0 END) +
      (CASE WHEN independent_queries_weekly > joint_queries_weekly * 2 THEN 1 ELSE 0 END) +
      (CASE WHEN weekly_updates > 1000 THEN 1 ELSE 0 END) >= 2
    THEN 'reference'
    
    WHEN 
      (CASE WHEN estimated_child_count <= 100 AND avg_child_size <= 10240 THEN 1 ELSE 0 END) +
      (CASE WHEN joint_queries_weekly > independent_queries_weekly * 2 THEN 1 ELSE 0 END) +
      (CASE WHEN weekly_updates < 100 THEN 1 ELSE 0 END) >= 2
    THEN 'embed'
    
    ELSE 'hybrid'
  END as final_recommendation,
  
  -- Confidence calculation
  CASE 
    WHEN ABS((joint_queries_weekly::DECIMAL / NULLIF(independent_queries_weekly, 0)) - 1) > 2 THEN 'high'
    WHEN ABS((joint_queries_weekly::DECIMAL / NULLIF(independent_queries_weekly, 0)) - 1) > 0.5 THEN 'medium'
    ELSE 'low'
  END as recommendation_confidence,
  
  -- Implementation guidance
  CASE 
    WHEN relationship_type = 'one_to_one' AND avg_child_size < 5120 
    THEN 'Embed child document directly in parent'
    
    WHEN relationship_type = 'one_to_few' AND estimated_child_count <= 50
    THEN 'Embed as array in parent document'
    
    WHEN relationship_type = 'one_to_many' AND joint_queries_weekly > 500
    THEN 'Consider hybrid: embed summary, reference details'
    
    WHEN relationship_type = 'many_to_many'
    THEN 'Use references with junction collection or arrays of references'
    
    ELSE 'Analyze specific access patterns and data growth projections'
  END as implementation_guidance,
  
  -- Monitoring recommendations
  ARRAY[
    CASE WHEN estimated_child_count * avg_child_size > 5242880 THEN 'Monitor document size growth' END,
    CASE WHEN weekly_updates > 500 THEN 'Monitor update performance on embedded arrays' END,
    CASE WHEN independent_queries_weekly > 1000 THEN 'Consider indexing strategies for referenced collections' END,
    'Track query performance after modeling implementation',
    'Monitor data growth patterns and access frequency changes'
  ] as monitoring_checklist

FROM relationship_analysis
ORDER BY parent_collection, child_collection;

-- QueryLeaf provides comprehensive document modeling capabilities:
-- 1. SQL-familiar syntax for creating embedded and referenced document structures
-- 2. Flexible querying of complex nested documents with JSON operators
-- 3. Performance analysis comparing different modeling strategies
-- 4. Automated recommendations based on data characteristics and access patterns
-- 5. Hybrid modeling support with selective embedding and referencing
-- 6. Decision support systems for optimal modeling strategy selection
-- 7. Integration with MongoDB's native document operations and indexing
-- 8. Production-ready patterns for scalable document-based applications
-- 9. Monitoring and optimization guidance for document modeling decisions
-- 10. Enterprise-grade document modeling accessible through familiar SQL constructs
```

## Best Practices for MongoDB Document Modeling

### Embedding vs Referencing Decision Guidelines

Essential practices for choosing optimal document modeling strategies:

1. **One-to-Few Relationships**: Embed small, related collections (< 100 documents) that are frequently accessed together
2. **One-to-Many Relationships**: Use references for large collections that may grow beyond document size limits
3. **Data Update Patterns**: Embed stable data, reference frequently updated data to avoid complex array updates
4. **Query Optimization**: Embed data that is commonly queried together to minimize database round trips
5. **Document Size Management**: Monitor embedded collections to prevent approaching the 16MB document limit
6. **Access Pattern Analysis**: Choose modeling strategy based on whether data is primarily accessed jointly or independently

### Performance Optimization Strategies

Optimize document models for maximum application performance:

1. **Strategic Denormalization**: Embed frequently accessed data even if it creates some duplication
2. **Index Optimization**: Create appropriate indexes on embedded fields and reference keys
3. **Hybrid Approaches**: Combine embedding and referencing based on data access patterns and volume
4. **Document Structure**: Design document schemas that align with application query patterns
5. **Array Management**: Limit embedded array sizes and implement archiving for historical data
6. **Caching Strategies**: Implement application-level caching for frequently accessed referenced data

## Conclusion

MongoDB document modeling provides flexible strategies for structuring data that can dramatically improve application performance and simplify development complexity. The choice between embedding, referencing, and hybrid approaches depends on specific data characteristics, access patterns, and scalability requirements.

Key MongoDB document modeling benefits include:

- **Flexible Data Structures**: Native support for complex nested documents and arrays eliminates rigid relational constraints
- **Optimized Read Performance**: Strategic embedding enables single-query retrieval of complete entity data
- **Atomic Operations**: Document-level atomic updates provide consistency for related data without complex transactions
- **Scalable Patterns**: Hybrid approaches that adapt to data volume and access pattern changes over time
- **Simplified Application Logic**: Natural object mapping reduces impedance mismatch between database and application models
- **SQL Compatibility**: Familiar document modeling patterns accessible through SQL-style operations

Whether you're building e-commerce platforms, content management systems, or IoT data collection applications, MongoDB's document modeling flexibility with QueryLeaf's SQL-familiar interface provides the foundation for scalable data architecture that maintains high performance while adapting to evolving business requirements.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB document modeling while providing SQL-familiar syntax for creating embedded and referenced document structures. Advanced modeling decision support, performance analysis, and hybrid pattern implementation are seamlessly accessible through familiar SQL constructs, making sophisticated document modeling both powerful and approachable for SQL-oriented teams.

The combination of MongoDB's flexible document modeling with familiar SQL-style management makes it an ideal platform for applications that require both sophisticated data relationships and operational simplicity, ensuring your data architecture scales efficiently while maintaining familiar development and operational patterns.