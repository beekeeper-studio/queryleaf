---
title: "MongoDB Connection Pooling and Performance Optimization: Advanced Database Connection Management for Production Applications"
description: "Master MongoDB connection pooling for optimal database performance. Learn advanced connection management, load balancing, and SQL-familiar connection optimization techniques for scalable production applications."
date: 2025-10-13
tags: [mongodb, connection-pooling, performance, optimization, database-connections, production, scalability, sql]
---

# MongoDB Connection Pooling and Performance Optimization: Advanced Database Connection Management for Production Applications

Production database applications require sophisticated connection management strategies that can handle fluctuating workloads, maintain optimal performance under high concurrency, and prevent resource exhaustion while ensuring consistent response times. Traditional database connection approaches often struggle with connection overhead, resource contention, and inefficient connection lifecycle management, leading to performance bottlenecks, connection timeouts, and application instability in production environments.

MongoDB provides comprehensive connection pooling capabilities that enable efficient database connection management through intelligent pooling strategies, automatic connection lifecycle management, and advanced monitoring features. Unlike traditional databases that require complex connection management libraries or manual connection handling, MongoDB's built-in connection pooling offers optimized resource utilization, automatic scaling, and production-ready connection management with minimal configuration overhead.

## The Traditional Connection Management Challenge

Conventional database connection management approaches face significant limitations in production environments:

```sql
-- Traditional PostgreSQL connection management - manual and resource-intensive approaches

-- Basic connection handling with poor resource management
CREATE TABLE connection_usage_log (
    log_id SERIAL PRIMARY KEY,
    connection_id VARCHAR(100) NOT NULL,
    application_name VARCHAR(100),
    database_name VARCHAR(100),
    username VARCHAR(100),
    
    -- Connection lifecycle tracking
    connection_established TIMESTAMP NOT NULL,
    connection_closed TIMESTAMP,
    connection_duration_seconds INTEGER,
    
    -- Resource utilization tracking (limited visibility)
    queries_executed INTEGER DEFAULT 0,
    transactions_executed INTEGER DEFAULT 0,
    bytes_transferred BIGINT DEFAULT 0,
    
    -- Basic performance metrics
    avg_query_time_ms DECIMAL(10,3),
    max_query_time_ms DECIMAL(10,3),
    total_wait_time_ms BIGINT DEFAULT 0,
    
    -- Connection status tracking
    connection_status VARCHAR(50) DEFAULT 'active',
    last_activity TIMESTAMP,
    idle_time_seconds INTEGER DEFAULT 0,
    
    -- Error tracking (basic)
    error_count INTEGER DEFAULT 0,
    last_error_message TEXT,
    last_error_timestamp TIMESTAMP
);

-- Manual connection pool simulation (extremely limited functionality)
CREATE TABLE connection_pool_config (
    pool_name VARCHAR(100) PRIMARY KEY,
    database_name VARCHAR(100) NOT NULL,
    min_connections INTEGER DEFAULT 5,
    max_connections INTEGER DEFAULT 25,
    connection_timeout_seconds INTEGER DEFAULT 30,
    idle_timeout_seconds INTEGER DEFAULT 300,
    
    -- Basic pool settings
    validate_connections BOOLEAN DEFAULT true,
    test_query VARCHAR(200) DEFAULT 'SELECT 1',
    max_lifetime_seconds INTEGER DEFAULT 1800,
    
    -- Pool status (manually maintained)
    pool_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Simple connection allocation function (no real pooling)
CREATE OR REPLACE FUNCTION allocate_connection(
    pool_name_param VARCHAR(100),
    application_name_param VARCHAR(100)
) RETURNS TABLE (
    connection_id VARCHAR(100),
    allocation_success BOOLEAN,
    wait_time_ms INTEGER,
    error_message TEXT
) AS $$
DECLARE
    available_connections INTEGER;
    pool_config RECORD;
    new_connection_id VARCHAR(100);
    start_time TIMESTAMP := clock_timestamp();
    wait_timeout TIMESTAMP;
BEGIN
    
    -- Get pool configuration (basic validation)
    SELECT * INTO pool_config
    FROM connection_pool_config
    WHERE pool_name = pool_name_param AND pool_enabled = true;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            NULL::VARCHAR(100),
            false,
            0,
            'Connection pool not found or disabled';
        RETURN;
    END IF;
    
    -- Count "available" connections (very basic simulation)
    SELECT COUNT(*) INTO available_connections
    FROM connection_usage_log
    WHERE connection_status = 'active'
    AND last_activity > CURRENT_TIMESTAMP - (pool_config.idle_timeout_seconds * INTERVAL '1 second');
    
    -- Simple allocation logic (doesn't actually create real connections)
    IF available_connections >= pool_config.max_connections THEN
        -- Wait for connection with timeout (simulated blocking)
        wait_timeout := start_time + (pool_config.connection_timeout_seconds * INTERVAL '1 second');
        
        WHILE clock_timestamp() < wait_timeout LOOP
            -- Check for available connections again
            SELECT COUNT(*) INTO available_connections
            FROM connection_usage_log
            WHERE connection_status = 'active'
            AND last_activity > CURRENT_TIMESTAMP - (pool_config.idle_timeout_seconds * INTERVAL '1 second');
            
            IF available_connections < pool_config.max_connections THEN
                EXIT;
            END IF;
            
            -- Simple wait (PostgreSQL doesn't have good sleep in functions)
            PERFORM pg_sleep(0.1);
        END LOOP;
        
        IF available_connections >= pool_config.max_connections THEN
            RETURN QUERY SELECT 
                NULL::VARCHAR(100),
                false,
                EXTRACT(MILLISECONDS FROM clock_timestamp() - start_time)::INTEGER,
                'Connection pool exhausted - timeout waiting for available connection';
            RETURN;
        END IF;
    END IF;
    
    -- "Allocate" a connection (just create a log entry)
    new_connection_id := 'conn_' || extract(epoch from now())::BIGINT || '_' || (random() * 10000)::INTEGER;
    
    INSERT INTO connection_usage_log (
        connection_id,
        application_name,
        database_name,
        username,
        connection_established,
        connection_status,
        last_activity
    ) VALUES (
        new_connection_id,
        application_name_param,
        pool_config.database_name,
        current_user,
        clock_timestamp(),
        'active',
        clock_timestamp()
    );
    
    RETURN QUERY SELECT 
        new_connection_id,
        true,
        EXTRACT(MILLISECONDS FROM clock_timestamp() - start_time)::INTEGER,
        NULL::TEXT;
        
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 
        NULL::VARCHAR(100),
        false,
        EXTRACT(MILLISECONDS FROM clock_timestamp() - start_time)::INTEGER,
        SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Manual connection health checking (limited effectiveness)
CREATE OR REPLACE FUNCTION check_connection_health() 
RETURNS TABLE (
    pool_name VARCHAR(100),
    total_connections INTEGER,
    active_connections INTEGER,
    idle_connections INTEGER,
    stale_connections INTEGER,
    avg_connection_age_minutes INTEGER,
    pool_utilization_percent DECIMAL(5,2),
    health_status VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    WITH connection_stats AS (
        SELECT 
            cpc.pool_name,
            COUNT(cul.connection_id) as total_connections,
            COUNT(*) FILTER (WHERE cul.connection_status = 'active' 
                           AND cul.last_activity > CURRENT_TIMESTAMP - INTERVAL '5 minutes') as active_connections,
            COUNT(*) FILTER (WHERE cul.connection_status = 'active' 
                           AND cul.last_activity <= CURRENT_TIMESTAMP - INTERVAL '5 minutes') as idle_connections,
            COUNT(*) FILTER (WHERE cul.last_activity < CURRENT_TIMESTAMP - INTERVAL '30 minutes') as stale_connections,
            AVG(EXTRACT(MINUTES FROM CURRENT_TIMESTAMP - cul.connection_established))::INTEGER as avg_age_minutes,
            cpc.max_connections
            
        FROM connection_pool_config cpc
        LEFT JOIN connection_usage_log cul ON cul.database_name = cpc.database_name
        WHERE cpc.pool_enabled = true
        GROUP BY cpc.pool_name, cpc.max_connections
    )
    SELECT 
        cs.pool_name,
        cs.total_connections,
        cs.active_connections,
        cs.idle_connections,
        cs.stale_connections,
        cs.avg_age_minutes,
        ROUND((cs.total_connections::DECIMAL / cs.max_connections) * 100, 2) as utilization_percent,
        
        -- Basic health assessment
        CASE 
            WHEN cs.stale_connections > cs.max_connections * 0.5 THEN 'unhealthy'
            WHEN cs.total_connections > cs.max_connections * 0.9 THEN 'stressed'
            WHEN cs.active_connections < 2 THEN 'underutilized'
            ELSE 'healthy'
        END as health_status
        
    FROM connection_stats cs;
END;
$$ LANGUAGE plpgsql;

-- Basic connection cleanup (manual process)
WITH stale_connections AS (
    SELECT 
        connection_id,
        connection_established,
        last_activity,
        EXTRACT(MINUTES FROM CURRENT_TIMESTAMP - last_activity) as idle_minutes
        
    FROM connection_usage_log
    WHERE connection_status = 'active'
    AND (
        last_activity < CURRENT_TIMESTAMP - INTERVAL '30 minutes'  -- Long idle
        OR connection_established < CURRENT_TIMESTAMP - INTERVAL '2 hours'  -- Old connections
        OR error_count > 5  -- Error-prone connections
    )
),
cleanup_summary AS (
    UPDATE connection_usage_log
    SET 
        connection_status = 'closed',
        connection_closed = CURRENT_TIMESTAMP,
        connection_duration_seconds = EXTRACT(SECONDS FROM CURRENT_TIMESTAMP - connection_established)::INTEGER
    WHERE connection_id IN (SELECT connection_id FROM stale_connections)
    RETURNING connection_id, connection_duration_seconds
)
SELECT 
    COUNT(*) as connections_cleaned,
    AVG(connection_duration_seconds) as avg_connection_lifetime_seconds,
    SUM(connection_duration_seconds) as total_connection_time_freed,
    
    -- Limited cleanup statistics
    COUNT(*) FILTER (WHERE connection_duration_seconds > 3600) as long_lived_connections_cleaned,
    COUNT(*) FILTER (WHERE connection_duration_seconds < 300) as short_lived_connections_cleaned
    
FROM cleanup_summary;

-- Problems with traditional connection management:
-- 1. No real connection pooling - just tracking and simulation
-- 2. Manual resource management with high maintenance overhead  
-- 3. Limited connection lifecycle automation and optimization
-- 4. No built-in load balancing or intelligent connection distribution
-- 5. Poor visibility into connection performance and resource utilization
-- 6. Manual scaling and configuration adjustments required
-- 7. No automatic connection validation or health checking
-- 8. Limited error handling and recovery mechanisms
-- 9. No support for advanced features like read preference or write concern optimization
-- 10. Complex application-level connection management logic required

-- Attempt at connection performance monitoring (very limited)
WITH connection_performance AS (
    SELECT 
        DATE_TRUNC('hour', cul.last_activity) as hour_bucket,
        cul.application_name,
        COUNT(*) as total_connections_used,
        AVG(cul.connection_duration_seconds) as avg_connection_lifetime,
        SUM(cul.queries_executed) as total_queries,
        
        -- Basic performance calculations
        CASE 
            WHEN SUM(cul.queries_executed) > 0 THEN
                AVG(cul.avg_query_time_ms)
            ELSE NULL
        END as overall_avg_query_time,
        
        COUNT(*) FILTER (WHERE cul.error_count > 0) as connections_with_errors,
        SUM(cul.error_count) as total_errors
        
    FROM connection_usage_log cul
    WHERE cul.last_activity >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND cul.connection_status = 'closed'  -- Only analyze completed connections
    GROUP BY DATE_TRUNC('hour', cul.last_activity), cul.application_name
),
hourly_trends AS (
    SELECT 
        cp.*,
        LAG(total_connections_used) OVER (
            PARTITION BY application_name 
            ORDER BY hour_bucket
        ) as prev_hour_connections,
        LAG(overall_avg_query_time) OVER (
            PARTITION BY application_name 
            ORDER BY hour_bucket
        ) as prev_hour_query_time
    FROM connection_performance cp
)
SELECT 
    hour_bucket,
    application_name,
    total_connections_used,
    ROUND(avg_connection_lifetime::NUMERIC, 1) as avg_lifetime_seconds,
    total_queries,
    ROUND(overall_avg_query_time::NUMERIC, 2) as avg_query_time_ms,
    
    -- Error rates
    connections_with_errors,
    CASE 
        WHEN total_connections_used > 0 THEN
            ROUND((connections_with_errors::DECIMAL / total_connections_used) * 100, 2)
        ELSE 0
    END as connection_error_rate_percent,
    
    -- Trend indicators (very basic)
    CASE 
        WHEN prev_hour_connections IS NOT NULL AND prev_hour_connections > 0 THEN
            ROUND(((total_connections_used - prev_hour_connections)::DECIMAL / prev_hour_connections) * 100, 1)
        ELSE NULL
    END as connection_usage_change_percent,
    
    -- Performance assessment
    CASE 
        WHEN overall_avg_query_time > 1000 THEN 'slow'
        WHEN overall_avg_query_time > 500 THEN 'moderate'
        WHEN overall_avg_query_time < 100 THEN 'fast'
        ELSE 'normal'
    END as performance_assessment

FROM hourly_trends
WHERE total_connections_used > 0
ORDER BY hour_bucket DESC, application_name;

-- Traditional limitations:
-- 1. No actual connection pooling implementation - only monitoring and simulation
-- 2. Manual configuration and tuning without automatic optimization
-- 3. Limited connection health monitoring and automated recovery
-- 4. No intelligent load balancing or connection routing
-- 5. Poor integration with application frameworks and ORMs
-- 6. Limited scalability for high-concurrency applications
-- 7. No advanced features like connection warming or pre-allocation
-- 8. Manual error handling and connection recovery logic
-- 9. No built-in support for distributed database topologies
-- 10. Complex troubleshooting and performance analysis requirements
```

