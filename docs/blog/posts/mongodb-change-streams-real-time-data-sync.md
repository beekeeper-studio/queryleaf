---
title: "MongoDB Change Streams: Real-Time Data Synchronization with SQL-Style Event Processing"
description: "Master MongoDB Change Streams for building reactive applications. Learn real-time data synchronization, event-driven architectures, and SQL-style change data capture for modern applications."
date: 2025-09-05
tags: [mongodb, change-streams, real-time, event-driven, data-sync, sql]
---

# MongoDB Change Streams: Real-Time Data Synchronization with SQL-Style Event Processing

Modern applications require real-time responsiveness to data changes. Whether you're building collaborative editing tools, live dashboards, inventory management systems, or notification services, the ability to react instantly to data modifications is essential for delivering responsive user experiences and maintaining data consistency across distributed systems.

Traditional approaches to real-time data synchronization often rely on application-level polling, message queues, or complex custom trigger systems that can be resource-intensive, error-prone, and difficult to maintain. MongoDB Change Streams provide a native, efficient solution that allows applications to listen for data changes in real-time with minimal overhead.

## The Real-Time Data Challenge

Conventional approaches to detecting data changes have significant limitations:

```sql
-- SQL polling approach - inefficient and delayed
-- Application repeatedly checks for changes
SELECT 
  order_id,
  status,
  updated_at,
  customer_id
FROM orders
WHERE updated_at > '2025-09-05 10:00:00'
  AND status IN ('pending', 'processing')
ORDER BY updated_at DESC;

-- Problems with polling:
-- - Constant database load from repeated queries
-- - Delay between actual change and detection
-- - Missed changes between polling intervals
-- - No differentiation between insert/update/delete operations
-- - Scaling issues with high-frequency changes

-- Trigger-based approaches - complex maintenance
CREATE OR REPLACE FUNCTION notify_order_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_notify('order_changes', json_build_object(
      'operation', 'insert',
      'order_id', NEW.order_id,
      'status', NEW.status
    )::text);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM pg_notify('order_changes', json_build_object(
      'operation', 'update', 
      'order_id', NEW.order_id,
      'old_status', OLD.status,
      'new_status', NEW.status
    )::text);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Problems: Complex setup, maintenance overhead, limited filtering
```

MongoDB Change Streams solve these challenges:

```javascript
// MongoDB Change Streams - efficient real-time data monitoring
const changeStream = db.collection('orders').watch([
  {
    $match: {
      'operationType': { $in: ['insert', 'update', 'delete'] },
      'fullDocument.status': { $in: ['pending', 'processing', 'shipped'] }
    }
  }
]);

changeStream.on('change', (change) => {
  console.log('Real-time change detected:', {
    operationType: change.operationType,
    documentKey: change.documentKey,
    fullDocument: change.fullDocument,
    updateDescription: change.updateDescription,
    timestamp: change.clusterTime
  });
  
  // React immediately to changes
  handleOrderStatusChange(change);
});

// Benefits:
// - Zero polling overhead - push-based notifications
// - Immediate change detection with sub-second latency
// - Rich change metadata including operation type and modified fields
// - Efficient filtering at the database level
// - Automatic resume capability for fault tolerance
// - Scalable across replica sets and sharded clusters
```

## Understanding MongoDB Change Streams

### Change Stream Fundamentals

MongoDB Change Streams provide real-time access to data changes:

```javascript
// Change Stream implementation for various scenarios
class ChangeStreamManager {
  constructor(db) {
    this.db = db;
    this.activeStreams = new Map();
  }

  async watchCollection(collectionName, pipeline = [], options = {}) {
    const collection = this.db.collection(collectionName);
    
    const changeStreamOptions = {
      fullDocument: options.includeFullDocument ? 'updateLookup' : 'default',
      fullDocumentBeforeChange: options.includeBeforeDocument ? 'whenAvailable' : 'off',
      resumeAfter: options.resumeToken || null,
      startAtOperationTime: options.startTime || null,
      maxAwaitTimeMS: options.maxAwaitTime || 1000,
      batchSize: options.batchSize || 1000
    };

    const changeStream = collection.watch(pipeline, changeStreamOptions);
    
    // Store stream reference for management
    const streamId = `${collectionName}_${Date.now()}`;
    this.activeStreams.set(streamId, {
      stream: changeStream,
      collection: collectionName,
      pipeline: pipeline,
      startedAt: new Date()
    });

    return { streamId, changeStream };
  }

  async watchDatabase(pipeline = [], options = {}) {
    // Watch changes across entire database
    const changeStream = this.db.watch(pipeline, {
      fullDocument: options.includeFullDocument ? 'updateLookup' : 'default',
      fullDocumentBeforeChange: options.includeBeforeDocument ? 'whenAvailable' : 'off'
    });

    const streamId = `database_${Date.now()}`;
    this.activeStreams.set(streamId, {
      stream: changeStream,
      scope: 'database',
      startedAt: new Date()
    });

    return { streamId, changeStream };
  }

  async setupOrderProcessingStream() {
    // Real-time order processing workflow
    const pipeline = [
      {
        $match: {
          $or: [
            // New orders created
            {
              'operationType': 'insert',
              'fullDocument.status': 'pending'
            },
            // Order status updates
            {
              'operationType': 'update',
              'updateDescription.updatedFields.status': { $exists: true }
            },
            // Order cancellations
            {
              'operationType': 'update',
              'updateDescription.updatedFields.cancelled': true
            }
          ]
        }
      },
      {
        $project: {
          operationType: 1,
          documentKey: 1,
          fullDocument: 1,
          updateDescription: 1,
          clusterTime: 1,
          // Add computed fields for processing
          orderValue: '$fullDocument.total_amount',
          customerId: '$fullDocument.customer_id',
          priorityLevel: {
            $switch: {
              branches: [
                { case: { $gt: ['$fullDocument.total_amount', 1000] }, then: 'high' },
                { case: { $gt: ['$fullDocument.total_amount', 500] }, then: 'medium' }
              ],
              default: 'normal'
            }
          }
        }
      }
    ];

    const { streamId, changeStream } = await this.watchCollection('orders', pipeline, {
      includeFullDocument: true,
      includeBeforeDocument: true
    });

    changeStream.on('change', (change) => {
      this.processOrderChange(change);
    });

    changeStream.on('error', (error) => {
      console.error('Change stream error:', error);
      this.handleStreamError(streamId, error);
    });

    return streamId;
  }

  async processOrderChange(change) {
    const { operationType, fullDocument, updateDescription, priorityLevel } = change;
    
    try {
      switch (operationType) {
        case 'insert':
          // New order created
          await this.handleNewOrder(fullDocument, priorityLevel);
          break;
          
        case 'update':
          // Order modified
          await this.handleOrderUpdate(fullDocument, updateDescription, priorityLevel);
          break;
          
        case 'delete':
          // Order deleted (rare but handle gracefully)
          await this.handleOrderDeletion(change.documentKey);
          break;
      }
    } catch (error) {
      console.error('Failed to process order change:', error);
      // Implement dead letter queue or retry logic
      await this.queueFailedChange(change, error);
    }
  }

  async handleNewOrder(order, priority) {
    console.log(`New ${priority} priority order: ${order._id}`);
    
    // Trigger immediate actions for new orders
    const actions = [];
    
    // Inventory reservation
    actions.push(this.reserveInventory(order._id, order.items));
    
    // Payment processing for high-priority orders
    if (priority === 'high') {
      actions.push(this.expeditePaymentProcessing(order._id));
    }
    
    // Customer notification
    actions.push(this.notifyCustomer(order.customer_id, 'order_created', order._id));
    
    // Fraud detection for large orders
    if (order.total_amount > 2000) {
      actions.push(this.triggerFraudCheck(order._id));
    }
    
    await Promise.allSettled(actions);
  }

  async handleOrderUpdate(order, updateDescription, priority) {
    const updatedFields = updateDescription.updatedFields || {};
    
    // React to specific field changes
    if ('status' in updatedFields) {
      await this.handleStatusChange(order._id, updatedFields.status, priority);
    }
    
    if ('shipping_address' in updatedFields) {
      await this.updateShippingCalculations(order._id, updatedFields.shipping_address);
    }
    
    if ('items' in updatedFields) {
      await this.recalculateOrderTotal(order._id, updatedFields.items);
    }
  }

  async handleStatusChange(orderId, newStatus, priority) {
    const statusActions = {
      'confirmed': [
        () => this.initiateFullfillment(orderId),
        () => this.updateInventory(orderId, 'reserved'),
        () => this.sendCustomerNotification(orderId, 'order_confirmed')
      ],
      'shipped': [
        () => this.generateTrackingNumber(orderId),
        () => this.updateInventory(orderId, 'shipped'),
        () => this.sendShipmentNotification(orderId),
        () => this.scheduleDeliveryWindow(orderId)
      ],
      'delivered': [
        () => this.finalizeOrder(orderId),
        () => this.updateInventory(orderId, 'delivered'),
        () => this.requestCustomerFeedback(orderId),
        () => this.triggerRecommendations(orderId)
      ],
      'cancelled': [
        () => this.releaseReservedInventory(orderId),
        () => this.processRefund(orderId),
        () => this.sendCancellationNotification(orderId)
      ]
    };

    const actions = statusActions[newStatus] || [];
    
    if (actions.length > 0) {
      console.log(`Processing ${newStatus} status change for order ${orderId} (${priority} priority)`);
      
      // Execute high-priority orders first
      if (priority === 'high') {
        for (const action of actions) {
          await action();
        }
      } else {
        await Promise.allSettled(actions.map(action => action()));
      }
    }
  }

  async setupInventoryMonitoring() {
    // Real-time inventory level monitoring
    const pipeline = [
      {
        $match: {
          'operationType': 'update',
          'updateDescription.updatedFields.quantity': { $exists: true }
        }
      },
      {
        $addFields: {
          currentQuantity: '$fullDocument.quantity',
          previousQuantity: {
            $subtract: [
              '$fullDocument.quantity',
              '$updateDescription.updatedFields.quantity'
            ]
          },
          quantityChange: '$updateDescription.updatedFields.quantity',
          productId: '$fullDocument.product_id',
          threshold: '$fullDocument.reorder_threshold'
        }
      },
      {
        $match: {
          $or: [
            // Low stock alert
            { $expr: { $lt: ['$currentQuantity', '$threshold'] } },
            // Out of stock
            { currentQuantity: 0 },
            // Large quantity changes (potential issues)
            { $expr: { $gt: [{ $abs: '$quantityChange' }, 100] } }
          ]
        }
      }
    ];

    const { streamId, changeStream } = await this.watchCollection('inventory', pipeline, {
      includeFullDocument: true
    });

    changeStream.on('change', (change) => {
      this.processInventoryChange(change);
    });

    return streamId;
  }

  async processInventoryChange(change) {
    const { currentQuantity, threshold, productId, quantityChange } = change;
    
    if (currentQuantity === 0) {
      // Out of stock - immediate action required
      await this.handleOutOfStock(productId);
    } else if (currentQuantity <= threshold) {
      // Low stock warning
      await this.triggerReorderAlert(productId, currentQuantity, threshold);
    }
    
    // Detect unusual quantity changes
    if (Math.abs(quantityChange) > 100) {
      await this.flagUnusualInventoryChange(productId, quantityChange, change.clusterTime);
    }
    
    // Update real-time inventory dashboard
    await this.updateInventoryDashboard(productId, currentQuantity);
  }

  async handleStreamError(streamId, error) {
    console.error(`Change stream ${streamId} encountered error:`, error);
    
    const streamInfo = this.activeStreams.get(streamId);
    
    if (streamInfo) {
      // Close errored stream
      streamInfo.stream.close();
      
      // Attempt to resume from last known position
      if (error.resumeToken) {
        console.log(`Attempting to resume stream ${streamId}`);
        
        const resumeOptions = {
          resumeAfter: error.resumeToken,
          includeFullDocument: true
        };
        
        const { streamId: newStreamId, changeStream } = await this.watchCollection(
          streamInfo.collection,
          streamInfo.pipeline,
          resumeOptions
        );
        
        // Update stream reference
        this.activeStreams.delete(streamId);
        console.log(`Stream ${streamId} resumed as ${newStreamId}`);
      }
    }
  }

  async closeStream(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    
    if (streamInfo) {
      await streamInfo.stream.close();
      this.activeStreams.delete(streamId);
      console.log(`Stream ${streamId} closed successfully`);
    }
  }

  async closeAllStreams() {
    const closePromises = Array.from(this.activeStreams.keys()).map(
      streamId => this.closeStream(streamId)
    );
    
    await Promise.allSettled(closePromises);
    console.log('All change streams closed');
  }

  // Placeholder methods for business logic
  async reserveInventory(orderId, items) { /* Implementation */ }
  async expeditePaymentProcessing(orderId) { /* Implementation */ }
  async notifyCustomer(customerId, event, orderId) { /* Implementation */ }
  async triggerFraudCheck(orderId) { /* Implementation */ }
  async initiateFullfillment(orderId) { /* Implementation */ }
  async updateInventory(orderId, status) { /* Implementation */ }
  async sendCustomerNotification(orderId, type) { /* Implementation */ }
  async generateTrackingNumber(orderId) { /* Implementation */ }
  async handleOutOfStock(productId) { /* Implementation */ }
  async triggerReorderAlert(productId, current, threshold) { /* Implementation */ }
  async updateInventoryDashboard(productId, quantity) { /* Implementation */ }
}
```

