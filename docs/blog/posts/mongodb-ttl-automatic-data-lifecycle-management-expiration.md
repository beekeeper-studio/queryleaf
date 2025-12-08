---
title: "MongoDB TTL Collections and Automatic Data Lifecycle Management: Intelligent Data Expiration and Cleanup for Scalable Applications"
description: "Master MongoDB TTL (Time-To-Live) collections for automatic data lifecycle management. Learn intelligent document expiration patterns, cleanup strategies, and SQL-familiar approaches to automated data retention and storage optimization."
date: 2025-12-07
tags: [mongodb, ttl, data-lifecycle, expiration, cleanup, storage-optimization, sql, automation]
---

# MongoDB TTL Collections and Automatic Data Lifecycle Management: Intelligent Data Expiration and Cleanup for Scalable Applications

Modern applications generate massive amounts of transient data that requires intelligent lifecycle management to prevent storage bloat, maintain system performance, and comply with data retention policies. Traditional database systems require complex scheduled procedures, manual cleanup scripts, or application-level logic to manage data expiration, leading to inefficient resource utilization, inconsistent cleanup processes, and maintenance overhead that scales poorly with data volume.

MongoDB's TTL (Time-To-Live) collections provide native automatic document expiration capabilities that enable applications to define sophisticated data lifecycle policies at the database level. Unlike traditional approaches that require external orchestration or application logic, MongoDB TTL indexes automatically remove expired documents based on configurable time-based rules, ensuring consistent data management without performance impact or maintenance complexity.

## Traditional Data Cleanup Challenges

Conventional approaches to data lifecycle management face significant operational and performance limitations:

```sql
-- Traditional PostgreSQL data cleanup approach (complex and resource-intensive)

-- Example: Managing session data with manual cleanup procedures
CREATE TABLE user_sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  session_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_sessions_last_accessed ON user_sessions(last_accessed_at);

-- Manual cleanup procedure (requires scheduled execution)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired sessions in batches to avoid long locks
  WITH expired_sessions AS (
    SELECT session_id 
    FROM user_sessions 
    WHERE expires_at < NOW()
    LIMIT 10000  -- Batch processing to prevent lock contention
  )
  DELETE FROM user_sessions 
  WHERE session_id IN (SELECT session_id FROM expired_sessions);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % expired sessions', deleted_count;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job (requires external cron or scheduler)
-- This must be configured outside the database:
-- 0 */6 * * * psql -d myapp -c "SELECT cleanup_expired_sessions();"

-- Problems with manual cleanup approach:
-- 1. Requires external scheduling and monitoring systems
-- 2. Batch processing creates inconsistent cleanup timing
-- 3. Resource-intensive operations during cleanup windows
-- 4. Risk of cleanup failure without proper monitoring
-- 5. Complex coordination across multiple tables and relationships
-- 6. Difficult to optimize cleanup performance vs. application performance

-- Example: Log data cleanup with cascading complexity
CREATE TABLE application_logs (
  log_id BIGSERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL,
  severity_level VARCHAR(10) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Manual retention policy management
  retention_category VARCHAR(20) DEFAULT 'standard', -- 'critical', 'standard', 'debug'
  retention_expires_at TIMESTAMP WITH TIME ZONE
);

-- Complex trigger for setting retention dates
CREATE OR REPLACE FUNCTION set_log_retention_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.retention_expires_at := CASE NEW.retention_category
    WHEN 'critical' THEN NEW.created_at + INTERVAL '2 years'
    WHEN 'standard' THEN NEW.created_at + INTERVAL '6 months'
    WHEN 'debug' THEN NEW.created_at + INTERVAL '7 days'
    ELSE NEW.created_at + INTERVAL '30 days'
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_log_retention 
  BEFORE INSERT OR UPDATE ON application_logs
  FOR EACH ROW 
  EXECUTE FUNCTION set_log_retention_date();

-- Complex cleanup with retention policy handling
CREATE OR REPLACE FUNCTION cleanup_application_logs()
RETURNS TABLE(retention_category VARCHAR, deleted_count BIGINT) AS $$
DECLARE
  category VARCHAR;
  del_count BIGINT;
BEGIN
  -- Process each retention category separately
  FOR category IN SELECT DISTINCT l.retention_category FROM application_logs l LOOP
    WITH expired_logs AS (
      SELECT log_id
      FROM application_logs
      WHERE retention_category = category 
        AND retention_expires_at < NOW()
      LIMIT 50000  -- Large batch size for logs
    )
    DELETE FROM application_logs 
    WHERE log_id IN (SELECT log_id FROM expired_logs);
    
    GET DIAGNOSTICS del_count = ROW_COUNT;
    
    RETURN QUERY SELECT category, del_count;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Traditional approach limitations:
-- 1. Complex stored procedure logic for different retention policies
-- 2. Risk of cleanup procedures failing and accumulating stale data
-- 3. Performance impact during cleanup operations
-- 4. Difficult to test and validate cleanup logic
-- 5. Manual coordination required for related table cleanup
-- 6. No atomic cleanup guarantees across related documents
-- 7. Resource contention between cleanup and application operations

-- Example: MySQL cleanup with limited capabilities
CREATE TABLE mysql_cache_entries (
  cache_key VARCHAR(255) PRIMARY KEY,
  cache_value LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  
  INDEX idx_expires_at (expires_at)
);

-- MySQL cleanup event (requires event scheduler enabled)
DELIMITER ;;
CREATE EVENT cleanup_cache_entries
ON SCHEDULE EVERY 1 HOUR
DO
BEGIN
  -- Simple cleanup with limited error handling
  DELETE FROM mysql_cache_entries 
  WHERE expires_at < NOW();
END;;
DELIMITER ;

-- MySQL limitations:
-- 1. Basic event scheduler with limited scheduling options
-- 2. No sophisticated batch processing or resource management
-- 3. Limited error handling and monitoring capabilities
-- 4. Event scheduler can be disabled accidentally
-- 5. No built-in support for complex retention policies
-- 6. Cleanup operations can block other database operations
-- 7. No automatic optimization for cleanup performance

-- Oracle approach with job scheduling
CREATE TABLE oracle_temp_data (
  temp_id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  data_content CLOB,
  created_date TIMESTAMP DEFAULT SYSTIMESTAMP,
  expiry_date TIMESTAMP NOT NULL
);

-- Oracle job for cleanup (complex setup required)
BEGIN
  DBMS_SCHEDULER.create_job (
    job_name        => 'CLEANUP_TEMP_DATA_JOB',
    job_type        => 'PLSQL_BLOCK',
    job_action      => 'BEGIN
                          DELETE FROM oracle_temp_data 
                          WHERE expiry_date < SYSTIMESTAMP;
                          COMMIT;
                        END;',
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'FREQ=HOURLY; INTERVAL=2',
    enabled         => TRUE
  );
END;

-- Oracle complexity issues:
-- 1. Requires DBMS_SCHEDULER privileges and configuration
-- 2. Job management complexity and monitoring requirements  
-- 3. Manual transaction management in cleanup procedures
-- 4. Complex scheduling syntax and limited flexibility
-- 5. Jobs can fail silently without proper monitoring
-- 6. Resource management and performance tuning required
-- 7. Expensive licensing for advanced job scheduling features
```

