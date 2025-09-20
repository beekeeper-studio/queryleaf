---
title: "MongoDB Capped Collections and Circular Buffers: High-Performance Logging and Event Storage with SQL-Style Data Management"
description: "Master MongoDB Capped Collections for high-performance logging, circular buffer patterns, and real-time event storage. Learn automatic size management, insertion order preservation, and SQL-familiar log analysis techniques."
date: 2025-09-19
tags: [mongodb, capped-collections, logging, circular-buffers, performance, event-storage, sql, real-time]
---

# MongoDB Capped Collections and Circular Buffers: High-Performance Logging and Event Storage with SQL-Style Data Management

High-performance applications generate massive volumes of log data, events, and operational metrics that require specialized storage patterns optimized for write-heavy workloads, automatic size management, and chronological data access. Traditional database approaches for logging and event storage struggle with write performance bottlenecks, complex rotation mechanisms, and inefficient space utilization when dealing with continuous data streams.

MongoDB Capped Collections provide purpose-built capabilities for circular buffer patterns, offering fixed-size collections with automatic document rotation, natural insertion-order preservation, and optimized write performance. Unlike traditional logging solutions that require complex partitioning schemes or external rotation tools, capped collections automatically manage storage limits while maintaining chronological access patterns essential for debugging, monitoring, and real-time analytics.

## The Traditional Logging Storage Challenge

Conventional approaches to high-volume logging and event storage have significant limitations for modern applications:

```sql
-- Traditional relational logging approach - complex and performance-limited

-- PostgreSQL log storage with manual partitioning and rotation
CREATE TABLE application_logs (
    log_id BIGSERIAL PRIMARY KEY,
    application_name VARCHAR(100) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    instance_id VARCHAR(100),
    log_level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    
    -- Structured log data
    request_id VARCHAR(100),
    user_id BIGINT,
    session_id VARCHAR(100),
    trace_id VARCHAR(100),
    span_id VARCHAR(100),
    
    -- Context information  
    source_file VARCHAR(255),
    source_line INTEGER,
    function_name VARCHAR(255),
    thread_id INTEGER,
    
    -- Metadata
    hostname VARCHAR(255),
    environment VARCHAR(50),
    version VARCHAR(50),
    
    -- Log data
    log_data JSONB,
    error_stack TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Partitioning key
    partition_date DATE GENERATED ALWAYS AS (created_at::date) STORED
    
) PARTITION BY RANGE (partition_date);

-- Create monthly partitions (manual maintenance required)
CREATE TABLE application_logs_2024_01 PARTITION OF application_logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE application_logs_2024_02 PARTITION OF application_logs  
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE application_logs_2024_03 PARTITION OF application_logs
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
-- ... manual partition creation continues

-- Indexes for log queries (high overhead on writes)
CREATE INDEX idx_logs_app_service_time ON application_logs (application_name, service_name, created_at);
CREATE INDEX idx_logs_level_time ON application_logs (log_level, created_at);
CREATE INDEX idx_logs_request_id ON application_logs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_logs_user_id_time ON application_logs (user_id, created_at) WHERE user_id IS NOT NULL;
CREATE INDEX idx_logs_trace_id ON application_logs (trace_id) WHERE trace_id IS NOT NULL;

-- Complex log rotation and cleanup procedure
CREATE OR REPLACE FUNCTION cleanup_old_log_partitions()
RETURNS void AS $$
DECLARE
    partition_name TEXT;
    cutoff_date DATE;
BEGIN
    -- Calculate cutoff date (e.g., 90 days retention)
    cutoff_date := CURRENT_DATE - INTERVAL '90 days';
    
    -- Find and drop old partitions
    FOR partition_name IN 
        SELECT schemaname||'.'||tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'application_logs_____'
        AND tablename < 'application_logs_' || to_char(cutoff_date, 'YYYY_MM')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || partition_name || ' CASCADE';
        RAISE NOTICE 'Dropped old partition: %', partition_name;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job (requires external scheduler)
-- SELECT cron.schedule('cleanup-logs', '0 2 * * 0', 'SELECT cleanup_old_log_partitions();');

-- Complex log analysis query with performance issues
WITH recent_logs AS (
    SELECT 
        application_name,
        service_name,
        log_level,
        message,
        request_id,
        user_id,
        trace_id,
        log_data,
        created_at,
        
        -- Row number for chronological ordering
        ROW_NUMBER() OVER (
            PARTITION BY application_name, service_name 
            ORDER BY created_at DESC
        ) as rn,
        
        -- Lag for time between log entries
        LAG(created_at) OVER (
            PARTITION BY application_name, service_name 
            ORDER BY created_at
        ) as prev_log_time
        
    FROM application_logs
    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
      AND log_level IN ('ERROR', 'WARN', 'INFO')
),
error_analysis AS (
    SELECT 
        application_name,
        service_name,
        COUNT(*) as total_logs,
        COUNT(*) FILTER (WHERE log_level = 'ERROR') as error_count,
        COUNT(*) FILTER (WHERE log_level = 'WARN') as warning_count,
        COUNT(*) FILTER (WHERE log_level = 'INFO') as info_count,
        
        -- Error patterns
        array_agg(DISTINCT message) FILTER (WHERE log_level = 'ERROR') as error_messages,
        COUNT(DISTINCT request_id) as unique_requests,
        COUNT(DISTINCT user_id) as affected_users,
        
        -- Timing analysis
        AVG(EXTRACT(EPOCH FROM (created_at - prev_log_time))) as avg_log_interval,
        
        -- Recent errors for immediate attention
        array_agg(
            json_build_object(
                'message', message,
                'created_at', created_at,
                'trace_id', trace_id,
                'request_id', request_id
            ) ORDER BY created_at DESC
        ) FILTER (WHERE log_level = 'ERROR' AND rn <= 10) as recent_errors
        
    FROM recent_logs
    GROUP BY application_name, service_name
),
log_volume_trends AS (
    SELECT 
        application_name,
        service_name,
        DATE_TRUNC('minute', created_at) as minute_bucket,
        COUNT(*) as logs_per_minute,
        COUNT(*) FILTER (WHERE log_level = 'ERROR') as errors_per_minute
    FROM application_logs
    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '2 hours'
    GROUP BY application_name, service_name, DATE_TRUNC('minute', created_at)
)
SELECT 
    ea.application_name,
    ea.service_name,
    ea.total_logs,
    ea.error_count,
    ea.warning_count,
    ea.info_count,
    ROUND((ea.error_count::numeric / ea.total_logs) * 100, 2) as error_rate_percent,
    ea.unique_requests,
    ea.affected_users,
    ROUND(ea.avg_log_interval::numeric, 3) as avg_seconds_between_logs,
    
    -- Volume trend analysis
    (
        SELECT AVG(logs_per_minute)
        FROM log_volume_trends lvt 
        WHERE lvt.application_name = ea.application_name 
          AND lvt.service_name = ea.service_name
    ) as avg_logs_per_minute,
    
    (
        SELECT MAX(logs_per_minute)
        FROM log_volume_trends lvt
        WHERE lvt.application_name = ea.application_name
          AND lvt.service_name = ea.service_name  
    ) as peak_logs_per_minute,
    
    -- Top error messages
    (
        SELECT string_agg(error_msg, '; ') 
        FROM unnest(ea.error_messages) as error_msg
        LIMIT 3
    ) as top_error_messages,
    
    ea.recent_errors

FROM error_analysis ea
ORDER BY ea.error_count DESC, ea.total_logs DESC;

-- Problems with traditional logging approach:
-- 1. Complex partition management and maintenance overhead
-- 2. Write performance degradation with increasing indexes
-- 3. Manual log rotation and cleanup procedures
-- 4. Storage space management challenges
-- 5. Query performance issues across multiple partitions
-- 6. Complex chronological ordering requirements
-- 7. High operational overhead for high-volume logging
-- 8. Scalability limitations with increasing log volumes
-- 9. Backup and restore complexity with partitioned tables
-- 10. Limited flexibility for varying log data structures

-- MySQL logging limitations (even more restrictive)
CREATE TABLE mysql_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    app_name VARCHAR(100),
    level VARCHAR(20),
    message TEXT,
    log_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- MySQL partitioning limitations
    INDEX idx_time_level (created_at, level),
    INDEX idx_app_time (app_name, created_at)
) 
-- Basic range partitioning (limited functionality)
PARTITION BY RANGE (UNIX_TIMESTAMP(created_at)) (
    PARTITION p2024_q1 VALUES LESS THAN (UNIX_TIMESTAMP('2024-04-01')),
    PARTITION p2024_q2 VALUES LESS THAN (UNIX_TIMESTAMP('2024-07-01')),
    PARTITION p2024_q3 VALUES LESS THAN (UNIX_TIMESTAMP('2024-10-01')),
    PARTITION p2024_q4 VALUES LESS THAN (UNIX_TIMESTAMP('2025-01-01'))
);

-- Basic log query in MySQL (limited analytical capabilities)
SELECT 
    app_name,
    level,
    COUNT(*) as log_count,
    MAX(created_at) as latest_log
FROM mysql_logs
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
  AND level IN ('ERROR', 'WARN')
GROUP BY app_name, level
ORDER BY log_count DESC
LIMIT 20;

-- MySQL limitations:
-- - Limited JSON functionality compared to PostgreSQL
-- - Basic partitioning capabilities only  
-- - Poor performance with high-volume inserts
-- - Limited analytical query capabilities
-- - No advanced window functions
-- - Complex maintenance procedures
-- - Storage engine limitations for write-heavy workloads
```

