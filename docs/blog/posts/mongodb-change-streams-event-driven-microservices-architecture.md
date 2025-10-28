---
title: "MongoDB Change Streams for Event-Driven Microservices: Advanced Real-Time Data Synchronization and Distributed System Architecture"
description: "Master MongoDB Change Streams for building robust event-driven microservices architectures. Learn advanced real-time synchronization patterns, distributed system design, and SQL-familiar event processing for scalable microservices."
date: 2025-10-27
tags: [mongodb, change-streams, microservices, event-driven, real-time, distributed-systems, architecture, sql]
---

# MongoDB Change Streams for Event-Driven Microservices: Advanced Real-Time Data Synchronization and Distributed System Architecture

Modern distributed systems require sophisticated event-driven architectures that can handle real-time data synchronization across multiple microservices while maintaining data consistency, service decoupling, and system resilience. Traditional approaches to inter-service communication often rely on polling mechanisms, message queues with complex configuration, or tightly coupled API calls that create bottlenecks, increase latency, and reduce system reliability under high load conditions.

MongoDB Change Streams provide comprehensive real-time event processing capabilities that enable microservices to react immediately to data changes through native database-level event streaming, advanced filtering mechanisms, and automatic resume token management. Unlike traditional message queue systems that require separate infrastructure and complex message routing logic, MongoDB Change Streams integrate event processing directly with the database layer, providing guaranteed event delivery, ordering semantics, and fault tolerance without additional middleware dependencies.

## The Traditional Microservices Communication Challenge

Conventional approaches to microservices event processing face significant limitations in reliability and performance:

```sql
-- Traditional PostgreSQL event processing - complex and unreliable approaches

-- Basic event log table (limited capabilities)
CREATE TABLE service_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    
    -- Event data (limited structure)
    event_data JSONB NOT NULL,
    event_metadata JSONB,
    
    -- Processing tracking (manual management)
    event_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processing_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    processed_by VARCHAR(100),
    processed_at TIMESTAMP,
    
    -- Retry management (basic implementation)
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP,
    
    -- Ordering and partitioning
    sequence_number BIGINT,
    partition_key VARCHAR(100),
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event subscriptions table (manual subscription management)
CREATE TABLE event_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    
    -- Subscription configuration
    filter_conditions JSONB, -- Basic filtering capabilities
    delivery_endpoint VARCHAR(500) NOT NULL,
    delivery_method VARCHAR(50) DEFAULT 'webhook', -- webhook, queue, database
    
    -- Processing configuration
    batch_size INTEGER DEFAULT 1,
    max_delivery_attempts INTEGER DEFAULT 3,
    delivery_timeout_seconds INTEGER DEFAULT 30,
    
    -- Subscription status
    subscription_status VARCHAR(50) DEFAULT 'active', -- active, paused, disabled
    last_processed_event_id UUID,
    last_processing_error TEXT,
    
    -- Subscription metadata
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event processing queue (complex state management)
CREATE TABLE event_processing_queue (
    queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES event_subscriptions(subscription_id),
    event_id UUID NOT NULL REFERENCES service_events(event_id),
    
    -- Processing state
    queue_status VARCHAR(50) DEFAULT 'queued', -- queued, processing, completed, failed, dead_letter
    processing_attempts INTEGER DEFAULT 0,
    
    -- Timing information
    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_started_at TIMESTAMP,
    processing_completed_at TIMESTAMP,
    next_attempt_at TIMESTAMP,
    
    -- Error tracking
    last_error_message TEXT,
    last_error_details JSONB,
    
    -- Processing metadata
    processing_node VARCHAR(100),
    processing_duration_ms INTEGER,
    
    UNIQUE (subscription_id, event_id)
);

-- Complex stored procedure for event processing (error-prone and limited)
CREATE OR REPLACE FUNCTION process_pending_events()
RETURNS TABLE (
    events_processed INTEGER,
    events_failed INTEGER,
    processing_duration_seconds INTEGER
) AS $$
DECLARE
    event_record RECORD;
    subscription_record RECORD;
    processing_start TIMESTAMP := clock_timestamp();
    processed_count INTEGER := 0;
    failed_count INTEGER := 0;
    current_batch_size INTEGER;
    delivery_result BOOLEAN;
BEGIN
    
    -- Process events in batches for each active subscription
    FOR subscription_record IN 
        SELECT * FROM event_subscriptions 
        WHERE subscription_status = 'active'
        ORDER BY created_at
    LOOP
        current_batch_size := subscription_record.batch_size;
        
        -- Get pending events for this subscription
        FOR event_record IN
            WITH filtered_events AS (
                SELECT se.*, epq.queue_id, epq.processing_attempts
                FROM service_events se
                JOIN event_processing_queue epq ON se.event_id = epq.event_id
                WHERE epq.subscription_id = subscription_record.subscription_id
                  AND epq.queue_status = 'queued'
                  AND (epq.next_attempt_at IS NULL OR epq.next_attempt_at <= CURRENT_TIMESTAMP)
                ORDER BY se.event_timestamp, se.sequence_number
                LIMIT current_batch_size
            )
            SELECT * FROM filtered_events
        LOOP
            
            -- Update processing status
            UPDATE event_processing_queue 
            SET 
                queue_status = 'processing',
                processing_started_at = CURRENT_TIMESTAMP,
                processing_attempts = processing_attempts + 1,
                processing_node = 'sql_processor'
            WHERE queue_id = event_record.queue_id;
            
            BEGIN
                -- Apply subscription filters (limited filtering capability)
                IF subscription_record.filter_conditions IS NOT NULL THEN
                    IF NOT jsonb_path_exists(
                        event_record.event_data, 
                        subscription_record.filter_conditions::jsonpath
                    ) THEN
                        -- Skip this event
                        UPDATE event_processing_queue 
                        SET queue_status = 'completed',
                            processing_completed_at = CURRENT_TIMESTAMP
                        WHERE queue_id = event_record.queue_id;
                        CONTINUE;
                    END IF;
                END IF;
                
                -- Simulate event delivery (in real implementation, would make HTTP call)
                delivery_result := deliver_event_to_service(
                    subscription_record.delivery_endpoint,
                    event_record.event_data,
                    subscription_record.delivery_timeout_seconds
                );
                
                IF delivery_result THEN
                    -- Mark as completed
                    UPDATE event_processing_queue 
                    SET 
                        queue_status = 'completed',
                        processing_completed_at = CURRENT_TIMESTAMP,
                        processing_duration_ms = EXTRACT(
                            MILLISECONDS FROM CURRENT_TIMESTAMP - processing_started_at
                        )::INTEGER
                    WHERE queue_id = event_record.queue_id;
                    
                    processed_count := processed_count + 1;
                    
                ELSE
                    RAISE EXCEPTION 'Event delivery failed';
                END IF;
                
            EXCEPTION WHEN OTHERS THEN
                failed_count := failed_count + 1;
                
                -- Handle retry logic
                IF event_record.processing_attempts < subscription_record.max_delivery_attempts THEN
                    -- Schedule retry with exponential backoff
                    UPDATE event_processing_queue 
                    SET 
                        queue_status = 'queued',
                        next_attempt_at = CURRENT_TIMESTAMP + 
                            (INTERVAL '1 minute' * POWER(2, event_record.processing_attempts)),
                        last_error_message = SQLERRM,
                        last_error_details = jsonb_build_object(
                            'error_code', SQLSTATE,
                            'error_message', SQLERRM,
                            'processing_attempt', event_record.processing_attempts + 1,
                            'timestamp', CURRENT_TIMESTAMP
                        )
                    WHERE queue_id = event_record.queue_id;
                ELSE
                    -- Move to dead letter queue
                    UPDATE event_processing_queue 
                    SET 
                        queue_status = 'dead_letter',
                        last_error_message = SQLERRM,
                        processing_completed_at = CURRENT_TIMESTAMP
                    WHERE queue_id = event_record.queue_id;
                END IF;
            END;
        END LOOP;
        
        -- Update subscription's last processed event
        UPDATE event_subscriptions 
        SET 
            last_processed_event_id = (
                SELECT event_id FROM event_processing_queue 
                WHERE subscription_id = subscription_record.subscription_id 
                  AND queue_status = 'completed'
                ORDER BY processing_completed_at DESC 
                LIMIT 1
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE subscription_id = subscription_record.subscription_id;
        
    END LOOP;
    
    RETURN QUERY SELECT 
        processed_count,
        failed_count,
        EXTRACT(SECONDS FROM clock_timestamp() - processing_start)::INTEGER;
        
END;
$$ LANGUAGE plpgsql;

-- Manual trigger-based event creation (limited and unreliable)
CREATE OR REPLACE FUNCTION create_user_change_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create events for significant changes
    IF TG_OP = 'INSERT' OR 
       (TG_OP = 'UPDATE' AND (
           OLD.email != NEW.email OR 
           OLD.status != NEW.status OR
           OLD.user_type != NEW.user_type
       )) THEN
        
        INSERT INTO service_events (
            service_name,
            event_type,
            entity_id,
            entity_type,
            event_data,
            event_metadata,
            sequence_number,
            partition_key
        ) VALUES (
            'user_service',
            CASE TG_OP 
                WHEN 'INSERT' THEN 'user_created'
                WHEN 'UPDATE' THEN 'user_updated'
                WHEN 'DELETE' THEN 'user_deleted'
            END,
            COALESCE(NEW.user_id, OLD.user_id),
            'user',
            jsonb_build_object(
                'user_id', COALESCE(NEW.user_id, OLD.user_id),
                'email', COALESCE(NEW.email, OLD.email),
                'status', COALESCE(NEW.status, OLD.status),
                'user_type', COALESCE(NEW.user_type, OLD.user_type),
                'operation', TG_OP,
                'changed_fields', CASE 
                    WHEN TG_OP = 'INSERT' THEN jsonb_build_array('all')
                    WHEN TG_OP = 'UPDATE' THEN jsonb_build_array(
                        CASE WHEN OLD.email != NEW.email THEN 'email' END,
                        CASE WHEN OLD.status != NEW.status THEN 'status' END,
                        CASE WHEN OLD.user_type != NEW.user_type THEN 'user_type' END
                    )
                    ELSE jsonb_build_array('all')
                END
            ),
            jsonb_build_object(
                'source_table', TG_TABLE_NAME,
                'source_operation', TG_OP,
                'timestamp', CURRENT_TIMESTAMP,
                'transaction_id', txid_current()
            ),
            nextval('event_sequence'),
            COALESCE(NEW.user_id, OLD.user_id)::TEXT
        );
        
        -- Queue event for all matching subscriptions
        INSERT INTO event_processing_queue (subscription_id, event_id)
        SELECT 
            s.subscription_id,
            currval('service_events_event_id_seq')
        FROM event_subscriptions s
        WHERE s.subscription_status = 'active'
          AND s.event_type IN ('user_created', 'user_updated', 'user_deleted', '*')
          AND (s.entity_type IS NULL OR s.entity_type = 'user');
          
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Problems with traditional event processing approaches:
-- 1. Complex manual event creation and subscription management
-- 2. Limited filtering and routing capabilities
-- 3. No guaranteed event ordering or delivery semantics
-- 4. Manual retry logic and error handling implementation
-- 5. Expensive polling mechanisms for event consumption
-- 6. No built-in support for resume tokens or fault tolerance
-- 7. Complex state management across multiple tables
-- 8. Limited scalability and performance under high event volumes
-- 9. No native integration with database transactions
-- 10. Manual implementation of event sourcing and CQRS patterns
```

