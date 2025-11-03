---
title: "MongoDB Capped Collections: Fixed-Size High-Performance Logging and Data Streaming for Real-Time Applications"
description: "Master MongoDB capped collections for high-performance logging, real-time data streaming, and circular buffer implementations. Learn advanced patterns for event streaming, audit trails, and high-throughput data capture with SQL-familiar syntax."
date: 2025-11-02
tags: [mongodb, capped-collections, logging, streaming, circular-buffer, performance, sql]
---

# MongoDB Capped Collections: Fixed-Size High-Performance Logging and Data Streaming for Real-Time Applications

Real-time applications require efficient data structures for continuous data capture, event streaming, and high-frequency logging without the overhead of traditional database management. Conventional database approaches struggle with scenarios requiring sustained high-throughput writes, automatic old data removal, and guaranteed insertion order preservation, often leading to performance degradation, storage bloat, and complex maintenance procedures in production environments.

MongoDB capped collections provide native fixed-size, high-performance data structures that maintain insertion order and automatically remove old documents when storage limits are reached. Unlike traditional database logging solutions that require complex archival processes and performance-degrading maintenance operations, MongoDB capped collections deliver consistent high-throughput writes, predictable storage usage, and automatic data lifecycle management through optimized storage allocation and write-optimized data structures.

## The Traditional High-Performance Logging Challenge

Conventional database logging approaches often encounter significant performance and maintenance challenges:

```sql
-- Traditional PostgreSQL high-performance logging - complex maintenance and performance issues

-- Basic application logging table with growing maintenance complexity
CREATE TABLE application_logs (
    log_id BIGSERIAL PRIMARY KEY,
    application_name VARCHAR(100) NOT NULL,
    log_level VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message TEXT NOT NULL,
    
    -- Additional context fields
    user_id BIGINT,
    session_id VARCHAR(100),
    request_id VARCHAR(100),
    
    -- Performance metadata
    duration_ms INTEGER,
    memory_usage_mb DECIMAL(8,2),
    cpu_usage_percent DECIMAL(5,2),
    
    -- Log metadata
    thread_id INTEGER,
    process_id INTEGER,
    hostname VARCHAR(100),
    
    -- Complex indexing for performance
    CONSTRAINT valid_log_level CHECK (log_level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'))
);

-- Multiple indexes required for different query patterns - increasing maintenance overhead
CREATE INDEX idx_logs_timestamp ON application_logs(timestamp DESC);
CREATE INDEX idx_logs_level_timestamp ON application_logs(log_level, timestamp DESC);
CREATE INDEX idx_logs_app_timestamp ON application_logs(application_name, timestamp DESC);
CREATE INDEX idx_logs_user_timestamp ON application_logs(user_id, timestamp DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_logs_session_timestamp ON application_logs(session_id, timestamp DESC) WHERE session_id IS NOT NULL;

-- Complex partitioning strategy for log table management
CREATE TABLE application_logs_2024_01 (
    CHECK (timestamp >= '2024-01-01' AND timestamp < '2024-02-01')
) INHERITS (application_logs);

CREATE TABLE application_logs_2024_02 (
    CHECK (timestamp >= '2024-02-01' AND timestamp < '2024-03-01')
) INHERITS (application_logs);

-- Monthly partition maintenance (complex and error-prone)
CREATE OR REPLACE FUNCTION create_monthly_log_partition()
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    start_date := DATE_TRUNC('month', CURRENT_DATE);
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'application_logs_' || TO_CHAR(start_date, 'YYYY_MM');
    
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            CHECK (timestamp >= %L AND timestamp < %L)
        ) INHERITS (application_logs)', 
        partition_name, start_date, end_date);
    
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS %I ON %I(timestamp DESC)',
        'idx_' || partition_name || '_timestamp', partition_name);
END;
$$ LANGUAGE plpgsql;

-- Automated cleanup process with significant performance impact
CREATE OR REPLACE FUNCTION cleanup_old_logs(retention_days INTEGER DEFAULT 90)
RETURNS TABLE(
    deleted_count BIGINT,
    cleanup_duration_ms BIGINT,
    affected_partitions TEXT[]
) AS $$
DECLARE
    cutoff_date TIMESTAMP;
    partition_record RECORD;
    total_deleted BIGINT := 0;
    start_time TIMESTAMP := clock_timestamp();
    affected_partitions TEXT[] := '{}';
BEGIN
    cutoff_date := CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;
    
    -- Delete from main table (expensive operation)
    DELETE FROM ONLY application_logs 
    WHERE timestamp < cutoff_date;
    
    GET DIAGNOSTICS total_deleted = ROW_COUNT;
    
    -- Handle partitioned tables
    FOR partition_record IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'application_logs_%'
        AND tablename ~ '^\d{4}_\d{2}$'
    LOOP
        -- Check if entire partition can be dropped
        EXECUTE format('
            SELECT COUNT(*) 
            FROM %I.%I 
            WHERE timestamp >= %L',
            partition_record.schemaname,
            partition_record.tablename,
            cutoff_date
        );
        
        -- Complex logic to determine drop vs cleanup
        IF FOUND THEN
            EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE',
                partition_record.schemaname, partition_record.tablename);
            affected_partitions := affected_partitions || partition_record.tablename;
        ELSE
            -- Partial cleanup within partition (expensive)
            EXECUTE format('
                DELETE FROM %I.%I WHERE timestamp < %L',
                partition_record.schemaname, partition_record.tablename, cutoff_date);
        END IF;
    END LOOP;
    
    -- Vacuum and reindex (significant performance impact)
    VACUUM ANALYZE application_logs;
    REINDEX TABLE application_logs;
    
    RETURN QUERY SELECT 
        total_deleted,
        EXTRACT(MILLISECONDS FROM clock_timestamp() - start_time)::BIGINT,
        affected_partitions;
END;
$$ LANGUAGE plpgsql;

-- High-frequency insert procedure with limited performance optimization
CREATE OR REPLACE FUNCTION batch_insert_logs(log_entries JSONB[])
RETURNS TABLE(
    inserted_count INTEGER,
    failed_count INTEGER,
    processing_time_ms INTEGER
) AS $$
DECLARE
    log_entry JSONB;
    success_count INTEGER := 0;
    error_count INTEGER := 0;
    start_time TIMESTAMP := clock_timestamp();
    temp_table_name TEXT := 'temp_log_batch_' || extract(epoch from now())::INTEGER;
BEGIN
    
    -- Create temporary table for batch processing
    EXECUTE format('
        CREATE TEMP TABLE %I (
            application_name VARCHAR(100),
            log_level VARCHAR(20),
            timestamp TIMESTAMP,
            message TEXT,
            user_id BIGINT,
            session_id VARCHAR(100),
            request_id VARCHAR(100),
            duration_ms INTEGER,
            memory_usage_mb DECIMAL(8,2),
            thread_id INTEGER,
            hostname VARCHAR(100)
        )', temp_table_name);
    
    -- Process each log entry individually (inefficient for high volume)
    FOREACH log_entry IN ARRAY log_entries
    LOOP
        BEGIN
            EXECUTE format('
                INSERT INTO %I (
                    application_name, log_level, timestamp, message,
                    user_id, session_id, request_id, duration_ms,
                    memory_usage_mb, thread_id, hostname
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                temp_table_name
            ) USING 
                log_entry->>'application_name',
                log_entry->>'log_level',
                (log_entry->>'timestamp')::TIMESTAMP,
                log_entry->>'message',
                (log_entry->>'user_id')::BIGINT,
                log_entry->>'session_id',
                log_entry->>'request_id',
                (log_entry->>'duration_ms')::INTEGER,
                (log_entry->>'memory_usage_mb')::DECIMAL(8,2),
                (log_entry->>'thread_id')::INTEGER,
                log_entry->>'hostname';
                
            success_count := success_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            -- Limited error handling for high-frequency operations
            CONTINUE;
        END;
    END LOOP;
    
    -- Batch insert into main table (still limited by indexing overhead)
    EXECUTE format('
        INSERT INTO application_logs (
            application_name, log_level, timestamp, message,
            user_id, session_id, request_id, duration_ms,
            memory_usage_mb, thread_id, hostname
        )
        SELECT * FROM %I', temp_table_name);
    
    -- Cleanup
    EXECUTE format('DROP TABLE %I', temp_table_name);
    
    RETURN QUERY SELECT 
        success_count,
        error_count,
        EXTRACT(MILLISECONDS FROM clock_timestamp() - start_time)::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Real-time event streaming table with performance limitations
CREATE TABLE event_stream (
    event_id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id BIGINT,
    session_id VARCHAR(100),
    
    -- Event payload (limited JSON support)
    event_data JSONB,
    
    -- Stream metadata
    stream_partition VARCHAR(50),
    sequence_number BIGINT,
    
    -- Processing metadata
    processing_status VARCHAR(20) DEFAULT 'pending',
    processed_at TIMESTAMP,
    processor_id VARCHAR(100)
);

-- Complex trigger for sequence number management
CREATE OR REPLACE FUNCTION update_sequence_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.sequence_number := nextval('event_stream_sequence');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_stream_sequence_trigger
    BEFORE INSERT ON event_stream
    FOR EACH ROW
    EXECUTE FUNCTION update_sequence_number();

-- Performance monitoring with complex aggregations
WITH log_performance_analysis AS (
    SELECT 
        application_name,
        log_level,
        DATE_TRUNC('hour', timestamp) as hour_bucket,
        COUNT(*) as log_count,
        
        -- Complex aggregations causing performance issues
        AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms ELSE NULL END) as avg_duration,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration,
        AVG(CASE WHEN memory_usage_mb IS NOT NULL THEN memory_usage_mb ELSE NULL END) as avg_memory_usage,
        
        -- Storage analysis
        SUM(LENGTH(message)) as total_message_bytes,
        AVG(LENGTH(message)) as avg_message_length,
        
        -- Performance degradation over time
        COUNT(*) / EXTRACT(EPOCH FROM INTERVAL '1 hour') as logs_per_second
        
    FROM application_logs
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    GROUP BY application_name, log_level, DATE_TRUNC('hour', timestamp)
),
storage_growth_analysis AS (
    -- Complex storage growth calculations
    SELECT 
        DATE_TRUNC('day', timestamp) as day_bucket,
        COUNT(*) as daily_logs,
        SUM(LENGTH(message) + COALESCE(LENGTH(session_id), 0) + COALESCE(LENGTH(request_id), 0)) as daily_storage_bytes,
        
        -- Growth projections (expensive calculations)
        LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('day', timestamp)) as prev_day_logs,
        LAG(SUM(LENGTH(message) + COALESCE(LENGTH(session_id), 0) + COALESCE(LENGTH(request_id), 0))) OVER (ORDER BY DATE_TRUNC('day', timestamp)) as prev_day_bytes
        
    FROM application_logs
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    GROUP BY DATE_TRUNC('day', timestamp)
)
SELECT 
    lpa.application_name,
    lpa.log_level,
    lpa.hour_bucket,
    lpa.log_count,
    
    -- Performance metrics
    ROUND(lpa.avg_duration, 2) as avg_duration_ms,
    ROUND(lpa.p95_duration, 2) as p95_duration_ms,
    ROUND(lpa.logs_per_second, 2) as throughput_logs_per_second,
    
    -- Storage efficiency
    ROUND(lpa.total_message_bytes / 1024.0 / 1024.0, 2) as message_storage_mb,
    ROUND(lpa.avg_message_length, 0) as avg_message_length,
    
    -- Growth indicators
    sga.daily_logs,
    ROUND(sga.daily_storage_bytes / 1024.0 / 1024.0, 2) as daily_storage_mb,
    
    -- Growth rate calculations (complex and expensive)
    CASE 
        WHEN sga.prev_day_logs IS NOT NULL THEN
            ROUND(((sga.daily_logs - sga.prev_day_logs) / sga.prev_day_logs::DECIMAL * 100), 1)
        ELSE NULL
    END as daily_log_growth_percent,
    
    CASE 
        WHEN sga.prev_day_bytes IS NOT NULL THEN
            ROUND(((sga.daily_storage_bytes - sga.prev_day_bytes) / sga.prev_day_bytes::DECIMAL * 100), 1)
        ELSE NULL
    END as daily_storage_growth_percent

FROM log_performance_analysis lpa
JOIN storage_growth_analysis sga ON DATE_TRUNC('day', lpa.hour_bucket) = sga.day_bucket
WHERE lpa.log_count > 0
ORDER BY lpa.application_name, lpa.log_level, lpa.hour_bucket DESC;

-- Traditional logging approach problems:
-- 1. Unbounded storage growth requiring complex partitioning and archival
-- 2. Performance degradation as table size increases due to indexing overhead
-- 3. Complex maintenance procedures for partition management and cleanup
-- 4. High-frequency writes causing lock contention and performance bottlenecks
-- 5. Expensive aggregation queries for real-time monitoring and analytics
-- 6. Limited support for truly high-throughput event streaming scenarios
-- 7. Complex error handling and recovery mechanisms for batch processing
-- 8. Storage bloat and fragmentation issues requiring regular maintenance
-- 9. No guarantee of insertion order preservation under concurrent access
-- 10. Resource-intensive cleanup and archival processes impacting performance
```

