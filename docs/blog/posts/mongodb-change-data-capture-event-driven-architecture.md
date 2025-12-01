---
title: "MongoDB Change Data Capture and Event-Driven Architecture: Real-Time Data Processing and System Integration"
description: "Master MongoDB Change Data Capture (CDC) for building event-driven architectures and real-time data processing systems. Learn change streams, event sourcing patterns, and SQL-familiar data synchronization strategies."
date: 2024-11-30
tags: [mongodb, change-data-capture, event-driven, real-time, change-streams, data-synchronization, sql]
---

# MongoDB Change Data Capture and Event-Driven Architecture: Real-Time Data Processing and System Integration

Modern distributed systems require real-time data synchronization and event-driven communication to maintain consistency across microservices, trigger automated workflows, and enable responsive user experiences. Traditional databases provide limited change capture capabilities that require complex polling mechanisms, trigger-based solutions, or external tools that add significant operational overhead and latency to data processing pipelines.

MongoDB Change Data Capture through Change Streams provides native, real-time monitoring of database changes that enables building sophisticated event-driven architectures without external dependencies. Unlike traditional databases that require complex trigger setups or third-party CDC tools, MongoDB's Change Streams deliver ordered, resumable streams of data changes that can power real-time analytics, data synchronization, and reactive application architectures.

## The Traditional Change Detection Challenge

Implementing change detection and event-driven patterns in traditional databases requires complex infrastructure:

```sql
-- Traditional PostgreSQL change detection - complex trigger-based approach

-- Change tracking table for audit and CDC
CREATE TABLE data_change_log (
    change_id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    operation_type VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
    record_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_columns TEXT[],
    change_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_context JSONB,
    transaction_id BIGINT,
    
    -- CDC processing metadata
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    processing_errors TEXT[],
    retry_count INTEGER DEFAULT 0,
    
    -- Event routing information
    event_type VARCHAR(100),
    event_source VARCHAR(100),
    correlation_id UUID
);

-- Complex trigger function for change capture
CREATE OR REPLACE FUNCTION capture_table_changes() 
RETURNS TRIGGER AS $$
DECLARE
    old_record JSONB := '{}';
    new_record JSONB := '{}';
    changed_cols TEXT[] := '{}';
    col_name TEXT;
    event_type_val VARCHAR(100);
    correlation_id_val UUID;
BEGIN
    -- Determine operation type and build change record
    IF TG_OP = 'DELETE' THEN
        old_record := row_to_json(OLD)::JSONB;
        event_type_val := TG_TABLE_NAME || '_deleted';
        
        -- Extract correlation ID from old record if available
        correlation_id_val := (old_record->>'correlation_id')::UUID;
        
        INSERT INTO data_change_log (
            table_name, operation_type, record_id, old_values, 
            event_type, event_source, correlation_id, transaction_id
        ) VALUES (
            TG_TABLE_NAME, 'DELETE', (old_record->>'id')::UUID, old_record,
            event_type_val, 'database_trigger', correlation_id_val, txid_current()
        );
        
        RETURN OLD;
        
    ELSIF TG_OP = 'UPDATE' THEN
        old_record := row_to_json(OLD)::JSONB;
        new_record := row_to_json(NEW)::JSONB;
        event_type_val := TG_TABLE_NAME || '_updated';
        
        -- Identify changed columns
        FOR col_name IN 
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = TG_TABLE_NAME 
                AND table_schema = TG_TABLE_SCHEMA
        LOOP
            IF (old_record->>col_name) IS DISTINCT FROM (new_record->>col_name) THEN
                changed_cols := array_append(changed_cols, col_name);
            END IF;
        END LOOP;
        
        -- Only log if there are actual changes
        IF array_length(changed_cols, 1) > 0 THEN
            correlation_id_val := COALESCE(
                (new_record->>'correlation_id')::UUID,
                (old_record->>'correlation_id')::UUID
            );
            
            INSERT INTO data_change_log (
                table_name, operation_type, record_id, old_values, new_values,
                changed_columns, event_type, event_source, correlation_id, transaction_id
            ) VALUES (
                TG_TABLE_NAME, 'UPDATE', (new_record->>'id')::UUID, old_record, new_record,
                changed_cols, event_type_val, 'database_trigger', correlation_id_val, txid_current()
            );
        END IF;
        
        RETURN NEW;
        
    ELSIF TG_OP = 'INSERT' THEN
        new_record := row_to_json(NEW)::JSONB;
        event_type_val := TG_TABLE_NAME || '_created';
        correlation_id_val := (new_record->>'correlation_id')::UUID;
        
        INSERT INTO data_change_log (
            table_name, operation_type, record_id, new_values,
            event_type, event_source, correlation_id, transaction_id
        ) VALUES (
            TG_TABLE_NAME, 'INSERT', (new_record->>'id')::UUID, new_record,
            event_type_val, 'database_trigger', correlation_id_val, txid_current()
        );
        
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables that need change tracking
CREATE TRIGGER users_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION capture_table_changes();

CREATE TRIGGER orders_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION capture_table_changes();

CREATE TRIGGER products_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION capture_table_changes();

-- Complex change processing and event dispatch
CREATE OR REPLACE FUNCTION process_pending_changes()
RETURNS INTEGER AS $$
DECLARE
    change_record RECORD;
    processed_count INTEGER := 0;
    event_payload JSONB;
    webhook_url TEXT;
    http_response INTEGER;
    max_retries INTEGER := 3;
BEGIN
    -- Process unprocessed changes in chronological order
    FOR change_record IN 
        SELECT * FROM data_change_log 
        WHERE processed = FALSE 
            AND retry_count < max_retries
        ORDER BY change_timestamp ASC
        LIMIT 1000 -- Process in batches
    LOOP
        BEGIN
            -- Build event payload for external systems
            event_payload := jsonb_build_object(
                'eventId', change_record.change_id,
                'eventType', change_record.event_type,
                'eventSource', change_record.event_source,
                'eventTime', change_record.change_timestamp,
                'correlationId', change_record.correlation_id,
                'data', jsonb_build_object(
                    'tableName', change_record.table_name,
                    'operationType', change_record.operation_type,
                    'recordId', change_record.record_id,
                    'oldValues', change_record.old_values,
                    'newValues', change_record.new_values,
                    'changedColumns', change_record.changed_columns
                ),
                'metadata', jsonb_build_object(
                    'transactionId', change_record.transaction_id,
                    'processingAttempt', change_record.retry_count + 1,
                    'processingTime', CURRENT_TIMESTAMP
                )
            );
            
            -- Route events based on event type (simplified webhook example)
            webhook_url := CASE 
                WHEN change_record.event_type LIKE '%_user_%' THEN 'http://user-service/api/events'
                WHEN change_record.event_type LIKE '%_order_%' THEN 'http://order-service/api/events'
                WHEN change_record.event_type LIKE '%_product_%' THEN 'http://catalog-service/api/events'
                ELSE 'http://default-event-handler/api/events'
            END;
            
            -- Simulate HTTP webhook call (would use actual HTTP extension in practice)
            -- SELECT http_post(webhook_url, event_payload::TEXT, 'application/json') INTO http_response;
            http_response := 200; -- Simulated success
            
            IF http_response BETWEEN 200 AND 299 THEN
                -- Mark as successfully processed
                UPDATE data_change_log 
                SET processed = TRUE,
                    processed_at = CURRENT_TIMESTAMP,
                    processing_errors = NULL
                WHERE change_id = change_record.change_id;
                
                processed_count := processed_count + 1;
            ELSE
                -- Record processing failure
                UPDATE data_change_log 
                SET retry_count = retry_count + 1,
                    processing_errors = array_append(
                        COALESCE(processing_errors, '{}'), 
                        'HTTP ' || http_response || ' at ' || CURRENT_TIMESTAMP
                    )
                WHERE change_id = change_record.change_id;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            -- Record processing exception
            UPDATE data_change_log 
            SET retry_count = retry_count + 1,
                processing_errors = array_append(
                    COALESCE(processing_errors, '{}'), 
                    'Exception: ' || SQLERRM || ' at ' || CURRENT_TIMESTAMP
                )
            WHERE change_id = change_record.change_id;
        END;
    END LOOP;
    
    RETURN processed_count;
END;
$$ LANGUAGE plpgsql;

-- Scheduled job to process changes (requires external cron setup)
-- */5 * * * * psql -d production -c "SELECT process_pending_changes();"

-- Complex monitoring for change processing pipeline
SELECT 
    table_name,
    operation_type,
    event_type,
    
    -- Processing statistics
    COUNT(*) as total_changes,
    COUNT(*) FILTER (WHERE processed = TRUE) as processed_changes,
    COUNT(*) FILTER (WHERE processed = FALSE) as pending_changes,
    COUNT(*) FILTER (WHERE retry_count >= 3) as failed_changes,
    
    -- Performance metrics
    AVG(EXTRACT(EPOCH FROM (processed_at - change_timestamp))) as avg_processing_latency_seconds,
    MAX(EXTRACT(EPOCH FROM (processed_at - change_timestamp))) as max_processing_latency_seconds,
    
    -- Error analysis
    COUNT(*) FILTER (WHERE processing_errors IS NOT NULL) as changes_with_errors,
    AVG(retry_count) as avg_retry_count,
    
    -- Time-based analysis
    MIN(change_timestamp) as oldest_change,
    MAX(change_timestamp) as newest_change,
    
    -- Health indicators
    ROUND(
        COUNT(*) FILTER (WHERE processed = TRUE)::DECIMAL / COUNT(*) * 100, 
        2
    ) as success_rate_percent

FROM data_change_log
WHERE change_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY table_name, operation_type, event_type
ORDER BY total_changes DESC;

-- Problems with traditional change data capture:
-- 1. Complex trigger infrastructure requiring careful maintenance and testing
-- 2. Performance overhead from trigger execution on every database operation  
-- 3. Manual event routing and delivery logic with limited reliability guarantees
-- 4. Difficulty handling high-throughput scenarios without impacting database performance
-- 5. Complex error handling and retry logic for failed event deliveries
-- 6. Limited ordering guarantees for related changes across multiple tables
-- 7. Challenges with transaction boundaries and event atomicity
-- 8. Manual setup and maintenance of change processing infrastructure
-- 9. Limited scalability for high-volume change streams
-- 10. Complex monitoring and alerting for change processing pipeline health
```

