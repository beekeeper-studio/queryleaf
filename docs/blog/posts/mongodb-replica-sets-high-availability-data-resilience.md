---
title: "MongoDB Replica Sets for High Availability and Data Resilience: SQL-Compatible Distributed Database Architecture"
description: "Master MongoDB Replica Sets for enterprise high availability, automatic failover, and data resilience. Learn advanced replication strategies, read preferences, and SQL-familiar distributed database operations for mission-critical applications."
date: 2025-11-10
tags: [mongodb, replica-sets, high-availability, distributed-systems, failover, data-resilience, sql]
---

# MongoDB Replica Sets for High Availability and Data Resilience: SQL-Compatible Distributed Database Architecture

Modern enterprise applications require database systems that can maintain continuous availability, handle hardware failures gracefully, and provide data redundancy without sacrificing performance or consistency. Traditional single-server database deployments create critical points of failure that can result in extended downtime, data loss, and significant business disruption when servers crash, networks fail, or maintenance windows require database restarts.

MongoDB Replica Sets provide comprehensive high availability and data resilience through automatic replication, intelligent failover, and distributed consensus mechanisms. Unlike traditional master-slave replication that requires manual intervention during failures, MongoDB Replica Sets automatically elect new primary nodes, maintain data consistency across multiple servers, and provide configurable read preferences for optimal performance and availability.

## The Traditional High Availability Challenge

Conventional database high availability solutions have significant complexity and operational overhead:

```sql
-- Traditional PostgreSQL high availability setup - complex and operationally intensive

-- Primary server configuration with write-ahead logging
CREATE TABLE critical_business_data (
    transaction_id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    transaction_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Business logic fields
    from_account BIGINT,
    to_account BIGINT, 
    description TEXT,
    reference_number VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    
    -- Audit and compliance
    created_by VARCHAR(100),
    authorized_by VARCHAR(100),
    authorized_at TIMESTAMP,
    
    -- Geographic and regulatory
    processing_region VARCHAR(50),
    regulatory_flags JSONB,
    
    -- System metadata
    server_id VARCHAR(50),
    processing_node VARCHAR(50),
    
    CONSTRAINT valid_transaction_type CHECK (
        transaction_type IN ('deposit', 'withdrawal', 'transfer', 'fee', 'interest', 'adjustment')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT valid_amount CHECK (amount != 0)
);

-- Complex indexing for performance across multiple servers
CREATE INDEX idx_transactions_account_timestamp ON critical_business_data(account_id, transaction_timestamp DESC);
CREATE INDEX idx_transactions_status_type ON critical_business_data(status, transaction_type, transaction_timestamp);
CREATE INDEX idx_transactions_reference ON critical_business_data(reference_number) WHERE reference_number IS NOT NULL;
CREATE INDEX idx_transactions_region ON critical_business_data(processing_region, transaction_timestamp);

-- Streaming replication configuration (requires extensive setup)
-- postgresql.conf settings required:
-- wal_level = replica
-- max_wal_senders = 3
-- max_replication_slots = 3
-- archive_mode = on
-- archive_command = 'cp %p /var/lib/postgresql/archive/%f'

-- Create replication user (security complexity)
CREATE ROLE replication_user WITH REPLICATION LOGIN PASSWORD 'complex_secure_password';
GRANT CONNECT ON DATABASE production TO replication_user;

-- Manual standby server setup required on each replica
-- pg_basebackup -h primary_server -D /var/lib/postgresql/standby -U replication_user -v -P -W

-- Standby server recovery configuration (recovery.conf)
-- standby_mode = 'on'
-- primary_conninfo = 'host=primary_server port=5432 user=replication_user password=complex_secure_password'
-- trigger_file = '/var/lib/postgresql/failover_trigger'

-- Connection pooling and load balancing (requires external tools)
-- HAProxy configuration for read/write splitting
-- backend postgresql_primary
--   server primary primary_server:5432 check
-- backend postgresql_standby
--   server standby1 standby1_server:5432 check
--   server standby2 standby2_server:5432 check

-- Monitoring and health checking (complex setup)
SELECT 
    client_addr,
    state,
    sync_state,
    sync_priority,
    
    -- Replication lag monitoring
    pg_wal_lsn_diff(pg_current_wal_lsn(), flush_lsn) / 1024 / 1024 as flush_lag_mb,
    pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) / 1024 / 1024 as replay_lag_mb,
    
    -- Time-based lag analysis
    EXTRACT(EPOCH FROM (now() - backend_start)) as connection_age_seconds,
    EXTRACT(EPOCH FROM (now() - state_change)) as state_change_age_seconds
    
FROM pg_stat_replication
ORDER BY sync_priority, client_addr;

-- Manual failover procedure (complex and error-prone)
-- 1. Check replication status and lag
-- 2. Stop applications from connecting to primary
-- 3. Ensure all transactions are replicated
-- 4. Create trigger file on desired standby: touch /var/lib/postgresql/failover_trigger
-- 5. Update application connection strings
-- 6. Redirect traffic to new primary
-- 7. Reconfigure remaining standbys to follow new primary

-- Problems with traditional PostgreSQL HA:
-- 1. Complex manual setup and configuration management
-- 2. Manual failover procedures with potential for human error
-- 3. Split-brain scenarios without proper fencing mechanisms
-- 4. No automatic conflict resolution during network partitions
-- 5. Requires external load balancers and connection pooling solutions
-- 6. Limited built-in monitoring and alerting capabilities
-- 7. Difficult to add/remove replica servers dynamically
-- 8. Complex backup and recovery procedures across multiple servers
-- 9. No built-in read preference configuration
-- 10. Requires significant PostgreSQL expertise for proper maintenance

-- MySQL replication limitations (even more manual)
-- Enable binary logging on master:
-- log-bin=mysql-bin
-- server-id=1

-- Manual slave configuration:
CHANGE MASTER TO
  MASTER_HOST='master_server',
  MASTER_USER='replication_user',
  MASTER_PASSWORD='replication_password',
  MASTER_LOG_FILE='mysql-bin.000001',
  MASTER_LOG_POS=154;

START SLAVE;

-- Basic replication monitoring
SHOW SLAVE STATUS\G

-- MySQL HA problems:
-- - No automatic failover mechanisms
-- - Manual binary log position management
-- - Limited conflict resolution capabilities
-- - Basic monitoring and error reporting
-- - Complex setup for multi-master scenarios
-- - No built-in load balancing or read distribution
-- - Requires external tools for comprehensive HA solutions
```

MongoDB Replica Sets provide comprehensive high availability with minimal operational overhead:

```javascript
// MongoDB Replica Sets - enterprise-ready high availability with automatic management
const { MongoClient } = require('mongodb');

// Replica set connection with automatic failover handling
const client = new MongoClient('mongodb://server1:27017,server2:27017,server3:27017/production?replicaSet=production-rs', {
  // Connection options optimized for high availability
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 300000, // 5 minutes
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000, // 10 seconds
  
  // Read and write preferences for optimal performance
  readPreference: 'secondaryPreferred', // Distribute read load
  writeConcern: { w: 'majority', j: true, wtimeout: 5000 }, // Ensure data durability
  
  // Advanced replica set options
  maxStalenessSeconds: 90, // Maximum acceptable replication lag
  readConcern: { level: 'majority' }, // Ensure consistent reads
  
  // Connection resilience
  connectTimeoutMS: 10000,
  socketTimeoutMS: 30000,
  retryWrites: true,
  retryReads: true
});

const db = client.db('enterprise_production');

// Comprehensive business data model with replica set optimization
const setupEnterpriseCollections = async () => {
  console.log('Setting up enterprise collections with replica set optimization...');
  
  // Financial transactions with high availability requirements
  const transactions = db.collection('financial_transactions');
  
  // Sample enterprise transaction document structure
  const transactionDocument = {
    _id: new ObjectId(),
    
    // Transaction identification
    transactionId: "TXN-2025-11-10-001234567",
    externalReference: "EXT-REF-987654321",
    
    // Account information
    accounts: {
      sourceAccount: {
        accountId: new ObjectId("64a1b2c3d4e5f6789012347a"),
        accountNumber: "ACC-123456789",
        accountType: "checking",
        accountHolder: "Enterprise Customer LLC",
        bankCode: "ENTBANK001"
      },
      destinationAccount: {
        accountId: new ObjectId("64a1b2c3d4e5f6789012347b"), 
        accountNumber: "ACC-987654321",
        accountType: "savings",
        accountHolder: "Business Partner Inc",
        bankCode: "PARTNER002"
      }
    },
    
    // Transaction details
    transaction: {
      type: "wire_transfer", // wire_transfer, ach_transfer, check_deposit, etc.
      category: "business_payment",
      subcategory: "vendor_payment",
      
      // Financial amounts
      amount: {
        value: 125000.00,
        currency: "USD",
        precision: 2
      },
      
      fees: {
        processingFee: 25.00,
        wireTransferFee: 15.00,
        regulatoryFee: 2.50,
        totalFees: 42.50
      },
      
      // Exchange rate information (for international transfers)
      exchangeRate: {
        fromCurrency: "USD",
        toCurrency: "USD", 
        rate: 1.0000,
        rateTimestamp: new Date("2025-11-10T14:30:00Z"),
        rateProvider: "internal"
      }
    },
    
    // Status and workflow tracking
    status: {
      current: "pending_authorization", // pending, authorized, processing, completed, failed, cancelled
      workflow: [
        {
          status: "initiated",
          timestamp: new Date("2025-11-10T14:30:00Z"),
          userId: new ObjectId("64b2c3d4e5f6789012347c1a"),
          userRole: "customer",
          notes: "Transaction initiated via mobile banking"
        },
        {
          status: "validated",
          timestamp: new Date("2025-11-10T14:30:15Z"),
          userId: "system",
          userRole: "automated_validation",
          notes: "Account balance and limits validated"
        }
      ],
      
      // Authorization requirements
      authorization: {
        required: true,
        level: "dual_approval", // single, dual_approval, committee
        approvals: [
          {
            approverId: new ObjectId("64b2c3d4e5f6789012347c1b"),
            approverRole: "account_manager", 
            status: "approved",
            timestamp: new Date("2025-11-10T14:32:00Z"),
            notes: "Verified customer and transaction purpose"
          }
        ],
        pendingApprovals: [
          {
            approverId: new ObjectId("64b2c3d4e5f6789012347c1c"),
            approverRole: "compliance_officer",
            requiredBy: new Date("2025-11-10T16:30:00Z")
          }
        ]
      }
    },
    
    // Risk and compliance
    riskAssessment: {
      riskScore: 35, // 0-100 scale
      riskLevel: "medium", // low, medium, high, critical
      riskFactors: [
        {
          factor: "transaction_amount",
          score: 15,
          description: "Large transaction amount"
        },
        {
          factor: "customer_history",
          score: -5,
          description: "Established customer with good history"
        },
        {
          factor: "destination_account",
          score: 10,
          description: "New destination account"
        }
      ],
      
      complianceChecks: {
        amlScreening: {
          status: "completed",
          result: "clear",
          timestamp: new Date("2025-11-10T14:30:20Z"),
          provider: "compliance_engine"
        },
        sanctionsScreening: {
          status: "completed",
          result: "clear",
          timestamp: new Date("2025-11-10T14:30:22Z"),
          provider: "sanctions_database"
        },
        fraudDetection: {
          status: "completed",
          result: "low_risk", 
          score: 12,
          timestamp: new Date("2025-11-10T14:30:25Z"),
          provider: "fraud_detection_ai"
        }
      }
    },
    
    // Processing information
    processing: {
      scheduledProcessingTime: new Date("2025-11-10T15:00:00Z"),
      actualProcessingTime: null,
      processingServer: "txn-processor-03",
      processingRegion: "us-east-1",
      
      // Retry and error handling
      attemptCount: 1,
      maxAttempts: 3,
      lastAttemptTime: new Date("2025-11-10T14:30:00Z"),
      
      errors: [],
      
      // Performance tracking
      processingMetrics: {
        validationTimeMs: 150,
        riskAssessmentTimeMs: 250,
        complianceCheckTimeMs: 420,
        totalProcessingTimeMs: null
      }
    },
    
    // Audit and regulatory compliance
    audit: {
      createdAt: new Date("2025-11-10T14:30:00Z"),
      createdBy: new ObjectId("64b2c3d4e5f6789012347c1a"),
      updatedAt: new Date("2025-11-10T14:32:00Z"),
      updatedBy: new ObjectId("64b2c3d4e5f6789012347c1b"),
      version: 2,
      
      // Detailed change tracking
      changeLog: [
        {
          timestamp: new Date("2025-11-10T14:30:00Z"),
          userId: new ObjectId("64b2c3d4e5f6789012347c1a"),
          action: "transaction_initiated",
          changes: ["status.current", "transaction", "accounts"],
          ipAddress: "192.168.1.100",
          userAgent: "MobileBankingApp/2.1.3"
        },
        {
          timestamp: new Date("2025-11-10T14:32:00Z"),
          userId: new ObjectId("64b2c3d4e5f6789012347c1b"),
          action: "authorization_approved",
          changes: ["status.authorization.approvals"],
          ipAddress: "10.0.1.50",
          userAgent: "EnterprisePortal/1.8.2"
        }
      ]
    },
    
    // Geographic and regulatory context
    geography: {
      originatingCountry: "US",
      originatingState: "CA",
      destinationCountry: "US",
      destinationState: "NY",
      
      // Regulatory requirements by jurisdiction
      regulations: {
        uspCompliance: true,
        internationalTransfer: false,
        reportingThreshold: 10000.00,
        reportingRequired: true,
        reportingDeadline: new Date("2025-11-11T23:59:59Z")
      }
    },
    
    // System and operational metadata
    metadata: {
      environment: "production",
      dataCenter: "primary",
      applicationVersion: "banking-core-v3.2.1",
      correlationId: "corr-uuid-12345678-90ab-cdef",
      
      // High availability tracking
      replicaSet: {
        writeConcern: "majority",
        readPreference: "primary",
        maxStalenessSeconds: 60
      },
      
      // Performance optimization
      indexHints: {
        preferredIndex: "idx_transactions_account_status_date",
        queryOptimizer: "enabled"
      }
    }
  };
  
  // Insert sample transaction
  await transactions.insertOne(transactionDocument);
  
  // Create comprehensive indexes optimized for replica set performance
  await Promise.all([
    // Primary business query indexes
    transactions.createIndex(
      { 
        "accounts.sourceAccount.accountId": 1, 
        "audit.createdAt": -1,
        "status.current": 1 
      },
      { 
        name: "idx_transactions_source_account_date_status",
        background: true // Non-blocking index creation
      }
    ),
    
    transactions.createIndex(
      { 
        "transaction.type": 1,
        "status.current": 1,
        "audit.createdAt": -1 
      },
      { 
        name: "idx_transactions_type_status_date",
        background: true
      }
    ),
    
    // Risk and compliance queries
    transactions.createIndex(
      { 
        "riskAssessment.riskLevel": 1,
        "status.current": 1 
      },
      { 
        name: "idx_transactions_risk_status",
        background: true
      }
    ),
    
    // Authorization workflow queries
    transactions.createIndex(
      { 
        "status.authorization.pendingApprovals.approverId": 1,
        "status.current": 1 
      },
      { 
        name: "idx_transactions_pending_approvals",
        background: true
      }
    ),
    
    // Processing and scheduling queries
    transactions.createIndex(
      { 
        "processing.scheduledProcessingTime": 1,
        "status.current": 1 
      },
      { 
        name: "idx_transactions_scheduled_processing",
        background: true
      }
    ),
    
    // Geographic and regulatory reporting
    transactions.createIndex(
      { 
        "geography.originatingCountry": 1,
        "geography.regulations.reportingRequired": 1,
        "audit.createdAt": -1 
      },
      { 
        name: "idx_transactions_geography_reporting",
        background: true
      }
    ),
    
    // Full-text search for transaction descriptions and references
    transactions.createIndex(
      { 
        "transactionId": "text",
        "externalReference": "text",
        "transaction.category": "text",
        "accounts.sourceAccount.accountHolder": "text"
      },
      { 
        name: "idx_transactions_text_search",
        background: true
      }
    )
  ]);
  
  console.log('Enterprise collections and indexes created successfully');
  return { transactions };
};

// Replica Set Management and Monitoring
class ReplicaSetManager {
  constructor(client, db) {
    this.client = client;
    this.db = db;
    this.admin = client.db('admin');
    this.monitoringInterval = null;
    this.healthMetrics = {
      lastCheck: null,
      replicaSetStatus: null,
      memberHealth: [],
      replicationLag: {},
      alerts: []
    };
  }

  async initializeReplicaSetMonitoring() {
    console.log('Initializing replica set monitoring and management...');
    
    try {
      // Get initial replica set configuration
      const config = await this.getReplicaSetConfig();
      console.log('Current replica set configuration:', JSON.stringify(config, null, 2));
      
      // Start continuous health monitoring
      await this.startHealthMonitoring();
      
      // Setup automatic failover testing (in non-production environments)
      if (process.env.NODE_ENV !== 'production') {
        await this.setupFailoverTesting();
      }
      
      console.log('Replica set monitoring initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize replica set monitoring:', error);
      throw error;
    }
  }

  async getReplicaSetConfig() {
    try {
      // Get replica set configuration
      const config = await this.admin.command({ replSetGetConfig: 1 });
      
      return {
        setName: config.config._id,
        version: config.config.version,
        members: config.config.members.map(member => ({
          id: member._id,
          host: member.host,
          priority: member.priority,
          votes: member.votes,
          hidden: member.hidden || false,
          buildIndexes: member.buildIndexes !== false,
          tags: member.tags || {}
        })),
        settings: config.config.settings || {}
      };
    } catch (error) {
      console.error('Error getting replica set config:', error);
      throw error;
    }
  }

  async getReplicaSetStatus() {
    try {
      // Get current replica set status
      const status = await this.admin.command({ replSetGetStatus: 1 });
      
      const members = status.members.map(member => ({
        id: member._id,
        name: member.name,
        health: member.health,
        state: this.getStateDescription(member.state),
        stateStr: member.stateStr,
        uptime: member.uptime,
        optimeDate: member.optimeDate,
        lastHeartbeat: member.lastHeartbeat,
        lastHeartbeatRecv: member.lastHeartbeatRecv,
        pingMs: member.pingMs,
        syncSourceHost: member.syncSourceHost,
        syncSourceId: member.syncSourceId,
        
        // Replication lag calculation
        lag: status.members[0].optimeDate && member.optimeDate ? 
          Math.abs(status.members[0].optimeDate - member.optimeDate) / 1000 : 0
      }));
      
      return {
        setName: status.set,
        date: status.date,
        myState: this.getStateDescription(status.myState),
        primary: members.find(member => member.state === 'PRIMARY'),
        members: members,
        heartbeatIntervalMillis: status.heartbeatIntervalMillis
      };
      
    } catch (error) {
      console.error('Error getting replica set status:', error);
      throw error;
    }
  }

  getStateDescription(state) {
    const states = {
      0: 'STARTUP',
      1: 'PRIMARY',
      2: 'SECONDARY', 
      3: 'RECOVERING',
      5: 'STARTUP2',
      6: 'UNKNOWN',
      7: 'ARBITER',
      8: 'DOWN',
      9: 'ROLLBACK',
      10: 'REMOVED'
    };
    return states[state] || `UNKNOWN_STATE_${state}`;
  }

  async startHealthMonitoring() {
    console.log('Starting continuous replica set health monitoring...');
    
    // Monitor replica set health every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Health check failed:', error);
        this.healthMetrics.alerts.push({
          timestamp: new Date(),
          level: 'ERROR',
          message: 'Health check failed',
          error: error.message
        });
      }
    }, 30000);
    
    // Perform initial health check
    await this.performHealthCheck();
  }

  async performHealthCheck() {
    const checkStartTime = new Date();
    console.log('Performing replica set health check...');
    
    try {
      // Get current replica set status
      const status = await this.getReplicaSetStatus();
      this.healthMetrics.lastCheck = checkStartTime;
      this.healthMetrics.replicaSetStatus = status;
      
      // Check for alerts
      const alerts = [];
      
      // Check if primary is available
      if (!status.primary) {
        alerts.push({
          timestamp: checkStartTime,
          level: 'CRITICAL',
          message: 'No primary member found in replica set'
        });
      }
      
      // Check member health
      status.members.forEach(member => {
        if (member.health !== 1) {
          alerts.push({
            timestamp: checkStartTime,
            level: 'WARNING',
            message: `Member ${member.name} has health status ${member.health}`
          });
        }
        
        // Check replication lag
        if (member.lag > 30) { // 30 seconds
          alerts.push({
            timestamp: checkStartTime,
            level: 'WARNING',
            message: `Member ${member.name} has replication lag of ${member.lag} seconds`
          });
        }
        
        // Check for high ping times
        if (member.pingMs && member.pingMs > 100) { // 100ms
          alerts.push({
            timestamp: checkStartTime,
            level: 'INFO',
            message: `Member ${member.name} has high ping time of ${member.pingMs}ms`
          });
        }
      });
      
      // Update health metrics
      this.healthMetrics.memberHealth = status.members;
      this.healthMetrics.alerts = [...alerts, ...this.healthMetrics.alerts.slice(0, 50)]; // Keep last 50 alerts
      
      // Log health status
      if (alerts.length > 0) {
        console.warn(`Health check found ${alerts.length} issues:`, alerts);
      } else {
        console.log('Replica set health check passed - all members healthy');
      }
      
      // Store health metrics in database for historical analysis
      await this.storeHealthMetrics();
      
    } catch (error) {
      console.error('Health check error:', error);
      throw error;
    }
  }

  async storeHealthMetrics() {
    try {
      const healthCollection = this.db.collection('replica_set_health');
      
      const healthRecord = {
        timestamp: this.healthMetrics.lastCheck,
        replicaSetName: this.healthMetrics.replicaSetStatus?.setName,
        
        // Summary metrics
        summary: {
          totalMembers: this.healthMetrics.memberHealth?.length || 0,
          healthyMembers: this.healthMetrics.memberHealth?.filter(m => m.health === 1).length || 0,
          primaryAvailable: !!this.healthMetrics.replicaSetStatus?.primary,
          maxReplicationLag: Math.max(...this.healthMetrics.memberHealth?.map(m => m.lag) || [0]),
          alertCount: this.healthMetrics.alerts?.filter(a => a.timestamp > new Date(Date.now() - 300000)).length || 0 // Last 5 minutes
        },
        
        // Detailed member status
        members: this.healthMetrics.memberHealth?.map(member => ({
          name: member.name,
          state: member.state,
          health: member.health,
          uptime: member.uptime,
          replicationLag: member.lag,
          pingMs: member.pingMs,
          isPrimary: member.state === 'PRIMARY'
        })) || [],
        
        // Recent alerts
        recentAlerts: this.healthMetrics.alerts?.filter(a => 
          a.timestamp > new Date(Date.now() - 300000)
        ) || [],
        
        // Performance metrics
        performance: {
          healthCheckDuration: Date.now() - this.healthMetrics.lastCheck?.getTime(),
          heartbeatInterval: this.healthMetrics.replicaSetStatus?.heartbeatIntervalMillis
        }
      };
      
      // Insert with short TTL for cleanup
      await healthCollection.insertOne({
        ...healthRecord,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });
      
    } catch (error) {
      console.warn('Failed to store health metrics:', error);
    }
  }

  async performReadWriteOperations() {
    console.log('Testing read/write operations across replica set...');
    
    const testCollection = this.db.collection('replica_set_tests');
    const testStartTime = new Date();
    
    try {
      // Test write operation (will go to primary)
      const writeResult = await testCollection.insertOne({
        testType: 'replica_set_write_test',
        timestamp: testStartTime,
        testData: 'Testing write operation to primary',
        serverId: 'test-operation'
      }, {
        writeConcern: { w: 'majority', j: true, wtimeout: 5000 }
      });
      
      console.log('Write operation successful:', writeResult.insertedId);
      
      // Test read from secondary (if available)
      const readFromSecondary = await testCollection.findOne(
        { _id: writeResult.insertedId },
        { 
          readPreference: 'secondary',
          maxStalenessSeconds: 90 
        }
      );
      
      if (readFromSecondary) {
        const replicationDelay = new Date() - readFromSecondary.timestamp;
        console.log(`Read from secondary successful, replication delay: ${replicationDelay}ms`);
      } else {
        console.log('Read from secondary not available or data not yet replicated');
      }
      
      // Test read from primary
      const readFromPrimary = await testCollection.findOne(
        { _id: writeResult.insertedId },
        { readPreference: 'primary' }
      );
      
      console.log('Read from primary successful:', !!readFromPrimary);
      
      // Cleanup test document
      await testCollection.deleteOne({ _id: writeResult.insertedId });
      
      return {
        writeSuccessful: true,
        readFromSecondarySuccessful: !!readFromSecondary,
        readFromPrimarySuccessful: !!readFromPrimary,
        testDuration: Date.now() - testStartTime
      };
      
    } catch (error) {
      console.error('Read/write operation test failed:', error);
      return {
        writeSuccessful: false,
        error: error.message,
        testDuration: Date.now() - testStartTime
      };
    }
  }

  async demonstrateReadPreferences() {
    console.log('Demonstrating various read preferences...');
    
    const testCollection = this.db.collection('financial_transactions');
    
    try {
      // 1. Read from primary (default)
      console.log('\n1. Reading from PRIMARY:');
      const primaryStart = Date.now();
      const primaryResult = await testCollection.find({}, {
        readPreference: 'primary'
      }).limit(5).toArray();
      console.log(`   - Read ${primaryResult.length} documents from primary in ${Date.now() - primaryStart}ms`);
      
      // 2. Read from secondary (load balancing)
      console.log('\n2. Reading from SECONDARY:');
      const secondaryStart = Date.now();
      const secondaryResult = await testCollection.find({}, {
        readPreference: 'secondary',
        maxStalenessSeconds: 120 // Accept data up to 2 minutes old
      }).limit(5).toArray();
      console.log(`   - Read ${secondaryResult.length} documents from secondary in ${Date.now() - secondaryStart}ms`);
      
      // 3. Read from secondary preferred (fallback to primary)
      console.log('\n3. Reading with SECONDARY PREFERRED:');
      const secondaryPrefStart = Date.now();
      const secondaryPrefResult = await testCollection.find({}, {
        readPreference: 'secondaryPreferred',
        maxStalenessSeconds: 90
      }).limit(5).toArray();
      console.log(`   - Read ${secondaryPrefResult.length} documents with secondary preference in ${Date.now() - secondaryPrefStart}ms`);
      
      // 4. Read from primary preferred (use secondary if primary unavailable)
      console.log('\n4. Reading with PRIMARY PREFERRED:');
      const primaryPrefStart = Date.now();
      const primaryPrefResult = await testCollection.find({}, {
        readPreference: 'primaryPreferred'
      }).limit(5).toArray();
      console.log(`   - Read ${primaryPrefResult.length} documents with primary preference in ${Date.now() - primaryPrefStart}ms`);
      
      // 5. Read from nearest (lowest latency)
      console.log('\n5. Reading from NEAREST:');
      const nearestStart = Date.now();
      const nearestResult = await testCollection.find({}, {
        readPreference: 'nearest'
      }).limit(5).toArray();
      console.log(`   - Read ${nearestResult.length} documents from nearest member in ${Date.now() - nearestStart}ms`);
      
      // 6. Tagged read preference (specific member characteristics)
      console.log('\n6. Reading with TAGGED preferences:');
      try {
        const taggedStart = Date.now();
        const taggedResult = await testCollection.find({}, {
          readPreference: 'secondary',
          readPreferenceTags: [{ region: 'us-east' }, { datacenter: 'primary' }] // Fallback tags
        }).limit(5).toArray();
        console.log(`   - Read ${taggedResult.length} documents with tagged preference in ${Date.now() - taggedStart}ms`);
      } catch (error) {
        console.log('   - Tagged read preference not available (members may not have matching tags)');
      }
      
      return {
        primaryLatency: Date.now() - primaryStart,
        secondaryLatency: Date.now() - secondaryStart,
        readPreferencesSuccessful: true
      };
      
    } catch (error) {
      console.error('Read preference demonstration failed:', error);
      return {
        readPreferencesSuccessful: false,
        error: error.message
      };
    }
  }

  async demonstrateWriteConcerns() {
    console.log('Demonstrating various write concerns for data durability...');
    
    const testCollection = this.db.collection('write_concern_tests');
    
    try {
      // 1. Default write concern (w: 1)
      console.log('\n1. Testing default write concern (w: 1):');
      const defaultStart = Date.now();
      const defaultResult = await testCollection.insertOne({
        testType: 'default_write_concern',
        timestamp: new Date(),
        data: 'Testing default write concern'
      });
      console.log(`   - Default write completed in ${Date.now() - defaultStart}ms`);
      
      // 2. Majority write concern (w: 'majority')
      console.log('\n2. Testing majority write concern:');
      const majorityStart = Date.now();
      const majorityResult = await testCollection.insertOne({
        testType: 'majority_write_concern',
        timestamp: new Date(),
        data: 'Testing majority write concern for high durability'
      }, {
        writeConcern: { 
          w: 'majority', 
          j: true, // Wait for journal acknowledgment
          wtimeout: 5000 
        }
      });
      console.log(`   - Majority write completed in ${Date.now() - majorityStart}ms`);
      
      // 3. Specific member count write concern
      console.log('\n3. Testing specific member count write concern (w: 2):');
      const specificStart = Date.now();
      try {
        const specificResult = await testCollection.insertOne({
          testType: 'specific_count_write_concern',
          timestamp: new Date(),
          data: 'Testing specific member count write concern'
        }, {
          writeConcern: { 
            w: 2, 
            j: true,
            wtimeout: 5000 
          }
        });
        console.log(`   - Specific count write completed in ${Date.now() - specificStart}ms`);
      } catch (error) {
        console.log(`   - Specific count write failed (may not have enough members): ${error.message}`);
      }
      
      // 4. Tagged write concern
      console.log('\n4. Testing tagged write concern:');
      const taggedStart = Date.now();
      try {
        const taggedResult = await testCollection.insertOne({
          testType: 'tagged_write_concern',
          timestamp: new Date(),
          data: 'Testing tagged write concern'
        }, {
          writeConcern: { 
            w: { region: 'us-east' }, // Write must be acknowledged by members with this tag
            wtimeout: 5000 
          }
        });
        console.log(`   - Tagged write completed in ${Date.now() - taggedStart}ms`);
      } catch (error) {
        console.log(`   - Tagged write failed (members may not have matching tags): ${error.message}`);
      }
      
      // 5. Unacknowledged write concern (w: 0) - not recommended for production
      console.log('\n5. Testing unacknowledged write concern (fire-and-forget):');
      const unackedStart = Date.now();
      const unackedResult = await testCollection.insertOne({
        testType: 'unacknowledged_write_concern',
        timestamp: new Date(),
        data: 'Testing unacknowledged write concern (not recommended for production)'
      }, {
        writeConcern: { w: 0 }
      });
      console.log(`   - Unacknowledged write completed in ${Date.now() - unackedStart}ms`);
      
      // Cleanup test documents
      await testCollection.deleteMany({ testType: { $regex: /_write_concern$/ } });
      
      return {
        allWriteConcernsSuccessful: true,
        performanceMetrics: {
          defaultLatency: Date.now() - defaultStart,
          majorityLatency: Date.now() - majorityStart
        }
      };
      
    } catch (error) {
      console.error('Write concern demonstration failed:', error);
      return {
        allWriteConcernsSuccessful: false,
        error: error.message
      };
    }
  }

  async getHealthSummary() {
    return {
      lastHealthCheck: this.healthMetrics.lastCheck,
      replicaSetName: this.healthMetrics.replicaSetStatus?.setName,
      totalMembers: this.healthMetrics.memberHealth?.length || 0,
      healthyMembers: this.healthMetrics.memberHealth?.filter(m => m.health === 1).length || 0,
      primaryAvailable: !!this.healthMetrics.replicaSetStatus?.primary,
      maxReplicationLag: Math.max(...this.healthMetrics.memberHealth?.map(m => m.lag) || [0]),
      recentAlertCount: this.healthMetrics.alerts?.filter(a => 
        a.timestamp > new Date(Date.now() - 300000)
      ).length || 0,
      isHealthy: this.isReplicaSetHealthy()
    };
  }

  isReplicaSetHealthy() {
    if (!this.healthMetrics.replicaSetStatus) return false;
    
    const hasHealthyPrimary = !!this.healthMetrics.replicaSetStatus.primary;
    const allMembersHealthy = this.healthMetrics.memberHealth?.every(m => m.health === 1) || false;
    const lowReplicationLag = Math.max(...this.healthMetrics.memberHealth?.map(m => m.lag) || [0]) < 30;
    const noRecentCriticalAlerts = !this.healthMetrics.alerts?.some(a => 
      a.level === 'CRITICAL' && a.timestamp > new Date(Date.now() - 300000)
    );
    
    return hasHealthyPrimary && allMembersHealthy && lowReplicationLag && noRecentCriticalAlerts;
  }

  async shutdown() {
    console.log('Shutting down replica set monitoring...');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    console.log('Replica set monitoring shutdown complete');
  }
}

// Advanced High Availability Operations
class HighAvailabilityOperations {
  constructor(client, db) {
    this.client = client;
    this.db = db;
    this.admin = client.db('admin');
  }

  async demonstrateFailoverScenarios() {
    console.log('Demonstrating automatic failover capabilities...');
    
    try {
      // Get initial replica set status
      const initialStatus = await this.admin.command({ replSetGetStatus: 1 });
      const currentPrimary = initialStatus.members.find(member => member.state === 1);
      
      console.log(`Current primary: ${currentPrimary?.name || 'Unknown'}`);
      
      // Simulate read/write operations during potential failover
      const operationsPromises = [];
      
      // Start continuous read operations
      operationsPromises.push(this.performContinuousReads());
      
      // Start continuous write operations
      operationsPromises.push(this.performContinuousWrites());
      
      // Monitor replica set status changes
      operationsPromises.push(this.monitorFailoverEvents());
      
      // Run operations for 60 seconds to demonstrate resilience
      console.log('Running continuous operations to test high availability...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      console.log('High availability demonstration completed');
      
    } catch (error) {
      console.error('Failover demonstration failed:', error);
    }
  }

  async performContinuousReads() {
    const testCollection = this.db.collection('financial_transactions');
    let readCount = 0;
    let errorCount = 0;
    
    const readInterval = setInterval(async () => {
      try {
        // Perform read with secondaryPreferred to demonstrate load balancing
        await testCollection.find({}, {
          readPreference: 'secondaryPreferred',
          maxStalenessSeconds: 90
        }).limit(10).toArray();
        
        readCount++;
        
        if (readCount % 10 === 0) {
          console.log(`Continuous reads: ${readCount} successful, ${errorCount} errors`);
        }
        
      } catch (error) {
        errorCount++;
        console.warn(`Read operation failed: ${error.message}`);
      }
    }, 2000); // Read every 2 seconds
    
    // Stop after 60 seconds
    setTimeout(() => {
      clearInterval(readInterval);
      console.log(`Final read stats: ${readCount} successful, ${errorCount} errors`);
    }, 60000);
  }

  async performContinuousWrites() {
    const testCollection = this.db.collection('ha_test_operations');
    let writeCount = 0;
    let errorCount = 0;
    
    const writeInterval = setInterval(async () => {
      try {
        // Perform write with majority write concern for durability
        await testCollection.insertOne({
          operationType: 'ha_test_write',
          timestamp: new Date(),
          counter: writeCount + 1,
          testData: `Continuous write operation ${writeCount + 1}`
        }, {
          writeConcern: { w: 'majority', j: true, wtimeout: 5000 }
        });
        
        writeCount++;
        
        if (writeCount % 5 === 0) {
          console.log(`Continuous writes: ${writeCount} successful, ${errorCount} errors`);
        }
        
      } catch (error) {
        errorCount++;
        console.warn(`Write operation failed: ${error.message}`);
        
        // Implement exponential backoff on write failures
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, errorCount), 10000)));
      }
    }, 5000); // Write every 5 seconds
    
    // Stop after 60 seconds
    setTimeout(() => {
      clearInterval(writeInterval);
      console.log(`Final write stats: ${writeCount} successful, ${errorCount} errors`);
      
      // Cleanup test documents
      testCollection.deleteMany({ operationType: 'ha_test_write' }).catch(console.warn);
    }, 60000);
  }

  async monitorFailoverEvents() {
    let lastPrimaryName = null;
    
    const monitorInterval = setInterval(async () => {
      try {
        const status = await this.admin.command({ replSetGetStatus: 1 });
        const currentPrimary = status.members.find(member => member.state === 1);
        const currentPrimaryName = currentPrimary?.name;
        
        if (lastPrimaryName && lastPrimaryName !== currentPrimaryName) {
          console.log(`🔄 FAILOVER DETECTED: Primary changed from ${lastPrimaryName} to ${currentPrimaryName || 'NONE'}`);
          
          // Log failover event
          await this.logFailoverEvent(lastPrimaryName, currentPrimaryName);
        }
        
        lastPrimaryName = currentPrimaryName;
        
      } catch (error) {
        console.warn('Failed to monitor replica set status:', error.message);
      }
    }, 5000); // Check every 5 seconds
    
    // Stop monitoring after 60 seconds
    setTimeout(() => {
      clearInterval(monitorInterval);
    }, 60000);
  }

  async logFailoverEvent(oldPrimary, newPrimary) {
    try {
      const eventsCollection = this.db.collection('failover_events');
      
      await eventsCollection.insertOne({
        eventType: 'primary_failover',
        timestamp: new Date(),
        oldPrimary: oldPrimary,
        newPrimary: newPrimary,
        detectedBy: 'ha_operations_monitor',
        environment: process.env.NODE_ENV || 'development'
      });
      
      console.log('Failover event logged to database');
      
    } catch (error) {
      console.warn('Failed to log failover event:', error);
    }
  }

  async performDataConsistencyCheck() {
    console.log('Performing data consistency check across replica set members...');
    
    try {
      const testCollection = this.db.collection('consistency_test');
      
      // Insert test document with majority write concern
      const testDoc = {
        consistencyTestId: new ObjectId(),
        timestamp: new Date(),
        testData: 'Data consistency verification document',
        checksum: 'test-checksum-12345'
      };
      
      const insertResult = await testCollection.insertOne(testDoc, {
        writeConcern: { w: 'majority', j: true, wtimeout: 10000 }
      });
      
      console.log(`Test document inserted with ID: ${insertResult.insertedId}`);
      
      // Wait a moment for replication
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Read from primary
      const primaryRead = await testCollection.findOne(
        { _id: insertResult.insertedId },
        { readPreference: 'primary' }
      );
      
      // Read from secondary (with retry logic)
      let secondaryRead = null;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (!secondaryRead && retryCount < maxRetries) {
        try {
          secondaryRead = await testCollection.findOne(
            { _id: insertResult.insertedId },
            { 
              readPreference: 'secondary',
              maxStalenessSeconds: 120 
            }
          );
          
          if (!secondaryRead) {
            retryCount++;
            console.log(`Retry ${retryCount}: Secondary read returned null, waiting for replication...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          retryCount++;
          console.warn(`Secondary read attempt ${retryCount} failed: ${error.message}`);
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      // Compare results
      const consistent = primaryRead && secondaryRead && 
        primaryRead.checksum === secondaryRead.checksum &&
        primaryRead.testData === secondaryRead.testData;
      
      console.log(`Data consistency check: ${consistent ? 'PASSED' : 'FAILED'}`);
      console.log(`Primary read successful: ${!!primaryRead}`);
      console.log(`Secondary read successful: ${!!secondaryRead}`);
      
      if (consistent) {
        console.log('✅ Data is consistent across replica set members');
      } else {
        console.warn('⚠️  Data inconsistency detected');
        console.log('Primary data:', primaryRead);
        console.log('Secondary data:', secondaryRead);
      }
      
      // Cleanup
      await testCollection.deleteOne({ _id: insertResult.insertedId });
      
      return {
        consistent,
        primaryReadSuccessful: !!primaryRead,
        secondaryReadSuccessful: !!secondaryRead,
        retryCount
      };
      
    } catch (error) {
      console.error('Data consistency check failed:', error);
      return {
        consistent: false,
        error: error.message
      };
    }
  }
}

