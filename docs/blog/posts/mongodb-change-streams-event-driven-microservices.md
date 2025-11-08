---
title: "MongoDB Change Streams for Event-Driven Microservices: Real-Time Data Processing and Distributed System Architecture"
description: "Master MongoDB Change Streams for building event-driven microservices architectures. Learn real-time data synchronization, event processing pipelines, and distributed system patterns with SQL-familiar stream processing syntax."
date: 2025-11-07
tags: [mongodb, change-streams, event-driven, microservices, real-time, data-streams, distributed-systems, sql]
---

# MongoDB Change Streams for Event-Driven Microservices: Real-Time Data Processing and Distributed System Architecture

Modern distributed applications require sophisticated event-driven architectures that can react to data changes in real-time, maintain consistency across microservices, and process streaming data with minimal latency. Traditional database approaches struggle to provide efficient change detection, often requiring complex polling mechanisms, external message brokers, or custom trigger implementations that introduce significant overhead and operational complexity.

MongoDB Change Streams provide native, real-time change detection capabilities that enable applications to reactively process database modifications with millisecond latency. Unlike traditional approaches that require periodic polling or complex event sourcing implementations, Change Streams deliver ordered, resumable streams of database changes that integrate seamlessly with microservices architectures and event-driven patterns.

## The Traditional Change Detection Challenge

Conventional approaches to detecting and reacting to database changes have significant limitations for modern applications:

```sql
-- Traditional PostgreSQL change detection - complex and resource-intensive

-- Polling-based approach with timestamps
CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    order_status VARCHAR(50) DEFAULT 'pending',
    total_amount DECIMAL(10,2) NOT NULL,
    items JSONB NOT NULL,
    shipping_address JSONB NOT NULL,
    payment_info JSONB,
    
    -- Tracking fields for change detection
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    
    -- Change tracking
    last_processed_at TIMESTAMP,
    change_events TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Indexes for polling queries
    INDEX idx_orders_updated_at (updated_at),
    INDEX idx_orders_status_updated (order_status, updated_at),
    INDEX idx_orders_processing (last_processed_at, updated_at)
);

-- Trigger-based change tracking (complex maintenance)
CREATE TABLE order_change_log (
    log_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id),
    change_type VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    processing_attempts INTEGER DEFAULT 0,
    
    INDEX idx_change_log_processing (processed, changed_at),
    INDEX idx_change_log_order (order_id, changed_at)
);

-- Complex trigger function for change tracking
CREATE OR REPLACE FUNCTION track_order_changes()
RETURNS TRIGGER AS $$
DECLARE
    old_json JSONB;
    new_json JSONB;
    changed_fields TEXT[] := ARRAY[]::TEXT[];
    field_name TEXT;
BEGIN
    -- Handle different operation types
    IF TG_OP = 'DELETE' THEN
        INSERT INTO order_change_log (order_id, change_type, old_values)
        VALUES (OLD.order_id, 'DELETE', to_jsonb(OLD));
        
        RETURN OLD;
    END IF;
    
    IF TG_OP = 'INSERT' THEN
        INSERT INTO order_change_log (order_id, change_type, new_values)
        VALUES (NEW.order_id, 'INSERT', to_jsonb(NEW));
        
        RETURN NEW;
    END IF;
    
    -- UPDATE operation - detect changed fields
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);
    
    -- Compare each field
    FOR field_name IN 
        SELECT DISTINCT key 
        FROM jsonb_each(old_json) 
        UNION 
        SELECT DISTINCT key 
        FROM jsonb_each(new_json)
    LOOP
        IF old_json->field_name != new_json->field_name OR 
           (old_json->field_name IS NULL) != (new_json->field_name IS NULL) THEN
            changed_fields := array_append(changed_fields, field_name);
        END IF;
    END LOOP;
    
    -- Only log if fields actually changed
    IF array_length(changed_fields, 1) > 0 THEN
        INSERT INTO order_change_log (
            order_id, change_type, old_values, new_values, changed_fields
        ) VALUES (
            NEW.order_id, 'UPDATE', old_json, new_json, changed_fields
        );
        
        -- Update version and tracking fields
        NEW.updated_at := CURRENT_TIMESTAMP;
        NEW.version := OLD.version + 1;
        NEW.change_events := array_append(OLD.change_events, 
            'updated_' || array_to_string(changed_fields, ',') || '_at_' || 
            extract(epoch from CURRENT_TIMESTAMP)::text
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers (high overhead on write operations)
CREATE TRIGGER orders_change_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION track_order_changes();

-- Application polling logic (inefficient and high-latency)
WITH pending_changes AS (
    SELECT 
        ocl.*,
        o.order_status,
        o.customer_id,
        o.total_amount,
        
        -- Determine change significance
        CASE 
            WHEN 'order_status' = ANY(ocl.changed_fields) THEN 'high'
            WHEN 'total_amount' = ANY(ocl.changed_fields) THEN 'medium'
            WHEN 'items' = ANY(ocl.changed_fields) THEN 'medium'
            ELSE 'low'
        END as change_priority,
        
        -- Calculate processing delay
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ocl.changed_at)) as delay_seconds
        
    FROM order_change_log ocl
    JOIN orders o ON ocl.order_id = o.order_id
    WHERE 
        ocl.processed = FALSE
        AND ocl.processing_attempts < 3
        AND ocl.changed_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
),
prioritized_changes AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY order_id 
            ORDER BY changed_at DESC
        ) as change_sequence,
        
        -- Batch processing grouping
        CASE change_priority
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2  
            ELSE 3
        END as processing_batch
        
    FROM pending_changes
)
SELECT 
    pc.log_id,
    pc.order_id,
    pc.change_type,
    pc.changed_fields,
    pc.old_values,
    pc.new_values,
    pc.change_priority,
    pc.delay_seconds,
    pc.processing_batch,
    
    -- Processing metadata
    CASE 
        WHEN pc.delay_seconds > 300 THEN 'DELAYED'
        WHEN pc.processing_attempts > 0 THEN 'RETRY'
        ELSE 'READY'
    END as processing_status,
    
    -- Related order context
    pc.order_status,
    pc.customer_id,
    pc.total_amount

FROM prioritized_changes pc
WHERE 
    pc.change_sequence = 1 -- Only latest change per order
    AND (
        pc.change_priority = 'high' 
        OR (pc.change_priority = 'medium' AND pc.delay_seconds < 60)
        OR (pc.change_priority = 'low' AND pc.delay_seconds < 300)
    )
ORDER BY 
    pc.processing_batch,
    pc.changed_at ASC
LIMIT 100;

-- Problems with traditional change detection:
-- 1. High overhead from triggers on every write operation
-- 2. Complex polling logic with high latency and resource usage  
-- 3. Risk of missing changes during application downtime
-- 4. Difficult to scale across multiple application instances
-- 5. No guaranteed delivery or ordering of change events
-- 6. Complex state management for processed vs unprocessed changes
-- 7. Performance degradation with high-volume write workloads
-- 8. Backup and restore complications with change log tables
-- 9. Cross-database change coordination challenges
-- 10. Limited filtering and transformation capabilities

-- MySQL change detection (even more limited)
CREATE TABLE mysql_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    status VARCHAR(50),
    amount DECIMAL(10,2),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX(updated_at)
);

-- Basic polling approach (no trigger support in standard MySQL)
SELECT 
    id, status, amount, updated_at,
    UNIX_TIMESTAMP() - UNIX_TIMESTAMP(updated_at) as age_seconds
FROM mysql_orders
WHERE updated_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
ORDER BY updated_at DESC
LIMIT 1000;

-- MySQL limitations:
-- - No comprehensive trigger system for change tracking
-- - Limited JSON functionality for change metadata
-- - Basic polling only - no streaming capabilities
-- - Poor performance with high-volume change detection
-- - No built-in change stream or event sourcing support
-- - Complex custom implementation required for real-time processing
-- - Limited scalability for distributed architectures
```

MongoDB Change Streams provide powerful, real-time change detection with minimal overhead:

