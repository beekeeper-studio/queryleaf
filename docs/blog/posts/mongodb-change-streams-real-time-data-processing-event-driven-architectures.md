---
title: "MongoDB Change Streams and Real-Time Data Processing: SQL-Style Event-Driven Architecture for Reactive Applications"
description: "Master MongoDB Change Streams for real-time data processing, event-driven architectures, and reactive applications. Learn change detection, event filtering, and SQL-familiar pattern matching for modern data pipelines."
date: 2025-09-16
tags: [mongodb, change-streams, real-time, event-driven, reactive, data-processing, sql, streaming]
---

# MongoDB Change Streams and Real-Time Data Processing: SQL-Style Event-Driven Architecture for Reactive Applications

Modern applications require real-time responsiveness to data changes - instant notifications, live dashboards, automatic workflow triggers, and synchronized data across distributed systems. Traditional approaches of polling databases for changes create significant performance overhead, introduce latency delays, and consume unnecessary resources while missing the precision and immediacy that users expect from contemporary applications.

MongoDB Change Streams provide enterprise-grade real-time data processing capabilities that monitor database changes as they occur, delivering instant event notifications with complete change context, ordering guarantees, and resumability features. Unlike polling-based approaches or complex trigger systems, Change Streams integrate seamlessly with application architectures to enable reactive programming patterns and event-driven workflows.

## The Traditional Change Detection Challenge

Conventional approaches to detecting data changes have significant limitations for real-time applications:

```sql
-- Traditional polling approach - inefficient and high-latency
-- Application repeatedly queries database for changes

-- PostgreSQL change detection with polling
CREATE TABLE user_activities (
    activity_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    activity_type VARCHAR(100) NOT NULL,
    activity_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    is_processed BOOLEAN DEFAULT false
);

-- Trigger to update timestamp on changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_activities_updated_at
    BEFORE UPDATE ON user_activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Application polling for changes (inefficient)
-- This query runs continuously every few seconds
SELECT 
    activity_id,
    user_id,
    activity_type,
    activity_data,
    created_at,
    updated_at
FROM user_activities 
WHERE (updated_at > @last_poll_time OR created_at > @last_poll_time)
  AND is_processed = false
ORDER BY created_at, updated_at
LIMIT 1000;

-- Update processed records
UPDATE user_activities 
SET is_processed = true, processed_at = CURRENT_TIMESTAMP
WHERE activity_id IN (@processed_ids);

-- Problems with polling approach:
-- 1. High database load from constant polling queries
-- 2. Polling frequency vs. latency tradeoff (faster polling = more load)
-- 3. Potential race conditions with concurrent processors
-- 4. No ordering guarantees across multiple tables
-- 5. Missed changes during application downtime
-- 6. Complex state management for resuming processing
-- 7. Difficult to scale across multiple application instances
-- 8. Resource waste during periods of no activity

-- Database triggers approach - limited and fragile
CREATE OR REPLACE FUNCTION notify_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Limited payload size in PostgreSQL notifications
    PERFORM pg_notify(
        'user_activity_change',
        json_build_object(
            'operation', TG_OP,
            'table', TG_TABLE_NAME,
            'id', COALESCE(NEW.activity_id, OLD.activity_id)
        )::text
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_activities_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON user_activities
    FOR EACH ROW EXECUTE FUNCTION notify_change();

-- Application listening for notifications
-- Limited payload, no automatic reconnection, fragile connections
LISTEN user_activity_change;

-- Trigger limitations:
-- - Limited payload size (8000 bytes in PostgreSQL)
-- - Connection-based, not resilient to network issues  
-- - No built-in resume capability after disconnection
-- - Complex coordination across multiple database connections
-- - Difficult to filter events at database level
-- - No ordering guarantees across transactions
-- - Performance impact on write operations
```

MongoDB Change Streams provide comprehensive real-time change processing:

```javascript
// MongoDB Change Streams - enterprise-grade real-time data processing
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('production_app');

// Comprehensive change stream with advanced filtering and processing
async function setupAdvancedChangeStream() {
  // Create change stream with sophisticated pipeline filtering
  const changeStream = db.collection('user_activities').watch([
    // Match specific operations and conditions
    {
      $match: {
        $and: [
          // Only monitor insert and update operations
          { operationType: { $in: ['insert', 'update', 'replace'] } },
          
          // Filter by activity types we care about
          {
            $or: [
              { 'fullDocument.activity_type': { $in: ['purchase', 'login', 'signup'] } },
              { 'updateDescription.updatedFields.status': { $exists: true } },
              { 'fullDocument.priority': 'high' }
            ]
          },
          
          // Only process activities for active users
          { 'fullDocument.user_status': 'active' },
          
          // Exclude system-generated activities
          { 'fullDocument.source': { $ne: 'system_maintenance' } }
        ]
      }
    },
    
    // Enrich change events with additional context
    {
      $lookup: {
        from: 'users',
        localField: 'fullDocument.user_id',
        foreignField: '_id',
        as: 'user_info'
      }
    },
    
    // Add computed fields for processing
    {
      $addFields: {
        processedAt: new Date(),
        changeId: { $toString: '$_id' },
        user: { $arrayElemAt: ['$user_info', 0] },
        
        // Categorize change types
        changeCategory: {
          $switch: {
            branches: [
              { case: { $eq: ['$operationType', 'insert'] }, then: 'new_activity' },
              { 
                case: { 
                  $and: [
                    { $eq: ['$operationType', 'update'] },
                    { $ifNull: ['$updateDescription.updatedFields.status', false] }
                  ]
                }, 
                then: 'status_change' 
              },
              { case: { $eq: ['$operationType', 'replace'] }, then: 'activity_replaced' }
            ],
            default: 'other_change'
          }
        },
        
        // Priority scoring
        priorityScore: {
          $switch: {
            branches: [
              { case: { $eq: ['$fullDocument.activity_type', 'purchase'] }, then: 10 },
              { case: { $eq: ['$fullDocument.activity_type', 'signup'] }, then: 8 },
              { case: { $eq: ['$fullDocument.activity_type', 'login'] }, then: 3 },
              { case: { $eq: ['$fullDocument.priority', 'high'] }, then: 9 }
            ],
            default: 5
          }
        }
      }
    },
    
    // Project final change document structure
    {
      $project: {
        changeId: 1,
        operationType: 1,
        changeCategory: 1,
        priorityScore: 1,
        processedAt: 1,
        clusterTime: 1,
        
        // Original document data
        documentKey: 1,
        fullDocument: 1,
        updateDescription: 1,
        
        // User context
        'user.username': 1,
        'user.email': 1,
        'user.subscription_type': 1,
        'user.segment': 1,
        
        // Metadata
        ns: 1,
        to: 1
      }
    }
  ], {
    // Change stream options
    fullDocument: 'updateLookup',        // Always include full document
    fullDocumentBeforeChange: 'whenAvailable', // Include before-change document
    resumeAfter: null,                   // Resume token (set from previous session)
    startAtOperationTime: null,          // Start from specific time
    maxAwaitTimeMS: 1000,               // Maximum time to wait for changes
    batchSize: 100,                      // Batch size for change events
    collation: { locale: 'en', strength: 2 } // Collation for text matching
  });

  // Process change stream events
  console.log('Monitoring user activities for real-time changes...');

  for await (const change of changeStream) {
    try {
      await processChangeEvent(change);
      
      // Store resume token for fault tolerance
      await storeResumeToken(change._id);
      
    } catch (error) {
      console.error('Error processing change event:', error);
      
      // Implement error handling strategy
      await handleChangeProcessingError(change, error);
    }
  }
}

// Sophisticated change event processing
async function processChangeEvent(change) {
  console.log(`Processing ${change.changeCategory} event:`, {
    changeId: change.changeId,
    operationType: change.operationType,
    priority: change.priorityScore,
    user: change.user?.username,
    timestamp: change.processedAt
  });

  // Route change events based on type and priority
  switch (change.changeCategory) {
    case 'new_activity':
      await handleNewActivity(change);
      break;
      
    case 'status_change':
      await handleStatusChange(change);
      break;
      
    case 'activity_replaced':
      await handleActivityReplacement(change);
      break;
      
    default:
      await handleGenericChange(change);
  }
  
  // Emit real-time event to connected clients
  await emitRealTimeEvent(change);
  
  // Update analytics and metrics
  await updateRealtimeMetrics(change);
}

async function handleNewActivity(change) {
  const activity = change.fullDocument;
  const user = change.user;
  
  // Process high-priority activities immediately
  if (change.priorityScore >= 8) {
    await processHighPriorityActivity(activity, user);
  }
  
  // Trigger automated workflows
  switch (activity.activity_type) {
    case 'purchase':
      await triggerPurchaseWorkflow(activity, user);
      break;
      
    case 'signup':
      await triggerOnboardingWorkflow(activity, user);
      break;
      
    case 'login':
      await updateUserSession(activity, user);
      break;
  }
  
  // Update real-time dashboards
  await updateLiveDashboard('new_activity', {
    activityType: activity.activity_type,
    userId: activity.user_id,
    userSegment: user.segment,
    timestamp: activity.created_at
  });
}

async function handleStatusChange(change) {
  const updatedFields = change.updateDescription.updatedFields;
  const activity = change.fullDocument;
  
  // Process status-specific logic
  if (updatedFields.status) {
    console.log(`Activity status changed: ${updatedFields.status}`);
    
    switch (updatedFields.status) {
      case 'completed':
        await handleActivityCompletion(activity);
        break;
        
      case 'failed':
        await handleActivityFailure(activity);
        break;
        
      case 'cancelled':
        await handleActivityCancellation(activity);
        break;
    }
  }
  
  // Notify interested parties
  await sendStatusChangeNotification(change);
}

// Benefits of MongoDB Change Streams:
// - Real-time event delivery with sub-second latency
// - Complete change context including before/after state
// - Resumable streams with automatic fault tolerance
// - Advanced filtering and transformation capabilities
// - Ordering guarantees within and across collections
// - Integration with existing MongoDB infrastructure
// - Scalable across sharded clusters and replica sets
// - Built-in authentication and authorization
// - No polling overhead or resource waste
// - Developer-friendly API with powerful aggregation pipeline
```

