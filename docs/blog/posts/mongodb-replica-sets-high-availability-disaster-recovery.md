---
title: "MongoDB Replica Sets and High Availability: Advanced Disaster Recovery and Fault Tolerance Strategies for Mission-Critical Applications"
description: "Master MongoDB replica sets for high availability, automatic failover, and disaster recovery. Learn advanced replica set configurations, read preferences, and fault tolerance patterns with SQL-familiar management techniques for resilient database architectures."
date: 2025-10-01
tags: [mongodb, replica-sets, high-availability, disaster-recovery, fault-tolerance, sql, database-architecture]
---

# MongoDB Replica Sets and High Availability: Advanced Disaster Recovery and Fault Tolerance Strategies for Mission-Critical Applications

Mission-critical applications require database infrastructure that can withstand hardware failures, network outages, and data center disasters while maintaining continuous availability and data consistency. Traditional database replication approaches often introduce complexity, performance overhead, and operational challenges that become increasingly problematic as application scale and reliability requirements grow.

MongoDB's replica set architecture provides sophisticated high availability and disaster recovery capabilities that eliminate single points of failure while maintaining strong data consistency and automatic failover functionality. Unlike traditional master-slave replication systems with manual failover processes, MongoDB replica sets offer self-healing infrastructure with intelligent election algorithms, configurable read preferences, and comprehensive disaster recovery features that ensure business continuity even during catastrophic failures.

## The Traditional Database Replication Challenge

Conventional database replication systems have significant limitations for high-availability requirements:

```sql
-- Traditional PostgreSQL streaming replication - manual failover and limited flexibility

-- Primary server configuration (postgresql.conf)
wal_level = replica
max_wal_senders = 3
wal_keep_segments = 64
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/wal_archive/%f'

-- Standby server configuration (recovery.conf)  
standby_mode = 'on'
primary_conninfo = 'host=primary-server port=5432 user=replicator'
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
trigger_file = '/tmp/postgresql.trigger.5432'

-- Manual failover process (complex and error-prone)
-- 1. Detect primary failure through monitoring
SELECT pg_is_in_recovery(); -- Check if server is in standby mode

-- 2. Promote standby to primary (manual intervention required)
-- Touch trigger file on standby server
-- $ touch /tmp/postgresql.trigger.5432

-- 3. Redirect application traffic (requires external load balancer configuration)
-- Update DNS/load balancer to point to new primary
-- Verify all applications can connect to new primary

-- 4. Reconfigure remaining servers (manual process)
-- Update primary_conninfo on other standby servers
-- Restart PostgreSQL services with new configuration

-- Complex query for checking replication lag
WITH replication_status AS (
  SELECT 
    client_addr,
    client_hostname,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    write_lag,
    flush_lag,
    replay_lag,
    sync_priority,
    sync_state,
    
    -- Calculate replication delay in bytes
    pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) as replay_delay_bytes,
    
    -- Check if standby is healthy
    CASE 
      WHEN state = 'streaming' AND pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) < 16777216 THEN 'healthy'
      WHEN state = 'streaming' AND pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) < 134217728 THEN 'lagging'
      WHEN state = 'streaming' THEN 'severely_lagging'
      ELSE 'disconnected'
    END as health_status,
    
    -- Estimate recovery time if primary fails
    CASE 
      WHEN replay_lag IS NOT NULL THEN 
        EXTRACT(EPOCH FROM replay_lag)::int
      ELSE 
        GREATEST(
          EXTRACT(EPOCH FROM flush_lag)::int,
          pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) / 16777216 * 10
        )
    END as estimated_recovery_seconds
    
  FROM pg_stat_replication
  WHERE state IS NOT NULL
),

connection_health AS (
  SELECT 
    datname,
    usename,
    client_addr,
    state,
    query,
    state_change,
    
    -- Connection duration
    EXTRACT(EPOCH FROM (now() - backend_start))::int as connection_age_seconds,
    
    -- Query duration  
    CASE 
      WHEN state = 'active' THEN EXTRACT(EPOCH FROM (now() - query_start))::int
      ELSE 0
    END as active_query_duration_seconds,
    
    -- Identify potentially problematic connections
    CASE
      WHEN state = 'idle in transaction' AND (now() - state_change) > interval '5 minutes' THEN 'long_idle_transaction'
      WHEN state = 'active' AND (now() - query_start) > interval '10 minutes' THEN 'long_running_query'
      WHEN backend_type = 'walsender' THEN 'replication_connection'
      ELSE 'normal'
    END as connection_type
    
  FROM pg_stat_activity
  WHERE backend_type IN ('client backend', 'walsender')
    AND datname IS NOT NULL
)

-- Comprehensive replication monitoring query
SELECT 
  rs.client_addr as standby_server,
  rs.client_hostname as standby_hostname,
  rs.state as replication_state,
  rs.health_status,
  
  -- Lag information
  COALESCE(EXTRACT(EPOCH FROM rs.replay_lag)::int, 0) as replay_lag_seconds,
  ROUND(rs.replay_delay_bytes / 1048576.0, 2) as replay_delay_mb,
  rs.estimated_recovery_seconds,
  
  -- Sync configuration
  rs.sync_priority,
  rs.sync_state,
  
  -- Connection health
  ch.connection_age_seconds,
  ch.active_query_duration_seconds,
  
  -- Health assessment
  CASE 
    WHEN rs.health_status = 'healthy' AND rs.sync_state = 'sync' THEN 'excellent'
    WHEN rs.health_status = 'healthy' AND rs.sync_state = 'async' THEN 'good'
    WHEN rs.health_status = 'lagging' THEN 'warning'
    WHEN rs.health_status = 'severely_lagging' THEN 'critical'
    ELSE 'unknown'
  END as overall_health,
  
  -- Failover readiness
  CASE
    WHEN rs.health_status = 'healthy' AND rs.estimated_recovery_seconds < 30 THEN 'ready'
    WHEN rs.health_status IN ('healthy', 'lagging') AND rs.estimated_recovery_seconds < 120 THEN 'acceptable'
    ELSE 'not_ready'
  END as failover_readiness,
  
  -- Recommendations
  CASE
    WHEN rs.health_status = 'disconnected' THEN 'Check network connectivity and standby server status'
    WHEN rs.health_status = 'severely_lagging' THEN 'Investigate standby performance and network bandwidth'
    WHEN rs.replay_delay_bytes > 134217728 THEN 'Consider increasing wal_keep_segments or using replication slots'
    WHEN rs.sync_state != 'sync' AND rs.sync_priority > 0 THEN 'Review synchronous_standby_names configuration'
    ELSE 'Replication operating normally'
  END as recommendation

FROM replication_status rs
LEFT JOIN connection_health ch ON rs.client_addr = ch.client_addr 
                                AND ch.connection_type = 'replication_connection'
ORDER BY rs.sync_priority DESC, rs.replay_delay_bytes ASC;

-- Problems with traditional PostgreSQL replication:
-- 1. Manual failover process requiring human intervention and expertise
-- 2. Complex configuration management across multiple servers
-- 3. Limited built-in monitoring and health checking capabilities
-- 4. Potential for data loss during failover if not configured properly
-- 5. Application-level connection management complexity
-- 6. No automatic discovery of new primary after failover
-- 7. Split-brain scenarios possible without proper fencing mechanisms
-- 8. Limited geographic distribution capabilities for disaster recovery
-- 9. Difficulty in adding/removing replica servers without downtime
-- 10. Complex backup and point-in-time recovery coordination across replicas

-- Additional monitoring complexity
-- Check for replication slots to prevent WAL accumulation
SELECT 
  slot_name,
  plugin,
  slot_type,
  datoid,
  database,
  temporary,
  active,
  active_pid,
  xmin,
  catalog_xmin,
  restart_lsn,
  confirmed_flush_lsn,
  
  -- Calculate slot lag
  pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) as slot_lag_bytes,
  
  -- Check if slot is causing WAL retention
  CASE 
    WHEN active = false THEN 'inactive_slot'
    WHEN pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) > 1073741824 THEN 'excessive_lag'
    ELSE 'healthy'
  END as slot_status
  
FROM pg_replication_slots
ORDER BY slot_lag_bytes DESC;

-- MySQL replication (even more limited)
-- Master configuration
log-bin=mysql-bin
server-id=1
binlog-format=ROW
sync-binlog=1
innodb-flush-log-at-trx-commit=1

-- Slave configuration  
server-id=2
relay-log=mysql-relay
read-only=1

-- Basic replication status (limited information)
SHOW SLAVE STATUS\G

-- Manual failover process (basic and risky)
STOP SLAVE;
RESET SLAVE ALL;
-- Manually change master configuration

-- MySQL replication limitations:
-- - Even more manual failover process
-- - Limited monitoring and diagnostics
-- - Poor handling of network partitions
-- - Basic conflict resolution
-- - Limited geographic replication support
-- - Minimal built-in health checking
-- - Simple master-slave topology only
```

MongoDB provides comprehensive high availability through replica sets:

```javascript
// MongoDB Replica Sets - automatic failover with advanced high availability features
const { MongoClient } = require('mongodb');

// Advanced MongoDB Replica Set Management and High Availability System
class MongoReplicaSetManager {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.client = null;
    this.db = null;
    
    // High availability configuration
    this.replicaSetConfig = {
      members: [],
      settings: {
        chainingAllowed: true,
        heartbeatIntervalMillis: 2000,
        heartbeatTimeoutSecs: 10,
        electionTimeoutMillis: 10000,
        catchUpTimeoutMillis: 60000,
        getLastErrorModes: {},
        getLastErrorDefaults: { w: 1, wtimeout: 0 }
      }
    };
    
    this.healthMetrics = new Map();
    this.failoverHistory = [];
    this.performanceTargets = {
      maxReplicationLagSeconds: 10,
      maxElectionTimeSeconds: 30,
      minHealthyMembers: 2
    };
  }

  async initializeReplicaSet(members, options = {}) {
    console.log('Initializing MongoDB replica set with advanced high availability...');
    
    const {
      replicaSetName = 'rs0',
      priority = { primary: 1, secondary: 0.5, arbiter: 0 },
      tags = {},
      writeConcern = { w: 'majority', j: true },
      readPreference = 'primaryPreferred'
    } = options;

    try {
      // Connect to the primary candidate
      this.client = new MongoClient(this.connectionString, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        replicaSet: replicaSetName,
        readPreference: readPreference,
        writeConcern: writeConcern,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true
      });

      await this.client.connect();
      this.db = this.client.db('admin');

      // Build replica set configuration
      const replicaSetConfig = {
        _id: replicaSetName,
        version: 1,
        members: members.map((member, index) => ({
          _id: index,
          host: member.host,
          priority: member.priority || priority[member.type] || 1,
          votes: member.type === 'arbiter' ? 1 : 1,
          arbiterOnly: member.type === 'arbiter',
          buildIndexes: member.type !== 'arbiter',
          hidden: member.hidden || false,
          slaveDelay: member.slaveDelay || 0,
          tags: { ...tags[member.type], region: member.region, datacenter: member.datacenter }
        })),
        settings: {
          chainingAllowed: true,
          heartbeatIntervalMillis: 2000,
          heartbeatTimeoutSecs: 10,
          electionTimeoutMillis: 10000,
          catchUpTimeoutMillis: 60000,
          
          // Advanced write concern configurations
          getLastErrorModes: {
            multiDataCenter: { datacenter: 2 },
            majority: { region: 2 }
          },
          getLastErrorDefaults: { 
            w: 'majority', 
            j: true,
            wtimeout: 10000 
          }
        }
      };

      // Initialize replica set
      const initResult = await this.db.runCommand({
        replSetInitiate: replicaSetConfig
      });

      if (initResult.ok === 1) {
        console.log('Replica set initialized successfully');
        
        // Wait for primary election
        await this.waitForPrimaryElection();
        
        // Perform initial health check
        const healthStatus = await this.performHealthCheck();
        
        // Setup monitoring
        await this.setupAdvancedMonitoring();
        
        console.log('Replica set ready for high availability operations');
        return {
          success: true,
          replicaSetName: replicaSetName,
          members: members,
          healthStatus: healthStatus
        };
      } else {
        throw new Error(`Replica set initialization failed: ${initResult.errmsg}`);
      }

    } catch (error) {
      console.error('Replica set initialization error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async performComprehensiveHealthCheck() {
    console.log('Performing comprehensive replica set health assessment...');
    
    const healthReport = {
      timestamp: new Date(),
      replicaSetStatus: null,
      memberHealth: [],
      replicationLag: {},
      electionMetrics: {},
      networkConnectivity: {},
      performanceMetrics: {},
      alerts: [],
      recommendations: []
    };

    try {
      // Get replica set status
      const rsStatus = await this.db.runCommand({ replSetGetStatus: 1 });
      healthReport.replicaSetStatus = {
        name: rsStatus.set,
        primary: rsStatus.members.find(m => m.state === 1)?.name,
        memberCount: rsStatus.members.length,
        healthyMembers: rsStatus.members.filter(m => [1, 2, 7].includes(m.state)).length,
        state: rsStatus.myState
      };

      // Analyze each member
      for (const member of rsStatus.members) {
        const memberHealth = {
          name: member.name,
          state: member.state,
          stateStr: member.stateStr,
          health: member.health,
          uptime: member.uptime,
          lastHeartbeat: member.lastHeartbeat,
          lastHeartbeatRecv: member.lastHeartbeatRecv,
          pingMs: member.pingMs,
          syncSourceHost: member.syncingTo,
          
          // Calculate replication lag
          replicationLag: member.optimeDate && rsStatus.date ? 
            (rsStatus.date - member.optimeDate) / 1000 : null,
          
          // Member status assessment
          status: this.assessMemberStatus(member),
          
          // Performance metrics
          performanceMetrics: {
            heartbeatLatency: member.pingMs,
            connectionHealth: member.health === 1 ? 'healthy' : 'unhealthy',
            stateStability: this.assessStateStability(member)
          }
        };

        healthReport.memberHealth.push(memberHealth);
        
        // Track replication lag
        if (memberHealth.replicationLag !== null) {
          healthReport.replicationLag[member.name] = memberHealth.replicationLag;
        }
      }

      // Analyze election metrics
      healthReport.electionMetrics = await this.analyzeElectionMetrics(rsStatus);
      
      // Check network connectivity
      healthReport.networkConnectivity = await this.checkNetworkConnectivity(rsStatus.members);
      
      // Generate alerts based on thresholds
      healthReport.alerts = this.generateHealthAlerts(healthReport);
      
      // Generate recommendations
      healthReport.recommendations = this.generateHealthRecommendations(healthReport);
      
      console.log(`Health check completed: ${healthReport.memberHealth.length} members analyzed`);
      console.log(`Healthy members: ${healthReport.replicaSetStatus.healthyMembers}/${healthReport.replicaSetStatus.memberCount}`);
      console.log(`Alerts generated: ${healthReport.alerts.length}`);
      
      return healthReport;

    } catch (error) {
      console.error('Health check failed:', error);
      healthReport.error = error.message;
      return healthReport;
    }
  }

  assessMemberStatus(member) {
    const status = {
      overall: 'unknown',
      issues: [],
      strengths: []
    };

    // State-based assessment
    switch (member.state) {
      case 1: // PRIMARY
        status.overall = 'primary';
        status.strengths.push('Acting as primary, accepting writes');
        break;
      case 2: // SECONDARY
        status.overall = 'healthy';
        status.strengths.push('Healthy secondary, replicating data');
        if (member.optimeDate && Date.now() - member.optimeDate > 30000) {
          status.issues.push('Replication lag exceeds 30 seconds');
          status.overall = 'lagging';
        }
        break;
      case 3: // RECOVERING
        status.overall = 'recovering';
        status.issues.push('Member is in recovery state');
        break;
      case 5: // STARTUP2
        status.overall = 'starting';
        status.issues.push('Member is in startup phase');
        break;
      case 6: // UNKNOWN
        status.overall = 'unknown';
        status.issues.push('Member state is unknown');
        break;
      case 7: // ARBITER
        status.overall = 'arbiter';
        status.strengths.push('Functioning arbiter for elections');
        break;
      case 8: // DOWN
        status.overall = 'down';
        status.issues.push('Member is down or unreachable');
        break;
      case 9: // ROLLBACK
        status.overall = 'rollback';
        status.issues.push('Member is performing rollback');
        break;
      case 10: // REMOVED
        status.overall = 'removed';
        status.issues.push('Member has been removed from replica set');
        break;
      default:
        status.overall = 'unknown';
        status.issues.push(`Unexpected state: ${member.state}`);
    }

    // Health-based assessment
    if (member.health !== 1) {
      status.issues.push('Member health check failing');
      if (status.overall === 'healthy') {
        status.overall = 'unhealthy';
      }
    }

    // Network latency assessment
    if (member.pingMs && member.pingMs > 100) {
      status.issues.push(`High network latency: ${member.pingMs}ms`);
    } else if (member.pingMs && member.pingMs < 10) {
      status.strengths.push(`Low network latency: ${member.pingMs}ms`);
    }

    return status;
  }

  async implementAutomaticFailoverTesting() {
    console.log('Implementing automatic failover testing and validation...');
    
    const failoverTest = {
      testId: require('crypto').randomUUID(),
      timestamp: new Date(),
      phases: [],
      results: {
        success: false,
        totalTimeMs: 0,
        electionTimeMs: 0,
        dataConsistencyVerified: false,
        applicationConnectivityRestored: false
      }
    };

    try {
      // Phase 1: Pre-failover health check
      console.log('Phase 1: Pre-failover health assessment...');
      const preFailoverHealth = await this.performComprehensiveHealthCheck();
      failoverTest.phases.push({
        phase: 'pre_failover_health',
        timestamp: new Date(),
        status: 'completed',
        data: preFailoverHealth
      });

      if (preFailoverHealth.replicaSetStatus.healthyMembers < this.performanceTargets.minHealthyMembers + 1) {
        throw new Error('Insufficient healthy members for safe failover testing');
      }

      // Phase 2: Insert test data for consistency verification
      console.log('Phase 2: Inserting test data for consistency verification...');
      const testCollection = this.client.db('failover_test').collection('consistency_check');
      const testDocuments = Array.from({ length: 100 }, (_, i) => ({
        _id: `failover_test_${failoverTest.testId}_${i}`,
        timestamp: new Date(),
        sequenceNumber: i,
        testData: `Failover test data ${i}`,
        checksum: require('crypto').createHash('md5').update(`test_${i}`).digest('hex')
      }));

      await testCollection.insertMany(testDocuments, { writeConcern: { w: 'majority', j: true } });
      failoverTest.phases.push({
        phase: 'test_data_insertion',
        timestamp: new Date(),
        status: 'completed',
        data: { documentsInserted: testDocuments.length }
      });

      // Phase 3: Simulate primary failure (step down primary)
      console.log('Phase 3: Simulating primary failure...');
      const startTime = Date.now();
      
      await this.db.runCommand({ replSetStepDown: 60, force: true });
      
      failoverTest.phases.push({
        phase: 'primary_step_down',
        timestamp: new Date(),
        status: 'completed',
        data: { stepDownInitiated: true }
      });

      // Phase 4: Wait for new primary election
      console.log('Phase 4: Waiting for new primary election...');
      const electionStartTime = Date.now();
      
      const newPrimary = await this.waitForPrimaryElection(30000); // 30 second timeout
      const electionEndTime = Date.now();
      
      failoverTest.results.electionTimeMs = electionEndTime - electionStartTime;
      
      failoverTest.phases.push({
        phase: 'primary_election',
        timestamp: new Date(),
        status: 'completed',
        data: { 
          newPrimary: newPrimary,
          electionTimeMs: failoverTest.results.electionTimeMs
        }
      });

      // Phase 5: Verify data consistency
      console.log('Phase 5: Verifying data consistency...');
      
      // Reconnect to new primary
      await this.client.close();
      this.client = new MongoClient(this.connectionString, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        readPreference: 'primary'
      });
      await this.client.connect();
      
      const verificationCollection = this.client.db('failover_test').collection('consistency_check');
      const retrievedDocs = await verificationCollection.find({
        _id: { $regex: `^failover_test_${failoverTest.testId}_` }
      }).toArray();

      const consistencyCheck = {
        expectedCount: testDocuments.length,
        retrievedCount: retrievedDocs.length,
        dataIntegrityVerified: true,
        checksumMatches: 0
      };

      // Verify checksums
      for (const doc of retrievedDocs) {
        const expectedChecksum = require('crypto').createHash('md5')
          .update(`test_${doc.sequenceNumber}`).digest('hex');
        if (doc.checksum === expectedChecksum) {
          consistencyCheck.checksumMatches++;
        }
      }

      consistencyCheck.dataIntegrityVerified = 
        consistencyCheck.expectedCount === consistencyCheck.retrievedCount &&
        consistencyCheck.checksumMatches === consistencyCheck.expectedCount;

      failoverTest.results.dataConsistencyVerified = consistencyCheck.dataIntegrityVerified;

      failoverTest.phases.push({
        phase: 'data_consistency_verification',
        timestamp: new Date(),
        status: 'completed',
        data: consistencyCheck
      });

      // Phase 6: Test application connectivity
      console.log('Phase 6: Testing application connectivity...');
      
      try {
        // Simulate application operations
        await verificationCollection.insertOne({
          _id: `post_failover_${failoverTest.testId}`,
          timestamp: new Date(),
          message: 'Post-failover connectivity test'
        }, { writeConcern: { w: 'majority' } });

        const postFailoverDoc = await verificationCollection.findOne({
          _id: `post_failover_${failoverTest.testId}`
        });

        failoverTest.results.applicationConnectivityRestored = postFailoverDoc !== null;

      } catch (error) {
        console.error('Application connectivity test failed:', error);
        failoverTest.results.applicationConnectivityRestored = false;
      }

      failoverTest.phases.push({
        phase: 'application_connectivity_test',
        timestamp: new Date(),
        status: failoverTest.results.applicationConnectivityRestored ? 'completed' : 'failed',
        data: { connectivityRestored: failoverTest.results.applicationConnectivityRestored }
      });

      // Phase 7: Post-failover health check
      console.log('Phase 7: Post-failover health assessment...');
      const postFailoverHealth = await this.performComprehensiveHealthCheck();
      failoverTest.phases.push({
        phase: 'post_failover_health',
        timestamp: new Date(),
        status: 'completed',
        data: postFailoverHealth
      });

      // Calculate total test time
      failoverTest.results.totalTimeMs = Date.now() - startTime;
      
      // Determine overall success
      failoverTest.results.success = 
        failoverTest.results.electionTimeMs <= (this.performanceTargets.maxElectionTimeSeconds * 1000) &&
        failoverTest.results.dataConsistencyVerified &&
        failoverTest.results.applicationConnectivityRestored &&
        postFailoverHealth.replicaSetStatus.healthyMembers >= this.performanceTargets.minHealthyMembers;

      // Cleanup test data
      await verificationCollection.deleteMany({
        _id: { $regex: `^(failover_test_${failoverTest.testId}_|post_failover_${failoverTest.testId})` }
      });

      console.log(`Failover test completed: ${failoverTest.results.success ? 'SUCCESS' : 'PARTIAL_SUCCESS'}`);
      console.log(`Total failover time: ${failoverTest.results.totalTimeMs}ms`);
      console.log(`Election time: ${failoverTest.results.electionTimeMs}ms`);
      console.log(`Data consistency: ${failoverTest.results.dataConsistencyVerified ? 'VERIFIED' : 'FAILED'}`);
      console.log(`Application connectivity: ${failoverTest.results.applicationConnectivityRestored ? 'RESTORED' : 'FAILED'}`);

      // Record failover test in history
      this.failoverHistory.push(failoverTest);

      return failoverTest;

    } catch (error) {
      console.error('Failover test failed:', error);
      failoverTest.phases.push({
        phase: 'error',
        timestamp: new Date(),
        status: 'failed',
        error: error.message
      });
      failoverTest.results.success = false;
      return failoverTest;
    }
  }

  async setupAdvancedReadPreferences(applications) {
    console.log('Setting up advanced read preferences for optimal performance...');
    
    const readPreferenceConfigurations = {
      // Real-time dashboard - prefer primary for latest data
      realtime_dashboard: {
        readPreference: 'primary',
        maxStalenessSeconds: 0,
        tags: [],
        description: 'Real-time data requires primary reads',
        useCase: 'Live dashboards, real-time analytics'
      },

      // Reporting queries - can use secondaries with some lag tolerance
      reporting_analytics: {
        readPreference: 'secondaryPreferred',
        maxStalenessSeconds: 30,
        tags: [{ region: 'us-east', workload: 'analytics' }],
        description: 'Analytics workload can tolerate slight lag',
        useCase: 'Business intelligence, historical reports'
      },

      // Geographically distributed reads
      geographic_reads: {
        readPreference: 'nearest',
        maxStalenessSeconds: 60,
        tags: [],
        description: 'Prioritize network proximity for user-facing reads',
        useCase: 'User-facing applications, content delivery'
      },

      // Heavy analytical workloads
      heavy_analytics: {
        readPreference: 'secondary',
        maxStalenessSeconds: 120,
        tags: [{ workload: 'analytics', ssd: 'true' }],
        description: 'Dedicated secondary for heavy analytical queries',
        useCase: 'Data mining, complex aggregations, ML training'
      },

      // Backup and archival operations
      backup_operations: {
        readPreference: 'secondary',
        maxStalenessSeconds: 300,
        tags: [{ backup: 'true', priority: 'low' }],
        description: 'Use dedicated backup secondary',
        useCase: 'Backup operations, data archival, compliance exports'
      }
    };

    const clientConfigurations = {};

    for (const [appName, app] of Object.entries(applications)) {
      const config = readPreferenceConfigurations[app.readPattern] || readPreferenceConfigurations.geographic_reads;
      
      console.log(`Configuring read preferences for ${appName}:`);
      console.log(`  Pattern: ${app.readPattern}`);
      console.log(`  Read Preference: ${config.readPreference}`);
      console.log(`  Max Staleness: ${config.maxStalenessSeconds}s`);
      
      clientConfigurations[appName] = {
        connectionString: this.buildConnectionString(config),
        readPreference: config.readPreference,
        readPreferenceTags: config.tags,
        maxStalenessSeconds: config.maxStalenessSeconds,
        
        // Additional client options for optimization
        options: {
          maxPoolSize: app.connectionPoolSize || 10,
          minPoolSize: app.minConnectionPoolSize || 2,
          maxIdleTimeMS: 30000,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          connectTimeoutMS: 10000,
          
          // Retry configuration
          retryWrites: true,
          retryReads: true,
          
          // Write concern based on application requirements
          writeConcern: app.writeConcern || { w: 'majority', j: true },
          
          // Read concern for consistency requirements
          readConcern: { level: app.readConcern || 'majority' }
        },

        // Monitoring configuration
        monitoring: {
          commandMonitoring: true,
          serverMonitoring: true,
          topologyMonitoring: true
        },

        description: config.description,
        useCase: config.useCase,
        optimizationTips: this.generateReadOptimizationTips(config, app)
      };
    }

    // Setup monitoring for read preference effectiveness
    await this.setupReadPreferenceMonitoring(clientConfigurations);

    console.log(`Read preference configurations created for ${Object.keys(clientConfigurations).length} applications`);
    
    return clientConfigurations;
  }

  async implementDisasterRecoveryProcedures(options = {}) {
    console.log('Implementing comprehensive disaster recovery procedures...');
    
    const {
      backupSchedule = 'daily',
      retentionPolicy = { daily: 7, weekly: 4, monthly: 6 },
      geographicDistribution = true,
      automaticFailback = false,
      rtoTarget = 300, // Recovery Time Objective in seconds
      rpoTarget = 60   // Recovery Point Objective in seconds
    } = options;

    const disasterRecoveryPlan = {
      backupStrategy: await this.implementBackupStrategy(backupSchedule, retentionPolicy),
      failoverProcedures: await this.implementFailoverProcedures(rtoTarget),
      recoveryValidation: await this.implementRecoveryValidation(),
      monitoringAndAlerting: await this.setupDisasterRecoveryMonitoring(),
      documentationAndRunbooks: await this.generateDisasterRecoveryRunbooks(),
      testingSchedule: await this.createDisasterRecoveryTestSchedule()
    };

    // Geographic distribution setup
    if (geographicDistribution) {
      disasterRecoveryPlan.geographicDistribution = await this.setupGeographicDistribution();
    }

    // Automatic failback configuration
    if (automaticFailback) {
      disasterRecoveryPlan.automaticFailback = await this.configureAutomaticFailback();
    }

    console.log('Disaster recovery procedures implemented successfully');
    return disasterRecoveryPlan;
  }

  async implementBackupStrategy(schedule, retentionPolicy) {
    console.log('Implementing comprehensive backup strategy...');
    
    const backupStrategy = {
      hotBackups: {
        enabled: true,
        schedule: schedule,
        method: 'mongodump_with_oplog',
        compression: true,
        encryption: true,
        storageLocation: ['local', 's3', 'gcs'],
        retentionPolicy: retentionPolicy
      },
      
      continuousBackup: {
        enabled: true,
        oplogTailing: true,
        changeStreams: true,
        pointInTimeRecovery: true,
        maxRecoveryWindow: '7 days'
      },
      
      consistencyChecks: {
        enabled: true,
        frequency: 'daily',
        validationMethods: ['checksum', 'document_count', 'index_integrity']
      },
      
      crossRegionReplication: {
        enabled: true,
        regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
        replicationLag: '< 60 seconds'
      }
    };

    // Implement backup automation
    const backupJobs = await this.createAutomatedBackupJobs(backupStrategy);
    
    return {
      ...backupStrategy,
      automationJobs: backupJobs,
      estimatedRPO: this.calculateEstimatedRPO(backupStrategy),
      storageRequirements: this.calculateStorageRequirements(backupStrategy)
    };
  }

  async waitForPrimaryElection(timeoutMs = 30000) {
    console.log('Waiting for primary election...');
    
    const startTime = Date.now();
    const pollInterval = 1000; // Check every second

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.db.runCommand({ replSetGetStatus: 1 });
        const primary = status.members.find(member => member.state === 1);
        
        if (primary) {
          console.log(`Primary elected: ${primary.name}`);
          return primary.name;
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        // Connection might be lost during election, continue polling
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    throw new Error(`Primary election timeout after ${timeoutMs}ms`);
  }

  generateHealthAlerts(healthReport) {
    const alerts = [];

    // Check for unhealthy members
    const unhealthyMembers = healthReport.memberHealth.filter(m => 
      ['unhealthy', 'down', 'unknown'].includes(m.status.overall)
    );
    
    if (unhealthyMembers.length > 0) {
      alerts.push({
        severity: 'HIGH',
        type: 'UNHEALTHY_MEMBERS',
        message: `${unhealthyMembers.length} replica set members are unhealthy`,
        members: unhealthyMembers.map(m => m.name),
        impact: 'Reduced fault tolerance and potential for data inconsistency'
      });
    }

    // Check replication lag
    const laggedMembers = Object.entries(healthReport.replicationLag)
      .filter(([, lag]) => lag > this.performanceTargets.maxReplicationLagSeconds);
    
    if (laggedMembers.length > 0) {
      alerts.push({
        severity: 'MEDIUM',
        type: 'REPLICATION_LAG',
        message: `${laggedMembers.length} members have excessive replication lag`,
        details: Object.fromEntries(laggedMembers),
        impact: 'Potential data loss during failover'
      });
    }

    // Check minimum healthy members threshold
    if (healthReport.replicaSetStatus.healthyMembers < this.performanceTargets.minHealthyMembers) {
      alerts.push({
        severity: 'CRITICAL',
        type: 'INSUFFICIENT_HEALTHY_MEMBERS',
        message: `Only ${healthReport.replicaSetStatus.healthyMembers} healthy members (minimum: ${this.performanceTargets.minHealthyMembers})`,
        impact: 'Risk of complete service outage if another member fails'
      });
    }

    return alerts;
  }

  generateHealthRecommendations(healthReport) {
    const recommendations = [];

    // Analyze member distribution
    const membersByState = healthReport.memberHealth.reduce((acc, member) => {
      acc[member.stateStr] = (acc[member.stateStr] || 0) + 1;
      return acc;
    }, {});

    if (membersByState.SECONDARY < 2) {
      recommendations.push({
        priority: 'HIGH',
        category: 'REDUNDANCY',
        recommendation: 'Add additional secondary members for better fault tolerance',
        reasoning: 'Minimum of 2 secondary members recommended for high availability',
        implementation: 'Use rs.add() to add new replica set members'
      });
    }

    // Check for arbiter usage
    if (membersByState.ARBITER > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'ARCHITECTURE',
        recommendation: 'Consider replacing arbiters with data-bearing members',
        reasoning: 'Data-bearing members provide better fault tolerance than arbiters',
        implementation: 'Add data-bearing member and remove arbiter when safe'
      });
    }

    // Check geographic distribution
    const regions = new Set(healthReport.memberHealth
      .map(m => m.tags?.region)
      .filter(r => r)
    );
    
    if (regions.size < 2) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'DISASTER_RECOVERY',
        recommendation: 'Implement geographic distribution of replica set members',
        reasoning: 'Multi-region deployment protects against datacenter-level failures',
        implementation: 'Deploy members across multiple availability zones or regions'
      });
    }

    return recommendations;
  }

  buildConnectionString(config) {
    // Build MongoDB connection string with read preference options
    const params = new URLSearchParams();
    
    params.append('readPreference', config.readPreference);
    
    if (config.maxStalenessSeconds > 0) {
      params.append('maxStalenessSeconds', config.maxStalenessSeconds.toString());
    }
    
    if (config.tags && config.tags.length > 0) {
      config.tags.forEach((tag, index) => {
        Object.entries(tag).forEach(([key, value]) => {
          params.append(`readPreferenceTags[${index}][${key}]`, value);
        });
      });
    }

    return `${this.connectionString}?${params.toString()}`;
  }

  generateReadOptimizationTips(config, app) {
    const tips = [];

    if (config.readPreference === 'secondary' || config.readPreference === 'secondaryPreferred') {
      tips.push('Consider using connection pooling to maintain connections to multiple secondaries');
      tips.push('Monitor secondary lag to ensure data freshness meets application requirements');
    }

    if (config.maxStalenessSeconds > 60) {
      tips.push('Verify that application logic can handle potentially stale data');
      tips.push('Implement application-level caching for frequently accessed but slow-changing data');
    }

    if (app.queryTypes && app.queryTypes.includes('aggregation')) {
      tips.push('Heavy aggregation workloads benefit from dedicated secondary members with optimized hardware');
      tips.push('Consider using $merge or $out stages to pre-compute results on secondaries');
    }

    return tips;
  }

  async createAutomatedBackupJobs(backupStrategy) {
    // Implementation would create actual backup automation
    // This is a simplified representation
    return {
      dailyHotBackup: {
        schedule: '0 2 * * *', // 2 AM daily
        retention: backupStrategy.hotBackups.retentionPolicy.daily,
        enabled: true
      },
      continuousOplogBackup: {
        enabled: backupStrategy.continuousBackup.enabled,
        method: 'changeStreams'
      },
      weeklyFullBackup: {
        schedule: '0 1 * * 0', // 1 AM Sunday
        retention: backupStrategy.hotBackups.retentionPolicy.weekly,
        enabled: true
      }
    };
  }

  calculateEstimatedRPO(backupStrategy) {
    if (backupStrategy.continuousBackup.enabled) {
      return '< 1 minute'; // With oplog tailing
    } else {
      return '24 hours'; // With daily backups only
    }
  }

  calculateStorageRequirements(backupStrategy) {
    // Simplified storage calculation
    return {
      daily: 'Database size × compression ratio × daily retention',
      weekly: 'Database size × compression ratio × weekly retention', 
      monthly: 'Database size × compression ratio × monthly retention',
      estimated: 'Contact administrator for detailed storage analysis'
    };
  }

  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

// Benefits of MongoDB Replica Sets:
// - Automatic failover with intelligent primary election algorithms
// - Strong consistency with configurable write and read concerns
// - Geographic distribution support for disaster recovery
// - Built-in health monitoring and self-healing capabilities
// - Flexible read preference configuration for performance optimization
// - Comprehensive backup and point-in-time recovery options
// - Zero-downtime member addition and removal
// - Advanced replication monitoring and alerting
// - Split-brain prevention through majority-based decisions
// - SQL-compatible high availability management through QueryLeaf integration

module.exports = {
  MongoReplicaSetManager
};
```