MongoDB capped collections provide elegant fixed-size, high-performance data structures for logging and streaming:

```javascript
// MongoDB Capped Collections - high-performance logging and streaming with automatic size management
const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('high_performance_logging');

// Comprehensive MongoDB Capped Collections Manager
class CappedCollectionsManager {
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      // Default capped collection configurations
      defaultLogSize: config.defaultLogSize || 100 * 1024 * 1024, // 100MB
      defaultMaxDocuments: config.defaultMaxDocuments || 50000,
      
      // Performance optimization settings
      enableBulkOperations: config.enableBulkOperations !== false,
      enableAsyncOperations: config.enableAsyncOperations !== false,
      batchSize: config.batchSize || 1000,
      writeBufferSize: config.writeBufferSize || 16384,
      
      // Collection management
      enablePerformanceMonitoring: config.enablePerformanceMonitoring !== false,
      enableAutoOptimization: config.enableAutoOptimization !== false,
      enableMetricsCollection: config.enableMetricsCollection !== false,
      
      // Write concern and consistency
      writeConcern: config.writeConcern || {
        w: 1, // Fast writes for high-throughput logging
        j: false, // Disable journaling for maximum speed (trade-off with durability)
        wtimeout: 1000
      },
      
      // Advanced features
      enableTailableCursors: config.enableTailableCursors !== false,
      enableChangeStreams: config.enableChangeStreams !== false,
      enableRealTimeProcessing: config.enableRealTimeProcessing !== false,
      
      // Resource management
      maxConcurrentTails: config.maxConcurrentTails || 10,
      tailCursorTimeout: config.tailCursorTimeout || 30000,
      processingThreads: config.processingThreads || 4
    };
    
    // Collection references
    this.cappedCollections = new Map();
    this.tailableCursors = new Map();
    this.performanceMetrics = new Map();
    this.processingStats = {
      totalWrites: 0,
      totalReads: 0,
      averageWriteTime: 0,
      averageReadTime: 0,
      errorCount: 0
    };
    
    this.initializeCappedCollections();
  }

  async initializeCappedCollections() {
    console.log('Initializing capped collections for high-performance logging...');
    
    try {
      // Application logging with different retention strategies
      await this.createOptimizedCappedCollection('application_logs', {
        size: 200 * 1024 * 1024, // 200MB
        max: 100000, // Maximum 100k documents
        description: 'High-frequency application logs with automatic rotation'
      });
      
      // Real-time event streaming
      await this.createOptimizedCappedCollection('event_stream', {
        size: 500 * 1024 * 1024, // 500MB
        max: 250000, // Maximum 250k events
        description: 'Real-time event streaming with insertion order preservation'
      });
      
      // Performance metrics collection
      await this.createOptimizedCappedCollection('performance_metrics', {
        size: 100 * 1024 * 1024, // 100MB
        max: 50000, // Maximum 50k metric entries
        description: 'System performance metrics with circular buffer behavior'
      });
      
      // Audit trail with longer retention
      await this.createOptimizedCappedCollection('audit_trail', {
        size: 1024 * 1024 * 1024, // 1GB
        max: 1000000, // Maximum 1M audit entries
        description: 'Security audit trail with extended retention'
      });
      
      // User activity stream
      await this.createOptimizedCappedCollection('user_activity_stream', {
        size: 300 * 1024 * 1024, // 300MB
        max: 150000, // Maximum 150k activities
        description: 'User activity tracking with real-time processing'
      });
      
      // System health monitoring
      await this.createOptimizedCappedCollection('system_health_logs', {
        size: 150 * 1024 * 1024, // 150MB
        max: 75000, // Maximum 75k health checks
        description: 'System health monitoring with high-frequency updates'
      });
      
      // Initialize performance monitoring
      if (this.config.enablePerformanceMonitoring) {
        await this.setupPerformanceMonitoring();
      }
      
      // Setup real-time processing
      if (this.config.enableRealTimeProcessing) {
        await this.initializeRealTimeProcessing();
      }
      
      console.log('All capped collections initialized successfully');
      
    } catch (error) {
      console.error('Error initializing capped collections:', error);
      throw error;
    }
  }

  async createOptimizedCappedCollection(collectionName, options) {
    console.log(`Creating optimized capped collection: ${collectionName}...`);
    
    try {
      // Check if collection already exists
      const collections = await this.db.listCollections({ name: collectionName }).toArray();
      
      if (collections.length > 0) {
        // Collection exists - verify it's capped and get reference
        const collectionInfo = collections[0];
        if (!collectionInfo.options.capped) {
          throw new Error(`Collection ${collectionName} exists but is not capped`);
        }
        
        console.log(`Existing capped collection ${collectionName} found`);
        const collection = this.db.collection(collectionName);
        this.cappedCollections.set(collectionName, {
          collection: collection,
          options: collectionInfo.options,
          description: options.description
        });
        
      } else {
        // Create new capped collection
        const collection = await this.db.createCollection(collectionName, {
          capped: true,
          size: options.size,
          max: options.max,
          
          // Storage engine options for performance
          storageEngine: {
            wiredTiger: {
              configString: 'block_compressor=snappy' // Enable compression
            }
          }
        });
        
        // Create optimized indexes for capped collections
        await this.createCappedCollectionIndexes(collection, collectionName);
        
        this.cappedCollections.set(collectionName, {
          collection: collection,
          options: { capped: true, size: options.size, max: options.max },
          description: options.description,
          created: new Date()
        });
        
        console.log(`Created capped collection ${collectionName}: ${options.size} bytes, max ${options.max} documents`);
      }
      
    } catch (error) {
      console.error(`Error creating capped collection ${collectionName}:`, error);
      throw error;
    }
  }

  async createCappedCollectionIndexes(collection, collectionName) {
    console.log(`Creating optimized indexes for ${collectionName}...`);
    
    try {
      // Most capped collections benefit from a timestamp index for range queries
      // Note: Capped collections maintain insertion order, so _id is naturally ordered
      await collection.createIndex(
        { timestamp: -1 }, 
        { background: true, name: 'timestamp_desc' }
      );
      
      // Collection-specific indexes based on common query patterns
      switch (collectionName) {
        case 'application_logs':
          await collection.createIndexes([
            { key: { level: 1, timestamp: -1 }, background: true, name: 'level_timestamp' },
            { key: { application: 1, timestamp: -1 }, background: true, name: 'app_timestamp' },
            { key: { userId: 1 }, background: true, sparse: true, name: 'user_sparse' }
          ]);
          break;
          
        case 'event_stream':
          await collection.createIndexes([
            { key: { eventType: 1, timestamp: -1 }, background: true, name: 'event_type_timestamp' },
            { key: { userId: 1, timestamp: -1 }, background: true, sparse: true, name: 'user_timeline' },
            { key: { sessionId: 1 }, background: true, sparse: true, name: 'session_events' }
          ]);
          break;
          
        case 'performance_metrics':
          await collection.createIndexes([
            { key: { metricName: 1, timestamp: -1 }, background: true, name: 'metric_timeline' },
            { key: { hostname: 1, timestamp: -1 }, background: true, name: 'host_metrics' }
          ]);
          break;
          
        case 'audit_trail':
          await collection.createIndexes([
            { key: { action: 1, timestamp: -1 }, background: true, name: 'action_timeline' },
            { key: { userId: 1, timestamp: -1 }, background: true, name: 'user_audit' },
            { key: { resourceId: 1 }, background: true, sparse: true, name: 'resource_audit' }
          ]);
          break;
      }
      
    } catch (error) {
      console.error(`Error creating indexes for ${collectionName}:`, error);
      // Don't fail initialization for index creation issues
    }
  }

  async logApplicationEvent(application, level, message, metadata = {}) {
    const startTime = Date.now();
    
    try {
      const logCollection = this.cappedCollections.get('application_logs').collection;
      
      const logDocument = {
        timestamp: new Date(),
        application: application,
        level: level.toUpperCase(),
        message: message,
        
        // Enhanced metadata
        ...metadata,
        
        // System context
        hostname: metadata.hostname || require('os').hostname(),
        processId: process.pid,
        threadId: metadata.threadId,
        
        // Performance context
        memoryUsage: metadata.includeMemoryUsage ? process.memoryUsage() : undefined,
        
        // Request context
        requestId: metadata.requestId,
        sessionId: metadata.sessionId,
        userId: metadata.userId,
        
        // Application context
        version: metadata.version,
        environment: metadata.environment || process.env.NODE_ENV,
        
        // Timing information
        duration: metadata.duration,
        
        // Additional structured data
        tags: metadata.tags || [],
        customData: metadata.customData
      };
      
      // High-performance insert with minimal write concern
      const result = await logCollection.insertOne(logDocument, {
        writeConcern: this.config.writeConcern
      });
      
      // Update performance metrics
      this.updatePerformanceMetrics('application_logs', 'write', Date.now() - startTime);
      
      return {
        insertedId: result.insertedId,
        collection: 'application_logs',
        processingTime: Date.now() - startTime,
        logLevel: level,
        success: true
      };

    } catch (error) {
      console.error('Error logging application event:', error);
      this.processingStats.errorCount++;
      
      return {
        success: false,
        error: error.message,
        collection: 'application_logs',
        processingTime: Date.now() - startTime
      };
    }
  }

  async streamEvent(eventType, eventData, options = {}) {
    const startTime = Date.now();
    
    try {
      const streamCollection = this.cappedCollections.get('event_stream').collection;
      
      const eventDocument = {
        timestamp: new Date(),
        eventType: eventType,
        eventData: eventData,
        
        // Event metadata
        eventId: options.eventId || new ObjectId(),
        correlationId: options.correlationId,
        causationId: options.causationId,
        
        // User and session context
        userId: options.userId,
        sessionId: options.sessionId,
        
        // System context
        source: options.source || 'application',
        hostname: options.hostname || require('os').hostname(),
        
        // Event processing metadata
        priority: options.priority || 'normal',
        tags: options.tags || [],
        
        // Real-time processing flags
        requiresProcessing: options.requiresProcessing || false,
        processingStatus: options.processingStatus || 'pending',
        
        // Event relationships
        parentEventId: options.parentEventId,
        childEventIds: options.childEventIds || [],
        
        // Timing and sequence
        occurredAt: options.occurredAt || new Date(),
        sequenceNumber: options.sequenceNumber,
        
        // Custom event payload
        payload: eventData
      };

      // Insert event into capped collection
      const result = await streamCollection.insertOne(eventDocument, {
        writeConcern: this.config.writeConcern
      });
      
      // Trigger real-time processing if enabled
      if (this.config.enableRealTimeProcessing && eventDocument.requiresProcessing) {
        await this.triggerRealTimeProcessing(eventDocument);
      }
      
      // Update metrics
      this.updatePerformanceMetrics('event_stream', 'write', Date.now() - startTime);
      
      return {
        insertedId: result.insertedId,
        eventId: eventDocument.eventId,
        collection: 'event_stream',
        processingTime: Date.now() - startTime,
        success: true,
        sequenceOrder: result.insertedId // ObjectId provides natural ordering
      };

    } catch (error) {
      console.error('Error streaming event:', error);
      this.processingStats.errorCount++;
      
      return {
        success: false,
        error: error.message,
        collection: 'event_stream',
        processingTime: Date.now() - startTime
      };
    }
  }

  async recordPerformanceMetric(metricName, value, metadata = {}) {
    const startTime = Date.now();
    
    try {
      const metricsCollection = this.cappedCollections.get('performance_metrics').collection;
      
      const metricDocument = {
        timestamp: new Date(),
        metricName: metricName,
        value: value,
        
        // Metric metadata
        unit: metadata.unit || 'count',
        type: metadata.type || 'gauge', // gauge, counter, histogram, timer
        
        // System context
        hostname: metadata.hostname || require('os').hostname(),
        service: metadata.service || 'unknown',
        environment: metadata.environment || process.env.NODE_ENV,
        
        // Metric dimensions
        tags: metadata.tags || {},
        dimensions: metadata.dimensions || {},
        
        // Statistical data
        min: metadata.min,
        max: metadata.max,
        avg: metadata.avg,
        count: metadata.count,
        sum: metadata.sum,
        
        // Performance context
        duration: metadata.duration,
        sampleRate: metadata.sampleRate || 1.0,
        
        // Additional metadata
        source: metadata.source || 'system',
        category: metadata.category || 'performance',
        priority: metadata.priority || 'normal',
        
        // Custom data
        customMetadata: metadata.customMetadata
      };

      const result = await metricsCollection.insertOne(metricDocument, {
        writeConcern: this.config.writeConcern
      });
      
      // Update internal metrics
      this.updatePerformanceMetrics('performance_metrics', 'write', Date.now() - startTime);
      
      return {
        insertedId: result.insertedId,
        collection: 'performance_metrics',
        metricName: metricName,
        processingTime: Date.now() - startTime,
        success: true
      };

    } catch (error) {
      console.error('Error recording performance metric:', error);
      this.processingStats.errorCount++;
      
      return {
        success: false,
        error: error.message,
        collection: 'performance_metrics',
        processingTime: Date.now() - startTime
      };
    }
  }

  async createTailableCursor(collectionName, filter = {}, options = {}) {
    console.log(`Creating tailable cursor for ${collectionName}...`);
    
    try {
      const cappedCollection = this.cappedCollections.get(collectionName);
      if (!cappedCollection) {
        throw new Error(`Capped collection ${collectionName} not found`);
      }
      
      const collection = cappedCollection.collection;
      
      // Configure tailable cursor options
      const cursorOptions = {
        tailable: true,
        awaitData: true,
        noCursorTimeout: true,
        maxTimeMS: options.maxTimeMS || this.config.tailCursorTimeout,
        batchSize: options.batchSize || 100,
        ...options
      };
      
      // Create cursor starting from specified position or end
      let cursor;
      if (options.startFromEnd || options.startAfter) {
        if (options.startAfter) {
          filter._id = { $gt: options.startAfter };
        }
        cursor = collection.find(filter, cursorOptions);
      } else {
        // Start from beginning
        cursor = collection.find(filter, cursorOptions);
      }
      
      // Store cursor for management
      const cursorId = options.cursorId || new ObjectId().toString();
      this.tailableCursors.set(cursorId, {
        cursor: cursor,
        collection: collectionName,
        filter: filter,
        options: cursorOptions,
        created: new Date(),
        active: true
      });
      
      console.log(`Tailable cursor ${cursorId} created for ${collectionName}`);
      
      return {
        cursorId: cursorId,
        cursor: cursor,
        collection: collectionName,
        success: true
      };

    } catch (error) {
      console.error(`Error creating tailable cursor for ${collectionName}:`, error);
      return {
        success: false,
        error: error.message,
        collection: collectionName
      };
    }
  }

  async processTailableCursor(cursorId, processingFunction, options = {}) {
    console.log(`Starting tailable cursor processing for ${cursorId}...`);
    
    try {
      const cursorInfo = this.tailableCursors.get(cursorId);
      if (!cursorInfo) {
        throw new Error(`Tailable cursor ${cursorId} not found`);
      }
      
      const cursor = cursorInfo.cursor;
      const processingStats = {
        documentsProcessed: 0,
        errors: 0,
        startTime: new Date(),
        lastProcessedAt: null
      };
      
      // Process documents as they arrive
      while (await cursor.hasNext() && cursorInfo.active) {
        try {
          const document = await cursor.next();
          
          if (document) {
            // Process the document
            const processingStartTime = Date.now();
            await processingFunction(document, cursorInfo.collection);
            
            // Update statistics
            processingStats.documentsProcessed++;
            processingStats.lastProcessedAt = new Date();
            
            // Update performance metrics
            this.updatePerformanceMetrics(
              cursorInfo.collection, 
              'tail_process', 
              Date.now() - processingStartTime
            );
            
            // Batch processing optimization
            if (options.batchProcessing && processingStats.documentsProcessed % options.batchSize === 0) {
              await this.flushBatchProcessing(cursorId, options);
            }
          }
          
        } catch (processingError) {
          console.error(`Error processing document from cursor ${cursorId}:`, processingError);
          processingStats.errors++;
          
          // Handle processing errors based on configuration
          if (options.stopOnError) {
            break;
          }
        }
      }
      
      console.log(`Tailable cursor processing completed for ${cursorId}:`, processingStats);
      
      return {
        success: true,
        cursorId: cursorId,
        processingStats: processingStats
      };

    } catch (error) {
      console.error(`Error in tailable cursor processing for ${cursorId}:`, error);
      return {
        success: false,
        error: error.message,
        cursorId: cursorId
      };
    }
  }

  async bulkInsertLogs(collectionName, documents, options = {}) {
    console.log(`Performing bulk insert to ${collectionName} with ${documents.length} documents...`);
    const startTime = Date.now();
    
    try {
      const cappedCollection = this.cappedCollections.get(collectionName);
      if (!cappedCollection) {
        throw new Error(`Capped collection ${collectionName} not found`);
      }
      
      const collection = cappedCollection.collection;
      
      // Prepare documents with consistent structure
      const preparedDocuments = documents.map((doc, index) => ({
        ...doc,
        timestamp: doc.timestamp || new Date(),
        batchId: options.batchId || new ObjectId(),
        batchIndex: index,
        bulkInsertMetadata: {
          batchSize: documents.length,
          insertedAt: new Date(),
          source: options.source || 'bulk_operation'
        }
      }));
      
      // Configure bulk insert options for maximum performance
      const insertOptions = {
        ordered: options.ordered || false, // Unordered for better performance
        writeConcern: options.writeConcern || this.config.writeConcern,
        bypassDocumentValidation: options.bypassValidation || false
      };
      
      // Execute bulk insert
      const result = await collection.insertMany(preparedDocuments, insertOptions);
      
      // Update performance metrics
      const processingTime = Date.now() - startTime;
      this.updatePerformanceMetrics(collectionName, 'bulk_write', processingTime);
      this.processingStats.totalWrites += result.insertedCount;
      
      console.log(`Bulk insert completed: ${result.insertedCount} documents in ${processingTime}ms`);
      
      return {
        success: true,
        collection: collectionName,
        insertedCount: result.insertedCount,
        insertedIds: Object.values(result.insertedIds),
        processingTime: processingTime,
        throughput: Math.round((result.insertedCount / processingTime) * 1000), // docs/second
        batchId: options.batchId
      };

    } catch (error) {
      console.error(`Error in bulk insert to ${collectionName}:`, error);
      this.processingStats.errorCount++;
      
      return {
        success: false,
        error: error.message,
        collection: collectionName,
        processingTime: Date.now() - startTime
      };
    }
  }

  async queryRecentDocuments(collectionName, filter = {}, options = {}) {
    const startTime = Date.now();
    
    try {
      const cappedCollection = this.cappedCollections.get(collectionName);
      if (!cappedCollection) {
        throw new Error(`Capped collection ${collectionName} not found`);
      }
      
      const collection = cappedCollection.collection;
      
      // Configure query options for optimal performance
      const queryOptions = {
        sort: { $natural: options.reverse ? 1 : -1 }, // Natural order (insertion order)
        limit: options.limit || 1000,
        projection: options.projection || {},
        maxTimeMS: options.maxTimeMS || 5000,
        batchSize: options.batchSize || 100
      };
      
      // Add time range filter if specified
      if (options.timeRange) {
        filter.timestamp = {
          $gte: options.timeRange.start,
          $lte: options.timeRange.end || new Date()
        };
      }
      
      // Execute query
      const documents = await collection.find(filter, queryOptions).toArray();
      
      // Update performance metrics
      const processingTime = Date.now() - startTime;
      this.updatePerformanceMetrics(collectionName, 'read', processingTime);
      this.processingStats.totalReads += documents.length;
      
      return {
        success: true,
        collection: collectionName,
        documents: documents,
        count: documents.length,
        processingTime: processingTime,
        query: filter,
        options: queryOptions
      };

    } catch (error) {
      console.error(`Error querying ${collectionName}:`, error);
      this.processingStats.errorCount++;
      
      return {
        success: false,
        error: error.message,
        collection: collectionName,
        processingTime: Date.now() - startTime
      };
    }
  }

  updatePerformanceMetrics(collectionName, operationType, duration) {
    if (!this.config.enablePerformanceMonitoring) return;
    
    const key = `${collectionName}_${operationType}`;
    
    if (!this.performanceMetrics.has(key)) {
      this.performanceMetrics.set(key, {
        totalOperations: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        lastOperation: null
      });
    }
    
    const metrics = this.performanceMetrics.get(key);
    
    metrics.totalOperations++;
    metrics.totalTime += duration;
    metrics.averageTime = metrics.totalTime / metrics.totalOperations;
    metrics.minTime = Math.min(metrics.minTime, duration);
    metrics.maxTime = Math.max(metrics.maxTime, duration);
    metrics.lastOperation = new Date();
    
    // Update global stats
    if (operationType === 'write' || operationType === 'bulk_write') {
      this.processingStats.averageWriteTime = 
        (this.processingStats.averageWriteTime + duration) / 2;
    } else if (operationType === 'read') {
      this.processingStats.averageReadTime = 
        (this.processingStats.averageReadTime + duration) / 2;
    }
  }

  async getCollectionStats() {
    console.log('Gathering capped collection statistics...');
    
    const stats = {};
    
    for (const [collectionName, cappedInfo] of this.cappedCollections.entries()) {
      try {
        const collection = cappedInfo.collection;
        
        // Get MongoDB collection stats
        const mongoStats = await collection.stats();
        
        // Get performance metrics
        const performanceKey = `${collectionName}_write`;
        const performanceMetrics = this.performanceMetrics.get(performanceKey) || {};
        
        stats[collectionName] = {
          // Collection configuration
          configuration: cappedInfo.options,
          description: cappedInfo.description,
          created: cappedInfo.created,
          
          // MongoDB stats
          size: mongoStats.size,
          storageSize: mongoStats.storageSize,
          totalIndexSize: mongoStats.totalIndexSize,
          count: mongoStats.count,
          avgObjSize: mongoStats.avgObjSize,
          maxSize: mongoStats.maxSize,
          max: mongoStats.max,
          
          // Utilization metrics
          sizeUtilization: (mongoStats.size / mongoStats.maxSize * 100).toFixed(2) + '%',
          countUtilization: mongoStats.max ? (mongoStats.count / mongoStats.max * 100).toFixed(2) + '%' : 'N/A',
          
          // Performance metrics
          averageWriteTime: performanceMetrics.averageTime || 0,
          totalOperations: performanceMetrics.totalOperations || 0,
          minWriteTime: performanceMetrics.minTime === Infinity ? 0 : performanceMetrics.minTime || 0,
          maxWriteTime: performanceMetrics.maxTime || 0,
          lastOperation: performanceMetrics.lastOperation,
          
          // Health indicators
          isNearCapacity: mongoStats.size / mongoStats.maxSize > 0.8,
          hasRecentActivity: performanceMetrics.lastOperation && 
            (new Date() - performanceMetrics.lastOperation) < 300000, // 5 minutes
          
          // Estimated metrics
          estimatedDocumentsPerHour: this.estimateDocumentsPerHour(performanceMetrics),
          estimatedTimeToCapacity: this.estimateTimeToCapacity(mongoStats, performanceMetrics)
        };
        
      } catch (error) {
        stats[collectionName] = {
          error: error.message,
          available: false
        };
      }
    }
    
    return {
      collections: stats,
      globalStats: this.processingStats,
      summary: {
        totalCollections: this.cappedCollections.size,
        totalActiveCursors: this.tailableCursors.size,
        totalMemoryUsage: this.estimateMemoryUsage(),
        uptime: new Date() - this.startTime || new Date()
      }
    };
  }

  estimateDocumentsPerHour(performanceMetrics) {
    if (!performanceMetrics || !performanceMetrics.lastOperation) return 0;
    
    const hoursActive = (new Date() - (this.startTime || new Date())) / (1000 * 60 * 60);
    if (hoursActive === 0) return 0;
    
    return Math.round((performanceMetrics.totalOperations || 0) / hoursActive);
  }

  estimateTimeToCapacity(mongoStats, performanceMetrics) {
    if (!performanceMetrics || !performanceMetrics.totalOperations) return 'Unknown';
    
    const remainingSpace = mongoStats.maxSize - mongoStats.size;
    const averageDocSize = mongoStats.avgObjSize || 1000;
    const remainingDocuments = Math.floor(remainingSpace / averageDocSize);
    
    const documentsPerHour = this.estimateDocumentsPerHour(performanceMetrics);
    if (documentsPerHour === 0) return 'Unknown';
    
    const hoursToCapacity = remainingDocuments / documentsPerHour;
    
    if (hoursToCapacity < 24) {
      return `${Math.round(hoursToCapacity)} hours`;
    } else {
      return `${Math.round(hoursToCapacity / 24)} days`;
    }
  }

  estimateMemoryUsage() {
    // Rough estimate based on active cursors and performance metrics
    const baseMem = 50 * 1024 * 1024; // 50MB base
    const cursorMem = this.tailableCursors.size * 1024 * 1024; // 1MB per cursor
    const metricsMem = this.performanceMetrics.size * 10 * 1024; // 10KB per metric set
    
    return baseMem + cursorMem + metricsMem;
  }

  async shutdown() {
    console.log('Shutting down capped collections manager...');
    
    // Close all tailable cursors
    for (const [cursorId, cursorInfo] of this.tailableCursors.entries()) {
      try {
        cursorInfo.active = false;
        await cursorInfo.cursor.close();
        console.log(`Closed tailable cursor: ${cursorId}`);
      } catch (error) {
        console.error(`Error closing cursor ${cursorId}:`, error);
      }
    }
    
    // Clear collections and metrics
    this.cappedCollections.clear();
    this.tailableCursors.clear();
    this.performanceMetrics.clear();
    
    console.log('Capped collections manager shutdown complete');
  }
}

// Benefits of MongoDB Capped Collections:
// - Fixed-size storage with automatic old document removal (circular buffer behavior)
// - Guaranteed insertion order preservation for event sequencing
// - High-performance writes without index maintenance overhead
// - Optimal read performance for recent document queries
// - Built-in document rotation without external management
// - Tailable cursors for real-time data streaming
// - Memory-efficient operations with predictable resource usage
// - No fragmentation or storage bloat issues
// - Ideal for logging, event streaming, and real-time analytics
// - SQL-compatible operations through QueryLeaf integration

module.exports = {
  CappedCollectionsManager
};
```