MongoDB provides sophisticated connection pooling capabilities with automatic optimization and management:

```javascript
// MongoDB Advanced Connection Pooling - comprehensive connection management with intelligent optimization
const { MongoClient, ServerApiVersion } = require('mongodb');
const { EventEmitter } = require('events');

// Comprehensive MongoDB Connection Pool Manager
class AdvancedConnectionPoolManager extends EventEmitter {
  constructor(connectionString, config = {}) {
    super();
    this.connectionString = connectionString;
    this.pools = new Map();
    this.monitoringIntervals = new Map();
    
    // Advanced connection pooling configuration
    this.config = {
      // Connection pool size management
      minPoolSize: config.minPoolSize || 5,
      maxPoolSize: config.maxPoolSize || 50,
      maxIdleTimeMS: config.maxIdleTimeMS || 300000, // 5 minutes
      maxConnecting: config.maxConnecting || 10,
      
      // Connection lifecycle management
      connectTimeoutMS: config.connectTimeoutMS || 30000,
      socketTimeoutMS: config.socketTimeoutMS || 120000,
      serverSelectionTimeoutMS: config.serverSelectionTimeoutMS || 30000,
      heartbeatFrequencyMS: config.heartbeatFrequencyMS || 10000,
      
      // Performance optimization
      maxStalenessSeconds: config.maxStalenessSeconds || 90,
      readPreference: config.readPreference || 'primaryPreferred',
      readConcern: config.readConcern || { level: 'majority' },
      writeConcern: config.writeConcern || { w: 'majority', j: true },
      
      // Connection pool monitoring
      enableMonitoring: config.enableMonitoring !== false,
      monitoringInterval: config.monitoringInterval || 30000,
      enableConnectionEvents: config.enableConnectionEvents !== false,
      enablePerformanceTracking: config.enablePerformanceTracking !== false,
      
      // Advanced features
      enableLoadBalancing: config.enableLoadBalancing || false,
      enableAutomaticFailover: config.enableAutomaticFailover !== false,
      enableConnectionWarming: config.enableConnectionWarming || false,
      enableIntelligentRouting: config.enableIntelligentRouting || false,
      
      // Error handling and recovery
      maxRetries: config.maxRetries || 3,
      retryDelayMS: config.retryDelayMS || 1000,
      enableCircuitBreaker: config.enableCircuitBreaker || false,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 10,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
      
      // Security and authentication
      authSource: config.authSource || 'admin',
      authMechanism: config.authMechanism || 'SCRAM-SHA-256',
      tlsAllowInvalidCertificates: config.tlsAllowInvalidCertificates || false,
      tlsAllowInvalidHostnames: config.tlsAllowInvalidHostnames || false
    };
    
    // Performance and monitoring metrics
    this.metrics = {
      connectionPools: new Map(),
      performanceHistory: [],
      errorStats: new Map(),
      operationStats: new Map()
    };
    
    // Circuit breaker state for error handling
    this.circuitBreaker = {
      state: 'closed', // closed, open, half-open
      failures: 0,
      lastFailureTime: null,
      nextRetryTime: null
    };
    
    this.initializeConnectionPooling();
  }

  async initializeConnectionPooling() {
    console.log('Initializing advanced MongoDB connection pooling system...');
    
    try {
      // Setup primary connection pool
      await this.createConnectionPool('primary', this.connectionString);
      
      // Initialize connection monitoring
      if (this.config.enableMonitoring) {
        await this.setupConnectionMonitoring();
      }
      
      // Setup connection event handlers
      if (this.config.enableConnectionEvents) {
        await this.setupConnectionEventHandlers();
      }
      
      // Initialize performance tracking
      if (this.config.enablePerformanceTracking) {
        await this.setupPerformanceTracking();
      }
      
      // Enable connection warming if configured
      if (this.config.enableConnectionWarming) {
        await this.warmupConnectionPool('primary');
      }
      
      console.log('Advanced connection pooling system initialized successfully');
      
    } catch (error) {
      console.error('Error initializing connection pooling:', error);
      throw error;
    }
  }

  async createConnectionPool(poolName, connectionString, poolConfig = {}) {
    console.log(`Creating connection pool: ${poolName}`);
    
    try {
      // Merge pool-specific configuration with global configuration
      const mergedConfig = {
        ...this.config,
        ...poolConfig
      };
      
      // Configure MongoDB client options with advanced connection pooling
      const clientOptions = {
        // Connection pool configuration
        minPoolSize: mergedConfig.minPoolSize,
        maxPoolSize: mergedConfig.maxPoolSize,
        maxIdleTimeMS: mergedConfig.maxIdleTimeMS,
        maxConnecting: mergedConfig.maxConnecting,
        
        // Connection timeout configuration
        connectTimeoutMS: mergedConfig.connectTimeoutMS,
        socketTimeoutMS: mergedConfig.socketTimeoutMS,
        serverSelectionTimeoutMS: mergedConfig.serverSelectionTimeoutMS,
        heartbeatFrequencyMS: mergedConfig.heartbeatFrequencyMS,
        
        // Read and write preferences
        readPreference: mergedConfig.readPreference,
        readConcern: mergedConfig.readConcern,
        writeConcern: mergedConfig.writeConcern,
        maxStalenessSeconds: mergedConfig.maxStalenessSeconds,
        
        // Advanced features
        loadBalanced: mergedConfig.enableLoadBalancing,
        retryWrites: true,
        retryReads: true,
        
        // Security configuration
        authSource: mergedConfig.authSource,
        authMechanism: mergedConfig.authMechanism,
        tls: connectionString.includes('ssl=true') || connectionString.includes('+srv'),
        tlsAllowInvalidCertificates: mergedConfig.tlsAllowInvalidCertificates,
        tlsAllowInvalidHostnames: mergedConfig.tlsAllowInvalidHostnames,
        
        // Monitoring and logging
        monitorCommands: mergedConfig.enablePerformanceTracking,
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: false
        }
      };

      // Create MongoDB client with connection pooling
      const client = new MongoClient(connectionString, clientOptions);
      
      // Establish initial connection
      await client.connect();
      
      // Store pool information
      const poolInfo = {
        client: client,
        name: poolName,
        connectionString: connectionString,
        configuration: mergedConfig,
        createdAt: new Date(),
        
        // Connection pool statistics
        stats: {
          connectionsCreated: 0,
          connectionsClosed: 0,
          connectionsInUse: 0,
          connectionsAvailable: 0,
          totalOperations: 0,
          failedOperations: 0,
          averageOperationTime: 0,
          lastConnectionActivity: new Date()
        },
        
        // Health status
        healthStatus: 'healthy',
        lastHealthCheck: new Date()
      };
      
      this.pools.set(poolName, poolInfo);
      
      console.log(`Connection pool '${poolName}' created successfully with ${mergedConfig.maxPoolSize} max connections`);
      
      return poolInfo;
      
    } catch (error) {
      console.error(`Error creating connection pool '${poolName}':`, error);
      throw error;
    }
  }

  async setupConnectionEventHandlers() {
    console.log('Setting up comprehensive connection event handlers...');
    
    for (const [poolName, poolInfo] of this.pools.entries()) {
      const client = poolInfo.client;
      
      // Connection pool events
      client.on('connectionPoolCreated', (event) => {
        console.log(`Connection pool created: ${poolName}`, {
          address: event.address,
          options: event.options
        });
        
        this.metrics.connectionPools.set(poolName, {
          ...this.metrics.connectionPools.get(poolName),
          poolCreated: new Date(),
          address: event.address
        });
        
        this.emit('poolCreated', { poolName, event });
      });

      client.on('connectionCreated', (event) => {
        console.log(`Connection created in pool '${poolName}':`, {
          connectionId: event.connectionId,
          address: event.address
        });
        
        poolInfo.stats.connectionsCreated++;
        poolInfo.stats.lastConnectionActivity = new Date();
        
        this.emit('connectionCreated', { poolName, event });
      });

      client.on('connectionReady', (event) => {
        console.log(`Connection ready in pool '${poolName}':`, {
          connectionId: event.connectionId,
          address: event.address
        });
        
        this.emit('connectionReady', { poolName, event });
      });

      client.on('connectionClosed', (event) => {
        console.log(`Connection closed in pool '${poolName}':`, {
          connectionId: event.connectionId,
          reason: event.reason,
          address: event.address
        });
        
        poolInfo.stats.connectionsClosed++;
        poolInfo.stats.lastConnectionActivity = new Date();
        
        this.emit('connectionClosed', { poolName, event });
      });

      client.on('connectionCheckOutStarted', (event) => {
        this.emit('connectionCheckOutStarted', { poolName, event });
      });

      client.on('connectionCheckedOut', (event) => {
        poolInfo.stats.connectionsInUse++;
        poolInfo.stats.connectionsAvailable--;
        
        this.emit('connectionCheckedOut', { poolName, event });
      });

      client.on('connectionCheckOutFailed', (event) => {
        console.error(`Connection checkout failed in pool '${poolName}':`, {
          reason: event.reason,
          address: event.address
        });
        
        poolInfo.stats.failedOperations++;
        
        this.emit('connectionCheckOutFailed', { poolName, event });
      });

      client.on('connectionCheckedIn', (event) => {
        poolInfo.stats.connectionsInUse--;
        poolInfo.stats.connectionsAvailable++;
        
        this.emit('connectionCheckedIn', { poolName, event });
      });

      // Server discovery and monitoring events
      client.on('serverDescriptionChanged', (event) => {
        console.log(`Server description changed for pool '${poolName}':`, {
          address: event.address,
          newDescription: event.newDescription.type,
          previousDescription: event.previousDescription.type
        });
        
        this.emit('serverDescriptionChanged', { poolName, event });
      });

      client.on('topologyDescriptionChanged', (event) => {
        console.log(`Topology changed for pool '${poolName}':`, {
          newTopologyType: event.newDescription.type,
          previousTopologyType: event.previousDescription.type
        });
        
        this.emit('topologyDescriptionChanged', { poolName, event });
      });

      // Command monitoring events (if performance tracking enabled)
      if (this.config.enablePerformanceTracking) {
        client.on('commandStarted', (event) => {
          this.trackCommandStart(poolName, event);
        });

        client.on('commandSucceeded', (event) => {
          this.trackCommandSuccess(poolName, event);
        });

        client.on('commandFailed', (event) => {
          this.trackCommandFailure(poolName, event);
        });
      }
    }
  }

  trackCommandStart(poolName, event) {
    // Store command start time for performance tracking
    if (!this.metrics.operationStats.has(poolName)) {
      this.metrics.operationStats.set(poolName, new Map());
    }
    
    const poolStats = this.metrics.operationStats.get(poolName);
    poolStats.set(event.requestId, {
      command: event.commandName,
      startTime: Date.now(),
      connectionId: event.connectionId
    });
  }

  trackCommandSuccess(poolName, event) {
    const poolStats = this.metrics.operationStats.get(poolName);
    const commandInfo = poolStats.get(event.requestId);
    
    if (commandInfo) {
      const duration = Date.now() - commandInfo.startTime;
      
      // Update pool statistics
      const poolInfo = this.pools.get(poolName);
      poolInfo.stats.totalOperations++;
      
      // Update average operation time
      const currentAvg = poolInfo.stats.averageOperationTime;
      const totalOps = poolInfo.stats.totalOperations;
      poolInfo.stats.averageOperationTime = ((currentAvg * (totalOps - 1)) + duration) / totalOps;
      
      // Store performance history
      this.metrics.performanceHistory.push({
        poolName: poolName,
        command: event.commandName,
        duration: duration,
        timestamp: new Date(),
        success: true
      });
      
      // Clean up tracking
      poolStats.delete(event.requestId);
      
      this.emit('commandCompleted', {
        poolName,
        command: event.commandName,
        duration,
        success: true
      });
    }
  }

  trackCommandFailure(poolName, event) {
    const poolStats = this.metrics.operationStats.get(poolName);
    const commandInfo = poolStats.get(event.requestId);
    
    if (commandInfo) {
      const duration = Date.now() - commandInfo.startTime;
      
      // Update failure statistics
      const poolInfo = this.pools.get(poolName);
      poolInfo.stats.failedOperations++;
      
      // Update error statistics
      if (!this.metrics.errorStats.has(poolName)) {
        this.metrics.errorStats.set(poolName, new Map());
      }
      
      const errorStats = this.metrics.errorStats.get(poolName);
      const errorKey = `${event.failure.codeName || 'UnknownError'}`;
      const currentCount = errorStats.get(errorKey) || 0;
      errorStats.set(errorKey, currentCount + 1);
      
      // Store performance history
      this.metrics.performanceHistory.push({
        poolName: poolName,
        command: event.commandName,
        duration: duration,
        timestamp: new Date(),
        success: false,
        error: event.failure
      });
      
      // Update circuit breaker if enabled
      if (this.config.enableCircuitBreaker) {
        this.updateCircuitBreaker(event.failure);
      }
      
      // Clean up tracking
      poolStats.delete(event.requestId);
      
      this.emit('commandFailed', {
        poolName,
        command: event.commandName,
        duration,
        error: event.failure
      });
    }
  }

  async setupConnectionMonitoring() {
    console.log('Setting up connection pool monitoring...');
    
    const monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
        await this.collectConnectionMetrics();
        await this.optimizeConnectionPools();
        
      } catch (error) {
        console.error('Error during connection monitoring:', error);
      }
    }, this.config.monitoringInterval);
    
    this.monitoringIntervals.set('health_monitoring', monitoringInterval);
  }

  async performHealthChecks() {
    for (const [poolName, poolInfo] of this.pools.entries()) {
      try {
        const client = poolInfo.client;
        
        // Perform ping to check connection health
        const pingStart = Date.now();
        await client.db('admin').admin().ping();
        const pingDuration = Date.now() - pingStart;
        
        // Update health status
        poolInfo.healthStatus = pingDuration < 1000 ? 'healthy' : 
                              pingDuration < 5000 ? 'degraded' : 'unhealthy';
        poolInfo.lastHealthCheck = new Date();
        poolInfo.lastPingDuration = pingDuration;
        
        // Emit health status event
        this.emit('healthCheck', {
          poolName,
          healthStatus: poolInfo.healthStatus,
          pingDuration
        });
        
      } catch (error) {
        console.error(`Health check failed for pool '${poolName}':`, error);
        
        poolInfo.healthStatus = 'unhealthy';
        poolInfo.lastHealthCheck = new Date();
        poolInfo.lastError = error;
        
        this.emit('healthCheckFailed', { poolName, error });
      }
    }
  }

  async collectConnectionMetrics() {
    for (const [poolName, poolInfo] of this.pools.entries()) {
      try {
        const client = poolInfo.client;
        
        // Get server status for connection metrics
        const serverStatus = await client.db('admin').admin().serverStatus();
        const connections = serverStatus.connections;
        
        // Update pool metrics
        if (!this.metrics.connectionPools.has(poolName)) {
          this.metrics.connectionPools.set(poolName, {});
        }
        
        const poolMetrics = this.metrics.connectionPools.get(poolName);
        Object.assign(poolMetrics, {
          current: connections.current,
          available: connections.available,
          totalCreated: connections.totalCreated,
          active: connections.active || 0,
          
          // Pool-specific statistics
          poolUtilization: (poolInfo.stats.connectionsInUse / this.config.maxPoolSize) * 100,
          averageOperationTime: poolInfo.stats.averageOperationTime,
          operationsPerSecond: this.calculateOperationsPerSecond(poolName),
          errorRate: this.calculateErrorRate(poolName),
          
          lastUpdated: new Date()
        });
        
      } catch (error) {
        console.warn(`Error collecting metrics for pool '${poolName}':`, error.message);
      }
    }
  }

  calculateOperationsPerSecond(poolName) {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    const recentOperations = this.metrics.performanceHistory.filter(
      op => op.poolName === poolName && 
            op.timestamp.getTime() > oneSecondAgo
    );
    
    return recentOperations.length;
  }

  calculateErrorRate(poolName) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentOperations = this.metrics.performanceHistory.filter(
      op => op.poolName === poolName && 
            op.timestamp.getTime() > oneMinuteAgo
    );
    
    if (recentOperations.length === 0) return 0;
    
    const failedOperations = recentOperations.filter(op => !op.success);
    return (failedOperations.length / recentOperations.length) * 100;
  }

  async optimizeConnectionPools() {
    for (const [poolName, poolInfo] of this.pools.entries()) {
      try {
        const poolMetrics = this.metrics.connectionPools.get(poolName);
        if (!poolMetrics) continue;
        
        // Analyze pool performance and suggest optimizations
        const optimizationRecommendations = this.analyzePoolPerformance(poolName, poolMetrics);
        
        // Apply automatic optimizations if enabled
        if (optimizationRecommendations.length > 0) {
          console.log(`Optimization recommendations for pool '${poolName}':`, optimizationRecommendations);
          
          this.emit('optimizationRecommendations', {
            poolName,
            recommendations: optimizationRecommendations
          });
        }
        
      } catch (error) {
        console.warn(`Error optimizing pool '${poolName}':`, error.message);
      }
    }
  }

  analyzePoolPerformance(poolName, poolMetrics) {
    const recommendations = [];
    
    // High utilization check
    if (poolMetrics.poolUtilization > 90) {
      recommendations.push({
        type: 'scale_up',
        priority: 'high',
        message: 'Pool utilization is very high, consider increasing maxPoolSize',
        currentValue: this.config.maxPoolSize,
        suggestedValue: Math.min(this.config.maxPoolSize * 1.5, 100)
      });
    }
    
    // Low utilization check
    if (poolMetrics.poolUtilization < 10 && this.config.maxPoolSize > 10) {
      recommendations.push({
        type: 'scale_down',
        priority: 'low',
        message: 'Pool utilization is low, consider decreasing maxPoolSize to save resources',
        currentValue: this.config.maxPoolSize,
        suggestedValue: Math.max(this.config.maxPoolSize * 0.8, 5)
      });
    }
    
    // High error rate check
    if (poolMetrics.errorRate > 5) {
      recommendations.push({
        type: 'investigate_errors',
        priority: 'high',
        message: 'High error rate detected, investigate connection issues',
        errorRate: poolMetrics.errorRate
      });
    }
    
    // Slow operations check
    if (poolMetrics.averageOperationTime > 1000) {
      recommendations.push({
        type: 'performance_tuning',
        priority: 'medium',
        message: 'Average operation time is high, consider query optimization or read preference tuning',
        averageTime: poolMetrics.averageOperationTime
      });
    }
    
    return recommendations;
  }

  async warmupConnectionPool(poolName) {
    console.log(`Warming up connection pool: ${poolName}`);
    
    try {
      const poolInfo = this.pools.get(poolName);
      if (!poolInfo) {
        throw new Error(`Connection pool '${poolName}' not found`);
      }
      
      const client = poolInfo.client;
      const minConnections = this.config.minPoolSize;
      
      // Pre-create minimum number of connections
      const warmupPromises = [];
      for (let i = 0; i < minConnections; i++) {
        warmupPromises.push(
          client.db('admin').admin().ping().catch(error => {
            console.warn(`Warmup connection ${i} failed:`, error.message);
          })
        );
      }
      
      await Promise.allSettled(warmupPromises);
      
      console.log(`Connection pool '${poolName}' warmed up successfully`);
      
      this.emit('poolWarmedUp', { poolName, minConnections });
      
    } catch (error) {
      console.error(`Error warming up pool '${poolName}':`, error);
      throw error;
    }
  }

  async getConnectionPoolStats(poolName = null) {
    const stats = {};
    
    const poolsToCheck = poolName ? [poolName] : Array.from(this.pools.keys());
    
    for (const name of poolsToCheck) {
      const poolInfo = this.pools.get(name);
      const poolMetrics = this.metrics.connectionPools.get(name);
      
      if (poolInfo) {
        stats[name] = {
          // Basic pool information
          configuration: {
            minPoolSize: this.config.minPoolSize,
            maxPoolSize: this.config.maxPoolSize,
            maxIdleTimeMS: this.config.maxIdleTimeMS,
            readPreference: this.config.readPreference
          },
          
          // Current pool statistics
          current: poolMetrics ? {
            connections: {
              current: poolMetrics.current || 0,
              available: poolMetrics.available || 0,
              inUse: poolInfo.stats.connectionsInUse,
              created: poolInfo.stats.connectionsCreated,
              closed: poolInfo.stats.connectionsClosed
            },
            
            performance: {
              utilization: poolMetrics.poolUtilization || 0,
              averageOperationTime: poolInfo.stats.averageOperationTime,
              operationsPerSecond: poolMetrics.operationsPerSecond || 0,
              totalOperations: poolInfo.stats.totalOperations,
              failedOperations: poolInfo.stats.failedOperations,
              errorRate: poolMetrics.errorRate || 0
            },
            
            health: {
              status: poolInfo.healthStatus,
              lastHealthCheck: poolInfo.lastHealthCheck,
              lastPingDuration: poolInfo.lastPingDuration || null,
              lastError: poolInfo.lastError ? poolInfo.lastError.message : null
            }
          } : null,
          
          // Historical data
          recentPerformance: this.getRecentPerformanceData(name),
          errorBreakdown: this.getErrorBreakdown(name)
        };
      }
    }
    
    return poolName ? stats[poolName] : stats;
  }

  getRecentPerformanceData(poolName, minutes = 10) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    
    return this.metrics.performanceHistory
      .filter(op => op.poolName === poolName && op.timestamp.getTime() > cutoff)
      .map(op => ({
        command: op.command,
        duration: op.duration,
        timestamp: op.timestamp,
        success: op.success
      }));
  }

  getErrorBreakdown(poolName) {
    const errorStats = this.metrics.errorStats.get(poolName);
    if (!errorStats) return {};
    
    const breakdown = {};
    for (const [errorType, count] of errorStats.entries()) {
      breakdown[errorType] = count;
    }
    
    return breakdown;
  }

  updateCircuitBreaker(error) {
    const now = Date.now();
    
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = now;
    
    if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
      if (this.circuitBreaker.state !== 'open') {
        console.warn('Circuit breaker opened due to high failure rate');
        this.circuitBreaker.state = 'open';
        this.circuitBreaker.nextRetryTime = now + this.config.circuitBreakerTimeout;
        
        this.emit('circuitBreakerOpened', {
          failures: this.circuitBreaker.failures,
          threshold: this.config.circuitBreakerThreshold
        });
      }
    }
  }

  async closeConnectionPool(poolName) {
    console.log(`Closing connection pool: ${poolName}`);
    
    try {
      const poolInfo = this.pools.get(poolName);
      if (!poolInfo) {
        throw new Error(`Connection pool '${poolName}' not found`);
      }
      
      // Close the MongoDB client
      await poolInfo.client.close();
      
      // Remove from pools
      this.pools.delete(poolName);
      
      // Clean up metrics
      this.metrics.connectionPools.delete(poolName);
      this.metrics.errorStats.delete(poolName);
      this.metrics.operationStats.delete(poolName);
      
      console.log(`Connection pool '${poolName}' closed successfully`);
      
      this.emit('poolClosed', { poolName });
      
    } catch (error) {
      console.error(`Error closing connection pool '${poolName}':`, error);
      throw error;
    }
  }

  async closeAllPools() {
    console.log('Closing all connection pools...');
    
    const closePromises = [];
    for (const poolName of this.pools.keys()) {
      closePromises.push(this.closeConnectionPool(poolName));
    }
    
    await Promise.allSettled(closePromises);
    
    // Clear monitoring intervals
    for (const [name, interval] of this.monitoringIntervals.entries()) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();
    
    console.log('All connection pools closed');
    this.emit('allPoolsClosed');
  }
}

// Benefits of MongoDB Advanced Connection Pooling:
// - Intelligent connection pool sizing with automatic optimization
// - Comprehensive connection lifecycle management and monitoring
// - Advanced performance tracking and metrics collection
// - Built-in error handling with circuit breaker patterns
// - Automatic failover and recovery mechanisms
// - Health monitoring with proactive connection management
// - Load balancing and intelligent connection routing
// - Production-ready connection pooling with minimal configuration
// - Real-time performance analysis and optimization recommendations
// - SQL-compatible connection management through QueryLeaf integration

module.exports = {
  AdvancedConnectionPoolManager
};
```

