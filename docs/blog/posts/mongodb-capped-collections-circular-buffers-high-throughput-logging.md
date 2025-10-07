---
title: "MongoDB Capped Collections and Circular Buffers: High-Performance Logging, Event Streaming, and Fixed-Size Data Management for High-Throughput Applications"
description: "Master MongoDB capped collections for high-performance logging, real-time event streaming, and circular buffer implementations. Learn advanced capped collection patterns, tailable cursors, and fixed-size data management with SQL-familiar operations for high-throughput applications."
date: 2025-10-06
tags: [mongodb, capped-collections, logging, event-streaming, circular-buffers, high-performance, sql]
---

# MongoDB Capped Collections and Circular Buffers: High-Performance Logging, Event Streaming, and Fixed-Size Data Management for High-Throughput Applications

High-throughput applications require specialized data storage patterns that can handle massive write volumes while maintaining predictable performance characteristics and managing storage space efficiently. Traditional relational database approaches to logging and event streaming often struggle with write scalability, storage growth management, and query performance under extreme load conditions, particularly when dealing with time-series data, application logs, and real-time event streams.

MongoDB's capped collections provide a unique solution for these scenarios, offering fixed-size collections that automatically maintain insertion order and efficiently manage storage by overwriting old documents when capacity limits are reached. Unlike traditional log rotation mechanisms that require complex external processes and can introduce performance bottlenecks, capped collections provide built-in circular buffer functionality with native MongoDB integration, tailable cursors for real-time streaming, and optimized write performance that makes them ideal for high-throughput logging, event processing, and time-sensitive data scenarios.

## The Traditional High-Volume Logging Challenge

Conventional database approaches to high-volume logging and event streaming face significant scalability and management challenges:

```sql
-- Traditional PostgreSQL high-volume logging - storage growth and performance challenges

-- Application log table with typical structure
CREATE TABLE application_logs (
  log_id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  application_name VARCHAR(100) NOT NULL,
  environment VARCHAR(20) DEFAULT 'production',
  log_level VARCHAR(10) NOT NULL, -- DEBUG, INFO, WARN, ERROR, FATAL
  message TEXT NOT NULL,
  user_id UUID,
  session_id VARCHAR(100),
  request_id VARCHAR(100),
  
  -- Contextual information
  source_ip INET,
  user_agent TEXT,
  request_method VARCHAR(10),
  request_url TEXT,
  response_status INTEGER,
  response_time_ms INTEGER,
  
  -- Structured data fields
  metadata JSONB,
  tags TEXT[],
  
  -- Performance tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexing for queries
  CONSTRAINT valid_log_level CHECK (log_level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'))
);

-- Indexes for log querying (expensive to maintain with high write volume)
CREATE INDEX idx_application_logs_timestamp ON application_logs USING BTREE (timestamp DESC);
CREATE INDEX idx_application_logs_application ON application_logs (application_name, timestamp DESC);
CREATE INDEX idx_application_logs_level ON application_logs (log_level, timestamp DESC) WHERE log_level IN ('ERROR', 'FATAL');
CREATE INDEX idx_application_logs_user ON application_logs (user_id, timestamp DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_application_logs_session ON application_logs (session_id, timestamp DESC) WHERE session_id IS NOT NULL;
CREATE INDEX idx_application_logs_request ON application_logs (request_id) WHERE request_id IS NOT NULL;

-- Partitioning strategy for managing large datasets (complex setup)
CREATE TABLE application_logs_y2024m01 PARTITION OF application_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE application_logs_y2024m02 PARTITION OF application_logs  
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE application_logs_y2024m03 PARTITION OF application_logs
FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

-- Complex log rotation and cleanup procedures (operational overhead)
-- Daily log cleanup procedure
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
DECLARE
  cutoff_date TIMESTAMP;
  affected_rows BIGINT;
  partition_name TEXT;
  partition_start DATE;
  partition_end DATE;
BEGIN
  -- Keep logs for 30 days
  cutoff_date := CURRENT_TIMESTAMP - INTERVAL '30 days';
  
  -- Delete old logs in batches to avoid lock contention
  LOOP
    DELETE FROM application_logs 
    WHERE timestamp < cutoff_date 
    AND log_id IN (
      SELECT log_id FROM application_logs 
      WHERE timestamp < cutoff_date 
      LIMIT 10000
    );
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    EXIT WHEN affected_rows = 0;
    
    -- Commit batch and pause to reduce system impact
    COMMIT;
    PERFORM pg_sleep(0.1);
  END LOOP;
  
  -- Drop old partitions if using partitioning
  FOR partition_name, partition_start, partition_end IN
    SELECT schemaname||'.'||tablename, 
           split_part(split_part(pg_get_expr(c.relpartbound, c.oid), '''', 2), '''', 1)::date,
           split_part(split_part(pg_get_expr(c.relpartbound, c.oid), '''', 4), '''', 1)::date
    FROM pg_tables pt
    JOIN pg_class c ON c.relname = pt.tablename
    WHERE pt.tablename LIKE 'application_logs_y%'
      AND split_part(split_part(pg_get_expr(c.relpartbound, c.oid), '''', 4), '''', 1)::date < CURRENT_DATE - INTERVAL '30 days'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %s', partition_name);
  END LOOP;
  
END;
$$ LANGUAGE plpgsql;

-- Schedule daily cleanup (requires external scheduler)
-- 0 2 * * * /usr/bin/psql -d myapp -c "SELECT cleanup_old_logs();"

-- Complex high-volume log insertion with batching
WITH log_batch AS (
  INSERT INTO application_logs (
    application_name, environment, log_level, message, user_id, 
    session_id, request_id, source_ip, user_agent, request_method, 
    request_url, response_status, response_time_ms, metadata, tags
  ) VALUES 
  ('web-api', 'production', 'INFO', 'User login successful', 
   '550e8400-e29b-41d4-a716-446655440000', 'sess_abc123', 'req_xyz789',
   '192.168.1.100', 'Mozilla/5.0...', 'POST', '/api/auth/login', 200, 150,
   '{"login_method": "email", "ip_geolocation": "US-CA"}', ARRAY['auth', 'login']
  ),
  ('web-api', 'production', 'WARN', 'Rate limit threshold reached', 
   '550e8400-e29b-41d4-a716-446655440001', 'sess_def456', 'req_abc123',
   '192.168.1.101', 'PostmanRuntime/7.29.0', 'POST', '/api/data/upload', 429, 50,
   '{"rate_limit": "100_per_minute", "current_count": 101}', ARRAY['rate_limiting', 'api']
  ),
  ('background-worker', 'production', 'ERROR', 'Database connection timeout', 
   NULL, NULL, 'job_456789',
   NULL, NULL, NULL, NULL, NULL, 5000,
   '{"error_code": "DB_TIMEOUT", "retry_attempt": 3, "queue_size": 1500}', ARRAY['database', 'error', 'timeout']
  ),
  ('web-api', 'production', 'DEBUG', 'Cache miss for user preferences', 
   '550e8400-e29b-41d4-a716-446655440002', 'sess_ghi789', 'req_def456',
   '192.168.1.102', 'React Native App', 'GET', '/api/user/preferences', 200, 85,
   '{"cache_key": "user_prefs_12345", "cache_ttl": 300}', ARRAY['cache', 'performance']
  )
  RETURNING log_id, timestamp, application_name, log_level
)
SELECT 
  COUNT(*) as logs_inserted,
  MIN(timestamp) as first_log_time,
  MAX(timestamp) as last_log_time,
  string_agg(DISTINCT application_name, ', ') as applications,
  string_agg(DISTINCT log_level, ', ') as log_levels
FROM log_batch;

-- Complex log analysis queries (expensive on large datasets)
WITH hourly_log_stats AS (
  SELECT 
    date_trunc('hour', timestamp) as hour_bucket,
    application_name,
    log_level,
    COUNT(*) as log_count,
    
    -- Error rate calculation
    COUNT(*) FILTER (WHERE log_level IN ('ERROR', 'FATAL')) as error_count,
    COUNT(*) FILTER (WHERE log_level IN ('ERROR', 'FATAL'))::float / COUNT(*) * 100 as error_rate_percent,
    
    -- Response time statistics
    AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL) as avg_response_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL) as p95_response_time,
    
    -- Request statistics
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
    COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) as unique_sessions,
    
    -- Top error messages
    mode() WITHIN GROUP (ORDER BY message) FILTER (WHERE log_level IN ('ERROR', 'FATAL')) as most_common_error,
    
    -- Resource utilization indicators
    COUNT(*) FILTER (WHERE response_time_ms > 1000) as slow_requests,
    COUNT(*) FILTER (WHERE response_status >= 400) as client_errors,
    COUNT(*) FILTER (WHERE response_status >= 500) as server_errors
    
  FROM application_logs
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND timestamp < CURRENT_TIMESTAMP
  GROUP BY date_trunc('hour', timestamp), application_name, log_level
),

trend_analysis AS (
  SELECT 
    hour_bucket,
    application_name,
    log_level,
    log_count,
    error_rate_percent,
    avg_response_time,
    
    -- Hour-over-hour trend analysis
    LAG(log_count) OVER (
      PARTITION BY application_name, log_level 
      ORDER BY hour_bucket
    ) as prev_hour_count,
    
    LAG(error_rate_percent) OVER (
      PARTITION BY application_name, log_level 
      ORDER BY hour_bucket
    ) as prev_hour_error_rate,
    
    LAG(avg_response_time) OVER (
      PARTITION BY application_name, log_level 
      ORDER BY hour_bucket
    ) as prev_hour_response_time,
    
    -- Calculate trends
    CASE 
      WHEN LAG(log_count) OVER (PARTITION BY application_name, log_level ORDER BY hour_bucket) IS NOT NULL THEN
        ((log_count - LAG(log_count) OVER (PARTITION BY application_name, log_level ORDER BY hour_bucket))::float / 
         LAG(log_count) OVER (PARTITION BY application_name, log_level ORDER BY hour_bucket) * 100)
      ELSE NULL
    END as log_count_change_percent,
    
    -- Moving averages
    AVG(log_count) OVER (
      PARTITION BY application_name, log_level 
      ORDER BY hour_bucket 
      ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) as rolling_4h_avg_count,
    
    AVG(error_rate_percent) OVER (
      PARTITION BY application_name, log_level 
      ORDER BY hour_bucket 
      ROWS BETWEEN 3 PRECEDING AND CURRENT ROW  
    ) as rolling_4h_avg_error_rate
    
  FROM hourly_log_stats
)

SELECT 
  hour_bucket,
  application_name,
  log_level,
  log_count,
  ROUND(error_rate_percent::numeric, 2) as error_rate_percent,
  ROUND(avg_response_time::numeric, 2) as avg_response_time_ms,
  
  -- Trend indicators
  ROUND(log_count_change_percent::numeric, 1) as hourly_change_percent,
  ROUND(rolling_4h_avg_count::numeric, 0) as rolling_4h_avg,
  ROUND(rolling_4h_avg_error_rate::numeric, 2) as rolling_4h_avg_error_rate,
  
  -- Alert conditions
  CASE 
    WHEN error_rate_percent > rolling_4h_avg_error_rate * 2 AND error_rate_percent > 1 THEN 'HIGH_ERROR_RATE'
    WHEN log_count_change_percent > 100 THEN 'TRAFFIC_SPIKE'
    WHEN log_count_change_percent < -50 AND log_count < rolling_4h_avg * 0.5 THEN 'TRAFFIC_DROP'
    WHEN avg_response_time > 1000 THEN 'HIGH_LATENCY'
    ELSE 'NORMAL'
  END as alert_condition,
  
  CURRENT_TIMESTAMP as analysis_time

FROM trend_analysis
ORDER BY hour_bucket DESC, application_name, log_level;

-- Problems with traditional PostgreSQL logging approaches:
-- 1. Unlimited storage growth requiring complex rotation strategies
-- 2. Index maintenance overhead degrading write performance
-- 3. Partitioning complexity for managing large datasets
-- 4. Expensive cleanup operations impacting production performance
-- 5. Limited real-time streaming capabilities for log analysis
-- 6. Complex batching logic required for high-volume insertions
-- 7. Vacuum and maintenance operations required for table health
-- 8. Query performance degradation as table size grows
-- 9. Storage space reclamation challenges after log deletion
-- 10. Manual operational overhead for log management and cleanup

-- Additional complications:
-- - WAL (Write-Ahead Log) bloat from high-volume insertions
-- - Lock contention during peak logging periods
-- - Backup complexity due to large log table sizes
-- - Replication lag caused by high write volume
-- - Statistics staleness affecting query plan optimization
-- - Complex monitoring required for log system health
-- - Difficulty implementing real-time log streaming
-- - Storage I/O bottlenecks during cleanup operations
```