## Understanding MongoDB Capped Collections Architecture

### Advanced High-Performance Logging and Streaming Patterns

Implement sophisticated capped collection strategies for production MongoDB deployments:

```javascript
// Production-ready MongoDB capped collections with advanced optimization and real-time processing
class ProductionCappedCollectionsManager extends CappedCollectionsManager {
  constructor(db, productionConfig) {
    super(db, productionConfig);
    
    this.productionConfig = {
      ...productionConfig,
      enableShardedDeployment: true,
      enableReplicationOptimization: true,
      enableAdvancedMonitoring: true,
      enableAutomaticSizing: true,
      enableCompression: true,
      enableRealTimeAlerts: true
    };
    
    this.setupProductionOptimizations();
    this.initializeAdvancedMonitoring();
    this.setupAutomaticManagement();
  }

  async implementShardedCappedCollections(collectionName, shardingStrategy) {
    console.log(`Implementing sharded capped collections for ${collectionName}...`);
    
    const shardingConfig = {
      // Shard key design for capped collections
      shardKey: shardingStrategy.shardKey || { timestamp: 1, hostname: 1 },
      
      // Chunk size optimization for high-throughput writes
      chunkSizeMB: shardingStrategy.chunkSize || 16,
      
      // Balancing strategy
      enableAutoSplit: true,
      enableBalancer: true,
      balancerWindowStart: "01:00",
      balancerWindowEnd: "06:00",
      
      // Write distribution
      enableEvenWriteDistribution: true,
      monitorHotShards: true,
      automaticRebalancing: true
    };

    return await this.deployShardedCappedCollection(collectionName, shardingConfig);
  }

  async setupAdvancedRealTimeProcessing() {
    console.log('Setting up advanced real-time processing for capped collections...');
    
    const processingPipeline = {
      // Stream processing configuration
      streamProcessing: {
        enableChangeStreams: true,
        enableAggregationPipelines: true,
        enableParallelProcessing: true,
        maxConcurrentProcessors: 8
      },
      
      // Real-time analytics
      realTimeAnalytics: {
        enableWindowedAggregations: true,
        windowSizes: ['1m', '5m', '15m', '1h'],
        enableTrendDetection: true,
        enableAnomalyDetection: true
      },
      
      // Event correlation
      eventCorrelation: {
        enableEventMatching: true,
        correlationTimeWindow: 300000, // 5 minutes
        enableComplexEventProcessing: true
      }
    };

    return await this.deployRealTimeProcessing(processingPipeline);
  }

  async implementAutomaticCapacityManagement() {
    console.log('Implementing automatic capacity management for capped collections...');
    
    const capacityManagement = {
      // Automatic sizing
      automaticSizing: {
        enableDynamicResize: true,
        growthThreshold: 0.8,  // 80% capacity
        shrinkThreshold: 0.3,  // 30% capacity
        maxSize: 10 * 1024 * 1024 * 1024, // 10GB max
        minSize: 100 * 1024 * 1024 // 100MB min
      },
      
      // Performance-based optimization
      performanceOptimization: {
        monitorWriteLatency: true,
        latencyThreshold: 100, // 100ms
        enableAutomaticIndexing: true,
        optimizeForWorkload: true
      },
      
      // Resource management
      resourceManagement: {
        monitorMemoryUsage: true,
        memoryThreshold: 0.7, // 70% memory usage
        enableBackpressure: true,
        enableLoadShedding: true
      }
    };

    return await this.deployCapacityManagement(capacityManagement);
  }
}
```

