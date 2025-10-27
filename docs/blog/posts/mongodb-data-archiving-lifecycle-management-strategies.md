---
title: "MongoDB Data Archiving and Lifecycle Management: Advanced Strategies for Automated Data Retention, Performance Optimization, and Compliance"
description: "Master MongoDB data archiving with automated lifecycle policies, performance-optimized data movement, and compliance-focused retention strategies. Learn SQL-familiar archiving patterns for efficient data management with QueryLeaf integration."
date: 2025-10-26
tags: [mongodb, data-archiving, lifecycle-management, data-retention, performance, compliance, automation, sql]
---

# MongoDB Data Archiving and Lifecycle Management: Advanced Strategies for Automated Data Retention, Performance Optimization, and Compliance

Production database systems accumulate vast amounts of data over time, creating significant challenges for performance optimization, storage cost management, and regulatory compliance. Traditional database systems often struggle with efficient data archiving strategies that balance query performance, storage costs, and data accessibility requirements while maintaining operational efficiency and compliance with data retention policies.

MongoDB provides comprehensive data lifecycle management capabilities that enable sophisticated archiving strategies through automated retention policies, performance-optimized data movement, and flexible storage tiering. Unlike traditional databases that require complex partitioning schemes and manual maintenance processes, MongoDB's document-based architecture and built-in features support seamless data archiving workflows that scale with growing data volumes while maintaining operational simplicity.

## The Traditional Data Archiving Challenge

Conventional database systems face significant limitations when implementing data archiving and lifecycle management:

```sql
-- Traditional PostgreSQL data archiving - complex and maintenance-intensive approach

-- Create archive tables with identical structures (manual maintenance required)
CREATE TABLE orders_2023_archive (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    order_date TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    items JSONB,
    shipping_address TEXT,
    billing_address TEXT,
    
    -- Archive-specific metadata
    archived_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_by VARCHAR(100) DEFAULT current_user,
    archive_reason VARCHAR(200),
    original_table VARCHAR(100) DEFAULT 'orders',
    
    -- Compliance tracking
    retention_policy VARCHAR(100),
    scheduled_deletion_date DATE,
    legal_hold BOOLEAN DEFAULT false,
    
    -- Performance considerations
    CONSTRAINT orders_2023_archive_date_check 
        CHECK (order_date >= '2023-01-01' AND order_date < '2024-01-01')
);

-- Create indexes for archive table (must mirror production indexes)
CREATE INDEX orders_2023_archive_customer_id_idx ON orders_2023_archive(customer_id);
CREATE INDEX orders_2023_archive_date_idx ON orders_2023_archive(order_date);
CREATE INDEX orders_2023_archive_status_idx ON orders_2023_archive(status);
CREATE INDEX orders_2023_archive_archived_date_idx ON orders_2023_archive(archived_date);

-- Similar structure needed for each year and potentially each table
CREATE TABLE customer_interactions_2023_archive (
    interaction_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    interaction_date TIMESTAMP NOT NULL,
    interaction_type VARCHAR(100),
    details JSONB,
    outcome VARCHAR(100),
    
    -- Archive metadata
    archived_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_by VARCHAR(100) DEFAULT current_user,
    archive_reason VARCHAR(200),
    original_table VARCHAR(100) DEFAULT 'customer_interactions',
    
    CONSTRAINT customer_interactions_2023_archive_date_check 
        CHECK (interaction_date >= '2023-01-01' AND interaction_date < '2024-01-01')
);

-- Complex archiving procedure with limited automation
CREATE OR REPLACE FUNCTION archive_old_data(
    source_table VARCHAR(100),
    archive_table VARCHAR(100), 
    cutoff_date DATE,
    batch_size INTEGER DEFAULT 1000,
    archive_reason VARCHAR(200) DEFAULT 'automated_archiving'
) RETURNS TABLE (
    records_archived INTEGER,
    batches_processed INTEGER,
    total_processing_time_seconds INTEGER,
    errors_encountered INTEGER,
    last_archived_id BIGINT
) AS $$
DECLARE
    current_batch INTEGER := 0;
    total_archived INTEGER := 0;
    start_time TIMESTAMP := clock_timestamp();
    last_id BIGINT := 0;
    batch_result INTEGER;
    error_count INTEGER := 0;
    sql_command TEXT;
    archive_command TEXT;
BEGIN
    
    LOOP
        -- Dynamic SQL for flexible table handling (security risk)
        sql_command := FORMAT('
            WITH batch_data AS (
                SELECT * FROM %I 
                WHERE created_date < %L 
                AND id > %L
                ORDER BY id 
                LIMIT %L
            ),
            archived_batch AS (
                INSERT INTO %I 
                SELECT *, CURRENT_TIMESTAMP, %L, %L, %L
                FROM batch_data
                RETURNING id
            ),
            deleted_batch AS (
                DELETE FROM %I 
                WHERE id IN (SELECT id FROM archived_batch)
                RETURNING id
            )
            SELECT COUNT(*), MAX(id) FROM deleted_batch',
            source_table,
            cutoff_date,
            last_id,
            batch_size,
            archive_table,
            current_user,
            archive_reason,
            source_table,
            source_table
        );
        
        BEGIN
            EXECUTE sql_command INTO batch_result, last_id;
            
            -- Exit if no more records to process
            IF batch_result = 0 OR last_id IS NULL THEN
                EXIT;
            END IF;
            
            total_archived := total_archived + batch_result;
            current_batch := current_batch + 1;
            
            -- Commit every batch to avoid long-running transactions
            COMMIT;
            
            -- Brief pause to avoid overwhelming the system
            PERFORM pg_sleep(0.1);
            
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            
            -- Log error details (basic error handling)
            INSERT INTO archive_error_log (
                source_table,
                archive_table,
                batch_number,
                last_processed_id,
                error_message,
                error_timestamp
            ) VALUES (
                source_table,
                archive_table,
                current_batch,
                last_id,
                SQLERRM,
                CURRENT_TIMESTAMP
            );
            
            -- Stop after too many errors
            IF error_count > 10 THEN
                EXIT;
            END IF;
        END;
    END LOOP;
    
    RETURN QUERY SELECT 
        total_archived,
        current_batch,
        EXTRACT(SECONDS FROM clock_timestamp() - start_time)::INTEGER,
        error_count,
        COALESCE(last_id, 0);
        
EXCEPTION WHEN OTHERS THEN
    -- Global error handling
    INSERT INTO archive_error_log (
        source_table,
        archive_table,
        batch_number,
        last_processed_id,
        error_message,
        error_timestamp
    ) VALUES (
        source_table,
        archive_table,
        -1,
        -1,
        'Global archiving error: ' || SQLERRM,
        CURRENT_TIMESTAMP
    );
    
    RETURN QUERY SELECT 0, 0, 0, 1, 0::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- Manual data archiving execution (error-prone and inflexible)
DO $$
DECLARE
    archive_result RECORD;
    tables_to_archive VARCHAR(100)[] := ARRAY['orders', 'customer_interactions', 'payment_transactions', 'audit_logs'];
    current_table VARCHAR(100);
    archive_table_name VARCHAR(100);
    cutoff_date DATE := CURRENT_DATE - INTERVAL '2 years';
BEGIN
    
    FOREACH current_table IN ARRAY tables_to_archive
    LOOP
        -- Generate archive table name
        archive_table_name := current_table || '_' || EXTRACT(YEAR FROM cutoff_date) || '_archive';
        
        -- Check if archive table exists (manual verification)
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                      WHERE table_name = archive_table_name) THEN
            RAISE NOTICE 'Archive table % does not exist, skipping %', archive_table_name, current_table;
            CONTINUE;
        END IF;
        
        RAISE NOTICE 'Starting archival of % to %', current_table, archive_table_name;
        
        -- Execute archiving function
        FOR archive_result IN 
            SELECT * FROM archive_old_data(
                current_table, 
                archive_table_name, 
                cutoff_date,
                1000,  -- batch size
                'automated_yearly_archival'
            )
        LOOP
            RAISE NOTICE 'Archived % records from % in % batches, % errors, processing time: % seconds',
                archive_result.records_archived,
                current_table,
                archive_result.batches_processed,
                archive_result.errors_encountered,
                archive_result.total_processing_time_seconds;
        END LOOP;
        
        -- Basic statistics update (manual maintenance)
        EXECUTE FORMAT('ANALYZE %I', archive_table_name);
        
    END LOOP;
END;
$$;

-- Attempt at automated retention policy management (very limited)
CREATE TABLE data_retention_policies (
    policy_id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    retention_period_months INTEGER NOT NULL,
    archive_after_months INTEGER,
    delete_after_months INTEGER,
    
    -- Policy configuration
    policy_enabled BOOLEAN DEFAULT true,
    date_field VARCHAR(100) NOT NULL DEFAULT 'created_date',
    archive_storage_location VARCHAR(200),
    
    -- Compliance settings
    legal_hold_exemption BOOLEAN DEFAULT false,
    gdpr_applicable BOOLEAN DEFAULT false,
    custom_retention_rules JSONB,
    
    -- Execution tracking
    last_executed TIMESTAMP,
    last_execution_status VARCHAR(50),
    last_execution_error TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert basic retention policies (manual configuration)
INSERT INTO data_retention_policies (
    table_name, retention_period_months, archive_after_months, delete_after_months,
    date_field, archive_storage_location
) VALUES 
('orders', 84, 24, 96, 'order_date', '/archives/orders/'),
('customer_interactions', 60, 12, 72, 'interaction_date', '/archives/interactions/'),
('payment_transactions', 120, 36, 144, 'transaction_date', '/archives/payments/'),
('audit_logs', 36, 6, 48, 'log_timestamp', '/archives/audit/');

-- Rudimentary retention policy execution function
CREATE OR REPLACE FUNCTION execute_retention_policies()
RETURNS TABLE (
    policy_name VARCHAR(100),
    execution_status VARCHAR(50),
    records_processed INTEGER,
    execution_time_seconds INTEGER,
    error_message TEXT
) AS $$
DECLARE
    policy_record RECORD;
    archive_cutoff DATE;
    delete_cutoff DATE;
    execution_start TIMESTAMP;
    archive_result RECORD;
    records_affected INTEGER;
BEGIN
    
    FOR policy_record IN 
        SELECT * FROM data_retention_policies 
        WHERE policy_enabled = true
    LOOP
        execution_start := clock_timestamp();
        
        BEGIN
            -- Calculate cutoff dates based on policy
            archive_cutoff := CURRENT_DATE - (policy_record.archive_after_months || ' months')::INTERVAL;
            delete_cutoff := CURRENT_DATE - (policy_record.delete_after_months || ' months')::INTERVAL;
            
            -- Archival phase (if configured)
            IF policy_record.archive_after_months IS NOT NULL THEN
                SELECT * INTO archive_result FROM archive_old_data(
                    policy_record.table_name,
                    policy_record.table_name || '_archive',
                    archive_cutoff,
                    500,
                    'retention_policy_execution'
                );
                
                records_affected := archive_result.records_archived;
            END IF;
            
            -- Update execution status
            UPDATE data_retention_policies 
            SET 
                last_executed = CURRENT_TIMESTAMP,
                last_execution_status = 'success',
                last_execution_error = NULL
            WHERE policy_id = policy_record.policy_id;
            
            RETURN QUERY SELECT 
                policy_record.table_name,
                'success'::VARCHAR(50),
                COALESCE(records_affected, 0),
                EXTRACT(SECONDS FROM clock_timestamp() - execution_start)::INTEGER,
                NULL::TEXT;
                
        EXCEPTION WHEN OTHERS THEN
            -- Update error status
            UPDATE data_retention_policies 
            SET 
                last_executed = CURRENT_TIMESTAMP,
                last_execution_status = 'error',
                last_execution_error = SQLERRM
            WHERE policy_id = policy_record.policy_id;
            
            RETURN QUERY SELECT 
                policy_record.table_name,
                'error'::VARCHAR(50),
                0,
                EXTRACT(SECONDS FROM clock_timestamp() - execution_start)::INTEGER,
                SQLERRM;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Problems with traditional archiving approaches:
-- 1. Manual archive table creation and maintenance for each table and time period
-- 2. Complex partitioning schemes that require ongoing schema management
-- 3. Limited automation capabilities requiring extensive custom development
-- 4. Poor performance during archiving operations that impact production systems
-- 5. Inflexible retention policies that don't adapt to changing business requirements
-- 6. Minimal integration with cloud storage and tiered storage strategies
-- 7. Limited compliance tracking and audit trail capabilities
-- 8. No built-in data lifecycle automation or policy-driven management
-- 9. Complex disaster recovery for archived data across multiple table structures
-- 10. High maintenance overhead for managing archive table schemas and indexes
```

