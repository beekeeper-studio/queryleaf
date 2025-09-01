---
title: "MongoDB Data Migration and Schema Evolution: SQL-Style Database Transformations"
description: "Master MongoDB schema evolution and data migration using familiar SQL patterns. Learn zero-downtime migrations, version management, data validation, and progressive schema changes for production databases."
date: 2025-08-31
tags: [mongodb, migration, schema-evolution, data-transformation, versioning, sql]
---

# MongoDB Data Migration and Schema Evolution: SQL-Style Database Transformations

Application requirements constantly evolve, requiring changes to database schemas and data structures. Whether you're adding new features, optimizing for performance, or adapting to regulatory requirements, managing schema evolution without downtime is critical for production systems. Poor migration strategies can result in application failures, data loss, or extended outages.

MongoDB's flexible document model enables gradual schema evolution, but managing these changes systematically requires proven migration patterns. Combined with SQL-style migration concepts, MongoDB enables controlled schema evolution that maintains data integrity while supporting continuous deployment practices.

## The Schema Evolution Challenge

Traditional SQL databases require explicit schema changes that can lock tables and cause downtime:

```sql
-- SQL schema evolution challenges
-- Adding a new column requires table lock
ALTER TABLE users 
ADD COLUMN preferences JSONB DEFAULT '{}';
-- LOCK acquired on entire table during operation

-- Changing data types requires full table rewrite
ALTER TABLE products 
ALTER COLUMN price TYPE DECIMAL(12,2);
-- Table unavailable during conversion

-- Adding constraints requires validation of all data
ALTER TABLE orders
ADD CONSTRAINT check_order_total 
CHECK (total_amount > 0 AND total_amount <= 100000);
-- Scans entire table to validate constraint

-- Renaming columns breaks application compatibility
ALTER TABLE customers
RENAME COLUMN customer_name TO full_name;
-- Requires coordinated application deployment
```

MongoDB's document model allows for more flexible evolution:

```javascript
// MongoDB flexible schema evolution
// Old document structure
{
  _id: ObjectId("64f1a2c4567890abcdef1234"),
  customer_name: "John Smith",
  email: "john@example.com",
  status: "active",
  created_at: ISODate("2025-01-15")
}

// New document structure (gradually migrated)
{
  _id: ObjectId("64f1a2c4567890abcdef1234"),
  customer_name: "John Smith",     // Legacy field (kept for compatibility)
  full_name: "John Smith",         // New field
  email: "john@example.com",
  contact: {                       // New nested structure
    email: "john@example.com",
    phone: "+1-555-0123",
    preferred_method: "email"
  },
  preferences: {                   // New preferences object
    newsletter: true,
    notifications: true,
    language: "en"
  },
  status: "active",
  schema_version: 2,               // Version tracking
  created_at: ISODate("2025-01-15"),
  updated_at: ISODate("2025-08-31")
}
```

## Planning Schema Evolution

### Migration Strategy Framework

Design systematic migration approaches:

```javascript
// Migration planning framework
class MigrationPlanner {
  constructor(db) {
    this.db = db;
    this.migrations = new Map();
  }

  defineMigration(version, migration) {
    this.migrations.set(version, {
      version: version,
      description: migration.description,
      up: migration.up,
      down: migration.down,
      validation: migration.validation,
      estimatedDuration: migration.estimatedDuration,
      backupRequired: migration.backupRequired || false
    });
  }

  async planEvolution(currentVersion, targetVersion) {
    const migrationPath = [];
    
    for (let v = currentVersion + 1; v <= targetVersion; v++) {
      const migration = this.migrations.get(v);
      if (!migration) {
        throw new Error(`Missing migration for version ${v}`);
      }
      migrationPath.push(migration);
    }

    // Calculate total migration impact
    const totalDuration = migrationPath.reduce(
      (sum, m) => sum + (m.estimatedDuration || 0), 0
    );
    
    const requiresBackup = migrationPath.some(m => m.backupRequired);
    
    return {
      migrationPath: migrationPath,
      totalDuration: totalDuration,
      requiresBackup: requiresBackup,
      riskLevel: this.assessMigrationRisk(migrationPath)
    };
  }

  assessMigrationRisk(migrations) {
    let riskScore = 0;
    
    migrations.forEach(migration => {
      // High risk operations
      if (migration.description.includes('drop') || 
          migration.description.includes('delete')) {
        riskScore += 3;
      }
      
      // Medium risk operations
      if (migration.description.includes('rename') ||
          migration.description.includes('transform')) {
        riskScore += 2;
      }
      
      // Low risk operations
      if (migration.description.includes('add') ||
          migration.description.includes('extend')) {
        riskScore += 1;
      }
    });

    return riskScore > 6 ? 'high' : riskScore > 3 ? 'medium' : 'low';
  }
}
```