## Understanding MongoDB Replica Set Architecture

### Advanced High Availability Patterns and Strategies

Implement sophisticated replica set configurations for production environments:

```javascript
// Advanced replica set patterns for enterprise deployments
class EnterpriseReplicaSetManager extends MongoReplicaSetManager {
  constructor(connectionString, enterpriseConfig) {
    super(connectionString);
    
    this.enterpriseConfig = {
      multiRegionDeployment: true,
      dedicatedAnalyticsNodes: true,
      priorityBasedElections: true,
      customWriteConcerns: true,
      advancedMonitoring: true,
      ...enterpriseConfig
    };
    
    this.deploymentTopology = new Map();
    this.performanceOptimizations = new Map();
  }

  async deployGeographicallyDistributedReplicaSet(regions) {
    console.log('Deploying geographically distributed replica set...');
    
    const topology = {
      regions: regions,
      memberDistribution: this.calculateOptimalMemberDistribution(regions),
      networkLatencyMatrix: await this.measureInterRegionLatency(regions),
      failoverStrategy: this.designFailoverStrategy(regions)
    };

    // Configure members with geographic awareness
    const members = [];
    let memberIndex = 0;
    
    for (const region of regions) {
      const regionConfig = topology.memberDistribution[region.name];
      
      for (let i = 0; i < regionConfig.dataMembers; i++) {
        members.push({
          _id: memberIndex++,
          host: `${region.name}-data-${i}.${region.domain}:27017`,
          priority: regionConfig.priority,
          votes: 1,
          tags: {
            region: region.name,
            datacenter: region.datacenter,
            nodeType: 'data',
            ssd: 'true',
            workload: i === 0 ? 'primary' : 'secondary'
          }
        });
      }
      
      // Add analytics-dedicated members
      if (regionConfig.analyticsMembers > 0) {
        for (let i = 0; i < regionConfig.analyticsMembers; i++) {
          members.push({
            _id: memberIndex++,
            host: `${region.name}-analytics-${i}.${region.domain}:27017`,
            priority: 0, // Never become primary
            votes: 1,
            tags: {
              region: region.name,
              datacenter: region.datacenter,
              nodeType: 'analytics',
              workload: 'analytics',
              ssd: 'true'
            },
            hidden: true // Hidden from application discovery
          });
        }
      }
      
      // Add arbiter if needed for odd number of voting members
      if (regionConfig.needsArbiter) {
        members.push({
          _id: memberIndex++,
          host: `${region.name}-arbiter.${region.domain}:27017`,
          arbiterOnly: true,
          priority: 0,
          votes: 1,
          tags: {
            region: region.name,
            datacenter: region.datacenter,
            nodeType: 'arbiter'
          }
        });
      }
    }

    // Configure advanced settings for geographic distribution
    const replicaSetConfig = {
      _id: 'global-rs',
      version: 1,
      members: members,
      settings: {
        chainingAllowed: true,
        heartbeatIntervalMillis: 2000,
        heartbeatTimeoutSecs: 10,
        electionTimeoutMillis: 10000,
        catchUpTimeoutMillis: 60000,
        
        // Custom write concerns for multi-region safety
        getLastErrorModes: {
          // Require writes to be acknowledged by majority in each region
          multiRegion: Object.fromEntries(
            regions.map(r => [r.name, 1])
          ),
          // Require acknowledgment from majority of data centers
          multiDataCenter: { datacenter: Math.ceil(regions.length / 2) },
          // For critical operations, require all regions
          allRegions: Object.fromEntries(
            regions.map(r => [r.name, 1])
          )
        },
        
        getLastErrorDefaults: {
          w: 'multiRegion',
          j: true,
          wtimeout: 15000 // Higher timeout for geographic distribution
        }
      }
    };

    // Initialize the distributed replica set
    const initResult = await this.initializeReplicaSet(members, {
      replicaSetName: 'global-rs',
      writeConcern: { w: 'multiRegion', j: true },
      readPreference: 'primaryPreferred'
    });

    if (initResult.success) {
      // Configure regional read preferences
      await this.configureRegionalReadPreferences(regions);
      
      // Setup cross-region monitoring
      await this.setupCrossRegionMonitoring(regions);
      
      // Validate network connectivity and latency
      await this.validateCrossRegionConnectivity(regions);
    }

    return {
      topology: topology,
      replicaSetConfig: replicaSetConfig,
      initResult: initResult,
      optimizations: await this.generateGlobalOptimizations(topology)
    };
  }

  async implementZeroDowntimeMaintenance(maintenancePlan) {
    console.log('Implementing zero-downtime maintenance procedures...');
    
    const maintenance = {
      planId: require('crypto').randomUUID(),
      startTime: new Date(),
      phases: [],
      rollbackPlan: null,
      success: false
    };

    try {
      // Phase 1: Pre-maintenance health check
      const preMaintenanceHealth = await this.performComprehensiveHealthCheck();
      
      if (preMaintenanceHealth.alerts.some(alert => alert.severity === 'CRITICAL')) {
        throw new Error('Cannot perform maintenance: critical health issues detected');
      }
      
      maintenance.phases.push({
        phase: 'pre_maintenance_health_check',
        status: 'completed',
        timestamp: new Date(),
        data: { healthyMembers: preMaintenanceHealth.replicaSetStatus.healthyMembers }
      });

      // Phase 2: Create maintenance plan execution order
      const executionOrder = this.createMaintenanceExecutionOrder(maintenancePlan, preMaintenanceHealth);
      
      maintenance.phases.push({
        phase: 'execution_order_planning',
        status: 'completed',
        timestamp: new Date(),
        data: { executionOrder: executionOrder }
      });

      // Phase 3: Execute maintenance on each member
      for (const step of executionOrder) {
        console.log(`Executing maintenance step: ${step.description}`);
        
        const stepResult = await this.executeMaintenanceStep(step);
        
        maintenance.phases.push({
          phase: `maintenance_step_${step.memberId}`,
          status: stepResult.success ? 'completed' : 'failed',
          timestamp: new Date(),
          data: stepResult
        });

        if (!stepResult.success && step.critical) {
          throw new Error(`Critical maintenance step failed: ${step.description}`);
        }

        // Wait for member to rejoin and catch up
        if (stepResult.requiresRejoin) {
          await this.waitForMemberRecovery(step.memberId, 300000); // 5 minute timeout
        }

        // Validate cluster health before proceeding
        const intermediateHealth = await this.performComprehensiveHealthCheck();
        if (intermediateHealth.replicaSetStatus.healthyMembers < this.performanceTargets.minHealthyMembers) {
          throw new Error('Insufficient healthy members to continue maintenance');
        }
      }

      // Phase 4: Post-maintenance validation
      const postMaintenanceHealth = await this.performComprehensiveHealthCheck();
      const validationResult = await this.validateMaintenanceCompletion(maintenancePlan, postMaintenanceHealth);
      
      maintenance.phases.push({
        phase: 'post_maintenance_validation',
        status: validationResult.success ? 'completed' : 'failed',
        timestamp: new Date(),
        data: validationResult
      });

      maintenance.success = validationResult.success;
      maintenance.endTime = new Date();
      maintenance.totalDurationMs = maintenance.endTime - maintenance.startTime;

      console.log(`Zero-downtime maintenance ${maintenance.success ? 'completed successfully' : 'completed with issues'}`);
      console.log(`Total duration: ${maintenance.totalDurationMs}ms`);

      return maintenance;

    } catch (error) {
      console.error('Maintenance procedure failed:', error);
      
      maintenance.phases.push({
        phase: 'error',
        status: 'failed',
        timestamp: new Date(),
        error: error.message
      });

      // Attempt rollback if configured
      if (maintenance.rollbackPlan) {
        console.log('Attempting rollback...');
        const rollbackResult = await this.executeRollback(maintenance.rollbackPlan);
        maintenance.rollback = rollbackResult;
      }

      maintenance.success = false;
      maintenance.endTime = new Date();
      return maintenance;
    }
  }

  calculateOptimalMemberDistribution(regions) {
    const totalRegions = regions.length;
    const distribution = {};

    if (totalRegions === 1) {
      // Single region deployment
      distribution[regions[0].name] = {
        dataMembers: 3,
        analyticsMembers: 1,
        priority: 1,
        needsArbiter: false
      };
    } else if (totalRegions === 2) {
      // Two region deployment - need arbiter for odd voting members
      distribution[regions[0].name] = {
        dataMembers: 2,
        analyticsMembers: 1,
        priority: 1,
        needsArbiter: false
      };
      distribution[regions[1].name] = {
        dataMembers: 2,
        analyticsMembers: 1,
        priority: 0.5,
        needsArbiter: true // Add arbiter to prevent split-brain
      };
    } else if (totalRegions >= 3) {
      // Multi-region deployment with primary preference
      const primaryRegion = regions[0];
      distribution[primaryRegion.name] = {
        dataMembers: 2,
        analyticsMembers: 1,
        priority: 1,
        needsArbiter: false
      };

      regions.slice(1).forEach((region, index) => {
        distribution[region.name] = {
          dataMembers: 1,
          analyticsMembers: index === 0 ? 1 : 0, // Analytics in first secondary region
          priority: 0.5 - (index * 0.1), // Decreasing priority
          needsArbiter: false
        };
      });
    }

    return distribution;
  }

  async measureInterRegionLatency(regions) {
    console.log('Measuring inter-region network latency...');
    
    const latencyMatrix = {};
    
    for (const sourceRegion of regions) {
      latencyMatrix[sourceRegion.name] = {};
      
      for (const targetRegion of regions) {
        if (sourceRegion.name === targetRegion.name) {
          latencyMatrix[sourceRegion.name][targetRegion.name] = 0;
          continue;
        }

        try {
          // Simulate latency measurement (in production, use actual network tests)
          const estimatedLatency = this.estimateLatencyBetweenRegions(sourceRegion, targetRegion);
          latencyMatrix[sourceRegion.name][targetRegion.name] = estimatedLatency;
          
        } catch (error) {
          console.warn(`Failed to measure latency between ${sourceRegion.name} and ${targetRegion.name}:`, error.message);
          latencyMatrix[sourceRegion.name][targetRegion.name] = 999; // High value for unreachable
        }
      }
    }

    return latencyMatrix;
  }

  estimateLatencyBetweenRegions(source, target) {
    // Simplified latency estimation based on geographic distance
    const latencyMap = {
      'us-east-1_us-west-2': 70,
      'us-east-1_eu-west-1': 85,
      'us-west-2_eu-west-1': 140,
      'us-east-1_ap-southeast-1': 180,
      'us-west-2_ap-southeast-1': 120,
      'eu-west-1_ap-southeast-1': 160
    };

    const key = `${source.name}_${target.name}`;
    const reverseKey = `${target.name}_${source.name}`;
    
    return latencyMap[key] || latencyMap[reverseKey] || 200; // Default high latency
  }

  designFailoverStrategy(regions) {
    return {
      primaryRegionFailure: {
        strategy: 'automatic_election',
        timeoutMs: 10000,
        requiredVotes: Math.ceil((regions.length * 2 + 1) / 2) // Majority
      },
      
      networkPartition: {
        strategy: 'majority_partition_wins',
        description: 'Partition with majority of voting members continues operation'
      },
      
      crossRegionReplication: {
        strategy: 'eventual_consistency',
        maxLagSeconds: 60,
        description: 'Accept eventual consistency during network issues'
      }
    };
  }

  async waitForMemberRecovery(memberId, timeoutMs) {
    console.log(`Waiting for member ${memberId} to recover...`);
    
    const startTime = Date.now();
    const pollInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.db.runCommand({ replSetGetStatus: 1 });
        const member = status.members.find(m => m._id === memberId);
        
        if (member && [1, 2].includes(member.state)) { // PRIMARY or SECONDARY
          console.log(`Member ${memberId} recovered successfully`);
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.warn(`Error checking member ${memberId} status:`, error.message);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    throw new Error(`Member ${memberId} recovery timeout after ${timeoutMs}ms`);
  }

  createMaintenanceExecutionOrder(maintenancePlan, healthStatus) {
    const executionOrder = [];
    
    // Always start with secondaries, then primary
    const secondaries = healthStatus.memberHealth
      .filter(m => m.stateStr === 'SECONDARY')
      .sort((a, b) => (b.priority || 0) - (a.priority || 0)); // Highest priority secondary first

    const primary = healthStatus.memberHealth.find(m => m.stateStr === 'PRIMARY');

    // Add secondary maintenance steps
    secondaries.forEach((member, index) => {
      executionOrder.push({
        memberId: member._id,
        memberName: member.name,
        description: `Maintenance on secondary: ${member.name}`,
        critical: false,
        requiresRejoin: maintenancePlan.requiresRestart,
        estimatedDurationMs: maintenancePlan.estimatedDurationMs || 300000,
        order: index
      });
    });

    // Add primary maintenance step (with step-down)
    if (primary) {
      executionOrder.push({
        memberId: primary._id,
        memberName: primary.name,
        description: `Maintenance on primary: ${primary.name} (with step-down)`,
        critical: true,
        requiresRejoin: maintenancePlan.requiresRestart,
        requiresStepDown: true,
        estimatedDurationMs: (maintenancePlan.estimatedDurationMs || 300000) + 30000, // Extra time for election
        order: secondaries.length
      });
    }

    return executionOrder;
  }

  async executeMaintenanceStep(step) {
    console.log(`Executing maintenance step: ${step.description}`);
    
    try {
      // Step down primary if required
      if (step.requiresStepDown) {
        console.log(`Stepping down primary: ${step.memberName}`);
        await this.db.runCommand({ 
          replSetStepDown: Math.ceil(step.estimatedDurationMs / 1000) + 60, // Add buffer
          force: false 
        });
        
        // Wait for new primary election
        await this.waitForPrimaryElection(30000);
      }

      // Simulate maintenance operation (replace with actual maintenance logic)
      console.log(`Performing maintenance on ${step.memberName}...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate maintenance work
      
      return {
        success: true,
        memberId: step.memberId,
        memberName: step.memberName,
        requiresRejoin: step.requiresRejoin,
        completionTime: new Date()
      };

    } catch (error) {
      console.error(`Maintenance step failed for ${step.memberName}:`, error);
      return {
        success: false,
        memberId: step.memberId,
        memberName: step.memberName,
        error: error.message,
        requiresRejoin: false
      };
    }
  }

  async validateMaintenanceCompletion(maintenancePlan, postMaintenanceHealth) {
    console.log('Validating maintenance completion...');
    
    const validation = {
      success: true,
      checks: [],
      issues: []
    };

    // Check that all members are healthy
    const healthyMembers = postMaintenanceHealth.memberHealth
      .filter(m => ['primary', 'healthy'].includes(m.status.overall));
    
    validation.checks.push({
      check: 'member_health',
      passed: healthyMembers.length >= this.performanceTargets.minHealthyMembers,
      details: `${healthyMembers.length} healthy members (minimum: ${this.performanceTargets.minHealthyMembers})`
    });

    // Check replication lag
    const maxLag = Math.max(...Object.values(postMaintenanceHealth.replicationLag));
    validation.checks.push({
      check: 'replication_lag',
      passed: maxLag <= this.performanceTargets.maxReplicationLagSeconds,
      details: `Maximum lag: ${maxLag}s (target: ${this.performanceTargets.maxReplicationLagSeconds}s)`
    });

    // Check for any alerts
    const criticalAlerts = postMaintenanceHealth.alerts
      .filter(alert => alert.severity === 'CRITICAL');
    
    validation.checks.push({
      check: 'critical_alerts',
      passed: criticalAlerts.length === 0,
      details: `${criticalAlerts.length} critical alerts`
    });

    // Overall success determination
    validation.success = validation.checks.every(check => check.passed);
    
    if (!validation.success) {
      validation.issues = validation.checks
        .filter(check => !check.passed)
        .map(check => `${check.check}: ${check.details}`);
    }

    return validation;
  }
}
```

## SQL-Style Replica Set Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB replica set management and monitoring:

```sql
-- QueryLeaf replica set management with SQL-familiar syntax

