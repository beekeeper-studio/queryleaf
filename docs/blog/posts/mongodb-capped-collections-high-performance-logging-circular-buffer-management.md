---
title: "MongoDB Capped Collections: High-Performance Logging and Circular Buffer Management for Enterprise Data Streams"
description: "Master MongoDB capped collections for high-throughput logging, real-time data streams, and circular buffer management. Learn advanced patterns, performance optimization, and SQL-familiar capped collection syntax for enterprise streaming applications."
date: 2025-12-04
tags: [mongodb, capped-collections, logging, circular-buffer, high-performance, data-streams, sql, enterprise]
---

# MongoDB Capped Collections: High-Performance Logging and Circular Buffer Management for Enterprise Data Streams

Modern applications generate continuous streams of time-series data, logs, events, and real-time messages that require efficient storage, retrieval, and automatic management without manual intervention. Traditional relational databases struggle with high-volume streaming data scenarios, requiring complex archival procedures, partition management, and manual cleanup processes that add operational complexity and performance overhead to data pipeline architectures.

MongoDB capped collections provide native circular buffer functionality with guaranteed insertion order, automatic size management, and optimized storage patterns designed for high-throughput streaming applications. Unlike traditional approaches that require external log rotation systems or complex partitioning strategies, capped collections automatically manage storage limits while maintaining insertion order and providing efficient tail-able cursor capabilities for real-time data consumption.

## The Traditional High-Volume Logging Challenge

Conventional relational database approaches to high-volume logging and streaming data face significant operational limitations:

```sql
-- Traditional PostgreSQL high-volume logging - complex partition management and cleanup overhead

-- Application log management with manual partitioning and rotation
CREATE TABLE application_logs (
    log_id BIGSERIAL PRIMARY KEY,
    log_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    log_level VARCHAR(20) NOT NULL,
    application VARCHAR(100) NOT NULL,
    component VARCHAR(100) NOT NULL,
    
    -- Log content and metadata
    log_message TEXT NOT NULL,
    log_data JSONB,
    user_id INTEGER,
    session_id VARCHAR(100),
    request_id VARCHAR(100),
    
    -- Performance tracking
    execution_time_ms INTEGER,
    memory_usage_mb DECIMAL(10,2),
    cpu_usage_percent DECIMAL(5,2),
    
    -- Context information
    server_hostname VARCHAR(200),
    process_id INTEGER,
    thread_id INTEGER,
    environment VARCHAR(50) DEFAULT 'production',
    
    -- Correlation and tracing
    trace_id VARCHAR(100),
    parent_span_id VARCHAR(100),
    operation_name VARCHAR(200),
    
    CONSTRAINT valid_log_level CHECK (log_level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
    CONSTRAINT valid_environment CHECK (environment IN ('development', 'testing', 'staging', 'production'))
) PARTITION BY RANGE (log_timestamp);

-- Create partitions for log data (manual partition management)
CREATE TABLE application_logs_2025_01 PARTITION OF application_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
    
CREATE TABLE application_logs_2025_02 PARTITION OF application_logs  
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
    
CREATE TABLE application_logs_2025_03 PARTITION OF application_logs
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Performance indexes for log queries (per partition)
CREATE INDEX idx_app_logs_2025_01_timestamp ON application_logs_2025_01 (log_timestamp DESC);
CREATE INDEX idx_app_logs_2025_01_level_app ON application_logs_2025_01 (log_level, application, log_timestamp DESC);
CREATE INDEX idx_app_logs_2025_01_user_session ON application_logs_2025_01 (user_id, session_id, log_timestamp DESC);
CREATE INDEX idx_app_logs_2025_01_trace ON application_logs_2025_01 (trace_id);

-- Real-time event stream with manual buffer management
CREATE TABLE event_stream_buffer (
    event_id BIGSERIAL PRIMARY KEY,
    event_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_type VARCHAR(100) NOT NULL,
    event_source VARCHAR(100) NOT NULL,
    
    -- Event payload
    event_data JSONB NOT NULL,
    event_version VARCHAR(20) DEFAULT '1.0',
    event_schema_version INTEGER DEFAULT 1,
    
    -- Stream metadata
    stream_name VARCHAR(200) NOT NULL,
    partition_key VARCHAR(200),
    sequence_number BIGINT,
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processing_attempts INTEGER DEFAULT 0,
    last_processed TIMESTAMP,
    processing_error TEXT,
    
    -- Buffer management
    buffer_position INTEGER,
    retention_priority INTEGER DEFAULT 5, -- 1 highest, 10 lowest
    
    -- Performance metadata
    event_size_bytes INTEGER GENERATED ALWAYS AS (length(event_data::text)) STORED,
    ingestion_latency_ms INTEGER
);

-- Complex buffer management procedure with manual overflow handling
CREATE OR REPLACE FUNCTION manage_event_stream_buffer()
RETURNS INTEGER AS $$
DECLARE
    buffer_max_size INTEGER := 1000000; -- 1 million events
    buffer_max_age INTERVAL := '7 days';
    cleanup_batch_size INTEGER := 10000;
    current_buffer_size INTEGER;
    events_to_remove INTEGER := 0;
    removed_events INTEGER := 0;
    cleanup_cursor CURSOR FOR
        SELECT event_id, event_timestamp, event_size_bytes
        FROM event_stream_buffer
        WHERE (event_timestamp < CURRENT_TIMESTAMP - buffer_max_age
               OR (processed = TRUE AND processing_attempts >= 3))
        ORDER BY retention_priority DESC, event_timestamp ASC
        LIMIT cleanup_batch_size;
    
    event_record RECORD;
    total_size_removed BIGINT := 0;
    
BEGIN
    RAISE NOTICE 'Starting event stream buffer management...';
    
    -- Check current buffer size
    SELECT COUNT(*), SUM(event_size_bytes) 
    INTO current_buffer_size, total_size_removed
    FROM event_stream_buffer;
    
    RAISE NOTICE 'Current buffer: % events, % bytes', current_buffer_size, total_size_removed;
    
    -- Calculate events to remove if over capacity
    IF current_buffer_size > buffer_max_size THEN
        events_to_remove := current_buffer_size - buffer_max_size + (buffer_max_size * 0.1)::INTEGER;
        RAISE NOTICE 'Buffer over capacity, removing % events', events_to_remove;
    END IF;
    
    -- Remove old and processed events
    FOR event_record IN cleanup_cursor LOOP
        BEGIN
            -- Archive event before deletion (if required)
            INSERT INTO event_stream_archive (
                original_event_id, event_timestamp, event_type, event_source,
                event_data, stream_name, archived_at, archive_reason
            ) VALUES (
                event_record.event_id, event_record.event_timestamp, 
                (SELECT event_type FROM event_stream_buffer WHERE event_id = event_record.event_id),
                (SELECT event_source FROM event_stream_buffer WHERE event_id = event_record.event_id),
                (SELECT event_data FROM event_stream_buffer WHERE event_id = event_record.event_id),
                (SELECT stream_name FROM event_stream_buffer WHERE event_id = event_record.event_id),
                CURRENT_TIMESTAMP, 'buffer_management'
            );
            
            -- Remove event from buffer
            DELETE FROM event_stream_buffer WHERE event_id = event_record.event_id;
            
            removed_events := removed_events + 1;
            total_size_removed := total_size_removed + event_record.event_size_bytes;
            
            -- Exit if we've removed enough events
            EXIT WHEN events_to_remove > 0 AND removed_events >= events_to_remove;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error processing event % during buffer cleanup: %', 
                event_record.event_id, SQLERRM;
        END;
    END LOOP;
    
    -- Update buffer positions for remaining events
    WITH position_update AS (
        SELECT event_id, 
               ROW_NUMBER() OVER (ORDER BY event_timestamp ASC) as new_position
        FROM event_stream_buffer
    )
    UPDATE event_stream_buffer 
    SET buffer_position = pu.new_position
    FROM position_update pu
    WHERE event_stream_buffer.event_id = pu.event_id;
    
    -- Log buffer management results
    INSERT INTO buffer_management_log (
        management_timestamp, events_removed, bytes_reclaimed,
        buffer_size_after, management_duration_ms
    ) VALUES (
        CURRENT_TIMESTAMP, removed_events, total_size_removed,
        (SELECT COUNT(*) FROM event_stream_buffer),
        EXTRACT(MILLISECONDS FROM (CURRENT_TIMESTAMP - (SELECT CURRENT_TIMESTAMP)))
    );
    
    RAISE NOTICE 'Buffer management completed: % events removed, % bytes reclaimed', 
        removed_events, total_size_removed;
    
    RETURN removed_events;
END;
$$ LANGUAGE plpgsql;

-- Scheduled buffer management (requires external cron job)
CREATE TABLE buffer_management_schedule (
    schedule_name VARCHAR(100) PRIMARY KEY,
    management_function VARCHAR(200) NOT NULL,
    schedule_cron VARCHAR(100) NOT NULL,
    last_execution TIMESTAMP,
    next_execution TIMESTAMP,
    
    -- Configuration
    enabled BOOLEAN DEFAULT TRUE,
    max_execution_time INTERVAL DEFAULT '30 minutes',
    buffer_size_threshold INTEGER,
    
    -- Performance tracking
    average_execution_time INTERVAL,
    average_events_processed INTEGER,
    consecutive_failures INTEGER DEFAULT 0,
    last_error_message TEXT
);

INSERT INTO buffer_management_schedule (schedule_name, management_function, schedule_cron) VALUES
('event_buffer_cleanup', 'manage_event_stream_buffer()', '*/15 * * * *'), -- Every 15 minutes
('log_partition_cleanup', 'cleanup_old_log_partitions()', '0 2 * * 0'),   -- Weekly at 2 AM
('archive_processed_events', 'archive_old_processed_events()', '0 1 * * *'); -- Daily at 1 AM

-- Manual partition management for log tables
CREATE OR REPLACE FUNCTION create_monthly_log_partitions(months_ahead INTEGER DEFAULT 3)
RETURNS INTEGER AS $$
DECLARE
    partition_count INTEGER := 0;
    partition_date DATE;
    partition_name TEXT;
    partition_start DATE;
    partition_end DATE;
    month_counter INTEGER := 0;
    
BEGIN
    -- Create partitions for upcoming months
    WHILE month_counter <= months_ahead LOOP
        partition_date := DATE_TRUNC('month', CURRENT_DATE) + (month_counter || ' months')::INTERVAL;
        partition_start := partition_date;
        partition_end := partition_start + INTERVAL '1 month';
        
        partition_name := 'application_logs_' || TO_CHAR(partition_date, 'YYYY_MM');
        
        -- Check if partition already exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE tablename = partition_name 
            AND schemaname = 'public'
        ) THEN
            -- Create partition
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF application_logs FOR VALUES FROM (%L) TO (%L)',
                partition_name, partition_start, partition_end
            );
            
            -- Create indexes on new partition
            EXECUTE format(
                'CREATE INDEX %I ON %I (log_timestamp DESC)',
                'idx_' || partition_name || '_timestamp', partition_name
            );
            
            EXECUTE format(
                'CREATE INDEX %I ON %I (log_level, application, log_timestamp DESC)',
                'idx_' || partition_name || '_level_app', partition_name
            );
            
            partition_count := partition_count + 1;
            
            RAISE NOTICE 'Created partition: % for period % to %', 
                partition_name, partition_start, partition_end;
        END IF;
        
        month_counter := month_counter + 1;
    END LOOP;
    
    RETURN partition_count;
END;
$$ LANGUAGE plpgsql;

-- Complex log rotation and cleanup
CREATE OR REPLACE FUNCTION cleanup_old_log_partitions(retention_months INTEGER DEFAULT 6)
RETURNS INTEGER AS $$
DECLARE
    partition_record RECORD;
    dropped_partitions INTEGER := 0;
    retention_threshold DATE;
    partition_cursor CURSOR FOR
        SELECT schemaname, tablename,
               SUBSTRING(tablename FROM 'application_logs_([0-9]{4}_[0-9]{2})$') as period_str
        FROM pg_tables 
        WHERE tablename LIKE 'application_logs_2%'
        AND schemaname = 'public';
        
BEGIN
    retention_threshold := DATE_TRUNC('month', CURRENT_DATE) - (retention_months || ' months')::INTERVAL;
    
    RAISE NOTICE 'Cleaning up log partitions older than %', retention_threshold;
    
    FOR partition_record IN partition_cursor LOOP
        DECLARE
            partition_date DATE;
        BEGIN
            -- Parse partition date from table name
            partition_date := TO_DATE(partition_record.period_str, 'YYYY_MM');
            
            -- Check if partition is old enough to drop
            IF partition_date < retention_threshold THEN
                -- Archive partition data before dropping (if required)
                EXECUTE format(
                    'INSERT INTO application_logs_archive SELECT * FROM %I.%I',
                    partition_record.schemaname, partition_record.tablename
                );
                
                -- Drop the partition
                EXECUTE format('DROP TABLE %I.%I', 
                    partition_record.schemaname, partition_record.tablename);
                
                dropped_partitions := dropped_partitions + 1;
                
                RAISE NOTICE 'Dropped old partition: %', partition_record.tablename;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error processing partition %: %', 
                partition_record.tablename, SQLERRM;
        END;
    END LOOP;
    
    RETURN dropped_partitions;
END;
$$ LANGUAGE plpgsql;

-- Monitor buffer and partition performance
WITH buffer_performance AS (
    SELECT 
        'event_stream_buffer' as buffer_name,
        COUNT(*) as total_events,
        SUM(event_size_bytes) as total_size_bytes,
        AVG(event_size_bytes) as avg_event_size,
        MIN(event_timestamp) as oldest_event,
        MAX(event_timestamp) as newest_event,
        
        -- Processing metrics
        COUNT(*) FILTER (WHERE processed = TRUE) as processed_events,
        COUNT(*) FILTER (WHERE processing_error IS NOT NULL) as error_events,
        AVG(processing_attempts) as avg_processing_attempts,
        
        -- Buffer efficiency
        EXTRACT(EPOCH FROM (MAX(event_timestamp) - MIN(event_timestamp))) / 3600 as timespan_hours,
        COUNT(*) / NULLIF(EXTRACT(EPOCH FROM (MAX(event_timestamp) - MIN(event_timestamp))) / 3600, 0) as events_per_hour
        
    FROM event_stream_buffer
),

partition_performance AS (
    SELECT 
        schemaname || '.' || tablename as partition_name,
        pg_total_relation_size(schemaname||'.'||tablename) as partition_size_bytes,
        
        -- Estimate row count (approximate)
        CASE 
            WHEN pg_total_relation_size(schemaname||'.'||tablename) > 0 THEN
                pg_total_relation_size(schemaname||'.'||tablename) / 1024 -- Rough estimate
            ELSE 0
        END as estimated_rows,
        
        SUBSTRING(tablename FROM 'application_logs_([0-9]{4}_[0-9]{2})$') as time_period
        
    FROM pg_tables 
    WHERE tablename LIKE 'application_logs_2%'
    AND schemaname = 'public'
)

SELECT 
    -- Buffer performance summary
    bp.buffer_name,
    bp.total_events,
    ROUND(bp.total_size_bytes / (1024 * 1024)::decimal, 2) as total_size_mb,
    ROUND(bp.avg_event_size::decimal, 2) as avg_event_size_bytes,
    bp.timespan_hours,
    ROUND(bp.events_per_hour::decimal, 2) as throughput_events_per_hour,
    
    -- Processing efficiency
    ROUND((bp.processed_events::decimal / bp.total_events::decimal) * 100, 1) as processing_success_rate,
    bp.error_events,
    ROUND(bp.avg_processing_attempts::decimal, 2) as avg_retry_attempts,
    
    -- Operational assessment
    CASE 
        WHEN bp.events_per_hour > 10000 THEN 'high_throughput'
        WHEN bp.events_per_hour > 1000 THEN 'medium_throughput' 
        ELSE 'low_throughput'
    END as throughput_classification,
    
    -- Management recommendations
    CASE 
        WHEN bp.total_events > 500000 THEN 'Buffer approaching capacity - increase cleanup frequency'
        WHEN bp.error_events > bp.total_events * 0.1 THEN 'High error rate - investigate processing issues'
        WHEN bp.avg_processing_attempts > 2 THEN 'Frequent retries - check downstream systems'
        ELSE 'Buffer operating within normal parameters'
    END as operational_recommendation

FROM buffer_performance bp

UNION ALL

SELECT 
    pp.partition_name,
    pp.estimated_rows as total_events,
    ROUND(pp.partition_size_bytes / (1024 * 1024)::decimal, 2) as total_size_mb,
    CASE WHEN pp.estimated_rows > 0 THEN 
        ROUND(pp.partition_size_bytes::decimal / pp.estimated_rows::decimal, 2) 
    ELSE 0 END as avg_event_size_bytes,
    NULL as timespan_hours,
    NULL as throughput_events_per_hour,
    NULL as processing_success_rate,
    NULL as error_events,
    NULL as avg_retry_attempts,
    
    -- Partition classification
    CASE 
        WHEN pp.partition_size_bytes > 1024 * 1024 * 1024 THEN 'large_partition' -- > 1GB
        WHEN pp.partition_size_bytes > 100 * 1024 * 1024 THEN 'medium_partition' -- > 100MB
        ELSE 'small_partition'
    END as throughput_classification,
    
    -- Partition management recommendations
    CASE 
        WHEN pp.partition_size_bytes > 5 * 1024 * 1024 * 1024 THEN 'Large partition - consider archival' -- > 5GB
        WHEN pp.time_period < TO_CHAR(CURRENT_DATE - INTERVAL '6 months', 'YYYY_MM') THEN 'Old partition - candidate for cleanup'
        ELSE 'Partition within normal size parameters'
    END as operational_recommendation

FROM partition_performance pp
ORDER BY total_size_mb DESC;

-- Traditional logging limitations:
-- 1. Complex partition management requiring manual creation and maintenance procedures  
-- 2. Resource-intensive cleanup operations affecting application performance and availability
-- 3. Manual buffer overflow handling with complex archival and rotation logic
-- 4. Limited scalability for high-volume streaming data scenarios requiring constant maintenance
-- 5. Operational overhead of monitoring partition sizes, buffer utilization, and cleanup scheduling
-- 6. Complex indexing strategies required for efficient time-series queries across partitions
-- 7. Risk of data loss during partition management operations and buffer overflow conditions
-- 8. Difficult integration with real-time streaming applications requiring tail-able cursors
-- 9. Performance degradation as partition counts increase requiring complex query optimization
-- 10. Manual coordination of cleanup schedules across multiple data retention policies
```

