---
title: "MongoDB Replica Sets and Fault Tolerance: SQL-Style High Availability with Automatic Failover"
description: "Master MongoDB replica sets for high availability and fault tolerance. Learn automatic failover, read preferences, write concerns, and SQL-equivalent high availability patterns for production databases."
date: 2025-09-09
tags: [mongodb, replica-sets, high-availability, fault-tolerance, production, sql, clustering]
---

# MongoDB Replica Sets and Fault Tolerance: SQL-Style High Availability with Automatic Failover

Production applications demand high availability, data redundancy, and automatic failover capabilities to ensure uninterrupted service and data protection. Traditional SQL databases achieve high availability through complex clustering solutions, master-slave replication, and expensive failover systems that often require manual intervention and specialized expertise.

MongoDB replica sets provide built-in high availability with automatic failover, distributed consensus, and flexible read/write routing - all managed through a simple, unified interface. Unlike traditional database clustering solutions that require separate technologies and complex configuration, MongoDB replica sets deliver enterprise-grade availability features as a core part of the database platform.

## The High Availability Challenge

Traditional SQL database high availability approaches involve significant complexity:

```sql
-- Traditional SQL high availability setup challenges

-- Master-Slave replication requires manual failover
-- Primary database server
CREATE SERVER primary_db
  CONNECTION 'host=db-master.example.com port=5432 dbname=production';

-- Read replica servers  
CREATE SERVER replica_db_1
  CONNECTION 'host=db-replica-1.example.com port=5432 dbname=production';
CREATE SERVER replica_db_2  
  CONNECTION 'host=db-replica-2.example.com port=5432 dbname=production';

-- Application must handle connection routing
-- Read queries to replicas
SELECT customer_id, name, email 
FROM customers@replica_db_1
WHERE status = 'active';

-- Write queries to master
INSERT INTO orders (customer_id, product_id, quantity)
VALUES (123, 456, 2)
-- Must go to primary_db

-- Problems with traditional approaches:
-- - Manual failover when primary fails
-- - Complex connection string management
-- - Application-level routing logic required
-- - No automatic primary election
-- - Split-brain scenarios possible
-- - Expensive clustering solutions
-- - Recovery requires manual intervention
-- - No built-in consistency guarantees
```

MongoDB replica sets provide automatic high availability:

```javascript
// MongoDB replica set - automatic high availability
// Single connection string handles all routing
const mongoUrl = 'mongodb://db1.example.com,db2.example.com,db3.example.com/production?replicaSet=prodRS';

const client = new MongoClient(mongoUrl, {
  // Automatic failover and reconnection
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
  
  // Write concern for durability
  writeConcern: {
    w: 'majority',      // Write to majority of replica set members
    j: true,            // Ensure write to journal
    wtimeout: 5000      // Timeout for write acknowledgment
  },
  
  // Read preference for load distribution
  readPreference: 'secondaryPreferred', // Use secondaries when available
  readConcern: { level: 'majority' }     // Consistent reads
});

// Application code remains unchanged - replica set handles routing
const db = client.db('production');
const orders = db.collection('orders');

// Writes automatically go to primary
await orders.insertOne({
  customerId: ObjectId('64f1a2c4567890abcdef1234'),
  productId: ObjectId('64f1a2c4567890abcdef5678'),
  quantity: 2,
  orderDate: new Date(),
  status: 'pending'
});

// Reads can use secondaries based on read preference
const recentOrders = await orders.find({
  orderDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
}).toArray();

// Benefits:
// - Automatic primary election on failure
// - Transparent failover (no connection string changes)
// - Built-in data consistency guarantees
// - Distributed consensus prevents split-brain
// - Hot standby replicas ready immediately
// - Rolling updates without downtime
// - Geographic distribution support
// - No additional clustering software needed
```

## Understanding MongoDB Replica Sets

### Replica Set Architecture and Consensus

Implement robust replica set configurations with proper consensus:

```javascript
// Replica set configuration and management
class ReplicaSetManager {
  constructor() {
    this.replicaSetConfig = {
      _id: 'prodRS',
      version: 1,
      members: [
        {
          _id: 0,
          host: 'db-primary.example.com:27017',
          priority: 10,        // High priority for primary preference
          arbiterOnly: false,
          buildIndexes: true,
          hidden: false,
          slaveDelay: 0,
          votes: 1
        },
        {
          _id: 1, 
          host: 'db-secondary-1.example.com:27017',
          priority: 5,         // Medium priority for secondary
          arbiterOnly: false,
          buildIndexes: true,
          hidden: false,
          slaveDelay: 0,
          votes: 1
        },
        {
          _id: 2,
          host: 'db-secondary-2.example.com:27017', 
          priority: 5,         // Medium priority for secondary
          arbiterOnly: false,
          buildIndexes: true,
          hidden: false,
          slaveDelay: 0,
          votes: 1
        },
        {
          _id: 3,
          host: 'db-arbiter.example.com:27017',
          priority: 0,         // Arbiters cannot become primary
          arbiterOnly: true,   // Voting member but no data
          buildIndexes: false,
          hidden: false,
          slaveDelay: 0,
          votes: 1
        }
      ],
      settings: {
        chainingAllowed: true,              // Allow secondary-to-secondary sync
        heartbeatIntervalMillis: 2000,      // Heartbeat frequency
        heartbeatTimeoutSecs: 10,           // Heartbeat timeout
        electionTimeoutMillis: 10000,       // Election timeout
        catchUpTimeoutMillis: 60000,        // Catchup period for new primary
        getLastErrorModes: {
          'datacenter': {                   // Custom write concern mode
            'dc1': 1,
            'dc2': 1
          }
        },
        getLastErrorDefaults: {
          w: 'majority',
          wtimeout: 5000
        }
      }
    };
  }

  async initializeReplicaSet(primaryConnection) {
    try {
      // Initialize replica set on primary node
      const result = await primaryConnection.db('admin').runCommand({
        replSetInitiate: this.replicaSetConfig
      });

      console.log('Replica set initialization result:', result);

      // Wait for replica set to stabilize
      await this.waitForReplicaSetReady(primaryConnection);

      return { success: true, config: this.replicaSetConfig };

    } catch (error) {
      throw new Error(`Replica set initialization failed: ${error.message}`);
    }
  }

  async waitForReplicaSetReady(connection, maxWaitMs = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const status = await connection.db('admin').runCommand({ replSetGetStatus: 1 });
        
        const primaryCount = status.members.filter(member => member.state === 1).length;
        const secondaryCount = status.members.filter(member => member.state === 2).length;
        
        if (primaryCount === 1 && secondaryCount >= 1) {
          console.log('Replica set is ready:', {
            primary: primaryCount,
            secondaries: secondaryCount,
            total: status.members.length
          });
          return true;
        }

        console.log('Waiting for replica set to stabilize...', {
          primary: primaryCount,
          secondaries: secondaryCount
        });

      } catch (error) {
        console.log('Replica set not ready yet:', error.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Replica set failed to become ready within timeout');
  }

  async addReplicaSetMember(primaryConnection, newMemberConfig) {
    try {
      // Get current configuration
      const currentConfig = await primaryConnection.db('admin').runCommand({
        replSetGetConfig: 1
      });

      // Add new member to configuration
      const updatedConfig = currentConfig.config;
      updatedConfig.version += 1;
      updatedConfig.members.push(newMemberConfig);

      // Reconfigure replica set
      const result = await primaryConnection.db('admin').runCommand({
        replSetReconfig: updatedConfig
      });

      console.log('Member added successfully:', result);
      return result;

    } catch (error) {
      throw new Error(`Failed to add replica set member: ${error.message}`);
    }
  }

  async removeReplicaSetMember(primaryConnection, memberId) {
    try {
      const currentConfig = await primaryConnection.db('admin').runCommand({
        replSetGetConfig: 1
      });

      const updatedConfig = currentConfig.config;
      updatedConfig.version += 1;
      updatedConfig.members = updatedConfig.members.filter(member => member._id !== memberId);

      const result = await primaryConnection.db('admin').runCommand({
        replSetReconfig: updatedConfig
      });

      console.log('Member removed successfully:', result);
      return result;

    } catch (error) {
      throw new Error(`Failed to remove replica set member: ${error.message}`);
    }
  }

  async performStepDown(primaryConnection, stepDownSecs = 60) {
    try {
      // Force primary to step down (useful for maintenance)
      const result = await primaryConnection.db('admin').runCommand({
        replSetStepDown: stepDownSecs,
        secondaryCatchUpPeriodSecs: 15
      });

      console.log('Primary step down initiated:', result);
      return result;

    } catch (error) {
      // Step down command typically causes connection error as primary changes
      if (error.message.includes('connection') || error.message.includes('network')) {
        console.log('Step down successful - connection closed as expected');
        return { success: true, message: 'Primary stepped down successfully' };
      }
      throw error;
    }
  }
}
```

