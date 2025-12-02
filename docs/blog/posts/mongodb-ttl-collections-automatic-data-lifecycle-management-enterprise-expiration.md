---
title: "MongoDB TTL Collections and Automatic Data Lifecycle Management: Enterprise-Grade Data Expiration and Storage Optimization"
description: "Master MongoDB TTL (Time To Live) collections for automated data lifecycle management. Learn advanced expiration strategies, storage optimization, data retention policies, and SQL-familiar TTL patterns for enterprise data governance and compliance."
date: 2025-12-01
tags: [mongodb, ttl, data-lifecycle, expiration, storage-optimization, enterprise, sql, data-governance]
---

# MongoDB TTL Collections and Automatic Data Lifecycle Management: Enterprise-Grade Data Expiration and Storage Optimization

Modern applications generate massive amounts of time-sensitive data that requires intelligent lifecycle management to prevent storage bloat, maintain performance, and satisfy compliance requirements. Traditional relational databases provide limited automatic data expiration capabilities, often requiring complex batch jobs, manual cleanup procedures, or external scheduling systems that add operational overhead and complexity to data management workflows.

MongoDB TTL (Time To Live) collections provide native automatic data expiration capabilities with precise control over data retention policies, storage optimization, and compliance-driven data lifecycle management. Unlike traditional databases that require manual cleanup procedures and complex scheduling, MongoDB's TTL functionality automatically removes expired documents based on date field values, ensuring optimal storage utilization while maintaining query performance and operational simplicity.

## The Traditional Data Expiration Challenge

Conventional relational database data lifecycle management faces significant operational limitations:

```sql
-- Traditional PostgreSQL data expiration - manual cleanup with complex maintenance overhead

-- Session data management with manual expiration logic
CREATE TABLE user_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL,
    session_token VARCHAR(256) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours',
    last_activity TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Session metadata
    user_agent TEXT,
    ip_address INET,
    login_method VARCHAR(50),
    session_data JSONB,
    
    -- Security tracking
    is_active BOOLEAN DEFAULT TRUE,
    invalid_attempts INTEGER DEFAULT 0,
    security_flags TEXT[],
    
    -- Cleanup tracking
    cleanup_eligible BOOLEAN DEFAULT FALSE,
    cleanup_scheduled TIMESTAMP,
    
    -- Foreign key constraints
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Audit log table requiring manual retention management
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_type VARCHAR(100) NOT NULL,
    user_id INTEGER,
    
    -- Event details
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    action_performed VARCHAR(100),
    event_data JSONB,
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    session_id VARCHAR(100),
    
    -- Compliance and retention
    retention_category VARCHAR(50) NOT NULL DEFAULT 'standard',
    retention_expiry TIMESTAMP,
    compliance_flags TEXT[],
    
    -- Cleanup metadata
    marked_for_deletion BOOLEAN DEFAULT FALSE,
    deletion_scheduled TIMESTAMP,
    deletion_reason TEXT,
    
    -- Performance indexes
    INDEX idx_audit_event_timestamp (event_timestamp),
    INDEX idx_audit_user_id_timestamp (user_id, event_timestamp),
    INDEX idx_audit_retention_expiry (retention_expiry),
    INDEX idx_audit_cleanup_eligible (marked_for_deletion, deletion_scheduled)
);

-- Complex manual cleanup procedure with performance impact
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    cleanup_batch_size INTEGER := 10000;
    total_deleted INTEGER := 0;
    batch_deleted INTEGER;
    cleanup_start TIMESTAMP := CURRENT_TIMESTAMP;
    session_cursor CURSOR FOR 
        SELECT session_id, user_id, expires_at, last_activity
        FROM user_sessions
        WHERE (expires_at < CURRENT_TIMESTAMP OR 
               last_activity < CURRENT_TIMESTAMP - INTERVAL '7 days')
        AND cleanup_eligible = FALSE
        ORDER BY expires_at ASC
        LIMIT cleanup_batch_size;
    
    session_record RECORD;
    
BEGIN
    RAISE NOTICE 'Starting session cleanup process at %', cleanup_start;
    
    -- Mark sessions eligible for cleanup
    UPDATE user_sessions 
    SET cleanup_eligible = TRUE,
        cleanup_scheduled = CURRENT_TIMESTAMP
    WHERE (expires_at < CURRENT_TIMESTAMP OR 
           last_activity < CURRENT_TIMESTAMP - INTERVAL '7 days')
    AND cleanup_eligible = FALSE;
    
    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    RAISE NOTICE 'Marked % sessions for cleanup', batch_deleted;
    
    -- Process cleanup in batches to avoid long locks
    FOR session_record IN session_cursor LOOP
        BEGIN
            -- Log session termination for audit
            INSERT INTO audit_logs (
                event_type, user_id, resource_type, resource_id,
                action_performed, event_data, retention_category
            ) VALUES (
                'session_expired', session_record.user_id, 'session', 
                session_record.session_id::text, 'automatic_cleanup',
                jsonb_build_object(
                    'expired_at', session_record.expires_at,
                    'last_activity', session_record.last_activity,
                    'cleanup_reason', 'ttl_expiration',
                    'cleanup_timestamp', CURRENT_TIMESTAMP
                ),
                'session_management'
            );
            
            -- Remove expired session
            DELETE FROM user_sessions 
            WHERE session_id = session_record.session_id;
            
            total_deleted := total_deleted + 1;
            
            -- Commit periodically to avoid long transactions
            IF total_deleted % 1000 = 0 THEN
                COMMIT;
                RAISE NOTICE 'Progress: % sessions cleaned up', total_deleted;
            END IF;
            
        EXCEPTION
            WHEN foreign_key_violation THEN
                RAISE WARNING 'Foreign key constraint prevents deletion of session %', 
                    session_record.session_id;
            WHEN OTHERS THEN
                RAISE WARNING 'Error cleaning up session %: %', 
                    session_record.session_id, SQLERRM;
        END;
    END LOOP;
    
    -- Update cleanup statistics
    INSERT INTO cleanup_statistics (
        cleanup_type, cleanup_timestamp, records_processed,
        processing_duration, success_count, error_count
    ) VALUES (
        'session_cleanup', cleanup_start, total_deleted,
        CURRENT_TIMESTAMP - cleanup_start, total_deleted, 0
    );
    
    RAISE NOTICE 'Session cleanup completed: % sessions removed in %',
        total_deleted, CURRENT_TIMESTAMP - cleanup_start;
    
    RETURN total_deleted;
END;
$$ LANGUAGE plpgsql;

-- Audit log retention with complex policy management
CREATE OR REPLACE FUNCTION manage_audit_log_retention()
RETURNS INTEGER AS $$
DECLARE
    retention_policies RECORD;
    policy_cursor CURSOR FOR
        SELECT retention_category, retention_days, compliance_required
        FROM retention_policy_config
        WHERE active = TRUE;
        
    total_processed INTEGER := 0;
    category_processed INTEGER;
    retention_threshold TIMESTAMP;
    
BEGIN
    RAISE NOTICE 'Starting audit log retention management...';
    
    -- Process each retention policy
    FOR retention_policies IN policy_cursor LOOP
        retention_threshold := CURRENT_TIMESTAMP - (retention_policies.retention_days || ' days')::INTERVAL;
        
        -- Mark logs for deletion based on retention policy
        UPDATE audit_logs 
        SET marked_for_deletion = TRUE,
            deletion_scheduled = CURRENT_TIMESTAMP + INTERVAL '24 hours',
            deletion_reason = 'retention_policy_' || retention_policies.retention_category
        WHERE retention_category = retention_policies.retention_category
        AND event_timestamp < retention_threshold
        AND marked_for_deletion = FALSE
        AND (compliance_flags IS NULL OR NOT compliance_flags && ARRAY['litigation_hold', 'investigation_hold']);
        
        GET DIAGNOSTICS category_processed = ROW_COUNT;
        total_processed := total_processed + category_processed;
        
        RAISE NOTICE 'Retention policy %: marked % logs for deletion (threshold: %)',
            retention_policies.retention_category, category_processed, retention_threshold;
    END LOOP;
    
    -- Execute delayed deletion for logs past grace period
    DELETE FROM audit_logs 
    WHERE marked_for_deletion = TRUE 
    AND deletion_scheduled < CURRENT_TIMESTAMP
    AND (compliance_flags IS NULL OR NOT compliance_flags && ARRAY['litigation_hold']);
    
    GET DIAGNOSTICS category_processed = ROW_COUNT;
    RAISE NOTICE 'Deleted % audit logs past grace period', category_processed;
    
    RETURN total_processed;
END;
$$ LANGUAGE plpgsql;

-- Complex cache data management with manual expiration
CREATE TABLE application_cache (
    cache_key VARCHAR(500) PRIMARY KEY,
    cache_namespace VARCHAR(100) NOT NULL DEFAULT 'default',
    cache_value JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_accessed TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Cache metadata
    cache_size_bytes INTEGER,
    access_count INTEGER DEFAULT 1,
    cache_tags TEXT[],
    cache_priority INTEGER DEFAULT 5, -- 1 highest, 10 lowest
    
    -- Cleanup tracking
    cleanup_candidate BOOLEAN DEFAULT FALSE,
    
    -- Performance optimization indexes
    INDEX idx_cache_expires_at (expires_at),
    INDEX idx_cache_namespace_expires (cache_namespace, expires_at),
    INDEX idx_cache_cleanup_candidate (cleanup_candidate, expires_at)
);

-- Cache cleanup with performance considerations
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    cleanup_batch_size INTEGER := 5000;
    total_cleaned INTEGER := 0;
    batch_count INTEGER;
    cleanup_rounds INTEGER := 0;
    max_cleanup_rounds INTEGER := 20;
    
BEGIN
    RAISE NOTICE 'Starting cache cleanup process...';
    
    WHILE cleanup_rounds < max_cleanup_rounds LOOP
        -- Delete expired cache entries in batches
        DELETE FROM application_cache 
        WHERE cache_key IN (
            SELECT cache_key 
            FROM application_cache
            WHERE expires_at < CURRENT_TIMESTAMP
            ORDER BY expires_at ASC
            LIMIT cleanup_batch_size
        );
        
        GET DIAGNOSTICS batch_count = ROW_COUNT;
        
        IF batch_count = 0 THEN
            EXIT; -- No more expired entries
        END IF;
        
        total_cleaned := total_cleaned + batch_count;
        cleanup_rounds := cleanup_rounds + 1;
        
        RAISE NOTICE 'Cleanup round %: removed % expired cache entries', 
            cleanup_rounds, batch_count;
        
        -- Brief pause to avoid overwhelming the system
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    -- Additional cleanup for low-priority unused cache
    DELETE FROM application_cache 
    WHERE last_accessed < CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND cache_priority >= 8
    AND access_count <= 5;
    
    GET DIAGNOSTICS batch_count = ROW_COUNT;
    total_cleaned := total_cleaned + batch_count;
    
    RAISE NOTICE 'Cache cleanup completed: % total entries removed', total_cleaned;
    
    RETURN total_cleaned;
END;
$$ LANGUAGE plpgsql;

-- Scheduled cleanup job management (requires external cron)
CREATE TABLE cleanup_job_schedule (
    job_name VARCHAR(100) PRIMARY KEY,
    job_function VARCHAR(200) NOT NULL,
    schedule_expression VARCHAR(100) NOT NULL, -- Cron expression
    last_execution TIMESTAMP,
    next_execution TIMESTAMP,
    execution_count INTEGER DEFAULT 0,
    
    -- Job configuration
    enabled BOOLEAN DEFAULT TRUE,
    max_execution_time INTERVAL DEFAULT '2 hours',
    cleanup_batch_size INTEGER DEFAULT 10000,
    
    -- Performance tracking
    average_execution_time INTERVAL,
    total_records_processed BIGINT DEFAULT 0,
    last_records_processed INTEGER,
    
    -- Error handling
    last_error_message TEXT,
    consecutive_failures INTEGER DEFAULT 0,
    max_failures_allowed INTEGER DEFAULT 3
);

-- Insert cleanup job configurations
INSERT INTO cleanup_job_schedule (job_name, job_function, schedule_expression) VALUES
('session_cleanup', 'cleanup_expired_sessions()', '0 */6 * * *'), -- Every 6 hours
('audit_retention', 'manage_audit_log_retention()', '0 2 * * 0'),  -- Weekly at 2 AM
('cache_cleanup', 'cleanup_expired_cache()', '*/30 * * * *'),      -- Every 30 minutes
('temp_file_cleanup', 'cleanup_temporary_files()', '0 1 * * *');   -- Daily at 1 AM

-- Monitor cleanup job performance
WITH cleanup_performance AS (
    SELECT 
        job_name,
        last_execution,
        next_execution,
        execution_count,
        average_execution_time,
        total_records_processed,
        last_records_processed,
        consecutive_failures,
        
        -- Performance calculations
        CASE 
            WHEN execution_count > 0 AND total_records_processed > 0 THEN
                ROUND(total_records_processed::DECIMAL / execution_count::DECIMAL, 0)
            ELSE 0
        END as avg_records_per_execution,
        
        -- Health status
        CASE 
            WHEN consecutive_failures >= max_failures_allowed THEN 'failed'
            WHEN consecutive_failures > 0 THEN 'degraded'
            WHEN last_execution < CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 'overdue'
            ELSE 'healthy'
        END as job_health
        
    FROM cleanup_job_schedule
    WHERE enabled = TRUE
),

cleanup_recommendations AS (
    SELECT 
        cp.job_name,
        cp.job_health,
        cp.avg_records_per_execution,
        cp.average_execution_time,
        
        -- Optimization recommendations
        CASE 
            WHEN cp.job_health = 'failed' THEN 'Immediate attention: job failing consistently'
            WHEN cp.average_execution_time > INTERVAL '1 hour' THEN 'Performance issue: execution time too long'
            WHEN cp.avg_records_per_execution > 50000 THEN 'Consider smaller batch sizes to reduce lock contention'
            WHEN cp.consecutive_failures > 0 THEN 'Monitor job execution and error logs'
            ELSE 'Job performing within expected parameters'
        END as recommendation,
        
        -- Resource impact assessment
        CASE 
            WHEN cp.average_execution_time > INTERVAL '30 minutes' THEN 'high'
            WHEN cp.average_execution_time > INTERVAL '10 minutes' THEN 'medium'
            ELSE 'low'
        END as resource_impact
        
    FROM cleanup_performance cp
)

-- Generate cleanup management dashboard
SELECT 
    cr.job_name,
    cr.job_health,
    cr.avg_records_per_execution,
    cr.average_execution_time,
    cr.resource_impact,
    cr.recommendation,
    
    -- Next steps
    CASE cr.job_health
        WHEN 'failed' THEN 'Review error logs and fix underlying issues'
        WHEN 'degraded' THEN 'Monitor next execution and investigate intermittent failures'
        WHEN 'overdue' THEN 'Check job scheduler and execute manually if needed'
        ELSE 'Continue monitoring performance trends'
    END as next_actions,
    
    -- Operational guidance
    CASE 
        WHEN cr.resource_impact = 'high' THEN 'Schedule during low-traffic periods'
        WHEN cr.avg_records_per_execution > 100000 THEN 'Consider parallel processing'
        ELSE 'Current execution strategy is appropriate'
    END as operational_guidance
    
FROM cleanup_recommendations cr
ORDER BY 
    CASE cr.job_health
        WHEN 'failed' THEN 1
        WHEN 'degraded' THEN 2
        WHEN 'overdue' THEN 3
        ELSE 4
    END,
    cr.resource_impact DESC;

-- Problems with traditional data expiration management:
-- 1. Complex manual cleanup procedures requiring extensive procedural code and maintenance
-- 2. Performance impact from batch deletion operations affecting application responsiveness
-- 3. Resource-intensive cleanup jobs requiring careful scheduling and monitoring  
-- 4. Risk of data inconsistency during cleanup operations due to foreign key constraints
-- 5. Limited scalability for high-volume data expiration scenarios
-- 6. Manual configuration and maintenance of retention policies across different data types
-- 7. Complex error handling and recovery procedures for failed cleanup operations
-- 8. Difficulty coordinating cleanup across multiple tables with interdependencies
-- 9. Operational overhead of monitoring and maintaining cleanup job performance
-- 10. Risk of storage bloat if cleanup jobs fail or are disabled
```