### Advanced Change Stream Patterns

Implement sophisticated change stream architectures:

```javascript
// Advanced change stream patterns for complex scenarios
class AdvancedChangeStreamProcessor {
  constructor(db) {
    this.db = db;
    this.streamProcessors = new Map();
    this.changeBuffer = [];
    this.batchProcessor = null;
  }

  async setupMultiCollectionWorkflow() {
    // Coordinate changes across multiple related collections
    const collections = ['users', 'orders', 'inventory', 'payments'];
    const streams = [];
    
    for (const collectionName of collections) {
      const pipeline = [
        {
          $match: {
            'operationType': { $in: ['insert', 'update', 'delete'] }
          }
        },
        {
          $addFields: {
            sourceCollection: collectionName,
            changeId: { $toString: '$_id' },
            timestamp: '$clusterTime'
          }
        }
      ];
      
      const changeStream = this.db.collection(collectionName).watch(pipeline);
      
      changeStream.on('change', (change) => {
        this.processMultiCollectionChange(change);
      });
      
      streams.push({ collection: collectionName, stream: changeStream });
    }
    
    return streams;
  }

  async processMultiCollectionChange(change) {
    const { sourceCollection, operationType, documentKey, fullDocument } = change;
    
    // Implement cross-collection business logic
    switch (sourceCollection) {
      case 'users':
        if (operationType === 'insert') {
          await this.handleNewUserRegistration(fullDocument);
        } else if (operationType === 'update') {
          await this.handleUserProfileUpdate(documentKey._id, change.updateDescription);
        }
        break;
        
      case 'orders':
        await this.syncOrderRelatedData(change);
        break;
        
      case 'inventory':
        await this.propagateInventoryChanges(change);
        break;
        
      case 'payments':
        await this.handlePaymentEvents(change);
        break;
    }
    
    // Trigger cross-collection consistency checks
    await this.validateDataConsistency(change);
  }

  async syncOrderRelatedData(change) {
    const { operationType, fullDocument, documentKey } = change;
    
    if (operationType === 'insert' && fullDocument) {
      // New order created - sync with related systems
      const syncTasks = [
        this.updateCustomerOrderHistory(fullDocument.customer_id, fullDocument._id),
        this.reserveInventoryItems(fullDocument.items),
        this.createPaymentRecord(fullDocument._id, fullDocument.total_amount),
        this.updateSalesAnalytics(fullDocument)
      ];
      
      await Promise.allSettled(syncTasks);
      
    } else if (operationType === 'update') {
      const updatedFields = change.updateDescription?.updatedFields || {};
      
      // Sync specific field changes
      if ('status' in updatedFields) {
        await this.syncOrderStatusAcrossCollections(documentKey._id, updatedFields.status);
      }
      
      if ('items' in updatedFields) {
        await this.recalculateRelatedData(documentKey._id, updatedFields.items);
      }
    }
  }

  async setupBatchedChangeProcessing(options = {}) {
    // Process changes in batches for efficiency
    const batchSize = options.batchSize || 100;
    const flushInterval = options.flushIntervalMs || 5000;
    
    this.batchProcessor = setInterval(async () => {
      if (this.changeBuffer.length > 0) {
        const batch = this.changeBuffer.splice(0, batchSize);
        await this.processBatchedChanges(batch);
      }
    }, flushInterval);
    
    // Set up change streams to buffer changes
    const changeStream = this.db.collection('events').watch([
      {
        $match: {
          'operationType': { $in: ['insert', 'update'] }
        }
      }
    ]);
    
    changeStream.on('change', (change) => {
      this.changeBuffer.push({
        ...change,
        bufferedAt: new Date()
      });
      
      // Flush immediately if buffer is full
      if (this.changeBuffer.length >= batchSize) {
        this.flushChangeBuffer();
      }
    });
  }

  async processBatchedChanges(changes) {
    console.log(`Processing batch of ${changes.length} changes`);
    
    // Group changes by type for efficient processing
    const changeGroups = changes.reduce((groups, change) => {
      const key = `${change.operationType}_${change.ns?.coll || 'unknown'}`;
      groups[key] = groups[key] || [];
      groups[key].push(change);
      return groups;
    }, {});
    
    // Process each group
    for (const [groupKey, groupChanges] of Object.entries(changeGroups)) {
      await this.processChangeGroup(groupKey, groupChanges);
    }
  }

  async processChangeGroup(groupKey, changes) {
    const [operationType, collection] = groupKey.split('_');
    
    switch (collection) {
      case 'analytics_events':
        await this.updateAnalyticsDashboard(changes);
        break;
        
      case 'user_activities':
        await this.updateUserEngagementMetrics(changes);
        break;
        
      case 'system_logs':
        await this.processSystemLogBatch(changes);
        break;
        
      default:
        console.log(`Unhandled change group: ${groupKey}`);
    }
  }

  async setupChangeStreamWithDeduplication() {
    // Prevent duplicate processing of changes
    const processedChanges = new Set();
    const DEDUP_WINDOW_MS = 30000; // 30 seconds
    
    const changeStream = this.db.collection('critical_data').watch([
      {
        $match: {
          'operationType': { $in: ['insert', 'update', 'delete'] }
        }
      }
    ]);
    
    changeStream.on('change', async (change) => {
      const changeHash = this.generateChangeHash(change);
      
      if (processedChanges.has(changeHash)) {
        console.log('Duplicate change detected, skipping:', changeHash);
        return;
      }
      
      // Add to processed set
      processedChanges.add(changeHash);
      
      // Remove from set after dedup window
      setTimeout(() => {
        processedChanges.delete(changeHash);
      }, DEDUP_WINDOW_MS);
      
      // Process the change
      await this.processCriticalChange(change);
    });
  }

  generateChangeHash(change) {
    // Create hash from key change attributes
    const hashData = {
      operationType: change.operationType,
      documentKey: change.documentKey,
      clusterTime: change.clusterTime?.toString(),
      updateFields: change.updateDescription?.updatedFields ? 
        Object.keys(change.updateDescription.updatedFields).sort() : null
    };
    
    return JSON.stringify(hashData);
  }

  async setupResumableChangeStream(collectionName, pipeline = []) {
    // Implement resumable change streams with persistent resume tokens
    let resumeToken = await this.getStoredResumeToken(collectionName);
    
    const startChangeStream = () => {
      const options = { fullDocument: 'updateLookup' };
      
      if (resumeToken) {
        options.resumeAfter = resumeToken;
        console.log(`Resuming change stream for ${collectionName} from token:`, resumeToken);
      }
      
      const changeStream = this.db.collection(collectionName).watch(pipeline, options);
      
      changeStream.on('change', async (change) => {
        // Store resume token for recovery
        resumeToken = change._id;
        await this.storeResumeToken(collectionName, resumeToken);
        
        // Process the change
        await this.processResumeableChange(collectionName, change);
      });
      
      changeStream.on('error', (error) => {
        console.error('Change stream error:', error);
        
        // Attempt to restart stream
        setTimeout(() => {
          console.log('Restarting change stream...');
          startChangeStream();
        }, 5000);
      });
      
      return changeStream;
    };
    
    return startChangeStream();
  }

  async storeResumeToken(collectionName, resumeToken) {
    await this.db.collection('change_stream_tokens').updateOne(
      { collection: collectionName },
      { 
        $set: { 
          resumeToken: resumeToken,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  async getStoredResumeToken(collectionName) {
    const tokenDoc = await this.db.collection('change_stream_tokens').findOne({
      collection: collectionName
    });
    
    return tokenDoc?.resumeToken || null;
  }

  async setupChangeStreamWithFiltering(filterConfig) {
    // Dynamic filtering based on configuration
    const pipeline = [];
    
    // Operation type filter
    if (filterConfig.operationTypes) {
      pipeline.push({
        $match: {
          'operationType': { $in: filterConfig.operationTypes }
        }
      });
    }
    
    // Field-specific filters
    if (filterConfig.fieldFilters) {
      const fieldMatches = Object.entries(filterConfig.fieldFilters).map(([field, condition]) => {
        return { [`fullDocument.${field}`]: condition };
      });
      
      if (fieldMatches.length > 0) {
        pipeline.push({
          $match: { $and: fieldMatches }
        });
      }
    }
    
    // Custom filter functions
    if (filterConfig.customFilter) {
      pipeline.push({
        $match: {
          $expr: filterConfig.customFilter
        }
      });
    }
    
    // Projection for efficiency
    if (filterConfig.projection) {
      pipeline.push({
        $project: filterConfig.projection
      });
    }
    
    const changeStream = this.db.collection(filterConfig.collection).watch(pipeline);
    
    changeStream.on('change', (change) => {
      this.processFilteredChange(filterConfig.collection, change, filterConfig);
    });
    
    return changeStream;
  }

  // Placeholder methods
  async handleNewUserRegistration(user) { /* Implementation */ }
  async handleUserProfileUpdate(userId, changes) { /* Implementation */ }
  async propagateInventoryChanges(change) { /* Implementation */ }
  async handlePaymentEvents(change) { /* Implementation */ }
  async validateDataConsistency(change) { /* Implementation */ }
  async updateAnalyticsDashboard(changes) { /* Implementation */ }
  async updateUserEngagementMetrics(changes) { /* Implementation */ }
  async processSystemLogBatch(changes) { /* Implementation */ }
  async processCriticalChange(change) { /* Implementation */ }
  async processResumeableChange(collection, change) { /* Implementation */ }
  async processFilteredChange(collection, change, config) { /* Implementation */ }
}
```