MongoDB capped collections provide elegant solutions for high-volume logging:

```javascript
// MongoDB Capped Collections - efficient high-volume logging with built-in circular buffer functionality
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('high_throughput_logging_platform');

// Advanced MongoDB Capped Collections manager for high-performance logging and event streaming
class AdvancedCappedCollectionManager {
  constructor(db) {
    this.db = db;
    this.collections = new Map();
    this.tailable_cursors = new Map();
    this.streaming_handlers = new Map();
    
    // Configuration for different log types and use cases
    this.cappedConfigurations = {
      // Application logs with high write volume
      application_logs: {
        size: 1024 * 1024 * 1024, // 1GB
        max: 10000000, // 10 million documents
        indexing: ['timestamp', 'application', 'level'],
        streaming: true,
        compression: true,
        retention_hours: 72
      },
      
      // Real-time event stream
      event_stream: {
        size: 512 * 1024 * 1024, // 512MB
        max: 5000000, // 5 million events
        indexing: ['timestamp', 'event_type'],
        streaming: true,
        compression: false, // For lowest latency
        retention_hours: 24
      },
      
      // System metrics collection
      system_metrics: {
        size: 2048 * 1024 * 1024, // 2GB
        max: 20000000, // 20 million metrics
        indexing: ['timestamp', 'metric_type', 'host'],
        streaming: true,
        compression: true,
        retention_hours: 168 // 7 days
      },
      
      // User activity tracking
      user_activity: {
        size: 256 * 1024 * 1024, // 256MB
        max: 2000000, // 2 million activities
        indexing: ['timestamp', 'user_id', 'activity_type'],
        streaming: false,
        compression: true,
        retention_hours: 24
      },
      
      // Error and exception tracking
      error_logs: {
        size: 128 * 1024 * 1024, // 128MB
        max: 500000, // 500k errors
        indexing: ['timestamp', 'application', 'error_type', 'severity'],
        streaming: true,
        compression: false, // For immediate processing
        retention_hours: 168 // 7 days
      }
    };
    
    // Performance monitoring
    this.stats = {
      writes_per_second: new Map(),
      collection_sizes: new Map(),
      streaming_clients: new Map()
    };
  }

  async initializeCappedCollections() {
    console.log('Initializing advanced capped collections for high-throughput logging...');
    
    const initializationResults = [];
    
    for (const [collectionName, config] of Object.entries(this.cappedConfigurations)) {
      try {
        console.log(`Setting up capped collection: ${collectionName}`);
        
        // Create capped collection with optimal configuration
        const collection = await this.createOptimizedCappedCollection(collectionName, config);
        
        // Setup indexing strategy
        await this.setupCollectionIndexes(collection, config.indexing);
        
        // Initialize real-time streaming if enabled
        if (config.streaming) {
          await this.setupRealTimeStreaming(collectionName, collection);
        }
        
        // Setup monitoring and statistics
        await this.setupCollectionMonitoring(collectionName, collection, config);
        
        this.collections.set(collectionName, {
          collection: collection,
          config: config,
          created_at: new Date(),
          stats: {
            documents_written: 0,
            bytes_written: 0,
            last_write: null,
            streaming_clients: 0
          }
        });
        
        initializationResults.push({
          collection: collectionName,
          status: 'success',
          size_mb: Math.round(config.size / (1024 * 1024)),
          max_documents: config.max,
          streaming_enabled: config.streaming
        });
        
      } catch (error) {
        console.error(`Failed to initialize capped collection ${collectionName}:`, error);
        initializationResults.push({
          collection: collectionName,
          status: 'error',
          error: error.message
        });
      }
    }
    
    console.log(`Initialized ${initializationResults.filter(r => r.status === 'success').length} capped collections`);
    return initializationResults;
  }

  async createOptimizedCappedCollection(name, config) {
    console.log(`Creating capped collection '${name}' with ${Math.round(config.size / (1024 * 1024))}MB capacity`);
    
    try {
      // Check if collection already exists
      const existingCollections = await this.db.listCollections({ name: name }).toArray();
      
      if (existingCollections.length > 0) {
        const existing = existingCollections[0];
        
        if (existing.options?.capped) {
          console.log(`Capped collection '${name}' already exists`);
          return this.db.collection(name);
        } else {
          throw new Error(`Collection '${name}' exists but is not capped`);
        }
      }
      
      // Create new capped collection with optimized settings
      const createOptions = {
        capped: true,
        size: config.size,
        max: config.max
      };
      
      await this.db.createCollection(name, createOptions);
      const collection = this.db.collection(name);
      
      console.log(`Created capped collection '${name}' successfully`);
      return collection;
      
    } catch (error) {
      console.error(`Error creating capped collection '${name}':`, error);
      throw error;
    }
  }

  async setupCollectionIndexes(collection, indexFields) {
    console.log(`Setting up indexes for capped collection: ${collection.collectionName}`);
    
    try {
      // Create indexes for efficient querying (note: capped collections have limitations on indexing)
      const indexPromises = indexFields.map(async (field) => {
        const indexSpec = {};
        indexSpec[field] = 1;
        
        try {
          await collection.createIndex(indexSpec, { 
            background: true,
            name: `idx_${field}`
          });
          console.log(`Created index on field: ${field}`);
        } catch (error) {
          // Some indexes may not be supported on capped collections
          console.warn(`Could not create index on ${field}: ${error.message}`);
        }
      });
      
      await Promise.allSettled(indexPromises);
      
    } catch (error) {
      console.error(`Error setting up indexes for ${collection.collectionName}:`, error);
    }
  }

  async setupRealTimeStreaming(collectionName, collection) {
    console.log(`Setting up real-time streaming for: ${collectionName}`);
    
    try {
      // Create tailable cursor for real-time document streaming
      const tailableCursor = collection.find({}, {
        tailable: true,
        awaitData: true,
        noCursorTimeout: true,
        maxTimeMS: 0
      });
      
      this.tailable_cursors.set(collectionName, tailableCursor);
      
      // Setup streaming event handlers
      const streamingHandler = async (document) => {
        await this.processStreamingDocument(collectionName, document);
      };
      
      this.streaming_handlers.set(collectionName, streamingHandler);
      
      // Start streaming in background
      this.startTailableStreaming(collectionName, tailableCursor, streamingHandler);
      
      console.log(`Real-time streaming enabled for: ${collectionName}`);
      
    } catch (error) {
      console.error(`Error setting up streaming for ${collectionName}:`, error);
    }
  }

  async startTailableStreaming(collectionName, cursor, handler) {
    console.log(`Starting tailable streaming for: ${collectionName}`);
    
    try {
      // Process documents as they are inserted
      for await (const document of cursor) {
        try {
          await handler(document);
          this.updateStreamingStats(collectionName, 'document_streamed');
        } catch (error) {
          console.error(`Error processing streamed document in ${collectionName}:`, error);
          this.updateStreamingStats(collectionName, 'streaming_error');
        }
      }
    } catch (error) {
      console.error(`Tailable streaming error for ${collectionName}:`, error);
      
      // Attempt to restart streaming after delay
      setTimeout(() => {
        console.log(`Restarting tailable streaming for: ${collectionName}`);
        this.startTailableStreaming(collectionName, cursor, handler);
      }, 5000);
    }
  }

  async processStreamingDocument(collectionName, document) {
    // Process real-time document based on collection type
    switch (collectionName) {
      case 'application_logs':
        await this.processLogDocument(document);
        break;
      case 'event_stream':
        await this.processEventDocument(document);
        break;
      case 'system_metrics':
        await this.processMetricDocument(document);
        break;
      case 'error_logs':
        await this.processErrorDocument(document);
        break;
      default:
        console.log(`Streamed document from ${collectionName}:`, document._id);
    }
  }

  async processLogDocument(logDocument) {
    // Real-time log processing
    console.log(`Processing log: ${logDocument.level} - ${logDocument.application}`);
    
    // Alert on critical errors
    if (logDocument.level === 'ERROR' || logDocument.level === 'FATAL') {
      await this.triggerErrorAlert(logDocument);
    }
    
    // Update real-time metrics
    await this.updateLogMetrics(logDocument);
  }

  async processEventDocument(eventDocument) {
    // Real-time event processing
    console.log(`Processing event: ${eventDocument.event_type}`);
    
    // Update event counters
    await this.updateEventCounters(eventDocument);
    
    // Trigger event-based workflows
    if (eventDocument.event_type === 'user_purchase') {
      await this.triggerPurchaseWorkflow(eventDocument);
    }
  }

  async processMetricDocument(metricDocument) {
    // Real-time metrics processing
    console.log(`Processing metric: ${metricDocument.metric_type} = ${metricDocument.value}`);
    
    // Check thresholds
    if (metricDocument.metric_type === 'cpu_usage' && metricDocument.value > 80) {
      await this.triggerHighCPUAlert(metricDocument);
    }
  }

  async processErrorDocument(errorDocument) {
    // Real-time error processing
    console.log(`Processing error: ${errorDocument.error_type} in ${errorDocument.application}`);
    
    // Immediate alerting for critical errors
    if (errorDocument.severity === 'CRITICAL') {
      await this.triggerCriticalErrorAlert(errorDocument);
    }
  }

  async logEvent(collectionName, eventData, options = {}) {
    console.log(`Logging event to ${collectionName}`);
    
    try {
      const collectionData = this.collections.get(collectionName);
      if (!collectionData) {
        throw new Error(`Capped collection ${collectionName} not initialized`);
      }
      
      const collection = collectionData.collection;
      
      // Enhance event data with standard fields
      const enhancedEvent = {
        ...eventData,
        timestamp: new Date(),
        _logged_at: new Date(),
        _collection_type: collectionName,
        
        // Add metadata if specified
        ...(options.metadata && { _metadata: options.metadata }),
        
        // Add correlation ID for tracking
        ...(options.correlationId && { _correlation_id: options.correlationId })
      };
      
      // High-performance insert (no acknowledgment waiting for maximum throughput)
      const insertOptions = {
        writeConcern: options.writeConcern || { w: 0 }, // No acknowledgment for maximum speed
        ordered: false // Allow out-of-order inserts for better performance
      };
      
      const result = await collection.insertOne(enhancedEvent, insertOptions);
      
      // Update statistics
      this.updateWriteStats(collectionName, enhancedEvent);
      
      return {
        success: true,
        insertedId: result.insertedId,
        collection: collectionName,
        timestamp: enhancedEvent.timestamp
      };
      
    } catch (error) {
      console.error(`Error logging to ${collectionName}:`, error);
      
      // Update error statistics
      this.updateWriteStats(collectionName, null, error);
      
      throw error;
    }
  }

  async logEventBatch(collectionName, events, options = {}) {
    console.log(`Logging batch of ${events.length} events to ${collectionName}`);
    
    try {
      const collectionData = this.collections.get(collectionName);
      if (!collectionData) {
        throw new Error(`Capped collection ${collectionName} not initialized`);
      }
      
      const collection = collectionData.collection;
      const timestamp = new Date();
      
      // Enhance all events with standard fields
      const enhancedEvents = events.map((eventData, index) => ({
        ...eventData,
        timestamp: new Date(timestamp.getTime() + index), // Ensure unique timestamps
        _logged_at: timestamp,
        _collection_type: collectionName,
        _batch_id: options.batchId || require('crypto').randomUUID(),
        
        // Add metadata if specified
        ...(options.metadata && { _metadata: options.metadata })
      }));
      
      // High-performance batch insert
      const insertOptions = {
        writeConcern: options.writeConcern || { w: 0 }, // No acknowledgment
        ordered: false // Allow out-of-order inserts
      };
      
      const result = await collection.insertMany(enhancedEvents, insertOptions);
      
      // Update statistics for all events
      enhancedEvents.forEach(event => this.updateWriteStats(collectionName, event));
      
      return {
        success: true,
        insertedCount: result.insertedCount,
        insertedIds: result.insertedIds,
        collection: collectionName,
        batchSize: events.length,
        timestamp: timestamp
      };
      
    } catch (error) {
      console.error(`Error batch logging to ${collectionName}:`, error);
      
      // Update error statistics
      this.updateWriteStats(collectionName, null, error);
      
      throw error;
    }
  }

  async queryRecentEvents(collectionName, query = {}, options = {}) {
    console.log(`Querying recent events from ${collectionName}`);
    
    try {
      const collectionData = this.collections.get(collectionName);
      if (!collectionData) {
        throw new Error(`Capped collection ${collectionName} not initialized`);
      }
      
      const collection = collectionData.collection;
      
      // Build query with time-based filtering
      const timeFilter = {};
      if (options.since) {
        timeFilter.timestamp = { $gte: options.since };
      }
      if (options.until) {
        timeFilter.timestamp = { ...timeFilter.timestamp, $lte: options.until };
      }
      
      const finalQuery = {
        ...query,
        ...timeFilter
      };
      
      // Query options for efficient retrieval
      const queryOptions = {
        sort: options.sort || { $natural: -1 }, // Natural order for capped collections
        limit: options.limit || 1000,
        projection: options.projection || {}
      };
      
      const cursor = collection.find(finalQuery, queryOptions);
      const results = await cursor.toArray();
      
      console.log(`Retrieved ${results.length} events from ${collectionName}`);
      
      return {
        collection: collectionName,
        count: results.length,
        events: results,
        query: finalQuery,
        options: queryOptions
      };
      
    } catch (error) {
      console.error(`Error querying ${collectionName}:`, error);
      throw error;
    }
  }

  async getCollectionStats(collectionName) {
    console.log(`Getting statistics for capped collection: ${collectionName}`);
    
    try {
      const collectionData = this.collections.get(collectionName);
      if (!collectionData) {
        throw new Error(`Capped collection ${collectionName} not initialized`);
      }
      
      const collection = collectionData.collection;
      
      // Get collection statistics
      const stats = await this.db.command({ collStats: collectionName });
      const recentStats = collectionData.stats;
      
      // Calculate performance metrics
      const now = Date.now();
      const timeSinceLastWrite = recentStats.last_write ? 
        (now - recentStats.last_write.getTime()) / 1000 : null;
      
      const writesPerSecond = this.stats.writes_per_second.get(collectionName) || 0;
      
      return {
        collection_name: collectionName,
        
        // MongoDB collection stats
        is_capped: stats.capped,
        max_size: stats.maxSize,
        max_documents: stats.max,
        current_size: stats.size,
        storage_size: stats.storageSize,
        document_count: stats.count,
        average_document_size: stats.avgObjSize,
        
        // Usage statistics
        size_utilization_percent: (stats.size / stats.maxSize * 100).toFixed(2),
        document_utilization_percent: stats.max ? (stats.count / stats.max * 100).toFixed(2) : null,
        
        // Performance metrics
        writes_per_second: writesPerSecond,
        documents_written: recentStats.documents_written,
        bytes_written: recentStats.bytes_written,
        last_write: recentStats.last_write,
        time_since_last_write_seconds: timeSinceLastWrite,
        
        // Streaming statistics
        streaming_enabled: collectionData.config.streaming,
        streaming_clients: recentStats.streaming_clients,
        
        // Configuration
        retention_hours: collectionData.config.retention_hours,
        compression_enabled: collectionData.config.compression,
        
        // Timestamps
        created_at: collectionData.created_at,
        stats_generated_at: new Date()
      };
      
    } catch (error) {
      console.error(`Error getting stats for ${collectionName}:`, error);
      throw error;
    }
  }

  async getAllCollectionStats() {
    console.log('Getting comprehensive statistics for all capped collections');
    
    const allStats = {};
    const promises = Array.from(this.collections.keys()).map(async (collectionName) => {
      try {
        const stats = await this.getCollectionStats(collectionName);
        allStats[collectionName] = stats;
      } catch (error) {
        allStats[collectionName] = { error: error.message };
      }
    });
    
    await Promise.all(promises);
    
    // Calculate aggregate statistics
    const aggregateStats = {
      total_collections: Object.keys(allStats).length,
      total_documents: 0,
      total_size_bytes: 0,
      total_writes_per_second: 0,
      collections_with_streaming: 0,
      average_utilization_percent: 0
    };
    
    let validCollections = 0;
    for (const [name, stats] of Object.entries(allStats)) {
      if (!stats.error) {
        validCollections++;
        aggregateStats.total_documents += stats.document_count || 0;
        aggregateStats.total_size_bytes += stats.current_size || 0;
        aggregateStats.total_writes_per_second += stats.writes_per_second || 0;
        if (stats.streaming_enabled) aggregateStats.collections_with_streaming++;
        aggregateStats.average_utilization_percent += parseFloat(stats.size_utilization_percent) || 0;
      }
    }
    
    if (validCollections > 0) {
      aggregateStats.average_utilization_percent /= validCollections;
    }
    
    return {
      individual_collections: allStats,
      aggregate_statistics: aggregateStats,
      generated_at: new Date()
    };
  }

  // Real-time streaming client management
  createTailableStream(collectionName, filter = {}, options = {}) {
    console.log(`Creating tailable stream for: ${collectionName}`);
    
    const collectionData = this.collections.get(collectionName);
    if (!collectionData || !collectionData.config.streaming) {
      throw new Error(`Collection ${collectionName} is not configured for streaming`);
    }
    
    const collection = collectionData.collection;
    
    // Create tailable cursor with real-time options
    const tailableOptions = {
      tailable: true,
      awaitData: true,
      noCursorTimeout: true,
      maxTimeMS: 0,
      ...options
    };
    
    const cursor = collection.find(filter, tailableOptions);
    
    // Update streaming client count
    this.updateStreamingStats(collectionName, 'client_connected');
    
    return cursor;
  }

  // Utility methods for statistics and monitoring
  updateWriteStats(collectionName, eventData, error = null) {
    const collectionData = this.collections.get(collectionName);
    if (!collectionData) return;
    
    if (error) {
      // Handle error statistics
      collectionData.stats.errors = (collectionData.stats.errors || 0) + 1;
    } else {
      // Update write statistics
      collectionData.stats.documents_written++;
      collectionData.stats.last_write = new Date();
      
      if (eventData) {
        const eventSize = JSON.stringify(eventData).length;
        collectionData.stats.bytes_written += eventSize;
      }
    }
    
    // Update writes per second
    this.updateWritesPerSecond(collectionName);
  }

  updateWritesPerSecond(collectionName) {
    const now = Date.now();
    const key = `${collectionName}_${Math.floor(now / 1000)}`;
    
    if (!this.stats.writes_per_second.has(collectionName)) {
      this.stats.writes_per_second.set(collectionName, 0);
    }
    
    // Simple writes per second calculation
    this.stats.writes_per_second.set(
      collectionName, 
      this.stats.writes_per_second.get(collectionName) + 1
    );
    
    // Reset counter every second
    setTimeout(() => {
      this.stats.writes_per_second.set(collectionName, 0);
    }, 1000);
  }

  updateStreamingStats(collectionName, action) {
    const collectionData = this.collections.get(collectionName);
    if (!collectionData) return;
    
    switch (action) {
      case 'client_connected':
        collectionData.stats.streaming_clients++;
        break;
      case 'client_disconnected':
        collectionData.stats.streaming_clients = Math.max(0, collectionData.stats.streaming_clients - 1);
        break;
      case 'document_streamed':
        collectionData.stats.documents_streamed = (collectionData.stats.documents_streamed || 0) + 1;
        break;
      case 'streaming_error':
        collectionData.stats.streaming_errors = (collectionData.stats.streaming_errors || 0) + 1;
        break;
    }
  }

  // Alert and notification methods
  async triggerErrorAlert(logDocument) {
    console.log(`🚨 ERROR ALERT: ${logDocument.application} - ${logDocument.message}`);
    // Implement alerting logic (email, Slack, PagerDuty, etc.)
  }

  async triggerCriticalErrorAlert(errorDocument) {
    console.log(`🔥 CRITICAL ERROR: ${errorDocument.application} - ${errorDocument.error_type}`);
    // Implement critical alerting logic
  }

  async triggerHighCPUAlert(metricDocument) {
    console.log(`⚠️ HIGH CPU: ${metricDocument.host} - ${metricDocument.value}%`);
    // Implement system monitoring alerts
  }

  // Workflow triggers
  async triggerPurchaseWorkflow(eventDocument) {
    console.log(`💰 Purchase Event: User ${eventDocument.user_id} - Amount ${eventDocument.amount}`);
    // Implement purchase-related workflows
  }

  // Metrics updating methods
  async updateLogMetrics(logDocument) {
    // Update aggregated log metrics in real-time
    const metricsUpdate = {
      $inc: {
        [`hourly_logs.${new Date().getHours()}.${logDocument.level.toLowerCase()}`]: 1,
        [`application_logs.${logDocument.application}.${logDocument.level.toLowerCase()}`]: 1
      },
      $set: {
        last_updated: new Date()
      }
    };
    
    await this.db.collection('log_metrics').updateOne(
      { _id: 'real_time_metrics' },
      metricsUpdate,
      { upsert: true }
    );
  }

  async updateEventCounters(eventDocument) {
    // Update real-time event counters
    const counterUpdate = {
      $inc: {
        [`event_counts.${eventDocument.event_type}`]: 1,
        'total_events': 1
      },
      $set: {
        last_event: new Date(),
        last_event_type: eventDocument.event_type
      }
    };
    
    await this.db.collection('event_metrics').updateOne(
      { _id: 'real_time_counters' },
      counterUpdate,
      { upsert: true }
    );
  }

  async setupCollectionMonitoring(collectionName, collection, config) {
    // Setup monitoring for collection health and performance
    setInterval(async () => {
      try {
        const stats = await this.getCollectionStats(collectionName);
        
        // Check for potential issues
        if (stats.size_utilization_percent > 90) {
          console.warn(`⚠️ Collection ${collectionName} is ${stats.size_utilization_percent}% full`);
        }
        
        if (stats.writes_per_second === 0 && config.retention_hours < 24) {
          console.warn(`⚠️ No recent writes to ${collectionName}`);
        }
        
      } catch (error) {
        console.error(`Error monitoring ${collectionName}:`, error);
      }
    }, 60000); // Check every minute
  }
}

// Example usage: High-performance logging system setup
async function setupHighPerformanceLogging() {
  console.log('Setting up comprehensive high-performance logging system with capped collections...');
  
  const cappedManager = new AdvancedCappedCollectionManager(db);
  
  // Initialize all capped collections
  await cappedManager.initializeCappedCollections();
  
  // Example: High-volume application logging
  const logEntries = [
    {
      application: 'web-api',
      level: 'INFO',
      message: 'User authentication successful',
      user_id: '507f1f77bcf86cd799439011',
      session_id: 'sess_abc123',
      request_id: 'req_xyz789',
      source_ip: '192.168.1.100',
      user_agent: 'Mozilla/5.0...',
      request_method: 'POST',
      request_url: '/api/auth/login',
      response_status: 200,
      response_time_ms: 150,
      metadata: {
        login_method: 'email',
        ip_geolocation: 'US-CA',
        device_type: 'desktop'
      }
    },
    {
      application: 'background-worker',
      level: 'ERROR',
      message: 'Database connection timeout',
      error_type: 'DatabaseTimeout',
      error_code: 'DB_CONN_TIMEOUT',
      stack_trace: 'Error: Connection timeout...',
      job_id: 'job_456789',
      queue_name: 'high_priority',
      retry_attempt: 3,
      metadata: {
        connection_pool_size: 10,
        active_connections: 9,
        queue_size: 1500
      }
    },
    {
      application: 'payment-service',
      level: 'WARN',
      message: 'Payment processing took longer than expected',
      user_id: '507f1f77bcf86cd799439012',
      transaction_id: 'txn_abc456',
      payment_method: 'credit_card',
      amount: 99.99,
      currency: 'USD',
      processing_time_ms: 5500,
      metadata: {
        gateway: 'stripe',
        gateway_response_time: 4800,
        fraud_check_time: 700
      }
    }
  ];
  
  // Batch insert logs for maximum performance
  await cappedManager.logEventBatch('application_logs', logEntries, {
    batchId: 'batch_001',
    metadata: { source: 'demo', environment: 'production' }
  });
  
  // Example: Real-time event streaming
  const events = [
    {
      event_type: 'user_signup',
      user_id: '507f1f77bcf86cd799439013',
      email: 'user@example.com',
      signup_method: 'google_oauth',
      referrer: 'organic_search',
      metadata: {
        utm_source: 'google',
        utm_medium: 'organic',
        landing_page: '/pricing'
      }
    },
    {
      event_type: 'user_purchase',
      user_id: '507f1f77bcf86cd799439013',
      order_id: '507f1f77bcf86cd799439014',
      amount: 299.99,
      currency: 'USD',
      product_ids: ['prod_001', 'prod_002'],
      payment_method: 'stripe',
      metadata: {
        discount_applied: 50.00,
        coupon_code: 'SAVE50',
        affiliate_id: 'aff_123'
      }
    }
  ];
  
  await cappedManager.logEventBatch('event_stream', events);
  
  // Example: System metrics collection
  const metrics = [
    {
      metric_type: 'cpu_usage',
      host: 'web-server-01',
      value: 78.5,
      unit: 'percent',
      tags: ['production', 'web-tier']
    },
    {
      metric_type: 'memory_usage',
      host: 'web-server-01', 
      value: 6.2,
      unit: 'gb',
      tags: ['production', 'web-tier']
    },
    {
      metric_type: 'disk_io',
      host: 'db-server-01',
      value: 1250,
      unit: 'ops_per_second',
      tags: ['production', 'database-tier']
    }
  ];
  
  await cappedManager.logEventBatch('system_metrics', metrics);
  
  // Query recent events
  const recentErrors = await cappedManager.queryRecentEvents('error_logs', 
    { level: 'ERROR' }, 
    { limit: 100, since: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
  );
  
  console.log(`Found ${recentErrors.count} recent errors`);
  
  // Get comprehensive statistics
  const stats = await cappedManager.getAllCollectionStats();
  console.log('Capped Collections System Status:', JSON.stringify(stats.aggregate_statistics, null, 2));
  
  // Setup real-time streaming
  const logStream = cappedManager.createTailableStream('application_logs', 
    { level: { $in: ['ERROR', 'FATAL'] } }
  );
  
  console.log('Real-time error log streaming started...');
  
  return cappedManager;
}

// Benefits of MongoDB Capped Collections:
// - Fixed-size collections with automatic space management
// - Built-in circular buffer functionality for efficient storage utilization
// - Optimized for high-throughput write operations with minimal overhead
// - Tailable cursors for real-time streaming and event processing
// - Natural insertion order preservation without additional indexing
// - No fragmentation issues compared to traditional log rotation
// - Automatic old document removal without manual cleanup processes
// - Superior performance for append-only workloads like logging
// - Built-in MongoDB integration with replication and sharding support
// - SQL-compatible operations through QueryLeaf for familiar management

module.exports = {
  AdvancedCappedCollectionManager,
  setupHighPerformanceLogging
};
```