MongoDB Change Streams eliminate these limitations with native event processing:

```javascript
// MongoDB Change Streams - comprehensive event-driven microservices architecture
const { MongoClient } = require('mongodb');
const EventEmitter = require('events');

// Advanced microservices event processing system using MongoDB Change Streams
class MongoEventDrivenMicroservicesManager {
  constructor(connectionUri, options = {}) {
    this.client = new MongoClient(connectionUri);
    this.db = null;
    this.eventEmitter = new EventEmitter();
    this.activeStreams = new Map();
    this.subscriptions = new Map();
    
    // Configuration for event processing
    this.config = {
      // Change stream configuration
      changeStreamOptions: {
        fullDocument: 'updateLookup', // Include full document in updates
        fullDocumentBeforeChange: 'whenAvailable', // Include previous version
        maxAwaitTimeMS: 1000, // Reduce latency
        batchSize: 100 // Optimize batch processing
      },
      
      // Event processing configuration
      eventProcessing: {
        enableRetries: true,
        maxRetryAttempts: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
        deadLetterQueueEnabled: true,
        preserveEventOrder: true
      },
      
      // Subscription management
      subscriptionManagement: {
        autoReconnect: true,
        resumeTokenPersistence: true,
        subscriptionHealthCheck: true,
        metricsCollection: true
      },
      
      // Performance optimization
      performanceSettings: {
        concurrentStreamLimit: 10,
        eventBatchSize: 50,
        processingTimeout: 30000,
        memoryBufferSize: 1000
      }
    };
    
    // Event processing metrics
    this.metrics = {
      totalEventsProcessed: 0,
      totalEventsReceived: 0,
      totalSubscriptions: 0,
      activeStreams: 0,
      eventProcessingErrors: 0,
      averageProcessingTime: 0,
      lastEventTimestamp: null
    };
    
    // Resume token storage for fault tolerance
    this.resumeTokens = new Map();
    this.subscriptionHealthStatus = new Map();
  }

  async initialize(databaseName) {
    console.log('Initializing MongoDB Event-Driven Microservices Manager...');
    
    try {
      await this.client.connect();
      this.db = this.client.db(databaseName);
      
      // Setup system collections for event management
      await this.setupEventManagementCollections();
      
      // Load existing subscriptions and resume tokens
      await this.loadExistingSubscriptions();
      
      // Setup health monitoring
      if (this.config.subscriptionManagement.subscriptionHealthCheck) {
        this.startHealthMonitoring();
      }
      
      console.log('Event-driven microservices manager initialized successfully');
      
    } catch (error) {
      console.error('Error initializing event manager:', error);
      throw error;
    }
  }

  // Create comprehensive event subscription for microservices
  async createEventSubscription(subscriptionConfig) {
    console.log(`Creating event subscription: ${subscriptionConfig.subscriptionId}`);
    
    const subscription = {
      subscriptionId: subscriptionConfig.subscriptionId,
      serviceName: subscriptionConfig.serviceName,
      
      // Event filtering configuration
      collections: subscriptionConfig.collections || [], // Collections to watch
      eventTypes: subscriptionConfig.eventTypes || ['insert', 'update', 'delete'], // Operation types
      pipeline: subscriptionConfig.pipeline || [], // Advanced filtering pipeline
      
      // Event processing configuration
      eventHandler: subscriptionConfig.eventHandler, // Function to process events
      batchProcessing: subscriptionConfig.batchProcessing || false,
      batchSize: subscriptionConfig.batchSize || 1,
      preserveOrder: subscriptionConfig.preserveOrder !== false,
      
      // Error handling configuration
      errorHandler: subscriptionConfig.errorHandler,
      retryPolicy: {
        maxRetries: subscriptionConfig.maxRetries || this.config.eventProcessing.maxRetryAttempts,
        retryDelay: subscriptionConfig.retryDelay || this.config.eventProcessing.retryDelayMs,
        exponentialBackoff: subscriptionConfig.exponentialBackoff !== false
      },
      
      // Subscription metadata
      createdAt: new Date(),
      lastEventProcessed: null,
      resumeToken: null,
      isActive: false,
      
      // Performance tracking
      metrics: {
        eventsReceived: 0,
        eventsProcessed: 0,
        eventsSkipped: 0,
        processingErrors: 0,
        averageProcessingTime: 0,
        lastProcessingTime: null
      }
    };

    // Store subscription configuration
    await this.db.collection('event_subscriptions').replaceOne(
      { subscriptionId: subscription.subscriptionId },
      subscription,
      { upsert: true }
    );

    // Cache subscription
    this.subscriptions.set(subscription.subscriptionId, subscription);
    
    console.log(`Event subscription created: ${subscription.subscriptionId}`);
    return subscription.subscriptionId;
  }

  // Start change streams for active subscriptions
  async startEventStreaming(subscriptionId) {
    console.log(`Starting event streaming for subscription: ${subscriptionId}`);
    
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    // Build change stream pipeline based on subscription configuration
    const pipeline = this.buildChangeStreamPipeline(subscription);
    
    // Configure change stream options
    const changeStreamOptions = {
      ...this.config.changeStreamOptions,
      resumeAfter: subscription.resumeToken,
      startAtOperationTime: subscription.resumeToken ? undefined : new Date()
    };

    try {
      let changeStream;
      
      // Create change stream based on collection scope
      if (subscription.collections.length === 1) {
        // Single collection stream
        const collection = this.db.collection(subscription.collections[0]);
        changeStream = collection.watch(pipeline, changeStreamOptions);
      } else if (subscription.collections.length > 1) {
        // Multiple collections stream (requires database-level watch)
        changeStream = this.db.watch(pipeline, changeStreamOptions);
      } else {
        // Database-level stream for all collections
        changeStream = this.db.watch(pipeline, changeStreamOptions);
      }

      // Store active stream
      this.activeStreams.set(subscriptionId, changeStream);
      subscription.isActive = true;
      this.metrics.activeStreams++;

      // Setup event processing
      changeStream.on('change', async (changeEvent) => {
        await this.processChangeEvent(subscriptionId, changeEvent);
      });

      // Handle stream errors
      changeStream.on('error', async (error) => {
        console.error(`Change stream error for ${subscriptionId}:`, error);
        await this.handleStreamError(subscriptionId, error);
      });

      // Handle stream close
      changeStream.on('close', () => {
        console.log(`Change stream closed for ${subscriptionId}`);
        subscription.isActive = false;
        this.activeStreams.delete(subscriptionId);
        this.metrics.activeStreams--;
      });

      console.log(`Event streaming started for subscription: ${subscriptionId}`);
      return true;

    } catch (error) {
      console.error(`Error starting event streaming for ${subscriptionId}:`, error);
      subscription.isActive = false;
      throw error;
    }
  }

  // Process individual change events with comprehensive handling
  async processChangeEvent(subscriptionId, changeEvent) {
    const startTime = Date.now();
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription || !subscription.isActive) {
      return; // Skip if subscription is inactive
    }

    try {
      // Update resume token for fault tolerance
      subscription.resumeToken = changeEvent._id;
      this.resumeTokens.set(subscriptionId, changeEvent._id);
      
      // Apply subscription filtering
      if (!this.matchesSubscriptionCriteria(changeEvent, subscription)) {
        subscription.metrics.eventsSkipped++;
        return;
      }

      // Prepare enriched event data
      const enrichedEvent = await this.enrichChangeEvent(changeEvent, subscription);
      
      // Update metrics
      subscription.metrics.eventsReceived++;
      this.metrics.totalEventsReceived++;

      // Process event with retry logic
      await this.processEventWithRetries(subscription, enrichedEvent, 0);
      
      // Update processing metrics
      const processingTime = Date.now() - startTime;
      subscription.metrics.averageProcessingTime = 
        (subscription.metrics.averageProcessingTime + processingTime) / 2;
      subscription.metrics.lastProcessingTime = new Date();
      subscription.lastEventProcessed = new Date();
      
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime + processingTime) / 2;
      this.metrics.lastEventTimestamp = new Date();

      // Persist resume token periodically
      if (this.config.subscriptionManagement.resumeTokenPersistence) {
        await this.persistResumeToken(subscriptionId, changeEvent._id);
      }

    } catch (error) {
      console.error(`Error processing change event for ${subscriptionId}:`, error);
      subscription.metrics.processingErrors++;
      this.metrics.eventProcessingErrors++;
      
      // Handle error based on subscription configuration
      if (subscription.errorHandler) {
        try {
          await subscription.errorHandler(error, changeEvent, subscription);
        } catch (handlerError) {
          console.error('Error handler failed:', handlerError);
        }
      }
    }
  }

  // Advanced event processing with retry mechanisms
  async processEventWithRetries(subscription, enrichedEvent, attemptNumber) {
    try {
      // Execute event handler
      if (subscription.batchProcessing) {
        // Add to batch processing queue
        await this.addToBatchQueue(subscription.subscriptionId, enrichedEvent);
      } else {
        // Process event immediately
        await subscription.eventHandler(enrichedEvent, subscription);
      }
      
      // Mark as successfully processed
      subscription.metrics.eventsProcessed++;
      this.metrics.totalEventsProcessed++;
      
    } catch (error) {
      console.error(`Event processing error (attempt ${attemptNumber + 1}):`, error);
      
      if (attemptNumber < subscription.retryPolicy.maxRetries) {
        // Calculate retry delay with exponential backoff
        const delay = subscription.retryPolicy.exponentialBackoff
          ? subscription.retryPolicy.retryDelay * Math.pow(2, attemptNumber)
          : subscription.retryPolicy.retryDelay;
        
        console.log(`Retrying event processing in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.processEventWithRetries(subscription, enrichedEvent, attemptNumber + 1);
      } else {
        // Max retries reached, send to dead letter queue
        if (this.config.eventProcessing.deadLetterQueueEnabled) {
          await this.sendToDeadLetterQueue(subscription.subscriptionId, enrichedEvent, error);
        }
        throw error;
      }
    }
  }

  // Enrich change events with additional context and metadata
  async enrichChangeEvent(changeEvent, subscription) {
    const enrichedEvent = {
      // Original change event data
      ...changeEvent,
      
      // Event metadata
      eventMetadata: {
        subscriptionId: subscription.subscriptionId,
        serviceName: subscription.serviceName,
        processedAt: new Date(),
        eventId: this.generateEventId(),
        
        // Change event details
        operationType: changeEvent.operationType,
        collectionName: changeEvent.ns?.coll,
        databaseName: changeEvent.ns?.db,
        
        // Document information
        documentKey: changeEvent.documentKey,
        hasFullDocument: !!changeEvent.fullDocument,
        hasFullDocumentBeforeChange: !!changeEvent.fullDocumentBeforeChange,
        
        // Event context
        clusterTime: changeEvent.clusterTime,
        resumeToken: changeEvent._id,
        
        // Processing context
        processingTimestamp: Date.now(),
        correlationId: this.generateCorrelationId(changeEvent)
      },
      
      // Service-specific enrichment
      serviceContext: {
        serviceName: subscription.serviceName,
        subscriptionConfig: {
          preserveOrder: subscription.preserveOrder,
          batchProcessing: subscription.batchProcessing
        }
      }
    };

    // Add business context if available
    if (changeEvent.fullDocument) {
      enrichedEvent.businessContext = await this.extractBusinessContext(
        changeEvent.fullDocument, 
        changeEvent.ns?.coll
      );
    }

    return enrichedEvent;
  }

  // Build change stream pipeline based on subscription configuration
  buildChangeStreamPipeline(subscription) {
    const pipeline = [...subscription.pipeline];
    
    // Add operation type filtering
    if (subscription.eventTypes.length > 0 && 
        !subscription.eventTypes.includes('*')) {
      pipeline.push({
        $match: {
          operationType: { $in: subscription.eventTypes }
        }
      });
    }

    // Add collection filtering for database-level streams
    if (subscription.collections.length > 0 && subscription.collections.length > 1) {
      pipeline.push({
        $match: {
          'ns.coll': { $in: subscription.collections }
        }
      });
    }

    // Add service-specific filtering
    pipeline.push({
      $addFields: {
        processedBy: subscription.serviceName,
        subscriptionId: subscription.subscriptionId
      }
    });

    return pipeline;
  }

  // Check if change event matches subscription criteria
  matchesSubscriptionCriteria(changeEvent, subscription) {
    // Check operation type
    if (subscription.eventTypes.length > 0 && 
        !subscription.eventTypes.includes('*') &&
        !subscription.eventTypes.includes(changeEvent.operationType)) {
      return false;
    }

    // Check collection name
    if (subscription.collections.length > 0 &&
        !subscription.collections.includes(changeEvent.ns?.coll)) {
      return false;
    }

    return true;
  }

  // Batch processing queue management
  async addToBatchQueue(subscriptionId, enrichedEvent) {
    if (!this.batchQueues) {
      this.batchQueues = new Map();
    }

    if (!this.batchQueues.has(subscriptionId)) {
      this.batchQueues.set(subscriptionId, []);
    }

    const queue = this.batchQueues.get(subscriptionId);
    queue.push(enrichedEvent);

    const subscription = this.subscriptions.get(subscriptionId);
    if (queue.length >= subscription.batchSize) {
      await this.processBatch(subscriptionId);
    }
  }

  // Process batched events
  async processBatch(subscriptionId) {
    const queue = this.batchQueues.get(subscriptionId);
    if (!queue || queue.length === 0) {
      return;
    }

    const subscription = this.subscriptions.get(subscriptionId);
    const batch = queue.splice(0, subscription.batchSize);

    try {
      await subscription.eventHandler(batch, subscription);
      subscription.metrics.eventsProcessed += batch.length;
      this.metrics.totalEventsProcessed += batch.length;
    } catch (error) {
      console.error(`Batch processing error for ${subscriptionId}:`, error);
      // Handle batch processing errors
      for (const event of batch) {
        await this.sendToDeadLetterQueue(subscriptionId, event, error);
      }
    }
  }

  // Dead letter queue management
  async sendToDeadLetterQueue(subscriptionId, enrichedEvent, error) {
    try {
      await this.db.collection('dead_letter_events').insertOne({
        subscriptionId: subscriptionId,
        originalEvent: enrichedEvent,
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date()
        },
        createdAt: new Date(),
        status: 'failed',
        retryAttempts: 0
      });
      
      console.log(`Event sent to dead letter queue for subscription: ${subscriptionId}`);
    } catch (dlqError) {
      console.error('Error sending event to dead letter queue:', dlqError);
    }
  }

  // Comprehensive event analytics and monitoring
  async getEventAnalytics(timeRange = '24h') {
    console.log('Generating event processing analytics...');
    
    const timeRanges = {
      '1h': 1,
      '6h': 6,
      '24h': 24,
      '7d': 168,
      '30d': 720
    };
    
    const hours = timeRanges[timeRange] || 24;
    const startTime = new Date(Date.now() - (hours * 60 * 60 * 1000));

    try {
      // Get subscription performance metrics
      const subscriptionMetrics = await this.db.collection('event_subscriptions')
        .aggregate([
          {
            $project: {
              subscriptionId: 1,
              serviceName: 1,
              isActive: 1,
              'metrics.eventsReceived': 1,
              'metrics.eventsProcessed': 1,
              'metrics.eventsSkipped': 1,
              'metrics.processingErrors': 1,
              'metrics.averageProcessingTime': 1,
              lastEventProcessed: 1,
              createdAt: 1
            }
          }
        ]).toArray();

      // Get event volume trends
      const eventTrends = await this.db.collection('event_processing_log')
        .aggregate([
          {
            $match: {
              timestamp: { $gte: startTime }
            }
          },
          {
            $group: {
              _id: {
                hour: { $hour: '$timestamp' },
                serviceName: '$serviceName'
              },
              eventCount: { $sum: 1 },
              avgProcessingTime: { $avg: '$processingTime' }
            }
          },
          {
            $sort: { '_id.hour': 1 }
          }
        ]).toArray();

      // Get error analysis
      const errorAnalysis = await this.db.collection('dead_letter_events')
        .aggregate([
          {
            $match: {
              createdAt: { $gte: startTime }
            }
          },
          {
            $group: {
              _id: {
                subscriptionId: '$subscriptionId',
                errorType: '$error.message'
              },
              errorCount: { $sum: 1 },
              latestError: { $max: '$createdAt' }
            }
          }
        ]).toArray();

      return {
        reportGeneratedAt: new Date(),
        timeRange: timeRange,
        
        // Overall system metrics
        systemMetrics: {
          ...this.metrics,
          activeSubscriptions: this.subscriptions.size,
          totalSubscriptions: subscriptionMetrics.length
        },
        
        // Subscription performance
        subscriptionPerformance: subscriptionMetrics,
        
        // Event volume trends
        eventTrends: eventTrends,
        
        // Error analysis
        errorAnalysis: errorAnalysis,
        
        // Health indicators
        healthIndicators: {
          subscriptionsWithErrors: errorAnalysis.length,
          averageProcessingTime: this.metrics.averageProcessingTime,
          eventProcessingRate: this.metrics.totalEventsProcessed / hours,
          systemHealth: this.calculateSystemHealth()
        }
      };

    } catch (error) {
      console.error('Error generating event analytics:', error);
      throw error;
    }
  }

  // System health monitoring
  calculateSystemHealth() {
    const errorRate = this.metrics.eventProcessingErrors / this.metrics.totalEventsReceived;
    const processingEfficiency = this.metrics.totalEventsProcessed / this.metrics.totalEventsReceived;
    
    if (errorRate > 0.05) return 'Critical';
    if (errorRate > 0.01 || processingEfficiency < 0.95) return 'Warning';
    if (this.metrics.averageProcessingTime > 5000) return 'Degraded';
    return 'Healthy';
  }

  // Utility methods
  async setupEventManagementCollections() {
    // Create indexes for optimal performance
    await this.db.collection('event_subscriptions').createIndexes([
      { key: { subscriptionId: 1 }, unique: true },
      { key: { serviceName: 1 } },
      { key: { isActive: 1 } }
    ]);

    await this.db.collection('dead_letter_events').createIndexes([
      { key: { subscriptionId: 1, createdAt: -1 } },
      { key: { createdAt: 1 }, expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days TTL
    ]);
  }

  async loadExistingSubscriptions() {
    const subscriptions = await this.db.collection('event_subscriptions')
      .find({ isActive: true })
      .toArray();
    
    subscriptions.forEach(sub => {
      this.subscriptions.set(sub.subscriptionId, sub);
    });
  }

  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateCorrelationId(changeEvent) {
    return `corr_${changeEvent.ns?.coll}_${changeEvent.documentKey?._id}_${Date.now()}`;
  }

  async extractBusinessContext(document, collectionName) {
    // Extract relevant business context based on collection
    const context = {
      collectionName: collectionName,
      entityId: document._id,
      entityType: collectionName.replace(/s$/, '') // Simple singularization
    };

    // Add collection-specific context
    if (collectionName === 'users') {
      context.userEmail = document.email;
      context.userType = document.userType;
    } else if (collectionName === 'orders') {
      context.customerId = document.customerId;
      context.orderTotal = document.total;
    } else if (collectionName === 'products') {
      context.productCategory = document.category;
      context.productBrand = document.brand;
    }

    return context;
  }

  async persistResumeToken(subscriptionId, resumeToken) {
    await this.db.collection('event_subscriptions').updateOne(
      { subscriptionId: subscriptionId },
      { $set: { resumeToken: resumeToken, updatedAt: new Date() } }
    );
  }

  async handleStreamError(subscriptionId, error) {
    const subscription = this.subscriptions.get(subscriptionId);
    subscription.isActive = false;
    
    console.error(`Handling stream error for ${subscriptionId}:`, error);
    
    // Implement automatic reconnection logic
    if (this.config.subscriptionManagement.autoReconnect) {
      setTimeout(async () => {
        try {
          console.log(`Attempting to reconnect stream for ${subscriptionId}`);
          await this.startEventStreaming(subscriptionId);
        } catch (reconnectError) {
          console.error(`Failed to reconnect stream for ${subscriptionId}:`, reconnectError);
        }
      }, 5000); // Retry after 5 seconds
    }
  }

  startHealthMonitoring() {
    setInterval(async () => {
      try {
        for (const [subscriptionId, subscription] of this.subscriptions) {
          const isHealthy = subscription.isActive && 
            (Date.now() - (subscription.lastEventProcessed?.getTime() || Date.now())) < 300000; // 5 minutes
          
          this.subscriptionHealthStatus.set(subscriptionId, {
            isHealthy: isHealthy,
            lastCheck: new Date(),
            subscription: subscription
          });
        }
      } catch (error) {
        console.error('Health monitoring error:', error);
      }
    }, 60000); // Check every minute
  }

  // Graceful shutdown
  async shutdown() {
    console.log('Shutting down event-driven microservices manager...');
    
    // Close all active streams
    for (const [subscriptionId, stream] of this.activeStreams) {
      try {
        await stream.close();
        console.log(`Closed stream for subscription: ${subscriptionId}`);
      } catch (error) {
        console.error(`Error closing stream for ${subscriptionId}:`, error);
      }
    }
    
    // Close MongoDB connection
    await this.client.close();
    console.log('Event-driven microservices manager shutdown complete');
  }
}

