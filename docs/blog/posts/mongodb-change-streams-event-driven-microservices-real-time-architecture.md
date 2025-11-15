---
title: "MongoDB Change Streams for Event-Driven Microservices: Real-Time Architecture and Reactive Data Processing"
description: "Master MongoDB Change Streams for building event-driven microservices, real-time reactive applications, and scalable distributed systems. Learn change data capture, event processing patterns, and SQL-familiar stream operations."
date: 2025-11-14
tags: [mongodb, change-streams, event-driven, microservices, real-time, reactive-programming, cdc, sql]
---

# MongoDB Change Streams for Event-Driven Microservices: Real-Time Architecture and Reactive Data Processing

Modern distributed applications require real-time responsiveness to data changes, enabling immediate updates across microservices, cache invalidation, data synchronization, and user notification systems. Traditional polling-based approaches create unnecessary load, introduce latency, and fail to scale with growing data volumes and user expectations for instant updates.

MongoDB Change Streams provide native change data capture (CDC) capabilities that enable real-time event-driven architectures without the complexity of external message queues or polling mechanisms. Unlike traditional database triggers that operate at the database level with limited scalability, Change Streams offer application-level event processing with comprehensive filtering, transformation, and distributed processing capabilities.

## The Traditional Event Processing Challenge

Building real-time event-driven systems with traditional databases requires complex infrastructure and polling mechanisms:

```sql
-- Traditional PostgreSQL event processing - complex and inefficient

-- Event log table for change tracking
CREATE TABLE event_log (
    event_id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    operation_type VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
    record_id TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    
    -- Event routing information
    event_type VARCHAR(50),
    service_name VARCHAR(50),
    correlation_id UUID,
    
    -- Processing metadata
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,
    error_message TEXT,
    
    -- Partitioning for performance
    created_date DATE GENERATED ALWAYS AS (DATE(event_timestamp)) STORED
);

-- Partition by date for performance
CREATE TABLE event_log_2025_11 PARTITION OF event_log
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Indexes for event processing
CREATE INDEX idx_event_log_unprocessed ON event_log(processed, event_timestamp) 
    WHERE processed = FALSE;
CREATE INDEX idx_event_log_correlation ON event_log(correlation_id);
CREATE INDEX idx_event_log_service ON event_log(service_name, event_timestamp);

-- Product catalog table with change tracking
CREATE TABLE products (
    product_id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(12,2) NOT NULL,
    category_id BIGINT,
    inventory_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);

-- Trigger function for change tracking
CREATE OR REPLACE FUNCTION log_product_changes() 
RETURNS TRIGGER AS $$
DECLARE
    event_data JSONB;
    operation_type TEXT;
BEGIN
    -- Determine operation type
    IF TG_OP = 'DELETE' THEN
        operation_type := 'DELETE';
        event_data := to_jsonb(OLD);
    ELSIF TG_OP = 'UPDATE' THEN
        operation_type := 'UPDATE';
        event_data := jsonb_build_object(
            'old', to_jsonb(OLD),
            'new', to_jsonb(NEW)
        );
    ELSIF TG_OP = 'INSERT' THEN
        operation_type := 'INSERT';
        event_data := to_jsonb(NEW);
    END IF;
    
    -- Insert event log entry
    INSERT INTO event_log (
        table_name,
        operation_type, 
        record_id,
        old_data,
        new_data,
        event_type,
        correlation_id
    ) VALUES (
        TG_TABLE_NAME,
        operation_type,
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.product_id::TEXT
            ELSE NEW.product_id::TEXT
        END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE NULL END,
        'product_change',
        gen_random_uuid()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for change tracking
CREATE TRIGGER product_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION log_product_changes();

-- Complex polling-based event processing
WITH unprocessed_events AS (
    SELECT 
        event_id,
        table_name,
        operation_type,
        record_id,
        old_data,
        new_data,
        event_timestamp,
        event_type,
        correlation_id,
        
        -- Determine event priority
        CASE 
            WHEN event_type = 'product_change' AND operation_type = 'UPDATE' THEN
                CASE 
                    WHEN (new_data->>'status') != (old_data->>'status') THEN 1 -- Status changes are critical
                    WHEN (new_data->>'price')::NUMERIC != (old_data->>'price')::NUMERIC THEN 2 -- Price changes
                    WHEN (new_data->>'inventory_count')::INTEGER != (old_data->>'inventory_count')::INTEGER THEN 3 -- Inventory
                    ELSE 4 -- Other changes
                END
            WHEN operation_type = 'INSERT' THEN 2
            WHEN operation_type = 'DELETE' THEN 1
            ELSE 5
        END as priority,
        
        -- Calculate processing delay
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - event_timestamp)) as delay_seconds
        
    FROM event_log
    WHERE processed = FALSE
        AND retry_count < 3 -- Limit retry attempts
        AND (last_retry_at IS NULL OR last_retry_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
    ORDER BY priority ASC, event_timestamp ASC
    LIMIT 100 -- Process in batches
),

event_processing_plan AS (
    SELECT 
        ue.*,
        
        -- Determine target services based on event type
        CASE 
            WHEN event_type = 'product_change' THEN 
                ARRAY['inventory-service', 'catalog-service', 'search-service', 'cache-service']
            ELSE ARRAY['default-service']
        END as target_services,
        
        -- Generate event payload
        jsonb_build_object(
            'eventId', event_id,
            'eventType', event_type,
            'operationType', operation_type,
            'timestamp', event_timestamp,
            'correlationId', correlation_id,
            'data', 
                CASE 
                    WHEN operation_type = 'UPDATE' THEN 
                        jsonb_build_object(
                            'before', old_data,
                            'after', new_data,
                            'changes', (
                                SELECT jsonb_object_agg(key, value)
                                FROM jsonb_each(new_data)
                                WHERE value IS DISTINCT FROM (old_data->key)
                            )
                        )
                    WHEN operation_type = 'INSERT' THEN new_data
                    WHEN operation_type = 'DELETE' THEN old_data
                END
        ) as event_payload
        
    FROM unprocessed_events ue
),

service_notifications AS (
    SELECT 
        epp.event_id,
        epp.correlation_id,
        epp.event_payload,
        unnest(epp.target_services) as service_name,
        epp.priority,
        
        -- Service-specific payload customization
        CASE 
            WHEN unnest(epp.target_services) = 'inventory-service' THEN
                epp.event_payload || jsonb_build_object(
                    'inventoryData', 
                    jsonb_build_object(
                        'productId', epp.record_id,
                        'currentCount', (epp.event_payload->'data'->'after'->>'inventory_count')::INTEGER,
                        'previousCount', (epp.event_payload->'data'->'before'->>'inventory_count')::INTEGER
                    )
                )
            WHEN unnest(epp.target_services) = 'search-service' THEN
                epp.event_payload || jsonb_build_object(
                    'searchData',
                    jsonb_build_object(
                        'productId', epp.record_id,
                        'name', epp.event_payload->'data'->'after'->>'name',
                        'description', epp.event_payload->'data'->'after'->>'description',
                        'category', epp.event_payload->'data'->'after'->>'category_id',
                        'status', epp.event_payload->'data'->'after'->>'status'
                    )
                )
            ELSE epp.event_payload
        END as service_payload
        
    FROM event_processing_plan epp
)

SELECT 
    event_id,
    correlation_id,
    service_name,
    priority,
    service_payload,
    
    -- Generate webhook URLs or message queue topics
    CASE service_name
        WHEN 'inventory-service' THEN 'http://inventory-service/webhook/product-change'
        WHEN 'catalog-service' THEN 'http://catalog-service/api/events'
        WHEN 'search-service' THEN 'kafka://search-updates-topic'
        WHEN 'cache-service' THEN 'redis://cache-invalidation'
        ELSE 'http://default-service/webhook'
    END as target_endpoint,
    
    -- Event processing metadata
    jsonb_build_object(
        'processingAttempt', 1,
        'maxRetries', 3,
        'timeoutSeconds', 30,
        'exponentialBackoff', true
    ) as processing_config

FROM service_notifications
ORDER BY priority ASC, event_id ASC;

-- Update processed events (requires separate transaction)
UPDATE event_log 
SET processed = TRUE,
    updated_at = CURRENT_TIMESTAMP
WHERE event_id IN (
    SELECT event_id FROM unprocessed_events
);

-- Problems with traditional event processing:
-- 1. Complex trigger-based change tracking with limited filtering capabilities
-- 2. Polling-based processing introduces latency and resource waste
-- 3. Manual event routing and service coordination logic
-- 4. Limited scalability due to database-level trigger overhead
-- 5. Complex retry logic and error handling for failed event processing
-- 6. Difficult to implement real-time filtering and transformation
-- 7. No native support for distributed event processing patterns
-- 8. Complex partitioning and cleanup strategies for event log tables
-- 9. Limited integration with microservices and modern event architectures
-- 10. High operational complexity for maintaining event processing infrastructure
```