MongoDB provides native Change Data Capture through Change Streams with real-time event processing:

```javascript
// MongoDB Change Data Capture - native real-time event-driven architecture
const { MongoClient } = require('mongodb');

// Advanced MongoDB Change Data Capture Manager
class MongoChangeDataCaptureManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.changeStreams = new Map();
    this.eventHandlers = new Map();
    this.processingMetrics = new Map();
    this.eventQueue = [];
    this.isProcessing = false;
  }

  async initialize() {
    console.log('Initializing MongoDB Change Data Capture Manager...');
    
    // Connect with optimized settings for change streams
    this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017', {
      // Replica set required for change streams
      replicaSet: process.env.MONGODB_REPLICA_SET || 'rs0',
      
      // Connection pool settings for change streams
      maxPoolSize: 20,
      minPoolSize: 5,
      maxIdleTimeMS: 60000,
      
      // Read preferences for change streams
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      
      // Write concern for reliable change stream processing
      writeConcern: { w: 'majority', j: true },
      
      // Compression for change stream data
      compressors: ['zlib'],
      
      appName: 'ChangeDataCaptureManager'
    });

    await this.client.connect();
    this.db = this.client.db('ecommerce');
    
    // Initialize event handlers and change stream configurations
    await this.setupEventHandlers();
    await this.initializeChangeStreams();
    
    console.log('✅ MongoDB Change Data Capture Manager initialized');
  }

  async setupEventHandlers() {
    console.log('Setting up event handlers for different change types...');
    
    // User-related event handlers
    this.eventHandlers.set('user_created', async (changeEvent) => {
      await this.handleUserCreated(changeEvent);
    });
    
    this.eventHandlers.set('user_updated', async (changeEvent) => {
      await this.handleUserUpdated(changeEvent);
    });
    
    this.eventHandlers.set('user_deleted', async (changeEvent) => {
      await this.handleUserDeleted(changeEvent);
    });
    
    // Order-related event handlers
    this.eventHandlers.set('order_created', async (changeEvent) => {
      await this.handleOrderCreated(changeEvent);
    });
    
    this.eventHandlers.set('order_status_updated', async (changeEvent) => {
      await this.handleOrderStatusUpdated(changeEvent);
    });
    
    this.eventHandlers.set('order_cancelled', async (changeEvent) => {
      await this.handleOrderCancelled(changeEvent);
    });
    
    // Product catalog event handlers
    this.eventHandlers.set('product_created', async (changeEvent) => {
      await this.handleProductCreated(changeEvent);
    });
    
    this.eventHandlers.set('product_updated', async (changeEvent) => {
      await this.handleProductUpdated(changeEvent);
    });
    
    this.eventHandlers.set('inventory_updated', async (changeEvent) => {
      await this.handleInventoryUpdated(changeEvent);
    });
    
    console.log('✅ Event handlers configured');
  }

  async initializeChangeStreams() {
    console.log('Initializing MongoDB change streams...');
    
    // Watch users collection for account-related events
    await this.createChangeStream('users', {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable'
    }, this.processUserChanges.bind(this));
    
    // Watch orders collection for order lifecycle events
    await this.createChangeStream('orders', {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable'
    }, this.processOrderChanges.bind(this));
    
    // Watch products collection for catalog changes
    await this.createChangeStream('products', {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable'
    }, this.processProductChanges.bind(this));
    
    // Watch inventory collection for stock changes
    await this.createChangeStream('inventory', {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable'
    }, this.processInventoryChanges.bind(this));
    
    console.log('✅ Change streams initialized and watching for changes');
  }

  async createChangeStream(collectionName, options, changeHandler) {
    try {
      const collection = this.db.collection(collectionName);
      const changeStream = collection.watch([], options);
      
      // Store change stream for management
      this.changeStreams.set(collectionName, {
        stream: changeStream,
        collection: collectionName,
        options: options,
        handler: changeHandler,
        createdAt: new Date(),
        isActive: true,
        errorCount: 0,
        lastError: null,
        processedEvents: 0
      });
      
      // Set up change event processing
      changeStream.on('change', async (changeDoc) => {
        try {
          await changeHandler(changeDoc);
          
          // Update metrics
          const streamInfo = this.changeStreams.get(collectionName);
          streamInfo.processedEvents++;
          streamInfo.lastProcessedAt = new Date();
          
        } catch (error) {
          console.error(`Error processing change for ${collectionName}:`, error);
          this.recordStreamError(collectionName, error);
        }
      });
      
      // Handle stream errors
      changeStream.on('error', (error) => {
        console.error(`Change stream error for ${collectionName}:`, error);
        this.recordStreamError(collectionName, error);
        this.handleStreamError(collectionName, error);
      });
      
      // Handle stream close
      changeStream.on('close', () => {
        console.warn(`Change stream closed for ${collectionName}`);
        const streamInfo = this.changeStreams.get(collectionName);
        if (streamInfo) {
          streamInfo.isActive = false;
          streamInfo.closedAt = new Date();
        }
      });
      
      console.log(`✅ Change stream created for collection: ${collectionName}`);
      
    } catch (error) {
      console.error(`Error creating change stream for ${collectionName}:`, error);
      throw error;
    }
  }

  async processUserChanges(changeDoc) {
    const { operationType, fullDocument, fullDocumentBeforeChange, documentKey } = changeDoc;
    
    // Build standardized event object
    const event = {
      eventId: changeDoc._id,
      eventType: `user_${operationType}`,
      eventTime: changeDoc.clusterTime,
      source: 'mongodb_change_stream',
      
      // Document information
      documentId: documentKey._id,
      operationType: operationType,
      
      // Document data
      currentDocument: fullDocument,
      previousDocument: fullDocumentBeforeChange,
      
      // Change metadata
      namespace: changeDoc.ns,
      transactionId: changeDoc.txnNumber,
      sessionId: changeDoc.lsid,
      
      // Processing metadata
      receivedAt: new Date(),
      processingStatus: 'pending'
    };
    
    // Add operation-specific data
    if (operationType === 'update') {
      event.updatedFields = changeDoc.updateDescription?.updatedFields || {};
      event.removedFields = changeDoc.updateDescription?.removedFields || [];
      
      // Detect specific user events
      if (event.updatedFields.status) {
        event.eventType = `user_status_changed`;
        event.statusChange = {
          from: fullDocumentBeforeChange?.status,
          to: fullDocument?.status
        };
      }
      
      if (event.updatedFields.email) {
        event.eventType = `user_email_changed`;
        event.emailChange = {
          from: fullDocumentBeforeChange?.email,
          to: fullDocument?.email
        };
      }
    }
    
    // Route to appropriate event handler
    const handler = this.eventHandlers.get(event.eventType);
    if (handler) {
      await handler(event);
    } else {
      console.warn(`No handler found for event type: ${event.eventType}`);
      await this.handleGenericEvent(event);
    }
  }

  async processOrderChanges(changeDoc) {
    const { operationType, fullDocument, fullDocumentBeforeChange, documentKey } = changeDoc;
    
    const event = {
      eventId: changeDoc._id,
      eventType: `order_${operationType}`,
      eventTime: changeDoc.clusterTime,
      source: 'mongodb_change_stream',
      
      documentId: documentKey._id,
      operationType: operationType,
      currentDocument: fullDocument,
      previousDocument: fullDocumentBeforeChange,
      
      namespace: changeDoc.ns,
      receivedAt: new Date(),
      processingStatus: 'pending'
    };
    
    // Detect order-specific events
    if (operationType === 'update') {
      event.updatedFields = changeDoc.updateDescription?.updatedFields || {};
      
      // Order status changes
      if (event.updatedFields.status) {
        event.eventType = 'order_status_updated';
        event.statusChange = {
          from: fullDocumentBeforeChange?.status,
          to: fullDocument?.status,
          orderId: fullDocument?.orderNumber,
          customerId: fullDocument?.customerId
        };
        
        // Specific status-based events
        if (fullDocument?.status === 'cancelled') {
          event.eventType = 'order_cancelled';
        } else if (fullDocument?.status === 'shipped') {
          event.eventType = 'order_shipped';
        } else if (fullDocument?.status === 'delivered') {
          event.eventType = 'order_delivered';
        }
      }
      
      // Payment status changes
      if (event.updatedFields['payment.status']) {
        event.eventType = 'order_payment_updated';
        event.paymentChange = {
          from: fullDocumentBeforeChange?.payment?.status,
          to: fullDocument?.payment?.status
        };
      }
    }
    
    // Route to handler
    const handler = this.eventHandlers.get(event.eventType);
    if (handler) {
      await handler(event);
    } else {
      await this.handleGenericEvent(event);
    }
  }

  async processProductChanges(changeDoc) {
    const { operationType, fullDocument, fullDocumentBeforeChange, documentKey } = changeDoc;
    
    const event = {
      eventId: changeDoc._id,
      eventType: `product_${operationType}`,
      eventTime: changeDoc.clusterTime,
      source: 'mongodb_change_stream',
      
      documentId: documentKey._id,
      operationType: operationType,
      currentDocument: fullDocument,
      previousDocument: fullDocumentBeforeChange,
      
      receivedAt: new Date(),
      processingStatus: 'pending'
    };
    
    // Detect product-specific events
    if (operationType === 'update') {
      event.updatedFields = changeDoc.updateDescription?.updatedFields || {};
      
      // Price changes
      if (event.updatedFields.price) {
        event.eventType = 'product_price_changed';
        event.priceChange = {
          from: fullDocumentBeforeChange?.price,
          to: fullDocument?.price,
          sku: fullDocument?.sku,
          changePercent: fullDocumentBeforeChange?.price ? 
            ((fullDocument.price - fullDocumentBeforeChange.price) / fullDocumentBeforeChange.price * 100) : null
        };
      }
      
      // Status changes (active/inactive)
      if (event.updatedFields.status) {
        event.eventType = 'product_status_changed';
        event.statusChange = {
          from: fullDocumentBeforeChange?.status,
          to: fullDocument?.status,
          sku: fullDocument?.sku
        };
      }
    }
    
    const handler = this.eventHandlers.get(event.eventType);
    if (handler) {
      await handler(event);
    } else {
      await this.handleGenericEvent(event);
    }
  }

  async processInventoryChanges(changeDoc) {
    const { operationType, fullDocument, fullDocumentBeforeChange, documentKey } = changeDoc;
    
    const event = {
      eventId: changeDoc._id,
      eventType: `inventory_${operationType}`,
      eventTime: changeDoc.clusterTime,
      source: 'mongodb_change_stream',
      
      documentId: documentKey._id,
      operationType: operationType,
      currentDocument: fullDocument,
      previousDocument: fullDocumentBeforeChange,
      
      receivedAt: new Date(),
      processingStatus: 'pending'
    };
    
    // Inventory-specific event detection
    if (operationType === 'update') {
      event.updatedFields = changeDoc.updateDescription?.updatedFields || {};
      
      // Stock level changes
      if (event.updatedFields.stockQuantity !== undefined) {
        event.eventType = 'inventory_updated';
        event.stockChange = {
          from: fullDocumentBeforeChange?.stockQuantity || 0,
          to: fullDocument?.stockQuantity || 0,
          productId: fullDocument?.productId,
          sku: fullDocument?.sku,
          change: (fullDocument?.stockQuantity || 0) - (fullDocumentBeforeChange?.stockQuantity || 0)
        };
        
        // Low stock alerts
        if (fullDocument?.stockQuantity <= (fullDocument?.lowStockThreshold || 10)) {
          event.eventType = 'inventory_low_stock';
          event.lowStockAlert = {
            currentStock: fullDocument?.stockQuantity,
            threshold: fullDocument?.lowStockThreshold,
            productId: fullDocument?.productId
          };
        }
        
        // Out of stock alerts  
        if (fullDocument?.stockQuantity <= 0 && (fullDocumentBeforeChange?.stockQuantity || 0) > 0) {
          event.eventType = 'inventory_out_of_stock';
        }
      }
    }
    
    const handler = this.eventHandlers.get(event.eventType);
    if (handler) {
      await handler(event);
    } else {
      await this.handleGenericEvent(event);
    }
  }

  // Event handler implementations
  async handleUserCreated(event) {
    console.log(`Processing user created event: ${event.currentDocument.email}`);
    
    try {
      // Send welcome email
      await this.sendWelcomeEmail(event.currentDocument);
      
      // Create user profile in analytics system
      await this.createAnalyticsProfile(event.currentDocument);
      
      // Add to mailing list
      await this.addToMailingList(event.currentDocument);
      
      // Log event processing
      await this.logEventProcessed(event, 'success');
      
    } catch (error) {
      console.error('Error handling user created event:', error);
      await this.logEventProcessed(event, 'error', error.message);
      throw error;
    }
  }

  async handleOrderStatusUpdated(event) {
    console.log(`Processing order status update: ${event.statusChange.from} -> ${event.statusChange.to}`);
    
    try {
      // Send status update notification
      await this.sendOrderStatusNotification(event);
      
      // Update order analytics
      await this.updateOrderAnalytics(event);
      
      // Trigger fulfillment workflows
      if (event.statusChange.to === 'confirmed') {
        await this.triggerFulfillmentWorkflow(event.currentDocument);
      }
      
      // Update inventory reservations
      if (event.statusChange.to === 'cancelled') {
        await this.releaseInventoryReservation(event.currentDocument);
      }
      
      await this.logEventProcessed(event, 'success');
      
    } catch (error) {
      console.error('Error handling order status update:', error);
      await this.logEventProcessed(event, 'error', error.message);
      throw error;
    }
  }

  async handleInventoryUpdated(event) {
    console.log(`Processing inventory update: ${event.stockChange.sku} stock changed by ${event.stockChange.change}`);
    
    try {
      // Update search index with new stock levels
      await this.updateSearchIndex(event.currentDocument);
      
      // Notify interested customers about restocking
      if (event.stockChange.change > 0 && event.stockChange.from === 0) {
        await this.notifyRestocking(event.currentDocument);
      }
      
      // Update real-time inventory dashboard
      await this.updateInventoryDashboard(event);
      
      // Trigger reorder notifications for low stock
      if (event.eventType === 'inventory_low_stock') {
        await this.triggerReorderAlert(event.lowStockAlert);
      }
      
      await this.logEventProcessed(event, 'success');
      
    } catch (error) {
      console.error('Error handling inventory update:', error);
      await this.logEventProcessed(event, 'error', error.message);
      throw error;
    }
  }

  async handleGenericEvent(event) {
    console.log(`Processing generic event: ${event.eventType}`);
    
    // Store event for audit purposes
    await this.db.collection('event_audit_log').insertOne({
      eventId: event.eventId,
      eventType: event.eventType,
      eventTime: event.eventTime,
      documentId: event.documentId,
      operationType: event.operationType,
      processedAt: new Date(),
      handlerType: 'generic'
    });
  }

  // Helper methods for event processing
  async sendWelcomeEmail(user) {
    // Integration with email service
    console.log(`Sending welcome email to ${user.email}`);
    // await emailService.sendWelcomeEmail(user);
  }

  async sendOrderStatusNotification(event) {
    // Integration with notification service
    console.log(`Sending order notification for order ${event.currentDocument.orderNumber}`);
    // await notificationService.sendOrderUpdate(event);
  }

  async updateSearchIndex(inventoryDoc) {
    // Integration with search service
    console.log(`Updating search index for product ${inventoryDoc.sku}`);
    // await searchService.updateProductInventory(inventoryDoc);
  }

  async logEventProcessed(event, status, errorMessage = null) {
    await this.db.collection('event_processing_log').insertOne({
      eventId: event.eventId,
      eventType: event.eventType,
      documentId: event.documentId,
      processingStatus: status,
      processedAt: new Date(),
      receivedAt: event.receivedAt,
      processingDuration: Date.now() - event.receivedAt.getTime(),
      errorMessage: errorMessage
    });
  }

  recordStreamError(collectionName, error) {
    const streamInfo = this.changeStreams.get(collectionName);
    if (streamInfo) {
      streamInfo.errorCount++;
      streamInfo.lastError = {
        message: error.message,
        timestamp: new Date(),
        stack: error.stack
      };
    }
  }

  async handleStreamError(collectionName, error) {
    console.error(`Handling stream error for ${collectionName}:`, error);
    
    // Attempt to restart the change stream
    setTimeout(async () => {
      try {
        const streamInfo = this.changeStreams.get(collectionName);
        if (streamInfo && !streamInfo.isActive) {
          console.log(`Attempting to restart change stream for ${collectionName}`);
          await this.createChangeStream(
            collectionName, 
            streamInfo.options, 
            streamInfo.handler
          );
        }
      } catch (restartError) {
        console.error(`Failed to restart change stream for ${collectionName}:`, restartError);
      }
    }, 5000); // Wait 5 seconds before restart attempt
  }

  async getChangeStreamMetrics() {
    const metrics = {
      timestamp: new Date(),
      streams: {},
      systemHealth: 'unknown',
      totalEventsProcessed: 0,
      activeStreams: 0
    };
    
    for (const [collectionName, streamInfo] of this.changeStreams) {
      metrics.streams[collectionName] = {
        collection: collectionName,
        isActive: streamInfo.isActive,
        createdAt: streamInfo.createdAt,
        processedEvents: streamInfo.processedEvents,
        errorCount: streamInfo.errorCount,
        lastError: streamInfo.lastError,
        lastProcessedAt: streamInfo.lastProcessedAt,
        
        healthStatus: streamInfo.isActive ? 
          (streamInfo.errorCount < 5 ? 'healthy' : 'warning') : 'inactive'
      };
      
      metrics.totalEventsProcessed += streamInfo.processedEvents;
      if (streamInfo.isActive) metrics.activeStreams++;
    }
    
    // Determine system health
    const totalStreams = this.changeStreams.size;
    if (metrics.activeStreams === totalStreams) {
      metrics.systemHealth = 'healthy';
    } else if (metrics.activeStreams > totalStreams / 2) {
      metrics.systemHealth = 'degraded';
    } else {
      metrics.systemHealth = 'critical';
    }
    
    return metrics;
  }

  async shutdown() {
    console.log('Shutting down MongoDB Change Data Capture Manager...');
    
    // Close all change streams
    for (const [collectionName, streamInfo] of this.changeStreams) {
      try {
        if (streamInfo.stream && streamInfo.isActive) {
          await streamInfo.stream.close();
          console.log(`✅ Closed change stream for ${collectionName}`);
        }
      } catch (error) {
        console.error(`Error closing change stream for ${collectionName}:`, error);
      }
    }
    
    // Close MongoDB connection
    if (this.client) {
      await this.client.close();
      console.log('✅ MongoDB connection closed');
    }
    
    this.changeStreams.clear();
    this.eventHandlers.clear();
    this.processingMetrics.clear();
  }
}

// Export the change data capture manager
module.exports = { MongoChangeDataCaptureManager };

// Benefits of MongoDB Change Data Capture:
// - Native real-time change streams eliminate polling and trigger complexity
// - Ordered, resumable event streams ensure reliable event processing
// - Full document context provides complete change information
// - Built-in error handling and automatic reconnection capabilities
// - Transaction-aware change detection with ACID guarantees
// - Scalable event processing without performance impact on source database
// - Flexible event routing and transformation capabilities
// - Production-ready monitoring and metrics for change stream health
// - Zero external dependencies for change data capture functionality
// - SQL-compatible event processing patterns through QueryLeaf integration
```