### Write Concerns and Read Preferences

Configure appropriate consistency and performance settings:

```javascript
// Advanced write concern and read preference management
class ReplicaSetConsistencyManager {
  constructor(client) {
    this.client = client;
    this.db = client.db();
    
    // Define write concern levels for different operations
    this.writeConcerns = {
      critical: {
        w: 'majority',        // Wait for majority acknowledgment
        j: true,              // Wait for journal sync
        wtimeout: 10000       // 10 second timeout
      },
      standard: {
        w: 'majority',
        j: false,             // Don't wait for journal (faster)
        wtimeout: 5000
      },
      fast: {
        w: 1,                 // Only primary acknowledgment
        j: false,
        wtimeout: 1000
      },
      datacenter: {
        w: 'datacenter',      // Custom write concern mode
        j: true,
        wtimeout: 15000
      }
    };

    // Define read preference strategies
    this.readPreferences = {
      primaryOnly: { mode: 'primary' },
      secondaryPreferred: { 
        mode: 'secondaryPreferred',
        tagSets: [
          { region: 'us-west', datacenter: 'dc1' },  // Prefer specific tags
          { region: 'us-west' },                     // Fall back to region
          {}                                         // Fall back to any
        ],
        maxStalenessSeconds: 90  // Max replication lag
      },
      nearestRead: {
        mode: 'nearest',
        tagSets: [{ region: 'us-west' }],
        maxStalenessSeconds: 60
      },
      analyticsReads: {
        mode: 'secondary',
        tagSets: [{ usage: 'analytics' }],  // Dedicated analytics secondaries
        maxStalenessSeconds: 300
      }
    };
  }

  async performCriticalWrite(collection, operation, data, options = {}) {
    // High consistency write for critical data
    try {
      const session = this.client.startSession();
      
      const result = await session.withTransaction(async () => {
        const coll = this.db.collection(collection).withOptions({
          writeConcern: this.writeConcerns.critical,
          readPreference: this.readPreferences.primaryOnly
        });

        let operationResult;
        switch (operation) {
          case 'insert':
            operationResult = await coll.insertOne(data, { session });
            break;
          case 'update':
            operationResult = await coll.updateOne(data.filter, data.update, { 
              session, 
              ...options 
            });
            break;
          case 'replace':
            operationResult = await coll.replaceOne(data.filter, data.replacement, { 
              session, 
              ...options 
            });
            break;
          case 'delete':
            operationResult = await coll.deleteOne(data.filter, { session });
            break;
          default:
            throw new Error(`Unsupported operation: ${operation}`);
        }

        // Verify write was acknowledged by majority
        if (operationResult.acknowledged && 
            (operationResult.insertedId || operationResult.modifiedCount || operationResult.deletedCount)) {
          
          // Add audit log for critical operations
          await this.db.collection('audit_log').insertOne({
            operation: operation,
            collection: collection,
            timestamp: new Date(),
            writeConcern: 'critical',
            sessionId: session.id,
            result: {
              acknowledged: operationResult.acknowledged,
              insertedId: operationResult.insertedId,
              modifiedCount: operationResult.modifiedCount,
              deletedCount: operationResult.deletedCount
            }
          }, { session });
        }

        return operationResult;
      }, {
        readConcern: { level: 'majority' },
        writeConcern: this.writeConcerns.critical
      });

      await session.endSession();
      return result;

    } catch (error) {
      throw new Error(`Critical write failed: ${error.message}`);
    }
  }

  async performFastWrite(collection, operation, data, options = {}) {
    // Fast write for non-critical data
    const coll = this.db.collection(collection).withOptions({
      writeConcern: this.writeConcerns.fast
    });

    switch (operation) {
      case 'insert':
        return await coll.insertOne(data, options);
      case 'insertMany':
        return await coll.insertMany(data, options);
      case 'update':
        return await coll.updateOne(data.filter, data.update, options);
      case 'updateMany':
        return await coll.updateMany(data.filter, data.update, options);
      default:
        throw new Error(`Unsupported fast write operation: ${operation}`);
    }
  }

  async performConsistentRead(collection, query, options = {}) {
    // Read with strong consistency
    const coll = this.db.collection(collection).withOptions({
      readPreference: this.readPreferences.primaryOnly,
      readConcern: { level: 'majority' }
    });

    if (options.findOne) {
      return await coll.findOne(query, options);
    } else {
      return await coll.find(query, options).toArray();
    }
  }

  async performEventuallyConsistentRead(collection, query, options = {}) {
    // Read from secondaries for better performance
    const coll = this.db.collection(collection).withOptions({
      readPreference: this.readPreferences.secondaryPreferred,
      readConcern: { level: 'local' }
    });

    if (options.findOne) {
      return await coll.findOne(query, options);
    } else {
      return await coll.find(query, options).toArray();
    }
  }

  async performAnalyticsRead(collection, pipeline, options = {}) {
    // Long-running analytics queries on dedicated secondaries
    const coll = this.db.collection(collection).withOptions({
      readPreference: this.readPreferences.analyticsReads,
      readConcern: { level: 'available' }  // Fastest read concern
    });

    return await coll.aggregate(pipeline, {
      ...options,
      allowDiskUse: true,           // Allow large aggregations
      maxTimeMS: 300000,            // 5 minute timeout
      batchSize: 1000              // Optimize batch size
    }).toArray();
  }

  async checkReplicationLag() {
    // Monitor replication lag across replica set
    try {
      const status = await this.db.admin().command({ replSetGetStatus: 1 });
      const primary = status.members.find(member => member.state === 1);
      const secondaries = status.members.filter(member => member.state === 2);

      if (!primary) {
        return { error: 'No primary found in replica set' };
      }

      const lagInfo = secondaries.map(secondary => {
        const lagMs = primary.optimeDate.getTime() - secondary.optimeDate.getTime();
        return {
          member: secondary.name,
          lagSeconds: Math.round(lagMs / 1000),
          health: secondary.health,
          state: secondary.stateStr,
          lastHeartbeat: secondary.lastHeartbeat
        };
      });

      const maxLag = Math.max(...lagInfo.map(info => info.lagSeconds));
      
      return {
        primary: primary.name,
        secondaries: lagInfo,
        maxLagSeconds: maxLag,
        healthy: maxLag < 10, // Consider healthy if under 10 seconds lag
        timestamp: new Date()
      };

    } catch (error) {
      return { error: `Failed to check replication lag: ${error.message}` };
    }
  }

  async adaptWriteConcernBasedOnLag() {
    // Dynamically adjust write concern based on replication lag
    const lagInfo = await this.checkReplicationLag();
    
    if (lagInfo.error || !lagInfo.healthy) {
      console.warn('Replication issues detected, using primary-only writes');
      return this.writeConcerns.fast; // Fallback to primary-only
    }

    if (lagInfo.maxLagSeconds < 5) {
      return this.writeConcerns.critical; // Normal high consistency
    } else if (lagInfo.maxLagSeconds < 30) {
      return this.writeConcerns.standard; // Medium consistency
    } else {
      return this.writeConcerns.fast; // Primary-only for performance
    }
  }

  async performAdaptiveWrite(collection, operation, data, options = {}) {
    // Automatically choose write concern based on replica set health
    const adaptedWriteConcern = await this.adaptWriteConcernBasedOnLag();
    
    const coll = this.db.collection(collection).withOptions({
      writeConcern: adaptedWriteConcern
    });

    console.log(`Using adaptive write concern:`, adaptedWriteConcern);

    switch (operation) {
      case 'insert':
        return await coll.insertOne(data, options);
      case 'update':
        return await coll.updateOne(data.filter, data.update, options);
      case 'replace':
        return await coll.replaceOne(data.filter, data.replacement, options);
      case 'delete':
        return await coll.deleteOne(data.filter, options);
      default:
        throw new Error(`Unsupported adaptive write operation: ${operation}`);
    }
  }
}
```