-- Create replica set with advanced configuration
CREATE REPLICA SET global_ecommerce_rs WITH (
  members = [
    { host = 'us-east-primary-1.company.com:27017', priority = 1.0, tags = { region = 'us-east', datacenter = 'dc1' } },
    { host = 'us-east-secondary-1.company.com:27017', priority = 0.5, tags = { region = 'us-east', datacenter = 'dc2' } },
    { host = 'us-west-secondary-1.company.com:27017', priority = 0.3, tags = { region = 'us-west', datacenter = 'dc3' } },
    { host = 'eu-west-secondary-1.company.com:27017', priority = 0.3, tags = { region = 'eu-west', datacenter = 'dc4' } },
    { host = 'analytics-secondary-1.company.com:27017', priority = 0, hidden = true, tags = { workload = 'analytics' } }
  ],
  
  -- Advanced replica set settings
  heartbeat_interval = '2 seconds',
  election_timeout = '10 seconds',
  catchup_timeout = '60 seconds',
  
  -- Custom write concerns for multi-region safety
  write_concerns = {
    multi_region = { us_east = 1, us_west = 1, eu_west = 1 },
    majority_datacenter = { datacenter = 3 },
    analytics_safe = { workload_analytics = 0, datacenter = 2 }
  },
  
  default_write_concern = { w = 'multi_region', j = true, wtimeout = '15 seconds' }
);

