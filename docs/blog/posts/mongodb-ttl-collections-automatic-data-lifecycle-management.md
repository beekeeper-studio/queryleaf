---
title: "MongoDB TTL Collections: Automatic Data Lifecycle Management and Expiration for Efficient Storage"
description: "Master MongoDB TTL (Time To Live) collections for automatic data expiration and lifecycle management. Learn advanced patterns for session management, log cleanup, and storage optimization with SQL-familiar syntax."
date: 2025-11-01
tags: [mongodb, ttl, data-lifecycle, expiration, storage-optimization, cleanup, sql]
---

# MongoDB TTL Collections: Automatic Data Lifecycle Management and Expiration for Efficient Storage

Modern applications generate vast amounts of transient data that needs careful lifecycle management to maintain performance and control storage costs. Traditional approaches to data cleanup involve complex batch jobs, scheduled maintenance scripts, and manual processes that are error-prone and resource-intensive.

MongoDB TTL (Time To Live) collections provide native automatic data expiration capabilities that eliminate the complexity of manual data lifecycle management. Unlike traditional database systems that require custom deletion processes or external job schedulers, MongoDB TTL indexes automatically remove expired documents, ensuring optimal storage utilization and performance without operational overhead.

## The Traditional Data Lifecycle Challenge

Conventional approaches to managing data expiration and cleanup involve significant complexity and operational burden:

```sql
-- Traditional PostgreSQL data cleanup approach - complex and resource-intensive

-- Session cleanup with manual batch processing
CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL,
    session_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Scheduled cleanup job (requires external cron/scheduler)
-- This query must run regularly and can be resource-intensive
DELETE FROM user_sessions 
WHERE expires_at < CURRENT_TIMESTAMP 
   OR (last_accessed < CURRENT_TIMESTAMP - INTERVAL '30 days' AND is_active = false);

-- Complex log cleanup with multiple conditions
CREATE TABLE application_logs (
    log_id BIGSERIAL PRIMARY KEY,
    application_name VARCHAR(100) NOT NULL,
    log_level VARCHAR(20) NOT NULL,
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Manual retention policy implementation
    retention_days INTEGER DEFAULT 30,
    should_archive BOOLEAN DEFAULT false
);

-- Multi-stage cleanup process
WITH logs_to_cleanup AS (
    SELECT log_id, application_name, created_at, retention_days
    FROM application_logs
    WHERE 
        -- Different retention periods by log level
        (log_level = 'DEBUG' AND created_at < CURRENT_TIMESTAMP - INTERVAL '7 days')
        OR (log_level = 'INFO' AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days')
        OR (log_level = 'WARN' AND created_at < CURRENT_TIMESTAMP - INTERVAL '90 days')
        OR (log_level = 'ERROR' AND created_at < CURRENT_TIMESTAMP - INTERVAL '365 days')
        OR (should_archive = false AND created_at < CURRENT_TIMESTAMP - retention_days * INTERVAL '1 day')
),
archival_candidates AS (
    -- Identify logs that should be archived before deletion
    SELECT ltc.log_id, ltc.application_name, ltc.created_at
    FROM logs_to_cleanup ltc
    JOIN application_logs al ON ltc.log_id = al.log_id
    WHERE al.log_level IN ('ERROR', 'CRITICAL') 
       OR al.metadata ? 'trace_id' -- Contains important debugging info
),
archive_process AS (
    -- Archive important logs (complex external process)
    INSERT INTO archived_application_logs 
    SELECT al.* FROM application_logs al
    JOIN archival_candidates ac ON al.log_id = ac.log_id
    RETURNING log_id
)
-- Finally delete the logs
DELETE FROM application_logs
WHERE log_id IN (
    SELECT log_id FROM logs_to_cleanup
    WHERE log_id NOT IN (SELECT log_id FROM archival_candidates)
       OR log_id IN (SELECT log_id FROM archive_process)
);

-- Traditional approach problems:
-- 1. Complex scheduling and orchestration required
-- 2. Resource-intensive batch operations during cleanup
-- 3. Risk of data loss if cleanup jobs fail
-- 4. Manual management of different retention policies
-- 5. No automatic optimization of storage and indexes
-- 6. Difficulty in handling timezone and date calculations
-- 7. Complex error handling and retry logic required
-- 8. Performance impact during large cleanup operations
-- 9. Manual coordination between cleanup and application logic
-- 10. Inconsistent cleanup behavior across different environments

-- Attempting MySQL-style events (limited functionality)
SET GLOBAL event_scheduler = ON;

CREATE EVENT cleanup_expired_sessions
ON SCHEDULE EVERY 1 HOUR
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() 
    LIMIT 1000; -- Prevent long-running operations
END;

-- MySQL event limitations:
-- - Basic scheduling only
-- - No complex retention logic
-- - Limited error handling
-- - Manual management of batch sizes
-- - No integration with application lifecycle
-- - Poor visibility into cleanup operations
```

MongoDB TTL collections provide elegant automatic data expiration:

```javascript
// MongoDB TTL Collections - automatic data lifecycle management
const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('data_lifecycle_management');

// Comprehensive MongoDB TTL Data Lifecycle Manager
class MongoDBTTLManager {
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      defaultTTL: config.defaultTTL || 3600, // 1 hour default
      enableMetrics: config.enableMetrics !== false,
      enableIndexOptimization: config.enableIndexOptimization !== false,
      cleanupLogLevel: config.cleanupLogLevel || 'info',
      ...config
    };
    
    this.collections = {
      userSessions: db.collection('user_sessions'),
      applicationLogs: db.collection('application_logs'),
      temporaryData: db.collection('temporary_data'),
      eventStream: db.collection('event_stream'),
      apiRequests: db.collection('api_requests'),
      cacheEntries: db.collection('cache_entries'),
      ttlMetrics: db.collection('ttl_metrics')
    };
    
    this.ttlIndexes = new Map();
    this.expirationStrategies = new Map();
  }

  async initializeTTLCollections() {
    console.log('Initializing TTL collections and indexes...');
    
    try {
      // User sessions with 24-hour expiration
      await this.setupSessionTTL();
      
      // Application logs with variable retention based on log level
      await this.setupLogsTTL();
      
      // Temporary data with flexible expiration
      await this.setupTemporaryDataTTL();
      
      // Event stream with time-based partitioning
      await this.setupEventStreamTTL();
      
      // API request tracking with automatic cleanup
      await this.setupAPIRequestsTTL();
      
      // Cache entries with intelligent expiration
      await this.setupCacheTTL();
      
      // Metrics collection for monitoring TTL performance
      await this.setupTTLMetrics();
      
      console.log('All TTL collections initialized successfully');
      
    } catch (error) {
      console.error('Error initializing TTL collections:', error);
      throw error;
    }
  }

  async setupSessionTTL() {
    console.log('Setting up user session TTL...');
    
    const sessionCollection = this.collections.userSessions;
    
    // Create TTL index for automatic session expiration
    await sessionCollection.createIndex(
      { expiresAt: 1 },
      { 
        expireAfterSeconds: 0, // Expire based on document field value
        background: true,
        name: 'session_ttl_index'
      }
    );
    
    // Secondary TTL index for inactive sessions
    await sessionCollection.createIndex(
      { lastAccessedAt: 1 },
      { 
        expireAfterSeconds: 7 * 24 * 3600, // 7 days for inactive sessions
        background: true,
        name: 'session_inactivity_ttl_index'
      }
    );
    
    // Compound index for efficient session queries
    await sessionCollection.createIndex(
      { userId: 1, isActive: 1, expiresAt: 1 },
      { background: true }
    );
    
    this.ttlIndexes.set('userSessions', [
      { field: 'expiresAt', expireAfterSeconds: 0 },
      { field: 'lastAccessedAt', expireAfterSeconds: 7 * 24 * 3600 }
    ]);
    
    console.log('User session TTL configured');
  }

  async createUserSession(userId, sessionData, customTTL = null) {
    const expirationTime = new Date(Date.now() + ((customTTL || 24 * 3600) * 1000));
    
    const sessionDocument = {
      sessionId: new ObjectId(),
      userId: userId,
      sessionData: sessionData,
      createdAt: new Date(),
      expiresAt: expirationTime, // TTL field for automatic expiration
      lastAccessedAt: new Date(),
      isActive: true,
      
      // Session metadata
      userAgent: sessionData.userAgent,
      ipAddress: sessionData.ipAddress,
      deviceType: sessionData.deviceType,
      
      // Expiration strategy metadata
      ttlStrategy: 'fixed_expiration',
      customTTL: customTTL,
      renewalCount: 0
    };
    
    const result = await this.collections.userSessions.insertOne(sessionDocument);
    
    console.log(`Created session ${result.insertedId} for user ${userId}, expires at ${expirationTime}`);
    return result.insertedId;
  }

  async renewUserSession(sessionId, additionalTTL = 3600) {
    const newExpirationTime = new Date(Date.now() + (additionalTTL * 1000));
    
    const result = await this.collections.userSessions.updateOne(
      { sessionId: new ObjectId(sessionId), isActive: true },
      {
        $set: {
          expiresAt: newExpirationTime,
          lastAccessedAt: new Date()
        },
        $inc: { renewalCount: 1 }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`Renewed session ${sessionId} until ${newExpirationTime}`);
    }
    
    return result.modifiedCount > 0;
  }

  async setupLogsTTL() {
    console.log('Setting up application logs TTL with level-based retention...');
    
    const logsCollection = this.collections.applicationLogs;
    
    // Create partial TTL indexes for different log levels
    // Debug logs expire quickly
    await logsCollection.createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: 7 * 24 * 3600, // 7 days
        partialFilterExpression: { logLevel: 'DEBUG' },
        background: true,
        name: 'debug_logs_ttl'
      }
    );
    
    // Info logs have moderate retention
    await logsCollection.createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: 30 * 24 * 3600, // 30 days
        partialFilterExpression: { logLevel: 'INFO' },
        background: true,
        name: 'info_logs_ttl'
      }
    );
    
    // Warning logs kept longer
    await logsCollection.createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: 90 * 24 * 3600, // 90 days
        partialFilterExpression: { logLevel: 'WARN' },
        background: true,
        name: 'warn_logs_ttl'
      }
    );
    
    // Error logs kept for a full year
    await logsCollection.createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: 365 * 24 * 3600, // 365 days
        partialFilterExpression: { logLevel: { $in: ['ERROR', 'CRITICAL'] } },
        background: true,
        name: 'error_logs_ttl'
      }
    );
    
    // Compound index for efficient log queries
    await logsCollection.createIndex(
      { applicationName: 1, logLevel: 1, createdAt: -1 },
      { background: true }
    );
    
    this.expirationStrategies.set('applicationLogs', {
      DEBUG: 7 * 24 * 3600,
      INFO: 30 * 24 * 3600,
      WARN: 90 * 24 * 3600,
      ERROR: 365 * 24 * 3600,
      CRITICAL: 365 * 24 * 3600
    });
    
    console.log('Application logs TTL configured with level-based retention');
  }

  async createLogEntry(applicationName, logLevel, message, metadata = {}) {
    const logDocument = {
      logId: new ObjectId(),
      applicationName: applicationName,
      logLevel: logLevel.toUpperCase(),
      message: message,
      metadata: metadata,
      createdAt: new Date(), // TTL field used by level-specific indexes
      
      // Additional context
      hostname: metadata.hostname || 'unknown',
      processId: metadata.processId,
      threadId: metadata.threadId,
      traceId: metadata.traceId,
      
      // Automatic expiration via TTL indexes
      // No manual expiration field needed - handled by partial TTL indexes
    };
    
    const result = await this.collections.applicationLogs.insertOne(logDocument);
    
    // Log retention info based on level
    const retentionDays = this.expirationStrategies.get('applicationLogs')[logLevel.toUpperCase()];
    const expirationDate = new Date(Date.now() + (retentionDays * 1000));
    
    if (this.config.cleanupLogLevel === 'debug') {
      console.log(`Created ${logLevel} log entry ${result.insertedId}, will expire around ${expirationDate}`);
    }
    
    return result.insertedId;
  }

  async setupTemporaryDataTTL() {
    console.log('Setting up temporary data TTL with flexible expiration...');
    
    const tempCollection = this.collections.temporaryData;
    
    // Primary TTL index using document field
    await tempCollection.createIndex(
      { expiresAt: 1 },
      {
        expireAfterSeconds: 0, // Use document field value
        background: true,
        name: 'temp_data_ttl'
      }
    );
    
    // Backup TTL index with default expiration
    await tempCollection.createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: 24 * 3600, // 24 hours default
        partialFilterExpression: { expiresAt: { $exists: false } },
        background: true,
        name: 'temp_data_default_ttl'
      }
    );
    
    // Index for data type queries
    await tempCollection.createIndex(
      { dataType: 1, createdAt: -1 },
      { background: true }
    );
    
    console.log('Temporary data TTL configured');
  }

  async storeTemporaryData(dataType, data, ttlSeconds = 3600) {
    const expirationTime = new Date(Date.now() + (ttlSeconds * 1000));
    
    const tempDocument = {
      tempId: new ObjectId(),
      dataType: dataType,
      data: data,
      createdAt: new Date(),
      expiresAt: expirationTime, // TTL field
      
      // Metadata
      sizeBytes: JSON.stringify(data).length,
      compressionType: data.compressionType || 'none',
      accessCount: 0,
      
      // TTL configuration
      ttlSeconds: ttlSeconds,
      autoExpire: true
    };
    
    const result = await this.collections.temporaryData.insertOne(tempDocument);
    
    console.log(`Stored temporary ${dataType} data ${result.insertedId}, expires at ${expirationTime}`);
    return result.insertedId;
  }

  async setupEventStreamTTL() {
    console.log('Setting up event stream TTL with sliding window retention...');
    
    const eventCollection = this.collections.eventStream;
    
    // TTL index for event stream with 30-day retention
    await eventCollection.createIndex(
      { timestamp: 1 },
      {
        expireAfterSeconds: 30 * 24 * 3600, // 30 days
        background: true,
        name: 'event_stream_ttl'
      }
    );
    
    // Compound index for event queries
    await eventCollection.createIndex(
      { eventType: 1, timestamp: -1 },
      { background: true }
    );
    
    // Index for user-specific events
    await eventCollection.createIndex(
      { userId: 1, timestamp: -1 },
      { background: true }
    );
    
    console.log('Event stream TTL configured');
  }

  async createEvent(eventType, userId, eventData) {
    const eventDocument = {
      eventId: new ObjectId(),
      eventType: eventType,
      userId: userId,
      eventData: eventData,
      timestamp: new Date(), // TTL field
      
      // Event metadata
      source: eventData.source || 'application',
      sessionId: eventData.sessionId,
      correlationId: eventData.correlationId,
      
      // Automatic expiration after 30 days via TTL index
    };
    
    const result = await this.collections.eventStream.insertOne(eventDocument);
    return result.insertedId;
  }

  async setupAPIRequestsTTL() {
    console.log('Setting up API requests TTL for monitoring and analytics...');
    
    const apiCollection = this.collections.apiRequests;
    
    // TTL index with 7-day retention for API requests
    await apiCollection.createIndex(
      { requestTime: 1 },
      {
        expireAfterSeconds: 7 * 24 * 3600, // 7 days
        background: true,
        name: 'api_requests_ttl'
      }
    );
    
    // Compound indexes for API analytics
    await apiCollection.createIndex(
      { endpoint: 1, requestTime: -1 },
      { background: true }
    );
    
    await apiCollection.createIndex(
      { statusCode: 1, requestTime: -1 },
      { background: true }
    );
    
    console.log('API requests TTL configured');
  }

  async logAPIRequest(endpoint, method, statusCode, responseTime, metadata = {}) {
    const requestDocument = {
      requestId: new ObjectId(),
      endpoint: endpoint,
      method: method.toUpperCase(),
      statusCode: statusCode,
      responseTime: responseTime,
      requestTime: new Date(), // TTL field
      
      // Request details
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      userId: metadata.userId,
      sessionId: metadata.sessionId,
      
      // Performance metrics
      requestSize: metadata.requestSize || 0,
      responseSize: metadata.responseSize || 0,
      
      // Automatic expiration after 7 days
    };
    
    const result = await this.collections.apiRequests.insertOne(requestDocument);
    return result.insertedId;
  }

  async setupCacheTTL() {
    console.log('Setting up cache entries TTL with intelligent expiration...');
    
    const cacheCollection = this.collections.cacheEntries;
    
    // Primary TTL index using document field for custom expiration
    await cacheCollection.createIndex(
      { expiresAt: 1 },
      {
        expireAfterSeconds: 0, // Use document field
        background: true,
        name: 'cache_ttl'
      }
    );
    
    // Backup TTL for entries without explicit expiration
    await cacheCollection.createIndex(
      { lastAccessedAt: 1 },
      {
        expireAfterSeconds: 3600, // 1 hour default
        background: true,
        name: 'cache_access_ttl'
      }
    );
    
    // Index for cache key lookups
    await cacheCollection.createIndex(
      { cacheKey: 1 },
      { unique: true, background: true }
    );
    
    console.log('Cache TTL configured');
  }

  async setCacheEntry(cacheKey, value, ttlSeconds = 300) {
    const expirationTime = new Date(Date.now() + (ttlSeconds * 1000));
    
    const cacheDocument = {
      cacheKey: cacheKey,
      value: value,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      expiresAt: expirationTime, // TTL field
      
      // Cache metadata
      accessCount: 0,
      ttlSeconds: ttlSeconds,
      valueType: typeof value,
      sizeBytes: JSON.stringify(value).length,
      
      // Hit ratio tracking
      hitCount: 0,
      missCount: 0
    };
    
    const result = await cacheCollection.updateOne(
      { cacheKey: cacheKey },
      {
        $set: cacheDocument,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    
    return result.upsertedId || result.modifiedCount > 0;
  }

  async getCacheEntry(cacheKey) {
    const result = await this.collections.cacheEntries.findOneAndUpdate(
      { cacheKey: cacheKey },
      {
        $set: { lastAccessedAt: new Date() },
        $inc: { accessCount: 1, hitCount: 1 }
      },
      { returnDocument: 'after' }
    );
    
    return result.value?.value || null;
  }

  async setupTTLMetrics() {
    console.log('Setting up TTL metrics collection...');
    
    const metricsCollection = this.collections.ttlMetrics;
    
    // TTL index for metrics with 90-day retention
    await metricsCollection.createIndex(
      { timestamp: 1 },
      {
        expireAfterSeconds: 90 * 24 * 3600, // 90 days
        background: true,
        name: 'metrics_ttl'
      }
    );
    
    // Index for metrics queries
    await metricsCollection.createIndex(
      { collectionName: 1, timestamp: -1 },
      { background: true }
    );
    
    console.log('TTL metrics collection configured');
  }

  async collectTTLMetrics() {
    console.log('Collecting TTL performance metrics...');
    
    try {
      const metrics = {
        timestamp: new Date(),
        collections: {}
      };
      
      // Collect metrics for each TTL collection
      for (const [collectionName, collection] of Object.entries(this.collections)) {
        if (collectionName === 'ttlMetrics') continue;
        
        const collectionStats = await collection.stats();
        const indexStats = await this.getTTLIndexStats(collection);
        
        metrics.collections[collectionName] = {
          documentCount: collectionStats.count,
          storageSize: collectionStats.storageSize,
          avgObjSize: collectionStats.avgObjSize,
          totalIndexSize: collectionStats.totalIndexSize,
          ttlIndexes: indexStats,
          
          // Calculate expiration rates
          estimatedExpirationRate: await this.estimateExpirationRate(collection)
        };
      }
      
      // Store metrics
      await this.collections.ttlMetrics.insertOne(metrics);
      
      if (this.config.enableMetrics) {
        console.log('TTL Metrics:', {
          totalCollections: Object.keys(metrics.collections).length,
          totalDocuments: Object.values(metrics.collections).reduce((sum, c) => sum + c.documentCount, 0),
          totalStorageSize: Object.values(metrics.collections).reduce((sum, c) => sum + c.storageSize, 0)
        });
      }
      
      return metrics;
      
    } catch (error) {
      console.error('Error collecting TTL metrics:', error);
      throw error;
    }
  }

  async getTTLIndexStats(collection) {
    const indexes = await collection.listIndexes().toArray();
    const ttlIndexes = indexes.filter(index => 
      index.expireAfterSeconds !== undefined || index.expireAfterSeconds === 0
    );
    
    return ttlIndexes.map(index => ({
      name: index.name,
      key: index.key,
      expireAfterSeconds: index.expireAfterSeconds,
      partialFilterExpression: index.partialFilterExpression
    }));
  }

  async estimateExpirationRate(collection) {
    // Simple estimation based on documents created vs documents existing
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    const recentDocuments = await collection.countDocuments({
      createdAt: { $gte: oneDayAgo }
    });
    
    const totalDocuments = await collection.countDocuments();
    
    return recentDocuments > 0 ? (recentDocuments / totalDocuments) : 0;
  }

  async optimizeTTLIndexes() {
    console.log('Optimizing TTL indexes for better performance...');
    
    try {
      for (const [collectionName, collection] of Object.entries(this.collections)) {
        if (collectionName === 'ttlMetrics') continue;
        
        // Analyze index usage
        const indexStats = await collection.aggregate([
          { $indexStats: {} }
        ]).toArray();
        
        // Identify underutilized TTL indexes
        for (const indexStat of indexStats) {
          if (indexStat.key && indexStat.key.expiresAt) {
            const usage = indexStat.accesses;
            console.log(`TTL index ${indexStat.name} usage:`, usage);
            
            // Suggest optimizations based on usage patterns
            if (usage.ops < 100 && usage.since) {
              console.log(`Consider reviewing TTL index ${indexStat.name} - low usage detected`);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Error optimizing TTL indexes:', error);
    }
  }

  async getTTLStatus() {
    const status = {
      collectionsWithTTL: 0,
      totalTTLIndexes: 0,
      activeExpirations: {},
      systemHealth: 'healthy'
    };
    
    for (const [collectionName, collection] of Object.entries(this.collections)) {
      if (collectionName === 'ttlMetrics') continue;
      
      const indexes = await collection.listIndexes().toArray();
      const ttlIndexes = indexes.filter(index => 
        index.expireAfterSeconds !== undefined || index.expireAfterSeconds === 0
      );
      
      if (ttlIndexes.length > 0) {
        status.collectionsWithTTL++;
        status.totalTTLIndexes += ttlIndexes.length;
        
        // Estimate documents that will expire soon
        const soonToExpire = await this.estimateSoonToExpire(collection, ttlIndexes);
        status.activeExpirations[collectionName] = soonToExpire;
      }
    }
    
    return status;
  }

  async estimateSoonToExpire(collection, ttlIndexes) {
    let totalSoonToExpire = 0;
    
    for (const index of ttlIndexes) {
      if (index.expireAfterSeconds === 0) {
        // Documents expire based on field value
        const fieldName = Object.keys(index.key)[0];
        const nextHour = new Date(Date.now() + (60 * 60 * 1000));
        
        const count = await collection.countDocuments({
          [fieldName]: { $lt: nextHour }
        });
        
        totalSoonToExpire += count;
      } else {
        // Documents expire based on index TTL
        const fieldName = Object.keys(index.key)[0];
        const cutoffTime = new Date(Date.now() - (index.expireAfterSeconds * 1000) + (60 * 60 * 1000));
        
        const count = await collection.countDocuments({
          [fieldName]: { $lt: cutoffTime }
        });
        
        totalSoonToExpire += count;
      }
    }
    
    return totalSoonToExpire;
  }

  async shutdown() {
    console.log('Shutting down TTL Manager...');
    
    // Final metrics collection
    if (this.config.enableMetrics) {
      await this.collectTTLMetrics();
    }
    
    // Display final status
    const status = await this.getTTLStatus();
    console.log('Final TTL Status:', status);
    
    console.log('TTL Manager shutdown complete');
  }
}

// Benefits of MongoDB TTL Collections:
// - Automatic data expiration without manual intervention
// - Multiple TTL strategies (fixed time, document field, partial indexes)
// - Built-in optimization and storage reclamation
// - Integration with MongoDB's index and query optimization
// - Flexible retention policies based on data characteristics
// - No external job scheduling required
// - Consistent behavior across replica sets and sharded clusters
// - Real-time metrics and monitoring capabilities
// - SQL-compatible TTL operations through QueryLeaf integration

module.exports = {
  MongoDBTTLManager
};
```