// Example usage demonstrating comprehensive microservices event processing
async function demonstrateMicroservicesEventProcessing() {
  const client = new MongoClient('mongodb://localhost:27017');
  const eventManager = new MongoEventDrivenMicroservicesManager(client);
  
  try {
    await eventManager.initialize('microservices_platform');
    
    console.log('Setting up microservices event subscriptions...');
    
    // User service subscription for authentication events
    await eventManager.createEventSubscription({
      subscriptionId: 'user_auth_events',
      serviceName: 'authentication_service',
      collections: ['users'],
      eventTypes: ['insert', 'update'],
      pipeline: [
        {
          $match: {
            $or: [
              { operationType: 'insert' },
              { 
                operationType: 'update',
                'updateDescription.updatedFields.lastLogin': { $exists: true }
              }
            ]
          }
        }
      ],
      eventHandler: async (event, subscription) => {
        console.log(`Auth Service processing: ${event.operationType} for user ${event.documentKey._id}`);
        
        if (event.operationType === 'insert') {
          // Send welcome email
          console.log('Triggering welcome email workflow');
        } else if (event.operationType === 'update' && event.fullDocument.lastLogin) {
          // Log user activity
          console.log('Recording user login activity');
        }
      }
    });
    
    // Order service subscription for inventory management
    await eventManager.createEventSubscription({
      subscriptionId: 'inventory_management',
      serviceName: 'inventory_service',
      collections: ['orders'],
      eventTypes: ['insert', 'update'],
      batchProcessing: true,
      batchSize: 10,
      eventHandler: async (events, subscription) => {
        console.log(`Inventory Service processing batch of ${events.length} order events`);
        
        for (const event of events) {
          if (event.operationType === 'insert' && event.fullDocument.status === 'confirmed') {
            console.log(`Reducing inventory for order: ${event.documentKey._id}`);
            // Update inventory levels
          }
        }
      }
    });
    
    // Analytics service subscription for real-time metrics
    await eventManager.createEventSubscription({
      subscriptionId: 'realtime_analytics',
      serviceName: 'analytics_service',
      collections: ['orders', 'products', 'users'],
      eventTypes: ['insert', 'update', 'delete'],
      eventHandler: async (event, subscription) => {
        console.log(`Analytics Service processing: ${event.operationType} on ${event.ns.coll}`);
        
        // Update real-time dashboards
        if (event.ns.coll === 'orders' && event.operationType === 'insert') {
          console.log('Updating real-time sales metrics');
        }
      }
    });
    
    // Start event streaming for all subscriptions
    await eventManager.startEventStreaming('user_auth_events');
    await eventManager.startEventStreaming('inventory_management');
    await eventManager.startEventStreaming('realtime_analytics');
    
    console.log('All event streams started successfully');
    
    // Simulate some database changes to trigger events
    console.log('Simulating database changes...');
    
    // Insert a new user
    await eventManager.db.collection('users').insertOne({
      email: 'john.doe@example.com',
      name: 'John Doe',
      userType: 'premium',
      createdAt: new Date()
    });
    
    // Insert a new order
    await eventManager.db.collection('orders').insertOne({
      customerId: new ObjectId(),
      total: 299.99,
      status: 'confirmed',
      items: [
        { productId: new ObjectId(), quantity: 2, price: 149.99 }
      ],
      createdAt: new Date()
    });
    
    // Wait a bit for events to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get analytics report
    const analytics = await eventManager.getEventAnalytics('1h');
    console.log('Event Processing Analytics:', JSON.stringify(analytics, null, 2));
    
  } catch (error) {
    console.error('Microservices event processing demonstration error:', error);
  } finally {
    await eventManager.shutdown();
  }
}