MongoDB provides native TTL functionality with automatic data expiration and lifecycle management:

```javascript
// MongoDB TTL Collections - Native automatic data lifecycle management and expiration
const { MongoClient, ObjectId } = require('mongodb');

// Advanced MongoDB TTL Collection Manager with Enterprise Data Lifecycle Management
class MongoDBTTLManager {
  constructor(client, config = {}) {
    this.client = client;
    this.db = client.db(config.database || 'enterprise_data');
    
    this.config = {
      // TTL Configuration
      defaultTTLSeconds: config.defaultTTLSeconds || 86400, // 24 hours
      enableTTLMonitoring: config.enableTTLMonitoring !== false,
      enableExpirationAlerts: config.enableExpirationAlerts !== false,
      
      // Data lifecycle policies
      retentionPolicies: config.retentionPolicies || {},
      complianceMode: config.complianceMode || false,
      enableDataArchiving: config.enableDataArchiving || false,
      
      // Performance optimization
      enableBackgroundExpiration: config.enableBackgroundExpiration !== false,
      expirationBatchSize: config.expirationBatchSize || 1000,
      enableExpirationMetrics: config.enableExpirationMetrics !== false
    };
    
    // TTL collection management
    this.ttlCollections = new Map();
    this.retentionPolicies = new Map();
    this.expirationMetrics = new Map();
    
    this.initializeTTLManager();
  }

  async initializeTTLManager() {
    console.log('Initializing MongoDB TTL Collection Manager...');
    
    try {
      // Setup TTL collections for different data types
      await this.setupSessionTTLCollection();
      await this.setupAuditLogTTLCollection();
      await this.setupCacheTTLCollection();
      await this.setupTemporaryDataTTLCollection();
      await this.setupEventTTLCollection();
      
      // Initialize monitoring and metrics
      if (this.config.enableTTLMonitoring) {
        await this.initializeTTLMonitoring();
      }
      
      // Setup data lifecycle policies
      await this.configureDataLifecyclePolicies();
      
      console.log('MongoDB TTL Collection Manager initialized successfully');
      
    } catch (error) {
      console.error('Error initializing TTL manager:', error);
      throw error;
    }
  }

  async setupSessionTTLCollection() {
    console.log('Setting up session TTL collection...');
    
    try {
      const sessionCollection = this.db.collection('user_sessions');
      
      // Create TTL index on expiresAt field (24 hours)
      await sessionCollection.createIndex(
        { expiresAt: 1 }, 
        { 
          expireAfterSeconds: 0,  // Expire based on document date field value
          background: true,
          name: 'session_ttl_index'
        }
      );
      
      // Additional indexes for performance
      await sessionCollection.createIndexes([
        { key: { userId: 1, expiresAt: 1 }, background: true },
        { key: { sessionToken: 1 }, unique: true, background: true },
        { key: { lastActivity: -1 }, background: true },
        { key: { ipAddress: 1, createdAt: -1 }, background: true }
      ]);
      
      // Store TTL configuration
      this.ttlCollections.set('user_sessions', {
        collection: sessionCollection,
        ttlField: 'expiresAt',
        ttlSeconds: 0, // Document-controlled expiration
        retentionPolicy: 'session_management',
        complianceLevel: 'standard'
      });
      
      console.log('Session TTL collection configured with automatic expiration');
      
    } catch (error) {
      console.error('Error setting up session TTL collection:', error);
      throw error;
    }
  }

  async setupAuditLogTTLCollection() {
    console.log('Setting up audit log TTL collection with compliance requirements...');
    
    try {
      const auditCollection = this.db.collection('audit_logs');
      
      // Create TTL index for standard audit logs (90 days retention)
      await auditCollection.createIndex(
        { retentionExpiry: 1 },
        {
          expireAfterSeconds: 0, // Document-controlled expiration
          background: true,
          name: 'audit_retention_ttl_index',
          partialFilterExpression: {
            complianceHold: { $ne: true },
            retentionCategory: { $nin: ['critical', 'legal_hold'] }
          }
        }
      );
      
      // Performance indexes for audit queries
      await auditCollection.createIndexes([
        { key: { eventTimestamp: -1 }, background: true },
        { key: { userId: 1, eventTimestamp: -1 }, background: true },
        { key: { eventType: 1, eventTimestamp: -1 }, background: true },
        { key: { retentionCategory: 1, retentionExpiry: 1 }, background: true },
        { key: { complianceHold: 1 }, sparse: true, background: true }
      ]);
      
      this.ttlCollections.set('audit_logs', {
        collection: auditCollection,
        ttlField: 'retentionExpiry',
        ttlSeconds: 0,
        retentionPolicy: 'audit_compliance',
        complianceLevel: 'high',
        specialHandling: ['critical', 'legal_hold']
      });
      
      console.log('Audit log TTL collection configured with compliance controls');
      
    } catch (error) {
      console.error('Error setting up audit log TTL collection:', error);
      throw error;
    }
  }

  async setupCacheTTLCollection() {
    console.log('Setting up cache TTL collection for automatic cleanup...');
    
    try {
      const cacheCollection = this.db.collection('application_cache');
      
      // Create TTL index for cache expiration (immediate expiration when expired)
      await cacheCollection.createIndex(
        { expiresAt: 1 },
        {
          expireAfterSeconds: 60, // 1 minute grace period for cache cleanup
          background: true,
          name: 'cache_ttl_index'
        }
      );
      
      // Performance indexes for cache operations
      await cacheCollection.createIndexes([
        { key: { cacheKey: 1 }, unique: true, background: true },
        { key: { cacheNamespace: 1, cacheKey: 1 }, background: true },
        { key: { lastAccessed: -1 }, background: true },
        { key: { cachePriority: 1, expiresAt: 1 }, background: true }
      ]);
      
      this.ttlCollections.set('application_cache', {
        collection: cacheCollection,
        ttlField: 'expiresAt',
        ttlSeconds: 60, // Short grace period
        retentionPolicy: 'cache_management',
        complianceLevel: 'low'
      });
      
      console.log('Cache TTL collection configured for optimal performance');
      
    } catch (error) {
      console.error('Error setting up cache TTL collection:', error);
      throw error;
    }
  }

  async setupTemporaryDataTTLCollection() {
    console.log('Setting up temporary data TTL collection...');
    
    try {
      const tempCollection = this.db.collection('temporary_data');
      
      // Create TTL index for temporary data (1 hour default)
      await tempCollection.createIndex(
        { createdAt: 1 },
        {
          expireAfterSeconds: 3600, // 1 hour
          background: true,
          name: 'temp_data_ttl_index'
        }
      );
      
      // Additional indexes for temporary data queries
      await tempCollection.createIndexes([
        { key: { dataType: 1, createdAt: -1 }, background: true },
        { key: { userId: 1, dataType: 1 }, background: true },
        { key: { sessionId: 1 }, background: true, sparse: true }
      ]);
      
      this.ttlCollections.set('temporary_data', {
        collection: tempCollection,
        ttlField: 'createdAt',
        ttlSeconds: 3600,
        retentionPolicy: 'temporary_storage',
        complianceLevel: 'low'
      });
      
      console.log('Temporary data TTL collection configured');
      
    } catch (error) {
      console.error('Error setting up temporary data TTL collection:', error);
      throw error;
    }
  }

  async setupEventTTLCollection() {
    console.log('Setting up event TTL collection with tiered retention...');
    
    try {
      const eventCollection = this.db.collection('application_events');
      
      // Create compound TTL index with conditional expiration
      await eventCollection.createIndex(
        { retentionTier: 1, expiresAt: 1 },
        {
          expireAfterSeconds: 0, // Document-controlled
          background: true,
          name: 'event_tiered_ttl_index'
        }
      );
      
      // Performance indexes for event queries
      await eventCollection.createIndexes([
        { key: { eventTimestamp: -1 }, background: true },
        { key: { eventType: 1, eventTimestamp: -1 }, background: true },
        { key: { userId: 1, eventTimestamp: -1 }, background: true },
        { key: { retentionTier: 1, eventTimestamp: -1 }, background: true }
      ]);
      
      this.ttlCollections.set('application_events', {
        collection: eventCollection,
        ttlField: 'expiresAt',
        ttlSeconds: 0,
        retentionPolicy: 'tiered_retention',
        complianceLevel: 'medium',
        tiers: {
          'hot': 86400 * 7,    // 7 days
          'warm': 86400 * 30,  // 30 days  
          'cold': 86400 * 90   // 90 days
        }
      });
      
      console.log('Event TTL collection configured with tiered retention');
      
    } catch (error) {
      console.error('Error setting up event TTL collection:', error);
      throw error;
    }
  }

  async createSessionWithTTL(sessionData) {
    console.log('Creating user session with automatic TTL expiration...');
    
    try {
      const sessionCollection = this.db.collection('user_sessions');
      const expirationTime = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 hours
      
      const session = {
        _id: new ObjectId(),
        sessionToken: sessionData.sessionToken,
        userId: sessionData.userId,
        createdAt: new Date(),
        expiresAt: expirationTime, // TTL expiration field
        lastActivity: new Date(),
        
        // Session metadata
        userAgent: sessionData.userAgent,
        ipAddress: sessionData.ipAddress,
        loginMethod: sessionData.loginMethod || 'password',
        sessionData: sessionData.additionalData || {},
        
        // Security tracking
        isActive: true,
        invalidAttempts: 0,
        securityFlags: [],
        
        // TTL metadata
        ttlManaged: true,
        retentionPolicy: 'session_management'
      };
      
      const result = await sessionCollection.insertOne(session);
      
      // Update session metrics
      await this.updateTTLMetrics('user_sessions', 'created', session);
      
      console.log(`Session created with TTL expiration: ${result.insertedId}`);
      
      return {
        sessionId: result.insertedId,
        expiresAt: expirationTime,
        ttlEnabled: true
      };
      
    } catch (error) {
      console.error('Error creating session with TTL:', error);
      throw error;
    }
  }

  async createAuditLogWithRetention(auditData) {
    console.log('Creating audit log with compliance-driven retention...');
    
    try {
      const auditCollection = this.db.collection('audit_logs');
      
      // Calculate retention expiry based on data classification
      const retentionDays = this.calculateRetentionPeriod(auditData.retentionCategory);
      const retentionExpiry = new Date(Date.now() + (retentionDays * 24 * 60 * 60 * 1000));
      
      const auditLog = {
        _id: new ObjectId(),
        eventTimestamp: new Date(),
        eventType: auditData.eventType,
        userId: auditData.userId,
        
        // Event details
        resourceType: auditData.resourceType,
        resourceId: auditData.resourceId,
        actionPerformed: auditData.action,
        eventData: auditData.eventData || {},
        
        // Request context
        ipAddress: auditData.ipAddress,
        userAgent: auditData.userAgent,
        requestId: auditData.requestId,
        sessionId: auditData.sessionId,
        
        // Compliance and retention
        retentionCategory: auditData.retentionCategory || 'standard',
        retentionExpiry: retentionExpiry, // TTL expiration field
        complianceFlags: auditData.complianceFlags || [],
        complianceHold: auditData.complianceHold || false,
        
        // TTL metadata
        ttlManaged: !auditData.complianceHold,
        retentionDays: retentionDays,
        dataClassification: auditData.dataClassification || 'internal'
      };
      
      const result = await auditCollection.insertOne(auditLog);
      
      // Update audit metrics
      await this.updateTTLMetrics('audit_logs', 'created', auditLog);
      
      console.log(`Audit log created with ${retentionDays}-day retention: ${result.insertedId}`);
      
      return {
        auditId: result.insertedId,
        retentionExpiry: retentionExpiry,
        retentionDays: retentionDays,
        ttlEnabled: !auditData.complianceHold
      };
      
    } catch (error) {
      console.error('Error creating audit log with retention:', error);
      throw error;
    }
  }

  async createCacheEntryWithTTL(cacheData) {
    console.log('Creating cache entry with automatic expiration...');
    
    try {
      const cacheCollection = this.db.collection('application_cache');
      
      // Calculate cache expiration based on cache type and priority
      const ttlSeconds = this.calculateCacheTTL(cacheData.cacheType, cacheData.priority);
      const expirationTime = new Date(Date.now() + (ttlSeconds * 1000));
      
      const cacheEntry = {
        _id: new ObjectId(),
        cacheKey: cacheData.key,
        cacheNamespace: cacheData.namespace || 'default',
        cacheValue: cacheData.value,
        createdAt: new Date(),
        expiresAt: expirationTime, // TTL expiration field
        lastAccessed: new Date(),
        
        // Cache metadata
        cacheType: cacheData.cacheType || 'general',
        cacheSizeBytes: JSON.stringify(cacheData.value).length,
        accessCount: 1,
        cacheTags: cacheData.tags || [],
        cachePriority: cacheData.priority || 5,
        
        // TTL configuration
        ttlSeconds: ttlSeconds,
        ttlManaged: true
      };
      
      // Use upsert to handle cache key uniqueness
      const result = await cacheCollection.replaceOne(
        { cacheKey: cacheData.key },
        cacheEntry,
        { upsert: true }
      );
      
      // Update cache metrics
      await this.updateTTLMetrics('application_cache', 'created', cacheEntry);
      
      console.log(`Cache entry created with ${ttlSeconds}s TTL: ${cacheData.key}`);
      
      return {
        cacheKey: cacheData.key,
        expiresAt: expirationTime,
        ttlSeconds: ttlSeconds,
        upserted: result.upsertedCount > 0
      };
      
    } catch (error) {
      console.error('Error creating cache entry with TTL:', error);
      throw error;
    }
  }

  async createEventWithTieredRetention(eventData) {
    console.log('Creating event with tiered retention policy...');
    
    try {
      const eventCollection = this.db.collection('application_events');
      
      // Determine retention tier based on event importance
      const retentionTier = this.determineEventRetentionTier(eventData);
      const ttlConfig = this.ttlCollections.get('application_events').tiers;
      const ttlSeconds = ttlConfig[retentionTier];
      const expirationTime = new Date(Date.now() + (ttlSeconds * 1000));
      
      const event = {
        _id: new ObjectId(),
        eventTimestamp: new Date(),
        eventType: eventData.type,
        userId: eventData.userId,
        
        // Event payload
        eventData: eventData.data || {},
        eventSource: eventData.source || 'application',
        eventSeverity: eventData.severity || 'info',
        
        // Context information
        sessionId: eventData.sessionId,
        requestId: eventData.requestId,
        correlationId: eventData.correlationId,
        
        // Tiered retention
        retentionTier: retentionTier,
        expiresAt: expirationTime, // TTL expiration field
        retentionDays: Math.floor(ttlSeconds / 86400),
        
        // Event metadata
        eventVersion: eventData.version || '1.0',
        processingRequirements: eventData.processing || [],
        
        // TTL management
        ttlManaged: true,
        ttlTier: retentionTier
      };
      
      const result = await eventCollection.insertOne(event);
      
      // Update event metrics
      await this.updateTTLMetrics('application_events', 'created', event);
      
      console.log(`Event created with ${retentionTier} tier retention: ${result.insertedId}`);
      
      return {
        eventId: result.insertedId,
        retentionTier: retentionTier,
        expiresAt: expirationTime,
        retentionDays: Math.floor(ttlSeconds / 86400)
      };
      
    } catch (error) {
      console.error('Error creating event with tiered retention:', error);
      throw error;
    }
  }

  async updateTTLConfiguration(collectionName, newTTLSeconds) {
    console.log(`Updating TTL configuration for collection: ${collectionName}`);
    
    try {
      const collection = this.db.collection(collectionName);
      const ttlConfig = this.ttlCollections.get(collectionName);
      
      if (!ttlConfig) {
        throw new Error(`TTL configuration not found for collection: ${collectionName}`);
      }
      
      // Update TTL index
      await collection.dropIndex(ttlConfig.ttlField + '_1');
      await collection.createIndex(
        { [ttlConfig.ttlField]: 1 },
        {
          expireAfterSeconds: newTTLSeconds,
          background: true,
          name: `${ttlConfig.ttlField}_ttl_index`
        }
      );
      
      // Update configuration
      ttlConfig.ttlSeconds = newTTLSeconds;
      this.ttlCollections.set(collectionName, ttlConfig);
      
      console.log(`TTL configuration updated: ${collectionName} now expires after ${newTTLSeconds} seconds`);
      
      return {
        collection: collectionName,
        ttlSeconds: newTTLSeconds,
        updated: true
      };
      
    } catch (error) {
      console.error(`Error updating TTL configuration for ${collectionName}:`, error);
      throw error;
    }
  }

  // Utility methods for TTL management

  calculateRetentionPeriod(retentionCategory) {
    const retentionPolicies = {
      'session_management': 1,      // 1 day
      'standard': 90,               // 90 days
      'security': 365,              // 1 year
      'financial': 2555,            // 7 years
      'legal': 3650,                // 10 years
      'critical': 7300,             // 20 years
      'permanent': 0                // No expiration
    };
    
    return retentionPolicies[retentionCategory] || 90;
  }

  calculateCacheTTL(cacheType, priority) {
    const baseTTL = {
      'session': 1800,         // 30 minutes
      'user_data': 3600,       // 1 hour  
      'api_response': 300,     // 5 minutes
      'computed': 7200,        // 2 hours
      'static': 86400          // 24 hours
    };
    
    const base = baseTTL[cacheType] || 3600;
    
    // Adjust TTL based on priority (1 = highest, 10 = lowest)
    const priorityMultiplier = Math.max(0.5, Math.min(2.0, (11 - priority) / 5));
    
    return Math.floor(base * priorityMultiplier);
  }

  determineEventRetentionTier(eventData) {
    const eventType = eventData.type;
    const severity = eventData.severity || 'info';
    const importance = eventData.importance || 'standard';
    
    // Critical events get longest retention
    if (severity === 'critical' || importance === 'high') {
      return 'cold'; // 90 days
    }
    
    // Security and audit events get medium retention  
    if (eventType.includes('security') || eventType.includes('audit')) {
      return 'warm'; // 30 days
    }
    
    // Regular application events get short retention
    return 'hot'; // 7 days
  }

  async updateTTLMetrics(collectionName, operation, document) {
    if (!this.config.enableExpirationMetrics) return;
    
    const metrics = this.expirationMetrics.get(collectionName) || {
      created: 0,
      expired: 0,
      totalSize: 0,
      lastUpdated: new Date()
    };
    
    if (operation === 'created') {
      metrics.created++;
      metrics.totalSize += JSON.stringify(document).length;
    } else if (operation === 'expired') {
      metrics.expired++;
    }
    
    metrics.lastUpdated = new Date();
    this.expirationMetrics.set(collectionName, metrics);
  }

  async getTTLStatus() {
    console.log('Retrieving TTL status for all managed collections...');
    
    const status = {
      collections: {},
      summary: {
        totalCollections: this.ttlCollections.size,
        totalDocuments: 0,
        upcomingExpirations: 0,
        storageOptimization: 0
      }
    };
    
    for (const [collectionName, config] of this.ttlCollections) {
      try {
        const collection = config.collection;
        const stats = await collection.stats();
        
        // Count documents expiring soon (next 24 hours)
        const upcoming = await collection.countDocuments({
          [config.ttlField]: {
            $lte: new Date(Date.now() + 86400000) // 24 hours
          }
        });
        
        status.collections[collectionName] = {
          ttlField: config.ttlField,
          ttlSeconds: config.ttlSeconds,
          retentionPolicy: config.retentionPolicy,
          documentCount: stats.count,
          storageSize: stats.storageSize,
          upcomingExpirations: upcoming,
          lastChecked: new Date()
        };
        
        status.summary.totalDocuments += stats.count;
        status.summary.upcomingExpirations += upcoming;
        status.summary.storageOptimization += stats.storageSize;
        
      } catch (error) {
        console.error(`Error getting TTL status for ${collectionName}:`, error);
        status.collections[collectionName] = {
          error: error.message,
          lastChecked: new Date()
        };
      }
    }
    
    return status;
  }

  async getExpirationMetrics() {
    console.log('Retrieving comprehensive expiration metrics...');
    
    const metrics = {
      timestamp: new Date(),
      collections: {},
      summary: {
        totalCreated: 0,
        totalExpired: 0,
        storageReclaimed: 0,
        expirationEfficiency: 0
      }
    };
    
    for (const [collectionName, collectionMetrics] of this.expirationMetrics) {
      metrics.collections[collectionName] = {
        ...collectionMetrics,
        expirationRate: collectionMetrics.expired / Math.max(collectionMetrics.created, 1)
      };
      
      metrics.summary.totalCreated += collectionMetrics.created;
      metrics.summary.totalExpired += collectionMetrics.expired;
    }
    
    metrics.summary.expirationEfficiency = 
      metrics.summary.totalExpired / Math.max(metrics.summary.totalCreated, 1);
    
    return metrics;
  }

  async cleanup() {
    console.log('Cleaning up TTL Manager resources...');
    
    // Clear monitoring intervals and cleanup resources
    this.ttlCollections.clear();
    this.retentionPolicies.clear();
    this.expirationMetrics.clear();
    
    console.log('TTL Manager cleanup completed');
  }
}

// Example usage for enterprise data lifecycle management
async function demonstrateEnterpriseDataLifecycle() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  const ttlManager = new MongoDBTTLManager(client, {
    database: 'enterprise_lifecycle',
    enableTTLMonitoring: true,
    enableExpirationMetrics: true,
    complianceMode: true
  });
  
  try {
    // Create session with automatic 24-hour expiration
    const session = await ttlManager.createSessionWithTTL({
      sessionToken: 'session_' + Date.now(),
      userId: 'user_12345',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      ipAddress: '192.168.1.100',
      loginMethod: 'password'
    });
    
    // Create audit log with compliance-driven retention
    const auditLog = await ttlManager.createAuditLogWithRetention({
      eventType: 'user_login',
      userId: 'user_12345',
      resourceType: 'authentication',
      action: 'login_success',
      retentionCategory: 'security', // 365 days retention
      ipAddress: '192.168.1.100',
      eventData: {
        loginMethod: 'password',
        mfaUsed: true,
        riskScore: 'low'
      }
    });
    
    // Create cache entry with priority-based TTL
    const cacheEntry = await ttlManager.createCacheEntryWithTTL({
      key: 'user_preferences_12345',
      namespace: 'user_data',
      value: {
        theme: 'dark',
        language: 'en',
        timezone: 'UTC',
        notifications: true
      },
      cacheType: 'user_data',
      priority: 3, // High priority = longer TTL
      tags: ['preferences', 'user_settings']
    });
    
    // Create event with tiered retention
    const event = await ttlManager.createEventWithTieredRetention({
      type: 'page_view',
      userId: 'user_12345',
      severity: 'info',
      data: {
        page: '/dashboard',
        duration: 1500,
        interactions: 5
      },
      source: 'web_app',
      sessionId: session.sessionId.toString()
    });
    
    // Get TTL status and metrics
    const ttlStatus = await ttlManager.getTTLStatus();
    const expirationMetrics = await ttlManager.getExpirationMetrics();
    
    console.log('Enterprise Data Lifecycle Management Results:');
    console.log('Session:', session);
    console.log('Audit Log:', auditLog);
    console.log('Cache Entry:', cacheEntry);
    console.log('Event:', event);
    console.log('TTL Status:', JSON.stringify(ttlStatus, null, 2));
    console.log('Expiration Metrics:', JSON.stringify(expirationMetrics, null, 2));
    
    return {
      session,
      auditLog,
      cacheEntry,
      event,
      ttlStatus,
      expirationMetrics
    };
    
  } catch (error) {
    console.error('Error demonstrating enterprise data lifecycle:', error);
    throw error;
  } finally {
    await ttlManager.cleanup();
    await client.close();
  }
}

// Benefits of MongoDB TTL Collections:
// - Native automatic data expiration eliminates complex manual cleanup procedures
// - Document-level TTL control with flexible expiration policies based on business requirements
// - Zero performance impact on application operations with background expiration processing
// - Compliance-friendly retention management with audit trails and legal hold capabilities  
// - Intelligent storage optimization with automatic document removal and space reclamation
// - Scalable data lifecycle management that handles high-volume data expiration scenarios
// - Enterprise-grade monitoring and metrics for data retention and compliance reporting
// - Seamless integration with MongoDB's document model and indexing capabilities

module.exports = {
  MongoDBTTLManager,
  demonstrateEnterpriseDataLifecycle
};
```

