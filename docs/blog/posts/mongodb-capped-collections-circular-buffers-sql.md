---
title: "MongoDB Capped Collections: High-Performance Circular Buffers with SQL-Style Fixed-Size Data Management"
description: "Master MongoDB capped collections for high-performance logging, event streaming, and circular buffer use cases. Learn size-based and document-based limits with SQL-familiar fixed-size table patterns."
date: 2025-09-10
tags: [mongodb, capped-collections, logging, circular-buffers, performance, sql, streaming]
---

# MongoDB Capped Collections: High-Performance Circular Buffers with SQL-Style Fixed-Size Data Management

Modern applications generate massive amounts of streaming data - logs, events, metrics, chat messages, and real-time analytics data. Traditional database approaches struggle with the dual challenge of high-throughput write operations and automatic data lifecycle management. Storing unlimited streaming data leads to storage bloat, performance degradation, and complex data retention policies.

MongoDB capped collections provide a specialized solution for high-volume, time-ordered data by implementing fixed-size circular buffers at the database level. Unlike traditional tables that grow indefinitely, capped collections automatically maintain a fixed size by overwriting the oldest documents when capacity limits are reached, delivering predictable performance characteristics and eliminating the need for complex data purging mechanisms.

## The High-Volume Data Challenge

Traditional approaches to streaming data storage have significant limitations:

```sql
-- Traditional SQL log table - grows indefinitely
CREATE TABLE application_logs (
    log_id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    level VARCHAR(10) NOT NULL,
    service_name VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    request_id UUID,
    user_id INTEGER,
    session_id VARCHAR(100),
    
    INDEX idx_timestamp (timestamp),
    INDEX idx_level (level),
    INDEX idx_service (service_name)
);

-- High-volume insertions
INSERT INTO application_logs (level, service_name, message, metadata, request_id, user_id)
VALUES 
    ('INFO', 'auth-service', 'User login successful', '{"ip": "192.168.1.100", "browser": "Chrome"}', uuid_generate_v4(), 12345),
    ('ERROR', 'payment-service', 'Payment processing failed', '{"amount": 99.99, "currency": "USD", "error_code": "CARD_DECLINED"}', uuid_generate_v4(), 67890),
    ('DEBUG', 'api-gateway', 'Request routed to microservice', '{"path": "/api/v1/users", "method": "GET", "response_time": 45}', uuid_generate_v4(), 11111);

-- Problems with unlimited growth:
-- 1. Table size grows indefinitely requiring manual cleanup
-- 2. Performance degrades as table size increases
-- 3. Index maintenance overhead scales with data volume
-- 4. Complex retention policies need external scheduling
-- 5. Storage costs increase without bounds
-- 6. Backup and maintenance times increase linearly

-- Manual cleanup required with complex scheduling
DELETE FROM application_logs 
WHERE timestamp < NOW() - INTERVAL '30 days';

-- Problems with manual cleanup:
-- - Requires scheduled maintenance scripts
-- - DELETE operations can cause table locks
-- - Index fragmentation after large deletions
-- - Uneven performance during cleanup windows
-- - Risk of accidentally deleting important data
-- - Complex retention rules difficult to implement
```

MongoDB capped collections solve these challenges automatically:

```javascript
// MongoDB capped collection - automatic size management
// Create capped collection with automatic circular buffer behavior
db.createCollection("application_logs", {
  capped: true,
  size: 100 * 1024 * 1024, // 100MB maximum size
  max: 50000,              // Maximum 50,000 documents
  autoIndexId: false       // Optimize for insert performance
});

// High-performance insertions with guaranteed order preservation
db.application_logs.insertMany([
  {
    timestamp: new Date(),
    level: "INFO",
    serviceName: "auth-service",
    message: "User login successful",
    metadata: {
      ip: "192.168.1.100",
      browser: "Chrome",
      responseTime: 23
    },
    requestId: "req_001",
    userId: 12345,
    sessionId: "sess_abc123"
  },
  {
    timestamp: new Date(),
    level: "ERROR", 
    serviceName: "payment-service",
    message: "Payment processing failed",
    metadata: {
      amount: 99.99,
      currency: "USD",
      errorCode: "CARD_DECLINED",
      attemptNumber: 2
    },
    requestId: "req_002",
    userId: 67890
  },
  {
    timestamp: new Date(),
    level: "DEBUG",
    serviceName: "api-gateway", 
    message: "Request routed to microservice",
    metadata: {
      path: "/api/v1/users",
      method: "GET",
      responseTime: 45,
      upstreamService: "user-service"
    },
    requestId: "req_003",
    userId: 11111
  }
]);

// Benefits of capped collections:
// - Fixed size with automatic circular buffer behavior
// - Guaranteed insert order preservation (natural order)
// - High-performance insertions (no index maintenance overhead)
// - Automatic data lifecycle management (oldest data removed automatically)
// - Predictable performance characteristics regardless of data volume
// - No manual cleanup or maintenance required
// - Optimized for append-only workloads
// - Built-in tailable cursor support for real-time streaming
```

## Understanding MongoDB Capped Collections

### Capped Collection Fundamentals

Implement high-performance capped collections for various use cases:

```javascript
// Comprehensive capped collection management system
class CappedCollectionManager {
  constructor(db) {
    this.db = db;
    this.collections = new Map();
    this.tailableCursors = new Map();
  }

  async createLogCollection(serviceName, options = {}) {
    // Create service-specific log collection
    const collectionName = `${serviceName}_logs`;
    const defaultOptions = {
      size: 50 * 1024 * 1024,  // 50MB default size
      max: 25000,              // 25K documents default
      autoIndexId: false       // Optimize for pure append workload
    };

    const cappedOptions = {
      capped: true,
      ...defaultOptions,
      ...options
    };

    try {
      // Create the capped collection
      await this.db.createCollection(collectionName, cappedOptions);
      
      // Store collection configuration
      this.collections.set(collectionName, {
        type: 'logs',
        service: serviceName,
        options: cappedOptions,
        createdAt: new Date(),
        totalInserts: 0,
        lastActivity: new Date()
      });

      console.log(`Created capped log collection: ${collectionName}`, cappedOptions);
      return this.db.collection(collectionName);

    } catch (error) {
      if (error.code === 48) { // Collection already exists
        console.log(`Capped collection ${collectionName} already exists`);
        return this.db.collection(collectionName);
      }
      throw error;
    }
  }

  async createMetricsCollection(metricType, options = {}) {
    // Create high-frequency metrics collection
    const collectionName = `metrics_${metricType}`;
    const metricsOptions = {
      capped: true,
      size: 200 * 1024 * 1024, // 200MB for metrics data
      max: 100000,             // 100K metric documents
      autoIndexId: false
    };

    const collection = await this.db.createCollection(collectionName, {
      ...metricsOptions,
      ...options
    });

    this.collections.set(collectionName, {
      type: 'metrics',
      metricType: metricType,
      options: metricsOptions,
      createdAt: new Date(),
      totalInserts: 0,
      lastActivity: new Date()
    });

    return collection;
  }

  async createEventStreamCollection(streamName, options = {}) {
    // Create event streaming collection for real-time processing
    const collectionName = `events_${streamName}`;
    const eventOptions = {
      capped: true,
      size: 100 * 1024 * 1024, // 100MB for event stream
      max: 50000,              // 50K events
      autoIndexId: false
    };

    const collection = await this.db.createCollection(collectionName, {
      ...eventOptions,
      ...options
    });

    this.collections.set(collectionName, {
      type: 'events',
      streamName: streamName,
      options: eventOptions,
      createdAt: new Date(),
      totalInserts: 0,
      lastActivity: new Date()
    });

    return collection;
  }

  async logMessage(serviceName, logData) {
    // High-performance logging with automatic batching
    const collectionName = `${serviceName}_logs`;
    let collection = this.db.collection(collectionName);

    // Create collection if it doesn't exist
    if (!this.collections.has(collectionName)) {
      collection = await this.createLogCollection(serviceName);
    }

    // Prepare log document with required fields
    const logDocument = {
      timestamp: logData.timestamp || new Date(),
      level: logData.level || 'INFO',
      serviceName: serviceName,
      message: logData.message,
      
      // Optional structured data
      metadata: logData.metadata || {},
      requestId: logData.requestId || null,
      userId: logData.userId || null,
      sessionId: logData.sessionId || null,
      traceId: logData.traceId || null,
      spanId: logData.spanId || null,

      // Performance tracking
      hostname: logData.hostname || require('os').hostname(),
      processId: process.pid,
      threadId: logData.threadId || 0,

      // Categorization
      category: logData.category || 'general',
      tags: logData.tags || []
    };

    // Insert with fire-and-forget for maximum performance
    await collection.insertOne(logDocument, { 
      writeConcern: { w: 0 } // Fire-and-forget for logs
    });

    // Update collection statistics
    const collectionInfo = this.collections.get(collectionName);
    if (collectionInfo) {
      collectionInfo.totalInserts++;
      collectionInfo.lastActivity = new Date();
    }

    return logDocument._id;
  }

  async writeMetrics(metricType, metricsData) {
    // High-throughput metrics writing
    const collectionName = `metrics_${metricType}`;
    let collection = this.db.collection(collectionName);

    if (!this.collections.has(collectionName)) {
      collection = await this.createMetricsCollection(metricType);
    }

    // Prepare metrics document
    const metricsDocument = {
      timestamp: metricsData.timestamp || new Date(),
      metricType: metricType,
      
      // Metric values
      values: metricsData.values || {},
      
      // Dimensions for grouping and filtering
      dimensions: {
        service: metricsData.service,
        environment: metricsData.environment || 'production',
        region: metricsData.region || 'us-east-1',
        version: metricsData.version || '1.0.0',
        ...metricsData.dimensions
      },

      // Aggregation-friendly structure
      counters: metricsData.counters || {},
      gauges: metricsData.gauges || {},
      histograms: metricsData.histograms || {},
      timers: metricsData.timers || {},

      // Source information
      source: {
        hostname: metricsData.hostname || require('os').hostname(),
        processId: process.pid,
        collectionId: metricsData.collectionId || null
      }
    };

    // Batch insertion for metrics (multiple metrics per call)
    if (Array.isArray(metricsData)) {
      const documents = metricsData.map(data => ({
        timestamp: data.timestamp || new Date(),
        metricType: metricType,
        values: data.values || {},
        dimensions: { ...data.dimensions },
        counters: data.counters || {},
        gauges: data.gauges || {},
        histograms: data.histograms || {},
        timers: data.timers || {},
        source: {
          hostname: data.hostname || require('os').hostname(),
          processId: process.pid,
          collectionId: data.collectionId || null
        }
      }));

      await collection.insertMany(documents, { 
        ordered: false, // Allow partial success
        writeConcern: { w: 0 }
      });

      return documents.length;
    } else {
      await collection.insertOne(metricsDocument, { 
        writeConcern: { w: 0 }
      });
      
      return 1;
    }
  }

  async publishEvent(streamName, eventData) {
    // Event streaming with guaranteed order preservation
    const collectionName = `events_${streamName}`;
    let collection = this.db.collection(collectionName);

    if (!this.collections.has(collectionName)) {
      collection = await this.createEventStreamCollection(streamName);
    }

    const eventDocument = {
      timestamp: eventData.timestamp || new Date(),
      eventId: eventData.eventId || new ObjectId(),
      eventType: eventData.eventType,
      streamName: streamName,
      
      // Event payload
      data: eventData.data || {},
      
      // Event metadata
      metadata: {
        version: eventData.version || '1.0',
        source: eventData.source || 'unknown',
        correlationId: eventData.correlationId || null,
        causationId: eventData.causationId || null,
        userId: eventData.userId || null,
        sessionId: eventData.sessionId || null,
        ...eventData.metadata
      },

      // Event context
      context: {
        service: eventData.service || 'unknown',
        environment: eventData.environment || 'production',
        hostname: require('os').hostname(),
        processId: process.pid,
        requestId: eventData.requestId || null
      }
    };

    // Events may need acknowledgment
    const result = await collection.insertOne(eventDocument, {
      writeConcern: { w: 1, j: true } // Ensure durability for events
    });

    return {
      eventId: eventDocument.eventId,
      insertedId: result.insertedId,
      timestamp: eventDocument.timestamp
    };
  }

  async queryRecentLogs(serviceName, options = {}) {
    // Query recent logs with natural ordering (insertion order)
    const collectionName = `${serviceName}_logs`;
    const collection = this.db.collection(collectionName);

    const query = {};
    
    // Add filters
    if (options.level) {
      query.level = options.level;
    }
    
    if (options.since) {
      query.timestamp = { $gte: options.since };
    }
    
    if (options.userId) {
      query.userId = options.userId;
    }

    if (options.category) {
      query.category = options.category;
    }

    // Use natural ordering for efficiency (no index needed)
    const cursor = collection.find(query);
    
    if (options.reverse) {
      // Get most recent first (reverse natural order)
      cursor.sort({ $natural: -1 });
    }
    
    if (options.limit) {
      cursor.limit(options.limit);
    }

    const logs = await cursor.toArray();

    return {
      logs: logs,
      count: logs.length,
      service: serviceName,
      query: query,
      options: options
    };
  }

  async getMetricsAggregation(metricType, timeRange, aggregationType = 'avg') {
    // Efficient metrics aggregation over time ranges
    const collectionName = `metrics_${metricType}`;
    const collection = this.db.collection(collectionName);

    const pipeline = [
      {
        $match: {
          timestamp: {
            $gte: timeRange.start,
            $lte: timeRange.end
          }
        }
      },
      {
        $group: {
          _id: {
            service: '$dimensions.service',
            environment: '$dimensions.environment',
            // Group by time bucket for time-series analysis
            timeBucket: {
              $dateTrunc: {
                date: '$timestamp',
                unit: timeRange.bucketSize || 'minute',
                binSize: timeRange.binSize || 1
              }
            }
          },
          
          // Aggregate different metric types
          avgValues: { $avg: '$values' },
          maxValues: { $max: '$values' },
          minValues: { $min: '$values' },
          sumCounters: { $sum: '$counters' },
          
          count: { $sum: 1 },
          
          firstTimestamp: { $min: '$timestamp' },
          lastTimestamp: { $max: '$timestamp' }
        }
      },
      {
        $sort: {
          '_id.timeBucket': 1,
          '_id.service': 1
        }
      },
      {
        $project: {
          service: '$_id.service',
          environment: '$_id.environment',
          timeBucket: '$_id.timeBucket',
          
          aggregatedValue: {
            $switch: {
              branches: [
                { case: { $eq: [aggregationType, 'avg'] }, then: '$avgValues' },
                { case: { $eq: [aggregationType, 'max'] }, then: '$maxValues' },
                { case: { $eq: [aggregationType, 'min'] }, then: '$minValues' },
                { case: { $eq: [aggregationType, 'sum'] }, then: '$sumCounters' }
              ],
              default: '$avgValues'
            }
          },
          
          dataPoints: '$count',
          timeRange: {
            start: '$firstTimestamp',
            end: '$lastTimestamp'
          },
          
          _id: 0
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    return {
      metricType: metricType,
      aggregationType: aggregationType,
      timeRange: timeRange,
      results: results,
      totalDataPoints: results.reduce((sum, r) => sum + r.dataPoints, 0)
    };
  }

  async createTailableCursor(collectionName, options = {}) {
    // Create tailable cursor for real-time streaming
    const collection = this.db.collection(collectionName);
    
    // Verify collection is capped
    const collectionInfo = await this.db.command({
      collStats: collectionName
    });

    if (!collectionInfo.capped) {
      throw new Error(`Collection ${collectionName} is not capped - tailable cursors require capped collections`);
    }

    const query = options.filter || {};
    const cursorOptions = {
      tailable: true,      // Don't close cursor when reaching end
      awaitData: true,     // Block briefly when no data available
      noCursorTimeout: true, // Don't timeout cursor
      maxTimeMS: options.maxTimeMS || 1000,
      batchSize: options.batchSize || 100
    };

    const cursor = collection.find(query, cursorOptions);

    // Store cursor reference for management
    const cursorId = `${collectionName}_${Date.now()}`;
    this.tailableCursors.set(cursorId, {
      cursor: cursor,
      collection: collectionName,
      filter: query,
      createdAt: new Date(),
      lastActivity: new Date()
    });

    return {
      cursorId: cursorId,
      cursor: cursor
    };
  }

  async streamData(collectionName, callback, options = {}) {
    // High-level streaming interface with automatic reconnection
    const { cursor, cursorId } = await this.createTailableCursor(collectionName, options);
    
    console.log(`Starting data stream from ${collectionName}`);
    
    try {
      while (await cursor.hasNext()) {
        const document = await cursor.next();
        
        if (document) {
          // Update last activity
          const cursorInfo = this.tailableCursors.get(cursorId);
          if (cursorInfo) {
            cursorInfo.lastActivity = new Date();
          }
          
          // Process document through callback
          try {
            await callback(document, { 
              collection: collectionName,
              cursorId: cursorId 
            });
          } catch (callbackError) {
            console.error('Stream callback error:', callbackError);
            // Continue streaming despite callback errors
          }
        }
      }
    } catch (streamError) {
      console.error(`Stream error for ${collectionName}:`, streamError);
      
      // Cleanup cursor reference
      this.tailableCursors.delete(cursorId);
      
      // Auto-reconnect for network errors
      if (streamError.name === 'MongoNetworkError' && options.autoReconnect !== false) {
        console.log(`Attempting to reconnect stream for ${collectionName}...`);
        setTimeout(() => {
          this.streamData(collectionName, callback, options);
        }, options.reconnectDelay || 5000);
      }
      
      throw streamError;
    }
  }

  async getCappedCollectionStats(collectionName) {
    // Get comprehensive statistics for capped collection
    const stats = await this.db.command({
      collStats: collectionName,
      indexDetails: true
    });

    const collection = this.db.collection(collectionName);
    
    // Get document count and size information
    const documentCount = await collection.estimatedDocumentCount();
    const newestDoc = await collection.findOne({}, { sort: { $natural: -1 } });
    const oldestDoc = await collection.findOne({}, { sort: { $natural: 1 } });

    return {
      collection: collectionName,
      capped: stats.capped,
      
      // Size information
      maxSize: stats.maxSize,
      size: stats.size,
      storageSize: stats.storageSize,
      sizeUtilization: stats.size / stats.maxSize,
      
      // Document information
      maxDocuments: stats.max,
      documentCount: documentCount,
      avgDocumentSize: documentCount > 0 ? stats.size / documentCount : 0,
      documentUtilization: stats.max ? documentCount / stats.max : null,
      
      // Time range information
      timespan: newestDoc && oldestDoc ? {
        oldest: oldestDoc.timestamp || oldestDoc._id.getTimestamp(),
        newest: newestDoc.timestamp || newestDoc._id.getTimestamp(),
        spanMs: newestDoc && oldestDoc ? 
          (newestDoc.timestamp || newestDoc._id.getTimestamp()).getTime() - 
          (oldestDoc.timestamp || oldestDoc._id.getTimestamp()).getTime() : 0
      } : null,
      
      // Performance information
      indexes: stats.indexSizes,
      totalIndexSize: Object.values(stats.indexSizes).reduce((sum, size) => sum + size, 0),
      
      // Collection metadata
      collectionInfo: this.collections.get(collectionName) || null,
      
      analyzedAt: new Date()
    };
  }

  async optimizeCappedCollection(collectionName, analysisOptions = {}) {
    // Analyze and provide optimization recommendations
    const stats = await this.getCappedCollectionStats(collectionName);
    const recommendations = [];

    // Size utilization analysis
    if (stats.sizeUtilization < 0.5) {
      recommendations.push({
        type: 'size_optimization',
        priority: 'medium',
        message: `Collection is only ${(stats.sizeUtilization * 100).toFixed(1)}% full. Consider reducing maxSize to save storage.`,
        suggestedMaxSize: Math.ceil(stats.size * 1.2) // 20% headroom
      });
    }

    if (stats.sizeUtilization > 0.9) {
      recommendations.push({
        type: 'size_warning',
        priority: 'high',
        message: `Collection is ${(stats.sizeUtilization * 100).toFixed(1)}% full. Consider increasing maxSize to prevent data loss.`,
        suggestedMaxSize: Math.ceil(stats.maxSize * 1.5) // 50% increase
      });
    }

    // Document count analysis
    if (stats.documentUtilization && stats.documentUtilization < 0.5) {
      recommendations.push({
        type: 'document_optimization',
        priority: 'low',
        message: `Only ${(stats.documentUtilization * 100).toFixed(1)}% of max documents used. Consider reducing max document limit.`,
        suggestedMaxDocs: Math.ceil(stats.documentCount * 1.2)
      });
    }

    // Document size analysis
    if (stats.avgDocumentSize > 10 * 1024) { // 10KB average
      recommendations.push({
        type: 'document_size_warning',
        priority: 'medium',
        message: `Average document size is ${(stats.avgDocumentSize / 1024).toFixed(1)}KB. Large documents may impact performance in capped collections.`
      });
    }

    // Index analysis
    if (stats.totalIndexSize > stats.size * 0.2) { // Indexes > 20% of data size
      recommendations.push({
        type: 'index_optimization',
        priority: 'medium',
        message: `Index size (${(stats.totalIndexSize / 1024 / 1024).toFixed(1)}MB) is large relative to data size. Consider if all indexes are necessary for capped collection workload.`
      });
    }

    // Time span analysis
    if (stats.timespan && stats.timespan.spanMs < 60 * 60 * 1000) { // Less than 1 hour
      recommendations.push({
        type: 'retention_warning',
        priority: 'high',
        message: `Data retention span is only ${(stats.timespan.spanMs / (60 * 1000)).toFixed(1)} minutes. Consider increasing collection size for longer data retention.`
      });
    }

    return {
      collectionStats: stats,
      recommendations: recommendations,
      optimizationScore: this.calculateOptimizationScore(stats, recommendations),
      analyzedAt: new Date()
    };
  }

  calculateOptimizationScore(stats, recommendations) {
    // Calculate optimization score (0-100, higher is better)
    let score = 100;

    // Deduct points for each recommendation based on priority
    recommendations.forEach(rec => {
      switch (rec.priority) {
        case 'high':
          score -= 30;
          break;
        case 'medium':
          score -= 15;
          break;
        case 'low':
          score -= 5;
          break;
      }
    });

    // Bonus points for good utilization
    if (stats.sizeUtilization >= 0.6 && stats.sizeUtilization <= 0.8) {
      score += 10; // Good size utilization
    }

    if (stats.avgDocumentSize < 5 * 1024) { // < 5KB average
      score += 5; // Good document size
    }

    return Math.max(0, Math.min(100, score));
  }

  async closeTailableCursor(cursorId) {
    // Safely close tailable cursor
    const cursorInfo = this.tailableCursors.get(cursorId);
    
    if (cursorInfo) {
      try {
        await cursorInfo.cursor.close();
      } catch (error) {
        console.error(`Error closing cursor ${cursorId}:`, error);
      }
      
      this.tailableCursors.delete(cursorId);
      console.log(`Closed tailable cursor: ${cursorId}`);
    }
  }

  async cleanup() {
    // Cleanup all tailable cursors
    const cursors = Array.from(this.tailableCursors.keys());
    
    for (const cursorId of cursors) {
      await this.closeTailableCursor(cursorId);
    }
    
    console.log(`Cleaned up ${cursors.length} tailable cursors`);
  }
}
```