## Understanding MongoDB Connection Pooling Architecture

### Advanced Connection Management and Performance Optimization Strategies

Implement sophisticated connection pooling patterns for production MongoDB deployments:

```javascript
// Production-ready MongoDB connection pooling with enterprise-grade optimization
class ProductionConnectionManager extends AdvancedConnectionPoolManager {
  constructor(connectionString, productionConfig) {
    super(connectionString, productionConfig);
    
    this.productionConfig = {
      ...productionConfig,
      enableDistributedPooling: true,
      enableLoadBalancingOptimization: true,
      enableCapacityPlanning: true,
      enableAutomaticScaling: true,
      enableComplianceAuditing: true,
      enableSecurityMonitoring: true
    };
    
    this.setupProductionOptimizations();
    this.initializeDistributedPooling();
    this.setupCapacityPlanning();
  }

  async implementDistributedConnectionPooling() {
    console.log('Implementing distributed connection pooling across multiple nodes...');
    
    const distributedStrategy = {
      // Multi-node connection distribution
      nodeDistribution: {
        enableGeoAware: true,
        preferLocalConnections: true,
        enableFailoverRouting: true,
        optimizeForLatency: true
      },
      
      // Load balancing strategies
      loadBalancing: {
        roundRobinOptimization: true,
        weightedDistribution: true,
        connectionAffinityOptimization: true,
        realTimeLoadAdjustment: true
      },
      
      // Performance optimization
      performanceOptimization: {
        connectionPoolSharding: true,
        intelligentConnectionRouting: true,
        predictiveScaling: true,
        resourceUtilizationOptimization: true
      }
    };

    return await this.deployDistributedPooling(distributedStrategy);
  }

  async setupAdvancedConnectionOptimization() {
    console.log('Setting up advanced connection optimization strategies...');
    
    const optimizationStrategies = {
      // Connection lifecycle optimization
      lifecycleOptimization: {
        connectionWarmupStrategies: true,
        intelligentIdleManagement: true,
        predictiveConnectionCreation: true,
        optimizedConnectionReuse: true
      },
      
      // Performance monitoring and tuning
      performanceTuning: {
        realTimePerformanceAnalysis: true,
        automaticParameterTuning: true,
        connectionLatencyOptimization: true,
        throughputMaximization: true
      },
      
      // Resource utilization optimization
      resourceOptimization: {
        memoryPoolingOptimization: true,
        networkBandwidthOptimization: true,
        cpuUtilizationOptimization: true,
        diskIOOptimization: true
      }
    };

    return await this.deployOptimizationStrategies(optimizationStrategies);
  }
}
```