## SQL-Style Change Data Capture with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB change data capture and event processing:

```sql
-- QueryLeaf Change Data Capture with SQL-familiar syntax

-- Create change stream monitors
CREATE CHANGE STREAM user_changes 
ON COLLECTION users
WITH OPTIONS (
  full_document = 'updateLookup',
  full_document_before_change = 'whenAvailable',
  resume_token_collection = 'change_stream_tokens'
)
AS SELECT 
  change_id,
  operation_type,
  document_id,
  cluster_time as event_time,
  
  -- Document data
  full_document as current_document,
  full_document_before_change as previous_document,
  
  -- Change details
  updated_fields,
  removed_fields,
  
  -- Event classification
  CASE operation_type
    WHEN 'insert' THEN 'user_created'
    WHEN 'update' THEN 
      CASE 
        WHEN updated_fields ? 'status' THEN 'user_status_changed'
        WHEN updated_fields ? 'email' THEN 'user_email_changed'
        ELSE 'user_updated'
      END
    WHEN 'delete' THEN 'user_deleted'
  END as event_type,
  
  -- Processing metadata
  CURRENT_TIMESTAMP as received_at,
  'pending' as processing_status

FROM mongodb_change_stream;

-- Query change stream events
SELECT 
  event_type,
  event_time,
  document_id,
  operation_type,
  
  -- Extract specific field changes
  current_document->>'email' as current_email,
  previous_document->>'email' as previous_email,
  current_document->>'status' as current_status,
  previous_document->>'status' as previous_status,
  
  -- Change analysis
  CASE 
    WHEN operation_type = 'update' AND updated_fields ? 'status' THEN
      JSON_OBJECT(
        'field', 'status',
        'from', previous_document->>'status',
        'to', current_document->>'status',
        'change_type', 'status_transition'
      )
  END as change_details,
  
  processing_status,
  received_at

FROM user_changes
WHERE event_time >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
ORDER BY event_time DESC;

-- Event processing pipeline with SQL
WITH processed_events AS (
  SELECT 
    change_id,
    event_type,
    document_id,
    
    -- Route events to handlers
    CASE event_type
      WHEN 'user_created' THEN 'user_management_service'
      WHEN 'user_status_changed' THEN 'notification_service'
      WHEN 'order_status_updated' THEN 'order_fulfillment_service'
      WHEN 'inventory_updated' THEN 'inventory_management_service'
      ELSE 'default_event_handler'
    END as target_service,
    
    -- Event priority
    CASE event_type
      WHEN 'order_cancelled' THEN 'high'
      WHEN 'inventory_out_of_stock' THEN 'high'
      WHEN 'user_created' THEN 'medium'
      ELSE 'low'
    END as priority,
    
    -- Event payload
    JSON_OBJECT(
      'eventId', change_id,
      'eventType', event_type,
      'documentId', document_id,
      'currentDocument', current_document,
      'previousDocument', previous_document,
      'changeDetails', change_details,
      'eventTime', event_time,
      'receivedAt', received_at
    ) as event_payload
    
  FROM user_changes
  WHERE processing_status = 'pending'
),

event_routing AS (
  SELECT 
    *,
    -- Generate webhook URLs for event delivery
    CONCAT('https://api.example.com/services/', target_service, '/events') as webhook_url,
    
    -- Retry configuration
    CASE priority
      WHEN 'high' THEN 5
      WHEN 'medium' THEN 3
      ELSE 1
    END as max_retries
    
  FROM processed_events
)

-- Process events (would integrate with actual webhook delivery)
SELECT 
  change_id,
  event_type,
  target_service,
  priority,
  webhook_url,
  event_payload,
  max_retries,
  
  -- Processing recommendations
  CASE priority
    WHEN 'high' THEN 'Process immediately with dedicated queue'
    WHEN 'medium' THEN 'Process within 30 seconds'
    ELSE 'Process in batch queue'
  END as processing_strategy

FROM event_routing
ORDER BY 
  CASE priority
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    ELSE 3
  END,
  event_time;

-- Change stream performance monitoring
SELECT 
  stream_name,
  collection_name,
  
  -- Activity metrics
  total_events_processed,
  events_per_hour,
  
  -- Event type distribution
  (events_by_type->>'insert')::INTEGER as insert_events,
  (events_by_type->>'update')::INTEGER as update_events,
  (events_by_type->>'delete')::INTEGER as delete_events,
  
  -- Performance metrics
  ROUND(avg_processing_latency_ms::NUMERIC, 2) as avg_latency_ms,
  ROUND(p95_processing_latency_ms::NUMERIC, 2) as p95_latency_ms,
  
  -- Error handling
  error_count,
  ROUND(error_rate::NUMERIC * 100, 2) as error_rate_percent,
  last_error_time,
  
  -- Stream health
  is_active,
  last_heartbeat,
  
  CASE 
    WHEN NOT is_active THEN 'critical'
    WHEN error_rate > 0.05 THEN 'warning'
    WHEN avg_processing_latency_ms > 1000 THEN 'slow'
    ELSE 'healthy'
  END as health_status

FROM change_stream_metrics
WHERE last_updated >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
ORDER BY events_per_hour DESC;

-- Event-driven architecture analytics
CREATE VIEW event_driven_analytics AS
WITH event_patterns AS (
  SELECT 
    event_type,
    target_service,
    DATE_TRUNC('hour', event_time) as hour_bucket,
    
    -- Volume metrics
    COUNT(*) as event_count,
    COUNT(DISTINCT document_id) as unique_documents,
    
    -- Processing metrics
    AVG(EXTRACT(EPOCH FROM (processed_at - received_at))) as avg_processing_time_seconds,
    COUNT(*) FILTER (WHERE processing_status = 'success') as successful_events,
    COUNT(*) FILTER (WHERE processing_status = 'error') as failed_events,
    
    -- Event characteristics
    AVG(JSON_LENGTH(event_payload)) as avg_payload_size,
    COUNT(*) FILTER (WHERE priority = 'high') as high_priority_events

  FROM change_stream_events
  WHERE event_time >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY event_type, target_service, DATE_TRUNC('hour', event_time)
)

SELECT 
  event_type,
  target_service,
  TO_CHAR(hour_bucket, 'YYYY-MM-DD HH24:00') as analysis_hour,
  
  -- Volume analysis
  event_count,
  unique_documents,
  high_priority_events,
  
  -- Performance analysis
  ROUND(avg_processing_time_seconds::NUMERIC, 3) as avg_processing_seconds,
  ROUND((successful_events::DECIMAL / event_count * 100)::NUMERIC, 2) as success_rate_percent,
  
  -- System load indicators
  CASE 
    WHEN event_count > 10000 THEN 'very_high'
    WHEN event_count > 1000 THEN 'high'
    WHEN event_count > 100 THEN 'medium'
    ELSE 'low'
  END as event_volume_category,
  
  -- Performance assessment
  CASE 
    WHEN avg_processing_time_seconds > 5 THEN 'processing_slow'
    WHEN successful_events::DECIMAL / event_count < 0.95 THEN 'high_error_rate'
    WHEN event_count > 5000 AND avg_processing_time_seconds > 1 THEN 'capacity_strain'
    ELSE 'performing_well'
  END as performance_indicator,
  
  -- Optimization recommendations
  CASE 
    WHEN high_priority_events > event_count * 0.3 THEN 'Consider dedicated high-priority queue'
    WHEN failed_events > 10 THEN 'Review error handling and retry logic'
    WHEN avg_processing_time_seconds > 2 THEN 'Optimize event processing pipeline'
    WHEN event_count > 1000 AND unique_documents < event_count * 0.1 THEN 'Consider event deduplication'
    ELSE 'Event processing optimized for current load'
  END as optimization_recommendation

FROM event_patterns
ORDER BY event_count DESC, hour_bucket DESC;

-- QueryLeaf provides comprehensive Change Data Capture capabilities:
-- 1. SQL-familiar syntax for creating and managing change streams
-- 2. Real-time event processing with automatic routing and prioritization
-- 3. Comprehensive monitoring and analytics for event-driven architectures
-- 4. Error handling and retry logic integrated into SQL workflows
-- 5. Performance optimization recommendations based on event patterns
-- 6. Integration with MongoDB's native change stream capabilities
-- 7. Enterprise-grade event processing accessible through familiar SQL constructs
-- 8. Scalable event-driven architecture patterns with SQL-style management
```