-- Monitor replica set health with comprehensive metrics
WITH replica_set_health AS (
  SELECT 
    member_name,
    member_state,
    member_state_str,
    health_status,
    uptime_seconds,
    ping_ms,
    
    -- Replication lag calculation
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - optime_date)) as replication_lag_seconds,
    
    -- Member performance assessment
    CASE member_state
      WHEN 1 THEN 'PRIMARY'
      WHEN 2 THEN 'SECONDARY'
      WHEN 7 THEN 'ARBITER'
      WHEN 8 THEN 'DOWN'
      WHEN 3 THEN 'RECOVERING'
      ELSE 'UNKNOWN'
    END as role,
    
    -- Health grade assignment
    CASE 
      WHEN health_status = 1 AND member_state IN (1, 2) AND ping_ms < 50 THEN 'A'
      WHEN health_status = 1 AND member_state IN (1, 2) AND ping_ms < 100 THEN 'B'
      WHEN health_status = 1 AND member_state IN (1, 2, 7) THEN 'C'
      WHEN health_status = 1 AND member_state NOT IN (1, 2, 7) THEN 'D'
      ELSE 'F'
    END as health_grade,
    
    -- Network performance indicators
    CASE
      WHEN ping_ms IS NULL THEN 'UNREACHABLE'
      WHEN ping_ms < 10 THEN 'EXCELLENT'
      WHEN ping_ms < 50 THEN 'GOOD'
      WHEN ping_ms < 100 THEN 'ACCEPTABLE'
      WHEN ping_ms < 250 THEN 'POOR'
      ELSE 'CRITICAL'
    END as network_performance,
    
    -- Extract member tags for analysis
    member_tags.region as member_region,
    member_tags.datacenter as member_datacenter,
    member_tags.workload as member_workload,
    sync_source_host
    
  FROM rs_status()  -- QueryLeaf function to get replica set status
),