## SQL-Style Connection Pooling with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB connection pooling and performance optimization:

```sql
-- QueryLeaf advanced connection pooling with SQL-familiar syntax for MongoDB

-- Configure connection pool settings with comprehensive optimization
CONFIGURE CONNECTION_POOL 
SET pool_name = 'production_pool',
    min_connections = 10,
    max_connections = 100,
    connection_timeout_ms = 30000,
    idle_timeout_ms = 300000,
    max_idle_time_ms = 600000,
    socket_timeout_ms = 120000,
    server_selection_timeout_ms = 30000,
    heartbeat_frequency_ms = 10000,
    
    -- Read and write preferences
    read_preference = 'primaryPreferred',
    read_concern = 'majority',
    write_concern = 'majority',
    max_staleness_seconds = 90,
    
    -- Performance optimization
    enable_load_balancing = true,
    enable_connection_warming = true,
    enable_intelligent_routing = true,
    enable_automatic_failover = true,
    
    -- Monitoring and health checks
    enable_monitoring = true,
    monitoring_interval_ms = 30000,
    enable_performance_tracking = true,
    enable_connection_events = true,
    
    -- Error handling and circuit breaker
    enable_circuit_breaker = true,
    circuit_breaker_threshold = 10,
    circuit_breaker_timeout_ms = 60000,
    max_retries = 3,
    retry_delay_ms = 1000;

-- Advanced connection pool monitoring and analytics
WITH connection_pool_metrics AS (
  SELECT 
    pool_name,
    DATE_TRUNC('minute', event_timestamp) as time_bucket,
    
    -- Connection utilization metrics
    AVG(connections_active) as avg_active_connections,
    AVG(connections_available) as avg_available_connections,
    MAX(connections_active) as peak_active_connections,
    AVG(pool_utilization_percent) as avg_pool_utilization,
    
    -- Performance metrics
    COUNT(*) FILTER (WHERE event_type = 'connection_created') as connections_created,
    COUNT(*) FILTER (WHERE event_type = 'connection_closed') as connections_closed,
    COUNT(*) FILTER (WHERE event_type = 'connection_checkout_failed') as checkout_failures,
    
    -- Operation performance
    AVG(operation_duration_ms) as avg_operation_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY operation_duration_ms) as p95_operation_duration,
    COUNT(*) FILTER (WHERE operation_success = true) as successful_operations,
    COUNT(*) FILTER (WHERE operation_success = false) as failed_operations,
    
    -- Connection lifecycle analysis
    AVG(connection_lifetime_seconds) as avg_connection_lifetime,
    AVG(connection_idle_time_seconds) as avg_connection_idle_time,
    MAX(connection_wait_time_ms) as max_checkout_wait_time,
    
    -- Error analysis
    COUNT(*) FILTER (WHERE error_category = 'timeout') as timeout_errors,
    COUNT(*) FILTER (WHERE error_category = 'network') as network_errors,
    COUNT(*) FILTER (WHERE error_category = 'authentication') as auth_errors,
    COUNT(*) FILTER (WHERE error_category = 'server_selection') as server_selection_errors
    
  FROM connection_pool_events
  WHERE event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  GROUP BY pool_name, DATE_TRUNC('minute', event_timestamp)
),

performance_analysis AS (
  SELECT 
    cpm.*,
    
    -- Utilization efficiency calculations
    CASE 
      WHEN avg_pool_utilization > 90 THEN 'over_utilized'
      WHEN avg_pool_utilization > 70 THEN 'well_utilized'
      WHEN avg_pool_utilization > 30 THEN 'under_utilized'
      ELSE 'severely_under_utilized'
    END as utilization_status,
    
    -- Performance classification
    CASE 
      WHEN avg_operation_duration < 100 THEN 'excellent'
      WHEN avg_operation_duration < 500 THEN 'good'
      WHEN avg_operation_duration < 1000 THEN 'acceptable'
      ELSE 'poor'
    END as performance_classification,
    
    -- Error rate calculations
    CASE 
      WHEN successful_operations + failed_operations > 0 THEN
        ROUND((failed_operations * 100.0) / (successful_operations + failed_operations), 2)
      ELSE 0
    END as error_rate_percent,
    
    -- Connection efficiency metrics
    CASE 
      WHEN connections_created > 0 THEN
        ROUND(avg_connection_lifetime / 60.0, 1)  -- Average lifetime in minutes
      ELSE 0
    END as avg_connection_lifetime_minutes,
    
    -- Checkout performance assessment
    CASE 
      WHEN checkout_failures > 0 AND connections_created > 0 THEN
        ROUND((checkout_failures * 100.0) / connections_created, 2)
      ELSE 0
    END as checkout_failure_rate_percent,
    
    -- Trend analysis
    LAG(avg_active_connections) OVER (
      PARTITION BY pool_name 
      ORDER BY time_bucket
    ) as prev_avg_active_connections,
    
    LAG(avg_operation_duration) OVER (
      PARTITION BY pool_name 
      ORDER BY time_bucket
    ) as prev_avg_operation_duration
    
  FROM connection_pool_metrics cpm
),

optimization_recommendations AS (
  SELECT 
    pa.*,
    
    -- Generate optimization recommendations based on analysis
    ARRAY[
      CASE WHEN utilization_status = 'over_utilized' 
           THEN 'Increase max_connections to handle higher load' END,
      CASE WHEN utilization_status = 'severely_under_utilized' 
           THEN 'Decrease max_connections to save resources' END,
      CASE WHEN performance_classification = 'poor' 
           THEN 'Investigate slow operations and consider index optimization' END,
      CASE WHEN error_rate_percent > 5 
           THEN 'High error rate detected - investigate connection issues' END,
      CASE WHEN checkout_failure_rate_percent > 10 
           THEN 'High checkout failure rate - increase connection pool size or timeout' END,
      CASE WHEN max_checkout_wait_time > 5000 
           THEN 'Long checkout wait times - optimize connection allocation' END,
      CASE WHEN avg_connection_lifetime_minutes < 1 
           THEN 'Short connection lifetimes - investigate connection recycling' END,
      CASE WHEN timeout_errors > 10 
           THEN 'High timeout errors - increase timeout values or optimize queries' END,
      CASE WHEN network_errors > 5 
           THEN 'Network connectivity issues detected - check network stability' END
    ]::TEXT[] as optimization_recommendations,
    
    -- Performance trend indicators
    CASE 
      WHEN prev_avg_active_connections IS NOT NULL AND prev_avg_active_connections > 0 THEN
        ROUND(((avg_active_connections - prev_avg_active_connections) / prev_avg_active_connections) * 100, 1)
      ELSE NULL
    END as connection_usage_trend_percent,
    
    CASE 
      WHEN prev_avg_operation_duration IS NOT NULL AND prev_avg_operation_duration > 0 THEN
        ROUND(((avg_operation_duration - prev_avg_operation_duration) / prev_avg_operation_duration) * 100, 1)
      ELSE NULL
    END as performance_trend_percent,
    
    -- Capacity planning indicators
    CASE 
      WHEN peak_active_connections / NULLIF(CAST(CURRENT_SETTING('max_connections') AS INTEGER), 0) > 0.8 
      THEN 'approaching_capacity_limit'
      WHEN peak_active_connections / NULLIF(CAST(CURRENT_SETTING('max_connections') AS INTEGER), 0) > 0.6 
      THEN 'moderate_capacity_usage'
      ELSE 'sufficient_capacity'
    END as capacity_status
    
  FROM performance_analysis pa
)

SELECT 
  pool_name,
  time_bucket,
  
  -- Connection pool utilization summary
  ROUND(avg_active_connections, 1) as avg_active_connections,
  ROUND(avg_available_connections, 1) as avg_available_connections,
  peak_active_connections,
  ROUND(avg_pool_utilization, 1) as pool_utilization_percent,
  utilization_status,
  
  -- Performance summary
  ROUND(avg_operation_duration, 1) as avg_operation_time_ms,
  ROUND(p95_operation_duration, 1) as p95_operation_time_ms,
  performance_classification,
  
  -- Connection lifecycle summary
  connections_created,
  connections_closed,
  ROUND(avg_connection_lifetime_minutes, 1) as avg_connection_lifetime_minutes,
  max_checkout_wait_time as max_wait_time_ms,
  
  -- Error and reliability summary
  successful_operations,
  failed_operations,
  error_rate_percent,
  checkout_failure_rate_percent,
  
  -- Error breakdown
  timeout_errors,
  network_errors,
  auth_errors,
  server_selection_errors,
  
  -- Trend analysis
  connection_usage_trend_percent,
  performance_trend_percent,
  
  -- Capacity and recommendations
  capacity_status,
  ARRAY_REMOVE(optimization_recommendations, NULL) as recommendations,
  
  -- Health indicator
  CASE 
    WHEN error_rate_percent > 10 OR checkout_failure_rate_percent > 20 THEN 'critical'
    WHEN error_rate_percent > 5 OR performance_classification = 'poor' THEN 'warning'
    WHEN utilization_status = 'over_utilized' THEN 'stressed'
    ELSE 'healthy'
  END as overall_health_status
  
FROM optimization_recommendations
WHERE ARRAY_LENGTH(ARRAY_REMOVE(optimization_recommendations, NULL), 1) > 0 
   OR error_rate_percent > 1 
   OR utilization_status IN ('over_utilized', 'severely_under_utilized')
ORDER BY time_bucket DESC, pool_name;

-- Advanced connection pool configuration optimization
WITH current_pool_configuration AS (
  SELECT 
    pool_name,
    current_min_connections,
    current_max_connections,
    current_connection_timeout_ms,
    current_idle_timeout_ms,
    current_socket_timeout_ms,
    
    -- Historical performance metrics
    AVG(pool_utilization_percent) as avg_historical_utilization,
    MAX(peak_active_connections) as historical_peak_connections,
    AVG(avg_operation_duration_ms) as avg_historical_operation_time,
    AVG(error_rate_percent) as avg_historical_error_rate,
    COUNT(*) as historical_data_points
    
  FROM connection_pool_performance_history
  WHERE measurement_date >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY pool_name, current_min_connections, current_max_connections,
           current_connection_timeout_ms, current_idle_timeout_ms, current_socket_timeout_ms
),

workload_analysis AS (
  SELECT 
    pool_name,
    DATE_TRUNC('hour', operation_timestamp) as hour_bucket,
    
    -- Workload pattern analysis
    COUNT(*) as operations_per_hour,
    AVG(concurrent_operations) as avg_concurrency,
    MAX(concurrent_operations) as peak_concurrency,
    AVG(operation_duration_ms) as avg_operation_duration,
    
    -- Connection demand patterns
    AVG(active_connections) as avg_connections_needed,
    MAX(active_connections) as peak_connections_needed,
    AVG(connection_wait_time_ms) as avg_wait_time,
    COUNT(*) FILTER (WHERE connection_wait_time_ms > 1000) as long_wait_operations,
    
    -- Error patterns
    COUNT(*) FILTER (WHERE operation_result = 'timeout') as timeout_operations,
    COUNT(*) FILTER (WHERE operation_result = 'connection_error') as connection_errors
    
  FROM connection_operation_log
  WHERE operation_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
  GROUP BY pool_name, DATE_TRUNC('hour', operation_timestamp)
),

capacity_planning AS (
  SELECT 
    cpc.pool_name,
    
    -- Current configuration assessment
    cpc.current_min_connections,
    cpc.current_max_connections,
    cpc.avg_historical_utilization,
    cpc.historical_peak_connections,
    
    -- Workload-based recommendations
    CEIL(AVG(wa.peak_connections_needed) * 1.2) as recommended_max_connections,
    CEIL(AVG(wa.avg_connections_needed) * 0.8) as recommended_min_connections,
    
    -- Performance-based timeout recommendations
    CASE 
      WHEN AVG(wa.avg_wait_time) > 2000 THEN LEAST(cpc.current_connection_timeout_ms * 1.5, 60000)
      WHEN AVG(wa.avg_wait_time) < 100 THEN GREATEST(cpc.current_connection_timeout_ms * 0.8, 10000)
      ELSE cpc.current_connection_timeout_ms
    END as recommended_connection_timeout_ms,
    
    -- Idle timeout optimization
    CASE 
      WHEN AVG(wa.operations_per_hour) > 1000 THEN 180000  -- 3 minutes for high-traffic
      WHEN AVG(wa.operations_per_hour) > 100 THEN 300000   -- 5 minutes for medium-traffic
      ELSE 600000  -- 10 minutes for low-traffic
    END as recommended_idle_timeout_ms,
    
    -- Configuration change justification
    CASE 
      WHEN CEIL(AVG(wa.peak_connections_needed) * 1.2) > cpc.current_max_connections THEN 
        'Increase max connections to handle peak load'
      WHEN CEIL(AVG(wa.peak_connections_needed) * 1.2) < cpc.current_max_connections * 0.7 THEN 
        'Decrease max connections to optimize resource usage'
      ELSE 'Current max connections are appropriately sized'
    END as max_connections_justification,
    
    CASE 
      WHEN CEIL(AVG(wa.avg_connections_needed) * 0.8) > cpc.current_min_connections THEN 
        'Increase min connections to reduce startup latency'
      WHEN CEIL(AVG(wa.avg_connections_needed) * 0.8) < cpc.current_min_connections * 0.5 THEN 
        'Decrease min connections to reduce resource overhead'
      ELSE 'Current min connections are appropriately sized'
    END as min_connections_justification,
    
    -- Performance impact assessment
    AVG(wa.avg_operation_duration) as avg_operation_performance,
    SUM(wa.long_wait_operations) as total_long_wait_operations,
    AVG(wa.timeout_operations) as avg_timeout_operations_per_hour,
    
    -- Resource efficiency metrics
    ROUND(
      (AVG(wa.avg_connections_needed) / NULLIF(cpc.current_max_connections, 0)) * 100, 
      2
    ) as resource_efficiency_percent
    
  FROM current_pool_configuration cpc
  JOIN workload_analysis wa ON cpc.pool_name = wa.pool_name
  GROUP BY cpc.pool_name, cpc.current_min_connections, cpc.current_max_connections,
           cpc.current_connection_timeout_ms, cpc.current_idle_timeout_ms,
           cpc.avg_historical_utilization, cpc.historical_peak_connections
)

SELECT 
  pool_name,
  
  -- Current configuration
  current_min_connections,
  current_max_connections,
  ROUND(resource_efficiency_percent, 1) as current_efficiency_percent,
  
  -- Recommended configuration
  recommended_min_connections,
  recommended_max_connections,
  recommended_connection_timeout_ms,
  recommended_idle_timeout_ms,
  
  -- Configuration change analysis
  (recommended_max_connections - current_max_connections) as max_connections_change,
  (recommended_min_connections - current_min_connections) as min_connections_change,
  max_connections_justification,
  min_connections_justification,
  
  -- Performance impact prediction
  ROUND(avg_operation_performance, 1) as current_avg_operation_ms,
  total_long_wait_operations,
  ROUND(avg_timeout_operations_per_hour, 1) as avg_timeouts_per_hour,
  
  -- Expected improvements
  CASE 
    WHEN recommended_max_connections > current_max_connections THEN
      'Expect reduced wait times and fewer timeout errors'
    WHEN recommended_max_connections < current_max_connections THEN
      'Expect reduced resource usage with minimal performance impact'
    ELSE 'Configuration is optimal for current workload'
  END as expected_performance_impact,
  
  -- Implementation priority
  CASE 
    WHEN total_long_wait_operations > 100 OR avg_timeout_operations_per_hour > 5 THEN 'high'
    WHEN ABS(recommended_max_connections - current_max_connections) > current_max_connections * 0.2 THEN 'medium'
    WHEN resource_efficiency_percent < 30 OR resource_efficiency_percent > 90 THEN 'medium'
    ELSE 'low'
  END as implementation_priority,
  
  -- Recommended action
  CASE 
    WHEN implementation_priority = 'high' THEN
      FORMAT('IMMEDIATE ACTION: Update pool configuration - Max: %s->%s, Min: %s->%s',
             current_max_connections, recommended_max_connections,
             current_min_connections, recommended_min_connections)
    WHEN implementation_priority = 'medium' THEN
      FORMAT('SCHEDULE UPDATE: Adjust pool settings during maintenance window')
    ELSE
      'MONITOR: Current configuration is adequate'
  END as recommended_action
  
FROM capacity_planning
ORDER BY 
  CASE implementation_priority 
    WHEN 'high' THEN 1 
    WHEN 'medium' THEN 2 
    ELSE 3 
  END,
  total_long_wait_operations DESC,
  pool_name;

-- Real-time connection pool health dashboard
CREATE VIEW connection_pool_health_dashboard AS
WITH real_time_metrics AS (
  SELECT 
    -- Current timestamp for real-time display
    CURRENT_TIMESTAMP as dashboard_time,
    
    -- Pool status overview
    (SELECT COUNT(*) FROM active_connection_pools) as total_active_pools,
    (SELECT COUNT(*) FROM active_connection_pools WHERE health_status = 'healthy') as healthy_pools,
    (SELECT COUNT(*) FROM active_connection_pools WHERE health_status = 'warning') as warning_pools,
    (SELECT COUNT(*) FROM active_connection_pools WHERE health_status = 'critical') as critical_pools,
    
    -- Connection utilization across all pools
    (SELECT SUM(current_active_connections) FROM active_connection_pools) as total_active_connections,
    (SELECT SUM(current_available_connections) FROM active_connection_pools) as total_available_connections,
    (SELECT SUM(max_pool_size) FROM active_connection_pools) as total_max_connections,
    
    -- Performance indicators
    (SELECT AVG(avg_operation_duration_ms) 
     FROM connection_pool_performance 
     WHERE measurement_time >= CURRENT_TIMESTAMP - INTERVAL '5 minutes') as system_avg_operation_time,
     
    (SELECT SUM(operations_per_second) 
     FROM connection_pool_performance 
     WHERE measurement_time >= CURRENT_TIMESTAMP - INTERVAL '1 minute') as system_operations_per_second,
     
    -- Error indicators
    (SELECT COUNT(*) 
     FROM connection_errors 
     WHERE error_timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes') as recent_errors,
     
    (SELECT COUNT(*) 
     FROM connection_timeouts 
     WHERE timeout_timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes') as recent_timeouts,
     
    -- Capacity indicators
    (SELECT COUNT(*) 
     FROM connection_pools 
     WHERE current_utilization_percent > 80) as pools_near_capacity,
     
    (SELECT COUNT(*) 
     FROM connection_pools 
     WHERE checkout_queue_length > 5) as pools_with_queues
),

pool_details AS (
  SELECT 
    pool_name,
    health_status,
    current_active_connections,
    max_pool_size,
    ROUND(current_utilization_percent, 1) as utilization_percent,
    avg_operation_duration_ms,
    operations_per_second,
    error_rate_percent,
    last_health_check,
    
    -- Status indicators
    CASE 
      WHEN health_status = 'critical' THEN '🔴'
      WHEN health_status = 'warning' THEN '🟡'
      ELSE '🟢'
    END as status_indicator
    
  FROM active_connection_pools
  ORDER BY 
    CASE health_status 
      WHEN 'critical' THEN 1 
      WHEN 'warning' THEN 2 
      ELSE 3 
    END,
    current_utilization_percent DESC
)

SELECT 
  dashboard_time,
  
  -- System overview
  total_active_pools,
  FORMAT('%s healthy, %s warning, %s critical', 
         healthy_pools, warning_pools, critical_pools) as pool_health_summary,
  
  -- Connection utilization
  total_active_connections,
  total_available_connections,
  total_max_connections,
  ROUND((total_active_connections::DECIMAL / total_max_connections) * 100, 1) as system_utilization_percent,
  
  -- Performance indicators
  ROUND(system_avg_operation_time::NUMERIC, 1) as avg_operation_time_ms,
  ROUND(system_operations_per_second::NUMERIC, 0) as operations_per_second,
  
  -- Health indicators
  recent_errors,
  recent_timeouts,
  pools_near_capacity,
  pools_with_queues,
  
  -- Overall system health
  CASE 
    WHEN critical_pools > 0 OR recent_errors > 20 OR pools_near_capacity > total_active_pools * 0.5 THEN 'CRITICAL'
    WHEN warning_pools > 0 OR recent_errors > 5 OR pools_near_capacity > 0 THEN 'WARNING'
    ELSE 'HEALTHY'
  END as system_health_status,
  
  -- Active alerts
  ARRAY[
    CASE WHEN critical_pools > 0 THEN FORMAT('%s pools in critical state', critical_pools) END,
    CASE WHEN pools_near_capacity > 2 THEN FORMAT('%s pools near capacity limit', pools_near_capacity) END,
    CASE WHEN recent_errors > 10 THEN FORMAT('%s connection errors in last 5 minutes', recent_errors) END,
    CASE WHEN recent_timeouts > 5 THEN FORMAT('%s connection timeouts detected', recent_timeouts) END,
    CASE WHEN system_avg_operation_time > 1000 THEN 'High average operation latency detected' END
  ]::TEXT[] as active_alerts,
  
  -- Pool details for monitoring dashboard
  (SELECT JSON_AGG(
    JSON_BUILD_OBJECT(
      'pool_name', pool_name,
      'status', status_indicator || ' ' || health_status,
      'connections', current_active_connections || '/' || max_pool_size,
      'utilization', utilization_percent || '%',
      'performance', avg_operation_duration_ms || 'ms',
      'throughput', operations_per_second || ' ops/s',
      'error_rate', error_rate_percent || '%'
    )
  ) FROM pool_details) as pool_status_details

FROM real_time_metrics;

-- QueryLeaf provides comprehensive connection pooling capabilities:
-- 1. SQL-familiar syntax for MongoDB connection pool configuration
-- 2. Advanced performance monitoring and optimization recommendations
-- 3. Intelligent connection lifecycle management with automatic scaling
-- 4. Comprehensive error handling and circuit breaker patterns
-- 5. Real-time health monitoring with proactive alerting
-- 6. Capacity planning and workload analysis for optimal sizing
-- 7. Production-ready connection management with minimal configuration
-- 8. Integration with MongoDB's native connection pooling optimizations
-- 9. Advanced analytics for connection performance and resource utilization
-- 10. Automated optimization recommendations based on workload patterns
```

