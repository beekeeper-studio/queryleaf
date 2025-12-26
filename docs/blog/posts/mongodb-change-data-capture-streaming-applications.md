---
title: "MongoDB Change Data Capture and Real-Time Streaming Applications: Building Event-Driven Architectures with Change Streams and SQL-Style Data Synchronization"
description: "Master MongoDB Change Data Capture for real-time streaming applications, event-driven architectures, and live data synchronization. Learn change streams, reactive systems, and SQL-familiar streaming data operations for modern applications."
date: 2025-12-25
tags: [mongodb, change-data-capture, streaming, real-time, event-driven, cdc, sql, reactive]
---

# MongoDB Change Data Capture and Real-Time Streaming Applications: Building Event-Driven Architectures with Change Streams and SQL-Style Data Synchronization

Modern applications require real-time responsiveness to data changes, enabling live dashboards, instant notifications, collaborative editing, and synchronized multi-device experiences that react immediately to database modifications. Traditional polling-based approaches for detecting data changes introduce latency, consume unnecessary resources, and create scalability bottlenecks that limit real-time application performance.

MongoDB Change Data Capture (CDC) through Change Streams provides comprehensive real-time data change notification capabilities that enable reactive architectures, event-driven microservices, and live data synchronization across distributed systems. Unlike polling mechanisms that repeatedly query databases for changes, MongoDB Change Streams deliver immediate notifications of data modifications, enabling applications to react instantly to database events with minimal overhead.

## The Traditional Polling and Batch Processing Challenge

Conventional approaches to detecting data changes rely on inefficient polling, timestamps, or batch processing that introduce latency and resource waste:

```sql
-- Traditional PostgreSQL change detection - inefficient polling and resource-intensive approaches

-- Timestamp-based change tracking with performance limitations
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    order_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    shipping_address JSONB,
    payment_info JSONB,
    
    -- Change tracking fields (manual maintenance required)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    last_modified_by UUID,
    
    -- Inefficient change flags
    is_modified BOOLEAN DEFAULT FALSE,
    change_type VARCHAR(10) DEFAULT 'insert',
    sync_required BOOLEAN DEFAULT TRUE
);

-- Audit table for change history (storage overhead)
CREATE TABLE order_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    operation_type VARCHAR(10) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    changed_by UUID,
    change_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    change_source VARCHAR(50)
);

-- Trigger-based change tracking (complex maintenance)
CREATE OR REPLACE FUNCTION track_order_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp and version
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.version = COALESCE(OLD.version, 0) + 1;
    NEW.is_modified = TRUE;
    NEW.sync_required = TRUE;
    
    -- Log to audit table
    INSERT INTO order_audit (
        order_id, 
        operation_type, 
        old_values, 
        new_values,
        changed_fields,
        changed_by,
        change_source
    ) VALUES (
        NEW.order_id,
        TG_OP,
        CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
        row_to_json(NEW),
        CASE WHEN TG_OP = 'UPDATE' THEN 
            array_agg(key) FILTER (WHERE (OLD.*)::json->>key IS DISTINCT FROM (NEW.*)::json->>key)
        ELSE NULL END,
        NEW.last_modified_by,
        'database_trigger'
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_change_trigger
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION track_order_changes();

-- Inefficient polling-based change detection
WITH recent_changes AS (
    -- Polling approach - expensive and introduces latency
    SELECT 
        o.order_id,
        o.customer_id,
        o.order_status,
        o.total_amount,
        o.updated_at,
        o.version,
        o.is_modified,
        o.sync_required,
        
        -- Calculate time since last change
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - o.updated_at)) as seconds_since_change,
        
        -- Determine if change is recent enough for processing
        CASE 
            WHEN o.updated_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes' THEN 'immediate'
            WHEN o.updated_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes' THEN 'batch'
            ELSE 'delayed'
        END as processing_priority,
        
        -- Get audit information
        oa.operation_type,
        oa.changed_fields,
        oa.change_timestamp
        
    FROM orders o
    LEFT JOIN order_audit oa ON o.order_id = oa.order_id 
        AND oa.change_timestamp = (
            SELECT MAX(change_timestamp) 
            FROM order_audit oa2 
            WHERE oa2.order_id = o.order_id
        )
    WHERE 
        o.is_modified = TRUE 
        OR o.sync_required = TRUE
        OR o.updated_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'  -- Polling window
),
change_processing AS (
    SELECT 
        rc.*,
        
        -- Categorize changes for different processing systems
        CASE rc.order_status
            WHEN 'confirmed' THEN 'inventory_update'
            WHEN 'shipped' THEN 'shipping_notification' 
            WHEN 'delivered' THEN 'delivery_confirmation'
            WHEN 'cancelled' THEN 'refund_processing'
            ELSE 'general_update'
        END as event_type,
        
        -- Calculate processing delay
        CASE 
            WHEN rc.seconds_since_change < 60 THEN 'real_time'
            WHEN rc.seconds_since_change < 300 THEN 'near_real_time'  
            WHEN rc.seconds_since_change < 1800 THEN 'delayed'
            ELSE 'stale'
        END as data_freshness,
        
        -- Determine notification requirements
        ARRAY[
            CASE WHEN rc.order_status IN ('shipped', 'delivered') THEN 'customer_sms' END,
            CASE WHEN rc.order_status = 'confirmed' THEN 'inventory_system' END,
            CASE WHEN rc.total_amount > 1000 THEN 'fraud_monitoring' END,
            CASE WHEN rc.changed_fields && ARRAY['shipping_address'] THEN 'logistics_update' END
        ] as notification_targets,
        
        -- Generate webhook payloads
        jsonb_build_object(
            'event_type', 'order_updated',
            'order_id', rc.order_id,
            'customer_id', rc.customer_id,
            'status', rc.order_status,
            'timestamp', rc.change_timestamp,
            'changed_fields', rc.changed_fields,
            'version', rc.version
        ) as webhook_payload
        
    FROM recent_changes rc
),
notification_queue AS (
    -- Build notification queue for external systems
    SELECT 
        cp.order_id,
        unnest(cp.notification_targets) as target_system,
        cp.webhook_payload,
        cp.event_type,
        cp.data_freshness,
        
        -- Priority scoring for queue processing
        CASE cp.event_type
            WHEN 'shipping_notification' THEN 5
            WHEN 'delivery_confirmation' THEN 5
            WHEN 'fraud_monitoring' THEN 10
            WHEN 'inventory_update' THEN 7
            ELSE 3
        END as priority_score,
        
        CURRENT_TIMESTAMP as queued_at,
        
        -- Retry logic configuration
        CASE cp.data_freshness
            WHEN 'real_time' THEN 3
            WHEN 'near_real_time' THEN 2
            ELSE 1
        END as max_retries
        
    FROM change_processing cp
    WHERE cp.notification_targets IS NOT NULL
)

-- Process changes and generate notifications
SELECT 
    nq.order_id,
    nq.target_system,
    nq.event_type,
    nq.priority_score,
    nq.max_retries,
    nq.webhook_payload,
    
    -- System-specific endpoint configuration
    CASE nq.target_system
        WHEN 'customer_sms' THEN 'https://api.sms.service.com/send'
        WHEN 'inventory_system' THEN 'https://inventory.internal/api/webhooks'
        WHEN 'fraud_monitoring' THEN 'https://fraud.security.com/api/alerts'
        WHEN 'logistics_update' THEN 'https://logistics.partner.com/api/updates'
    END as webhook_endpoint,
    
    -- Processing metadata
    nq.queued_at,
    nq.queued_at + INTERVAL '5 minutes' as max_processing_time,
    
    -- Performance impact assessment
    'polling_based_change_detection' as detection_method,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cp.change_timestamp)) as detection_latency_seconds
    
FROM notification_queue nq
JOIN change_processing cp ON nq.order_id = cp.order_id
WHERE nq.target_system IS NOT NULL
ORDER BY nq.priority_score DESC, nq.queued_at ASC;

-- Reset change flags (must be done manually)
UPDATE orders 
SET is_modified = FALSE, sync_required = FALSE
WHERE is_modified = TRUE 
  AND updated_at < CURRENT_TIMESTAMP - INTERVAL '1 minute';

-- Problems with traditional change detection approaches:
-- 1. Polling introduces significant latency between data changes and detection
-- 2. Constant polling consumes database resources even when no changes occur
-- 3. Complex trigger logic that's difficult to maintain and debug
-- 4. Manual synchronization flag management prone to race conditions
-- 5. Audit table storage overhead grows linearly with change volume
-- 6. No real-time notifications - applications must continuously poll
-- 7. Difficult to scale across multiple application instances
-- 8. Poor performance with high-frequency changes or large datasets
-- 9. Complex conflict resolution when multiple systems modify data
-- 10. No built-in filtering or transformation of change events

-- Batch processing approach (high latency)
WITH batch_changes AS (
    SELECT 
        o.order_id,
        o.customer_id,
        o.order_status,
        o.updated_at,
        
        -- Batch processing windows
        DATE_TRUNC('hour', o.updated_at) as processing_batch,
        
        -- Change detection via timestamp comparison
        CASE 
            WHEN o.updated_at > (
                SELECT COALESCE(MAX(last_processed_at), '1970-01-01'::timestamp)
                FROM processing_checkpoints 
                WHERE system_name = 'order_processor'
            ) THEN TRUE
            ELSE FALSE
        END as requires_processing,
        
        -- Lag calculation
        EXTRACT(EPOCH FROM (
            CURRENT_TIMESTAMP - o.updated_at
        )) / 60.0 as processing_delay_minutes
        
    FROM orders o
    WHERE o.updated_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
),
processing_statistics AS (
    SELECT 
        bc.processing_batch,
        COUNT(*) as total_changes,
        COUNT(*) FILTER (WHERE bc.requires_processing) as unprocessed_changes,
        AVG(bc.processing_delay_minutes) as avg_delay_minutes,
        MAX(bc.processing_delay_minutes) as max_delay_minutes,
        
        -- Batch processing efficiency
        CASE 
            WHEN COUNT(*) FILTER (WHERE bc.requires_processing) = 0 THEN 'up_to_date'
            WHEN AVG(bc.processing_delay_minutes) < 60 THEN 'acceptable_delay'
            WHEN AVG(bc.processing_delay_minutes) < 240 THEN 'moderate_delay'
            ELSE 'high_delay'
        END as processing_status
        
    FROM batch_changes bc
    GROUP BY bc.processing_batch
)

SELECT 
    processing_batch,
    total_changes,
    unprocessed_changes,
    ROUND(avg_delay_minutes::numeric, 2) as avg_delay_minutes,
    ROUND(max_delay_minutes::numeric, 2) as max_delay_minutes,
    processing_status,
    
    -- Performance assessment
    CASE processing_status
        WHEN 'high_delay' THEN 'Critical: Real-time requirements not met'
        WHEN 'moderate_delay' THEN 'Warning: Consider increasing processing frequency'
        WHEN 'acceptable_delay' THEN 'Good: Within acceptable parameters'
        ELSE 'Excellent: No backlog'
    END as performance_assessment
    
FROM processing_statistics
WHERE total_changes > 0
ORDER BY processing_batch DESC;

-- Traditional limitations:
-- 1. Batch processing introduces hours of latency for real-time requirements
-- 2. Resource waste from processing empty batches
-- 3. Complex checkpoint management and recovery logic
-- 4. Poor user experience with delayed updates and notifications
-- 5. Difficult horizontal scaling across multiple processing nodes
-- 6. No event ordering guarantees across different data modifications
-- 7. Limited ability to filter events based on content or business logic
-- 8. Manual coordination required between multiple consuming applications
-- 9. High operational overhead for monitoring and maintaining batch jobs
-- 10. Poor integration with modern event-driven and microservices architectures
```