replication_analysis AS (
  SELECT 
    member_region,
    member_datacenter,
    role,
    
    -- Regional distribution analysis
    COUNT(*) as members_in_region,
    COUNT(*) FILTER (WHERE role = 'SECONDARY') as secondaries_in_region,
    COUNT(*) FILTER (WHERE health_grade IN ('A', 'B')) as healthy_members_in_region,
    
    -- Performance metrics by region
    AVG(replication_lag_seconds) as avg_replication_lag,
    MAX(replication_lag_seconds) as max_replication_lag,
    AVG(ping_ms) as avg_network_latency,
    MAX(ping_ms) as max_network_latency,
    
    -- Health distribution
    COUNT(*) FILTER (WHERE health_grade = 'A') as grade_a_members,
    COUNT(*) FILTER (WHERE health_grade = 'B') as grade_b_members,
    COUNT(*) FILTER (WHERE health_grade IN ('D', 'F')) as problematic_members,
    
    -- Fault tolerance assessment
    CASE
      WHEN COUNT(*) FILTER (WHERE role IN ('PRIMARY', 'SECONDARY') AND health_grade IN ('A', 'B')) >= 2 
      THEN 'FAULT_TOLERANT'
      WHEN COUNT(*) FILTER (WHERE role IN ('PRIMARY', 'SECONDARY')) >= 2 
      THEN 'MINIMAL_REDUNDANCY'
      ELSE 'AT_RISK'
    END as fault_tolerance_status
    
  FROM replica_set_health
  WHERE role != 'ARBITER'  -- Exclude arbiters from data analysis
  GROUP BY member_region, member_datacenter, role
),