```javascript
// MongoDB Change Streams - native real-time change processing
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('ecommerce');

// Comprehensive order management with change stream support
const setupOrderManagement = async () => {
  const orders = db.collection('orders');
  
  // Create sample order document structure
  const orderDocument = {
    _id: new ObjectId(),
    customerId: new ObjectId("64a1b2c3d4e5f6789012347a"),
    
    // Order details
    orderNumber: "ORD-2024-001234",
    status: "pending", // pending, confirmed, processing, shipped, delivered, cancelled
    
    // Financial information
    financial: {
      subtotal: 299.99,
      tax: 24.00,
      shipping: 15.99,
      discount: 25.00,
      total: 314.98,
      currency: "USD"
    },
    
    // Items with detailed tracking
    items: [
      {
        productId: new ObjectId("64b2c3d4e5f6789012347b1a"),
        sku: "LAPTOP-PRO-2024",
        name: "Professional Laptop 2024",
        quantity: 1,
        unitPrice: 1299.99,
        totalPrice: 1299.99,
        
        // Item-level tracking
        status: "pending", // pending, reserved, picked, shipped
        warehouse: "WEST-01",
        trackingNumber: null
      },
      {
        productId: new ObjectId("64b2c3d4e5f6789012347b1b"), 
        sku: "MOUSE-WIRELESS-PREMIUM",
        name: "Premium Wireless Mouse",
        quantity: 2,
        unitPrice: 79.99,
        totalPrice: 159.98,
        status: "pending",
        warehouse: "WEST-01",
        trackingNumber: null
      }
    ],
    
    // Customer information
    customer: {
      customerId: new ObjectId("64a1b2c3d4e5f6789012347a"),
      email: "customer@example.com",
      name: "John Smith",
      phone: "+1-555-0123",
      loyaltyTier: "gold"
    },
    
    // Shipping details
    shipping: {
      method: "standard", // standard, express, overnight
      carrier: "FedEx",
      trackingNumber: null,
      
      address: {
        street: "123 Main Street",
        unit: "Apt 4B", 
        city: "San Francisco",
        state: "CA",
        country: "USA",
        postalCode: "94105",
        
        // Geospatial data for logistics
        coordinates: {
          type: "Point",
          coordinates: [-122.3937, 37.7955]
        }
      },
      
      // Delivery preferences
      preferences: {
        signatureRequired: true,
        leaveAtDoor: false,
        deliveryInstructions: "Ring doorbell, apartment entrance on left side",
        preferredTimeWindow: "9AM-12PM"
      }
    },
    
    // Payment information
    payment: {
      method: "credit_card", // credit_card, paypal, apple_pay, etc.
      status: "pending", // pending, authorized, captured, failed, refunded
      transactionId: null,
      
      // Payment processor details (sensitive data encrypted/redacted)
      processor: {
        name: "stripe",
        paymentIntentId: "pi_1234567890abcdef",
        chargeId: null,
        receiptUrl: null
      },
      
      // Billing address
      billingAddress: {
        street: "123 Main Street", 
        city: "San Francisco",
        state: "CA",
        country: "USA",
        postalCode: "94105"
      }
    },
    
    // Fulfillment tracking
    fulfillment: {
      warehouseId: "WEST-01",
      assignedAt: null,
      pickedAt: null,
      packedAt: null,
      shippedAt: null,
      deliveredAt: null,
      
      // Fulfillment team
      assignedTo: {
        pickerId: null,
        packerId: null
      },
      
      // Special handling
      specialInstructions: [],
      requiresSignature: true,
      isFragile: false,
      isGift: false
    },
    
    // Analytics and tracking
    analytics: {
      source: "web", // web, mobile, api, phone
      campaign: "summer_sale_2024",
      referrer: "google_ads",
      sessionId: "sess_abc123def456",
      
      // Customer journey
      customerJourney: [
        {
          event: "product_view",
          productId: new ObjectId("64b2c3d4e5f6789012347b1a"),
          timestamp: new Date("2024-11-07T14:15:00Z")
        },
        {
          event: "add_to_cart", 
          productId: new ObjectId("64b2c3d4e5f6789012347b1a"),
          timestamp: new Date("2024-11-07T14:18:00Z")
        },
        {
          event: "checkout_initiated",
          timestamp: new Date("2024-11-07T14:25:00Z")
        }
      ]
    },
    
    // Communication history
    communications: [
      {
        type: "email",
        subject: "Order Confirmation",
        sentAt: new Date("2024-11-07T14:30:00Z"),
        status: "sent",
        templateId: "order_confirmation_v2"
      }
    ],
    
    // Audit trail
    audit: {
      createdAt: new Date("2024-11-07T14:30:00Z"),
      createdBy: "system",
      updatedAt: new Date("2024-11-07T14:30:00Z"),
      updatedBy: "system",
      version: 1,
      
      // Change history for compliance
      changes: []
    },
    
    // System metadata
    metadata: {
      environment: "production",
      region: "us-west-1",
      tenantId: "tenant_123",
      
      // Feature flags
      features: {
        realTimeTracking: true,
        smsNotifications: true,
        expressDelivery: false
      }
    }
  };
  
  // Insert sample order
  await orders.insertOne(orderDocument);
  
  // Create indexes for change stream performance
  await orders.createIndex({ status: 1, "audit.updatedAt": 1 });
  await orders.createIndex({ customerId: 1, "audit.createdAt": -1 });
  await orders.createIndex({ "items.status": 1 });
  await orders.createIndex({ "payment.status": 1 });
  await orders.createIndex({ "shipping.trackingNumber": 1 });
  
  console.log('Order management setup completed');
  return orders;
};

// Advanced Change Stream processing for event-driven architecture
class OrderEventProcessor {
  constructor(db) {
    this.db = db;
    this.orders = db.collection('orders');
    this.eventHandlers = new Map();
    this.changeStream = null;
    this.resumeToken = null;
    this.processedEvents = new Set();
    
    // Event processing statistics
    this.stats = {
      eventsProcessed: 0,
      eventsSkipped: 0,
      processingErrors: 0,
      lastProcessedAt: null
    };
  }

  async startChangeStreamProcessing() {
    console.log('Starting MongoDB Change Stream processing...');
    
    // Configure change stream with comprehensive options
    const changeStreamOptions = {
      // Pipeline to filter relevant changes
      pipeline: [
        {
          // Only process specific operation types
          $match: {
            operationType: { $in: ['insert', 'update', 'delete', 'replace'] }
          }
        },
        {
          // Add additional metadata for processing
          $addFields: {
            // Extract key fields for quick processing decisions
            documentKey: '$documentKey',
            changeType: '$operationType',
            changedFields: { $objectToArray: '$updateDescription.updatedFields' },
            removedFields: '$updateDescription.removedFields',
            
            // Processing metadata
            processingPriority: {
              $switch: {
                branches: [
                  // High priority changes
                  {
                    case: {
                      $or: [
                        { $eq: ['$operationType', 'insert'] },
                        { $eq: ['$operationType', 'delete'] },
                        {
                          $anyElementTrue: {
                            $map: {
                              input: '$updateDescription.updatedFields',
                              in: {
                                $regexMatch: {
                                  input: '$$this.k',
                                  regex: '^(status|payment\\.status|fulfillment\\.).*'
                                }
                              }
                            }
                          }
                        }
                      ]
                    },
                    then: 'high'
                  },
                  // Medium priority changes
                  {
                    case: {
                      $anyElementTrue: {
                        $map: {
                          input: '$updateDescription.updatedFields', 
                          in: {
                            $regexMatch: {
                              input: '$$this.k',
                              regex: '^(items\\.|shipping\\.|customer\\.).*'
                            }
                          }
                        }
                      }
                    },
                    then: 'medium'
                  }
                ],
                default: 'low'
              }
            }
          }
        }
      ],
      
      // Change stream configuration
      fullDocument: 'updateLookup', // Always include full document
      fullDocumentBeforeChange: 'whenAvailable', // Include pre-change document when available
      maxAwaitTimeMS: 1000, // Maximum wait time for new changes
      batchSize: 100, // Process changes in batches
      
      // Resume from stored token if available
      startAfter: this.resumeToken
    };
    
    try {
      // Create change stream on orders collection
      this.changeStream = this.orders.watch(changeStreamOptions);
      
      console.log('Change stream established - listening for events...');
      
      // Process change events asynchronously
      for await (const change of this.changeStream) {
        try {
          await this.processChangeEvent(change);
          
          // Store resume token for recovery
          this.resumeToken = change._id;
          
          // Update statistics
          this.stats.eventsProcessed++;
          this.stats.lastProcessedAt = new Date();
          
        } catch (error) {
          console.error('Error processing change event:', error);
          this.stats.processingErrors++;
          
          // Implement retry logic or dead letter queue here
          await this.handleProcessingError(change, error);
        }
      }
      
    } catch (error) {
      console.error('Change stream error:', error);
      
      // Implement reconnection logic
      await this.handleChangeStreamError(error);
    }
  }

  async processChangeEvent(change) {
    const { operationType, fullDocument, documentKey, updateDescription } = change;
    const orderId = documentKey._id;
    
    console.log(`Processing ${operationType} event for order ${orderId}`);
    
    // Prevent duplicate processing
    const eventId = `${orderId}_${change._id.toString()}`;
    if (this.processedEvents.has(eventId)) {
      console.log(`Skipping duplicate event: ${eventId}`);
      this.stats.eventsSkipped++;
      return;
    }
    
    // Add to processed events (with TTL cleanup)
    this.processedEvents.add(eventId);
    setTimeout(() => this.processedEvents.delete(eventId), 300000); // 5 minute TTL
    
    // Route event based on operation type and changed fields
    switch (operationType) {
      case 'insert':
        await this.handleOrderCreated(fullDocument);
        break;
        
      case 'update':
        await this.handleOrderUpdated(fullDocument, updateDescription, change.fullDocumentBeforeChange);
        break;
        
      case 'delete':
        await this.handleOrderDeleted(documentKey);
        break;
        
      case 'replace':
        await this.handleOrderReplaced(fullDocument, change.fullDocumentBeforeChange);
        break;
        
      default:
        console.warn(`Unhandled operation type: ${operationType}`);
    }
  }

  async handleOrderCreated(order) {
    console.log(`New order created: ${order.orderNumber}`);
    
    // Parallel processing of order creation events
    const creationTasks = [
      // Send order confirmation email
      this.sendOrderConfirmation(order),
      
      // Reserve inventory for ordered items
      this.reserveInventory(order),
      
      // Create payment authorization
      this.authorizePayment(order),
      
      // Notify fulfillment center
      this.notifyFulfillmentCenter(order),
      
      // Update customer metrics
      this.updateCustomerMetrics(order),
      
      // Log analytics event
      this.logAnalyticsEvent('order_created', order),
      
      // Check for fraud indicators
      this.performFraudCheck(order)
    ];
    
    try {
      const results = await Promise.allSettled(creationTasks);
      
      // Handle any failed tasks
      const failedTasks = results.filter(result => result.status === 'rejected');
      if (failedTasks.length > 0) {
        console.error(`${failedTasks.length} tasks failed for order creation:`, failedTasks);
        await this.handlePartialFailure(order, failedTasks);
      }
      
      console.log(`Order creation processing completed: ${order.orderNumber}`);
      
    } catch (error) {
      console.error(`Error processing order creation: ${error}`);
      throw error;
    }
  }

  async handleOrderUpdated(order, updateDescription, previousOrder) {
    console.log(`Order updated: ${order.orderNumber}`);
    
    const updatedFields = Object.keys(updateDescription.updatedFields || {});
    const removedFields = updateDescription.removedFields || [];
    
    // Process specific field changes
    for (const fieldPath of updatedFields) {
      await this.processFieldChange(order, previousOrder, fieldPath, updateDescription.updatedFields[fieldPath]);
    }
    
    // Handle removed fields
    for (const fieldPath of removedFields) {
      await this.processFieldRemoval(order, previousOrder, fieldPath);
    }
    
    // Log comprehensive change event
    await this.logAnalyticsEvent('order_updated', {
      order,
      changedFields: updatedFields,
      removedFields: removedFields
    });
  }

  async processFieldChange(order, previousOrder, fieldPath, newValue) {
    console.log(`Field changed: ${fieldPath} = ${JSON.stringify(newValue)}`);
    
    // Route processing based on changed field
    if (fieldPath === 'status') {
      await this.handleStatusChange(order, previousOrder);
    } else if (fieldPath.startsWith('payment.')) {
      await this.handlePaymentChange(order, previousOrder, fieldPath, newValue);
    } else if (fieldPath.startsWith('fulfillment.')) {
      await this.handleFulfillmentChange(order, previousOrder, fieldPath, newValue);
    } else if (fieldPath.startsWith('shipping.')) {
      await this.handleShippingChange(order, previousOrder, fieldPath, newValue);
    } else if (fieldPath.startsWith('items.')) {
      await this.handleItemChange(order, previousOrder, fieldPath, newValue);
    }
  }

  async handleStatusChange(order, previousOrder) {
    const newStatus = order.status;
    const previousStatus = previousOrder?.status;
    
    console.log(`Order status changed: ${previousStatus} → ${newStatus}`);
    
    // Status-specific processing
    switch (newStatus) {
      case 'confirmed':
        await Promise.all([
          this.processPayment(order),
          this.sendStatusUpdateEmail(order, 'order_confirmed'),
          this.createFulfillmentTasks(order)
        ]);
        break;
        
      case 'processing':
        await Promise.all([
          this.notifyWarehouse(order),
          this.updateInventoryReservations(order),
          this.sendStatusUpdateEmail(order, 'order_processing')
        ]);
        break;
        
      case 'shipped':
        await Promise.all([
          this.generateTrackingInfo(order),
          this.sendShippingNotification(order),
          this.releaseInventoryReservations(order),
          this.updateDeliveryEstimate(order)
        ]);
        break;
        
      case 'delivered':
        await Promise.all([
          this.sendDeliveryConfirmation(order),
          this.triggerReviewRequest(order),
          this.updateCustomerLoyaltyPoints(order),
          this.closeOrderInSystems(order)
        ]);
        break;
        
      case 'cancelled':
        await Promise.all([
          this.processRefund(order),
          this.releaseInventoryReservations(order),
          this.sendCancellationNotification(order),
          this.updateAnalytics(order, 'cancelled')
        ]);
        break;
    }
  }

  async handlePaymentChange(order, previousOrder, fieldPath, newValue) {
    console.log(`Payment change: ${fieldPath} = ${newValue}`);
    
    if (fieldPath === 'payment.status') {
      switch (newValue) {
        case 'authorized':
          await this.handlePaymentAuthorized(order);
          break;
        case 'captured':
          await this.handlePaymentCaptured(order);
          break;
        case 'failed':
          await this.handlePaymentFailed(order);
          break;
        case 'refunded':
          await this.handlePaymentRefunded(order);
          break;
      }
    }
  }

  async handleShippingChange(order, previousOrder, fieldPath, newValue) {
    if (fieldPath === 'shipping.trackingNumber' && newValue) {
      console.log(`Tracking number assigned: ${newValue}`);
      
      // Send tracking information to customer
      await Promise.all([
        this.sendTrackingInfo(order),
        this.setupDeliveryNotifications(order),
        this.updateShippingPartnerSystems(order)
      ]);
    }
  }

  // Implementation of helper methods for event processing
  async sendOrderConfirmation(order) {
    console.log(`Sending order confirmation for ${order.orderNumber}`);
    
    // Simulate email service call
    const emailData = {
      to: order.customer.email,
      subject: `Order Confirmation - ${order.orderNumber}`,
      template: 'order_confirmation',
      data: {
        orderNumber: order.orderNumber,
        customerName: order.customer.name,
        items: order.items,
        total: order.financial.total,
        estimatedDelivery: this.calculateDeliveryDate(order)
      }
    };
    
    // Would integrate with actual email service
    await this.sendEmail(emailData);
  }

  async reserveInventory(order) {
    console.log(`Reserving inventory for order ${order.orderNumber}`);
    
    const inventoryUpdates = order.items.map(item => ({
      productId: item.productId,
      sku: item.sku,
      quantity: item.quantity,
      reservedFor: order._id,
      reservedAt: new Date()
    }));
    
    // Update inventory collection
    const inventory = this.db.collection('inventory');
    
    for (const update of inventoryUpdates) {
      await inventory.updateOne(
        { 
          productId: update.productId,
          availableQuantity: { $gte: update.quantity }
        },
        {
          $inc: { 
            availableQuantity: -update.quantity,
            reservedQuantity: update.quantity
          },
          $push: {
            reservations: {
              orderId: update.reservedFor,
              quantity: update.quantity,
              reservedAt: update.reservedAt
            }
          }
        }
      );
    }
  }

  async authorizePayment(order) {
    console.log(`Authorizing payment for order ${order.orderNumber}`);
    
    // Simulate payment processor call
    const paymentResult = await this.callPaymentProcessor({
      action: 'authorize',
      amount: order.financial.total,
      currency: order.financial.currency,
      paymentMethod: order.payment.method,
      paymentIntentId: order.payment.processor.paymentIntentId
    });
    
    if (paymentResult.success) {
      // Update order with payment authorization
      await this.orders.updateOne(
        { _id: order._id },
        {
          $set: {
            'payment.status': 'authorized',
            'payment.processor.chargeId': paymentResult.chargeId,
            'audit.updatedAt': new Date(),
            'audit.updatedBy': 'payment_processor'
          },
          $inc: { 'audit.version': 1 }
        }
      );
    } else {
      throw new Error(`Payment authorization failed: ${paymentResult.error}`);
    }
  }

  // Helper methods (simplified implementations)
  async sendEmail(emailData) {
    console.log(`Email sent: ${emailData.subject} to ${emailData.to}`);
  }

  async callPaymentProcessor(request) {
    // Simulate payment processor response
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      success: true,
      chargeId: `ch_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  calculateDeliveryDate(order) {
    const baseDate = new Date();
    const daysToAdd = order.shipping.method === 'express' ? 2 : 
                      order.shipping.method === 'overnight' ? 1 : 5;
    baseDate.setDate(baseDate.getDate() + daysToAdd);
    return baseDate;
  }

  async logAnalyticsEvent(eventType, data) {
    const analytics = this.db.collection('analytics_events');
    await analytics.insertOne({
      eventType,
      data,
      timestamp: new Date(),
      source: 'change_stream_processor'
    });
  }

  async handleProcessingError(change, error) {
    console.error(`Processing error for change ${change._id}:`, error);
    
    // Log error for monitoring
    const errorLog = this.db.collection('processing_errors');
    await errorLog.insertOne({
      changeId: change._id,
      operationType: change.operationType,
      documentKey: change.documentKey,
      error: {
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date(),
      retryCount: 0
    });
  }

  async handleChangeStreamError(error) {
    console.error('Change stream error:', error);
    
    // Wait before attempting reconnection
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Restart change stream processing
    await this.startChangeStreamProcessing();
  }

  getProcessingStatistics() {
    return {
      ...this.stats,
      resumeToken: this.resumeToken,
      processedEventsInMemory: this.processedEvents.size
    };
  }
}