MongoDB capped collections provide native circular buffer functionality with automatic size management and optimized performance:

```javascript
// MongoDB Capped Collections - Native circular buffer management for high-performance streaming data
const { MongoClient, ObjectId } = require('mongodb');

// Enterprise-grade MongoDB Capped Collections Manager for High-Performance Data Streams
class MongoCappedCollectionManager {
  constructor(client, config = {}) {
    this.client = client;
    this.db = client.db(config.database || 'streaming_platform');
    
    this.config = {
      // Capped collection configuration
      enableTailableCursors: config.enableTailableCursors !== false,
      enableOplogIntegration: config.enableOplogIntegration || false,
      enableMetricsCollection: config.enableMetricsCollection !== false,
      
      // Performance optimization
      enableIndexOptimization: config.enableIndexOptimization !== false,
      enableCompressionOptimization: config.enableCompressionOptimization || false,
      enableShardingSupport: config.enableShardingSupport || false,
      
      // Monitoring and alerts
      enablePerformanceMonitoring: config.enablePerformanceMonitoring !== false,
      enableCapacityAlerts: config.enableCapacityAlerts !== false,
      alertThresholdPercent: config.alertThresholdPercent || 85,
      
      // Advanced features
      enableDataArchiving: config.enableDataArchiving || false,
      enableReplicationOptimization: config.enableReplicationOptimization || false,
      enableBulkInsertOptimization: config.enableBulkInsertOptimization !== false
    };
    
    // Collection management state
    this.cappedCollections = new Map();
    this.tailableCursors = new Map();
    this.performanceMetrics = new Map();
    this.capacityMonitors = new Map();
    
    this.initializeManager();
  }

  async initializeManager() {
    console.log('Initializing MongoDB Capped Collections Manager for high-performance streaming...');
    
    try {
      // Setup capped collections for different streaming scenarios
      await this.setupApplicationLogsCappedCollection();
      await this.setupEventStreamCappedCollection();
      await this.setupRealTimeMetricsCappedCollection();
      await this.setupAuditTrailCappedCollection();
      await this.setupPerformanceMonitoringCollection();
      
      // Initialize performance monitoring
      if (this.config.enablePerformanceMonitoring) {
        await this.initializePerformanceMonitoring();
      }
      
      // Setup capacity monitoring
      if (this.config.enableCapacityAlerts) {
        await this.initializeCapacityMonitoring();
      }
      
      console.log('Capped Collections Manager initialized successfully');
      
    } catch (error) {
      console.error('Error initializing capped collections manager:', error);
      throw error;
    }
  }

  async setupApplicationLogsCappedCollection() {
    console.log('Setting up application logs capped collection...');
    
    try {
      const collectionName = 'application_logs';
      const cappedOptions = {
        capped: true,
        size: 1024 * 1024 * 1024, // 1GB size limit
        max: 1000000,              // 1 million document limit
        
        // Storage optimization
        storageEngine: {
          wiredTiger: {
            configString: 'block_compressor=snappy'
          }
        }
      };
      
      // Create capped collection with optimized configuration
      await this.db.createCollection(collectionName, cappedOptions);
      const collection = this.db.collection(collectionName);
      
      // Create optimal indexes for log queries (minimal indexing for capped collections)
      await collection.createIndexes([
        { key: { logLevel: 1, timestamp: 1 }, background: true },
        { key: { application: 1, component: 1 }, background: true },
        { key: { traceId: 1 }, background: true, sparse: true }
      ]);
      
      // Store collection configuration
      this.cappedCollections.set(collectionName, {
        collection: collection,
        cappedOptions: cappedOptions,
        insertionOrder: true,
        tailableSupported: true,
        useCase: 'application_logging',
        performanceProfile: 'high_throughput',
        
        // Monitoring configuration
        monitoring: {
          trackInsertRate: true,
          trackSizeUtilization: true,
          trackQueryPerformance: true
        }
      });
      
      console.log(`Application logs capped collection created: ${cappedOptions.size} bytes, ${cappedOptions.tailable} documents max`);
      
    } catch (error) {
      if (error.code === 48) {
        // Collection already exists and is capped
        console.log('Application logs capped collection already exists');
        const collection = this.db.collection('application_logs');
        this.cappedCollections.set('application_logs', {
          collection: collection,
          existing: true,
          useCase: 'application_logging'
        });
      } else {
        console.error('Error creating application logs capped collection:', error);
        throw error;
      }
    }
  }

  async setupEventStreamCappedCollection() {
    console.log('Setting up event stream capped collection...');
    
    try {
      const collectionName = 'event_stream';
      const cappedOptions = {
        capped: true,
        size: 2 * 1024 * 1024 * 1024, // 2GB size limit  
        max: 5000000,                  // 5 million document limit
        
        // Optimized for streaming workloads
        writeConcern: { w: 1, j: false }, // Fast writes for streaming
      };
      
      await this.db.createCollection(collectionName, cappedOptions);
      const collection = this.db.collection(collectionName);
      
      // Minimal indexing optimized for insertion order and tailable cursors
      await collection.createIndexes([
        { key: { eventType: 1, timestamp: 1 }, background: true },
        { key: { streamName: 1 }, background: true },
        { key: { correlationId: 1 }, background: true, sparse: true }
      ]);
      
      this.cappedCollections.set(collectionName, {
        collection: collection,
        cappedOptions: cappedOptions,
        insertionOrder: true,
        tailableSupported: true,
        useCase: 'event_streaming',
        performanceProfile: 'ultra_high_throughput',
        
        // Advanced streaming features
        streaming: {
          enableTailableCursors: true,
          enableChangeStreams: true,
          bufferOptimized: true,
          realTimeConsumption: true
        }
      });
      
      console.log(`Event stream capped collection created: ${cappedOptions.size} bytes capacity`);
      
    } catch (error) {
      if (error.code === 48) {
        console.log('Event stream capped collection already exists');
        const collection = this.db.collection('event_stream');
        this.cappedCollections.set('event_stream', {
          collection: collection,
          existing: true,
          useCase: 'event_streaming'
        });
      } else {
        console.error('Error creating event stream capped collection:', error);
        throw error;
      }
    }
  }

  async setupRealTimeMetricsCappedCollection() {
    console.log('Setting up real-time metrics capped collection...');
    
    try {
      const collectionName = 'realtime_metrics';
      const cappedOptions = {
        capped: true,
        size: 512 * 1024 * 1024, // 512MB size limit
        max: 2000000,             // 2 million document limit
      };
      
      await this.db.createCollection(collectionName, cappedOptions);
      const collection = this.db.collection(collectionName);
      
      // Optimized indexes for metrics queries
      await collection.createIndexes([
        { key: { metricType: 1, timestamp: 1 }, background: true },
        { key: { source: 1, timestamp: -1 }, background: true },
        { key: { aggregationLevel: 1 }, background: true }
      ]);
      
      this.cappedCollections.set(collectionName, {
        collection: collection,
        cappedOptions: cappedOptions,
        insertionOrder: true,
        tailableSupported: true,
        useCase: 'metrics_streaming',
        performanceProfile: 'time_series_optimized',
        
        // Metrics-specific configuration
        metrics: {
          enableAggregation: true,
          timeSeriesOptimized: true,
          enableRealTimeAlerts: true
        }
      });
      
      console.log(`Real-time metrics capped collection created: ${cappedOptions.size} bytes capacity`);
      
    } catch (error) {
      if (error.code === 48) {
        console.log('Real-time metrics capped collection already exists');
        const collection = this.db.collection('realtime_metrics');
        this.cappedCollections.set('realtime_metrics', {
          collection: collection,
          existing: true,
          useCase: 'metrics_streaming'
        });
      } else {
        console.error('Error creating real-time metrics capped collection:', error);
        throw error;
      }
    }
  }

  async setupAuditTrailCappedCollection() {
    console.log('Setting up audit trail capped collection...');
    
    try {
      const collectionName = 'audit_trail';
      const cappedOptions = {
        capped: true,
        size: 256 * 1024 * 1024, // 256MB size limit
        max: 500000,              // 500k document limit
        
        // Enhanced durability for audit data
        writeConcern: { w: 'majority', j: true }
      };
      
      await this.db.createCollection(collectionName, cappedOptions);
      const collection = this.db.collection(collectionName);
      
      // Audit-optimized indexes
      await collection.createIndexes([
        { key: { auditType: 1, timestamp: 1 }, background: true },
        { key: { userId: 1, timestamp: -1 }, background: true },
        { key: { resourceId: 1 }, background: true, sparse: true }
      ]);
      
      this.cappedCollections.set(collectionName, {
        collection: collection,
        cappedOptions: cappedOptions,
        insertionOrder: true,
        tailableSupported: true,
        useCase: 'audit_logging',
        performanceProfile: 'compliance_optimized',
        
        // Audit-specific features
        audit: {
          immutableInsertOrder: true,
          tamperEvident: true,
          complianceMode: true
        }
      });
      
      console.log(`Audit trail capped collection created: ${cappedOptions.size} bytes capacity`);
      
    } catch (error) {
      if (error.code === 48) {
        console.log('Audit trail capped collection already exists');
        const collection = this.db.collection('audit_trail');
        this.cappedCollections.set('audit_trail', {
          collection: collection,
          existing: true,
          useCase: 'audit_logging'
        });
      } else {
        console.error('Error creating audit trail capped collection:', error);
        throw error;
      }
    }
  }

  async logApplicationEvent(logData) {
    console.log('Logging application event to capped collection...');
    
    try {
      const logsCollection = this.cappedCollections.get('application_logs').collection;
      
      const logEntry = {
        _id: new ObjectId(),
        timestamp: new Date(),
        logLevel: logData.level || 'INFO',
        application: logData.application,
        component: logData.component,
        
        // Log content
        message: logData.message,
        logData: logData.data || {},
        
        // Context information
        userId: logData.userId,
        sessionId: logData.sessionId,
        requestId: logData.requestId,
        
        // Performance tracking
        executionTime: logData.executionTime || null,
        memoryUsage: logData.memoryUsage || null,
        cpuUsage: logData.cpuUsage || null,
        
        // Server context
        hostname: logData.hostname || require('os').hostname(),
        processId: process.pid,
        environment: logData.environment || 'production',
        
        // Distributed tracing
        traceId: logData.traceId,
        spanId: logData.spanId,
        operation: logData.operation,
        
        // Capped collection metadata
        insertionOrder: true,
        streamingOptimized: true
      };
      
      // High-performance insert optimized for capped collections
      const result = await logsCollection.insertOne(logEntry, {
        writeConcern: { w: 1, j: false } // Fast writes for logging
      });
      
      // Update performance metrics
      await this.updateCollectionMetrics('application_logs', 'insert', logEntry);
      
      console.log(`Application log inserted: ${result.insertedId}`);
      
      return {
        logId: result.insertedId,
        timestamp: logEntry.timestamp,
        cappedCollection: true,
        insertionOrder: logEntry.insertionOrder
      };
      
    } catch (error) {
      console.error('Error logging application event:', error);
      throw error;
    }
  }

  async streamEvent(eventData) {
    console.log('Streaming event to capped collection...');
    
    try {
      const eventCollection = this.cappedCollections.get('event_stream').collection;
      
      const streamEvent = {
        _id: new ObjectId(),
        timestamp: new Date(),
        eventType: eventData.type,
        eventSource: eventData.source,
        
        // Event payload
        eventData: eventData.payload || {},
        eventVersion: eventData.version || '1.0',
        schemaVersion: eventData.schemaVersion || 1,
        
        // Stream metadata
        streamName: eventData.streamName,
        partitionKey: eventData.partitionKey,
        sequenceNumber: Date.now(), // Monotonic sequence
        
        // Processing metadata
        processed: false,
        processingAttempts: 0,
        
        // Correlation and tracing
        correlationId: eventData.correlationId,
        causationId: eventData.causationId,
        
        // Performance optimization
        eventSizeBytes: JSON.stringify(eventData.payload || {}).length,
        ingestionLatency: eventData.ingestionLatency || null,
        
        // Streaming optimization
        tailableReady: true,
        bufferOptimized: true
      };
      
      // Ultra-high-performance insert for streaming
      const result = await eventCollection.insertOne(streamEvent, {
        writeConcern: { w: 1, j: false }
      });
      
      // Update streaming metrics
      await this.updateCollectionMetrics('event_stream', 'stream', streamEvent);
      
      console.log(`Stream event inserted: ${result.insertedId}`);
      
      return {
        eventId: result.insertedId,
        sequenceNumber: streamEvent.sequenceNumber,
        streamName: streamEvent.streamName,
        cappedOptimized: true
      };
      
    } catch (error) {
      console.error('Error streaming event:', error);
      throw error;
    }
  }

  async recordMetric(metricData) {
    console.log('Recording real-time metric to capped collection...');
    
    try {
      const metricsCollection = this.cappedCollections.get('realtime_metrics').collection;
      
      const metric = {
        _id: new ObjectId(),
        timestamp: new Date(),
        metricType: metricData.type,
        metricName: metricData.name,
        
        // Metric values
        value: metricData.value,
        unit: metricData.unit || 'count',
        tags: metricData.tags || {},
        
        // Source information
        source: metricData.source,
        sourceType: metricData.sourceType || 'application',
        
        // Aggregation metadata
        aggregationLevel: metricData.aggregationLevel || 'raw',
        aggregationWindow: metricData.aggregationWindow || null,
        
        // Time series optimization
        timeSeriesOptimized: true,
        bucketTimestamp: new Date(Math.floor(Date.now() / (60 * 1000)) * 60 * 1000), // 1-minute buckets
        
        // Performance metadata
        collectionTimestamp: Date.now(),
        processingLatency: metricData.processingLatency || null
      };
      
      // Time-series optimized insert
      const result = await metricsCollection.insertOne(metric, {
        writeConcern: { w: 1, j: false }
      });
      
      // Update metrics collection performance
      await this.updateCollectionMetrics('realtime_metrics', 'metric', metric);
      
      console.log(`Real-time metric recorded: ${result.insertedId}`);
      
      return {
        metricId: result.insertedId,
        metricType: metric.metricType,
        timestamp: metric.timestamp,
        timeSeriesOptimized: true
      };
      
    } catch (error) {
      console.error('Error recording metric:', error);
      throw error;
    }
  }

  async createTailableCursor(collectionName, options = {}) {
    console.log(`Creating tailable cursor for collection: ${collectionName}`);
    
    try {
      const collectionConfig = this.cappedCollections.get(collectionName);
      if (!collectionConfig) {
        throw new Error(`Collection ${collectionName} not found in capped collections`);
      }
      
      if (!collectionConfig.tailableSupported) {
        throw new Error(`Collection ${collectionName} does not support tailable cursors`);
      }
      
      const collection = collectionConfig.collection;
      
      // Configure tailable cursor options
      const tailableOptions = {
        tailable: true,
        awaitData: true,
        noCursorTimeout: true,
        maxTimeMS: options.maxTimeMS || 1000,
        batchSize: options.batchSize || 100,
        
        // Starting position
        sort: { $natural: 1 }, // Natural insertion order
        ...(options.filter || {})
      };
      
      // Create cursor starting from specified position or latest
      let cursor;
      if (options.fromTimestamp) {
        cursor = collection.find({ 
          timestamp: { $gte: options.fromTimestamp },
          ...(options.additionalFilter || {})
        }, tailableOptions);
      } else if (options.fromLatest) {
        // Start from the end of the collection
        const lastDoc = await collection.findOne({}, { sort: { $natural: -1 } });
        if (lastDoc) {
          cursor = collection.find({ 
            _id: { $gt: lastDoc._id },
            ...(options.additionalFilter || {})
          }, tailableOptions);
        } else {
          cursor = collection.find(options.additionalFilter || {}, tailableOptions);
        }
      } else {
        cursor = collection.find(options.additionalFilter || {}, tailableOptions);
      }
      
      // Store cursor for management
      const cursorId = `${collectionName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.tailableCursors.set(cursorId, {
        cursor: cursor,
        collectionName: collectionName,
        options: tailableOptions,
        createdAt: new Date(),
        active: true,
        
        // Performance tracking
        documentsRead: 0,
        lastActivity: new Date()
      });
      
      console.log(`Tailable cursor created: ${cursorId} for collection ${collectionName}`);
      
      return {
        cursorId: cursorId,
        cursor: cursor,
        collectionName: collectionName,
        tailableEnabled: true,
        awaitData: tailableOptions.awaitData
      };
      
    } catch (error) {
      console.error(`Error creating tailable cursor for ${collectionName}:`, error);
      throw error;
    }
  }

  async streamFromTailableCursor(cursorId, eventHandler, errorHandler) {
    console.log(`Starting streaming from tailable cursor: ${cursorId}`);
    
    try {
      const cursorInfo = this.tailableCursors.get(cursorId);
      if (!cursorInfo || !cursorInfo.active) {
        throw new Error(`Tailable cursor ${cursorId} not found or inactive`);
      }
      
      const cursor = cursorInfo.cursor;
      let streaming = true;
      
      // Process documents as they arrive
      while (streaming && cursorInfo.active) {
        try {
          const hasNext = await cursor.hasNext();
          
          if (hasNext) {
            const document = await cursor.next();
            
            // Update cursor activity
            cursorInfo.documentsRead++;
            cursorInfo.lastActivity = new Date();
            
            // Call event handler
            if (eventHandler) {
              const continueStreaming = await eventHandler(document, {
                cursorId: cursorId,
                collectionName: cursorInfo.collectionName,
                documentsRead: cursorInfo.documentsRead
              });
              
              if (continueStreaming === false) {
                streaming = false;
              }
            }
            
          } else {
            // Wait for new data (cursor will block until new documents arrive)
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (cursorError) {
          console.error(`Error in tailable cursor streaming:`, cursorError);
          
          if (errorHandler) {
            const shouldContinue = await errorHandler(cursorError, {
              cursorId: cursorId,
              collectionName: cursorInfo.collectionName
            });
            
            if (!shouldContinue) {
              streaming = false;
            }
          } else {
            streaming = false;
          }
        }
      }
      
      console.log(`Streaming completed for cursor: ${cursorId}`);
      
    } catch (error) {
      console.error(`Error streaming from tailable cursor ${cursorId}:`, error);
      throw error;
    }
  }

  async bulkInsertToStream(collectionName, documents, options = {}) {
    console.log(`Performing bulk insert to capped collection: ${collectionName}`);
    
    try {
      const collectionConfig = this.cappedCollections.get(collectionName);
      if (!collectionConfig) {
        throw new Error(`Collection ${collectionName} not found in capped collections`);
      }
      
      const collection = collectionConfig.collection;
      
      // Prepare documents with capped collection optimization
      const optimizedDocuments = documents.map(doc => ({
        _id: new ObjectId(),
        timestamp: doc.timestamp || new Date(),
        ...doc,
        
        // Capped collection metadata
        insertionOrder: true,
        bulkInserted: true,
        batchId: options.batchId || new ObjectId().toString()
      }));
      
      // Perform optimized bulk insert
      const bulkOptions = {
        ordered: options.ordered !== false,
        writeConcern: { w: 1, j: false }, // Optimized for throughput
        bypassDocumentValidation: options.bypassValidation || false
      };
      
      const result = await collection.insertMany(optimizedDocuments, bulkOptions);
      
      // Update bulk performance metrics
      await this.updateCollectionMetrics(collectionName, 'bulk_insert', {
        documentsInserted: optimizedDocuments.length,
        batchSize: optimizedDocuments.length,
        bulkOperation: true
      });
      
      console.log(`Bulk insert completed: ${result.insertedCount} documents inserted to ${collectionName}`);
      
      return {
        insertedCount: result.insertedCount,
        insertedIds: Object.values(result.insertedIds),
        batchId: options.batchId,
        cappedOptimized: true,
        insertionOrder: true
      };
      
    } catch (error) {
      console.error(`Error performing bulk insert to ${collectionName}:`, error);
      throw error;
    }
  }

  async getCollectionStats(collectionName) {
    console.log(`Retrieving statistics for capped collection: ${collectionName}`);
    
    try {
      const collectionConfig = this.cappedCollections.get(collectionName);
      if (!collectionConfig) {
        throw new Error(`Collection ${collectionName} not found`);
      }
      
      const collection = collectionConfig.collection;
      
      // Get MongoDB collection statistics
      const stats = await this.db.command({ collStats: collectionName });
      
      // Get collection configuration
      const cappedOptions = collectionConfig.cappedOptions;
      
      // Calculate utilization metrics
      const sizeUtilization = (stats.size / cappedOptions.size) * 100;
      const countUtilization = cappedOptions.max ? (stats.count / cappedOptions.max) * 100 : 0;
      
      // Get recent activity metrics
      const performanceMetrics = this.performanceMetrics.get(collectionName) || {};
      
      const collectionStats = {
        collectionName: collectionName,
        cappedCollection: stats.capped,
        useCase: collectionConfig.useCase,
        performanceProfile: collectionConfig.performanceProfile,
        
        // Size and capacity metrics
        currentSize: stats.size,
        maxSize: cappedOptions.size,
        sizeUtilization: Math.round(sizeUtilization * 100) / 100,
        
        currentCount: stats.count,
        maxCount: cappedOptions.max || null,
        countUtilization: Math.round(countUtilization * 100) / 100,
        
        // Storage details
        avgDocumentSize: stats.avgObjSize,
        storageSize: stats.storageSize,
        totalIndexSize: stats.totalIndexSize,
        indexSizes: stats.indexSizes,
        
        // Performance indicators
        insertRate: performanceMetrics.insertRate || 0,
        queryRate: performanceMetrics.queryRate || 0,
        lastInsertTime: performanceMetrics.lastInsertTime || null,
        
        // Capped collection specific
        insertionOrder: collectionConfig.insertionOrder,
        tailableSupported: collectionConfig.tailableSupported,
        
        // Operational status
        healthStatus: this.assessCollectionHealth(sizeUtilization, countUtilization),
        recommendations: this.generateRecommendations(collectionName, sizeUtilization, performanceMetrics)
      };
      
      console.log(`Statistics retrieved for ${collectionName}: ${collectionStats.currentCount} documents, ${collectionStats.sizeUtilization}% capacity`);
      
      return collectionStats;
      
    } catch (error) {
      console.error(`Error retrieving statistics for ${collectionName}:`, error);
      throw error;
    }
  }

  // Utility methods for capped collection management

  async updateCollectionMetrics(collectionName, operation, metadata) {
    if (!this.config.enableMetricsCollection) return;
    
    const now = new Date();
    const metrics = this.performanceMetrics.get(collectionName) || {
      insertCount: 0,
      insertRate: 0,
      queryCount: 0,
      queryRate: 0,
      lastInsertTime: null,
      lastQueryTime: null,
      operationHistory: []
    };
    
    // Update operation counts and rates
    if (operation === 'insert' || operation === 'stream' || operation === 'bulk_insert') {
      metrics.insertCount += metadata.documentsInserted || 1;
      metrics.lastInsertTime = now;
      
      // Calculate insert rate (operations per second over last minute)
      const oneMinuteAgo = new Date(now.getTime() - 60000);
      const recentInserts = metrics.operationHistory.filter(
        op => op.type === 'insert' && op.timestamp > oneMinuteAgo
      ).length;
      metrics.insertRate = recentInserts;
    }
    
    // Record operation in history
    metrics.operationHistory.push({
      type: operation,
      timestamp: now,
      metadata: metadata
    });
    
    // Keep only last 1000 operations for performance
    if (metrics.operationHistory.length > 1000) {
      metrics.operationHistory = metrics.operationHistory.slice(-1000);
    }
    
    this.performanceMetrics.set(collectionName, metrics);
  }

  assessCollectionHealth(sizeUtilization, countUtilization) {
    const maxUtilization = Math.max(sizeUtilization, countUtilization);
    
    if (maxUtilization >= 95) return 'critical';
    if (maxUtilization >= 85) return 'warning';
    if (maxUtilization >= 70) return 'caution';
    return 'healthy';
  }

  generateRecommendations(collectionName, sizeUtilization, performanceMetrics) {
    const recommendations = [];
    
    if (sizeUtilization > 85) {
      recommendations.push('Consider increasing capped collection size limit');
    }
    
    if (performanceMetrics.insertRate > 10000) {
      recommendations.push('High insert rate detected - consider bulk insert optimization');
    }
    
    if (sizeUtilization < 30 && performanceMetrics.insertRate < 100) {
      recommendations.push('Collection may be oversized for current workload');
    }
    
    return recommendations;
  }

  async closeTailableCursor(cursorId) {
    console.log(`Closing tailable cursor: ${cursorId}`);
    
    try {
      const cursorInfo = this.tailableCursors.get(cursorId);
      if (cursorInfo) {
        cursorInfo.active = false;
        await cursorInfo.cursor.close();
        this.tailableCursors.delete(cursorId);
        console.log(`Tailable cursor closed: ${cursorId}`);
      }
    } catch (error) {
      console.error(`Error closing tailable cursor ${cursorId}:`, error);
    }
  }

  async cleanup() {
    console.log('Cleaning up Capped Collections Manager...');
    
    // Close all tailable cursors
    for (const [cursorId, cursorInfo] of this.tailableCursors) {
      try {
        cursorInfo.active = false;
        await cursorInfo.cursor.close();
      } catch (error) {
        console.error(`Error closing cursor ${cursorId}:`, error);
      }
    }
    
    // Clear all management state
    this.cappedCollections.clear();
    this.tailableCursors.clear();
    this.performanceMetrics.clear();
    this.capacityMonitors.clear();
    
    console.log('Capped Collections Manager cleanup completed');
  }
}

// Example usage demonstrating high-performance streaming with capped collections
async function demonstrateHighPerformanceStreaming() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  const cappedManager = new MongoCappedCollectionManager(client, {
    database: 'high_performance_streaming',
    enableTailableCursors: true,
    enableMetricsCollection: true,
    enablePerformanceMonitoring: true
  });
  
  try {
    // Demonstrate high-volume application logging
    console.log('Demonstrating high-performance application logging...');
    const logPromises = [];
    for (let i = 0; i < 1000; i++) {
      logPromises.push(cappedManager.logApplicationEvent({
        level: ['INFO', 'WARN', 'ERROR'][Math.floor(Math.random() * 3)],
        application: 'web-api',
        component: 'user-service',
        message: `Processing user request ${i}`,
        data: {
          userId: `user_${Math.floor(Math.random() * 1000)}`,
          operation: 'profile_update',
          executionTime: Math.floor(Math.random() * 100) + 10
        },
        traceId: `trace_${i}`,
        requestId: `req_${Date.now()}_${i}`
      }));
    }
    await Promise.all(logPromises);
    console.log('High-volume logging completed');
    
    // Demonstrate event streaming with tailable cursor
    console.log('Demonstrating real-time event streaming...');
    const tailableCursor = await cappedManager.createTailableCursor('event_stream', {
      fromLatest: true,
      batchSize: 50
    });
    
    // Start streaming events in background
    const streamingPromise = cappedManager.streamFromTailableCursor(
      tailableCursor.cursorId,
      async (document, context) => {
        console.log(`Streamed event: ${document.eventType} from ${document.eventSource}`);
        return context.documentsRead < 100; // Stop after 100 events
      },
      async (error, context) => {
        console.error(`Streaming error:`, error.message);
        return false; // Stop on error
      }
    );
    
    // Generate stream events
    const eventPromises = [];
    for (let i = 0; i < 100; i++) {
      eventPromises.push(cappedManager.streamEvent({
        type: ['page_view', 'user_action', 'system_event'][Math.floor(Math.random() * 3)],
        source: 'web_application',
        streamName: 'user_activity',
        payload: {
          userId: `user_${Math.floor(Math.random() * 100)}`,
          action: 'click',
          page: '/dashboard',
          timestamp: new Date()
        },
        correlationId: `correlation_${i}`
      }));
      
      // Add small delay to demonstrate real-time streaming
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    await Promise.all(eventPromises);
    await streamingPromise;
    
    // Demonstrate bulk metrics insertion
    console.log('Demonstrating bulk metrics recording...');
    const metrics = [];
    for (let i = 0; i < 500; i++) {
      metrics.push({
        type: 'performance',
        name: 'response_time',
        value: Math.floor(Math.random() * 1000) + 50,
        unit: 'milliseconds',
        source: 'api-gateway',
        tags: {
          endpoint: '/api/users',
          method: 'GET',
          status_code: 200
        }
      });
    }
    
    await cappedManager.bulkInsertToStream('realtime_metrics', metrics, {
      batchId: 'metrics_batch_' + Date.now()
    });
    
    // Get collection statistics
    const logsStats = await cappedManager.getCollectionStats('application_logs');
    const eventsStats = await cappedManager.getCollectionStats('event_stream');
    const metricsStats = await cappedManager.getCollectionStats('realtime_metrics');
    
    console.log('High-Performance Streaming Results:');
    console.log('Application Logs Stats:', {
      count: logsStats.currentCount,
      sizeUtilization: logsStats.sizeUtilization,
      healthStatus: logsStats.healthStatus
    });
    console.log('Event Stream Stats:', {
      count: eventsStats.currentCount,
      sizeUtilization: eventsStats.sizeUtilization,
      healthStatus: eventsStats.healthStatus
    });
    console.log('Metrics Stats:', {
      count: metricsStats.currentCount,
      sizeUtilization: metricsStats.sizeUtilization,
      healthStatus: metricsStats.healthStatus
    });
    
    return {
      logsStats,
      eventsStats,
      metricsStats,
      tailableCursorDemo: true,
      bulkInsertDemo: true
    };
    
  } catch (error) {
    console.error('Error demonstrating high-performance streaming:', error);
    throw error;
  } finally {
    await cappedManager.cleanup();
    await client.close();
  }
}

// Benefits of MongoDB Capped Collections:
// - Native circular buffer functionality eliminates manual buffer overflow management
// - Guaranteed insertion order maintains chronological data integrity for time-series applications  
// - Automatic size management prevents storage bloat without external cleanup procedures
// - Tailable cursors enable real-time streaming applications with minimal latency
// - Optimized storage patterns provide superior performance for high-volume append-only workloads
// - Zero-maintenance operation reduces operational overhead compared to traditional logging systems
// - Built-in FIFO behavior ensures oldest data is automatically removed when capacity limits are reached
// - Integration with MongoDB's replication and sharding for distributed streaming architectures

module.exports = {
  MongoCappedCollectionManager,
  demonstrateHighPerformanceStreaming
};
```

## SQL-Style Capped Collection Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB capped collections and circular buffer management:

```sql
-- QueryLeaf capped collections with SQL-familiar circular buffer management syntax

-- Configure capped collection settings and performance optimization
SET capped_collection_monitoring = true;
SET enable_tailable_cursors = true; 
SET enable_performance_metrics = true;
SET default_capped_size_mb = 1024; -- 1GB default
SET default_capped_max_documents = 1000000;
SET enable_bulk_insert_optimization = true;

-- Create capped collections with circular buffer functionality
WITH capped_collection_definitions AS (
  SELECT 
    collection_name,
    capped_size_bytes,
    max_document_count,
    use_case,
    performance_profile,
    
    -- Collection optimization settings
    JSON_BUILD_OBJECT(
      'capped', true,
      'size', capped_size_bytes,
      'max', max_document_count,
      'storageEngine', JSON_BUILD_OBJECT(
        'wiredTiger', JSON_BUILD_OBJECT(
          'configString', 'block_compressor=snappy'
        )
      )
    ) as creation_options,
    
    -- Index configuration for capped collections
    CASE use_case
      WHEN 'application_logging' THEN ARRAY[
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('logLevel', 1, 'timestamp', 1)),
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('application', 1, 'component', 1)),
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('traceId', 1), 'sparse', true)
      ]
      WHEN 'event_streaming' THEN ARRAY[
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('eventType', 1, 'timestamp', 1)),
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('streamName', 1)),
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('correlationId', 1), 'sparse', true)
      ]
      WHEN 'metrics_collection' THEN ARRAY[
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('metricType', 1, 'timestamp', 1)),
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('source', 1, 'timestamp', -1)),
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('aggregationLevel', 1))
      ]
      ELSE ARRAY[
        JSON_BUILD_OBJECT('key', JSON_BUILD_OBJECT('timestamp', 1))
      ]
    END as index_configuration
    
  FROM (VALUES
    ('application_logs_capped', 1024 * 1024 * 1024, 1000000, 'application_logging', 'high_throughput'),
    ('event_stream_capped', 2048 * 1024 * 1024, 5000000, 'event_streaming', 'ultra_high_throughput'),
    ('realtime_metrics_capped', 512 * 1024 * 1024, 2000000, 'metrics_collection', 'time_series_optimized'),
    ('audit_trail_capped', 256 * 1024 * 1024, 500000, 'audit_logging', 'compliance_optimized'),
    ('system_events_capped', 128 * 1024 * 1024, 250000, 'system_monitoring', 'operational_tracking')
  ) AS collections(collection_name, capped_size_bytes, max_document_count, use_case, performance_profile)
),