## Best Practices for Production Connection Pooling

### Connection Pool Strategy Design

Essential principles for effective MongoDB connection pooling deployment:

1. **Pool Sizing Strategy**: Configure optimal pool sizes based on application concurrency patterns and system resources
2. **Timeout Management**: Set appropriate connection, socket, and operation timeouts for reliable connection handling
3. **Health Monitoring**: Implement comprehensive connection health monitoring with proactive alerting and recovery
4. **Load Balancing**: Design intelligent connection distribution strategies for optimal resource utilization
5. **Error Handling**: Configure robust error handling with retry logic, circuit breakers, and graceful degradation
6. **Performance Optimization**: Monitor connection performance metrics and implement automatic optimization strategies

### Scalability and Production Deployment

Optimize connection pooling for enterprise-scale requirements:

1. **Distributed Pooling**: Implement distributed connection pooling strategies for multi-node deployments
2. **Capacity Planning**: Monitor historical patterns and predict connection requirements for scaling decisions
3. **Security Integration**: Ensure connection pooling meets security, authentication, and compliance requirements
4. **Operational Integration**: Integrate connection monitoring with existing alerting and operational workflows
5. **Disaster Recovery**: Design connection pooling with failover capabilities and automatic recovery mechanisms
6. **Resource Optimization**: Monitor and optimize connection resource usage for cost-effective operations