MongoDB Change Streams provide comprehensive real-time event processing capabilities:

```javascript
// MongoDB Change Streams - native real-time event processing for microservices
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('ecommerce_platform');

// Advanced Change Streams Event Processing System
class MongoChangeStreamManager {
  constructor(db) {
    this.db = db;
    this.changeStreams = new Map();
    this.eventHandlers = new Map();
    this.processingMetrics = new Map();
    
    // Event routing configuration
    this.eventRoutes = new Map([
      ['products', ['inventory-service', 'catalog-service', 'search-service', 'cache-service']],
      ['orders', ['fulfillment-service', 'payment-service', 'notification-service']],
      ['customers', ['profile-service', 'marketing-service', 'analytics-service']],
      ['inventory', ['warehouse-service', 'alert-service', 'reporting-service']]
    ]);
    
    this.serviceEndpoints = new Map([
      ['inventory-service', 'http://inventory-service:3001/webhook/events'],
      ['catalog-service', 'http://catalog-service:3002/api/events'],
      ['search-service', 'http://search-service:3003/events/index'],
      ['cache-service', 'redis://cache-cluster:6379/invalidate'],
      ['fulfillment-service', 'http://fulfillment:3004/orders/events'],
      ['payment-service', 'http://payments:3005/webhook/order-events'],
      ['notification-service', 'http://notifications:3006/events/send'],
      ['profile-service', 'http://profiles:3007/customers/events'],
      ['marketing-service', 'http://marketing:3008/events/customer'],
      ['analytics-service', 'kafka://analytics-cluster/customer-events']
    ]);
  }

  async setupComprehensiveChangeStreams() {
    console.log('Setting up comprehensive change streams for microservices architecture...');

    // Product catalog change stream with intelligent filtering
    await this.createProductChangeStream();
    
    // Order processing change stream
    await this.createOrderChangeStream();
    
    // Customer data change stream
    await this.createCustomerChangeStream();
    
    // Inventory management change stream
    await this.createInventoryChangeStream();
    
    // Cross-collection aggregated events
    await this.createAggregatedChangeStream();

    console.log('Change streams initialized for real-time event-driven architecture');
  }

  async createProductChangeStream() {
    console.log('Creating product catalog change stream...');

    const productsCollection = this.db.collection('products');
    
    // Comprehensive change stream pipeline for product events
    const pipeline = [
      {
        $match: {
          $and: [
            // Only watch specific operation types
            {
              "operationType": { 
                $in: ["insert", "update", "delete", "replace"] 
              }
            },
            
            // Filter based on significant changes
            {
              $or: [
                // New products
                { "operationType": "insert" },
                
                // Product deletions
                { "operationType": "delete" },
                
                // Critical field updates
                {
                  $and: [
                    { "operationType": "update" },
                    {
                      $or: [
                        { "updateDescription.updatedFields.status": { $exists: true } },
                        { "updateDescription.updatedFields.price": { $exists: true } },
                        { "updateDescription.updatedFields.inventory_count": { $exists: true } },
                        { "updateDescription.updatedFields.name": { $exists: true } },
                        { "updateDescription.updatedFields.category": { $exists: true } },
                        { "updateDescription.updatedFields.availability": { $exists: true } }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      
      // Add computed fields for event processing
      {
        $addFields: {
          // Event classification
          "eventSeverity": {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$operationType", "delete"] },
                  then: "critical"
                },
                {
                  case: {
                    $and: [
                      { $eq: ["$operationType", "update"] },
                      { $ne: ["$updateDescription.updatedFields.status", null] }
                    ]
                  },
                  then: "high"
                },
                {
                  case: {
                    $or: [
                      { $ne: ["$updateDescription.updatedFields.price", null] },
                      { $ne: ["$updateDescription.updatedFields.inventory_count", null] }
                    ]
                  },
                  then: "medium"
                }
              ],
              default: "low"
            }
          },
          
          // Processing metadata
          "processingMetadata": {
            "streamId": "product-changes",
            "timestamp": "$$NOW",
            "source": "mongodb-change-stream",
            "correlationId": { $toString: "$_id" }
          },
          
          // Change summary for efficient processing
          "changeSummary": {
            $cond: {
              if: { $eq: ["$operationType", "update"] },
              then: {
                "fieldsChanged": { $objectToArray: "$updateDescription.updatedFields" },
                "fieldsRemoved": "$updateDescription.removedFields",
                "changeCount": { $size: { $objectToArray: "$updateDescription.updatedFields" } }
              },
              else: null
            }
          }
        }
      }
    ];

    const productChangeStream = productsCollection.watch(pipeline, {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable'
    });

    // Event handler for product changes
    productChangeStream.on('change', async (change) => {
      try {
        await this.handleProductChange(change);
      } catch (error) {
        console.error('Error handling product change:', error);
        await this.handleEventProcessingError('products', change, error);
      }
    });

    productChangeStream.on('error', (error) => {
      console.error('Product change stream error:', error);
      this.handleChangeStreamError('products', error);
    });

    this.changeStreams.set('products', productChangeStream);
    console.log('✅ Product change stream active');
  }

  async handleProductChange(change) {
    console.log(`Processing product change: ${change.operationType} for product ${change.documentKey._id}`);
    
    const eventPayload = {
      eventId: change._id.toString(),
      eventType: 'product_change',
      operationType: change.operationType,
      timestamp: new Date(),
      correlationId: change.processingMetadata?.correlationId,
      severity: change.eventSeverity,
      
      // Document data
      documentId: change.documentKey._id,
      fullDocument: change.fullDocument,
      fullDocumentBeforeChange: change.fullDocumentBeforeChange,
      
      // Change details
      updateDescription: change.updateDescription,
      changeSummary: change.changeSummary,
      
      // Event-specific data extraction
      productData: this.extractProductEventData(change),
      
      // Processing metadata
      processingMetadata: {
        ...change.processingMetadata,
        targetServices: this.eventRoutes.get('products') || [],
        retryPolicy: {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelayMs: 1000
        }
      }
    };

    // Route event to appropriate microservices
    const targetServices = this.eventRoutes.get('products') || [];
    await this.routeEventToServices(eventPayload, targetServices);
    
    // Update processing metrics
    this.updateProcessingMetrics('products', change.operationType, 'success');
  }

  extractProductEventData(change) {
    const productData = {
      productId: change.documentKey._id,
      operation: change.operationType
    };

    switch (change.operationType) {
      case 'insert':
        productData.newProduct = {
          sku: change.fullDocument?.sku,
          name: change.fullDocument?.name,
          category: change.fullDocument?.category,
          price: change.fullDocument?.price,
          status: change.fullDocument?.status,
          inventory_count: change.fullDocument?.inventory_count
        };
        break;

      case 'update':
        productData.changes = {};
        
        // Extract specific field changes
        if (change.updateDescription?.updatedFields) {
          const updatedFields = change.updateDescription.updatedFields;
          
          if ('price' in updatedFields) {
            productData.changes.priceChange = {
              oldPrice: change.fullDocumentBeforeChange?.price,
              newPrice: updatedFields.price
            };
          }
          
          if ('inventory_count' in updatedFields) {
            productData.changes.inventoryChange = {
              oldCount: change.fullDocumentBeforeChange?.inventory_count,
              newCount: updatedFields.inventory_count,
              delta: updatedFields.inventory_count - (change.fullDocumentBeforeChange?.inventory_count || 0)
            };
          }
          
          if ('status' in updatedFields) {
            productData.changes.statusChange = {
              oldStatus: change.fullDocumentBeforeChange?.status,
              newStatus: updatedFields.status,
              isActivation: updatedFields.status === 'active' && change.fullDocumentBeforeChange?.status !== 'active',
              isDeactivation: updatedFields.status !== 'active' && change.fullDocumentBeforeChange?.status === 'active'
            };
          }
        }
        
        productData.currentState = change.fullDocument;
        break;

      case 'delete':
        productData.deletedProduct = {
          sku: change.fullDocumentBeforeChange?.sku,
          name: change.fullDocumentBeforeChange?.name,
          category: change.fullDocumentBeforeChange?.category
        };
        break;
    }

    return productData;
  }

  async createOrderChangeStream() {
    console.log('Creating order processing change stream...');

    const ordersCollection = this.db.collection('orders');
    
    const pipeline = [
      {
        $match: {
          $or: [
            // New orders
            { "operationType": "insert" },
            
            // Order status changes
            {
              $and: [
                { "operationType": "update" },
                { "updateDescription.updatedFields.status": { $exists: true } }
              ]
            },
            
            // Payment status changes
            {
              $and: [
                { "operationType": "update" },
                { "updateDescription.updatedFields.payment.status": { $exists: true } }
              ]
            },
            
            // Shipping information updates
            {
              $and: [
                { "operationType": "update" },
                {
                  $or: [
                    { "updateDescription.updatedFields.shipping.trackingNumber": { $exists: true } },
                    { "updateDescription.updatedFields.shipping.status": { $exists: true } },
                    { "updateDescription.updatedFields.shipping.actualDelivery": { $exists: true } }
                  ]
                }
              ]
            }
          ]
        }
      },
      
      {
        $addFields: {
          "eventType": {
            $switch: {
              branches: [
                { case: { $eq: ["$operationType", "insert"] }, then: "order_created" },
                {
                  case: {
                    $and: [
                      { $eq: ["$operationType", "update"] },
                      { $ne: ["$updateDescription.updatedFields.status", null] }
                    ]
                  },
                  then: "order_status_changed"
                },
                {
                  case: {
                    $ne: ["$updateDescription.updatedFields.payment.status", null]
                  },
                  then: "payment_status_changed"
                },
                {
                  case: {
                    $or: [
                      { $ne: ["$updateDescription.updatedFields.shipping.trackingNumber", null] },
                      { $ne: ["$updateDescription.updatedFields.shipping.status", null] }
                    ]
                  },
                  then: "shipping_updated"
                }
              ],
              default: "order_modified"
            }
          },
          
          "urgencyLevel": {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $eq: ["$operationType", "update"] },
                      { $eq: ["$updateDescription.updatedFields.status", "cancelled"] }
                    ]
                  },
                  then: "high"
                },
                {
                  case: {
                    $or: [
                      { $eq: ["$updateDescription.updatedFields.payment.status", "failed"] },
                      { $eq: ["$updateDescription.updatedFields.status", "processing"] }
                    ]
                  },
                  then: "medium"
                }
              ],
              default: "normal"
            }
          }
        }
      }
    ];

    const orderChangeStream = ordersCollection.watch(pipeline, {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable'
    });

    orderChangeStream.on('change', async (change) => {
      try {
        await this.handleOrderChange(change);
      } catch (error) {
        console.error('Error handling order change:', error);
        await this.handleEventProcessingError('orders', change, error);
      }
    });

    this.changeStreams.set('orders', orderChangeStream);
    console.log('✅ Order change stream active');
  }

  async handleOrderChange(change) {
    console.log(`Processing order change: ${change.eventType} for order ${change.documentKey._id}`);
    
    const eventPayload = {
      eventId: change._id.toString(),
      eventType: change.eventType,
      operationType: change.operationType,
      urgencyLevel: change.urgencyLevel,
      timestamp: new Date(),
      
      orderId: change.documentKey._id,
      orderData: this.extractOrderEventData(change),
      
      // Customer information for notifications
      customerInfo: {
        customerId: change.fullDocument?.customer?.customerId,
        email: change.fullDocument?.customer?.email,
        name: change.fullDocument?.customer?.name
      },
      
      processingMetadata: {
        targetServices: this.determineOrderTargetServices(change),
        correlationId: change.fullDocument?.correlationId || change._id.toString()
      }
    };

    await this.routeEventToServices(eventPayload, eventPayload.processingMetadata.targetServices);
    this.updateProcessingMetrics('orders', change.operationType, 'success');
  }

  extractOrderEventData(change) {
    const orderData = {
      orderId: change.documentKey._id,
      operation: change.operationType,
      eventType: change.eventType
    };

    if (change.operationType === 'insert') {
      orderData.newOrder = {
        orderNumber: change.fullDocument?.orderNumber,
        customerId: change.fullDocument?.customer?.customerId,
        totalAmount: change.fullDocument?.totals?.grandTotal,
        status: change.fullDocument?.status,
        itemCount: change.fullDocument?.items?.length || 0,
        priority: change.fullDocument?.priority
      };
    }

    if (change.operationType === 'update' && change.updateDescription?.updatedFields) {
      orderData.changes = {};
      const fields = change.updateDescription.updatedFields;
      
      if ('status' in fields) {
        orderData.changes.statusChange = {
          from: change.fullDocumentBeforeChange?.status,
          to: fields.status,
          timestamp: new Date()
        };
      }
      
      if ('payment.status' in fields || fields['payment.status']) {
        orderData.changes.paymentStatusChange = {
          from: change.fullDocumentBeforeChange?.payment?.status,
          to: fields['payment.status'] || fields.payment?.status,
          paymentMethod: change.fullDocument?.payment?.method
        };
      }
    }

    return orderData;
  }

  determineOrderTargetServices(change) {
    const baseServices = ['fulfillment-service', 'notification-service'];
    
    if (change.eventType === 'payment_status_changed') {
      baseServices.push('payment-service');
    }
    
    if (change.eventType === 'shipping_updated') {
      baseServices.push('shipping-service', 'tracking-service');
    }
    
    if (change.urgencyLevel === 'high') {
      baseServices.push('alert-service');
    }
    
    return baseServices;
  }

  async createCustomerChangeStream() {
    console.log('Creating customer data change stream...');

    const customersCollection = this.db.collection('customers');
    
    const pipeline = [
      {
        $match: {
          $or: [
            { "operationType": "insert" },
            {
              $and: [
                { "operationType": "update" },
                {
                  $or: [
                    { "updateDescription.updatedFields.email": { $exists: true } },
                    { "updateDescription.updatedFields.tier": { $exists: true } },
                    { "updateDescription.updatedFields.preferences": { $exists: true } },
                    { "updateDescription.updatedFields.status": { $exists: true } }
                  ]
                }
              ]
            }
          ]
        }
      }
    ];

    const customerChangeStream = customersCollection.watch(pipeline, {
      fullDocument: 'updateLookup'
    });

    customerChangeStream.on('change', async (change) => {
      try {
        await this.handleCustomerChange(change);
      } catch (error) {
        console.error('Error handling customer change:', error);
        await this.handleEventProcessingError('customers', change, error);
      }
    });

    this.changeStreams.set('customers', customerChangeStream);
    console.log('✅ Customer change stream active');
  }

  async handleCustomerChange(change) {
    const eventPayload = {
      eventId: change._id.toString(),
      eventType: 'customer_change',
      operationType: change.operationType,
      timestamp: new Date(),
      
      customerId: change.documentKey._id,
      customerData: {
        email: change.fullDocument?.email,
        name: change.fullDocument?.name,
        tier: change.fullDocument?.tier,
        status: change.fullDocument?.status
      },
      
      processingMetadata: {
        targetServices: ['profile-service', 'marketing-service', 'analytics-service'],
        isNewCustomer: change.operationType === 'insert'
      }
    };

    await this.routeEventToServices(eventPayload, eventPayload.processingMetadata.targetServices);
  }

  async routeEventToServices(eventPayload, targetServices) {
    console.log(`Routing event ${eventPayload.eventId} to services: ${targetServices.join(', ')}`);

    const routingPromises = targetServices.map(async (serviceName) => {
      try {
        const endpoint = this.serviceEndpoints.get(serviceName);
        if (!endpoint) {
          console.warn(`No endpoint configured for service: ${serviceName}`);
          return;
        }

        const servicePayload = this.customizePayloadForService(eventPayload, serviceName);
        await this.sendEventToService(serviceName, endpoint, servicePayload);
        
        console.log(`✅ Event sent to ${serviceName}`);
      } catch (error) {
        console.error(`❌ Failed to send event to ${serviceName}:`, error.message);
        await this.handleServiceDeliveryError(serviceName, eventPayload, error);
      }
    });

    await Promise.allSettled(routingPromises);
  }

  customizePayloadForService(eventPayload, serviceName) {
    // Clone base payload
    const servicePayload = {
      ...eventPayload,
      targetService: serviceName,
      deliveryTimestamp: new Date()
    };

    // Service-specific customization
    switch (serviceName) {
      case 'inventory-service':
        if (eventPayload.productData) {
          servicePayload.inventoryData = {
            productId: eventPayload.productData.productId,
            inventoryChange: eventPayload.productData.changes?.inventoryChange,
            currentCount: eventPayload.fullDocument?.inventory_count,
            lowStockThreshold: eventPayload.fullDocument?.low_stock_threshold
          };
        }
        break;

      case 'search-service':
        if (eventPayload.productData) {
          servicePayload.searchData = {
            productId: eventPayload.productData.productId,
            indexOperation: eventPayload.operationType === 'delete' ? 'remove' : 'upsert',
            document: eventPayload.operationType !== 'delete' ? {
              name: eventPayload.fullDocument?.name,
              description: eventPayload.fullDocument?.description,
              category: eventPayload.fullDocument?.category,
              tags: eventPayload.fullDocument?.tags,
              searchable: eventPayload.fullDocument?.status === 'active'
            } : null
          };
        }
        break;

      case 'notification-service':
        if (eventPayload.customerInfo) {
          servicePayload.notificationData = {
            recipientEmail: eventPayload.customerInfo.email,
            recipientName: eventPayload.customerInfo.name,
            notificationType: this.determineNotificationType(eventPayload),
            priority: eventPayload.urgencyLevel || 'normal',
            templateData: this.buildNotificationTemplateData(eventPayload)
          };
        }
        break;

      case 'cache-service':
        servicePayload.cacheOperations = this.determineCacheOperations(eventPayload);
        break;
    }

    return servicePayload;
  }

  async sendEventToService(serviceName, endpoint, payload) {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      // HTTP webhook delivery
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Source': 'mongodb-change-stream',
          'X-Event-ID': payload.eventId,
          'X-Correlation-ID': payload.processingMetadata?.correlationId
        },
        body: JSON.stringify(payload),
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } else if (endpoint.startsWith('kafka://')) {
      // Kafka message delivery (mock implementation)
      await this.sendToKafka(endpoint, payload);
      
    } else if (endpoint.startsWith('redis://')) {
      // Redis cache operations (mock implementation)
      await this.sendToRedis(endpoint, payload);
    }
  }

  async sendToKafka(endpoint, payload) {
    // Mock Kafka implementation
    console.log(`[KAFKA] Sending to ${endpoint}:`, JSON.stringify(payload, null, 2));
  }

  async sendToRedis(endpoint, payload) {
    // Mock Redis implementation
    console.log(`[REDIS] Cache operation at ${endpoint}:`, JSON.stringify(payload.cacheOperations, null, 2));
  }

  determineNotificationType(eventPayload) {
    switch (eventPayload.eventType) {
      case 'order_created': return 'order_confirmation';
      case 'order_status_changed': 
        if (eventPayload.orderData?.changes?.statusChange?.to === 'shipped') return 'order_shipped';
        if (eventPayload.orderData?.changes?.statusChange?.to === 'delivered') return 'order_delivered';
        return 'order_update';
      case 'payment_status_changed': return 'payment_update';
      default: return 'general_update';
    }
  }

  buildNotificationTemplateData(eventPayload) {
    const templateData = {
      eventType: eventPayload.eventType,
      timestamp: eventPayload.timestamp
    };

    if (eventPayload.orderData) {
      templateData.order = {
        id: eventPayload.orderId,
        number: eventPayload.orderData.newOrder?.orderNumber,
        status: eventPayload.orderData.changes?.statusChange?.to || eventPayload.orderData.newOrder?.status,
        total: eventPayload.orderData.newOrder?.totalAmount
      };
    }

    return templateData;
  }

  determineCacheOperations(eventPayload) {
    const operations = [];

    if (eventPayload.eventType === 'product_change') {
      operations.push({
        operation: 'invalidate',
        keys: [
          `product:${eventPayload.productData?.productId}`,
          `products:category:${eventPayload.fullDocument?.category}`,
          'products:featured',
          'products:search:*'
        ]
      });
    }

    if (eventPayload.eventType === 'order_created' || eventPayload.eventType.includes('order_')) {
      operations.push({
        operation: 'invalidate',
        keys: [
          `customer:${eventPayload.customerInfo?.customerId}:orders`,
          `order:${eventPayload.orderId}`
        ]
      });
    }

    return operations;
  }

  async createAggregatedChangeStream() {
    console.log('Creating aggregated change stream for cross-collection events...');

    // Watch multiple collections for coordinated events
    const aggregatedPipeline = [
      {
        $match: {
          $and: [
            {
              "ns.coll": { $in: ["products", "orders", "inventory"] }
            },
            {
              $or: [
                { "operationType": "insert" },
                { "operationType": "update" },
                { "operationType": "delete" }
              ]
            }
          ]
        }
      },
      
      {
        $addFields: {
          "crossCollectionEventType": {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $eq: ["$ns.coll", "orders"] },
                      { $eq: ["$operationType", "insert"] }
                    ]
                  },
                  then: "new_order_created"
                },
                {
                  case: {
                    $and: [
                      { $eq: ["$ns.coll", "inventory"] },
                      { $lt: ["$fullDocument.quantity", 10] }
                    ]
                  },
                  then: "low_stock_alert"
                },
                {
                  case: {
                    $and: [
                      { $eq: ["$ns.coll", "products"] },
                      { $eq: ["$updateDescription.updatedFields.status", "discontinued"] }
                    ]
                  },
                  then: "product_discontinued"
                }
              ],
              default: "standard_change"
            }
          }
        }
      }
    ];

    const aggregatedChangeStream = this.db.watch(aggregatedPipeline, {
      fullDocument: 'updateLookup'
    });

    aggregatedChangeStream.on('change', async (change) => {
      try {
        await this.handleCrossCollectionEvent(change);
      } catch (error) {
        console.error('Error handling cross-collection event:', error);
      }
    });

    this.changeStreams.set('aggregated', aggregatedChangeStream);
    console.log('✅ Aggregated change stream active');
  }

  async handleCrossCollectionEvent(change) {
    console.log(`Processing cross-collection event: ${change.crossCollectionEventType}`);

    if (change.crossCollectionEventType === 'new_order_created') {
      // Trigger inventory reservation
      await this.triggerInventoryReservation(change.fullDocument);
    } else if (change.crossCollectionEventType === 'low_stock_alert') {
      // Send low stock notifications
      await this.triggerLowStockAlert(change.fullDocument);
    } else if (change.crossCollectionEventType === 'product_discontinued') {
      // Handle product discontinuation workflow
      await this.handleProductDiscontinuation(change.documentKey._id);
    }
  }

  async triggerInventoryReservation(order) {
    console.log(`Triggering inventory reservation for order ${order._id}`);
    // Implementation would coordinate with inventory service
  }

  async triggerLowStockAlert(inventoryRecord) {
    console.log(`Triggering low stock alert for product ${inventoryRecord.productId}`);
    // Implementation would send alerts to purchasing team
  }

  async handleProductDiscontinuation(productId) {
    console.log(`Handling product discontinuation for ${productId}`);
    // Implementation would update related systems and cancel pending orders
  }

  updateProcessingMetrics(collection, operation, status) {
    const key = `${collection}-${operation}`;
    const current = this.processingMetrics.get(key) || { success: 0, error: 0 };
    current[status]++;
    this.processingMetrics.set(key, current);
  }

  async handleEventProcessingError(collection, change, error) {
    console.error(`Event processing error in ${collection}:`, error);
    
    // Log error for monitoring
    await this.db.collection('event_processing_errors').insertOne({
      collection,
      changeId: change._id,
      error: error.message,
      timestamp: new Date(),
      changeDetails: {
        operationType: change.operationType,
        documentKey: change.documentKey
      }
    });

    this.updateProcessingMetrics(collection, change.operationType, 'error');
  }

  async handleServiceDeliveryError(serviceName, eventPayload, error) {
    // Implement retry logic
    const retryKey = `${serviceName}-${eventPayload.eventId}`;
    console.warn(`Service delivery failed for ${serviceName}, scheduling retry...`);
    
    // Store for retry processing (implementation would use a proper queue)
    setTimeout(async () => {
      try {
        const endpoint = this.serviceEndpoints.get(serviceName);
        const servicePayload = this.customizePayloadForService(eventPayload, serviceName);
        await this.sendEventToService(serviceName, endpoint, servicePayload);
        console.log(`✅ Retry successful for ${serviceName}`);
      } catch (retryError) {
        console.error(`❌ Retry failed for ${serviceName}:`, retryError.message);
      }
    }, 5000); // 5 second retry delay
  }

  handleChangeStreamError(streamName, error) {
    console.error(`Change stream error for ${streamName}:`, error);
    
    // Implement stream recovery logic
    setTimeout(() => {
      console.log(`Attempting to recover change stream: ${streamName}`);
      // Recovery implementation would recreate the stream
    }, 10000);
  }

  async getProcessingMetrics() {
    const metrics = {
      activeStreams: Array.from(this.changeStreams.keys()),
      processingStats: Object.fromEntries(this.processingMetrics),
      timestamp: new Date()
    };
    
    return metrics;
  }

  async shutdown() {
    console.log('Shutting down change streams...');
    
    for (const [streamName, stream] of this.changeStreams) {
      await stream.close();
      console.log(`✅ Closed change stream: ${streamName}`);
    }
    
    this.changeStreams.clear();
    console.log('All change streams closed');
  }
}

// Export the change stream manager
module.exports = { MongoChangeStreamManager };

// Benefits of MongoDB Change Streams for Microservices:
// - Real-time event processing without polling overhead
// - Comprehensive filtering and transformation capabilities at the database level
// - Native support for microservices event routing and coordination
// - Automatic retry and error handling for distributed event processing
// - Cross-collection event aggregation for complex business workflows
// - Integration with existing MongoDB infrastructure without additional components
// - Scalable event processing that grows with your data and application needs
// - Built-in support for event ordering and consistency guarantees
// - Comprehensive monitoring and metrics for event processing pipelines
// - SQL-familiar event processing patterns through QueryLeaf integration
```