## Understanding MongoDB Capped Collections Architecture

### Advanced Circular Buffer Implementation and High-Throughput Patterns

Implement sophisticated capped collection patterns for production-scale logging systems:

```javascript
// Production-grade capped collection patterns for enterprise logging infrastructure
class EnterpriseCappedCollectionManager extends AdvancedCappedCollectionManager {
  constructor(db, enterpriseConfig) {
    super(db);
    
    this.enterpriseConfig = {
      multiTenant: enterpriseConfig.multiTenant || false,
      distributedLogging: enterpriseConfig.distributedLogging || false,
      compressionEnabled: enterpriseConfig.compressionEnabled || true,
      retentionPolicies: enterpriseConfig.retentionPolicies || {},
      alertingIntegration: enterpriseConfig.alertingIntegration || {},
      metricsExport: enterpriseConfig.metricsExport || {}
    };
    
    this.setupEnterpriseIntegrations();
  }

  async setupMultiTenantCappedCollections(tenants) {
    console.log('Setting up multi-tenant capped collection architecture...');
    
    const tenantCollections = new Map();
    
    for (const [tenantId, tenantConfig] of Object.entries(tenants)) {
      const tenantCollectionName = `logs_tenant_${tenantId}`;
      
      // Create tenant-specific capped collection
      const cappedConfig = {
        size: tenantConfig.logQuotaBytes || 128 * 1024 * 1024, // 128MB default
        max: tenantConfig.maxDocuments || 1000000,
        indexing: ['timestamp', 'level', 'application'],
        streaming: tenantConfig.streamingEnabled || false,
        compression: true,
        retention_hours: tenantConfig.retentionHours || 72
      };
      
      this.cappedConfigurations[tenantCollectionName] = cappedConfig;
      tenantCollections.set(tenantId, tenantCollectionName);
    }
    
    await this.initializeCappedCollections();
    return tenantCollections;
  }

  async setupDistributedLoggingAggregation(nodeConfigs) {
    console.log('Setting up distributed logging aggregation...');
    
    const aggregationStreams = {};
    
    for (const [nodeId, nodeConfig] of Object.entries(nodeConfigs)) {
      // Create aggregation stream for each distributed node
      aggregationStreams[`node_${nodeId}_aggregation`] = {
        sourceCollections: nodeConfig.sourceCollections,
        aggregationPipeline: [
          {
            $match: {
              timestamp: { $gte: new Date(Date.now() - 60000) }, // Last minute
              node_id: nodeId
            }
          },
          {
            $group: {
              _id: {
                minute: { $dateToString: { format: "%Y-%m-%d %H:%M", date: "$timestamp" } },
                level: "$level",
                application: "$application"
              },
              count: { $sum: 1 },
              first_occurrence: { $min: "$timestamp" },
              last_occurrence: { $max: "$timestamp" },
              sample_message: { $first: "$message" }
            }
          }
        ],
        targetCollection: `distributed_log_summary`,
        refreshInterval: 60000 // 1 minute
      };
    }
    
    return await this.implementAggregationStreams(aggregationStreams);
  }

  async setupLogRetentionPolicies(policies) {
    console.log('Setting up automated log retention policies...');
    
    const retentionTasks = {};
    
    for (const [collectionName, policy] of Object.entries(policies)) {
      retentionTasks[collectionName] = {
        retentionDays: policy.retentionDays,
        archiveToS3: policy.archiveToS3 || false,
        compressionLevel: policy.compressionLevel || 'standard',
        schedule: policy.schedule || '0 2 * * *', // Daily at 2 AM
        
        cleanupFunction: async () => {
          await this.executeRetentionPolicy(collectionName, policy);
        }
      };
    }
    
    return await this.scheduleRetentionTasks(retentionTasks);
  }

  async implementAdvancedStreaming(streamingConfigs) {
    console.log('Implementing advanced streaming capabilities...');
    
    const streamingServices = {};
    
    for (const [streamName, config] of Object.entries(streamingConfigs)) {
      streamingServices[streamName] = {
        sourceCollection: config.sourceCollection,
        filterPipeline: config.filterPipeline,
        transformFunction: config.transformFunction,
        destinations: config.destinations, // Kafka, Redis, WebSockets, etc.
        bufferSize: config.bufferSize || 1000,
        flushInterval: config.flushInterval || 1000,
        
        processor: async (documents) => {
          await this.processStreamingBatch(streamName, documents, config);
        }
      };
    }
    
    return await this.activateStreamingServices(streamingServices);
  }
}
```