## Conclusion

MongoDB connection pooling provides sophisticated database connection management capabilities that enable optimal performance, resource utilization, and reliability for production applications through intelligent connection lifecycle management, advanced monitoring, and automatic optimization features. The native connection pooling support ensures applications benefit from MongoDB's optimized connection handling with minimal configuration overhead.

Key MongoDB Connection Pooling benefits include:

- **Intelligent Resource Management**: Automated connection pool sizing and lifecycle management based on application workload patterns
- **Advanced Performance Monitoring**: Comprehensive connection performance tracking with real-time optimization recommendations
- **Production Reliability**: Built-in error handling, circuit breaker patterns, and automatic failover capabilities
- **Scalable Architecture**: Distributed connection pooling strategies that scale efficiently with application growth
- **Operational Excellence**: Enterprise-ready monitoring, alerting, and diagnostic capabilities for production environments
- **SQL Accessibility**: Familiar SQL-style connection management operations through QueryLeaf for accessible database connection optimization

Whether you're building high-concurrency web applications, microservices architectures, data processing pipelines, or enterprise database systems, MongoDB connection pooling with QueryLeaf's familiar SQL interface provides the foundation for efficient, reliable, and scalable database connection management.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB connection pooling while providing SQL-familiar syntax for connection management, performance monitoring, and optimization strategies. Advanced connection pooling patterns, health monitoring, and capacity planning are seamlessly handled through familiar SQL constructs, making sophisticated database connection management accessible to SQL-oriented development teams.

The combination of MongoDB's robust connection pooling capabilities with SQL-style connection management operations makes it an ideal platform for applications requiring both high-performance database connectivity and familiar database management patterns, ensuring your applications can maintain optimal performance and reliability as they scale and evolve.