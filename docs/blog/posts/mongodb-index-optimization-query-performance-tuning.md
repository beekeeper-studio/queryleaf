---
title: "MongoDB Index Optimization and Query Performance Tuning: Advanced Database Performance Engineering"
description: "Master MongoDB index optimization and query performance tuning for enterprise applications. Learn advanced indexing strategies, compound indexes, performance analysis, and SQL-familiar optimization techniques."
date: 2025-11-11
tags: [mongodb, index-optimization, query-performance, database-tuning, compound-indexes, explain-plans, sql]
---

# MongoDB Index Optimization and Query Performance Tuning: Advanced Database Performance Engineering

Modern enterprise applications demand exceptional database performance to support millions of users, complex queries, and real-time analytics workloads. Traditional approaches to database performance optimization often rely on rigid indexing strategies, manual query tuning, and reactive performance monitoring that fails to scale with growing data volumes and evolving access patterns.

MongoDB's flexible indexing system provides comprehensive performance optimization capabilities that combine intelligent index selection, advanced compound indexing strategies, and sophisticated query execution analysis. Unlike traditional database systems that require extensive manual tuning, MongoDB's index optimization features enable proactive performance management with automated recommendations, flexible indexing patterns, and detailed performance analytics.

## The Traditional Database Performance Challenge

Relational database performance optimization has significant complexity and maintenance overhead:

```sql
-- Traditional PostgreSQL performance optimization - complex and manual

-- Customer orders table with performance challenges
CREATE TABLE customer_orders (
    order_id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    order_date TIMESTAMP NOT NULL,
    order_status VARCHAR(20) NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    shipping_address_id BIGINT,
    billing_address_id BIGINT,
    payment_method VARCHAR(50),
    shipping_method VARCHAR(50),
    order_priority VARCHAR(20) DEFAULT 'standard',
    sales_rep_id BIGINT,
    
    -- Additional fields for complex queries
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT fk_shipping_address FOREIGN KEY (shipping_address_id) REFERENCES addresses(address_id),
    CONSTRAINT fk_billing_address FOREIGN KEY (billing_address_id) REFERENCES addresses(address_id),
    CONSTRAINT fk_sales_rep FOREIGN KEY (sales_rep_id) REFERENCES employees(employee_id)
);

-- Order items table for line-level details
CREATE TABLE order_items (
    item_id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    tax_amount DECIMAL(10,2) NOT NULL,
    
    CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES customer_orders(order_id),
    CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Manual index creation - requires extensive analysis and planning
-- Basic indexes for common queries
CREATE INDEX idx_orders_customer_id ON customer_orders(customer_id);
CREATE INDEX idx_orders_order_date ON customer_orders(order_date);
CREATE INDEX idx_orders_status ON customer_orders(order_status);

-- Compound indexes for complex query patterns
CREATE INDEX idx_orders_customer_date ON customer_orders(customer_id, order_date DESC);
CREATE INDEX idx_orders_status_date ON customer_orders(order_status, order_date DESC);
CREATE INDEX idx_orders_rep_status ON customer_orders(sales_rep_id, order_status, order_date DESC);

-- Partial indexes for selective filtering
CREATE INDEX idx_orders_completed_recent ON customer_orders(completed_at, total_amount) 
    WHERE order_status = 'completed' AND completed_at >= CURRENT_DATE - INTERVAL '90 days';

-- Covering indexes for query optimization (include columns)
CREATE INDEX idx_orders_customer_covering ON customer_orders(customer_id, order_date DESC) 
    INCLUDE (order_status, total_amount, payment_method);

-- Complex multi-table query requiring careful index planning
SELECT 
    o.order_id,
    o.order_date,
    o.total_amount,
    o.order_status,
    c.customer_name,
    c.customer_email,
    
    -- Aggregated order items (expensive without proper indexes)
    COUNT(oi.item_id) as item_count,
    SUM(oi.quantity * oi.unit_price) as items_subtotal,
    SUM(oi.discount_amount) as total_discount,
    SUM(oi.tax_amount) as total_tax,
    
    -- Product information (requires additional joins)
    array_agg(DISTINCT p.product_name) as product_names,
    array_agg(DISTINCT p.category) as product_categories,
    
    -- Address information (more joins)
    sa.street_address as shipping_street,
    sa.city as shipping_city,
    sa.state as shipping_state,
    
    -- Employee information
    e.first_name || ' ' || e.last_name as sales_rep_name

FROM customer_orders o
JOIN customers c ON o.customer_id = c.customer_id
JOIN order_items oi ON o.order_id = oi.order_id
JOIN products p ON oi.product_id = p.product_id
LEFT JOIN addresses sa ON o.shipping_address_id = sa.address_id
LEFT JOIN employees e ON o.sales_rep_id = e.employee_id

WHERE 
    o.order_date >= CURRENT_DATE - INTERVAL '30 days'
    AND o.order_status IN ('processing', 'shipped', 'delivered')
    AND o.total_amount >= 100.00
    AND c.customer_tier IN ('premium', 'enterprise')

GROUP BY 
    o.order_id, o.order_date, o.total_amount, o.order_status,
    c.customer_name, c.customer_email,
    sa.street_address, sa.city, sa.state,
    e.first_name, e.last_name

HAVING COUNT(oi.item_id) >= 2

ORDER BY o.order_date DESC, o.total_amount DESC
LIMIT 100;

-- Analyze query performance (complex interpretation required)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
SELECT o.order_id, o.total_amount, c.customer_name
FROM customer_orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.order_date >= CURRENT_DATE - INTERVAL '7 days'
    AND o.order_status = 'completed'
    AND c.customer_tier = 'premium'
ORDER BY o.total_amount DESC
LIMIT 50;

-- Performance monitoring queries (complex and manual)
SELECT 
    schemaname,
    tablename,
    attname as column_name,
    n_distinct,
    correlation,
    most_common_vals,
    most_common_freqs
FROM pg_stats 
WHERE schemaname = 'public' 
    AND tablename IN ('customer_orders', 'order_items')
ORDER BY tablename, attname;

-- Index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    
    -- Index efficiency calculation
    CASE 
        WHEN idx_scan > 0 THEN ROUND((idx_tup_fetch::numeric / idx_scan), 2)
        ELSE 0 
    END as avg_tuples_per_scan,
    
    -- Index selectivity (estimated)
    CASE 
        WHEN idx_tup_read > 0 THEN ROUND((idx_tup_fetch::numeric / idx_tup_read) * 100, 2)
        ELSE 0 
    END as selectivity_percent

FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Problems with traditional PostgreSQL performance optimization:
-- 1. Manual index design requires deep expertise and continuous maintenance
-- 2. Query plan analysis is complex and difficult to interpret
-- 3. Index maintenance overhead grows with data volume
-- 4. Limited support for dynamic query patterns and evolving schemas
-- 5. Difficult to optimize across multiple tables and complex joins
-- 6. Performance monitoring requires custom scripts and manual interpretation
-- 7. Index selection strategies are static and don't adapt to changing workloads
-- 8. Covering index management is complex and error-prone
-- 9. Partial index design requires detailed knowledge of data distribution
-- 10. Limited automated recommendations for performance improvements
```

MongoDB provides comprehensive performance optimization with intelligent indexing:

```javascript
// MongoDB Index Optimization - intelligent and automated performance tuning
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('ecommerce_platform');

// Advanced Index Management and Optimization
class MongoDBIndexOptimizer {
  constructor(db) {
    this.db = db;
    this.performanceMetrics = new Map();
    this.indexRecommendations = new Map();
  }

  async createOptimizedCollections() {
    console.log('Creating optimized collections with intelligent indexing...');

    // Orders collection with comprehensive document structure
    const ordersCollection = db.collection('orders');
    
    // Sample order document structure for index planning
    const sampleOrder = {
      _id: new ObjectId(),
      orderNumber: "ORD-2025-001234",
      
      // Customer information (embedded for performance)
      customer: {
        customerId: new ObjectId("64a1b2c3d4e5f6789012345a"),
        name: "John Doe",
        email: "john.doe@example.com",
        tier: "premium", // standard, premium, enterprise
        accountType: "individual" // individual, business
      },
      
      // Order details
      orderDate: new Date("2025-11-11T10:30:00Z"),
      status: "processing", // pending, processing, shipped, delivered, cancelled
      priority: "standard", // standard, expedited, overnight
      
      // Financial information
      totals: {
        subtotal: 299.97,
        tax: 24.00,
        shipping: 12.99,
        discount: 15.00,
        grandTotal: 321.96,
        currency: "USD"
      },
      
      // Items array (embedded for query performance)
      items: [
        {
          productId: new ObjectId("64b2c3d4e5f6789012345b1a"),
          sku: "WIDGET-001",
          name: "Premium Widget",
          category: "electronics",
          subcategory: "gadgets",
          quantity: 2,
          unitPrice: 99.99,
          totalPrice: 199.98,
          
          // Product attributes for filtering
          attributes: {
            brand: "TechCorp",
            model: "WG-2024",
            color: "black",
            size: null,
            weight: 1.2
          }
        },
        {
          productId: new ObjectId("64b2c3d4e5f6789012345b1b"),
          sku: "ACCESSORY-001", 
          name: "Widget Accessory",
          category: "electronics",
          subcategory: "accessories",
          quantity: 1,
          unitPrice: 99.99,
          totalPrice: 99.99,
          
          attributes: {
            brand: "TechCorp",
            model: "AC-2024",
            color: "silver",
            compatibility: ["WG-2024", "WG-2023"]
          }
        }
      ],
      
      // Address information
      addresses: {
        shipping: {
          name: "John Doe",
          street: "123 Main Street",
          city: "San Francisco",
          state: "CA",
          postalCode: "94105",
          country: "US",
          coordinates: {
            latitude: 37.7749,
            longitude: -122.4194
          }
        },
        
        billing: {
          name: "John Doe",
          street: "123 Main Street", 
          city: "San Francisco",
          state: "CA",
          postalCode: "94105",
          country: "US"
        }
      },
      
      // Payment information
      payment: {
        method: "credit_card", // credit_card, debit_card, paypal, etc.
        provider: "stripe",
        transactionId: "txn_1234567890",
        status: "captured" // pending, authorized, captured, failed
      },
      
      // Shipping information
      shipping: {
        method: "standard", // standard, expedited, overnight
        carrier: "UPS",
        trackingNumber: "1Z12345E1234567890",
        estimatedDelivery: new Date("2025-11-15T18:00:00Z"),
        actualDelivery: null
      },
      
      // Sales and marketing
      salesInfo: {
        salesRepId: new ObjectId("64c3d4e5f67890123456c2a"),
        salesRepName: "Jane Smith",
        channel: "online", // online, phone, in_store
        source: "organic", // organic, paid_search, social, email
        campaign: "holiday_2025"
      },
      
      // Operational metadata
      fulfillment: {
        warehouseId: "WH-SF-001",
        pickingStarted: null,
        pickingCompleted: null,
        packingStarted: null,
        packingCompleted: null,
        shippedAt: null
      },
      
      // Analytics and business intelligence
      analytics: {
        customerLifetimeValue: 1250.00,
        orderFrequency: "monthly",
        seasonality: "Q4",
        profitMargin: 0.35,
        riskScore: 12 // fraud risk score 0-100
      },
      
      // Audit trail
      audit: {
        createdAt: new Date("2025-11-11T10:30:00Z"),
        updatedAt: new Date("2025-11-11T14:45:00Z"),
        createdBy: "system",
        updatedBy: "user_12345",
        version: 2,
        
        // Change history for critical fields
        statusHistory: [
          {
            status: "pending",
            timestamp: new Date("2025-11-11T10:30:00Z"),
            userId: "customer_67890"
          },
          {
            status: "processing", 
            timestamp: new Date("2025-11-11T14:45:00Z"),
            userId: "system"
          }
        ]
      }
    };

    // Insert sample data for index testing
    await ordersCollection.insertOne(sampleOrder);

    // Create comprehensive index strategy
    await this.createIntelligentIndexes(ordersCollection);
    
    return ordersCollection;
  }

  async createIntelligentIndexes(collection) {
    console.log('Creating intelligent index strategy...');

    try {
      // 1. Primary query patterns - single field indexes
      await collection.createIndexes([
        
        // Customer-based queries (most common pattern)
        {
          key: { "customer.customerId": 1 },
          name: "idx_customer_id",
          background: true
        },
        
        // Date-based queries for reporting
        {
          key: { "orderDate": -1 },
          name: "idx_order_date_desc", 
          background: true
        },
        
        // Status queries for operational workflows
        {
          key: { "status": 1 },
          name: "idx_status",
          background: true
        },
        
        // Order number lookups (unique)
        {
          key: { "orderNumber": 1 },
          name: "idx_order_number",
          unique: true,
          background: true
        }
      ]);

      // 2. Compound indexes for complex query patterns
      await collection.createIndexes([
        
        // Customer order history (most frequent compound query)
        {
          key: { 
            "customer.customerId": 1, 
            "orderDate": -1,
            "status": 1
          },
          name: "idx_customer_date_status",
          background: true
        },
        
        // Order fulfillment workflow
        {
          key: {
            "status": 1,
            "priority": 1,
            "orderDate": 1
          },
          name: "idx_fulfillment_workflow",
          background: true
        },
        
        // Financial reporting and analytics
        {
          key: {
            "orderDate": -1,
            "totals.grandTotal": -1,
            "customer.tier": 1
          },
          name: "idx_financial_reporting",
          background: true
        },
        
        // Sales rep performance tracking
        {
          key: {
            "salesInfo.salesRepId": 1,
            "orderDate": -1,
            "status": 1
          },
          name: "idx_sales_rep_performance",
          background: true
        },
        
        // Geographic analysis
        {
          key: {
            "addresses.shipping.state": 1,
            "addresses.shipping.city": 1,
            "orderDate": -1
          },
          name: "idx_geographic_analysis",
          background: true
        }
      ]);

      // 3. Specialized indexes for advanced query patterns
      await collection.createIndexes([
        
        // Text search across multiple fields
        {
          key: {
            "customer.name": "text",
            "customer.email": "text", 
            "orderNumber": "text",
            "items.name": "text",
            "items.sku": "text"
          },
          name: "idx_text_search",
          background: true
        },
        
        // Geospatial index for location-based queries
        {
          key: { "addresses.shipping.coordinates": "2dsphere" },
          name: "idx_shipping_location",
          background: true
        },
        
        // Sparse index for optional tracking numbers
        {
          key: { "shipping.trackingNumber": 1 },
          name: "idx_tracking_number",
          sparse: true,
          background: true
        },
        
        // Partial index for recent high-value orders
        {
          key: { 
            "orderDate": -1,
            "totals.grandTotal": -1 
          },
          name: "idx_recent_high_value",
          partialFilterExpression: {
            "orderDate": { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            "totals.grandTotal": { $gte: 500 }
          },
          background: true
        }
      ]);

      // 4. Array indexing for embedded documents
      await collection.createIndexes([
        
        // Product-based queries on order items
        {
          key: { "items.productId": 1 },
          name: "idx_product_id",
          background: true
        },
        
        // SKU lookups
        {
          key: { "items.sku": 1 },
          name: "idx_item_sku",
          background: true
        },
        
        // Category-based analytics
        {
          key: { 
            "items.category": 1,
            "items.subcategory": 1,
            "orderDate": -1
          },
          name: "idx_category_analytics",
          background: true
        },
        
        // Brand analysis
        {
          key: { "items.attributes.brand": 1 },
          name: "idx_brand_analysis",
          background: true
        }
      ]);

      // 5. TTL index for data lifecycle management
      await collection.createIndex(
        { "audit.createdAt": 1 },
        { 
          name: "idx_ttl_cleanup",
          expireAfterSeconds: 60 * 60 * 24 * 365 * 7, // 7 years retention
          background: true
        }
      );

      console.log('Intelligent indexing strategy implemented successfully');

    } catch (error) {
      console.error('Error creating indexes:', error);
      throw error;
    }
  }

  async analyzeQueryPerformance(collection, queryPattern, options = {}) {
    console.log('Analyzing query performance with advanced explain plans...');

    try {
      // Sample query patterns for analysis
      const queryPatterns = {
        customerOrders: {
          filter: { "customer.customerId": new ObjectId("64a1b2c3d4e5f6789012345a") },
          sort: { "orderDate": -1 },
          limit: 20
        },
        
        recentHighValue: {
          filter: {
            "orderDate": { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            "totals.grandTotal": { $gte: 100 },
            "status": { $in: ["processing", "shipped", "delivered"] }
          },
          sort: { "totals.grandTotal": -1 },
          limit: 50
        },
        
        fulfillmentQueue: {
          filter: {
            "status": "processing",
            "priority": { $in: ["expedited", "overnight"] }
          },
          sort: { "orderDate": 1 },
          limit: 100
        },
        
        salesAnalytics: {
          filter: {
            "salesInfo.salesRepId": new ObjectId("64c3d4e5f67890123456c2a"),
            "orderDate": { 
              $gte: new Date("2025-11-01"),
              $lt: new Date("2025-12-01")
            }
          },
          sort: { "orderDate": -1 }
        }
      };

      const selectedQuery = queryPatterns[queryPattern] || queryPatterns.customerOrders;
      
      // Execute explain plan with detailed analysis
      const explainResult = await collection.find(selectedQuery.filter)
        .sort(selectedQuery.sort || {})
        .limit(selectedQuery.limit || 1000)
        .explain("executionStats");

      // Analyze execution statistics
      const executionStats = explainResult.executionStats;
      const winningPlan = explainResult.queryPlanner.winningPlan;
      
      const performanceAnalysis = {
        queryPattern: queryPattern,
        executionTime: executionStats.executionTimeMillis,
        documentsExamined: executionStats.totalDocsExamined,
        documentsReturned: executionStats.totalDocsReturned,
        indexesUsed: this.extractIndexesUsed(winningPlan),
        
        // Performance efficiency metrics
        selectivityRatio: executionStats.totalDocsReturned / Math.max(executionStats.totalDocsExamined, 1),
        indexEfficiency: this.calculateIndexEfficiency(executionStats),
        
        // Performance classification
        performanceRating: this.classifyPerformance(executionStats),
        
        // Optimization recommendations
        recommendations: this.generateOptimizationRecommendations(explainResult),
        
        // Detailed execution breakdown
        executionBreakdown: this.analyzeExecutionStages(winningPlan),
        
        queryDetails: {
          filter: selectedQuery.filter,
          sort: selectedQuery.sort,
          limit: selectedQuery.limit
        },
        
        timestamp: new Date()
      };

      // Store performance metrics for trending
      this.performanceMetrics.set(queryPattern, performanceAnalysis);
      
      console.log(`Query Performance Analysis for ${queryPattern}:`);
      console.log(`  Execution Time: ${performanceAnalysis.executionTime}ms`);
      console.log(`  Documents Examined: ${performanceAnalysis.documentsExamined}`);
      console.log(`  Documents Returned: ${performanceAnalysis.documentsReturned}`);
      console.log(`  Selectivity Ratio: ${performanceAnalysis.selectivityRatio.toFixed(4)}`);
      console.log(`  Performance Rating: ${performanceAnalysis.performanceRating}`);
      console.log(`  Indexes Used: ${JSON.stringify(performanceAnalysis.indexesUsed)}`);
      
      if (performanceAnalysis.recommendations.length > 0) {
        console.log('  Optimization Recommendations:');
        performanceAnalysis.recommendations.forEach(rec => {
          console.log(`    - ${rec}`);
        });
      }

      return performanceAnalysis;

    } catch (error) {
      console.error('Error analyzing query performance:', error);
      throw error;
    }
  }

  extractIndexesUsed(winningPlan) {
    const indexes = [];
    
    const extractFromStage = (stage) => {
      if (stage.indexName) {
        indexes.push(stage.indexName);
      }
      
      if (stage.inputStage) {
        extractFromStage(stage.inputStage);
      }
      
      if (stage.inputStages) {
        stage.inputStages.forEach(inputStage => {
          extractFromStage(inputStage);
        });
      }
    };
    
    extractFromStage(winningPlan);
    return [...new Set(indexes)]; // Remove duplicates
  }

  calculateIndexEfficiency(executionStats) {
    // Index efficiency = (docs returned / docs examined) * (1 / execution time factor)
    const selectivity = executionStats.totalDocsReturned / Math.max(executionStats.totalDocsExamined, 1);
    const timeFactor = Math.min(executionStats.executionTimeMillis / 100, 1); // Normalize execution time
    
    return selectivity * (1 - timeFactor);
  }

  classifyPerformance(executionStats) {
    const { executionTimeMillis, totalDocsExamined, totalDocsReturned } = executionStats;
    const selectivity = totalDocsReturned / Math.max(totalDocsExamined, 1);
    
    if (executionTimeMillis < 10 && selectivity > 0.1) return 'Excellent';
    if (executionTimeMillis < 50 && selectivity > 0.01) return 'Good';
    if (executionTimeMillis < 100 && selectivity > 0.001) return 'Fair';
    return 'Poor';
  }

  generateOptimizationRecommendations(explainResult) {
    const recommendations = [];
    const executionStats = explainResult.executionStats;
    const winningPlan = explainResult.queryPlanner.winningPlan;
    
    // High execution time
    if (executionStats.executionTimeMillis > 100) {
      recommendations.push('Consider adding compound indexes for better query selectivity');
    }
    
    // Low selectivity (examining many documents vs returning few)
    const selectivity = executionStats.totalDocsReturned / Math.max(executionStats.totalDocsExamined, 1);
    if (selectivity < 0.01) {
      recommendations.push('Improve query selectivity with more specific filtering criteria');
    }
    
    // Collection scan detected
    if (winningPlan.stage === 'COLLSCAN') {
      recommendations.push('Critical: Query is performing collection scan - add appropriate indexes');
    }
    
    // Sort not using index
    if (this.findStageInPlan(winningPlan, 'SORT') && !this.findStageInPlan(winningPlan, 'IXSCAN')) {
      recommendations.push('Sort operation not using index - consider compound index with sort fields');
    }
    
    // High key examination
    if (executionStats.totalKeysExamined > executionStats.totalDocsReturned * 10) {
      recommendations.push('High key examination ratio - consider more selective compound indexes');
    }
    
    return recommendations;
  }

  findStageInPlan(plan, stageName) {
    if (plan.stage === stageName) return true;
    
    if (plan.inputStage && this.findStageInPlan(plan.inputStage, stageName)) return true;
    
    if (plan.inputStages) {
      return plan.inputStages.some(stage => this.findStageInPlan(stage, stageName));
    }
    
    return false;
  }

  analyzeExecutionStages(winningPlan) {
    const stages = [];
    
    const extractStages = (stage) => {
      stages.push({
        stage: stage.stage,
        indexName: stage.indexName || null,
        direction: stage.direction || null,
        keysExamined: stage.keysExamined || null,
        docsExamined: stage.docsExamined || null,
        executionTimeMillis: stage.executionTimeMillisEstimate || null
      });
      
      if (stage.inputStage) {
        extractStages(stage.inputStage);
      }
      
      if (stage.inputStages) {
        stage.inputStages.forEach(inputStage => {
          extractStages(inputStage);
        });
      }
    };
    
    extractStages(winningPlan);
    return stages;
  }

  async performComprehensiveIndexAnalysis(collection) {
    console.log('Performing comprehensive index analysis...');

    try {
      // Get index statistics
      const indexStats = await collection.aggregate([
        { $indexStats: {} }
      ]).toArray();

      // Get collection statistics
      const collectionStats = await db.runCommand({ collStats: collection.collectionName });
      
      // Analyze index usage patterns
      const indexAnalysis = indexStats.map(index => {
        const usageStats = index.accesses;
        const indexSize = index.size || 0;
        const indexName = index.name;
        
        return {
          name: indexName,
          
          // Usage metrics
          accessCount: usageStats.ops || 0,
          lastAccessed: usageStats.since || null,
          
          // Size metrics
          sizeBytes: indexSize,
          sizeMB: (indexSize / 1024 / 1024).toFixed(2),
          
          // Efficiency analysis
          accessFrequency: this.calculateAccessFrequency(usageStats),
          utilizationScore: this.calculateUtilizationScore(usageStats, indexSize),
          
          // Recommendations
          recommendation: this.analyzeIndexRecommendation(indexName, usageStats, indexSize)
        };
      });

      // Collection-level analysis
      const collectionAnalysis = {
        totalDocuments: collectionStats.count,
        totalSize: collectionStats.size,
        averageDocumentSize: collectionStats.avgObjSize,
        totalIndexSize: collectionStats.totalIndexSize,
        indexToDataRatio: (collectionStats.totalIndexSize / collectionStats.size).toFixed(2),
        
        // Index efficiency summary
        totalIndexes: indexStats.length,
        activeIndexes: indexStats.filter(idx => idx.accesses.ops > 0).length,
        unusedIndexes: indexStats.filter(idx => idx.accesses.ops === 0).length,
        
        // Performance indicators
        indexOverhead: ((collectionStats.totalIndexSize / collectionStats.size) * 100).toFixed(1) + '%',
        
        recommendations: this.generateCollectionRecommendations(indexAnalysis, collectionStats)
      };

      const analysis = {
        collection: collection.collectionName,
        analyzedAt: new Date(),
        collectionMetrics: collectionAnalysis,
        indexDetails: indexAnalysis,
        
        // Summary classifications
        performanceStatus: this.classifyCollectionPerformance(collectionAnalysis),
        optimizationPriority: this.determineOptimizationPriority(indexAnalysis),
        
        // Action items
        actionItems: this.generateActionItems(indexAnalysis, collectionAnalysis)
      };

      console.log('Index Analysis Summary:');
      console.log(`  Total Indexes: ${collectionAnalysis.totalIndexes}`);
      console.log(`  Active Indexes: ${collectionAnalysis.activeIndexes}`);  
      console.log(`  Unused Indexes: ${collectionAnalysis.unusedIndexes}`);
      console.log(`  Index Overhead: ${collectionAnalysis.indexOverhead}`);
      console.log(`  Performance Status: ${analysis.performanceStatus}`);

      return analysis;

    } catch (error) {
      console.error('Error performing index analysis:', error);
      throw error;
    }
  }

  calculateAccessFrequency(usageStats) {
    if (!usageStats.since || usageStats.ops === 0) return 'Never';
    
    const daysSince = (Date.now() - usageStats.since.getTime()) / (1000 * 60 * 60 * 24);
    const accessesPerDay = usageStats.ops / Math.max(daysSince, 1);
    
    if (accessesPerDay > 1000) return 'Very High';
    if (accessesPerDay > 100) return 'High';
    if (accessesPerDay > 10) return 'Moderate';
    if (accessesPerDay > 1) return 'Low';
    return 'Very Low';
  }

  calculateUtilizationScore(usageStats, indexSize) {
    // Score based on access frequency vs storage cost
    const accessCount = usageStats.ops || 0;
    const sizeCost = indexSize / (1024 * 1024); // Size in MB
    
    if (accessCount === 0) return 0;
    
    // Higher score for more accesses per MB of storage
    return Math.min((accessCount / Math.max(sizeCost, 1)) / 1000, 10);
  }

  analyzeIndexRecommendation(indexName, usageStats, indexSize) {
    if (indexName === '_id_') return 'System index - always keep';
    
    if (usageStats.ops === 0) {
      return 'Consider dropping - unused index consuming storage';
    }
    
    if (usageStats.ops < 10 && indexSize > 10 * 1024 * 1024) { // < 10 uses and > 10MB
      return 'Low utilization - evaluate if index is necessary';
    }
    
    if (usageStats.ops > 10000) {
      return 'High utilization - keep and monitor performance';
    }
    
    return 'Normal utilization - maintain current index';
  }

  generateCollectionRecommendations(indexAnalysis, collectionStats) {
    const recommendations = [];
    
    // Check for unused indexes
    const unusedIndexes = indexAnalysis.filter(idx => idx.accessCount === 0 && idx.name !== '_id_');
    if (unusedIndexes.length > 0) {
      recommendations.push(`Drop ${unusedIndexes.length} unused indexes to reduce storage overhead`);
    }
    
    // Check index-to-data ratio
    const indexRatio = collectionStats.totalIndexSize / collectionStats.size;
    if (indexRatio > 1.5) {
      recommendations.push('High index overhead - review index necessity and consider consolidation');
    }
    
    // Check for very large indexes with low utilization
    const inefficientIndexes = indexAnalysis.filter(idx => 
      idx.sizeBytes > 100 * 1024 * 1024 && idx.utilizationScore < 1
    );
    if (inefficientIndexes.length > 0) {
      recommendations.push('Large indexes with low utilization detected - consider optimization');
    }
    
    return recommendations;
  }

  classifyCollectionPerformance(collectionAnalysis) {
    const unusedRatio = collectionAnalysis.unusedIndexes / collectionAnalysis.totalIndexes;
    const indexOverheadPercent = parseFloat(collectionAnalysis.indexOverhead);
    
    if (unusedRatio > 0.3 || indexOverheadPercent > 200) return 'Poor';
    if (unusedRatio > 0.2 || indexOverheadPercent > 150) return 'Fair';
    if (unusedRatio > 0.1 || indexOverheadPercent > 100) return 'Good';
    return 'Excellent';
  }

  determineOptimizationPriority(indexAnalysis) {
    const unusedCount = indexAnalysis.filter(idx => idx.accessCount === 0).length;
    const lowUtilizationCount = indexAnalysis.filter(idx => idx.utilizationScore < 1).length;
    
    if (unusedCount > 3 || lowUtilizationCount > 5) return 'High';
    if (unusedCount > 1 || lowUtilizationCount > 2) return 'Medium';
    return 'Low';
  }

  generateActionItems(indexAnalysis, collectionAnalysis) {
    const actions = [];
    
    // Unused index cleanup
    const unusedIndexes = indexAnalysis.filter(idx => idx.accessCount === 0 && idx.name !== '_id_');
    unusedIndexes.forEach(idx => {
      actions.push({
        type: 'DROP_INDEX',
        indexName: idx.name,
        reason: 'Unused index consuming storage',
        priority: 'Medium',
        estimatedSavings: `${idx.sizeMB}MB storage`
      });
    });
    
    // Low utilization optimization
    const lowUtilizationIndexes = indexAnalysis.filter(idx => 
      idx.utilizationScore < 1 && idx.accessCount > 0 && idx.sizeBytes > 10 * 1024 * 1024
    );
    lowUtilizationIndexes.forEach(idx => {
      actions.push({
        type: 'REVIEW_INDEX',
        indexName: idx.name,
        reason: 'Low utilization for large index',
        priority: 'Low',
        recommendation: 'Evaluate query patterns and consider consolidation'
      });
    });
    
    return actions;
  }

  async demonstrateAdvancedQuerying(collection) {
    console.log('Demonstrating advanced querying with performance optimization...');

    const queryExamples = [
      {
        name: 'Customer Order History with Analytics',
        query: async () => {
          return await collection.find({
            "customer.customerId": new ObjectId("64a1b2c3d4e5f6789012345a"),
            "orderDate": { $gte: new Date("2025-01-01") }
          })
          .sort({ "orderDate": -1 })
          .limit(20)
          .explain("executionStats");
        }
      },
      
      {
        name: 'High-Value Recent Orders',
        query: async () => {
          return await collection.find({
            "orderDate": { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            "totals.grandTotal": { $gte: 500 },
            "status": { $in: ["processing", "shipped", "delivered"] }
          })
          .sort({ "totals.grandTotal": -1 })
          .limit(50)
          .explain("executionStats");
        }
      },
      
      {
        name: 'Geographic Sales Analysis',
        query: async () => {
          return await collection.find({
            "addresses.shipping.state": "CA",
            "orderDate": { 
              $gte: new Date("2025-11-01"),
              $lt: new Date("2025-12-01")
            }
          })
          .sort({ "orderDate": -1 })
          .explain("executionStats");
        }
      },
      
      {
        name: 'Product Category Performance',
        query: async () => {
          return await collection.find({
            "items.category": "electronics",
            "orderDate": { $gte: new Date("2025-11-01") }
          })
          .sort({ "totals.grandTotal": -1 })
          .explain("executionStats");
        }
      }
    ];

    const results = {};
    
    for (const example of queryExamples) {
      try {
        console.log(`\nTesting: ${example.name}`);
        const result = await example.query();
        
        const stats = result.executionStats;
        const performance = {
          executionTime: stats.executionTimeMillis,
          documentsExamined: stats.totalDocsExamined,
          documentsReturned: stats.totalDocsReturned,
          indexesUsed: this.extractIndexesUsed(result.queryPlanner.winningPlan),
          efficiency: (stats.totalDocsReturned / Math.max(stats.totalDocsExamined, 1)).toFixed(4)
        };
        
        console.log(`  Execution Time: ${performance.executionTime}ms`);
        console.log(`  Efficiency Ratio: ${performance.efficiency}`);
        console.log(`  Indexes Used: ${JSON.stringify(performance.indexesUsed)}`);
        
        results[example.name] = performance;
        
      } catch (error) {
        console.error(`Error testing ${example.name}:`, error);
        results[example.name] = { error: error.message };
      }
    }
    
    return results;
  }
}

// Export optimization class
module.exports = { MongoDBIndexOptimizer };

// Benefits of MongoDB Index Optimization:
// - Intelligent compound indexing for complex query patterns
// - Automated performance analysis and recommendations
// - Flexible indexing strategies for evolving schemas
// - Advanced query execution analysis with detailed metrics
// - Comprehensive index utilization monitoring
// - Automated optimization suggestions based on usage patterns
// - Support for specialized indexes (geospatial, text, sparse, partial)
// - Integration with existing MongoDB ecosystem and tooling
// - Real-time performance monitoring and alerting capabilities
// - Cost-effective storage optimization through intelligent index management
```