-- High-performance application logging with capped collections
application_logs_streaming AS (
  INSERT INTO application_logs_capped
  SELECT 
    GENERATE_UUID() as log_id,
    CURRENT_TIMESTAMP - (random() * INTERVAL '1 hour') as timestamp,
    
    -- Log classification and severity
    (ARRAY['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'])
      [1 + floor(random() * 5)] as log_level,
    (ARRAY['web-api', 'auth-service', 'data-processor', 'notification-service'])
      [1 + floor(random() * 4)] as application,
    (ARRAY['controller', 'service', 'repository', 'middleware'])
      [1 + floor(random() * 4)] as component,
    
    -- Log content and context
    'Processing request for user operation ' || generate_series(1, 10000) as message,
    JSON_BUILD_OBJECT(
      'userId', 'user_' || (1 + floor(random() * 1000)),
      'operation', (ARRAY['create', 'read', 'update', 'delete', 'search'])[1 + floor(random() * 5)],
      'executionTime', floor(random() * 500) + 10,
      'memoryUsage', ROUND((random() * 100 + 50)::decimal, 2),
      'requestSize', floor(random() * 10000) + 100
    ) as log_data,
    
    -- Request correlation and tracing
    'req_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) || '_' || generate_series(1, 10000) as request_id,
    'session_' || (1 + floor(random() * 1000)) as session_id,
    'trace_' || generate_series(1, 10000) as trace_id,
    'span_' || generate_series(1, 10000) as span_id,
    
    -- Server and environment context
    ('server_' || (1 + floor(random() * 10))) as hostname,
    (1000 + floor(random() * 9000)) as process_id,
    'production' as environment,
    
    -- Capped collection metadata
    true as insertion_order_guaranteed,
    true as circular_buffer_managed,
    'high_throughput' as performance_optimized
  RETURNING log_id, timestamp, log_level, application
),