// Export the event-driven microservices manager
module.exports = {
  MongoEventDrivenMicroservicesManager,
  demonstrateMicroservicesEventProcessing
};
```

## SQL-Style Event Processing with QueryLeaf

QueryLeaf provides familiar SQL approaches to MongoDB Change Streams and event-driven architectures:

```sql
-- QueryLeaf event-driven microservices with SQL-familiar syntax

-- Create event subscription with comprehensive configuration
CREATE EVENT_SUBSCRIPTION user_service_events AS (
  -- Subscription identification
  subscription_id = 'user_lifecycle_events',
  service_name = 'user_service',
  
  -- Event source configuration
  watch_collections = JSON_ARRAY('users', 'user_profiles', 'user_preferences'),
  event_types = JSON_ARRAY('insert', 'update', 'delete'),
  
  -- Advanced event filtering with SQL-style conditions
  event_filter = JSON_OBJECT(
    'operationType', JSON_OBJECT('$in', JSON_ARRAY('insert', 'update')),
    '$or', JSON_ARRAY(
      JSON_OBJECT('operationType', 'insert'),
      JSON_OBJECT(
        'operationType', 'update',
        'updateDescription.updatedFields', JSON_OBJECT(
          '$or', JSON_ARRAY(
            JSON_OBJECT('email', JSON_OBJECT('$exists', true)),
            JSON_OBJECT('status', JSON_OBJECT('$exists', true)),
            JSON_OBJECT('subscription_tier', JSON_OBJECT('$exists', true))
          )
        )
      )
    )
  ),
  
  -- Event processing configuration
  batch_processing = false,
  preserve_order = true,
  full_document = 'updateLookup',
  full_document_before_change = 'whenAvailable',
  
  -- Error handling and retry policy
  max_retry_attempts = 3,
  retry_delay_ms = 1000,
  exponential_backoff = true,
  dead_letter_queue_enabled = true,
  
  -- Performance settings
  batch_size = 100,
  processing_timeout_ms = 30000,
  
  -- Subscription metadata
  created_by = 'user_service_admin',
  description = 'User lifecycle events for authentication and personalization services'
);