## SQL-Style TTL Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB TTL collections and data lifecycle management:

```sql
-- QueryLeaf TTL collections with SQL-familiar data lifecycle management syntax

-- Configure TTL collections and expiration policies
SET ttl_monitoring_enabled = true;
SET ttl_expiration_alerts = true;
SET default_ttl_seconds = 86400; -- 24 hours
SET enable_compliance_mode = true;
SET enable_data_archiving = true;

-- Create TTL-managed collections with expiration policies
WITH ttl_collection_configuration AS (
  SELECT 
    -- Collection TTL configurations
    'user_sessions' as collection_name,
    'expiresAt' as ttl_field,
    0 as ttl_seconds, -- Document-controlled expiration
    'session_management' as retention_policy,
    24 * 3600 as default_session_ttl_seconds,
    
    -- Index configuration
    JSON_BUILD_OBJECT(
      'ttl_index', JSON_BUILD_OBJECT(
        'field', 'expiresAt',
        'expireAfterSeconds', 0,
        'background', true
      ),
      'performance_indexes', ARRAY[
        JSON_BUILD_OBJECT('fields', JSON_BUILD_OBJECT('userId', 1, 'expiresAt', 1)),
        JSON_BUILD_OBJECT('fields', JSON_BUILD_OBJECT('sessionToken', 1), 'unique', true),
        JSON_BUILD_OBJECT('fields', JSON_BUILD_OBJECT('lastActivity', -1))
      ]
    ) as index_configuration
    
  UNION ALL
  
  SELECT 
    'audit_logs' as collection_name,
    'retentionExpiry' as ttl_field,
    0 as ttl_seconds, -- Document-controlled with compliance
    'audit_compliance' as retention_policy,
    90 * 24 * 3600 as default_audit_ttl_seconds,
    
    JSON_BUILD_OBJECT(
      'ttl_index', JSON_BUILD_OBJECT(
        'field', 'retentionExpiry',
        'expireAfterSeconds', 0,
        'background', true,
        'partial_filter', JSON_BUILD_OBJECT(
          'complianceHold', JSON_BUILD_OBJECT('$ne', true),
          'retentionCategory', JSON_BUILD_OBJECT('$nin', ARRAY['critical', 'legal_hold'])
        )
      ),
      'performance_indexes', ARRAY[
        JSON_BUILD_OBJECT('fields', JSON_BUILD_OBJECT('eventTimestamp', -1)),
        JSON_BUILD_OBJECT('fields', JSON_BUILD_OBJECT('userId', 1, 'eventTimestamp', -1)),
        JSON_BUILD_OBJECT('fields', JSON_BUILD_OBJECT('retentionCategory', 1, 'retentionExpiry', 1))
      ]
    ) as index_configuration
    
  UNION ALL
  
  SELECT 
    'application_cache' as collection_name,
    'expiresAt' as ttl_field,
    60 as ttl_seconds, -- 1 minute grace period
    'cache_management' as retention_policy,
    3600 as default_cache_ttl_seconds, -- 1 hour
    
    JSON_BUILD_OBJECT(
      'ttl_index', JSON_BUILD_OBJECT(
        'field', 'expiresAt',
        'expireAfterSeconds', 60,
        'background', true
      ),
      'performance_indexes', ARRAY[
        JSON_BUILD_OBJECT('fields', JSON_BUILD_OBJECT('cacheKey', 1), 'unique', true),
        JSON_BUILD_OBJECT('fields', JSON_BUILD_OBJECT('cacheNamespace', 1, 'cacheKey', 1)),
        JSON_BUILD_OBJECT('fields', JSON_BUILD_OBJECT('cachePriority', 1, 'expiresAt', 1))
      ]
    ) as index_configuration
),

-- Data retention policy definitions
retention_policy_definitions AS (
  SELECT 
    policy_name,
    retention_days,
    compliance_level,
    auto_expiration,
    archive_before_expiration,
    legal_hold_exempt,
    
    -- TTL calculation
    retention_days * 24 * 3600 as retention_seconds,
    
    -- Policy rules
    CASE policy_name
      WHEN 'session_management' THEN 'Expire user sessions after inactivity period'
      WHEN 'audit_compliance' THEN 'Retain audit logs per compliance requirements'
      WHEN 'cache_management' THEN 'Optimize cache storage with automatic cleanup'
      WHEN 'temporary_storage' THEN 'Remove temporary data after processing'
      WHEN 'event_analytics' THEN 'Tiered retention for application events'
    END as policy_description,
    
    -- Compliance requirements
    CASE compliance_level
      WHEN 'high' THEN ARRAY['audit_trail', 'legal_hold_support', 'data_classification']
      WHEN 'medium' THEN ARRAY['audit_trail', 'data_classification'] 
      ELSE ARRAY['basic_logging']
    END as compliance_requirements
    
  FROM (VALUES
    ('session_management', 1, 'medium', true, false, true),
    ('audit_compliance', 90, 'high', true, true, false),
    ('security_logs', 365, 'high', true, true, false),
    ('cache_management', 0, 'low', true, false, true), -- Immediate expiration
    ('temporary_storage', 1, 'low', true, false, true),
    ('event_analytics', 30, 'medium', true, false, true),
    ('financial_records', 2555, 'critical', false, true, false), -- 7 years
    ('legal_documents', 3650, 'critical', false, true, false)    -- 10 years
  ) AS policies(policy_name, retention_days, compliance_level, auto_expiration, archive_before_expiration, legal_hold_exempt)
),

-- Create session data with automatic TTL expiration
session_ttl_operations AS (
  INSERT INTO user_sessions_ttl
  SELECT 
    GENERATE_UUID() as session_id,
    'user_' || generate_series(1, 1000) as user_id,
    'session_token_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) || '_' || generate_series(1, 1000) as session_token,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP + INTERVAL '24 hours' as expires_at, -- TTL expiration field
    CURRENT_TIMESTAMP as last_activity,
    
    -- Session metadata
    'Mozilla/5.0 (compatible; Enterprise App)' as user_agent,
    ('192.168.1.' || (1 + random() * 254)::int)::inet as ip_address,
    'password' as login_method,
    JSON_BUILD_OBJECT(
      'preferences', JSON_BUILD_OBJECT('theme', 'dark', 'language', 'en'),
      'permissions', ARRAY['read', 'write'],
      'mfa_verified', true
    ) as session_data,
    
    -- Security and TTL metadata
    true as is_active,
    0 as invalid_attempts,
    ARRAY[]::text[] as security_flags,
    true as ttl_managed,
    'session_management' as retention_policy
  RETURNING session_id, expires_at
),

-- Create audit logs with compliance-driven TTL
audit_log_ttl_operations AS (
  INSERT INTO audit_logs_ttl
  SELECT 
    GENERATE_UUID() as log_id,
    CURRENT_TIMESTAMP - (random() * INTERVAL '30 days') as event_timestamp,
    
    -- Event details
    (ARRAY['user_login', 'data_access', 'permission_change', 'security_event', 'system_action'])
      [1 + floor(random() * 5)] as event_type,
    'user_' || (1 + floor(random() * 100)) as user_id,
    'resource_' || (1 + floor(random() * 500)) as resource_id,
    (ARRAY['create', 'read', 'update', 'delete', 'execute'])
      [1 + floor(random() * 5)] as action_performed,
    
    -- Compliance and retention
    (ARRAY['standard', 'security', 'financial', 'legal'])
      [1 + floor(random() * 4)] as retention_category,
    
    -- Calculate retention expiry based on category
    CASE retention_category
      WHEN 'standard' THEN CURRENT_TIMESTAMP + INTERVAL '90 days'
      WHEN 'security' THEN CURRENT_TIMESTAMP + INTERVAL '365 days'  
      WHEN 'financial' THEN CURRENT_TIMESTAMP + INTERVAL '2555 days' -- 7 years
      WHEN 'legal' THEN CURRENT_TIMESTAMP + INTERVAL '3650 days'     -- 10 years
    END as retention_expiry, -- TTL expiration field
    
    -- Compliance flags and controls
    CASE WHEN random() < 0.1 THEN ARRAY['sensitive_data'] ELSE ARRAY[]::text[] END as compliance_flags,
    CASE WHEN random() < 0.05 THEN true ELSE false END as compliance_hold, -- Prevents TTL expiration
    
    -- Event data and context
    JSON_BUILD_OBJECT(
      'user_agent', 'Mozilla/5.0 (Enterprise Browser)',
      'ip_address', '192.168.' || (1 + floor(random() * 254)) || '.' || (1 + floor(random() * 254)),
      'request_id', 'req_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP),
      'session_duration', floor(random() * 3600),
      'data_size', floor(random() * 10000)
    ) as event_data,
    
    -- TTL management metadata
    CASE WHEN compliance_hold THEN false ELSE true END as ttl_managed,
    'audit_compliance' as retention_policy_applied
  RETURNING log_id, retention_category, retention_expiry, compliance_hold
),

-- Create cache entries with priority-based TTL
cache_ttl_operations AS (
  INSERT INTO application_cache_ttl
  SELECT 
    'cache_key_' || generate_series(1, 5000) as cache_key,
    (ARRAY['user_data', 'api_responses', 'computed_results', 'session_data', 'static_content'])
      [1 + floor(random() * 5)] as cache_namespace,
    
    -- Cache value and metadata
    JSON_BUILD_OBJECT(
      'data', 'cached_data_' || generate_series(1, 5000),
      'computed_at', CURRENT_TIMESTAMP,
      'version', '1.0'
    ) as cache_value,
    
    CURRENT_TIMESTAMP as created_at,
    
    -- Priority-based TTL calculation
    CASE cache_namespace
      WHEN 'user_data' THEN CURRENT_TIMESTAMP + INTERVAL '1 hour'
      WHEN 'api_responses' THEN CURRENT_TIMESTAMP + INTERVAL '5 minutes'
      WHEN 'computed_results' THEN CURRENT_TIMESTAMP + INTERVAL '2 hours'
      WHEN 'session_data' THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
      WHEN 'static_content' THEN CURRENT_TIMESTAMP + INTERVAL '24 hours'
    END as expires_at, -- TTL expiration field
    
    CURRENT_TIMESTAMP as last_accessed,
    
    -- Cache optimization metadata
    (1 + floor(random() * 10)) as cache_priority, -- 1 = highest, 10 = lowest
    JSON_LENGTH(cache_value::text) as cache_size_bytes,
    1 as access_count,
    ARRAY['generated', 'optimized'] as cache_tags,
    true as ttl_managed
  RETURNING cache_key, cache_namespace, expires_at
),

-- Monitor TTL operations and expiration patterns
ttl_monitoring_metrics AS (
  SELECT 
    collection_name,
    retention_policy,
    
    -- Document lifecycle metrics
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE ttl_managed = true) as ttl_managed_documents,
    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 hour') as expiring_soon,
    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP + INTERVAL '24 hours') as expiring_today,
    
    -- TTL efficiency analysis
    AVG(EXTRACT(EPOCH FROM (expires_at - created_at))) as avg_ttl_duration_seconds,
    MIN(expires_at) as next_expiration,
    MAX(expires_at) as latest_expiration,
    
    -- Storage optimization metrics
    SUM(COALESCE(JSON_LENGTH(session_data::text), JSON_LENGTH(cache_value::text), JSON_LENGTH(event_data::text), 0)) as total_storage_bytes,
    AVG(COALESCE(JSON_LENGTH(session_data::text), JSON_LENGTH(cache_value::text), JSON_LENGTH(event_data::text), 0)) as avg_document_size_bytes,
    
    -- Retention policy distribution
    MODE() WITHIN GROUP (ORDER BY retention_policy) as primary_retention_policy,
    
    -- Compliance tracking
    COUNT(*) FILTER (WHERE compliance_hold = true) as compliance_hold_count,
    COUNT(*) FILTER (WHERE compliance_flags IS NOT NULL AND array_length(compliance_flags, 1) > 0) as compliance_flagged
    
  FROM (
    -- Union all TTL-managed collections
    SELECT 'user_sessions' as collection_name, retention_policy, ttl_managed, 
           created_at, expires_at, session_data as data_field, 
           NULL::text[] as compliance_flags, false as compliance_hold
    FROM session_ttl_operations
    
    UNION ALL
    
    SELECT 'audit_logs' as collection_name, retention_policy_applied as retention_policy, ttl_managed,
           event_timestamp as created_at, retention_expiry as expires_at, event_data as data_field,
           compliance_flags, compliance_hold
    FROM audit_log_ttl_operations
    
    UNION ALL
    
    SELECT 'application_cache' as collection_name, 'cache_management' as retention_policy, ttl_managed,
           created_at, expires_at, cache_value as data_field,
           NULL::text[] as compliance_flags, false as compliance_hold
    FROM cache_ttl_operations
  ) combined_ttl_data
  GROUP BY collection_name, retention_policy
),

-- TTL performance and optimization analysis
ttl_optimization_analysis AS (
  SELECT 
    tmm.collection_name,
    tmm.retention_policy,
    tmm.total_documents,
    tmm.ttl_managed_documents,
    
    -- Expiration timeline
    tmm.expiring_soon,
    tmm.expiring_today,
    tmm.next_expiration,
    tmm.latest_expiration,
    
    -- Storage and performance metrics
    ROUND(tmm.total_storage_bytes / (1024 * 1024)::decimal, 2) as total_storage_mb,
    ROUND(tmm.avg_document_size_bytes / 1024::decimal, 2) as avg_document_size_kb,
    ROUND(tmm.avg_ttl_duration_seconds / 3600::decimal, 2) as avg_ttl_duration_hours,
    
    -- TTL efficiency assessment
    CASE 
      WHEN tmm.ttl_managed_documents::decimal / tmm.total_documents > 0.9 THEN 'highly_optimized'
      WHEN tmm.ttl_managed_documents::decimal / tmm.total_documents > 0.7 THEN 'well_optimized'
      WHEN tmm.ttl_managed_documents::decimal / tmm.total_documents > 0.5 THEN 'moderately_optimized'
      ELSE 'needs_optimization'
    END as ttl_optimization_level,
    
    -- Storage optimization potential
    CASE 
      WHEN tmm.expiring_today > tmm.total_documents * 0.1 THEN 'significant_storage_reclaim_expected'
      WHEN tmm.expiring_today > tmm.total_documents * 0.05 THEN 'moderate_storage_reclaim_expected'  
      WHEN tmm.expiring_today > 0 THEN 'minimal_storage_reclaim_expected'
      ELSE 'no_immediate_storage_reclaim'
    END as storage_optimization_forecast,
    
    -- Compliance assessment
    CASE 
      WHEN tmm.compliance_hold_count > 0 THEN 'compliance_holds_active'
      WHEN tmm.compliance_flagged > tmm.total_documents * 0.1 THEN 'high_compliance_requirements'
      WHEN tmm.compliance_flagged > 0 THEN 'moderate_compliance_requirements'
      ELSE 'standard_compliance_requirements'
    END as compliance_status,
    
    -- Operational recommendations
    CASE 
      WHEN tmm.avg_ttl_duration_seconds < 3600 THEN 'Consider longer TTL for performance'
      WHEN tmm.avg_ttl_duration_seconds > 86400 * 30 THEN 'Review long retention periods'
      WHEN tmm.expiring_soon > 1000 THEN 'High expiration volume - monitor performance'
      ELSE 'TTL configuration appropriate'
    END as operational_recommendation
    
  FROM ttl_monitoring_metrics tmm
),

-- Generate comprehensive TTL management dashboard
ttl_dashboard_comprehensive AS (
  SELECT 
    toa.collection_name,
    toa.retention_policy,
    
    -- Current status
    toa.total_documents,
    toa.ttl_managed_documents,
    ROUND((toa.ttl_managed_documents::decimal / toa.total_documents::decimal) * 100, 1) as ttl_coverage_percent,
    
    -- Expiration schedule
    toa.expiring_soon,
    toa.expiring_today,
    TO_CHAR(toa.next_expiration, 'YYYY-MM-DD HH24:MI:SS') as next_expiration_time,
    
    -- Storage metrics
    toa.total_storage_mb,
    toa.avg_document_size_kb,
    toa.avg_ttl_duration_hours,
    
    -- Optimization status
    toa.ttl_optimization_level,
    toa.storage_optimization_forecast,
    toa.compliance_status,
    toa.operational_recommendation,
    
    -- Retention policy details
    rpd.retention_days,
    rpd.compliance_level,
    rpd.auto_expiration,
    rpd.legal_hold_exempt,
    
    -- Performance projections
    CASE 
      WHEN toa.expiring_today > 0 THEN 
        ROUND((toa.expiring_today * toa.avg_document_size_kb) / 1024, 2)
      ELSE 0
    END as projected_storage_reclaim_mb,
    
    -- Action priorities
    CASE 
      WHEN toa.ttl_optimization_level = 'needs_optimization' THEN 'high'
      WHEN toa.compliance_status = 'compliance_holds_active' THEN 'high'
      WHEN toa.expiring_soon > 1000 THEN 'medium'
      WHEN toa.storage_optimization_forecast LIKE '%significant%' THEN 'medium'
      ELSE 'low'
    END as action_priority,
    
    -- Specific action items
    ARRAY[
      CASE WHEN toa.ttl_optimization_level = 'needs_optimization' 
           THEN 'Implement TTL for remaining ' || (toa.total_documents - toa.ttl_managed_documents) || ' documents' END,
      CASE WHEN toa.compliance_status = 'compliance_holds_active'
           THEN 'Review active compliance holds and update retention policies' END,
      CASE WHEN toa.expiring_soon > 1000
           THEN 'Monitor system performance during high-volume expiration period' END,
      CASE WHEN toa.operational_recommendation != 'TTL configuration appropriate'
           THEN toa.operational_recommendation END
    ] as action_items
    
  FROM ttl_optimization_analysis toa
  LEFT JOIN retention_policy_definitions rpd ON toa.retention_policy = rpd.policy_name
)

-- Final comprehensive TTL management report
SELECT 
  tdc.collection_name,
  tdc.retention_policy,
  tdc.compliance_level,
  
  -- Current state
  tdc.total_documents,
  tdc.ttl_coverage_percent || '%' as ttl_coverage,
  tdc.total_storage_mb || ' MB' as current_storage,
  
  -- Expiration schedule
  tdc.expiring_soon as expiring_next_hour,
  tdc.expiring_today as expiring_next_24h,
  tdc.next_expiration_time,
  
  -- Optimization assessment  
  tdc.ttl_optimization_level,
  tdc.storage_optimization_forecast,
  tdc.projected_storage_reclaim_mb || ' MB' as storage_reclaim_potential,
  
  -- Operational guidance
  tdc.action_priority,
  tdc.operational_recommendation,
  array_to_string(
    array_remove(tdc.action_items, NULL), 
    '; '
  ) as specific_action_items,
  
  -- Configuration recommendations
  CASE 
    WHEN tdc.ttl_coverage_percent < 70 THEN 
      'Enable TTL for ' || (100 - tdc.ttl_coverage_percent) || '% of documents to improve storage efficiency'
    WHEN tdc.avg_ttl_duration_hours > 720 THEN  -- 30 days
      'Review extended retention periods for compliance requirements'
    WHEN tdc.projected_storage_reclaim_mb > 100 THEN
      'Significant storage optimization opportunity available'
    ELSE 'TTL configuration optimized for current workload'
  END as configuration_guidance,
  
  -- Compliance and governance
  tdc.compliance_status,
  CASE 
    WHEN tdc.legal_hold_exempt = false THEN 'Legal hold procedures apply'
    WHEN tdc.auto_expiration = false THEN 'Manual expiration required'
    ELSE 'Automatic expiration enabled'
  END as governance_status,
  
  -- Performance impact assessment
  CASE 
    WHEN tdc.expiring_soon > 5000 THEN 'Monitor database performance during expiration'
    WHEN tdc.expiring_today > 10000 THEN 'Schedule expiration during low-traffic periods'
    WHEN tdc.total_storage_mb > 1000 THEN 'Storage optimization will improve query performance'
    ELSE 'Minimal performance impact expected'
  END as performance_impact_assessment,
  
  -- Success metrics
  JSON_BUILD_OBJECT(
    'storage_efficiency', ROUND(tdc.projected_storage_reclaim_mb / NULLIF(tdc.total_storage_mb, 0) * 100, 1),
    'automation_coverage', tdc.ttl_coverage_percent,
    'compliance_alignment', CASE WHEN tdc.compliance_status LIKE '%high%' THEN 'high' ELSE 'standard' END,
    'operational_maturity', tdc.ttl_optimization_level
  ) as success_metrics

FROM ttl_dashboard_comprehensive tdc
ORDER BY 
  CASE tdc.action_priority
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    ELSE 3
  END,
  tdc.total_storage_mb DESC;

-- QueryLeaf provides comprehensive MongoDB TTL capabilities:
-- 1. Native automatic data expiration with SQL-familiar TTL configuration syntax
-- 2. Compliance-driven retention policies with legal hold and audit trail support
-- 3. Intelligent TTL optimization based on data classification and access patterns  
-- 4. Performance monitoring with storage optimization and expiration forecasting
-- 5. Enterprise governance with retention policy management and compliance reporting
-- 6. Scalable data lifecycle management that handles high-volume expiration scenarios
-- 7. Integration with MongoDB's background TTL processing and index optimization
-- 8. SQL-style TTL operations for familiar data lifecycle management workflows
-- 9. Advanced analytics for TTL performance, storage optimization, and compliance tracking
-- 10. Automated recommendations for TTL configuration and data retention optimization
```