## Real-Time Application Patterns

### Live Dashboard Implementation

Build real-time dashboards using Change Streams:

```javascript
// Real-time dashboard with Change Streams
class LiveDashboardService {
  constructor(db, websocketServer) {
    this.db = db;
    this.websockets = websocketServer;
    this.dashboardStreams = new Map();
    this.metricsCache = new Map();
  }

  async setupSalesDashboard() {
    // Real-time sales metrics dashboard
    const pipeline = [
      {
        $match: {
          $or: [
            // New sales
            { 
              'operationType': 'insert',
              'ns.coll': 'orders',
              'fullDocument.status': 'completed'
            },
            // Order updates affecting revenue
            {
              'operationType': 'update',
              'ns.coll': 'orders',
              'updateDescription.updatedFields.total_amount': { $exists: true }
            },
            // Refunds
            {
              'operationType': 'insert',
              'ns.coll': 'refunds'
            }
          ]
        }
      },
      {
        $addFields: {
          eventType: {
            $switch: {
              branches: [
                { 
                  case: { $eq: ['$operationType', 'insert'] },
                  then: {
                    $cond: {
                      if: { $eq: ['$ns.coll', 'refunds'] },
                      then: 'refund',
                      else: 'sale'
                    }
                  }
                },
                { case: { $eq: ['$operationType', 'update'] }, then: 'update' }
              ],
              default: 'unknown'
            }
          }
        }
      }
    ];

    const changeStream = this.db.watch(pipeline, {
      fullDocument: 'updateLookup'
    });

    changeStream.on('change', (change) => {
      this.processSalesChange(change);
    });

    this.dashboardStreams.set('sales', changeStream);
  }

  async processSalesChange(change) {
    const { eventType, fullDocument, operationType } = change;
    
    try {
      let metricsUpdate = {};
      
      switch (eventType) {
        case 'sale':
          metricsUpdate = await this.processSaleEvent(fullDocument);
          break;
          
        case 'refund':
          metricsUpdate = await this.processRefundEvent(fullDocument);
          break;
          
        case 'update':
          metricsUpdate = await this.processOrderUpdateEvent(change);
          break;
      }
      
      // Update cached metrics
      this.updateMetricsCache('sales', metricsUpdate);
      
      // Broadcast to connected clients
      this.broadcastMetricsUpdate('sales', metricsUpdate);
      
    } catch (error) {
      console.error('Error processing sales change:', error);
    }
  }

  async processSaleEvent(order) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Calculate real-time metrics
    const dailyRevenue = await this.calculateDailyRevenue(today);
    const hourlyOrderCount = await this.calculateHourlyOrders(now);
    const topProducts = await this.getTopProductsToday(today);
    
    return {
      timestamp: now,
      newSale: {
        orderId: order._id,
        amount: order.total_amount,
        customerId: order.customer_id,
        items: order.items?.length || 0
      },
      aggregates: {
        dailyRevenue: dailyRevenue,
        hourlyOrderCount: hourlyOrderCount,
        totalOrdersToday: await this.getTotalOrdersToday(today),
        averageOrderValue: dailyRevenue / await this.getTotalOrdersToday(today)
      },
      topProducts: topProducts
    };
  }

  async setupInventoryDashboard() {
    // Real-time inventory monitoring
    const pipeline = [
      {
        $match: {
          'operationType': 'update',
          'ns.coll': 'inventory',
          'updateDescription.updatedFields.quantity': { $exists: true }
        }
      },
      {
        $addFields: {
          productId: '$fullDocument.product_id',
          newQuantity: '$fullDocument.quantity',
          quantityChange: '$updateDescription.updatedFields.quantity',
          threshold: '$fullDocument.reorder_threshold',
          category: '$fullDocument.category'
        }
      },
      {
        $match: {
          $or: [
            // Low stock alerts
            { $expr: { $lt: ['$newQuantity', '$threshold'] } },
            // Large quantity changes
            { $expr: { $gt: [{ $abs: '$quantityChange' }, 50] } },
            // Out of stock
            { newQuantity: 0 }
          ]
        }
      }
    ];

    const changeStream = this.db.collection('inventory').watch(pipeline, {
      fullDocument: 'updateLookup'
    });

    changeStream.on('change', (change) => {
      this.processInventoryChange(change);
    });

    this.dashboardStreams.set('inventory', changeStream);
  }

  async processInventoryChange(change) {
    const { productId, newQuantity, quantityChange, threshold, category } = change;
    
    const alertLevel = this.determineAlertLevel(newQuantity, threshold, quantityChange);
    const categoryMetrics = await this.getCategoryInventoryMetrics(category);
    
    const update = {
      timestamp: new Date(),
      inventory_alert: {
        productId: productId,
        quantity: newQuantity,
        change: quantityChange,
        alertLevel: alertLevel,
        category: category
      },
      category_metrics: categoryMetrics,
      low_stock_count: await this.getLowStockCount()
    };

    this.updateMetricsCache('inventory', update);
    this.broadcastMetricsUpdate('inventory', update);
    
    // Send critical alerts immediately
    if (alertLevel === 'critical') {
      this.sendCriticalInventoryAlert(productId, newQuantity);
    }
  }

  determineAlertLevel(quantity, threshold, change) {
    if (quantity === 0) return 'critical';
    if (quantity <= threshold * 0.5) return 'high';
    if (quantity <= threshold) return 'medium';
    if (Math.abs(change) > 100) return 'unusual';
    return 'normal';
  }

  async setupUserActivityDashboard() {
    // Real-time user activity tracking
    const pipeline = [
      {
        $match: {
          $or: [
            // New user registrations
            {
              'operationType': 'insert',
              'ns.coll': 'users'
            },
            // User login events
            {
              'operationType': 'insert',
              'ns.coll': 'user_sessions'
            },
            // User activity updates
            {
              'operationType': 'update',
              'ns.coll': 'users',
              'updateDescription.updatedFields.last_activity': { $exists: true }
            }
          ]
        }
      }
    ];

    const changeStream = this.db.watch(pipeline, {
      fullDocument: 'updateLookup'
    });

    changeStream.on('change', (change) => {
      this.processUserActivityChange(change);
    });

    this.dashboardStreams.set('user_activity', changeStream);
  }

  async processUserActivityChange(change) {
    const { operationType, ns, fullDocument } = change;
    
    let activityUpdate = {
      timestamp: new Date()
    };

    if (ns.coll === 'users' && operationType === 'insert') {
      // New user registration
      activityUpdate.new_user = {
        userId: fullDocument._id,
        email: fullDocument.email,
        registrationTime: fullDocument.created_at
      };
      
      activityUpdate.metrics = {
        dailyRegistrations: await this.getDailyRegistrations(),
        totalUsers: await this.getTotalUserCount(),
        activeUsersToday: await this.getActiveUsersToday()
      };
      
    } else if (ns.coll === 'user_sessions' && operationType === 'insert') {
      // New user session (login)
      activityUpdate.user_login = {
        userId: fullDocument.user_id,
        sessionId: fullDocument._id,
        loginTime: fullDocument.created_at,
        userAgent: fullDocument.user_agent
      };
      
      activityUpdate.metrics = {
        activeSessionsNow: await this.getActiveSessionCount(),
        loginsToday: await this.getDailyLogins()
      };
    }

    this.updateMetricsCache('user_activity', activityUpdate);
    this.broadcastMetricsUpdate('user_activity', activityUpdate);
  }

  updateMetricsCache(dashboardType, update) {
    const existing = this.metricsCache.get(dashboardType) || {};
    const merged = { ...existing, ...update };
    this.metricsCache.set(dashboardType, merged);
  }

  broadcastMetricsUpdate(dashboardType, update) {
    const message = {
      type: 'dashboard_update',
      dashboard: dashboardType,
      data: update
    };

    // Broadcast to all connected WebSocket clients
    this.websockets.emit('dashboard_update', message);
  }

  async sendCriticalInventoryAlert(productId, quantity) {
    const product = await this.db.collection('products').findOne({ _id: productId });
    
    const alert = {
      type: 'critical_inventory_alert',
      productId: productId,
      productName: product?.name || 'Unknown Product',
      quantity: quantity,
      timestamp: new Date(),
      severity: 'critical'
    };

    // Send to specific alert channels
    this.websockets.emit('critical_alert', alert);
    
    // Could also integrate with external alerting (email, Slack, etc.)
    await this.sendExternalAlert(alert);
  }

  async getCurrentMetrics(dashboardType) {
    // Get current cached metrics for dashboard initialization
    return this.metricsCache.get(dashboardType) || {};
  }

  async closeDashboard(dashboardType) {
    const stream = this.dashboardStreams.get(dashboardType);
    if (stream) {
      await stream.close();
      this.dashboardStreams.delete(dashboardType);
      this.metricsCache.delete(dashboardType);
    }
  }

  // Placeholder methods for metric calculations
  async calculateDailyRevenue(date) { /* Implementation */ }
  async calculateHourlyOrders(hour) { /* Implementation */ }
  async getTopProductsToday(date) { /* Implementation */ }
  async getTotalOrdersToday(date) { /* Implementation */ }
  async getCategoryInventoryMetrics(category) { /* Implementation */ }
  async getLowStockCount() { /* Implementation */ }
  async getDailyRegistrations() { /* Implementation */ }
  async getTotalUserCount() { /* Implementation */ }
  async getActiveUsersToday() { /* Implementation */ }
  async getActiveSessionCount() { /* Implementation */ }
  async getDailyLogins() { /* Implementation */ }
  async sendExternalAlert(alert) { /* Implementation */ }
}
```