-- Monitor event processing with real-time analytics
WITH event_stream_metrics AS (
  SELECT 
    subscription_id,
    service_name,
    
    -- Event volume metrics
    COUNT(*) as total_events_received,
    COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as events_processed,
    COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as events_failed,
    COUNT(CASE WHEN processing_status = 'retrying' THEN 1 END) as events_retrying,
    
    -- Processing performance
    AVG(processing_duration_ms) as avg_processing_time_ms,
    MAX(processing_duration_ms) as max_processing_time_ms,
    MIN(processing_duration_ms) as min_processing_time_ms,
    
    -- Event type distribution
    COUNT(CASE WHEN event_type = 'insert' THEN 1 END) as insert_events,
    COUNT(CASE WHEN event_type = 'update' THEN 1 END) as update_events,
    COUNT(CASE WHEN event_type = 'delete' THEN 1 END) as delete_events,
    
    -- Collection distribution
    COUNT(CASE WHEN collection_name = 'users' THEN 1 END) as user_events,
    COUNT(CASE WHEN collection_name = 'user_profiles' THEN 1 END) as profile_events,
    COUNT(CASE WHEN collection_name = 'user_preferences' THEN 1 END) as preference_events,
    
    -- Time-based analysis
    DATE_FORMAT(event_timestamp, '%Y-%m-%d %H:00:00') as hour_bucket,
    COUNT(*) as hourly_event_count,
    
    -- Success rate calculation
    ROUND(
      (COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) * 100.0) / 
      COUNT(*), 2
    ) as success_rate_percent
    
  FROM CHANGE_STREAM_EVENTS()
  WHERE event_timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    AND subscription_id IN (
      'user_lifecycle_events', 
      'inventory_management', 
      'realtime_analytics',
      'notification_service',
      'audit_logging'
    )
  GROUP BY 
    subscription_id, 
    service_name, 
    DATE_FORMAT(event_timestamp, '%Y-%m-%d %H:00:00')
),