MongoDB TTL collections provide effortless automatic data lifecycle management:

```javascript
// MongoDB TTL Collections - native automatic document expiration and lifecycle management

const { MongoClient } = require('mongodb');

// Comprehensive MongoDB TTL and Data Lifecycle Management System
class MongoDBTTLManager {
  constructor(db) {
    this.db = db;
    this.ttlCollections = new Map();
    this.lifecyclePolicies = new Map();
    this.expirationStats = {
      documentsExpired: 0,
      storageReclaimed: 0,
      lastCleanupRun: null
    };
    this.ttlIndexSpecs = new Map();
  }

  // Create collection with automatic TTL expiration
  async createTTLCollection(collectionName, ttlConfig) {
    console.log(`Creating TTL collection: ${collectionName}`);
    
    const {
      ttlField = 'expiresAt',
      expireAfterSeconds = null,
      indexOnCreatedAt = false,
      additionalIndexes = [],
      validationSchema = null
    } = ttlConfig;

    try {
      // Create collection with optional validation
      const collectionOptions = {};
      if (validationSchema) {
        collectionOptions.validator = validationSchema;
        collectionOptions.validationLevel = 'strict';
      }

      await this.db.createCollection(collectionName, collectionOptions);
      const collection = this.db.collection(collectionName);

      // Create TTL index for automatic expiration
      if (expireAfterSeconds !== null) {
        // TTL index with expireAfterSeconds for automatic cleanup
        await collection.createIndex(
          { [ttlField]: 1 },
          { 
            expireAfterSeconds: expireAfterSeconds,
            background: true,
            name: `ttl_${ttlField}_${expireAfterSeconds}`
          }
        );
        
        console.log(`Created TTL index on ${ttlField} with expiration: ${expireAfterSeconds} seconds`);
      } else {
        // TTL index on Date field for document-specific expiration
        await collection.createIndex(
          { [ttlField]: 1 },
          {
            expireAfterSeconds: 0, // Documents expire based on date value
            background: true,
            name: `ttl_${ttlField}_document_specific`
          }
        );
        
        console.log(`Created document-specific TTL index on ${ttlField}`);
      }

      // Optional index on created timestamp for queries
      if (indexOnCreatedAt) {
        await collection.createIndex(
          { createdAt: 1 },
          { background: true, name: 'idx_created_at' }
        );
      }

      // Create additional indexes as specified
      for (const indexSpec of additionalIndexes) {
        await collection.createIndex(
          indexSpec.fields,
          { background: true, ...indexSpec.options }
        );
      }

      // Store TTL configuration for reference
      this.ttlCollections.set(collectionName, {
        ttlField: ttlField,
        expireAfterSeconds: expireAfterSeconds,
        collection: collection,
        createdAt: new Date(),
        config: ttlConfig
      });

      this.ttlIndexSpecs.set(collectionName, {
        field: ttlField,
        expireAfterSeconds: expireAfterSeconds,
        indexName: expireAfterSeconds !== null ? 
          `ttl_${ttlField}_${expireAfterSeconds}` : 
          `ttl_${ttlField}_document_specific`
      });

      console.log(`TTL collection ${collectionName} created successfully`);
      return collection;

    } catch (error) {
      console.error(`Failed to create TTL collection ${collectionName}:`, error);
      throw error;
    }
  }

  // Session management with automatic cleanup
  async createSessionsCollection() {
    console.log('Creating user sessions collection with TTL');
    
    const sessionValidation = {
      $jsonSchema: {
        bsonType: 'object',
        required: ['sessionId', 'userId', 'createdAt', 'expiresAt'],
        properties: {
          sessionId: {
            bsonType: 'string',
            minLength: 32,
            maxLength: 128,
            description: 'Unique session identifier'
          },
          userId: {
            bsonType: 'objectId',
            description: 'Reference to user document'
          },
          sessionData: {
            bsonType: ['object', 'null'],
            description: 'Session-specific data'
          },
          ipAddress: {
            bsonType: ['string', 'null'],
            pattern: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$',
            description: 'Client IP address'
          },
          userAgent: {
            bsonType: ['string', 'null'],
            maxLength: 500,
            description: 'Client user agent'
          },
          createdAt: {
            bsonType: 'date',
            description: 'Session creation timestamp'
          },
          lastAccessedAt: {
            bsonType: 'date', 
            description: 'Last session access timestamp'
          },
          expiresAt: {
            bsonType: 'date',
            description: 'Session expiration timestamp for TTL'
          },
          isActive: {
            bsonType: 'bool',
            description: 'Session active status'
          }
        }
      }
    };

    await this.createTTLCollection('userSessions', {
      ttlField: 'expiresAt',
      expireAfterSeconds: 0, // Document-specific expiration
      indexOnCreatedAt: true,
      validationSchema: sessionValidation,
      additionalIndexes: [
        {
          fields: { sessionId: 1 },
          options: { unique: true, name: 'idx_session_id' }
        },
        {
          fields: { userId: 1, isActive: 1 },
          options: { name: 'idx_user_active_sessions' }
        },
        {
          fields: { lastAccessedAt: -1 },
          options: { name: 'idx_last_accessed' }
        }
      ]
    });

    return this.db.collection('userSessions');
  }

  // Create optimized logging collection with retention policies
  async createLoggingCollection() {
    console.log('Creating application logs collection with TTL');
    
    const logValidation = {
      $jsonSchema: {
        bsonType: 'object',
        required: ['level', 'message', 'timestamp', 'source'],
        properties: {
          level: {
            enum: ['debug', 'info', 'warn', 'error', 'fatal'],
            description: 'Log severity level'
          },
          message: {
            bsonType: 'string',
            maxLength: 10000,
            description: 'Log message content'
          },
          source: {
            bsonType: 'string',
            maxLength: 100,
            description: 'Log source component'
          },
          timestamp: {
            bsonType: 'date',
            description: 'Log entry timestamp'
          },
          metadata: {
            bsonType: ['object', 'null'],
            description: 'Additional log metadata'
          },
          userId: {
            bsonType: ['objectId', 'null'],
            description: 'Associated user ID if applicable'
          },
          requestId: {
            bsonType: ['string', 'null'],
            description: 'Request correlation ID'
          },
          retentionCategory: {
            enum: ['debug', 'standard', 'audit', 'critical'],
            description: 'Data retention classification'
          },
          tags: {
            bsonType: ['array', 'null'],
            items: { bsonType: 'string' },
            description: 'Searchable tags'
          }
        }
      }
    };

    // Create multiple collections for different retention periods
    const retentionPolicies = [
      { category: 'debug', days: 7 },
      { category: 'standard', days: 90 },
      { category: 'audit', days: 365 },
      { category: 'critical', days: 2555 } // 7 years
    ];

    for (const policy of retentionPolicies) {
      const collectionName = `applicationLogs_${policy.category}`;
      
      await this.createTTLCollection(collectionName, {
        ttlField: 'timestamp',
        expireAfterSeconds: policy.days * 24 * 60 * 60, // Convert days to seconds
        indexOnCreatedAt: false,
        validationSchema: logValidation,
        additionalIndexes: [
          {
            fields: { level: 1, timestamp: -1 },
            options: { name: 'idx_level_timestamp' }
          },
          {
            fields: { source: 1, timestamp: -1 },
            options: { name: 'idx_source_timestamp' }
          },
          {
            fields: { userId: 1, timestamp: -1 },
            options: { name: 'idx_user_timestamp', sparse: true }
          },
          {
            fields: { requestId: 1 },
            options: { name: 'idx_request_id', sparse: true }
          },
          {
            fields: { tags: 1 },
            options: { name: 'idx_tags', sparse: true }
          }
        ]
      });
    }

    this.lifecyclePolicies.set('applicationLogs', retentionPolicies);
    return retentionPolicies.map(p => ({ 
      category: p.category, 
      collection: this.db.collection(`applicationLogs_${p.category}`) 
    }));
  }

  // Cache collection with flexible TTL
  async createCacheCollection() {
    console.log('Creating cache collection with TTL');
    
    const cacheValidation = {
      $jsonSchema: {
        bsonType: 'object',
        required: ['key', 'value', 'createdAt'],
        properties: {
          key: {
            bsonType: 'string',
            maxLength: 500,
            description: 'Cache key identifier'
          },
          value: {
            description: 'Cached data value (any type)'
          },
          createdAt: {
            bsonType: 'date',
            description: 'Cache entry creation time'
          },
          expiresAt: {
            bsonType: ['date', 'null'],
            description: 'Optional specific expiration time'
          },
          namespace: {
            bsonType: ['string', 'null'],
            maxLength: 100,
            description: 'Cache namespace for organization'
          },
          tags: {
            bsonType: ['array', 'null'],
            items: { bsonType: 'string' },
            description: 'Cache entry tags'
          },
          size: {
            bsonType: ['int', 'null'],
            minimum: 0,
            description: 'Cached data size in bytes'
          },
          hitCount: {
            bsonType: 'int',
            minimum: 0,
            description: 'Number of times cache entry was accessed'
          },
          lastAccessedAt: {
            bsonType: 'date',
            description: 'Last access timestamp'
          }
        }
      }
    };

    await this.createTTLCollection('cache', {
      ttlField: 'createdAt',
      expireAfterSeconds: 3600, // Default 1 hour expiration
      indexOnCreatedAt: false,
      validationSchema: cacheValidation,
      additionalIndexes: [
        {
          fields: { key: 1 },
          options: { unique: true, name: 'idx_cache_key' }
        },
        {
          fields: { namespace: 1, createdAt: -1 },
          options: { name: 'idx_namespace_created', sparse: true }
        },
        {
          fields: { tags: 1 },
          options: { name: 'idx_cache_tags', sparse: true }
        },
        {
          fields: { lastAccessedAt: -1 },
          options: { name: 'idx_last_accessed' }
        },
        {
          fields: { expiresAt: 1 },
          options: { 
            name: 'ttl_expires_at_custom',
            expireAfterSeconds: 0, // Custom expiration times
            sparse: true 
          }
        }
      ]
    });

    return this.db.collection('cache');
  }

  // Temporary data collection for processing workflows
  async createTempDataCollection() {
    console.log('Creating temporary data collection with short TTL');
    
    const tempDataValidation = {
      $jsonSchema: {
        bsonType: 'object',
        required: ['workflowId', 'data', 'createdAt', 'status'],
        properties: {
          workflowId: {
            bsonType: 'string',
            maxLength: 100,
            description: 'Workflow identifier'
          },
          stepId: {
            bsonType: ['string', 'null'],
            maxLength: 100,
            description: 'Workflow step identifier'
          },
          data: {
            description: 'Temporary processing data'
          },
          status: {
            enum: ['pending', 'processing', 'completed', 'failed'],
            description: 'Processing status'
          },
          createdAt: {
            bsonType: 'date',
            description: 'Creation timestamp'
          },
          processedAt: {
            bsonType: ['date', 'null'],
            description: 'Processing completion timestamp'
          },
          priority: {
            bsonType: 'int',
            minimum: 1,
            maximum: 10,
            description: 'Processing priority level'
          },
          retryCount: {
            bsonType: 'int',
            minimum: 0,
            description: 'Number of retry attempts'
          },
          errorMessage: {
            bsonType: ['string', 'null'],
            maxLength: 1000,
            description: 'Error message if processing failed'
          }
        }
      }
    };

    await this.createTTLCollection('tempProcessingData', {
      ttlField: 'createdAt',
      expireAfterSeconds: 86400, // 24 hours
      indexOnCreatedAt: false,
      validationSchema: tempDataValidation,
      additionalIndexes: [
        {
          fields: { workflowId: 1, status: 1 },
          options: { name: 'idx_workflow_status' }
        },
        {
          fields: { status: 1, priority: -1, createdAt: 1 },
          options: { name: 'idx_processing_queue' }
        },
        {
          fields: { stepId: 1 },
          options: { name: 'idx_step_id', sparse: true }
        }
      ]
    });

    return this.db.collection('tempProcessingData');
  }

  // Insert documents with intelligent expiration management
  async insertWithTTL(collectionName, documents, ttlOptions = {}) {
    console.log(`Inserting ${Array.isArray(documents) ? documents.length : 1} documents with TTL into ${collectionName}`);
    
    const collection = this.db.collection(collectionName);
    const ttlConfig = this.ttlCollections.get(collectionName);
    
    if (!ttlConfig) {
      throw new Error(`Collection ${collectionName} is not configured for TTL`);
    }

    const documentsToInsert = Array.isArray(documents) ? documents : [documents];
    const currentTime = new Date();
    
    // Process each document to set appropriate expiration
    const processedDocuments = documentsToInsert.map(doc => {
      const processedDoc = { ...doc };
      
      // Set creation timestamp if not present
      if (!processedDoc.createdAt) {
        processedDoc.createdAt = currentTime;
      }
      
      // Handle TTL field based on collection configuration
      if (ttlConfig.expireAfterSeconds === 0) {
        // Document-specific expiration - use provided or calculate
        if (!processedDoc[ttlConfig.ttlField]) {
          const customTTL = ttlOptions.customExpireAfterSeconds || 
                           ttlOptions.expireAfterSeconds ||
                           3600; // Default 1 hour
          
          processedDoc[ttlConfig.ttlField] = new Date(
            currentTime.getTime() + (customTTL * 1000)
          );
        }
      } else {
        // Fixed expiration - set TTL field to current time for consistent expiration
        if (!processedDoc[ttlConfig.ttlField]) {
          processedDoc[ttlConfig.ttlField] = currentTime;
        }
      }
      
      // Add metadata for tracking
      processedDoc._ttl_configured = true;
      processedDoc._ttl_field = ttlConfig.ttlField;
      processedDoc._ttl_policy = ttlConfig.expireAfterSeconds === 0 ? 'document_specific' : 'collection_fixed';
      
      return processedDoc;
    });

    try {
      const result = Array.isArray(documents) ? 
        await collection.insertMany(processedDocuments) :
        await collection.insertOne(processedDocuments[0]);

      console.log(`Successfully inserted documents with TTL configuration`);
      return result;

    } catch (error) {
      console.error(`Failed to insert documents with TTL:`, error);
      throw error;
    }
  }

  // Update TTL configuration for existing collections
  async modifyTTLExpiration(collectionName, newExpireAfterSeconds) {
    console.log(`Modifying TTL expiration for ${collectionName} to ${newExpireAfterSeconds} seconds`);
    
    const ttlConfig = this.ttlCollections.get(collectionName);
    if (!ttlConfig) {
      throw new Error(`Collection ${collectionName} is not configured for TTL`);
    }

    const indexSpec = this.ttlIndexSpecs.get(collectionName);
    
    try {
      // Use collMod command to change TTL expiration
      await this.db.runCommand({
        collMod: collectionName,
        index: {
          keyPattern: { [ttlConfig.ttlField]: 1 },
          expireAfterSeconds: newExpireAfterSeconds
        }
      });

      // Update our tracking
      ttlConfig.expireAfterSeconds = newExpireAfterSeconds;
      indexSpec.expireAfterSeconds = newExpireAfterSeconds;

      console.log(`TTL expiration updated successfully for ${collectionName}`);
      return { success: true, newExpiration: newExpireAfterSeconds };

    } catch (error) {
      console.error(`Failed to modify TTL expiration:`, error);
      throw error;
    }
  }

  // Monitor TTL collection statistics and performance
  async getTTLStatistics() {
    console.log('Gathering TTL collection statistics...');
    
    const statistics = {
      collections: new Map(),
      summary: {
        totalCollections: this.ttlCollections.size,
        totalDocuments: 0,
        estimatedStorageSize: 0,
        oldestDocument: null,
        newestDocument: null
      }
    };

    for (const [collectionName, config] of this.ttlCollections) {
      try {
        const collection = config.collection;
        const stats = await collection.stats();
        
        // Get sample documents for age analysis
        const oldestDoc = await collection.findOne(
          {},
          { sort: { [config.ttlField]: 1 } }
        );
        
        const newestDoc = await collection.findOne(
          {},
          { sort: { [config.ttlField]: -1 } }
        );

        // Calculate expiration statistics
        const now = new Date();
        let documentsExpiringSoon = 0;
        
        if (config.expireAfterSeconds === 0) {
          // Document-specific expiration
          documentsExpiringSoon = await collection.countDocuments({
            [config.ttlField]: {
              $lte: new Date(now.getTime() + (3600 * 1000)) // Next hour
            }
          });
        } else {
          // Fixed expiration
          const cutoffTime = new Date(now.getTime() - (config.expireAfterSeconds - 3600) * 1000);
          documentsExpiringSoon = await collection.countDocuments({
            [config.ttlField]: { $lte: cutoffTime }
          });
        }

        const collectionStats = {
          name: collectionName,
          documentCount: stats.count,
          storageSize: stats.storageSize,
          indexSize: stats.totalIndexSize,
          averageDocumentSize: stats.avgObjSize,
          ttlField: config.ttlField,
          expireAfterSeconds: config.expireAfterSeconds,
          expirationPolicy: config.expireAfterSeconds === 0 ? 'document_specific' : 'collection_fixed',
          oldestDocument: oldestDoc ? oldestDoc[config.ttlField] : null,
          newestDocument: newestDoc ? newestDoc[config.ttlField] : null,
          documentsExpiringSoon: documentsExpiringSoon,
          createdAt: config.createdAt
        };

        statistics.collections.set(collectionName, collectionStats);
        statistics.summary.totalDocuments += stats.count;
        statistics.summary.estimatedStorageSize += stats.storageSize;

        if (!statistics.summary.oldestDocument || 
            (oldestDoc && oldestDoc[config.ttlField] < statistics.summary.oldestDocument)) {
          statistics.summary.oldestDocument = oldestDoc ? oldestDoc[config.ttlField] : null;
        }
        
        if (!statistics.summary.newestDocument || 
            (newestDoc && newestDoc[config.ttlField] > statistics.summary.newestDocument)) {
          statistics.summary.newestDocument = newestDoc ? newestDoc[config.ttlField] : null;
        }

      } catch (error) {
        console.warn(`Could not gather statistics for ${collectionName}:`, error.message);
      }
    }

    return statistics;
  }

  // Advanced TTL management and monitoring
  async performTTLHealthCheck() {
    console.log('Performing comprehensive TTL health check...');
    
    const healthCheck = {
      status: 'healthy',
      issues: [],
      recommendations: [],
      collections: new Map(),
      summary: {
        totalCollections: this.ttlCollections.size,
        healthyCollections: 0,
        collectionsWithIssues: 0,
        totalDocuments: 0
      }
    };

    for (const [collectionName, config] of this.ttlCollections) {
      const collectionHealth = {
        name: collectionName,
        status: 'healthy',
        issues: [],
        recommendations: [],
        metrics: {}
      };

      try {
        const collection = config.collection;
        const stats = await collection.stats();
        
        // Check for orphaned documents (shouldn't exist with proper TTL)
        const now = new Date();
        let expiredDocuments = 0;
        
        if (config.expireAfterSeconds === 0) {
          expiredDocuments = await collection.countDocuments({
            [config.ttlField]: { $lte: new Date(now.getTime() - 300000) } // 5 minutes ago
          });
        } else {
          const expiredCutoff = new Date(now.getTime() - config.expireAfterSeconds * 1000 - 300000);
          expiredDocuments = await collection.countDocuments({
            [config.ttlField]: { $lte: expiredCutoff }
          });
        }

        collectionHealth.metrics = {
          documentCount: stats.count,
          storageSize: stats.storageSize,
          indexCount: stats.nindexes,
          expiredDocuments: expiredDocuments
        };

        // Analyze potential issues
        if (expiredDocuments > 0) {
          collectionHealth.status = 'warning';
          collectionHealth.issues.push(`Found ${expiredDocuments} documents that should have expired`);
          collectionHealth.recommendations.push('Monitor TTL background task performance');
        }

        if (stats.count > 1000000) {
          collectionHealth.recommendations.push('Consider partitioning strategy for large collections');
        }

        if (stats.storageSize > 1073741824) { // 1GB
          collectionHealth.recommendations.push('Monitor storage usage and consider shorter retention periods');
        }

        // Check index health
        const indexes = await collection.indexes();
        const ttlIndex = indexes.find(idx => 
          idx.expireAfterSeconds !== undefined && 
          Object.keys(idx.key).includes(config.ttlField)
        );

        if (!ttlIndex) {
          collectionHealth.status = 'error';
          collectionHealth.issues.push('TTL index missing or misconfigured');
        }

        healthCheck.collections.set(collectionName, collectionHealth);
        healthCheck.summary.totalDocuments += stats.count;

        if (collectionHealth.status === 'healthy') {
          healthCheck.summary.healthyCollections++;
        } else {
          healthCheck.summary.collectionsWithIssues++;
          if (collectionHealth.status === 'error') {
            healthCheck.status = 'error';
          } else if (healthCheck.status === 'healthy') {
            healthCheck.status = 'warning';
          }
        }

      } catch (error) {
        collectionHealth.status = 'error';
        collectionHealth.issues.push(`Health check failed: ${error.message}`);
        healthCheck.status = 'error';
        healthCheck.summary.collectionsWithIssues++;
      }
    }

    // Generate overall recommendations
    if (healthCheck.summary.collectionsWithIssues > 0) {
      healthCheck.recommendations.push('Review collections with issues and optimize TTL configurations');
    }

    if (healthCheck.summary.totalDocuments > 10000000) {
      healthCheck.recommendations.push('Consider implementing data archiving strategy for historical data');
    }

    console.log(`TTL health check completed: ${healthCheck.status}`);
    return healthCheck;
  }

  // Get comprehensive TTL management report
  async generateTTLReport() {
    console.log('Generating comprehensive TTL management report...');
    
    const [statistics, healthCheck] = await Promise.all([
      this.getTTLStatistics(),
      this.performTTLHealthCheck()
    ]);

    const report = {
      generatedAt: new Date(),
      overview: {
        totalCollections: statistics.summary.totalCollections,
        totalDocuments: statistics.summary.totalDocuments,
        totalStorageSize: statistics.summary.estimatedStorageSize,
        healthStatus: healthCheck.status
      },
      collections: [],
      recommendations: healthCheck.recommendations,
      issues: healthCheck.issues
    };

    // Combine statistics and health data
    for (const [collectionName, stats] of statistics.collections) {
      const health = healthCheck.collections.get(collectionName);
      
      report.collections.push({
        name: collectionName,
        documentCount: stats.documentCount,
        storageSize: stats.storageSize,
        ttlConfiguration: {
          field: stats.ttlField,
          expireAfterSeconds: stats.expireAfterSeconds,
          policy: stats.expirationPolicy
        },
        dataAge: {
          oldest: stats.oldestDocument,
          newest: stats.newestDocument
        },
        expiration: {
          documentsExpiringSoon: stats.documentsExpiringSoon
        },
        health: {
          status: health?.status || 'unknown',
          issues: health?.issues || [],
          recommendations: health?.recommendations || []
        }
      });
    }

    console.log('TTL management report generated successfully');
    return report;
  }
}

// Example usage demonstrating comprehensive TTL management
async function demonstrateTTLOperations() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('ttl_management_demo');
  
  const ttlManager = new MongoDBTTLManager(db);
  
  // Create various TTL collections
  await ttlManager.createSessionsCollection();
  await ttlManager.createLoggingCollection();
  await ttlManager.createCacheCollection();
  await ttlManager.createTempDataCollection();
  
  // Insert sample data with TTL
  await ttlManager.insertWithTTL('userSessions', [
    {
      sessionId: 'sess_' + Math.random().toString(36).substr(2, 16),
      userId: new ObjectId(),
      sessionData: { preferences: { theme: 'dark' } },
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0...',
      lastAccessedAt: new Date(),
      isActive: true
    }
  ]);
  
  // Insert cache entries with custom expiration
  await ttlManager.insertWithTTL('cache', [
    {
      key: 'user_profile_12345',
      value: { name: 'John Doe', email: 'john@example.com' },
      namespace: 'user_profiles',
      tags: ['profile', 'active'],
      size: 256,
      hitCount: 0,
      lastAccessedAt: new Date()
    }
  ], { customExpireAfterSeconds: 7200 }); // 2 hours
  
  // Generate comprehensive report
  const report = await ttlManager.generateTTLReport();
  console.log('TTL Management Report:', JSON.stringify(report, null, 2));
  
  await client.close();
}
```