MongoDB Capped Collections provide optimized circular buffer capabilities:

```javascript
// MongoDB Capped Collections - purpose-built for high-performance logging
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('logging_platform');

// Create capped collections for different log types and performance requirements
const createOptimizedCappedCollections = async () => {
  try {
    // High-volume application logs - 1GB circular buffer
    await db.createCollection('application_logs', {
      capped: true,
      size: 1024 * 1024 * 1024, // 1GB maximum size
      max: 10000000 // Maximum 10 million documents (optional limit)
    });

    // Error logs - smaller, longer retention
    await db.createCollection('error_logs', {
      capped: true,
      size: 256 * 1024 * 1024, // 256MB maximum size
      max: 1000000 // Maximum 1 million error documents
    });

    // Access logs - high throughput, shorter retention
    await db.createCollection('access_logs', {
      capped: true,
      size: 2 * 1024 * 1024 * 1024, // 2GB maximum size
      // No max document limit for maximum throughput
    });

    // Performance metrics - structured time-series data
    await db.createCollection('performance_metrics', {
      capped: true,
      size: 512 * 1024 * 1024, // 512MB maximum size
      max: 5000000 // Maximum 5 million metric points
    });

    // Audit trail - compliance and security logs
    await db.createCollection('audit_logs', {
      capped: true,
      size: 128 * 1024 * 1024, // 128MB maximum size
      max: 500000 // Maximum 500k audit events
    });

    console.log('Capped collections created successfully');
    
    // Create indexes for common query patterns (minimal overhead)
    await createOptimalIndexes();
    
    return {
      applicationLogs: db.collection('application_logs'),
      errorLogs: db.collection('error_logs'),
      accessLogs: db.collection('access_logs'),
      performanceMetrics: db.collection('performance_metrics'),
      auditLogs: db.collection('audit_logs')
    };

  } catch (error) {
    console.error('Error creating capped collections:', error);
    throw error;
  }
};

async function createOptimalIndexes() {
  // Minimal indexes for capped collections to maintain write performance
  // Note: Capped collections maintain insertion order automatically
  
  // Application logs - service and level queries
  await db.collection('application_logs').createIndex({ 
    'service': 1, 
    'level': 1 
  });
  
  // Error logs - application and timestamp queries
  await db.collection('error_logs').createIndex({ 
    'application': 1, 
    'timestamp': -1 
  });
  
  // Access logs - endpoint performance analysis
  await db.collection('access_logs').createIndex({ 
    'endpoint': 1, 
    'status_code': 1 
  });
  
  // Performance metrics - metric type and timestamp
  await db.collection('performance_metrics').createIndex({ 
    'metric_type': 1, 
    'instance_id': 1 
  });
  
  // Audit logs - user and action queries
  await db.collection('audit_logs').createIndex({ 
    'user_id': 1, 
    'action': 1 
  });

  console.log('Optimal indexes created for capped collections');
}

// High-performance log ingestion with batch processing
const logIngestionSystem = {
  collections: null,
  buffers: new Map(),
  batchSizes: {
    application_logs: 1000,
    error_logs: 100,
    access_logs: 2000,
    performance_metrics: 500,
    audit_logs: 50
  },
  flushIntervals: new Map(),

  async initialize() {
    this.collections = await createOptimizedCappedCollections();
    
    // Start batch flush timers for each collection
    for (const [collectionName, batchSize] of Object.entries(this.batchSizes)) {
      this.buffers.set(collectionName, []);
      
      // Flush timer based on expected volume
      const flushInterval = collectionName === 'access_logs' ? 1000 : // 1 second
                           collectionName === 'application_logs' ? 2000 : // 2 seconds
                           5000; // 5 seconds for others
      
      const intervalId = setInterval(
        () => this.flushBuffer(collectionName), 
        flushInterval
      );
      
      this.flushIntervals.set(collectionName, intervalId);
    }
    
    console.log('Log ingestion system initialized');
  },

  async logApplicationEvent(logEntry) {
    // Structured application log entry
    const document = {
      timestamp: new Date(),
      application: logEntry.application || 'unknown',
      service: logEntry.service || 'unknown',
      instance: logEntry.instance || process.env.HOSTNAME || 'unknown',
      level: logEntry.level || 'INFO',
      message: logEntry.message,
      
      // Request context
      request: {
        id: logEntry.requestId,
        method: logEntry.method,
        endpoint: logEntry.endpoint,
        user_id: logEntry.userId,
        session_id: logEntry.sessionId,
        ip_address: logEntry.ipAddress
      },
      
      // Trace context
      trace: {
        trace_id: logEntry.traceId,
        span_id: logEntry.spanId,
        parent_span_id: logEntry.parentSpanId,
        flags: logEntry.traceFlags
      },
      
      // Source information
      source: {
        file: logEntry.sourceFile,
        line: logEntry.sourceLine,
        function: logEntry.functionName,
        thread: logEntry.threadId
      },
      
      // Environment context
      environment: {
        name: logEntry.environment || process.env.NODE_ENV || 'development',
        version: logEntry.version || process.env.APP_VERSION || '1.0.0',
        build: logEntry.build || process.env.BUILD_ID,
        commit: logEntry.commit || process.env.GIT_COMMIT
      },
      
      // Structured data
      data: logEntry.data || {},
      
      // Performance metrics
      metrics: {
        duration_ms: logEntry.duration,
        memory_mb: logEntry.memoryUsage,
        cpu_percent: logEntry.cpuUsage
      },
      
      // Error context (if applicable)
      error: logEntry.error ? {
        name: logEntry.error.name,
        message: logEntry.error.message,
        stack: logEntry.error.stack,
        code: logEntry.error.code,
        details: logEntry.error.details
      } : null
    };

    await this.bufferDocument('application_logs', document);
  },

  async logAccessEvent(accessEntry) {
    // HTTP access log optimized for high throughput
    const document = {
      timestamp: new Date(),
      
      // Request details
      method: accessEntry.method,
      endpoint: accessEntry.endpoint,
      path: accessEntry.path,
      query_string: accessEntry.queryString,
      
      // Response details
      status_code: accessEntry.statusCode,
      response_size: accessEntry.responseSize,
      content_type: accessEntry.contentType,
      
      // Timing information
      duration_ms: accessEntry.duration,
      queue_time_ms: accessEntry.queueTime,
      process_time_ms: accessEntry.processTime,
      
      // Client information
      client: {
        ip: accessEntry.clientIp,
        user_agent: accessEntry.userAgent,
        referer: accessEntry.referer,
        user_id: accessEntry.userId,
        session_id: accessEntry.sessionId
      },
      
      // Geographic data (if available)
      geo: accessEntry.geo ? {
        country: accessEntry.geo.country,
        region: accessEntry.geo.region,
        city: accessEntry.geo.city,
        coordinates: accessEntry.geo.coordinates
      } : null,
      
      // Application context
      application: accessEntry.application,
      service: accessEntry.service,
      instance: accessEntry.instance || process.env.HOSTNAME,
      version: accessEntry.version,
      
      // Cache information
      cache: {
        hit: accessEntry.cacheHit,
        key: accessEntry.cacheKey,
        ttl: accessEntry.cacheTTL
      },
      
      // Load balancing and routing
      routing: {
        backend: accessEntry.backend,
        upstream_time: accessEntry.upstreamTime,
        retry_count: accessEntry.retryCount
      }
    };

    await this.bufferDocument('access_logs', document);
  },

  async logPerformanceMetric(metricEntry) {
    // System and application performance metrics
    const document = {
      timestamp: new Date(),
      
      metric_type: metricEntry.type, // 'cpu', 'memory', 'disk', 'network', 'application'
      metric_name: metricEntry.name,
      value: metricEntry.value,
      unit: metricEntry.unit,
      
      // Instance information
      instance_id: metricEntry.instanceId || process.env.HOSTNAME,
      application: metricEntry.application,
      service: metricEntry.service,
      
      // Dimensional metadata
      dimensions: metricEntry.dimensions || {},
      
      // Aggregation information
      aggregation: {
        type: metricEntry.aggregationType, // 'gauge', 'counter', 'histogram', 'summary'
        interval_seconds: metricEntry.intervalSeconds,
        sample_count: metricEntry.sampleCount
      },
      
      // Statistical data (for histograms/summaries)
      statistics: metricEntry.statistics ? {
        min: metricEntry.statistics.min,
        max: metricEntry.statistics.max,
        mean: metricEntry.statistics.mean,
        median: metricEntry.statistics.median,
        p95: metricEntry.statistics.p95,
        p99: metricEntry.statistics.p99,
        std_dev: metricEntry.statistics.stdDev
      } : null,
      
      // Alerts and thresholds
      alerts: {
        warning_threshold: metricEntry.warningThreshold,
        critical_threshold: metricEntry.criticalThreshold,
        is_anomaly: metricEntry.isAnomaly,
        anomaly_score: metricEntry.anomalyScore
      }
    };

    await this.bufferDocument('performance_metrics', document);
  },

  async logAuditEvent(auditEntry) {
    // Security and compliance audit logging
    const document = {
      timestamp: new Date(),
      
      // Event classification
      event_type: auditEntry.eventType, // 'authentication', 'authorization', 'data_access', 'configuration'
      event_category: auditEntry.category, // 'security', 'compliance', 'operational'
      severity: auditEntry.severity || 'INFO',
      
      // Actor information
      actor: {
        user_id: auditEntry.userId,
        username: auditEntry.username,
        email: auditEntry.email,
        roles: auditEntry.roles || [],
        groups: auditEntry.groups || [],
        is_service_account: auditEntry.isServiceAccount || false,
        authentication_method: auditEntry.authMethod
      },
      
      // Target resource
      target: {
        resource_type: auditEntry.resourceType,
        resource_id: auditEntry.resourceId,
        resource_name: auditEntry.resourceName,
        owner: auditEntry.resourceOwner,
        classification: auditEntry.dataClassification
      },
      
      // Action details
      action: {
        type: auditEntry.action, // 'create', 'read', 'update', 'delete', 'login', 'logout'
        description: auditEntry.description,
        result: auditEntry.result, // 'success', 'failure', 'partial'
        reason: auditEntry.reason
      },
      
      // Request context
      request: {
        id: auditEntry.requestId,
        source_ip: auditEntry.sourceIp,
        user_agent: auditEntry.userAgent,
        session_id: auditEntry.sessionId,
        api_key: auditEntry.apiKey ? 'REDACTED' : null
      },
      
      // Data changes (for modification events)
      changes: auditEntry.changes ? {
        before: auditEntry.changes.before,
        after: auditEntry.changes.after,
        fields_changed: auditEntry.changes.fieldsChanged || []
      } : null,
      
      // Compliance and regulatory
      compliance: {
        regulation: auditEntry.regulation, // 'GDPR', 'SOX', 'HIPAA', 'PCI-DSS'
        retention_period: auditEntry.retentionPeriod,
        encryption_required: auditEntry.encryptionRequired || false
      },
      
      // Application context
      application: auditEntry.application,
      service: auditEntry.service,
      environment: auditEntry.environment
    };

    await this.bufferDocument('audit_logs', document);
  },

  async bufferDocument(collectionName, document) {
    const buffer = this.buffers.get(collectionName);
    if (!buffer) {
      console.error(`Unknown collection: ${collectionName}`);
      return;
    }
    
    buffer.push(document);
    
    // Flush buffer if it reaches batch size
    if (buffer.length >= this.batchSizes[collectionName]) {
      await this.flushBuffer(collectionName);
    }
  },

  async flushBuffer(collectionName) {
    const buffer = this.buffers.get(collectionName);
    if (!buffer || buffer.length === 0) {
      return;
    }
    
    // Move buffer contents to local array and clear buffer
    const documents = buffer.splice(0);
    
    try {
      const collection = this.collections[this.getCollectionProperty(collectionName)];
      if (!collection) {
        console.error(`Collection not found: ${collectionName}`);
        return;
      }
      
      // High-performance batch insert
      const result = await collection.insertMany(documents, {
        ordered: false, // Allow parallel inserts
        writeConcern: { w: 1, j: false } // Optimize for speed
      });
      
      if (result.insertedCount !== documents.length) {
        console.warn(`Partial insert: ${result.insertedCount}/${documents.length} documents inserted to ${collectionName}`);
      }
      
    } catch (error) {
      console.error(`Error flushing buffer for ${collectionName}:`, error);
      
      // Re-add documents to buffer for retry (optional)
      if (error.code !== 11000) { // Not a duplicate key error
        buffer.unshift(...documents);
      }
    }
  },

  getCollectionProperty(collectionName) {
    const mapping = {
      'application_logs': 'applicationLogs',
      'error_logs': 'errorLogs',
      'access_logs': 'accessLogs',
      'performance_metrics': 'performanceMetrics',
      'audit_logs': 'auditLogs'
    };
    return mapping[collectionName];
  },

  async shutdown() {
    console.log('Shutting down log ingestion system...');
    
    // Clear all flush intervals
    for (const intervalId of this.flushIntervals.values()) {
      clearInterval(intervalId);
    }
    
    // Flush all remaining buffers
    const flushPromises = [];
    for (const collectionName of this.buffers.keys()) {
      flushPromises.push(this.flushBuffer(collectionName));
    }
    
    await Promise.all(flushPromises);
    
    console.log('Log ingestion system shutdown complete');
  }
};

// Advanced log analysis and monitoring
const logAnalysisEngine = {
  collections: null,

  async initialize(collections) {
    this.collections = collections;
  },

  async analyzeRecentErrors(timeRangeMinutes = 60) {
    console.log(`Analyzing errors from last ${timeRangeMinutes} minutes...`);
    
    const cutoffTime = new Date(Date.now() - timeRangeMinutes * 60 * 1000);
    
    const errorAnalysis = await this.collections.applicationLogs.aggregate([
      {
        $match: {
          timestamp: { $gte: cutoffTime },
          level: { $in: ['ERROR', 'FATAL'] }
        }
      },
      
      // Group by error patterns
      {
        $group: {
          _id: {
            application: '$application',
            service: '$service',
            errorMessage: {
              $substr: ['$message', 0, 100] // Truncate for grouping
            }
          },
          
          count: { $sum: 1 },
          firstOccurrence: { $min: '$timestamp' },
          lastOccurrence: { $max: '$timestamp' },
          affectedInstances: { $addToSet: '$instance' },
          affectedUsers: { $addToSet: '$request.user_id' },
          
          // Sample error details
          sampleErrors: {
            $push: {
              timestamp: '$timestamp',
              message: '$message',
              request_id: '$request.id',
              trace_id: '$trace.trace_id',
              stack: '$error.stack'
            }
          }
        }
      },
      
      // Calculate error characteristics
      {
        $addFields: {
          duration: {
            $divide: [
              { $subtract: ['$lastOccurrence', '$firstOccurrence'] },
              1000 // Convert to seconds
            ]
          },
          errorRate: {
            $divide: ['$count', timeRangeMinutes] // Errors per minute
          },
          instanceCount: { $size: '$affectedInstances' },
          userCount: { $size: '$affectedUsers' },
          
          // Take only recent sample errors
          recentSamples: { $slice: ['$sampleErrors', -5] }
        }
      },
      
      // Sort by error frequency and recency
      {
        $sort: {
          count: -1,
          lastOccurrence: -1
        }
      },
      
      {
        $limit: 50 // Top 50 error patterns
      },
      
      // Format for analysis output
      {
        $project: {
          application: '$_id.application',
          service: '$_id.service',
          errorPattern: '$_id.errorMessage',
          count: 1,
          errorRate: { $round: ['$errorRate', 2] },
          duration: { $round: ['$duration', 1] },
          firstOccurrence: 1,
          lastOccurrence: 1,
          instanceCount: 1,
          userCount: 1,
          affectedInstances: 1,
          recentSamples: 1,
          
          // Severity assessment
          severity: {
            $switch: {
              branches: [
                {
                  case: { $gt: ['$errorRate', 10] }, // > 10 errors/minute
                  then: 'CRITICAL'
                },
                {
                  case: { $gt: ['$errorRate', 5] }, // > 5 errors/minute
                  then: 'HIGH'
                },
                {
                  case: { $gt: ['$errorRate', 1] }, // > 1 error/minute
                  then: 'MEDIUM'
                }
              ],
              default: 'LOW'
            }
          }
        }
      }
    ]).toArray();
    
    console.log(`Found ${errorAnalysis.length} error patterns`);
    return errorAnalysis;
  },

  async analyzeAccessPatterns(timeRangeMinutes = 30) {
    console.log(`Analyzing access patterns from last ${timeRangeMinutes} minutes...`);
    
    const cutoffTime = new Date(Date.now() - timeRangeMinutes * 60 * 1000);
    
    const accessAnalysis = await this.collections.accessLogs.aggregate([
      {
        $match: {
          timestamp: { $gte: cutoffTime }
        }
      },
      
      // Group by endpoint and status
      {
        $group: {
          _id: {
            endpoint: '$endpoint',
            method: '$method',
            statusClass: {
              $switch: {
                branches: [
                  { case: { $lt: ['$status_code', 300] }, then: '2xx' },
                  { case: { $lt: ['$status_code', 400] }, then: '3xx' },
                  { case: { $lt: ['$status_code', 500] }, then: '4xx' },
                  { case: { $gte: ['$status_code', 500] }, then: '5xx' }
                ],
                default: 'unknown'
              }
            }
          },
          
          requestCount: { $sum: 1 },
          avgDuration: { $avg: '$duration_ms' },
          minDuration: { $min: '$duration_ms' },
          maxDuration: { $max: '$duration_ms' },
          
          // Percentile approximations
          durations: { $push: '$duration_ms' },
          
          totalResponseSize: { $sum: '$response_size' },
          uniqueClients: { $addToSet: '$client.ip' },
          uniqueUsers: { $addToSet: '$client.user_id' },
          
          // Error details for non-2xx responses
          errorSamples: {
            $push: {
              $cond: [
                { $gte: ['$status_code', 400] },
                {
                  timestamp: '$timestamp',
                  status: '$status_code',
                  client_ip: '$client.ip',
                  user_id: '$client.user_id',
                  duration: '$duration_ms'
                },
                null
              ]
            }
          }
        }
      },
      
      // Calculate additional metrics
      {
        $addFields: {
          requestsPerMinute: { $divide: ['$requestCount', timeRangeMinutes] },
          avgResponseSize: { $divide: ['$totalResponseSize', '$requestCount'] },
          uniqueClientCount: { $size: '$uniqueClients' },
          uniqueUserCount: { $size: '$uniqueUsers' },
          
          // Filter out null error samples
          errorSamples: {
            $filter: {
              input: '$errorSamples',
              cond: { $ne: ['$$this', null] }
            }
          },
          
          // Approximate percentiles (simplified)
          p95Duration: {
            $let: {
              vars: {
                sortedDurations: {
                  $sortArray: {
                    input: '$durations',
                    sortBy: 1
                  }
                }
              },
              in: {
                $arrayElemAt: [
                  '$$sortedDurations',
                  { $floor: { $multiply: [{ $size: '$$sortedDurations' }, 0.95] } }
                ]
              }
            }
          }
        }
      },
      
      // Sort by request volume
      {
        $sort: {
          requestCount: -1
        }
      },
      
      {
        $limit: 100 // Top 100 endpoints
      },
      
      // Format output
      {
        $project: {
          endpoint: '$_id.endpoint',
          method: '$_id.method',
          statusClass: '$_id.statusClass',
          requestCount: 1,
          requestsPerMinute: { $round: ['$requestsPerMinute', 2] },
          avgDuration: { $round: ['$avgDuration', 1] },
          minDuration: 1,
          maxDuration: 1,
          p95Duration: { $round: ['$p95Duration', 1] },
          avgResponseSize: { $round: ['$avgResponseSize', 0] },
          uniqueClientCount: 1,
          uniqueUserCount: 1,
          errorSamples: { $slice: ['$errorSamples', 5] }, // Recent 5 errors
          
          // Performance assessment
          performanceStatus: {
            $switch: {
              branches: [
                {
                  case: { $gt: ['$avgDuration', 5000] }, // > 5 seconds
                  then: 'SLOW'
                },
                {
                  case: { $gt: ['$avgDuration', 2000] }, // > 2 seconds
                  then: 'WARNING'
                }
              ],
              default: 'NORMAL'
            }
          }
        }
      }
    ]).toArray();
    
    console.log(`Analyzed ${accessAnalysis.length} endpoint patterns`);
    return accessAnalysis;
  },

  async generatePerformanceReport(timeRangeMinutes = 60) {
    console.log(`Generating performance report for last ${timeRangeMinutes} minutes...`);
    
    const cutoffTime = new Date(Date.now() - timeRangeMinutes * 60 * 1000);
    
    const performanceReport = await this.collections.performanceMetrics.aggregate([
      {
        $match: {
          timestamp: { $gte: cutoffTime }
        }
      },
      
      // Group by metric type and instance
      {
        $group: {
          _id: {
            metricType: '$metric_type',
            metricName: '$metric_name',
            instanceId: '$instance_id'
          },
          
          sampleCount: { $sum: 1 },
          avgValue: { $avg: '$value' },
          minValue: { $min: '$value' },
          maxValue: { $max: '$value' },
          latestValue: { $last: '$value' },
          
          // Time series data for trending
          timeSeries: {
            $push: {
              timestamp: '$timestamp',
              value: '$value'
            }
          },
          
          // Alert information
          alertCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $gte: ['$value', '$alerts.critical_threshold'] },
                    { $gte: ['$value', '$alerts.warning_threshold'] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      
      // Calculate trend and status
      {
        $addFields: {
          // Simple trend calculation (comparing first and last values)
          trend: {
            $let: {
              vars: {
                firstValue: { $arrayElemAt: ['$timeSeries', 0] },
                lastValue: { $arrayElemAt: ['$timeSeries', -1] }
              },
              in: {
                $cond: [
                  { $gt: ['$$lastValue.value', '$$firstValue.value'] },
                  'INCREASING',
                  {
                    $cond: [
                      { $lt: ['$$lastValue.value', '$$firstValue.value'] },
                      'DECREASING',
                      'STABLE'
                    ]
                  }
                ]
              }
            }
          },
          
          // Alert status
          alertStatus: {
            $cond: [
              { $gt: ['$alertCount', 0] },
              'ALERTS_TRIGGERED',
              'NORMAL'
            ]
          }
        }
      },
      
      // Group by metric type for summary
      {
        $group: {
          _id: '$_id.metricType',
          
          metrics: {
            $push: {
              name: '$_id.metricName',
              instance: '$_id.instanceId',
              sampleCount: '$sampleCount',
              avgValue: '$avgValue',
              minValue: '$minValue',
              maxValue: '$maxValue',
              latestValue: '$latestValue',
              trend: '$trend',
              alertStatus: '$alertStatus',
              alertCount: '$alertCount'
            }
          },
          
          totalSamples: { $sum: '$sampleCount' },
          instanceCount: { $addToSet: '$_id.instanceId' },
          totalAlerts: { $sum: '$alertCount' }
        }
      },
      
      {
        $addFields: {
          instanceCount: { $size: '$instanceCount' }
        }
      },
      
      {
        $sort: { _id: 1 }
      }
    ]).toArray();
    
    console.log(`Performance report generated for ${performanceReport.length} metric types`);
    return performanceReport;
  },

  async getTailLogs(collectionName, limit = 100) {
    // Get most recent logs (natural order in capped collections)
    const collection = this.collections[this.getCollectionProperty(collectionName)];
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }
    
    // Capped collections maintain insertion order, so we can use natural order
    const logs = await collection.find()
      .sort({ $natural: -1 }) // Reverse natural order (most recent first)
      .limit(limit)
      .toArray();
    
    return logs.reverse(); // Return in chronological order (oldest first)
  },

  getCollectionProperty(collectionName) {
    const mapping = {
      'application_logs': 'applicationLogs',
      'error_logs': 'errorLogs', 
      'access_logs': 'accessLogs',
      'performance_metrics': 'performanceMetrics',
      'audit_logs': 'auditLogs'
    };
    return mapping[collectionName];
  }
};

// Benefits of MongoDB Capped Collections:
// - Automatic size management with guaranteed space limits
// - Natural insertion order preservation without indexes
// - Optimized write performance for high-throughput logging
// - Circular buffer behavior with automatic old document removal
// - No fragmentation or maintenance overhead
// - Tailable cursors for real-time log streaming
// - Atomic document rotation without application logic
// - Consistent performance regardless of collection size
// - Integration with MongoDB ecosystem and tools
// - Built-in clustering and replication support

module.exports = {
  createOptimizedCappedCollections,
  logIngestionSystem,
  logAnalysisEngine
};
```

