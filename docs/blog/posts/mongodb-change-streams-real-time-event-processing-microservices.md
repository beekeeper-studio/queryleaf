---
title: "MongoDB Change Streams and Real-time Event Processing: Advanced Microservices Architecture Patterns for Event-Driven Applications"
description: "Master MongoDB change streams for real-time event processing, microservices communication, and reactive application architectures. Learn advanced change stream patterns, event sourcing, and distributed system integration with SQL-familiar syntax."
date: 2025-10-03
tags: [mongodb, change-streams, real-time, event-processing, microservices, event-sourcing, sql]
---

# MongoDB Change Streams and Real-time Event Processing: Advanced Microservices Architecture Patterns for Event-Driven Applications

Modern distributed applications require sophisticated event-driven architectures that can process real-time data changes, coordinate microservices communication, and maintain system consistency across complex distributed topologies. Traditional polling-based approaches to change detection introduce latency, resource waste, and scaling challenges that become increasingly problematic as application complexity and data volumes grow.

MongoDB Change Streams provide a powerful, efficient mechanism for building reactive applications that respond to data changes in real-time without the overhead and complexity of traditional change detection patterns. Unlike database triggers or polling-based solutions that require complex infrastructure and introduce performance bottlenecks, Change Streams offer a scalable, resumable, and ordered stream of change events that enables sophisticated event-driven architectures, microservices coordination, and real-time analytics.

## The Traditional Change Detection Challenge

Conventional change detection approaches suffer from significant limitations for real-time application requirements:

```sql
-- Traditional PostgreSQL change detection with LISTEN/NOTIFY - limited scalability and functionality

-- Basic trigger-based notification system
CREATE OR REPLACE FUNCTION notify_order_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_notify('order_created', json_build_object(
      'operation', 'INSERT',
      'order_id', NEW.order_id,
      'user_id', NEW.user_id,
      'total_amount', NEW.total_amount,
      'timestamp', NOW()
    )::text);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM pg_notify('order_updated', json_build_object(
      'operation', 'UPDATE',
      'order_id', NEW.order_id,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'timestamp', NOW()
    )::text);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('order_deleted', json_build_object(
      'operation', 'DELETE',
      'order_id', OLD.order_id,
      'user_id', OLD.user_id,
      'timestamp', NOW()
    )::text);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers to orders table
CREATE TRIGGER order_changes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_changes();

-- Client-side change listening with significant limitations
-- Node.js example showing polling approach complexity

const { Client } = require('pg');
const EventEmitter = require('events');

class PostgreSQLChangeListener extends EventEmitter {
  constructor(connectionConfig) {
    super();
    this.client = new Client(connectionConfig);
    this.isListening = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.lastProcessedId = null;
    
    // Complex connection management required
    this.setupErrorHandlers();
  }

  async startListening() {
    try {
      await this.client.connect();
      
      // Listen to specific channels
      await this.client.query('LISTEN order_created');
      await this.client.query('LISTEN order_updated');
      await this.client.query('LISTEN order_deleted');
      await this.client.query('LISTEN user_activity');
      
      this.isListening = true;
      console.log('Started listening for database changes...');
      
      // Handle incoming notifications
      this.client.on('notification', async (msg) => {
        try {
          const changeData = JSON.parse(msg.payload);
          await this.processChange(msg.channel, changeData);
        } catch (error) {
          console.error('Error processing notification:', error);
          this.emit('error', error);
        }
      });
      
      // Poll for missed changes during disconnection
      this.startMissedChangePolling();
      
    } catch (error) {
      console.error('Failed to start listening:', error);
      await this.handleReconnection();
    }
  }

  async processChange(channel, changeData) {
    console.log(`Processing ${channel} change:`, changeData);
    
    // Complex event processing logic
    switch (channel) {
      case 'order_created':
        await this.handleOrderCreated(changeData);
        break;
      case 'order_updated':
        await this.handleOrderUpdated(changeData);
        break;
      case 'order_deleted':
        await this.handleOrderDeleted(changeData);
        break;
      default:
        console.warn(`Unknown channel: ${channel}`);
    }
    
    // Update processing checkpoint
    this.lastProcessedId = changeData.order_id;
  }

  async handleOrderCreated(orderData) {
    // Microservice coordination complexity
    const coordinationTasks = [
      this.notifyInventoryService(orderData),
      this.notifyPaymentService(orderData),
      this.notifyShippingService(orderData),
      this.notifyAnalyticsService(orderData),
      this.updateCustomerProfile(orderData)
    ];
    
    try {
      await Promise.all(coordinationTasks);
      console.log(`Successfully coordinated order creation: ${orderData.order_id}`);
    } catch (error) {
      console.error('Coordination failed:', error);
      // Complex error handling and retry logic required
      await this.handleCoordinationFailure(orderData, error);
    }
  }

  async startMissedChangePolling() {
    // Polling fallback for missed changes during disconnection
    setInterval(async () => {
      if (!this.isListening) return;
      
      try {
        const query = `
          SELECT 
            o.order_id,
            o.user_id,
            o.status,
            o.total_amount,
            o.created_at,
            o.updated_at,
            'order' as entity_type,
            CASE 
              WHEN o.created_at > NOW() - INTERVAL '5 minutes' THEN 'created'
              WHEN o.updated_at > NOW() - INTERVAL '5 minutes' THEN 'updated'
            END as change_type
          FROM orders o
          WHERE (o.created_at > NOW() - INTERVAL '5 minutes' 
                 OR o.updated_at > NOW() - INTERVAL '5 minutes')
            AND o.order_id > $1
          ORDER BY o.order_id
          LIMIT 1000
        `;
        
        const result = await this.client.query(query, [this.lastProcessedId || 0]);
        
        for (const row of result.rows) {
          await this.processChange(`order_${row.change_type}`, row);
        }
        
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 30000); // Poll every 30 seconds
  }

  async handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('fatal_error', new Error('Connection permanently lost'));
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
    
    console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.client.end();
        this.client = new Client(this.connectionConfig);
        this.setupErrorHandlers();
        await this.startListening();
        this.reconnectAttempts = 0;
      } catch (error) {
        console.error('Reconnection failed:', error);
        await this.handleReconnection();
      }
    }, delay);
  }

  setupErrorHandlers() {
    this.client.on('error', async (error) => {
      console.error('PostgreSQL connection error:', error);
      this.isListening = false;
      await this.handleReconnection();
    });
    
    this.client.on('end', () => {
      console.log('PostgreSQL connection ended');
      this.isListening = false;
    });
  }
}

// Problems with traditional PostgreSQL LISTEN/NOTIFY approach:
// 1. Limited payload size (8000 bytes) restricts change data detail
// 2. No guaranteed delivery - notifications lost during disconnection
// 3. No ordering guarantees across multiple channels
// 4. Complex reconnection and missed change handling logic required
// 5. Limited filtering capabilities - all listeners receive all notifications
// 6. No built-in support for change resumption from specific points
// 7. Scalability limitations with many concurrent listeners
// 8. Manual coordination required for microservices communication
// 9. Complex error handling and retry mechanisms needed
// 10. No native support for document-level change tracking

// MySQL limitations are even more restrictive
-- MySQL basic replication events (limited functionality)
SHOW MASTER STATUS;
SHOW SLAVE STATUS;

-- MySQL binary log parsing (complex and fragile)
-- Requires external tools like Maxwell or Debezium
-- Limited change event structure and filtering
-- Complex setup and operational overhead
-- No native application-level change streams
-- Poor support for real-time event processing
```

