---
title: "MongoDB Transactions and ACID Properties: Distributed Systems Consistency and Multi-Document Operations"
description: "Master MongoDB transactions for ACID compliance and distributed consistency. Learn multi-document operations, session management, transaction patterns, and SQL-familiar transaction handling for enterprise applications."
date: 2025-12-02
tags: [mongodb, transactions, acid, consistency, distributed-systems, multi-document, sql, enterprise]
---

# MongoDB Transactions and ACID Properties: Distributed Systems Consistency and Multi-Document Operations

Modern applications require transactional consistency across multiple operations to maintain data integrity, ensure business rule enforcement, and provide reliable state management in distributed environments. Traditional databases provide ACID transaction support, but scaling these capabilities across distributed systems introduces complexity in maintaining consistency while preserving performance and availability across multiple nodes and data centers.

MongoDB transactions provide comprehensive ACID properties with multi-document operations, distributed consistency guarantees, and session-based transaction management designed for modern distributed applications. Unlike traditional databases that struggle with distributed transactions, MongoDB's transaction implementation leverages replica sets and sharded clusters to provide enterprise-grade consistency while maintaining the flexibility and scalability of document-based data models.

## The Traditional Transaction Management Challenge

Implementing consistent multi-table operations in traditional databases requires complex transaction coordination:

```sql
-- Traditional PostgreSQL transactions - complex multi-table coordination with limitations

-- Begin transaction for order processing workflow
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- Order processing with inventory management
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    order_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    order_total DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Payment information
    payment_method VARCHAR(50),
    payment_status VARCHAR(20) DEFAULT 'pending',
    payment_reference VARCHAR(100),
    payment_amount DECIMAL(15,2),
    
    -- Shipping information
    shipping_address JSONB,
    shipping_method VARCHAR(50),
    shipping_cost DECIMAL(10,2),
    estimated_delivery DATE,
    
    -- Business metadata
    sales_channel VARCHAR(50),
    promotions_applied JSONB,
    order_notes TEXT,
    
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Order items with inventory tracking
CREATE TABLE order_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(15,2) NOT NULL,
    
    -- Product details snapshot
    product_sku VARCHAR(100),
    product_name VARCHAR(500),
    product_variant JSONB,
    
    -- Inventory management
    reserved_inventory BOOLEAN DEFAULT FALSE,
    reservation_id UUID,
    inventory_location VARCHAR(100),
    
    -- Pricing and promotions
    original_price DECIMAL(10,2),
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Inventory management table
CREATE TABLE inventory (
    inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    location_id VARCHAR(100) NOT NULL,
    available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    total_quantity INTEGER GENERATED ALWAYS AS (available_quantity + reserved_quantity) STORED,
    
    -- Stock management
    reorder_point INTEGER DEFAULT 10,
    reorder_quantity INTEGER DEFAULT 50,
    last_restocked TIMESTAMP,
    
    -- Cost and valuation
    unit_cost DECIMAL(10,2),
    total_cost DECIMAL(15,2) GENERATED ALWAYS AS (total_quantity * unit_cost) STORED,
    
    -- Tracking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    UNIQUE(product_id, location_id)
);

-- Payment transactions
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_amount DECIMAL(15,2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- Payment processing details
    payment_processor VARCHAR(50),
    processor_transaction_id VARCHAR(200),
    processor_response JSONB,
    
    -- Authorization and capture
    authorization_code VARCHAR(50),
    authorization_amount DECIMAL(15,2),
    capture_amount DECIMAL(15,2),
    refund_amount DECIMAL(15,2) DEFAULT 0,
    
    -- Timing
    authorized_at TIMESTAMP,
    captured_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- Complex transaction procedure for order processing
CREATE OR REPLACE FUNCTION process_customer_order(
    p_customer_id UUID,
    p_order_items JSONB,
    p_payment_info JSONB,
    p_shipping_info JSONB
) RETURNS TABLE(
    order_id UUID,
    order_number VARCHAR,
    total_amount DECIMAL,
    payment_status VARCHAR,
    inventory_status VARCHAR,
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_order_id UUID;
    v_order_number VARCHAR(50);
    v_order_total DECIMAL(15,2) := 0;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_unit_price DECIMAL(10,2);
    v_available_inventory INTEGER;
    v_payment_id UUID;
    v_authorization_result JSONB;
    v_error_occurred BOOLEAN := FALSE;
    v_error_message TEXT := '';
    
BEGIN
    -- Generate order number and ID
    v_order_id := gen_random_uuid();
    v_order_number := 'ORD-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || 
                      to_char(extract(epoch from CURRENT_TIMESTAMP)::integer % 10000, 'FM0000');
    
    -- Validate customer exists
    IF NOT EXISTS (SELECT 1 FROM customers WHERE customer_id = p_customer_id) THEN
        RETURN QUERY SELECT v_order_id, v_order_number, 0::DECIMAL(15,2), 'failed'::VARCHAR, 
                           'validation_failed'::VARCHAR, FALSE, 'Customer not found'::TEXT;
        RETURN;
    END IF;
    
    -- Start order processing transaction
    SAVEPOINT order_processing_start;
    
    BEGIN
        -- Validate and reserve inventory for each item
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
        LOOP
            v_product_id := (v_item->>'product_id')::UUID;
            v_quantity := (v_item->>'quantity')::INTEGER;
            v_unit_price := (v_item->>'unit_price')::DECIMAL(10,2);
            
            -- Check product exists and is active
            IF NOT EXISTS (
                SELECT 1 FROM products 
                WHERE product_id = v_product_id 
                AND status = 'active'
            ) THEN
                v_error_occurred := TRUE;
                v_error_message := 'Product ' || v_product_id || ' not found or inactive';
                EXIT;
            END IF;
            
            -- Check inventory availability with row-level locking
            SELECT available_quantity INTO v_available_inventory
            FROM inventory 
            WHERE product_id = v_product_id 
            AND location_id = 'main_warehouse'
            FOR UPDATE; -- Lock inventory record
            
            IF v_available_inventory < v_quantity THEN
                v_error_occurred := TRUE;
                v_error_message := 'Insufficient inventory for product ' || v_product_id || 
                                  ': requested ' || v_quantity || ', available ' || v_available_inventory;
                EXIT;
            END IF;
            
            -- Reserve inventory
            UPDATE inventory 
            SET available_quantity = available_quantity - v_quantity,
                reserved_quantity = reserved_quantity + v_quantity,
                updated_at = CURRENT_TIMESTAMP
            WHERE product_id = v_product_id 
            AND location_id = 'main_warehouse';
            
            v_order_total := v_order_total + (v_quantity * v_unit_price);
        END LOOP;
        
        -- If inventory validation failed, rollback and return error
        IF v_error_occurred THEN
            ROLLBACK TO SAVEPOINT order_processing_start;
            RETURN QUERY SELECT v_order_id, v_order_number, v_order_total, 'failed'::VARCHAR,
                               'inventory_insufficient'::VARCHAR, FALSE, v_error_message;
            RETURN;
        END IF;
        
        -- Create order record
        INSERT INTO orders (
            order_id, customer_id, order_number, order_status, order_total,
            payment_method, shipping_address, shipping_method, shipping_cost,
            sales_channel, order_notes
        ) VALUES (
            v_order_id, p_customer_id, v_order_number, 'pending', v_order_total,
            p_payment_info->>'method',
            p_shipping_info->'address',
            p_shipping_info->>'method',
            (p_shipping_info->>'cost')::DECIMAL(10,2),
            'web',
            'Order processed via transaction system'
        );
        
        -- Create order items
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
        LOOP
            INSERT INTO order_items (
                order_id, product_id, quantity, unit_price, line_total,
                product_sku, product_name, reserved_inventory, inventory_location
            ) 
            SELECT 
                v_order_id,
                (v_item->>'product_id')::UUID,
                (v_item->>'quantity')::INTEGER,
                (v_item->>'unit_price')::DECIMAL(10,2),
                (v_item->>'quantity')::INTEGER * (v_item->>'unit_price')::DECIMAL(10,2),
                p.sku,
                p.name,
                TRUE,
                'main_warehouse'
            FROM products p 
            WHERE p.product_id = (v_item->>'product_id')::UUID;
        END LOOP;
        
        -- Process payment authorization
        INSERT INTO payments (
            payment_id, order_id, payment_method, payment_amount, payment_status,
            payment_processor, authorization_amount
        ) VALUES (
            gen_random_uuid(), v_order_id, 
            p_payment_info->>'method',
            v_order_total,
            'authorizing',
            p_payment_info->>'processor',
            v_order_total
        ) RETURNING payment_id INTO v_payment_id;
        
        -- Simulate payment processing (in real system would call external API)
        -- This creates a critical point where external system coordination is required
        IF (p_payment_info->>'test_mode')::BOOLEAN = TRUE THEN
            -- Simulate successful authorization for testing
            UPDATE payments 
            SET payment_status = 'authorized',
                authorization_code = 'TEST_AUTH_' || extract(epoch from CURRENT_TIMESTAMP)::text,
                authorized_at = CURRENT_TIMESTAMP,
                processor_response = jsonb_build_object(
                    'status', 'approved',
                    'auth_code', 'TEST_AUTH_CODE',
                    'processor_ref', 'TEST_REF_' || v_payment_id,
                    'processed_at', CURRENT_TIMESTAMP
                )
            WHERE payment_id = v_payment_id;
            
            -- Update order status
            UPDATE orders 
            SET payment_status = 'authorized',
                order_status = 'confirmed',
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = v_order_id;
            
        ELSE
            -- In production, this would require external payment processor integration
            -- which introduces distributed transaction complexity and potential failures
            v_error_occurred := TRUE;
            v_error_message := 'Payment processing not available in non-test mode';
        END IF;
        
        -- Final validation and commit preparation
        IF v_error_occurred THEN
            ROLLBACK TO SAVEPOINT order_processing_start;
            
            RETURN QUERY SELECT v_order_id, v_order_number, v_order_total, 'failed'::VARCHAR,
                               'payment_failed'::VARCHAR, FALSE, v_error_message;
            RETURN;
        END IF;
        
        -- Success case
        COMMIT;
        
        RETURN QUERY SELECT v_order_id, v_order_number, v_order_total, 'authorized'::VARCHAR,
                           'reserved'::VARCHAR, TRUE, 'Order processed successfully'::TEXT;
        
    EXCEPTION
        WHEN serialization_failure THEN
            ROLLBACK TO SAVEPOINT order_processing_start;
            RETURN QUERY SELECT v_order_id, v_order_number, v_order_total, 'failed'::VARCHAR,
                               'serialization_error'::VARCHAR, FALSE, 'Transaction serialization failed'::TEXT;
            
        WHEN deadlock_detected THEN
            ROLLBACK TO SAVEPOINT order_processing_start;
            RETURN QUERY SELECT v_order_id, v_order_number, v_order_total, 'failed'::VARCHAR,
                               'deadlock_error'::VARCHAR, FALSE, 'Deadlock detected during processing'::TEXT;
            
        WHEN OTHERS THEN
            ROLLBACK TO SAVEPOINT order_processing_start;
            RETURN QUERY SELECT v_order_id, v_order_number, v_order_total, 'failed'::VARCHAR,
                               'system_error'::VARCHAR, FALSE, SQLERRM::TEXT;
    END;
END;
$$ LANGUAGE plpgsql;

-- Test the complex transaction workflow
SELECT * FROM process_customer_order(
    'customer-uuid-123'::UUID,
    '[
        {"product_id": "product-uuid-1", "quantity": 2, "unit_price": 29.99},
        {"product_id": "product-uuid-2", "quantity": 1, "unit_price": 149.99}
    ]'::JSONB,
    '{"method": "credit_card", "processor": "stripe", "test_mode": true}'::JSONB,
    '{"method": "standard", "cost": 9.99, "address": {"street": "123 Main St", "city": "Boston", "state": "MA"}}'::JSONB
);

-- Monitor transaction performance and conflicts
WITH transaction_analysis AS (
    SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_deadlocks as deadlock_count,
        
        -- Lock analysis
        CASE 
            WHEN n_deadlocks > 0 THEN 'deadlock_issues'
            WHEN n_tup_upd > n_tup_ins * 2 THEN 'high_update_contention'
            ELSE 'normal_operation'
        END as transaction_health,
        
        -- Performance indicators
        ROUND(
            (n_tup_upd + n_tup_del)::DECIMAL / NULLIF((n_tup_ins + n_tup_upd + n_tup_del), 0) * 100, 
            2
        ) as modification_ratio
        
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    AND tablename IN ('orders', 'order_items', 'inventory', 'payments')
),

lock_conflicts AS (
    SELECT 
        relation::regclass as table_name,
        mode as lock_mode,
        granted,
        COUNT(*) as lock_count
    FROM pg_locks 
    WHERE relation IS NOT NULL
    GROUP BY relation, mode, granted
)

SELECT 
    ta.tablename,
    ta.transaction_health,
    ta.modification_ratio || '%' as modification_percentage,
    ta.deadlock_count,
    
    -- Lock conflict analysis
    COALESCE(lc.lock_count, 0) as active_locks,
    COALESCE(lc.lock_mode, 'none') as primary_lock_mode,
    
    -- Transaction recommendations
    CASE 
        WHEN ta.deadlock_count > 5 THEN 'Redesign transaction order and locking strategy'
        WHEN ta.modification_ratio > 80 THEN 'Consider read replicas for query workload'
        WHEN ta.transaction_health = 'high_update_contention' THEN 'Optimize update batching and reduce lock duration'
        ELSE 'Transaction patterns within acceptable parameters'
    END as optimization_recommendation
    
FROM transaction_analysis ta
LEFT JOIN lock_conflicts lc ON ta.tablename = lc.table_name::text
ORDER BY ta.deadlock_count DESC, ta.modification_ratio DESC;

-- Problems with traditional transaction management:
-- 1. Complex multi-table coordination requiring careful lock management and deadlock prevention
-- 2. Limited scalability due to lock contention and serialization constraints
-- 3. Difficulty implementing distributed transactions across services and external systems
-- 4. Performance overhead from lock management and transaction coordination mechanisms
-- 5. Complex error handling for various transaction failure scenarios and rollback procedures
-- 6. Limited flexibility in transaction isolation levels affecting performance vs consistency
-- 7. Challenges with long-running transactions and their impact on system performance
-- 8. Complexity in implementing saga patterns for distributed transaction coordination
-- 9. Manual management of transaction boundaries and session coordination
-- 10. Difficulty in monitoring and optimizing transaction performance across complex workflows
```

MongoDB provides native ACID transactions with multi-document operations and distributed consistency:

```javascript
// MongoDB Transactions - native ACID compliance with distributed consistency management
const { MongoClient, ObjectId } = require('mongodb');

// Advanced MongoDB Transaction Manager with ACID guarantees and distributed consistency
class MongoTransactionManager {
  constructor(config = {}) {
    this.config = {
      // Connection configuration
      uri: config.uri || 'mongodb://localhost:27017',
      database: config.database || 'ecommerce_platform',
      
      // Transaction configuration
      defaultTransactionOptions: {
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true },
        maxCommitTimeMS: 30000,
        maxTransactionLockRequestTimeoutMillis: 5000
      },
      
      // Session management
      sessionPoolSize: config.sessionPoolSize || 10,
      enableSessionPooling: config.enableSessionPooling !== false,
      
      // Retry and error handling
      maxRetryAttempts: config.maxRetryAttempts || 3,
      retryDelayMs: config.retryDelayMs || 1000,
      enableAutoRetry: config.enableAutoRetry !== false,
      
      // Monitoring and analytics
      enableTransactionMonitoring: config.enableTransactionMonitoring !== false,
      enablePerformanceTracking: config.enablePerformanceTracking !== false,
      
      // Advanced features
      enableDistributedTransactions: config.enableDistributedTransactions !== false,
      enableCausalConsistency: config.enableCausalConsistency !== false
    };
    
    this.client = null;
    this.database = null;
    this.sessionPool = [];
    this.transactionMetrics = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      retriedTransactions: 0,
      averageTransactionTime: 0,
      transactionTypes: new Map()
    };
  }

  async initialize() {
    console.log('Initializing MongoDB Transaction Manager with ACID guarantees...');
    
    try {
      // Connect with transaction-optimized settings
      this.client = new MongoClient(this.config.uri, {
        // Replica set configuration for transactions
        readPreference: 'primary',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true },
        
        // Connection optimization for transactions
        maxPoolSize: 20,
        minPoolSize: 5,
        retryWrites: true,
        retryReads: true,
        
        // Session configuration
        maxIdleTimeMS: 60000,
        serverSelectionTimeoutMS: 30000,
        
        // Application identification
        appName: 'TransactionManager'
      });
      
      await this.client.connect();
      this.database = this.client.db(this.config.database);
      
      // Initialize session pool for transaction management
      await this.initializeSessionPool();
      
      // Setup transaction monitoring
      if (this.config.enableTransactionMonitoring) {
        await this.setupTransactionMonitoring();
      }
      
      console.log('MongoDB Transaction Manager initialized successfully');
      
      return this.database;
      
    } catch (error) {
      console.error('Failed to initialize transaction manager:', error);
      throw error;
    }
  }

  async initializeSessionPool() {
    console.log('Initializing session pool for transaction management...');
    
    for (let i = 0; i < this.config.sessionPoolSize; i++) {
      const session = this.client.startSession({
        causalConsistency: this.config.enableCausalConsistency,
        defaultTransactionOptions: this.config.defaultTransactionOptions
      });
      
      this.sessionPool.push({
        session,
        inUse: false,
        createdAt: new Date(),
        transactionCount: 0
      });
    }
    
    console.log(`Session pool initialized with ${this.sessionPool.length} sessions`);
  }

  async acquireSession() {
    // Find available session from pool
    let sessionWrapper = this.sessionPool.find(s => !s.inUse);
    
    if (!sessionWrapper) {
      // Create temporary session if pool exhausted
      console.warn('Session pool exhausted, creating temporary session');
      sessionWrapper = {
        session: this.client.startSession({
          causalConsistency: this.config.enableCausalConsistency,
          defaultTransactionOptions: this.config.defaultTransactionOptions
        }),
        inUse: true,
        createdAt: new Date(),
        transactionCount: 0,
        temporary: true
      };
    } else {
      sessionWrapper.inUse = true;
    }
    
    return sessionWrapper;
  }

  async releaseSession(sessionWrapper) {
    sessionWrapper.inUse = false;
    sessionWrapper.transactionCount++;
    
    // Clean up temporary sessions
    if (sessionWrapper.temporary) {
      await sessionWrapper.session.endSession();
    }
  }

  async executeTransaction(transactionFunction, options = {}) {
    console.log('Executing MongoDB transaction with ACID guarantees...');
    const startTime = Date.now();
    const transactionId = new ObjectId().toString();
    
    let sessionWrapper = null;
    let attempt = 0;
    const maxRetries = options.maxRetries || this.config.maxRetryAttempts;
    
    while (attempt < maxRetries) {
      try {
        // Acquire session for transaction
        sessionWrapper = await this.acquireSession();
        const session = sessionWrapper.session;
        
        // Configure transaction options
        const transactionOptions = {
          ...this.config.defaultTransactionOptions,
          ...options.transactionOptions
        };
        
        console.log(`Starting transaction ${transactionId} (attempt ${attempt + 1})`);
        
        // Start transaction with ACID properties
        session.startTransaction(transactionOptions);
        
        // Execute transaction function with session
        const result = await transactionFunction(session, this.database);
        
        // Commit transaction
        await session.commitTransaction();
        
        const executionTime = Date.now() - startTime;
        console.log(`Transaction ${transactionId} committed successfully in ${executionTime}ms`);
        
        // Update metrics
        await this.updateTransactionMetrics('success', executionTime, options.transactionType);
        
        return {
          transactionId,
          success: true,
          result,
          executionTime,
          attempt: attempt + 1
        };
        
      } catch (error) {
        console.error(`Transaction ${transactionId} failed on attempt ${attempt + 1}:`, error.message);
        
        if (sessionWrapper) {
          try {
            await sessionWrapper.session.abortTransaction();
          } catch (abortError) {
            console.error('Error aborting transaction:', abortError.message);
          }
        }
        
        // Check if error is retryable
        if (this.isRetryableError(error) && attempt < maxRetries - 1) {
          attempt++;
          console.log(`Retrying transaction ${transactionId} (attempt ${attempt + 1})`);
          
          // Wait with exponential backoff
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
          
          continue;
        }
        
        // Transaction failed permanently
        const executionTime = Date.now() - startTime;
        await this.updateTransactionMetrics('failure', executionTime, options.transactionType);
        
        throw new Error(`Transaction ${transactionId} failed after ${attempt + 1} attempts: ${error.message}`);
        
      } finally {
        if (sessionWrapper) {
          await this.releaseSession(sessionWrapper);
        }
      }
    }
  }

  async processCustomerOrder(orderData) {
    console.log('Processing customer order with ACID transaction...');
    
    return await this.executeTransaction(async (session, db) => {
      const orderId = new ObjectId();
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const timestamp = new Date();
      
      // Collections for multi-document transaction
      const ordersCollection = db.collection('orders');
      const inventoryCollection = db.collection('inventory');
      const paymentsCollection = db.collection('payments');
      const customersCollection = db.collection('customers');
      
      // Step 1: Validate customer exists (with session for consistency)
      const customer = await customersCollection.findOne(
        { _id: new ObjectId(orderData.customerId) },
        { session }
      );
      
      if (!customer) {
        throw new Error('Customer not found');
      }
      
      // Step 2: Validate and reserve inventory atomically
      let totalAmount = 0;
      const inventoryUpdates = [];
      const orderItems = [];
      
      for (const item of orderData.items) {
        const productId = new ObjectId(item.productId);
        
        // Check inventory with document-level locking within transaction
        const inventory = await inventoryCollection.findOne(
          { productId: productId, locationId: 'main_warehouse' },
          { session }
        );
        
        if (!inventory) {
          throw new Error(`Inventory not found for product ${item.productId}`);
        }
        
        if (inventory.availableQuantity < item.quantity) {
          throw new Error(
            `Insufficient inventory for product ${item.productId}: ` +
            `requested ${item.quantity}, available ${inventory.availableQuantity}`
          );
        }
        
        // Prepare inventory update
        inventoryUpdates.push({
          updateOne: {
            filter: { 
              productId: productId, 
              locationId: 'main_warehouse',
              availableQuantity: { $gte: item.quantity } // Optimistic concurrency control
            },
            update: {
              $inc: {
                availableQuantity: -item.quantity,
                reservedQuantity: item.quantity
              },
              $set: { updatedAt: timestamp }
            }
          }
        });
        
        // Prepare order item
        const lineTotal = item.quantity * item.unitPrice;
        totalAmount += lineTotal;
        
        orderItems.push({
          _id: new ObjectId(),
          productId: productId,
          productSku: inventory.productSku,
          productName: inventory.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: lineTotal,
          inventoryReserved: true,
          reservationTimestamp: timestamp
        });
      }
      
      // Step 3: Execute inventory updates atomically
      const inventoryResult = await inventoryCollection.bulkWrite(
        inventoryUpdates,
        { session, ordered: true }
      );
      
      if (inventoryResult.matchedCount !== orderData.items.length) {
        throw new Error('Inventory reservation failed due to concurrent updates');
      }
      
      // Step 4: Process payment authorization (atomic within transaction)
      const paymentId = new ObjectId();
      const payment = {
        _id: paymentId,
        orderId: orderId,
        paymentMethod: orderData.payment.method,
        paymentProcessor: orderData.payment.processor || 'stripe',
        amount: totalAmount,
        status: 'processing',
        authorizationAttempts: 0,
        createdAt: timestamp,
        
        // Payment details
        processorTransactionId: null,
        authorizationCode: null,
        processorResponse: null
      };
      
      // Simulate payment processing (in production would integrate with payment processor)
      if (orderData.payment.testMode) {
        payment.status = 'authorized';
        payment.authorizationCode = `TEST_AUTH_${Date.now()}`;
        payment.processorTransactionId = `test_txn_${paymentId}`;
        payment.authorizedAt = timestamp;
        payment.processorResponse = {
          status: 'approved',
          authCode: payment.authorizationCode,
          processorRef: payment.processorTransactionId,
          processedAt: timestamp
        };
      } else {
        // In production, would make external API call within transaction timeout
        payment.status = 'authorization_pending';
      }
      
      await paymentsCollection.insertOne(payment, { session });
      
      // Step 5: Create order document with all related data
      const order = {
        _id: orderId,
        orderNumber: orderNumber,
        customerId: new ObjectId(orderData.customerId),
        status: payment.status === 'authorized' ? 'confirmed' : 'payment_pending',
        
        // Order details
        items: orderItems,
        itemCount: orderItems.length,
        totalAmount: totalAmount,
        
        // Payment information
        paymentId: paymentId,
        paymentMethod: orderData.payment.method,
        paymentStatus: payment.status,
        
        // Shipping information
        shippingAddress: orderData.shipping.address,
        shippingMethod: orderData.shipping.method,
        shippingCost: orderData.shipping.cost || 0,
        
        // Timestamps and metadata
        createdAt: timestamp,
        updatedAt: timestamp,
        salesChannel: 'web',
        orderSource: 'transaction_api',
        
        // Transaction tracking
        transactionId: session.id ? session.id.toString() : null,
        inventoryReserved: true,
        inventoryReservationExpiry: new Date(timestamp.getTime() + 15 * 60 * 1000) // 15 minutes
      };
      
      await ordersCollection.insertOne(order, { session });
      
      // Step 6: Update customer order history (within same transaction)
      await customersCollection.updateOne(
        { _id: new ObjectId(orderData.customerId) },
        {
          $inc: { 
            totalOrders: 1,
            totalSpent: totalAmount
          },
          $push: {
            recentOrders: {
              $each: [{ orderId: orderId, orderNumber: orderNumber, amount: totalAmount, date: timestamp }],
              $slice: -10 // Keep only last 10 orders
            }
          },
          $set: { lastOrderDate: timestamp, updatedAt: timestamp }
        },
        { session }
      );
      
      console.log(`Order ${orderNumber} processed successfully with ${orderItems.length} items`);
      
      return {
        orderId: orderId,
        orderNumber: orderNumber,
        status: order.status,
        totalAmount: totalAmount,
        paymentStatus: payment.status,
        inventoryReserved: true,
        items: orderItems.length,
        processingTime: Date.now() - timestamp.getTime()
      };
      
    }, {
      transactionType: 'customer_order',
      maxRetries: 3,
      transactionOptions: {
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true }
      }
    });
  }

  async processInventoryTransfer(transferData) {
    console.log('Processing inventory transfer with ACID transaction...');
    
    return await this.executeTransaction(async (session, db) => {
      const transferId = new ObjectId();
      const timestamp = new Date();
      
      const inventoryCollection = db.collection('inventory');
      const transfersCollection = db.collection('inventory_transfers');
      
      // Validate source location inventory
      const sourceInventory = await inventoryCollection.findOne(
        { 
          productId: new ObjectId(transferData.productId),
          locationId: transferData.sourceLocation
        },
        { session }
      );
      
      if (!sourceInventory || sourceInventory.availableQuantity < transferData.quantity) {
        throw new Error(
          `Insufficient inventory at source location ${transferData.sourceLocation}: ` +
          `requested ${transferData.quantity}, available ${sourceInventory?.availableQuantity || 0}`
        );
      }
      
      // Validate destination location exists
      const destinationInventory = await inventoryCollection.findOne(
        { 
          productId: new ObjectId(transferData.productId),
          locationId: transferData.destinationLocation
        },
        { session }
      );
      
      if (!destinationInventory) {
        throw new Error(`Destination location ${transferData.destinationLocation} not found`);
      }
      
      // Execute atomic inventory updates
      const transferOperations = [
        {
          updateOne: {
            filter: {
              productId: new ObjectId(transferData.productId),
              locationId: transferData.sourceLocation,
              availableQuantity: { $gte: transferData.quantity }
            },
            update: {
              $inc: { availableQuantity: -transferData.quantity },
              $set: { updatedAt: timestamp }
            }
          }
        },
        {
          updateOne: {
            filter: {
              productId: new ObjectId(transferData.productId),
              locationId: transferData.destinationLocation
            },
            update: {
              $inc: { availableQuantity: transferData.quantity },
              $set: { updatedAt: timestamp }
            }
          }
        }
      ];
      
      const transferResult = await inventoryCollection.bulkWrite(
        transferOperations,
        { session, ordered: true }
      );
      
      if (transferResult.matchedCount !== 2) {
        throw new Error('Inventory transfer failed due to concurrent updates');
      }
      
      // Record transfer transaction
      const transfer = {
        _id: transferId,
        productId: new ObjectId(transferData.productId),
        sourceLocation: transferData.sourceLocation,
        destinationLocation: transferData.destinationLocation,
        quantity: transferData.quantity,
        transferType: transferData.transferType || 'manual',
        reason: transferData.reason || 'inventory_rebalancing',
        status: 'completed',
        
        // Audit trail
        requestedBy: transferData.requestedBy,
        approvedBy: transferData.approvedBy,
        createdAt: timestamp,
        completedAt: timestamp,
        
        // Transaction metadata
        transactionId: session.id ? session.id.toString() : null
      };
      
      await transfersCollection.insertOne(transfer, { session });
      
      console.log(`Inventory transfer completed: ${transferData.quantity} units from ${transferData.sourceLocation} to ${transferData.destinationLocation}`);
      
      return {
        transferId: transferId,
        productId: transferData.productId,
        quantity: transferData.quantity,
        sourceLocation: transferData.sourceLocation,
        destinationLocation: transferData.destinationLocation,
        status: 'completed',
        completedAt: timestamp
      };
      
    }, {
      transactionType: 'inventory_transfer',
      maxRetries: 3
    });
  }

  async processRefundTransaction(refundData) {
    console.log('Processing refund transaction with ACID guarantees...');
    
    return await this.executeTransaction(async (session, db) => {
      const refundId = new ObjectId();
      const timestamp = new Date();
      
      const ordersCollection = db.collection('orders');
      const paymentsCollection = db.collection('payments');
      const inventoryCollection = db.collection('inventory');
      const refundsCollection = db.collection('refunds');
      
      // Validate original order and payment
      const order = await ordersCollection.findOne(
        { _id: new ObjectId(refundData.orderId) },
        { session }
      );
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      if (order.status === 'refunded') {
        throw new Error('Order already refunded');
      }
      
      const payment = await paymentsCollection.findOne(
        { orderId: new ObjectId(refundData.orderId) },
        { session }
      );
      
      if (!payment || payment.status !== 'authorized') {
        throw new Error('Payment not found or not in authorized state');
      }
      
      // Calculate refund amount
      const refundAmount = refundData.fullRefund ? order.totalAmount : refundData.amount;
      
      if (refundAmount > order.totalAmount) {
        throw new Error('Refund amount cannot exceed order total');
      }
      
      // Process inventory restoration if items are being refunded
      const inventoryUpdates = [];
      if (refundData.restoreInventory && refundData.itemsToRefund) {
        for (const refundItem of refundData.itemsToRefund) {
          const orderItem = order.items.find(item => 
            item.productId.toString() === refundItem.productId
          );
          
          if (!orderItem) {
            throw new Error(`Order item not found: ${refundItem.productId}`);
          }
          
          inventoryUpdates.push({
            updateOne: {
              filter: {
                productId: new ObjectId(refundItem.productId),
                locationId: 'main_warehouse'
              },
              update: {
                $inc: {
                  availableQuantity: refundItem.quantity,
                  reservedQuantity: -refundItem.quantity
                },
                $set: { updatedAt: timestamp }
              }
            }
          });
        }
        
        // Execute inventory restoration
        if (inventoryUpdates.length > 0) {
          await inventoryCollection.bulkWrite(inventoryUpdates, { session });
        }
      }
      
      // Create refund record
      const refund = {
        _id: refundId,
        orderId: new ObjectId(refundData.orderId),
        orderNumber: order.orderNumber,
        originalAmount: order.totalAmount,
        refundAmount: refundAmount,
        refundType: refundData.fullRefund ? 'full' : 'partial',
        reason: refundData.reason,
        
        // Processing details
        status: 'processing',
        paymentMethod: payment.paymentMethod,
        processorTransactionId: null,
        
        // Items being refunded
        itemsRefunded: refundData.itemsToRefund || [],
        inventoryRestored: refundData.restoreInventory || false,
        
        // Audit trail
        requestedBy: refundData.requestedBy,
        processedBy: refundData.processedBy,
        createdAt: timestamp,
        
        // Transaction metadata
        transactionId: session.id ? session.id.toString() : null
      };
      
      // Simulate refund processing
      if (refundData.testMode) {
        refund.status = 'completed';
        refund.processorTransactionId = `refund_${refundId}`;
        refund.processedAt = timestamp;
        refund.processorResponse = {
          status: 'refunded',
          refundRef: refund.processorTransactionId,
          processedAt: timestamp
        };
      }
      
      await refundsCollection.insertOne(refund, { session });
      
      // Update order status
      const newOrderStatus = refundData.fullRefund ? 'refunded' : 'partially_refunded';
      await ordersCollection.updateOne(
        { _id: new ObjectId(refundData.orderId) },
        {
          $set: {
            status: newOrderStatus,
            refundStatus: refund.status,
            refundAmount: refundAmount,
            refundedAt: timestamp,
            updatedAt: timestamp
          }
        },
        { session }
      );
      
      // Update payment record
      await paymentsCollection.updateOne(
        { orderId: new ObjectId(refundData.orderId) },
        {
          $set: {
            refundStatus: refund.status,
            refundAmount: refundAmount,
            refundedAt: timestamp,
            updatedAt: timestamp
          }
        },
        { session }
      );
      
      console.log(`Refund processed: ${refundAmount} for order ${order.orderNumber}`);
      
      return {
        refundId: refundId,
        orderId: refundData.orderId,
        refundAmount: refundAmount,
        status: refund.status,
        inventoryRestored: refund.inventoryRestored,
        processedAt: timestamp
      };
      
    }, {
      transactionType: 'refund_processing',
      maxRetries: 2
    });
  }

  // Utility methods for transaction management

  isRetryableError(error) {
    // MongoDB transient transaction errors that can be retried
    const retryableErrorCodes = [
      112, // WriteConflict
      117, // ConflictingOperationInProgress  
      251, // NoSuchTransaction
      244, // TransactionCoordinatorSteppingDown
      246, // TransactionCoordinatorReachedAbortDecision
    ];
    
    const retryableErrorLabels = [
      'TransientTransactionError',
      'UnknownTransactionCommitResult'
    ];
    
    return retryableErrorCodes.includes(error.code) ||
           retryableErrorLabels.some(label => error.errorLabels?.includes(label)) ||
           error.message.includes('WriteConflict') ||
           error.message.includes('TransientTransactionError');
  }

  async updateTransactionMetrics(status, executionTime, transactionType) {
    this.transactionMetrics.totalTransactions++;
    
    if (status === 'success') {
      this.transactionMetrics.successfulTransactions++;
    } else {
      this.transactionMetrics.failedTransactions++;
    }
    
    // Update average execution time
    const totalTime = this.transactionMetrics.averageTransactionTime * 
                      (this.transactionMetrics.totalTransactions - 1);
    this.transactionMetrics.averageTransactionTime = 
      (totalTime + executionTime) / this.transactionMetrics.totalTransactions;
    
    // Track transaction types
    if (transactionType) {
      const typeStats = this.transactionMetrics.transactionTypes.get(transactionType) || {
        count: 0,
        successCount: 0,
        failureCount: 0,
        averageTime: 0
      };
      
      typeStats.count++;
      if (status === 'success') {
        typeStats.successCount++;
      } else {
        typeStats.failureCount++;
      }
      
      typeStats.averageTime = ((typeStats.averageTime * (typeStats.count - 1)) + executionTime) / typeStats.count;
      
      this.transactionMetrics.transactionTypes.set(transactionType, typeStats);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getTransactionMetrics() {
    const successRate = this.transactionMetrics.totalTransactions > 0 ?
      (this.transactionMetrics.successfulTransactions / this.transactionMetrics.totalTransactions) * 100 : 0;
    
    return {
      totalTransactions: this.transactionMetrics.totalTransactions,
      successfulTransactions: this.transactionMetrics.successfulTransactions,
      failedTransactions: this.transactionMetrics.failedTransactions,
      successRate: Math.round(successRate * 100) / 100,
      averageTransactionTime: Math.round(this.transactionMetrics.averageTransactionTime),
      transactionTypes: Object.fromEntries(this.transactionMetrics.transactionTypes),
      sessionPoolSize: this.sessionPool.length,
      availableSessions: this.sessionPool.filter(s => !s.inUse).length
    };
  }

  async setupTransactionMonitoring() {
    console.log('Setting up transaction monitoring and analytics...');
    
    // Monitor transaction performance
    setInterval(async () => {
      const metrics = await this.getTransactionMetrics();
      console.log('Transaction Metrics:', metrics);
      
      // Store metrics to database for analysis
      if (this.database) {
        await this.database.collection('transaction_metrics').insertOne({
          ...metrics,
          timestamp: new Date()
        });
      }
    }, 60000); // Every minute
  }

  async closeTransactionManager() {
    console.log('Closing MongoDB Transaction Manager...');
    
    // End all sessions in pool
    for (const sessionWrapper of this.sessionPool) {
      try {
        await sessionWrapper.session.endSession();
      } catch (error) {
        console.error('Error ending session:', error);
      }
    }
    
    // Close MongoDB connection
    if (this.client) {
      await this.client.close();
    }
    
    console.log('Transaction Manager closed successfully');
  }
}

// Example usage demonstrating ACID transactions
async function demonstrateMongoDBTransactions() {
  const transactionManager = new MongoTransactionManager({
    uri: 'mongodb://localhost:27017',
    database: 'ecommerce_transactions',
    enableTransactionMonitoring: true
  });
  
  try {
    await transactionManager.initialize();
    
    // Demonstrate customer order processing with ACID guarantees
    const orderResult = await transactionManager.processCustomerOrder({
      customerId: '507f1f77bcf86cd799439011',
      items: [
        { productId: '507f1f77bcf86cd799439012', quantity: 2, unitPrice: 29.99 },
        { productId: '507f1f77bcf86cd799439013', quantity: 1, unitPrice: 149.99 }
      ],
      payment: {
        method: 'credit_card',
        processor: 'stripe',
        testMode: true
      },
      shipping: {
        method: 'standard',
        cost: 9.99,
        address: {
          street: '123 Main St',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101'
        }
      }
    });
    
    console.log('Order processing result:', orderResult);
    
    // Demonstrate inventory transfer with ACID consistency
    const transferResult = await transactionManager.processInventoryTransfer({
      productId: '507f1f77bcf86cd799439012',
      sourceLocation: 'warehouse_east',
      destinationLocation: 'warehouse_west',
      quantity: 50,
      transferType: 'rebalancing',
      reason: 'Regional demand adjustment',
      requestedBy: 'inventory_manager',
      approvedBy: 'operations_director'
    });
    
    console.log('Inventory transfer result:', transferResult);
    
    // Demonstrate refund processing with inventory restoration
    const refundResult = await transactionManager.processRefundTransaction({
      orderId: orderResult.result.orderId,
      fullRefund: false,
      amount: 59.98, // Refund for first item
      reason: 'Customer satisfaction',
      restoreInventory: true,
      itemsToRefund: [
        { productId: '507f1f77bcf86cd799439012', quantity: 2 }
      ],
      testMode: true,
      requestedBy: 'customer_service',
      processedBy: 'service_manager'
    });
    
    console.log('Refund processing result:', refundResult);
    
    // Get transaction performance metrics
    const metrics = await transactionManager.getTransactionMetrics();
    console.log('Transaction Performance Metrics:', metrics);
    
    return {
      orderResult,
      transferResult, 
      refundResult,
      metrics
    };
    
  } catch (error) {
    console.error('Transaction demonstration failed:', error);
    throw error;
  } finally {
    await transactionManager.closeTransactionManager();
  }
}

// Benefits of MongoDB ACID Transactions:
// - Native multi-document ACID compliance eliminates complex coordination logic
// - Distributed transaction support across replica sets and sharded clusters  
// - Automatic retry and recovery mechanisms for transient failures
// - Session-based transaction management with connection pooling optimization
// - Comprehensive transaction monitoring and performance analytics
// - Flexible transaction boundaries supporting complex business workflows
// - Integration with MongoDB's document model for rich transactional operations
// - Production-ready error handling with intelligent retry strategies

module.exports = {
  MongoTransactionManager,
  demonstrateMongoDBTransactions
};
```