## Understanding MongoDB Change Streams Architecture

### Real-Time Event Processing Patterns

MongoDB Change Streams enable sophisticated real-time architectures with comprehensive event processing capabilities:

```javascript
// Advanced event processing patterns for production microservices
class AdvancedEventProcessor {
  constructor(db) {
    this.db = db;
    this.eventProcessors = new Map();
    this.eventFilters = new Map();
    this.businessRules = new Map();
  }

  async setupEventDrivenWorkflows() {
    console.log('Setting up advanced event-driven workflows...');

    // Workflow 1: Order fulfillment coordination
    await this.createOrderFulfillmentWorkflow();
    
    // Workflow 2: Inventory management automation
    await this.createInventoryManagementWorkflow();
    
    // Workflow 3: Customer lifecycle events
    await this.createCustomerLifecycleWorkflow();
    
    // Workflow 4: Real-time analytics triggers
    await this.createAnalyticsTriggerWorkflow();

    console.log('Event-driven workflows active');
  }

  async createOrderFulfillmentWorkflow() {
    console.log('Creating order fulfillment workflow...');

    // Multi-stage fulfillment process triggered by order changes
    const fulfillmentPipeline = [
      {
        $match: {
          $and: [
            { "ns.coll": "orders" },
            {
              $or: [
                // New order created
                { "operationType": "insert" },
                
                // Order status progression
                {
                  $and: [
                    { "operationType": "update" },
                    {
                      "updateDescription.updatedFields.status": {
                        $in: ["confirmed", "processing", "fulfilling", "shipped"]
                      }
                    }
                  ]
                },
                
                // Payment confirmation
                {
                  $and: [
                    { "operationType": "update" },
                    { "updateDescription.updatedFields.payment.status": "captured" }
                  ]
                }
              ]
            }
          ]
        }
      },
      
      {
        $addFields: {
          "workflowStage": {
            $switch: {
              branches: [
                { case: { $eq: ["$operationType", "insert"] }, then: "order_received" },
                { case: { $eq: ["$updateDescription.updatedFields.payment.status", "captured"] }, then: "payment_confirmed" },
                { case: { $eq: ["$updateDescription.updatedFields.status", "confirmed"] }, then: "order_confirmed" },
                { case: { $eq: ["$updateDescription.updatedFields.status", "processing"] }, then: "processing_started" },
                { case: { $eq: ["$updateDescription.updatedFields.status", "fulfilling"] }, then: "fulfillment_started" },
                { case: { $eq: ["$updateDescription.updatedFields.status", "shipped"] }, then: "order_shipped" }
              ],
              default: "unknown_stage"
            }
          },
          
          "nextActions": {
            $switch: {
              branches: [
                { 
                  case: { $eq: ["$operationType", "insert"] },
                  then: ["validate_inventory", "process_payment", "send_confirmation"]
                },
                { 
                  case: { $eq: ["$updateDescription.updatedFields.payment.status", "captured"] },
                  then: ["reserve_inventory", "generate_pick_list", "notify_warehouse"]
                },
                { 
                  case: { $eq: ["$updateDescription.updatedFields.status", "processing"] },
                  then: ["allocate_warehouse", "schedule_picking", "update_eta"]
                },
                { 
                  case: { $eq: ["$updateDescription.updatedFields.status", "shipped"] },
                  then: ["send_tracking", "schedule_delivery_updates", "prepare_feedback_request"]
                }
              ],
              default: []
            }
          }
        }
      }
    ];

    const fulfillmentStream = this.db.watch(fulfillmentPipeline, {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable'
    });

    fulfillmentStream.on('change', async (change) => {
      await this.processFulfillmentWorkflow(change);
    });

    this.eventProcessors.set('fulfillment', fulfillmentStream);
  }

  async processFulfillmentWorkflow(change) {
    const workflowContext = {
      orderId: change.documentKey._id,
      stage: change.workflowStage,
      nextActions: change.nextActions,
      orderData: change.fullDocument,
      timestamp: new Date()
    };

    console.log(`Processing fulfillment workflow: ${workflowContext.stage} for order ${workflowContext.orderId}`);

    // Execute next actions based on workflow stage
    for (const action of workflowContext.nextActions) {
      try {
        await this.executeWorkflowAction(action, workflowContext);
      } catch (error) {
        console.error(`Failed to execute workflow action ${action}:`, error);
        await this.handleWorkflowError(workflowContext, action, error);
      }
    }

    // Record workflow progress
    await this.recordWorkflowProgress(workflowContext);
  }

  async executeWorkflowAction(action, context) {
    console.log(`Executing workflow action: ${action}`);

    const actionHandlers = {
      'validate_inventory': () => this.validateInventoryAvailability(context),
      'process_payment': () => this.initiatePaymentProcessing(context),
      'send_confirmation': () => this.sendOrderConfirmation(context),
      'reserve_inventory': () => this.reserveInventoryItems(context),
      'generate_pick_list': () => this.generateWarehousePickList(context),
      'notify_warehouse': () => this.notifyWarehouseSystems(context),
      'allocate_warehouse': () => this.allocateOptimalWarehouse(context),
      'schedule_picking': () => this.schedulePickingSlot(context),
      'update_eta': () => this.updateEstimatedDelivery(context),
      'send_tracking': () => this.sendTrackingInformation(context),
      'schedule_delivery_updates': () => this.scheduleDeliveryNotifications(context),
      'prepare_feedback_request': () => this.prepareFeedbackCollection(context)
    };

    const handler = actionHandlers[action];
    if (handler) {
      await handler();
    } else {
      console.warn(`No handler found for workflow action: ${action}`);
    }
  }

  async createInventoryManagementWorkflow() {
    console.log('Creating inventory management workflow...');

    const inventoryPipeline = [
      {
        $match: {
          $and: [
            {
              $or: [
                { "ns.coll": "products" },
                { "ns.coll": "inventory" },
                { "ns.coll": "orders" }
              ]
            },
            {
              $or: [
                // Product inventory updates
                {
                  $and: [
                    { "ns.coll": "products" },
                    { "updateDescription.updatedFields.inventory_count": { $exists: true } }
                  ]
                },
                
                // Direct inventory updates  
                {
                  $and: [
                    { "ns.coll": "inventory" },
                    { "operationType": "update" }
                  ]
                },
                
                // New orders affecting inventory
                {
                  $and: [
                    { "ns.coll": "orders" },
                    { "operationType": "insert" }
                  ]
                }
              ]
            }
          ]
        }
      },
      
      {
        $addFields: {
          "inventoryEventType": {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $eq: ["$ns.coll", "products"] },
                      { $lt: ["$updateDescription.updatedFields.inventory_count", 10] }
                    ]
                  },
                  then: "low_stock_alert"
                },
                {
                  case: {
                    $and: [
                      { $eq: ["$ns.coll", "products"] },
                      { $eq: ["$updateDescription.updatedFields.inventory_count", 0] }
                    ]
                  },
                  then: "out_of_stock"
                },
                {
                  case: {
                    $and: [
                      { $eq: ["$ns.coll", "orders"] },
                      { $eq: ["$operationType", "insert"] }
                    ]
                  },
                  then: "inventory_reservation_needed"
                }
              ],
              default: "inventory_change"
            }
          }
        }
      }
    ];

    const inventoryStream = this.db.watch(inventoryPipeline, {
      fullDocument: 'updateLookup'
    });

    inventoryStream.on('change', async (change) => {
      await this.processInventoryWorkflow(change);
    });

    this.eventProcessors.set('inventory', inventoryStream);
  }

  async processInventoryWorkflow(change) {
    const eventType = change.inventoryEventType;
    
    console.log(`Processing inventory workflow: ${eventType}`);

    switch (eventType) {
      case 'low_stock_alert':
        await this.handleLowStockAlert(change);
        break;
        
      case 'out_of_stock':
        await this.handleOutOfStock(change);
        break;
        
      case 'inventory_reservation_needed':
        await this.handleInventoryReservation(change);
        break;
        
      default:
        await this.handleGeneralInventoryChange(change);
    }
  }

  async handleLowStockAlert(change) {
    const productId = change.documentKey._id;
    const currentCount = change.updateDescription?.updatedFields?.inventory_count;
    
    console.log(`Low stock alert: Product ${productId} has ${currentCount} units remaining`);

    // Trigger multiple actions
    await Promise.all([
      this.notifyPurchasingTeam(productId, currentCount),
      this.updateProductVisibility(productId, 'low_stock'),
      this.triggerReplenishmentOrder(productId),
      this.notifyCustomersOnWaitlist(productId)
    ]);
  }

  async handleOutOfStock(change) {
    const productId = change.documentKey._id;
    
    console.log(`Out of stock: Product ${productId}`);

    await Promise.all([
      this.updateProductStatus(productId, 'out_of_stock'),
      this.pauseMarketingCampaigns(productId),
      this.notifyCustomersBackorder(productId),
      this.createEmergencyReplenishment(productId)
    ]);
  }

  async createCustomerLifecycleWorkflow() {
    console.log('Creating customer lifecycle workflow...');

    const customerPipeline = [
      {
        $match: {
          $and: [
            {
              $or: [
                { "ns.coll": "customers" },
                { "ns.coll": "orders" }
              ]
            },
            {
              $or: [
                // New customer registration
                {
                  $and: [
                    { "ns.coll": "customers" },
                    { "operationType": "insert" }
                  ]
                },
                
                // Customer tier changes
                {
                  $and: [
                    { "ns.coll": "customers" },
                    { "updateDescription.updatedFields.tier": { $exists: true } }
                  ]
                },
                
                // First order placement
                {
                  $and: [
                    { "ns.coll": "orders" },
                    { "operationType": "insert" }
                  ]
                }
              ]
            }
          ]
        }
      }
    ];

    const customerStream = this.db.watch(customerPipeline, {
      fullDocument: 'updateLookup'
    });

    customerStream.on('change', async (change) => {
      await this.processCustomerLifecycleEvent(change);
    });

    this.eventProcessors.set('customer_lifecycle', customerStream);
  }

  async processCustomerLifecycleEvent(change) {
    if (change.ns.coll === 'customers' && change.operationType === 'insert') {
      await this.handleNewCustomerOnboarding(change.fullDocument);
    } else if (change.ns.coll === 'orders' && change.operationType === 'insert') {
      await this.handleCustomerOrderPlaced(change.fullDocument);
    }
  }

  async handleNewCustomerOnboarding(customer) {
    console.log(`Starting onboarding workflow for new customer: ${customer._id}`);

    const onboardingTasks = [
      { action: 'send_welcome_email', delay: 0 },
      { action: 'create_loyalty_account', delay: 1000 },
      { action: 'suggest_initial_products', delay: 5000 },
      { action: 'schedule_follow_up', delay: 86400000 } // 24 hours
    ];

    for (const task of onboardingTasks) {
      setTimeout(async () => {
        await this.executeCustomerAction(task.action, customer);
      }, task.delay);
    }
  }

  async executeCustomerAction(action, customer) {
    console.log(`Executing customer action: ${action} for customer ${customer._id}`);
    
    const actionHandlers = {
      'send_welcome_email': () => this.sendWelcomeEmail(customer),
      'create_loyalty_account': () => this.createLoyaltyAccount(customer),
      'suggest_initial_products': () => this.suggestProducts(customer),
      'schedule_follow_up': () => this.scheduleFollowUp(customer)
    };

    const handler = actionHandlers[action];
    if (handler) {
      await handler();
    }
  }

  // Service integration methods (mock implementations)
  async validateInventoryAvailability(context) {
    console.log(`✅ Validating inventory for order ${context.orderId}`);
  }

  async initiatePaymentProcessing(context) {
    console.log(`✅ Initiating payment processing for order ${context.orderId}`);
  }

  async sendOrderConfirmation(context) {
    console.log(`✅ Sending order confirmation for order ${context.orderId}`);
  }

  async notifyPurchasingTeam(productId, currentCount) {
    console.log(`✅ Notifying purchasing team: Product ${productId} has ${currentCount} units`);
  }

  async sendWelcomeEmail(customer) {
    console.log(`✅ Sending welcome email to ${customer.email}`);
  }

  async recordWorkflowProgress(context) {
    await this.db.collection('workflow_progress').insertOne({
      orderId: context.orderId,
      stage: context.stage,
      actions: context.nextActions,
      timestamp: context.timestamp,
      status: 'completed'
    });
  }

  async handleWorkflowError(context, action, error) {
    console.error(`Workflow error in ${action} for order ${context.orderId}:`, error.message);
    
    await this.db.collection('workflow_errors').insertOne({
      orderId: context.orderId,
      stage: context.stage,
      failedAction: action,
      error: error.message,
      timestamp: new Date(),
      retryCount: 0
    });
  }

  async getWorkflowMetrics() {
    const activeProcessors = Array.from(this.eventProcessors.keys());
    
    return {
      activeWorkflows: activeProcessors.length,
      processorNames: activeProcessors,
      timestamp: new Date()
    };
  }

  async shutdown() {
    console.log('Shutting down event processors...');
    
    for (const [name, processor] of this.eventProcessors) {
      await processor.close();
      console.log(`✅ Closed event processor: ${name}`);
    }
    
    this.eventProcessors.clear();
  }
}

// Export the advanced event processor
module.exports = { AdvancedEventProcessor };
```