### Real-Time Streaming with Tailable Cursors

Implement real-time data processing with MongoDB's tailable cursors:

```javascript
// Real-time streaming and event processing with tailable cursors
class RealTimeStreamProcessor {
  constructor(db) {
    this.db = db;
    this.cappedManager = new CappedCollectionManager(db);
    this.activeStreams = new Map();
    this.eventHandlers = new Map();
  }

  async setupLogStreaming(services = []) {
    // Setup real-time log streaming for multiple services
    for (const service of services) {
      await this.cappedManager.createLogCollection(service, {
        size: 100 * 1024 * 1024, // 100MB per service
        max: 50000
      });

      // Start streaming logs for this service
      this.startLogStream(service);
    }
  }

  async startLogStream(serviceName) {
    const collectionName = `${serviceName}_logs`;
    
    console.log(`Starting log stream for ${serviceName}...`);
    
    // Create stream processor
    const streamProcessor = async (logDocument, streamContext) => {
      try {
        // Process log based on level
        await this.processLogMessage(logDocument, streamContext);
        
        // Trigger alerts for critical logs
        if (logDocument.level === 'ERROR' || logDocument.level === 'FATAL') {
          await this.handleCriticalLog(logDocument);
        }

        // Update real-time metrics
        await this.updateLogMetrics(serviceName, logDocument);

        // Forward to external systems if needed
        if (this.eventHandlers.has('log_processed')) {
          await this.eventHandlers.get('log_processed')(logDocument);
        }

      } catch (processingError) {
        console.error('Log processing error:', processingError);
      }
    };

    // Start the stream
    const streamPromise = this.cappedManager.streamData(
      collectionName,
      streamProcessor,
      {
        autoReconnect: true,
        reconnectDelay: 5000,
        batchSize: 50
      }
    );

    this.activeStreams.set(serviceName, streamPromise);
  }

  async processLogMessage(logDocument, streamContext) {
    // Real-time log message processing
    const processing = {
      timestamp: new Date(),
      service: logDocument.serviceName,
      level: logDocument.level,
      messageLength: logDocument.message.length,
      hasMetadata: Object.keys(logDocument.metadata || {}).length > 0,
      processingLatency: Date.now() - logDocument.timestamp.getTime()
    };

    // Pattern matching for specific log types
    if (logDocument.message.includes('OutOfMemoryError')) {
      await this.handleOutOfMemoryAlert(logDocument);
    }
    
    if (logDocument.message.includes('Connection timeout')) {
      await this.handleConnectionIssue(logDocument);
    }

    if (logDocument.requestId && logDocument.level === 'ERROR') {
      await this.trackRequestError(logDocument);
    }

    // Store processing metadata for analytics
    await this.db.collection('log_processing_stats').insertOne({
      ...processing,
      logId: logDocument._id
    });
  }

  async handleCriticalLog(logDocument) {
    // Handle critical log events
    const alert = {
      timestamp: new Date(),
      alertType: 'critical_log',
      severity: logDocument.level,
      service: logDocument.serviceName,
      message: logDocument.message,
      metadata: logDocument.metadata,
      
      // Context information
      requestId: logDocument.requestId,
      userId: logDocument.userId,
      sessionId: logDocument.sessionId,
      
      // Alert details
      alertId: new ObjectId(),
      acknowledged: false,
      escalated: false
    };

    // Store alert
    await this.db.collection('critical_alerts').insertOne(alert);

    // Send notifications (implement based on your notification system)
    await this.sendAlertNotification(alert);

    // Auto-escalate if needed
    if (logDocument.level === 'FATAL') {
      setTimeout(async () => {
        await this.escalateAlert(alert.alertId);
      }, 5 * 60 * 1000); // Escalate after 5 minutes if not acknowledged
    }
  }

  async setupMetricsStreaming(metricTypes = []) {
    // Setup real-time metrics streaming
    for (const metricType of metricTypes) {
      await this.cappedManager.createMetricsCollection(metricType, {
        size: 200 * 1024 * 1024, // 200MB per metric type
        max: 100000
      });

      this.startMetricsStream(metricType);
    }
  }

  async startMetricsStream(metricType) {
    const collectionName = `metrics_${metricType}`;
    
    const metricsProcessor = async (metricsDocument, streamContext) => {
      try {
        // Real-time metrics processing
        await this.processMetricsData(metricsDocument, streamContext);
        
        // Check for threshold violations
        await this.checkMetricsThresholds(metricsDocument);

        // Update real-time dashboards
        if (this.eventHandlers.has('metrics_updated')) {
          await this.eventHandlers.get('metrics_updated')(metricsDocument);
        }

        // Aggregate into time-series buckets
        await this.aggregateMetricsData(metricsDocument);

      } catch (processingError) {
        console.error('Metrics processing error:', processingError);
      }
    };

    const streamPromise = this.cappedManager.streamData(
      collectionName,
      metricsProcessor,
      {
        autoReconnect: true,
        batchSize: 100,
        filter: { 
          // Only process metrics from last 5 minutes to avoid historical data on restart
          timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        }
      }
    );

    this.activeStreams.set(`metrics_${metricType}`, streamPromise);
  }

  async processMetricsData(metricsDocument, streamContext) {
    // Process individual metrics document
    const metricType = metricsDocument.metricType;
    const values = metricsDocument.values || {};
    const counters = metricsDocument.counters || {};
    const gauges = metricsDocument.gauges || {};

    // Calculate derived metrics
    const derivedMetrics = {
      timestamp: metricsDocument.timestamp,
      metricType: metricType,
      service: metricsDocument.dimensions?.service,
      
      // Calculate rates and percentages
      rates: {},
      percentages: {},
      health: {}
    };

    // Calculate request rate if applicable
    if (counters.requests) {
      const timeWindow = 60; // 1 minute window
      const requestRate = counters.requests / timeWindow;
      derivedMetrics.rates.requestsPerSecond = requestRate;
    }

    // Calculate error percentage
    if (counters.requests && counters.errors) {
      derivedMetrics.percentages.errorRate = (counters.errors / counters.requests) * 100;
    }

    // Calculate response time percentiles if histogram data available
    if (metricsDocument.histograms?.response_time) {
      derivedMetrics.responseTime = this.calculatePercentiles(
        metricsDocument.histograms.response_time
      );
    }

    // Health scoring
    derivedMetrics.health.score = this.calculateHealthScore(metricsDocument);
    derivedMetrics.health.status = this.getHealthStatus(derivedMetrics.health.score);

    // Store derived metrics
    await this.db.collection('derived_metrics').insertOne(derivedMetrics);
  }

  async checkMetricsThresholds(metricsDocument) {
    // Check metrics against defined thresholds
    const thresholds = await this.getThresholdsForService(
      metricsDocument.dimensions?.service
    );

    const violations = [];

    // Check various threshold types
    Object.entries(thresholds.counters || {}).forEach(([metric, threshold]) => {
      const value = metricsDocument.counters?.[metric];
      if (value !== undefined && value > threshold.max) {
        violations.push({
          type: 'counter',
          metric: metric,
          value: value,
          threshold: threshold.max,
          severity: threshold.severity || 'warning'
        });
      }
    });

    Object.entries(thresholds.gauges || {}).forEach(([metric, threshold]) => {
      const value = metricsDocument.gauges?.[metric];
      if (value !== undefined) {
        if (threshold.max && value > threshold.max) {
          violations.push({
            type: 'gauge_high',
            metric: metric,
            value: value,
            threshold: threshold.max,
            severity: threshold.severity || 'warning'
          });
        }
        if (threshold.min && value < threshold.min) {
          violations.push({
            type: 'gauge_low',
            metric: metric,
            value: value,
            threshold: threshold.min,
            severity: threshold.severity || 'warning'
          });
        }
      }
    });

    // Handle threshold violations
    for (const violation of violations) {
      await this.handleThresholdViolation(violation, metricsDocument);
    }
  }

  async setupEventStreaming(streamNames = []) {
    // Setup event streaming for event-driven architectures
    for (const streamName of streamNames) {
      await this.cappedManager.createEventStreamCollection(streamName, {
        size: 100 * 1024 * 1024,
        max: 50000
      });

      this.startEventStream(streamName);
    }
  }

  async startEventStream(streamName) {
    const collectionName = `events_${streamName}`;
    
    const eventProcessor = async (eventDocument, streamContext) => {
      try {
        // Process event based on type
        await this.processEvent(eventDocument, streamContext);

        // Trigger event handlers
        const eventType = eventDocument.eventType;
        if (this.eventHandlers.has(eventType)) {
          await this.eventHandlers.get(eventType)(eventDocument);
        }

        // Update event processing metrics
        await this.updateEventMetrics(streamName, eventDocument);

      } catch (processingError) {
        console.error('Event processing error:', processingError);
        
        // Handle event processing failure
        await this.handleEventProcessingFailure(eventDocument, processingError);
      }
    };

    const streamPromise = this.cappedManager.streamData(
      collectionName,
      eventProcessor,
      {
        autoReconnect: true,
        batchSize: 25 // Smaller batches for events to reduce latency
      }
    );

    this.activeStreams.set(`events_${streamName}`, streamPromise);
  }

  async processEvent(eventDocument, streamContext) {
    // Process individual event
    const eventType = eventDocument.eventType;
    const eventData = eventDocument.data;
    const eventMetadata = eventDocument.metadata;

    // Event processing based on type
    switch (eventType) {
      case 'user_action':
        await this.processUserActionEvent(eventDocument);
        break;
      
      case 'system_state_change':
        await this.processSystemStateEvent(eventDocument);
        break;
      
      case 'transaction_completed':
        await this.processTransactionEvent(eventDocument);
        break;
      
      case 'alert_triggered':
        await this.processAlertEvent(eventDocument);
        break;
      
      default:
        await this.processGenericEvent(eventDocument);
    }

    // Store event processing record
    await this.db.collection('event_processing_log').insertOne({
      eventId: eventDocument.eventId,
      eventType: eventType,
      streamName: eventDocument.streamName,
      processedAt: new Date(),
      processingLatency: Date.now() - eventDocument.timestamp.getTime(),
      success: true
    });
  }

  // Event handler registration
  registerEventHandler(eventType, handler) {
    this.eventHandlers.set(eventType, handler);
  }

  unregisterEventHandler(eventType) {
    this.eventHandlers.delete(eventType);
  }

  // Utility methods
  async getThresholdsForService(serviceName) {
    // Get threshold configuration for service
    const config = await this.db.collection('service_thresholds').findOne({
      service: serviceName
    });

    return config?.thresholds || {
      counters: {},
      gauges: {},
      histograms: {}
    };
  }

  calculatePercentiles(histogramData) {
    // Calculate percentiles from histogram data
    // Implementation depends on histogram format
    return {
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0
    };
  }

  calculateHealthScore(metricsDocument) {
    // Calculate overall health score from metrics
    let score = 100;

    // Deduct based on error rates, response times, etc.
    const errorRate = metricsDocument.counters?.errors / metricsDocument.counters?.requests;
    if (errorRate > 0.05) score -= 30; // > 5% error rate
    if (errorRate > 0.01) score -= 15; // > 1% error rate

    return Math.max(0, score);
  }

  getHealthStatus(score) {
    if (score >= 90) return 'healthy';
    if (score >= 70) return 'warning';
    if (score >= 50) return 'critical';
    return 'unhealthy';
  }

  async handleThresholdViolation(violation, metricsDocument) {
    // Handle metrics threshold violations
    console.log(`Threshold violation: ${violation.metric} = ${violation.value} (threshold: ${violation.threshold})`);
    
    // Store violation record
    await this.db.collection('threshold_violations').insertOne({
      ...violation,
      timestamp: new Date(),
      service: metricsDocument.dimensions?.service,
      environment: metricsDocument.dimensions?.environment,
      metricsDocument: metricsDocument._id
    });
  }

  async handleEventProcessingFailure(eventDocument, error) {
    // Handle event processing failures
    await this.db.collection('event_processing_errors').insertOne({
      eventId: eventDocument.eventId,
      eventType: eventDocument.eventType,
      streamName: eventDocument.streamName,
      error: error.message,
      errorStack: error.stack,
      failedAt: new Date(),
      retryCount: 0
    });
  }

  // Cleanup and shutdown
  async stopAllStreams() {
    const streamPromises = Array.from(this.activeStreams.values());
    
    // Stop all active streams
    for (const [streamName, streamPromise] of this.activeStreams.entries()) {
      console.log(`Stopping stream: ${streamName}`);
      // Streams will stop when cursors are closed
    }
    
    await this.cappedManager.cleanup();
    this.activeStreams.clear();
    
    console.log(`Stopped ${streamPromises.length} streams`);
  }

  // Placeholder methods for event processing
  async processUserActionEvent(eventDocument) { /* Implementation */ }
  async processSystemStateEvent(eventDocument) { /* Implementation */ }
  async processTransactionEvent(eventDocument) { /* Implementation */ }
  async processAlertEvent(eventDocument) { /* Implementation */ }
  async processGenericEvent(eventDocument) { /* Implementation */ }
  async updateLogMetrics(serviceName, logDocument) { /* Implementation */ }
  async updateEventMetrics(streamName, eventDocument) { /* Implementation */ }
  async sendAlertNotification(alert) { /* Implementation */ }
  async escalateAlert(alertId) { /* Implementation */ }
  async handleOutOfMemoryAlert(logDocument) { /* Implementation */ }
  async handleConnectionIssue(logDocument) { /* Implementation */ }
  async trackRequestError(logDocument) { /* Implementation */ }
  async aggregateMetricsData(metricsDocument) { /* Implementation */ }
}
```