// Example usage and demonstration
const demonstrateReplicaSetCapabilities = async () => {
  console.log('Starting MongoDB Replica Set demonstration...\n');
  
  try {
    // Setup enterprise collections
    const collections = await setupEnterpriseCollections();
    console.log('✅ Enterprise collections created\n');
    
    // Initialize replica set management
    const rsManager = new ReplicaSetManager(client, db);
    await rsManager.initializeReplicaSetMonitoring();
    console.log('✅ Replica set monitoring initialized\n');
    
    // Get replica set configuration and status
    const config = await rsManager.getReplicaSetConfig();
    const status = await rsManager.getReplicaSetStatus();
    
    console.log('📊 Replica Set Status:');
    console.log(`   Set Name: ${status.setName}`);
    console.log(`   Primary: ${status.primary?.name || 'None'}`);
    console.log(`   Total Members: ${status.members.length}`);
    console.log(`   Healthy Members: ${status.members.filter(m => m.health === 1).length}\n`);
    
    // Demonstrate read preferences
    await rsManager.demonstrateReadPreferences();
    console.log('✅ Read preferences demonstrated\n');
    
    // Demonstrate write concerns
    await rsManager.demonstrateWriteConcerns();
    console.log('✅ Write concerns demonstrated\n');
    
    // Test read/write operations
    const rwTest = await rsManager.performReadWriteOperations();
    console.log('✅ Read/write operations tested:', rwTest);
    console.log();
    
    // High availability operations
    const haOps = new HighAvailabilityOperations(client, db);
    
    // Perform data consistency check
    const consistencyResult = await haOps.performDataConsistencyCheck();
    console.log('✅ Data consistency checked:', consistencyResult);
    console.log();
    
    // Get final health summary
    const healthSummary = await rsManager.getHealthSummary();
    console.log('📋 Final Health Summary:', healthSummary);
    
    // Cleanup
    await rsManager.shutdown();
    console.log('\n🏁 Replica Set demonstration completed successfully');
    
  } catch (error) {
    console.error('❌ Demonstration failed:', error);
  }
};

