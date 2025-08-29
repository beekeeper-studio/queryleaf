---
title: "MongoDB Replica Sets: High Availability and Failover with SQL-Style Database Operations"
description: "Master MongoDB replica sets for building highly available applications. Learn primary-secondary architectures, automatic failover, read preferences, and SQL-style high availability patterns."
date: 2025-08-28
tags: [mongodb, replica-sets, high-availability, failover, disaster-recovery, sql]
---

# MongoDB Replica Sets: High Availability and Failover with SQL-Style Database Operations

Modern applications demand continuous availability and fault tolerance. Whether you're running e-commerce platforms, financial systems, or global SaaS applications, database downtime can result in lost revenue, poor user experiences, and damaged business reputation. Single-server database deployments create critical points of failure that can bring entire applications offline.

MongoDB replica sets provide automatic failover and data redundancy through distributed database clusters. Combined with SQL-style high availability patterns, replica sets enable robust database architectures that maintain service continuity even when individual servers fail.

## The High Availability Challenge

Traditional single-server database deployments have inherent reliability limitations:

```sql
-- Single database server limitations
-- Single point of failure scenarios:

-- Hardware failure
SELECT order_id, customer_id, total_amount 
FROM orders
WHERE status = 'pending';
-- ERROR: Connection failed - server hardware malfunction

-- Network partition
UPDATE inventory 
SET quantity = quantity - 5 
WHERE product_id = 'LAPTOP001';
-- ERROR: Network timeout - server unreachable

-- Planned maintenance
ALTER TABLE users ADD COLUMN preferences JSONB;
-- ERROR: Database offline for maintenance

-- Data corruption
SELECT * FROM critical_business_data;
-- ERROR: Table corrupted, data unreadable
```

MongoDB replica sets solve these problems through distributed architecture:

```javascript
// MongoDB replica set provides automatic failover
const replicaSetConnection = {
  hosts: [
    'mongodb-primary.example.com:27017',
    'mongodb-secondary1.example.com:27017', 
    'mongodb-secondary2.example.com:27017'
  ],
  replicaSet: 'production-rs',
  readPreference: 'primaryPreferred',
  writeConcern: { w: 'majority', j: true }
};

// Automatic failover handling
db.orders.insertOne({
  customer_id: ObjectId("64f1a2c4567890abcdef1234"),
  items: [{ product: 'laptop', quantity: 1, price: 1200 }],
  total_amount: 1200,
  status: 'pending',
  created_at: new Date()
});
// Automatically routes to available primary server
// Fails over seamlessly if primary becomes unavailable
```

## Understanding Replica Set Architecture

### Replica Set Components

A MongoDB replica set consists of multiple servers working together:

```javascript
// Replica set topology
{
  "_id": "production-rs",
  "version": 1,
  "members": [
    {
      "_id": 0,
      "host": "mongodb-primary.example.com:27017",
      "priority": 2,      // Higher priority = preferred primary
      "votes": 1,         // Participates in elections
      "arbiterOnly": false
    },
    {
      "_id": 1, 
      "host": "mongodb-secondary1.example.com:27017",
      "priority": 1,      // Can become primary
      "votes": 1,
      "arbiterOnly": false,
      "hidden": false     // Visible to clients
    },
    {
      "_id": 2,
      "host": "mongodb-secondary2.example.com:27017", 
      "priority": 1,
      "votes": 1,
      "arbiterOnly": false,
      "buildIndexes": true,
      "tags": { "datacenter": "west", "usage": "analytics" }
    },
    {
      "_id": 3,
      "host": "mongodb-arbiter.example.com:27017",
      "priority": 0,      // Cannot become primary
      "votes": 1,         // Votes in elections only
      "arbiterOnly": true // No data storage
    }
  ],
  "settings": {
    "electionTimeoutMillis": 10000,
    "heartbeatIntervalMillis": 2000,
    "catchUpTimeoutMillis": 60000
  }
}
```