failover_readiness_assessment AS (
  SELECT 
    rh.member_name,
    rh.role,
    rh.health_grade,
    rh.replication_lag_seconds,
    rh.member_region,
    
    -- Failover readiness scoring
    CASE 
      WHEN rh.role = 'PRIMARY' THEN 'N/A - Current Primary'
      WHEN rh.role = 'SECONDARY' AND rh.health_grade IN ('A', 'B') AND rh.replication_lag_seconds < 10 THEN 'READY'
      WHEN rh.role = 'SECONDARY' AND rh.health_grade = 'C' AND rh.replication_lag_seconds < 30 THEN 'ACCEPTABLE'
      WHEN rh.role = 'SECONDARY' AND rh.replication_lag_seconds < 120 THEN 'DELAYED'
      ELSE 'NOT_READY'
    END as failover_readiness,
    
    -- Estimated failover time
    CASE 
      WHEN rh.role = 'SECONDARY' AND rh.health_grade IN ('A', 'B') AND rh.replication_lag_seconds < 10 
      THEN '< 15 seconds'
      WHEN rh.role = 'SECONDARY' AND rh.replication_lag_seconds < 60 
      THEN '15-45 seconds'  
      WHEN rh.role = 'SECONDARY' AND rh.replication_lag_seconds < 300 
      THEN '1-5 minutes'
      ELSE '> 5 minutes or unknown'
    END as estimated_failover_time,
    
    -- Regional failover preference
    ROW_NUMBER() OVER (
      PARTITION BY rh.member_region 
      ORDER BY 
        CASE rh.health_grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END,
        rh.replication_lag_seconds,
        rh.ping_ms
    ) as regional_failover_preference
    
  FROM replica_set_health rh
  WHERE rh.role IN ('PRIMARY', 'SECONDARY')
)

-- Comprehensive replica set status report
SELECT 
  'REPLICA SET HEALTH SUMMARY' as report_section,
  
  -- Overall cluster health
  (SELECT COUNT(*) FROM replica_set_health WHERE health_grade IN ('A', 'B')) as healthy_members,
  (SELECT COUNT(*) FROM replica_set_health WHERE role IN ('PRIMARY', 'SECONDARY')) as data_bearing_members,
  (SELECT COUNT(DISTINCT member_region) FROM replica_set_health) as regions_covered,
  (SELECT COUNT(DISTINCT member_datacenter) FROM replica_set_health) as datacenters_covered,
  
  -- Performance indicators
  (SELECT ROUND(AVG(replication_lag_seconds)::numeric, 2) FROM replica_set_health WHERE role = 'SECONDARY') as avg_replication_lag_sec,
  (SELECT ROUND(MAX(replication_lag_seconds)::numeric, 2) FROM replica_set_health WHERE role = 'SECONDARY') as max_replication_lag_sec,
  (SELECT ROUND(AVG(ping_ms)::numeric, 1) FROM replica_set_health WHERE ping_ms IS NOT NULL) as avg_network_latency_ms,
  
  -- Fault tolerance assessment
  (SELECT fault_tolerance_status FROM replication_analysis LIMIT 1) as overall_fault_tolerance,
  
  -- Failover readiness
  (SELECT COUNT(*) FROM failover_readiness_assessment WHERE failover_readiness = 'READY') as failover_ready_secondaries,
  (SELECT member_name FROM failover_readiness_assessment WHERE regional_failover_preference = 1 AND role = 'SECONDARY' ORDER BY replication_lag_seconds LIMIT 1) as preferred_failover_candidate

UNION ALL

-- Regional distribution analysis
SELECT 
  'REGIONAL DISTRIBUTION' as report_section,
  
  member_region as region,
  members_in_region,
  secondaries_in_region,  
  healthy_members_in_region,
  ROUND(avg_replication_lag::numeric, 2) as avg_lag_sec,
  ROUND(avg_network_latency::numeric, 1) as avg_latency_ms,
  fault_tolerance_status,
  
  -- Regional health grade
  CASE 
    WHEN problematic_members = 0 AND grade_a_members >= 1 THEN 'EXCELLENT'
    WHEN problematic_members = 0 AND healthy_members_in_region >= 1 THEN 'GOOD'
    WHEN problematic_members <= 1 THEN 'ACCEPTABLE'
    ELSE 'NEEDS_ATTENTION'
  END as regional_health_grade

FROM replication_analysis
WHERE member_region IS NOT NULL

UNION ALL

-- Failover readiness details
SELECT 
  'FAILOVER READINESS' as report_section,
  
  member_name,
  role,
  health_grade,
  failover_readiness,
  estimated_failover_time,
  member_region,
  
  CASE 
    WHEN failover_readiness = 'READY' THEN 'Can handle immediate failover'
    WHEN failover_readiness = 'ACCEPTABLE' THEN 'Can handle failover with short delay'
    WHEN failover_readiness = 'DELAYED' THEN 'Requires catch-up time before failover'
    ELSE 'Not suitable for failover'
  END as failover_notes

FROM failover_readiness_assessment
ORDER BY 
  CASE failover_readiness 
    WHEN 'READY' THEN 1 
    WHEN 'ACCEPTABLE' THEN 2 
    WHEN 'DELAYED' THEN 3 
    ELSE 4 
  END,
  replication_lag_seconds;

-- Advanced read preference configuration
CREATE READ PREFERENCE CONFIGURATION application_read_preferences AS (
  
  -- Real-time dashboard queries - require primary for consistency
  real_time_dashboard = {
    read_preference = 'primary',
    max_staleness = '0 seconds',
    tags = {},
    description = 'Live dashboards requiring immediate consistency'
  },
  
  -- Business intelligence queries - can use secondaries
  business_intelligence = {
    read_preference = 'secondaryPreferred',
    max_staleness = '30 seconds', 
    tags = [{ workload = 'analytics' }, { region = 'us-east' }],
    description = 'BI queries with slight staleness tolerance'
  },
  
  -- Geographic user queries - prefer regional secondaries
  geographic_user_queries = {
    read_preference = 'nearest',
    max_staleness = '60 seconds',
    tags = [{ region = '${user_region}' }],
    description = 'User-facing queries optimized for geographic proximity'
  },
  
  -- Reporting and archival - use dedicated analytics secondary
  reporting_archival = {
    read_preference = 'secondary',
    max_staleness = '300 seconds',
    tags = [{ workload = 'analytics' }, { hidden = 'true' }],
    description = 'Heavy reporting queries isolated from primary workload'
  },
  
  -- Backup operations - use specific backup-designated secondary
  backup_operations = {
    read_preference = 'secondary', 
    max_staleness = '600 seconds',
    tags = [{ backup = 'true' }],
    description = 'Backup and compliance operations'
  }
);