// Export for use in applications
module.exports = {
  setupEnterpriseCollections,
  ReplicaSetManager,
  HighAvailabilityOperations,
  demonstrateReplicaSetCapabilities
};

// Benefits of MongoDB Replica Sets:
// - Automatic failover with no application intervention required
// - Built-in data redundancy across multiple servers and data centers
// - Configurable read preferences for performance optimization
// - Strong consistency guarantees with majority write concerns
// - Rolling upgrades and maintenance without downtime
// - Geographic distribution for disaster recovery
// - Automatic recovery from network partitions and server failures
// - Real-time replication with minimal lag
// - Integration with MongoDB Atlas for managed high availability
// - Comprehensive monitoring and alerting capabilities
```

## Understanding MongoDB Replica Set Architecture

### Replica Set Configuration Patterns

MongoDB Replica Sets provide several deployment patterns for different availability and performance requirements:

```javascript
// Advanced replica set configuration patterns for enterprise deployments
class EnterpriseReplicaSetArchitecture {
  constructor(client) {
    this.client = client;
    this.admin = client.db('admin');
    this.architecturePatterns = new Map();
  }

  async setupProductionArchitecture() {
    console.log('Setting up enterprise production replica set architecture...');
    
    // Pattern 1: Standard 3-Member Production Setup
    const standardProductionConfig = {
      _id: "production-rs",
      version: 1,
      members: [
        {
          _id: 0,
          host: "db-primary-01.company.com:27017",
          priority: 10, // Higher priority = preferred primary
          votes: 1,
          buildIndexes: true,
          tags: { 
            region: "us-east-1", 
            datacenter: "primary",
            nodeType: "standard",
            environment: "production"
          }
        },
        {
          _id: 1,
          host: "db-secondary-01.company.com:27017", 
          priority: 5,
          votes: 1,
          buildIndexes: true,
          tags: { 
            region: "us-east-1", 
            datacenter: "primary",
            nodeType: "standard",
            environment: "production"
          }
        },
        {
          _id: 2,
          host: "db-secondary-02.company.com:27017",
          priority: 5,
          votes: 1, 
          buildIndexes: true,
          tags: { 
            region: "us-west-2", 
            datacenter: "secondary",
            nodeType: "standard", 
            environment: "production"
          }
        }
      ],
      settings: {
        heartbeatIntervalMillis: 2000, // 2 second heartbeat
        heartbeatTimeoutSecs: 10,      // 10 second timeout
        electionTimeoutMillis: 10000,  // 10 second election timeout
        chainingAllowed: true,         // Allow secondary-to-secondary replication
        getLastErrorModes: {
          "datacenterMajority": { "datacenter": 2 }, // Require writes to both datacenters
          "regionMajority": { "region": 2 }          // Require writes to both regions
        }
      }
    };

    // Pattern 2: 5-Member High Availability with Arbiter
    const highAvailabilityConfig = {
      _id: "ha-production-rs",
      version: 1,
      members: [
        // Primary datacenter members
        {
          _id: 0,
          host: "db-primary-01.company.com:27017",
          priority: 10,
          votes: 1,
          tags: { region: "us-east-1", datacenter: "primary" }
        },
        {
          _id: 1, 
          host: "db-secondary-01.company.com:27017",
          priority: 8,
          votes: 1,
          tags: { region: "us-east-1", datacenter: "primary" }
        },
        
        // Disaster recovery datacenter members
        {
          _id: 2,
          host: "db-dr-01.company.com:27017",
          priority: 2, // Lower priority for DR
          votes: 1,
          tags: { region: "us-west-2", datacenter: "dr" }
        },
        {
          _id: 3,
          host: "db-dr-02.company.com:27017", 
          priority: 1,
          votes: 1,
          tags: { region: "us-west-2", datacenter: "dr" }
        },
        
        // Arbiter for odd number of votes (lightweight)
        {
          _id: 4,
          host: "db-arbiter-01.company.com:27017",
          arbiterOnly: true,
          votes: 1,
          tags: { region: "us-central-1", datacenter: "arbiter" }
        }
      ],
      settings: {
        getLastErrorModes: {
          "crossDatacenter": { "datacenter": 2 },
          "disasterRecovery": { "datacenter": 1, "region": 2 }
        }
      }
    };

    // Pattern 3: Analytics-Optimized with Hidden Members
    const analyticsOptimizedConfig = {
      _id: "analytics-rs", 
      version: 1,
      members: [
        // Production data serving members
        {
          _id: 0,
          host: "db-primary-01.company.com:27017",
          priority: 10,
          votes: 1,
          tags: { workload: "transactional", region: "us-east-1" }
        },
        {
          _id: 1,
          host: "db-secondary-01.company.com:27017",
          priority: 5,
          votes: 1,
          tags: { workload: "transactional", region: "us-east-1" }
        },
        
        // Hidden analytics members (never become primary)
        {
          _id: 2,
          host: "db-analytics-01.company.com:27017",
          priority: 0,    // Cannot become primary
          votes: 0,       // Does not participate in elections
          hidden: true,   // Hidden from application discovery
          buildIndexes: true,
          tags: { 
            workload: "analytics", 
            region: "us-east-1",
            purpose: "reporting" 
          }
        },
        {
          _id: 3,
          host: "db-analytics-02.company.com:27017",
          priority: 0,
          votes: 0, 
          hidden: true,
          buildIndexes: true,
          tags: { 
            workload: "analytics",
            region: "us-east-1", 
            purpose: "etl"
          }
        },
        
        // Delayed member for disaster recovery
        {
          _id: 4,
          host: "db-delayed-01.company.com:27017",
          priority: 0,
          votes: 0,
          hidden: true,
          buildIndexes: true,
          secondaryDelaySecs: 3600, // 1 hour delay
          tags: { 
            workload: "recovery",
            region: "us-west-2",
            purpose: "delayed_backup"
          }
        }
      ]
    };

    // Store configurations for reference
    this.architecturePatterns.set('standard-production', standardProductionConfig);
    this.architecturePatterns.set('high-availability', highAvailabilityConfig);
    this.architecturePatterns.set('analytics-optimized', analyticsOptimizedConfig);

    console.log('Enterprise replica set architectures configured');
    return this.architecturePatterns;
  }