MongoDB provides sophisticated data lifecycle management with automated archiving capabilities:

```javascript
// MongoDB Data Archiving and Lifecycle Management - comprehensive automation system
const { MongoClient, GridFSBucket } = require('mongodb');
const { createReadStream, createWriteStream } = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { promisify } = require('util');
const zlib = require('zlib');

// Advanced data lifecycle management and archiving system
class MongoDataLifecycleManager {
  constructor(connectionUri, options = {}) {
    this.client = new MongoClient(connectionUri);
    this.db = null;
    this.collections = new Map();
    
    // Lifecycle management configuration
    this.config = {
      // Archive storage configuration
      archiveStorage: {
        type: options.archiveStorage?.type || 'mongodb', // mongodb, gridfs, s3, filesystem
        location: options.archiveStorage?.location || 'archives',
        compression: options.archiveStorage?.compression || 'gzip',
        encryption: options.archiveStorage?.encryption || false,
        checksumVerification: options.archiveStorage?.checksumVerification || true
      },
      
      // Performance optimization settings
      performance: {
        batchSize: options.performance?.batchSize || 1000,
        maxConcurrentOperations: options.performance?.maxConcurrentOperations || 3,
        throttleDelayMs: options.performance?.throttleDelayMs || 10,
        memoryLimitMB: options.performance?.memoryLimitMB || 512,
        indexOptimization: options.performance?.indexOptimization || true
      },
      
      // Compliance and audit settings
      compliance: {
        auditLogging: options.compliance?.auditLogging !== false,
        legalHoldSupport: options.compliance?.legalHoldSupport !== false,
        gdprCompliance: options.compliance?.gdprCompliance || false,
        dataClassification: options.compliance?.dataClassification || {},
        retentionPolicyEnforcement: options.compliance?.retentionPolicyEnforcement !== false
      },
      
      // Automation settings
      automation: {
        scheduledExecution: options.automation?.scheduledExecution || false,
        executionInterval: options.automation?.executionInterval || 86400000, // 24 hours
        failureRetryAttempts: options.automation?.failureRetryAttempts || 3,
        alerting: options.automation?.alerting || false,
        monitoringEnabled: options.automation?.monitoringEnabled !== false
      }
    };
    
    // External storage clients
    this.s3Client = options.s3Config ? new S3Client(options.s3Config) : null;
    this.gridFSBucket = null;
    
    // Operational state management
    this.retentionPolicies = new Map();
    this.executionHistory = [];
    this.activeOperations = new Map();
    this.performanceMetrics = {
      totalRecordsArchived: 0,
      totalStorageSaved: 0,
      averageOperationTime: 0,
      lastExecutionTime: null
    };
  }

  async initialize(dbName) {
    console.log('Initializing MongoDB Data Lifecycle Management system...');
    
    try {
      await this.client.connect();
      this.db = this.client.db(dbName);
      
      // Initialize GridFS bucket if needed
      if (this.config.archiveStorage.type === 'gridfs') {
        this.gridFSBucket = new GridFSBucket(this.db, { 
          bucketName: this.config.archiveStorage.location || 'archives' 
        });
      }
      
      // Setup system collections
      await this.setupSystemCollections();
      
      // Load existing retention policies
      await this.loadRetentionPolicies();
      
      // Setup automation if enabled
      if (this.config.automation.scheduledExecution) {
        await this.setupAutomatedExecution();
      }
      
      console.log('Data lifecycle management system initialized successfully');
      
    } catch (error) {
      console.error('Error initializing data lifecycle management:', error);
      throw error;
    }
  }

  async setupSystemCollections() {
    console.log('Setting up system collections for data lifecycle management...');
    
    // Retention policies collection
    const retentionPolicies = this.db.collection('data_retention_policies');
    await retentionPolicies.createIndexes([
      { key: { collection_name: 1 }, unique: true },
      { key: { policy_enabled: 1 } },
      { key: { next_execution: 1 } }
    ]);
    
    // Archive metadata collection
    const archiveMetadata = this.db.collection('archive_metadata');
    await archiveMetadata.createIndexes([
      { key: { source_collection: 1, archive_date: -1 } },
      { key: { archive_id: 1 }, unique: true },
      { key: { retention_policy_id: 1 } },
      { key: { compliance_status: 1 } }
    ]);
    
    // Execution audit log
    const executionAudit = this.db.collection('lifecycle_execution_audit');
    await executionAudit.createIndexes([
      { key: { execution_timestamp: -1 } },
      { key: { policy_id: 1, execution_timestamp: -1 } },
      { key: { operation_type: 1 } }
    ]);
    
    // Legal hold registry (compliance feature)
    if (this.config.compliance.legalHoldSupport) {
      const legalHolds = this.db.collection('legal_hold_registry');
      await legalHolds.createIndexes([
        { key: { hold_id: 1 }, unique: true },
        { key: { affected_collections: 1 } },
        { key: { hold_status: 1 } }
      ]);
    }
  }

  async defineRetentionPolicy(policyConfig) {
    console.log(`Defining retention policy for collection: ${policyConfig.collectionName}`);
    
    const policy = {
      policy_id: policyConfig.policyId || this.generatePolicyId(),
      collection_name: policyConfig.collectionName,
      
      // Retention timeline configuration
      retention_phases: {
        active_period_days: policyConfig.activePeriod || 365,
        archive_after_days: policyConfig.archiveAfter || 730,
        delete_after_days: policyConfig.deleteAfter || 2555, // 7 years default
        
        // Advanced retention phases
        cold_storage_after_days: policyConfig.coldStorageAfter,
        compliance_review_after_days: policyConfig.complianceReviewAfter
      },
      
      // Data identification and filtering
      date_field: policyConfig.dateField || 'created_at',
      additional_filters: policyConfig.filters || {},
      exclusion_criteria: policyConfig.exclusions || {},
      
      // Archive configuration
      archive_settings: {
        storage_type: policyConfig.archiveStorage || this.config.archiveStorage.type,
        compression_enabled: policyConfig.compression !== false,
        encryption_required: policyConfig.encryption || false,
        batch_size: policyConfig.batchSize || this.config.performance.batchSize,
        
        // Performance optimization
        index_hints: policyConfig.indexHints || [],
        sort_optimization: policyConfig.sortField || policyConfig.dateField,
        memory_limit: policyConfig.memoryLimit || '200M'
      },
      
      // Compliance configuration
      compliance_settings: {
        legal_hold_exempt: policyConfig.legalHoldExempt || false,
        data_classification: policyConfig.dataClassification || 'standard',
        gdpr_applicable: policyConfig.gdprApplicable || false,
        audit_level: policyConfig.auditLevel || 'standard',
        
        // Data sensitivity handling
        pii_fields: policyConfig.piiFields || [],
        anonymization_rules: policyConfig.anonymizationRules || {}
      },
      
      // Execution configuration
      execution_settings: {
        policy_enabled: policyConfig.enabled !== false,
        execution_schedule: policyConfig.schedule || '0 2 * * *', // Daily at 2 AM
        max_execution_time_minutes: policyConfig.maxExecutionTime || 120,
        failure_retry_attempts: policyConfig.retryAttempts || 3,
        notification_settings: policyConfig.notifications || {}
      },
      
      // Metadata and tracking
      policy_metadata: {
        created_by: policyConfig.createdBy || 'system',
        created_at: new Date(),
        last_modified: new Date(),
        policy_version: policyConfig.version || '1.0',
        description: policyConfig.description || '',
        business_justification: policyConfig.businessJustification || ''
      }
    };

    // Store retention policy
    const retentionPolicies = this.db.collection('data_retention_policies');
    await retentionPolicies.replaceOne(
      { collection_name: policy.collection_name },
      policy,
      { upsert: true }
    );
    
    // Cache policy for operational use
    this.retentionPolicies.set(policy.collection_name, policy);
    
    console.log(`Retention policy defined successfully for ${policy.collection_name}`);
    return policy.policy_id;
  }

  async executeDataArchiving(collectionName, options = {}) {
    console.log(`Starting data archiving for collection: ${collectionName}`);
    
    const policy = this.retentionPolicies.get(collectionName);
    if (!policy || !policy.execution_settings.policy_enabled) {
      throw new Error(`No enabled retention policy found for collection: ${collectionName}`);
    }

    const operationId = this.generateOperationId();
    const startTime = Date.now();
    
    try {
      // Check for legal holds
      if (this.config.compliance.legalHoldSupport) {
        await this.checkLegalHolds(collectionName, policy);
      }
      
      // Calculate archive cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retention_phases.archive_after_days);
      
      // Build archive query with optimization
      const archiveQuery = {
        [policy.date_field]: { $lt: cutoffDate },
        ...policy.additional_filters,
        ...(policy.exclusion_criteria && { $nor: [policy.exclusion_criteria] })
      };
      
      // Count records to archive
      const sourceCollection = this.db.collection(collectionName);
      const recordCount = await sourceCollection.countDocuments(archiveQuery);
      
      if (recordCount === 0) {
        console.log(`No records found for archiving in ${collectionName}`);
        return { success: true, recordsProcessed: 0, operationId };
      }
      
      console.log(`Found ${recordCount} records to archive from ${collectionName}`);
      
      // Execute archiving in batches
      const archiveResult = await this.executeBatchArchiving(
        sourceCollection,
        archiveQuery,
        policy,
        operationId,
        options
      );
      
      // Create archive metadata record
      await this.createArchiveMetadata({
        archive_id: operationId,
        source_collection: collectionName,
        archive_date: new Date(),
        record_count: archiveResult.recordsArchived,
        archive_size: archiveResult.archiveSize,
        policy_id: policy.policy_id,
        archive_location: archiveResult.archiveLocation,
        checksum: archiveResult.checksum,
        
        compliance_info: {
          legal_hold_checked: this.config.compliance.legalHoldSupport,
          gdpr_compliant: policy.compliance_settings.gdpr_applicable,
          audit_trail: archiveResult.auditTrail
        }
      });
      
      // Log execution in audit trail
      await this.logExecutionAudit({
        operation_id: operationId,
        operation_type: 'archive',
        collection_name: collectionName,
        policy_id: policy.policy_id,
        execution_timestamp: new Date(),
        records_processed: archiveResult.recordsArchived,
        execution_duration_ms: Date.now() - startTime,
        status: 'success',
        performance_metrics: archiveResult.performanceMetrics
      });
      
      console.log(`Data archiving completed successfully for ${collectionName}`);
      return {
        success: true,
        operationId,
        recordsArchived: archiveResult.recordsArchived,
        archiveSize: archiveResult.archiveSize,
        executionTime: Date.now() - startTime
      };
      
    } catch (error) {
      console.error(`Error during data archiving for ${collectionName}:`, error);
      
      // Log error in audit trail
      await this.logExecutionAudit({
        operation_id: operationId,
        operation_type: 'archive',
        collection_name: collectionName,
        policy_id: policy?.policy_id,
        execution_timestamp: new Date(),
        execution_duration_ms: Date.now() - startTime,
        status: 'error',
        error_message: error.message
      });
      
      throw error;
    }
  }

  async executeBatchArchiving(sourceCollection, archiveQuery, policy, operationId, options) {
    console.log('Executing batch archiving with performance optimization...');
    
    const batchSize = policy.archive_settings.batch_size;
    const archiveLocation = await this.prepareArchiveLocation(operationId, policy);
    
    let totalArchived = 0;
    let totalSize = 0;
    let batchNumber = 0;
    const auditTrail = [];
    const performanceMetrics = {
      avgBatchTime: 0,
      maxBatchTime: 0,
      totalBatches: 0,
      throughputRecordsPerSecond: 0
    };

    // Create cursor with optimization hints
    const cursor = sourceCollection.find(archiveQuery)
      .sort({ [policy.archive_settings.sort_optimization]: 1 })
      .batchSize(batchSize);
    
    // Add index hint if specified
    if (policy.archive_settings.index_hints.length > 0) {
      cursor.hint(policy.archive_settings.index_hints[0]);
    }

    let batch = [];
    let batchStartTime = Date.now();
    
    for await (const document of cursor) {
      batch.push(document);
      
      // Process batch when full
      if (batch.length >= batchSize) {
        const batchResult = await this.processBatch(
          batch,
          archiveLocation,
          policy,
          batchNumber,
          operationId
        );
        
        const batchTime = Date.now() - batchStartTime;
        performanceMetrics.avgBatchTime = (performanceMetrics.avgBatchTime * batchNumber + batchTime) / (batchNumber + 1);
        performanceMetrics.maxBatchTime = Math.max(performanceMetrics.maxBatchTime, batchTime);
        
        totalArchived += batchResult.recordsProcessed;
        totalSize += batchResult.batchSize;
        batchNumber++;
        
        auditTrail.push({
          batch_number: batchNumber,
          records_processed: batchResult.recordsProcessed,
          batch_size: batchResult.batchSize,
          processing_time_ms: batchTime
        });
        
        // Reset batch
        batch = [];
        batchStartTime = Date.now();
        
        // Throttle to avoid overwhelming the system
        if (this.config.performance.throttleDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.performance.throttleDelayMs));
        }
      }
    }
    
    // Process final partial batch
    if (batch.length > 0) {
      const batchResult = await this.processBatch(
        batch,
        archiveLocation,
        policy,
        batchNumber,
        operationId
      );
      
      totalArchived += batchResult.recordsProcessed;
      totalSize += batchResult.batchSize;
      batchNumber++;
    }

    // Calculate final performance metrics
    performanceMetrics.totalBatches = batchNumber;
    performanceMetrics.throughputRecordsPerSecond = totalArchived / ((Date.now() - batchStartTime) / 1000);
    
    // Generate archive checksum for integrity verification
    const checksum = await this.generateArchiveChecksum(archiveLocation, totalArchived);
    
    console.log(`Batch archiving completed: ${totalArchived} records in ${batchNumber} batches`);
    
    return {
      recordsArchived: totalArchived,
      archiveSize: totalSize,
      archiveLocation,
      checksum,
      auditTrail,
      performanceMetrics
    };
  }

  async processBatch(batch, archiveLocation, policy, batchNumber, operationId) {
    const batchStartTime = Date.now();
    
    // Apply data transformations if needed (PII anonymization, etc.)
    const processedBatch = await this.applyDataTransformations(batch, policy);
    
    // Store batch based on configured storage type
    let batchSize;
    switch (this.config.archiveStorage.type) {
      case 'mongodb':
        batchSize = await this.storeBatchToMongoDB(processedBatch, archiveLocation);
        break;
      case 'gridfs':
        batchSize = await this.storeBatchToGridFS(processedBatch, archiveLocation, batchNumber);
        break;
      case 's3':
        batchSize = await this.storeBatchToS3(processedBatch, archiveLocation, batchNumber);
        break;
      case 'filesystem':
        batchSize = await this.storeBatchToFileSystem(processedBatch, archiveLocation, batchNumber);
        break;
      default:
        throw new Error(`Unsupported archive storage type: ${this.config.archiveStorage.type}`);
    }
    
    // Remove archived documents from source collection
    const documentIds = batch.map(doc => doc._id);
    const deleteResult = await this.db.collection(policy.collection_name).deleteMany({
      _id: { $in: documentIds }
    });
    
    console.log(`Batch ${batchNumber}: archived ${batch.length} records, size: ${batchSize} bytes`);
    
    return {
      recordsProcessed: batch.length,
      batchSize,
      deletedRecords: deleteResult.deletedCount,
      processingTime: Date.now() - batchStartTime
    };
  }

  async applyDataTransformations(batch, policy) {
    if (!policy.compliance_settings.pii_fields.length && 
        !Object.keys(policy.compliance_settings.anonymization_rules).length) {
      return batch; // No transformations needed
    }
    
    console.log('Applying data transformations for compliance...');
    
    return batch.map(document => {
      let processedDoc = { ...document };
      
      // Apply PII field anonymization
      policy.compliance_settings.pii_fields.forEach(field => {
        if (processedDoc[field]) {
          processedDoc[field] = this.anonymizeField(processedDoc[field], field);
        }
      });
      
      // Apply custom anonymization rules
      Object.entries(policy.compliance_settings.anonymization_rules).forEach(([field, rule]) => {
        if (processedDoc[field]) {
          processedDoc[field] = this.applyAnonymizationRule(processedDoc[field], rule);
        }
      });
      
      // Add transformation metadata
      processedDoc._archive_metadata = {
        original_id: document._id,
        archived_at: new Date(),
        transformations_applied: [
          ...policy.compliance_settings.pii_fields.map(field => `pii_anonymization:${field}`),
          ...Object.keys(policy.compliance_settings.anonymization_rules).map(field => `custom_rule:${field}`)
        ]
      };
      
      return processedDoc;
    });
  }

  async storeBatchToMongoDB(batch, archiveLocation) {
    const archiveCollection = this.db.collection(archiveLocation);
    const insertResult = await archiveCollection.insertMany(batch, { 
      ordered: false,
      writeConcern: { w: 'majority', j: true }
    });
    
    return JSON.stringify(batch).length; // Approximate size
  }

  async storeBatchToGridFS(batch, archiveLocation, batchNumber) {
    const fileName = `${archiveLocation}_batch_${batchNumber.toString().padStart(6, '0')}.json`;
    const batchData = JSON.stringify(batch);
    
    if (this.config.archiveStorage.compression === 'gzip') {
      const compressedData = await promisify(zlib.gzip)(batchData);
      const uploadStream = this.gridFSBucket.openUploadStream(`${fileName}.gz`, {
        metadata: {
          batch_number: batchNumber,
          record_count: batch.length,
          compression: 'gzip',
          archived_at: new Date()
        }
      });
      
      uploadStream.end(compressedData);
      return compressedData.length;
    } else {
      const uploadStream = this.gridFSBucket.openUploadStream(fileName, {
        metadata: {
          batch_number: batchNumber,
          record_count: batch.length,
          archived_at: new Date()
        }
      });
      
      uploadStream.end(Buffer.from(batchData));
      return batchData.length;
    }
  }

  async storeBatchToS3(batch, archiveLocation, batchNumber) {
    if (!this.s3Client) {
      throw new Error('S3 client not configured for archive storage');
    }
    
    const key = `${archiveLocation}/batch_${batchNumber.toString().padStart(6, '0')}.json`;
    let data = JSON.stringify(batch);
    
    if (this.config.archiveStorage.compression === 'gzip') {
      data = await promisify(zlib.gzip)(data);
    }
    
    const putCommand = new PutObjectCommand({
      Bucket: this.config.archiveStorage.location,
      Key: key,
      Body: data,
      ContentType: 'application/json',
      ContentEncoding: this.config.archiveStorage.compression === 'gzip' ? 'gzip' : undefined,
      Metadata: {
        batch_number: batchNumber.toString(),
        record_count: batch.length.toString(),
        archived_at: new Date().toISOString()
      }
    });
    
    await this.s3Client.send(putCommand);
    return data.length;
  }

  async setupAutomaticDataDeletion(collectionName, options = {}) {
    console.log(`Setting up automatic data deletion for: ${collectionName}`);
    
    const policy = this.retentionPolicies.get(collectionName);
    if (!policy) {
      throw new Error(`No retention policy found for collection: ${collectionName}`);
    }

    // Use MongoDB TTL index for automatic deletion where possible
    const collection = this.db.collection(collectionName);
    
    // Create TTL index based on retention policy
    const ttlSeconds = policy.retention_phases.delete_after_days * 24 * 60 * 60;
    
    try {
      await collection.createIndex(
        { [policy.date_field]: 1 },
        { 
          expireAfterSeconds: ttlSeconds,
          background: true,
          name: `ttl_${policy.date_field}_${ttlSeconds}s`
        }
      );
      
      console.log(`TTL index created for automatic deletion: ${ttlSeconds} seconds`);
      
      // Update policy to track TTL index usage
      await this.db.collection('data_retention_policies').updateOne(
        { collection_name: collectionName },
        { 
          $set: { 
            'deletion_settings.ttl_enabled': true,
            'deletion_settings.ttl_seconds': ttlSeconds,
            'deletion_settings.ttl_field': policy.date_field
          }
        }
      );
      
      return { success: true, ttlSeconds, indexName: `ttl_${policy.date_field}_${ttlSeconds}s` };
      
    } catch (error) {
      console.error('Error setting up TTL index:', error);
      throw error;
    }
  }

  async retrieveArchivedData(archiveId, query = {}, options = {}) {
    console.log(`Retrieving archived data for archive ID: ${archiveId}`);
    
    // Get archive metadata
    const archiveMetadata = await this.db.collection('archive_metadata')
      .findOne({ archive_id: archiveId });
    
    if (!archiveMetadata) {
      throw new Error(`Archive not found: ${archiveId}`);
    }
    
    const { limit = 100, skip = 0, projection = {} } = options;
    let retrievedData = [];
    
    // Retrieve data based on storage type
    switch (this.config.archiveStorage.type) {
      case 'mongodb':
        const archiveCollection = this.db.collection(archiveMetadata.archive_location);
        retrievedData = await archiveCollection
          .find(query, { projection })
          .skip(skip)
          .limit(limit)
          .toArray();
        break;
        
      case 'gridfs':
        retrievedData = await this.retrieveFromGridFS(archiveMetadata, query, options);
        break;
        
      case 's3':
        retrievedData = await this.retrieveFromS3(archiveMetadata, query, options);
        break;
        
      default:
        throw new Error(`Archive retrieval not supported for storage type: ${this.config.archiveStorage.type}`);
    }
    
    // Log retrieval for audit purposes
    await this.logExecutionAudit({
      operation_id: this.generateOperationId(),
      operation_type: 'retrieve',
      archive_id: archiveId,
      execution_timestamp: new Date(),
      records_retrieved: retrievedData.length,
      retrieval_query: query,
      status: 'success'
    });
    
    return {
      archiveMetadata,
      data: retrievedData,
      totalRecords: archiveMetadata.record_count,
      retrievedCount: retrievedData.length
    };
  }

  async generateComplianceReport(collectionName, options = {}) {
    console.log(`Generating compliance report for: ${collectionName}`);
    
    const {
      startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      endDate = new Date(),
      includeMetrics = true,
      includeAuditTrail = true
    } = options;

    const policy = this.retentionPolicies.get(collectionName);
    if (!policy) {
      throw new Error(`No retention policy found for collection: ${collectionName}`);
    }
    
    // Collect compliance data
    const complianceData = {
      collection_name: collectionName,
      policy_id: policy.policy_id,
      report_generated_at: new Date(),
      reporting_period: { start: startDate, end: endDate },
      
      // Policy compliance status
      policy_compliance: {
        policy_enabled: policy.execution_settings.policy_enabled,
        gdpr_compliant: policy.compliance_settings.gdpr_applicable,
        legal_hold_support: this.config.compliance.legalHoldSupport,
        audit_level: policy.compliance_settings.audit_level
      },
      
      // Archive operations summary
      archive_summary: await this.getArchiveSummary(collectionName, startDate, endDate),
      
      // Current data status
      data_status: await this.getCurrentDataStatus(collectionName, policy)
    };
    
    if (includeMetrics) {
      complianceData.performance_metrics = await this.getPerformanceMetrics(collectionName, startDate, endDate);
    }
    
    if (includeAuditTrail) {
      complianceData.audit_trail = await this.getAuditTrail(collectionName, startDate, endDate);
    }
    
    // Check for any compliance issues
    complianceData.compliance_issues = await this.identifyComplianceIssues(collectionName, policy);
    
    return complianceData;
  }

  async loadRetentionPolicies() {
    const policies = await this.db.collection('data_retention_policies')
      .find({ 'execution_settings.policy_enabled': true })
      .toArray();
    
    policies.forEach(policy => {
      this.retentionPolicies.set(policy.collection_name, policy);
    });
    
    console.log(`Loaded ${policies.length} retention policies`);
  }

  generatePolicyId() {
    return `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  anonymizeField(value, fieldType) {
    // Simple anonymization - in production, use proper anonymization libraries
    if (typeof value === 'string') {
      if (fieldType.includes('email')) {
        return 'anonymized@example.com';
      } else if (fieldType.includes('name')) {
        return 'ANONYMIZED';
      } else {
        return '***REDACTED***';
      }
    }
    return null;
  }

  async createArchiveMetadata(metadata) {
    return await this.db.collection('archive_metadata').insertOne(metadata);
  }

  async logExecutionAudit(auditRecord) {
    if (this.config.compliance.auditLogging) {
      return await this.db.collection('lifecycle_execution_audit').insertOne(auditRecord);
    }
  }
}