SQL-style high availability comparison:

```sql
-- Conceptual SQL cluster configuration
CREATE CLUSTER production_cluster AS (
  -- Primary database server
  PRIMARY SERVER db1.example.com 
    WITH PRIORITY = 2,
         VOTES = 1,
         AUTO_FAILOVER = TRUE,
  
  -- Secondary servers for redundancy
  SECONDARY SERVER db2.example.com
    WITH PRIORITY = 1,
         VOTES = 1,
         READ_ALLOWED = TRUE,
         REPLICATION_ROLE = 'synchronous',
         
  SECONDARY SERVER db3.example.com  
    WITH PRIORITY = 1,
         VOTES = 1,
         READ_ALLOWED = TRUE,
         REPLICATION_ROLE = 'asynchronous',
         DATACENTER = 'west',
         
  -- Witness server for quorum
  WITNESS SERVER witness.example.com
    WITH VOTES = 1,
         DATA_STORAGE = FALSE,
         ELECTION_ONLY = TRUE
)
WITH ELECTION_TIMEOUT = 10000ms,
     HEARTBEAT_INTERVAL = 2000ms,
     FAILOVER_MODE = 'automatic';
```

### Data Replication Process

Replica sets maintain data consistency through oplog replication:

```javascript
// Oplog (operations log) structure
{
  "ts": Timestamp(1693547204, 1),
  "t": NumberLong("1"),
  "h": NumberLong("4321"),
  "v": 2,
  "op": "i",  // operation type: i=insert, u=update, d=delete
  "ns": "ecommerce.orders",
  "o": {  // operation document
    "_id": ObjectId("64f1a2c4567890abcdef1234"),
    "customer_id": ObjectId("64f1a2c4567890abcdef5678"),
    "total_amount": 159.98,
    "status": "pending"
  }
}

// Replication flow:
// 1. Write operation executed on primary
// 2. Operation recorded in primary's oplog
// 3. Secondary servers read and apply oplog entries
// 4. Write acknowledged based on write concern
```

## Setting Up Production Replica Sets

### Initial Replica Set Configuration

Deploy a production-ready replica set:

```javascript
// 1. Start MongoDB instances with replica set configuration
// Primary server (db1.example.com)
mongod --replSet production-rs --dbpath /data/db --logpath /var/log/mongodb.log --fork --bind_ip 0.0.0.0

// Secondary servers (db2.example.com, db3.example.com)
mongod --replSet production-rs --dbpath /data/db --logpath /var/log/mongodb.log --fork --bind_ip 0.0.0.0

// Arbiter server (arbiter.example.com) 
mongod --replSet production-rs --dbpath /data/db --logpath /var/log/mongodb.log --fork --bind_ip 0.0.0.0

// 2. Initialize replica set from primary
rs.initiate({
  _id: "production-rs",
  members: [
    { _id: 0, host: "db1.example.com:27017", priority: 2 },
    { _id: 1, host: "db2.example.com:27017", priority: 1 },
    { _id: 2, host: "db3.example.com:27017", priority: 1 },
    { _id: 3, host: "arbiter.example.com:27017", arbiterOnly: true }
  ]
});

// 3. Verify replica set status
rs.status();

// 4. Monitor replication lag
rs.printSlaveReplicationInfo();
```

### Advanced Configuration Options

Configure replica sets for specific requirements:

```javascript
// Production-optimized replica set configuration
const productionConfig = {
  _id: "production-rs",
  version: 1,
  members: [
    {
      _id: 0,
      host: "db-primary-us-east.example.com:27017",
      priority: 3,          // Highest priority
      votes: 1,
      tags: { 
        "datacenter": "us-east", 
        "server_class": "high-performance",
        "backup_target": "primary"
      }
    },
    {
      _id: 1,
      host: "db-secondary-us-east.example.com:27017", 
      priority: 2,          // Secondary priority
      votes: 1,
      tags: { 
        "datacenter": "us-east",
        "server_class": "standard",
        "backup_target": "secondary"
      }
    },
    {
      _id: 2,
      host: "db-secondary-us-west.example.com:27017",
      priority: 1,          // Geographic failover
      votes: 1,
      tags: {
        "datacenter": "us-west",
        "server_class": "standard"
      }
    },
    {
      _id: 3,
      host: "db-hidden-analytics.example.com:27017",
      priority: 0,          // Cannot become primary
      votes: 0,             // Does not vote in elections
      hidden: true,         // Hidden from client routing
      buildIndexes: true,   // Maintains indexes
      tags: {
        "usage": "analytics",
        "datacenter": "us-east"
      }
    }
  ],
  settings: {
    // Election configuration
    electionTimeoutMillis: 10000,      // Time before new election
    heartbeatIntervalMillis: 2000,     // Heartbeat frequency
    catchUpTimeoutMillis: 60000,       // New primary catchup time
    
    // Write concern settings
    getLastErrorDefaults: {
      w: "majority",                   // Majority write concern default
      j: true,                         // Require journal acknowledgment
      wtimeout: 10000                  // Write timeout
    },
    
    // Read preference settings
    chainingAllowed: true,             // Allow secondary-to-secondary replication
    
    // Connection settings
    replicationHeartbeatTimeout: 10000
  }
};

// Apply configuration
rs.reconfig(productionConfig);
```

## Read Preferences and Load Distribution

### Optimizing Read Operations

Configure read preferences for different use cases:

```javascript
// Read preference strategies
class DatabaseConnection {
  constructor() {
    this.client = new MongoClient('mongodb://db1.example.com:27017,db2.example.com:27017,db3.example.com:27017/ecommerce?replicaSet=production-rs');
  }

  // Real-time operations - read from primary for consistency
  async getRealTimeData(collection, query) {
    return await this.client.db()
      .collection(collection)
      .find(query)
      .read(MongoClient.ReadPreference.PRIMARY)
      .toArray();
  }

  // Analytics queries - allow secondary reads for load distribution  
  async getAnalyticsData(collection, pipeline) {
    return await this.client.db()
      .collection(collection)
      .aggregate(pipeline)
      .read(MongoClient.ReadPreference.SECONDARY_PREFERRED)
      .maxTimeMS(300000)  // 5 minute timeout for analytics
      .toArray();
  }

  // Reporting queries - use tagged secondary for dedicated reporting
  async getReportingData(collection, query) {
    return await this.client.db()
      .collection(collection)
      .find(query)
      .read({
        mode: MongoClient.ReadPreference.NEAREST,
        tags: [{ usage: "analytics" }]
      })
      .toArray();
  }

  // Geographically distributed reads
  async getRegionalData(collection, query, region) {
    const readPreference = {
      mode: MongoClient.ReadPreference.NEAREST,
      tags: [{ datacenter: region }],
      maxStalenessMS: 120000  // Allow 2 minutes staleness
    };

    return await this.client.db()
      .collection(collection)
      .find(query)
      .read(readPreference)
      .toArray();
  }
}
```

SQL-style read distribution patterns:

```sql
-- SQL read replica configuration concepts
-- Primary database for writes and consistent reads
SELECT order_id, status, total_amount
FROM orders@PRIMARY  -- Read from primary for latest data
WHERE customer_id = 12345;

-- Read replicas for analytics and reporting
SELECT 
  DATE(created_at) AS order_date,
  COUNT(*) AS daily_orders,
  SUM(total_amount) AS daily_revenue
FROM orders@SECONDARY_PREFERRED  -- Allow secondary reads
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at);

-- Geographic read routing
SELECT product_id, inventory_count
FROM inventory@NEAREST_DATACENTER('us-west')  -- Route to nearest replica
WHERE product_category = 'electronics';

-- Dedicated analytics server
SELECT customer_id, purchase_behavior_score
FROM customer_analytics@ANALYTICS_REPLICA  -- Dedicated analytics replica
WHERE last_purchase >= CURRENT_DATE - INTERVAL '90 days';
```