  async implementReadPreferenceStrategies() {
    console.log('Implementing enterprise read preference strategies...');
    
    // Strategy 1: Load balancing with geographic preference
    const geographicLoadBalancing = {
      // Primary application reads from nearest secondary
      applicationReads: {
        readPreference: 'secondaryPreferred',
        readPreferenceTags: [
          { region: 'us-east-1', datacenter: 'primary' }, // Prefer local datacenter
          { region: 'us-east-1' },                       // Fallback to region
          {}                                             // Final fallback to any
        ],
        maxStalenessSeconds: 60
      },
      
      // Analytics reads from dedicated hidden members
      analyticsReads: {
        readPreference: 'secondary',
        readPreferenceTags: [
          { workload: 'analytics', purpose: 'reporting' },
          { workload: 'analytics' }
        ],
        maxStalenessSeconds: 300 // 5 minutes acceptable for analytics
      },
      
      // Real-time dashboard reads (require fresh data)
      dashboardReads: {
        readPreference: 'primaryPreferred',
        maxStalenessSeconds: 30
      },
      
      // ETL and batch processing reads
      etlReads: {
        readPreference: 'secondary',
        readPreferenceTags: [
          { purpose: 'etl' },
          { workload: 'analytics' }
        ],
        maxStalenessSeconds: 600 // 10 minutes acceptable for ETL
      }
    };

    // Strategy 2: Write concern patterns for different operations
    const writeConcernStrategies = {
      // Critical financial transactions
      criticalWrites: {
        writeConcern: { 
          w: 'datacenterMajority',  // Custom write concern
          j: true,
          wtimeout: 10000
        },
        description: 'Ensures writes to multiple datacenters'
      },
      
      // Standard application writes
      standardWrites: {
        writeConcern: {
          w: 'majority',
          j: true, 
          wtimeout: 5000
        },
        description: 'Balances durability and performance'
      },
      
      // High-volume logging writes
      loggingWrites: {
        writeConcern: {
          w: 1,
          j: false,
          wtimeout: 1000
        },
        description: 'Optimized for throughput'
      },
      
      // Audit trail writes (maximum durability)
      auditWrites: {
        writeConcern: {
          w: 'regionMajority', // Custom write concern
          j: true,
          wtimeout: 15000
        },
        description: 'Ensures geographic distribution'
      }
    };

    return {
      readPreferences: geographicLoadBalancing,
      writeConcerns: writeConcernStrategies
    };
  }