// Benefits of MongoDB Data Lifecycle Management:
// - Automated retention policy enforcement with minimal manual intervention
// - Flexible storage tiering supporting MongoDB, GridFS, S3, and filesystem storage
// - Built-in compliance features including legal hold support and audit trails  
// - Performance-optimized batch processing with throttling and memory management
// - Comprehensive data transformation capabilities for PII protection and anonymization
// - TTL index integration for automatic deletion without application logic
// - Real-time monitoring and alerting for policy execution and compliance status
// - Scalable architecture supporting large-scale data archiving operations
// - Integrated backup and recovery capabilities for archived data
// - SQL-compatible lifecycle management operations through QueryLeaf integration

module.exports = {
  MongoDataLifecycleManager
};
```

## Understanding MongoDB Data Lifecycle Architecture

### Advanced Archiving Strategies and Compliance Management

Implement sophisticated data lifecycle policies with enterprise-grade compliance and automation:

```javascript
// Production-ready data lifecycle automation with enterprise compliance features
class EnterpriseDataLifecycleManager extends MongoDataLifecycleManager {
  constructor(connectionUri, enterpriseConfig) {
    super(connectionUri, enterpriseConfig);
    
    this.enterpriseFeatures = {
      // Advanced compliance management
      complianceIntegration: {
        gdprAutomation: true,
        legalHoldWorkflows: true,
        auditTrailEncryption: true,
        regulatoryReporting: true,
        dataSubjectRequests: true
      },
      
      // Enterprise storage integration
      storageIntegration: {
        multiTierStorage: true,
        cloudStorageIntegration: true,
        compressionOptimization: true,
        encryptionAtRest: true,
        geographicReplication: true
      },
      
      // Advanced automation
      automationCapabilities: {
        mlPredictiveArchiving: true,
        workloadOptimization: true,
        costOptimization: true,
        capacityPlanning: true,
        performanceTuning: true
      }
    };
    
    this.initializeEnterpriseFeatures();
  }