## Automatic Failover and Recovery

### Failover Scenarios and Handling

Understand how replica sets handle different failure scenarios:

```javascript
// Replica set failover monitoring
class ReplicaSetMonitor {
  constructor(client) {
    this.client = client;
    this.replicaSetStatus = null;
  }

  async monitorReplicaSetHealth() {
    try {
      // Check replica set status
      const admin = this.client.db().admin();
      this.replicaSetStatus = await admin.command({ replSetGetStatus: 1 });
      
      return this.analyzeClusterHealth();
    } catch (error) {
      console.error('Failed to get replica set status:', error);
      return { status: 'unknown', error: error.message };
    }
  }

  analyzeClusterHealth() {
    const members = this.replicaSetStatus.members;
    
    // Count members by state
    const memberStates = {
      primary: members.filter(m => m.state === 1).length,
      secondary: members.filter(m => m.state === 2).length,
      recovering: members.filter(m => m.state === 3).length,
      down: members.filter(m => m.state === 8).length,
      arbiter: members.filter(m => m.state === 7).length
    };

    // Check for healthy primary
    const primaryNode = members.find(m => m.state === 1);
    
    // Check replication lag
    const maxLag = this.calculateMaxReplicationLag(members);
    
    // Determine overall cluster health
    let clusterHealth = 'healthy';
    const issues = [];

    if (memberStates.primary === 0) {
      clusterHealth = 'no_primary';
      issues.push('No primary node available');
    } else if (memberStates.primary > 1) {
      clusterHealth = 'split_brain';
      issues.push('Multiple primary nodes detected');
    }

    if (memberStates.down > 0) {
      clusterHealth = 'degraded';
      issues.push(`${memberStates.down} members are down`);
    }

    if (maxLag > 60000) {  // More than 60 seconds lag
      clusterHealth = 'lagged';
      issues.push(`Maximum replication lag: ${maxLag / 1000}s`);
    }

    return {
      status: clusterHealth,
      memberStates: memberStates,
      primary: primaryNode ? primaryNode.name : null,
      maxReplicationLag: maxLag,
      issues: issues,
      timestamp: new Date()
    };
  }

  calculateMaxReplicationLag(members) {
    const primaryNode = members.find(m => m.state === 1);
    if (!primaryNode) return null;

    const primaryOpTime = primaryNode.optimeDate;
    
    return Math.max(...members
      .filter(m => m.state === 2)  // Secondary nodes only
      .map(member => primaryOpTime - member.optimeDate)
    );
  }
}
```

### Application-Level Failover Handling

Build resilient applications that handle failover gracefully:

```javascript
// Resilient database operations with retry logic
class ResilientDatabaseClient {
  constructor(connectionString) {
    this.client = new MongoClient(connectionString, {
      replicaSet: 'production-rs',
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      
      // Retry configuration
      retryWrites: true,
      retryReads: true,
      
      // Write concern for consistency
      writeConcern: { 
        w: 'majority', 
        j: true, 
        wtimeout: 10000 
      }
    });
  }

  async executeWithRetry(operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (this.isRetryableError(error) && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`Operation failed (attempt ${attempt}), retrying in ${delay}ms:`, error.message);
          await this.sleep(delay);
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
    // Network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // MongoDB specific retryable errors
    const retryableCodes = [
      11600,  // InterruptedAtShutdown
      11602,  // InterruptedDueToReplStateChange  
      10107,  // NotMaster
      13435,  // NotMasterNoSlaveOk
      13436   // NotMasterOrSecondary
    ];
    
    return retryableCodes.includes(error.code);
  }

  async createOrder(orderData) {
    return await this.executeWithRetry(async () => {
      const session = this.client.startSession();
      
      try {
        return await session.withTransaction(async () => {
          // Insert order
          const orderResult = await this.client
            .db('ecommerce')
            .collection('orders')
            .insertOne(orderData, { session });

          // Update inventory
          for (const item of orderData.items) {
            await this.client
              .db('ecommerce')
              .collection('inventory')
              .updateOne(
                { 
                  product_id: item.product_id,
                  quantity: { $gte: item.quantity }
                },
                { $inc: { quantity: -item.quantity } },
                { session }
              );
          }

          return orderResult;
        }, {
          readConcern: { level: 'majority' },
          writeConcern: { w: 'majority', j: true }
        });
      } finally {
        await session.endSession();
      }
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Write Concerns and Data Consistency

### Configuring Write Acknowledgment

Balance consistency and performance with appropriate write concerns:

```sql
-- SQL-style transaction consistency levels
-- Strict consistency - wait for replication to all nodes
INSERT INTO orders (customer_id, total_amount, status)
VALUES (12345, 159.99, 'pending')
WITH CONSISTENCY_LEVEL = 'ALL_REPLICAS',
     TIMEOUT = 10000ms;

-- Majority consistency - wait for majority of nodes
UPDATE inventory 
SET quantity = quantity - 1
WHERE product_id = 'LAPTOP001'
WITH CONSISTENCY_LEVEL = 'MAJORITY',
     JOURNAL_SYNC = true,
     TIMEOUT = 5000ms;

-- Async replication - acknowledge immediately
INSERT INTO user_activity_log (user_id, action, timestamp)
VALUES (12345, 'page_view', NOW())
WITH CONSISTENCY_LEVEL = 'PRIMARY_ONLY',
     ASYNC_REPLICATION = true;
```

MongoDB write concern implementation:

```javascript
// Write concern strategies for different operations
class TransactionManager {
  constructor(client) {
    this.client = client;
  }

  // Critical financial transactions - strict consistency
  async processPayment(paymentData) {
    const session = this.client.startSession();
    
    try {
      return await session.withTransaction(async () => {
        // Deduct from account with strict consistency
        await this.client.db('banking')
          .collection('accounts')
          .updateOne(
            { account_id: paymentData.from_account },
            { $inc: { balance: -paymentData.amount } },
            { 
              session,
              writeConcern: { 
                w: "majority",      // Wait for majority
                j: true,            // Wait for journal
                wtimeout: 10000     // 10 second timeout
              }
            }
          );

        // Credit target account
        await this.client.db('banking')
          .collection('accounts')
          .updateOne(
            { account_id: paymentData.to_account },
            { $inc: { balance: paymentData.amount } },
            { session, writeConcern: { w: "majority", j: true, wtimeout: 10000 } }
          );

        // Log transaction
        await this.client.db('banking')
          .collection('transaction_log')
          .insertOne({
            from_account: paymentData.from_account,
            to_account: paymentData.to_account,
            amount: paymentData.amount,
            timestamp: new Date(),
            status: 'completed'
          }, { 
            session, 
            writeConcern: { w: "majority", j: true, wtimeout: 10000 }
          });
          
      }, {
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true, wtimeout: 15000 }
      });
    } finally {
      await session.endSession();
    }
  }

  // Standard business operations - balanced consistency
  async createOrder(orderData) {
    return await this.client.db('ecommerce')
      .collection('orders')
      .insertOne(orderData, {
        writeConcern: { 
          w: "majority",    // Majority of voting members
          j: true,          // Journal acknowledgment  
          wtimeout: 5000    // 5 second timeout
        }
      });
  }

  // Analytics and logging - performance optimized
  async logUserActivity(activityData) {
    return await this.client.db('analytics')
      .collection('user_events')
      .insertOne(activityData, {
        writeConcern: { 
          w: 1,           // Primary only
          j: false,       // No journal wait
          wtimeout: 1000  // Quick timeout
        }
      });
  }

  // Bulk operations - optimized for throughput
  async bulkInsertAnalytics(documents) {
    return await this.client.db('analytics')
      .collection('events')
      .insertMany(documents, {
        ordered: false,   // Allow parallel inserts
        writeConcern: { 
          w: 1,          // Primary acknowledgment only
          j: false       // No journal synchronization
        }
      });
  }
}
```

## Backup and Disaster Recovery

### Automated Backup Strategies

Implement comprehensive backup strategies for replica sets:

```javascript
// Automated backup system
class ReplicaSetBackupManager {
  constructor(client, config) {
    this.client = client;
    this.config = config;
  }