## SQL-Style Transaction Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB transactions and ACID operations:

```sql
-- QueryLeaf MongoDB transactions with SQL-familiar ACID syntax

-- Configure transaction settings
SET transaction_isolation_level = 'read_committed';
SET transaction_timeout = '30 seconds';
SET enable_auto_retry = true;
SET max_retry_attempts = 3;
SET transaction_read_concern = 'majority';
SET transaction_write_concern = 'majority';

-- Begin transaction with explicit ACID properties
BEGIN TRANSACTION
    READ CONCERN MAJORITY
    WRITE CONCERN MAJORITY
    TIMEOUT 30000
    MAX_RETRY_ATTEMPTS 3;

-- Customer order processing with multi-collection ACID transaction
WITH order_transaction_context AS (
    -- Transaction metadata and configuration
    SELECT 
        GENERATE_UUID() as transaction_id,
        CURRENT_TIMESTAMP as transaction_start_time,
        'customer_order_processing' as transaction_type,
        JSON_OBJECT(
            'isolation_level', 'read_committed',
            'consistency_level', 'strong',
            'durability', 'guaranteed',
            'atomicity', 'all_or_nothing'
        ) as acid_properties
),

-- Step 1: Validate customer and inventory availability
order_validation AS (
    SELECT 
        c.customer_id,
        c.customer_email,
        c.customer_status,
        
        -- Order items validation with inventory checks
        ARRAY_AGG(
            JSON_OBJECT(
                'product_id', p.product_id,
                'product_sku', p.sku,
                'product_name', p.name,
                'requested_quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'available_inventory', i.available_quantity,
                'can_fulfill', CASE WHEN i.available_quantity >= oi.quantity THEN true ELSE false END,
                'line_total', oi.quantity * oi.unit_price
            )
        ) as order_items_validation,
        
        -- Aggregate order totals
        SUM(oi.quantity * oi.unit_price) as order_total,
        COUNT(*) as item_count,
        COUNT(*) FILTER (WHERE i.available_quantity >= oi.quantity) as fulfillable_items,
        
        -- Validation status
        CASE 
            WHEN c.customer_status != 'active' THEN 'customer_inactive'
            WHEN COUNT(*) != COUNT(*) FILTER (WHERE i.available_quantity >= oi.quantity) THEN 'insufficient_inventory'
            ELSE 'validated'
        END as validation_status
        
    FROM customers c
    CROSS JOIN (
        SELECT 
            'product_uuid_1' as product_id, 2 as quantity, 29.99 as unit_price
        UNION ALL
        SELECT 
            'product_uuid_2' as product_id, 1 as quantity, 149.99 as unit_price
    ) oi
    JOIN products p ON p.product_id = oi.product_id
    JOIN inventory i ON i.product_id = oi.product_id AND i.location_id = 'main_warehouse'
    WHERE c.customer_id = 'customer_uuid_123'
    GROUP BY c.customer_id, c.customer_email, c.customer_status
),

-- Step 2: Reserve inventory atomically (within transaction)  
inventory_reservations AS (
    UPDATE inventory 
    SET 
        available_quantity = available_quantity - reservation_info.quantity,
        reserved_quantity = reserved_quantity + reservation_info.quantity,
        updated_at = CURRENT_TIMESTAMP,
        last_reservation_id = otc.transaction_id
    FROM (
        SELECT 
            json_array_elements(ov.order_items_validation)->>'product_id' as product_id,
            (json_array_elements(ov.order_items_validation)->>'requested_quantity')::INTEGER as quantity
        FROM order_validation ov
        CROSS JOIN order_transaction_context otc
        WHERE ov.validation_status = 'validated'
    ) reservation_info,
    order_transaction_context otc
    WHERE inventory.product_id = reservation_info.product_id
    AND inventory.location_id = 'main_warehouse'
    AND inventory.available_quantity >= reservation_info.quantity
    RETURNING 
        product_id,
        available_quantity as new_available_quantity,
        reserved_quantity as new_reserved_quantity,
        'reserved' as reservation_status
),

-- Step 3: Process payment authorization (simulated within transaction)
payment_processing AS (
    INSERT INTO payments (
        payment_id,
        transaction_id,  
        order_amount,
        payment_method,
        payment_processor,
        payment_status,
        authorization_code,
        processed_at,
        
        -- ACID transaction metadata
        transaction_isolation_level,
        transaction_consistency_guarantee,
        created_within_transaction
    )
    SELECT 
        GENERATE_UUID() as payment_id,
        otc.transaction_id,
        ov.order_total,
        'credit_card' as payment_method,
        'stripe' as payment_processor,
        'authorized' as payment_status,
        'AUTH_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) as authorization_code,
        CURRENT_TIMESTAMP as processed_at,
        
        -- Transaction ACID properties
        'read_committed' as transaction_isolation_level,
        'strong_consistency' as transaction_consistency_guarantee,
        true as created_within_transaction
        
    FROM order_validation ov
    CROSS JOIN order_transaction_context otc
    WHERE ov.validation_status = 'validated'
    RETURNING payment_id, payment_status, authorization_code
),

-- Step 4: Create order with full ACID compliance
order_creation AS (
    INSERT INTO orders (
        order_id,
        transaction_id,
        customer_id,
        order_number,
        order_status,
        
        -- Order details
        items,
        item_count,
        total_amount,
        
        -- Payment information
        payment_id,
        payment_method,
        payment_status,
        
        -- Inventory status
        inventory_reserved,
        reservation_expiry,
        
        -- Transaction metadata  
        created_within_transaction,
        transaction_isolation_level,
        acid_compliance_verified,
        
        -- Timestamps
        created_at,
        updated_at
    )
    SELECT 
        GENERATE_UUID() as order_id,
        otc.transaction_id,
        ov.customer_id,
        'ORD-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || 
            LPAD(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER % 10000, 4, '0') as order_number,
        'confirmed' as order_status,
        
        -- Order items with reservation confirmation
        JSON_AGG(
            JSON_OBJECT(
                'product_id', (json_array_elements(ov.order_items_validation)->>'product_id'),
                'quantity', (json_array_elements(ov.order_items_validation)->>'requested_quantity')::INTEGER,
                'unit_price', (json_array_elements(ov.order_items_validation)->>'unit_price')::DECIMAL,
                'line_total', (json_array_elements(ov.order_items_validation)->>'line_total')::DECIMAL,
                'inventory_reserved', true,
                'reservation_confirmed', EXISTS(
                    SELECT 1 FROM inventory_reservations ir 
                    WHERE ir.product_id = json_array_elements(ov.order_items_validation)->>'product_id'
                )
            )
        ) as items,
        ov.item_count,
        ov.order_total,
        
        pp.payment_id,
        'credit_card' as payment_method,
        pp.payment_status,
        
        true as inventory_reserved,
        CURRENT_TIMESTAMP + INTERVAL '15 minutes' as reservation_expiry,
        
        -- ACID transaction verification
        true as created_within_transaction,
        'read_committed' as transaction_isolation_level,
        true as acid_compliance_verified,
        
        CURRENT_TIMESTAMP as created_at,
        CURRENT_TIMESTAMP as updated_at
        
    FROM order_validation ov
    CROSS JOIN order_transaction_context otc
    CROSS JOIN payment_processing pp
    WHERE ov.validation_status = 'validated'
    GROUP BY otc.transaction_id, ov.customer_id, ov.item_count, ov.order_total, 
             pp.payment_id, pp.payment_status
    RETURNING order_id, order_number, order_status, total_amount
),

-- Step 5: Update customer statistics (within same transaction)
customer_statistics_update AS (
    UPDATE customers 
    SET 
        total_orders = total_orders + 1,
        total_spent = total_spent + oc.total_amount,
        last_order_date = CURRENT_TIMESTAMP,
        last_order_amount = oc.total_amount,
        updated_at = CURRENT_TIMESTAMP,
        
        -- Transaction audit trail
        last_transaction_id = otc.transaction_id,
        updated_within_transaction = true
        
    FROM order_creation oc
    CROSS JOIN order_transaction_context otc
    WHERE customers.customer_id = (
        SELECT customer_id FROM order_validation WHERE validation_status = 'validated'
    )
    RETURNING customer_id, total_orders, total_spent, last_order_date
),

-- Final transaction result compilation
transaction_result AS (
    SELECT 
        otc.transaction_id,
        otc.transaction_type,
        'committed' as transaction_status,
        
        -- Order details
        oc.order_id,
        oc.order_number,
        oc.order_status,
        oc.total_amount,
        
        -- Payment confirmation
        pp.payment_id,
        pp.payment_status,
        pp.authorization_code,
        
        -- Inventory confirmation
        ARRAY_AGG(
            JSON_OBJECT(
                'product_id', ir.product_id,
                'reservation_status', ir.reservation_status,
                'available_quantity', ir.new_available_quantity,
                'reserved_quantity', ir.new_reserved_quantity
            )
        ) as inventory_reservations,
        
        -- Customer update confirmation
        csu.total_orders as customer_total_orders,
        csu.total_spent as customer_total_spent,
        
        -- ACID compliance verification
        JSON_OBJECT(
            'atomicity', 'all_operations_committed',
            'consistency', 'business_rules_enforced', 
            'isolation', 'read_committed_maintained',
            'durability', 'changes_persisted'
        ) as acid_verification,
        
        -- Performance metrics
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - otc.transaction_start_time)) * 1000 as transaction_duration_ms,
        COUNT(DISTINCT ir.product_id) as items_reserved,
        
        -- Transaction metadata
        CURRENT_TIMESTAMP as transaction_committed_at,
        true as transaction_successful
        
    FROM order_transaction_context otc
    CROSS JOIN order_creation oc
    CROSS JOIN payment_processing pp
    LEFT JOIN inventory_reservations ir ON true
    LEFT JOIN customer_statistics_update csu ON true
    GROUP BY otc.transaction_id, otc.transaction_type, otc.transaction_start_time,
             oc.order_id, oc.order_number, oc.order_status, oc.total_amount,
             pp.payment_id, pp.payment_status, pp.authorization_code,
             csu.total_orders, csu.total_spent
)

-- Return comprehensive transaction result
SELECT 
    tr.transaction_id,
    tr.transaction_status,
    tr.order_id,
    tr.order_number,
    tr.total_amount,
    tr.payment_status,
    tr.inventory_reservations,
    tr.acid_verification,
    tr.transaction_duration_ms || 'ms' as execution_time,
    tr.transaction_successful,
    
    -- Success confirmation message
    CASE 
        WHEN tr.transaction_successful THEN 
            'Order ' || tr.order_number || ' processed successfully with ACID guarantees: ' ||
            tr.items_reserved || ' items reserved, payment ' || tr.payment_status ||
            ', customer statistics updated'
        ELSE 'Transaction failed - all changes rolled back'
    END as result_summary

FROM transaction_result tr;

-- Commit transaction with durability guarantee
COMMIT TRANSACTION 
    WITH DURABILITY_GUARANTEE = 'majority_acknowledged'
    AND CONSISTENCY_CHECK = 'business_rules_validated';

-- Transaction performance and ACID compliance monitoring
WITH transaction_performance_analysis AS (
    SELECT 
        transaction_type,
        DATE_TRUNC('hour', transaction_committed_at) as hour_bucket,
        
        -- Performance metrics
        COUNT(*) as transaction_count,
        AVG(transaction_duration_ms) as avg_duration_ms,
        MAX(transaction_duration_ms) as max_duration_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY transaction_duration_ms) as p95_duration_ms,
        
        -- Success and failure rates
        COUNT(*) FILTER (WHERE transaction_successful = true) as successful_transactions,
        COUNT(*) FILTER (WHERE transaction_successful = false) as failed_transactions,
        ROUND(
            COUNT(*) FILTER (WHERE transaction_successful = true)::DECIMAL / COUNT(*) * 100, 
            2
        ) as success_rate_percent,
        
        -- ACID compliance metrics
        COUNT(*) FILTER (WHERE acid_verification->>'atomicity' = 'all_operations_committed') as atomic_transactions,
        COUNT(*) FILTER (WHERE acid_verification->>'consistency' = 'business_rules_enforced') as consistent_transactions,
        COUNT(*) FILTER (WHERE acid_verification->>'isolation' = 'read_committed_maintained') as isolated_transactions,
        COUNT(*) FILTER (WHERE acid_verification->>'durability' = 'changes_persisted') as durable_transactions,
        
        -- Resource utilization analysis
        AVG(items_reserved) as avg_items_per_transaction,
        SUM(total_amount) as total_transaction_value
        
    FROM transaction_results_log
    WHERE transaction_committed_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    GROUP BY transaction_type, DATE_TRUNC('hour', transaction_committed_at)
),

-- ACID compliance assessment
acid_compliance_assessment AS (
    SELECT 
        tpa.transaction_type,
        tpa.hour_bucket,
        tpa.transaction_count,
        
        -- Performance assessment
        CASE 
            WHEN tpa.avg_duration_ms < 100 THEN 'excellent'
            WHEN tpa.avg_duration_ms < 500 THEN 'good' 
            WHEN tpa.avg_duration_ms < 1000 THEN 'acceptable'
            ELSE 'needs_optimization'
        END as performance_rating,
        
        -- ACID compliance scoring
        ROUND(
            (tpa.atomic_transactions + tpa.consistent_transactions + 
             tpa.isolated_transactions + tpa.durable_transactions)::DECIMAL / 
            (tpa.transaction_count * 4) * 100, 
            2
        ) as acid_compliance_score,
        
        -- Reliability assessment
        CASE 
            WHEN tpa.success_rate_percent >= 99.9 THEN 'highly_reliable'
            WHEN tpa.success_rate_percent >= 99.0 THEN 'reliable'
            WHEN tpa.success_rate_percent >= 95.0 THEN 'acceptable'
            ELSE 'needs_improvement'
        END as reliability_rating,
        
        -- Throughput analysis
        ROUND(tpa.transaction_count / 3600.0, 2) as transactions_per_second,
        ROUND(tpa.total_transaction_value / tpa.transaction_count, 2) as avg_transaction_value,
        
        -- Optimization recommendations
        CASE 
            WHEN tpa.avg_duration_ms > 1000 THEN 'Optimize transaction logic and reduce operation count'
            WHEN tpa.success_rate_percent < 95 THEN 'Investigate failure patterns and improve error handling'
            WHEN tpa.p95_duration_ms > tpa.avg_duration_ms * 3 THEN 'Address performance outliers and resource contention'
            ELSE 'Transaction performance within acceptable parameters'
        END as optimization_recommendation
        
    FROM transaction_performance_analysis tpa
)

-- Comprehensive transaction monitoring dashboard
SELECT 
    aca.transaction_type,
    TO_CHAR(aca.hour_bucket, 'YYYY-MM-DD HH24:00') as analysis_period,
    aca.transaction_count,
    
    -- Performance metrics
    ROUND(tpa.avg_duration_ms, 2) || 'ms' as avg_execution_time,
    ROUND(tpa.p95_duration_ms, 2) || 'ms' as p95_execution_time,
    aca.performance_rating,
    aca.transactions_per_second || '/sec' as throughput,
    
    -- ACID compliance status
    aca.acid_compliance_score || '%' as acid_compliance,
    CASE 
        WHEN aca.acid_compliance_score >= 99.9 THEN 'Full ACID Compliance'
        WHEN aca.acid_compliance_score >= 99.0 THEN 'High ACID Compliance'
        WHEN aca.acid_compliance_score >= 95.0 THEN 'Acceptable ACID Compliance'
        ELSE 'ACID Compliance Issues Detected'
    END as compliance_status,
    
    -- Reliability metrics
    tpa.success_rate_percent || '%' as success_rate,
    aca.reliability_rating,
    tpa.failed_transactions as failure_count,
    
    -- Business impact
    '$' || ROUND(aca.avg_transaction_value, 2) as avg_transaction_value,
    '$' || ROUND(tpa.total_transaction_value, 2) as total_value_processed,
    
    -- Operational guidance
    aca.optimization_recommendation,
    
    -- System health indicators
    CASE 
        WHEN aca.performance_rating = 'excellent' AND aca.reliability_rating = 'highly_reliable' THEN 'optimal'
        WHEN aca.performance_rating IN ('excellent', 'good') AND aca.reliability_rating IN ('highly_reliable', 'reliable') THEN 'healthy'
        WHEN aca.performance_rating = 'acceptable' OR aca.reliability_rating = 'acceptable' THEN 'monitoring_required'
        ELSE 'attention_required'
    END as system_health,
    
    -- Next steps
    CASE 
        WHEN aca.performance_rating = 'needs_optimization' THEN 'Immediate performance tuning required'
        WHEN aca.reliability_rating = 'needs_improvement' THEN 'Investigate and resolve reliability issues'
        WHEN aca.acid_compliance_score < 99 THEN 'Review ACID compliance implementation'
        ELSE 'Continue monitoring and maintain current configuration'
    END as recommended_actions

FROM acid_compliance_assessment aca
JOIN transaction_performance_analysis tpa ON 
    aca.transaction_type = tpa.transaction_type AND 
    aca.hour_bucket = tpa.hour_bucket
ORDER BY aca.hour_bucket DESC, aca.transaction_count DESC;

-- QueryLeaf provides comprehensive MongoDB transaction capabilities:
-- 1. SQL-familiar ACID transaction syntax with explicit isolation levels and consistency guarantees
-- 2. Multi-document operations with atomic commit/rollback across collections
-- 3. Automatic retry mechanisms with configurable backoff strategies for transient failures
-- 4. Comprehensive transaction monitoring with performance and compliance analytics
-- 5. Session management and connection pooling optimization for transaction performance
-- 6. Distributed transaction coordination across replica sets and sharded clusters
-- 7. Business logic integration with transaction boundaries and error handling
-- 8. SQL-style transaction control statements (BEGIN, COMMIT, ROLLBACK) for familiar workflow
-- 9. Advanced analytics for transaction performance tuning and ACID compliance verification
-- 10. Enterprise-grade transaction management with monitoring and operational insights
```