## Understanding MongoDB Change Streams Architecture

### Advanced Change Stream Configuration and Management

Implement comprehensive change stream management for production environments:

```javascript
// Advanced change stream management system
class MongoChangeStreamManager {
  constructor(client, options = {}) {
    this.client = client;
    this.db = client.db(options.database || 'production');
    this.options = {
      // Stream configuration
      maxRetries: options.maxRetries || 10,
      retryDelay: options.retryDelay || 1000,
      batchSize: options.batchSize || 100,
      maxAwaitTimeMS: options.maxAwaitTimeMS || 1000,
      
      // Resume configuration
      enableResume: options.enableResume !== false,
      resumeTokenStorage: options.resumeTokenStorage || 'mongodb',
      
      // Error handling
      errorRetryStrategies: options.errorRetryStrategies || ['exponential_backoff', 'circuit_breaker'],
      
      // Monitoring
      enableMetrics: options.enableMetrics !== false,
      metricsInterval: options.metricsInterval || 30000,
      
      ...options
    };
    
    this.activeStreams = new Map();
    this.resumeTokens = new Map();
    this.streamMetrics = new Map();
    this.eventHandlers = new Map();
    this.isShuttingDown = false;
  }

  async createChangeStream(streamConfig) {
    const {
      streamId,
      collection,
      pipeline = [],
      options = {},
      eventHandlers = {}
    } = streamConfig;

    if (this.activeStreams.has(streamId)) {
      throw new Error(`Change stream with ID '${streamId}' already exists`);
    }

    // Build comprehensive change stream pipeline
    const changeStreamPipeline = [
      // Base filtering
      {
        $match: {
          $and: [
            // Operation type filtering
            streamConfig.operationTypes ? {
              operationType: { $in: streamConfig.operationTypes }
            } : {},
            
            // Namespace filtering
            streamConfig.namespaces ? {
              'ns.coll': { $in: streamConfig.namespaces.map(ns => ns.collection || ns) }
            } : {},
            
            // Custom filtering
            ...(streamConfig.filters || [])
          ].filter(filter => Object.keys(filter).length > 0)
        }
      },
      
      // Enrichment lookups
      ...(streamConfig.enrichments || []).map(enrichment => ({
        $lookup: {
          from: enrichment.from,
          localField: enrichment.localField,
          foreignField: enrichment.foreignField,
          as: enrichment.as,
          pipeline: enrichment.pipeline || []
        }
      })),
      
      // Computed fields
      {
        $addFields: {
          streamId: streamId,
          processedAt: new Date(),
          changeId: { $toString: '$_id' },
          
          // Change categorization
          changeCategory: streamConfig.categorization || {
            $switch: {
              branches: [
                { case: { $eq: ['$operationType', 'insert'] }, then: 'create' },
                { case: { $eq: ['$operationType', 'update'] }, then: 'update' },
                { case: { $eq: ['$operationType', 'replace'] }, then: 'replace' },
                { case: { $eq: ['$operationType', 'delete'] }, then: 'delete' }
              ],
              default: 'other'
            }
          },
          
          // Priority scoring
          priority: streamConfig.priorityScoring || 5,
          
          // Custom computed fields
          ...streamConfig.computedFields || {}
        }
      },
      
      // Additional pipeline stages
      ...pipeline,
      
      // Final projection
      {
        $project: {
          _id: 1,
          streamId: 1,
          changeId: 1,
          processedAt: 1,
          operationType: 1,
          changeCategory: 1,
          priority: 1,
          clusterTime: 1,
          documentKey: 1,
          fullDocument: 1,
          updateDescription: 1,
          ns: 1,
          to: 1,
          ...streamConfig.additionalProjection || {}
        }
      }
    ];

    // Configure change stream options
    const changeStreamOptions = {
      fullDocument: streamConfig.fullDocument || 'updateLookup',
      fullDocumentBeforeChange: streamConfig.fullDocumentBeforeChange || 'whenAvailable',
      resumeAfter: await this.getStoredResumeToken(streamId),
      maxAwaitTimeMS: this.options.maxAwaitTimeMS,
      batchSize: this.options.batchSize,
      ...options
    };

    // Create change stream
    const changeStream = collection ? 
      this.db.collection(collection).watch(changeStreamPipeline, changeStreamOptions) :
      this.db.watch(changeStreamPipeline, changeStreamOptions);

    // Store stream configuration
    this.activeStreams.set(streamId, {
      stream: changeStream,
      config: streamConfig,
      options: changeStreamOptions,
      createdAt: new Date(),
      lastEventAt: null,
      eventCount: 0,
      errorCount: 0,
      retryCount: 0
    });

    // Initialize metrics
    this.streamMetrics.set(streamId, {
      eventsProcessed: 0,
      errorsEncountered: 0,
      avgProcessingTime: 0,
      lastProcessingTime: 0,
      throughputHistory: [],
      errorHistory: [],
      resumeHistory: []
    });

    // Store event handlers
    this.eventHandlers.set(streamId, eventHandlers);

    // Start processing
    this.processChangeStream(streamId);

    console.log(`Change stream '${streamId}' created and started`);
    return streamId;
  }

  async processChangeStream(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    const metrics = this.streamMetrics.get(streamId);
    const handlers = this.eventHandlers.get(streamId);
    
    if (!streamInfo) {
      console.error(`Change stream '${streamId}' not found`);
      return;
    }

    const { stream, config } = streamInfo;

    try {
      console.log(`Starting event processing for stream: ${streamId}`);

      for await (const change of stream) {
        if (this.isShuttingDown) {
          console.log(`Shutting down stream: ${streamId}`);
          break;
        }

        const processingStartTime = Date.now();

        try {
          // Process the change event
          await this.processChangeEvent(streamId, change, handlers);
          
          // Update metrics
          const processingTime = Date.now() - processingStartTime;
          this.updateStreamMetrics(streamId, processingTime, true);
          
          // Store resume token
          await this.storeResumeToken(streamId, change._id);
          
          // Update stream info
          streamInfo.lastEventAt = new Date();
          streamInfo.eventCount++;

        } catch (error) {
          console.error(`Error processing change event in stream '${streamId}':`, error);
          
          // Update error metrics
          const processingTime = Date.now() - processingStartTime;
          this.updateStreamMetrics(streamId, processingTime, false);
          
          streamInfo.errorCount++;
          
          // Handle processing error
          await this.handleProcessingError(streamId, change, error);
        }
      }

    } catch (error) {
      console.error(`Change stream '${streamId}' encountered error:`, error);
      
      if (!this.isShuttingDown) {
        await this.handleStreamError(streamId, error);
      }
    }
  }

  async processChangeEvent(streamId, change, handlers) {
    // Route to appropriate handler based on change type
    const handlerKey = change.changeCategory || change.operationType;
    const handler = handlers[handlerKey] || handlers.default || this.defaultEventHandler;
    
    if (typeof handler === 'function') {
      await handler(change, {
        streamId,
        metrics: this.streamMetrics.get(streamId),
        resumeToken: change._id
      });
    } else {
      console.warn(`No handler found for change type '${handlerKey}' in stream '${streamId}'`);
    }
  }

  async defaultEventHandler(change, context) {
    console.log(`Default handler processing change:`, {
      streamId: context.streamId,
      changeId: change.changeId,
      operationType: change.operationType,
      collection: change.ns?.coll
    });
  }

  updateStreamMetrics(streamId, processingTime, success) {
    const metrics = this.streamMetrics.get(streamId);
    if (!metrics) return;

    metrics.eventsProcessed++;
    metrics.lastProcessingTime = processingTime;
    
    // Update average processing time (exponential moving average)
    metrics.avgProcessingTime = (metrics.avgProcessingTime * 0.9) + (processingTime * 0.1);
    
    if (success) {
      // Update throughput history
      metrics.throughputHistory.push({
        timestamp: Date.now(),
        processingTime: processingTime
      });
      
      // Keep only recent history
      if (metrics.throughputHistory.length > 1000) {
        metrics.throughputHistory.shift();
      }
    } else {
      metrics.errorsEncountered++;
      
      // Record error
      metrics.errorHistory.push({
        timestamp: Date.now(),
        processingTime: processingTime
      });
      
      // Keep only recent error history
      if (metrics.errorHistory.length > 100) {
        metrics.errorHistory.shift();
      }
    }
  }

  async handleProcessingError(streamId, change, error) {
    const streamInfo = this.activeStreams.get(streamId);
    const config = streamInfo?.config;
    
    // Log error details
    console.error(`Processing error in stream '${streamId}':`, {
      changeId: change.changeId,
      operationType: change.operationType,
      error: error.message
    });

    // Apply error handling strategies
    if (config?.errorHandling) {
      const strategy = config.errorHandling.strategy || 'log';
      
      switch (strategy) {
        case 'retry':
          await this.retryChangeEvent(streamId, change, error);
          break;
          
        case 'deadletter':
          await this.sendToDeadLetter(streamId, change, error);
          break;
          
        case 'skip':
          console.warn(`Skipping failed change event: ${change.changeId}`);
          break;
          
        case 'stop_stream':
          console.error(`Stopping stream '${streamId}' due to processing error`);
          await this.stopChangeStream(streamId);
          break;
          
        default:
          console.error(`Unhandled processing error in stream '${streamId}'`);
      }
    }
  }

  async handleStreamError(streamId, error) {
    const streamInfo = this.activeStreams.get(streamId);
    if (!streamInfo) return;

    console.error(`Stream error in '${streamId}':`, error.message);

    // Increment retry count
    streamInfo.retryCount++;

    // Check if we should retry
    if (streamInfo.retryCount <= this.options.maxRetries) {
      console.log(`Retrying stream '${streamId}' (attempt ${streamInfo.retryCount})`);
      
      // Exponential backoff
      const delay = this.options.retryDelay * Math.pow(2, streamInfo.retryCount - 1);
      await this.sleep(delay);
      
      // Record resume attempt
      const metrics = this.streamMetrics.get(streamId);
      if (metrics) {
        metrics.resumeHistory.push({
          timestamp: Date.now(),
          attempt: streamInfo.retryCount,
          error: error.message
        });
      }
      
      // Restart the stream
      await this.restartChangeStream(streamId);
    } else {
      console.error(`Maximum retries exceeded for stream '${streamId}'. Marking as failed.`);
      streamInfo.status = 'failed';
      streamInfo.lastError = error;
    }
  }

  async restartChangeStream(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    if (!streamInfo) return;

    console.log(`Restarting change stream: ${streamId}`);

    try {
      // Close existing stream
      await streamInfo.stream.close();
    } catch (closeError) {
      console.warn(`Error closing stream '${streamId}':`, closeError.message);
    }

    // Update stream options with resume token
    const resumeToken = await this.getStoredResumeToken(streamId);
    if (resumeToken) {
      streamInfo.options.resumeAfter = resumeToken;
      console.log(`Resuming stream '${streamId}' from stored token`);
    }

    // Create new change stream
    const changeStreamPipeline = streamInfo.config.pipeline || [];
    const newStream = streamInfo.config.collection ? 
      this.db.collection(streamInfo.config.collection).watch(changeStreamPipeline, streamInfo.options) :
      this.db.watch(changeStreamPipeline, streamInfo.options);

    // Update stream reference
    streamInfo.stream = newStream;
    streamInfo.restartedAt = new Date();

    // Resume processing
    this.processChangeStream(streamId);
  }

  async storeResumeToken(streamId, resumeToken) {
    if (!this.options.enableResume) return;

    this.resumeTokens.set(streamId, {
      token: resumeToken,
      timestamp: new Date()
    });

    // Store persistently based on configuration
    if (this.options.resumeTokenStorage === 'mongodb') {
      await this.db.collection('change_stream_resume_tokens').updateOne(
        { streamId: streamId },
        {
          $set: {
            resumeToken: resumeToken,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    } else if (this.options.resumeTokenStorage === 'redis' && this.redisClient) {
      await this.redisClient.set(
        `resume_token:${streamId}`,
        JSON.stringify({
          token: resumeToken,
          timestamp: new Date()
        })
      );
    }
  }

  async getStoredResumeToken(streamId) {
    if (!this.options.enableResume) return null;

    // Check memory first
    const memoryToken = this.resumeTokens.get(streamId);
    if (memoryToken) {
      return memoryToken.token;
    }

    // Load from persistent storage
    try {
      if (this.options.resumeTokenStorage === 'mongodb') {
        const tokenDoc = await this.db.collection('change_stream_resume_tokens').findOne(
          { streamId: streamId }
        );
        return tokenDoc?.resumeToken || null;
      } else if (this.options.resumeTokenStorage === 'redis' && this.redisClient) {
        const tokenData = await this.redisClient.get(`resume_token:${streamId}`);
        return tokenData ? JSON.parse(tokenData).token : null;
      }
    } catch (error) {
      console.warn(`Error loading resume token for stream '${streamId}':`, error.message);
    }

    return null;
  }

  async stopChangeStream(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    if (!streamInfo) {
      console.warn(`Change stream '${streamId}' not found`);
      return;
    }

    console.log(`Stopping change stream: ${streamId}`);

    try {
      await streamInfo.stream.close();
      streamInfo.stoppedAt = new Date();
      streamInfo.status = 'stopped';
      
      console.log(`Change stream '${streamId}' stopped successfully`);
    } catch (error) {
      console.error(`Error stopping stream '${streamId}':`, error);
    }
  }

  async getStreamMetrics(streamId) {
    if (streamId) {
      return {
        streamInfo: this.activeStreams.get(streamId),
        metrics: this.streamMetrics.get(streamId)
      };
    } else {
      // Return metrics for all streams
      const allMetrics = {};
      for (const [id, streamInfo] of this.activeStreams.entries()) {
        allMetrics[id] = {
          streamInfo: streamInfo,
          metrics: this.streamMetrics.get(id)
        };
      }
      return allMetrics;
    }
  }

  async startMonitoring() {
    if (this.monitoringInterval) return;

    console.log('Starting change stream monitoring');
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Monitoring check failed:', error);
      }
    }, this.options.metricsInterval);
  }

  async performHealthCheck() {
    for (const [streamId, streamInfo] of this.activeStreams.entries()) {
      const metrics = this.streamMetrics.get(streamId);
      
      // Check stream health
      const health = this.assessStreamHealth(streamId, streamInfo, metrics);
      
      if (health.status !== 'healthy') {
        console.warn(`Stream '${streamId}' health check:`, health);
      }
      
      // Log throughput metrics
      if (metrics.throughputHistory.length > 0) {
        const recentEvents = metrics.throughputHistory.filter(
          event => Date.now() - event.timestamp < 60000 // Last minute
        );
        
        if (recentEvents.length > 0) {
          const avgThroughput = recentEvents.length; // Events per minute
          console.log(`Stream '${streamId}' throughput: ${avgThroughput} events/minute`);
        }
      }
    }
  }

  assessStreamHealth(streamId, streamInfo, metrics) {
    const health = {
      streamId: streamId,
      status: 'healthy',
      issues: [],
      recommendations: []
    };

    // Check error rate
    if (metrics.errorsEncountered > 0 && metrics.eventsProcessed > 0) {
      const errorRate = (metrics.errorsEncountered / metrics.eventsProcessed) * 100;
      if (errorRate > 10) {
        health.status = 'unhealthy';
        health.issues.push(`High error rate: ${errorRate.toFixed(2)}%`);
        health.recommendations.push('Investigate error patterns and processing logic');
      } else if (errorRate > 5) {
        health.status = 'warning';
        health.issues.push(`Elevated error rate: ${errorRate.toFixed(2)}%`);
      }
    }

    // Check processing performance
    if (metrics.avgProcessingTime > 5000) {
      health.issues.push(`Slow processing: ${metrics.avgProcessingTime.toFixed(0)}ms average`);
      health.recommendations.push('Optimize event processing logic');
      if (health.status === 'healthy') health.status = 'warning';
    }

    // Check stream activity
    const timeSinceLastEvent = streamInfo.lastEventAt ? 
      Date.now() - streamInfo.lastEventAt.getTime() : 
      Date.now() - streamInfo.createdAt.getTime();
      
    if (timeSinceLastEvent > 3600000) { // 1 hour
      health.issues.push(`No events for ${Math.round(timeSinceLastEvent / 60000)} minutes`);
      health.recommendations.push('Verify data source and stream configuration');
    }

    // Check retry count
    if (streamInfo.retryCount > 3) {
      health.issues.push(`Multiple retries: ${streamInfo.retryCount} attempts`);
      health.recommendations.push('Investigate connection stability and error causes');
      if (health.status === 'healthy') health.status = 'warning';
    }

    return health;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    console.log('Shutting down change stream manager...');
    
    this.isShuttingDown = true;
    
    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Close all active streams
    const closePromises = [];
    for (const [streamId] of this.activeStreams.entries()) {
      closePromises.push(this.stopChangeStream(streamId));
    }
    
    await Promise.all(closePromises);
    
    console.log('Change stream manager shutdown complete');
  }
}
```