-- Event processing lag and performance analysis
processing_performance AS (
  SELECT 
    subscription_id,
    
    -- Latency metrics
    AVG(TIMESTAMPDIFF(MICROSECOND, event_timestamp, processing_completed_at) / 1000) as avg_processing_lag_ms,
    MAX(TIMESTAMPDIFF(MICROSECOND, event_timestamp, processing_completed_at) / 1000) as max_processing_lag_ms,
    
    -- Throughput calculations
    COUNT(*) / 
      (TIMESTAMPDIFF(SECOND, MIN(event_timestamp), MAX(event_timestamp)) / 3600.0) as events_per_hour,
    
    -- Error analysis
    COUNT(CASE WHEN retry_count > 0 THEN 1 END) as events_requiring_retry,
    AVG(retry_count) as avg_retry_count,
    
    -- Resume token health
    MAX(resume_token_timestamp) as latest_resume_token,
    TIMESTAMPDIFF(SECOND, MAX(resume_token_timestamp), NOW()) as resume_token_lag_seconds,
    
    -- Queue depth analysis
    COUNT(CASE WHEN processing_status = 'queued' THEN 1 END) as current_queue_depth,
    
    -- Service health indicators
    CASE 
      WHEN success_rate_percent >= 99 AND avg_processing_lag_ms < 1000 THEN 'Excellent'
      WHEN success_rate_percent >= 95 AND avg_processing_lag_ms < 5000 THEN 'Good'
      WHEN success_rate_percent >= 90 AND avg_processing_lag_ms < 15000 THEN 'Fair'
      ELSE 'Needs Attention'
    END as service_health_status
    
  FROM event_stream_metrics
  GROUP BY subscription_id
)