-- Automatic failover testing and validation
CREATE FAILOVER TEST PROCEDURE comprehensive_failover_test AS (
  
  -- Test configuration
  test_duration = '5 minutes',
  data_consistency_validation = true,
  application_connectivity_testing = true,
  performance_impact_measurement = true,
  
  -- Test phases
  phases = [
    {
      phase = 'pre_test_health_check',
      description = 'Validate cluster health before testing',
      required_healthy_members = 3,
      max_replication_lag = '30 seconds'
    },
    
    {
      phase = 'test_data_insertion', 
      description = 'Insert test data for consistency verification',
      test_documents = 1000,
      write_concern = { w = 'majority', j = true }
    },
    
    {
      phase = 'primary_step_down',
      description = 'Force primary to step down',
      step_down_duration = '300 seconds',
      force_step_down = false
    },
    
    {
      phase = 'election_monitoring',
      description = 'Monitor primary election process', 
      max_election_time = '30 seconds',
      log_election_details = true
    },
    
    {
      phase = 'connectivity_validation',
      description = 'Test application connectivity to new primary',
      connection_timeout = '10 seconds',
      retry_attempts = 3
    },
    
    {
      phase = 'data_consistency_check',
      description = 'Verify data consistency after failover',
      verify_test_data = true,
      checksum_validation = true
    },
    
    {
      phase = 'performance_assessment',
      description = 'Measure failover impact on performance',
      metrics = ['election_time', 'connectivity_restore_time', 'replication_catch_up_time']
    }
  ],
  
  -- Success criteria
  success_criteria = {
    max_election_time = '30 seconds',
    data_consistency = 'required',
    zero_data_loss = 'required',
    application_connectivity_restore = '< 60 seconds'
  },
  
  -- Automated scheduling
  schedule = 'monthly',
  notification_recipients = ['dba-team@company.com', 'ops-team@company.com']
);

-- Disaster recovery configuration and procedures
CREATE DISASTER RECOVERY PLAN enterprise_dr_plan AS (
  
  -- Backup strategy
  backup_strategy = {
    hot_backups = {
      frequency = 'daily',
      retention = '30 days',
      compression = true,
      encryption = true,
      storage_locations = ['s3://company-mongo-backups', 'gcs://company-mongo-dr']
    },
    
    continuous_backup = {
      oplog_tailing = true,
      change_streams = true,
      point_in_time_recovery = true,
      max_recovery_window = '7 days'
    },
    
    cross_region_replication = {
      enabled = true,
      target_regions = ['us-west-2', 'eu-central-1'],
      replication_lag_target = '< 60 seconds'
    }
  },
  
  -- Recovery procedures
  recovery_procedures = {
    
    -- Single member failure
    member_failure = {
      detection_time_target = '< 30 seconds',
      automatic_response = true,
      procedures = [
        'Automatic failover via replica set election',
        'Alert operations team',
        'Provision replacement member',
        'Add replacement to replica set',
        'Monitor replication catch-up'
      ]
    },
    
    -- Regional failure  
    regional_failure = {
      detection_time_target = '< 2 minutes',
      automatic_response = 'partial',
      procedures = [
        'Automatic failover to available regions',
        'Redirect application traffic',
        'Scale remaining regions for increased load',
        'Provision new regional deployment', 
        'Restore full geographic distribution'
      ]
    },
    
    -- Complete cluster failure
    complete_failure = {
      detection_time_target = '< 5 minutes',
      automatic_response = false,
      procedures = [
        'Activate disaster recovery plan',
        'Restore from most recent backup',
        'Apply oplog entries for point-in-time recovery',
        'Provision new cluster infrastructure',
        'Validate data integrity',
        'Redirect application traffic to recovered cluster'
      ]
    }
  },
  
  -- RTO/RPO targets
  recovery_targets = {
    member_failure = { rto = '< 1 minute', rpo = '0 seconds' },
    regional_failure = { rto = '< 5 minutes', rpo = '< 30 seconds' },
    complete_failure = { rto = '< 2 hours', rpo = '< 15 minutes' }
  },
  
  -- Testing and validation
  testing_schedule = {
    failover_tests = 'monthly',
    disaster_recovery_drills = 'quarterly', 
    backup_restoration_tests = 'weekly',
    cross_region_connectivity_tests = 'daily'
  }
);

-- Real-time monitoring and alerting configuration
CREATE MONITORING CONFIGURATION replica_set_monitoring AS (
  
  -- Health check intervals
  health_check_interval = '10 seconds',
  performance_sampling_interval = '30 seconds',
  trend_analysis_window = '1 hour',
  
  -- Alert thresholds
  alert_thresholds = {
    
    -- Replication lag alerts
    replication_lag = {
      warning = '30 seconds',
      critical = '2 minutes',
      escalation = '5 minutes'
    },
    
    -- Member health alerts  
    member_health = {
      warning = 'any_member_down',
      critical = 'primary_down_or_majority_unavailable',
      escalation = 'split_brain_detected'
    },
    
    -- Network latency alerts
    network_latency = {
      warning = '100 ms average',
      critical = '500 ms average', 
      escalation = 'member_unreachable'
    },
    
    -- Election frequency alerts
    election_frequency = {
      warning = '2 elections per hour',
      critical = '5 elections per hour',
      escalation = 'continuous_election_cycling'
    }
  },
  
  -- Notification configuration
  notifications = {
    email = ['dba-team@company.com', 'ops-team@company.com'],
    slack = '#database-alerts',
    pagerduty = 'mongodb-replica-set-service',
    webhook = 'https://monitoring.company.com/mongodb-alerts'
  },
  
  -- Automated responses
  automated_responses = {
    member_down = 'log_alert_and_notify',
    high_replication_lag = 'investigate_and_notify',
    primary_election = 'log_details_and_validate_health',
    split_brain_detection = 'immediate_escalation'
  }
);

-- QueryLeaf provides comprehensive replica set management:
-- 1. SQL-familiar syntax for replica set creation and configuration
-- 2. Advanced health monitoring with comprehensive metrics and alerting
-- 3. Automated failover testing and validation procedures
-- 4. Sophisticated read preference management for performance optimization
-- 5. Comprehensive disaster recovery planning and implementation
-- 6. Real-time monitoring with customizable thresholds and notifications
-- 7. Geographic distribution management for multi-region deployments  
-- 8. Zero-downtime maintenance procedures with automatic validation
-- 9. Performance impact assessment and optimization recommendations
-- 10. Integration with MongoDB's native replica set functionality
```

## Best Practices for Replica Set Implementation

### High Availability Design Principles

Essential guidelines for robust MongoDB replica set deployments:

1. **Odd Number of Voting Members**: Always maintain an odd number of voting members to prevent split-brain scenarios
2. **Geographic Distribution**: Deploy members across multiple availability zones or regions for disaster recovery
3. **Resource Planning**: Size replica set members appropriately for expected workload and failover scenarios
4. **Network Optimization**: Ensure low-latency, high-bandwidth connections between replica set members
5. **Monitoring Integration**: Implement comprehensive monitoring with proactive alerting for health and performance
6. **Regular Testing**: Conduct regular failover tests and disaster recovery drills to validate procedures

### Operational Excellence

Optimize replica set operations for production environments:

1. **Automated Deployment**: Use infrastructure as code for consistent replica set deployments
2. **Configuration Management**: Maintain consistent configuration across all replica set members
3. **Security Implementation**: Enable authentication, authorization, and encryption for all replica communications
4. **Backup Strategy**: Implement multiple backup strategies including hot backups and point-in-time recovery
5. **Performance Monitoring**: Track replication lag, network latency, and resource utilization continuously
6. **Documentation Maintenance**: Keep runbooks and procedures updated with current configuration and processes

## Conclusion

MongoDB's replica set architecture provides comprehensive high availability and disaster recovery capabilities that eliminate the complexity and limitations of traditional database replication systems. The sophisticated election algorithms, automatic failover mechanisms, and flexible configuration options ensure business continuity even during catastrophic failures while maintaining data consistency and application performance.

Key MongoDB Replica Set benefits include:

- **Automatic Failover**: Intelligent primary election with no manual intervention required
- **Strong Consistency**: Configurable write and read concerns for application-specific consistency requirements  
- **Geographic Distribution**: Multi-region deployment support for comprehensive disaster recovery
- **Zero Downtime Operations**: Add, remove, and maintain replica set members without service interruption
- **Flexible Read Scaling**: Advanced read preference configuration for optimal performance distribution
- **Comprehensive Monitoring**: Built-in health monitoring with detailed metrics and alerting capabilities

Whether you're building resilient e-commerce platforms, financial applications, or global content delivery systems, MongoDB's replica sets with QueryLeaf's familiar SQL interface provide the foundation for mission-critical high availability infrastructure.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB replica set operations while providing SQL-familiar syntax for replica set creation, health monitoring, and disaster recovery procedures. Advanced high availability patterns, automated failover testing, and comprehensive monitoring are seamlessly handled through familiar SQL constructs, making sophisticated database resilience both powerful and accessible to SQL-oriented operations teams.

The combination of MongoDB's robust replica set capabilities with SQL-style operations makes it an ideal platform for applications requiring both high availability and familiar database management patterns, ensuring your applications maintain continuous operation while remaining manageable as they scale globally.