-- Real-time event streaming with automatic buffer management
event_stream_operations AS (
  INSERT INTO event_stream_capped
  SELECT 
    GENERATE_UUID() as event_id,
    CURRENT_TIMESTAMP - (random() * INTERVAL '30 minutes') as timestamp,
    
    -- Event classification
    (ARRAY['page_view', 'user_action', 'system_event', 'api_call', 'data_change'])
      [1 + floor(random() * 5)] as event_type,
    (ARRAY['web_app', 'mobile_app', 'api_gateway', 'background_service'])
      [1 + floor(random() * 4)] as event_source,
    
    -- Event payload and metadata
    JSON_BUILD_OBJECT(
      'userId', 'user_' || (1 + floor(random() * 500)),
      'action', (ARRAY['click', 'view', 'submit', 'navigate', 'search'])[1 + floor(random() * 5)],
      'page', (ARRAY['/dashboard', '/profile', '/settings', '/reports', '/admin'])[1 + floor(random() * 5)],
      'duration', floor(random() * 5000) + 100,
      'userAgent', 'Mozilla/5.0 (Enterprise Browser)',
      'ipAddress', '192.168.' || (1 + floor(random() * 254)) || '.' || (1 + floor(random() * 254))
    ) as event_data,
    
    -- Streaming metadata
    (ARRAY['user_activity', 'system_monitoring', 'api_analytics', 'security_events'])
      [1 + floor(random() * 4)] as stream_name,
    'partition_' || (1 + floor(random() * 10)) as partition_key,
    EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000000 + generate_series(1, 50000) as sequence_number,
    
    -- Processing and correlation
    false as processed,
    0 as processing_attempts,
    'correlation_' || generate_series(1, 50000) as correlation_id,
    
    -- Performance optimization metadata
    JSON_LENGTH(event_data::text) as event_size_bytes,
    floor(random() * 50) + 5 as ingestion_latency_ms,
    
    -- Capped collection optimization
    true as tailable_cursor_ready,
    true as buffer_optimized,
    true as insertion_order_maintained
  RETURNING event_id, event_type, stream_name, sequence_number
),