## Best Practices for MongoDB TTL Implementation

### Enterprise Data Lifecycle Management

Essential practices for implementing TTL collections effectively:

1. **TTL Strategy Design**: Plan TTL configurations based on data classification, compliance requirements, and business value
2. **Performance Considerations**: Monitor TTL processing impact and optimize index configurations for efficient expiration
3. **Compliance Integration**: Implement legal hold capabilities and audit trails for regulated data retention  
4. **Storage Optimization**: Use TTL to maintain optimal storage utilization while preserving query performance
5. **Monitoring and Alerting**: Establish comprehensive monitoring for TTL operations and expiration patterns
6. **Backup Coordination**: Ensure backup strategies account for TTL expiration and data lifecycle requirements

### Production Deployment and Scalability

Optimize TTL collections for enterprise-scale requirements:

1. **Index Strategy**: Design efficient compound indexes that support both TTL expiration and query patterns
2. **Capacity Planning**: Plan for TTL processing overhead and storage optimization benefits in capacity models
3. **High Availability**: Implement TTL collections across replica sets with consistent expiration behavior
4. **Operational Excellence**: Create standardized procedures for TTL configuration, monitoring, and compliance
5. **Integration Patterns**: Design application integration patterns that leverage TTL for optimal data lifecycle management
6. **Performance Baselines**: Establish performance baselines for TTL operations and storage optimization metrics