// Multi-service change stream coordination
class DistributedOrderEventSystem {
  constructor(db) {
    this.db = db;
    this.serviceProcessors = new Map();
    this.eventBus = new Map(); // Simple in-memory event bus
    this.globalStats = {
      totalEventsProcessed: 0,
      servicesActive: 0,
      lastProcessingTime: null
    };
  }

  async setupDistributedProcessing() {
    console.log('Setting up distributed order event processing...');
    
    // Create specialized processors for different services
    const services = [
      'inventory-service',
      'payment-service', 
      'fulfillment-service',
      'notification-service',
      'analytics-service',
      'customer-service'
    ];
    
    for (const serviceName of services) {
      const processor = new ServiceSpecificProcessor(this.db, serviceName, this);
      await processor.initialize();
      this.serviceProcessors.set(serviceName, processor);
    }
    
    console.log(`Distributed processing setup completed with ${services.length} services`);
  }

  async publishEvent(eventType, data, source) {
    console.log(`Publishing event: ${eventType} from ${source}`);
    
    // Add to event bus
    if (!this.eventBus.has(eventType)) {
      this.eventBus.set(eventType, []);
    }
    
    const event = {
      id: new ObjectId(),
      type: eventType,
      data,
      source,
      timestamp: new Date(),
      processed: new Set()
    };
    
    this.eventBus.get(eventType).push(event);
    
    // Notify interested services
    for (const [serviceName, processor] of this.serviceProcessors.entries()) {
      if (processor.isInterestedInEvent(eventType)) {
        await processor.processEvent(event);
      }
    }
    
    this.globalStats.totalEventsProcessed++;
    this.globalStats.lastProcessingTime = new Date();
  }