### Failover Testing and Disaster Recovery

Implement comprehensive failover testing and recovery procedures:

```javascript
// Failover testing and disaster recovery automation
class FailoverTestingManager {
  constructor(replicaSetUrl) {
    this.replicaSetUrl = replicaSetUrl;
    this.testResults = [];
  }

  async simulateNetworkPartition(duration = 30000) {
    // Simulate network partition by stepping down primary
    console.log('Starting network partition simulation...');
    
    const client = new MongoClient(this.replicaSetUrl);
    await client.connect();
    
    try {
      const startTime = Date.now();
      
      // Record initial replica set status
      const initialStatus = await this.getReplicaSetStatus(client);
      console.log('Initial status:', {
        primary: initialStatus.primary,
        secondaries: initialStatus.secondaries.length
      });

      // Force primary step down
      await client.db('admin').command({
        replSetStepDown: Math.ceil(duration / 1000),
        secondaryCatchUpPeriodSecs: 10
      });

      // Monitor failover process
      const failoverResult = await this.monitorFailover(client, duration);
      
      const testResult = {
        testType: 'network_partition',
        startTime: new Date(startTime),
        duration: duration,
        initialPrimary: initialStatus.primary,
        failoverTime: failoverResult.failoverTime,
        newPrimary: failoverResult.newPrimary,
        dataConsistency: await this.verifyDataConsistency(client),
        success: failoverResult.success
      };

      this.testResults.push(testResult);
      return testResult;

    } finally {
      await client.close();
    }
  }

  async simulateSecondaryFailure(secondaryHost) {
    // Simulate secondary node failure
    console.log(`Simulating failure of secondary: ${secondaryHost}`);
    
    const client = new MongoClient(this.replicaSetUrl);
    await client.connect();

    try {
      const startTime = Date.now();
      const initialStatus = await this.getReplicaSetStatus(client);
      
      // Simulate removing secondary from replica set
      const config = await client.db('admin').command({ replSetGetConfig: 1 });
      const targetMember = config.config.members.find(m => m.host.includes(secondaryHost));
      
      if (!targetMember) {
        throw new Error(`Secondary ${secondaryHost} not found in replica set`);
      }

      const updatedConfig = { ...config.config };
      updatedConfig.version += 1;
      updatedConfig.members = updatedConfig.members.filter(m => m._id !== targetMember._id);

      await client.db('admin').command({ replSetReconfig: updatedConfig });

      // Wait for configuration change to take effect
      await this.waitForConfigurationChange(client, 30000);

      // Test write operations during reduced redundancy
      const writeTestResult = await this.testWriteOperations(client);

      // Restore secondary after test period
      setTimeout(async () => {
        await this.restoreSecondary(client, targetMember);
      }, 60000);

      const testResult = {
        testType: 'secondary_failure',
        startTime: new Date(startTime),
        failedSecondary: secondaryHost,
        initialSecondaries: initialStatus.secondaries.length,
        writeTestResult: writeTestResult,
        success: writeTestResult.success
      };

      this.testResults.push(testResult);
      return testResult;

    } finally {
      await client.close();
    }
  }

  async testWriteOperations(client, testCount = 100) {
    // Test write operations during failure scenarios
    const testCollection = client.db('test').collection('failover_test');
    const results = {
      attempted: testCount,
      successful: 0,
      failed: 0,
      errors: [],
      averageLatency: 0,
      success: false
    };

    const latencies = [];

    for (let i = 0; i < testCount; i++) {
      const startTime = Date.now();
      
      try {
        await testCollection.insertOne({
          testId: i,
          timestamp: new Date(),
          data: `Test document ${i}`,
          failoverTest: true
        }, {
          writeConcern: { w: 'majority', wtimeout: 5000 }
        });

        const latency = Date.now() - startTime;
        latencies.push(latency);
        results.successful++;

      } catch (error) {
        results.failed++;
        results.errors.push({
          testId: i,
          error: error.message,
          timestamp: new Date()
        });
      }

      // Small delay between writes
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (latencies.length > 0) {
      results.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    }

    results.success = results.successful >= (testCount * 0.95); // 95% success rate
    
    // Clean up test data
    await testCollection.deleteMany({ failoverTest: true });

    return results;
  }

  async monitorFailover(client, maxWaitTime) {
    // Monitor replica set during failover
    const startTime = Date.now();
    let newPrimary = null;
    let failoverTime = null;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const status = await this.getReplicaSetStatus(client);
        
        if (status.primary && status.primary !== 'No primary') {
          newPrimary = status.primary;
          failoverTime = Date.now() - startTime;
          console.log(`New primary elected: ${newPrimary} (${failoverTime}ms)`);
          break;
        }

        console.log('Waiting for new primary election...');
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.log('Error during failover monitoring:', error.message);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return {
      success: newPrimary !== null,
      newPrimary: newPrimary,
      failoverTime: failoverTime
    };
  }

  async getReplicaSetStatus(client) {
    // Get current replica set status
    try {
      const status = await client.db('admin').command({ replSetGetStatus: 1 });
      
      const primary = status.members.find(m => m.state === 1);
      const secondaries = status.members.filter(m => m.state === 2);
      const arbiters = status.members.filter(m => m.state === 7);

      return {
        primary: primary ? primary.name : 'No primary',
        secondaries: secondaries.map(s => ({ name: s.name, health: s.health })),
        arbiters: arbiters.map(a => ({ name: a.name, health: a.health })),
        ok: status.ok
      };

    } catch (error) {
      return {
        error: error.message,
        primary: 'Unknown',
        secondaries: [],
        arbiters: []
      };
    }
  }

  async verifyDataConsistency(client) {
    // Verify data consistency across replica set
    try {
      // Insert test document with strong consistency
      const testDoc = {
        _id: new ObjectId(),
        consistencyTest: true,
        timestamp: new Date(),
        randomValue: Math.random()
      };

      const testCollection = client.db('test').collection('consistency_test');
      
      await testCollection.insertOne(testDoc, {
        writeConcern: { w: 'majority', j: true }
      });

      // Wait for replication
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Read from primary
      const primaryResult = await testCollection.findOne(
        { _id: testDoc._id },
        { readPreference: { mode: 'primary' } }
      );

      // Read from secondary
      const secondaryResult = await testCollection.findOne(
        { _id: testDoc._id },
        { 
          readPreference: { mode: 'secondaryPreferred' },
          maxStalenessSeconds: 10
        }
      );

      // Clean up
      await testCollection.deleteOne({ _id: testDoc._id });

      const consistent = primaryResult && secondaryResult && 
                        primaryResult.randomValue === secondaryResult.randomValue;

      return {
        consistent: consistent,
        primaryResult: primaryResult ? 'found' : 'not found',
        secondaryResult: secondaryResult ? 'found' : 'not found',
        timestamp: new Date()
      };

    } catch (error) {
      return {
        consistent: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async generateFailoverReport() {
    // Generate comprehensive failover test report
    if (this.testResults.length === 0) {
      return { message: 'No failover tests have been run' };
    }

    const report = {
      totalTests: this.testResults.length,
      successfulTests: this.testResults.filter(t => t.success).length,
      failedTests: this.testResults.filter(t => !t.success).length,
      averageFailoverTime: 0,
      testTypes: {},
      consistency: {
        passed: 0,
        failed: 0
      },
      recommendations: []
    };

    // Calculate statistics
    const failoverTimes = this.testResults
      .filter(t => t.failoverTime)
      .map(t => t.failoverTime);
    
    if (failoverTimes.length > 0) {
      report.averageFailoverTime = failoverTimes.reduce((a, b) => a + b, 0) / failoverTimes.length;
    }

    // Group by test type
    this.testResults.forEach(result => {
      if (!report.testTypes[result.testType]) {
        report.testTypes[result.testType] = {
          count: 0,
          successful: 0,
          failed: 0
        };
      }
      
      report.testTypes[result.testType].count++;
      if (result.success) {
        report.testTypes[result.testType].successful++;
      } else {
        report.testTypes[result.testType].failed++;
      }
    });

    // Consistency check summary
    this.testResults.forEach(result => {
      if (result.dataConsistency) {
        if (result.dataConsistency.consistent) {
          report.consistency.passed++;
        } else {
          report.consistency.failed++;
        }
      }
    });

    // Generate recommendations
    if (report.averageFailoverTime > 30000) {
      report.recommendations.push('Consider tuning election timeout settings for faster failover');
    }

    if (report.consistency.failed > 0) {
      report.recommendations.push('Data consistency issues detected - review read/write concern settings');
    }

    if (report.failedTests > report.totalTests * 0.1) {
      report.recommendations.push('High failure rate detected - review replica set configuration');
    }

    report.generatedAt = new Date();
    return report;
  }

  // Utility methods
  async waitForConfigurationChange(client, maxWait) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      try {
        await client.db('admin').command({ replSetGetStatus: 1 });
        return true;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return false;
  }

  async restoreSecondary(client, memberConfig) {
    try {
      const config = await client.db('admin').command({ replSetGetConfig: 1 });
      const updatedConfig = { ...config.config };
      updatedConfig.version += 1;
      updatedConfig.members.push(memberConfig);
      
      await client.db('admin').command({ replSetReconfig: updatedConfig });
      console.log('Secondary restored successfully');
    } catch (error) {
      console.error('Failed to restore secondary:', error.message);
    }
  }
}
```