## Understanding MongoDB Index Architecture

### Compound Index Design Patterns

MongoDB's compound indexing system supports sophisticated query optimization strategies:

```javascript
// Advanced compound indexing patterns for enterprise applications
class CompoundIndexStrategist {
  constructor(db) {
    this.db = db;
    this.indexStrategies = new Map();
    this.queryPatterns = new Map();
  }

  async analyzeQueryPatternsAndCreateIndexes() {
    console.log('Analyzing query patterns and creating optimized compound indexes...');

    // Pattern 1: ESR (Equality, Sort, Range) Index Design
    const esrPattern = {
      description: "Equality-Sort-Range compound index optimization",
      
      // Customer order queries: customer (equality) + date (sort) + status (range)
      index: {
        "customer.customerId": 1,  // Equality first
        "orderDate": -1,           // Sort second  
        "status": 1                // Range/filter third
      },
      
      queryExamples: [
        {
          filter: { 
            "customer.customerId": "specific_customer_id",
            "status": { $in: ["processing", "shipped"] }
          },
          sort: { "orderDate": -1 },
          description: "Customer order history with status filtering"
        }
      ],
      
      performance: "Optimal - follows ESR pattern for maximum efficiency"
    };

    // Pattern 2: Multi-dimensional Analytics Index
    const analyticsPattern = {
      description: "Multi-dimensional analytics with hierarchical grouping",
      
      index: {
        "orderDate": -1,           // Time dimension (most selective)
        "customer.tier": 1,        // Customer segment
        "items.category": 1,       // Product category
        "totals.grandTotal": -1    // Value dimension
      },
      
      queryExamples: [
        {
          pipeline: [
            { 
              $match: {
                "orderDate": { $gte: new Date("2025-01-01") },
                "customer.tier": "premium"
              }
            },
            {
              $group: {
                _id: {
                  month: { $dateToString: { format: "%Y-%m", date: "$orderDate" } },
                  category: "$items.category"
                },
                totalRevenue: { $sum: "$totals.grandTotal" },
                orderCount: { $sum: 1 }
              }
            }
          ],
          description: "Monthly revenue by customer tier and product category"
        }
      ]
    };

    // Pattern 3: Geospatial + Business Logic Index
    const geospatialPattern = {
      description: "Geospatial queries combined with business filters",
      
      index: {
        "addresses.shipping.coordinates": "2dsphere",  // Geospatial first
        "status": 1,                                    // Business filter
        "orderDate": -1                                 // Time component
      },
      
      queryExamples: [
        {
          filter: {
            "addresses.shipping.coordinates": {
              $near: {
                $geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
                $maxDistance: 10000 // 10km radius
              }
            },
            "status": "processing",
            "orderDate": { $gte: new Date("2025-11-01") }
          },
          description: "Recent processing orders within geographic radius"
        }
      ]
    };

    // Pattern 4: Text Search + Faceted Filtering
    const textSearchPattern = {
      description: "Full-text search with multiple filter dimensions",
      
      textIndex: {
        "customer.name": "text",
        "items.name": "text", 
        "items.sku": "text",
        "orderNumber": "text"
      },
      
      supportingIndexes: [
        {
          "customer.tier": 1,
          "orderDate": -1
        },
        {
          "items.category": 1,
          "totals.grandTotal": -1
        }
      ],
      
      queryExamples: [
        {
          filter: {
            $text: { $search: "premium widget" },
            "customer.tier": "enterprise",
            "orderDate": { $gte: new Date("2025-10-01") }
          },
          sort: { score: { $meta: "textScore" } },
          description: "Text search with customer tier and date filtering"
        }
      ]
    };

    // Create indexes based on patterns
    const ordersCollection = this.db.collection('orders');
    
    await this.implementIndexStrategy(ordersCollection, 'ESR_Pattern', esrPattern.index);
    await this.implementIndexStrategy(ordersCollection, 'Analytics_Pattern', analyticsPattern.index);  
    await this.implementIndexStrategy(ordersCollection, 'Geospatial_Pattern', geospatialPattern.index);
    await this.implementTextSearchStrategy(ordersCollection, textSearchPattern);

    // Store strategies for analysis
    this.indexStrategies.set('esr', esrPattern);
    this.indexStrategies.set('analytics', analyticsPattern);
    this.indexStrategies.set('geospatial', geospatialPattern);
    this.indexStrategies.set('textSearch', textSearchPattern);

    console.log('Advanced compound index strategies implemented');
    return this.indexStrategies;
  }

  async implementIndexStrategy(collection, strategyName, indexSpec) {
    try {
      await collection.createIndex(indexSpec, {
        name: `idx_${strategyName.toLowerCase()}`,
        background: true
      });
      console.log(`✅ Created index strategy: ${strategyName}`);
    } catch (error) {
      console.error(`❌ Failed to create ${strategyName}:`, error.message);
    }
  }

  async implementTextSearchStrategy(collection, textPattern) {
    try {
      // Create text index
      await collection.createIndex(textPattern.textIndex, {
        name: "idx_text_search_comprehensive",
        background: true
      });

      // Create supporting indexes for faceted filtering
      for (let i = 0; i < textPattern.supportingIndexes.length; i++) {
        await collection.createIndex(textPattern.supportingIndexes[i], {
          name: `idx_text_support_${i + 1}`,
          background: true
        });
      }

      console.log('✅ Created text search strategy with supporting indexes');
    } catch (error) {
      console.error('❌ Failed to create text search strategy:', error.message);
    }
  }

  async optimizeExistingIndexes(collection) {
    console.log('Optimizing existing indexes based on query patterns...');

    try {
      // Get current indexes
      const currentIndexes = await collection.listIndexes().toArray();
      
      // Analyze index effectiveness
      const indexAnalysis = await this.analyzeIndexEffectiveness(collection, currentIndexes);
      
      // Generate optimization plan
      const optimizationPlan = this.createOptimizationPlan(indexAnalysis);
      
      // Execute optimization (with safety checks)
      await this.executeOptimizationPlan(collection, optimizationPlan);
      
      return optimizationPlan;

    } catch (error) {
      console.error('Error optimizing indexes:', error);
      throw error;
    }
  }

  async analyzeIndexEffectiveness(collection, indexes) {
    const analysis = [];
    
    for (const index of indexes) {
      if (index.name === '_id_') continue; // Skip default index
      
      try {
        // Get index statistics
        const stats = await collection.aggregate([
          { $indexStats: {} },
          { $match: { name: index.name } }
        ]).toArray();
        
        const indexStat = stats[0];
        if (!indexStat) continue;
        
        // Analyze index composition
        const indexComposition = this.analyzeIndexComposition(index.key);
        
        // Calculate efficiency metrics
        const efficiency = {
          usageCount: indexStat.accesses?.ops || 0,
          lastUsed: indexStat.accesses?.since || null,
          sizeBytes: indexStat.size || 0,
          
          // Index pattern analysis
          composition: indexComposition,
          followsESRPattern: this.checkESRPattern(index.key),
          hasRedundancy: await this.checkIndexRedundancy(collection, index),
          
          // Performance classification
          utilizationScore: this.calculateUtilizationScore(indexStat),
          efficiencyRating: this.rateIndexEfficiency(indexStat, indexComposition)
        };
        
        analysis.push({
          name: index.name,
          keyPattern: index.key,
          ...efficiency
        });

      } catch (error) {
        console.warn(`Could not analyze index ${index.name}:`, error.message);
      }
    }
    
    return analysis;
  }

  analyzeIndexComposition(keyPattern) {
    const keys = Object.keys(keyPattern);
    const composition = {
      fieldCount: keys.length,
      hasEquality: false,
      hasSort: false,
      hasRange: false,
      hasGeospatial: false,
      hasText: false
    };
    
    keys.forEach((key, index) => {
      const value = keyPattern[key];
      
      // Detect index type based on value and position
      if (value === 1 || value === -1) {
        if (index === 0) composition.hasEquality = true;
        if (index === 1) composition.hasSort = true;
        if (index > 1) composition.hasRange = true;
      }
      
      if (value === '2dsphere' || value === '2d') composition.hasGeospatial = true;
      if (value === 'text') composition.hasText = true;
    });
    
    return composition;
  }

  checkESRPattern(keyPattern) {
    const keys = Object.keys(keyPattern);
    if (keys.length < 3) return false;
    
    // ESR: First field equality, second sort, third range
    const values = Object.values(keyPattern);
    return (values[0] === 1 || values[0] === -1) &&
           (values[1] === 1 || values[1] === -1) &&
           (values[2] === 1 || values[2] === -1);
  }

  async checkIndexRedundancy(collection, targetIndex) {
    // Check if this index is redundant with other indexes
    const allIndexes = await collection.listIndexes().toArray();
    const targetKeys = Object.keys(targetIndex.key);
    
    for (const otherIndex of allIndexes) {
      if (otherIndex.name === targetIndex.name || otherIndex.name === '_id_') continue;
      
      const otherKeys = Object.keys(otherIndex.key);
      
      // Check if targetIndex is a prefix of otherIndex (redundant)
      if (targetKeys.length <= otherKeys.length) {
        const isPrefix = targetKeys.every((key, index) => 
          otherKeys[index] === key && 
          targetIndex.key[key] === otherIndex.key[key]
        );
        
        if (isPrefix) return otherIndex.name;
      }
    }
    
    return false;
  }

  calculateUtilizationScore(indexStat) {
    const usage = indexStat.accesses?.ops || 0;
    const size = indexStat.size || 0;
    
    if (usage === 0) return 0;
    if (size === 0) return 10; // System indexes
    
    // Score based on usage per MB
    const sizeMB = size / (1024 * 1024);
    return Math.min((usage / sizeMB) / 100, 10);
  }

  rateIndexEfficiency(indexStat, composition) {
    let score = 5; // Base score
    
    // Usage factor
    const usage = indexStat.accesses?.ops || 0;
    if (usage > 10000) score += 2;
    else if (usage > 1000) score += 1;
    else if (usage === 0) score -= 3;
    
    // Composition factor
    if (composition.followsESRPattern) score += 2;
    if (composition.hasGeospatial || composition.hasText) score += 1;
    if (composition.fieldCount > 5) score -= 1; // Too many fields
    
    // Size factor (prefer smaller indexes for same functionality)
    const sizeMB = (indexStat.size || 0) / (1024 * 1024);
    if (sizeMB > 100) score -= 1;
    
    return Math.max(Math.min(score, 10), 0);
  }

  createOptimizationPlan(indexAnalysis) {
    const plan = {
      actions: [],
      expectedBenefits: [],
      risks: [],
      estimatedImpact: {}
    };
    
    // Identify unused indexes
    const unusedIndexes = indexAnalysis.filter(idx => idx.usageCount === 0);
    unusedIndexes.forEach(idx => {
      plan.actions.push({
        type: 'DROP',
        indexName: idx.name,
        reason: 'Unused index consuming storage',
        impact: `Save ${(idx.sizeBytes / 1024 / 1024).toFixed(2)}MB storage`,
        priority: 'HIGH'
      });
    });
    
    // Identify redundant indexes
    const redundantIndexes = indexAnalysis.filter(idx => idx.hasRedundancy);
    redundantIndexes.forEach(idx => {
      plan.actions.push({
        type: 'DROP',
        indexName: idx.name,
        reason: `Redundant with ${idx.hasRedundancy}`,
        impact: 'Reduce index maintenance overhead',
        priority: 'MEDIUM'
      });
    });
    
    // Suggest compound index improvements
    const inefficientIndexes = indexAnalysis.filter(idx => 
      idx.efficiencyRating < 5 && idx.usageCount > 0
    );
    inefficientIndexes.forEach(idx => {
      if (!idx.composition.followsESRPattern) {
        plan.actions.push({
          type: 'REBUILD',
          indexName: idx.name,
          reason: 'Does not follow ESR pattern',
          suggestion: 'Reorder fields: Equality, Sort, Range',
          impact: 'Improve query performance',
          priority: 'MEDIUM'
        });
      }
    });
    
    // Calculate expected benefits
    const storageSavings = unusedIndexes.reduce((sum, idx) => sum + idx.sizeBytes, 0);
    plan.estimatedImpact.storageSavings = `${(storageSavings / 1024 / 1024).toFixed(2)}MB`;
    plan.estimatedImpact.maintenanceReduction = `${unusedIndexes.length + redundantIndexes.length} fewer indexes`;
    
    return plan;
  }

  async executeOptimizationPlan(collection, plan) {
    console.log('Executing index optimization plan...');
    
    for (const action of plan.actions) {
      try {
        if (action.type === 'DROP' && action.priority === 'HIGH') {
          // Only auto-execute high-priority drops (unused indexes)
          console.log(`Dropping unused index: ${action.indexName}`);
          await collection.dropIndex(action.indexName);
          console.log(`✅ Successfully dropped index: ${action.indexName}`);
        } else {
          console.log(`📋 Recommended action: ${action.type} ${action.indexName} - ${action.reason}`);
        }
      } catch (error) {
        console.error(`❌ Failed to execute action on ${action.indexName}:`, error.message);
      }
    }
    
    console.log('Index optimization plan execution completed');
  }

  async generatePerformanceReport(collection) {
    console.log('Generating comprehensive performance report...');
    
    try {
      // Get collection statistics
      const stats = await this.db.runCommand({ collStats: collection.collectionName });
      
      // Get index usage statistics
      const indexStats = await collection.aggregate([
        { $indexStats: {} }
      ]).toArray();
      
      // Analyze recent query performance
      const performanceMetrics = Array.from(this.performanceMetrics.values());
      
      // Generate comprehensive report
      const report = {
        collectionName: collection.collectionName,
        generatedAt: new Date(),
        
        // Collection overview
        overview: {
          totalDocuments: stats.count,
          totalSizeGB: (stats.size / 1024 / 1024 / 1024).toFixed(2),
          averageDocumentSizeKB: (stats.avgObjSize / 1024).toFixed(2),
          totalIndexes: indexStats.length,
          totalIndexSizeGB: (stats.totalIndexSize / 1024 / 1024 / 1024).toFixed(2),
          indexToDataRatio: (stats.totalIndexSize / stats.size).toFixed(2)
        },
        
        // Index performance summary
        indexPerformance: {
          activeIndexes: indexStats.filter(idx => idx.accesses?.ops > 0).length,
          unusedIndexes: indexStats.filter(idx => idx.accesses?.ops === 0).length - 1, // Exclude _id_
          highUtilizationIndexes: indexStats.filter(idx => idx.accesses?.ops > 10000).length,
          
          // Top performing indexes
          topIndexes: indexStats
            .filter(idx => idx.name !== '_id_' && idx.accesses?.ops > 0)
            .sort((a, b) => (b.accesses?.ops || 0) - (a.accesses?.ops || 0))
            .slice(0, 5)
            .map(idx => ({
              name: idx.name,
              accessCount: idx.accesses?.ops || 0,
              sizeMB: ((idx.size || 0) / 1024 / 1024).toFixed(2)
            }))
        },
        
        // Query performance analysis
        queryPerformance: {
          totalQueriesAnalyzed: performanceMetrics.length,
          averageExecutionTime: performanceMetrics.length > 0 ? 
            (performanceMetrics.reduce((sum, metric) => sum + metric.executionTime, 0) / performanceMetrics.length).toFixed(2) : 0,
          excellentQueries: performanceMetrics.filter(m => m.performanceRating === 'Excellent').length,
          poorQueries: performanceMetrics.filter(m => m.performanceRating === 'Poor').length,
          
          // Query patterns
          commonPatterns: this.identifyCommonQueryPatterns(performanceMetrics)
        },
        
        // Recommendations
        recommendations: this.generatePerformanceRecommendations(stats, indexStats, performanceMetrics),
        
        // Health score
        healthScore: this.calculateHealthScore(stats, indexStats, performanceMetrics)
      };
      
      // Display report summary
      console.log('\n📊 Performance Report Summary:');
      console.log(`Collection: ${report.collectionName}`);
      console.log(`Documents: ${report.overview.totalDocuments.toLocaleString()}`);
      console.log(`Data Size: ${report.overview.totalSizeGB}GB`);
      console.log(`Index Size: ${report.overview.totalIndexSizeGB}GB`);
      console.log(`Active Indexes: ${report.indexPerformance.activeIndexes}/${report.overview.totalIndexes}`);
      console.log(`Health Score: ${report.healthScore}/100`);
      
      if (report.recommendations.length > 0) {
        console.log('\n💡 Top Recommendations:');
        report.recommendations.slice(0, 3).forEach(rec => {
          console.log(`  • ${rec}`);
        });
      }
      
      return report;

    } catch (error) {
      console.error('Error generating performance report:', error);
      throw error;
    }
  }

  identifyCommonQueryPatterns(performanceMetrics) {
    // Analyze query patterns to identify common access patterns
    const patterns = new Map();
    
    performanceMetrics.forEach(metric => {
      const pattern = metric.queryPattern || 'unknown';
      if (patterns.has(pattern)) {
        patterns.set(pattern, patterns.get(pattern) + 1);
      } else {
        patterns.set(pattern, 1);
      }
    });
    
    return Array.from(patterns.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));
  }

  generatePerformanceRecommendations(collectionStats, indexStats, queryMetrics) {
    const recommendations = [];
    
    // Index optimization recommendations
    const unusedCount = indexStats.filter(idx => idx.name !== '_id_' && idx.accesses?.ops === 0).length;
    if (unusedCount > 0) {
      recommendations.push(`Remove ${unusedCount} unused indexes to reduce storage and maintenance overhead`);
    }
    
    // Size recommendations
    const indexRatio = collectionStats.totalIndexSize / collectionStats.size;
    if (indexRatio > 1.5) {
      recommendations.push('High index-to-data ratio detected - review index necessity');
    }
    
    // Query performance recommendations
    const poorQueries = queryMetrics.filter(m => m.performanceRating === 'Poor').length;
    if (poorQueries > 0) {
      recommendations.push(`Optimize ${poorQueries} poorly performing query patterns`);
    }
    
    // Compound index recommendations
    const singleFieldIndexes = indexStats.filter(idx => 
      Object.keys(idx.key || {}).length === 1 && idx.name !== '_id_'
    ).length;
    if (singleFieldIndexes > 5) {
      recommendations.push('Consider consolidating single-field indexes into compound indexes');
    }
    
    return recommendations;
  }

  calculateHealthScore(collectionStats, indexStats, queryMetrics) {
    let score = 100;
    
    // Index efficiency penalty
    const unusedIndexes = indexStats.filter(idx => idx.name !== '_id_' && idx.accesses?.ops === 0).length;
    const totalIndexes = indexStats.length - 1; // Exclude _id_
    const unusedRatio = unusedIndexes / Math.max(totalIndexes, 1);
    score -= unusedRatio * 30; // Up to 30 points penalty
    
    // Size efficiency penalty
    const indexRatio = collectionStats.totalIndexSize / collectionStats.size;
    if (indexRatio > 2) score -= 20;
    else if (indexRatio > 1.5) score -= 10;
    
    // Query performance penalty
    const poorQueryRatio = queryMetrics.filter(m => m.performanceRating === 'Poor').length / Math.max(queryMetrics.length, 1);
    score -= poorQueryRatio * 25; // Up to 25 points penalty
    
    // Average execution time penalty
    const avgExecutionTime = queryMetrics.length > 0 ? 
      queryMetrics.reduce((sum, metric) => sum + metric.executionTime, 0) / queryMetrics.length : 0;
    if (avgExecutionTime > 100) score -= 15;
    else if (avgExecutionTime > 50) score -= 8;
    
    return Math.max(Math.round(score), 0);
  }
}

// Export the compound index strategist
module.exports = { CompoundIndexStrategist };
```