## Advanced TTL Patterns and Enterprise Management

### Sophisticated TTL Strategies for Production Systems

Implement enterprise-grade TTL management with advanced patterns and monitoring:

```javascript
// Enterprise MongoDB TTL Management with Advanced Patterns and Monitoring
class EnterpriseTTLManager extends MongoDBTTLManager {
  constructor(db, enterpriseConfig = {}) {
    super(db);
    
    this.enterpriseConfig = {
      enableMetrics: enterpriseConfig.enableMetrics || true,
      enableAlerting: enterpriseConfig.enableAlerting || true,
      metricsCollection: enterpriseConfig.metricsCollection || 'ttl_metrics',
      alertThresholds: {
        expiredDocumentThreshold: 1000,
        storageSizeThreshold: 5368709120, // 5GB
        healthCheckFailureThreshold: 3
      },
      ...enterpriseConfig
    };
    
    this.metricsHistory = [];
    this.alertHistory = [];
    this.setupEnterpriseFeatures();
  }

  async setupEnterpriseFeatures() {
    if (this.enterpriseConfig.enableMetrics) {
      await this.createMetricsCollection();
      this.startMetricsCollection();
    }
  }

  async createMetricsCollection() {
    try {
      await this.db.createCollection(this.enterpriseConfig.metricsCollection, {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['timestamp', 'collectionName', 'metrics'],
            properties: {
              timestamp: { bsonType: 'date' },
              collectionName: { bsonType: 'string' },
              metrics: {
                bsonType: 'object',
                properties: {
                  documentCount: { bsonType: 'int' },
                  storageSize: { bsonType: 'long' },
                  expiredDocuments: { bsonType: 'int' },
                  documentsExpiringSoon: { bsonType: 'int' }
                }
              }
            }
          }
        }
      });
      
      // TTL for metrics (keep for 30 days)
      await this.db.collection(this.enterpriseConfig.metricsCollection).createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 2592000 } // 30 days
      );
      
      console.log('Enterprise TTL metrics collection created');
    } catch (error) {
      console.warn('Could not create metrics collection:', error.message);
    }
  }

  async createHierarchicalTTLCollection(collectionName, ttlHierarchy) {
    console.log(`Creating hierarchical TTL collection: ${collectionName}`);
    
    // TTL hierarchy example: { debug: 7*24*3600, info: 30*24*3600, error: 365*24*3600 }
    const baseValidator = {
      $jsonSchema: {
        bsonType: 'object',
        required: ['level', 'data', 'timestamp'],
        properties: {
          level: {
            enum: Object.keys(ttlHierarchy),
            description: 'Data classification level'
          },
          data: { description: 'Document data' },
          timestamp: { bsonType: 'date' },
          customExpiration: {
            bsonType: ['date', 'null'],
            description: 'Override expiration time'
          }
        }
      }
    };

    await this.db.createCollection(collectionName, { validator: baseValidator });
    const collection = this.db.collection(collectionName);

    // Create multiple TTL indexes for different levels
    for (const [level, expireSeconds] of Object.entries(ttlHierarchy)) {
      await collection.createIndex(
        { level: 1, timestamp: 1 },
        {
          expireAfterSeconds: expireSeconds,
          partialFilterExpression: { level: level },
          name: `ttl_${level}_${expireSeconds}`,
          background: true
        }
      );
    }

    // Additional TTL index for custom expiration
    await collection.createIndex(
      { customExpiration: 1 },
      {
        expireAfterSeconds: 0,
        sparse: true,
        name: 'ttl_custom_expiration'
      }
    );

    return collection;
  }

  async createConditionalTTLCollection(collectionName, conditionalRules) {
    console.log(`Creating conditional TTL collection: ${collectionName}`);
    
    // Conditional rules example:
    // [
    //   { condition: { status: 'completed' }, expireAfterSeconds: 86400 },
    //   { condition: { status: 'failed' }, expireAfterSeconds: 604800 },
    //   { condition: { priority: 'high' }, expireAfterSeconds: 2592000 }
    // ]

    await this.db.createCollection(collectionName);
    const collection = this.db.collection(collectionName);

    // Create conditional TTL indexes
    for (const [index, rule] of conditionalRules.entries()) {
      await collection.createIndex(
        { createdAt: 1, ...rule.condition },
        {
          expireAfterSeconds: rule.expireAfterSeconds,
          partialFilterExpression: rule.condition,
          name: `ttl_conditional_${index}`,
          background: true
        }
      );
    }

    return collection;
  }

  startMetricsCollection() {
    if (!this.enterpriseConfig.enableMetrics) return;

    // Collect metrics every 5 minutes
    setInterval(async () => {
      try {
        await this.collectAndStoreMetrics();
      } catch (error) {
        console.error('Failed to collect TTL metrics:', error);
      }
    }, 300000); // 5 minutes

    console.log('TTL metrics collection started');
  }

  async collectAndStoreMetrics() {
    const metricsCollection = this.db.collection(this.enterpriseConfig.metricsCollection);
    const timestamp = new Date();

    for (const [collectionName, config] of this.ttlCollections) {
      try {
        const collection = config.collection;
        const stats = await collection.stats();
        
        // Calculate expired documents
        const now = new Date();
        let expiredDocuments = 0;
        let documentsExpiringSoon = 0;

        if (config.expireAfterSeconds === 0) {
          expiredDocuments = await collection.countDocuments({
            [config.ttlField]: { $lte: new Date(now.getTime() - 300000) }
          });
          documentsExpiringSoon = await collection.countDocuments({
            [config.ttlField]: {
              $lte: new Date(now.getTime() + 3600000),
              $gt: now
            }
          });
        } else {
          const expiredCutoff = new Date(now.getTime() - config.expireAfterSeconds * 1000 - 300000);
          expiredDocuments = await collection.countDocuments({
            [config.ttlField]: { $lte: expiredCutoff }
          });
        }

        const metrics = {
          timestamp: timestamp,
          collectionName: collectionName,
          metrics: {
            documentCount: stats.count,
            storageSize: stats.storageSize,
            indexSize: stats.totalIndexSize,
            expiredDocuments: expiredDocuments,
            documentsExpiringSoon: documentsExpiringSoon
          }
        };

        await metricsCollection.insertOne(metrics);

        // Check for alert conditions
        await this.checkAlertConditions(collectionName, metrics.metrics);

      } catch (error) {
        console.error(`Failed to collect metrics for ${collectionName}:`, error);
      }
    }
  }

  async checkAlertConditions(collectionName, metrics) {
    const alerts = [];
    const thresholds = this.enterpriseConfig.alertThresholds;

    if (metrics.expiredDocuments > thresholds.expiredDocumentThreshold) {
      alerts.push({
        severity: 'warning',
        message: `Collection ${collectionName} has ${metrics.expiredDocuments} expired documents`,
        metric: 'expired_documents',
        value: metrics.expiredDocuments,
        threshold: thresholds.expiredDocumentThreshold
      });
    }

    if (metrics.storageSize > thresholds.storageSizeThreshold) {
      alerts.push({
        severity: 'warning',
        message: `Collection ${collectionName} storage size ${metrics.storageSize} exceeds threshold`,
        metric: 'storage_size',
        value: metrics.storageSize,
        threshold: thresholds.storageSizeThreshold
      });
    }

    if (alerts.length > 0 && this.enterpriseConfig.enableAlerting) {
      await this.processAlerts(collectionName, alerts);
    }
  }

  async processAlerts(collectionName, alerts) {
    for (const alert of alerts) {
      console.warn(`TTL Alert - ${alert.severity.toUpperCase()}: ${alert.message}`);
      
      this.alertHistory.push({
        timestamp: new Date(),
        collectionName: collectionName,
        alert: alert
      });
    }
  }
}
```