### Real-Time Event Processing Patterns

Implement sophisticated event processing patterns for different application scenarios:

```javascript
// Specialized change stream patterns for different use cases
class RealtimeEventPatterns {
  constructor(changeStreamManager) {
    this.csm = changeStreamManager;
    this.eventBus = new EventEmitter();
    this.processors = new Map();
  }

  async setupUserActivityStream() {
    // Real-time user activity monitoring
    return await this.csm.createChangeStream({
      streamId: 'user_activities',
      collection: 'user_activities',
      operationTypes: ['insert', 'update'],
      
      filters: [
        { 'fullDocument.activity_type': { $in: ['login', 'purchase', 'view', 'search'] } },
        { 'fullDocument.user_id': { $exists: true } }
      ],
      
      enrichments: [
        {
          from: 'users',
          localField: 'fullDocument.user_id',
          foreignField: '_id',
          as: 'user_data'
        },
        {
          from: 'user_sessions',
          localField: 'fullDocument.session_id',
          foreignField: '_id',
          as: 'session_data'
        }
      ],
      
      computedFields: {
        activityScore: {
          $switch: {
            branches: [
              { case: { $eq: ['$fullDocument.activity_type', 'purchase'] }, then: 100 },
              { case: { $eq: ['$fullDocument.activity_type', 'login'] }, then: 10 },
              { case: { $eq: ['$fullDocument.activity_type', 'search'] }, then: 5 },
              { case: { $eq: ['$fullDocument.activity_type', 'view'] }, then: 1 }
            ],
            default: 0
          }
        },
        
        userSegment: { $arrayElemAt: ['$user_data.segment', 0] },
        sessionDuration: { $arrayElemAt: ['$session_data.duration', 0] }
      },
      
      eventHandlers: {
        insert: async (change, context) => {
          await this.handleNewUserActivity(change);
        },
        update: async (change, context) => {
          await this.handleUserActivityUpdate(change);
        }
      },
      
      errorHandling: {
        strategy: 'retry',
        maxRetries: 3
      }
    });
  }

  async handleNewUserActivity(change) {
    const activity = change.fullDocument;
    const user = change.user_data?.[0];
    
    console.log(`New user activity: ${activity.activity_type}`, {
      userId: activity.user_id,
      username: user?.username,
      activityScore: change.activityScore,
      timestamp: activity.created_at
    });

    // Real-time user engagement tracking
    await this.updateUserEngagement(activity, user);
    
    // Trigger personalization engine
    if (change.activityScore >= 5) {
      await this.triggerPersonalizationUpdate(activity, user);
    }
    
    // Real-time recommendations
    if (activity.activity_type === 'view' || activity.activity_type === 'search') {
      await this.updateRecommendations(activity, user);
    }
    
    // Fraud detection for high-value activities
    if (activity.activity_type === 'purchase') {
      await this.analyzeFraudRisk(activity, user, change.session_data?.[0]);
    }
    
    // Live dashboard updates
    this.eventBus.emit('user_activity', {
      type: 'new_activity',
      activity: activity,
      user: user,
      score: change.activityScore
    });
  }

  async setupOrderProcessingStream() {
    // Real-time order processing and fulfillment
    return await this.csm.createChangeStream({
      streamId: 'order_processing',
      collection: 'orders',
      operationTypes: ['insert', 'update'],
      
      filters: [
        {
          $or: [
            { operationType: 'insert' },
            { 'updateDescription.updatedFields.status': { $exists: true } }
          ]
        }
      ],
      
      enrichments: [
        {
          from: 'customers',
          localField: 'fullDocument.customer_id',
          foreignField: '_id',
          as: 'customer_data'
        },
        {
          from: 'inventory',
          localField: 'fullDocument.items.product_id',
          foreignField: '_id',
          as: 'inventory_data'
        }
      ],
      
      computedFields: {
        orderValue: '$fullDocument.total_amount',
        orderPriority: {
          $switch: {
            branches: [
              { case: { $gt: ['$fullDocument.total_amount', 1000] }, then: 'high' },
              { case: { $gt: ['$fullDocument.total_amount', 500] }, then: 'medium' }
            ],
            default: 'normal'
          }
        },
        customerTier: { $arrayElemAt: ['$customer_data.tier', 0] }
      },
      
      eventHandlers: {
        insert: async (change, context) => {
          await this.handleNewOrder(change);
        },
        update: async (change, context) => {
          await this.handleOrderStatusChange(change);
        }
      }
    });
  }

  async handleNewOrder(change) {
    const order = change.fullDocument;
    const customer = change.customer_data?.[0];
    
    console.log(`New order received:`, {
      orderId: order._id,
      customerId: order.customer_id,
      customerTier: change.customerTier,
      orderValue: change.orderValue,
      priority: change.orderPriority
    });

    // Inventory allocation
    await this.allocateInventory(order, change.inventory_data);
    
    // Payment processing
    if (order.payment_method) {
      await this.processPayment(order, customer);
    }
    
    // Shipping calculation
    await this.calculateShipping(order, customer);
    
    // Notification systems
    await this.sendOrderConfirmation(order, customer);
    
    // Analytics and reporting
    this.eventBus.emit('new_order', {
      order: order,
      customer: customer,
      priority: change.orderPriority,
      value: change.orderValue
    });
  }

  async handleOrderStatusChange(change) {
    const updatedFields = change.updateDescription.updatedFields;
    const order = change.fullDocument;
    
    if (updatedFields.status) {
      console.log(`Order status changed: ${order._id} -> ${updatedFields.status}`);
      
      switch (updatedFields.status) {
        case 'confirmed':
          await this.handleOrderConfirmation(order);
          break;
        case 'shipped':
          await this.handleOrderShipment(order);
          break;
        case 'delivered':
          await this.handleOrderDelivery(order);
          break;
        case 'cancelled':
          await this.handleOrderCancellation(order);
          break;
      }
      
      // Customer notifications
      await this.sendStatusUpdateNotification(order, updatedFields.status);
    }
  }

  async setupInventoryManagementStream() {
    // Real-time inventory tracking and alerts
    return await this.csm.createChangeStream({
      streamId: 'inventory_management',
      collection: 'inventory',
      operationTypes: ['update'],
      
      filters: [
        {
          $or: [
            { 'updateDescription.updatedFields.quantity': { $exists: true } },
            { 'updateDescription.updatedFields.reserved_quantity': { $exists: true } },
            { 'updateDescription.updatedFields.available_quantity': { $exists: true } }
          ]
        }
      ],
      
      enrichments: [
        {
          from: 'products',
          localField: 'documentKey._id',
          foreignField: 'inventory_id',
          as: 'product_data'
        }
      ],
      
      computedFields: {
        stockLevel: '$fullDocument.available_quantity',
        reorderThreshold: '$fullDocument.reorder_level',
        stockStatus: {
          $cond: {
            if: { $lte: ['$fullDocument.available_quantity', '$fullDocument.reorder_level'] },
            then: 'low_stock',
            else: 'in_stock'
          }
        }
      },
      
      eventHandlers: {
        update: async (change, context) => {
          await this.handleInventoryChange(change);
        }
      }
    });
  }

  async handleInventoryChange(change) {
    const inventory = change.fullDocument;
    const updatedFields = change.updateDescription.updatedFields;
    const product = change.product_data?.[0];
    
    console.log(`Inventory updated:`, {
      productId: product?._id,
      productName: product?.name,
      previousQuantity: updatedFields.quantity,
      currentQuantity: inventory.available_quantity,
      stockStatus: change.stockStatus
    });

    // Low stock alerts
    if (change.stockStatus === 'low_stock') {
      await this.triggerLowStockAlert(inventory, product);
    }
    
    // Out of stock handling
    if (inventory.available_quantity <= 0) {
      await this.handleOutOfStock(inventory, product);
    }
    
    // Automatic reordering
    if (inventory.auto_reorder && inventory.available_quantity <= inventory.reorder_level) {
      await this.triggerAutomaticReorder(inventory, product);
    }
    
    // Live inventory dashboard
    this.eventBus.emit('inventory_change', {
      inventory: inventory,
      product: product,
      stockStatus: change.stockStatus,
      quantityChange: updatedFields.quantity ? 
        inventory.available_quantity - updatedFields.quantity : 0
    });
  }

  async setupMultiCollectionStream() {
    // Monitor changes across multiple collections
    return await this.csm.createChangeStream({
      streamId: 'multi_collection_monitor',
      operationTypes: ['insert', 'update', 'delete'],
      
      filters: [
        {
          'ns.coll': { 
            $in: ['users', 'orders', 'products', 'reviews'] 
          }
        }
      ],
      
      computedFields: {
        collectionType: '$ns.coll',
        businessImpact: {
          $switch: {
            branches: [
              { case: { $eq: ['$ns.coll', 'orders'] }, then: 'high' },
              { case: { $eq: ['$ns.coll', 'users'] }, then: 'medium' },
              { case: { $eq: ['$ns.coll', 'products'] }, then: 'medium' },
              { case: { $eq: ['$ns.coll', 'reviews'] }, then: 'low' }
            ],
            default: 'unknown'
          }
        }
      },
      
      eventHandlers: {
        insert: async (change, context) => {
          await this.handleMultiCollectionInsert(change);
        },
        update: async (change, context) => {
          await this.handleMultiCollectionUpdate(change);
        },
        delete: async (change, context) => {
          await this.handleMultiCollectionDelete(change);
        }
      }
    });
  }

  async handleMultiCollectionInsert(change) {
    const collection = change.ns.coll;
    
    switch (collection) {
      case 'users':
        await this.handleNewUser(change.fullDocument);
        break;
      case 'orders':
        await this.handleNewOrder(change);
        break;
      case 'products':
        await this.handleNewProduct(change.fullDocument);
        break;
      case 'reviews':
        await this.handleNewReview(change.fullDocument);
        break;
    }
    
    // Cross-collection analytics
    await this.updateCrossCollectionMetrics(collection, 'insert');
  }

  async setupAggregationUpdateStream() {
    // Monitor changes that require aggregation updates
    return await this.csm.createChangeStream({
      streamId: 'aggregation_updates',
      operationTypes: ['insert', 'update', 'delete'],
      
      filters: [
        {
          $or: [
            // Order changes affecting customer metrics
            { 
              $and: [
                { 'ns.coll': 'orders' },
                { 'fullDocument.status': 'completed' }
              ]
            },
            // Review changes affecting product ratings
            { 'ns.coll': 'reviews' },
            // Activity changes affecting user engagement
            { 
              $and: [
                { 'ns.coll': 'user_activities' },
                { 'fullDocument.activity_type': { $in: ['purchase', 'view', 'like'] } }
              ]
            }
          ]
        }
      ],
      
      eventHandlers: {
        default: async (change, context) => {
          await this.handleAggregationUpdate(change);
        }
      }
    });
  }

  async handleAggregationUpdate(change) {
    const collection = change.ns.coll;
    const document = change.fullDocument;
    
    switch (collection) {
      case 'orders':
        if (document.status === 'completed') {
          await this.updateCustomerMetrics(document.customer_id);
          await this.updateProductSalesMetrics(document.items);
        }
        break;
        
      case 'reviews':
        await this.updateProductRatings(document.product_id);
        break;
        
      case 'user_activities':
        await this.updateUserEngagementMetrics(document.user_id);
        break;
    }
  }

  // Analytics and Metrics Updates
  async updateUserEngagement(activity, user) {
    // Update real-time user engagement metrics
    const engagementUpdate = {
      $inc: {
        'metrics.total_activities': 1,
        [`metrics.activity_counts.${activity.activity_type}`]: 1
      },
      $set: {
        'metrics.last_activity': activity.created_at,
        'metrics.updated_at': new Date()
      }
    };
    
    await this.csm.db.collection('user_engagement').updateOne(
      { user_id: activity.user_id },
      engagementUpdate,
      { upsert: true }
    );
  }

  async updateCustomerMetrics(customerId) {
    // Recalculate customer lifetime value and order metrics
    const pipeline = [
      { $match: { customer_id: customerId, status: 'completed' } },
      {
        $group: {
          _id: '$customer_id',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$total_amount' },
          avgOrderValue: { $avg: '$total_amount' },
          lastOrderDate: { $max: '$created_at' },
          firstOrderDate: { $min: '$created_at' }
        }
      }
    ];
    
    const result = await this.csm.db.collection('orders').aggregate(pipeline).toArray();
    
    if (result.length > 0) {
      const metrics = result[0];
      await this.csm.db.collection('customer_metrics').updateOne(
        { customer_id: customerId },
        {
          $set: {
            ...metrics,
            updated_at: new Date()
          }
        },
        { upsert: true }
      );
    }
  }

  // Event Bus Integration
  setupEventBusHandlers() {
    this.eventBus.on('user_activity', (data) => {
      // Emit to external systems (WebSocket, message queue, etc.)
      this.emitToExternalSystems('user_activity', data);
    });
    
    this.eventBus.on('new_order', (data) => {
      this.emitToExternalSystems('new_order', data);
    });
    
    this.eventBus.on('inventory_change', (data) => {
      this.emitToExternalSystems('inventory_change', data);
    });
  }

  async emitToExternalSystems(eventType, data) {
    // WebSocket broadcasting
    if (this.wsServer) {
      this.wsServer.broadcast(JSON.stringify({
        type: eventType,
        data: data,
        timestamp: new Date()
      }));
    }
    
    // Message queue publishing
    if (this.messageQueue) {
      await this.messageQueue.publish(eventType, data);
    }
    
    // Webhook notifications
    if (this.webhookHandler) {
      await this.webhookHandler.notify(eventType, data);
    }
  }

  async shutdown() {
    console.log('Shutting down real-time event patterns...');
    this.eventBus.removeAllListeners();
    await this.csm.shutdown();
  }
}
```