SELECT 
  esm.subscription_id,
  esm.service_name,
  esm.total_events_received,
  esm.events_processed,
  esm.success_rate_percent,
  esm.avg_processing_time_ms,
  
  -- Performance indicators
  pp.avg_processing_lag_ms,
  pp.events_per_hour,
  pp.service_health_status,
  
  -- Event distribution
  esm.insert_events,
  esm.update_events,
  esm.delete_events,
  
  -- Collection breakdown
  esm.user_events,
  esm.profile_events,
  esm.preference_events,
  
  -- Error and retry analysis
  esm.events_failed,
  pp.events_requiring_retry,
  pp.avg_retry_count,
  pp.current_queue_depth,
  
  -- Real-time status
  pp.resume_token_lag_seconds,
  CASE 
    WHEN pp.resume_token_lag_seconds > 300 THEN 'Stream Lagging'
    WHEN pp.current_queue_depth > 1000 THEN 'Queue Backlog'
    WHEN esm.success_rate_percent < 95 THEN 'High Error Rate'
    ELSE 'Healthy'
  END as real_time_status,
  
  -- Performance recommendations
  CASE 
    WHEN pp.avg_processing_lag_ms > 10000 THEN 'Increase processing capacity'
    WHEN pp.current_queue_depth > 500 THEN 'Enable batch processing'
    WHEN esm.success_rate_percent < 90 THEN 'Review error handling'
    WHEN pp.events_per_hour > 10000 THEN 'Consider partitioning'
    ELSE 'Performance optimal'
  END as optimization_recommendation

FROM event_stream_metrics esm
JOIN processing_performance pp ON esm.subscription_id = pp.subscription_id
ORDER BY esm.total_events_received DESC, esm.success_rate_percent ASC;

-- Advanced event correlation and business process tracking
WITH event_correlation AS (
  SELECT 
    correlation_id,
    business_process_id,
    
    -- Process timeline tracking
    MIN(event_timestamp) as process_start_time,
    MAX(event_timestamp) as process_end_time,
    TIMESTAMPDIFF(SECOND, MIN(event_timestamp), MAX(event_timestamp)) as process_duration_seconds,
    
    -- Event sequence analysis
    GROUP_CONCAT(
      CONCAT(service_name, ':', event_type, ':', collection_name) 
      ORDER BY event_timestamp 
      SEPARATOR ' -> '
    ) as event_sequence,
    
    COUNT(*) as total_events_in_process,
    COUNT(DISTINCT service_name) as services_involved,
    COUNT(DISTINCT collection_name) as collections_affected,
    
    -- Process completion analysis
    COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed_events,
    COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed_events,
    
    -- Business metrics
    SUM(CAST(JSON_EXTRACT(event_data, '$.order_total') AS DECIMAL(10,2))) as total_order_value,
    COUNT(CASE WHEN event_type = 'insert' AND collection_name = 'orders' THEN 1 END) as orders_created,
    COUNT(CASE WHEN event_type = 'update' AND collection_name = 'inventory' THEN 1 END) as inventory_updates,
    
    -- Process success indicators
    CASE 
      WHEN COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) = 0 
        AND COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) = COUNT(*) 
      THEN 'Success'
      WHEN COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) > 0 THEN 'Failed'
      ELSE 'In Progress'
    END as process_status
    
  FROM CHANGE_STREAM_EVENTS()
  WHERE correlation_id IS NOT NULL
    AND event_timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
  GROUP BY correlation_id, business_process_id
),

-- Service dependency and interaction analysis
service_interactions AS (
  SELECT 
    source_service,
    target_service,
    interaction_type,
    
    -- Interaction volume and frequency
    COUNT(*) as interaction_count,
    COUNT(*) / (TIMESTAMPDIFF(SECOND, MIN(event_timestamp), MAX(event_timestamp)) / 60.0) as interactions_per_minute,
    
    -- Success and failure rates
    COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as successful_interactions,
    COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed_interactions,
    ROUND(
      (COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) * 100.0) / COUNT(*), 2
    ) as interaction_success_rate,
    
    -- Performance metrics
    AVG(processing_duration_ms) as avg_interaction_time_ms,
    MAX(processing_duration_ms) as max_interaction_time_ms,
    
    -- Data volume analysis
    AVG(LENGTH(event_data)) as avg_event_size_bytes,
    SUM(LENGTH(event_data)) as total_data_transferred_bytes
    
  FROM CHANGE_STREAM_EVENTS()
  WHERE event_timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    AND source_service IS NOT NULL
    AND target_service IS NOT NULL
  GROUP BY source_service, target_service, interaction_type
)

SELECT 
  -- Process correlation summary
  'BUSINESS_PROCESSES' as section,
  JSON_OBJECT(
    'total_processes', COUNT(*),
    'successful_processes', COUNT(CASE WHEN process_status = 'Success' THEN 1 END),
    'failed_processes', COUNT(CASE WHEN process_status = 'Failed' THEN 1 END),
    'in_progress_processes', COUNT(CASE WHEN process_status = 'In Progress' THEN 1 END),
    'avg_process_duration_seconds', AVG(process_duration_seconds),
    'total_business_value', SUM(total_order_value),
    'top_processes', JSON_ARRAYAGG(
      JSON_OBJECT(
        'correlation_id', correlation_id,
        'duration_seconds', process_duration_seconds,
        'services_involved', services_involved,
        'event_sequence', event_sequence,
        'status', process_status
      ) LIMIT 10
    )
  ) as process_analytics
FROM event_correlation

UNION ALL

SELECT 
  -- Service interaction summary
  'SERVICE_INTERACTIONS' as section,
  JSON_OBJECT(
    'total_interactions', SUM(interaction_count),
    'service_pairs', COUNT(*),
    'avg_success_rate', AVG(interaction_success_rate),
    'total_data_transferred_mb', SUM(total_data_transferred_bytes) / 1024 / 1024,
    'interaction_details', JSON_ARRAYAGG(
      JSON_OBJECT(
        'source_service', source_service,
        'target_service', target_service,
        'interaction_count', interaction_count,
        'success_rate', interaction_success_rate,
        'avg_time_ms', avg_interaction_time_ms
      )
    )
  ) as interaction_analytics