### Performance Monitoring and Chat Systems

Implement specialized capped collection patterns for different use cases:

```javascript
// Specialized capped collection implementations
class SpecializedCappedSystems {
  constructor(db) {
    this.db = db;
    this.cappedManager = new CappedCollectionManager(db);
  }

  async setupChatSystem(channelId, options = {}) {
    // High-performance chat message storage
    const collectionName = `chat_${channelId}`;
    const chatOptions = {
      capped: true,
      size: 50 * 1024 * 1024,  // 50MB per channel
      max: 25000,              // 25K messages per channel
      autoIndexId: false
    };

    const collection = await this.db.createCollection(collectionName, {
      ...chatOptions,
      ...options
    });

    // Setup for real-time message streaming
    await this.setupChatStreaming(channelId);

    return collection;
  }

  async sendChatMessage(channelId, messageData) {
    const collectionName = `chat_${channelId}`;
    
    const messageDocument = {
      timestamp: new Date(),
      messageId: new ObjectId(),
      channelId: channelId,
      
      // Message content
      content: messageData.content,
      messageType: messageData.type || 'text', // text, image, file, system
      
      // Sender information
      sender: {
        userId: messageData.senderId,
        username: messageData.senderUsername,
        avatar: messageData.senderAvatar || null
      },
      
      // Message metadata
      metadata: {
        edited: false,
        editHistory: [],
        reactions: {},
        mentions: messageData.mentions || [],
        attachments: messageData.attachments || [],
        threadParent: messageData.threadParent || null
      },
      
      // Moderation
      flagged: false,
      deleted: false,
      moderatorActions: []
    };

    const collection = this.db.collection(collectionName);
    await collection.insertOne(messageDocument);

    return messageDocument;
  }

  async getChatHistory(channelId, options = {}) {
    const collectionName = `chat_${channelId}`;
    const collection = this.db.collection(collectionName);

    const query = { deleted: { $ne: true } };
    
    if (options.since) {
      query.timestamp = { $gte: options.since };
    }
    
    if (options.before) {
      query.timestamp = { ...query.timestamp, $lt: options.before };
    }

    // Use natural order for chat (insertion order)
    const messages = await collection
      .find(query)
      .sort({ $natural: options.reverse ? -1 : 1 })
      .limit(options.limit || 50)
      .toArray();

    return {
      channelId: channelId,
      messages: messages,
      count: messages.length,
      hasMore: messages.length === (options.limit || 50)
    };
  }

  async setupChatStreaming(channelId) {
    const collectionName = `chat_${channelId}`;
    
    const messageProcessor = async (messageDocument, streamContext) => {
      // Process new chat messages in real-time
      try {
        // Broadcast to connected users (implement based on your WebSocket system)
        await this.broadcastChatMessage(messageDocument);
        
        // Update user activity
        await this.updateUserActivity(messageDocument.sender.userId, channelId);
        
        // Check for mentions and notifications
        if (messageDocument.metadata.mentions.length > 0) {
          await this.handleMentionNotifications(messageDocument);
        }
        
        // Content moderation
        await this.moderateMessage(messageDocument);

      } catch (error) {
        console.error('Chat message processing error:', error);
      }
    };

    // Start real-time streaming for this channel
    return this.cappedManager.streamData(collectionName, messageProcessor, {
      autoReconnect: true,
      batchSize: 10, // Small batches for low latency
      filter: { deleted: { $ne: true } } // Don't stream deleted messages
    });
  }

  async setupPerformanceMonitoring(applicationName, options = {}) {
    // Application performance monitoring with capped collections
    const collectionName = `perf_${applicationName}`;
    const perfOptions = {
      capped: true,
      size: 500 * 1024 * 1024, // 500MB for performance data
      max: 200000,             // 200K performance records
      autoIndexId: false
    };

    const collection = await this.db.createCollection(collectionName, {
      ...perfOptions,
      ...options
    });

    // Setup real-time performance monitoring
    await this.setupPerformanceStreaming(applicationName);

    return collection;
  }

  async recordPerformanceMetrics(applicationName, performanceData) {
    const collectionName = `perf_${applicationName}`;
    
    const performanceDocument = {
      timestamp: new Date(),
      application: applicationName,
      
      // Request/response metrics
      request: {
        method: performanceData.method,
        path: performanceData.path,
        userAgent: performanceData.userAgent,
        ip: performanceData.ip,
        size: performanceData.requestSize || 0
      },
      
      response: {
        statusCode: performanceData.statusCode,
        size: performanceData.responseSize || 0,
        contentType: performanceData.contentType
      },
      
      // Timing metrics
      timings: {
        total: performanceData.responseTime,
        dns: performanceData.dnsTime || 0,
        connect: performanceData.connectTime || 0,
        ssl: performanceData.sslTime || 0,
        send: performanceData.sendTime || 0,
        wait: performanceData.waitTime || 0,
        receive: performanceData.receiveTime || 0
      },
      
      // Performance indicators
      performance: {
        cpuUsage: performanceData.cpuUsage,
        memoryUsage: performanceData.memoryUsage,
        diskIO: performanceData.diskIO || {},
        networkIO: performanceData.networkIO || {}
      },
      
      // Error tracking
      errors: performanceData.errors || [],
      warnings: performanceData.warnings || [],
      
      // User session info
      session: {
        userId: performanceData.userId,
        sessionId: performanceData.sessionId,
        isFirstVisit: performanceData.isFirstVisit || false
      },
      
      // Geographic and device info
      context: {
        country: performanceData.country,
        city: performanceData.city,
        device: performanceData.device,
        os: performanceData.os,
        browser: performanceData.browser
      }
    };

    const collection = this.db.collection(collectionName);
    await collection.insertOne(performanceDocument);

    return performanceDocument;
  }

  async setupPerformanceStreaming(applicationName) {
    const collectionName = `perf_${applicationName}`;
    
    const performanceProcessor = async (perfDocument, streamContext) => {
      try {
        // Real-time performance analysis
        await this.analyzePerformanceData(perfDocument);
        
        // Detect performance anomalies
        await this.detectPerformanceAnomalies(perfDocument);
        
        // Update real-time dashboards
        await this.updatePerformanceDashboard(perfDocument);
        
      } catch (error) {
        console.error('Performance data processing error:', error);
      }
    };

    return this.cappedManager.streamData(collectionName, performanceProcessor, {
      autoReconnect: true,
      batchSize: 50
    });
  }

  async setupAuditLogging(systemName, options = {}) {
    // High-integrity audit logging with capped collections
    const collectionName = `audit_${systemName}`;
    const auditOptions = {
      capped: true,
      size: 1024 * 1024 * 1024, // 1GB for audit logs
      max: 500000,              // 500K audit records
      autoIndexId: false
    };

    const collection = await this.db.createCollection(collectionName, {
      ...auditOptions,
      ...options
    });

    return collection;
  }

  async recordAuditEvent(systemName, auditData) {
    const collectionName = `audit_${systemName}`;
    
    const auditDocument = {
      timestamp: new Date(),
      system: systemName,
      auditId: new ObjectId(),
      
      // Event information
      event: {
        type: auditData.eventType,
        action: auditData.action,
        resource: auditData.resource,
        resourceId: auditData.resourceId,
        outcome: auditData.outcome || 'success' // success, failure, pending
      },
      
      // Actor information
      actor: {
        userId: auditData.userId,
        username: auditData.username,
        role: auditData.userRole,
        ip: auditData.ip,
        userAgent: auditData.userAgent
      },
      
      // Context
      context: {
        sessionId: auditData.sessionId,
        requestId: auditData.requestId,
        correlationId: auditData.correlationId,
        source: auditData.source || 'application'
      },
      
      // Data changes (for modification events)
      changes: {
        before: auditData.beforeData || null,
        after: auditData.afterData || null,
        fields: auditData.changedFields || []
      },
      
      // Security context
      security: {
        riskScore: auditData.riskScore || 0,
        securityFlags: auditData.securityFlags || [],
        authenticationMethod: auditData.authMethod
      },
      
      // Compliance tags
      compliance: {
        regulations: auditData.regulations || [], // GDPR, SOX, HIPAA, etc.
        dataClassification: auditData.dataClassification || 'internal',
        retentionPolicy: auditData.retentionPolicy
      }
    };

    const collection = this.db.collection(collectionName);
    
    // Use acknowledged write for audit logs
    await collection.insertOne(auditDocument, {
      writeConcern: { w: 1, j: true }
    });

    return auditDocument;
  }

  async queryAuditLogs(systemName, criteria = {}) {
    const collectionName = `audit_${systemName}`;
    const collection = this.db.collection(collectionName);

    const query = {};
    
    if (criteria.userId) {
      query['actor.userId'] = criteria.userId;
    }
    
    if (criteria.eventType) {
      query['event.type'] = criteria.eventType;
    }
    
    if (criteria.resource) {
      query['event.resource'] = criteria.resource;
    }
    
    if (criteria.timeRange) {
      query.timestamp = {
        $gte: criteria.timeRange.start,
        $lte: criteria.timeRange.end
      };
    }
    
    if (criteria.outcome) {
      query['event.outcome'] = criteria.outcome;
    }

    const auditEvents = await collection
      .find(query)
      .sort({ $natural: -1 }) // Most recent first
      .limit(criteria.limit || 100)
      .toArray();

    return {
      system: systemName,
      criteria: criteria,
      events: auditEvents,
      count: auditEvents.length
    };
  }

  // Utility methods for chat system
  async broadcastChatMessage(messageDocument) {
    // Implement WebSocket broadcasting
    console.log(`Broadcasting message ${messageDocument.messageId} to channel ${messageDocument.channelId}`);
  }

  async updateUserActivity(userId, channelId) {
    // Update user activity in regular collection
    await this.db.collection('user_activity').updateOne(
      { userId: userId },
      {
        $set: { lastSeen: new Date() },
        $addToSet: { activeChannels: channelId }
      },
      { upsert: true }
    );
  }

  async handleMentionNotifications(messageDocument) {
    // Handle user mentions
    for (const mentionedUser of messageDocument.metadata.mentions) {
      await this.db.collection('notifications').insertOne({
        userId: mentionedUser.userId,
        type: 'mention',
        channelId: messageDocument.channelId,
        messageId: messageDocument.messageId,
        fromUser: messageDocument.sender.userId,
        timestamp: new Date(),
        read: false
      });
    }
  }

  async moderateMessage(messageDocument) {
    // Basic content moderation
    const content = messageDocument.content.toLowerCase();
    const hasInappropriateContent = false; // Implement your moderation logic
    
    if (hasInappropriateContent) {
      await this.db.collection(`chat_${messageDocument.channelId}`).updateOne(
        { _id: messageDocument._id },
        { 
          $set: { 
            flagged: true,
            'moderatorActions': [{
              action: 'flagged',
              reason: 'inappropriate_content',
              timestamp: new Date(),
              automated: true
            }]
          }
        }
      );
    }
  }

  // Performance monitoring methods
  async analyzePerformanceData(perfDocument) {
    // Analyze performance data for patterns
    const responseTime = perfDocument.timings.total;
    const statusCode = perfDocument.response.statusCode;
    
    // Calculate performance score
    let score = 100;
    if (responseTime > 5000) score -= 50; // > 5 seconds
    else if (responseTime > 2000) score -= 30; // > 2 seconds
    else if (responseTime > 1000) score -= 15; // > 1 second
    
    if (statusCode >= 500) score -= 40;
    else if (statusCode >= 400) score -= 20;
    
    // Store analysis
    await this.db.collection('performance_analysis').insertOne({
      performanceId: perfDocument._id,
      application: perfDocument.application,
      timestamp: perfDocument.timestamp,
      score: Math.max(0, score),
      responseTime: responseTime,
      statusCode: statusCode,
      performanceCategory: this.categorizePerformance(responseTime),
      analyzedAt: new Date()
    });
  }

  categorizePerformance(responseTime) {
    if (responseTime < 200) return 'excellent';
    if (responseTime < 1000) return 'good';
    if (responseTime < 3000) return 'acceptable';
    if (responseTime < 10000) return 'poor';
    return 'unacceptable';
  }

  async detectPerformanceAnomalies(perfDocument) {
    // Simple anomaly detection
    const responseTime = perfDocument.timings.total;
    const path = perfDocument.request.path;
    
    // Get historical average for this endpoint
    const recentPerformance = await this.db.collection(`perf_${perfDocument.application}`)
      .find({
        'request.path': path,
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      })
      .sort({ $natural: -1 })
      .limit(100)
      .toArray();

    if (recentPerformance.length > 10) {
      const avgResponseTime = recentPerformance.reduce((sum, perf) => 
        sum + perf.timings.total, 0) / recentPerformance.length;
      
      // Alert if current response time is 3x average
      if (responseTime > avgResponseTime * 3) {
        await this.db.collection('performance_alerts').insertOne({
          application: perfDocument.application,
          path: path,
          currentResponseTime: responseTime,
          averageResponseTime: avgResponseTime,
          severity: responseTime > avgResponseTime * 5 ? 'critical' : 'warning',
          timestamp: new Date()
        });
      }
    }
  }

  async updatePerformanceDashboard(perfDocument) {
    // Update real-time performance dashboard
    console.log(`Performance update: ${perfDocument.application} ${perfDocument.request.path} - ${perfDocument.timings.total}ms`);
  }
}
```