### Data Synchronization Patterns

Implement complex data sync scenarios:

```javascript
// Data synchronization using Change Streams
class DataSynchronizationService {
  constructor(primaryDb, replicaDb) {
    this.primaryDb = primaryDb;
    this.replicaDb = replicaDb;
    this.syncStreams = new Map();
    this.syncState = new Map();
  }

  async setupCrossClusterSync() {
    // Synchronize data between different MongoDB clusters
    const collections = ['users', 'orders', 'products', 'inventory'];
    
    for (const collectionName of collections) {
      await this.setupCollectionSync(collectionName);
    }
  }

  async setupCollectionSync(collectionName) {
    // Get last sync timestamp for resumable sync
    const lastSyncTime = await this.getLastSyncTimestamp(collectionName);
    
    const pipeline = [
      {
        $match: {
          'operationType': { $in: ['insert', 'update', 'delete'] },
          'clusterTime': { $gt: lastSyncTime || new Date(0) }
        }
      },
      {
        $addFields: {
          syncId: { $toString: '$_id' },
          sourceCollection: collectionName
        }
      }
    ];

    const changeStream = this.primaryDb.collection(collectionName).watch(pipeline, {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
      startAtOperationTime: lastSyncTime
    });

    changeStream.on('change', (change) => {
      this.processSyncChange(collectionName, change);
    });

    changeStream.on('error', (error) => {
      console.error(`Sync stream error for ${collectionName}:`, error);
      this.handleSyncError(collectionName, error);
    });

    this.syncStreams.set(collectionName, changeStream);
  }

  async processSyncChange(collectionName, change) {
    const { operationType, documentKey, fullDocument, fullDocumentBeforeChange } = change;
    
    try {
      const replicaCollection = this.replicaDb.collection(collectionName);
      
      switch (operationType) {
        case 'insert':
          await this.syncInsert(replicaCollection, fullDocument);
          break;
          
        case 'update':
          await this.syncUpdate(replicaCollection, documentKey, fullDocument, change.updateDescription);
          break;
          
        case 'delete':
          await this.syncDelete(replicaCollection, documentKey);
          break;
      }
      
      // Update sync timestamp
      await this.updateSyncTimestamp(collectionName, change.clusterTime);
      
      // Track sync statistics
      this.updateSyncStats(collectionName, operationType);
      
    } catch (error) {
      console.error(`Sync error for ${collectionName}:`, error);
      await this.recordSyncError(collectionName, change, error);
    }
  }

  async syncInsert(replicaCollection, document) {
    // Handle insert with conflict resolution
    const existingDoc = await replicaCollection.findOne({ _id: document._id });
    
    if (existingDoc) {
      // Document already exists - compare timestamps or use conflict resolution
      const shouldUpdate = await this.resolveInsertConflict(document, existingDoc);
      
      if (shouldUpdate) {
        await replicaCollection.replaceOne(
          { _id: document._id },
          document,
          { upsert: true }
        );
      }
    } else {
      await replicaCollection.insertOne(document);
    }
  }

  async syncUpdate(replicaCollection, documentKey, fullDocument, updateDescription) {
    if (fullDocument) {
      // Full document available - use replace
      await replicaCollection.replaceOne(
        documentKey,
        fullDocument,
        { upsert: true }
      );
    } else if (updateDescription) {
      // Apply partial updates
      const updateDoc = {};
      
      if (updateDescription.updatedFields) {
        updateDoc.$set = updateDescription.updatedFields;
      }
      
      if (updateDescription.removedFields) {
        updateDoc.$unset = updateDescription.removedFields.reduce((unset, field) => {
          unset[field] = "";
          return unset;
        }, {});
      }
      
      if (updateDescription.truncatedArrays) {
        // Handle array truncation
        for (const [field, newSize] of Object.entries(updateDescription.truncatedArrays)) {
          updateDoc.$set = updateDoc.$set || {};
          updateDoc.$set[field] = { $slice: newSize };
        }
      }
      
      await replicaCollection.updateOne(documentKey, updateDoc, { upsert: true });
    }
  }

  async syncDelete(replicaCollection, documentKey) {
    const result = await replicaCollection.deleteOne(documentKey);
    
    if (result.deletedCount === 0) {
      console.warn('Document not found for deletion:', documentKey);
    }
  }

  async setupBidirectionalSync() {
    // Two-way sync between databases with conflict resolution
    await this.setupUnidirectionalSync(this.primaryDb, this.replicaDb, 'primary_to_replica');
    await this.setupUnidirectionalSync(this.replicaDb, this.primaryDb, 'replica_to_primary');
  }

  async setupUnidirectionalSync(sourceDb, targetDb, direction) {
    const collections = ['users', 'orders'];
    
    for (const collectionName of collections) {
      const pipeline = [
        {
          $match: {
            'operationType': { $in: ['insert', 'update', 'delete'] },
            // Avoid sync loops by checking sync metadata
            'fullDocument.syncMetadata.origin': { $ne: direction === 'primary_to_replica' ? 'replica' : 'primary' }
          }
        }
      ];

      const changeStream = sourceDb.collection(collectionName).watch(pipeline, {
        fullDocument: 'updateLookup'
      });

      changeStream.on('change', (change) => {
        this.processBidirectionalSync(targetDb, collectionName, change, direction);
      });
    }
  }

  async processBidirectionalSync(targetDb, collectionName, change, direction) {
    const { operationType, documentKey, fullDocument } = change;
    const targetCollection = targetDb.collection(collectionName);
    
    // Add sync metadata to prevent loops
    const syncOrigin = direction.includes('primary') ? 'primary' : 'replica';
    
    if (fullDocument) {
      fullDocument.syncMetadata = {
        origin: syncOrigin,
        syncedAt: new Date(),
        syncDirection: direction
      };
    }
    
    switch (operationType) {
      case 'insert':
        await targetCollection.insertOne(fullDocument);
        break;
        
      case 'update':
        if (fullDocument) {
          const result = await targetCollection.findOneAndReplace(
            documentKey,
            fullDocument,
            { returnDocument: 'before' }
          );
          
          if (result.value) {
            // Check for conflicts
            await this.handleUpdateConflict(result.value, fullDocument, direction);
          }
        }
        break;
        
      case 'delete':
        await targetCollection.deleteOne(documentKey);
        break;
    }
  }

  async handleUpdateConflict(existingDoc, newDoc, direction) {
    // Implement conflict resolution strategy
    const existingTimestamp = existingDoc.syncMetadata?.syncedAt || existingDoc.updatedAt;
    const newTimestamp = newDoc.syncMetadata?.syncedAt || newDoc.updatedAt;
    
    if (existingTimestamp && newTimestamp && existingTimestamp > newTimestamp) {
      console.warn('Sync conflict detected - existing document is newer');
      // Could implement last-write-wins, manual resolution, or merge strategies
      await this.recordConflict(existingDoc, newDoc, direction);
    }
  }

  async setupEventSourcing() {
    // Event sourcing pattern with Change Streams
    const changeStream = this.primaryDb.watch([
      {
        $match: {
          'operationType': { $in: ['insert', 'update', 'delete'] }
        }
      },
      {
        $addFields: {
          eventType: '$operationType',
          aggregateId: '$documentKey._id',
          aggregateType: '$ns.coll',
          eventData: {
            before: '$fullDocumentBeforeChange',
            after: '$fullDocument',
            changes: '$updateDescription'
          },
          metadata: {
            timestamp: '$clusterTime',
            txnNumber: '$txnNumber',
            lsid: '$lsid'
          }
        }
      }
    ], {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable'
    });

    changeStream.on('change', (change) => {
      this.processEventSourcingChange(change);
    });
  }

  async processEventSourcingChange(change) {
    const event = {
      eventId: change._id,
      eventType: change.eventType,
      aggregateId: change.aggregateId,
      aggregateType: change.aggregateType,
      eventData: change.eventData,
      metadata: change.metadata,
      createdAt: new Date()
    };

    // Store event in event store
    await this.primaryDb.collection('events').insertOne(event);
    
    // Project to read models
    await this.updateReadModels(event);
    
    // Publish to external systems
    await this.publishEvent(event);
  }

  // Utility and placeholder methods
  async getLastSyncTimestamp(collection) { /* Implementation */ }
  async updateSyncTimestamp(collection, timestamp) { /* Implementation */ }
  async updateSyncStats(collection, operation) { /* Implementation */ }
  async recordSyncError(collection, change, error) { /* Implementation */ }
  async resolveInsertConflict(newDoc, existingDoc) { /* Implementation */ }
  async handleSyncError(collection, error) { /* Implementation */ }
  async recordConflict(existing, incoming, direction) { /* Implementation */ }
  async updateReadModels(event) { /* Implementation */ }
  async publishEvent(event) { /* Implementation */ }
}
```