MongoDB Change Streams provide comprehensive real-time change processing:

```javascript
// MongoDB Change Streams - comprehensive real-time event processing with advanced patterns
const { MongoClient } = require('mongodb');
const EventEmitter = require('events');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('ecommerce_platform');

// Advanced MongoDB Change Streams manager for microservices architecture
class MongoChangeStreamManager extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.collections = {
      orders: db.collection('orders'),
      users: db.collection('users'),
      products: db.collection('products'),
      inventory: db.collection('inventory'),
      payments: db.collection('payments')
    };
    
    this.changeStreams = new Map();
    this.eventProcessors = new Map();
    this.resumeTokens = new Map();
    this.processingStats = new Map();
    
    // Advanced configuration for production use
    this.streamConfig = {
      batchSize: 100,
      maxAwaitTimeMS: 1000,
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
      startAtOperationTime: null,
      resumeAfter: null
    };
    
    // Event processing pipeline
    this.eventQueue = [];
    this.isProcessing = false;
    this.maxQueueSize = 10000;
    
    this.setupEventProcessors();
  }

  async initializeChangeStreams(streamConfigurations) {
    console.log('Initializing MongoDB Change Streams for microservices architecture...');
    
    for (const [streamName, config] of Object.entries(streamConfigurations)) {
      try {
        console.log(`Setting up change stream: ${streamName}`);
        await this.createChangeStream(streamName, config);
      } catch (error) {
        console.error(`Failed to create change stream ${streamName}:`, error);
        this.emit('stream_error', { streamName, error });
      }
    }

    // Start event processing
    this.startEventProcessing();
    
    console.log(`${this.changeStreams.size} change streams initialized successfully`);
    return this.getStreamStatus();
  }

  async createChangeStream(streamName, config) {
    const {
      collection,
      pipeline = [],
      options = {},
      processor,
      resumeToken = null
    } = config;

    // Build comprehensive change stream pipeline
    const changeStreamPipeline = [
      // Stage 1: Filter by operation types if specified
      ...(config.operationTypes ? [
        { $match: { operationType: { $in: config.operationTypes } } }
      ] : []),
      
      // Stage 2: Document-level filtering
      ...(config.documentFilter ? [
        { $match: config.documentFilter }
      ] : []),
      
      // Stage 3: Field-level filtering for efficiency
      ...(config.fieldFilter ? [
        { $project: config.fieldFilter }
      ] : []),
      
      // Custom pipeline stages
      ...pipeline
    ];

    const streamOptions = {
      ...this.streamConfig,
      ...options,
      ...(resumeToken && { resumeAfter: resumeToken })
    };

    const targetCollection = this.collections[collection] || this.db.collection(collection);
    const changeStream = targetCollection.watch(changeStreamPipeline, streamOptions);
    
    // Configure change stream event handlers
    this.setupChangeStreamHandlers(streamName, changeStream, processor);
    
    this.changeStreams.set(streamName, {
      stream: changeStream,
      collection: collection,
      processor: processor,
      config: config,
      stats: {
        eventsProcessed: 0,
        errors: 0,
        lastEventTime: null,
        startTime: new Date()
      }
    });

    console.log(`Change stream '${streamName}' created for collection '${collection}'`);
    return changeStream;
  }

  setupChangeStreamHandlers(streamName, changeStream, processor) {
    changeStream.on('change', async (changeDoc) => {
      try {
        // Extract resume token for fault tolerance
        this.resumeTokens.set(streamName, changeDoc._id);
        
        // Add comprehensive change metadata
        const enhancedChange = {
          ...changeDoc,
          streamName: streamName,
          receivedAt: new Date(),
          processingMetadata: {
            retryCount: 0,
            priority: this.calculateEventPriority(changeDoc),
            correlationId: this.generateCorrelationId(changeDoc),
            traceId: this.generateTraceId()
          }
        };

        // Queue for processing
        await this.queueChangeEvent(enhancedChange, processor);
        
        // Update statistics
        this.updateStreamStats(streamName, 'event_received');
        
      } catch (error) {
        console.error(`Error handling change in stream ${streamName}:`, error);
        this.updateStreamStats(streamName, 'error');
        this.emit('change_error', { streamName, error, changeDoc });
      }
    });

    changeStream.on('error', async (error) => {
      console.error(`Change stream ${streamName} error:`, error);
      this.updateStreamStats(streamName, 'stream_error');
      
      // Attempt to resume from last known position
      if (error.code === 40585 || error.code === 136) { // Resume token expired or invalid
        console.log(`Attempting to resume change stream ${streamName}...`);
        await this.resumeChangeStream(streamName);
      } else {
        this.emit('stream_error', { streamName, error });
      }
    });

    changeStream.on('close', () => {
      console.log(`Change stream ${streamName} closed`);
      this.emit('stream_closed', { streamName });
    });
  }

  async queueChangeEvent(changeEvent, processor) {
    // Prevent queue overflow
    if (this.eventQueue.length >= this.maxQueueSize) {
      console.warn('Event queue at capacity, dropping oldest events');
      this.eventQueue.splice(0, Math.floor(this.maxQueueSize * 0.1)); // Drop 10% of oldest
    }

    // Add event to processing queue with priority ordering
    this.eventQueue.push({ changeEvent, processor });
    this.eventQueue.sort((a, b) => 
      b.changeEvent.processingMetadata.priority - a.changeEvent.processingMetadata.priority
    );

    // Start processing if not already running
    if (!this.isProcessing) {
      setImmediate(() => this.processEventQueue());
    }
  }

  async processEventQueue() {
    if (this.isProcessing || this.eventQueue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      while (this.eventQueue.length > 0) {
        const { changeEvent, processor } = this.eventQueue.shift();
        
        try {
          const startTime = Date.now();
          await this.processChangeEvent(changeEvent, processor);
          const processingTime = Date.now() - startTime;
          
          // Update processing metrics
          this.updateProcessingMetrics(changeEvent.streamName, processingTime, true);
          
        } catch (error) {
          console.error('Event processing failed:', error);
          
          // Implement retry logic
          if (changeEvent.processingMetadata.retryCount < 3) {
            changeEvent.processingMetadata.retryCount++;
            changeEvent.processingMetadata.priority -= 1; // Lower priority for retries
            this.eventQueue.unshift({ changeEvent, processor });
          } else {
            console.error('Max retries reached for event:', changeEvent._id);
            this.emit('event_failed', { changeEvent, error });
          }
          
          this.updateProcessingMetrics(changeEvent.streamName, 0, false);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async processChangeEvent(changeEvent, processor) {
    const { operationType, fullDocument, documentKey, updateDescription } = changeEvent;
    
    console.log(`Processing ${operationType} event for ${changeEvent.streamName}`);
    
    // Execute processor function with comprehensive context
    const processingContext = {
      operation: operationType,
      document: fullDocument,
      documentKey: documentKey,
      updateDescription: updateDescription,
      timestamp: changeEvent.clusterTime,
      metadata: changeEvent.processingMetadata,
      
      // Utility functions
      isInsert: () => operationType === 'insert',
      isUpdate: () => operationType === 'update',
      isDelete: () => operationType === 'delete',
      isReplace: () => operationType === 'replace',
      
      // Field change utilities
      hasFieldChanged: (fieldName) => {
        return updateDescription?.updatedFields?.hasOwnProperty(fieldName) ||
               updateDescription?.removedFields?.includes(fieldName);
      },
      
      getFieldChange: (fieldName) => {
        return updateDescription?.updatedFields?.[fieldName];
      },
      
      // Document utilities
      getDocumentId: () => documentKey._id,
      getFullDocument: () => fullDocument
    };

    // Execute the processor
    await processor(processingContext);
  }

  setupEventProcessors() {
    // Order lifecycle management processor
    this.eventProcessors.set('orderLifecycle', async (context) => {
      const { operation, document, hasFieldChanged } = context;
      
      switch (operation) {
        case 'insert':
          await this.handleOrderCreated(document);
          break;
          
        case 'update':
          if (hasFieldChanged('status')) {
            await this.handleOrderStatusChange(document, context.getFieldChange('status'));
          }
          if (hasFieldChanged('payment_status')) {
            await this.handlePaymentStatusChange(document, context.getFieldChange('payment_status'));
          }
          if (hasFieldChanged('shipping_status')) {
            await this.handleShippingStatusChange(document, context.getFieldChange('shipping_status'));
          }
          break;
          
        case 'delete':
          await this.handleOrderCancelled(context.getDocumentId());
          break;
      }
    });

    // Inventory management processor
    this.eventProcessors.set('inventorySync', async (context) => {
      const { operation, document, hasFieldChanged } = context;
      
      if (operation === 'insert' && document.items) {
        // New order - reserve inventory
        await this.reserveInventoryForOrder(document);
      } else if (operation === 'update' && hasFieldChanged('status')) {
        const newStatus = context.getFieldChange('status');
        
        if (newStatus === 'cancelled') {
          await this.releaseInventoryReservation(document);
        } else if (newStatus === 'shipped') {
          await this.confirmInventoryConsumption(document);
        }
      }
    });

    // Real-time analytics processor
    this.eventProcessors.set('realTimeAnalytics', async (context) => {
      const { operation, document, timestamp } = context;
      
      // Update real-time metrics
      const analyticsEvent = {
        eventType: `order_${operation}`,
        timestamp: timestamp,
        data: {
          orderId: context.getDocumentId(),
          customerId: document?.user_id,
          amount: document?.total_amount,
          region: document?.shipping_address?.region,
          products: document?.items?.map(item => item.product_id)
        }
      };
      
      await this.updateRealTimeMetrics(analyticsEvent);
    });

    // Customer engagement processor
    this.eventProcessors.set('customerEngagement', async (context) => {
      const { operation, document, hasFieldChanged } = context;
      
      if (operation === 'insert') {
        // New order - update customer profile
        await this.updateCustomerOrderHistory(document.user_id, document);
        
        // Trigger post-purchase engagement
        await this.triggerPostPurchaseEngagement(document);
        
      } else if (operation === 'update' && hasFieldChanged('status')) {
        const newStatus = context.getFieldChange('status');
        
        if (newStatus === 'delivered') {
          // Order delivered - trigger review request
          await this.triggerReviewRequest(document);
        }
      }
    });
  }

  async handleOrderCreated(orderDocument) {
    console.log(`Processing new order: ${orderDocument._id}`);
    
    // Coordinate microservices for order creation
    const coordinationTasks = [
      this.notifyPaymentService({
        action: 'process_payment',
        orderId: orderDocument._id,
        amount: orderDocument.total_amount,
        paymentMethod: orderDocument.payment_method
      }),
      
      this.notifyInventoryService({
        action: 'reserve_inventory',
        orderId: orderDocument._id,
        items: orderDocument.items
      }),
      
      this.notifyShippingService({
        action: 'calculate_shipping',
        orderId: orderDocument._id,
        shippingAddress: orderDocument.shipping_address,
        items: orderDocument.items
      }),
      
      this.notifyCustomerService({
        action: 'order_confirmation',
        orderId: orderDocument._id,
        customerId: orderDocument.user_id
      })
    ];
    
    // Execute coordination with error handling
    const results = await Promise.allSettled(coordinationTasks);
    
    // Check for coordination failures
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      console.error(`Order coordination failures for ${orderDocument._id}:`, failures);
      
      // Trigger compensation workflow
      await this.triggerCompensationWorkflow(orderDocument._id, failures);
    }
  }

  async handleOrderStatusChange(orderDocument, newStatus) {
    console.log(`Order ${orderDocument._id} status changed to: ${newStatus}`);
    
    const statusHandlers = {
      'confirmed': async () => {
        await this.notifyFulfillmentService({
          action: 'prepare_order',
          orderId: orderDocument._id
        });
      },
      
      'shipped': async () => {
        await this.notifyCustomerService({
          action: 'shipping_notification',
          orderId: orderDocument._id,
          trackingNumber: orderDocument.tracking_number
        });
        
        // Update inventory
        await this.confirmInventoryConsumption(orderDocument);
      },
      
      'delivered': async () => {
        // Trigger post-delivery workflows
        await Promise.all([
          this.triggerReviewRequest(orderDocument),
          this.updateCustomerLoyaltyPoints(orderDocument),
          this.analyzeReorderProbability(orderDocument)
        ]);
      },
      
      'cancelled': async () => {
        // Execute cancellation compensation
        await this.executeOrderCancellation(orderDocument);
      }
    };
    
    const handler = statusHandlers[newStatus];
    if (handler) {
      await handler();
    }
  }

  async reserveInventoryForOrder(orderDocument) {
    console.log(`Reserving inventory for order: ${orderDocument._id}`);
    
    const inventoryOperations = orderDocument.items.map(item => ({
      updateOne: {
        filter: {
          product_id: item.product_id,
          available_quantity: { $gte: item.quantity }
        },
        update: {
          $inc: {
            available_quantity: -item.quantity,
            reserved_quantity: item.quantity
          },
          $push: {
            reservations: {
              order_id: orderDocument._id,
              quantity: item.quantity,
              reserved_at: new Date(),
              expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
            }
          }
        }
      }
    }));
    
    try {
      const result = await this.collections.inventory.bulkWrite(inventoryOperations);
      console.log(`Inventory reserved for ${result.modifiedCount} items`);
      
      // Check for insufficient inventory
      if (result.modifiedCount < orderDocument.items.length) {
        await this.handleInsufficientInventory(orderDocument, result);
      }
      
    } catch (error) {
      console.error(`Inventory reservation failed for order ${orderDocument._id}:`, error);
      throw error;
    }
  }

  async updateRealTimeMetrics(analyticsEvent) {
    console.log(`Updating real-time metrics for: ${analyticsEvent.eventType}`);
    
    const metricsUpdate = {
      $inc: {
        [`hourly_metrics.${new Date().getHours()}.${analyticsEvent.eventType}`]: 1
      },
      $push: {
        recent_events: {
          $each: [analyticsEvent],
          $slice: -1000 // Keep last 1000 events
        }
      },
      $set: {
        last_updated: new Date()
      }
    };
    
    // Update regional metrics
    if (analyticsEvent.data.region) {
      metricsUpdate.$inc[`regional_metrics.${analyticsEvent.data.region}.${analyticsEvent.eventType}`] = 1;
    }
    
    await this.collections.analytics.updateOne(
      { _id: 'real_time_metrics' },
      metricsUpdate,
      { upsert: true }
    );
  }

  async triggerPostPurchaseEngagement(orderDocument) {
    console.log(`Triggering post-purchase engagement for order: ${orderDocument._id}`);
    
    // Schedule engagement activities
    const engagementTasks = [
      {
        type: 'order_confirmation_email',
        scheduledFor: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        recipient: orderDocument.user_id,
        data: { orderId: orderDocument._id }
      },
      {
        type: 'shipping_updates_subscription',
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        recipient: orderDocument.user_id,
        data: { orderId: orderDocument._id }
      },
      {
        type: 'product_recommendations',
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        recipient: orderDocument.user_id,
        data: { 
          orderId: orderDocument._id,
          purchasedProducts: orderDocument.items.map(item => item.product_id)
        }
      }
    ];
    
    await this.collections.engagement_queue.insertMany(engagementTasks);
  }

  // Microservice communication methods
  async notifyPaymentService(message) {
    // In production, this would use message queues (RabbitMQ, Apache Kafka, etc.)
    console.log('Notifying Payment Service:', message);
    
    // Simulate service call
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Payment service processed: ${message.action}`);
        resolve({ status: 'success', processedAt: new Date() });
      }, 100);
    });
  }

  async notifyInventoryService(message) {
    console.log('Notifying Inventory Service:', message);
    
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Inventory service processed: ${message.action}`);
        resolve({ status: 'success', processedAt: new Date() });
      }, 150);
    });
  }

  async notifyShippingService(message) {
    console.log('Notifying Shipping Service:', message);
    
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Shipping service processed: ${message.action}`);
        resolve({ status: 'success', processedAt: new Date() });
      }, 200);
    });
  }

  async notifyCustomerService(message) {
    console.log('Notifying Customer Service:', message);
    
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Customer service processed: ${message.action}`);
        resolve({ status: 'success', processedAt: new Date() });
      }, 75);
    });
  }

  // Utility methods
  calculateEventPriority(changeDoc) {
    // Priority scoring based on operation type and document characteristics
    const basePriority = {
      'insert': 10,
      'update': 5,
      'delete': 15,
      'replace': 8
    };
    
    let priority = basePriority[changeDoc.operationType] || 1;
    
    // Boost priority for high-value orders
    if (changeDoc.fullDocument?.total_amount > 1000) {
      priority += 5;
    }
    
    // Boost priority for status changes
    if (changeDoc.updateDescription?.updatedFields?.status) {
      priority += 3;
    }
    
    return priority;
  }

  generateCorrelationId(changeDoc) {
    return `${changeDoc.operationType}-${changeDoc.documentKey._id}-${Date.now()}`;
  }

  generateTraceId() {
    return require('crypto').randomUUID();
  }

  updateStreamStats(streamName, event) {
    const streamData = this.changeStreams.get(streamName);
    if (streamData) {
      streamData.stats.lastEventTime = new Date();
      
      switch (event) {
        case 'event_received':
          streamData.stats.eventsProcessed++;
          break;
        case 'error':
        case 'stream_error':
          streamData.stats.errors++;
          break;
      }
    }
  }

  updateProcessingMetrics(streamName, processingTime, success) {
    if (!this.processingStats.has(streamName)) {
      this.processingStats.set(streamName, {
        totalProcessed: 0,
        totalErrors: 0,
        totalProcessingTime: 0,
        avgProcessingTime: 0
      });
    }
    
    const stats = this.processingStats.get(streamName);
    
    if (success) {
      stats.totalProcessed++;
      stats.totalProcessingTime += processingTime;
      stats.avgProcessingTime = stats.totalProcessingTime / stats.totalProcessed;
    } else {
      stats.totalErrors++;
    }
  }

  getStreamStatus() {
    const status = {
      activeStreams: this.changeStreams.size,
      totalEventsProcessed: 0,
      totalErrors: 0,
      streams: {}
    };
    
    for (const [streamName, streamData] of this.changeStreams) {
      status.totalEventsProcessed += streamData.stats.eventsProcessed;
      status.totalErrors += streamData.stats.errors;
      
      status.streams[streamName] = {
        collection: streamData.collection,
        eventsProcessed: streamData.stats.eventsProcessed,
        errors: streamData.stats.errors,
        uptime: Date.now() - streamData.stats.startTime.getTime(),
        lastEventTime: streamData.stats.lastEventTime
      };
    }
    
    return status;
  }

  async resumeChangeStream(streamName) {
    const streamData = this.changeStreams.get(streamName);
    if (!streamData) return;
    
    console.log(`Resuming change stream: ${streamName}`);
    
    try {
      // Close current stream
      await streamData.stream.close();
      
      // Create new stream with resume token
      const resumeToken = this.resumeTokens.get(streamName);
      const config = {
        ...streamData.config,
        resumeToken: resumeToken
      };
      
      await this.createChangeStream(streamName, config);
      console.log(`Change stream ${streamName} resumed successfully`);
      
    } catch (error) {
      console.error(`Failed to resume change stream ${streamName}:`, error);
      this.emit('resume_failed', { streamName, error });
    }
  }

  async close() {
    console.log('Closing all change streams...');
    
    for (const [streamName, streamData] of this.changeStreams) {
      try {
        await streamData.stream.close();
        console.log(`Closed change stream: ${streamName}`);
      } catch (error) {
        console.error(`Error closing stream ${streamName}:`, error);
      }
    }
    
    this.changeStreams.clear();
    this.resumeTokens.clear();
    console.log('All change streams closed');
  }
}

// Example usage: Complete microservices coordination system
async function setupEcommerceEventProcessing() {
  console.log('Setting up comprehensive e-commerce event processing system...');
  
  const changeStreamManager = new MongoChangeStreamManager(db);
  
  // Configure change streams for different aspects of the system
  const streamConfigurations = {
    // Order lifecycle management
    orderEvents: {
      collection: 'orders',
      operationTypes: ['insert', 'update', 'delete'],
      processor: changeStreamManager.eventProcessors.get('orderLifecycle'),
      options: {
        fullDocument: 'updateLookup',
        fullDocumentBeforeChange: 'whenAvailable'
      }
    },
    
    // Inventory synchronization
    inventorySync: {
      collection: 'orders',
      operationTypes: ['insert', 'update'],
      documentFilter: {
        $or: [
          { operationType: 'insert' },
          { 'updateDescription.updatedFields.status': { $exists: true } }
        ]
      },
      processor: changeStreamManager.eventProcessors.get('inventorySync')
    },
    
    // Real-time analytics
    analyticsEvents: {
      collection: 'orders',
      processor: changeStreamManager.eventProcessors.get('realTimeAnalytics'),
      options: {
        fullDocument: 'updateLookup'
      }
    },
    
    // Customer engagement
    customerEngagement: {
      collection: 'orders',
      operationTypes: ['insert', 'update'],
      processor: changeStreamManager.eventProcessors.get('customerEngagement'),
      options: {
        fullDocument: 'updateLookup'
      }
    },
    
    // User profile updates
    userProfileSync: {
      collection: 'users',
      operationTypes: ['update'],
      documentFilter: {
        'updateDescription.updatedFields': {
          $or: [
            { 'email': { $exists: true } },
            { 'profile': { $exists: true } },
            { 'preferences': { $exists: true } }
          ]
        }
      },
      processor: async (context) => {
        console.log(`User profile updated: ${context.getDocumentId()}`);
        // Sync profile changes across microservices
        await changeStreamManager.notifyCustomerService({
          action: 'profile_sync',
          userId: context.getDocumentId(),
          changes: context.updateDescription.updatedFields
        });
      }
    }
  };
  
  // Initialize all change streams
  await changeStreamManager.initializeChangeStreams(streamConfigurations);
  
  // Monitor system health
  setInterval(() => {
    const status = changeStreamManager.getStreamStatus();
    console.log('Change Stream System Status:', JSON.stringify(status, null, 2));
  }, 30000); // Every 30 seconds
  
  return changeStreamManager;
}

// Benefits of MongoDB Change Streams:
// - Real-time, ordered change events with guaranteed delivery
// - Resume capability from any point using resume tokens
// - Rich filtering and transformation capabilities through aggregation pipelines
// - Automatic failover and reconnection handling
// - Document-level granularity with full document context
// - Cluster-wide change tracking across replica sets and sharded clusters
// - Built-in support for microservices coordination patterns
// - Efficient resource utilization without polling overhead
// - Comprehensive event metadata and processing context
// - SQL-compatible change processing through QueryLeaf integration

module.exports = {
  MongoChangeStreamManager,
  setupEcommerceEventProcessing
};
```

## Understanding MongoDB Change Streams Architecture

### Advanced Event-Driven Patterns and Microservices Coordination

Implement sophisticated change stream patterns for production-scale event processing:

```javascript
// Production-grade change stream patterns for enterprise applications
class EnterpriseChangeStreamManager extends MongoChangeStreamManager {
  constructor(db, enterpriseConfig) {
    super(db);
    
    this.enterpriseConfig = {
      messageQueue: enterpriseConfig.messageQueue, // RabbitMQ, Kafka, etc.
      distributedTracing: enterpriseConfig.distributedTracing,
      metricsCollector: enterpriseConfig.metricsCollector,
      errorReporting: enterpriseConfig.errorReporting,
      circuitBreaker: enterpriseConfig.circuitBreaker
    };
    
    this.setupEnterpriseIntegrations();
  }

  async setupMultiTenantChangeStreams(tenantConfigurations) {
    console.log('Setting up multi-tenant change stream architecture...');
    
    const tenantStreams = new Map();
    
    for (const [tenantId, config] of Object.entries(tenantConfigurations)) {
      const tenantStreamConfig = {
        ...config,
        pipeline: [
          { $match: { 'fullDocument.tenant_id': tenantId } },
          ...(config.pipeline || [])
        ],
        processor: this.createTenantProcessor(tenantId, config.processor)
      };
      
      const streamName = `tenant_${tenantId}_${config.name}`;
      tenantStreams.set(streamName, tenantStreamConfig);
    }
    
    await this.initializeChangeStreams(Object.fromEntries(tenantStreams));
    return tenantStreams;
  }

  createTenantProcessor(tenantId, baseProcessor) {
    return async (context) => {
      // Add tenant context
      const tenantContext = {
        ...context,
        tenantId: tenantId,
        tenantConfig: await this.getTenantConfig(tenantId)
      };
      
      // Execute with tenant-specific error handling
      try {
        await baseProcessor(tenantContext);
      } catch (error) {
        await this.handleTenantError(tenantId, error, context);
      }
    };
  }

  async implementEventSourcingPattern(aggregateConfigs) {
    console.log('Implementing event sourcing pattern with change streams...');
    
    const eventSourcingStreams = {};
    
    for (const [aggregateName, config] of Object.entries(aggregateConfigs)) {
      eventSourcingStreams[`${aggregateName}_events`] = {
        collection: config.collection,
        operationTypes: ['insert', 'update', 'delete'],
        processor: async (context) => {
          const event = this.buildDomainEvent(aggregateName, context);
          
          // Store in event store
          await this.appendToEventStore(event);
          
          // Update projections
          await this.updateProjections(aggregateName, event);
          
          // Publish to event bus
          await this.publishDomainEvent(event);
        },
        options: {
          fullDocument: 'updateLookup',
          fullDocumentBeforeChange: 'whenAvailable'
        }
      };
    }
    
    return eventSourcingStreams;
  }

  buildDomainEvent(aggregateName, context) {
    const { operation, document, documentKey, updateDescription, timestamp } = context;
    
    return {
      eventId: require('crypto').randomUUID(),
      eventType: `${aggregateName}.${operation}`,
      aggregateId: documentKey._id,
      aggregateType: aggregateName,
      eventData: {
        before: context.fullDocumentBeforeChange,
        after: document,
        changes: updateDescription
      },
      eventMetadata: {
        timestamp: timestamp,
        causationId: context.metadata.correlationId,
        correlationId: context.metadata.traceId,
        userId: document?.user_id || 'system',
        version: await this.getAggregateVersion(aggregateName, documentKey._id)
      }
    };
  }

  async setupCQRSIntegration(cqrsConfig) {
    console.log('Setting up CQRS integration with change streams...');
    
    const cqrsStreams = {};
    
    // Command side - write model changes
    for (const [commandModel, config] of Object.entries(cqrsConfig.commandModels)) {
      cqrsStreams[`${commandModel}_commands`] = {
        collection: config.collection,
        processor: async (context) => {
          // Update read models
          await this.updateReadModels(commandModel, context);
          
          // Invalidate caches
          await this.invalidateReadModelCaches(commandModel, context.getDocumentId());
          
          // Publish integration events
          await this.publishIntegrationEvents(commandModel, context);
        }
      };
    }
    
    return cqrsStreams;
  }

  async setupDistributedSagaCoordination(sagaConfigurations) {
    console.log('Setting up distributed saga coordination...');
    
    const sagaStreams = {};
    
    for (const [sagaName, config] of Object.entries(sagaConfigurations)) {
      sagaStreams[`${sagaName}_saga`] = {
        collection: config.triggerCollection,
        documentFilter: config.triggerFilter,
        processor: async (context) => {
          const sagaInstance = await this.createSagaInstance(sagaName, context);
          await this.executeSagaStep(sagaInstance, context);
        }
      };
    }
    
    return sagaStreams;
  }

  async createSagaInstance(sagaName, triggerContext) {
    const sagaInstance = {
      sagaId: require('crypto').randomUUID(),
      sagaType: sagaName,
      status: 'started',
      currentStep: 0,
      triggerEvent: {
        aggregateId: triggerContext.getDocumentId(),
        eventData: triggerContext.document
      },
      compensation: [],
      createdAt: new Date()
    };
    
    await this.db.collection('saga_instances').insertOne(sagaInstance);
    return sagaInstance;
  }

  async setupAdvancedMonitoring() {
    console.log('Setting up advanced change stream monitoring...');
    
    const monitoringConfig = {
      healthChecks: {
        streamLiveness: true,
        processingLatency: true,
        errorRates: true,
        throughput: true
      },
      
      alerting: {
        streamFailure: { threshold: 1, window: '1m' },
        highLatency: { threshold: 5000, window: '5m' },
        errorRate: { threshold: 0.05, window: '10m' },
        lowThroughput: { threshold: 10, window: '5m' }
      },
      
      metrics: {
        prometheus: true,
        cloudwatch: false,
        datadog: false
      }
    };
    
    return this.initializeMonitoring(monitoringConfig);
  }
}
```

## SQL-Style Change Stream Processing with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB change stream configuration and event processing:

```sql
-- QueryLeaf change stream management with SQL-familiar patterns

-- Create comprehensive change stream for order processing
CREATE CHANGE STREAM order_processing_stream ON orders
WATCH FOR (INSERT, UPDATE, DELETE)
WHERE 
  status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')
  AND total_amount > 0
WITH OPTIONS (
  full_document = 'updateLookup',
  full_document_before_change = 'whenAvailable',
  batch_size = 100,
  max_await_time = 1000,
  start_at_operation_time = CURRENT_TIMESTAMP - INTERVAL '1 hour'
)
PROCESS WITH order_lifecycle_handler;

-- Advanced change stream with complex filtering and transformation
CREATE CHANGE STREAM high_value_order_stream ON orders
WATCH FOR (INSERT, UPDATE)
WHERE 
  operationType = 'insert' AND fullDocument.total_amount >= 1000
  OR (operationType = 'update' AND updateDescription.updatedFields.status EXISTS)
WITH PIPELINE (
  -- Stage 1: Additional filtering
  {
    $match: {
      $or: [
        { 
          operationType: 'insert',
          'fullDocument.customer_tier': { $in: ['gold', 'platinum'] }
        },
        {
          operationType: 'update',
          'fullDocument.total_amount': { $gte: 1000 }
        }
      ]
    }
  },
  
  -- Stage 2: Enrich with customer data
  {
    $lookup: {
      from: 'users',
      localField: 'fullDocument.user_id',
      foreignField: '_id',
      as: 'customer_data',
      pipeline: [
        {
          $project: {
            email: 1,
            customer_tier: 1,
            lifetime_value: 1,
            preferences: 1
          }
        }
      ]
    }
  },
  
  -- Stage 3: Calculate priority score
  {
    $addFields: {
      processing_priority: {
        $switch: {
          branches: [
            { 
              case: { $gte: ['$fullDocument.total_amount', 5000] }, 
              then: 'critical' 
            },
            { 
              case: { $gte: ['$fullDocument.total_amount', 2000] }, 
              then: 'high' 
            },
            { 
              case: { $gte: ['$fullDocument.total_amount', 1000] }, 
              then: 'medium' 
            }
          ],
          default: 'normal'
        }
      }
    }
  }
)
PROCESS WITH vip_order_processor;

-- Real-time analytics change stream with aggregation
CREATE MATERIALIZED CHANGE STREAM real_time_order_metrics ON orders
WATCH FOR (INSERT, UPDATE, DELETE)
WITH AGGREGATION (
  -- Group by time buckets for real-time metrics
  GROUP BY (
    DATE_TRUNC('minute', clusterTime, 5) as time_bucket,
    fullDocument.region as region
  )
  SELECT 
    time_bucket,
    region,
    
    -- Real-time KPIs
    COUNT(*) FILTER (WHERE operationType = 'insert') as new_orders,
    COUNT(*) FILTER (WHERE operationType = 'update' AND updateDescription.updatedFields.status = 'shipped') as orders_shipped,
    COUNT(*) FILTER (WHERE operationType = 'delete') as orders_cancelled,
    
    -- Revenue metrics
    SUM(fullDocument.total_amount) FILTER (WHERE operationType = 'insert') as new_revenue,
    AVG(fullDocument.total_amount) FILTER (WHERE operationType = 'insert') as avg_order_value,
    
    -- Customer metrics
    COUNT(DISTINCT fullDocument.user_id) as unique_customers,
    
    -- Performance indicators
    COUNT(*) / 5.0 as events_per_minute,
    CURRENT_TIMESTAMP as computed_at
    
  WINDOW (
    ORDER BY time_bucket
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  )
  ADD (
    AVG(new_orders) OVER window as rolling_avg_orders,
    AVG(new_revenue) OVER window as rolling_avg_revenue,
    
    -- Trend detection
    CASE 
      WHEN new_orders > rolling_avg_orders * 1.2 THEN 'surge'
      WHEN new_orders < rolling_avg_orders * 0.8 THEN 'decline'
      ELSE 'stable'
    END as order_trend
  )
)
REFRESH EVERY 5 SECONDS
PROCESS WITH analytics_event_handler;

-- Customer segmentation change stream with RFM analysis
CREATE CHANGE STREAM customer_behavior_analysis ON orders
WATCH FOR (INSERT, UPDATE)
WHERE fullDocument.status IN ('completed', 'delivered')
WITH CUSTOMER_SEGMENTATION (
  -- Calculate RFM metrics from change events
  SELECT 
    fullDocument.user_id as customer_id,
    
    -- Recency calculation
    EXTRACT(DAYS FROM CURRENT_TIMESTAMP - MAX(fullDocument.order_date)) as recency_days,
    
    -- Frequency calculation  
    COUNT(*) FILTER (WHERE operationType = 'insert') as order_frequency,
    
    -- Monetary calculation
    SUM(fullDocument.total_amount) as total_monetary_value,
    AVG(fullDocument.total_amount) as avg_order_value,
    
    -- Advanced behavior metrics
    COUNT(DISTINCT fullDocument.product_categories) as category_diversity,
    AVG(ARRAY_LENGTH(fullDocument.items)) as avg_items_per_order,
    
    -- Engagement patterns
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM fullDocument.order_date) IN (0, 6)) / COUNT(*)::float as weekend_preference,
    
    -- RFM scoring
    NTILE(5) OVER (ORDER BY recency_days DESC) as recency_score,
    NTILE(5) OVER (ORDER BY order_frequency ASC) as frequency_score,  
    NTILE(5) OVER (ORDER BY total_monetary_value ASC) as monetary_score,
    
    -- Customer segment classification
    CASE 
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) >= 4 
           AND NTILE(5) OVER (ORDER BY order_frequency ASC) >= 4 
           AND NTILE(5) OVER (ORDER BY total_monetary_value ASC) >= 4 THEN 'champions'
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) >= 3 
           AND NTILE(5) OVER (ORDER BY order_frequency ASC) >= 3 
           AND NTILE(5) OVER (ORDER BY total_monetary_value ASC) >= 3 THEN 'loyal_customers'
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) >= 4 
           AND NTILE(5) OVER (ORDER BY order_frequency ASC) <= 2 THEN 'potential_loyalists'
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) >= 4 
           AND NTILE(5) OVER (ORDER BY order_frequency ASC) <= 1 THEN 'new_customers'
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) <= 2 
           AND NTILE(5) OVER (ORDER BY order_frequency ASC) >= 3 THEN 'at_risk'
      ELSE 'needs_attention'
    END as customer_segment,
    
    -- Predictive metrics
    total_monetary_value / GREATEST(recency_days / 30.0, 1) * order_frequency as predicted_clv,
    
    CURRENT_TIMESTAMP as analyzed_at
    
  GROUP BY fullDocument.user_id
  WINDOW customer_analysis AS (
    PARTITION BY fullDocument.user_id
    ORDER BY fullDocument.order_date
    RANGE BETWEEN INTERVAL '365 days' PRECEDING AND CURRENT ROW
  )
)
PROCESS WITH customer_segmentation_handler;

-- Inventory synchronization change stream
CREATE CHANGE STREAM inventory_sync_stream ON orders  
WATCH FOR (INSERT, UPDATE, DELETE)
WHERE 
  operationType = 'insert' 
  OR (operationType = 'update' AND updateDescription.updatedFields.status EXISTS)
  OR operationType = 'delete'
WITH EVENT_PROCESSING (
  CASE operationType
    WHEN 'insert' THEN 
      CALL reserve_inventory(fullDocument.items, fullDocument._id)
    WHEN 'update' THEN
      CASE updateDescription.updatedFields.status
        WHEN 'cancelled' THEN 
          CALL release_inventory_reservation(fullDocument._id)
        WHEN 'shipped' THEN 
          CALL confirm_inventory_consumption(fullDocument._id)
        WHEN 'returned' THEN 
          CALL restore_inventory(fullDocument.items, fullDocument._id)
      END
    WHEN 'delete' THEN
      CALL cleanup_inventory_reservations(documentKey._id)
  END
)
WITH OPTIONS (
  retry_policy = {
    max_attempts: 3,
    backoff_strategy: 'exponential',
    base_delay: '1 second'
  },
  dead_letter_queue = 'inventory_sync_dlq',
  processing_timeout = '30 seconds'
)
PROCESS WITH inventory_coordination_handler;

-- Microservices event coordination with saga pattern
CREATE DISTRIBUTED SAGA order_fulfillment_saga 
TRIGGERED BY orders.insert
WHERE fullDocument.status = 'pending' AND fullDocument.total_amount > 0
WITH STEPS (
  -- Step 1: Payment processing
  {
    service: 'payment-service',
    action: 'process_payment',
    input: {
      order_id: NEW.documentKey._id,
      amount: NEW.fullDocument.total_amount,
      payment_method: NEW.fullDocument.payment_method
    },
    compensation: {
      service: 'payment-service', 
      action: 'refund_payment',
      input: { payment_id: '${payment_result.payment_id}' }
    },
    timeout: '30 seconds'
  },
  
  -- Step 2: Inventory reservation
  {
    service: 'inventory-service',
    action: 'reserve_products',
    input: {
      order_id: NEW.documentKey._id,
      items: NEW.fullDocument.items
    },
    compensation: {
      service: 'inventory-service',
      action: 'release_reservation', 
      input: { reservation_id: '${inventory_result.reservation_id}' }
    },
    timeout: '15 seconds'
  },
  
  -- Step 3: Shipping calculation
  {
    service: 'shipping-service',
    action: 'calculate_shipping',
    input: {
      order_id: NEW.documentKey._id,
      shipping_address: NEW.fullDocument.shipping_address,
      items: NEW.fullDocument.items
    },
    compensation: {
      service: 'shipping-service',
      action: 'cancel_shipping',
      input: { shipping_id: '${shipping_result.shipping_id}' }
    },
    timeout: '10 seconds'
  },
  
  -- Step 4: Order confirmation
  {
    service: 'notification-service',
    action: 'send_confirmation',
    input: {
      order_id: NEW.documentKey._id,
      customer_email: NEW.fullDocument.customer_email,
      order_details: NEW.fullDocument
    },
    timeout: '5 seconds'
  }
)
WITH SAGA_OPTIONS (
  max_retry_attempts = 3,
  compensation_timeout = '60 seconds',
  saga_timeout = '5 minutes'
);

-- Event sourcing pattern with change streams
CREATE EVENT STORE order_events
FROM CHANGE STREAM orders.*
WITH EVENT_MAPPING (
  event_type = CONCAT('Order.', TITLE_CASE(operationType)),
  aggregate_id = documentKey._id,
  aggregate_type = 'Order',
  event_data = {
    before: fullDocumentBeforeChange,
    after: fullDocument,
    changes: updateDescription
  },
  event_metadata = {
    timestamp: clusterTime,
    causation_id: correlation_id,
    correlation_id: trace_id,
    user_id: COALESCE(fullDocument.user_id, 'system'),
    version: aggregate_version + 1
  }
)
WITH PROJECTIONS (
  -- Order summary projection
  order_summary = {
    aggregate_id: aggregate_id,
    current_status: event_data.after.status,
    total_amount: event_data.after.total_amount,
    created_at: event_data.after.created_at,
    last_updated: event_metadata.timestamp,
    version: event_metadata.version
  },
  
  -- Customer order history projection  
  customer_orders = {
    customer_id: event_data.after.user_id,
    order_id: aggregate_id,
    order_amount: event_data.after.total_amount,
    order_date: event_data.after.created_at,
    status: event_data.after.status
  }
);

-- Advanced monitoring and alerting for change streams
CREATE CHANGE STREAM MONITOR comprehensive_monitoring
WITH METRICS (
  -- Stream health metrics
  stream_uptime,
  events_processed_per_second,
  processing_latency_p95,
  error_rate,
  resume_token_age,
  
  -- Business metrics
  high_value_orders_per_minute,
  average_processing_time,
  failed_event_count,
  
  -- System resource metrics
  memory_usage,
  cpu_utilization,
  network_throughput
)
WITH ALERTS (
  -- Critical alerts
  stream_disconnected = {
    condition: stream_uptime = 0,
    severity: 'critical',
    notification: ['pager', 'slack:#ops-critical']
  },
  
  high_error_rate = {
    condition: error_rate > 0.05 FOR 5 MINUTES,
    severity: 'high', 
    notification: ['email:ops-team@company.com', 'slack:#database-alerts']
  },
  
  processing_latency = {
    condition: processing_latency_p95 > 5000 FOR 3 MINUTES,
    severity: 'medium',
    notification: ['slack:#performance-alerts']
  },
  
  -- Business alerts
  revenue_drop = {
    condition: high_value_orders_per_minute < 10 FOR 10 MINUTES DURING BUSINESS_HOURS,
    severity: 'high',
    notification: ['email:business-ops@company.com']
  }
);

-- QueryLeaf provides comprehensive change stream capabilities:
-- 1. SQL-familiar syntax for MongoDB change stream creation and management
-- 2. Advanced filtering and transformation through aggregation pipelines
-- 3. Real-time analytics and materialized views from change events
-- 4. Customer segmentation and behavioral analysis integration
-- 5. Microservices coordination with distributed saga patterns
-- 6. Event sourcing and CQRS implementation support
-- 7. Comprehensive monitoring and alerting for production environments
-- 8. Inventory synchronization and business process automation
-- 9. Multi-tenant and enterprise-grade change stream management
-- 10. Integration with external message queues and event systems
```

## Best Practices for Change Stream Implementation

### Event-Driven Architecture Design

Essential principles for building robust change stream-based systems:

1. **Resume Token Management**: Always store resume tokens for fault tolerance and recovery
2. **Event Processing Idempotency**: Design event processors to handle duplicate events gracefully
3. **Error Handling Strategy**: Implement comprehensive error handling with retry policies and dead letter queues
4. **Filtering Optimization**: Use early filtering in change stream pipelines to reduce processing overhead
5. **Resource Management**: Monitor and manage memory usage for long-running change streams
6. **Monitoring Integration**: Implement comprehensive monitoring for stream health and processing metrics

### Production Deployment Strategies

Optimize change stream deployments for production-scale environments:

1. **High Availability**: Deploy change stream processors across multiple instances with proper load balancing
2. **Scaling Patterns**: Implement horizontal scaling strategies for high-throughput scenarios
3. **Performance Monitoring**: Track processing latency, throughput, and error rates continuously
4. **Security Considerations**: Ensure proper authentication and authorization for change stream access
5. **Backup and Recovery**: Implement comprehensive backup strategies for resume tokens and processing state
6. **Integration Testing**: Thoroughly test change stream integrations with downstream systems

## Conclusion

MongoDB Change Streams provide a powerful foundation for building sophisticated event-driven architectures that enable real-time data processing, microservices coordination, and reactive application patterns. The ordered, resumable stream of change events eliminates the complexity and limitations of traditional change detection approaches while providing comprehensive filtering, transformation, and integration capabilities.

Key MongoDB Change Streams benefits include:

- **Real-time Processing**: Immediate notification of data changes without polling overhead
- **Fault Tolerance**: Resume capability from any point using resume tokens with guaranteed delivery
- **Rich Context**: Complete document context with before/after states for comprehensive processing
- **Scalable Architecture**: Horizontal scaling support for high-throughput event processing scenarios
- **Microservices Integration**: Native support for distributed system coordination and communication patterns
- **Flexible Filtering**: Advanced aggregation pipeline integration for sophisticated event filtering and transformation

Whether you're building real-time analytics platforms, microservices architectures, event sourcing systems, or reactive applications, MongoDB Change Streams with QueryLeaf's familiar SQL interface provide the foundation for modern event-driven development.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB change stream operations while providing SQL-familiar syntax for event processing, microservices coordination, and real-time analytics. Advanced change stream patterns, saga orchestration, and event sourcing capabilities are seamlessly accessible through familiar SQL constructs, making sophisticated event-driven architectures both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's robust change stream capabilities with SQL-style operations makes it an ideal platform for modern applications requiring real-time responsiveness and distributed system coordination, ensuring your event-driven architectures can scale efficiently while maintaining consistency and reliability across complex distributed topologies.