## Understanding MongoDB TTL Architecture

### Advanced TTL Patterns and Configuration Strategies

Implement sophisticated TTL patterns for different data lifecycle requirements:

```javascript
// Advanced TTL patterns for production MongoDB deployments
class AdvancedTTLStrategies extends MongoDBTTLManager {
  constructor(db, advancedConfig) {
    super(db, advancedConfig);
    
    this.advancedConfig = {
      ...advancedConfig,
      enableTimezoneSupport: true,
      enableConditionalExpiration: true,
      enableGradualExpiration: true,
      enableExpirationNotifications: true,
      enableComplianceMode: true
    };
  }

  async setupConditionalTTL() {
    // TTL that expires documents based on multiple conditions
    console.log('Setting up conditional TTL with complex business logic...');
    
    const conditionalTTLCollection = this.db.collection('conditional_expiration');
    
    // Different TTL for different user tiers
    await conditionalTTLCollection.createIndex(
      { lastActivityAt: 1 },
      {
        expireAfterSeconds: 30 * 24 * 3600, // 30 days for free tier
        partialFilterExpression: { 
          userTier: 'free',
          isPremium: false 
        },
        background: true,
        name: 'free_user_data_ttl'
      }
    );
    
    await conditionalTTLCollection.createIndex(
      { lastActivityAt: 1 },
      {
        expireAfterSeconds: 365 * 24 * 3600, // 1 year for premium users
        partialFilterExpression: { 
          userTier: 'premium',
          isPremium: true 
        },
        background: true,
        name: 'premium_user_data_ttl'
      }
    );
    
    // Business-critical data never expires automatically
    await conditionalTTLCollection.createIndex(
      { reviewDate: 1 },
      {
        expireAfterSeconds: 7 * 365 * 24 * 3600, // 7 years for compliance
        partialFilterExpression: { 
          dataClassification: 'business_critical',
          complianceRetentionRequired: true
        },
        background: true,
        name: 'compliance_data_ttl'
      }
    );
  }

  async setupGradualExpiration() {
    // Implement gradual expiration to reduce system load
    console.log('Setting up gradual expiration strategy...');
    
    const gradualCollection = this.db.collection('gradual_expiration');
    
    // Stagger expiration across time buckets
    const timeBuckets = [
      { hour: 2, expireSeconds: 7 * 24 * 3600 },   // 2 AM
      { hour: 14, expireSeconds: 14 * 24 * 3600 }, // 2 PM
      { hour: 20, expireSeconds: 21 * 24 * 3600 }  // 8 PM
    ];
    
    for (const bucket of timeBuckets) {
      await gradualCollection.createIndex(
        { createdAt: 1 },
        {
          expireAfterSeconds: bucket.expireSeconds,
          partialFilterExpression: {
            expirationBucket: bucket.hour
          },
          background: true,
          name: `gradual_ttl_${bucket.hour}h`
        }
      );
    }
  }

  async createDocumentWithGradualExpiration(data) {
    // Assign expiration bucket based on hash of document ID
    const buckets = [2, 14, 20];
    const bucketIndex = Math.abs(data.hashCode || Math.random()) % buckets.length;
    const selectedBucket = buckets[bucketIndex];
    
    const document = {
      ...data,
      createdAt: new Date(),
      expirationBucket: selectedBucket,
      
      // Add jitter to prevent thundering herd
      expirationJitter: Math.floor(Math.random() * 3600) // 0-1 hour jitter
    };
    
    return await this.db.collection('gradual_expiration').insertOne(document);
  }

  async setupTimezoneTTL() {
    // TTL that respects business hours and timezones
    console.log('Setting up timezone-aware TTL...');
    
    const timezoneCollection = this.db.collection('timezone_expiration');
    
    // Create TTL based on business date rather than UTC
    await timezoneCollection.createIndex(
      { businessDateExpiry: 1 },
      {
        expireAfterSeconds: 0, // Use document field
        background: true,
        name: 'business_timezone_ttl'
      }
    );
  }

  async createBusinessHoursTTLDocument(data, businessTimezone = 'America/New_York', retentionDays = 30) {
    const moment = require('moment-timezone');
    
    // Calculate expiration at end of business day in specified timezone
    const businessExpiry = moment()
      .tz(businessTimezone)
      .add(retentionDays, 'days')
      .endOf('day') // Expire at end of business day
      .toDate();
    
    const document = {
      ...data,
      createdAt: new Date(),
      businessDateExpiry: businessExpiry,
      timezone: businessTimezone,
      retentionPolicy: 'business_hours_aligned'
    };
    
    return await timezoneCollection.insertOne(document);
  }

  async setupComplianceTTL() {
    // TTL with compliance and audit requirements
    console.log('Setting up compliance-aware TTL...');
    
    const complianceCollection = this.db.collection('compliance_data');
    
    // Legal hold prevents automatic expiration
    await complianceCollection.createIndex(
      { scheduledDestructionDate: 1 },
      {
        expireAfterSeconds: 0,
        partialFilterExpression: {
          legalHold: false,
          complianceStatus: 'approved_for_destruction'
        },
        background: true,
        name: 'compliance_ttl'
      }
    );
    
    // Audit trail for expired documents
    await complianceCollection.createIndex(
      { auditExpirationDate: 1 },
      {
        expireAfterSeconds: 10 * 365 * 24 * 3600, // 10 years for audit trail
        background: true,
        name: 'audit_trail_ttl'
      }
    );
  }

  async createComplianceDocument(data, retentionYears = 7) {
    const scheduledDestruction = new Date();
    scheduledDestruction.setFullYear(scheduledDestruction.getFullYear() + retentionYears);
    
    const document = {
      ...data,
      createdAt: new Date(),
      retentionPeriodYears: retentionYears,
      scheduledDestructionDate: scheduledDestruction,
      
      // Compliance metadata
      legalHold: false,
      complianceStatus: 'under_retention',
      dataClassification: data.dataClassification || 'standard',
      
      // Audit requirements
      auditExpirationDate: new Date(scheduledDestruction.getTime() + (3 * 365 * 24 * 60 * 60 * 1000)) // +3 years
    };
    
    return await this.db.collection('compliance_data').insertOne(document);
  }

  async implementExpirationNotifications() {
    // Set up change streams to monitor expiring documents
    console.log('Setting up expiration notifications...');
    
    const expirationNotifier = this.db.collection('expiration_notifications');
    
    // Monitor documents that will expire soon
    setInterval(async () => {
      await this.checkUpcomingExpirations();
    }, 60 * 60 * 1000); // Check every hour
  }

  async checkUpcomingExpirations() {
    const collections = [
      'user_sessions', 
      'application_logs', 
      'temporary_data',
      'compliance_data'
    ];
    
    for (const collectionName of collections) {
      const collection = this.db.collection(collectionName);
      
      // Find documents expiring in the next 24 hours
      const tomorrow = new Date(Date.now() + (24 * 60 * 60 * 1000));
      
      const soonToExpire = await collection.find({
        $or: [
          { expiresAt: { $lt: tomorrow, $gte: new Date() } },
          { businessDateExpiry: { $lt: tomorrow, $gte: new Date() } },
          { scheduledDestructionDate: { $lt: tomorrow, $gte: new Date() } }
        ]
      }).toArray();
      
      if (soonToExpire.length > 0) {
        console.log(`${collectionName}: ${soonToExpire.length} documents expiring within 24 hours`);
        
        // Send notifications or trigger workflows
        await this.sendExpirationNotifications(collectionName, soonToExpire);
      }
    }
  }

  async sendExpirationNotifications(collectionName, documents) {
    // Implementation would integrate with notification systems
    const notification = {
      timestamp: new Date(),
      collection: collectionName,
      documentsCount: documents.length,
      urgency: 'medium',
      action: 'documents_expiring_soon'
    };
    
    console.log('Expiration notification:', notification);
    
    // Store notification for processing
    await this.db.collection('expiration_notifications').insertOne(notification);
  }
}
```