## SQL-Style Change Stream Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Change Streams and event processing:

```sql
-- QueryLeaf change stream operations with SQL-familiar syntax

-- Create change stream listener with SQL-style syntax
CREATE CHANGE_STREAM product_changes AS
SELECT 
  operation_type,
  document_key,
  full_document,
  full_document_before_change,
  update_description,
  
  -- Event classification
  CASE 
    WHEN operation_type = 'delete' THEN 'critical'
    WHEN operation_type = 'update' AND update_description.updated_fields ? 'status' THEN 'high'
    WHEN operation_type = 'update' AND (update_description.updated_fields ? 'price' OR update_description.updated_fields ? 'inventory_count') THEN 'medium'
    ELSE 'low'
  END as event_severity,
  
  -- Change summary
  CASE 
    WHEN operation_type = 'update' THEN 
      JSON_BUILD_OBJECT(
        'fields_changed', JSON_ARRAY_LENGTH(JSON_KEYS(update_description.updated_fields)),
        'key_changes', ARRAY(
          SELECT key FROM JSON_EACH_TEXT(update_description.updated_fields) WHERE key IN ('status', 'price', 'inventory_count')
        )
      )
    ELSE NULL
  END as change_summary,
  
  CURRENT_TIMESTAMP as processing_timestamp
  
FROM CHANGE_STREAM('products')
WHERE 
  operation_type IN ('insert', 'update', 'delete')
  AND (
    operation_type != 'update' OR
    (
      update_description.updated_fields ? 'status' OR
      update_description.updated_fields ? 'price' OR  
      update_description.updated_fields ? 'inventory_count' OR
      update_description.updated_fields ? 'name' OR
      update_description.updated_fields ? 'category'
    )
  );

-- Advanced change stream with business rules
CREATE CHANGE_STREAM order_workflow AS
WITH order_events AS (
  SELECT 
    operation_type,
    document_key.order_id,
    full_document,
    update_description,
    
    -- Workflow stage determination
    CASE 
      WHEN operation_type = 'insert' THEN 'order_created'
      WHEN operation_type = 'update' AND update_description.updated_fields ? 'status' THEN
        CASE update_description.updated_fields.status
          WHEN 'confirmed' THEN 'order_confirmed'
          WHEN 'processing' THEN 'processing_started'
          WHEN 'shipped' THEN 'order_shipped' 
          WHEN 'delivered' THEN 'order_completed'
          WHEN 'cancelled' THEN 'order_cancelled'
          ELSE 'status_updated'
        END
      WHEN operation_type = 'update' AND update_description.updated_fields ? 'payment.status' THEN 'payment_updated'
      ELSE 'order_modified'
    END as workflow_stage,
    
    -- Priority level
    CASE 
      WHEN operation_type = 'update' AND update_description.updated_fields.status = 'cancelled' THEN 'urgent'
      WHEN operation_type = 'insert' AND full_document.totals.grand_total > 1000 THEN 'high'
      WHEN operation_type = 'update' AND update_description.updated_fields ? 'payment.status' THEN 'medium'
      ELSE 'normal'
    END as priority_level,
    
    -- Next actions determination
    CASE 
      WHEN operation_type = 'insert' THEN 
        ARRAY['validate_inventory', 'process_payment', 'send_confirmation']
      WHEN operation_type = 'update' AND update_description.updated_fields.payment.status = 'captured' THEN
        ARRAY['reserve_inventory', 'notify_warehouse', 'update_eta']
      WHEN operation_type = 'update' AND update_description.updated_fields.status = 'processing' THEN
        ARRAY['allocate_warehouse', 'generate_pick_list', 'schedule_picking']
      WHEN operation_type = 'update' AND update_description.updated_fields.status = 'shipped' THEN
        ARRAY['send_tracking', 'schedule_delivery_updates', 'prepare_feedback']
      ELSE ARRAY[]::TEXT[]
    END as next_actions,
    
    CURRENT_TIMESTAMP as event_timestamp
    
  FROM CHANGE_STREAM('orders')
  WHERE operation_type IN ('insert', 'update')
),

workflow_routing AS (
  SELECT 
    oe.*,
    
    -- Determine target services based on workflow stage
    CASE workflow_stage
      WHEN 'order_created' THEN 
        ARRAY['inventory-service', 'payment-service', 'notification-service']
      WHEN 'payment_updated' THEN
        ARRAY['payment-service', 'fulfillment-service', 'accounting-service']
      WHEN 'order_shipped' THEN
        ARRAY['shipping-service', 'tracking-service', 'notification-service']
      WHEN 'order_cancelled' THEN
        ARRAY['inventory-service', 'payment-service', 'notification-service', 'analytics-service']
      ELSE ARRAY['fulfillment-service']
    END as target_services,
    
    -- Service-specific payloads
    JSON_BUILD_OBJECT(
      'event_id', GENERATE_UUID(),
      'event_type', workflow_stage,
      'priority', priority_level,
      'order_id', order_id,
      'customer_id', full_document.customer.customer_id,
      'order_total', full_document.totals.grand_total,
      'next_actions', next_actions,
      'timestamp', event_timestamp
    ) as event_payload
    
  FROM order_events oe
)

SELECT 
  order_id,
  workflow_stage,
  priority_level,
  UNNEST(target_services) as service_name,
  event_payload,
  
  -- Service endpoint routing
  CASE UNNEST(target_services)
    WHEN 'inventory-service' THEN 'http://inventory-service:3001/webhook/orders'
    WHEN 'payment-service' THEN 'http://payment-service:3002/events/orders'
    WHEN 'notification-service' THEN 'http://notification-service:3003/events/order'
    WHEN 'fulfillment-service' THEN 'http://fulfillment-service:3004/orders/events'
    WHEN 'shipping-service' THEN 'http://shipping-service:3005/orders/shipping'
    ELSE 'http://default-service:3000/webhook'
  END as target_endpoint,
  
  -- Delivery configuration
  JSON_BUILD_OBJECT(
    'timeout_ms', 10000,
    'retry_attempts', 3,
    'retry_backoff', 'exponential'
  ) as delivery_config

FROM workflow_routing
WHERE array_length(target_services, 1) > 0
ORDER BY 
  CASE priority_level
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  event_timestamp ASC;

-- Cross-collection change aggregation
CREATE CHANGE_STREAM business_events AS
WITH cross_collection_changes AS (
  SELECT 
    namespace.collection as source_collection,
    operation_type,
    document_key,
    full_document,
    update_description,
    CURRENT_TIMESTAMP as change_timestamp
    
  FROM CHANGE_STREAM_DATABASE()
  WHERE namespace.collection IN ('products', 'orders', 'customers', 'inventory')
),

business_event_classification AS (
  SELECT 
    ccc.*,
    
    -- Business event type determination
    CASE 
      WHEN source_collection = 'orders' AND operation_type = 'insert' THEN 'new_sale'
      WHEN source_collection = 'customers' AND operation_type = 'insert' THEN 'customer_acquisition'
      WHEN source_collection = 'products' AND operation_type = 'update' AND 
           update_description.updated_fields ? 'inventory_count' AND 
           (update_description.updated_fields.inventory_count)::INTEGER < 10 THEN 'low_inventory'
      WHEN source_collection = 'orders' AND operation_type = 'update' AND
           update_description.updated_fields.status = 'cancelled' THEN 'order_cancellation'
      ELSE 'standard_change'
    END as business_event_type,
    
    -- Impact level assessment  
    CASE 
      WHEN source_collection = 'orders' AND full_document.totals.grand_total > 5000 THEN 'high_value'
      WHEN source_collection = 'products' AND update_description.updated_fields.inventory_count = 0 THEN 'critical'
      WHEN source_collection = 'customers' AND full_document.tier = 'enterprise' THEN 'vip'
      ELSE 'standard'
    END as impact_level,
    
    -- Coordinated actions needed
    CASE business_event_type
      WHEN 'new_sale' THEN ARRAY['update_analytics', 'check_inventory', 'process_loyalty_points']
      WHEN 'customer_acquisition' THEN ARRAY['send_welcome', 'setup_recommendations', 'track_source']
      WHEN 'low_inventory' THEN ARRAY['alert_purchasing', 'update_website', 'notify_subscribers']
      WHEN 'order_cancellation' THEN ARRAY['release_inventory', 'process_refund', 'update_analytics']
      ELSE ARRAY[]::TEXT[]
    END as coordinated_actions
    
  FROM cross_collection_changes ccc
),

event_aggregation AS (
  SELECT 
    bec.*,
    
    -- Aggregate related changes within time window
    COUNT(*) OVER (
      PARTITION BY business_event_type, impact_level 
      ORDER BY change_timestamp 
      RANGE BETWEEN INTERVAL '5 minutes' PRECEDING AND CURRENT ROW
    ) as related_events_count,
    
    -- Time since last similar event
    EXTRACT(EPOCH FROM (
      change_timestamp - LAG(change_timestamp) OVER (
        PARTITION BY business_event_type 
        ORDER BY change_timestamp
      )
    )) as seconds_since_last_similar
    
  FROM business_event_classification bec
)

SELECT 
  business_event_type,
  impact_level,
  source_collection,
  document_key,
  related_events_count,
  coordinated_actions,
  
  -- Event batching for efficiency
  CASE 
    WHEN related_events_count > 5 AND seconds_since_last_similar < 300 THEN 'batch_process'
    WHEN impact_level = 'critical' THEN 'immediate_process'
    ELSE 'normal_process'
  END as processing_mode,
  
  -- Comprehensive event payload
  JSON_BUILD_OBJECT(
    'event_id', GENERATE_UUID(),
    'business_event_type', business_event_type,
    'impact_level', impact_level,
    'source_collection', source_collection,
    'operation_type', operation_type,
    'document_id', document_key,
    'full_document', full_document,
    'coordinated_actions', coordinated_actions,
    'related_events_count', related_events_count,
    'processing_mode', processing_mode,
    'timestamp', change_timestamp
  ) as event_payload,
  
  change_timestamp

FROM event_aggregation
WHERE business_event_type != 'standard_change'
ORDER BY 
  CASE impact_level 
    WHEN 'critical' THEN 1
    WHEN 'high_value' THEN 2  
    WHEN 'vip' THEN 3
    ELSE 4
  END,
  change_timestamp DESC;

-- Change stream monitoring and analytics
CREATE MATERIALIZED VIEW change_stream_analytics AS
WITH change_stream_metrics AS (
  SELECT 
    DATE_TRUNC('hour', event_timestamp) as hour_bucket,
    source_collection,
    operation_type,
    business_event_type,
    impact_level,
    
    -- Volume metrics
    COUNT(*) as event_count,
    COUNT(DISTINCT document_key) as unique_documents,
    
    -- Processing metrics
    AVG(processing_latency_ms) as avg_processing_latency,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_latency_ms) as p95_processing_latency,
    
    -- Success rate
    COUNT(*) FILTER (WHERE processing_status = 'success') as successful_events,
    COUNT(*) FILTER (WHERE processing_status = 'failed') as failed_events,
    COUNT(*) FILTER (WHERE processing_status = 'retry') as retry_events,
    
    -- Service delivery metrics
    AVG(service_delivery_time_ms) as avg_service_delivery_time,
    COUNT(*) FILTER (WHERE service_delivery_success = true) as successful_deliveries
    
  FROM change_stream_events_log
  WHERE event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY 
    DATE_TRUNC('hour', event_timestamp),
    source_collection,
    operation_type, 
    business_event_type,
    impact_level
),

performance_analysis AS (
  SELECT 
    csm.*,
    
    -- Success rates
    ROUND((successful_events::numeric / NULLIF(event_count, 0)) * 100, 2) as success_rate_percent,
    ROUND((successful_deliveries::numeric / NULLIF(event_count, 0)) * 100, 2) as delivery_success_rate_percent,
    
    -- Performance health score
    CASE 
      WHEN avg_processing_latency <= 100 AND success_rate_percent >= 95 THEN 'excellent'
      WHEN avg_processing_latency <= 500 AND success_rate_percent >= 90 THEN 'good'
      WHEN avg_processing_latency <= 1000 AND success_rate_percent >= 85 THEN 'fair'
      ELSE 'poor'
    END as performance_health,
    
    -- Trend analysis
    LAG(event_count) OVER (
      PARTITION BY source_collection, business_event_type 
      ORDER BY hour_bucket
    ) as previous_hour_count,
    
    LAG(avg_processing_latency) OVER (
      PARTITION BY source_collection, business_event_type
      ORDER BY hour_bucket  
    ) as previous_hour_latency
    
  FROM change_stream_metrics csm
)

SELECT 
  TO_CHAR(hour_bucket, 'YYYY-MM-DD HH24:00') as monitoring_hour,
  source_collection,
  business_event_type,
  impact_level,
  event_count,
  unique_documents,
  
  -- Performance metrics
  ROUND(avg_processing_latency::numeric, 2) as avg_processing_latency_ms,
  ROUND(p95_processing_latency::numeric, 2) as p95_processing_latency_ms,
  success_rate_percent,
  delivery_success_rate_percent,
  performance_health,
  
  -- Volume trends
  CASE 
    WHEN previous_hour_count IS NOT NULL THEN
      ROUND(((event_count - previous_hour_count)::numeric / NULLIF(previous_hour_count, 0)) * 100, 1)
    ELSE NULL
  END as volume_change_percent,
  
  -- Performance trends
  CASE 
    WHEN previous_hour_latency IS NOT NULL THEN
      ROUND(((avg_processing_latency - previous_hour_latency)::numeric / NULLIF(previous_hour_latency, 0)) * 100, 1)
    ELSE NULL
  END as latency_change_percent,
  
  -- Health indicators
  CASE 
    WHEN performance_health = 'excellent' THEN '🟢 Optimal'
    WHEN performance_health = 'good' THEN '🟡 Good'
    WHEN performance_health = 'fair' THEN '🟠 Attention Needed'
    ELSE '🔴 Critical'
  END as health_indicator,
  
  -- Recommendations
  CASE 
    WHEN failed_events > event_count * 0.05 THEN 'High failure rate - investigate error causes'
    WHEN avg_processing_latency > 1000 THEN 'High latency - optimize event processing'
    WHEN retry_events > event_count * 0.1 THEN 'High retry rate - check service availability'
    WHEN event_count > previous_hour_count * 2 THEN 'Unusual volume spike - monitor capacity'
    ELSE 'Performance within normal parameters'
  END as recommendation

FROM performance_analysis
WHERE hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY hour_bucket DESC, event_count DESC;

-- QueryLeaf provides comprehensive change stream capabilities:
-- 1. SQL-familiar change stream creation and management syntax
-- 2. Advanced event filtering and transformation with business logic
-- 3. Cross-collection event aggregation and coordination patterns
-- 4. Real-time workflow orchestration with SQL-style routing
-- 5. Comprehensive monitoring and analytics for event processing
-- 6. Service integration patterns with familiar SQL constructs
-- 7. Event batching and performance optimization strategies
-- 8. Business rule integration for intelligent event processing
-- 9. Error handling and retry logic with SQL-familiar patterns
-- 10. Native integration with MongoDB Change Streams infrastructure
```