FROM service_interactions;

-- Real-time event stream monitoring dashboard
CREATE VIEW microservices_event_dashboard AS
SELECT 
  -- Current system status
  (SELECT COUNT(*) FROM ACTIVE_CHANGE_STREAMS()) as active_streams,
  (SELECT COUNT(*) FROM EVENT_SUBSCRIPTIONS() WHERE status = 'active') as active_subscriptions,
  (SELECT COUNT(*) FROM CHANGE_STREAM_EVENTS() WHERE event_timestamp >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)) as events_per_minute,
  
  -- Processing queue status
  (SELECT COUNT(*) FROM CHANGE_STREAM_EVENTS() WHERE processing_status = 'queued') as queued_events,
  (SELECT COUNT(*) FROM CHANGE_STREAM_EVENTS() WHERE processing_status = 'processing') as processing_events,
  (SELECT COUNT(*) FROM CHANGE_STREAM_EVENTS() WHERE processing_status = 'retrying') as retrying_events,
  
  -- Error indicators
  (SELECT COUNT(*) FROM CHANGE_STREAM_EVENTS() 
   WHERE processing_status = 'failed' AND event_timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) as errors_last_hour,
  (SELECT COUNT(*) FROM DEAD_LETTER_EVENTS() 
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) as dead_letter_events_hour,
  
  -- Performance indicators
  (SELECT AVG(processing_duration_ms) FROM CHANGE_STREAM_EVENTS() 
   WHERE processing_status = 'completed' AND event_timestamp >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)) as avg_processing_time_5min,
  (SELECT MAX(resume_token_lag_seconds) FROM EVENT_SUBSCRIPTIONS()) as max_resume_token_lag,
  
  -- Service health summary
  (SELECT 
     JSON_ARRAYAGG(
       JSON_OBJECT(
         'service_name', service_name,
         'subscription_count', subscription_count,
         'success_rate', success_rate,
         'health_status', health_status
       )
     )
   FROM (
     SELECT 
       service_name,
       COUNT(*) as subscription_count,
       AVG(success_rate_percent) as success_rate,
       CASE 
         WHEN AVG(success_rate_percent) >= 99 THEN 'Excellent'
         WHEN AVG(success_rate_percent) >= 95 THEN 'Good'
         WHEN AVG(success_rate_percent) >= 90 THEN 'Warning'
         ELSE 'Critical'
       END as health_status
     FROM event_stream_metrics
     GROUP BY service_name
   ) service_health
  ) as service_health_summary,
  
  -- System health assessment
  CASE 
    WHEN (SELECT COUNT(*) FROM CHANGE_STREAM_EVENTS() WHERE processing_status = 'failed' 
          AND event_timestamp >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)) > 100 THEN 'Critical'
    WHEN (SELECT MAX(resume_token_lag_seconds) FROM EVENT_SUBSCRIPTIONS()) > 300 THEN 'Warning'
    WHEN (SELECT AVG(processing_duration_ms) FROM CHANGE_STREAM_EVENTS() 
          WHERE event_timestamp >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)) > 5000 THEN 'Degraded'
    ELSE 'Healthy'
  END as overall_system_health,
  
  NOW() as dashboard_timestamp;

-- QueryLeaf Change Streams provide:
-- 1. SQL-familiar event subscription creation and management
-- 2. Real-time event processing monitoring and analytics
-- 3. Advanced event correlation and business process tracking
-- 4. Service interaction analysis and dependency mapping
-- 5. Comprehensive error handling and dead letter queue management
-- 6. Performance optimization recommendations and health monitoring
-- 7. Integration with MongoDB's native Change Streams capabilities
-- 8. Familiar SQL syntax for complex event processing workflows
-- 9. Real-time dashboard views for operational monitoring
-- 10. Enterprise-grade event-driven architecture patterns
```

## Best Practices for MongoDB Change Streams

### Event-Driven Architecture Design

Essential principles for building robust microservices with Change Streams:

1. **Event Filtering**: Use precise filtering to reduce network traffic and processing overhead
2. **Resume Token Management**: Implement robust resume token persistence for fault tolerance
3. **Batch Processing**: Configure appropriate batch sizes for high-volume event scenarios
4. **Error Handling**: Design comprehensive error handling with retry policies and dead letter queues
5. **Service Boundaries**: Align Change Stream subscriptions with clear service boundaries and responsibilities
6. **Performance Monitoring**: Implement real-time monitoring for event processing lag and system health

### Production Deployment Strategies

Optimize Change Streams for enterprise-scale microservices architectures:

1. **Connection Management**: Use dedicated connections for Change Streams to avoid resource contention
2. **Replica Set Configuration**: Ensure proper read preferences for Change Stream operations
3. **Network Optimization**: Configure appropriate network timeouts and connection pooling
4. **Scaling Patterns**: Implement horizontal scaling strategies for high-volume event processing
5. **Security Integration**: Secure Change Stream connections with proper authentication and encryption
6. **Operational Monitoring**: Deploy comprehensive monitoring and alerting for Change Stream health

## Conclusion

MongoDB Change Streams provide sophisticated event-driven capabilities that enable resilient microservices architectures through native database-level event processing, automatic fault tolerance, and comprehensive filtering mechanisms. By implementing advanced Change Stream patterns with QueryLeaf's familiar SQL interface, organizations can build robust distributed systems that maintain data consistency, service decoupling, and operational resilience at scale.

Key Change Streams benefits include:

- **Native Event Processing**: Database-level event streaming without additional middleware dependencies
- **Guaranteed Delivery**: Ordered event delivery with automatic resume token management for fault tolerance
- **Advanced Filtering**: Sophisticated event filtering and routing capabilities with minimal network overhead
- **High Performance**: Optimized event processing with configurable batching and concurrency controls
- **Service Decoupling**: Clean separation of concerns enabling independent service evolution and scaling
- **Operational Simplicity**: Reduced infrastructure complexity compared to traditional message queue systems

Whether you're building e-commerce platforms, financial services applications, or distributed data processing systems, MongoDB Change Streams with QueryLeaf's event processing interface provide the foundation for scalable, reliable event-driven microservices architectures that can evolve and scale with growing business requirements.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL-familiar event processing commands into optimized MongoDB Change Stream operations, providing familiar subscription management, event correlation, and monitoring capabilities. Advanced event-driven patterns, service interaction analysis, and performance optimization are seamlessly handled through SQL-style interfaces, making sophisticated microservices architecture both powerful and accessible for database-oriented development teams.

The combination of MongoDB's native Change Streams with SQL-style event processing operations makes it an ideal platform for modern distributed systems that require both real-time event processing capabilities and familiar database administration patterns, ensuring your microservices architecture remains both scalable and maintainable as it grows to meet demanding production requirements.