## SQL-Style TTL Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB TTL operations:

```sql
-- QueryLeaf TTL operations with SQL-familiar syntax

-- Create TTL-enabled collections with automatic expiration
CREATE TABLE user_sessions (
  session_id UUID PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  session_data DOCUMENT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
)
WITH TTL (
  -- Multiple TTL strategies
  expires_at EXPIRE_AFTER 0,  -- Use document field value
  last_accessed_at EXPIRE_AFTER '7 days' -- Inactive session cleanup
);

-- Create application logs with level-based retention
CREATE TABLE application_logs (
  log_id UUID PRIMARY KEY,
  application_name VARCHAR(100) NOT NULL,
  log_level VARCHAR(20) NOT NULL,
  message TEXT,
  metadata DOCUMENT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
WITH TTL (
  -- Different retention by log level using partial indexes
  created_at EXPIRE_AFTER '7 days' WHERE log_level = 'DEBUG',
  created_at EXPIRE_AFTER '30 days' WHERE log_level = 'INFO',
  created_at EXPIRE_AFTER '90 days' WHERE log_level = 'WARN',
  created_at EXPIRE_AFTER '365 days' WHERE log_level IN ('ERROR', 'CRITICAL')
);

-- Temporary data with flexible TTL
CREATE TABLE temporary_data (
  temp_id UUID PRIMARY KEY,
  data_type VARCHAR(100),
  data DOCUMENT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  ttl_seconds INTEGER DEFAULT 3600
)
WITH TTL (
  expires_at EXPIRE_AFTER 0,  -- Use document field
  created_at EXPIRE_AFTER '24 hours' WHERE expires_at IS NULL  -- Default fallback
);

-- Insert session with custom TTL
INSERT INTO user_sessions (user_id, session_data, expires_at, is_active)
VALUES 
  ('user123', '{"preferences": {"theme": "dark"}}', CURRENT_TIMESTAMP + INTERVAL '2 hours', true),
  ('user456', '{"preferences": {"lang": "en"}}', CURRENT_TIMESTAMP + INTERVAL '1 day', true);

-- Insert log entries (automatic TTL based on level)
INSERT INTO application_logs (application_name, log_level, message, metadata)
VALUES 
  ('web-server', 'DEBUG', 'Request processed', '{"endpoint": "/api/users", "duration": 45}'),
  ('web-server', 'ERROR', 'Database connection failed', '{"error": "timeout", "retry_count": 3}'),
  ('payment-service', 'INFO', 'Payment processed', '{"amount": 99.99, "currency": "USD"}');

-- Query active sessions with TTL information
SELECT 
  session_id,
  user_id,
  created_at,
  expires_at,
  
  -- Calculate remaining TTL
  EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP)) as seconds_until_expiry,
  
  -- Expiration status
  CASE 
    WHEN expires_at <= CURRENT_TIMESTAMP THEN 'expired'
    WHEN expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 hour' THEN 'expiring_soon'
    ELSE 'active'
  END as expiration_status,
  
  -- Session age
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) as session_age_seconds

FROM user_sessions
WHERE is_active = true
ORDER BY expires_at ASC;

-- Extend session TTL (renew expiration)
UPDATE user_sessions 
SET 
  expires_at = CURRENT_TIMESTAMP + INTERVAL '2 hours',
  last_accessed_at = CURRENT_TIMESTAMP
WHERE session_id = 'session-uuid-here'
  AND is_active = true
  AND expires_at > CURRENT_TIMESTAMP;

-- Store temporary data with custom expiration
INSERT INTO temporary_data (data_type, data, expires_at, ttl_seconds)
VALUES 
  ('cache_entry', '{"result": [1,2,3], "computed_at": "2025-11-01T10:00:00Z"}', CURRENT_TIMESTAMP + INTERVAL '5 minutes', 300),
  ('user_upload', '{"filename": "document.pdf", "size": 1024000}', CURRENT_TIMESTAMP + INTERVAL '24 hours', 86400),
  ('temp_report', '{"report_data": {...}, "generated_for": "user123"}', CURRENT_TIMESTAMP + INTERVAL '1 hour', 3600);

-- Advanced TTL queries with business logic
WITH session_analytics AS (
  SELECT 
    user_id,
    COUNT(*) as total_sessions,
    AVG(EXTRACT(EPOCH FROM (expires_at - created_at))) as avg_session_duration,
    MAX(last_accessed_at) as last_activity,
    
    -- TTL health metrics
    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP) as expired_sessions,
    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 hour') as soon_to_expire,
    COUNT(*) FILTER (WHERE last_accessed_at < CURRENT_TIMESTAMP - INTERVAL '1 day') as inactive_sessions
    
  FROM user_sessions
  WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
  GROUP BY user_id
),
user_engagement AS (
  SELECT 
    sa.*,
    
    -- Engagement scoring
    CASE 
      WHEN avg_session_duration > 7200 AND inactive_sessions = 0 THEN 'highly_engaged'
      WHEN avg_session_duration > 1800 AND inactive_sessions < 2 THEN 'engaged'
      WHEN inactive_sessions > total_sessions * 0.5 THEN 'low_engagement'
      ELSE 'moderate_engagement'
    END as engagement_level,
    
    -- TTL optimization recommendations
    CASE 
      WHEN inactive_sessions > 5 THEN 'reduce_session_ttl'
      WHEN expired_sessions = 0 AND soon_to_expire = 0 THEN 'extend_session_ttl'
      ELSE 'current_ttl_optimal'
    END as ttl_recommendation
    
  FROM session_analytics sa
)
SELECT 
  user_id,
  total_sessions,
  ROUND(avg_session_duration / 60, 2) as avg_session_minutes,
  last_activity,
  engagement_level,
  ttl_recommendation,
  
  -- Session health indicators
  ROUND((total_sessions - expired_sessions)::numeric / total_sessions * 100, 1) as session_health_pct,
  
  -- TTL efficiency metrics
  expired_sessions,
  soon_to_expire,
  inactive_sessions

FROM user_engagement
WHERE total_sessions > 0
ORDER BY 
  CASE engagement_level 
    WHEN 'highly_engaged' THEN 1
    WHEN 'engaged' THEN 2
    WHEN 'moderate_engagement' THEN 3
    ELSE 4
  END,
  total_sessions DESC;

-- Log retention analysis with TTL monitoring
WITH log_retention_analysis AS (
  SELECT 
    application_name,
    log_level,
    DATE_TRUNC('day', created_at) as log_date,
    COUNT(*) as daily_log_count,
    AVG(LENGTH(message)) as avg_message_length,
    
    -- TTL calculation based on level-specific retention
    CASE log_level
      WHEN 'DEBUG' THEN created_at + INTERVAL '7 days'
      WHEN 'INFO' THEN created_at + INTERVAL '30 days'
      WHEN 'WARN' THEN created_at + INTERVAL '90 days'
      WHEN 'ERROR' THEN created_at + INTERVAL '365 days'
      WHEN 'CRITICAL' THEN created_at + INTERVAL '365 days'
      ELSE created_at + INTERVAL '30 days'
    END as estimated_expiry,
    
    -- Storage impact analysis
    SUM(LENGTH(message) + COALESCE(LENGTH(metadata::TEXT), 0)) as daily_storage_bytes
    
  FROM application_logs
  WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  GROUP BY application_name, log_level, DATE_TRUNC('day', created_at)
),
storage_projections AS (
  SELECT 
    application_name,
    log_level,
    
    -- Current metrics
    SUM(daily_log_count) as total_logs,
    AVG(daily_log_count) as avg_daily_logs,
    SUM(daily_storage_bytes) as total_storage_bytes,
    AVG(daily_storage_bytes) as avg_daily_storage,
    
    -- TTL impact
    MIN(estimated_expiry) as earliest_expiry,
    MAX(estimated_expiry) as latest_expiry,
    
    -- Storage efficiency
    CASE log_level
      WHEN 'DEBUG' THEN SUM(daily_storage_bytes) * 7 / 30 -- 7-day retention
      WHEN 'INFO' THEN SUM(daily_storage_bytes) -- 30-day retention
      WHEN 'WARN' THEN SUM(daily_storage_bytes) * 3 -- 90-day retention
      ELSE SUM(daily_storage_bytes) * 12 -- 365-day retention
    END as projected_steady_state_storage
    
  FROM log_retention_analysis
  GROUP BY application_name, log_level
)
SELECT 
  application_name,
  log_level,
  total_logs,
  avg_daily_logs,
  
  -- Storage analysis
  ROUND(total_storage_bytes / 1024.0 / 1024.0, 2) as storage_mb,
  ROUND(avg_daily_storage / 1024.0 / 1024.0, 2) as avg_daily_mb,
  ROUND(projected_steady_state_storage / 1024.0 / 1024.0, 2) as steady_state_mb,
  
  -- TTL effectiveness
  earliest_expiry,
  latest_expiry,
  EXTRACT(DAYS FROM (latest_expiry - earliest_expiry)) as retention_range_days,
  
  -- Storage optimization
  ROUND((total_storage_bytes - projected_steady_state_storage) / 1024.0 / 1024.0, 2) as storage_savings_mb,
  ROUND(((total_storage_bytes - projected_steady_state_storage) / total_storage_bytes * 100), 1) as storage_reduction_pct,
  
  -- Recommendations
  CASE 
    WHEN log_level = 'DEBUG' AND avg_daily_logs > 10000 THEN 'Consider shorter DEBUG retention or sampling'
    WHEN projected_steady_state_storage > total_storage_bytes * 2 THEN 'TTL may be too long for this log volume'
    WHEN projected_steady_state_storage < total_storage_bytes * 0.1 THEN 'TTL may be too aggressive'
    ELSE 'TTL appears well-configured'
  END as ttl_recommendation

FROM storage_projections
WHERE total_logs > 0
ORDER BY application_name, 
  CASE log_level 
    WHEN 'CRITICAL' THEN 1
    WHEN 'ERROR' THEN 2
    WHEN 'WARN' THEN 3
    WHEN 'INFO' THEN 4
    WHEN 'DEBUG' THEN 5
  END;

-- TTL index health monitoring
WITH ttl_index_health AS (
  SELECT 
    'user_sessions' as collection_name,
    'session_ttl' as index_name,
    'expires_at' as ttl_field,
    0 as expire_after_seconds,
    
    -- Health metrics
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP) as expired_documents,
    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 hour') as expiring_soon,
    
    -- Performance metrics
    AVG(EXTRACT(EPOCH FROM (expires_at - created_at))) as avg_document_lifetime,
    MIN(expires_at) as earliest_expiry,
    MAX(expires_at) as latest_expiry
    
  FROM user_sessions
  
  UNION ALL
  
  SELECT 
    'application_logs' as collection_name,
    'logs_level_ttl' as index_name,
    'created_at' as ttl_field,
    CASE log_level
      WHEN 'DEBUG' THEN 7 * 24 * 3600
      WHEN 'INFO' THEN 30 * 24 * 3600
      WHEN 'WARN' THEN 90 * 24 * 3600
      ELSE 365 * 24 * 3600
    END as expire_after_seconds,
    
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE 
      created_at <= CURRENT_TIMESTAMP - 
      CASE log_level
        WHEN 'DEBUG' THEN INTERVAL '7 days'
        WHEN 'INFO' THEN INTERVAL '30 days'
        WHEN 'WARN' THEN INTERVAL '90 days'
        ELSE INTERVAL '365 days'
      END
    ) as expired_documents,
    COUNT(*) FILTER (WHERE 
      created_at <= CURRENT_TIMESTAMP + INTERVAL '1 day' - 
      CASE log_level
        WHEN 'DEBUG' THEN INTERVAL '7 days'
        WHEN 'INFO' THEN INTERVAL '30 days'
        WHEN 'WARN' THEN INTERVAL '90 days'
        ELSE INTERVAL '365 days'
      END
    ) as expiring_soon,
    
    AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))) as avg_document_lifetime,
    MIN(created_at) as earliest_expiry,
    MAX(created_at) as latest_expiry
    
  FROM application_logs
  GROUP BY log_level
)
SELECT 
  collection_name,
  index_name,
  ttl_field,
  expire_after_seconds,
  total_documents,
  expired_documents,
  expiring_soon,
  
  -- TTL efficiency metrics
  ROUND(avg_document_lifetime / 3600, 2) as avg_lifetime_hours,
  CASE 
    WHEN total_documents > 0 
    THEN ROUND((expired_documents::numeric / total_documents) * 100, 2)
    ELSE 0
  END as expiration_rate_pct,
  
  -- TTL health indicators
  CASE 
    WHEN expired_documents > total_documents * 0.9 THEN 'unhealthy_high_expiration'
    WHEN expired_documents = 0 AND total_documents > 1000 THEN 'no_expiration_detected'
    WHEN expiring_soon > total_documents * 0.5 THEN 'high_upcoming_expiration'
    ELSE 'healthy'
  END as ttl_health_status,
  
  -- Performance impact assessment
  CASE 
    WHEN expired_documents > 10000 THEN 'high_cleanup_load'
    WHEN expiring_soon > 5000 THEN 'moderate_cleanup_load'
    ELSE 'low_cleanup_load'
  END as cleanup_load_assessment

FROM ttl_index_health
ORDER BY collection_name, expire_after_seconds;

-- TTL collection management commands
-- Monitor TTL operations
SHOW TTL STATUS;

-- Optimize TTL indexes
OPTIMIZE TTL INDEXES;

-- Modify TTL expiration times
ALTER TABLE user_sessions 
MODIFY TTL expires_at EXPIRE_AFTER 0,
MODIFY TTL last_accessed_at EXPIRE_AFTER '14 days';

-- Remove TTL from a collection
ALTER TABLE temporary_data DROP TTL created_at;

-- QueryLeaf provides comprehensive TTL capabilities:
-- 1. SQL-familiar TTL creation and management syntax
-- 2. Multiple TTL strategies (field-based, time-based, conditional)
-- 3. Advanced TTL monitoring and health assessment
-- 4. Automatic storage optimization and cleanup
-- 5. Business logic integration with TTL policies
-- 6. Compliance and audit-friendly TTL management
-- 7. Performance monitoring and optimization recommendations
-- 8. Integration with MongoDB's native TTL optimizations
-- 9. Flexible retention policies with partial index support
-- 10. Familiar SQL syntax for complex TTL operations
```