  async setupMonitoringAndAlerting() {
    console.log('Setting up comprehensive replica set monitoring...');
    
    const monitoringMetrics = {
      // Replication lag monitoring
      replicationLag: {
        warning: 10,   // seconds
        critical: 30,  // seconds
        query: 'db.runCommand({replSetGetStatus: 1})'
      },
      
      // Member health monitoring
      memberHealth: {
        checkInterval: 30, // seconds
        alertThreshold: 2, // consecutive failures
        metrics: ['health', 'state', 'uptime', 'lastHeartbeat']
      },
      
      // Oplog monitoring
      oplogUtilization: {
        warning: 75,   // percent
        critical: 90,  // percent
        retentionTarget: 24 // hours
      },
      
      // Connection monitoring
      connectionMetrics: {
        maxConnections: 1000,
        warningThreshold: 800,
        monitorActiveConnections: true,
        trackConnectionSources: true
      },
      
      // Performance monitoring
      performanceMetrics: {
        slowQueryThreshold: 1000, // ms
        indexUsageTracking: true,
        collectionStatsMonitoring: true,
        operationProfiling: {
          enabled: true,
          slowMs: 100,
          sampleRate: 0.1 // 10% sampling
        }
      }
    };

    // Automated alert conditions
    const alertConditions = {
      criticalAlerts: [
        'No primary member available',
        'Majority of members down',
        'Replication lag > 30 seconds',
        'Oplog utilization > 90%'
      ],
      
      warningAlerts: [
        'Member health issues',
        'Replication lag > 10 seconds', 
        'High connection usage',
        'Slow query patterns detected'
      ],
      
      infoAlerts: [
        'Primary election occurred',
        'Member added/removed',
        'Configuration change',
        'Index build completed'
      ]
    };

    return {
      metrics: monitoringMetrics,
      alerts: alertConditions
    };
  }

  async performMaintenanceOperations() {
    console.log('Demonstrating maintenance operations...');
    
    try {
      // 1. Check replica set status before maintenance
      const preMaintenanceStatus = await this.admin.command({ replSetGetStatus: 1 });
      console.log('Pre-maintenance replica set status obtained');
      
      // 2. Demonstrate rolling maintenance (simulation)
      console.log('Simulating rolling maintenance procedures...');
      
      const maintenanceProcedures = {
        // Step-by-step rolling upgrade
        rollingUpgrade: [
          '1. Start with secondary members (lowest priority first)',
          '2. Stop MongoDB service on secondary',
          '3. Upgrade MongoDB binaries', 
          '4. Restart with new version',
          '5. Verify member rejoins and catches up',
          '6. Repeat for remaining secondaries',
          '7. Step down primary to make it secondary',
          '8. Upgrade former primary',
          '9. Allow automatic primary election'
        ],
        
        // Rolling configuration changes
        configurationUpdate: [
          '1. Update secondary member configurations',
          '2. Verify changes take effect',
          '3. Step down primary',
          '4. Update former primary configuration', 
          '5. Verify replica set health'
        ],
        
        // Index building strategy  
        indexMaintenance: [
          '1. Build indexes on secondaries first',
          '2. Use background: true for minimal impact',
          '3. Monitor replication lag during build',
          '4. Step down primary after secondary indexes complete',
          '5. Build index on former primary'
        ]
      };

      console.log('Rolling maintenance procedures defined:', Object.keys(maintenanceProcedures));
      
      // 3. Demonstrate graceful primary stepdown
      console.log('Demonstrating graceful primary stepdown...');
      
      try {
        // Check if we have a primary
        const currentPrimary = preMaintenanceStatus.members.find(m => m.state === 1);
        
        if (currentPrimary) {
          console.log(`Current primary: ${currentPrimary.name}`);
          
          // In a real scenario, you would step down the primary:
          // await this.admin.command({ replSetStepDown: 60 }); // Step down for 60 seconds
          
          console.log('Primary stepdown would be executed here (skipped in demo)');
        } else {
          console.log('No primary found - replica set may be in election');
        }
        
      } catch (error) {
        console.log('Primary stepdown simulation completed (expected in demo environment)');
      }
      
      // 4. Maintenance completion verification
      console.log('Verifying replica set health after maintenance...');
      
      const postMaintenanceChecks = {
        replicationLag: 'Check all members have acceptable lag',
        memberHealth: 'Verify all members are healthy',
        primaryElection: 'Confirm primary is elected and stable', 
        dataConsistency: 'Validate data consistency across members',
        applicationConnectivity: 'Test application reconnection',
        performanceBaseline: 'Confirm performance metrics are normal'
      };

      console.log('Post-maintenance verification checklist:', Object.keys(postMaintenanceChecks));
      
      return {
        maintenanceProcedures,
        preMaintenanceStatus: preMaintenanceStatus.members.length,
        postMaintenanceChecks: Object.keys(postMaintenanceChecks).length
      };
      
    } catch (error) {
      console.error('Maintenance operations demonstration failed:', error);
      throw error;
    }
  }

  async demonstrateDisasterRecovery() {
    console.log('Demonstrating disaster recovery capabilities...');
    
    const disasterRecoveryPlan = {
      // Scenario 1: Primary datacenter failure
      primaryDatacenterFailure: {
        detectionMethods: [
          'Automated health checks detect connectivity loss',
          'Application connection failures increase',
          'Monitoring systems report member unavailability'
        ],
        
        automaticResponse: [
          'Remaining members detect primary datacenter loss',
          'Automatic election occurs among surviving members',
          'New primary elected in secondary datacenter',
          'Applications automatically reconnect to new primary'
        ],
        
        recoverySteps: [
          'Verify new primary is stable and accepting writes',
          'Update DNS/load balancer if necessary', 
          'Monitor replication lag on remaining secondaries',
          'Plan primary datacenter restoration'
        ]
      },
      
      // Scenario 2: Network partition (split-brain prevention)
      networkPartition: {
        scenario: 'Network split isolates primary from majority of members',
        
        mongodbResponse: [
          'Primary detects loss of majority and steps down',
          'Primary becomes secondary (read-only)',
          'Majority partition elects new primary',
          'Split-brain scenario prevented by majority rule'
        ],
        
        resolution: [
          'Network partition heals automatically or manually',
          'Isolated member(s) rejoin replica set',
          'Data consistency maintained through oplog replay',
          'Normal operations resume'
        ]
      },
      
      // Scenario 3: Data corruption recovery
      dataCorruption: {
        detectionMethods: [
          'Checksum validation failures',
          'Application data integrity checks', 
          'MongoDB internal consistency checks'
        ],
        
        recoveryOptions: [
          'Restore from delayed secondary (if available)',
          'Point-in-time recovery from backup',
          'Partial data recovery and manual intervention',
          'Full replica set restoration from backup'
        ]
      }
    };

    // Demonstrate backup and recovery verification
    const backupVerification = await this.verifyBackupProcedures();
    
    return {
      disasterScenarios: Object.keys(disasterRecoveryPlan),
      backupVerification
    };
  }