  async performIncrementalBackup() {
    // Use oplog for incremental backups
    const admin = this.client.db().admin();
    const oplogCollection = this.client.db('local').collection('oplog.rs');
    
    // Get last backup timestamp
    const lastBackupTime = await this.getLastBackupTimestamp();
    
    // Query oplog entries since last backup
    const oplogEntries = await oplogCollection.find({
      ts: { $gt: lastBackupTime },
      ns: { $not: /^(admin\.|config\.)/ }  // Skip system databases
    }).toArray();

    // Process and store oplog entries
    await this.storeIncrementalBackup(oplogEntries);
    
    // Update backup timestamp
    await this.updateLastBackupTimestamp();
    
    return {
      entriesProcessed: oplogEntries.length,
      backupTime: new Date(),
      type: 'incremental'
    };
  }

  async performFullBackup() {
    const databases = await this.client.db().admin().listDatabases();
    const backupResults = [];

    for (const dbInfo of databases.databases) {
      if (this.shouldBackupDatabase(dbInfo.name)) {
        const result = await this.backupDatabase(dbInfo.name);
        backupResults.push(result);
      }
    }

    return {
      databases: backupResults,
      backupTime: new Date(),
      type: 'full'
    };
  }

  async backupDatabase(databaseName) {
    const db = this.client.db(databaseName);
    const collections = await db.listCollections().toArray();
    const collectionBackups = [];

    for (const collInfo of collections) {
      if (collInfo.type === 'collection') {
        const documents = await db.collection(collInfo.name).find({}).toArray();
        const indexes = await db.collection(collInfo.name).listIndexes().toArray();
        
        await this.storeCollectionBackup(databaseName, collInfo.name, {
          documents: documents,
          indexes: indexes,
          options: collInfo.options
        });
        
        collectionBackups.push({
          name: collInfo.name,
          documentCount: documents.length,
          indexCount: indexes.length
        });
      }
    }

    return {
      database: databaseName,
      collections: collectionBackups
    };
  }

  shouldBackupDatabase(dbName) {
    const systemDatabases = ['admin', 'config', 'local'];
    return !systemDatabases.includes(dbName);
  }
}
```

SQL-style backup and recovery concepts:

```sql
-- SQL backup strategies equivalent
-- Full database backup
BACKUP DATABASE ecommerce 
TO '/backups/ecommerce_full_2025-08-28.bak'
WITH FORMAT, 
     INIT,
     COMPRESSION,
     CHECKSUM;

-- Transaction log backup for point-in-time recovery
BACKUP LOG ecommerce
TO '/backups/ecommerce_log_2025-08-28_10-15.trn'
WITH COMPRESSION;

-- Differential backup
BACKUP DATABASE ecommerce
TO '/backups/ecommerce_diff_2025-08-28.bak'
WITH DIFFERENTIAL,
     COMPRESSION,
     CHECKSUM;

-- Point-in-time restore
RESTORE DATABASE ecommerce_recovery
FROM '/backups/ecommerce_full_2025-08-28.bak'
WITH NORECOVERY,
     MOVE 'ecommerce' TO '/data/ecommerce_recovery.mdf';