## Conclusion

MongoDB TTL collections provide comprehensive automatic data lifecycle management that eliminates manual cleanup procedures, ensures compliance-driven retention, and maintains optimal storage utilization through intelligent document expiration. The native TTL functionality integrates seamlessly with MongoDB's document model and indexing capabilities to deliver enterprise-grade data lifecycle management.

Key MongoDB TTL Collection benefits include:

- **Automatic Expiration**: Native document expiration eliminates manual cleanup procedures and operational overhead
- **Flexible Policies**: Document-level and collection-level TTL control with compliance-driven retention management
- **Zero Performance Impact**: Background expiration processing with no impact on application performance
- **Storage Optimization**: Automatic storage reclamation and space optimization through intelligent document removal
- **Enterprise Compliance**: Legal hold capabilities and audit trails for regulated data retention requirements
- **SQL Accessibility**: Familiar TTL management operations through SQL-style syntax and configuration

Whether you're managing session data, audit logs, cache entries, or any time-sensitive information, MongoDB TTL collections with QueryLeaf's familiar SQL interface provide the foundation for scalable, compliant, and efficient data lifecycle management.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB TTL collections while providing SQL-familiar syntax for data lifecycle management, retention policy configuration, and expiration monitoring. Advanced TTL patterns, compliance controls, and storage optimization strategies are seamlessly accessible through familiar SQL constructs, making sophisticated data lifecycle management both powerful and approachable for SQL-oriented teams.

The combination of MongoDB's intelligent TTL capabilities with SQL-style lifecycle management makes it an ideal platform for applications requiring both automated data expiration and familiar operational patterns, ensuring your data lifecycle strategies scale efficiently while maintaining compliance and operational excellence.