  async implementIntelligentArchiving(collectionName, options = {}) {
    console.log('Implementing intelligent archiving with machine learning optimization...');
    
    const archivingStrategy = {
      // Predictive analysis for optimal archiving timing
      predictiveModeling: {
        accessPatternAnalysis: true,
        queryFrequencyPrediction: true,
        storageOptimization: true,
        performanceImpactMinimization: true
      },
      
      // Cost-optimized storage tiering
      costOptimization: {
        automaticTierSelection: true,
        compressionOptimization: true,
        geographicOptimization: true,
        providerOptimization: true
      },
      
      // Performance-aware archiving
      performanceOptimization: {
        nonBlockingArchiving: true,
        priorityBasedProcessing: true,
        resourceThrottling: true,
        systemImpactMinimization: true
      }
    };

    return await this.deployIntelligentArchiving(collectionName, archivingStrategy, options);
  }

  async setupAdvancedComplianceWorkflows(complianceConfig) {
    console.log('Setting up advanced compliance workflows...');
    
    const complianceWorkflows = {
      // GDPR compliance automation
      gdprCompliance: {
        dataSubjectRequestHandling: true,
        rightToErasureAutomation: true,
        dataPortabilitySupport: true,
        consentManagement: true,
        breachNotificationIntegration: true
      },
      
      // Industry-specific compliance
      industryCompliance: {
        soxCompliance: complianceConfig.sox || false,
        hipaaCompliance: complianceConfig.hipaa || false,
        pciDssCompliance: complianceConfig.pciDss || false,
        iso27001Compliance: complianceConfig.iso27001 || false
      },
      
      // Legal hold management
      legalHoldManagement: {
        automaticHoldEnforcement: true,
        holdNotificationWorkflows: true,
        custodyChainTracking: true,
        releaseAutomation: true
      }
    };

    return await this.deployComplianceWorkflows(complianceWorkflows);
  }
}
```

## SQL-Style Data Lifecycle Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB data archiving and lifecycle management:

```sql
-- QueryLeaf data lifecycle management with SQL-familiar patterns for MongoDB