  async verifyBackupProcedures() {
    console.log('Verifying backup and recovery procedures...');
    
    try {
      // Create a test collection for backup verification
      const backupTestCollection = this.client.db('backup_test').collection('test_data');
      
      // Insert test data
      await backupTestCollection.insertMany([
        { testId: 1, data: 'Backup verification data 1', timestamp: new Date() },
        { testId: 2, data: 'Backup verification data 2', timestamp: new Date() },
        { testId: 3, data: 'Backup verification data 3', timestamp: new Date() }
      ]);
      
      // Simulate backup verification steps
      const backupProcedures = {
        backupVerification: [
          'Verify mongodump/mongorestore functionality',
          'Test point-in-time recovery capabilities',
          'Validate backup file integrity',
          'Confirm backup storage accessibility'
        ],
        
        recoveryTesting: [
          'Restore backup to test environment',
          'Verify data completeness and integrity',
          'Test application connectivity to restored data',
          'Measure recovery time objectives (RTO)'
        ],
        
        continuousBackup: [
          'Oplog-based continuous backup',
          'Incremental backup strategies',
          'Cross-region backup replication', 
          'Automated backup validation'
        ]
      };
      
      // Read back test data to verify
      const verificationCount = await backupTestCollection.countDocuments();
      console.log(`Backup verification: ${verificationCount} test documents created`);
      
      // Cleanup
      await backupTestCollection.drop();
      
      return {
        backupProceduresVerified: Object.keys(backupProcedures).length,
        testDataVerified: verificationCount === 3
      };
      
    } catch (error) {
      console.warn('Backup verification failed:', error.message);
      return {
        backupProceduresVerified: 0,
        testDataVerified: false,
        error: error.message
      };
    }
  }

  getArchitectureRecommendations() {
    return {
      production: {
        minimumMembers: 3,
        recommendedMembers: 5,
        arbiterUsage: 'Only when even number of data-bearing members',
        geographicDistribution: 'Multiple datacenters recommended',
        hiddenMembers: 'Use for analytics and backup workloads'
      },
      
      performance: {
        readPreferences: 'Configure based on workload patterns',
        writeConcerns: 'Balance durability with performance requirements', 
        indexStrategy: 'Build on secondaries first during maintenance',
        connectionPooling: 'Configure appropriate pool sizes'
      },
      
      monitoring: {
        replicationLag: 'Monitor continuously with alerts',
        memberHealth: 'Automated health checking essential',
        oplogSize: 'Size for expected downtime windows',
        backupTesting: 'Regular backup and recovery testing'
      }
    };
  }
}

// Export the enterprise architecture class
module.exports = { EnterpriseReplicaSetArchitecture };
```

## SQL-Style Replica Set Operations with QueryLeaf

QueryLeaf provides SQL-familiar syntax for MongoDB Replica Set configuration and monitoring:

```sql
-- QueryLeaf replica set operations with SQL-familiar syntax

-- Create and configure replica sets using SQL-style syntax
CREATE REPLICA SET production_rs WITH (
  members = [
    { 
      host = 'db-primary-01.company.com:27017',
      priority = 10,
      votes = 1,
      tags = { region = 'us-east-1', datacenter = 'primary' }
    },
    {
      host = 'db-secondary-01.company.com:27017', 
      priority = 5,
      votes = 1,
      tags = { region = 'us-east-1', datacenter = 'primary' }
    },
    {
      host = 'db-secondary-02.company.com:27017',
      priority = 5,
      votes = 1, 
      tags = { region = 'us-west-2', datacenter = 'secondary' }
    }
  ],
  settings = {
    heartbeat_interval = '2 seconds',
    election_timeout = '10 seconds',
    write_concern_modes = {
      datacenter_majority = { datacenter = 2 },
      cross_region = { region = 2 }
    }
  }
);

-- Monitor replica set health with SQL queries
SELECT 
  member_name,
  member_state,
  health_status,
  uptime_seconds,
  replication_lag_seconds,
  last_heartbeat,
  
  -- Health assessment
  CASE 
    WHEN health_status = 1 AND member_state = 'PRIMARY' THEN 'Healthy Primary'
    WHEN health_status = 1 AND member_state = 'SECONDARY' THEN 'Healthy Secondary'
    WHEN health_status = 0 THEN 'Unhealthy Member'
    ELSE 'Unknown Status'
  END as status_description,
  
  -- Performance indicators
  CASE
    WHEN replication_lag_seconds > 30 THEN 'High Lag'
    WHEN replication_lag_seconds > 10 THEN 'Moderate Lag'  
    ELSE 'Low Lag'
  END as lag_status,
  
  -- Connection quality
  CASE
    WHEN ping_ms < 10 THEN 'Excellent'
    WHEN ping_ms < 50 THEN 'Good'
    WHEN ping_ms < 100 THEN 'Fair'
    ELSE 'Poor'
  END as connection_quality

FROM replica_set_status('production_rs')
ORDER BY 
  CASE member_state
    WHEN 'PRIMARY' THEN 1
    WHEN 'SECONDARY' THEN 2
    ELSE 3
  END,
  member_name;

-- Advanced read preference configuration with SQL
SELECT 
  account_id,
  transaction_date,
  amount,
  transaction_type,
  status
  
FROM financial_transactions 
WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
  AND account_id = '12345'

-- Use read preference for load balancing
WITH READ_PREFERENCE = 'secondary_preferred'
WITH READ_PREFERENCE_TAGS = [
  { region = 'us-east-1', datacenter = 'primary' },
  { region = 'us-east-1' },
  { }  -- fallback to any available member
]
WITH MAX_STALENESS = '60 seconds'

ORDER BY transaction_date DESC
LIMIT 100;

-- Write operations with custom write concerns
INSERT INTO critical_financial_data (
  transaction_id,
  account_from,
  account_to, 
  amount,
  transaction_type,
  created_at
) VALUES (
  'TXN-2025-001234',
  'ACC-123456789',
  'ACC-987654321', 
  1500.00,
  'wire_transfer',
  CURRENT_TIMESTAMP
)
-- Ensure write to multiple datacenters for critical data
WITH WRITE_CONCERN = {
  w = 'datacenter_majority',
  journal = true,
  timeout = '10 seconds'
};

-- Comprehensive replica set analytics
WITH replica_set_metrics AS (
  SELECT 
    rs.replica_set_name,
    rs.member_name,
    rs.member_state,
    rs.health_status,
    rs.uptime_seconds,
    rs.replication_lag_seconds,
    rs.ping_ms,
    
    -- Time-based analysis
    DATE_TRUNC('hour', rs.check_timestamp) as hour_bucket,
    DATE_TRUNC('day', rs.check_timestamp) as day_bucket,
    
    -- Performance categorization
    CASE 
      WHEN rs.replication_lag_seconds <= 5 THEN 'excellent'
      WHEN rs.replication_lag_seconds <= 15 THEN 'good'
      WHEN rs.replication_lag_seconds <= 30 THEN 'fair'
      ELSE 'poor'
    END as replication_performance,
    
    CASE
      WHEN rs.ping_ms <= 10 THEN 'excellent'
      WHEN rs.ping_ms <= 25 THEN 'good'
      WHEN rs.ping_ms <= 50 THEN 'fair'
      ELSE 'poor'
    END as connection_performance
    
  FROM replica_set_health_history rs
  WHERE rs.check_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
),
performance_summary AS (
  SELECT 
    replica_set_name,
    hour_bucket,
    
    -- Member availability
    COUNT(*) as total_checks,
    COUNT(*) FILTER (WHERE health_status = 1) as healthy_checks,
    ROUND((COUNT(*) FILTER (WHERE health_status = 1)::numeric / COUNT(*)) * 100, 2) as availability_percent,
    
    -- Primary stability
    COUNT(DISTINCT member_name) FILTER (WHERE member_state = 'PRIMARY') as primary_changes,
    
    -- Replication performance
    AVG(replication_lag_seconds) as avg_replication_lag,
    MAX(replication_lag_seconds) as max_replication_lag,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY replication_lag_seconds) as p95_replication_lag,
    
    -- Connection performance  
    AVG(ping_ms) as avg_ping_ms,
    MAX(ping_ms) as max_ping_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ping_ms) as p95_ping_ms,
    
    -- Performance distribution
    COUNT(*) FILTER (WHERE replication_performance = 'excellent') as excellent_replication_count,
    COUNT(*) FILTER (WHERE replication_performance = 'good') as good_replication_count,
    COUNT(*) FILTER (WHERE replication_performance = 'fair') as fair_replication_count,
    COUNT(*) FILTER (WHERE replication_performance = 'poor') as poor_replication_count,
    
    COUNT(*) FILTER (WHERE connection_performance = 'excellent') as excellent_connection_count,
    COUNT(*) FILTER (WHERE connection_performance = 'good') as good_connection_count,
    COUNT(*) FILTER (WHERE connection_performance = 'fair') as fair_connection_count,
    COUNT(*) FILTER (WHERE connection_performance = 'poor') as poor_connection_count
    
  FROM replica_set_metrics
  GROUP BY replica_set_name, hour_bucket
),
alerting_analysis AS (
  SELECT 
    ps.*,
    
    -- SLA compliance (99.9% availability target)
    CASE WHEN ps.availability_percent >= 99.9 THEN 'SLA_COMPLIANT' ELSE 'SLA_BREACH' END as sla_status,
    
    -- Performance alerts
    CASE 
      WHEN ps.avg_replication_lag > 30 THEN 'CRITICAL_LAG'
      WHEN ps.avg_replication_lag > 15 THEN 'WARNING_LAG' 
      ELSE 'NORMAL_LAG'
    END as lag_alert_level,
    
    CASE
      WHEN ps.primary_changes > 1 THEN 'UNSTABLE_PRIMARY'
      WHEN ps.primary_changes = 1 THEN 'PRIMARY_CHANGE'
      ELSE 'STABLE_PRIMARY'
    END as primary_stability,
    
    -- Recommendations
    CASE
      WHEN ps.availability_percent < 99.0 THEN 'Investigate member failures and network issues'
      WHEN ps.avg_replication_lag > 30 THEN 'Check network bandwidth and server performance'
      WHEN ps.primary_changes > 1 THEN 'Analyze primary election patterns and member priorities'
      WHEN ps.avg_ping_ms > 50 THEN 'Investigate network latency between members'
      ELSE 'Performance within acceptable parameters'
    END as recommendation
    
  FROM performance_summary ps
)
SELECT 
  aa.replica_set_name,
  TO_CHAR(aa.hour_bucket, 'YYYY-MM-DD HH24:00') as monitoring_hour,
  
  -- Availability metrics
  aa.total_checks,
  aa.availability_percent,
  aa.sla_status,
  
  -- Replication metrics
  ROUND(aa.avg_replication_lag::numeric, 2) as avg_lag_seconds,
  ROUND(aa.max_replication_lag::numeric, 2) as max_lag_seconds,
  ROUND(aa.p95_replication_lag::numeric, 2) as p95_lag_seconds,
  aa.lag_alert_level,
  
  -- Connection metrics
  ROUND(aa.avg_ping_ms::numeric, 1) as avg_ping_ms,
  ROUND(aa.max_ping_ms::numeric, 1) as max_ping_ms,
  
  -- Stability metrics
  aa.primary_changes,
  aa.primary_stability,
  
  -- Performance distribution
  CONCAT(
    'Excellent: ', aa.excellent_replication_count, 
    ', Good: ', aa.good_replication_count,
    ', Fair: ', aa.fair_replication_count,
    ', Poor: ', aa.poor_replication_count
  ) as replication_distribution,
  
  -- Operational insights
  aa.recommendation,
  
  -- Trend indicators
  LAG(aa.availability_percent) OVER (
    PARTITION BY aa.replica_set_name 
    ORDER BY aa.hour_bucket
  ) as prev_hour_availability,
  
  aa.availability_percent - LAG(aa.availability_percent) OVER (
    PARTITION BY aa.replica_set_name 
    ORDER BY aa.hour_bucket  
  ) as availability_trend