  getGlobalStatistics() {
    const serviceStats = {};
    for (const [serviceName, processor] of this.serviceProcessors.entries()) {
      serviceStats[serviceName] = processor.getStatistics();
    }
    
    return {
      global: this.globalStats,
      services: serviceStats,
      eventBusSize: Array.from(this.eventBus.values()).reduce((total, events) => total + events.length, 0)
    };
  }
}

// Service-specific processor for handling events relevant to each microservice
class ServiceSpecificProcessor {
  constructor(db, serviceName, eventSystem) {
    this.db = db;
    this.serviceName = serviceName;
    this.eventSystem = eventSystem;
    this.eventFilters = new Map();
    this.stats = {
      eventsProcessed: 0,
      eventsFiltered: 0,
      lastProcessedAt: null
    };
    
    this.setupEventFilters();
  }

  setupEventFilters() {
    // Define which events each service cares about
    const filterConfigs = {
      'inventory-service': [
        'order_created',
        'order_cancelled', 
        'item_status_changed'
      ],
      'payment-service': [
        'order_created',
        'order_confirmed',
        'order_cancelled',
        'payment_status_changed'
      ],
      'fulfillment-service': [
        'order_confirmed',
        'payment_authorized',
        'inventory_reserved'
      ],
      'notification-service': [
        'order_created',
        'status_changed',
        'payment_status_changed',
        'shipping_updated'
      ],
      'analytics-service': [
        '*' // Analytics service processes all events
      ],
      'customer-service': [
        'order_created',
        'order_delivered',
        'order_cancelled'
      ]
    };
    
    const filters = filterConfigs[this.serviceName] || [];
    filters.forEach(filter => this.eventFilters.set(filter, true));
  }

  async initialize() {
    console.log(`Initializing ${this.serviceName} processor...`);
    
    // Service-specific initialization
    switch (this.serviceName) {
      case 'inventory-service':
        await this.initializeInventoryTracking();
        break;
      case 'payment-service':
        await this.initializePaymentProcessing();
        break;
      // ... other services
    }
    
    console.log(`${this.serviceName} processor initialized`);
  }

  isInterestedInEvent(eventType) {
    return this.eventFilters.has('*') || this.eventFilters.has(eventType);
  }

  async processEvent(event) {
    if (!this.isInterestedInEvent(event.type)) {
      this.stats.eventsFiltered++;
      return;
    }
    
    console.log(`${this.serviceName} processing event: ${event.type}`);
    
    try {
      // Service-specific event processing
      await this.handleServiceEvent(event);
      
      event.processed.add(this.serviceName);
      this.stats.eventsProcessed++;
      this.stats.lastProcessedAt = new Date();
      
    } catch (error) {
      console.error(`${this.serviceName} error processing event ${event.id}:`, error);
      throw error;
    }
  }

  async handleServiceEvent(event) {
    // Dispatch to service-specific handlers
    const handlerMethod = `handle${event.type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('')}`;
    
    if (typeof this[handlerMethod] === 'function') {
      await this[handlerMethod](event);
    } else {
      console.warn(`No handler found: ${handlerMethod} in ${this.serviceName}`);
    }
  }