MongoDB Change Data Capture provides efficient real-time change tracking:

```javascript
// MongoDB Change Data Capture - real-time event-driven architecture with comprehensive change stream management
const { MongoClient } = require('mongodb');
const { EventEmitter } = require('events');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('realtime_commerce_platform');

// Advanced Change Data Capture and event-driven processing system
class AdvancedChangeCaptureEngine extends EventEmitter {
  constructor(db, configuration = {}) {
    super();
    this.db = db;
    this.collections = {
      orders: db.collection('orders'),
      customers: db.collection('customers'),
      products: db.collection('products'),
      inventory: db.collection('inventory'),
      payments: db.collection('payments'),
      notifications: db.collection('notifications'),
      eventLog: db.collection('event_log')
    };
    
    // Advanced CDC configuration
    this.config = {
      changeStreamConfig: {
        fullDocument: 'updateLookup',
        fullDocumentBeforeChange: 'whenAvailable',
        showExpandedEvents: true,
        batchSize: configuration.batchSize || 100,
        maxAwaitTimeMS: configuration.maxAwaitTimeMS || 1000
      },
      
      // Event processing configuration
      eventProcessing: {
        enableAsync: true,
        enableRetry: true,
        retryAttempts: configuration.retryAttempts || 3,
        retryDelayMs: configuration.retryDelayMs || 1000,
        deadLetterQueue: true,
        preserveOrdering: true
      },
      
      // Filtering and routing configuration
      eventFiltering: {
        enableContentFiltering: true,
        enableBusinessLogicFiltering: true,
        enableUserDefinedFilters: true
      },
      
      // Performance optimization
      performance: {
        enableEventBatching: configuration.enableEventBatching || true,
        batchTimeoutMs: configuration.batchTimeoutMs || 500,
        enableParallelProcessing: true,
        maxConcurrentProcessors: configuration.maxConcurrentProcessors || 10
      },
      
      // Monitoring and observability
      monitoring: {
        enableMetrics: true,
        enableTracing: true,
        metricsIntervalMs: 30000,
        healthCheckIntervalMs: 5000
      }
    };
    
    // Internal state management
    this.changeStreams = new Map();
    this.eventProcessors = new Map();
    this.processingMetrics = {
      eventsProcessed: 0,
      eventsFailedProcessing: 0,
      averageProcessingTime: 0,
      lastProcessedTimestamp: null,
      activeChangeStreams: 0
    };
    
    // Event routing and transformation
    this.eventRouters = new Map();
    this.eventTransformers = new Map();
    this.businessRuleProcessors = new Map();
    
    this.initializeAdvancedCDC();
  }

  async initializeAdvancedCDC() {
    console.log('Initializing advanced MongoDB Change Data Capture system...');
    
    try {
      // Setup comprehensive change stream monitoring
      await this.setupCollectionChangeStreams();
      
      // Initialize event processing pipelines
      await this.initializeEventProcessors();
      
      // Setup business logic handlers
      await this.setupBusinessLogicHandlers();
      
      // Initialize monitoring and health checks
      await this.initializeMonitoring();
      
      console.log('Advanced CDC system initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize CDC system:', error);
      throw error;
    }
  }

  async setupCollectionChangeStreams() {
    console.log('Setting up collection change streams with advanced filtering...');
    
    // Orders collection change stream with comprehensive business logic
    const ordersChangeStream = this.collections.orders.watch([
      // Stage 1: Filter for relevant order events
      {
        $match: {
          $or: [
            // Order status changes
            { 'updateDescription.updatedFields.status': { $exists: true } },
            
            // Payment status changes
            { 'updateDescription.updatedFields.payment.status': { $exists: true } },
            
            // Shipping address changes
            { 'updateDescription.updatedFields.shipping.address': { $exists: true } },
            
            // High-value order insertions
            { 
              operationType: 'insert',
              'fullDocument.total': { $gte: 1000 }
            },
            
            // Order cancellations or refunds
            { 'updateDescription.updatedFields.cancellation': { $exists: true } },
            { 'updateDescription.updatedFields.refund': { $exists: true } }
          ]
        }
      },
      
      // Stage 2: Add enhanced metadata and business context
      {
        $addFields: {
          processedTimestamp: '$$NOW',
          changeStreamSource: 'orders_collection',
          
          // Extract key business events
          businessEvent: {
            $switch: {
              branches: [
                {
                  case: { 
                    $and: [
                      { $eq: ['$operationType', 'update'] },
                      { $eq: ['$updateDescription.updatedFields.status', 'confirmed'] }
                    ]
                  },
                  then: 'order_confirmed'
                },
                {
                  case: { 
                    $and: [
                      { $eq: ['$operationType', 'update'] },
                      { $eq: ['$updateDescription.updatedFields.status', 'shipped'] }
                    ]
                  },
                  then: 'order_shipped'
                },
                {
                  case: { 
                    $and: [
                      { $eq: ['$operationType', 'update'] },
                      { $eq: ['$updateDescription.updatedFields.payment.status', 'completed'] }
                    ]
                  },
                  then: 'payment_completed'
                },
                {
                  case: { 
                    $and: [
                      { $eq: ['$operationType', 'insert'] },
                      { $gte: ['$fullDocument.total', 1000] }
                    ]
                  },
                  then: 'high_value_order_created'
                }
              ],
              default: 'order_updated'
            }
          },
          
          // Priority scoring for event processing
          eventPriority: {
            $switch: {
              branches: [
                { case: { $eq: ['$updateDescription.updatedFields.payment.status', 'failed'] }, then: 10 },
                { case: { $eq: ['$updateDescription.updatedFields.status', 'cancelled'] }, then: 8 },
                { case: { $gte: ['$fullDocument.total', 5000] }, then: 7 },
                { case: { $eq: ['$updateDescription.updatedFields.status', 'shipped'] }, then: 6 },
                { case: { $eq: ['$updateDescription.updatedFields.status', 'confirmed'] }, then: 5 }
              ],
              default: 3
            }
          },
          
          // Determine required downstream actions
          requiredActions: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$updateDescription.updatedFields.status', 'confirmed'] },
                  then: ['inventory_update', 'customer_notification', 'logistics_preparation']
                },
                {
                  case: { $eq: ['$updateDescription.updatedFields.status', 'shipped'] },
                  then: ['shipping_notification', 'tracking_activation', 'delivery_estimation']
                },
                {
                  case: { $eq: ['$updateDescription.updatedFields.payment.status', 'completed'] },
                  then: ['receipt_generation', 'accounting_sync', 'loyalty_points_update']
                },
                {
                  case: { $gte: ['$fullDocument.total', 1000] },
                  then: ['fraud_screening', 'vip_handling', 'priority_processing']
                }
              ],
              default: ['general_processing']
            }
          }
        }
      }
    ], this.config.changeStreamConfig);

    // Register sophisticated event handlers
    ordersChangeStream.on('change', async (changeDocument) => {
      await this.processOrderChangeEvent(changeDocument);
    });

    ordersChangeStream.on('error', (error) => {
      console.error('Orders change stream error:', error);
      this.emit('changeStreamError', { collection: 'orders', error });
    });

    this.changeStreams.set('orders', ordersChangeStream);

    // Inventory collection change stream for real-time stock management
    const inventoryChangeStream = this.collections.inventory.watch([
      {
        $match: {
          $or: [
            // Stock level changes
            { 'updateDescription.updatedFields.quantity': { $exists: true } },
            { 'updateDescription.updatedFields.reservedQuantity': { $exists: true } },
            
            // Product availability changes
            { 'updateDescription.updatedFields.available': { $exists: true } },
            
            // Low stock alerts
            { 
              operationType: 'update',
              'fullDocument.quantity': { $lt: 10 }
            }
          ]
        }
      },
      {
        $addFields: {
          processedTimestamp: '$$NOW',
          changeStreamSource: 'inventory_collection',
          
          // Stock level categorization
          stockStatus: {
            $switch: {
              branches: [
                { case: { $lte: ['$fullDocument.quantity', 0] }, then: 'out_of_stock' },
                { case: { $lte: ['$fullDocument.quantity', 5] }, then: 'critical_low' },
                { case: { $lte: ['$fullDocument.quantity', 20] }, then: 'low_stock' },
                { case: { $gte: ['$fullDocument.quantity', 100] }, then: 'well_stocked' }
              ],
              default: 'normal_stock'
            }
          },
          
          // Calculate stock velocity and reorder triggers
          reorderRequired: {
            $cond: {
              if: {
                $and: [
                  { $lt: ['$fullDocument.quantity', '$fullDocument.reorderPoint'] },
                  { $ne: ['$fullDocument.reorderStatus', 'pending'] }
                ]
              },
              then: true,
              else: false
            }
          },
          
          // Urgency scoring for inventory management
          urgencyScore: {
            $add: [
              { $cond: [{ $lte: ['$fullDocument.quantity', 0] }, 10, 0] },
              { $cond: [{ $lte: ['$fullDocument.quantity', 5] }, 7, 0] },
              { $cond: [{ $gte: ['$fullDocument.demandForecast', 50] }, 3, 0] },
              { $cond: [{ $eq: ['$fullDocument.category', 'bestseller'] }, 2, 0] }
            ]
          }
        }
      }
    ], this.config.changeStreamConfig);

    inventoryChangeStream.on('change', async (changeDocument) => {
      await this.processInventoryChangeEvent(changeDocument);
    });

    this.changeStreams.set('inventory', inventoryChangeStream);

    // Customer collection change stream for personalization and CRM
    const customersChangeStream = this.collections.customers.watch([
      {
        $match: {
          $or: [
            // Profile updates
            { 'updateDescription.updatedFields.profile': { $exists: true } },
            
            // Preference changes
            { 'updateDescription.updatedFields.preferences': { $exists: true } },
            
            // Loyalty status changes
            { 'updateDescription.updatedFields.loyalty.tier': { $exists: true } },
            
            // New customer registrations
            { operationType: 'insert' }
          ]
        }
      },
      {
        $addFields: {
          processedTimestamp: '$$NOW',
          changeStreamSource: 'customers_collection',
          
          // Customer lifecycle events
          lifecycleEvent: {
            $switch: {
              branches: [
                { case: { $eq: ['$operationType', 'insert'] }, then: 'customer_registered' },
                { case: { $ne: ['$updateDescription.updatedFields.loyalty.tier', null] }, then: 'loyalty_tier_changed' },
                { case: { $ne: ['$updateDescription.updatedFields.preferences.marketing', null] }, then: 'communication_preferences_updated' }
              ],
              default: 'customer_profile_updated'
            }
          },
          
          // Personalization triggers
          personalizationActions: {
            $cond: {
              if: { $eq: ['$operationType', 'insert'] },
              then: ['welcome_sequence', 'preference_collection', 'recommendation_initialization'],
              else: {
                $switch: {
                  branches: [
                    {
                      case: { $ne: ['$updateDescription.updatedFields.preferences.categories', null] },
                      then: ['recommendation_refresh', 'content_personalization']
                    },
                    {
                      case: { $ne: ['$updateDescription.updatedFields.loyalty.tier', null] },
                      then: ['tier_benefits_notification', 'exclusive_offers_activation']
                    }
                  ],
                  default: ['profile_validation']
                }
              }
            }
          }
        }
      }
    ], this.config.changeStreamConfig);

    customersChangeStream.on('change', async (changeDocument) => {
      await this.processCustomerChangeEvent(changeDocument);
    });

    this.changeStreams.set('customers', customersChangeStream);

    this.processingMetrics.activeChangeStreams = this.changeStreams.size;
    console.log(`Initialized ${this.changeStreams.size} change streams with advanced filtering`);
  }

  async processOrderChangeEvent(changeDocument) {
    const startTime = Date.now();
    
    try {
      console.log(`Processing order change event: ${changeDocument.businessEvent}`);
      
      // Extract key information from the change document
      const orderId = changeDocument.documentKey._id;
      const operationType = changeDocument.operationType;
      const businessEvent = changeDocument.businessEvent;
      const eventPriority = changeDocument.eventPriority;
      const requiredActions = changeDocument.requiredActions;
      const fullDocument = changeDocument.fullDocument;
      
      // Create comprehensive event context
      const eventContext = {
        eventId: `order_${orderId}_${Date.now()}`,
        orderId: orderId,
        customerId: fullDocument?.customerId,
        operationType: operationType,
        businessEvent: businessEvent,
        priority: eventPriority,
        timestamp: changeDocument.processedTimestamp,
        requiredActions: requiredActions,
        
        // Change details
        changeDetails: {
          updatedFields: changeDocument.updateDescription?.updatedFields,
          removedFields: changeDocument.updateDescription?.removedFields,
          previousDocument: changeDocument.fullDocumentBeforeChange
        },
        
        // Business context
        businessContext: {
          orderValue: fullDocument?.total,
          orderStatus: fullDocument?.status,
          customerTier: fullDocument?.customer?.loyaltyTier,
          paymentMethod: fullDocument?.payment?.method,
          shippingMethod: fullDocument?.shipping?.method
        }
      };

      // Process each required action asynchronously
      const actionPromises = requiredActions.map(action => 
        this.executeBusinessAction(action, eventContext)
      );

      if (this.config.eventProcessing.enableAsync) {
        // Parallel processing for independent actions
        await Promise.allSettled(actionPromises);
      } else {
        // Sequential processing for dependent actions
        for (const actionPromise of actionPromises) {
          await actionPromise;
        }
      }

      // Log successful event processing
      await this.logEventProcessing(eventContext, 'success');
      
      // Update metrics
      this.updateProcessingMetrics(startTime, true);
      
      // Emit success event for monitoring
      this.emit('eventProcessed', {
        eventId: eventContext.eventId,
        businessEvent: businessEvent,
        processingTime: Date.now() - startTime
      });

    } catch (error) {
      console.error(`Error processing order change event:`, error);
      
      // Handle retry logic
      if (this.config.eventProcessing.enableRetry) {
        await this.retryEventProcessing(changeDocument, error);
      }
      
      // Update error metrics
      this.updateProcessingMetrics(startTime, false);
      
      // Emit error event for monitoring
      this.emit('eventProcessingError', {
        changeDocument: changeDocument,
        error: error,
        timestamp: new Date()
      });
    }
  }

  async executeBusinessAction(action, eventContext) {
    console.log(`Executing business action: ${action} for event: ${eventContext.eventId}`);
    
    try {
      switch (action) {
        case 'inventory_update':
          await this.updateInventoryForOrder(eventContext);
          break;
          
        case 'customer_notification':
          await this.sendCustomerNotification(eventContext);
          break;
          
        case 'logistics_preparation':
          await this.prepareLogistics(eventContext);
          break;
          
        case 'shipping_notification':
          await this.sendShippingNotification(eventContext);
          break;
          
        case 'tracking_activation':
          await this.activateOrderTracking(eventContext);
          break;
          
        case 'payment_processing':
          await this.processPayment(eventContext);
          break;
          
        case 'fraud_screening':
          await this.performFraudScreening(eventContext);
          break;
          
        case 'loyalty_points_update':
          await this.updateLoyaltyPoints(eventContext);
          break;
          
        case 'analytics_update':
          await this.updateAnalytics(eventContext);
          break;
          
        default:
          console.warn(`Unknown business action: ${action}`);
      }
      
    } catch (actionError) {
      console.error(`Error executing business action ${action}:`, actionError);
      throw actionError;
    }
  }

  async updateInventoryForOrder(eventContext) {
    console.log(`Updating inventory for order: ${eventContext.orderId}`);
    
    try {
      // Get order details
      const order = await this.collections.orders.findOne(
        { _id: eventContext.orderId }
      );
      
      if (!order || !order.items) {
        throw new Error(`Order ${eventContext.orderId} not found or has no items`);
      }

      // Process inventory updates for each order item
      const inventoryUpdates = order.items.map(async (item) => {
        const inventoryUpdate = {
          $inc: {
            reservedQuantity: item.quantity,
            availableQuantity: -item.quantity
          },
          $push: {
            reservations: {
              orderId: eventContext.orderId,
              quantity: item.quantity,
              reservedAt: new Date(),
              status: 'active'
            }
          },
          $set: {
            lastUpdated: new Date(),
            lastUpdateReason: 'order_confirmed'
          }
        };

        return this.collections.inventory.updateOne(
          { productId: item.productId },
          inventoryUpdate
        );
      });

      // Execute all inventory updates
      await Promise.all(inventoryUpdates);
      
      console.log(`Inventory updated successfully for order: ${eventContext.orderId}`);
      
    } catch (error) {
      console.error(`Failed to update inventory for order ${eventContext.orderId}:`, error);
      throw error;
    }
  }

  async sendCustomerNotification(eventContext) {
    console.log(`Sending customer notification for event: ${eventContext.businessEvent}`);
    
    try {
      // Get customer information
      const customer = await this.collections.customers.findOne(
        { _id: eventContext.customerId }
      );
      
      if (!customer) {
        throw new Error(`Customer ${eventContext.customerId} not found`);
      }

      // Determine notification content based on business event
      const notificationConfig = this.getNotificationConfig(
        eventContext.businessEvent, 
        eventContext.businessContext
      );

      // Create notification document
      const notification = {
        customerId: eventContext.customerId,
        orderId: eventContext.orderId,
        type: notificationConfig.type,
        channel: this.selectNotificationChannel(customer.preferences),
        
        content: {
          subject: notificationConfig.subject,
          message: this.personalizeMessage(
            notificationConfig.template,
            customer,
            eventContext.businessContext
          ),
          actionUrl: notificationConfig.actionUrl,
          imageUrl: notificationConfig.imageUrl
        },
        
        priority: eventContext.priority,
        scheduledFor: this.calculateDeliveryTime(notificationConfig.timing),
        
        metadata: {
          eventId: eventContext.eventId,
          businessEvent: eventContext.businessEvent,
          createdAt: new Date()
        }
      };

      // Store notification for delivery
      const result = await this.collections.notifications.insertOne(notification);
      
      // Trigger immediate delivery for high-priority notifications
      if (eventContext.priority >= 7) {
        await this.deliverNotificationImmediately(notification);
      }
      
      console.log(`Notification created successfully: ${result.insertedId}`);
      
    } catch (error) {
      console.error(`Failed to send customer notification:`, error);
      throw error;
    }
  }

  async processInventoryChangeEvent(changeDocument) {
    const startTime = Date.now();
    
    try {
      console.log(`Processing inventory change event: ${changeDocument.stockStatus}`);
      
      const productId = changeDocument.documentKey._id;
      const stockStatus = changeDocument.stockStatus;
      const urgencyScore = changeDocument.urgencyScore;
      const reorderRequired = changeDocument.reorderRequired;
      const fullDocument = changeDocument.fullDocument;

      const eventContext = {
        eventId: `inventory_${productId}_${Date.now()}`,
        productId: productId,
        stockStatus: stockStatus,
        urgencyScore: urgencyScore,
        reorderRequired: reorderRequired,
        currentQuantity: fullDocument?.quantity,
        changeDetails: changeDocument.updateDescription
      };

      // Handle critical stock situations
      if (stockStatus === 'out_of_stock' || stockStatus === 'critical_low') {
        await this.handleCriticalStockSituation(eventContext);
      }

      // Trigger reorder process if needed
      if (reorderRequired) {
        await this.initiateReorderProcess(eventContext);
      }

      // Update product availability in real-time
      await this.updateProductAvailability(eventContext);
      
      // Notify relevant stakeholders
      await this.notifyStakeholders(eventContext);

      this.updateProcessingMetrics(startTime, true);
      
    } catch (error) {
      console.error(`Error processing inventory change event:`, error);
      this.updateProcessingMetrics(startTime, false);
    }
  }

  async processCustomerChangeEvent(changeDocument) {
    const startTime = Date.now();
    
    try {
      console.log(`Processing customer change event: ${changeDocument.lifecycleEvent}`);
      
      const customerId = changeDocument.documentKey._id;
      const lifecycleEvent = changeDocument.lifecycleEvent;
      const personalizationActions = changeDocument.personalizationActions;
      const fullDocument = changeDocument.fullDocument;

      const eventContext = {
        eventId: `customer_${customerId}_${Date.now()}`,
        customerId: customerId,
        lifecycleEvent: lifecycleEvent,
        personalizationActions: personalizationActions,
        customerData: fullDocument
      };

      // Execute personalization actions
      for (const action of personalizationActions) {
        await this.executePersonalizationAction(action, eventContext);
      }

      this.updateProcessingMetrics(startTime, true);
      
    } catch (error) {
      console.error(`Error processing customer change event:`, error);
      this.updateProcessingMetrics(startTime, false);
    }
  }

  async initializeEventProcessors() {
    console.log('Initializing specialized event processors...');
    
    // Order fulfillment processor
    this.eventProcessors.set('order_fulfillment', {
      process: async (eventContext) => {
        await this.processOrderFulfillment(eventContext);
      },
      concurrency: 5,
      retryPolicy: { maxAttempts: 3, backoffMs: 1000 }
    });

    // Payment processor
    this.eventProcessors.set('payment_processing', {
      process: async (eventContext) => {
        await this.processPaymentEvent(eventContext);
      },
      concurrency: 10,
      retryPolicy: { maxAttempts: 5, backoffMs: 2000 }
    });

    // Notification processor
    this.eventProcessors.set('notification_delivery', {
      process: async (eventContext) => {
        await this.processNotificationDelivery(eventContext);
      },
      concurrency: 20,
      retryPolicy: { maxAttempts: 3, backoffMs: 500 }
    });
  }

  async logEventProcessing(eventContext, status) {
    try {
      const logEntry = {
        eventId: eventContext.eventId,
        timestamp: new Date(),
        status: status,
        eventType: eventContext.businessEvent || eventContext.lifecycleEvent,
        processingTime: Date.now() - new Date(eventContext.timestamp).getTime(),
        context: eventContext,
        metadata: {
          changeStreamSource: eventContext.changeStreamSource,
          priority: eventContext.priority
        }
      };

      await this.collections.eventLog.insertOne(logEntry);
      
    } catch (logError) {
      console.error('Failed to log event processing:', logError);
      // Don't throw - logging failures shouldn't break event processing
    }
  }

  updateProcessingMetrics(startTime, success) {
    this.processingMetrics.eventsProcessed++;
    
    if (success) {
      const processingTime = Date.now() - startTime;
      this.processingMetrics.averageProcessingTime = 
        (this.processingMetrics.averageProcessingTime + processingTime) / 2;
      this.processingMetrics.lastProcessedTimestamp = new Date();
    } else {
      this.processingMetrics.eventsFailedProcessing++;
    }
  }

  // Additional utility methods for comprehensive CDC functionality
  
  getNotificationConfig(businessEvent, businessContext) {
    const notificationConfigs = {
      order_confirmed: {
        type: 'order_confirmation',
        subject: 'Order Confirmed - Thank You!',
        template: 'order_confirmation_template',
        timing: 'immediate',
        actionUrl: '/orders/{orderId}',
        imageUrl: '/images/order-confirmed.png'
      },
      order_shipped: {
        type: 'shipping_notification',
        subject: 'Your Order is On the Way!',
        template: 'shipping_notification_template',
        timing: 'immediate',
        actionUrl: '/orders/{orderId}/tracking',
        imageUrl: '/images/package-shipped.png'
      },
      payment_completed: {
        type: 'payment_confirmation',
        subject: 'Payment Received',
        template: 'payment_confirmation_template',
        timing: 'immediate',
        actionUrl: '/orders/{orderId}/receipt',
        imageUrl: '/images/payment-success.png'
      }
    };

    return notificationConfigs[businessEvent] || {
      type: 'general_notification',
      subject: 'Order Update',
      template: 'general_update_template',
      timing: 'delayed'
    };
  }

  selectNotificationChannel(customerPreferences) {
    if (!customerPreferences) return 'email';
    
    if (customerPreferences.notifications?.push?.enabled) return 'push';
    if (customerPreferences.notifications?.sms?.enabled) return 'sms';
    return 'email';
  }

  personalizeMessage(template, customer, businessContext) {
    // Simplified personalization - in production, use a templating engine
    return template
      .replace('{customerName}', customer.profile?.firstName || 'Valued Customer')
      .replace('{orderId}', businessContext.orderId)
      .replace('{orderValue}', businessContext.orderValue);
  }

  async retryEventProcessing(changeDocument, error) {
    console.log(`Retrying event processing for change document: ${changeDocument._id}`);
    // Implement exponential backoff retry logic
    // This is a simplified version - production should use a proper retry queue
  }

  async initializeMonitoring() {
    console.log('Initializing CDC monitoring and health checks...');
    
    // Set up periodic health checks
    setInterval(() => {
      this.performHealthCheck();
    }, this.config.monitoring.healthCheckIntervalMs);

    // Set up metrics collection
    setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoring.metricsIntervalMs);
  }

  performHealthCheck() {
    // Check change stream health
    let healthyStreams = 0;
    this.changeStreams.forEach((stream, name) => {
      if (!stream.closed) {
        healthyStreams++;
      } else {
        console.warn(`Change stream ${name} is closed - attempting reconnection`);
        // Implement reconnection logic
      }
    });

    const healthStatus = {
      timestamp: new Date(),
      totalStreams: this.changeStreams.size,
      healthyStreams: healthyStreams,
      processingMetrics: this.processingMetrics
    };

    this.emit('healthCheck', healthStatus);
  }

  collectMetrics() {
    const metrics = {
      timestamp: new Date(),
      ...this.processingMetrics,
      changeStreamStatus: Array.from(this.changeStreams.entries()).map(([name, stream]) => ({
        name: name,
        closed: stream.closed,
        hasNext: stream.hasNext()
      }))
    };

    this.emit('metricsCollected', metrics);
  }
}

// Benefits of MongoDB Change Data Capture:
// - Real-time data change notifications without polling overhead
// - Comprehensive change document information including before/after states  
// - Built-in filtering and transformation capabilities within change streams
// - Automatic ordering and delivery guarantees for change events
// - Horizontal scalability with replica set and sharded cluster support
// - Integration with MongoDB's operational capabilities (backup, monitoring)
// - Event-driven architecture enablement for microservices and reactive systems
// - Minimal performance impact on primary database operations
// - Rich metadata and context information for intelligent event processing
// - Native MongoDB driver integration with automatic reconnection handling

module.exports = {
  AdvancedChangeCaptureEngine
};
```