## Best Practices for MongoDB Change Data Capture

### Change Stream Design Patterns

Essential practices for implementing change data capture:

1. **Event Classification**: Design clear event taxonomies that map business operations to technical changes
2. **Error Handling Strategy**: Implement comprehensive retry logic and dead letter queues for failed events
3. **Performance Monitoring**: Establish metrics and alerting for change stream health and processing latency
4. **Resumability**: Use resume tokens to ensure reliable event processing across application restarts
5. **Filtering Strategy**: Apply appropriate filters to change streams to process only relevant events
6. **Scalability Planning**: Design event processing pipelines that can handle high-throughput scenarios

### Production Deployment Considerations

Key factors for enterprise change data capture deployments:

1. **Replica Set Requirements**: Ensure proper replica set configuration for change stream availability
2. **Resource Planning**: Account for change stream resource consumption and event processing overhead
3. **Event Ordering**: Understand and leverage MongoDB's event ordering guarantees for related changes
4. **Disaster Recovery**: Plan for change stream recovery and event replay scenarios
5. **Security Configuration**: Implement proper authentication and authorization for change stream access
6. **Monitoring Integration**: Integrate change stream metrics with existing monitoring and alerting systems

## Conclusion

MongoDB Change Data Capture through Change Streams provides enterprise-grade real-time event processing that enables sophisticated event-driven architectures without external dependencies. The combination of native change detection, ordered event delivery, and comprehensive error handling enables applications to build reactive systems that respond instantly to data changes.