## Advanced Replica Set Patterns

### Geographic Distribution and Multi-Region Setup

Implement geographically distributed replica sets:

```javascript
// Multi-region replica set configuration
class GeographicReplicaSetManager {
  constructor() {
    this.multiRegionConfig = {
      _id: 'globalRS',
      version: 1,
      members: [
        // Primary region (US East)
        {
          _id: 0,
          host: 'db-primary-us-east.example.com:27017',
          priority: 10,
          tags: { 
            region: 'us-east',
            datacenter: 'dc1',
            usage: 'primary'
          }
        },
        {
          _id: 1,
          host: 'db-secondary-us-east.example.com:27017',
          priority: 8,
          tags: { 
            region: 'us-east',
            datacenter: 'dc1',
            usage: 'secondary'
          }
        },
        
        // Secondary region (US West)
        {
          _id: 2,
          host: 'db-secondary-us-west.example.com:27017',
          priority: 6,
          tags: { 
            region: 'us-west',
            datacenter: 'dc2',
            usage: 'secondary'
          }
        },
        {
          _id: 3,
          host: 'db-secondary-us-west-2.example.com:27017',
          priority: 5,
          tags: { 
            region: 'us-west',
            datacenter: 'dc2',
            usage: 'analytics'
          }
        },
        
        // Tertiary region (Europe)
        {
          _id: 4,
          host: 'db-secondary-eu-west.example.com:27017',
          priority: 4,
          tags: { 
            region: 'eu-west',
            datacenter: 'dc3',
            usage: 'secondary'
          }
        },
        
        // Arbiter for odd number voting
        {
          _id: 5,
          host: 'arbiter-us-central.example.com:27017',
          priority: 0,
          arbiterOnly: true,
          tags: { 
            region: 'us-central',
            usage: 'arbiter'
          }
        }
      ],
      settings: {
        getLastErrorModes: {
          'multiRegion': {
            'region': 2  // Require writes to reach 2 different regions
          },
          'crossDatacenter': {
            'datacenter': 2  // Require writes to reach 2 different datacenters
          }
        },
        getLastErrorDefaults: {
          w: 'multiRegion',
          wtimeout: 10000
        }
      }
    };
  }

  createRegionalReadPreferences() {
    return {
      // US East users - prefer local region
      usEastUsers: {
        mode: 'secondaryPreferred',
        tagSets: [
          { region: 'us-east' },
          { region: 'us-west' },
          {}
        ],
        maxStalenessSeconds: 90
      },
      
      // US West users - prefer local region
      usWestUsers: {
        mode: 'secondaryPreferred',
        tagSets: [
          { region: 'us-west' },
          { region: 'us-east' },
          {}
        ],
        maxStalenessSeconds: 90
      },
      
      // European users - prefer local region
      europeanUsers: {
        mode: 'secondaryPreferred',
        tagSets: [
          { region: 'eu-west' },
          { region: 'us-east' },
          {}
        ],
        maxStalenessSeconds: 120
      },
      
      // Analytics workloads - dedicated secondaries
      analytics: {
        mode: 'secondary',
        tagSets: [
          { usage: 'analytics' }
        ],
        maxStalenessSeconds: 300
      }
    };
  }

  async routeRequestByRegion(clientRegion, operation, collection, data) {
    const readPreferences = this.createRegionalReadPreferences();
    const regionPreference = readPreferences[`${clientRegion}Users`] || readPreferences.usEastUsers;
    
    // Create region-optimized connection
    const client = new MongoClient(this.globalReplicaSetUrl, {
      readPreference: regionPreference,
      writeConcern: { w: 'multiRegion', wtimeout: 10000 }
    });

    try {
      await client.connect();
      const db = client.db();
      const coll = db.collection(collection);

      switch (operation.type) {
        case 'read':
          return await coll.find(data.query).toArray();
          
        case 'write':
          // Ensure cross-region durability for writes
          return await coll.insertOne(data, {
            writeConcern: { w: 'multiRegion', j: true, wtimeout: 15000 }
          });
          
        case 'update':
          return await coll.updateOne(data.filter, data.update, {
            writeConcern: { w: 'crossDatacenter', j: true, wtimeout: 12000 }
          });
          
        default:
          throw new Error(`Unsupported operation: ${operation.type}`);
      }
      
    } finally {
      await client.close();
    }
  }

  async monitorCrossRegionLatency() {
    // Monitor latency between regions
    const regions = ['us-east', 'us-west', 'eu-west'];
    const latencyResults = {};

    for (const region of regions) {
      try {
        const startTime = Date.now();
        
        // Connect with region-specific preference
        const client = new MongoClient(this.globalReplicaSetUrl, {
          readPreference: {
            mode: 'secondary',
            tagSets: [{ region: region }]
          }
        });

        await client.connect();
        
        // Perform test read
        await client.db('test').collection('ping').findOne({});
        
        const latency = Date.now() - startTime;
        latencyResults[region] = {
          latency: latency,
          status: latency < 200 ? 'good' : latency < 500 ? 'acceptable' : 'poor'
        };

        await client.close();

      } catch (error) {
        latencyResults[region] = {
          latency: null,
          status: 'error',
          error: error.message
        };
      }
    }

    return {
      timestamp: new Date(),
      regions: latencyResults,
      averageLatency: Object.values(latencyResults)
        .filter(r => r.latency)
        .reduce((sum, r, _, arr) => sum + r.latency / arr.length, 0)
    };
  }
}
```