## Best Practices for TTL Implementation

### Data Lifecycle Strategy Design

Essential principles for effective TTL implementation:

1. **Business Alignment**: Design TTL policies that align with business requirements and compliance needs
2. **Performance Optimization**: Consider the impact of TTL operations on database performance
3. **Storage Management**: Balance data retention needs with storage costs and performance
4. **Monitoring Strategy**: Implement comprehensive monitoring for TTL effectiveness
5. **Gradual Implementation**: Roll out TTL policies gradually to assess impact
6. **Backup Considerations**: Ensure TTL policies don't conflict with backup and recovery strategies

### Advanced TTL Configuration

Optimize TTL for production environments:

1. **Index Strategy**: Design TTL indexes to minimize performance impact during cleanup
2. **Batch Operations**: Configure TTL to avoid large batch deletions during peak hours
3. **Partial Indexes**: Use partial indexes for complex retention policies
4. **Compound TTL**: Combine TTL with other indexing strategies for optimal performance
5. **Timezone Handling**: Account for business timezone requirements in TTL calculations
6. **Compliance Integration**: Ensure TTL policies meet regulatory and audit requirements

## Conclusion

MongoDB TTL collections eliminate the complexity of manual data lifecycle management by providing native, automatic data expiration capabilities. The ability to configure flexible retention policies, monitor TTL effectiveness, and integrate with business logic makes TTL collections essential for modern data management strategies.