## Best Practices for Change Streams Implementation

### Event-Driven Architecture Design

Essential practices for building production-ready event-driven systems:

1. **Event Filtering**: Design precise change stream filters to minimize processing overhead
2. **Service Decoupling**: Use event-driven patterns to maintain loose coupling between microservices
3. **Error Handling**: Implement comprehensive retry logic and dead letter patterns
4. **Event Ordering**: Consider event ordering requirements for business-critical workflows
5. **Monitoring**: Deploy extensive monitoring for event processing pipelines and service health
6. **Scalability**: Design event processing to scale horizontally with growing data volumes

### Performance Optimization

Optimize change streams for high-throughput production environments:

1. **Pipeline Optimization**: Use efficient aggregation pipelines to filter events at the database level
2. **Batch Processing**: Group related events for efficient processing where appropriate
3. **Resource Management**: Monitor and manage change stream resource consumption
4. **Service Coordination**: Implement intelligent routing to avoid overwhelming downstream services
5. **Caching Strategy**: Use appropriate caching to reduce redundant processing
6. **Capacity Planning**: Plan for peak event volumes and service capacity requirements

## Conclusion

MongoDB Change Streams provide comprehensive real-time event processing capabilities that enable sophisticated event-driven microservices architectures without the complexity and overhead of external message queues or polling mechanisms. The combination of native change data capture, intelligent event filtering, and comprehensive service integration patterns makes it ideal for building responsive, scalable distributed systems.