## QueryLeaf TTL Integration

QueryLeaf provides familiar SQL syntax for MongoDB TTL collections and automatic data lifecycle management:

```sql
-- QueryLeaf TTL collections with SQL-familiar syntax for automatic data expiration

-- Create table with automatic expiration (QueryLeaf converts to TTL collection)
CREATE TABLE user_sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  user_id ObjectId NOT NULL,
  session_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true
) WITH (
  ttl_field = 'expires_at',
  expire_after_seconds = 0  -- Document-specific expiration
);

-- QueryLeaf automatically creates TTL index:
-- db.user_sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })

-- Create cache table with fixed expiration
CREATE TABLE cache_entries (
  cache_key VARCHAR(500) UNIQUE NOT NULL,
  cache_value JSONB NOT NULL,
  namespace VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tags TEXT[],
  hit_count INT DEFAULT 0,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) WITH (
  ttl_field = 'created_at',
  expire_after_seconds = 3600  -- 1 hour fixed expiration
);

-- Application logs with retention categories
CREATE TABLE application_logs_debug (
  level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  source VARCHAR(100) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB,
  user_id ObjectId,
  request_id VARCHAR(50),
  tags TEXT[]
) WITH (
  ttl_field = 'timestamp',
  expire_after_seconds = 604800  -- 7 days for debug logs
);

CREATE TABLE application_logs_standard (
  level VARCHAR(10) NOT NULL,
  message TEXT NOT NULL,
  source VARCHAR(100) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB,
  user_id ObjectId,
  request_id VARCHAR(50),
  tags TEXT[]
) WITH (
  ttl_field = 'timestamp',
  expire_after_seconds = 7776000  -- 90 days for standard logs
);

-- Insert data with automatic expiration handling
INSERT INTO user_sessions (
  session_id, user_id, session_data, ip_address, user_agent, expires_at
) VALUES (
  'sess_abc123def456',
  ObjectId('507f1f77bcf86cd799439011'),
  JSON_OBJECT('theme', 'dark', 'language', 'en-US'),
  '192.168.1.100',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  CURRENT_TIMESTAMP + INTERVAL '24 hours'
);

-- Insert cache entries (automatic expiration after 1 hour)
INSERT INTO cache_entries (cache_key, cache_value, namespace, tags)
VALUES 
  ('user_profile_12345', 
   JSON_OBJECT('name', 'John Doe', 'email', 'john@example.com'),
   'user_profiles', 
   ARRAY['profile', 'active']),
  ('api_response_weather_nyc',
   JSON_OBJECT('temp', 72, 'humidity', 65, 'forecast', 'sunny'), 
   'api_cache',
   ARRAY['weather', 'external_api']);

-- Insert logs with different retention periods
INSERT INTO application_logs_debug (level, message, source, metadata)
VALUES ('debug', 'Processing user request', 'auth_service', 
        JSON_OBJECT('user_id', '12345', 'endpoint', '/api/login'));

INSERT INTO application_logs_standard (level, message, source, request_id)
VALUES ('error', 'Database connection timeout', 'db_service', 'req_789xyz');

-- Query data with expiration awareness
WITH session_analysis AS (
  SELECT 
    session_id,
    user_id,
    created_at,
    last_accessed_at,
    expires_at,
    is_active,
    
    -- Calculate session duration and time until expiration
    EXTRACT(EPOCH FROM (last_accessed_at - created_at)) as session_duration_seconds,
    EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP)) as seconds_until_expiration,
    
    -- Categorize sessions by expiration status
    CASE 
      WHEN expires_at <= CURRENT_TIMESTAMP THEN 'expired'
      WHEN expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 hour' THEN 'expiring_soon'
      WHEN expires_at <= CURRENT_TIMESTAMP + INTERVAL '6 hours' THEN 'expiring_later'
      ELSE 'active'
    END as expiration_status,
    
    -- Session activity assessment
    CASE 
      WHEN last_accessed_at >= CURRENT_TIMESTAMP - INTERVAL '5 minutes' THEN 'very_active'
      WHEN last_accessed_at >= CURRENT_TIMESTAMP - INTERVAL '30 minutes' THEN 'active'
      WHEN last_accessed_at >= CURRENT_TIMESTAMP - INTERVAL '2 hours' THEN 'idle'
      ELSE 'inactive'
    END as activity_level
    
  FROM user_sessions
  WHERE is_active = true
)

SELECT 
  expiration_status,
  activity_level,
  COUNT(*) as session_count,
  AVG(session_duration_seconds / 60) as avg_duration_minutes,
  AVG(seconds_until_expiration / 3600) as avg_hours_until_expiration,
  
  -- Sessions by activity and expiration
  COUNT(*) FILTER (WHERE activity_level = 'very_active' AND expiration_status = 'active') as active_engaged_sessions,
  COUNT(*) FILTER (WHERE activity_level IN ('idle', 'inactive') AND expiration_status = 'expiring_soon') as idle_expiring_sessions
  
FROM session_analysis
GROUP BY expiration_status, activity_level
ORDER BY 
  CASE expiration_status 
    WHEN 'expired' THEN 1
    WHEN 'expiring_soon' THEN 2
    WHEN 'expiring_later' THEN 3 
    ELSE 4
  END,
  CASE activity_level
    WHEN 'very_active' THEN 1
    WHEN 'active' THEN 2
    WHEN 'idle' THEN 3
    ELSE 4
  END;

-- Cache performance analysis with TTL awareness
WITH cache_analysis AS (
  SELECT 
    namespace,
    cache_key,
    created_at,
    last_accessed_at,
    hit_count,
    
    -- Calculate cache metrics
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) as cache_age_seconds,
    EXTRACT(EPOCH FROM (last_accessed_at - created_at)) as last_access_age_seconds,
    
    -- TTL status (for 1-hour expiration)
    CASE 
      WHEN created_at <= CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN 'should_be_expired'
      WHEN created_at <= CURRENT_TIMESTAMP - INTERVAL '50 minutes' THEN 'expiring_very_soon'
      WHEN created_at <= CURRENT_TIMESTAMP - INTERVAL '45 minutes' THEN 'expiring_soon'
      ELSE 'fresh'
    END as ttl_status,
    
    -- Cache effectiveness
    CASE 
      WHEN hit_count = 0 THEN 'unused'
      WHEN hit_count = 1 THEN 'single_use'
      WHEN hit_count <= 5 THEN 'low_usage'
      WHEN hit_count <= 20 THEN 'moderate_usage'
      ELSE 'high_usage'
    END as usage_category,
    
    -- Access pattern analysis
    hit_count / GREATEST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 60, 1) as hits_per_minute
    
  FROM cache_entries
  WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '2 hours' -- Include recently expired for analysis
)

SELECT 
  namespace,
  ttl_status,
  usage_category,
  
  COUNT(*) as entry_count,
  AVG(cache_age_seconds / 60) as avg_age_minutes,
  AVG(hit_count) as avg_hit_count,
  AVG(hits_per_minute) as avg_hits_per_minute,
  
  -- Efficiency metrics
  SUM(hit_count) as total_hits,
  COUNT(*) FILTER (WHERE hit_count = 0) as unused_entries,
  COUNT(*) FILTER (WHERE ttl_status = 'should_be_expired') as potentially_expired_entries,
  
  -- Cache utilization assessment
  ROUND(
    (COUNT(*) FILTER (WHERE hit_count > 1)::DECIMAL / COUNT(*)) * 100, 2
  ) as utilization_rate_percent,
  
  -- Performance indicators
  CASE 
    WHEN AVG(hits_per_minute) > 1 AND COUNT(*) FILTER (WHERE hit_count = 0) < COUNT(*) * 0.2 THEN 'excellent'
    WHEN AVG(hits_per_minute) > 0.5 AND COUNT(*) FILTER (WHERE hit_count = 0) < COUNT(*) * 0.4 THEN 'good'
    WHEN AVG(hits_per_minute) > 0.1 THEN 'acceptable'
    ELSE 'poor'
  END as performance_rating
  
FROM cache_analysis
GROUP BY namespace, ttl_status, usage_category
ORDER BY namespace, 
         CASE ttl_status 
           WHEN 'should_be_expired' THEN 1
           WHEN 'expiring_very_soon' THEN 2
           WHEN 'expiring_soon' THEN 3
           ELSE 4
         END,
         total_hits DESC;

-- Log analysis with retention awareness
WITH log_analysis AS (
  SELECT 
    source,
    level,
    timestamp,
    
    -- Age calculation
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp)) / 3600 as log_age_hours,
    
    -- Retention category based on table (debug vs standard)
    CASE 
      WHEN timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 'debug_retention'
      WHEN timestamp >= CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'standard_retention'
      ELSE 'expired_or_archived'
    END as retention_category,
    
    -- Time until expiration
    CASE 
      WHEN timestamp <= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 0
      ELSE EXTRACT(EPOCH FROM ((timestamp + INTERVAL '7 days') - CURRENT_TIMESTAMP)) / 3600
    END as hours_until_debug_expiration
    
  FROM (
    SELECT source, level, timestamp, 'debug' as log_type FROM application_logs_debug
    UNION ALL
    SELECT source, level, timestamp, 'standard' as log_type FROM application_logs_standard
  ) combined_logs
)

SELECT 
  source,
  level,
  retention_category,
  
  COUNT(*) as log_count,
  AVG(log_age_hours) as avg_age_hours,
  MIN(log_age_hours) as newest_log_age_hours,
  MAX(log_age_hours) as oldest_log_age_hours,
  
  -- Expiration timeline
  COUNT(*) FILTER (WHERE hours_until_debug_expiration <= 24 AND hours_until_debug_expiration > 0) as expiring_within_24h,
  COUNT(*) FILTER (WHERE hours_until_debug_expiration <= 168 AND hours_until_debug_expiration > 24) as expiring_within_week,
  
  -- Volume analysis by time periods
  COUNT(*) FILTER (WHERE log_age_hours <= 1) as last_hour_count,
  COUNT(*) FILTER (WHERE log_age_hours <= 24) as last_day_count,
  COUNT(*) FILTER (WHERE log_age_hours <= 168) as last_week_count,
  
  -- Log level distribution
  ROUND(
    (COUNT(*) FILTER (WHERE level IN ('error', 'fatal'))::DECIMAL / COUNT(*)) * 100, 2
  ) as error_percentage,
  
  -- Data lifecycle assessment
  CASE 
    WHEN retention_category = 'expired_or_archived' THEN 'cleanup_required'
    WHEN COUNT(*) FILTER (WHERE hours_until_debug_expiration <= 24) > COUNT(*) * 0.5 THEN 'high_turnover'
    WHEN COUNT(*) FILTER (WHERE log_age_hours <= 24) > COUNT(*) * 0.8 THEN 'recent_activity'
    ELSE 'normal_lifecycle'
  END as lifecycle_status
  
FROM log_analysis
GROUP BY source, level, retention_category
ORDER BY source, level, 
         CASE retention_category
           WHEN 'expired_or_archived' THEN 1
           WHEN 'debug_retention' THEN 2
           ELSE 3
         END;

-- TTL collection management and monitoring
-- Query to monitor TTL collection health and performance
WITH ttl_collection_stats AS (
  SELECT 
    'user_sessions' as collection_name,
    COUNT(*) as document_count,
    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP) as expired_documents,
    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 hour') as expiring_soon,
    MIN(created_at) as oldest_document,
    MAX(created_at) as newest_document,
    AVG(EXTRACT(EPOCH FROM (expires_at - created_at))) as avg_ttl_seconds
  FROM user_sessions
  
  UNION ALL
  
  SELECT 
    'cache_entries' as collection_name,
    COUNT(*) as document_count,
    -- For fixed TTL, calculate based on creation time + expiration period
    COUNT(*) FILTER (WHERE created_at <= CURRENT_TIMESTAMP - INTERVAL '1 hour') as expired_documents,
    COUNT(*) FILTER (WHERE created_at <= CURRENT_TIMESTAMP - INTERVAL '50 minutes') as expiring_soon,
    MIN(created_at) as oldest_document,
    MAX(created_at) as newest_document,
    3600 as avg_ttl_seconds  -- Fixed 1-hour TTL
  FROM cache_entries
)

SELECT 
  collection_name,
  document_count,
  expired_documents,
  expiring_soon,
  oldest_document,
  newest_document,
  avg_ttl_seconds / 3600 as avg_ttl_hours,
  
  -- Health indicators
  CASE 
    WHEN expired_documents > document_count * 0.1 THEN 'cleanup_needed'
    WHEN expiring_soon > document_count * 0.3 THEN 'high_turnover'
    WHEN document_count = 0 THEN 'empty'
    ELSE 'healthy'
  END as health_status,
  
  -- Performance metrics
  ROUND((expired_documents::DECIMAL / GREATEST(document_count, 1)) * 100, 2) as expired_percentage,
  ROUND((expiring_soon::DECIMAL / GREATEST(document_count, 1)) * 100, 2) as expiring_soon_percentage,
  
  -- Data lifecycle summary
  EXTRACT(EPOCH FROM (newest_document - oldest_document)) / 3600 as data_age_span_hours,
  
  -- Recommendations
  CASE 
    WHEN expired_documents > 1000 THEN 'Monitor TTL background task performance'
    WHEN expiring_soon > document_count * 0.5 THEN 'Consider adjusting TTL settings'
    WHEN document_count > 1000000 THEN 'Monitor storage usage and performance'
    ELSE 'Collection operating normally'
  END as recommendation
  
FROM ttl_collection_stats
ORDER BY document_count DESC;

-- QueryLeaf provides comprehensive TTL support:
-- 1. Automatic conversion of TTL table definitions to MongoDB TTL collections
-- 2. Intelligent TTL index creation with optimal expiration strategies
-- 3. Support for both fixed and document-specific expiration patterns
-- 4. Advanced TTL monitoring and performance analysis through familiar SQL queries
-- 5. Integration with MongoDB's native TTL background task optimization
-- 6. Comprehensive data lifecycle management and retention policy enforcement
-- 7. Real-time TTL health monitoring and alerting capabilities
-- 8. Familiar SQL patterns for complex TTL collection management workflows
```