## SQL-Style Capped Collection Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB capped collection operations and management:

```sql
-- QueryLeaf capped collection management with SQL-familiar syntax

-- Create high-performance capped collection for application logging
CREATE CAPPED COLLECTION application_logs (
  size = '1GB',
  max_documents = 10000000,
  
  -- Document structure (for documentation)
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  application VARCHAR(100) NOT NULL,
  environment VARCHAR(20) DEFAULT 'production',
  level VARCHAR(10) NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
  message TEXT NOT NULL,
  user_id UUID,
  session_id VARCHAR(100),
  request_id VARCHAR(100),
  
  -- Performance and context fields
  source_ip INET,
  user_agent TEXT,
  request_method VARCHAR(10),
  request_url TEXT,
  response_status INTEGER,
  response_time_ms INTEGER,
  
  -- Flexible metadata
  metadata JSONB,
  tags TEXT[]
)
WITH OPTIONS (
  write_concern = { w: 0 }, -- Maximum write performance
  tailable_cursors = true,  -- Enable real-time streaming
  compression = true,       -- Enable document compression
  streaming_enabled = true
);

-- Create real-time event stream capped collection
CREATE CAPPED COLLECTION event_stream (
  size = '512MB',
  max_documents = 5000000,
  
  -- Event structure
  event_type VARCHAR(100) NOT NULL,
  user_id UUID,
  session_id VARCHAR(100),
  event_data JSONB,
  
  -- Event context
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(50),
  environment VARCHAR(20),
  
  -- Event metadata
  correlation_id UUID,
  trace_id UUID,
  metadata JSONB
)
WITH OPTIONS (
  write_concern = { w: 0 },
  tailable_cursors = true,
  compression = false, -- Low latency over storage efficiency
  streaming_enabled = true,
  retention_hours = 24
);

-- Create system metrics capped collection
CREATE CAPPED COLLECTION system_metrics (
  size = '2GB', 
  max_documents = 20000000,
  
  -- Metrics structure
  metric_type VARCHAR(100) NOT NULL,
  host VARCHAR(100) NOT NULL,
  value DECIMAL(15,6) NOT NULL,
  unit VARCHAR(20),
  tags TEXT[],
  
  -- Timing information
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  collected_at TIMESTAMP,
  
  -- Metric metadata
  labels JSONB,
  metadata JSONB
)
WITH OPTIONS (
  write_concern = { w: 0 },
  tailable_cursors = true,
  compression = true,
  streaming_enabled = true,
  retention_hours = 168 -- 7 days
);

-- High-volume log insertion with optimized batch processing
INSERT INTO application_logs (
  application, environment, level, message, user_id, session_id, 
  request_id, source_ip, user_agent, request_method, request_url, 
  response_status, response_time_ms, metadata, tags
) VALUES 
-- Batch insert for maximum throughput
('web-api', 'production', 'INFO', 'User login successful', 
 '550e8400-e29b-41d4-a716-446655440000', 'sess_abc123', 'req_xyz789',
 '192.168.1.100', 'Mozilla/5.0...', 'POST', '/api/auth/login', 200, 150,
 JSON_OBJECT('login_method', 'email', 'ip_geolocation', 'US-CA', 'device_type', 'desktop'),
 ARRAY['authentication', 'user_activity']
),
('payment-service', 'production', 'WARN', 'Payment processing delay detected', 
 '550e8400-e29b-41d4-a716-446655440001', 'sess_def456', 'req_abc123',
 '192.168.1.101', 'Mobile App/1.2.3', 'POST', '/api/payments/process', 200, 3500,
 JSON_OBJECT('gateway', 'stripe', 'amount', 99.99, 'currency', 'USD', 'delay_reason', 'gateway_latency'),
 ARRAY['payments', 'performance', 'warning']
),
('background-worker', 'production', 'ERROR', 'Queue processing failure', 
 NULL, NULL, 'job_456789',
 NULL, NULL, NULL, NULL, NULL, NULL,
 JSON_OBJECT('queue_name', 'high_priority', 'job_type', 'email_sender', 'error_code', 'SMTP_TIMEOUT', 'retry_count', 3),
 ARRAY['background_job', 'error', 'email']
),
('web-api', 'production', 'DEBUG', 'Cache hit for user preferences', 
 '550e8400-e29b-41d4-a716-446655440002', 'sess_ghi789', 'req_def456',
 '192.168.1.102', 'React Native/1.0.0', 'GET', '/api/user/preferences', 200, 25,
 JSON_OBJECT('cache_key', 'user_prefs_12345', 'cache_ttl', 3600, 'hit_rate', 0.85),
 ARRAY['cache', 'performance', 'optimization']
)
WITH WRITE_OPTIONS (
  acknowledge = false,  -- No write acknowledgment for maximum throughput
  ordered = false,     -- Allow out-of-order inserts
  batch_size = 1000    -- Optimize batch size
);

-- Real-time event streaming insertion
INSERT INTO event_stream (
  event_type, user_id, session_id, event_data, source, 
  environment, correlation_id, trace_id, metadata
) VALUES 
('user_signup', '550e8400-e29b-41d4-a716-446655440003', 'sess_new123',
 JSON_OBJECT('email', 'newuser@example.com', 'signup_method', 'google_oauth', 'referrer', 'organic_search'),
 'web-application', 'production', UUID(), UUID(),
 JSON_OBJECT('utm_source', 'google', 'utm_medium', 'organic', 'landing_page', '/pricing')
),
('purchase_completed', '550e8400-e29b-41d4-a716-446655440003', 'sess_new123',
 JSON_OBJECT('order_id', '550e8400-e29b-41d4-a716-446655440004', 'amount', 299.99, 'currency', 'USD', 'items', 2),
 'web-application', 'production', UUID(), UUID(),
 JSON_OBJECT('payment_method', 'stripe', 'discount_applied', 50.00, 'coupon_code', 'SAVE50')
),
('api_call', '550e8400-e29b-41d4-a716-446655440005', 'sess_api789',
 JSON_OBJECT('endpoint', '/api/data/export', 'method', 'GET', 'response_size_bytes', 1048576),
 'mobile-app', 'production', UUID(), UUID(),
 JSON_OBJECT('app_version', '2.1.0', 'os', 'iOS', 'device_model', 'iPhone13')
);

-- System metrics batch insertion
INSERT INTO system_metrics (
  metric_type, host, value, unit, tags, collected_at, labels, metadata
) VALUES 
('cpu_usage', 'web-server-01', 78.5, 'percent', ARRAY['production', 'web-tier'], CURRENT_TIMESTAMP,
 JSON_OBJECT('instance_type', 'm5.large', 'az', 'us-east-1a'),
 JSON_OBJECT('cores', 2, 'architecture', 'x86_64')
),
('memory_usage', 'web-server-01', 6.2, 'gb', ARRAY['production', 'web-tier'], CURRENT_TIMESTAMP,
 JSON_OBJECT('total_memory', '8gb', 'instance_type', 'm5.large'),
 JSON_OBJECT('swap_usage', '0.1gb', 'buffer_cache', '1.2gb')
),
('disk_io_read', 'db-server-01', 1250, 'ops_per_second', ARRAY['production', 'database-tier'], CURRENT_TIMESTAMP,
 JSON_OBJECT('disk_type', 'ssd', 'size', '500gb'),
 JSON_OBJECT('queue_depth', 32, 'utilization', 0.85)
),
('network_throughput', 'web-server-01', 45.8, 'mbps', ARRAY['production', 'web-tier'], CURRENT_TIMESTAMP,
 JSON_OBJECT('interface', 'eth0', 'max_bandwidth', '1000mbps'),
 JSON_OBJECT('packets_per_second', 15000, 'error_rate', 0.001)
);

-- Advanced querying with natural ordering (capped collections maintain insertion order)
SELECT 
  timestamp,
  application,
  level,
  message,
  user_id,
  request_id,
  response_time_ms,
  
  -- Extract specific metadata fields
  JSON_EXTRACT(metadata, '$.login_method') as login_method,
  JSON_EXTRACT(metadata, '$.error_code') as error_code,
  JSON_EXTRACT(metadata, '$.gateway') as payment_gateway,
  
  -- Categorize response times
  CASE 
    WHEN response_time_ms IS NULL THEN 'N/A'
    WHEN response_time_ms <= 100 THEN 'fast'
    WHEN response_time_ms <= 500 THEN 'acceptable' 
    WHEN response_time_ms <= 2000 THEN 'slow'
    ELSE 'very_slow'
  END as performance_category,
  
  -- Extract tags as comma-separated string
  ARRAY_TO_STRING(tags, ', ') as tag_list

FROM application_logs
WHERE 
  -- Query recent logs (capped collections are optimized for recent data)
  timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  
  -- Filter by log level
  AND level IN ('ERROR', 'WARN', 'FATAL')
  
  -- Filter by application
  AND application IN ('web-api', 'payment-service', 'background-worker')
  
  -- Filter by performance issues
  AND (response_time_ms > 1000 OR level = 'ERROR')

ORDER BY 
  -- Natural order is most efficient for capped collections
  timestamp DESC

LIMIT 1000;

-- Real-time streaming query with tailable cursor
SELECT 
  event_type,
  user_id,
  session_id,
  timestamp,
  
  -- Extract event-specific data
  JSON_EXTRACT(event_data, '$.email') as user_email,
  JSON_EXTRACT(event_data, '$.amount') as transaction_amount,
  JSON_EXTRACT(event_data, '$.order_id') as order_id,
  JSON_EXTRACT(event_data, '$.endpoint') as api_endpoint,
  
  -- Extract metadata
  JSON_EXTRACT(metadata, '$.utm_source') as traffic_source,
  JSON_EXTRACT(metadata, '$.payment_method') as payment_method,
  JSON_EXTRACT(metadata, '$.app_version') as app_version,
  
  -- Event categorization
  CASE 
    WHEN event_type LIKE '%signup%' THEN 'user_acquisition'
    WHEN event_type LIKE '%purchase%' THEN 'monetization'
    WHEN event_type LIKE '%api%' THEN 'api_usage'
    ELSE 'other'
  END as event_category

FROM event_stream
WHERE 
  -- Real-time event processing (last few minutes)
  timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
  
  -- Focus on high-value events
  AND (
    event_type IN ('user_signup', 'purchase_completed', 'subscription_upgraded')
    OR JSON_EXTRACT(event_data, '$.amount')::DECIMAL > 100
  )

ORDER BY timestamp DESC

-- Enable tailable cursor for real-time streaming
WITH CURSOR_OPTIONS (
  tailable = true,
  await_data = true,
  no_cursor_timeout = true
);

-- Aggregated metrics analysis from system_metrics capped collection
WITH recent_metrics AS (
  SELECT 
    metric_type,
    host,
    value,
    unit,
    timestamp,
    JSON_EXTRACT(labels, '$.instance_type') as instance_type,
    JSON_EXTRACT(labels, '$.az') as availability_zone,
    
    -- Time bucketing for aggregation
    DATE_TRUNC('minute', timestamp) as minute_bucket
    
  FROM system_metrics
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
),

aggregated_metrics AS (
  SELECT 
    minute_bucket,
    metric_type,
    host,
    instance_type,
    availability_zone,
    
    -- Statistical aggregations
    COUNT(*) as sample_count,
    AVG(value) as avg_value,
    MIN(value) as min_value,
    MAX(value) as max_value,
    STDDEV(value) as stddev_value,
    
    -- Percentile calculations
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY value) as p50_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95_value,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99_value,
    
    -- Trend analysis
    value - LAG(AVG(value)) OVER (
      PARTITION BY metric_type, host 
      ORDER BY minute_bucket
    ) as change_from_previous,
    
    -- Moving averages
    AVG(AVG(value)) OVER (
      PARTITION BY metric_type, host 
      ORDER BY minute_bucket 
      ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
    ) as rolling_5min_avg
    
  FROM recent_metrics
  GROUP BY minute_bucket, metric_type, host, instance_type, availability_zone
)

SELECT 
  minute_bucket,
  metric_type,
  host,
  instance_type,
  availability_zone,
  
  -- Formatted metrics
  ROUND(avg_value::NUMERIC, 2) as avg_value,
  ROUND(p95_value::NUMERIC, 2) as p95_value,
  ROUND(rolling_5min_avg::NUMERIC, 2) as rolling_avg,
  
  -- Alert conditions
  CASE 
    WHEN metric_type = 'cpu_usage' AND avg_value > 80 THEN 'HIGH_CPU'
    WHEN metric_type = 'memory_usage' AND avg_value > 7 THEN 'HIGH_MEMORY'  
    WHEN metric_type = 'disk_io_read' AND avg_value > 2000 THEN 'HIGH_DISK_IO'
    WHEN metric_type = 'network_throughput' AND avg_value > 800 THEN 'HIGH_NETWORK'
    ELSE 'NORMAL'
  END as alert_status,
  
  -- Trend indicators
  CASE 
    WHEN change_from_previous > rolling_5min_avg * 0.2 THEN 'INCREASING'
    WHEN change_from_previous < rolling_5min_avg * -0.2 THEN 'DECREASING'
    ELSE 'STABLE'
  END as trend,
  
  sample_count,
  CURRENT_TIMESTAMP as analysis_time

FROM aggregated_metrics
ORDER BY minute_bucket DESC, metric_type, host;

-- Capped collection maintenance and monitoring
SELECT 
  collection_name,
  is_capped,
  max_size_bytes,
  max_documents,
  current_size_bytes,
  current_document_count,
  
  -- Utilization calculations
  ROUND((current_size_bytes::FLOAT / max_size_bytes * 100)::NUMERIC, 2) as size_utilization_percent,
  ROUND((current_document_count::FLOAT / max_documents * 100)::NUMERIC, 2) as document_utilization_percent,
  
  -- Efficiency metrics
  ROUND((current_size_bytes::FLOAT / current_document_count)::NUMERIC, 0) as avg_document_size_bytes,
  
  -- Storage projections
  CASE 
    WHEN size_utilization_percent > 90 THEN 'NEAR_CAPACITY'
    WHEN size_utilization_percent > 75 THEN 'HIGH_UTILIZATION'
    WHEN size_utilization_percent > 50 THEN 'MODERATE_UTILIZATION'  
    ELSE 'LOW_UTILIZATION'
  END as capacity_status,
  
  -- Recommendations
  CASE 
    WHEN size_utilization_percent > 95 THEN 'Consider increasing collection size'
    WHEN document_utilization_percent > 95 THEN 'Consider increasing max document limit'
    WHEN size_utilization_percent < 25 AND current_document_count > 1000 THEN 'Collection may be over-provisioned'
    ELSE 'Optimal configuration'
  END as recommendation

FROM INFORMATION_SCHEMA.CAPPED_COLLECTIONS
WHERE collection_name IN ('application_logs', 'event_stream', 'system_metrics')
ORDER BY size_utilization_percent DESC;

-- Real-time log analysis with streaming aggregation
CREATE STREAMING VIEW log_error_rates AS
SELECT 
  application,
  level,
  DATE_TRUNC('minute', timestamp) as minute_bucket,
  
  -- Error rate calculations
  COUNT(*) as total_logs,
  COUNT(*) FILTER (WHERE level IN ('ERROR', 'FATAL')) as error_count,
  ROUND(
    (COUNT(*) FILTER (WHERE level IN ('ERROR', 'FATAL'))::FLOAT / COUNT(*) * 100)::NUMERIC, 
    2
  ) as error_rate_percent,
  
  -- Performance metrics  
  AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL) as avg_response_time,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL) as p95_response_time,
  
  -- Request analysis
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
  COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) as unique_sessions,
  
  -- Status code distribution
  COUNT(*) FILTER (WHERE response_status BETWEEN 200 AND 299) as success_count,
  COUNT(*) FILTER (WHERE response_status BETWEEN 400 AND 499) as client_error_count,
  COUNT(*) FILTER (WHERE response_status BETWEEN 500 AND 599) as server_error_count,
  
  CURRENT_TIMESTAMP as computed_at

FROM application_logs
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
GROUP BY application, level, minute_bucket
WITH REFRESH INTERVAL 30 SECONDS;

-- Cleanup and maintenance operations for capped collections
-- Note: Capped collections automatically manage space, but monitoring is still important

-- Monitor capped collection health
WITH collection_health AS (
  SELECT 
    'application_logs' as collection_name,
    COUNT(*) as current_documents,
    MIN(timestamp) as oldest_document,
    MAX(timestamp) as newest_document,
    MAX(timestamp) - MIN(timestamp) as time_span,
    AVG(LENGTH(CAST(message AS TEXT))) as avg_message_length
  FROM application_logs
  
  UNION ALL
  
  SELECT 
    'event_stream' as collection_name,
    COUNT(*) as current_documents,
    MIN(timestamp) as oldest_document, 
    MAX(timestamp) as newest_document,
    MAX(timestamp) - MIN(timestamp) as time_span,
    AVG(LENGTH(CAST(event_data AS TEXT))) as avg_event_size
  FROM event_stream
  
  UNION ALL
  
  SELECT 
    'system_metrics' as collection_name,
    COUNT(*) as current_documents,
    MIN(timestamp) as oldest_document,
    MAX(timestamp) as newest_document, 
    MAX(timestamp) - MIN(timestamp) as time_span,
    AVG(LENGTH(CAST(labels AS TEXT))) as avg_label_size
  FROM system_metrics
)

SELECT 
  collection_name,
  current_documents,
  oldest_document,
  newest_document,
  
  -- Time span analysis
  EXTRACT(DAYS FROM time_span) as retention_days,
  EXTRACT(HOURS FROM time_span) as retention_hours,
  
  -- Document characteristics
  ROUND(avg_message_length::NUMERIC, 0) as avg_content_size,
  
  -- Health indicators
  CASE 
    WHEN oldest_document > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 'HIGH_TURNOVER'
    WHEN oldest_document > CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 'NORMAL_TURNOVER'  
    ELSE 'LOW_TURNOVER'
  END as turnover_rate,
  
  -- Efficiency assessment
  CASE 
    WHEN current_documents < 1000 THEN 'UNDERUTILIZED'
    WHEN EXTRACT(HOURS FROM time_span) < 1 THEN 'VERY_HIGH_VOLUME'
    WHEN EXTRACT(HOURS FROM time_span) < 12 THEN 'HIGH_VOLUME'
    ELSE 'NORMAL_VOLUME'
  END as volume_assessment

FROM collection_health
ORDER BY current_documents DESC;

-- QueryLeaf provides comprehensive capped collection capabilities:
-- 1. SQL-familiar syntax for MongoDB capped collection creation and management
-- 2. High-performance batch insertion with optimized write concerns
-- 3. Real-time streaming queries with tailable cursor support
-- 4. Advanced aggregation and analytics on circular buffer data
-- 5. Automated monitoring and health assessment of capped collections
-- 6. Streaming materialized views for real-time log analysis
-- 7. Natural insertion order querying without additional indexing overhead
-- 8. Integrated alerting and threshold monitoring for operational intelligence
-- 9. Multi-tenant and enterprise-scale capped collection management
-- 10. Built-in space management with circular buffer efficiency patterns
```