## SQL-Style Index Optimization with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB index optimization and performance tuning:

```sql
-- QueryLeaf index optimization with SQL-familiar syntax

-- Create optimized indexes using SQL DDL syntax
CREATE INDEX idx_customer_order_history ON orders (
  customer.customer_id ASC,
  order_date DESC,
  status ASC
) WITH (
  background = true,
  name = 'idx_customer_order_history'
);

-- Create compound indexes following ESR (Equality, Sort, Range) pattern
CREATE INDEX idx_sales_analytics ON orders (
  sales_info.sales_rep_id ASC,     -- Equality filter (most selective)
  order_date DESC,                 -- Sort operation
  totals.grand_total DESC          -- Range filter
) WITH (
  background = true,
  partial_filter = 'status IN (''completed'', ''delivered'')'
);

-- Create geospatial index for location-based queries
CREATE INDEX idx_shipping_location ON orders 
USING GEOSPHERE (addresses.shipping.coordinates)
WITH (background = true);

-- Create text index for search functionality
CREATE INDEX idx_full_text_search ON orders 
USING TEXT (
  customer.name,
  customer.email, 
  order_number,
  items.name,
  items.sku
) WITH (
  default_language = 'english',
  background = true
);

-- Analyze query performance with SQL EXPLAIN
EXPLAIN (ANALYZE true, BUFFERS true) 
SELECT 
  order_number,
  customer.name,
  order_date,
  totals.grand_total,
  status
FROM orders 
WHERE customer.customer_id = ObjectId('64a1b2c3d4e5f6789012345a')
  AND order_date >= CURRENT_DATE - INTERVAL '90 days'
  AND status IN ('processing', 'shipped', 'delivered')
ORDER BY order_date DESC
LIMIT 20;

-- Index usage analysis and optimization recommendations
WITH index_usage_stats AS (
  SELECT 
    index_name,
    access_count,
    last_accessed,
    size_bytes,
    size_mb,
    
    -- Calculate utilization metrics
    CASE 
      WHEN access_count = 0 THEN 'Unused'
      WHEN access_count < 100 THEN 'Low'
      WHEN access_count < 10000 THEN 'Moderate'
      ELSE 'High'
    END as usage_level,
    
    -- Calculate efficiency score
    CASE 
      WHEN access_count = 0 THEN 0
      ELSE ROUND((access_count::numeric / (size_mb + 1)) * 100, 2)
    END as efficiency_score
    
  FROM mongodb_index_statistics('orders')
  WHERE index_name != '_id_'
),
index_recommendations AS (
  SELECT 
    index_name,
    usage_level,
    efficiency_score,
    size_mb,
    
    -- Generate recommendations based on usage patterns
    CASE 
      WHEN usage_level = 'Unused' THEN 'DROP - Unused index consuming storage'
      WHEN usage_level = 'Low' AND size_mb > 10 THEN 'REVIEW - Low usage for large index'
      WHEN efficiency_score > 1000 THEN 'MAINTAIN - High efficiency index'
      WHEN efficiency_score < 50 THEN 'OPTIMIZE - Poor efficiency ratio'
      ELSE 'MONITOR - Normal usage pattern'
    END as recommendation,
    
    -- Priority for action
    CASE 
      WHEN usage_level = 'Unused' THEN 'HIGH'
      WHEN usage_level = 'Low' AND size_mb > 50 THEN 'MEDIUM'
      WHEN efficiency_score < 25 THEN 'MEDIUM'
      ELSE 'LOW'
    END as priority
    
  FROM index_usage_stats
)
SELECT 
  index_name,
  usage_level,
  ROUND(efficiency_score, 2) as efficiency_score,
  ROUND(size_mb, 2) as size_mb,
  recommendation,
  priority,
  
  -- Estimated impact
  CASE 
    WHEN recommendation LIKE 'DROP%' THEN CONCAT('Save ', ROUND(size_mb, 1), 'MB storage')
    WHEN recommendation LIKE 'OPTIMIZE%' THEN 'Improve query performance'
    ELSE 'Monitor performance'
  END as estimated_impact
  
FROM index_recommendations
ORDER BY 
  CASE priority 
    WHEN 'HIGH' THEN 1 
    WHEN 'MEDIUM' THEN 2 
    ELSE 3 
  END,
  efficiency_score ASC;

-- Compound index optimization analysis
WITH query_pattern_analysis AS (
  SELECT 
    collection_name,
    query_pattern,
    avg_execution_time_ms,
    avg_docs_examined,
    avg_docs_returned,
    
    -- Calculate selectivity ratio
    CASE 
      WHEN avg_docs_examined > 0 THEN 
        ROUND((avg_docs_returned::numeric / avg_docs_examined) * 100, 2)
      ELSE 0 
    END as selectivity_percent,
    
    -- Identify query pattern type
    CASE 
      WHEN query_pattern LIKE '%customer_id%' AND query_pattern LIKE '%order_date%' THEN 'customer_history'
      WHEN query_pattern LIKE '%status%' AND query_pattern LIKE '%priority%' THEN 'fulfillment'
      WHEN query_pattern LIKE '%sales_rep%' THEN 'sales_analytics'
      WHEN query_pattern LIKE '%location%' THEN 'geographic'
      ELSE 'other'
    END as pattern_type
    
  FROM mongodb_query_performance_log
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND collection_name = 'orders'
),
index_optimization_opportunities AS (
  SELECT 
    pattern_type,
    COUNT(*) as query_count,
    AVG(avg_execution_time_ms) as avg_execution_time,
    AVG(selectivity_percent) as avg_selectivity,
    
    -- Performance classification
    CASE 
      WHEN AVG(avg_execution_time_ms) > 100 THEN 'Poor'
      WHEN AVG(avg_execution_time_ms) > 50 THEN 'Fair'
      WHEN AVG(avg_execution_time_ms) > 10 THEN 'Good'
      ELSE 'Excellent'
    END as performance_rating,
    
    -- Optimization recommendations
    CASE pattern_type
      WHEN 'customer_history' THEN 'Compound index: customer_id + order_date + status'
      WHEN 'fulfillment' THEN 'Compound index: status + priority + order_date'
      WHEN 'sales_analytics' THEN 'Compound index: sales_rep_id + order_date + total_amount'
      WHEN 'geographic' THEN 'Geospatial index: shipping_coordinates + status + date'
      ELSE 'Analyze query patterns for custom compound index'
    END as index_recommendation
    
  FROM query_pattern_analysis
  GROUP BY pattern_type
  HAVING COUNT(*) >= 10  -- Only analyze patterns with sufficient volume
)
SELECT 
  pattern_type,
  query_count,
  ROUND(avg_execution_time, 2) as avg_execution_time_ms,
  ROUND(avg_selectivity, 2) as avg_selectivity_percent,
  performance_rating,
  index_recommendation,
  
  -- Optimization priority
  CASE 
    WHEN performance_rating = 'Poor' AND query_count > 1000 THEN 'CRITICAL'
    WHEN performance_rating IN ('Poor', 'Fair') AND query_count > 100 THEN 'HIGH'
    WHEN performance_rating = 'Fair' THEN 'MEDIUM'
    ELSE 'LOW'
  END as optimization_priority
  
FROM index_optimization_opportunities
ORDER BY 
  CASE optimization_priority
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2 
    WHEN 'MEDIUM' THEN 3
    ELSE 4
  END,
  query_count DESC;

-- Performance monitoring dashboard
WITH performance_metrics AS (
  SELECT 
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    collection_name,
    
    -- Query performance metrics
    COUNT(*) as total_queries,
    AVG(execution_time_ms) as avg_execution_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_execution_time,
    MAX(execution_time_ms) as max_execution_time,
    
    -- Index usage metrics
    AVG(docs_examined::numeric / GREATEST(docs_returned, 1)) as avg_docs_per_result,
    AVG(CASE WHEN index_used THEN 1.0 ELSE 0.0 END) as index_usage_ratio,
    
    -- Query efficiency
    AVG(CASE WHEN docs_examined > 0 THEN docs_returned::numeric / docs_examined ELSE 1 END) as avg_selectivity,
    
    -- Performance classification
    COUNT(*) FILTER (WHERE execution_time_ms <= 10) as excellent_queries,
    COUNT(*) FILTER (WHERE execution_time_ms <= 50) as good_queries,
    COUNT(*) FILTER (WHERE execution_time_ms <= 100) as fair_queries,
    COUNT(*) FILTER (WHERE execution_time_ms > 100) as poor_queries
    
  FROM mongodb_query_performance_log
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND collection_name = 'orders'
  GROUP BY DATE_TRUNC('hour', timestamp), collection_name
),
performance_trends AS (
  SELECT *,
    -- Calculate performance trends
    LAG(avg_execution_time) OVER (ORDER BY hour_bucket) as prev_hour_avg_time,
    LAG(index_usage_ratio) OVER (ORDER BY hour_bucket) as prev_hour_index_usage,
    
    -- Performance health score (0-100)
    ROUND(
      (excellent_queries::numeric / total_queries * 40) +
      (good_queries::numeric / total_queries * 30) +
      (fair_queries::numeric / total_queries * 20) +
      (index_usage_ratio * 10),
      0
    ) as performance_health_score
    
  FROM performance_metrics
)
SELECT 
  TO_CHAR(hour_bucket, 'YYYY-MM-DD HH24:00') as monitoring_hour,
  total_queries,
  ROUND(avg_execution_time::numeric, 2) as avg_execution_time_ms,
  ROUND(p95_execution_time::numeric, 2) as p95_execution_time_ms,
  ROUND((index_usage_ratio * 100)::numeric, 1) as index_usage_percent,
  ROUND((avg_selectivity * 100)::numeric, 2) as avg_selectivity_percent,
  performance_health_score,
  
  -- Performance distribution
  CONCAT(
    excellent_queries, ' excellent, ',
    good_queries, ' good, ', 
    fair_queries, ' fair, ',
    poor_queries, ' poor'
  ) as query_distribution,
  
  -- Trend indicators
  CASE 
    WHEN avg_execution_time > prev_hour_avg_time * 1.2 THEN '📈 Degrading'
    WHEN avg_execution_time < prev_hour_avg_time * 0.8 THEN '📉 Improving' 
    ELSE '➡️ Stable'
  END as performance_trend,
  
  -- Health status
  CASE 
    WHEN performance_health_score >= 90 THEN '🟢 Excellent'
    WHEN performance_health_score >= 75 THEN '🟡 Good'
    WHEN performance_health_score >= 60 THEN '🟠 Fair'
    ELSE '🔴 Poor'
  END as health_status,
  
  -- Recommendations
  CASE 
    WHEN performance_health_score < 60 THEN 'Immediate optimization required'
    WHEN index_usage_ratio < 0.8 THEN 'Review query patterns and add missing indexes'
    WHEN avg_selectivity < 0.1 THEN 'Improve query selectivity with better filtering'
    WHEN poor_queries > total_queries * 0.1 THEN 'Optimize slow query patterns'
    ELSE 'Performance within acceptable range'
  END as recommendation
  
FROM performance_trends
WHERE hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY hour_bucket DESC;

-- Index maintenance automation
CREATE PROCEDURE optimize_collection_indexes(
  collection_name VARCHAR(100),
  maintenance_mode VARCHAR(20) DEFAULT 'conservative'
) AS
BEGIN
  -- Analyze current index usage
  WITH index_analysis AS (
    SELECT 
      index_name,
      access_count,
      size_bytes,
      last_accessed,
      CASE 
        WHEN access_count = 0 THEN 'unused'
        WHEN access_count < 10 AND size_bytes > 10 * 1024 * 1024 THEN 'underutilized'
        WHEN access_count > 50000 THEN 'high_usage'
        ELSE 'normal'
      END as usage_category
    FROM mongodb_index_statistics(collection_name)
    WHERE index_name != '_id_'
  )
  SELECT 
    COUNT(*) FILTER (WHERE usage_category = 'unused') as unused_count,
    COUNT(*) FILTER (WHERE usage_category = 'underutilized') as underutilized_count,
    SUM(size_bytes) FILTER (WHERE usage_category = 'unused') as unused_size_bytes
  INTO TEMPORARY TABLE maintenance_summary;
  
  -- Execute maintenance based on mode
  CASE maintenance_mode
    WHEN 'aggressive' THEN
      -- Drop unused and underutilized indexes
      CALL mongodb_drop_unused_indexes(collection_name);
      CALL mongodb_review_underutilized_indexes(collection_name);
      
    WHEN 'conservative' THEN 
      -- Only drop clearly unused indexes (0 access, older than 30 days)
      CALL mongodb_drop_unused_indexes(collection_name, min_age_days => 30);
      
    WHEN 'analyze_only' THEN
      -- Generate report without making changes
      CALL mongodb_generate_index_report(collection_name);
  END CASE;
  
  -- Log maintenance activity
  INSERT INTO index_maintenance_log (
    collection_name,
    maintenance_mode,
    maintenance_timestamp,
    unused_indexes_dropped,
    storage_saved_bytes
  ) 
  SELECT 
    collection_name,
    maintenance_mode,
    CURRENT_TIMESTAMP,
    (SELECT unused_count FROM maintenance_summary),
    (SELECT unused_size_bytes FROM maintenance_summary);
    
  COMMIT;
END;

-- QueryLeaf provides comprehensive index optimization capabilities:
-- 1. SQL-familiar index creation and management syntax
-- 2. Advanced compound index strategies with ESR pattern optimization
-- 3. Automated query performance analysis and explain plan interpretation
-- 4. Index usage monitoring and utilization tracking
-- 5. Performance trend analysis and health scoring
-- 6. Automated optimization recommendations based on usage patterns
-- 7. Maintenance procedures for index lifecycle management
-- 8. Integration with MongoDB's native indexing and performance features
-- 9. Real-time performance monitoring with alerting capabilities
-- 10. Familiar SQL patterns for complex index optimization requirements
```