FROM alerting_analysis aa
ORDER BY aa.replica_set_name, aa.hour_bucket DESC;

-- Failover simulation and testing
CREATE PROCEDURE test_failover_scenario(
  replica_set_name VARCHAR(100),
  test_type VARCHAR(50) -- 'primary_stepdown', 'network_partition', 'member_failure'
) AS
BEGIN
  -- Record test start
  INSERT INTO failover_tests (
    replica_set_name,
    test_type,
    test_start_time,
    status
  ) VALUES (
    replica_set_name,
    test_type,
    CURRENT_TIMESTAMP,
    'running'
  );
  
  -- Execute test based on type
  CASE test_type
    WHEN 'primary_stepdown' THEN
      -- Gracefully step down current primary
      CALL replica_set_step_down(replica_set_name, 60); -- 60 second stepdown
      
    WHEN 'network_partition' THEN
      -- Simulate network partition (requires external orchestration)
      CALL simulate_network_partition(replica_set_name, '30 seconds');
      
    WHEN 'member_failure' THEN
      -- Simulate member failure (test environment only)
      CALL simulate_member_failure(replica_set_name, 'secondary', '60 seconds');
  END CASE;
  
  -- Monitor failover process
  CALL monitor_failover_recovery(replica_set_name);
  
  -- Record test completion
  UPDATE failover_tests 
  SET 
    test_end_time = CURRENT_TIMESTAMP,
    status = 'completed',
    recovery_time_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - test_start_time))
  WHERE replica_set_name = replica_set_name 
    AND test_start_time = (
      SELECT MAX(test_start_time) 
      FROM failover_tests 
      WHERE replica_set_name = replica_set_name
    );
END;

-- Backup and recovery verification
WITH backup_verification AS (
  SELECT 
    backup_name,
    backup_timestamp,
    backup_size_gb,
    backup_type, -- 'full', 'incremental', 'oplog'
    
    -- Backup validation
    backup_integrity_check,
    restoration_test_status,
    
    -- Recovery metrics
    estimated_recovery_time_minutes,
    recovery_point_objective_minutes,
    recovery_time_objective_minutes,
    
    -- Geographic distribution
    backup_locations,
    cross_region_replication_status
    
  FROM backup_history
  WHERE backup_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND backup_type IN ('full', 'incremental')
),
recovery_readiness AS (
  SELECT 
    COUNT(*) as total_backups,
    COUNT(*) FILTER (WHERE backup_integrity_check = 'passed') as verified_backups,
    COUNT(*) FILTER (WHERE restoration_test_status = 'success') as tested_backups,
    
    AVG(estimated_recovery_time_minutes) as avg_recovery_time,
    MAX(estimated_recovery_time_minutes) as max_recovery_time,
    
    -- Compliance assessment
    CASE 
      WHEN COUNT(*) FILTER (WHERE restoration_test_status = 'success') >= 3 THEN 'compliant'
      WHEN COUNT(*) FILTER (WHERE restoration_test_status = 'success') >= 1 THEN 'warning'
      ELSE 'non_compliant'
    END as backup_testing_compliance,
    
    -- Geographic redundancy
    COUNT(DISTINCT backup_locations) as backup_site_count,
    
    -- Recommendations
    CASE
      WHEN COUNT(*) FILTER (WHERE restoration_test_status = 'success') = 0 THEN 
        'Schedule immediate backup restoration testing'
      WHEN AVG(estimated_recovery_time_minutes) > recovery_time_objective_minutes THEN
        'Optimize backup strategy to meet RTO requirements'
      WHEN COUNT(DISTINCT backup_locations) < 2 THEN
        'Implement geographic backup distribution'
      ELSE 'Backup and recovery strategy meets requirements'
    END as recommendation
    
  FROM backup_verification
)
SELECT 
  rr.total_backups,
  rr.verified_backups,
  rr.tested_backups,
  ROUND((rr.tested_backups::numeric / rr.total_backups) * 100, 1) as testing_coverage_percent,
  
  ROUND(rr.avg_recovery_time, 1) as avg_recovery_time_minutes,
  ROUND(rr.max_recovery_time, 1) as max_recovery_time_minutes,
  
  rr.backup_testing_compliance,
  rr.backup_site_count,
  rr.recommendation

FROM recovery_readiness rr;

-- QueryLeaf provides comprehensive replica set capabilities:
-- 1. SQL-familiar replica set configuration and management syntax
-- 2. Advanced monitoring and alerting with SQL aggregation functions
-- 3. Read preference and write concern configuration using SQL expressions
-- 4. Comprehensive health analytics with time-series analysis
-- 5. Automated failover testing and recovery verification procedures
-- 6. Backup and recovery management with compliance tracking
-- 7. Performance optimization recommendations based on SQL analytics
-- 8. Integration with existing SQL-based monitoring and reporting systems
-- 9. Geographic distribution and disaster recovery planning with SQL queries
-- 10. Enterprise-grade high availability management using familiar SQL patterns
```

## Best Practices for Replica Set Implementation

### Production Deployment Strategies

Essential practices for enterprise MongoDB Replica Set deployments:

1. **Member Configuration**: Deploy odd numbers of voting members to prevent election ties
2. **Geographic Distribution**: Distribute members across multiple data centers for disaster recovery
3. **Priority Settings**: Configure member priorities to control primary election preferences
4. **Hidden Members**: Use hidden members for analytics workloads without affecting elections
5. **Arbiter Usage**: Deploy arbiters only when necessary to maintain odd voting member counts
6. **Write Concerns**: Configure appropriate write concerns for data durability requirements

### Performance and Monitoring

Optimize Replica Sets for high-performance, production environments:

1. **Read Preferences**: Configure read preferences to distribute load and optimize performance
2. **Replication Lag**: Monitor replication lag continuously with automated alerting
3. **Oplog Sizing**: Size oplog appropriately for expected maintenance windows and downtime
4. **Connection Pooling**: Configure connection pools for optimal resource utilization
5. **Index Building**: Build indexes on secondaries first during maintenance windows
6. **Health Monitoring**: Implement comprehensive health checking and automated recovery

## Conclusion

MongoDB Replica Sets provide comprehensive high availability and data resilience that eliminates the complexity and operational overhead of traditional database replication solutions while ensuring automatic failover, data consistency, and geographic distribution. The native integration with MongoDB's distributed architecture, combined with configurable read preferences and write concerns, makes building highly available applications both powerful and operationally simple.

Key Replica Set benefits include:

- **Automatic Failover**: Seamless primary election and failover without manual intervention
- **Data Redundancy**: Built-in data replication across multiple servers and geographic regions
- **Read Scaling**: Configurable read preferences for optimal performance and load distribution
- **Strong Consistency**: Majority write concerns ensure data durability and consistency
- **Zero-Downtime Maintenance**: Rolling upgrades and maintenance without service interruption
- **Geographic Distribution**: Cross-region deployment for disaster recovery and compliance

Whether you're building financial systems, e-commerce platforms, healthcare applications, or any mission-critical system requiring high availability, MongoDB Replica Sets with QueryLeaf's familiar SQL interface provides the foundation for enterprise-grade data resilience. This combination enables you to implement sophisticated high availability architectures while preserving familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Replica Set operations while providing SQL-familiar configuration syntax, monitoring queries, and health analytics functions. Advanced replica set management, read preference configuration, and failover testing are seamlessly handled through familiar SQL patterns, making high availability database management both powerful and accessible.

The integration of native high availability capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both enterprise-grade resilience and familiar database interaction patterns, ensuring your high availability solutions remain both effective and maintainable as they scale and evolve.