  // Service-specific event handlers
  async handleOrderCreated(event) {
    if (this.serviceName === 'inventory-service') {
      await this.reserveInventoryForOrder(event.data);
    } else if (this.serviceName === 'notification-service') {
      await this.sendOrderConfirmationEmail(event.data);
    }
  }

  async handleStatusChanged(event) {
    if (this.serviceName === 'customer-service') {
      await this.updateCustomerOrderHistory(event.data);
    }
  }

  // Helper methods for specific services
  async reserveInventoryForOrder(order) {
    console.log(`Reserving inventory for order: ${order.orderNumber}`);
    // Implementation would interact with inventory management system
  }

  async sendOrderConfirmationEmail(order) {
    console.log(`Sending confirmation email for order: ${order.orderNumber}`);
    // Implementation would use email service
  }

  async initializeInventoryTracking() {
    // Setup inventory-specific collections and indexes
    const inventory = this.db.collection('inventory');
    await inventory.createIndex({ productId: 1, warehouse: 1 });
  }

  async initializePaymentProcessing() {
    // Setup payment-specific configurations
    console.log('Payment service initialized with fraud detection enabled');
  }

  getStatistics() {
    return this.stats;
  }
}

// Benefits of MongoDB Change Streams:
// - Real-time change detection with minimal latency
// - Native event sourcing capabilities without complex triggers  
// - Resumable streams with automatic recovery from failures
// - Ordered event processing with guaranteed delivery
// - Fine-grained filtering and transformation pipelines
// - Horizontal scaling across multiple application instances
// - Integration with MongoDB's replica set and sharding architecture
// - No polling overhead or resource waste
// - Built-in clustering and high availability support
// - Simple integration with existing MongoDB applications

module.exports = {
  setupOrderManagement,
  OrderEventProcessor,
  DistributedOrderEventSystem,
  ServiceSpecificProcessor
};
```

## Understanding MongoDB Change Streams Architecture

### Change Stream Processing Patterns

MongoDB Change Streams operate at the replica set level and provide several key capabilities for event-driven architectures:

```javascript
// Advanced change stream patterns and configurations
class AdvancedChangeStreamManager {
  constructor(client) {
    this.client = client;
    this.db = client.db('ecommerce');
    this.changeStreams = new Map();
    this.resumeTokens = new Map();
    this.errorHandlers = new Map();
  }

  async setupMultiCollectionStreams() {
    console.log('Setting up multi-collection change streams...');
    
    // 1. Collection-specific streams with targeted processing
    const collectionConfigs = [
      {
        name: 'orders',
        pipeline: [
          {
            $match: {
              $or: [
                { operationType: 'insert' },
                { operationType: 'update', 'updateDescription.updatedFields.status': { $exists: true } },
                { operationType: 'update', 'updateDescription.updatedFields.payment.status': { $exists: true } }
              ]
            }
          }
        ],
        handler: this.handleOrderChanges.bind(this)
      },
      {
        name: 'inventory', 
        pipeline: [
          {
            $match: {
              $or: [
                { operationType: 'update', 'updateDescription.updatedFields.availableQuantity': { $exists: true } },
                { operationType: 'update', 'updateDescription.updatedFields.reservedQuantity': { $exists: true } }
              ]
            }
          }
        ],
        handler: this.handleInventoryChanges.bind(this)
      },
      {
        name: 'customers',
        pipeline: [
          {
            $match: {
              operationType: { $in: ['insert', 'update'] },
              $or: [
                { 'fullDocument.loyaltyTier': { $exists: true } },
                { 'updateDescription.updatedFields.loyaltyTier': { $exists: true } },
                { 'updateDescription.updatedFields.preferences': { $exists: true } }
              ]
            }
          }
        ],
        handler: this.handleCustomerChanges.bind(this)
      }
    ];
    
    // Start streams for each collection
    for (const config of collectionConfigs) {
      await this.startCollectionStream(config);
    }
    
    // 2. Database-level change stream for cross-collection events
    await this.startDatabaseStream();
    
    console.log(`Started ${collectionConfigs.length + 1} change streams`);
  }

  async startCollectionStream(config) {
    const collection = this.db.collection(config.name);
    const resumeToken = this.resumeTokens.get(config.name);
    
    const options = {
      pipeline: config.pipeline,
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
      maxAwaitTimeMS: 1000,
      startAfter: resumeToken
    };
    
    try {
      const changeStream = collection.watch(options);
      this.changeStreams.set(config.name, changeStream);
      
      // Process changes asynchronously
      this.processChangeStream(config.name, changeStream, config.handler);
      
    } catch (error) {
      console.error(`Error starting stream for ${config.name}:`, error);
      this.scheduleStreamRestart(config);
    }
  }

  async startDatabaseStream() {
    // Database-level stream for cross-collection coordination
    const pipeline = [
      {
        $match: {
          // Monitor for significant cross-collection events
          $or: [
            { 
              operationType: 'insert',
              'fullDocument.metadata.requiresCrossCollectionSync': true
            },
            {
              operationType: 'update',
              'updateDescription.updatedFields.syncRequired': { $exists: true }
            }
          ]
        }
      },
      {
        $addFields: {
          // Add processing metadata
          collectionName: '$ns.coll',
          databaseName: '$ns.db',
          changeSignature: {
            $concat: [
              '$ns.coll', '_',
              '$operationType', '_',
              { $toString: '$clusterTime' }
            ]
          }
        }
      }
    ];
    
    const options = {
      pipeline,
      fullDocument: 'updateLookup',
      maxAwaitTimeMS: 2000
    };
    
    const dbStream = this.db.watch(options);
    this.changeStreams.set('_database', dbStream);
    
    this.processChangeStream('_database', dbStream, this.handleDatabaseChanges.bind(this));
  }

  async processChangeStream(streamName, changeStream, handler) {
    console.log(`Processing change stream: ${streamName}`);
    
    try {
      for await (const change of changeStream) {
        try {
          // Store resume token
          this.resumeTokens.set(streamName, change._id);
          
          // Process the change
          await handler(change);
          
          // Persist resume token for recovery
          await this.persistResumeToken(streamName, change._id);
          
        } catch (processingError) {
          console.error(`Error processing change in ${streamName}:`, processingError);
          await this.handleProcessingError(streamName, change, processingError);
        }
      }
    } catch (streamError) {
      console.error(`Stream error in ${streamName}:`, streamError);
      await this.handleStreamError(streamName, streamError);
    }
  }

  async handleOrderChanges(change) {
    console.log(`Order change detected: ${change.operationType}`);
    
    const { operationType, fullDocument, documentKey, updateDescription } = change;
    
    // Route based on change type and affected fields
    if (operationType === 'insert') {
      await this.processNewOrder(fullDocument);
    } else if (operationType === 'update') {
      const updatedFields = Object.keys(updateDescription.updatedFields || {});
      
      // Process specific field updates
      if (updatedFields.includes('status')) {
        await this.processOrderStatusChange(fullDocument, updateDescription);
      }
      
      if (updatedFields.some(field => field.startsWith('payment.'))) {
        await this.processPaymentChange(fullDocument, updateDescription);
      }
      
      if (updatedFields.some(field => field.startsWith('fulfillment.'))) {
        await this.processFulfillmentChange(fullDocument, updateDescription);
      }
    }
  }

  async handleInventoryChanges(change) {
    console.log(`Inventory change detected: ${change.operationType}`);
    
    const { fullDocument, updateDescription } = change;
    const updatedFields = Object.keys(updateDescription.updatedFields || {});
    
    // Check for low stock conditions
    if (updatedFields.includes('availableQuantity')) {
      const newQuantity = updateDescription.updatedFields.availableQuantity;
      if (newQuantity <= fullDocument.reorderLevel) {
        await this.triggerReorderAlert(fullDocument);
      }
    }
    
    // Propagate inventory changes to dependent systems
    await this.syncInventoryWithExternalSystems(fullDocument, updatedFields);
  }

  async handleCustomerChanges(change) {
    console.log(`Customer change detected: ${change.operationType}`);
    
    const { fullDocument, updateDescription } = change;
    
    // Handle loyalty tier changes
    if (updateDescription?.updatedFields?.loyaltyTier) {
      await this.processLoyaltyTierChange(fullDocument, updateDescription);
    }
    
    // Handle preference updates
    if (updateDescription?.updatedFields?.preferences) {
      await this.updatePersonalizationEngine(fullDocument);
    }
  }