-- Define comprehensive data retention policy with advanced features
CREATE RETENTION_POLICY order_data_lifecycle AS (
  -- Target collection and identification
  collection_name = 'orders',
  policy_enabled = true,
  
  -- Retention phases with flexible timing
  active_retention_days = 365,     -- Keep in active storage for 1 year
  archive_after_days = 730,        -- Archive after 2 years
  cold_storage_after_days = 1825,  -- Move to cold storage after 5 years  
  delete_after_days = 2555,        -- Delete after 7 years (regulatory requirement)
  
  -- Data identification and filtering
  date_field = 'order_date',
  additional_filters = JSON_BUILD_OBJECT(
    'status', JSON_BUILD_ARRAY('completed', 'shipped', 'delivered'),
    'total_amount', JSON_BUILD_OBJECT('$gt', 0)
  ),
  
  -- Exclude from archiving (VIP customers, ongoing disputes, etc.)
  exclusion_criteria = JSON_BUILD_OBJECT(
    '$or', JSON_BUILD_ARRAY(
      JSON_BUILD_OBJECT('customer_tier', 'vip'),
      JSON_BUILD_OBJECT('dispute_status', 'active'),
      JSON_BUILD_OBJECT('legal_hold', true)
    )
  ),
  
  -- Archive storage configuration
  archive_storage_type = 'gridfs',
  compression_enabled = true,
  encryption_required = false,
  batch_size = 1000,
  
  -- Performance optimization
  index_hints = JSON_BUILD_ARRAY('order_date_status_idx', 'customer_id_idx'),
  sort_field = 'order_date',
  memory_limit = '512M',
  max_execution_time_minutes = 180,
  
  -- Compliance settings
  gdpr_applicable = true,
  legal_hold_exempt = false,
  audit_level = 'detailed',
  pii_fields = JSON_BUILD_ARRAY('customer_email', 'billing_address', 'shipping_address'),
  
  -- Automation configuration
  execution_schedule = '0 2 * * 0',  -- Weekly on Sunday at 2 AM
  failure_retry_attempts = 3,
  notification_enabled = true,
  
  -- Business metadata
  business_justification = 'Regulatory compliance and performance optimization',
  data_owner = 'sales_operations_team',
  policy_version = '2.1'
);