Key MongoDB Change Data Capture benefits include:

- **Real-Time Processing**: Native change streams provide immediate notification of data changes with minimal latency
- **Event Ordering**: Guaranteed ordering of related events ensures consistent event processing across services
- **Resumable Streams**: Built-in resume token support enables reliable event processing across application restarts
- **Full Context**: Complete document information including before and after states for comprehensive change analysis
- **Production Ready**: Enterprise-grade error handling, monitoring, and scalability capabilities
- **SQL Compatibility**: Familiar change processing patterns accessible through SQL-style operations

Whether you're building microservices architectures, real-time analytics pipelines, or reactive user interfaces, MongoDB Change Data Capture with QueryLeaf's SQL-familiar interface provides the foundation for scalable event-driven systems that maintain consistency and responsiveness while simplifying operational complexity.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB Change Data Capture while providing SQL-familiar syntax for creating, monitoring, and processing change streams. Advanced event routing, error handling, and performance analytics are seamlessly accessible through familiar SQL constructs, making sophisticated event-driven architecture both powerful and approachable for SQL-oriented teams.

The combination of MongoDB's intelligent change detection with familiar SQL-style management makes it an ideal platform for applications that require both real-time data processing and operational simplicity, ensuring your event-driven architecture scales efficiently while maintaining familiar development and operational patterns.