### Rolling Maintenance and Zero-Downtime Updates

Implement maintenance procedures without service interruption:

```javascript
// Zero-downtime maintenance manager
class MaintenanceManager {
  constructor(replicaSetUrl) {
    this.replicaSetUrl = replicaSetUrl;
    this.maintenanceLog = [];
  }

  async performRollingMaintenance(maintenanceConfig) {
    // Perform rolling maintenance across replica set
    console.log('Starting rolling maintenance:', maintenanceConfig);
    
    const maintenanceSession = {
      id: `maintenance_${Date.now()}`,
      startTime: new Date(),
      config: maintenanceConfig,
      steps: [],
      status: 'running'
    };

    try {
      // Step 1: Perform maintenance on secondaries first
      await this.maintainSecondaries(maintenanceSession);
      
      // Step 2: Step down primary and maintain
      await this.maintainPrimary(maintenanceSession);
      
      // Step 3: Verify replica set health
      await this.verifyPostMaintenanceHealth(maintenanceSession);
      
      maintenanceSession.status = 'completed';
      maintenanceSession.endTime = new Date();
      
    } catch (error) {
      maintenanceSession.status = 'failed';
      maintenanceSession.error = error.message;
      maintenanceSession.endTime = new Date();
      
      throw error;
    } finally {
      this.maintenanceLog.push(maintenanceSession);
    }

    return maintenanceSession;
  }

  async maintainSecondaries(maintenanceSession) {
    const client = new MongoClient(this.replicaSetUrl);
    await client.connect();

    try {
      const status = await client.db('admin').command({ replSetGetStatus: 1 });
      const secondaries = status.members.filter(m => m.state === 2);

      for (const secondary of secondaries) {
        console.log(`Maintaining secondary: ${secondary.name}`);
        
        const stepStart = Date.now();
        
        // Remove secondary from replica set temporarily
        await this.removeSecondaryForMaintenance(client, secondary);
        
        // Perform maintenance operations
        await this.performMaintenanceOperations(secondary, maintenanceSession.config);
        
        // Add secondary back to replica set
        await this.addSecondaryAfterMaintenance(client, secondary);
        
        // Wait for secondary to catch up
        await this.waitForSecondaryCatchup(client, secondary.name);
        
        maintenanceSession.steps.push({
          type: 'secondary_maintenance',
          member: secondary.name,
          startTime: new Date(stepStart),
          endTime: new Date(),
          duration: Date.now() - stepStart,
          success: true
        });

        console.log(`Secondary ${secondary.name} maintenance completed`);
      }

    } finally {
      await client.close();
    }
  }

  async maintainPrimary(maintenanceSession) {
    const client = new MongoClient(this.replicaSetUrl);
    await client.connect();

    try {
      const stepStart = Date.now();
      
      // Get current primary
      const status = await client.db('admin').command({ replSetGetStatus: 1 });
      const primary = status.members.find(m => m.state === 1);
      
      if (!primary) {
        throw new Error('No primary found in replica set');
      }

      console.log(`Maintaining primary: ${primary.name}`);
      
      // Step down primary to trigger election
      await client.db('admin').command({
        replSetStepDown: 300, // 5 minutes
        secondaryCatchUpPeriodSecs: 30
      });

      // Wait for new primary to be elected
      await this.waitForNewPrimary(client, primary.name);
      
      // Perform maintenance on the stepped-down primary (now secondary)
      await this.performMaintenanceOperations(primary, maintenanceSession.config);
      
      // Wait for maintenance to complete and node to rejoin
      await this.waitForNodeRejoin(client, primary.name);
      
      maintenanceSession.steps.push({
        type: 'primary_maintenance',
        member: primary.name,
        startTime: new Date(stepStart),
        endTime: new Date(),
        duration: Date.now() - stepStart,
        success: true
      });

      console.log(`Primary ${primary.name} maintenance completed`);

    } finally {
      await client.close();
    }
  }

  async performMaintenanceOperations(member, config) {
    // Simulate maintenance operations
    console.log(`Performing maintenance operations on ${member.name}`);
    
    const operations = [];
    
    if (config.operations.includes('system_update')) {
      operations.push(this.simulateSystemUpdate(member));
    }
    
    if (config.operations.includes('mongodb_upgrade')) {
      operations.push(this.simulateMongoDBUpgrade(member));
    }
    
    if (config.operations.includes('index_rebuild')) {
      operations.push(this.simulateIndexRebuild(member));
    }
    
    if (config.operations.includes('disk_maintenance')) {
      operations.push(this.simulateDiskMaintenance(member));
    }

    // Execute all maintenance operations
    await Promise.all(operations);
    
    console.log(`Maintenance operations completed for ${member.name}`);
  }

  async simulateSystemUpdate(member) {
    console.log(`Applying system updates to ${member.name}`);
    // Simulate system update time
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
  }

  async simulateMongoDBUpgrade(member) {
    console.log(`Upgrading MongoDB on ${member.name}`);
    // Simulate MongoDB upgrade time
    await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute
  }

  async simulateIndexRebuild(member) {
    console.log(`Rebuilding indexes on ${member.name}`);
    // Simulate index rebuild time
    await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes
  }

  async simulateDiskMaintenance(member) {
    console.log(`Performing disk maintenance on ${member.name}`);
    // Simulate disk maintenance time
    await new Promise(resolve => setTimeout(resolve, 45000)); // 45 seconds
  }

  async waitForNewPrimary(client, oldPrimaryName, maxWait = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        const status = await client.db('admin').command({ replSetGetStatus: 1 });
        const primary = status.members.find(m => m.state === 1);
        
        if (primary && primary.name !== oldPrimaryName) {
          console.log(`New primary elected: ${primary.name}`);
          return primary;
        }
        
      } catch (error) {
        console.log('Waiting for primary election...', error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('New primary not elected within timeout');
  }

  async waitForSecondaryCatchup(client, memberName, maxWait = 120000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        const status = await client.db('admin').command({ replSetGetStatus: 1 });
        const member = status.members.find(m => m.name === memberName);
        
        if (member && member.state === 2) { // Secondary state
          const primary = status.members.find(m => m.state === 1);
          if (primary) {
            const lag = primary.optimeDate.getTime() - member.optimeDate.getTime();
            if (lag < 10000) { // Less than 10 seconds lag
              console.log(`${memberName} caught up (lag: ${lag}ms)`);
              return true;
            }
          }
        }
        
      } catch (error) {
        console.log(`Waiting for ${memberName} to catch up...`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error(`${memberName} failed to catch up within timeout`);
  }

  async verifyPostMaintenanceHealth(maintenanceSession) {
    const client = new MongoClient(this.replicaSetUrl);
    await client.connect();

    try {
      const healthCheck = {
        timestamp: new Date(),
        replicaSetStatus: null,
        primaryElected: false,
        allMembersHealthy: false,
        replicationLag: null,
        writeTest: null,
        readTest: null
      };

      // Check replica set status
      const status = await client.db('admin').command({ replSetGetStatus: 1 });
      healthCheck.replicaSetStatus = status.ok === 1 ? 'healthy' : 'unhealthy';
      
      // Check primary election
      const primary = status.members.find(m => m.state === 1);
      healthCheck.primaryElected = !!primary;
      
      // Check member health
      const unhealthyMembers = status.members.filter(m => m.health !== 1);
      healthCheck.allMembersHealthy = unhealthyMembers.length === 0;
      
      // Check replication lag
      if (primary) {
        const secondaries = status.members.filter(m => m.state === 2);
        const maxLag = Math.max(...secondaries.map(s => 
          primary.optimeDate.getTime() - s.optimeDate.getTime()
        ));
        healthCheck.replicationLag = Math.round(maxLag / 1000); // seconds
      }

      // Test write operations
      try {
        await client.db('test').collection('maintenance_test').insertOne({
          test: 'post_maintenance_write',
          timestamp: new Date()
        }, { writeConcern: { w: 'majority', wtimeout: 5000 } });
        
        healthCheck.writeTest = 'passed';
      } catch (error) {
        healthCheck.writeTest = `failed: ${error.message}`;
      }

      // Test read operations
      try {
        await client.db('test').collection('maintenance_test').findOne({
          test: 'post_maintenance_write'
        });
        
        healthCheck.readTest = 'passed';
        
        // Clean up test document
        await client.db('test').collection('maintenance_test').deleteOne({
          test: 'post_maintenance_write'
        });
        
      } catch (error) {
        healthCheck.readTest = `failed: ${error.message}`;
      }

      maintenanceSession.postMaintenanceHealth = healthCheck;
      
      const isHealthy = healthCheck.replicaSetStatus === 'healthy' &&
                       healthCheck.primaryElected &&
                       healthCheck.allMembersHealthy &&
                       healthCheck.replicationLag < 30 &&
                       healthCheck.writeTest === 'passed' &&
                       healthCheck.readTest === 'passed';

      if (!isHealthy) {
        throw new Error(`Post-maintenance health check failed: ${JSON.stringify(healthCheck)}`);
      }

      console.log('Post-maintenance health check passed:', healthCheck);
      return healthCheck;

    } finally {
      await client.close();
    }
  }

  // Utility methods for maintenance operations
  async removeSecondaryForMaintenance(client, secondary) {
    // Temporarily remove secondary from replica set
    console.log(`Removing ${secondary.name} for maintenance`);
    // Implementation would remove member from config
  }

  async addSecondaryAfterMaintenance(client, secondary) {
    // Add secondary back to replica set
    console.log(`Adding ${secondary.name} back after maintenance`);
    // Implementation would add member back to config
  }

  async waitForNodeRejoin(client, memberName, maxWait = 180000) {
    // Wait for node to rejoin and become healthy
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        const status = await client.db('admin').command({ replSetGetStatus: 1 });
        const member = status.members.find(m => m.name === memberName);
        
        if (member && (member.state === 1 || member.state === 2) && member.health === 1) {
          console.log(`${memberName} rejoined as ${member.stateStr}`);
          return true;
        }
        
      } catch (error) {
        console.log(`Waiting for ${memberName} to rejoin...`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error(`${memberName} failed to rejoin within timeout`);
  }
}
```