## Best Practices for Capped Collection Implementation

### High-Performance Logging Design

Essential principles for effective capped collection deployment:

1. **Size Planning**: Calculate appropriate collection sizes based on expected throughput and retention requirements
2. **Write Optimization**: Use unacknowledged writes (w:0) for maximum throughput in logging scenarios
3. **Query Patterns**: Leverage natural insertion order for efficient time-based queries
4. **Streaming Integration**: Implement tailable cursors for real-time log processing and analysis
5. **Monitoring Strategy**: Track collection utilization and performance metrics continuously
6. **Retention Management**: Design retention policies that align with business and compliance requirements

### Production Deployment Strategies

Optimize capped collection deployments for enterprise environments:

1. **Capacity Planning**: Model storage requirements based on peak logging volumes and retention needs
2. **Performance Tuning**: Configure appropriate write concerns and batch sizes for optimal throughput
3. **Monitoring Integration**: Implement comprehensive monitoring for collection health and performance
4. **Backup Strategy**: Design backup approaches that account for continuous data rotation
5. **Multi-tenant Architecture**: Implement tenant isolation strategies for shared logging infrastructure
6. **Disaster Recovery**: Plan for collection recreation and historical data restoration procedures

## Conclusion

MongoDB capped collections provide an elegant and efficient solution for high-throughput logging, event streaming, and fixed-size data management scenarios where traditional database approaches struggle with performance and storage management complexity. The built-in circular buffer functionality, combined with optimized write performance and real-time streaming capabilities, makes capped collections ideal for modern applications requiring high-volume data ingestion with predictable storage characteristics.

Key MongoDB Capped Collections benefits include:

- **Fixed-Size Storage**: Automatic space management with predictable storage utilization
- **High-Throughput Writes**: Optimized for append-only workloads with minimal performance overhead  
- **Natural Ordering**: Preservation of insertion order without additional indexing requirements
- **Real-time Streaming**: Native tailable cursor support for live data processing
- **Circular Buffer Efficiency**: Automatic old document removal without manual maintenance processes
- **SQL Compatibility**: Familiar SQL-style operations through QueryLeaf integration for accessible management

Whether you're building high-performance logging systems, real-time event processing platforms, system monitoring solutions, or any application requiring efficient circular buffer functionality, MongoDB capped collections with QueryLeaf's familiar SQL interface provide the foundation for scalable, maintainable data management.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB capped collection operations while providing SQL-familiar syntax for collection creation, high-volume data insertion, real-time streaming, and monitoring. Advanced capped collection patterns, tailable cursors, and circular buffer management are seamlessly accessible through familiar SQL constructs, making high-performance logging both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's robust capped collection capabilities with SQL-style operations makes it an ideal platform for applications requiring high-throughput data ingestion and efficient storage management, ensuring your logging and event streaming solutions can scale effectively while maintaining predictable performance characteristics as data volumes grow.