-- High-frequency metrics collection with time-series optimization  
metrics_collection_operations AS (
  INSERT INTO realtime_metrics_capped
  SELECT 
    GENERATE_UUID() as metric_id,
    CURRENT_TIMESTAMP - (random() * INTERVAL '15 minutes') as timestamp,
    
    -- Metric classification
    (ARRAY['performance', 'business', 'system', 'security', 'custom'])
      [1 + floor(random() * 5)] as metric_type,
    (ARRAY['response_time', 'throughput', 'error_rate', 'cpu_usage', 'memory_usage', 'disk_io', 'network_latency'])
      [1 + floor(random() * 7)] as metric_name,
    
    -- Metric values and units
    CASE 
      WHEN metric_name IN ('response_time', 'network_latency') THEN random() * 1000 + 10
      WHEN metric_name = 'cpu_usage' THEN random() * 100
      WHEN metric_name = 'memory_usage' THEN random() * 16 + 2  -- GB
      WHEN metric_name = 'error_rate' THEN random() * 5
      WHEN metric_name = 'throughput' THEN random() * 10000 + 100
      ELSE random() * 1000
    END as value,
    
    CASE 
      WHEN metric_name IN ('response_time', 'network_latency') THEN 'milliseconds'
      WHEN metric_name IN ('cpu_usage', 'error_rate') THEN 'percent'
      WHEN metric_name = 'memory_usage' THEN 'gigabytes'
      WHEN metric_name = 'throughput' THEN 'requests_per_second'
      ELSE 'count'
    END as unit,
    
    -- Source and tagging
    (ARRAY['api-gateway', 'web-server', 'database', 'cache', 'queue'])
      [1 + floor(random() * 5)] as source,
    'application' as source_type,
    
    JSON_BUILD_OBJECT(
      'environment', 'production',
      'region', (ARRAY['us-east-1', 'us-west-2', 'eu-west-1'])[1 + floor(random() * 3)],
      'service', (ARRAY['auth', 'users', 'orders', 'notifications'])[1 + floor(random() * 4)],
      'instance', 'instance_' || (1 + floor(random() * 20))
    ) as tags,
    
    -- Time series optimization
    'raw' as aggregation_level,
    NULL as aggregation_window,
    
    -- Bucketing for time-series efficiency (1-minute buckets)
    DATE_TRUNC('minute', CURRENT_TIMESTAMP) as bucket_timestamp,
    
    -- Performance metadata
    true as time_series_optimized,
    EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000 as collection_timestamp_ms,
    floor(random() * 10) + 1 as processing_latency_ms
  RETURNING metric_id, metric_type, metric_name, value, source
),