## SQL-Style High Availability with QueryLeaf

QueryLeaf provides familiar SQL approaches to MongoDB replica set management:

```sql
-- QueryLeaf high availability operations with SQL-style syntax

-- Monitor replica set status
SELECT 
  member_name,
  member_state,
  member_health,
  priority,
  votes,
  CASE member_state
    WHEN 1 THEN 'PRIMARY'
    WHEN 2 THEN 'SECONDARY'  
    WHEN 7 THEN 'ARBITER'
    ELSE 'OTHER'
  END as role_description
FROM REPLICA_SET_STATUS()
ORDER BY member_state, priority DESC;

-- Check replication lag across members
WITH replication_status AS (
  SELECT 
    primary_optime,
    member_name,
    member_optime,
    member_state,
    EXTRACT(EPOCH FROM (primary_optime - member_optime)) as lag_seconds
  FROM REPLICA_SET_STATUS()
  WHERE member_state IN (1, 2) -- Primary and Secondary only
)
SELECT 
  member_name,
  CASE 
    WHEN lag_seconds <= 1 THEN 'Excellent'
    WHEN lag_seconds <= 5 THEN 'Good' 
    WHEN lag_seconds <= 30 THEN 'Acceptable'
    ELSE 'Poor'
  END as replication_health,
  lag_seconds,
  CASE 
    WHEN lag_seconds > 60 THEN 'CRITICAL: High replication lag'
    WHEN lag_seconds > 30 THEN 'WARNING: Monitor replication lag'
    ELSE 'OK'
  END as alert_level
FROM replication_status
WHERE member_state = 2 -- Secondaries only
ORDER BY lag_seconds DESC;

-- High availability connection management
-- QueryLeaf automatically handles connection routing
SELECT 
  customer_id,
  order_date,
  total_amount,
  status
FROM orders 
WITH READ_PREFERENCE = 'secondaryPreferred'
WHERE order_date >= CURRENT_DATE - INTERVAL '7 days'
  AND status = 'pending'
ORDER BY order_date DESC;

-- Critical writes with strong consistency
INSERT INTO financial_transactions (
  account_id,
  transaction_type,
  amount,
  timestamp,
  reference_number
)
VALUES (
  '12345',
  'withdrawal',
  500.00,
  CURRENT_TIMESTAMP,
  'TXN_' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)
)
WITH WRITE_CONCERN = ('w=majority', 'j=true', 'wtimeout=10000');

-- Geographic read routing
SELECT 
  product_id,
  name,
  price,
  inventory_count
FROM products
WITH READ_PREFERENCE = 'secondary',
     TAG_SETS = '[{"region": "us-west"}, {"region": "us-east"}, {}]',
     MAX_STALENESS = 90
WHERE category = 'electronics'
  AND inventory_count > 0;

-- Multi-region write durability
UPDATE customer_profiles
SET last_login = CURRENT_TIMESTAMP,
    login_count = login_count + 1
WHERE customer_id = @customer_id
WITH WRITE_CONCERN = ('w=multiRegion', 'j=true', 'wtimeout=15000');

-- Failover testing and monitoring
WITH failover_metrics AS (
  SELECT 
    test_timestamp,
    test_type,
    failover_duration_ms,
    success,
    old_primary,
    new_primary
  FROM FAILOVER_TEST_RESULTS()
  WHERE test_timestamp >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT 
  test_type,
  COUNT(*) as total_tests,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_tests,
  AVG(failover_duration_ms) as avg_failover_time,
  MIN(failover_duration_ms) as min_failover_time,
  MAX(failover_duration_ms) as max_failover_time,
  ROUND(
    (SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / COUNT(*)) * 100, 
    2
  ) as success_rate_percent
FROM failover_metrics
GROUP BY test_type
ORDER BY success_rate_percent DESC;

-- Maintenance scheduling and coordination
BEGIN;

-- Check replica set health before maintenance
IF EXISTS(
  SELECT 1 FROM REPLICA_SET_STATUS() 
  WHERE member_health != 1 
     OR (member_state = 2 AND replication_lag_seconds > 30)
) 
BEGIN
  ROLLBACK;
  RAISERROR('Replica set unhealthy - maintenance postponed', 16, 1);
  RETURN;
END;

-- Schedule rolling maintenance
EXEC SCHEDULE_MAINTENANCE 
  @maintenance_type = 'rolling_update',
  @operations = 'mongodb_upgrade,index_rebuild',
  @start_time = '2025-09-10 02:00:00 UTC',
  @max_duration_hours = 4,
  @notification_endpoints = 'ops-team@example.com,slack-ops-channel';

COMMIT;

-- Performance monitoring across replica set members
SELECT 
  member_name,
  member_type,
  -- Connection metrics
  active_connections,
  available_connections,
  connections_created_per_second,
  
  -- Operation metrics  
  queries_per_second,
  inserts_per_second,
  updates_per_second,
  deletes_per_second,
  
  -- Resource utilization
  cpu_utilization_percent,
  memory_usage_mb,
  disk_usage_percent,
  network_io_mb_per_second,
  
  -- Replica set specific metrics
  replication_lag_seconds,
  replication_batch_size,
  
  -- Health indicators
  CASE 
    WHEN cpu_utilization_percent > 90 THEN 'CPU_HIGH'
    WHEN memory_usage_mb > memory_limit_mb * 0.9 THEN 'MEMORY_HIGH'
    WHEN disk_usage_percent > 85 THEN 'DISK_HIGH'
    WHEN replication_lag_seconds > 60 THEN 'REPLICATION_LAG'
    WHEN active_connections > available_connections * 0.8 THEN 'CONNECTION_HIGH'
    ELSE 'HEALTHY'
  END as health_status

FROM REPLICA_SET_PERFORMANCE_METRICS()
WHERE sample_timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
ORDER BY 
  CASE member_type WHEN 'PRIMARY' THEN 1 WHEN 'SECONDARY' THEN 2 ELSE 3 END,
  member_name;

-- Automatic failover and recovery tracking
WITH failover_events AS (
  SELECT 
    event_timestamp,
    event_type,
    old_primary,
    new_primary,
    cause,
    recovery_time_seconds,
    data_loss_detected,
    applications_affected
  FROM REPLICA_SET_EVENT_LOG
  WHERE event_type IN ('failover', 'stepdown', 'election')
    AND event_timestamp >= CURRENT_DATE - INTERVAL '90 days'
)
SELECT 
  DATE_TRUNC('week', event_timestamp) as week_start,
  COUNT(*) as total_events,
  SUM(CASE WHEN event_type = 'failover' THEN 1 ELSE 0 END) as failover_count,
  AVG(recovery_time_seconds) as avg_recovery_time,
  SUM(CASE WHEN data_loss_detected THEN 1 ELSE 0 END) as data_loss_events,
  STRING_AGG(DISTINCT cause, ', ') as failure_causes,
  
  -- Calculate availability
  ROUND(
    (1 - (SUM(recovery_time_seconds) / (7 * 24 * 3600))) * 100, 
    4
  ) as weekly_availability_percent

FROM failover_events
GROUP BY DATE_TRUNC('week', event_timestamp)
ORDER BY week_start DESC;

-- QueryLeaf provides comprehensive replica set management:
-- 1. Automatic connection routing based on read preferences
-- 2. Write concern enforcement for data durability
-- 3. Geographic distribution with tag-based routing
-- 4. Built-in failover testing and monitoring
-- 5. Maintenance coordination and scheduling
-- 6. Performance monitoring across all replica set members
-- 7. SQL-familiar syntax for all high availability operations
```