## Understanding MongoDB Capped Collections Architecture

### Advanced Capped Collection Management and Patterns

Implement sophisticated capped collection strategies for different logging scenarios:

```javascript
// Advanced capped collection management system
class CappedCollectionManager {
  constructor(db, options = {}) {
    this.db = db;
    this.options = {
      // Default configurations
      defaultSize: 100 * 1024 * 1024, // 100MB
      retentionPeriods: {
        application_logs: 7 * 24 * 60 * 60 * 1000, // 7 days
        error_logs: 30 * 24 * 60 * 60 * 1000, // 30 days  
        access_logs: 24 * 60 * 60 * 1000, // 24 hours
        audit_logs: 365 * 24 * 60 * 60 * 1000 // 1 year
      },
      ...options
    };
    
    this.collections = new Map();
    this.tails = new Map();
    this.statistics = new Map();
  }

  async createCappedCollectionHierarchy() {
    // Create hierarchical capped collections for different log levels and retention
    
    // Critical logs - smallest size, longest retention
    await this.createTieredCollection('critical_logs', {
      size: 50 * 1024 * 1024, // 50MB
      max: 100000,
      retention: 'critical'
    });
    
    // Error logs - medium size and retention  
    await this.createTieredCollection('error_logs', {
      size: 200 * 1024 * 1024, // 200MB
      max: 500000,
      retention: 'error'
    });
    
    // Warning logs - larger size, medium retention
    await this.createTieredCollection('warning_logs', {
      size: 300 * 1024 * 1024, // 300MB  
      max: 1000000,
      retention: 'warning'
    });
    
    // Info logs - large size, shorter retention
    await this.createTieredCollection('info_logs', {
      size: 500 * 1024 * 1024, // 500MB
      max: 2000000, 
      retention: 'info'
    });
    
    // Debug logs - largest size, shortest retention
    await this.createTieredCollection('debug_logs', {
      size: 1024 * 1024 * 1024, // 1GB
      max: 5000000,
      retention: 'debug'
    });
    
    // Specialized collections
    await this.createSpecializedCollections();
    
    console.log('Capped collection hierarchy created');
  }

  async createTieredCollection(name, config) {
    try {
      const collection = await this.db.createCollection(name, {
        capped: true,
        size: config.size,
        max: config.max
      });
      
      this.collections.set(name, collection);
      
      // Initialize statistics tracking
      this.statistics.set(name, {
        documentsInserted: 0,
        totalSize: 0,
        lastInsert: null,
        insertRate: 0,
        retentionType: config.retention
      });
      
      console.log(`Created capped collection: ${name} (${config.size} bytes, max ${config.max} docs)`);
      
    } catch (error) {
      if (error.code === 48) { // Collection already exists
        console.log(`Capped collection ${name} already exists`);
        const collection = this.db.collection(name);
        this.collections.set(name, collection);
      } else {
        throw error;
      }
    }
  }

  async createSpecializedCollections() {
    // Real-time metrics collection
    await this.createTieredCollection('realtime_metrics', {
      size: 100 * 1024 * 1024, // 100MB
      max: 1000000,
      retention: 'realtime'
    });
    
    // Security events collection
    await this.createTieredCollection('security_events', {
      size: 50 * 1024 * 1024, // 50MB
      max: 200000,
      retention: 'security'
    });
    
    // Business events collection  
    await this.createTieredCollection('business_events', {
      size: 200 * 1024 * 1024, // 200MB
      max: 1000000,
      retention: 'business'
    });
    
    // System health collection
    await this.createTieredCollection('system_health', {
      size: 150 * 1024 * 1024, // 150MB
      max: 500000,
      retention: 'system'
    });
    
    // Create minimal indexes for specialized queries
    await this.createSpecializedIndexes();
  }

  async createSpecializedIndexes() {
    // Minimal indexes to maintain write performance
    
    // Real-time metrics - by type and timestamp
    await this.collections.get('realtime_metrics').createIndex({
      metric_type: 1,
      timestamp: -1
    });
    
    // Security events - by severity and event type
    await this.collections.get('security_events').createIndex({
      severity: 1,
      event_type: 1
    });
    
    // Business events - by event category
    await this.collections.get('business_events').createIndex({
      category: 1,
      user_id: 1
    });
    
    // System health - by component and status
    await this.collections.get('system_health').createIndex({
      component: 1,
      status: 1
    });
  }

  async insertWithRouting(logLevel, document) {
    // Route documents to appropriate capped collection based on level
    const routingMap = {
      FATAL: 'critical_logs',
      ERROR: 'error_logs', 
      WARN: 'warning_logs',
      INFO: 'info_logs',
      DEBUG: 'debug_logs',
      TRACE: 'debug_logs'
    };
    
    const collectionName = routingMap[logLevel] || 'info_logs';
    const collection = this.collections.get(collectionName);
    
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }
    
    // Add routing metadata
    const enrichedDocument = {
      ...document,
      _routed_to: collectionName,
      _inserted_at: new Date()
    };
    
    try {
      const result = await collection.insertOne(enrichedDocument);
      
      // Update statistics
      this.updateInsertionStatistics(collectionName, enrichedDocument);
      
      return result;
    } catch (error) {
      console.error(`Error inserting to ${collectionName}:`, error);
      throw error;
    }
  }

  updateInsertionStatistics(collectionName, document) {
    const stats = this.statistics.get(collectionName);
    if (!stats) return;
    
    stats.documentsInserted++;
    stats.totalSize += this.estimateDocumentSize(document);
    stats.lastInsert = new Date();
    
    // Calculate insertion rate (documents per second)
    if (stats.documentsInserted > 1) {
      const timeSpan = stats.lastInsert - stats.firstInsert || 1;
      stats.insertRate = (stats.documentsInserted / (timeSpan / 1000)).toFixed(2);
    } else {
      stats.firstInsert = stats.lastInsert;
    }
  }

  estimateDocumentSize(document) {
    // Rough estimation of document size in bytes
    return JSON.stringify(document).length * 2; // UTF-8 approximation
  }

  async setupTailableStreams() {
    // Set up tailable cursors for real-time log streaming
    console.log('Setting up tailable cursors for real-time streaming...');
    
    for (const [collectionName, collection] of this.collections.entries()) {
      const tail = collection.find().addCursorFlag('tailable', true)
                             .addCursorFlag('awaitData', true);
      
      this.tails.set(collectionName, tail);
      
      // Start async processing of tailable cursor
      this.processTailableStream(collectionName, tail);
    }
  }

  async processTailableStream(collectionName, cursor) {
    console.log(`Starting tailable stream for: ${collectionName}`);
    
    try {
      for await (const document of cursor) {
        // Process real-time log document
        await this.processRealtimeLog(collectionName, document);
      }
    } catch (error) {
      console.error(`Tailable stream error for ${collectionName}:`, error);
      
      // Attempt to restart the stream
      setTimeout(() => {
        this.restartTailableStream(collectionName);
      }, 5000);
    }
  }

  async processRealtimeLog(collectionName, document) {
    // Real-time processing of log entries
    const stats = this.statistics.get(collectionName);
    
    // Update real-time statistics
    if (stats) {
      stats.documentsInserted++;
      stats.lastInsert = new Date();
    }
    
    // Trigger alerts for critical conditions
    if (collectionName === 'critical_logs' || collectionName === 'error_logs') {
      await this.checkForAlertConditions(document);
    }
    
    // Real-time analytics
    if (collectionName === 'realtime_metrics') {
      await this.updateRealtimeMetrics(document);
    }
    
    // Security monitoring
    if (collectionName === 'security_events') {
      await this.analyzeSecurityEvent(document);
    }
    
    // Emit to external systems (WebSocket, message queues, etc.)
    this.emitRealtimeEvent(collectionName, document);
  }

  async checkForAlertConditions(document) {
    // Implement alert logic for critical conditions
    const alertConditions = [
      // High error rate
      document.level === 'ERROR' && document.error_count > 10,
      
      // Security incidents
      document.category === 'security' && document.severity === 'high',
      
      // System failures
      document.component === 'database' && document.status === 'down',
      
      // Performance degradation
      document.metric_type === 'response_time' && document.value > 10000
    ];
    
    if (alertConditions.some(condition => condition)) {
      await this.triggerAlert({
        type: 'critical_condition',
        document: document,
        timestamp: new Date()
      });
    }
  }

  async triggerAlert(alert) {
    console.log('ALERT TRIGGERED:', JSON.stringify(alert, null, 2));
    
    // Store alert in dedicated collection
    const alertsCollection = this.db.collection('alerts');
    await alertsCollection.insertOne({
      ...alert,
      _id: new ObjectId(),
      acknowledged: false,
      created_at: new Date()
    });
    
    // Send external notifications (email, Slack, PagerDuty, etc.)
    // Implementation depends on notification system
  }

  emitRealtimeEvent(collectionName, document) {
    // Emit to WebSocket connections, message queues, etc.
    console.log(`Real-time event: ${collectionName}`, {
      id: document._id,
      timestamp: document._inserted_at || document.timestamp,
      level: document.level,
      message: document.message?.substring(0, 100) + '...'
    });
  }

  async getCollectionStatistics(collectionName) {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`);
    }
    
    // Get MongoDB collection statistics
    const stats = await this.db.runCommand({ collStats: collectionName });
    const customStats = this.statistics.get(collectionName);
    
    return {
      // MongoDB statistics
      size: stats.size,
      count: stats.count,
      avgObjSize: stats.avgObjSize,
      storageSize: stats.storageSize,
      capped: stats.capped,
      max: stats.max,
      maxSize: stats.maxSize,
      
      // Custom statistics
      insertRate: customStats?.insertRate || 0,
      lastInsert: customStats?.lastInsert,
      retentionType: customStats?.retentionType,
      
      // Calculated metrics
      utilizationPercent: ((stats.size / stats.maxSize) * 100).toFixed(2),
      documentsPerMB: Math.round(stats.count / (stats.size / 1024 / 1024)),
      
      // Health assessment
      healthStatus: this.assessCollectionHealth(stats, customStats)
    };
  }

  assessCollectionHealth(mongoStats, customStats) {
    const utilizationPercent = (mongoStats.size / mongoStats.maxSize) * 100;
    const timeSinceLastInsert = customStats?.lastInsert ? 
      Date.now() - customStats.lastInsert.getTime() : Infinity;
    
    if (utilizationPercent > 95) {
      return 'NEAR_CAPACITY';
    } else if (timeSinceLastInsert > 300000) { // 5 minutes
      return 'INACTIVE';
    } else if (customStats?.insertRate > 1000) {
      return 'HIGH_VOLUME';
    } else {
      return 'HEALTHY';
    }
  }

  async performMaintenance() {
    console.log('Performing capped collection maintenance...');
    
    const maintenanceReport = {
      timestamp: new Date(),
      collections: {},
      recommendations: []
    };
    
    for (const collectionName of this.collections.keys()) {
      const stats = await this.getCollectionStatistics(collectionName);
      maintenanceReport.collections[collectionName] = stats;
      
      // Generate recommendations based on statistics
      if (stats.healthStatus === 'NEAR_CAPACITY') {
        maintenanceReport.recommendations.push({
          collection: collectionName,
          type: 'SIZE_WARNING',
          message: `Collection ${collectionName} is at ${stats.utilizationPercent}% capacity`
        });
      }
      
      if (stats.healthStatus === 'INACTIVE') {
        maintenanceReport.recommendations.push({
          collection: collectionName,
          type: 'INACTIVE_WARNING',
          message: `Collection ${collectionName} has not received data recently`
        });
      }
      
      if (stats.insertRate > 1000) {
        maintenanceReport.recommendations.push({
          collection: collectionName,
          type: 'HIGH_VOLUME',
          message: `Collection ${collectionName} has high insertion rate: ${stats.insertRate}/sec`
        });
      }
    }
    
    console.log('Maintenance report generated:', maintenanceReport);
    return maintenanceReport;
  }

  async shutdown() {
    console.log('Shutting down capped collection manager...');
    
    // Close all tailable cursors
    for (const [collectionName, cursor] of this.tails.entries()) {
      try {
        await cursor.close();
        console.log(`Closed tailable cursor for: ${collectionName}`);
      } catch (error) {
        console.error(`Error closing cursor for ${collectionName}:`, error);
      }
    }
    
    this.tails.clear();
    this.collections.clear();
    this.statistics.clear();
    
    console.log('Capped collection manager shutdown complete');
  }
}