RESTORE LOG ecommerce_recovery  
FROM '/backups/ecommerce_log_2025-08-28_10-15.trn'
WITH RECOVERY,
     STOPAT = '2025-08-28 10:14:30.000';
```

## Performance Monitoring and Optimization

### Replica Set Performance Metrics

Monitor replica set health and performance:

```javascript
// Comprehensive replica set monitoring
class ReplicaSetPerformanceMonitor {
  constructor(client) {
    this.client = client;
    this.metrics = new Map();
  }

  async collectMetrics() {
    const metrics = {
      replicationLag: await this.measureReplicationLag(),
      oplogStats: await this.getOplogStatistics(), 
      connectionStats: await this.getConnectionStatistics(),
      memberHealth: await this.assessMemberHealth(),
      throughputStats: await this.measureThroughput()
    };

    this.metrics.set(Date.now(), metrics);
    return metrics;
  }

  async measureReplicationLag() {
    const replSetStatus = await this.client.db().admin().command({ replSetGetStatus: 1 });
    const primary = replSetStatus.members.find(m => m.state === 1);
    
    if (!primary) return null;

    const secondaries = replSetStatus.members.filter(m => m.state === 2);
    const lagStats = secondaries.map(secondary => ({
      member: secondary.name,
      lag: primary.optimeDate - secondary.optimeDate,
      state: secondary.stateStr,
      health: secondary.health
    }));

    return {
      maxLag: Math.max(...lagStats.map(s => s.lag)),
      avgLag: lagStats.reduce((sum, s) => sum + s.lag, 0) / lagStats.length,
      members: lagStats
    };
  }

  async getOplogStatistics() {
    const oplogStats = await this.client.db('local').collection('oplog.rs').stats();
    const firstEntry = await this.client.db('local').collection('oplog.rs')
      .findOne({}, { sort: { ts: 1 } });
    const lastEntry = await this.client.db('local').collection('oplog.rs')  
      .findOne({}, { sort: { ts: -1 } });

    if (!firstEntry || !lastEntry) return null;

    const oplogSpan = lastEntry.ts.getHighBits() - firstEntry.ts.getHighBits();
    
    return {
      size: oplogStats.size,
      count: oplogStats.count,
      avgObjSize: oplogStats.avgObjSize,
      oplogSpanHours: oplogSpan / 3600,
      utilizationPercent: (oplogStats.size / oplogStats.maxSize) * 100
    };
  }

  async measureThroughput() {
    const serverStatus = await this.client.db().admin().command({ serverStatus: 1 });
    
    return {
      insertRate: serverStatus.metrics?.document?.inserted || 0,
      updateRate: serverStatus.metrics?.document?.updated || 0, 
      deleteRate: serverStatus.metrics?.document?.deleted || 0,
      queryRate: serverStatus.metrics?.queryExecutor?.scanned || 0,
      connectionCount: serverStatus.connections?.current || 0
    };
  }

  generateHealthReport() {
    const latestMetrics = Array.from(this.metrics.values()).pop();
    if (!latestMetrics) return null;

    const healthScore = this.calculateHealthScore(latestMetrics);
    const recommendations = this.generateRecommendations(latestMetrics);

    return {
      overall_health: healthScore > 80 ? 'excellent' : 
                     healthScore > 60 ? 'good' : 
                     healthScore > 40 ? 'fair' : 'poor',
      health_score: healthScore,
      metrics: latestMetrics,
      recommendations: recommendations,
      timestamp: new Date()
    };
  }