Key Change Streams benefits include:

- **Real-Time Processing**: Native change data capture without polling overhead or latency
- **Intelligent Filtering**: Comprehensive event filtering and transformation at the database level  
- **Service Integration**: Built-in patterns for microservices coordination and event routing
- **Workflow Orchestration**: Advanced business logic integration for complex event-driven workflows
- **Scalable Architecture**: Horizontal scaling capabilities that grow with your application needs
- **Developer Familiarity**: SQL-compatible event processing patterns with MongoDB's flexible data model

Whether you're building e-commerce platforms, real-time analytics systems, IoT applications, or any system requiring immediate responsiveness to data changes, MongoDB Change Streams with QueryLeaf's SQL-familiar interface provides the foundation for modern event-driven architectures that scale efficiently while maintaining familiar development patterns.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL-style change stream operations into MongoDB Change Streams, providing familiar CREATE CHANGE_STREAM syntax, event filtering with SQL WHERE clauses, and comprehensive event routing patterns. Advanced event-driven workflows, business rule integration, and microservices coordination are seamlessly handled through familiar SQL constructs, making sophisticated real-time architecture both powerful and approachable for SQL-oriented development teams.

The integration of comprehensive event processing capabilities with SQL-familiar operations makes MongoDB an ideal platform for applications requiring both real-time responsiveness and familiar database interaction patterns, ensuring your event-driven solutions remain both effective and maintainable as they scale and evolve.