## SQL-Style Capped Collections Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB capped collections and high-performance logging:

```sql
-- QueryLeaf capped collections operations with SQL-familiar syntax for MongoDB

-- Create capped collections with SQL-style DDL
CREATE CAPPED COLLECTION application_logs 
WITH (
  size = '200MB',
  max_documents = 100000,
  write_concern = 'fast',
  compression = 'snappy'
);

-- Alternative syntax for collection creation
CREATE TABLE event_stream (
  event_id UUID DEFAULT GENERATE_UUID(),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  event_type VARCHAR(100) NOT NULL,
  event_data DOCUMENT,
  user_id VARCHAR(50),
  session_id VARCHAR(100),
  source VARCHAR(50) DEFAULT 'application',
  
  -- Capped collection metadata
  insertion_order BIGINT -- Natural insertion order in capped collections
)
WITH CAPPED (
  size = '500MB',
  max_documents = 250000,
  auto_rotation = true
);

-- High-performance log insertion with SQL syntax
INSERT INTO application_logs (
  application, level, message, timestamp, user_id, session_id, metadata
) VALUES 
  ('web-server', 'INFO', 'User login successful', CURRENT_TIMESTAMP, 'user123', 'sess456', 
   JSON_OBJECT('ip_address', '192.168.1.100', 'user_agent', 'Mozilla/5.0...')),
  ('web-server', 'WARN', 'Slow query detected', CURRENT_TIMESTAMP, 'user123', 'sess456',
   JSON_OBJECT('query_time', 2500, 'table', 'users')),
  ('payment-service', 'ERROR', 'Payment processing failed', CURRENT_TIMESTAMP, 'user789', 'sess789',
   JSON_OBJECT('amount', 99.99, 'error_code', 'CARD_DECLINED'));

-- Bulk insertion for high-throughput logging
INSERT INTO application_logs (application, level, message, timestamp, metadata)
WITH log_batch AS (
  SELECT 
    app_name as application,
    log_level as level,
    log_message as message,
    log_timestamp as timestamp,
    
    -- Enhanced metadata generation
    JSON_OBJECT(
      'hostname', hostname,
      'process_id', process_id,
      'thread_id', thread_id,
      'memory_usage_mb', memory_usage / 1024 / 1024,
      'request_duration_ms', request_duration,
      'tags', log_tags,
      'custom_data', custom_metadata
    ) as metadata
    
  FROM staging_logs
  WHERE processed = false
    AND log_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
)
SELECT application, level, message, timestamp, metadata
FROM log_batch
WHERE level IN ('INFO', 'WARN', 'ERROR', 'CRITICAL')

-- Capped collection bulk insert configuration
WITH BULK_OPTIONS (
  batch_size = 1000,
  ordered = false,
  write_concern = 'fast',
  bypass_validation = false
);

-- Event streaming with guaranteed insertion order
INSERT INTO event_stream (
  event_type, event_data, user_id, session_id, 
  correlation_id, source, priority, tags
) 
WITH event_preparation AS (
  SELECT 
    event_type,
    event_payload as event_data,
    user_id,
    session_id,
    
    -- Generate correlation context
    COALESCE(correlation_id, GENERATE_UUID()) as correlation_id,
    COALESCE(event_source, 'application') as source,
    COALESCE(event_priority, 'normal') as priority,
    
    -- Generate event tags for filtering
    ARRAY[
      event_category,
      'realtime',
      CASE WHEN event_priority = 'high' THEN 'urgent' ELSE 'standard' END
    ] as tags,
    
    -- Add timing metadata
    CURRENT_TIMESTAMP as insertion_timestamp,
    event_occurred_at
    
  FROM incoming_events
  WHERE processing_status = 'pending'
    AND event_occurred_at >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
)
SELECT 
  event_type,
  JSON_SET(
    event_data,
    '$.insertion_timestamp', insertion_timestamp,
    '$.occurred_at', event_occurred_at,
    '$.processing_context', JSON_OBJECT(
      'inserted_by', 'queryleaf',
      'capped_collection', true,
      'guaranteed_order', true
    )
  ) as event_data,
  user_id,
  session_id,
  correlation_id,
  source,
  priority,
  tags
FROM event_preparation
ORDER BY event_occurred_at, correlation_id;

-- Query recent logs with natural insertion order (most efficient for capped collections)
WITH recent_application_logs AS (
  SELECT 
    timestamp,
    application,
    level,
    message,
    user_id,
    session_id,
    metadata,
    
    -- Natural insertion order in capped collections
    _id as insertion_order,
    
    -- Extract metadata fields
    JSON_EXTRACT(metadata, '$.hostname') as hostname,
    JSON_EXTRACT(metadata, '$.request_duration_ms') as request_duration,
    JSON_EXTRACT(metadata, '$.memory_usage_mb') as memory_usage,
    
    -- Calculate log age
    EXTRACT(SECONDS FROM CURRENT_TIMESTAMP - timestamp) as age_seconds,
    
    -- Categorize log importance
    CASE level
      WHEN 'CRITICAL' THEN 1
      WHEN 'ERROR' THEN 2  
      WHEN 'WARN' THEN 3
      WHEN 'INFO' THEN 4
      WHEN 'DEBUG' THEN 5
    END as log_priority_numeric
    
  FROM application_logs
  WHERE 
    -- Time-based filtering (efficient with capped collections)
    timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    
    -- Application filtering
    AND (application = $1 OR $1 IS NULL)
    
    -- Level filtering
    AND level IN ('ERROR', 'WARN', 'INFO')
    
  -- Natural order query (most efficient for capped collections)
  ORDER BY $natural DESC
  LIMIT 1000
),

log_analysis AS (
  SELECT 
    ral.*,
    
    -- Session context analysis
    COUNT(*) OVER (
      PARTITION BY session_id 
      ORDER BY timestamp 
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as session_log_sequence,
    
    -- Error rate analysis
    COUNT(*) FILTER (WHERE level IN ('ERROR', 'CRITICAL')) OVER (
      PARTITION BY application, DATE_TRUNC('minute', timestamp)
    ) as errors_this_minute,
    
    -- Performance analysis
    AVG(request_duration) OVER (
      PARTITION BY application 
      ORDER BY timestamp 
      ROWS BETWEEN 10 PRECEDING AND CURRENT ROW
    ) as rolling_avg_duration,
    
    -- Anomaly detection
    CASE 
      WHEN request_duration > 
        AVG(request_duration) OVER (
          PARTITION BY application 
          ORDER BY timestamp 
          ROWS BETWEEN 100 PRECEDING AND CURRENT ROW
        ) * 3 
      THEN 'performance_anomaly'
      
      WHEN errors_this_minute > 10 THEN 'error_spike'
      
      WHEN memory_usage > 
        AVG(memory_usage) OVER (
          PARTITION BY hostname 
          ORDER BY timestamp 
          ROWS BETWEEN 50 PRECEDING AND CURRENT ROW
        ) * 2
      THEN 'memory_anomaly'
      
      ELSE 'normal'
    END as anomaly_status
    
  FROM recent_application_logs ral
)

SELECT 
  timestamp,
  application,
  level,
  message,
  user_id,
  session_id,
  hostname,
  
  -- Performance metrics
  request_duration,
  memory_usage,
  rolling_avg_duration,
  
  -- Context information
  session_log_sequence,
  errors_this_minute,
  
  -- Analysis results
  log_priority_numeric,
  anomaly_status,
  age_seconds,
  
  -- Helpful indicators
  CASE 
    WHEN age_seconds < 60 THEN 'very_recent'
    WHEN age_seconds < 300 THEN 'recent' 
    WHEN age_seconds < 1800 THEN 'moderate'
    ELSE 'older'
  END as recency_category,
  
  -- Alert conditions
  CASE 
    WHEN level = 'CRITICAL' OR anomaly_status != 'normal' THEN 'immediate_attention'
    WHEN level = 'ERROR' AND errors_this_minute > 5 THEN 'monitor_closely'
    WHEN level = 'WARN' AND session_log_sequence > 20 THEN 'session_issues'
    ELSE 'normal_monitoring'
  END as attention_level

FROM log_analysis
WHERE 
  -- Focus on actionable logs
  (level IN ('CRITICAL', 'ERROR') OR anomaly_status != 'normal')
  
ORDER BY 
  -- Prioritize by importance and recency
  CASE attention_level
    WHEN 'immediate_attention' THEN 1
    WHEN 'monitor_closely' THEN 2  
    WHEN 'session_issues' THEN 3
    ELSE 4
  END,
  timestamp DESC

LIMIT 500;

-- Real-time event stream processing with tailable cursor behavior
WITH LIVE_EVENT_STREAM AS (
  SELECT 
    event_id,
    timestamp,
    event_type,
    event_data,
    user_id,
    session_id,
    correlation_id,
    source,
    tags,
    
    -- Event sequence tracking
    _id as natural_order,
    
    -- Extract event payload details
    JSON_EXTRACT(event_data, '$.action') as action,
    JSON_EXTRACT(event_data, '$.resource') as resource,
    JSON_EXTRACT(event_data, '$.metadata') as event_metadata,
    
    -- Real-time processing flags
    JSON_EXTRACT(event_data, '$.requires_processing') as requires_processing,
    JSON_EXTRACT(event_data, '$.priority') as event_priority
    
  FROM event_stream
  WHERE 
    -- Process events from the last insertion point
    _id > $last_processed_id
    
    -- Focus on events requiring real-time processing
    AND (
      JSON_EXTRACT(event_data, '$.requires_processing') = true
      OR event_type IN ('user_action', 'system_alert', 'security_event')
      OR JSON_EXTRACT(event_data, '$.priority') = 'high'
    )
    
  -- Use natural insertion order for optimal capped collection performance
  ORDER BY $natural ASC
),

event_correlation AS (
  SELECT 
    les.*,
    
    -- Correlation analysis
    COUNT(*) OVER (
      PARTITION BY correlation_id
      ORDER BY natural_order
    ) as correlation_sequence,
    
    -- User behavior patterns
    COUNT(*) OVER (
      PARTITION BY user_id, event_type
      ORDER BY timestamp
      RANGE BETWEEN INTERVAL '5 minutes' PRECEDING AND CURRENT ROW  
    ) as recent_similar_events,
    
    -- Session context
    STRING_AGG(event_type, ' -> ') OVER (
      PARTITION BY session_id
      ORDER BY natural_order
      ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
    ) as session_event_sequence,
    
    -- Anomaly detection
    CASE 
      WHEN recent_similar_events > 10 THEN 'potential_abuse'
      WHEN correlation_sequence > 50 THEN 'long_running_process'
      WHEN event_type = 'security_event' THEN 'security_concern'
      ELSE 'normal_event'
    END as event_classification
    
  FROM LIVE_EVENT_STREAM les
),

processed_events AS (
  SELECT 
    ec.*,
    
    -- Generate processing instructions
    JSON_OBJECT(
      'processing_priority', 
      CASE event_classification
        WHEN 'security_concern' THEN 'critical'
        WHEN 'potential_abuse' THEN 'high'
        WHEN 'long_running_process' THEN 'monitor'
        ELSE 'standard'
      END,
      
      'correlation_context', JSON_OBJECT(
        'correlation_id', correlation_id,
        'sequence', correlation_sequence,
        'related_events', recent_similar_events
      ),
      
      'session_context', JSON_OBJECT(
        'session_id', session_id,
        'event_sequence', session_event_sequence,
        'user_id', user_id
      ),
      
      'processing_metadata', JSON_OBJECT(
        'inserted_at', CURRENT_TIMESTAMP,
        'natural_order', natural_order,
        'capped_collection_source', true
      )
    ) as processing_instructions,
    
    -- Determine next processing steps
    CASE event_classification
      WHEN 'security_concern' THEN 'immediate_alert'
      WHEN 'potential_abuse' THEN 'rate_limit_check'  
      WHEN 'long_running_process' THEN 'status_update'
      ELSE 'standard_processing'
    END as next_action
    
  FROM event_correlation ec
)

SELECT 
  event_id,
  timestamp,
  event_type,
  action,
  resource,
  user_id,
  session_id,
  
  -- Analysis results
  event_classification,
  correlation_sequence,
  recent_similar_events,
  next_action,
  
  -- Processing context
  processing_instructions,
  
  -- Natural ordering for downstream systems
  natural_order,
  
  -- Real-time indicators
  EXTRACT(SECONDS FROM CURRENT_TIMESTAMP - timestamp) as processing_latency_seconds,
  
  CASE 
    WHEN EXTRACT(SECONDS FROM CURRENT_TIMESTAMP - timestamp) < 5 THEN 'real_time'
    WHEN EXTRACT(SECONDS FROM CURRENT_TIMESTAMP - timestamp) < 30 THEN 'near_real_time'  
    ELSE 'delayed_processing'
  END as processing_timeliness

FROM processed_events
WHERE event_classification != 'normal_event' OR requires_processing = true
ORDER BY 
  -- Process highest priority events first
  CASE next_action
    WHEN 'immediate_alert' THEN 1
    WHEN 'rate_limit_check' THEN 2
    WHEN 'status_update' THEN 3
    ELSE 4
  END,
  natural_order ASC;

-- Performance metrics and capacity monitoring for capped collections
WITH capped_collection_stats AS (
  SELECT 
    collection_name,
    
    -- Storage utilization
    current_size_mb,
    max_size_mb,
    (current_size_mb / max_size_mb * 100) as size_utilization_percent,
    
    -- Document utilization  
    document_count,
    max_documents,
    (document_count / NULLIF(max_documents, 0) * 100) as document_utilization_percent,
    
    -- Performance metrics
    avg_document_size,
    total_index_size_mb,
    
    -- Operation statistics
    total_inserts_today,
    avg_inserts_per_hour,
    peak_inserts_per_hour,
    
    -- Capacity projections
    estimated_hours_to_capacity,
    estimated_rotation_frequency
    
  FROM (
    -- This would be populated by MongoDB collection stats
    VALUES 
      ('application_logs', 150, 200, 75000, 100000, 2048, 5, 180000, 7500, 15000, 8, 'every_3_hours'),
      ('event_stream', 400, 500, 200000, 250000, 2048, 8, 480000, 20000, 35000, 4, 'every_hour'),
      ('performance_metrics', 80, 100, 40000, 50000, 2048, 3, 96000, 4000, 8000, 20, 'every_5_hours')
  ) AS stats(collection_name, current_size_mb, max_size_mb, document_count, max_documents, 
             avg_document_size, total_index_size_mb, total_inserts_today, avg_inserts_per_hour,
             peak_inserts_per_hour, estimated_hours_to_capacity, estimated_rotation_frequency)
),

performance_analysis AS (
  SELECT 
    ccs.*,
    
    -- Utilization status
    CASE 
      WHEN size_utilization_percent > 90 THEN 'critical'
      WHEN size_utilization_percent > 80 THEN 'warning'  
      WHEN size_utilization_percent > 60 THEN 'moderate'
      ELSE 'healthy'
    END as size_status,
    
    CASE 
      WHEN document_utilization_percent > 90 THEN 'critical'
      WHEN document_utilization_percent > 80 THEN 'warning'
      WHEN document_utilization_percent > 60 THEN 'moderate'  
      ELSE 'healthy'
    END as document_status,
    
    -- Performance indicators
    CASE 
      WHEN peak_inserts_per_hour / NULLIF(avg_inserts_per_hour, 0) > 3 THEN 'high_variance'
      WHEN peak_inserts_per_hour / NULLIF(avg_inserts_per_hour, 0) > 2 THEN 'moderate_variance'
      ELSE 'stable_load'
    END as load_pattern,
    
    -- Capacity recommendations
    CASE 
      WHEN estimated_hours_to_capacity < 24 THEN 'monitor_closely'
      WHEN estimated_hours_to_capacity < 72 THEN 'plan_expansion'
      WHEN estimated_hours_to_capacity > 168 THEN 'over_provisioned'
      ELSE 'adequate_capacity'
    END as capacity_recommendation,
    
    -- Optimization suggestions
    CASE 
      WHEN total_index_size_mb / current_size_mb > 0.3 THEN 'review_indexes'
      WHEN avg_document_size > 4096 THEN 'consider_compression'
      WHEN avg_inserts_per_hour < 100 THEN 'potentially_over_sized'
      ELSE 'well_optimized'
    END as optimization_suggestion
    
  FROM capped_collection_stats ccs
)

SELECT 
  collection_name,
  
  -- Current utilization
  ROUND(size_utilization_percent, 1) as size_used_percent,
  ROUND(document_utilization_percent, 1) as documents_used_percent,
  size_status,
  document_status,
  
  -- Capacity information  
  current_size_mb,
  max_size_mb,
  (max_size_mb - current_size_mb) as remaining_capacity_mb,
  document_count,
  max_documents,
  
  -- Performance metrics
  avg_document_size,
  total_index_size_mb,
  load_pattern,
  avg_inserts_per_hour,
  peak_inserts_per_hour,
  
  -- Projections and recommendations
  estimated_hours_to_capacity,
  estimated_rotation_frequency,
  capacity_recommendation,
  optimization_suggestion,
  
  -- Action items
  CASE 
    WHEN size_status = 'critical' OR document_status = 'critical' THEN 'immediate_action_required'
    WHEN capacity_recommendation = 'monitor_closely' THEN 'increase_monitoring_frequency'
    WHEN optimization_suggestion != 'well_optimized' THEN 'schedule_optimization_review'
    ELSE 'continue_normal_operations'
  END as recommended_action,
  
  -- Detailed recommendations
  CASE recommended_action
    WHEN 'immediate_action_required' THEN 'Increase capped collection size or reduce retention period'
    WHEN 'increase_monitoring_frequency' THEN 'Monitor every 15 minutes instead of hourly'
    WHEN 'schedule_optimization_review' THEN 'Review indexes, compression, and document structure'
    ELSE 'Collection is operating within normal parameters'
  END as action_details

FROM performance_analysis
ORDER BY 
  CASE size_status 
    WHEN 'critical' THEN 1
    WHEN 'warning' THEN 2
    WHEN 'moderate' THEN 3  
    ELSE 4
  END,
  collection_name;

-- QueryLeaf provides comprehensive capped collection capabilities:
-- 1. SQL-familiar capped collection creation and management
-- 2. High-performance bulk insertion with optimized batching
-- 3. Natural insertion order queries for optimal performance
-- 4. Real-time event streaming with tailable cursor behavior  
-- 5. Advanced analytics and anomaly detection on streaming data
-- 6. Automatic capacity monitoring and optimization recommendations
-- 7. Integration with MongoDB's native capped collection optimizations
-- 8. SQL-style operations for complex streaming data workflows
-- 9. Built-in performance monitoring and alerting capabilities
-- 10. Production-ready capped collections with enterprise features
```