## SQL-Style Change Stream Operations with QueryLeaf

QueryLeaf provides familiar SQL approaches to MongoDB Change Stream configuration and monitoring:

```sql
-- QueryLeaf change stream operations with SQL-familiar syntax

-- Create change stream with advanced filtering
CREATE CHANGE_STREAM user_activities_stream ON user_activities
WITH (
  operations = ARRAY['insert', 'update'],
  resume_token_storage = 'mongodb',
  batch_size = 100,
  max_await_time_ms = 1000
)
FILTER (
  activity_type IN ('login', 'purchase', 'view', 'search') AND
  user_id IS NOT NULL AND
  created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
)
ENRICH WITH (
  users ON user_activities.user_id = users._id AS user_data,
  user_sessions ON user_activities.session_id = user_sessions._id AS session_data
)
COMPUTE (
  activity_score = CASE 
    WHEN activity_type = 'purchase' THEN 100
    WHEN activity_type = 'login' THEN 10
    WHEN activity_type = 'search' THEN 5
    WHEN activity_type = 'view' THEN 1
    ELSE 0
  END,
  user_segment = user_data.segment,
  session_duration = session_data.duration
);

-- Monitor change stream with real-time processing
SELECT 
  change_id,
  operation_type,
  collection_name,
  document_key,
  cluster_time,
  
  -- Document data
  full_document,
  update_description,
  
  -- Computed fields from stream
  activity_score,
  user_segment,
  session_duration,
  
  -- Change categorization
  CASE 
    WHEN operation_type = 'insert' THEN 'new_activity'
    WHEN operation_type = 'update' AND update_description.updated_fields ? 'status' THEN 'status_change'
    WHEN operation_type = 'update' THEN 'activity_updated'
    ELSE 'other'
  END as change_category,
  
  -- Priority assessment
  CASE
    WHEN activity_score >= 50 THEN 'high'
    WHEN activity_score >= 10 THEN 'medium'
    ELSE 'low'
  END as priority_level,
  
  processed_at
  
FROM CHANGE_STREAM('user_activities_stream')
WHERE activity_score > 0
ORDER BY activity_score DESC, cluster_time ASC;

-- Multi-collection change stream monitoring
CREATE CHANGE_STREAM business_events_stream
WITH (
  operations = ARRAY['insert', 'update', 'delete'],
  full_document = 'updateLookup',
  full_document_before_change = 'whenAvailable'
)
FILTER (
  collection_name IN ('orders', 'users', 'products', 'inventory') AND
  (
    -- High-impact order changes
    (collection_name = 'orders' AND operation_type IN ('insert', 'update')) OR
    -- User registration and profile updates
    (collection_name = 'users' AND (operation_type = 'insert' OR update_description.updated_fields ? 'subscription_type')) OR
    -- Product catalog changes
    (collection_name = 'products' AND update_description.updated_fields ? 'price') OR
    -- Inventory level changes
    (collection_name = 'inventory' AND update_description.updated_fields ? 'available_quantity')
  )
);

-- Real-time analytics from change streams
WITH change_stream_analytics AS (
  SELECT 
    collection_name,
    operation_type,
    DATE_TRUNC('minute', cluster_time) as time_bucket,
    
    -- Event counts
    COUNT(*) as event_count,
    COUNT(*) FILTER (WHERE operation_type = 'insert') as inserts,
    COUNT(*) FILTER (WHERE operation_type = 'update') as updates,
    COUNT(*) FILTER (WHERE operation_type = 'delete') as deletes,
    
    -- Business metrics
    CASE collection_name
      WHEN 'orders' THEN 
        SUM(CASE WHEN operation_type = 'insert' THEN (full_document->>'total_amount')::numeric ELSE 0 END)
      ELSE 0
    END as revenue_impact,
    
    CASE collection_name
      WHEN 'inventory' THEN
        SUM(CASE 
          WHEN update_description.updated_fields ? 'available_quantity' 
          THEN (full_document->>'available_quantity')::int - (update_description.updated_fields->>'available_quantity')::int
          ELSE 0
        END)
      ELSE 0  
    END as inventory_change,
    
    -- Processing performance
    AVG(EXTRACT(EPOCH FROM (processed_at - cluster_time))) as avg_processing_latency_seconds,
    MAX(EXTRACT(EPOCH FROM (processed_at - cluster_time))) as max_processing_latency_seconds
    
  FROM CHANGE_STREAM('business_events_stream')
  WHERE cluster_time >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  GROUP BY collection_name, operation_type, DATE_TRUNC('minute', cluster_time)
),

real_time_dashboard AS (
  SELECT 
    time_bucket,
    
    -- Overall activity metrics
    SUM(event_count) as total_events,
    SUM(inserts) as total_inserts,
    SUM(updates) as total_updates,
    SUM(deletes) as total_deletes,
    
    -- Business KPIs
    SUM(revenue_impact) as minute_revenue,
    SUM(inventory_change) as net_inventory_change,
    
    -- Performance metrics
    AVG(avg_processing_latency_seconds) as avg_latency,
    MAX(max_processing_latency_seconds) as max_latency,
    
    -- Collection breakdown
    json_object_agg(
      collection_name,
      json_build_object(
        'events', event_count,
        'inserts', inserts,
        'updates', updates,
        'deletes', deletes
      )
    ) as collection_breakdown,
    
    -- Alerts and anomalies
    CASE 
      WHEN SUM(event_count) > 1000 THEN 'high_volume'
      WHEN AVG(avg_processing_latency_seconds) > 5 THEN 'high_latency'
      WHEN SUM(revenue_impact) < 0 THEN 'revenue_concern'
      ELSE 'normal'
    END as alert_status
    
  FROM change_stream_analytics
  GROUP BY time_bucket
)

SELECT 
  time_bucket,
  total_events,
  total_inserts,
  total_updates,
  total_deletes,
  ROUND(minute_revenue, 2) as revenue_per_minute,
  net_inventory_change,
  ROUND(avg_latency, 3) as avg_processing_seconds,
  ROUND(max_latency, 3) as max_processing_seconds,
  collection_breakdown,
  alert_status,
  
  -- Trend indicators
  LAG(total_events, 1) OVER (ORDER BY time_bucket) as prev_minute_events,
  ROUND(
    (total_events - LAG(total_events, 1) OVER (ORDER BY time_bucket))::numeric / 
    NULLIF(LAG(total_events, 1) OVER (ORDER BY time_bucket), 0) * 100,
    1
  ) as event_growth_pct,
  
  ROUND(
    (minute_revenue - LAG(minute_revenue, 1) OVER (ORDER BY time_bucket))::numeric / 
    NULLIF(LAG(minute_revenue, 1) OVER (ORDER BY time_bucket), 0) * 100,
    1
  ) as revenue_growth_pct

FROM real_time_dashboard
ORDER BY time_bucket DESC
LIMIT 60; -- Last hour of minute-by-minute data

-- Change stream error handling and monitoring
SELECT 
  stream_name,
  stream_status,
  created_at,
  last_event_at,
  event_count,
  error_count,
  retry_count,
  
  -- Health assessment
  CASE 
    WHEN error_count::float / NULLIF(event_count, 0) > 0.1 THEN 'UNHEALTHY'
    WHEN error_count::float / NULLIF(event_count, 0) > 0.05 THEN 'WARNING'  
    WHEN last_event_at < CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN 'INACTIVE'
    ELSE 'HEALTHY'
  END as health_status,
  
  -- Performance metrics
  ROUND(error_count::numeric / NULLIF(event_count, 0) * 100, 2) as error_rate_pct,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_event_at)) / 60 as minutes_since_last_event,
  
  -- Resume token status
  CASE 
    WHEN resume_token IS NOT NULL THEN 'RESUMABLE'
    ELSE 'NOT_RESUMABLE'
  END as resume_status,
  
  -- Recommendations
  CASE 
    WHEN error_count::float / NULLIF(event_count, 0) > 0.1 THEN 'Investigate error patterns and processing logic'
    WHEN retry_count > 5 THEN 'Check connection stability and resource limits'
    WHEN last_event_at < CURRENT_TIMESTAMP - INTERVAL '2 hours' THEN 'Verify data source and stream configuration'
    ELSE 'Stream operating normally'
  END as recommendation

FROM CHANGE_STREAM_STATUS()
ORDER BY 
  CASE health_status
    WHEN 'UNHEALTHY' THEN 1
    WHEN 'WARNING' THEN 2
    WHEN 'INACTIVE' THEN 3
    ELSE 4
  END,
  error_rate_pct DESC NULLS LAST;

-- Event-driven workflow triggers
CREATE TRIGGER real_time_order_processing
ON CHANGE_STREAM('business_events_stream')
WHEN (
  collection_name = 'orders' AND 
  operation_type = 'insert' AND
  full_document->>'status' = 'pending'
)
EXECUTE PROCEDURE (
  -- Inventory allocation
  UPDATE inventory 
  SET reserved_quantity = reserved_quantity + (
    SELECT SUM((item->>'quantity')::int)
    FROM json_array_elements(NEW.full_document->'items') AS item
    WHERE inventory.product_id = (item->>'product_id')::uuid
  ),
  available_quantity = available_quantity - (
    SELECT SUM((item->>'quantity')::int) 
    FROM json_array_elements(NEW.full_document->'items') AS item
    WHERE inventory.product_id = (item->>'product_id')::uuid
  )
  WHERE product_id IN (
    SELECT DISTINCT (item->>'product_id')::uuid
    FROM json_array_elements(NEW.full_document->'items') AS item
  );
  
  -- Payment processing trigger
  INSERT INTO payment_processing_queue (
    order_id,
    customer_id,
    amount,
    payment_method,
    priority,
    created_at
  )
  VALUES (
    (NEW.full_document->>'_id')::uuid,
    (NEW.full_document->>'customer_id')::uuid,
    (NEW.full_document->>'total_amount')::numeric,
    NEW.full_document->>'payment_method',
    CASE 
      WHEN (NEW.full_document->>'total_amount')::numeric > 1000 THEN 'high'
      ELSE 'normal'
    END,
    CURRENT_TIMESTAMP
  );
  
  -- Customer notification
  INSERT INTO notification_queue (
    recipient_id,
    notification_type,
    channel,
    message_data,
    created_at
  )
  VALUES (
    (NEW.full_document->>'customer_id')::uuid,
    'order_confirmation',
    'email',
    json_build_object(
      'order_id', NEW.full_document->>'_id',
      'order_total', NEW.full_document->>'total_amount',
      'items_count', json_array_length(NEW.full_document->'items')
    ),
    CURRENT_TIMESTAMP
  );
);

-- Change stream performance optimization
WITH stream_performance AS (
  SELECT 
    stream_name,
    AVG(processing_time_ms) as avg_processing_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95_processing_time,
    MAX(processing_time_ms) as max_processing_time,
    COUNT(*) as total_events,
    SUM(CASE WHEN processing_time_ms > 1000 THEN 1 ELSE 0 END) as slow_events,
    AVG(batch_size) as avg_batch_size
  FROM CHANGE_STREAM_METRICS()
  WHERE recorded_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  GROUP BY stream_name
)
SELECT 
  stream_name,
  ROUND(avg_processing_time, 2) as avg_processing_ms,
  ROUND(p95_processing_time, 2) as p95_processing_ms,
  max_processing_time as max_processing_ms,
  total_events,
  ROUND((slow_events::numeric / total_events) * 100, 2) as slow_event_pct,
  ROUND(avg_batch_size, 1) as avg_batch_size,
  
  -- Performance assessment
  CASE 
    WHEN avg_processing_time > 2000 THEN 'SLOW'
    WHEN slow_events::numeric / total_events > 0.1 THEN 'INCONSISTENT'  
    WHEN avg_batch_size < 10 THEN 'UNDERUTILIZED'
    ELSE 'OPTIMAL'
  END as performance_status,
  
  -- Optimization recommendations
  CASE
    WHEN avg_processing_time > 2000 THEN 'Optimize event processing logic and reduce complexity'
    WHEN slow_events::numeric / total_events > 0.1 THEN 'Investigate processing bottlenecks and resource constraints'
    WHEN avg_batch_size < 10 THEN 'Increase batch size for better throughput'
    WHEN p95_processing_time > 5000 THEN 'Add error handling and timeout management'
    ELSE 'Performance is within acceptable limits'
  END as optimization_recommendation

FROM stream_performance
ORDER BY avg_processing_time DESC;

-- QueryLeaf provides comprehensive change stream capabilities:
-- 1. SQL-familiar change stream creation and configuration
-- 2. Advanced filtering with complex business logic
-- 3. Real-time enrichment with related collection data
-- 4. Computed fields for event categorization and scoring
-- 5. Multi-collection monitoring with unified interface
-- 6. Real-time analytics and dashboard integration
-- 7. Event-driven workflow automation and triggers
-- 8. Performance monitoring and optimization recommendations
-- 9. Error handling and automatic retry mechanisms
-- 10. Resume capability for fault-tolerant processing
```