SQL-style migration planning concepts:

```sql
-- SQL migration planning equivalent
-- Create migration tracking table
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  applied_by VARCHAR(100),
  duration_ms INTEGER,
  checksum VARCHAR(64)
);

-- Plan migration sequence
WITH migration_plan AS (
  SELECT 
    version,
    description,
    estimated_duration_mins,
    risk_level,
    requires_exclusive_lock,
    rollback_complexity
  FROM pending_migrations
  WHERE version > (SELECT MAX(version) FROM schema_migrations)
  ORDER BY version
)
SELECT 
  version,
  description,
  SUM(estimated_duration_mins) OVER (ORDER BY version) AS cumulative_duration,
  CASE 
    WHEN requires_exclusive_lock THEN 'HIGH_RISK'
    WHEN rollback_complexity = 'complex' THEN 'MEDIUM_RISK'
    ELSE 'LOW_RISK'
  END AS migration_risk
FROM migration_plan;
```

## Zero-Downtime Migration Patterns

### Progressive Field Migration

Implement gradual field evolution without breaking existing applications:

```javascript
// Progressive migration implementation
class ProgressiveMigration {
  constructor(db) {
    this.db = db;
    this.batchSize = 1000;
    this.delayMs = 100;
  }

  async migrateCustomerContactInfo() {
    // Migration: Split single email field into contact object
    const collection = this.db.collection('customers');
    let totalMigrated = 0;
    
    // Phase 1: Add new fields alongside old ones
    await this.addNewContactFields();
    
    // Phase 2: Migrate data in batches
    await this.migrateDataInBatches(collection, totalMigrated);
    
    // Phase 3: Validate migration results
    await this.validateMigrationResults();
    
    return { totalMigrated: totalMigrated, status: 'completed' };
  }

  async addNewContactFields() {
    // Create compound index for efficient queries during migration
    await this.db.collection('customers').createIndex({
      schema_version: 1,
      updated_at: -1
    });
  }

  async migrateDataInBatches(collection, totalMigrated) {
    const cursor = collection.find({
      $or: [
        { schema_version: { $exists: false } },  // Legacy documents
        { schema_version: { $lt: 2 } }           // Previous versions
      ]
    }).batchSize(this.batchSize);

    while (await cursor.hasNext()) {
      const batch = [];
      
      // Collect batch of documents
      for (let i = 0; i < this.batchSize && await cursor.hasNext(); i++) {
        const doc = await cursor.next();
        batch.push(doc);
      }

      // Transform batch
      const bulkOps = batch.map(doc => this.createUpdateOperation(doc));
      
      // Execute batch update
      if (bulkOps.length > 0) {
        await collection.bulkWrite(bulkOps, { ordered: false });
        totalMigrated += bulkOps.length;
        
        console.log(`Migrated ${totalMigrated} documents`);
        
        // Throttle to avoid overwhelming the system
        await this.sleep(this.delayMs);
      }
    }
  }

  createUpdateOperation(document) {
    const update = {
      $set: {
        schema_version: 2,
        updated_at: new Date()
      }
    };

    // Preserve existing email field
    if (document.email && !document.contact) {
      update.$set.contact = {
        email: document.email,
        phone: null,
        preferred_method: "email"
      };
      
      // Keep legacy field for backward compatibility
      update.$set.customer_name = document.customer_name;
      update.$set.full_name = document.customer_name;
    }

    // Add default preferences if missing
    if (!document.preferences) {
      update.$set.preferences = {
        newsletter: false,
        notifications: true,
        language: "en"
      };
    }

    return {
      updateOne: {
        filter: { _id: document._id },
        update: update
      }
    };
  }

  async validateMigrationResults() {
    // Check migration completeness
    const legacyCount = await this.db.collection('customers').countDocuments({
      $or: [
        { schema_version: { $exists: false } },
        { schema_version: { $lt: 2 } }
      ]
    });

    const migratedCount = await this.db.collection('customers').countDocuments({
      schema_version: 2,
      contact: { $exists: true }
    });

    // Validate data integrity
    const invalidDocuments = await this.db.collection('customers').find({
      schema_version: 2,
      $or: [
        { contact: { $exists: false } },
        { "contact.email": { $exists: false } }
      ]
    }).limit(10).toArray();

    return {
      legacyRemaining: legacyCount,
      successfullyMigrated: migratedCount,
      validationErrors: invalidDocuments.length,
      errorSamples: invalidDocuments
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Version-Based Schema Management

Implement schema versioning for controlled evolution:

```javascript
// Schema version management system
class SchemaVersionManager {
  constructor(db) {
    this.db = db;
    this.currentSchemaVersions = new Map();
  }