## Best Practices for Index Optimization

### Index Design Principles

Essential practices for effective MongoDB index optimization:

1. **ESR Pattern**: Design compound indexes following Equality-Sort-Range order
2. **Query-First Design**: Create indexes based on actual query patterns, not theoretical needs
3. **Selectivity Optimization**: Place most selective fields first in compound indexes
4. **Index Intersection**: Leverage MongoDB's ability to use multiple indexes for complex queries
5. **Covering Indexes**: Include frequently accessed fields to avoid document lookups
6. **Maintenance Balance**: Balance query performance with write performance and storage costs

### Performance Monitoring

Implement comprehensive performance monitoring for production environments:

1. **Continuous Analysis**: Monitor query performance patterns and execution statistics
2. **Usage Tracking**: Track index utilization to identify unused or underutilized indexes
3. **Trend Analysis**: Identify performance degradation trends before they impact users
4. **Automated Alerting**: Set up alerts for slow queries and index efficiency metrics
5. **Regular Optimization**: Schedule periodic index analysis and optimization cycles
6. **Capacity Planning**: Monitor index growth and plan for scaling requirements

## Conclusion

MongoDB Index Optimization provides comprehensive query performance tuning capabilities that eliminate the complexity and manual overhead of traditional database optimization approaches. The combination of intelligent compound indexing, automated performance analysis, and sophisticated query execution monitoring enables proactive performance management that scales with growing data volumes and evolving access patterns.