## QueryLeaf Change Stream Integration

QueryLeaf provides SQL-familiar syntax for change data capture and real-time processing:

```sql
-- QueryLeaf Change Stream operations with SQL-style syntax

-- Basic change data capture using SQL trigger-like syntax
CREATE TRIGGER orders_realtime_trigger
ON orders
FOR INSERT, UPDATE, DELETE
AS
BEGIN
  -- Real-time order processing logic
  IF TRIGGER_ACTION = 'INSERT' AND NEW.status = 'pending' THEN
    -- Process new orders immediately
    INSERT INTO order_processing_queue (order_id, priority, created_at)
    VALUES (NEW.order_id, 'high', CURRENT_TIMESTAMP);
    
    -- Reserve inventory for new orders
    UPDATE inventory 
    SET reserved_quantity = reserved_quantity + oi.quantity
    FROM order_items oi
    WHERE inventory.product_id = oi.product_id 
      AND oi.order_id = NEW.order_id;
      
  ELSIF TRIGGER_ACTION = 'UPDATE' AND OLD.status != NEW.status THEN
    -- Handle status changes
    INSERT INTO order_status_history (order_id, old_status, new_status, changed_at)
    VALUES (NEW.order_id, OLD.status, NEW.status, CURRENT_TIMESTAMP);
    
    -- Specific status-based actions
    IF NEW.status = 'shipped' THEN
      -- Generate tracking number and notify customer
      UPDATE orders 
      SET tracking_number = GENERATE_TRACKING_NUMBER()
      WHERE order_id = NEW.order_id;
      
      CALL NOTIFY_CUSTOMER(NEW.customer_id, 'order_shipped', NEW.order_id);
    END IF;
    
  ELSIF TRIGGER_ACTION = 'DELETE' THEN
    -- Handle order cancellation/deletion
    UPDATE inventory 
    SET reserved_quantity = reserved_quantity - oi.quantity
    FROM order_items oi
    WHERE inventory.product_id = oi.product_id 
      AND oi.order_id = OLD.order_id;
  END IF;
END;

-- Real-time analytics with streaming aggregations
CREATE MATERIALIZED VIEW sales_dashboard_realtime AS
SELECT 
  DATE_TRUNC('hour', created_at) as hour_bucket,
  COUNT(*) as orders_count,
  SUM(total_amount) as revenue,
  AVG(total_amount) as avg_order_value,
  COUNT(DISTINCT customer_id) as unique_customers,
  -- Rolling window calculations
  SUM(total_amount) OVER (
    ORDER BY DATE_TRUNC('hour', created_at)
    ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
  ) as rolling_24h_revenue
FROM orders
WHERE status = 'completed'
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY hour_bucket
ORDER BY hour_bucket DESC;

-- QueryLeaf automatically converts this to MongoDB Change Streams:
-- 1. Sets up change stream on orders collection
-- 2. Filters for relevant operations and status changes  
-- 3. Updates materialized view in real-time
-- 4. Provides SQL-familiar syntax for complex real-time logic

-- Multi-table change stream coordination
WITH order_changes AS (
  SELECT 
    order_id,
    status,
    total_amount,
    customer_id,
    CHANGE_TYPE() as operation,
    CHANGE_TIMESTAMP() as changed_at
  FROM orders
  WHERE CHANGE_DETECTED()
),
inventory_changes AS (
  SELECT 
    product_id,
    quantity,
    reserved_quantity,
    CHANGE_TYPE() as operation,
    CHANGE_TIMESTAMP() as changed_at
  FROM inventory
  WHERE CHANGE_DETECTED()
    AND (quantity < reorder_threshold OR reserved_quantity > available_quantity)
)
-- React to coordinated changes across collections
SELECT 
  CASE 
    WHEN oc.operation = 'INSERT' AND oc.status = 'pending' THEN 
      'process_new_order'
    WHEN oc.operation = 'UPDATE' AND oc.status = 'shipped' THEN 
      'send_shipping_notification'  
    WHEN ic.operation = 'UPDATE' AND ic.quantity = 0 THEN
      'handle_out_of_stock'
    ELSE 'no_action'
  END as action_required,
  COALESCE(oc.order_id, ic.product_id) as entity_id,
  COALESCE(oc.changed_at, ic.changed_at) as event_timestamp
FROM order_changes oc
FULL OUTER JOIN inventory_changes ic 
  ON oc.changed_at BETWEEN ic.changed_at - INTERVAL '1 minute' 
                      AND ic.changed_at + INTERVAL '1 minute'
WHERE action_required != 'no_action';

-- Real-time user activity tracking
CREATE OR REPLACE VIEW user_activity_stream AS
SELECT 
  user_id,
  activity_type,
  activity_timestamp,
  session_id,
  -- Session duration calculation
  EXTRACT(EPOCH FROM (
    activity_timestamp - LAG(activity_timestamp) OVER (
      PARTITION BY session_id 
      ORDER BY activity_timestamp
    )
  )) / 60.0 as minutes_since_last_activity,
  
  -- Real-time engagement scoring
  CASE 
    WHEN activity_type = 'login' THEN 10
    WHEN activity_type = 'purchase' THEN 50
    WHEN activity_type = 'view_product' THEN 2
    WHEN activity_type = 'add_to_cart' THEN 15
    ELSE 1
  END as engagement_score,
  
  -- Session activity summary
  COUNT(*) OVER (
    PARTITION BY session_id 
    ORDER BY activity_timestamp 
    ROWS UNBOUNDED PRECEDING
  ) as activities_in_session
  
FROM user_activities
WHERE CHANGE_DETECTED()
  AND activity_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- Real-time inventory alerts with SQL window functions
SELECT 
  product_id,
  product_name,
  current_quantity,
  reorder_threshold,
  -- Calculate velocity (items sold per hour)
  (reserved_quantity - LAG(reserved_quantity, 1) OVER (
    PARTITION BY product_id 
    ORDER BY CHANGE_TIMESTAMP()
  )) as quantity_change,
  
  -- Predict stockout time based on current velocity
  CASE 
    WHEN quantity_change > 0 THEN
      ROUND(current_quantity / (quantity_change * 1.0), 1)
    ELSE NULL
  END as estimated_hours_until_stockout,
  
  -- Alert level based on multiple factors
  CASE 
    WHEN current_quantity = 0 THEN 'CRITICAL'
    WHEN current_quantity <= reorder_threshold * 0.2 THEN 'HIGH'
    WHEN current_quantity <= reorder_threshold * 0.5 THEN 'MEDIUM'
    WHEN estimated_hours_until_stockout <= 24 THEN 'URGENT'
    ELSE 'NORMAL'
  END as alert_level

FROM inventory i
JOIN products p ON i.product_id = p.product_id
WHERE CHANGE_DETECTED()
  AND (current_quantity <= reorder_threshold 
       OR estimated_hours_until_stockout <= 48)
ORDER BY alert_level DESC, estimated_hours_until_stockout ASC;

-- Real-time fraud detection using change streams
WITH payment_patterns AS (
  SELECT 
    customer_id,
    payment_amount,
    payment_method,
    ip_address,
    CHANGE_TIMESTAMP() as payment_time,
    
    -- Calculate recent payment velocity
    COUNT(*) OVER (
      PARTITION BY customer_id 
      ORDER BY CHANGE_TIMESTAMP()
      RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
    ) as payments_last_hour,
    
    -- Calculate payment amount patterns  
    AVG(payment_amount) OVER (
      PARTITION BY customer_id
      ORDER BY CHANGE_TIMESTAMP()
      ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING
    ) as avg_payment_amount_10_orders,
    
    -- Detect IP address changes
    LAG(ip_address) OVER (
      PARTITION BY customer_id 
      ORDER BY CHANGE_TIMESTAMP()
    ) as previous_ip_address
    
  FROM payments
  WHERE CHANGE_DETECTED()
    AND CHANGE_TYPE() = 'INSERT'
)
SELECT 
  customer_id,
  payment_amount,
  payment_time,
  -- Fraud risk indicators
  CASE 
    WHEN payments_last_hour >= 5 THEN 'HIGH_VELOCITY'
    WHEN payment_amount > avg_payment_amount_10_orders * 3 THEN 'UNUSUAL_AMOUNT'
    WHEN ip_address != previous_ip_address THEN 'IP_CHANGE'
    ELSE 'NORMAL'
  END as fraud_indicator,
  
  -- Overall risk score
  (
    CASE WHEN payments_last_hour >= 5 THEN 30 ELSE 0 END +
    CASE WHEN payment_amount > avg_payment_amount_10_orders * 3 THEN 25 ELSE 0 END +
    CASE WHEN ip_address != previous_ip_address THEN 15 ELSE 0 END
  ) as fraud_risk_score
  
FROM payment_patterns
WHERE fraud_risk_score > 20  -- Only flag potentially fraudulent transactions
ORDER BY fraud_risk_score DESC, payment_time DESC;
```