## Best Practices for MongoDB TTL Collections

### TTL Strategy Design and Implementation

Essential principles for effective MongoDB TTL implementation:

1. **Expiration Strategy Selection**: Choose between document-specific and collection-wide expiration based on use case requirements
2. **Index Optimization**: Design TTL indexes to minimize impact on write operations and storage overhead
3. **Background Task Monitoring**: Monitor MongoDB's TTL background task performance and adjust configurations as needed
4. **Data Lifecycle Planning**: Implement comprehensive data lifecycle policies that align with business and compliance requirements
5. **Performance Considerations**: Balance TTL cleanup frequency with application performance and resource utilization
6. **Monitoring and Alerting**: Establish comprehensive monitoring for TTL collection health, expiration effectiveness, and storage optimization

### Production Deployment and Operations

Optimize TTL collections for enterprise production environments:

1. **Capacity Planning**: Design TTL policies to prevent storage bloat while maintaining necessary data availability
2. **Disaster Recovery**: Consider TTL implications for backup and recovery strategies
3. **Compliance Integration**: Align TTL policies with data retention regulations and audit requirements
4. **Performance Monitoring**: Implement detailed monitoring for TTL collection performance and resource impact
5. **Operational Procedures**: Establish procedures for TTL policy changes, emergency data retention, and cleanup verification
6. **Integration Testing**: Thoroughly test TTL behavior in staging environments before production deployment