## Best Practices for Change Stream Implementation

### Design Guidelines

Essential practices for optimal change stream configuration:

1. **Strategic Filtering**: Design filters to process only relevant changes and minimize resource usage
2. **Resume Strategy**: Implement robust resume token storage for fault-tolerant processing
3. **Error Handling**: Build comprehensive error handling with retry strategies and dead letter queues
4. **Performance Monitoring**: Track processing latency, throughput, and error rates continuously
5. **Resource Management**: Size change stream configurations based on expected data volumes
6. **Event Ordering**: Understand and leverage MongoDB's ordering guarantees within and across collections

### Scalability and Performance

Optimize change streams for high-throughput, low-latency processing:

1. **Batch Processing**: Configure appropriate batch sizes for optimal throughput
2. **Parallel Processing**: Distribute change processing across multiple consumers when possible
3. **Resource Allocation**: Ensure adequate compute and network resources for real-time processing
4. **Connection Management**: Use connection pooling and proper resource cleanup
5. **Monitoring Integration**: Integrate with observability tools for production monitoring
6. **Load Testing**: Test change stream performance under expected and peak loads

## Conclusion

MongoDB Change Streams provide enterprise-grade real-time data processing capabilities that eliminate the complexity and overhead of polling-based change detection while delivering immediate, ordered, and resumable event notifications. The integration of sophisticated filtering, enrichment, and processing capabilities makes building reactive applications and event-driven architectures both powerful and maintainable.

Key Change Streams benefits include:

- **Real-Time Processing**: Sub-second latency for immediate response to data changes
- **Complete Change Context**: Full document state and change details for comprehensive processing
- **Fault Tolerance**: Automatic resume capability and robust error handling mechanisms
- **Scalable Architecture**: Support for high-throughput processing across sharded clusters
- **Developer Experience**: Intuitive API with powerful aggregation pipeline integration
- **Production Ready**: Built-in monitoring, authentication, and operational capabilities

Whether you're building live dashboards, automated workflows, real-time analytics, or event-driven microservices, MongoDB Change Streams with QueryLeaf's familiar SQL interface provides the foundation for reactive data processing. This combination enables you to implement sophisticated real-time capabilities while preserving familiar development patterns and operational approaches.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Change Stream operations while providing SQL-familiar change detection, event filtering, and real-time processing syntax. Advanced stream configuration, error handling, and performance optimization are seamlessly handled through familiar SQL patterns, making real-time data processing both powerful and accessible.

The integration of native change stream capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both real-time responsiveness and familiar database interaction patterns, ensuring your event-driven architecture remains both effective and maintainable as it scales and evolves.