// Real-time log aggregation and analysis
class RealtimeLogAggregator {
  constructor(cappedManager) {
    this.cappedManager = cappedManager;
    this.aggregationWindows = new Map();
    this.alertThresholds = {
      errorRate: 0.05, // 5% error rate
      responseTime: 5000, // 5 seconds
      memoryUsage: 0.85, // 85% memory usage
      cpuUsage: 0.90 // 90% CPU usage
    };
  }

  async startRealtimeAggregation() {
    console.log('Starting real-time log aggregation...');
    
    // Set up sliding window aggregations
    this.startSlidingWindow('error_rate', 300000); // 5-minute window
    this.startSlidingWindow('response_time', 60000); // 1-minute window
    this.startSlidingWindow('throughput', 60000); // 1-minute window
    this.startSlidingWindow('resource_usage', 120000); // 2-minute window
    
    console.log('Real-time aggregation started');
  }

  startSlidingWindow(metricType, windowSizeMs) {
    const windowData = {
      data: [],
      windowSize: windowSizeMs,
      lastCleanup: Date.now()
    };
    
    this.aggregationWindows.set(metricType, windowData);
    
    // Start cleanup interval
    setInterval(() => {
      this.cleanupWindow(metricType);
    }, windowSizeMs / 10); // Cleanup every 1/10th of window size
  }