## SQL-Style Capped Collection Management with QueryLeaf

QueryLeaf provides familiar SQL approaches to MongoDB capped collection operations:

```sql
-- QueryLeaf capped collection operations with SQL-familiar syntax

-- Create capped collection equivalent to CREATE TABLE with size limits
CREATE CAPPED COLLECTION application_logs
WITH (
  MAX_SIZE = 104857600,    -- 100MB maximum size  
  MAX_DOCUMENTS = 50000,   -- Maximum document count
  AUTO_INDEX_ID = false    -- Optimize for insert performance
);

-- High-performance insertions equivalent to INSERT statements
INSERT INTO application_logs (
  timestamp,
  level,
  service_name,
  message,
  metadata,
  request_id,
  user_id
) VALUES (
  CURRENT_TIMESTAMP,
  'INFO',
  'auth-service',
  'User login successful',
  JSON_BUILD_OBJECT('ip', '192.168.1.100', 'browser', 'Chrome'),
  'req_001',
  12345
);

-- Query recent logs with natural order (insertion order preserved)
SELECT 
  timestamp,
  level,
  service_name,
  message,
  metadata->>'ip' as client_ip,
  request_id
FROM application_logs
WHERE level IN ('ERROR', 'FATAL', 'WARN')
  AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
ORDER BY $NATURAL DESC  -- MongoDB natural order (insertion order)
LIMIT 100;

-- Capped collection statistics and monitoring
SELECT 
  COLLECTION_NAME() as collection,
  IS_CAPPED() as is_capped,
  MAX_SIZE() as max_size_bytes,
  CURRENT_SIZE() as current_size_bytes,
  ROUND((CURRENT_SIZE()::float / MAX_SIZE()) * 100, 2) as size_utilization_pct,
  
  MAX_DOCUMENTS() as max_documents,
  DOCUMENT_COUNT() as current_documents,
  ROUND((DOCUMENT_COUNT()::float / MAX_DOCUMENTS()) * 100, 2) as doc_utilization_pct,
  
  -- Time span information
  MIN(timestamp) as oldest_record,
  MAX(timestamp) as newest_record,
  EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 3600 as timespan_hours

FROM application_logs;

-- Real-time streaming with SQL-style tailable cursor
DECLARE @stream_cursor TAILABLE CURSOR FOR
SELECT 
  timestamp,
  level,
  service_name,
  message,
  request_id,
  user_id
FROM application_logs
WHERE level IN ('ERROR', 'FATAL')
ORDER BY $NATURAL ASC;

-- Process streaming data (pseudo-code for real-time processing)
WHILE CURSOR_HAS_NEXT(@stream_cursor)
BEGIN
  FETCH NEXT FROM @stream_cursor INTO @log_record;
  
  -- Process log record
  IF @log_record.level = 'FATAL'
    EXEC send_alert_notification @log_record;
  
  -- Update real-time metrics
  UPDATE real_time_metrics 
  SET error_count = error_count + 1,
      last_error_time = @log_record.timestamp
  WHERE service_name = @log_record.service_name;
END;

-- Performance monitoring with capped collections
CREATE CAPPED COLLECTION performance_metrics
WITH (
  MAX_SIZE = 524288000,    -- 500MB
  MAX_DOCUMENTS = 200000,
  AUTO_INDEX_ID = false
);

-- Record performance data
INSERT INTO performance_metrics (
  timestamp,
  application,
  request_method,
  request_path,
  response_time_ms,
  status_code,
  cpu_usage_pct,
  memory_usage_mb,
  user_id
) VALUES (
  CURRENT_TIMESTAMP,
  'web-app',
  'GET',
  '/api/v1/users',
  234,
  200,
  45.2,
  512,
  12345
);

-- Real-time performance analysis
WITH performance_window AS (
  SELECT 
    application,
    request_path,
    response_time_ms,
    status_code,
    timestamp,
    -- Calculate performance percentiles over sliding window
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) 
      OVER (PARTITION BY request_path ORDER BY timestamp 
            ROWS BETWEEN 99 PRECEDING AND CURRENT ROW) as p50_response_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) 
      OVER (PARTITION BY request_path ORDER BY timestamp 
            ROWS BETWEEN 99 PRECEDING AND CURRENT ROW) as p95_response_time,
    -- Error rate calculation
    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) 
      OVER (PARTITION BY request_path ORDER BY timestamp 
            ROWS BETWEEN 99 PRECEDING AND CURRENT ROW) as error_count,
    COUNT(*) 
      OVER (PARTITION BY request_path ORDER BY timestamp 
            ROWS BETWEEN 99 PRECEDING AND CURRENT ROW) as total_requests
  FROM performance_metrics
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
)
SELECT 
  application,
  request_path,
  ROUND(AVG(response_time_ms), 0) as avg_response_time,
  ROUND(MAX(p50_response_time), 0) as median_response_time,
  ROUND(MAX(p95_response_time), 0) as p95_response_time,
  ROUND((MAX(error_count)::float / MAX(total_requests)) * 100, 2) as error_rate_pct,
  COUNT(*) as sample_size,
  
  -- Performance health assessment
  CASE 
    WHEN MAX(p95_response_time) > 5000 THEN 'CRITICAL'
    WHEN MAX(p95_response_time) > 2000 THEN 'WARNING'
    WHEN (MAX(error_count)::float / MAX(total_requests)) > 0.05 THEN 'WARNING'
    ELSE 'HEALTHY'
  END as health_status

FROM performance_window
WHERE total_requests >= 10  -- Minimum sample size
GROUP BY application, request_path
ORDER BY p95_response_time DESC;

-- Chat system with capped collections
CREATE CAPPED COLLECTION chat_general
WITH (
  MAX_SIZE = 52428800,  -- 50MB
  MAX_DOCUMENTS = 25000,
  AUTO_INDEX_ID = false
);

-- Send chat messages
INSERT INTO chat_general (
  timestamp,
  message_id,
  channel_id,
  content,
  message_type,
  sender_user_id,
  sender_username,
  mentions,
  attachments
) VALUES (
  CURRENT_TIMESTAMP,
  UUID_GENERATE_V4(),
  'general',
  'Hello everyone! How is everyone doing today?',
  'text',
  12345,
  'johndoe',
  ARRAY[]::TEXT[],
  ARRAY[]::JSONB[]
);

-- Get recent chat history with natural ordering
SELECT 
  timestamp,
  content,
  sender_username,
  message_type,
  CASE WHEN ARRAY_LENGTH(mentions, 1) > 0 THEN 
    'Mentions: ' || ARRAY_TO_STRING(mentions, ', ') 
    ELSE '' 
  END as mention_info
FROM chat_general
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '2 hours'
  AND deleted = false
ORDER BY $NATURAL ASC  -- Maintain insertion order for chat
LIMIT 50;

-- Real-time chat streaming
DECLARE @chat_stream TAILABLE CURSOR FOR
SELECT 
  timestamp,
  message_id,
  content,
  sender_user_id,
  sender_username,
  mentions
FROM chat_general
WHERE timestamp >= CURRENT_TIMESTAMP  -- Only new messages
  AND deleted = false
ORDER BY $NATURAL ASC;

-- Audit logging with capped collections
CREATE CAPPED COLLECTION audit_system
WITH (
  MAX_SIZE = 1073741824,  -- 1GB for audit logs
  MAX_DOCUMENTS = 500000,
  AUTO_INDEX_ID = false
);

-- Record audit events with high integrity
INSERT INTO audit_system (
  timestamp,
  audit_id,
  event_type,
  action,
  resource,
  resource_id,
  user_id,
  username,
  ip_address,
  outcome,
  risk_score,
  compliance_regulations
) VALUES (
  CURRENT_TIMESTAMP,
  UUID_GENERATE_V4(),
  'data_access',
  'SELECT',
  'customer_records',
  'cust_12345',
  67890,
  'jane.analyst',
  '192.168.1.200',
  'success',
  15,
  ARRAY['GDPR', 'SOX']
);

-- Audit log analysis and compliance reporting
WITH audit_summary AS (
  SELECT 
    event_type,
    action,
    resource,
    outcome,
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    COUNT(*) as event_count,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(risk_score) as avg_risk_score,
    SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure_count
  FROM audit_system
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY event_type, action, resource, outcome, DATE_TRUNC('hour', timestamp)
)
SELECT 
  hour_bucket,
  event_type,
  action,
  resource,
  SUM(event_count) as total_events,
  SUM(unique_users) as total_unique_users,
  ROUND(AVG(avg_risk_score), 1) as avg_risk_score,
  SUM(failure_count) as total_failures,
  ROUND((SUM(failure_count)::float / SUM(event_count)) * 100, 2) as failure_rate_pct,
  
  -- Compliance flags
  CASE 
    WHEN SUM(failure_count) > SUM(event_count) * 0.1 THEN 'HIGH_FAILURE_RATE'
    WHEN AVG(avg_risk_score) > 80 THEN 'HIGH_RISK_ACTIVITY' 
    ELSE 'NORMAL'
  END as compliance_flag

FROM audit_summary
GROUP BY hour_bucket, event_type, action, resource
HAVING SUM(event_count) >= 5  -- Minimum activity threshold
ORDER BY hour_bucket DESC, total_events DESC;

-- Capped collection maintenance and optimization
SELECT 
  collection_name,
  max_size_mb,
  current_size_mb,
  size_efficiency_pct,
  max_documents,
  current_documents,
  doc_efficiency_pct,
  oldest_record,
  newest_record,
  retention_hours,
  
  -- Optimization recommendations
  CASE 
    WHEN size_efficiency_pct < 50 THEN 'REDUCE_MAX_SIZE'
    WHEN size_efficiency_pct > 90 THEN 'INCREASE_MAX_SIZE'
    WHEN doc_efficiency_pct < 50 THEN 'REDUCE_MAX_DOCS'  
    WHEN retention_hours < 1 THEN 'INCREASE_COLLECTION_SIZE'
    ELSE 'OPTIMAL'
  END as optimization_recommendation

FROM (
  SELECT 
    'application_logs' as collection_name,
    MAX_SIZE() / 1024 / 1024 as max_size_mb,
    CURRENT_SIZE() / 1024 / 1024 as current_size_mb,
    ROUND((CURRENT_SIZE()::float / MAX_SIZE()) * 100, 1) as size_efficiency_pct,
    MAX_DOCUMENTS() as max_documents,
    DOCUMENT_COUNT() as current_documents,
    ROUND((DOCUMENT_COUNT()::float / MAX_DOCUMENTS()) * 100, 1) as doc_efficiency_pct,
    MIN(timestamp) as oldest_record,
    MAX(timestamp) as newest_record,
    ROUND(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 3600, 1) as retention_hours
  FROM application_logs
  
  UNION ALL
  
  SELECT 
    'performance_metrics' as collection_name,
    MAX_SIZE() / 1024 / 1024 as max_size_mb,
    CURRENT_SIZE() / 1024 / 1024 as current_size_mb,
    ROUND((CURRENT_SIZE()::float / MAX_SIZE()) * 100, 1) as size_efficiency_pct,
    MAX_DOCUMENTS() as max_documents,  
    DOCUMENT_COUNT() as current_documents,
    ROUND((DOCUMENT_COUNT()::float / MAX_DOCUMENTS()) * 100, 1) as doc_efficiency_pct,
    MIN(timestamp) as oldest_record,
    MAX(timestamp) as newest_record,
    ROUND(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 3600, 1) as retention_hours
  FROM performance_metrics
) capped_stats
ORDER BY size_efficiency_pct DESC;

-- QueryLeaf provides comprehensive capped collection features:
-- 1. SQL-familiar CREATE CAPPED COLLECTION syntax
-- 2. Automatic circular buffer behavior with size and document limits
-- 3. Natural ordering support ($NATURAL) for insertion-order queries
-- 4. Tailable cursor support for real-time streaming
-- 5. Built-in collection statistics and monitoring functions
-- 6. Performance optimization recommendations
-- 7. Integration with standard SQL analytics and aggregation functions
-- 8. Compliance and audit logging patterns
-- 9. Real-time alerting and anomaly detection
-- 10. Seamless integration with MongoDB's capped collection performance benefits
```