## Understanding MongoDB Change Streams Architecture

### Advanced Event Processing and Business Logic Integration

Implement sophisticated change data capture strategies for production real-time applications:

```javascript
// Production-ready MongoDB Change Data Capture with enterprise-grade event processing
class EnterpriseChangeDataCaptureSystem extends AdvancedChangeCaptureEngine {
  constructor(db, enterpriseConfig) {
    super(db, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      
      // Advanced event sourcing
      eventSourcing: {
        enableEventStore: true,
        eventRetentionDays: 365,
        snapshotFrequency: 1000,
        enableReplay: true
      },
      
      // Distributed processing
      distributedProcessing: {
        enableClusterMode: true,
        nodeId: process.env.NODE_ID || 'node-1',
        coordinationDatabase: 'cdc_coordination',
        leaderElection: true
      },
      
      // Advanced monitoring
      observability: {
        enableDistributedTracing: true,
        enableCustomMetrics: true,
        alertingThresholds: {
          processingLatency: 5000,
          errorRate: 0.05,
          backlogSize: 1000
        }
      }
    };
    
    this.setupEnterpriseFeatures();
  }

  async setupEventSourcingCapabilities() {
    console.log('Setting up enterprise event sourcing capabilities...');
    
    // Event store for complete audit trail
    const eventStore = this.db.collection('event_store');
    await eventStore.createIndex({ aggregateId: 1, version: 1 }, { unique: true });
    await eventStore.createIndex({ eventType: 1, timestamp: -1 });
    await eventStore.createIndex({ timestamp: -1 });

    // Snapshots for performance optimization
    const snapshots = this.db.collection('aggregate_snapshots');
    await snapshots.createIndex({ aggregateId: 1, version: -1 });

    return { eventStore, snapshots };
  }

  async implementAdvancedEventRouting() {
    console.log('Implementing advanced event routing and transformation...');
    
    // Dynamic event routing based on content and business rules
    const routingRules = [
      {
        name: 'high_value_order_routing',
        condition: (event) => event.businessContext?.orderValue > 5000,
        destinations: ['fraud_detection', 'vip_processing', 'management_alerts'],
        transformation: this.transformHighValueOrder.bind(this)
      },
      
      {
        name: 'inventory_critical_routing',
        condition: (event) => event.stockStatus === 'critical_low',
        destinations: ['procurement', 'sales_alerts', 'website_updates'],
        transformation: this.transformInventoryAlert.bind(this)
      },
      
      {
        name: 'customer_lifecycle_routing',
        condition: (event) => event.lifecycleEvent === 'customer_registered',
        destinations: ['marketing_automation', 'personalization_engine', 'crm_sync'],
        transformation: this.transformCustomerEvent.bind(this)
      }
    ];

    return routingRules;
  }

  async setupDistributedProcessing() {
    console.log('Setting up distributed CDC processing...');
    
    // Implement leader election for coordinated processing
    const coordination = {
      leaderElection: await this.setupLeaderElection(),
      workloadDistribution: await this.setupWorkloadDistribution(),
      failoverHandling: await this.setupFailoverHandling()
    };

    return coordination;
  }
}
```