## Best Practices for MongoDB Transaction Implementation

### ACID Compliance and Performance Optimization

Essential practices for implementing MongoDB transactions effectively:

1. **Transaction Boundaries**: Design clear transaction boundaries that encompass related operations while minimizing transaction duration
2. **Error Handling Strategy**: Implement comprehensive retry logic for transient failures and proper rollback procedures for business logic errors  
3. **Performance Considerations**: Optimize transactions for minimal lock contention and efficient resource utilization
4. **Session Management**: Use connection pooling and session management to optimize transaction performance across concurrent operations
5. **Monitoring and Analytics**: Establish comprehensive monitoring for transaction success rates, performance, and ACID compliance verification
6. **Testing Strategies**: Implement thorough testing of transaction boundaries, failure scenarios, and recovery procedures

### Production Deployment and Scalability

Key considerations for enterprise MongoDB transaction deployments:

1. **Replica Set Configuration**: Ensure proper replica set deployment with sufficient nodes for transaction availability and performance
2. **Distributed Transactions**: Design transaction patterns that work efficiently across sharded MongoDB clusters
3. **Resource Planning**: Plan for transaction resource requirements including memory, CPU, and network overhead
4. **Backup and Recovery**: Implement backup strategies that account for transaction consistency and point-in-time recovery
5. **Security Implementation**: Secure transaction operations with proper authentication, authorization, and audit logging
6. **Operational Procedures**: Create standardized procedures for transaction monitoring, troubleshooting, and performance tuning