Key TTL benefits include:

- **Automatic Data Management**: Hands-off data expiration without manual intervention
- **Flexible Retention Policies**: Multiple TTL strategies for different data types and business requirements
- **Storage Optimization**: Automatic cleanup reduces storage costs and improves performance
- **Compliance Support**: Built-in capabilities for audit trails and regulatory compliance
- **Performance Benefits**: Optimized cleanup operations with minimal impact on application performance
- **SQL Accessibility**: Familiar SQL-style TTL operations through QueryLeaf integration

Whether you're managing user sessions, application logs, temporary data, or compliance-sensitive information, MongoDB TTL collections with QueryLeaf's familiar SQL interface provide the foundation for efficient, automated data lifecycle management.

> **QueryLeaf Integration**: QueryLeaf seamlessly manages MongoDB TTL collections while providing SQL-familiar data lifecycle management syntax, retention policy configuration, and TTL monitoring capabilities. Advanced TTL patterns including conditional expiration, gradual cleanup, and compliance-aware retention are elegantly handled through familiar SQL constructs, making sophisticated data lifecycle management both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's robust TTL capabilities with SQL-style data lifecycle operations makes it an ideal platform for applications requiring both automated data management and familiar database interaction patterns, ensuring your TTL strategies remain both effective and maintainable as your data needs evolve and scale.