  cleanupWindow(metricType) {
    const window = this.aggregationWindows.get(metricType);
    if (!window) return;
    
    const cutoffTime = Date.now() - window.windowSize;
    window.data = window.data.filter(entry => entry.timestamp > cutoffTime);
    window.lastCleanup = Date.now();
  }

  addDataPoint(metricType, value, metadata = {}) {
    const window = this.aggregationWindows.get(metricType);
    if (!window) return;
    
    window.data.push({
      timestamp: Date.now(),
      value: value,
      metadata: metadata
    });
    
    // Check for alerts
    this.checkAggregationAlerts(metricType);
  }

  checkAggregationAlerts(metricType) {
    const window = this.aggregationWindows.get(metricType);
    if (!window || window.data.length === 0) return;
    
    const recentData = window.data.slice(-10); // Last 10 data points
    const avgValue = recentData.reduce((sum, point) => sum + point.value, 0) / recentData.length;
    
    let alertTriggered = false;
    let alertMessage = '';
    
    switch (metricType) {
      case 'error_rate':
        if (avgValue > this.alertThresholds.errorRate) {
          alertTriggered = true;
          alertMessage = `High error rate: ${(avgValue * 100).toFixed(2)}%`;
        }
        break;
        
      case 'response_time':
        if (avgValue > this.alertThresholds.responseTime) {
          alertTriggered = true;
          alertMessage = `High response time: ${avgValue.toFixed(0)}ms`;
        }
        break;
        
      case 'resource_usage':
        const memoryAlert = recentData.some(p => p.metadata.memory > this.alertThresholds.memoryUsage);
        const cpuAlert = recentData.some(p => p.metadata.cpu > this.alertThresholds.cpuUsage);
        
        if (memoryAlert || cpuAlert) {
          alertTriggered = true;
          alertMessage = `High resource usage: Memory ${memoryAlert ? 'HIGH' : 'OK'}, CPU ${cpuAlert ? 'HIGH' : 'OK'}`;
        }
        break;
    }
    
    if (alertTriggered) {
      this.cappedManager.triggerAlert({
        type: 'aggregation_alert',
        metricType: metricType,
        message: alertMessage,
        value: avgValue,
        threshold: this.alertThresholds[metricType] || 'N/A',
        recentData: recentData.slice(-3) // Last 3 data points
      });
    }
  }