## Best Practices for Change Streams

### Performance and Scalability Guidelines

Optimize Change Stream implementations:

1. **Efficient Filtering**: Use specific match conditions to minimize unnecessary change events
2. **Resume Tokens**: Implement resume token persistence for fault tolerance
3. **Resource Management**: Monitor change stream resource usage and connection limits
4. **Batch Processing**: Group related changes for efficient processing
5. **Error Handling**: Implement robust error handling and retry logic
6. **Index Strategy**: Ensure proper indexes for change stream filter conditions

### Architecture Considerations

Design scalable change stream architectures:

1. **Deployment Patterns**: Consider change stream placement in distributed systems
2. **Event Ordering**: Handle out-of-order events and ensure consistency
3. **Backpressure Management**: Implement backpressure handling for high-volume scenarios
4. **Multi-Tenancy**: Design change streams for multi-tenant applications
5. **Security**: Implement proper authentication and authorization for change streams
6. **Monitoring**: Set up comprehensive monitoring and alerting for change stream health

## Conclusion

MongoDB Change Streams provide powerful real-time data processing capabilities that enable responsive, event-driven applications. Combined with SQL-style change data capture patterns, Change Streams deliver the real-time functionality modern applications require while maintaining familiar development approaches.

Key Change Stream benefits include:

- **Real-Time Reactivity**: Immediate response to data changes with sub-second latency
- **Efficient Processing**: Push-based notifications eliminate polling overhead and delays
- **Rich Change Metadata**: Complete information about operations, including before/after states
- **Fault Tolerance**: Built-in resume capability and error recovery mechanisms
- **Scalable Architecture**: Works seamlessly across replica sets and sharded clusters

Whether you're building live dashboards, implementing data synchronization, creating reactive user interfaces, or developing event-driven architectures, MongoDB Change Streams with QueryLeaf's familiar SQL interface provide the foundation for real-time data processing. This combination enables you to implement sophisticated real-time functionality while preserving the development patterns and query approaches your team already knows.

> **QueryLeaf Integration**: QueryLeaf automatically manages Change Stream setup, filtering, and error handling while providing SQL-familiar trigger syntax and streaming query capabilities. Complex change stream logic, resume token management, and multi-collection coordination are seamlessly handled through familiar SQL patterns.

The integration of real-time change processing with SQL-style event handling makes MongoDB an ideal platform for applications requiring both immediate data responsiveness and familiar database interaction patterns, ensuring your real-time features remain both powerful and maintainable as they scale and evolve.