  async handleDatabaseChanges(change) {
    console.log(`Database-level change: ${change.collectionName}.${change.operationType}`);
    
    // Handle cross-collection synchronization events
    await this.coordinateCrossCollectionSync(change);
  }

  // Resilience and error handling
  async handleStreamError(streamName, error) {
    console.error(`Stream ${streamName} encountered error:`, error);
    
    // Implement exponential backoff for reconnection
    const baseDelay = 1000; // 1 second
    const maxRetries = 5;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      const delay = baseDelay * Math.pow(2, retryCount);
      console.log(`Attempting to restart ${streamName} in ${delay}ms (retry ${retryCount + 1})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        // Restart the specific stream
        await this.restartStream(streamName);
        console.log(`Successfully restarted ${streamName}`);
        break;
      } catch (restartError) {
        console.error(`Failed to restart ${streamName}:`, restartError);
        retryCount++;
      }
    }
    
    if (retryCount >= maxRetries) {
      console.error(`Failed to restart ${streamName} after ${maxRetries} attempts`);
      // Implement alerting for operations team
      await this.sendOperationalAlert(`Critical: Change stream ${streamName} failed to restart`);
    }
  }

  async restartStream(streamName) {
    // Close existing stream if it exists
    const existingStream = this.changeStreams.get(streamName);
    if (existingStream) {
      try {
        await existingStream.close();
      } catch (closeError) {
        console.warn(`Error closing ${streamName}:`, closeError);
      }
      this.changeStreams.delete(streamName);
    }
    
    // Restart based on stream type
    if (streamName === '_database') {
      await this.startDatabaseStream();
    } else {
      // Find and restart collection stream
      const config = this.getCollectionConfig(streamName);
      if (config) {
        await this.startCollectionStream(config);
      }
    }
  }

  async persistResumeToken(streamName, resumeToken) {
    // Store resume tokens in MongoDB for crash recovery
    const tokenCollection = this.db.collection('change_stream_tokens');
    
    await tokenCollection.updateOne(
      { streamName },
      {
        $set: {
          resumeToken,
          lastUpdated: new Date(),
          streamName
        }
      },
      { upsert: true }
    );
  }

  async loadPersistedResumeTokens() {
    console.log('Loading persisted resume tokens...');
    
    const tokenCollection = this.db.collection('change_stream_tokens');
    const tokens = await tokenCollection.find({}).toArray();
    
    for (const token of tokens) {
      this.resumeTokens.set(token.streamName, token.resumeToken);
      console.log(`Loaded resume token for ${token.streamName}`);
    }
  }

  // Performance monitoring and optimization
  async getChangeStreamMetrics() {
    const metrics = {
      activeStreams: this.changeStreams.size,
      resumeTokens: this.resumeTokens.size,
      streamStatus: {},
      systemHealth: await this.checkSystemHealth()
    };
    
    // Check status of each stream
    for (const [streamName, stream] of this.changeStreams.entries()) {
      metrics.streamStatus[streamName] = {
        isActive: !stream.closed,
        hasResumeToken: this.resumeTokens.has(streamName)
      };
    }
    
    return metrics;
  }

  async checkSystemHealth() {
    try {
      // Check MongoDB replica set status
      const replicaSetStatus = await this.client.db('admin').admin().replSetGetStatus();
      
      const healthMetrics = {
        replicaSetHealthy: replicaSetStatus.ok === 1,
        primaryNode: replicaSetStatus.members.find(member => member.state === 1)?.name,
        secondaryNodes: replicaSetStatus.members.filter(member => member.state === 2).length,
        oplogSize: await this.getOplogSize(),
        changeStreamSupported: true
      };
      
      return healthMetrics;
    } catch (error) {
      console.error('Error checking system health:', error);
      return {
        replicaSetHealthy: false,
        error: error.message
      };
    }
  }

  async getOplogSize() {
    // Check oplog size to ensure sufficient retention for change streams
    const oplog = this.client.db('local').collection('oplog.rs');
    const stats = await oplog.stats();
    
    return {
      sizeBytes: stats.size,
      sizeMB: Math.round(stats.size / 1024 / 1024),
      maxSizeBytes: stats.maxSize,
      maxSizeMB: Math.round(stats.maxSize / 1024 / 1024),
      utilizationPercent: Math.round((stats.size / stats.maxSize) * 100)
    };
  }

  // Cleanup and shutdown
  async shutdown() {
    console.log('Shutting down change stream manager...');
    
    const shutdownPromises = [];
    
    // Close all active streams
    for (const [streamName, stream] of this.changeStreams.entries()) {
      console.log(`Closing stream: ${streamName}`);
      shutdownPromises.push(
        stream.close().catch(error => 
          console.warn(`Error closing ${streamName}:`, error)
        )
      );
    }
    
    await Promise.allSettled(shutdownPromises);
    
    // Clear internal state
    this.changeStreams.clear();
    this.resumeTokens.clear();
    
    console.log('Change stream manager shutdown complete');
  }
}

// Helper methods for event processing
async function processNewOrder(order) {
  console.log(`Processing new order: ${order.orderNumber}`);
  
  // Comprehensive order processing workflow
  const processingTasks = [
    validateOrderData(order),
    checkInventoryAvailability(order), 
    validatePaymentMethod(order),
    calculateShippingOptions(order),
    applyPromotionsAndDiscounts(order),
    createFulfillmentWorkflow(order),
    sendCustomerNotifications(order),
    updateAnalyticsAndReporting(order)
  ];
  
  const results = await Promise.allSettled(processingTasks);
  
  // Handle any failed tasks
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length > 0) {
    console.error(`${failures.length} tasks failed for order ${order.orderNumber}`);
    await handleOrderProcessingFailures(order, failures);
  }
}

async function triggerReorderAlert(inventoryItem) {
  console.log(`Low stock alert: ${inventoryItem.sku} - ${inventoryItem.availableQuantity} remaining`);
  
  // Create automatic reorder if conditions are met
  if (inventoryItem.autoReorder && inventoryItem.availableQuantity <= inventoryItem.criticalLevel) {
    const reorderQuantity = inventoryItem.maxStock - inventoryItem.availableQuantity;
    
    await createPurchaseOrder({
      productId: inventoryItem.productId,
      sku: inventoryItem.sku,
      quantity: reorderQuantity,
      supplier: inventoryItem.preferredSupplier,
      urgency: 'high',
      reason: 'automated_reorder_low_stock'
    });
  }
}

// Example helper implementations
async function validateOrderData(order) {
  // Comprehensive order validation
  const validationResults = {
    customerValid: await validateCustomer(order.customerId),
    itemsValid: await validateOrderItems(order.items),
    addressValid: await validateShippingAddress(order.shipping.address),
    paymentValid: await validatePaymentInfo(order.payment)
  };
  
  const isValid = Object.values(validationResults).every(result => result === true);
  if (!isValid) {
    throw new Error(`Order validation failed: ${JSON.stringify(validationResults)}`);
  }
}

async function createPurchaseOrder(orderData) {
  console.log(`Creating purchase order: ${orderData.sku} x ${orderData.quantity}`);
  // Implementation would create purchase order in procurement system
}

async function sendOperationalAlert(message) {
  console.error(`OPERATIONAL ALERT: ${message}`);
  // Implementation would integrate with alerting system (PagerDuty, Slack, etc.)
}
```

## SQL-Style Change Stream Operations with QueryLeaf

QueryLeaf provides SQL-familiar syntax for MongoDB Change Stream operations:

```sql
-- QueryLeaf change stream operations with SQL-familiar syntax

-- Create change stream listeners with SQL-style syntax
CREATE CHANGE STREAM order_status_changes 
ON orders 
WHERE 
  operation_type IN ('update', 'insert')
  AND (
    changed_fields CONTAINS 'status' 
    OR changed_fields CONTAINS 'payment.status'
  )
WITH (
  full_document = 'update_lookup',
  full_document_before_change = 'when_available',
  max_await_time = '1 second',
  batch_size = 50
);

-- Multi-collection change stream with filtering
CREATE CHANGE STREAM inventory_and_orders
ON DATABASE ecommerce
WHERE 
  collection_name IN ('orders', 'inventory', 'products')
  AND (
    (collection_name = 'orders' AND operation_type = 'insert')
    OR (collection_name = 'inventory' AND changed_fields CONTAINS 'availableQuantity')
    OR (collection_name = 'products' AND changed_fields CONTAINS 'price')
  )
WITH (
  resume_after = '8264BEB9F3000000012B0229296E04'
);

-- Real-time order processing with change stream triggers
CREATE TRIGGER process_order_changes
ON CHANGE STREAM order_status_changes
FOR EACH CHANGE AS
BEGIN
  -- Route processing based on change type
  CASE change.operation_type
    WHEN 'insert' THEN
      -- New order created
      CALL process_new_order(change.full_document);
      
      -- Send notifications
      INSERT INTO notification_queue (
        recipient, 
        type, 
        message, 
        data
      )
      VALUES (
        change.full_document.customer.email,
        'order_confirmation',
        'Your order has been received',
        change.full_document
      );
      
    WHEN 'update' THEN
      -- Order updated - check what changed
      IF change.changed_fields CONTAINS 'status' THEN
        CALL process_status_change(
          change.full_document,
          change.update_description.updated_fields.status
        );
      END IF;
      
      IF change.changed_fields CONTAINS 'payment.status' THEN
        CALL process_payment_status_change(
          change.full_document,
          change.update_description.updated_fields['payment.status']
        );
      END IF;
  END CASE;
  
  -- Update processing metrics
  UPDATE change_stream_metrics 
  SET 
    events_processed = events_processed + 1,
    last_processed_at = CURRENT_TIMESTAMP
  WHERE stream_name = 'order_status_changes';
END;

-- Change stream analytics and monitoring
WITH change_stream_analytics AS (
  SELECT 
    stream_name,
    operation_type,
    collection_name,
    DATE_TRUNC('minute', change_timestamp) as minute_bucket,
    
    COUNT(*) as change_count,
    COUNT(DISTINCT document_key._id) as unique_documents,
    
    -- Processing latency analysis
    AVG(processing_time_ms) as avg_processing_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95_processing_time,
    
    -- Change characteristics
    COUNT(*) FILTER (WHERE operation_type = 'insert') as insert_count,
    COUNT(*) FILTER (WHERE operation_type = 'update') as update_count,
    COUNT(*) FILTER (WHERE operation_type = 'delete') as delete_count,
    
    -- Field change patterns
    STRING_AGG(DISTINCT changed_fields, ',') as common_changed_fields,
    
    -- Error tracking
    COUNT(*) FILTER (WHERE processing_status = 'error') as error_count,
    COUNT(*) FILTER (WHERE processing_status = 'retry') as retry_count
    
  FROM change_stream_events
  WHERE change_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  GROUP BY stream_name, operation_type, collection_name, minute_bucket
),
stream_performance AS (
  SELECT 
    stream_name,
    SUM(change_count) as total_changes,
    AVG(avg_processing_time) as overall_avg_processing_time,
    MAX(p95_processing_time) as max_p95_processing_time,
    
    -- Throughput analysis
    SUM(change_count) / 60.0 as changes_per_second,
    
    -- Error rates
    SUM(error_count) as total_errors,
    (SUM(error_count)::numeric / SUM(change_count)) * 100 as error_rate_percent,
    
    -- Change type distribution
    SUM(insert_count) as total_inserts,
    SUM(update_count) as total_updates, 
    SUM(delete_count) as total_deletes,
    
    -- Field change frequency
    COUNT(DISTINCT common_changed_fields) as unique_field_patterns,
    
    -- Performance assessment
    CASE 
      WHEN AVG(avg_processing_time) > 1000 THEN 'SLOW'
      WHEN AVG(avg_processing_time) > 500 THEN 'MODERATE'
      ELSE 'FAST'
    END as performance_rating,
    
    -- Health indicators
    CASE
      WHEN (SUM(error_count)::numeric / SUM(change_count)) > 0.05 THEN 'UNHEALTHY'
      WHEN (SUM(error_count)::numeric / SUM(change_count)) > 0.01 THEN 'WARNING' 
      ELSE 'HEALTHY'
    END as health_status
    
  FROM change_stream_analytics
  GROUP BY stream_name
)
SELECT 
  sp.stream_name,
  sp.total_changes,
  ROUND(sp.changes_per_second, 2) as changes_per_sec,
  ROUND(sp.overall_avg_processing_time, 1) as avg_processing_ms,
  ROUND(sp.max_p95_processing_time, 1) as max_p95_ms,
  sp.performance_rating,
  sp.health_status,
  
  -- Change breakdown
  sp.total_inserts,
  sp.total_updates,
  sp.total_deletes,
  
  -- Error analysis  
  sp.total_errors,
  ROUND(sp.error_rate_percent, 2) as error_rate_pct,
  
  -- Field change patterns
  sp.unique_field_patterns,
  
  -- Recommendations
  CASE 
    WHEN sp.performance_rating = 'SLOW' THEN 'Optimize change processing logic or increase resources'
    WHEN sp.error_rate_percent > 5 THEN 'Investigate error patterns and improve error handling'
    WHEN sp.changes_per_second > 1000 THEN 'Consider stream partitioning for better throughput'
    ELSE 'Performance within acceptable parameters'
  END as recommendation

FROM stream_performance sp
ORDER BY sp.total_changes DESC;

-- Advanced change stream query patterns
CREATE VIEW real_time_order_insights AS
WITH order_changes AS (
  SELECT 
    full_document.*,
    change_timestamp,
    operation_type,
    changed_fields,
    
    -- Calculate order lifecycle timing
    CASE 
      WHEN operation_type = 'insert' THEN 'order_created'
      WHEN changed_fields CONTAINS 'status' THEN 
        CONCAT('status_changed_to_', full_document.status)
      WHEN changed_fields CONTAINS 'payment.status' THEN
        CONCAT('payment_', full_document.payment.status) 
      ELSE 'other_update'
    END as change_event_type,
    
    -- Time-based analytics
    DATE_TRUNC('hour', change_timestamp) as hour_bucket,
    EXTRACT(DOW FROM change_timestamp) as day_of_week,
    EXTRACT(HOUR FROM change_timestamp) as hour_of_day,
    
    -- Order value categories
    CASE 
      WHEN full_document.financial.total >= 500 THEN 'high_value'
      WHEN full_document.financial.total >= 100 THEN 'medium_value'
      ELSE 'low_value'
    END as order_value_category,
    
    -- Customer segment analysis
    full_document.customer.loyaltyTier as customer_segment,
    
    -- Geographic analysis
    full_document.shipping.address.state as shipping_state,
    full_document.shipping.address.country as shipping_country
    
  FROM CHANGE_STREAM(orders)
  WHERE change_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
),
order_metrics AS (
  SELECT 
    hour_bucket,
    day_of_week,
    hour_of_day,
    change_event_type,
    order_value_category,
    customer_segment,
    shipping_state,
    
    COUNT(*) as event_count,
    COUNT(DISTINCT full_document._id) as unique_orders,
    AVG(full_document.financial.total) as avg_order_value,
    SUM(full_document.financial.total) as total_order_value,
    
    -- Conversion funnel analysis
    COUNT(*) FILTER (WHERE change_event_type = 'order_created') as orders_created,
    COUNT(*) FILTER (WHERE change_event_type = 'status_changed_to_confirmed') as orders_confirmed,
    COUNT(*) FILTER (WHERE change_event_type = 'status_changed_to_shipped') as orders_shipped,
    COUNT(*) FILTER (WHERE change_event_type = 'status_changed_to_delivered') as orders_delivered,
    COUNT(*) FILTER (WHERE change_event_type = 'status_changed_to_cancelled') as orders_cancelled,
    
    -- Payment analysis
    COUNT(*) FILTER (WHERE change_event_type = 'payment_authorized') as payments_authorized,
    COUNT(*) FILTER (WHERE change_event_type = 'payment_captured') as payments_captured,
    COUNT(*) FILTER (WHERE change_event_type = 'payment_failed') as payments_failed,
    
    -- Customer behavior
    COUNT(DISTINCT full_document.customer.customerId) as unique_customers,
    AVG(ARRAY_LENGTH(full_document.items, 1)) as avg_items_per_order
    
  FROM order_changes
  GROUP BY 
    hour_bucket, day_of_week, hour_of_day, change_event_type,
    order_value_category, customer_segment, shipping_state
)
SELECT 
  hour_bucket,
  change_event_type,
  order_value_category,
  customer_segment,
  
  event_count,
  unique_orders,
  ROUND(avg_order_value, 2) as avg_order_value,
  ROUND(total_order_value, 2) as total_order_value,
  
  -- Conversion rates
  CASE 
    WHEN orders_created > 0 THEN 
      ROUND((orders_confirmed::numeric / orders_created) * 100, 1)
    ELSE 0
  END as confirmation_rate_pct,
  
  CASE 
    WHEN orders_confirmed > 0 THEN
      ROUND((orders_shipped::numeric / orders_confirmed) * 100, 1) 
    ELSE 0
  END as fulfillment_rate_pct,
  
  CASE
    WHEN orders_shipped > 0 THEN
      ROUND((orders_delivered::numeric / orders_shipped) * 100, 1)
    ELSE 0  
  END as delivery_rate_pct,
  
  -- Payment success rates
  CASE
    WHEN payments_authorized > 0 THEN
      ROUND((payments_captured::numeric / payments_authorized) * 100, 1)
    ELSE 0
  END as payment_success_rate_pct,
  
  -- Business insights
  unique_customers,
  ROUND(avg_items_per_order, 1) as avg_items_per_order,
  
  -- Time-based patterns
  day_of_week,
  hour_of_day,
  
  -- Geographic insights
  shipping_state,
  
  -- Performance indicators
  CASE 
    WHEN change_event_type = 'order_created' AND event_count > 100 THEN 'HIGH_VOLUME'
    WHEN change_event_type = 'payment_failed' AND event_count > 10 THEN 'PAYMENT_ISSUES'
    WHEN change_event_type = 'status_changed_to_cancelled' AND event_count > 20 THEN 'HIGH_CANCELLATION'
    ELSE 'NORMAL'
  END as alert_status

FROM order_metrics
WHERE event_count > 0
ORDER BY hour_bucket DESC, event_count DESC;

-- Resume token management for change stream reliability
CREATE TABLE change_stream_resume_tokens (
  stream_name VARCHAR(255) PRIMARY KEY,
  resume_token TEXT NOT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Stream configuration
  collection_name VARCHAR(255),
  database_name VARCHAR(255),
  filter_pipeline JSONB,
  
  -- Monitoring
  events_processed BIGINT DEFAULT 0,
  last_event_timestamp TIMESTAMP,
  stream_status VARCHAR(50) DEFAULT 'active',
  
  -- Performance tracking
  avg_processing_latency_ms INTEGER,
  last_error_message TEXT,
  last_error_timestamp TIMESTAMP,
  consecutive_errors INTEGER DEFAULT 0
);

-- Automatic resume token persistence
CREATE TRIGGER update_resume_tokens
AFTER INSERT OR UPDATE ON change_stream_events
FOR EACH ROW
EXECUTE FUNCTION update_stream_resume_token();

-- Change stream health monitoring
SELECT 
  cst.stream_name,
  cst.collection_name,
  cst.events_processed,
  cst.stream_status,
  
  -- Time since last activity
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cst.last_event_timestamp)) / 60 as minutes_since_last_event,
  
  -- Performance metrics
  cst.avg_processing_latency_ms,
  cst.consecutive_errors,
  
  -- Health assessment
  CASE 
    WHEN cst.stream_status != 'active' THEN 'INACTIVE'
    WHEN cst.consecutive_errors >= 5 THEN 'FAILING'
    WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cst.last_event_timestamp)) > 300 THEN 'STALE'
    WHEN cst.avg_processing_latency_ms > 1000 THEN 'SLOW'
    ELSE 'HEALTHY'
  END as health_status,
  
  -- Recovery information
  cst.resume_token,
  cst.last_updated,
  
  -- Error details
  cst.last_error_message,
  cst.last_error_timestamp

FROM change_stream_resume_tokens cst
ORDER BY 
  CASE health_status
    WHEN 'FAILING' THEN 1
    WHEN 'INACTIVE' THEN 2
    WHEN 'STALE' THEN 3
    WHEN 'SLOW' THEN 4
    ELSE 5
  END,
  cst.events_processed DESC;

-- QueryLeaf change stream features provide:
-- 1. SQL-familiar syntax for MongoDB Change Stream operations
-- 2. Real-time event processing with familiar trigger patterns
-- 3. Advanced filtering and transformation using SQL expressions
-- 4. Built-in analytics and monitoring with SQL aggregation functions
-- 5. Resume token management for reliable stream processing
-- 6. Performance monitoring and health assessment queries
-- 7. Integration with existing SQL-based reporting and analytics
-- 8. Event-driven architecture patterns using familiar SQL constructs
-- 9. Multi-collection change coordination with SQL joins and unions
-- 10. Seamless scaling from simple change detection to complex event processing
```

## Best Practices for Change Stream Implementation

### Performance and Scalability Considerations

Optimize Change Streams for high-throughput, production environments:

1. **Pipeline Filtering**: Use aggregation pipelines to filter changes at the database level
2. **Resume Token Management**: Implement robust resume token persistence for crash recovery
3. **Batch Processing**: Process changes in batches to improve throughput
4. **Resource Management**: Monitor memory and connection usage for long-running streams
5. **Error Handling**: Implement comprehensive error handling and retry logic
6. **Oplog Sizing**: Ensure adequate oplog size for change stream retention requirements

### Event-Driven Architecture Patterns

Design scalable event-driven systems with Change Streams:

1. **Event Sourcing**: Use Change Streams as the foundation for event sourcing patterns
2. **CQRS Integration**: Implement Command Query Responsibility Segregation with change-driven read model updates
3. **Microservice Communication**: Coordinate microservices through change-driven events
4. **Data Synchronization**: Maintain consistency across distributed systems
5. **Real-time Analytics**: Power real-time dashboards and analytics with streaming changes
6. **Audit and Compliance**: Implement comprehensive audit trails with change event logging

## Conclusion

MongoDB Change Streams provide comprehensive real-time change detection capabilities that eliminate the complexity and overhead of traditional polling-based approaches while enabling sophisticated event-driven architectures. The native integration with MongoDB's replica set architecture, combined with resumable streams and fine-grained filtering, makes building reactive applications both powerful and reliable.

Key Change Stream benefits include:

- **Real-time Processing**: Millisecond latency change detection without polling overhead
- **Guaranteed Delivery**: Ordered, resumable streams with crash recovery capabilities
- **Rich Filtering**: Aggregation pipeline-based change filtering and transformation
- **Horizontal Scaling**: Native support for distributed processing across multiple application instances
- **Operational Simplicity**: No external message brokers or complex trigger maintenance required
- **Event Sourcing Support**: Built-in capabilities for implementing event sourcing patterns

Whether you're building microservices architectures, real-time analytics platforms, data synchronization systems, or event-driven applications, MongoDB Change Streams with QueryLeaf's familiar SQL interface provides the foundation for sophisticated reactive data processing. This combination enables you to implement complex event-driven functionality while preserving familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Change Stream operations while providing SQL-familiar event processing syntax, resume token handling, and stream analytics functions. Advanced change detection, event routing, and stream monitoring are seamlessly handled through familiar SQL patterns, making event-driven architecture development both powerful and accessible.

The integration of native change detection capabilities with SQL-style stream processing makes MongoDB an ideal platform for applications requiring both real-time reactivity and familiar database interaction patterns, ensuring your event-driven solutions remain both effective and maintainable as they scale and evolve.