Key Index Optimization benefits include:

- **Intelligent Compound Indexing**: Advanced ESR pattern optimization for maximum query efficiency
- **Automated Performance Analysis**: Comprehensive query execution analysis with actionable recommendations
- **Usage-Based Optimization**: Index recommendations based on actual utilization patterns
- **Comprehensive Monitoring**: Real-time performance tracking with trend analysis and alerting
- **Maintenance Automation**: Automated cleanup of unused indexes and optimization suggestions
- **Developer Familiarity**: SQL-style optimization patterns with MongoDB's flexible indexing system

Whether you're building high-traffic web applications, analytics platforms, real-time systems, or any application requiring exceptional database performance, MongoDB Index Optimization with QueryLeaf's familiar SQL interface provides the foundation for enterprise-grade performance engineering. This combination enables you to implement sophisticated optimization strategies while preserving familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL index operations into MongoDB index management, providing SQL-familiar CREATE INDEX syntax, EXPLAIN plan analysis, and performance monitoring queries. Advanced optimization strategies, compound index design, and automated maintenance are seamlessly handled through familiar SQL patterns, making enterprise performance optimization both powerful and accessible.

The integration of comprehensive optimization capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both exceptional performance and familiar database optimization patterns, ensuring your performance solutions remain both effective and maintainable as they scale and evolve.