-- Advanced customer data retention with PII protection
CREATE RETENTION_POLICY customer_data_lifecycle AS (
  collection_name = 'customers',
  policy_enabled = true,
  
  -- GDPR-compliant retention periods
  active_retention_days = 1095,    -- 3 years active retention
  archive_after_days = 1825,       -- Archive after 5 years  
  delete_after_days = 2555,        -- Delete after 7 years
  
  date_field = 'last_activity_date',
  
  -- PII anonymization before archiving
  pii_protection = JSON_BUILD_OBJECT(
    'anonymize_before_archive', true,
    'pii_fields', JSON_BUILD_ARRAY(
      'email', 'phone', 'address', 'birth_date', 'social_security_number'
    ),
    'anonymization_method', 'hash_with_salt'
  ),
  
  -- Data subject request handling
  gdpr_compliance = JSON_BUILD_OBJECT(
    'right_to_erasure_enabled', true,
    'data_portability_enabled', true,
    'consent_tracking_required', true,
    'processing_lawfulness_basis', 'legitimate_interest'
  ),
  
  archive_storage_type = 's3',
  s3_configuration = JSON_BUILD_OBJECT(
    'bucket', 'customer-data-archives',
    'storage_class', 'STANDARD_IA',
    'encryption', 'AES256'
  )
);

-- Execute data archiving with comprehensive monitoring
WITH archiving_execution AS (
  SELECT 
    collection_name,
    policy_id,
    
    -- Calculate records eligible for archiving
    (SELECT COUNT(*) 
     FROM orders 
     WHERE order_date < CURRENT_DATE - INTERVAL '2 years'
       AND status IN ('completed', 'shipped', 'delivered')
       AND total_amount > 0
       AND NOT (customer_tier = 'vip' OR dispute_status = 'active' OR legal_hold = true)
    ) as eligible_records,
    
    -- Estimate archive size and processing time
    (SELECT 
       ROUND(AVG(LENGTH(to_jsonb(o)::text))::numeric, 0) * COUNT(*) / 1024 / 1024
     FROM orders o 
     WHERE order_date < CURRENT_DATE - INTERVAL '2 years'
    ) as estimated_archive_size_mb,
    
    -- Performance projections
    CASE 
      WHEN eligible_records > 100000 THEN 'large_dataset_optimization_required'
      WHEN eligible_records > 10000 THEN 'standard_optimization_recommended'
      ELSE 'minimal_optimization_needed'
    END as performance_category,
    
    -- Compliance checks
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM legal_hold_registry 
        WHERE collection_name = 'orders' 
        AND hold_status = 'active'
      ) THEN 'legal_hold_active_check_required'
      ELSE 'cleared_for_archiving'
    END as compliance_status
    
  FROM data_retention_policies 
  WHERE collection_name = 'orders' 
    AND policy_enabled = true
),

-- Execute archiving with batch processing and monitoring
archiving_results AS (
  EXECUTE_ARCHIVING(
    collection_name => 'orders',
    
    -- Batch processing configuration
    batch_processing => JSON_BUILD_OBJECT(
      'batch_size', 1000,
      'max_concurrent_batches', 3,
      'throttle_delay_ms', 10,
      'memory_limit_per_batch', '100M'
    ),
    
    -- Performance optimization
    performance_options => JSON_BUILD_OBJECT(
      'use_index_hints', true,
      'parallel_processing', true,
      'compression_level', 'standard',
      'checksum_validation', true
    ),
    
    -- Archive destination
    archive_destination => JSON_BUILD_OBJECT(
      'storage_type', 'gridfs',
      'bucket_name', 'order_archives',
      'naming_pattern', 'orders_archive_{year}_{month}_{batch}',
      'metadata_tags', JSON_BUILD_OBJECT(
        'department', 'sales',
        'retention_policy', 'order_data_lifecycle',
        'compliance_level', 'standard'
      )
    ),
    
    -- Compliance and audit settings
    compliance_settings => JSON_BUILD_OBJECT(
      'audit_logging', 'detailed',
      'pii_anonymization', false,  -- Orders don't contain direct PII
      'legal_hold_check', true,
      'gdpr_processing_log', true
    )
  )
)