## SQL-Style Change Data Capture with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Change Data Capture and real-time streaming operations:

```sql
-- QueryLeaf advanced change data capture with SQL-familiar syntax

-- Create change data capture streams with comprehensive filtering and transformation
CREATE CHANGE STREAM order_events 
ON orders 
WITH (
  full_document = 'update_lookup',
  full_document_before_change = 'when_available',
  show_expanded_events = true
)
AS
SELECT 
  change_id() as event_id,
  operation_type(),
  document_key() as order_id,
  cluster_time() as event_timestamp,
  
  -- Enhanced change document information
  full_document() as current_order,
  full_document_before_change() as previous_order,
  update_description() as change_details,
  
  -- Business event classification
  CASE 
    WHEN operation_type() = 'insert' THEN 'order_created'
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.status') = 'confirmed' THEN 'order_confirmed'
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.status') = 'shipped' THEN 'order_shipped'
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.status') = 'delivered' THEN 'order_delivered'
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.status') = 'cancelled' THEN 'order_cancelled'
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.payment.status') = 'completed' THEN 'payment_completed'
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.payment.status') = 'failed' THEN 'payment_failed'
    ELSE 'order_updated'
  END as business_event,
  
  -- Priority scoring for event processing
  CASE 
    WHEN JSON_EXTRACT(full_document(), '$.total') > 5000 THEN 10
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.payment.status') = 'failed' THEN 9
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.status') = 'cancelled' THEN 8
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.status') = 'shipped' THEN 7
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.status') = 'confirmed' THEN 6
    ELSE 3
  END as event_priority,
  
  -- Required downstream actions
  CASE 
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.status') = 'confirmed' THEN 
      JSON_ARRAY('inventory_update', 'customer_notification', 'logistics_preparation')
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.status') = 'shipped' THEN 
      JSON_ARRAY('shipping_notification', 'tracking_activation', 'delivery_estimation')
    WHEN JSON_EXTRACT(update_description(), '$.updatedFields.payment.status') = 'completed' THEN 
      JSON_ARRAY('receipt_generation', 'accounting_sync', 'loyalty_points_update')
    WHEN JSON_EXTRACT(full_document(), '$.total') > 1000 THEN 
      JSON_ARRAY('fraud_screening', 'vip_handling', 'priority_processing')
    ELSE JSON_ARRAY('general_processing')
  END as required_actions,
  
  -- Customer and business context
  JSON_OBJECT(
    'customer_id', JSON_EXTRACT(full_document(), '$.customerId'),
    'order_value', JSON_EXTRACT(full_document(), '$.total'),
    'order_status', JSON_EXTRACT(full_document(), '$.status'),
    'payment_method', JSON_EXTRACT(full_document(), '$.payment.method'),
    'shipping_method', JSON_EXTRACT(full_document(), '$.shipping.method'),
    'customer_tier', JSON_EXTRACT(full_document(), '$.customer.loyaltyTier'),
    'order_items_count', JSON_LENGTH(JSON_EXTRACT(full_document(), '$.items'))
  ) as business_context

WHERE 
  -- Filter for relevant business events
  (
    operation_type() = 'insert' OR 
    JSON_EXTRACT(update_description(), '$.updatedFields.status') IS NOT NULL OR
    JSON_EXTRACT(update_description(), '$.updatedFields.payment.status') IS NOT NULL OR
    JSON_EXTRACT(update_description(), '$.updatedFields.shipping.address') IS NOT NULL OR
    JSON_EXTRACT(update_description(), '$.updatedFields.cancellation') IS NOT NULL
  )
  
  -- Additional business logic filters
  AND (
    operation_type() != 'insert' OR 
    JSON_EXTRACT(full_document(), '$.total') >= 10  -- Only track orders above minimum value
  );

-- Advanced change stream processing with business logic and real-time actions
WITH real_time_order_processing AS (
  SELECT 
    oe.*,
    
    -- Calculate processing urgency
    CASE 
      WHEN oe.event_priority >= 8 THEN 'critical'
      WHEN oe.event_priority >= 6 THEN 'high'
      WHEN oe.event_priority >= 4 THEN 'normal'
      ELSE 'low'
    END as processing_urgency,
    
    -- Determine notification channels
    CASE oe.business_event
      WHEN 'order_confirmed' THEN JSON_ARRAY('email', 'push_notification')
      WHEN 'order_shipped' THEN JSON_ARRAY('email', 'sms', 'push_notification')
      WHEN 'order_delivered' THEN JSON_ARRAY('email', 'push_notification', 'in_app')
      WHEN 'payment_failed' THEN JSON_ARRAY('email', 'sms', 'priority_alert')
      WHEN 'order_cancelled' THEN JSON_ARRAY('email', 'refund_processing')
      ELSE JSON_ARRAY('email')
    END as notification_channels,
    
    -- Generate webhook payloads for external systems
    JSON_OBJECT(
      'event_type', oe.business_event,
      'event_id', oe.event_id,
      'order_id', oe.order_id,
      'timestamp', oe.event_timestamp,
      'priority', oe.event_priority,
      'customer_context', oe.business_context,
      'change_details', oe.change_details
    ) as webhook_payload,
    
    -- Real-time analytics updates
    CASE oe.business_event
      WHEN 'order_created' THEN 'increment_daily_orders'
      WHEN 'payment_completed' THEN 'increment_revenue'
      WHEN 'order_cancelled' THEN 'increment_cancellations'
      WHEN 'order_delivered' THEN 'increment_completions'
      ELSE 'general_metric_update'
    END as analytics_action
    
  FROM order_events oe
),

-- Inventory change stream for real-time stock management
inventory_events AS (
  SELECT 
    change_id() as event_id,
    operation_type(),
    document_key() as product_id,
    cluster_time() as event_timestamp,
    full_document() as current_inventory,
    update_description() as change_details,
    
    -- Stock status classification
    CASE 
      WHEN JSON_EXTRACT(full_document(), '$.quantity') <= 0 THEN 'out_of_stock'
      WHEN JSON_EXTRACT(full_document(), '$.quantity') <= 5 THEN 'critical_low'
      WHEN JSON_EXTRACT(full_document(), '$.quantity') <= 20 THEN 'low_stock'
      WHEN JSON_EXTRACT(full_document(), '$.quantity') >= 100 THEN 'well_stocked'
      ELSE 'normal_stock'
    END as stock_status,
    
    -- Reorder trigger detection
    CASE 
      WHEN JSON_EXTRACT(full_document(), '$.quantity') < JSON_EXTRACT(full_document(), '$.reorderPoint')
           AND JSON_EXTRACT(full_document(), '$.reorderStatus') != 'pending' THEN true
      ELSE false
    END as reorder_required,
    
    -- Urgency scoring for inventory alerts
    (
      CASE WHEN JSON_EXTRACT(full_document(), '$.quantity') <= 0 THEN 10 ELSE 0 END +
      CASE WHEN JSON_EXTRACT(full_document(), '$.quantity') <= 5 THEN 7 ELSE 0 END +
      CASE WHEN JSON_EXTRACT(full_document(), '$.demandForecast') >= 50 THEN 3 ELSE 0 END +
      CASE WHEN JSON_EXTRACT(full_document(), '$.category') = 'bestseller' THEN 2 ELSE 0 END
    ) as urgency_score
    
  FROM CHANGE_STREAM(inventory)
  WHERE JSON_EXTRACT(update_description(), '$.updatedFields.quantity') IS NOT NULL
     OR JSON_EXTRACT(update_description(), '$.updatedFields.reservedQuantity') IS NOT NULL
     OR JSON_EXTRACT(update_description(), '$.updatedFields.available') IS NOT NULL
),

-- Customer lifecycle change stream for personalization and CRM
customer_events AS (
  SELECT 
    change_id() as event_id,
    operation_type(),
    document_key() as customer_id,
    cluster_time() as event_timestamp,
    full_document() as current_customer,
    update_description() as change_details,
    
    -- Lifecycle event classification
    CASE 
      WHEN operation_type() = 'insert' THEN 'customer_registered'
      WHEN JSON_EXTRACT(update_description(), '$.updatedFields.loyalty.tier') IS NOT NULL THEN 'loyalty_tier_changed'
      WHEN JSON_EXTRACT(update_description(), '$.updatedFields.preferences.marketing') IS NOT NULL THEN 'communication_preferences_updated'
      WHEN JSON_EXTRACT(update_description(), '$.updatedFields.profile') IS NOT NULL THEN 'profile_updated'
      ELSE 'customer_updated'
    END as lifecycle_event,
    
    -- Personalization trigger actions
    CASE 
      WHEN operation_type() = 'insert' THEN 
        JSON_ARRAY('welcome_sequence', 'preference_collection', 'recommendation_initialization')
      WHEN JSON_EXTRACT(update_description(), '$.updatedFields.preferences.categories') IS NOT NULL THEN 
        JSON_ARRAY('recommendation_refresh', 'content_personalization')
      WHEN JSON_EXTRACT(update_description(), '$.updatedFields.loyalty.tier') IS NOT NULL THEN 
        JSON_ARRAY('tier_benefits_notification', 'exclusive_offers_activation')
      ELSE JSON_ARRAY('profile_validation')
    END as personalization_actions
    
  FROM CHANGE_STREAM(customers)
  WHERE operation_type() = 'insert'
     OR JSON_EXTRACT(update_description(), '$.updatedFields.profile') IS NOT NULL
     OR JSON_EXTRACT(update_description(), '$.updatedFields.preferences') IS NOT NULL
     OR JSON_EXTRACT(update_description(), '$.updatedFields.loyalty.tier') IS NOT NULL
)

-- Comprehensive real-time event processing with cross-collection coordination
SELECT 
  -- Event identification and metadata
  'order' as event_source,
  rtop.event_id,
  rtop.business_event as event_type,
  rtop.event_timestamp,
  rtop.processing_urgency,
  
  -- Business context and payload
  rtop.business_context,
  rtop.webhook_payload,
  rtop.required_actions,
  rtop.notification_channels,
  
  -- Real-time processing instructions
  JSON_OBJECT(
    'immediate_actions', rtop.required_actions,
    'notification_config', JSON_OBJECT(
      'channels', rtop.notification_channels,
      'priority', rtop.event_priority,
      'urgency', rtop.processing_urgency
    ),
    'webhook_config', JSON_OBJECT(
      'payload', rtop.webhook_payload,
      'priority', rtop.event_priority,
      'retry_policy', CASE rtop.processing_urgency
        WHEN 'critical' THEN JSON_OBJECT('max_attempts', 5, 'backoff_ms', 1000)
        WHEN 'high' THEN JSON_OBJECT('max_attempts', 3, 'backoff_ms', 2000)
        ELSE JSON_OBJECT('max_attempts', 2, 'backoff_ms', 5000)
      END
    ),
    'analytics_config', JSON_OBJECT(
      'action', rtop.analytics_action,
      'metrics_update', rtop.business_context
    )
  ) as processing_configuration
  
FROM real_time_order_processing rtop

UNION ALL

SELECT 
  -- Inventory events
  'inventory' as event_source,
  ie.event_id,
  CONCAT('inventory_', ie.stock_status) as event_type,
  ie.event_timestamp,
  CASE 
    WHEN ie.urgency_score >= 8 THEN 'critical'
    WHEN ie.urgency_score >= 5 THEN 'high'
    ELSE 'normal'
  END as processing_urgency,
  
  -- Inventory context
  JSON_OBJECT(
    'product_id', ie.product_id,
    'stock_status', ie.stock_status,
    'current_quantity', JSON_EXTRACT(ie.current_inventory, '$.quantity'),
    'urgency_score', ie.urgency_score,
    'reorder_required', ie.reorder_required
  ) as business_context,
  
  -- Inventory webhook payload
  JSON_OBJECT(
    'event_type', CONCAT('inventory_', ie.stock_status),
    'product_id', ie.product_id,
    'stock_status', ie.stock_status,
    'quantity', JSON_EXTRACT(ie.current_inventory, '$.quantity'),
    'reorder_required', ie.reorder_required,
    'timestamp', ie.event_timestamp
  ) as webhook_payload,
  
  -- Inventory-specific actions
  CASE 
    WHEN ie.stock_status = 'out_of_stock' THEN 
      JSON_ARRAY('website_update', 'sales_alert', 'emergency_reorder')
    WHEN ie.stock_status = 'critical_low' THEN 
      JSON_ARRAY('reorder_trigger', 'low_stock_alert', 'sales_notification')
    WHEN ie.reorder_required THEN 
      JSON_ARRAY('procurement_notification', 'supplier_contact', 'reorder_automation')
    ELSE JSON_ARRAY('inventory_update')
  END as required_actions,
  
  -- Inventory notification channels
  CASE ie.stock_status
    WHEN 'out_of_stock' THEN JSON_ARRAY('email', 'slack', 'sms', 'dashboard_alert')
    WHEN 'critical_low' THEN JSON_ARRAY('email', 'slack', 'dashboard_alert')
    ELSE JSON_ARRAY('email', 'dashboard_alert')
  END as notification_channels,
  
  -- Inventory processing configuration
  JSON_OBJECT(
    'immediate_actions', CASE 
      WHEN ie.stock_status = 'out_of_stock' THEN 
        JSON_ARRAY('website_update', 'sales_alert', 'emergency_reorder')
      WHEN ie.stock_status = 'critical_low' THEN 
        JSON_ARRAY('reorder_trigger', 'low_stock_alert')
      ELSE JSON_ARRAY('inventory_sync')
    END,
    'notification_config', JSON_OBJECT(
      'channels', CASE ie.stock_status
        WHEN 'out_of_stock' THEN JSON_ARRAY('email', 'slack', 'sms')
        ELSE JSON_ARRAY('email', 'slack')
      END,
      'urgency', CASE 
        WHEN ie.urgency_score >= 8 THEN 'critical'
        WHEN ie.urgency_score >= 5 THEN 'high'
        ELSE 'normal'
      END
    ),
    'reorder_config', CASE 
      WHEN ie.reorder_required THEN JSON_OBJECT(
        'automatic_reorder', true,
        'supplier_notification', true,
        'quantity_calculation', 'demand_based'
      )
      ELSE NULL
    END
  ) as processing_configuration
  
FROM inventory_events ie

UNION ALL

SELECT 
  -- Customer events
  'customer' as event_source,
  ce.event_id,
  ce.lifecycle_event as event_type,
  ce.event_timestamp,
  CASE ce.lifecycle_event
    WHEN 'customer_registered' THEN 'high'
    WHEN 'loyalty_tier_changed' THEN 'high'
    ELSE 'normal'
  END as processing_urgency,
  
  -- Customer context
  JSON_OBJECT(
    'customer_id', ce.customer_id,
    'lifecycle_event', ce.lifecycle_event,
    'customer_tier', JSON_EXTRACT(ce.current_customer, '$.loyalty.tier'),
    'registration_date', JSON_EXTRACT(ce.current_customer, '$.createdAt'),
    'preferences', JSON_EXTRACT(ce.current_customer, '$.preferences')
  ) as business_context,
  
  -- Customer webhook payload
  JSON_OBJECT(
    'event_type', ce.lifecycle_event,
    'customer_id', ce.customer_id,
    'timestamp', ce.event_timestamp,
    'customer_data', ce.current_customer
  ) as webhook_payload,
  
  ce.personalization_actions as required_actions,
  
  -- Customer notification channels
  CASE ce.lifecycle_event
    WHEN 'customer_registered' THEN JSON_ARRAY('email', 'welcome_kit')
    WHEN 'loyalty_tier_changed' THEN JSON_ARRAY('email', 'push_notification', 'in_app')
    ELSE JSON_ARRAY('email')
  END as notification_channels,
  
  -- Customer processing configuration
  JSON_OBJECT(
    'immediate_actions', ce.personalization_actions,
    'personalization_config', JSON_OBJECT(
      'update_recommendations', true,
      'refresh_preferences', true,
      'trigger_campaigns', CASE ce.lifecycle_event
        WHEN 'customer_registered' THEN true
        ELSE false
      END
    ),
    'crm_sync_config', JSON_OBJECT(
      'sync_required', true,
      'priority', CASE ce.lifecycle_event
        WHEN 'customer_registered' THEN 'high'
        ELSE 'normal'
      END
    )
  ) as processing_configuration
  
FROM customer_events ce

ORDER BY 
  CASE processing_urgency
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    ELSE 4
  END,
  event_timestamp ASC;

-- Real-time analytics and monitoring for change data capture performance
WITH cdc_performance_metrics AS (
  SELECT 
    DATE_TRUNC('minute', event_timestamp) as time_bucket,
    event_source,
    event_type,
    processing_urgency,
    
    -- Event volume metrics
    COUNT(*) as events_per_minute,
    COUNT(DISTINCT CASE event_source
      WHEN 'order' THEN JSON_EXTRACT(business_context, '$.customer_id')
      WHEN 'customer' THEN JSON_EXTRACT(business_context, '$.customer_id')
      ELSE NULL
    END) as unique_customers_affected,
    
    -- Processing priority distribution
    COUNT(*) FILTER (WHERE processing_urgency = 'critical') as critical_events,
    COUNT(*) FILTER (WHERE processing_urgency = 'high') as high_priority_events,
    COUNT(*) FILTER (WHERE processing_urgency = 'normal') as normal_events,
    
    -- Business event analysis
    COUNT(*) FILTER (WHERE event_type LIKE 'order_%') as order_events,
    COUNT(*) FILTER (WHERE event_type LIKE 'inventory_%') as inventory_events,
    COUNT(*) FILTER (WHERE event_type LIKE 'customer_%') as customer_events,
    
    -- Revenue impact tracking
    SUM(
      CASE 
        WHEN event_type = 'payment_completed' THEN 
          CAST(JSON_EXTRACT(business_context, '$.order_value') AS DECIMAL(10,2))
        ELSE 0
      END
    ) as revenue_processed,
    
    -- Alert generation tracking
    COUNT(*) FILTER (WHERE processing_urgency IN ('critical', 'high')) as alerts_generated
    
  FROM (
    -- Use the main change stream query results
    SELECT * FROM (
      SELECT 
        'order' as event_source,
        rtop.business_event as event_type,
        rtop.event_timestamp,
        CASE 
          WHEN rtop.event_priority >= 8 THEN 'critical'
          WHEN rtop.event_priority >= 6 THEN 'high'
          ELSE 'normal'
        END as processing_urgency,
        rtop.business_context
      FROM real_time_order_processing rtop
      
      UNION ALL
      
      SELECT 
        'inventory' as event_source,
        CONCAT('inventory_', ie.stock_status) as event_type,
        ie.event_timestamp,
        CASE 
          WHEN ie.urgency_score >= 8 THEN 'critical'
          WHEN ie.urgency_score >= 5 THEN 'high'
          ELSE 'normal'
        END as processing_urgency,
        JSON_OBJECT(
          'product_id', ie.product_id,
          'stock_status', ie.stock_status
        ) as business_context
      FROM inventory_events ie
      
      UNION ALL
      
      SELECT 
        'customer' as event_source,
        ce.lifecycle_event as event_type,
        ce.event_timestamp,
        CASE ce.lifecycle_event
          WHEN 'customer_registered' THEN 'high'
          WHEN 'loyalty_tier_changed' THEN 'high'
          ELSE 'normal'
        END as processing_urgency,
        JSON_OBJECT(
          'customer_id', ce.customer_id
        ) as business_context
      FROM customer_events ce
    ) all_events
    WHERE event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  ) recent_events
  GROUP BY 
    DATE_TRUNC('minute', event_timestamp),
    event_source,
    event_type,
    processing_urgency
),

-- Real-time system health monitoring
system_health_metrics AS (
  SELECT 
    CURRENT_TIMESTAMP as health_check_time,
    
    -- Change stream performance indicators
    COUNT(*) as total_events_last_minute,
    AVG(events_per_minute) as avg_events_per_minute,
    MAX(events_per_minute) as peak_events_per_minute,
    
    -- Alert and priority distribution
    SUM(critical_events) as total_critical_events,
    SUM(high_priority_events) as total_high_priority_events,
    SUM(alerts_generated) as total_alerts_generated,
    
    -- Business impact metrics
    SUM(revenue_processed) as total_revenue_processed,
    SUM(unique_customers_affected) as total_customers_affected,
    
    -- Event type distribution
    SUM(order_events) as total_order_events,
    SUM(inventory_events) as total_inventory_events, 
    SUM(customer_events) as total_customer_events,
    
    -- Performance assessment
    CASE 
      WHEN MAX(events_per_minute) > 1000 THEN 'high_load'
      WHEN MAX(events_per_minute) > 500 THEN 'moderate_load'
      WHEN MAX(events_per_minute) > 100 THEN 'normal_load'
      ELSE 'low_load'
    END as system_load_status,
    
    -- Alert status assessment
    CASE 
      WHEN SUM(critical_events) > 50 THEN 'critical_alerts_high'
      WHEN SUM(critical_events) > 10 THEN 'critical_alerts_moderate'
      WHEN SUM(critical_events) > 0 THEN 'critical_alerts_low'
      ELSE 'no_critical_alerts'
    END as alert_status,
    
    -- Recommendations for system optimization
    CASE 
      WHEN MAX(events_per_minute) > 1000 AND SUM(critical_events) > 50 THEN 
        'Scale up processing capacity and review alert thresholds'
      WHEN MAX(events_per_minute) > 1000 THEN 
        'Consider horizontal scaling for change stream processing'
      WHEN SUM(critical_events) > 50 THEN 
        'Review alert sensitivity and business rule configuration'
      ELSE 'System operating within normal parameters'
    END as optimization_recommendation
    
  FROM cdc_performance_metrics
  WHERE time_bucket >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
)

-- Final comprehensive CDC monitoring dashboard
SELECT 
  shm.health_check_time,
  shm.total_events_last_minute,
  ROUND(shm.avg_events_per_minute, 1) as avg_events_per_minute,
  shm.peak_events_per_minute,
  shm.total_critical_events,
  shm.total_high_priority_events,
  ROUND(shm.total_revenue_processed, 2) as revenue_processed_usd,
  shm.total_customers_affected,
  shm.system_load_status,
  shm.alert_status,
  shm.optimization_recommendation,
  
  -- Event distribution summary
  JSON_OBJECT(
    'order_events', shm.total_order_events,
    'inventory_events', shm.total_inventory_events,
    'customer_events', shm.total_customer_events
  ) as event_distribution,
  
  -- Performance indicators
  JSON_OBJECT(
    'events_per_second', ROUND(shm.avg_events_per_minute / 60.0, 2),
    'peak_throughput', shm.peak_events_per_minute,
    'alert_rate', ROUND((shm.total_alerts_generated / NULLIF(shm.total_events_last_minute, 0)) * 100, 2),
    'critical_event_percentage', ROUND((shm.total_critical_events / NULLIF(shm.total_events_last_minute, 0)) * 100, 2)
  ) as performance_indicators,
  
  -- Business impact summary
  JSON_OBJECT(
    'revenue_velocity', ROUND(shm.total_revenue_processed / 60.0, 2),
    'customer_engagement_rate', shm.total_customers_affected,
    'business_event_diversity', (
      CASE WHEN shm.total_order_events > 0 THEN 1 ELSE 0 END +
      CASE WHEN shm.total_inventory_events > 0 THEN 1 ELSE 0 END +
      CASE WHEN shm.total_customer_events > 0 THEN 1 ELSE 0 END
    )
  ) as business_impact,
  
  -- Trend analysis from recent performance metrics
  (
    SELECT JSON_OBJECT(
      'event_trend', CASE 
        WHEN COUNT(*) > 1 AND 
             (MAX(events_per_minute) - MIN(events_per_minute)) / NULLIF(MIN(events_per_minute), 0) > 0.2 
        THEN 'increasing'
        WHEN COUNT(*) > 1 AND 
             (MIN(events_per_minute) - MAX(events_per_minute)) / NULLIF(MAX(events_per_minute), 0) > 0.2 
        THEN 'decreasing'
        ELSE 'stable'
      END,
      'alert_trend', CASE 
        WHEN SUM(critical_events) > LAG(SUM(critical_events)) OVER (ORDER BY time_bucket) 
        THEN 'increasing'
        ELSE 'stable'
      END
    )
    FROM cdc_performance_metrics
    WHERE time_bucket >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    ORDER BY time_bucket DESC
    LIMIT 1
  ) as trend_analysis

FROM system_health_metrics shm;

-- QueryLeaf provides comprehensive change data capture capabilities:
-- 1. Real-time change stream processing with SQL-familiar syntax
-- 2. Advanced event filtering, classification, and routing
-- 3. Business logic integration for intelligent event processing
-- 4. Multi-collection coordination for complex business workflows
-- 5. Comprehensive monitoring and performance analytics
-- 6. Enterprise-grade event sourcing and audit trail capabilities
-- 7. Distributed processing support for high-availability scenarios
-- 8. SQL-style syntax for change stream configuration and management
-- 9. Integration with MongoDB's native change stream capabilities
-- 10. Production-ready scalability and operational monitoring
```