## Best Practices for Capped Collections Implementation

### Performance Optimization and Design Strategy

Essential principles for effective MongoDB capped collections deployment:

1. **Size Planning**: Calculate optimal collection sizes based on throughput, retention requirements, and query patterns
2. **Write Optimization**: Design write patterns that leverage capped collections' sequential write performance advantages
3. **Query Strategy**: Utilize natural insertion order and time-based queries for optimal read performance
4. **Index Design**: Implement minimal, strategic indexing that complements capped collection characteristics
5. **Monitoring Strategy**: Track utilization, rotation frequency, and performance metrics for capacity planning
6. **Integration Patterns**: Design applications that benefit from guaranteed insertion order and automatic data lifecycle

### Production Deployment and Operational Excellence

Optimize capped collections for enterprise-scale requirements:

1. **Capacity Management**: Implement automated monitoring and alerting for collection utilization and performance
2. **Write Distribution**: Design shard keys and distribution strategies for balanced writes across replica sets
3. **Real-Time Processing**: Leverage tailable cursors and change streams for efficient real-time data processing
4. **Backup Strategy**: Account for capped collection characteristics in backup and disaster recovery planning
5. **Performance Monitoring**: Track write throughput, query performance, and resource utilization continuously
6. **Operational Integration**: Integrate capped collections with existing logging, monitoring, and alerting infrastructure