SELECT 
  ae.collection_name,
  ae.eligible_records,
  ae.estimated_archive_size_mb,
  ae.performance_category,
  ae.compliance_status,
  
  -- Archiving execution results
  ar.operation_id,
  ar.records_archived,
  ar.archive_size_actual_mb,
  ar.execution_time_seconds,
  ar.batches_processed,
  
  -- Performance metrics
  ROUND(ar.records_archived::numeric / ar.execution_time_seconds, 2) as records_per_second,
  ROUND(ar.archive_size_actual_mb::numeric / ar.execution_time_seconds, 3) as mb_per_second,
  
  -- Compliance verification
  ar.compliance_checks_passed,
  ar.audit_trail_id,
  ar.archive_location,
  ar.checksum_verified,
  
  -- Success indicators
  CASE 
    WHEN ar.records_archived = ae.eligible_records THEN 'complete_success'
    WHEN ar.records_archived > ae.eligible_records * 0.95 THEN 'successful_with_minor_issues'
    WHEN ar.records_archived > 0 THEN 'partial_success_requires_review'
    ELSE 'failed_requires_investigation'
  END as execution_status,
  
  -- Recommendations for optimization
  CASE 
    WHEN ar.records_per_second < 10 THEN 'consider_batch_size_increase'
    WHEN ar.execution_time_seconds > 3600 THEN 'consider_parallel_processing_increase'
    WHEN ar.archive_size_actual_mb > ae.estimated_archive_size_mb * 1.5 THEN 'investigate_compression_efficiency'
    ELSE 'performance_within_expected_parameters'
  END as optimization_recommendation

FROM archiving_execution ae
CROSS JOIN archiving_results ar;

-- Monitor archiving operations with real-time dashboard
WITH current_archiving_operations AS (
  SELECT 
    operation_id,
    collection_name,
    policy_id,
    operation_type,
    started_at,
    
    -- Progress tracking
    records_processed,
    estimated_total_records,
    ROUND((records_processed::numeric / estimated_total_records) * 100, 1) as progress_percentage,
    
    -- Performance monitoring
    EXTRACT(SECONDS FROM CURRENT_TIMESTAMP - started_at) as elapsed_seconds,
    ROUND(records_processed::numeric / EXTRACT(SECONDS FROM CURRENT_TIMESTAMP - started_at), 2) as current_throughput,
    
    -- Resource utilization
    memory_usage_mb,
    cpu_utilization_percent,
    io_operations_per_second,
    
    -- Status indicators
    operation_status,
    error_count,
    last_error_message,
    
    -- ETA calculation
    CASE 
      WHEN records_processed > 0 AND operation_status = 'running' THEN
        CURRENT_TIMESTAMP + 
        (INTERVAL '1 second' * 
         ((estimated_total_records - records_processed) / 
          (records_processed::numeric / EXTRACT(SECONDS FROM CURRENT_TIMESTAMP - started_at))))
      ELSE NULL
    END as estimated_completion_time
    
  FROM lifecycle_operation_status
  WHERE operation_status IN ('running', 'paused', 'starting')
),

-- Historical performance analysis
archiving_performance_trends AS (
  SELECT 
    DATE_TRUNC('day', execution_timestamp) as execution_date,
    collection_name,
    
    -- Daily aggregated metrics
    COUNT(*) as operations_executed,
    SUM(records_processed) as total_records_archived,
    AVG(execution_duration_seconds) as avg_execution_time,
    AVG(records_processed::numeric / execution_duration_seconds) as avg_throughput,
    
    -- Success rate tracking
    COUNT(*) FILTER (WHERE status = 'success') as successful_operations,
    ROUND(
      (COUNT(*) FILTER (WHERE status = 'success')::numeric / COUNT(*)) * 100, 1
    ) as success_rate_percent,
    
    -- Resource efficiency metrics
    AVG(archive_size_mb::numeric / execution_duration_seconds) as avg_mb_per_second,
    AVG(memory_peak_usage_mb) as avg_peak_memory_usage,
    
    -- Trend indicators
    LAG(SUM(records_processed)) OVER (
      PARTITION BY collection_name 
      ORDER BY DATE_TRUNC('day', execution_timestamp)
    ) as previous_day_records,
    
    LAG(AVG(records_processed::numeric / execution_duration_seconds)) OVER (
      PARTITION BY collection_name
      ORDER BY DATE_TRUNC('day', execution_timestamp)  
    ) as previous_day_throughput
    
  FROM lifecycle_execution_audit
  WHERE execution_timestamp >= CURRENT_DATE - INTERVAL '30 days'
    AND operation_type = 'archive'
  GROUP BY DATE_TRUNC('day', execution_timestamp), collection_name
),

-- Data retention compliance dashboard
retention_compliance_status AS (
  SELECT 
    drp.collection_name,
    drp.policy_id,
    drp.policy_enabled,
    
    -- Current data status
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLLECTIONS 
     WHERE collection_name = drp.collection_name) as active_record_count,
     
    -- Retention phase analysis
    CASE 
      WHEN drp.active_retention_days IS NOT NULL THEN
        (SELECT COUNT(*) 
         FROM dynamic_collection_query(drp.collection_name)
         WHERE date_field_value < CURRENT_DATE - (drp.active_retention_days || ' days')::INTERVAL)
      ELSE 0
    END as records_past_active_retention,
    
    CASE 
      WHEN drp.archive_after_days IS NOT NULL THEN
        (SELECT COUNT(*) 
         FROM dynamic_collection_query(drp.collection_name)
         WHERE date_field_value < CURRENT_DATE - (drp.archive_after_days || ' days')::INTERVAL)
      ELSE 0
    END as records_ready_for_archive,
    
    CASE 
      WHEN drp.delete_after_days IS NOT NULL THEN
        (SELECT COUNT(*) 
         FROM dynamic_collection_query(drp.collection_name)
         WHERE date_field_value < CURRENT_DATE - (drp.delete_after_days || ' days')::INTERVAL)
      ELSE 0
    END as records_past_deletion_date,
    
    -- Compliance indicators
    CASE 
      WHEN records_past_deletion_date > 0 THEN 'non_compliant_immediate_attention'
      WHEN records_ready_for_archive > 10000 THEN 'compliance_risk_action_needed'
      WHEN records_past_active_retention > active_record_count * 0.3 THEN 'optimization_opportunity'
      ELSE 'compliant'
    END as compliance_status,
    
    -- Archive statistics
    (SELECT COUNT(*) FROM archive_metadata WHERE source_collection = drp.collection_name) as total_archives_created,
    (SELECT SUM(record_count) FROM archive_metadata WHERE source_collection = drp.collection_name) as total_records_archived,
    (SELECT MAX(archive_date) FROM archive_metadata WHERE source_collection = drp.collection_name) as last_archive_date,
    
    -- Next scheduled execution
    drp.next_execution_scheduled,
    EXTRACT(HOURS FROM drp.next_execution_scheduled - CURRENT_TIMESTAMP) as hours_until_next_execution
    
  FROM data_retention_policies drp
  WHERE drp.policy_enabled = true
)

SELECT 
  -- Current operations status
  'ACTIVE_OPERATIONS' as section,
  JSON_AGG(
    JSON_BUILD_OBJECT(
      'operation_id', cao.operation_id,
      'collection', cao.collection_name,
      'progress', cao.progress_percentage || '%',
      'throughput', cao.current_throughput || ' rec/sec',
      'eta', cao.estimated_completion_time,
      'status', cao.operation_status
    )
  ) as current_operations

FROM current_archiving_operations cao
WHERE cao.operation_status = 'running'

UNION ALL