  getWindowSummary(metricType) {
    const window = this.aggregationWindows.get(metricType);
    if (!window || window.data.length === 0) {
      return { metricType, dataPoints: 0, summary: null };
    }
    
    const values = window.data.map(point => point.value);
    const sortedValues = [...values].sort((a, b) => a - b);
    
    return {
      metricType: metricType,
      dataPoints: window.data.length,
      windowSizeMs: window.windowSize,
      summary: {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((sum, val) => sum + val, 0) / values.length,
        median: sortedValues[Math.floor(sortedValues.length / 2)],
        p95: sortedValues[Math.floor(sortedValues.length * 0.95)],
        p99: sortedValues[Math.floor(sortedValues.length * 0.99)]
      },
      trend: this.calculateTrend(window.data),
      lastUpdate: window.data[window.data.length - 1].timestamp
    };
  }

  calculateTrend(dataPoints) {
    if (dataPoints.length < 2) return 'INSUFFICIENT_DATA';
    
    const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
    const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((sum, p) => sum + p.value, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, p) => sum + p.value, 0) / secondHalf.length;
    
    const change = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
    
    if (Math.abs(change) < 0.05) return 'STABLE'; // Less than 5% change
    return change > 0 ? 'INCREASING' : 'DECREASING';
  }

  getAllWindowSummaries() {
    const summaries = {};
    for (const metricType of this.aggregationWindows.keys()) {
      summaries[metricType] = this.getWindowSummary(metricType);
    }
    return summaries;
  }
}
```

## SQL-Style Capped Collection Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Capped Collection management and querying:

```sql
-- QueryLeaf capped collection operations with SQL-familiar syntax

-- Create capped collections with size and document limits
CREATE CAPPED COLLECTION application_logs 
WITH (
  size = '1GB',
  max_documents = 10000000,
  auto_rotate = true
);

CREATE CAPPED COLLECTION error_logs 
WITH (
  size = '256MB', 
  max_documents = 1000000
);

CREATE CAPPED COLLECTION access_logs
WITH (
  size = '2GB'
  -- No document limit for maximum throughput
);