  calculateHealthScore(metrics) {
    let score = 100;

    // Penalize high replication lag
    if (metrics.replicationLag?.maxLag > 60000) {
      score -= 30; // > 60 seconds lag
    } else if (metrics.replicationLag?.maxLag > 10000) {
      score -= 15; // > 10 seconds lag
    }

    // Penalize unhealthy members
    const unhealthyMembers = metrics.memberHealth?.filter(m => m.health !== 1).length || 0;
    score -= unhealthyMembers * 20;

    // Penalize high oplog utilization
    if (metrics.oplogStats?.utilizationPercent > 80) {
      score -= 15;
    }

    return Math.max(0, score);
  }
}
```

## QueryLeaf Replica Set Integration

QueryLeaf provides transparent replica set integration with familiar SQL patterns:

```sql
-- QueryLeaf automatically handles replica set operations
-- Connection configuration handles failover transparently
CONNECT TO mongodb_cluster WITH (
  hosts = 'db1.example.com:27017,db2.example.com:27017,db3.example.com:27017',
  replica_set = 'production-rs',
  read_preference = 'primaryPreferred',
  write_concern = 'majority'
);

-- Read operations automatically route based on preferences
SELECT 
  order_id,
  customer_id, 
  total_amount,
  status,
  created_at
FROM orders 
WHERE status = 'pending'
  AND created_at >= CURRENT_DATE - INTERVAL '1 day'
READ_PREFERENCE = 'secondary';  -- QueryLeaf extension for read routing

-- Write operations use configured write concerns
INSERT INTO orders (
  customer_id,
  items,
  total_amount,
  status
) VALUES (
  OBJECTID('64f1a2c4567890abcdef5678'),
  '[{"product": "laptop", "quantity": 1, "price": 1200}]'::jsonb,
  1200.00,
  'pending'
)
WITH WRITE_CONCERN = '{ w: "majority", j: true, wtimeout: 10000 }';

-- Analytics queries can target specific replica members
SELECT 
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS order_count,
  SUM(total_amount) AS revenue
FROM orders 
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
READ_PREFERENCE = 'nearest', TAGS = '{ "usage": "analytics" }';

-- QueryLeaf provides:
-- 1. Automatic failover handling in SQL connections
-- 2. Transparent read preference management  
-- 3. Write concern configuration through SQL
-- 4. Connection pooling optimized for replica sets
-- 5. Monitoring integration for replica set health
```

## Best Practices for Replica Sets

### Deployment Guidelines

1. **Odd Number of Voting Members**: Always use an odd number (3, 5, 7) to prevent split-brain scenarios
2. **Geographic Distribution**: Place members across different data centers for disaster recovery
3. **Resource Allocation**: Ensure adequate CPU, memory, and network bandwidth for all members
4. **Security Configuration**: Enable authentication and encryption between replica set members
5. **Monitoring and Alerting**: Implement comprehensive monitoring for replication lag and member health

### Operational Procedures

1. **Regular Health Checks**: Monitor replica set status and replication lag continuously  
2. **Planned Maintenance**: Use rolling maintenance procedures to avoid downtime
3. **Backup Testing**: Regularly test backup and restore procedures
4. **Capacity Planning**: Monitor oplog size and growth patterns for proper sizing
5. **Documentation**: Maintain runbooks for common operational procedures

## Conclusion

MongoDB replica sets provide robust high availability and automatic failover capabilities essential for production applications. Combined with SQL-style database patterns, replica sets enable familiar operational practices while delivering the scalability and flexibility of distributed database architectures.

Key benefits of MongoDB replica sets include:

- **Automatic Failover**: Transparent handling of primary node failures with minimal application impact
- **Data Redundancy**: Multiple copies of data across different servers for fault tolerance  
- **Read Scalability**: Distribute read operations across secondary members for improved performance
- **Flexible Consistency**: Configurable write concerns balance consistency requirements with performance
- **Geographic Distribution**: Deploy members across regions for disaster recovery and compliance

Whether you're building e-commerce platforms, financial systems, or global applications, MongoDB replica sets with QueryLeaf's familiar SQL interface provide the foundation for highly available database architectures. This combination enables you to build resilient systems that maintain service continuity while preserving the development patterns and operational practices your team already knows.

The integration of automatic failover with SQL-style operations makes replica sets an ideal solution for applications requiring both high availability and familiar database interaction patterns.