-- Monitor capped collection performance and utilization
capped_collection_monitoring AS (
  SELECT 
    collection_name,
    use_case,
    performance_profile,
    
    -- Collection capacity analysis
    capped_size_bytes as max_size_bytes,
    max_document_count as max_documents,
    
    -- Simulated current utilization (in production would query actual stats)
    CASE collection_name
      WHEN 'application_logs_capped' THEN floor(random() * 800000) + 100000  -- 100k-900k docs
      WHEN 'event_stream_capped' THEN floor(random() * 4000000) + 500000   -- 500k-4.5M docs  
      WHEN 'realtime_metrics_capped' THEN floor(random() * 1500000) + 200000 -- 200k-1.7M docs
      WHEN 'audit_trail_capped' THEN floor(random() * 300000) + 50000       -- 50k-350k docs
      ELSE floor(random() * 100000) + 10000
    END as current_document_count,
    
    -- Estimated current size (simplified calculation)
    CASE collection_name  
      WHEN 'application_logs_capped' THEN floor(random() * 800000000) + 100000000  -- 100MB-800MB
      WHEN 'event_stream_capped' THEN floor(random() * 1600000000) + 200000000    -- 200MB-1.6GB
      WHEN 'realtime_metrics_capped' THEN floor(random() * 400000000) + 50000000  -- 50MB-400MB
      WHEN 'audit_trail_capped' THEN floor(random() * 200000000) + 25000000       -- 25MB-200MB
      ELSE floor(random() * 50000000) + 10000000
    END as current_size_bytes,
    
    -- Performance simulation
    CASE performance_profile
      WHEN 'ultra_high_throughput' THEN floor(random() * 50000) + 10000  -- 10k-60k inserts/sec
      WHEN 'high_throughput' THEN floor(random() * 20000) + 5000         -- 5k-25k inserts/sec
      WHEN 'time_series_optimized' THEN floor(random() * 15000) + 3000   -- 3k-18k inserts/sec
      WHEN 'compliance_optimized' THEN floor(random() * 5000) + 1000     -- 1k-6k inserts/sec
      ELSE floor(random() * 2000) + 500                                  -- 500-2.5k inserts/sec
    END as estimated_insert_rate_per_sec
    
  FROM capped_collection_definitions
),

-- Calculate utilization metrics and health assessment
capped_utilization_analysis AS (
  SELECT 
    ccm.collection_name,
    ccm.use_case,
    ccm.performance_profile,
    
    -- Capacity utilization
    ccm.current_document_count,
    ccm.max_documents,
    ROUND((ccm.current_document_count::decimal / ccm.max_documents::decimal) * 100, 1) as document_utilization_percent,
    
    ccm.current_size_bytes,
    ccm.max_size_bytes,
    ROUND((ccm.current_size_bytes::decimal / ccm.max_size_bytes::decimal) * 100, 1) as size_utilization_percent,
    
    -- Performance metrics
    ccm.estimated_insert_rate_per_sec,
    ROUND(ccm.current_size_bytes::decimal / ccm.current_document_count::decimal, 2) as avg_document_size_bytes,
    
    -- Storage efficiency
    ROUND(ccm.current_size_bytes / (1024 * 1024)::decimal, 2) as current_size_mb,
    ROUND(ccm.max_size_bytes / (1024 * 1024)::decimal, 2) as max_size_mb,
    
    -- Operational assessment
    CASE 
      WHEN GREATEST(
        (ccm.current_document_count::decimal / ccm.max_documents::decimal) * 100,
        (ccm.current_size_bytes::decimal / ccm.max_size_bytes::decimal) * 100
      ) >= 95 THEN 'critical'
      WHEN GREATEST(
        (ccm.current_document_count::decimal / ccm.max_documents::decimal) * 100,
        (ccm.current_size_bytes::decimal / ccm.max_size_bytes::decimal) * 100
      ) >= 85 THEN 'warning'
      WHEN GREATEST(
        (ccm.current_document_count::decimal / ccm.max_documents::decimal) * 100,
        (ccm.current_size_bytes::decimal / ccm.max_size_bytes::decimal) * 100
      ) >= 70 THEN 'caution'
      ELSE 'healthy'
    END as health_status,
    
    -- Throughput assessment
    CASE 
      WHEN ccm.estimated_insert_rate_per_sec > 25000 THEN 'ultra_high'
      WHEN ccm.estimated_insert_rate_per_sec > 10000 THEN 'high'
      WHEN ccm.estimated_insert_rate_per_sec > 5000 THEN 'medium'
      WHEN ccm.estimated_insert_rate_per_sec > 1000 THEN 'moderate'
      ELSE 'low'
    END as throughput_classification
    
  FROM capped_collection_monitoring ccm
),