SELECT 
  -- Performance trends
  'PERFORMANCE_TRENDS' as section,
  JSON_AGG(
    JSON_BUILD_OBJECT(
      'date', apt.execution_date,
      'collection', apt.collection_name,
      'records_archived', apt.total_records_archived,
      'avg_throughput', apt.avg_throughput || ' rec/sec',
      'success_rate', apt.success_rate_percent || '%',
      'trend', CASE 
        WHEN apt.avg_throughput > apt.previous_day_throughput * 1.1 THEN 'improving'
        WHEN apt.avg_throughput < apt.previous_day_throughput * 0.9 THEN 'declining'
        ELSE 'stable'
      END
    )
  ) as performance_data
  
FROM archiving_performance_trends apt
WHERE apt.execution_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

SELECT 
  -- Compliance status
  'COMPLIANCE_STATUS' as section,
  JSON_AGG(
    JSON_BUILD_OBJECT(
      'collection', rcs.collection_name,
      'compliance_status', rcs.compliance_status,
      'active_records', rcs.active_record_count,
      'ready_for_archive', rcs.records_ready_for_archive,
      'past_deletion_date', rcs.records_past_deletion_date,
      'last_archive', rcs.last_archive_date,
      'next_execution', rcs.hours_until_next_execution || ' hours',
      'total_archived', rcs.total_records_archived
    )
  ) as compliance_data
  
FROM retention_compliance_status rcs;

-- Advanced archive data retrieval with query optimization
WITH archive_query_optimization AS (
  SELECT 
    archive_id,
    source_collection,
    archive_date,
    record_count,
    archive_size_mb,
    storage_type,
    archive_location,
    
    -- Query complexity assessment
    CASE 
      WHEN record_count > 1000000 THEN 'complex_query_optimization_required'
      WHEN record_count > 100000 THEN 'standard_optimization_recommended'  
      ELSE 'direct_query_suitable'
    END as query_complexity,
    
    -- Storage access strategy
    CASE storage_type
      WHEN 'mongodb' THEN 'direct_collection_access'
      WHEN 'gridfs' THEN 'streaming_batch_retrieval'
      WHEN 's3' THEN 'cloud_storage_download_and_parse'
      ELSE 'custom_retrieval_strategy'
    END as retrieval_strategy
    
  FROM archive_metadata
  WHERE source_collection = 'orders'
    AND archive_date >= CURRENT_DATE - INTERVAL '1 year'
)

-- Execute optimized archive data retrieval
SELECT 
  RETRIEVE_ARCHIVED_DATA(
    archive_id => aqo.archive_id,
    
    -- Query parameters
    query_filter => JSON_BUILD_OBJECT(
      'customer_id', '507f1f77bcf86cd799439011',
      'total_amount', JSON_BUILD_OBJECT('$gte', 100),
      'order_date', JSON_BUILD_OBJECT(
        '$gte', '2023-01-01',
        '$lte', '2023-12-31'
      )
    ),
    
    -- Retrieval optimization
    retrieval_options => JSON_BUILD_OBJECT(
      'batch_size', CASE 
        WHEN aqo.query_complexity = 'complex_query_optimization_required' THEN 100
        WHEN aqo.query_complexity = 'standard_optimization_recommended' THEN 500
        ELSE 1000
      END,
      'parallel_processing', aqo.query_complexity != 'direct_query_suitable',
      'result_streaming', aqo.record_count > 10000,
      'compression_handling', 'automatic'
    ),
    
    -- Performance settings
    performance_limits => JSON_BUILD_OBJECT(
      'max_execution_time_seconds', 300,
      'memory_limit_mb', 256,
      'max_results', 10000
    )
  ) as retrieval_results
  
FROM archive_query_optimization aqo
WHERE aqo.archive_id IN (
  SELECT archive_id 
  FROM archive_metadata 
  WHERE source_collection = 'orders'
  ORDER BY archive_date DESC 
  LIMIT 5
);

-- QueryLeaf data lifecycle management features:
-- 1. SQL-familiar syntax for MongoDB data retention policy definition
-- 2. Automated archiving execution with batch processing and performance optimization
-- 3. Comprehensive compliance management including GDPR, legal holds, and audit trails
-- 4. Real-time monitoring dashboard for archiving operations and performance metrics
-- 5. Advanced archive data retrieval with query optimization and result streaming
-- 6. Intelligent data lifecycle automation with predictive analysis capabilities
-- 7. Multi-tier storage integration supporting MongoDB, GridFS, S3, and custom storage
-- 8. Performance-aware processing with resource throttling and system impact minimization
-- 9. Enterprise compliance workflows with automated reporting and alert generation
-- 10. Cost optimization strategies with intelligent storage tiering and compression
```

## Best Practices for MongoDB Data Lifecycle Management

### Archiving Strategy Design

Essential principles for effective MongoDB data archiving and lifecycle management:

1. **Policy-Driven Approach**: Define comprehensive retention policies based on business requirements, regulatory compliance, and performance optimization goals
2. **Performance Optimization**: Implement batch processing, indexing strategies, and resource throttling to minimize impact on production systems
3. **Compliance Integration**: Build automated compliance workflows that address regulatory requirements like GDPR, HIPAA, and industry-specific standards
4. **Storage Optimization**: Utilize multi-tier storage strategies with compression, encryption, and geographic distribution for cost and performance optimization
5. **Monitoring and Alerting**: Deploy comprehensive monitoring systems that track archiving performance, compliance status, and operational health
6. **Recovery Planning**: Design archive retrieval processes that support both routine access and emergency recovery scenarios

### Production Deployment Strategies

Optimize MongoDB data lifecycle management for enterprise-scale requirements:

1. **Automated Execution**: Implement scheduled archiving processes with intelligent failure recovery and retry mechanisms
2. **Resource Management**: Configure memory limits, CPU throttling, and I/O optimization to prevent system impact during archiving operations
3. **Compliance Automation**: Deploy automated compliance reporting, audit trail generation, and regulatory requirement enforcement
4. **Cost Optimization**: Implement intelligent storage tiering that automatically moves data to appropriate storage classes based on access patterns
5. **Performance Monitoring**: Monitor archiving throughput, resource utilization, and system performance to optimize operations
6. **Security Integration**: Ensure data encryption, access controls, and audit logging meet enterprise security requirements

## Conclusion

MongoDB data lifecycle management provides comprehensive capabilities for automated data archiving, compliance enforcement, and performance optimization that scale from simple retention policies to enterprise-wide governance programs. The flexible document-based architecture and built-in lifecycle features enable sophisticated archiving strategies that adapt to changing business requirements while maintaining operational efficiency.

Key MongoDB Data Lifecycle Management benefits include:

- **Automated Governance**: Policy-driven data lifecycle management with minimal manual intervention and maximum compliance assurance
- **Performance Optimization**: Intelligent archiving processes that maintain production system performance while managing large-scale data movement
- **Compliance Excellence**: Built-in support for regulatory requirements including GDPR, industry standards, and legal hold management
- **Cost Efficiency**: Multi-tier storage strategies with automated optimization that reduce storage costs while maintaining data accessibility
- **Operational Simplicity**: Streamlined management processes that reduce administrative overhead while ensuring data governance
- **Scalable Architecture**: Enterprise-ready capabilities that support growing data volumes and evolving compliance requirements

Whether you're building regulatory compliance systems, optimizing database performance, managing storage costs, or implementing enterprise data governance, MongoDB's data lifecycle management capabilities with QueryLeaf's familiar SQL interface provide the foundation for comprehensive, automated data archiving at scale.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL-style data lifecycle management commands into optimized MongoDB operations, providing familiar retention policy syntax, archiving execution commands, and compliance reporting queries. Advanced lifecycle management patterns, performance optimization, and regulatory compliance workflows are seamlessly accessible through familiar SQL constructs, making sophisticated data governance both powerful and approachable for SQL-oriented operations teams.

The combination of MongoDB's flexible data lifecycle capabilities with SQL-style governance operations makes it an ideal platform for modern data management applications that require both comprehensive archiving functionality and operational simplicity, ensuring your data governance programs can scale efficiently while meeting evolving regulatory and business requirements.