-- High-performance log insertion
INSERT INTO application_logs 
VALUES (
  CURRENT_TIMESTAMP,
  'user-service',
  'payment-processor', 
  'prod-instance-01',
  'ERROR',
  'Payment processing failed for transaction tx_12345',
  
  -- Structured request context
  ROW(
    'req_98765',
    'POST',
    '/api/payments/process',
    'user_54321',
    'sess_abcdef',
    '192.168.1.100'
  ) AS request_context,
  
  -- Trace information
  ROW(
    'trace_xyz789',
    'span_456',
    'span_123',
    1
  ) AS trace_info,
  
  -- Error details
  ROW(
    'PaymentValidationError',
    'Invalid payment method: expired_card',
    'PaymentProcessor.validateCard() line 245',
    'PM001'
  ) AS error_details,
  
  -- Additional data
  JSON_BUILD_OBJECT(
    'transaction_id', 'tx_12345',
    'user_id', 'user_54321', 
    'payment_amount', 299.99,
    'payment_method', 'card_****1234',
    'merchant_id', 'merchant_789'
  ) AS log_data
);

-- Real-time log tailing (most recent entries first)
SELECT 
  timestamp,
  service,
  level,
  message,
  request_context.request_id,
  request_context.user_id,
  trace_info.trace_id,
  error_details.error_code,
  log_data
FROM application_logs
ORDER BY $natural DESC  -- Natural order in capped collections
LIMIT 100;

-- Log analysis with time-based aggregation
WITH recent_logs AS (
  SELECT 
    service,
    level,
    timestamp,
    message,
    request_context.user_id,
    error_details.error_code,
    
    -- Time bucketing for analysis
    DATE_TRUNC('minute', timestamp) as minute_bucket,
    DATE_TRUNC('hour', timestamp) as hour_bucket
  FROM application_logs
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '4 hours'
),

error_summary AS (
  SELECT 
    service,
    hour_bucket,
    level,
    COUNT(*) as log_count,
    COUNT(DISTINCT request_context.user_id) as affected_users,
    COUNT(DISTINCT error_details.error_code) as unique_errors,
    
    -- Error patterns
    mode() WITHIN GROUP (ORDER BY error_details.error_code) as most_common_error,
    array_agg(DISTINCT error_details.error_code) as error_codes,
    
    -- Sample messages for investigation
    array_agg(
      json_build_object(
        'timestamp', timestamp,
        'message', SUBSTRING(message, 1, 100),
        'user_id', request_context.user_id,
        'error_code', error_details.error_code
      ) ORDER BY timestamp DESC
    )[1:5] as recent_samples

  FROM recent_logs
  WHERE level IN ('ERROR', 'FATAL')
  GROUP BY service, hour_bucket, level
),

service_health AS (
  SELECT 
    service,
    hour_bucket,
    
    -- Overall metrics
    SUM(log_count) as total_logs,
    SUM(log_count) FILTER (WHERE level = 'ERROR') as error_count,
    SUM(log_count) FILTER (WHERE level = 'WARN') as warning_count,
    SUM(affected_users) as total_affected_users,
    
    -- Error rate calculation
    CASE 
      WHEN SUM(log_count) > 0 THEN 
        (SUM(log_count) FILTER (WHERE level = 'ERROR')::numeric / SUM(log_count)) * 100
      ELSE 0
    END as error_rate_percent,
    
    -- Service status assessment
    CASE 
      WHEN SUM(log_count) FILTER (WHERE level = 'ERROR') > 100 THEN 'CRITICAL'
      WHEN (SUM(log_count) FILTER (WHERE level = 'ERROR')::numeric / NULLIF(SUM(log_count), 0)) > 0.05 THEN 'DEGRADED'
      WHEN SUM(log_count) FILTER (WHERE level = 'WARN') > 50 THEN 'WARNING'
      ELSE 'HEALTHY'
    END as service_status
    
  FROM error_summary
  GROUP BY service, hour_bucket
)

SELECT 
  sh.service,
  sh.hour_bucket,
  sh.total_logs,
  sh.error_count,
  sh.warning_count,
  ROUND(sh.error_rate_percent, 2) as error_rate_pct,
  sh.total_affected_users,
  sh.service_status,
  
  -- Top error details
  es.most_common_error,
  es.unique_errors,
  es.error_codes,
  es.recent_samples,
  
  -- Trend analysis
  LAG(sh.error_count, 1) OVER (
    PARTITION BY sh.service 
    ORDER BY sh.hour_bucket
  ) as prev_hour_errors,
  
  sh.error_count - LAG(sh.error_count, 1) OVER (
    PARTITION BY sh.service 
    ORDER BY sh.hour_bucket
  ) as error_count_change

FROM service_health sh
LEFT JOIN error_summary es ON (
  sh.service = es.service AND 
  sh.hour_bucket = es.hour_bucket AND 
  es.level = 'ERROR'
)
WHERE sh.service_status != 'HEALTHY'
ORDER BY sh.service_status DESC, sh.error_rate_percent DESC, sh.hour_bucket DESC;

-- Access log analysis for performance monitoring
WITH access_metrics AS (
  SELECT 
    endpoint,
    method,
    DATE_TRUNC('minute', timestamp) as minute_bucket,
    
    -- Request metrics
    COUNT(*) as request_count,
    AVG(duration_ms) as avg_duration,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99_duration,
    MIN(duration_ms) as min_duration,
    MAX(duration_ms) as max_duration,
    
    -- Status code distribution
    COUNT(*) FILTER (WHERE status_code < 300) as success_count,
    COUNT(*) FILTER (WHERE status_code >= 300 AND status_code < 400) as redirect_count,
    COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500) as client_error_count,
    COUNT(*) FILTER (WHERE status_code >= 500) as server_error_count,
    
    -- Data transfer metrics
    AVG(response_size) as avg_response_size,
    SUM(response_size) as total_response_size,
    
    -- Client metrics
    COUNT(DISTINCT client.ip) as unique_clients,
    COUNT(DISTINCT client.user_id) as unique_users

  FROM access_logs
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '2 hours'
  GROUP BY endpoint, method, minute_bucket
),

performance_analysis AS (
  SELECT 
    endpoint,
    method,
    
    -- Aggregated performance metrics
    SUM(request_count) as total_requests,
    AVG(avg_duration) as overall_avg_duration,
    MAX(p95_duration) as max_p95_duration,
    MAX(p99_duration) as max_p99_duration,
    
    -- Error rates
    (SUM(client_error_count + server_error_count)::numeric / SUM(request_count)) * 100 as error_rate_percent,
    SUM(server_error_count) as total_server_errors,
    
    -- Throughput metrics
    AVG(request_count) as avg_requests_per_minute,
    MAX(request_count) as peak_requests_per_minute,
    
    -- Data transfer
    AVG(avg_response_size) as avg_response_size,
    SUM(total_response_size) / (1024 * 1024) as total_mb_transferred,
    
    -- Client diversity
    AVG(unique_clients) as avg_unique_clients,
    AVG(unique_users) as avg_unique_users,
    
    -- Performance assessment
    CASE 
      WHEN AVG(avg_duration) > 5000 THEN 'SLOW'
      WHEN AVG(avg_duration) > 2000 THEN 'DEGRADED' 
      WHEN MAX(p95_duration) > 10000 THEN 'INCONSISTENT'
      ELSE 'NORMAL'
    END as performance_status,
    
    -- Time series data for trending
    array_agg(
      json_build_object(
        'minute', minute_bucket,
        'requests', request_count,
        'avg_duration', avg_duration,
        'p95_duration', p95_duration,
        'error_rate', (client_error_count + server_error_count)::numeric / request_count * 100
      ) ORDER BY minute_bucket
    ) as time_series_data
    
  FROM access_metrics
  GROUP BY endpoint, method
),

endpoint_ranking AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY total_requests DESC) as request_rank,
    ROW_NUMBER() OVER (ORDER BY error_rate_percent DESC) as error_rank,
    ROW_NUMBER() OVER (ORDER BY overall_avg_duration DESC) as duration_rank
  FROM performance_analysis
)

SELECT 
  endpoint,
  method,
  total_requests,
  ROUND(overall_avg_duration, 1) as avg_duration_ms,
  ROUND(max_p95_duration, 1) as max_p95_ms,
  ROUND(max_p99_duration, 1) as max_p99_ms,
  ROUND(error_rate_percent, 2) as error_rate_pct,
  total_server_errors,
  ROUND(avg_requests_per_minute, 1) as avg_rpm,
  peak_requests_per_minute as peak_rpm,
  ROUND(total_mb_transferred, 1) as total_mb,
  performance_status,
  
  -- Rankings
  request_rank,
  error_rank, 
  duration_rank,
  
  -- Alerts and recommendations
  CASE 
    WHEN performance_status = 'SLOW' THEN 'Optimize endpoint performance - average response time exceeds 5 seconds'
    WHEN performance_status = 'DEGRADED' THEN 'Monitor endpoint performance - response times elevated'
    WHEN performance_status = 'INCONSISTENT' THEN 'Investigate performance spikes - P95 latency exceeds 10 seconds'
    WHEN error_rate_percent > 5 THEN 'High error rate detected - investigate client and server errors'
    WHEN total_server_errors > 100 THEN 'Significant server errors detected - check application health'
    ELSE 'Performance within normal parameters'
  END as recommendation,
  
  time_series_data