## Best Practices for Capped Collections

### Design Guidelines

Essential practices for effective capped collection usage:

1. **Size Planning**: Calculate appropriate collection sizes based on data velocity and retention requirements
2. **Document Size**: Keep documents reasonably sized to maximize the number of records within size limits
3. **No Updates**: Design for append-only workloads since capped collections don't support updates that increase document size
4. **Natural Ordering**: Leverage natural insertion ordering for optimal query performance
5. **Index Strategy**: Use minimal indexing to maintain high insert performance
6. **Monitoring**: Implement monitoring to track utilization and performance characteristics

### Use Case Selection

Choose capped collections for appropriate scenarios:

1. **High-Volume Logs**: Application logs, access logs, error logs with automatic rotation
2. **Real-Time Analytics**: Metrics, performance data, sensor readings with fixed retention
3. **Event Streaming**: Message queues, event sourcing, activity streams
4. **Chat and Messaging**: Real-time messaging systems with automatic message history management
5. **Audit Trails**: Compliance logging with predictable storage requirements
6. **Cache-Like Data**: Temporary data storage with automatic eviction policies

## Conclusion

MongoDB capped collections provide specialized solutions for high-volume, streaming data scenarios where traditional database approaches fall short. By implementing fixed-size circular buffers at the database level, capped collections deliver predictable performance, automatic data lifecycle management, and built-in support for real-time streaming applications.

Key capped collection benefits include:

- **Predictable Performance**: Fixed size ensures consistent insert and query performance regardless of data volume
- **Automatic Management**: No manual cleanup or data retention policies required
- **High Throughput**: Optimized for append-only workloads with minimal index overhead
- **Natural Ordering**: Guaranteed insertion order preservation for time-series data
- **Real-Time Streaming**: Built-in tailable cursor support for live data processing

Whether you're building logging systems, real-time analytics platforms, chat applications, or event streaming architectures, MongoDB capped collections with QueryLeaf's familiar SQL interface provide the foundation for high-performance data management. This combination enables you to implement sophisticated streaming data solutions while preserving familiar development patterns and query approaches.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB capped collection creation, sizing, and optimization while providing SQL-familiar CREATE CAPPED COLLECTION syntax and natural ordering support. Complex streaming patterns, real-time analytics, and circular buffer management are seamlessly handled through familiar SQL patterns, making high-performance streaming data both powerful and accessible.

The integration of automatic circular buffer management with SQL-style query patterns makes MongoDB an ideal platform for applications requiring both high-volume data ingestion and familiar database interaction patterns, ensuring your streaming data solutions remain both performant and maintainable as they scale and evolve.