## Conclusion

MongoDB transactions provide comprehensive ACID properties with multi-document operations, distributed consistency guarantees, and intelligent session management designed for modern applications requiring strong consistency across complex business operations. The native transaction support eliminates the complexity of manual coordination while providing enterprise-grade reliability and performance for distributed systems.

Key MongoDB transaction benefits include:

- **Complete ACID Compliance**: Full atomicity, consistency, isolation, and durability guarantees across multi-document operations
- **Distributed Consistency**: Native support for transactions across replica sets and sharded clusters with automatic coordination
- **Intelligent Retry Logic**: Built-in retry mechanisms for transient failures with configurable backoff strategies
- **Session Management**: Optimized session pooling and connection management for transaction performance
- **Comprehensive Monitoring**: Real-time transaction performance analytics and ACID compliance verification
- **SQL Compatibility**: Familiar transaction management patterns accessible through SQL-style operations

Whether you're building financial applications, e-commerce platforms, inventory management systems, or any application requiring strong consistency guarantees, MongoDB transactions with QueryLeaf's SQL-familiar interface provide the foundation for reliable, scalable, and maintainable transactional operations.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB transactions while providing SQL-familiar syntax for transaction management and monitoring. Advanced ACID patterns, error handling strategies, and performance optimization techniques are seamlessly accessible through familiar SQL constructs, making sophisticated transaction management both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's robust ACID transaction capabilities with familiar SQL-style transaction management makes it an ideal platform for applications that require both strong consistency guarantees and familiar development patterns, ensuring your transactional operations maintain data integrity while scaling efficiently across distributed environments.