## Conclusion

MongoDB TTL collections provide powerful native capabilities for automatic data lifecycle management that eliminate the complexity and maintenance overhead of traditional manual cleanup approaches. The intelligent document expiration system enables applications to maintain optimal performance and storage efficiency while ensuring consistent data retention policy enforcement without external dependencies or performance impact.

Key MongoDB TTL Collections benefits include:

- **Native Automation**: Built-in document expiration without external scheduling or application logic
- **Flexible Policies**: Support for both fixed collection-wide and document-specific expiration strategies
- **Performance Optimization**: Efficient background cleanup that minimizes impact on application operations
- **Storage Management**: Automatic storage optimization through intelligent document lifecycle management
- **Operational Simplicity**: Reduced maintenance overhead compared to manual cleanup procedures
- **SQL Accessibility**: Familiar SQL-style TTL management through QueryLeaf for accessible data lifecycle operations

Whether you're building session management systems, caching layers, logging platforms, or temporary data processing workflows, MongoDB TTL collections with QueryLeaf's familiar SQL interface provide the foundation for efficient, automated, and reliable data lifecycle management.

> **QueryLeaf Integration**: QueryLeaf automatically converts SQL table definitions with TTL specifications into optimized MongoDB TTL collections while providing familiar SQL syntax for TTL monitoring, analysis, and management. Advanced TTL patterns, retention policies, and lifecycle management are seamlessly handled through familiar SQL constructs, making sophisticated automatic data expiration both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's robust TTL capabilities with SQL-style data lifecycle management makes it an ideal platform for applications requiring both automatic data expiration and familiar database operation patterns, ensuring your data management workflows can scale efficiently while maintaining performance and compliance requirements.