  async registerSchemaVersion(collection, version, schema) {
    // Store schema definition for validation
    await this.db.collection('schema_definitions').replaceOne(
      { collection: collection, version: version },
      {
        collection: collection,
        version: version,
        schema: schema,
        created_at: new Date(),
        active: true
      },
      { upsert: true }
    );

    this.currentSchemaVersions.set(collection, version);
  }

  async getDocumentsByVersion(collection) {
    const pipeline = [
      {
        $group: {
          _id: { $ifNull: ["$schema_version", 0] },
          count: { $sum: 1 },
          sample_docs: { $push: "$$ROOT" },
          last_updated: { $max: "$updated_at" }
        }
      },
      {
        $addFields: {
          sample_docs: { $slice: ["$sample_docs", 3] }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ];

    return await this.db.collection(collection).aggregate(pipeline).toArray();
  }

  async validateDocumentSchema(collection, document) {
    const schemaVersion = document.schema_version || 0;
    const schemaDef = await this.db.collection('schema_definitions').findOne({
      collection: collection,
      version: schemaVersion
    });

    if (!schemaDef) {
      return {
        valid: false,
        errors: [`Unknown schema version: ${schemaVersion}`]
      };
    }

    return this.validateAgainstSchema(document, schemaDef.schema);
  }

  validateAgainstSchema(document, schema) {
    const errors = [];
    
    // Check required fields
    for (const field of schema.required || []) {
      if (!(field in document)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check field types
    for (const [field, definition] of Object.entries(schema.properties || {})) {
      if (field in document) {
        const value = document[field];
        if (!this.validateFieldType(value, definition)) {
          errors.push(`Invalid type for field ${field}: expected ${definition.type}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  validateFieldType(value, definition) {
    switch (definition.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return value && typeof value === 'object' && !Array.isArray(value);
      case 'date':
        return value instanceof Date || typeof value === 'string';
      default:
        return true;
    }
  }
}
```

SQL-style schema versioning concepts:

```sql
-- SQL schema versioning patterns
CREATE TABLE schema_versions (
  table_name VARCHAR(100),
  version INTEGER,
  migration_sql TEXT,
  rollback_sql TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  applied_by VARCHAR(100),
  PRIMARY KEY (table_name, version)
);

-- Track current schema versions per table
WITH current_versions AS (
  SELECT 
    table_name,
    MAX(version) AS current_version,
    COUNT(*) AS migration_count
  FROM schema_versions
  GROUP BY table_name
)
SELECT 
  t.table_name,
  cv.current_version,
  cv.migration_count,
  t.table_rows,
  pg_size_pretty(pg_total_relation_size(t.table_name)) AS table_size
FROM information_schema.tables t
LEFT JOIN current_versions cv ON t.table_name = cv.table_name
WHERE t.table_schema = 'public';
```

## Data Transformation Strategies

### Bulk Data Transformations

Implement efficient data transformations for large collections:

```javascript
// Bulk data transformation with monitoring
class DataTransformer {
  constructor(db, options = {}) {
    this.db = db;
    this.batchSize = options.batchSize || 1000;
    this.maxConcurrency = options.maxConcurrency || 5;
    this.progressCallback = options.progressCallback;
  }

  async transformOrderHistory() {
    // Migration: Normalize order items into separate collection
    const ordersCollection = this.db.collection('orders');
    const orderItemsCollection = this.db.collection('order_items');
    
    // Create indexes for efficient processing
    await this.prepareCollections();
    
    // Process orders in parallel batches
    const totalOrders = await ordersCollection.countDocuments({
      items: { $exists: true, $type: "array" }
    });
    
    let processedCount = 0;
    const semaphore = new Semaphore(this.maxConcurrency);

    const cursor = ordersCollection.find({
      items: { $exists: true, $type: "array" }
    });

    const batchPromises = [];
    const batch = [];

    while (await cursor.hasNext()) {
      const order = await cursor.next();
      batch.push(order);

      if (batch.length >= this.batchSize) {
        batchPromises.push(
          semaphore.acquire().then(async () => {
            try {
              const result = await this.processBatch([...batch]);
              processedCount += batch.length;
              
              if (this.progressCallback) {
                this.progressCallback(processedCount, totalOrders);
              }
              
              return result;
            } finally {
              semaphore.release();
            }
          })
        );
        
        batch.length = 0;
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      batchPromises.push(this.processBatch(batch));
    }

    // Wait for all batches to complete
    await Promise.all(batchPromises);
    
    return {
      totalProcessed: processedCount,
      status: 'completed'
    };
  }

  async prepareCollections() {
    // Create indexes for efficient queries
    await this.db.collection('orders').createIndex({ 
      items: 1, 
      schema_version: 1 
    });
    
    await this.db.collection('order_items').createIndex({ 
      order_id: 1, 
      product_id: 1 
    });
    
    await this.db.collection('order_items').createIndex({ 
      product_id: 1, 
      created_at: -1 
    });
  }

  async processBatch(orders) {
    const session = this.db.client.startSession();
    
    try {
      return await session.withTransaction(async () => {
        const bulkOrderOps = [];
        const bulkItemOps = [];

        for (const order of orders) {
          // Extract items to separate collection
          const orderItems = order.items.map((item, index) => ({
            _id: new ObjectId(),
            order_id: order._id,
            item_index: index,
            product_id: item.product_id || item.product,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.quantity * item.price,
            created_at: order.created_at || new Date()
          }));

          // Insert order items
          if (orderItems.length > 0) {
            bulkItemOps.push({
              insertMany: {
                documents: orderItems
              }
            });
          }

          // Update order document - remove items array, add summary
          bulkOrderOps.push({
            updateOne: {
              filter: { _id: order._id },
              update: {
                $set: {
                  item_count: orderItems.length,
                  total_items: orderItems.reduce((sum, item) => sum + item.quantity, 0),
                  schema_version: 3,
                  migrated_at: new Date()
                },
                $unset: {
                  items: ""  // Remove old items array
                }
              }
            }
          });
        }

        // Execute bulk operations
        if (bulkItemOps.length > 0) {
          await this.db.collection('order_items').bulkWrite(
            bulkItemOps.map(op => ({ insertOne: op.insertMany.documents[0] })),
            { session, ordered: false }
          );
        }

        if (bulkOrderOps.length > 0) {
          await this.db.collection('orders').bulkWrite(bulkOrderOps, { 
            session, 
            ordered: false 
          });
        }

        return { processedOrders: orders.length };
      });
    } finally {
      await session.endSession();
    }
  }
}

// Semaphore for concurrency control
class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentCount = 0;
    this.waitQueue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.currentCount < this.maxConcurrency) {
        this.currentCount++;
        resolve();
      } else {
        this.waitQueue.push(resolve);
      }
    });
  }

  release() {
    this.currentCount--;
    if (this.waitQueue.length > 0) {
      const nextResolve = this.waitQueue.shift();
      this.currentCount++;
      nextResolve();
    }
  }
}
```

### Field Validation and Constraints

Add validation rules during schema evolution:

```javascript
// Document validation during migration
const customerValidationSchema = {
  $jsonSchema: {
    bsonType: "object",
    title: "Customer Document Validation",
    required: ["full_name", "contact", "status", "schema_version"],
    properties: {
      full_name: {
        bsonType: "string",
        minLength: 1,
        maxLength: 100,
        description: "Customer full name is required"
      },
      contact: {
        bsonType: "object",
        required: ["email"],
        properties: {
          email: {
            bsonType: "string",
            pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
            description: "Valid email address required"
          },
          phone: {
            bsonType: ["string", "null"],
            pattern: "^\\+?[1-9]\\d{1,14}$"
          },
          preferred_method: {
            enum: ["email", "phone", "sms"],
            description: "Contact preference must be email, phone, or sms"
          }
        }
      },
      preferences: {
        bsonType: "object",
        properties: {
          newsletter: { bsonType: "bool" },
          notifications: { bsonType: "bool" },
          language: { 
            bsonType: "string",
            enum: ["en", "es", "fr", "de"]
          }
        }
      },
      status: {
        enum: ["active", "inactive", "suspended"],
        description: "Status must be active, inactive, or suspended"
      },
      schema_version: {
        bsonType: "int",
        minimum: 1,
        maximum: 10
      }
    },
    additionalProperties: true  // Allow additional fields for flexibility
  }
};

// Apply validation to collection
db.runCommand({
  collMod: "customers",
  validator: customerValidationSchema,
  validationLevel: "moderate",  // Allow existing docs, validate new ones
  validationAction: "error"     // Reject invalid documents
});
```

SQL validation constraints comparison:

```sql
-- SQL constraint validation equivalent
-- Add validation constraints progressively
ALTER TABLE customers
ADD CONSTRAINT check_email_format 
CHECK (contact->>'email' ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
NOT VALID;  -- Don't validate existing data immediately

-- Validate existing data gradually
ALTER TABLE customers 
VALIDATE CONSTRAINT check_email_format;

-- Add enum constraints for status
ALTER TABLE customers
ADD CONSTRAINT check_status_values
CHECK (status IN ('active', 'inactive', 'suspended'));

-- Add foreign key constraints
ALTER TABLE order_items
ADD CONSTRAINT fk_order_items_order_id
FOREIGN KEY (order_id) REFERENCES orders(id)
ON DELETE CASCADE;
```

## Migration Testing and Validation

### Pre-Migration Testing

Validate migrations before production deployment:

```javascript
// Migration testing framework
class MigrationTester {
  constructor(sourceDb, testDb) {
    this.sourceDb = sourceDb;
    this.testDb = testDb;
  }

  async testMigration(migration) {
    // 1. Clone production data subset for testing
    await this.cloneTestData();
    
    // 2. Run migration on test data
    const migrationResult = await this.runTestMigration(migration);
    
    // 3. Validate migration results
    const validationResults = await this.validateMigrationResults(migration);
    
    // 4. Test application compatibility
    const compatibilityResults = await this.testApplicationCompatibility();
    
    // 5. Performance impact analysis
    const performanceResults = await this.analyzeMigrationPerformance();
    
    return {
      migration: migration.description,
      migrationResult: migrationResult,
      validationResults: validationResults,
      compatibilityResults: compatibilityResults,
      performanceResults: performanceResults,
      recommendation: this.generateRecommendation(validationResults, compatibilityResults, performanceResults)
    };
  }

  async cloneTestData() {
    const collections = ['customers', 'orders', 'products', 'inventory'];
    
    for (const collectionName of collections) {
      // Copy representative sample of data
      const sampleData = await this.sourceDb.collection(collectionName)
        .aggregate([
          { $sample: { size: 10000 } },  // Random sample
          { $addFields: { _test_copy: true } }
        ]).toArray();
      
      if (sampleData.length > 0) {
        await this.testDb.collection(collectionName).insertMany(sampleData);
      }
    }
  }

  async runTestMigration(migration) {
    const startTime = Date.now();
    
    try {
      const result = await migration.up(this.testDb);
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        duration: duration,
        result: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  async validateMigrationResults(migration) {
    const validationResults = {};
    
    // Data integrity checks
    validationResults.dataIntegrity = await this.validateDataIntegrity();
    
    // Schema compliance checks
    validationResults.schemaCompliance = await this.validateSchemaCompliance();
    
    // Index validity checks
    validationResults.indexHealth = await this.validateIndexes();
    
    return validationResults;
  }

  async validateDataIntegrity() {
    // Check for data corruption or loss
    const checks = [
      {
        name: 'customer_count_preserved',
        query: async () => {
          const before = await this.sourceDb.collection('customers').countDocuments();
          const after = await this.testDb.collection('customers').countDocuments();
          return { before, after, preserved: before === after };
        }
      },
      {
        name: 'email_fields_migrated',
        query: async () => {
          const withContact = await this.testDb.collection('customers').countDocuments({
            "contact.email": { $exists: true }
          });
          const total = await this.testDb.collection('customers').countDocuments();
          return { migrated: withContact, total, percentage: (withContact / total) * 100 };
        }
      }
    ];

    const results = {};
    for (const check of checks) {
      try {
        results[check.name] = await check.query();
      } catch (error) {
        results[check.name] = { error: error.message };
      }
    }

    return results;
  }
}
```

## Production Migration Execution

### Safe Production Migration

Execute migrations safely in production environments:

```javascript
// Production-safe migration executor
class ProductionMigrationRunner {
  constructor(db, options = {}) {
    this.db = db;
    this.options = {
      dryRun: options.dryRun || false,
      monitoring: options.monitoring || true,
      autoRollback: options.autoRollback || true,
      healthCheckInterval: options.healthCheckInterval || 30000,
      ...options
    };
  }

  async executeMigration(migration) {
    const execution = {
      migrationId: migration.version,
      startTime: new Date(),
      status: 'running',
      progress: 0,
      logs: []
    };

    try {
      // Pre-flight checks
      await this.performPreflightChecks(migration);
      
      // Create backup if required
      if (migration.backupRequired) {
        await this.createPreMigrationBackup(migration);
      }
      
      // Start health monitoring
      const healthMonitor = this.startHealthMonitoring();
      
      // Execute migration with monitoring
      if (this.options.dryRun) {
        execution.result = await this.dryRunMigration(migration);
      } else {
        execution.result = await this.runMigrationWithMonitoring(migration);
      }
      
      // Stop monitoring
      healthMonitor.stop();
      
      // Post-migration validation
      const validation = await this.validateMigrationSuccess(migration);
      
      execution.status = validation.success ? 'completed' : 'failed';
      execution.endTime = new Date();
      execution.duration = execution.endTime - execution.startTime;
      execution.validation = validation;
      
      // Log migration completion
      await this.logMigrationCompletion(execution);
      
      return execution;
      
    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = new Date();
      
      // Attempt automatic rollback if enabled
      if (this.options.autoRollback && migration.down) {
        try {
          execution.rollback = await this.executeMigrationRollback(migration);
        } catch (rollbackError) {
          execution.rollbackError = rollbackError.message;
        }
      }
      
      throw error;
    }
  }

  async performPreflightChecks(migration) {
    const checks = [
      this.checkReplicaSetHealth(),
      this.checkDiskSpace(),
      this.checkReplicationLag(),
      this.checkActiveConnections(),
      this.checkOplogSize()
    ];

    const results = await Promise.all(checks);
    
    const failures = results.filter(result => !result.passed);
    if (failures.length > 0) {
      throw new Error(`Pre-flight checks failed: ${failures.map(f => f.message).join(', ')}`);
    }
  }

  async checkReplicaSetHealth() {
    try {
      const status = await this.db.admin().command({ replSetGetStatus: 1 });
      const primaryCount = status.members.filter(m => m.state === 1).length;
      const healthySecondaries = status.members.filter(m => m.state === 2 && m.health === 1).length;
      
      return {
        passed: primaryCount === 1 && healthySecondaries >= 1,
        message: `Replica set health: ${primaryCount} primary, ${healthySecondaries} healthy secondaries`
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to check replica set health: ${error.message}`
      };
    }
  }

  async runMigrationWithMonitoring(migration) {
    const startTime = Date.now();
    
    // Execute migration with progress tracking
    const result = await migration.up(this.db, {
      progressCallback: (current, total) => {
        const percentage = Math.round((current / total) * 100);
        console.log(`Migration progress: ${percentage}% (${current}/${total})`);
      },
      healthCallback: async () => {
        const health = await this.checkSystemHealth();
        if (!health.healthy) {
          throw new Error(`System health degraded during migration: ${health.issues.join(', ')}`);
        }
      }
    });

    return {
      ...result,
      executionTime: Date.now() - startTime
    };
  }

  startHealthMonitoring() {
    const interval = setInterval(async () => {
      try {
        const health = await this.checkSystemHealth();
        if (!health.healthy) {
          console.warn('System health warning:', health.issues);
        }
      } catch (error) {
        console.error('Health check failed:', error.message);
      }
    }, this.options.healthCheckInterval);

    return {
      stop: () => clearInterval(interval)
    };
  }

  async checkSystemHealth() {
    const issues = [];
    
    // Check replication lag
    const replStatus = await this.db.admin().command({ replSetGetStatus: 1 });
    const maxLag = this.calculateMaxReplicationLag(replStatus.members);
    if (maxLag > 30000) {  // 30 seconds
      issues.push(`High replication lag: ${maxLag / 1000}s`);
    }

    // Check connection count
    const serverStatus = await this.db.admin().command({ serverStatus: 1 });
    const connUtilization = serverStatus.connections.current / serverStatus.connections.available;
    if (connUtilization > 0.8) {
      issues.push(`High connection utilization: ${Math.round(connUtilization * 100)}%`);
    }

    // Check memory usage
    if (serverStatus.mem.resident > 8000) {  // 8GB
      issues.push(`High memory usage: ${serverStatus.mem.resident}MB`);
    }

    return {
      healthy: issues.length === 0,
      issues: issues
    };
  }
}
```

## Application Compatibility During Migration

### Backward Compatibility Strategies

Maintain application compatibility during schema evolution:

```javascript
// Application compatibility layer
class SchemaCompatibilityLayer {
  constructor(db) {
    this.db = db;
    this.documentAdapters = new Map();
  }

  registerDocumentAdapter(collection, fromVersion, toVersion, adapter) {
    const key = `${collection}:${fromVersion}:${toVersion}`;
    this.documentAdapters.set(key, adapter);
  }

  async findWithCompatibility(collection, query, options = {}) {
    const documents = await this.db.collection(collection).find(query, options).toArray();
    
    return documents.map(doc => this.adaptDocument(collection, doc));
  }

  adaptDocument(collection, document) {
    const schemaVersion = document.schema_version || 1;
    const targetVersion = 2;  // Current application version

    if (schemaVersion === targetVersion) {
      return document;
    }

    // Apply version-specific transformations
    let adapted = { ...document };
    
    for (let v = schemaVersion; v < targetVersion; v++) {
      const adapterKey = `${collection}:${v}:${v + 1}`;
      const adapter = this.documentAdapters.get(adapterKey);
      
      if (adapter) {
        adapted = adapter(adapted);
      }
    }

    return adapted;
  }

  // Example adapters
  setupCustomerAdapters() {
    // V1 to V2: Add contact object and full_name field
    this.registerDocumentAdapter('customers', 1, 2, (doc) => ({
      ...doc,
      full_name: doc.customer_name || doc.full_name,
      contact: doc.contact || {
        email: doc.email,
        phone: null,
        preferred_method: "email"
      },
      preferences: doc.preferences || {
        newsletter: false,
        notifications: true,
        language: "en"
      }
    }));
  }
}

// Application service with compatibility
class CustomerService {
  constructor(db) {
    this.db = db;
    this.compatibility = new SchemaCompatibilityLayer(db);
    this.compatibility.setupCustomerAdapters();
  }

  async getCustomer(customerId) {
    const customers = await this.compatibility.findWithCompatibility(
      'customers',
      { _id: customerId }
    );
    
    return customers[0];
  }

  async createCustomer(customerData) {
    // Always use latest schema version for new documents
    const document = {
      ...customerData,
      schema_version: 2,
      created_at: new Date(),
      updated_at: new Date()
    };

    return await this.db.collection('customers').insertOne(document);
  }

  async updateCustomer(customerId, updates) {
    // Ensure updates don't break schema version
    const customer = await this.getCustomer(customerId);
    const targetVersion = 2;
    
    if (customer.schema_version < targetVersion) {
      // Upgrade document during update
      updates.schema_version = targetVersion;
      updates.updated_at = new Date();
      
      // Apply compatibility transformations
      if (!updates.full_name && customer.customer_name) {
        updates.full_name = customer.customer_name;
      }
      
      if (!updates.contact && customer.email) {
        updates.contact = {
          email: customer.email,
          phone: null,
          preferred_method: "email"
        };
      }
    }

    return await this.db.collection('customers').updateOne(
      { _id: customerId },
      { $set: updates }
    );
  }
}
```

## QueryLeaf Migration Integration

QueryLeaf provides SQL-familiar migration management:

```sql
-- QueryLeaf migration syntax
-- Enable migration mode for safe schema evolution
SET MIGRATION_MODE = 'gradual';
SET MIGRATION_BATCH_SIZE = 1000;
SET MIGRATION_THROTTLE_MS = 100;

-- Schema evolution with familiar SQL DDL
-- Add new columns gradually
ALTER TABLE customers 
ADD COLUMN contact JSONB DEFAULT '{"email": null, "phone": null}';

-- Transform existing data using SQL syntax
UPDATE customers 
SET contact = JSON_BUILD_OBJECT(
  'email', email,
  'phone', phone_number,
  'preferred_method', 'email'
),
full_name = customer_name,
schema_version = 2
WHERE schema_version < 2 OR schema_version IS NULL;

-- Add validation constraints
ALTER TABLE customers
ADD CONSTRAINT check_contact_email
CHECK (contact->>'email' IS NOT NULL);

-- Create new normalized structure
CREATE TABLE order_items AS
SELECT 
  GENERATE_UUID() as id,
  order_id,
  item->>'product_id' as product_id,
  (item->>'quantity')::INTEGER as quantity,
  (item->>'price')::DECIMAL as price,
  created_at
FROM orders o,
LATERAL JSON_ARRAY_ELEMENTS(items) as item
WHERE items IS NOT NULL;

-- Add indexes for new structure
CREATE INDEX idx_order_items_order_id ON order_items (order_id);
CREATE INDEX idx_order_items_product_id ON order_items (product_id);

-- QueryLeaf automatically:
-- 1. Executes migrations in safe batches
-- 2. Monitors replication lag during migration
-- 3. Provides rollback capabilities
-- 4. Validates schema changes before execution
-- 5. Maintains compatibility with existing queries
-- 6. Tracks migration progress and completion

-- Monitor migration progress
SELECT 
  collection_name,
  schema_version,
  COUNT(*) as document_count,
  MAX(updated_at) as last_migration_time
FROM (
  SELECT 'customers' as collection_name, schema_version, updated_at FROM customers
  UNION ALL
  SELECT 'orders' as collection_name, schema_version, updated_at FROM orders
) migration_status
GROUP BY collection_name, schema_version
ORDER BY collection_name, schema_version;

-- Validate migration completion
SELECT 
  collection_name,
  CASE 
    WHEN legacy_documents = 0 THEN 'COMPLETED'
    WHEN legacy_documents < total_documents * 0.1 THEN 'NEARLY_COMPLETE' 
    ELSE 'IN_PROGRESS'
  END as migration_status,
  legacy_documents,
  migrated_documents,
  total_documents,
  ROUND(100.0 * migrated_documents / total_documents, 2) as completion_percentage
FROM (
  SELECT 
    'customers' as collection_name,
    COUNT(CASE WHEN schema_version < 2 OR schema_version IS NULL THEN 1 END) as legacy_documents,
    COUNT(CASE WHEN schema_version >= 2 THEN 1 END) as migrated_documents,
    COUNT(*) as total_documents
  FROM customers
) migration_summary;
```

## Best Practices for MongoDB Migrations

### Migration Planning Guidelines

1. **Version Control**: Track all schema changes in version control with clear documentation
2. **Testing**: Test migrations thoroughly on production-like data before deployment  
3. **Monitoring**: Monitor system health continuously during migration execution
4. **Rollback Strategy**: Always have a rollback plan and test rollback procedures
5. **Communication**: Coordinate with application teams for compatibility requirements
6. **Performance Impact**: Consider migration impact on production workloads and schedule accordingly

### Operational Procedures

1. **Backup First**: Always create backups before executing irreversible migrations
2. **Gradual Deployment**: Use progressive rollouts with feature flags when possible
3. **Health Monitoring**: Monitor replication lag, connection counts, and system resources
4. **Rollback Readiness**: Keep rollback scripts tested and ready for immediate execution
5. **Documentation**: Document all migration steps and decision rationale

## Conclusion

MongoDB data migration and schema evolution enable applications to adapt to changing requirements while maintaining high availability and data integrity. Through systematic migration planning, progressive deployment strategies, and comprehensive testing, teams can evolve database schemas safely in production environments.

Key migration strategies include:

- **Progressive Migration**: Evolve schemas gradually without breaking existing functionality
- **Version Management**: Track schema versions and maintain compatibility across application versions  
- **Zero-Downtime Deployment**: Use batched operations and health monitoring for continuous availability
- **Validation Framework**: Implement comprehensive testing and validation before production deployment
- **Rollback Capabilities**: Maintain tested rollback procedures for rapid recovery when needed

Whether you're normalizing data structures, adding new features, or optimizing for performance, MongoDB migration patterns with QueryLeaf's familiar SQL interface provide the foundation for safe, controlled schema evolution. This combination enables teams to evolve their database schemas confidently while preserving both data integrity and application availability.

The integration of flexible document evolution with SQL-style migration management makes MongoDB an ideal platform for applications requiring both adaptability and reliability as they grow and change over time.