-- Generate optimization recommendations
capped_optimization_recommendations AS (
  SELECT 
    cua.collection_name,
    cua.health_status,
    cua.throughput_classification,
    cua.document_utilization_percent,
    cua.size_utilization_percent,
    
    -- Capacity recommendations
    CASE 
      WHEN cua.size_utilization_percent > 90 THEN 'Increase capped collection size immediately'
      WHEN cua.document_utilization_percent > 90 THEN 'Increase document count limit immediately'
      WHEN cua.size_utilization_percent > 80 THEN 'Monitor closely and consider size increase'
      WHEN cua.size_utilization_percent < 30 AND cua.throughput_classification = 'low' THEN 'Consider reducing collection size for efficiency'
      ELSE 'Capacity within optimal range'
    END as capacity_recommendation,
    
    -- Performance recommendations
    CASE 
      WHEN cua.throughput_classification = 'ultra_high' THEN 'Optimize for maximum throughput with bulk inserts'
      WHEN cua.throughput_classification = 'high' THEN 'Enable write optimization and consider sharding'
      WHEN cua.throughput_classification = 'medium' THEN 'Standard configuration appropriate'
      WHEN cua.throughput_classification = 'low' THEN 'Consider consolidating with other collections'
      ELSE 'Review usage patterns'
    END as performance_recommendation,
    
    -- Operational recommendations
    CASE 
      WHEN cua.health_status = 'critical' THEN 'Immediate intervention required'
      WHEN cua.health_status = 'warning' THEN 'Plan capacity expansion within 24 hours'
      WHEN cua.health_status = 'caution' THEN 'Monitor usage trends and prepare for expansion'
      ELSE 'Continue monitoring with current configuration'
    END as operational_recommendation,
    
    -- Efficiency metrics
    ROUND(cua.estimated_insert_rate_per_sec::decimal / (cua.size_utilization_percent / 100::decimal), 2) as efficiency_ratio,
    
    -- Projected timeline to capacity
    CASE 
      WHEN cua.estimated_insert_rate_per_sec > 0 AND cua.size_utilization_percent < 95 THEN
        ROUND(
          (cua.max_documents - cua.current_document_count)::decimal / 
          (cua.estimated_insert_rate_per_sec::decimal * 3600), 
          1
        )
      ELSE NULL
    END as hours_to_document_capacity,
    
    -- Circular buffer efficiency
    CASE 
      WHEN cua.size_utilization_percent > 90 THEN 'Active circular buffer management'
      WHEN cua.size_utilization_percent > 70 THEN 'Approaching circular buffer activation' 
      ELSE 'Pre-circular buffer phase'
    END as circular_buffer_status
    
  FROM capped_utilization_analysis cua
)

-- Comprehensive capped collections management dashboard
SELECT 
  cor.collection_name,
  cor.use_case,
  cor.throughput_classification,
  cor.health_status,
  
  -- Current state
  cua.current_document_count as documents,
  cua.document_utilization_percent || '%' as doc_utilization,
  cua.current_size_mb || ' MB' as current_size,
  cua.size_utilization_percent || '%' as size_utilization,
  
  -- Performance metrics
  cua.estimated_insert_rate_per_sec as inserts_per_second,
  ROUND(cua.avg_document_size_bytes / 1024, 2) || ' KB' as avg_doc_size,
  cor.efficiency_ratio as efficiency_score,
  
  -- Capacity management
  cor.circular_buffer_status,
  COALESCE(cor.hours_to_document_capacity || ' hours', 'N/A') as time_to_capacity,
  
  -- Operational guidance
  cor.capacity_recommendation,
  cor.performance_recommendation,
  cor.operational_recommendation,
  
  -- Capped collection benefits
  JSON_BUILD_OBJECT(
    'guaranteed_insertion_order', true,
    'automatic_size_management', true,
    'circular_buffer_behavior', true,
    'tailable_cursor_support', true,
    'high_performance_writes', true,
    'zero_maintenance_required', true
  ) as capped_collection_features,
  
  -- Next actions
  CASE cor.health_status
    WHEN 'critical' THEN 'Execute capacity expansion immediately'
    WHEN 'warning' THEN 'Schedule capacity planning meeting'
    WHEN 'caution' THEN 'Increase monitoring frequency'
    ELSE 'Continue standard monitoring'
  END as immediate_actions,
  
  -- Optimization opportunities
  CASE 
    WHEN cor.throughput_classification = 'ultra_high' AND cua.size_utilization_percent < 50 THEN 
      'Optimize collection size for current throughput'
    WHEN cor.efficiency_ratio > 1000 THEN 
      'Excellent efficiency - consider as template for other collections'
    WHEN cor.efficiency_ratio < 100 THEN
      'Review configuration for efficiency improvements'
    ELSE 'Configuration optimized for current workload'
  END as optimization_opportunities

FROM capped_optimization_recommendations cor
JOIN capped_utilization_analysis cua ON cor.collection_name = cua.collection_name
ORDER BY 
  CASE cor.health_status
    WHEN 'critical' THEN 1
    WHEN 'warning' THEN 2  
    WHEN 'caution' THEN 3
    ELSE 4
  END,
  cua.size_utilization_percent DESC;

-- QueryLeaf provides comprehensive MongoDB capped collection capabilities:
-- 1. Native circular buffer functionality with SQL-familiar collection management syntax
-- 2. Automatic size and document count management without manual cleanup procedures
-- 3. High-performance streaming applications with tailable cursor and real-time processing support
-- 4. Time-series optimized storage patterns for metrics, logs, and event data
-- 5. Enterprise-grade monitoring with capacity utilization and performance analytics
-- 6. Guaranteed insertion order maintenance for chronological data integrity
-- 7. Integration with MongoDB's replication and sharding for distributed streaming architectures
-- 8. SQL-style capped collection operations for familiar database management workflows
-- 9. Advanced performance optimization with bulk insert and streaming operation support
-- 10. Zero-maintenance circular buffer management with automatic FIFO behavior and overflow handling
```

## Best Practices for MongoDB Capped Collections Implementation

### High-Performance Streaming Architecture

Essential practices for implementing capped collections effectively in production environments:

1. **Size Planning Strategy**: Plan capped collection sizes based on data velocity, retention requirements, and query patterns for optimal performance
2. **Index Optimization**: Use minimal, strategic indexing that supports query patterns without impacting insert performance  
3. **Tailable Cursor Management**: Implement robust tailable cursor patterns for real-time data consumption with proper error handling
4. **Monitoring and Alerting**: Establish comprehensive monitoring for collection capacity, insertion rates, and performance metrics
5. **Integration Patterns**: Design application integration that leverages natural insertion order and circular buffer behavior
6. **Performance Baselines**: Establish performance baselines for insert rates, query response times, and storage utilization

### Production Deployment and Scalability

Optimize capped collections for enterprise-scale streaming requirements:

1. **Capacity Management**: Implement proactive capacity monitoring with automated alerting before reaching collection limits
2. **Replication Strategy**: Configure capped collections across replica sets with considerations for network bandwidth and lag
3. **Sharding Considerations**: Understand sharding limitations and alternatives for capped collections in distributed deployments
4. **Backup Integration**: Design backup strategies that account for circular buffer behavior and data rotation patterns
5. **Operational Procedures**: Create standardized procedures for capped collection management, capacity expansion, and performance tuning
6. **Disaster Recovery**: Plan for capped collection recovery scenarios with considerations for data loss tolerance and restoration priorities

## Conclusion

MongoDB capped collections provide enterprise-grade circular buffer functionality that eliminates manual buffer management complexity while delivering superior performance for high-volume streaming applications. The native FIFO behavior combined with guaranteed insertion order and tailable cursor support makes capped collections ideal for logging, event streaming, metrics collection, and real-time data processing scenarios.

Key MongoDB Capped Collection benefits include:

- **Circular Buffer Management**: Automatic size management with FIFO behavior eliminates manual cleanup and rotation procedures
- **Guaranteed Insertion Order**: Natural insertion order maintains chronological integrity for time-series and logging applications
- **High-Performance Writes**: Optimized storage patterns provide maximum throughput for append-heavy workloads
- **Real-Time Streaming**: Tailable cursors enable efficient real-time data consumption with minimal latency
- **Zero Maintenance**: No manual intervention required for buffer overflow management or data rotation
- **SQL Accessibility**: Familiar capped collection management through SQL-style syntax and operations

Whether you're building logging systems, event streaming platforms, metrics collection infrastructure, or real-time monitoring applications, MongoDB capped collections with QueryLeaf's familiar SQL interface provide the foundation for scalable, efficient, and maintainable streaming data architectures.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB capped collections while providing SQL-familiar syntax for circular buffer management, streaming operations, and performance monitoring. Advanced capped collection patterns, tailable cursor management, and high-throughput optimization techniques are seamlessly accessible through familiar SQL constructs, making sophisticated streaming data management both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's native circular buffer capabilities with SQL-style streaming operations makes it an ideal platform for applications requiring both high-performance data ingestion and familiar operational patterns, ensuring your streaming architectures can handle enterprise-scale data volumes while maintaining operational simplicity and performance excellence.