FROM endpoint_ranking
WHERE (
  performance_status != 'NORMAL' OR 
  error_rate_percent > 1 OR 
  request_rank <= 20
)
ORDER BY 
  CASE performance_status
    WHEN 'SLOW' THEN 1
    WHEN 'DEGRADED' THEN 2
    WHEN 'INCONSISTENT' THEN 3
    ELSE 4
  END,
  error_rate_percent DESC,
  total_requests DESC;

-- Real-time metrics aggregation from capped collections
CREATE VIEW real_time_metrics AS
WITH metric_windows AS (
  SELECT 
    metric_type,
    metric_name,
    instance_id,
    
    -- Current values
    LAST_VALUE(value ORDER BY timestamp) as current_value,
    FIRST_VALUE(value ORDER BY timestamp) as first_value,
    
    -- Statistical aggregations
    AVG(value) as avg_value,
    MIN(value) as min_value,
    MAX(value) as max_value,
    STDDEV_POP(value) as stddev_value,
    COUNT(*) as sample_count,
    
    -- Trend calculation
    CASE 
      WHEN COUNT(*) >= 2 THEN
        (LAST_VALUE(value ORDER BY timestamp) - FIRST_VALUE(value ORDER BY timestamp)) / 
        NULLIF(FIRST_VALUE(value ORDER BY timestamp), 0) * 100
      ELSE 0
    END as trend_percent,
    
    -- Alert thresholds
    MAX(alerts.warning_threshold) as warning_threshold,
    MAX(alerts.critical_threshold) as critical_threshold,
    
    -- Time range
    MIN(timestamp) as window_start,
    MAX(timestamp) as window_end
    
  FROM performance_metrics
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
  GROUP BY metric_type, metric_name, instance_id
)

SELECT 
  metric_type,
  metric_name,
  instance_id,
  current_value,
  ROUND(avg_value::numeric, 2) as avg_value,
  min_value,
  max_value,
  ROUND(stddev_value::numeric, 2) as stddev,
  sample_count,
  ROUND(trend_percent::numeric, 1) as trend_pct,
  
  -- Alert status
  CASE 
    WHEN critical_threshold IS NOT NULL AND current_value >= critical_threshold THEN 'CRITICAL'
    WHEN warning_threshold IS NOT NULL AND current_value >= warning_threshold THEN 'WARNING'
    ELSE 'NORMAL'
  END as alert_status,
  
  warning_threshold,
  critical_threshold,
  window_start,
  window_end,
  
  -- Performance assessment
  CASE metric_type
    WHEN 'cpu_percent' THEN 
      CASE WHEN current_value > 90 THEN 'HIGH' 
           WHEN current_value > 70 THEN 'ELEVATED'
           ELSE 'NORMAL' END
    WHEN 'memory_percent' THEN
      CASE WHEN current_value > 85 THEN 'HIGH'
           WHEN current_value > 70 THEN 'ELEVATED' 
           ELSE 'NORMAL' END
    WHEN 'response_time_ms' THEN
      CASE WHEN current_value > 5000 THEN 'SLOW'
           WHEN current_value > 2000 THEN 'ELEVATED'
           ELSE 'NORMAL' END
    ELSE 'NORMAL'
  END as performance_status

FROM metric_windows
ORDER BY 
  CASE alert_status
    WHEN 'CRITICAL' THEN 1
    WHEN 'WARNING' THEN 2
    ELSE 3
  END,
  metric_type,
  metric_name;

-- Capped collection maintenance and monitoring
SELECT 
  collection_name,
  is_capped,
  max_size_bytes / (1024 * 1024) as max_size_mb,
  current_size_bytes / (1024 * 1024) as current_size_mb,
  document_count,
  max_documents,
  
  -- Utilization metrics
  ROUND((current_size_bytes::numeric / max_size_bytes) * 100, 1) as size_utilization_pct,
  ROUND((document_count::numeric / NULLIF(max_documents, 0)) * 100, 1) as document_utilization_pct,
  
  -- Health assessment
  CASE 
    WHEN (current_size_bytes::numeric / max_size_bytes) > 0.95 THEN 'NEAR_CAPACITY'
    WHEN (current_size_bytes::numeric / max_size_bytes) > 0.80 THEN 'HIGH_UTILIZATION'
    WHEN document_count = 0 THEN 'EMPTY'
    ELSE 'HEALTHY'
  END as health_status,
  
  -- Performance metrics
  avg_document_size_bytes,
  ROUND(avg_document_size_bytes / 1024.0, 1) as avg_document_size_kb,
  
  -- Recommendations
  CASE 
    WHEN (current_size_bytes::numeric / max_size_bytes) > 0.95 THEN 
      'Consider increasing collection size or reducing retention period'
    WHEN document_count = 0 THEN 
      'Collection is empty - verify data ingestion is working'
    WHEN avg_document_size_bytes > 16384 THEN 
      'Large average document size - consider data optimization'
    ELSE 'Collection operating within normal parameters'
  END as recommendation

FROM CAPPED_COLLECTION_STATS()
WHERE is_capped = true
ORDER BY size_utilization_pct DESC;

-- QueryLeaf provides comprehensive capped collection capabilities:
-- 1. SQL-familiar capped collection creation and management
-- 2. High-performance log insertion with structured data support
-- 3. Real-time log tailing and streaming with natural ordering
-- 4. Advanced log analysis with time-based aggregations
-- 5. Access pattern analysis for performance monitoring
-- 6. Real-time metrics aggregation and alerting
-- 7. Capped collection health monitoring and maintenance
-- 8. Integration with MongoDB's circular buffer optimizations
-- 9. Automatic size management without manual intervention
-- 10. Familiar SQL patterns for log analysis and troubleshooting
```

## Best Practices for Capped Collection Implementation

### Design Guidelines

Essential practices for optimal capped collection configuration:

1. **Size Planning**: Calculate appropriate collection sizes based on expected data volume and retention requirements
2. **Index Strategy**: Use minimal indexes to maintain write performance while supporting essential queries
3. **Document Structure**: Design documents for optimal compression and query performance
4. **Retention Alignment**: Align capped collection sizes with business retention and compliance requirements
5. **Monitoring Setup**: Implement continuous monitoring of collection utilization and performance
6. **Alert Configuration**: Set up alerts for capacity utilization and performance degradation

### Performance and Scalability

Optimize capped collections for high-throughput logging scenarios:

1. **Write Performance**: Minimize indexes and use batch insertion for maximum throughput
2. **Tailable Cursors**: Leverage tailable cursors for real-time log streaming and processing
3. **Collection Sizing**: Balance collection size with query performance and storage efficiency
4. **Replica Set Configuration**: Optimize replica set settings for write-heavy workloads
5. **Hardware Considerations**: Use fast storage and adequate memory for optimal performance
6. **Network Optimization**: Configure network settings for high-volume log ingestion

## Conclusion

MongoDB Capped Collections provide purpose-built capabilities for high-performance logging and circular buffer patterns that eliminate the complexity and overhead of traditional database approaches while delivering consistent performance and automatic space management. The natural ordering preservation and optimized write characteristics make capped collections ideal for log processing, event storage, and real-time data applications.

Key Capped Collection benefits include:

- **Automatic Size Management**: Fixed-size collections with automatic document rotation
- **Write-Optimized Performance**: Optimized for high-throughput, sequential write operations
- **Natural Ordering**: Insertion order preservation without additional indexing overhead
- **Circular Buffer Behavior**: Automatic old document removal when size limits are reached
- **Real-Time Streaming**: Tailable cursor support for live log streaming and processing
- **Operational Simplicity**: No manual maintenance or complex rotation procedures required

Whether you're building logging systems, event processors, real-time analytics platforms, or any application requiring circular buffer patterns, MongoDB Capped Collections with QueryLeaf's familiar SQL interface provides the foundation for high-performance data storage. This combination enables you to implement sophisticated logging capabilities while preserving familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Capped Collection operations while providing SQL-familiar collection creation, log analysis, and real-time querying syntax. Advanced circular buffer management, performance monitoring, and maintenance operations are seamlessly handled through familiar SQL patterns, making high-performance logging both powerful and accessible.

The integration of native capped collection capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both high-performance logging and familiar database interaction patterns, ensuring your logging solutions remain both effective and maintainable as they scale and evolve.