## Best Practices for Change Data Capture Implementation

### Event Processing Strategy Design

Essential principles for effective MongoDB Change Data Capture deployment:

1. **Event Filtering**: Design comprehensive filtering strategies to process only relevant business events
2. **Business Logic Integration**: Embed business rules directly into change stream pipelines for immediate processing
3. **Error Handling**: Implement robust retry mechanisms and dead letter queues for failed event processing
4. **Performance Optimization**: Configure change streams for optimal throughput with appropriate batch sizes
5. **Monitoring Strategy**: Deploy comprehensive monitoring for change stream health and event processing metrics
6. **Scalability Planning**: Design for horizontal scaling with distributed processing capabilities

### Production Implementation

Optimize MongoDB Change Data Capture for enterprise-scale deployments:

1. **Distributed Processing**: Implement leader election and workload distribution for high availability
2. **Event Sourcing**: Maintain complete audit trails with event store and snapshot capabilities
3. **Real-time Analytics**: Integrate change streams with analytics pipelines for immediate insights
4. **Security Implementation**: Ensure proper authentication and authorization for change stream access
5. **Disaster Recovery**: Plan for change stream recovery and replay capabilities
6. **Integration Patterns**: Design microservices integration with event-driven architecture patterns

## Conclusion

MongoDB Change Data Capture through Change Streams provides comprehensive real-time data change notification capabilities that enable responsive, event-driven applications without the performance overhead and latency of traditional polling approaches. The native MongoDB integration ensures that change capture benefits from the same reliability, scalability, and operational features as core database operations.