## Best Practices for MongoDB High Availability

### Replica Set Configuration Guidelines

Essential practices for production replica sets:

1. **Odd Number of Voting Members**: Use odd numbers (3, 5, 7) to prevent election ties
2. **Geographic Distribution**: Spread members across availability zones or regions
3. **Appropriate Member Types**: Use arbiters judiciously for voting without data storage
4. **Priority Settings**: Configure priorities to influence primary election preference
5. **Write Concerns**: Choose appropriate write concerns balancing durability and performance
6. **Read Preferences**: Distribute read load while maintaining consistency requirements

### Monitoring and Alerting

Implement comprehensive monitoring for replica sets:

1. **Health Monitoring**: Track member health, state, and connectivity
2. **Replication Lag**: Monitor and alert on excessive replication lag
3. **Performance Metrics**: Track throughput, latency, and resource utilization
4. **Failover Detection**: Automated detection and response to failover events
5. **Capacity Planning**: Monitor growth trends and capacity requirements
6. **Security Monitoring**: Track authentication failures and unauthorized access

## Conclusion

MongoDB replica sets provide enterprise-grade high availability with automatic failover, distributed consensus, and flexible consistency controls. Unlike traditional database clustering solutions that require complex setup and manual intervention, MongoDB replica sets deliver robust availability features as core database functionality.

Key high availability benefits include:

- **Automatic Failover**: Transparent primary election and failover without manual intervention
- **Data Redundancy**: Multiple synchronized copies ensure data protection and availability
- **Geographic Distribution**: Support for multi-region deployments with local read performance
- **Flexible Consistency**: Tunable read and write concerns to balance performance and consistency
- **Zero-Downtime Maintenance**: Rolling updates and maintenance without service interruption

Whether you're building mission-critical applications, global platforms, or systems requiring 99.9%+ availability, MongoDB replica sets with QueryLeaf's familiar SQL interface provide the foundation for robust, highly available database infrastructure. This combination enables you to implement sophisticated availability patterns while preserving familiar administration and query approaches.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB replica set connections, read/write routing, and failover handling while providing SQL-familiar syntax for high availability operations. Complex replica set management, geographic distribution, and consistency controls are seamlessly handled through familiar SQL patterns, making enterprise-grade availability both powerful and accessible.

The integration of automatic high availability with SQL-style administration makes MongoDB an ideal platform for applications requiring both robust availability guarantees and familiar database management patterns, ensuring your high availability strategy remains both effective and maintainable as it scales and evolves.