## Conclusion

MongoDB capped collections provide native high-performance data structures that eliminate the complexity of traditional logging and streaming solutions through fixed-size storage, guaranteed insertion order, and automatic data lifecycle management. The combination of predictable performance characteristics with real-time processing capabilities makes capped collections ideal for modern streaming data applications.

Key MongoDB Capped Collections benefits include:

- **High-Performance Writes**: Sequential write optimization with minimal index maintenance overhead
- **Predictable Storage**: Fixed-size collections with automatic old document removal and no storage bloat
- **Insertion Order Guarantee**: Natural document ordering ideal for event sequencing and temporal data analysis
- **Real-Time Processing**: Tailable cursors and change streams for efficient streaming data consumption
- **Resource Efficiency**: Predictable memory usage and optimal performance characteristics for high-throughput scenarios
- **SQL Accessibility**: Familiar SQL-style capped collection operations through QueryLeaf for accessible streaming data management

Whether you're implementing application logging, event streaming, performance monitoring, or real-time analytics, MongoDB capped collections with QueryLeaf's familiar SQL interface provide the foundation for efficient, predictable, and scalable streaming data solutions.

> **QueryLeaf Integration**: QueryLeaf seamlessly manages MongoDB capped collections while providing SQL-familiar syntax for high-performance logging, real-time streaming, and circular buffer operations. Advanced capped collection patterns including capacity planning, real-time processing, and performance optimization are elegantly handled through familiar SQL constructs, making sophisticated streaming data management both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's robust capped collection capabilities with SQL-style streaming operations makes it an ideal platform for applications requiring both high-throughput data capture and familiar database interaction patterns, ensuring your streaming data infrastructure can scale efficiently while maintaining predictable performance and operational simplicity.