Key MongoDB Change Data Capture benefits include:

- **Real-Time Responsiveness**: Immediate notification of data changes without polling latency or resource waste
- **Comprehensive Change Information**: Complete change documents including before/after states and modification details
- **Advanced Filtering**: Sophisticated change stream filtering and transformation capabilities within the database
- **Event Ordering**: Guaranteed ordering and delivery of change events for consistent event processing
- **Horizontal Scalability**: Native support for replica sets and sharded clusters with distributed change stream processing
- **Production Ready**: Enterprise-grade reliability with automatic reconnection, resume tokens, and operational monitoring

Whether you're building real-time dashboards, event-driven microservices, collaborative applications, or reactive user experiences, MongoDB Change Data Capture with QueryLeaf's familiar SQL interface provides the foundation for responsive, event-driven architectures.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Change Streams while providing SQL-familiar syntax for change data capture configuration, event processing, and real-time monitoring. Advanced event routing, business logic integration, and distributed processing patterns are seamlessly handled through familiar SQL constructs, making sophisticated real-time capabilities accessible to SQL-oriented development teams.

The combination of MongoDB's robust change stream capabilities with SQL-style event processing makes it an ideal platform for modern applications that require both real-time responsiveness and familiar database interaction patterns, ensuring your event-driven solutions can scale efficiently while remaining maintainable and feature-rich.