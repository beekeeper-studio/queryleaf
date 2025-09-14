---
title: "MongoDB Connection Pooling and Performance Optimization: SQL-Style Database Connection Management for High-Throughput Applications"
description: "Master MongoDB connection pooling strategies for maximum performance. Learn connection pool sizing, monitoring, failover handling, and SQL-familiar database connection patterns for production-scale applications."
date: 2025-09-13
tags: [mongodb, connection-pooling, performance, optimization, concurrency, sql, database-connections]
---

# MongoDB Connection Pooling and Performance Optimization: SQL-Style Database Connection Management for High-Throughput Applications

Modern applications require efficient database connection management to handle hundreds or thousands of concurrent users while maintaining optimal performance and resource utilization. Traditional approaches of creating individual database connections for each request quickly exhaust system resources and create performance bottlenecks that severely impact application scalability and user experience.

MongoDB connection pooling provides sophisticated connection management that maintains a pool of persistent database connections, automatically handling connection lifecycle, load balancing, failover scenarios, and performance optimization. Unlike simple connection-per-request models, connection pooling delivers predictable performance characteristics, efficient resource utilization, and robust error handling for production-scale applications.

## The Database Connection Challenge

Traditional database connection approaches create significant scalability and performance issues:

```sql
-- Traditional per-request connection approach - inefficient and unscalable
-- Each request creates a new database connection
public class TraditionalDatabaseAccess {
    public List<User> getUsers(String filter) throws SQLException {
        // Create new connection for each request
        Connection conn = DriverManager.getConnection(
            "jdbc:postgresql://localhost:5432/appdb",
            "username", "password"
        );
        
        try {
            PreparedStatement stmt = conn.prepareStatement(
                "SELECT user_id, username, email, created_at " +
                "FROM users WHERE status = ? ORDER BY created_at DESC LIMIT 100"
            );
            stmt.setString(1, filter);
            
            ResultSet rs = stmt.executeQuery();
            List<User> users = new ArrayList<>();
            
            while (rs.next()) {
                users.add(new User(
                    rs.getInt("user_id"),
                    rs.getString("username"), 
                    rs.getString("email"),
                    rs.getTimestamp("created_at")
                ));
            }
            
            return users;
            
        } finally {
            // Close connection after each request
            conn.close(); // Expensive cleanup for each request
        }
    }
}

-- Problems with per-request connections:
-- 1. Connection establishment overhead (100-500ms per connection)
-- 2. Resource exhaustion under high concurrent load
-- 3. Database server connection limits exceeded quickly
-- 4. TCP socket exhaustion on application servers
-- 5. Unpredictable performance due to connection timing
-- 6. No connection reuse or optimization
-- 7. Difficult to implement failover and retry logic
-- 8. Memory leaks from improperly closed connections

-- Basic connection pooling attempt - still problematic
public class BasicConnectionPool {
    private static final int MAX_CONNECTIONS = 100;
    private Queue<Connection> availableConnections = new LinkedList<>();
    private Set<Connection> usedConnections = new HashSet<>();
    
    public Connection getConnection() throws SQLException {
        synchronized (this) {
            if (availableConnections.isEmpty()) {
                if (usedConnections.size() < MAX_CONNECTIONS) {
                    availableConnections.add(createNewConnection());
                } else {
                    throw new SQLException("Connection pool exhausted");
                }
            }
            
            Connection conn = availableConnections.poll();
            usedConnections.add(conn);
            return conn;
        }
    }
    
    public void releaseConnection(Connection conn) {
        synchronized (this) {
            usedConnections.remove(conn);
            availableConnections.offer(conn);
        }
    }
}

-- Problems with basic pooling:
-- - No connection validation or health checking
-- - No automatic recovery from stale connections
-- - Poor load balancing across multiple database servers
-- - No monitoring or performance metrics
-- - Synchronization bottlenecks under high concurrency
-- - No graceful handling of connection failures
-- - Fixed pool size regardless of actual demand
-- - No integration with application lifecycle management
```

MongoDB connection pooling with sophisticated management provides comprehensive solutions:

```javascript
// MongoDB advanced connection pooling - production-ready performance optimization
const { MongoClient, ServerApiVersion } = require('mongodb');

// Advanced connection pool configuration
const mongoClient = new MongoClient('mongodb://localhost:27017/production_db', {
  // Connection pool settings
  maxPoolSize: 100,          // Maximum connections in pool
  minPoolSize: 5,           // Minimum connections to maintain
  maxIdleTimeMS: 300000,    // Close connections after 5 minutes idle
  
  // Performance optimization
  maxConnecting: 2,         // Max concurrent connection attempts
  connectTimeoutMS: 10000,  // 10 second connection timeout
  socketTimeoutMS: 30000,   // 30 second socket timeout
  
  // High availability settings
  serverSelectionTimeoutMS: 5000,  // Server selection timeout
  heartbeatFrequencyMS: 10000,     // Health check frequency
  retryWrites: true,               // Automatic retry for write operations
  retryReads: true,                // Automatic retry for read operations
  
  // Read preference for load balancing
  readPreference: 'secondaryPreferred',
  readConcern: { level: 'majority' },
  
  // Write concern for durability
  writeConcern: { 
    w: 'majority', 
    j: true,
    wtimeoutMS: 10000 
  },
  
  // Compression for network efficiency
  compressors: ['zstd', 'zlib', 'snappy'],
  
  // Server API version for compatibility
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
});

// Efficient database operations with connection pooling
async function getUsersWithPooling(filter, limit = 100) {
  try {
    // Connection automatically obtained from pool
    const db = mongoClient.db('production_db');
    const users = await db.collection('users').find({
      status: filter,
      deletedAt: { $exists: false }
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

    return {
      users: users,
      count: users.length,
      requestTime: new Date(),
      // Connection automatically returned to pool
      poolStats: await getConnectionPoolStats()
    };

  } catch (error) {
    console.error('Database operation failed:', error);
    // Connection pool handles error recovery automatically
    throw error;
  }
  // No explicit connection cleanup needed - pool manages lifecycle
}

// Benefits of MongoDB connection pooling:
// - Automatic connection lifecycle management
// - Optimal resource utilization with min/max pool sizing
// - Built-in health monitoring and connection validation
// - Automatic failover and recovery handling  
// - Load balancing across replica set members
// - Intelligent connection reuse and optimization
// - Performance monitoring and metrics collection
// - Thread-safe operations without synchronization overhead
// - Graceful handling of network interruptions and timeouts
// - Integration with MongoDB driver performance features
```

## Understanding MongoDB Connection Pool Management

### Advanced Connection Pool Configuration and Monitoring

Implement sophisticated connection pool management for production environments:

```javascript
// Comprehensive connection pool management system
class MongoConnectionPoolManager {
  constructor(config = {}) {
    this.config = {
      // Connection pool configuration
      maxPoolSize: config.maxPoolSize || 100,
      minPoolSize: config.minPoolSize || 5,
      maxIdleTimeMS: config.maxIdleTimeMS || 300000,
      maxConnecting: config.maxConnecting || 2,
      
      // Performance settings
      connectTimeoutMS: config.connectTimeoutMS || 10000,
      socketTimeoutMS: config.socketTimeoutMS || 30000,
      serverSelectionTimeoutMS: config.serverSelectionTimeoutMS || 5000,
      heartbeatFrequencyMS: config.heartbeatFrequencyMS || 10000,
      
      // High availability
      retryWrites: config.retryWrites !== false,
      retryReads: config.retryReads !== false,
      readPreference: config.readPreference || 'secondaryPreferred',
      
      // Monitoring
      enableMonitoring: config.enableMonitoring !== false,
      monitoringInterval: config.monitoringInterval || 30000,
      
      ...config
    };

    this.clients = new Map();
    this.poolMetrics = new Map();
    this.monitoringInterval = null;
    this.eventListeners = new Map();
  }

  async createClient(connectionString, databaseName, clientOptions = {}) {
    const clientConfig = {
      maxPoolSize: this.config.maxPoolSize,
      minPoolSize: this.config.minPoolSize,
      maxIdleTimeMS: this.config.maxIdleTimeMS,
      maxConnecting: this.config.maxConnecting,
      connectTimeoutMS: this.config.connectTimeoutMS,
      socketTimeoutMS: this.config.socketTimeoutMS,
      serverSelectionTimeoutMS: this.config.serverSelectionTimeoutMS,
      heartbeatFrequencyMS: this.config.heartbeatFrequencyMS,
      retryWrites: this.config.retryWrites,
      retryReads: this.config.retryReads,
      readPreference: this.config.readPreference,
      readConcern: { level: 'majority' },
      writeConcern: { 
        w: 'majority', 
        j: true,
        wtimeoutMS: 10000 
      },
      compressors: ['zstd', 'zlib', 'snappy'],
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      },
      ...clientOptions
    };

    const client = new MongoClient(connectionString, clientConfig);

    // Set up connection pool event monitoring
    this.setupPoolEventListeners(client, databaseName);

    // Connect and validate
    await client.connect();
    
    // Store client reference
    this.clients.set(databaseName, {
      client: client,
      db: client.db(databaseName),
      connectionString: connectionString,
      config: clientConfig,
      createdAt: new Date(),
      lastUsed: new Date(),
      operationCount: 0,
      errorCount: 0
    });

    // Initialize metrics tracking
    this.poolMetrics.set(databaseName, {
      connectionsCreated: 0,
      connectionsDestroyed: 0,
      operationsExecuted: 0,
      operationErrors: 0,
      avgOperationTime: 0,
      poolSizeHistory: [],
      errorHistory: [],
      performanceMetrics: {
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0
      }
    });

    console.log(`MongoDB client created for database: ${databaseName}`);
    
    if (this.config.enableMonitoring) {
      this.startMonitoring();
    }

    return this.clients.get(databaseName);
  }

  setupPoolEventListeners(client, databaseName) {
    // Connection pool created
    client.on('connectionPoolCreated', (event) => {
      console.log(`Connection pool created for ${databaseName}:`, {
        address: event.address,
        options: event.options
      });
      
      if (this.poolMetrics.has(databaseName)) {
        this.poolMetrics.get(databaseName).poolCreatedAt = new Date();
      }
    });

    // Connection created
    client.on('connectionCreated', (event) => {
      console.log(`New connection created for ${databaseName}:`, {
        connectionId: event.connectionId,
        address: event.address
      });
      
      const metrics = this.poolMetrics.get(databaseName);
      if (metrics) {
        metrics.connectionsCreated++;
      }
    });

    // Connection ready
    client.on('connectionReady', (event) => {
      console.log(`Connection ready for ${databaseName}:`, {
        connectionId: event.connectionId,
        address: event.address
      });
    });

    // Connection closed
    client.on('connectionClosed', (event) => {
      console.log(`Connection closed for ${databaseName}:`, {
        connectionId: event.connectionId,
        address: event.address,
        reason: event.reason
      });
      
      const metrics = this.poolMetrics.get(databaseName);
      if (metrics) {
        metrics.connectionsDestroyed++;
      }
    });

    // Connection check out started
    client.on('connectionCheckOutStarted', (event) => {
      // Track connection pool usage patterns
      const metrics = this.poolMetrics.get(databaseName);
      if (metrics) {
        metrics.checkoutStartTime = Date.now();
      }
    });

    // Connection checked out
    client.on('connectionCheckedOut', (event) => {
      console.log(`Connection checked out for ${databaseName}:`, {
        connectionId: event.connectionId,
        address: event.address
      });
      
      const metrics = this.poolMetrics.get(databaseName);
      if (metrics && metrics.checkoutStartTime) {
        const checkoutTime = Date.now() - metrics.checkoutStartTime;
        metrics.avgCheckoutTime = (metrics.avgCheckoutTime || 0) * 0.9 + checkoutTime * 0.1;
      }
    });

    // Connection checked in
    client.on('connectionCheckedIn', (event) => {
      console.log(`Connection checked in for ${databaseName}:`, {
        connectionId: event.connectionId,
        address: event.address
      });
    });

    // Connection pool cleared
    client.on('connectionPoolCleared', (event) => {
      console.warn(`Connection pool cleared for ${databaseName}:`, {
        address: event.address,
        interruptInUseConnections: event.interruptInUseConnections
      });
    });

    // Server selection events
    client.on('serverOpening', (event) => {
      console.log(`Server opening for ${databaseName}:`, {
        address: event.address,
        topologyId: event.topologyId
      });
    });

    client.on('serverClosed', (event) => {
      console.log(`Server closed for ${databaseName}:`, {
        address: event.address,
        topologyId: event.topologyId
      });
    });

    client.on('serverDescriptionChanged', (event) => {
      console.log(`Server description changed for ${databaseName}:`, {
        address: event.address,
        newDescription: event.newDescription.type,
        previousDescription: event.previousDescription.type
      });
    });

    // Topology events
    client.on('topologyOpening', (event) => {
      console.log(`Topology opening for ${databaseName}:`, {
        topologyId: event.topologyId
      });
    });

    client.on('topologyClosed', (event) => {
      console.log(`Topology closed for ${databaseName}:`, {
        topologyId: event.topologyId
      });
    });

    client.on('topologyDescriptionChanged', (event) => {
      console.log(`Topology description changed for ${databaseName}:`, {
        topologyId: event.topologyId,
        newDescription: event.newDescription.type,
        previousDescription: event.previousDescription.type
      });
    });

    // Command monitoring for performance tracking
    client.on('commandStarted', (event) => {
      const clientInfo = this.clients.get(databaseName);
      if (clientInfo) {
        clientInfo.lastCommandStart = Date.now();
        clientInfo.lastCommand = {
          commandName: event.commandName,
          requestId: event.requestId,
          databaseName: event.databaseName
        };
      }
    });

    client.on('commandSucceeded', (event) => {
      const clientInfo = this.clients.get(databaseName);
      const metrics = this.poolMetrics.get(databaseName);
      
      if (clientInfo && metrics) {
        const duration = event.duration || (Date.now() - clientInfo.lastCommandStart);
        
        // Update operation metrics
        metrics.operationsExecuted++;
        metrics.avgOperationTime = (metrics.avgOperationTime * 0.95) + (duration * 0.05);
        
        clientInfo.operationCount++;
        clientInfo.lastUsed = new Date();
        
        // Track performance percentiles (simplified)
        this.updatePerformanceMetrics(databaseName, duration, true);
      }
    });

    client.on('commandFailed', (event) => {
      console.error(`Command failed for ${databaseName}:`, {
        commandName: event.commandName,
        failure: event.failure.message,
        duration: event.duration
      });
      
      const clientInfo = this.clients.get(databaseName);
      const metrics = this.poolMetrics.get(databaseName);
      
      if (clientInfo && metrics) {
        clientInfo.errorCount++;
        metrics.operationErrors++;
        
        metrics.errorHistory.push({
          timestamp: new Date(),
          command: event.commandName,
          error: event.failure.message,
          duration: event.duration
        });
        
        // Keep only recent error history
        if (metrics.errorHistory.length > 100) {
          metrics.errorHistory.shift();
        }
        
        this.updatePerformanceMetrics(databaseName, event.duration, false);
      }
    });
  }

  updatePerformanceMetrics(databaseName, duration, success) {
    const metrics = this.poolMetrics.get(databaseName);
    if (!metrics) return;

    // Simple sliding window for performance metrics
    if (!metrics.responseTimeWindow) {
      metrics.responseTimeWindow = [];
    }
    
    metrics.responseTimeWindow.push({
      timestamp: Date.now(),
      duration: duration,
      success: success
    });

    // Keep only last 1000 operations
    if (metrics.responseTimeWindow.length > 1000) {
      metrics.responseTimeWindow.shift();
    }

    // Calculate percentiles (simplified)
    const successfulOperations = metrics.responseTimeWindow
      .filter(op => op.success)
      .map(op => op.duration)
      .sort((a, b) => a - b);

    if (successfulOperations.length > 0) {
      const p50Index = Math.floor(successfulOperations.length * 0.5);
      const p95Index = Math.floor(successfulOperations.length * 0.95);
      const p99Index = Math.floor(successfulOperations.length * 0.99);

      metrics.performanceMetrics.p50ResponseTime = successfulOperations[p50Index] || 0;
      metrics.performanceMetrics.p95ResponseTime = successfulOperations[p95Index] || 0;
      metrics.performanceMetrics.p99ResponseTime = successfulOperations[p99Index] || 0;
    }

    // Calculate error rate
    const recentOperations = metrics.responseTimeWindow.filter(
      op => Date.now() - op.timestamp < 300000 // Last 5 minutes
    );
    
    if (recentOperations.length > 0) {
      const errorCount = recentOperations.filter(op => !op.success).length;
      metrics.performanceMetrics.errorRate = (errorCount / recentOperations.length) * 100;
    }
  }

  async getClient(databaseName) {
    const clientInfo = this.clients.get(databaseName);
    if (!clientInfo) {
      throw new Error(`No client found for database: ${databaseName}`);
    }

    // Check client health
    try {
      await clientInfo.client.db('admin').admin().ping();
      clientInfo.lastUsed = new Date();
      return clientInfo;
    } catch (error) {
      console.error(`Client health check failed for ${databaseName}:`, error);
      
      // Attempt to reconnect
      try {
        await this.reconnectClient(databaseName);
        return this.clients.get(databaseName);
      } catch (reconnectError) {
        console.error(`Reconnection failed for ${databaseName}:`, reconnectError);
        throw reconnectError;
      }
    }
  }

  async reconnectClient(databaseName) {
    const clientInfo = this.clients.get(databaseName);
    if (!clientInfo) {
      throw new Error(`No client configuration found for database: ${databaseName}`);
    }

    console.log(`Attempting to reconnect client for ${databaseName}...`);

    try {
      // Close existing client
      await clientInfo.client.close();
    } catch (closeError) {
      console.warn(`Error closing existing client: ${closeError.message}`);
    }

    // Create new client with existing configuration
    await this.createClient(
      clientInfo.connectionString,
      databaseName,
      clientInfo.config
    );

    console.log(`Successfully reconnected client for ${databaseName}`);
  }

  async executeWithPool(databaseName, operation) {
    const startTime = Date.now();
    let success = true;

    try {
      const clientInfo = await this.getClient(databaseName);
      const result = await operation(clientInfo.db, clientInfo.client);
      
      return result;

    } catch (error) {
      success = false;
      console.error(`Operation failed for ${databaseName}:`, error);
      throw error;

    } finally {
      const duration = Date.now() - startTime;
      this.updatePerformanceMetrics(databaseName, duration, success);
    }
  }

  async getConnectionPoolStats(databaseName) {
    if (!databaseName) {
      // Return stats for all databases
      const allStats = {};
      for (const [dbName, clientInfo] of this.clients.entries()) {
        allStats[dbName] = await this.getSingleDatabaseStats(dbName, clientInfo);
      }
      return allStats;
    }

    const clientInfo = this.clients.get(databaseName);
    if (!clientInfo) {
      throw new Error(`No client found for database: ${databaseName}`);
    }

    return await this.getSingleDatabaseStats(databaseName, clientInfo);
  }

  async getSingleDatabaseStats(databaseName, clientInfo) {
    const metrics = this.poolMetrics.get(databaseName);
    
    try {
      // Get current server status
      const serverStatus = await clientInfo.client.db('admin').admin().serverStatus();
      const connectionPoolStats = serverStatus.connections || {};

      return {
        database: databaseName,
        
        // Basic connection info
        connectionString: clientInfo.connectionString.replace(/\/\/.*@/, '//***@'), // Hide credentials
        createdAt: clientInfo.createdAt,
        lastUsed: clientInfo.lastUsed,
        
        // Pool configuration
        poolConfig: {
          maxPoolSize: this.config.maxPoolSize,
          minPoolSize: this.config.minPoolSize,
          maxIdleTimeMS: this.config.maxIdleTimeMS,
          maxConnecting: this.config.maxConnecting
        },
        
        // Current pool status
        poolStatus: {
          current: connectionPoolStats.current || 0,
          available: connectionPoolStats.available || 0,
          active: connectionPoolStats.active || 0,
          totalCreated: connectionPoolStats.totalCreated || 0
        },
        
        // Operation metrics
        operations: {
          totalOperations: clientInfo.operationCount,
          totalErrors: clientInfo.errorCount,
          errorRate: clientInfo.operationCount > 0 ? 
            ((clientInfo.errorCount / clientInfo.operationCount) * 100).toFixed(2) + '%' : '0%'
        },
        
        // Performance metrics
        performance: metrics ? {
          avgOperationTime: Math.round(metrics.avgOperationTime || 0) + 'ms',
          p50ResponseTime: Math.round(metrics.performanceMetrics.p50ResponseTime || 0) + 'ms',
          p95ResponseTime: Math.round(metrics.performanceMetrics.p95ResponseTime || 0) + 'ms',
          p99ResponseTime: Math.round(metrics.performanceMetrics.p99ResponseTime || 0) + 'ms',
          currentErrorRate: (metrics.performanceMetrics.errorRate || 0).toFixed(2) + '%',
          avgCheckoutTime: Math.round(metrics.avgCheckoutTime || 0) + 'ms'
        } : null,
        
        // Historical data
        history: metrics ? {
          connectionsCreated: metrics.connectionsCreated,
          connectionsDestroyed: metrics.connectionsDestroyed,
          operationsExecuted: metrics.operationsExecuted,
          operationErrors: metrics.operationErrors,
          recentErrors: metrics.errorHistory.slice(-5) // Last 5 errors
        } : null,
        
        // Health assessment
        health: this.assessConnectionHealth(clientInfo, metrics, connectionPoolStats),
        
        statsGeneratedAt: new Date()
      };

    } catch (error) {
      console.error(`Error getting stats for ${databaseName}:`, error);
      
      return {
        database: databaseName,
        error: error.message,
        lastKnownGoodStats: {
          createdAt: clientInfo.createdAt,
          lastUsed: clientInfo.lastUsed,
          operationCount: clientInfo.operationCount,
          errorCount: clientInfo.errorCount
        },
        statsGeneratedAt: new Date()
      };
    }
  }

  assessConnectionHealth(clientInfo, metrics, connectionPoolStats) {
    const health = {
      overall: 'healthy',
      issues: [],
      recommendations: []
    };

    // Check error rate
    if (clientInfo.operationCount > 0) {
      const errorRate = (clientInfo.errorCount / clientInfo.operationCount) * 100;
      if (errorRate > 10) {
        health.issues.push(`High error rate: ${errorRate.toFixed(2)}%`);
        health.overall = 'unhealthy';
      } else if (errorRate > 5) {
        health.issues.push(`Elevated error rate: ${errorRate.toFixed(2)}%`);
        health.overall = 'warning';
      }
    }

    // Check connection pool utilization
    const poolUtilization = connectionPoolStats.current / this.config.maxPoolSize;
    if (poolUtilization > 0.9) {
      health.issues.push(`High pool utilization: ${(poolUtilization * 100).toFixed(1)}%`);
      health.recommendations.push('Consider increasing maxPoolSize');
      if (health.overall === 'healthy') health.overall = 'warning';
    }

    // Check average response time
    if (metrics && metrics.avgOperationTime > 5000) {
      health.issues.push(`High average response time: ${metrics.avgOperationTime.toFixed(0)}ms`);
      health.recommendations.push('Investigate query performance and indexing');
      if (health.overall === 'healthy') health.overall = 'warning';
    }

    // Check recent errors
    if (metrics && metrics.errorHistory.length > 0) {
      const recentErrors = metrics.errorHistory.filter(
        error => Date.now() - error.timestamp.getTime() < 300000 // Last 5 minutes
      );
      
      if (recentErrors.length > 5) {
        health.issues.push(`Multiple recent errors: ${recentErrors.length} in last 5 minutes`);
        health.recommendations.push('Check application logs and network connectivity');
        health.overall = 'unhealthy';
      }
    }

    // Check last usage
    const timeSinceLastUse = Date.now() - clientInfo.lastUsed.getTime();
    if (timeSinceLastUse > 3600000) { // 1 hour
      health.issues.push(`Client unused for ${Math.round(timeSinceLastUse / 60000)} minutes`);
      health.recommendations.push('Consider closing idle connections');
    }

    return health;
  }

  startMonitoring() {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    console.log(`Starting connection pool monitoring (interval: ${this.config.monitoringInterval}ms)`);
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoringCheck();
      } catch (error) {
        console.error('Monitoring check failed:', error);
      }
    }, this.config.monitoringInterval);
  }

  async performMonitoringCheck() {
    for (const [databaseName, clientInfo] of this.clients.entries()) {
      try {
        const stats = await this.getSingleDatabaseStats(databaseName, clientInfo);
        
        // Log health issues
        if (stats.health && stats.health.overall !== 'healthy') {
          console.warn(`Health check for ${databaseName}:`, {
            status: stats.health.overall,
            issues: stats.health.issues,
            recommendations: stats.health.recommendations
          });
        }

        // Store historical pool size data
        const metrics = this.poolMetrics.get(databaseName);
        if (metrics && stats.poolStatus) {
          metrics.poolSizeHistory.push({
            timestamp: new Date(),
            current: stats.poolStatus.current,
            available: stats.poolStatus.available,
            active: stats.poolStatus.active
          });

          // Keep only last 24 hours of pool size history
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          metrics.poolSizeHistory = metrics.poolSizeHistory.filter(
            entry => entry.timestamp.getTime() > oneDayAgo
          );
        }

        // Emit monitoring event if listeners are registered
        if (this.eventListeners.has('monitoring_check')) {
          this.eventListeners.get('monitoring_check').forEach(listener => {
            listener(databaseName, stats);
          });
        }

      } catch (error) {
        console.error(`Monitoring check failed for ${databaseName}:`, error);
      }
    }
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Connection pool monitoring stopped');
    }
  }

  addEventListener(eventName, listener) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(listener);
  }

  removeEventListener(eventName, listener) {
    if (this.eventListeners.has(eventName)) {
      const listeners = this.eventListeners.get(eventName);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  async closeClient(databaseName) {
    const clientInfo = this.clients.get(databaseName);
    if (!clientInfo) {
      console.warn(`No client found for database: ${databaseName}`);
      return;
    }

    try {
      await clientInfo.client.close();
      this.clients.delete(databaseName);
      this.poolMetrics.delete(databaseName);
      console.log(`Client closed for database: ${databaseName}`);
    } catch (error) {
      console.error(`Error closing client for ${databaseName}:`, error);
    }
  }

  async closeAllClients() {
    const closePromises = [];
    
    for (const databaseName of this.clients.keys()) {
      closePromises.push(this.closeClient(databaseName));
    }

    this.stopMonitoring();
    
    await Promise.all(closePromises);
    console.log('All MongoDB clients closed');
  }
}
```

### High-Performance Connection Pool Patterns

Implement specialized connection pool patterns for different application scenarios:

```javascript
// Specialized connection pool patterns for different use cases
class SpecializedConnectionPools {
  constructor() {
    this.poolManager = new MongoConnectionPoolManager();
    this.pools = new Map();
  }

  async createReadWritePools(config) {
    // Separate connection pools for read and write operations
    const writePoolConfig = {
      maxPoolSize: config.writeMaxPool || 50,
      minPoolSize: config.writeMinPool || 5,
      readPreference: 'primary',
      writeConcern: { w: 'majority', j: true },
      readConcern: { level: 'majority' },
      retryWrites: true,
      heartbeatFrequencyMS: 5000
    };

    const readPoolConfig = {
      maxPoolSize: config.readMaxPool || 100,
      minPoolSize: config.readMinPool || 10,
      readPreference: 'secondaryPreferred',
      readConcern: { level: 'available' }, // Faster reads
      retryReads: true,
      heartbeatFrequencyMS: 10000,
      maxIdleTimeMS: 600000 // Keep read connections longer
    };

    // Create separate clients for read and write
    const writeClient = await this.poolManager.createClient(
      config.connectionString,
      `${config.databaseName}_write`,
      writePoolConfig
    );

    const readClient = await this.poolManager.createClient(
      config.connectionString,
      `${config.databaseName}_read`,
      readPoolConfig
    );

    this.pools.set(`${config.databaseName}_readwrite`, {
      writeClient: writeClient,
      readClient: readClient,
      createdAt: new Date()
    });

    return {
      writeClient: writeClient,
      readClient: readClient,
      
      // Convenience methods
      executeWrite: (operation) => this.poolManager.executeWithPool(
        `${config.databaseName}_write`, operation
      ),
      executeRead: (operation) => this.poolManager.executeWithPool(
        `${config.databaseName}_read`, operation
      )
    };
  }

  async createTenantAwarePools(tenantConfigs) {
    // Multi-tenant connection pooling with per-tenant isolation
    const tenantPools = new Map();

    for (const tenantConfig of tenantConfigs) {
      const tenantId = tenantConfig.tenantId;
      const poolConfig = {
        maxPoolSize: tenantConfig.maxPool || 20,
        minPoolSize: tenantConfig.minPool || 2,
        maxIdleTimeMS: tenantConfig.idleTimeout || 300000,
        
        // Tenant-specific settings
        appName: `app_tenant_${tenantId}`,
        authSource: tenantConfig.authDatabase || 'admin',
        
        // Resource limits per tenant
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000
      };

      const client = await this.poolManager.createClient(
        tenantConfig.connectionString,
        `tenant_${tenantId}`,
        poolConfig
      );

      tenantPools.set(tenantId, {
        client: client,
        config: tenantConfig,
        createdAt: new Date(),
        lastUsed: new Date(),
        operationCount: 0
      });
    }

    this.pools.set('tenant_pools', tenantPools);

    return {
      executeForTenant: async (tenantId, operation) => {
        const tenantPool = tenantPools.get(tenantId);
        if (!tenantPool) {
          throw new Error(`No pool configured for tenant: ${tenantId}`);
        }

        tenantPool.lastUsed = new Date();
        tenantPool.operationCount++;

        return await this.poolManager.executeWithPool(
          `tenant_${tenantId}`,
          operation
        );
      },

      getTenantStats: async (tenantId) => {
        if (tenantId) {
          return await this.poolManager.getConnectionPoolStats(`tenant_${tenantId}`);
        } else {
          // Return stats for all tenants
          const allStats = {};
          for (const [tId, poolInfo] of tenantPools.entries()) {
            allStats[tId] = await this.poolManager.getConnectionPoolStats(`tenant_${tId}`);
          }
          return allStats;
        }
      }
    };
  }

  async createGeographicPools(regionConfigs) {
    // Geographic connection pools for global applications
    const regionPools = new Map();

    for (const regionConfig of regionConfigs) {
      const region = regionConfig.region;
      const poolConfig = {
        maxPoolSize: regionConfig.maxPool || 75,
        minPoolSize: regionConfig.minPool || 10,
        
        // Region-specific optimizations
        connectTimeoutMS: regionConfig.connectTimeout || 15000,
        serverSelectionTimeoutMS: regionConfig.selectionTimeout || 10000,
        heartbeatFrequencyMS: regionConfig.heartbeatFreq || 10000,
        
        // Compression for long-distance connections
        compressors: ['zstd', 'zlib'],
        
        // Read preference based on region
        readPreference: regionConfig.readPreference || 'nearest',
        
        appName: `app_${region}`
      };

      const client = await this.poolManager.createClient(
        regionConfig.connectionString,
        `region_${region}`,
        poolConfig
      );

      regionPools.set(region, {
        client: client,
        config: regionConfig,
        createdAt: new Date(),
        lastUsed: new Date(),
        latencyMetrics: {
          avgLatency: 0,
          minLatency: Number.MAX_VALUE,
          maxLatency: 0,
          measurements: []
        }
      });
    }

    this.pools.set('region_pools', regionPools);

    return {
      executeInRegion: async (region, operation) => {
        const regionPool = regionPools.get(region);
        if (!regionPool) {
          throw new Error(`No pool configured for region: ${region}`);
        }

        const startTime = Date.now();
        
        try {
          const result = await this.poolManager.executeWithPool(
            `region_${region}`,
            operation
          );

          // Track latency metrics
          const latency = Date.now() - startTime;
          this.updateRegionLatencyMetrics(region, latency);
          
          regionPool.lastUsed = new Date();
          return result;

        } catch (error) {
          const latency = Date.now() - startTime;
          this.updateRegionLatencyMetrics(region, latency);
          throw error;
        }
      },

      selectOptimalRegion: async (preferredRegions = []) => {
        // Select region with best performance characteristics
        let bestRegion = null;
        let bestScore = -1;

        for (const region of preferredRegions.length > 0 ? preferredRegions : regionPools.keys()) {
          const regionPool = regionPools.get(region);
          if (!regionPool) continue;

          const stats = await this.poolManager.getConnectionPoolStats(`region_${region}`);
          const latencyMetrics = regionPool.latencyMetrics;

          // Calculate performance score (lower latency + higher availability)
          let score = 100;
          score -= Math.min(latencyMetrics.avgLatency / 10, 50); // Latency penalty
          score -= (parseFloat(stats.operations.errorRate) || 0); // Error rate penalty

          if (stats.health.overall === 'unhealthy') score -= 30;
          else if (stats.health.overall === 'warning') score -= 15;

          if (score > bestScore) {
            bestScore = score;
            bestRegion = region;
          }
        }

        return {
          region: bestRegion,
          score: bestScore,
          metrics: bestRegion ? regionPools.get(bestRegion).latencyMetrics : null
        };
      }
    };
  }

  updateRegionLatencyMetrics(region, latency) {
    const regionPools = this.pools.get('region_pools');
    const regionPool = regionPools?.get(region);
    
    if (regionPool) {
      const metrics = regionPool.latencyMetrics;
      
      // Update latency statistics
      metrics.measurements.push({
        timestamp: Date.now(),
        latency: latency
      });

      // Keep only recent measurements (last 1000)
      if (metrics.measurements.length > 1000) {
        metrics.measurements.shift();
      }

      // Calculate running averages
      const recentMeasurements = metrics.measurements.slice(-100); // Last 100 measurements
      metrics.avgLatency = recentMeasurements.reduce((sum, m) => sum + m.latency, 0) / recentMeasurements.length;
      metrics.minLatency = Math.min(metrics.minLatency, latency);
      metrics.maxLatency = Math.max(metrics.maxLatency, latency);
    }
  }

  async createPriorityPools(priorityConfig) {
    // Priority-based connection pooling for different service levels
    const priorityLevels = ['critical', 'high', 'normal', 'low'];
    const priorityPools = new Map();

    for (const priority of priorityLevels) {
      const config = priorityConfig[priority] || {};
      const poolConfig = {
        maxPoolSize: config.maxPool || this.getDefaultPoolSize(priority),
        minPoolSize: config.minPool || this.getDefaultMinPool(priority),
        maxIdleTimeMS: config.idleTimeout || this.getDefaultIdleTimeout(priority),
        
        // Priority-specific timeouts
        connectTimeoutMS: config.connectTimeout || this.getDefaultConnectTimeout(priority),
        socketTimeoutMS: config.socketTimeout || this.getDefaultSocketTimeout(priority),
        serverSelectionTimeoutMS: config.selectionTimeout || this.getDefaultSelectionTimeout(priority),
        
        // Quality of service settings
        readConcern: { level: priority === 'critical' ? 'majority' : 'available' },
        writeConcern: priority === 'critical' ? 
          { w: 'majority', j: true, wtimeout: 10000 } : 
          { w: 1, wtimeout: 5000 },
        
        appName: `app_priority_${priority}`
      };

      const client = await this.poolManager.createClient(
        priorityConfig.connectionString,
        `priority_${priority}`,
        poolConfig
      );

      priorityPools.set(priority, {
        client: client,
        priority: priority,
        config: poolConfig,
        createdAt: new Date(),
        queuedOperations: 0,
        completedOperations: 0,
        rejectedOperations: 0
      });
    }

    this.pools.set('priority_pools', priorityPools);

    return {
      executeWithPriority: async (priority, operation, options = {}) => {
        const priorityPool = priorityPools.get(priority);
        if (!priorityPool) {
          throw new Error(`No pool configured for priority: ${priority}`);
        }

        // Check if pool is overloaded and priority allows rejection
        if (this.shouldRejectLowPriorityOperation(priority, priorityPool)) {
          priorityPool.rejectedOperations++;
          throw new Error(`Operation rejected due to high load (priority: ${priority})`);
        }

        priorityPool.queuedOperations++;

        try {
          const result = await this.poolManager.executeWithPool(
            `priority_${priority}`,
            operation
          );

          priorityPool.completedOperations++;
          priorityPool.queuedOperations--;
          
          return result;

        } catch (error) {
          priorityPool.queuedOperations--;
          throw error;
        }
      },

      getPriorityStats: async () => {
        const stats = {};
        
        for (const [priority, poolInfo] of priorityPools.entries()) {
          const poolStats = await this.poolManager.getConnectionPoolStats(`priority_${priority}`);
          
          stats[priority] = {
            ...poolStats,
            queuedOperations: poolInfo.queuedOperations,
            completedOperations: poolInfo.completedOperations,
            rejectedOperations: poolInfo.rejectedOperations,
            rejectionRate: poolInfo.completedOperations > 0 ? 
              ((poolInfo.rejectedOperations / (poolInfo.completedOperations + poolInfo.rejectedOperations)) * 100).toFixed(2) + '%' : 
              '0%'
          };
        }
        
        return stats;
      },

      adjustPriorityLimits: async (priority, newLimits) => {
        // Dynamic adjustment of priority pool limits
        const priorityPool = priorityPools.get(priority);
        if (priorityPool) {
          // This would require reconnecting with new pool settings
          console.log(`Adjusting limits for priority ${priority}:`, newLimits);
          // Implementation would depend on specific requirements
        }
      }
    };
  }

  getDefaultPoolSize(priority) {
    const sizes = {
      critical: 100,
      high: 75,
      normal: 50,
      low: 25
    };
    return sizes[priority] || 50;
  }

  getDefaultMinPool(priority) {
    const sizes = {
      critical: 10,
      high: 8,
      normal: 5,
      low: 2
    };
    return sizes[priority] || 5;
  }

  getDefaultIdleTimeout(priority) {
    const timeouts = {
      critical: 60000,   // 1 minute
      high: 120000,      // 2 minutes  
      normal: 300000,    // 5 minutes
      low: 600000        // 10 minutes
    };
    return timeouts[priority] || 300000;
  }

  getDefaultConnectTimeout(priority) {
    const timeouts = {
      critical: 5000,   // 5 seconds
      high: 8000,       // 8 seconds
      normal: 10000,    // 10 seconds
      low: 15000        // 15 seconds
    };
    return timeouts[priority] || 10000;
  }

  getDefaultSocketTimeout(priority) {
    const timeouts = {
      critical: 10000,  // 10 seconds
      high: 20000,      // 20 seconds
      normal: 30000,    // 30 seconds
      low: 60000        // 60 seconds
    };
    return timeouts[priority] || 30000;
  }

  getDefaultSelectionTimeout(priority) {
    const timeouts = {
      critical: 3000,   // 3 seconds
      high: 5000,       // 5 seconds
      normal: 8000,     // 8 seconds
      low: 15000        // 15 seconds
    };
    return timeouts[priority] || 8000;
  }

  shouldRejectLowPriorityOperation(priority, priorityPool) {
    // Simple load-based rejection for low priority operations
    if (priority === 'low' && priorityPool.queuedOperations > 10) {
      return true;
    }
    
    if (priority === 'normal' && priorityPool.queuedOperations > 25) {
      return true;
    }
    
    return false;
  }

  async createBatchProcessingPool(config) {
    // Specialized pool for batch processing operations
    const batchPoolConfig = {
      maxPoolSize: config.maxPool || 200,
      minPoolSize: config.minPool || 20,
      maxConnecting: config.maxConnecting || 10,
      
      // Longer timeouts for batch operations
      connectTimeoutMS: config.connectTimeout || 30000,
      socketTimeoutMS: config.socketTimeout || 120000,
      serverSelectionTimeoutMS: config.selectionTimeout || 15000,
      
      // Optimized for bulk operations
      maxIdleTimeMS: config.idleTimeout || 1800000, // 30 minutes
      heartbeatFrequencyMS: config.heartbeatFreq || 30000,
      
      // Bulk operation settings
      readPreference: 'secondary',
      readConcern: { level: 'available' },
      writeConcern: { w: 1 }, // Faster writes for bulk operations
      
      // Compression for large data transfers
      compressors: ['zstd', 'zlib'],
      
      appName: 'batch_processor'
    };

    const client = await this.poolManager.createClient(
      config.connectionString,
      'batch_processing',
      batchPoolConfig
    );

    this.pools.set('batch_pool', {
      client: client,
      config: batchPoolConfig,
      createdAt: new Date(),
      batchesProcessed: 0,
      documentsProcessed: 0,
      avgBatchSize: 0
    });

    return {
      executeBatch: async (operation, batchSize = 1000) => {
        const batchPool = this.pools.get('batch_pool');
        const startTime = Date.now();
        
        try {
          const result = await this.poolManager.executeWithPool(
            'batch_processing',
            async (db, client) => {
              // Configure batch operation settings
              const options = {
                ordered: false,        // Allow partial success
                bypassDocumentValidation: true, // Skip validation for performance
                writeConcern: { w: 1 } // Fast acknowledgment
              };
              
              return await operation(db, client, options);
            }
          );

          // Update batch statistics
          batchPool.batchesProcessed++;
          batchPool.documentsProcessed += batchSize;
          batchPool.avgBatchSize = (batchPool.avgBatchSize * 0.9) + (batchSize * 0.1);

          const duration = Date.now() - startTime;
          console.log(`Batch operation completed: ${batchSize} documents in ${duration}ms`);

          return result;

        } catch (error) {
          console.error('Batch operation failed:', error);
          throw error;
        }
      },

      getBatchStats: async () => {
        const poolStats = await this.poolManager.getConnectionPoolStats('batch_processing');
        const batchPool = this.pools.get('batch_pool');
        
        return {
          ...poolStats,
          batchStatistics: {
            batchesProcessed: batchPool.batchesProcessed,
            documentsProcessed: batchPool.documentsProcessed,
            avgBatchSize: Math.round(batchPool.avgBatchSize),
            documentsPerBatch: batchPool.batchesProcessed > 0 ? 
              Math.round(batchPool.documentsProcessed / batchPool.batchesProcessed) : 0
          }
        };
      }
    };
  }

  async getOverallStats() {
    // Get comprehensive statistics across all pool types
    const overallStats = {
      pools: {},
      summary: {
        totalPools: 0,
        totalConnections: 0,
        totalOperations: 0,
        overallHealth: 'healthy',
        generatedAt: new Date()
      }
    };

    // Get stats from pool manager
    const allPoolStats = await this.poolManager.getConnectionPoolStats();
    
    for (const [poolName, stats] of Object.entries(allPoolStats)) {
      overallStats.pools[poolName] = stats;
      overallStats.summary.totalPools++;
      overallStats.summary.totalConnections += stats.poolStatus?.current || 0;
      overallStats.summary.totalOperations += stats.operations?.totalOperations || 0;
      
      // Aggregate health status
      if (stats.health?.overall === 'unhealthy') {
        overallStats.summary.overallHealth = 'unhealthy';
      } else if (stats.health?.overall === 'warning' && overallStats.summary.overallHealth !== 'unhealthy') {
        overallStats.summary.overallHealth = 'warning';
      }
    }

    return overallStats;
  }

  async shutdown() {
    // Graceful shutdown of all pools
    console.log('Shutting down all connection pools...');
    
    await this.poolManager.closeAllClients();
    this.pools.clear();
    
    console.log('All connection pools shut down successfully');
  }
}
```

## SQL-Style Connection Pool Management with QueryLeaf

QueryLeaf provides familiar SQL approaches to MongoDB connection pool configuration and monitoring:

```sql
-- QueryLeaf connection pool management with SQL-familiar syntax

-- Configure connection pool settings
SET CONNECTION_POOL_OPTIONS = JSON_BUILD_OBJECT(
  'maxPoolSize', 100,
  'minPoolSize', 5,
  'maxIdleTimeMS', 300000,
  'maxConnecting', 2,
  'connectTimeoutMS', 10000,
  'socketTimeoutMS', 30000,
  'serverSelectionTimeoutMS', 5000,
  'heartbeatFrequencyMS', 10000,
  'retryWrites', true,
  'retryReads', true,
  'readPreference', 'secondaryPreferred',
  'writeConcern', JSON_BUILD_OBJECT('w', 'majority', 'j', true),
  'compressors', ARRAY['zstd', 'zlib', 'snappy']
);

-- Create specialized connection pools for different workloads
CREATE CONNECTION_POOL read_pool 
WITH (
  maxPoolSize = 150,
  minPoolSize = 10,
  readPreference = 'secondaryPreferred',
  readConcern = JSON_BUILD_OBJECT('level', 'available'),
  maxIdleTimeMS = 600000
);

CREATE CONNECTION_POOL write_pool
WITH (
  maxPoolSize = 75,
  minPoolSize = 5,
  readPreference = 'primary',
  writeConcern = JSON_BUILD_OBJECT('w', 'majority', 'j', true),
  retryWrites = true,
  maxIdleTimeMS = 300000
);

CREATE CONNECTION_POOL batch_pool
WITH (
  maxPoolSize = 200,
  minPoolSize = 20,
  maxConnecting = 10,
  socketTimeoutMS = 120000,
  maxIdleTimeMS = 1800000,
  compressors = ARRAY['zstd', 'zlib']
);

-- Monitor connection pool performance and health
SELECT 
  CONNECTION_POOL_NAME() as pool_name,
  CONNECTION_POOL_MAX_SIZE() as max_connections,
  CONNECTION_POOL_CURRENT_SIZE() as current_connections,
  CONNECTION_POOL_AVAILABLE() as available_connections,
  CONNECTION_POOL_ACTIVE() as active_connections,
  
  -- Utilization metrics
  ROUND((CONNECTION_POOL_CURRENT_SIZE()::float / CONNECTION_POOL_MAX_SIZE()) * 100, 2) as pool_utilization_pct,
  ROUND((CONNECTION_POOL_ACTIVE()::float / CONNECTION_POOL_CURRENT_SIZE()) * 100, 2) as connection_active_pct,
  
  -- Performance metrics
  CONNECTION_POOL_TOTAL_CREATED() as total_connections_created,
  CONNECTION_POOL_TOTAL_DESTROYED() as total_connections_destroyed,
  CONNECTION_POOL_AVG_CHECKOUT_TIME() as avg_checkout_time_ms,
  CONNECTION_POOL_OPERATION_COUNT() as total_operations,
  CONNECTION_POOL_ERROR_COUNT() as total_errors,
  ROUND((CONNECTION_POOL_ERROR_COUNT()::float / CONNECTION_POOL_OPERATION_COUNT()) * 100, 2) as error_rate_pct,
  
  -- Health assessment
  CASE 
    WHEN CONNECTION_POOL_ERROR_COUNT()::float / CONNECTION_POOL_OPERATION_COUNT() > 0.1 THEN 'UNHEALTHY'
    WHEN CONNECTION_POOL_CURRENT_SIZE()::float / CONNECTION_POOL_MAX_SIZE() > 0.9 THEN 'WARNING'
    WHEN CONNECTION_POOL_AVG_CHECKOUT_TIME() > 1000 THEN 'WARNING'
    ELSE 'HEALTHY'
  END as health_status,
  
  CONNECTION_POOL_LAST_USED() as last_used,
  CONNECTION_POOL_CREATED_AT() as created_at

FROM CONNECTION_POOLS()
ORDER BY pool_utilization_pct DESC;

-- High-performance database operations using connection pools
-- Read operations using read pool
SELECT @read_pool := USE_CONNECTION_POOL('read_pool');

WITH user_analytics AS (
  SELECT 
    u.user_id,
    u.username,
    u.email,
    u.created_at,
    u.last_login,
    u.subscription_type,
    
    -- Calculate user engagement metrics
    COUNT(a.activity_id) as total_activities,
    MAX(a.activity_date) as last_activity,
    AVG(a.session_duration) as avg_session_duration,
    SUM(a.page_views) as total_page_views,
    
    -- User value calculation  
    COUNT(DISTINCT o.order_id) as total_orders,
    SUM(o.order_total) as lifetime_value,
    AVG(o.order_total) as avg_order_value
    
  FROM users u
  LEFT JOIN user_activities a ON u.user_id = a.user_id 
    AND a.activity_date >= CURRENT_DATE - INTERVAL '90 days'
  LEFT JOIN orders o ON u.user_id = o.customer_id
    AND o.status = 'completed'
  
  WHERE u.status = 'active'
    AND u.created_at >= CURRENT_DATE - INTERVAL '1 year'
  
  GROUP BY u.user_id, u.username, u.email, u.created_at, u.last_login, u.subscription_type
)
SELECT 
  user_id,
  username,
  email,
  subscription_type,
  total_activities,
  last_activity,
  ROUND(avg_session_duration / 60, 2) as avg_session_minutes,
  total_page_views,
  total_orders,
  COALESCE(lifetime_value, 0) as lifetime_value,
  ROUND(COALESCE(avg_order_value, 0), 2) as avg_order_value,
  
  -- User segmentation
  CASE 
    WHEN total_orders >= 10 AND lifetime_value >= 1000 THEN 'VIP'
    WHEN total_orders >= 5 AND lifetime_value >= 500 THEN 'LOYAL'  
    WHEN total_orders >= 1 THEN 'CUSTOMER'
    WHEN total_activities >= 10 THEN 'ENGAGED'
    ELSE 'NEW'
  END as user_segment,
  
  -- Engagement score
  ROUND(
    (COALESCE(total_activities, 0) * 0.3) + 
    (COALESCE(total_orders, 0) * 0.4) + 
    (LEAST(COALESCE(total_page_views, 0) / 100, 10) * 0.3), 
    2
  ) as engagement_score

FROM user_analytics
WHERE total_activities > 0 OR total_orders > 0
ORDER BY engagement_score DESC, lifetime_value DESC
LIMIT 1000;

-- Write operations using write pool
SELECT @write_pool := USE_CONNECTION_POOL('write_pool');

-- Bulk insert with optimized connection pool
INSERT INTO user_events (
  user_id,
  event_type,
  event_data,
  session_id,
  timestamp,
  ip_address,
  user_agent
)
SELECT 
  user_session.user_id,
  event_batch.event_type,
  event_batch.event_data,
  user_session.session_id,
  event_batch.timestamp,
  user_session.ip_address,
  user_session.user_agent
FROM UNNEST(@event_batch_array) AS event_batch(event_type, event_data, timestamp, user_id)
JOIN user_sessions user_session ON event_batch.user_id = user_session.user_id
WHERE user_session.is_active = true
  AND event_batch.timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour';

-- Batch processing using specialized batch pool
SELECT @batch_pool := USE_CONNECTION_POOL('batch_pool');

-- Process large dataset with batch operations  
WITH batch_processing AS (
  UPDATE user_statistics 
  SET 
    monthly_page_views = monthly_stats.page_views,
    monthly_session_time = monthly_stats.session_time,
    monthly_orders = monthly_stats.orders,
    monthly_revenue = monthly_stats.revenue,
    last_calculated = CURRENT_TIMESTAMP,
    calculation_version = calculation_version + 1
  FROM (
    SELECT 
      u.user_id,
      COUNT(a.activity_id) as page_views,
      SUM(a.session_duration) as session_time,
      COUNT(DISTINCT o.order_id) as orders,
      SUM(o.order_total) as revenue
    FROM users u
    LEFT JOIN user_activities a ON u.user_id = a.user_id 
      AND a.activity_date >= DATE_TRUNC('month', CURRENT_DATE)
    LEFT JOIN orders o ON u.user_id = o.customer_id 
      AND o.order_date >= DATE_TRUNC('month', CURRENT_DATE)
      AND o.status = 'completed'
    WHERE u.status = 'active'
    GROUP BY u.user_id
  ) AS monthly_stats
  WHERE user_statistics.user_id = monthly_stats.user_id
  RETURNING user_statistics.user_id, user_statistics.monthly_revenue
)
SELECT 
  'batch_update_completed' as operation_type,
  COUNT(*) as users_updated,
  SUM(monthly_revenue) as total_monthly_revenue,
  AVG(monthly_revenue) as avg_monthly_revenue,
  MIN(monthly_revenue) as min_monthly_revenue,
  MAX(monthly_revenue) as max_monthly_revenue,
  CURRENT_TIMESTAMP as completed_at
FROM batch_processing;

-- Connection pool performance analysis and optimization
WITH pool_performance_analysis AS (
  SELECT 
    pool_name,
    current_connections,
    max_connections,
    active_connections,
    available_connections,
    total_operations,
    total_errors,
    avg_checkout_time_ms,
    error_rate_pct,
    pool_utilization_pct,
    
    -- Performance indicators
    CASE 
      WHEN pool_utilization_pct > 90 THEN 'HIGH_UTILIZATION'
      WHEN pool_utilization_pct < 20 THEN 'UNDERUTILIZED'  
      ELSE 'OPTIMAL_UTILIZATION'
    END as utilization_status,
    
    CASE
      WHEN error_rate_pct > 5 THEN 'HIGH_ERROR_RATE'
      WHEN error_rate_pct > 1 THEN 'ELEVATED_ERROR_RATE'
      ELSE 'NORMAL_ERROR_RATE'  
    END as error_status,
    
    CASE 
      WHEN avg_checkout_time_ms > 1000 THEN 'SLOW_CHECKOUT'
      WHEN avg_checkout_time_ms > 500 THEN 'MODERATE_CHECKOUT'
      ELSE 'FAST_CHECKOUT'
    END as checkout_performance,
    
    -- Optimization recommendations
    CASE 
      WHEN pool_utilization_pct > 90 AND error_rate_pct > 2 THEN 'INCREASE_POOL_SIZE'
      WHEN pool_utilization_pct < 20 AND total_operations < 100 THEN 'DECREASE_POOL_SIZE'
      WHEN avg_checkout_time_ms > 1000 THEN 'CHECK_CONNECTION_HEALTH'
      WHEN error_rate_pct > 5 THEN 'INVESTIGATE_CONNECTION_ERRORS'
      ELSE 'POOL_OPTIMALLY_CONFIGURED'
    END as optimization_recommendation
    
  FROM (
    SELECT 
      CONNECTION_POOL_NAME() as pool_name,
      CONNECTION_POOL_CURRENT_SIZE() as current_connections,
      CONNECTION_POOL_MAX_SIZE() as max_connections,
      CONNECTION_POOL_ACTIVE() as active_connections,
      CONNECTION_POOL_AVAILABLE() as available_connections,
      CONNECTION_POOL_OPERATION_COUNT() as total_operations,
      CONNECTION_POOL_ERROR_COUNT() as total_errors,
      CONNECTION_POOL_AVG_CHECKOUT_TIME() as avg_checkout_time_ms,
      ROUND((CONNECTION_POOL_ERROR_COUNT()::float / NULLIF(CONNECTION_POOL_OPERATION_COUNT(), 0)) * 100, 2) as error_rate_pct,
      ROUND((CONNECTION_POOL_CURRENT_SIZE()::float / CONNECTION_POOL_MAX_SIZE()) * 100, 2) as pool_utilization_pct
    FROM CONNECTION_POOLS()
  ) pool_metrics
)
SELECT 
  pool_name,
  current_connections || '/' || max_connections as pool_size,
  pool_utilization_pct || '%' as utilization,
  active_connections || ' active' as activity,
  available_connections || ' available' as availability,
  total_operations || ' ops' as operations,
  error_rate_pct || '%' as error_rate,
  avg_checkout_time_ms || 'ms' as checkout_time,
  
  -- Status indicators
  utilization_status,
  error_status, 
  checkout_performance,
  optimization_recommendation,
  
  -- Priority scoring for optimization efforts
  CASE 
    WHEN optimization_recommendation = 'INCREASE_POOL_SIZE' THEN 1
    WHEN optimization_recommendation = 'INVESTIGATE_CONNECTION_ERRORS' THEN 2
    WHEN optimization_recommendation = 'CHECK_CONNECTION_HEALTH' THEN 3
    WHEN optimization_recommendation = 'DECREASE_POOL_SIZE' THEN 4
    ELSE 5
  END as optimization_priority

FROM pool_performance_analysis
ORDER BY optimization_priority, error_rate_pct DESC, pool_utilization_pct DESC;

-- Real-time connection pool monitoring and alerting
SELECT 
  pool_name,
  health_status,
  current_connections,
  pool_utilization_pct,
  error_rate_pct,
  avg_checkout_time_ms,
  
  -- Generate alerts based on thresholds
  CASE 
    WHEN error_rate_pct > 10 THEN 
      'CRITICAL: High error rate (' || error_rate_pct || '%) - immediate investigation required'
    WHEN pool_utilization_pct > 95 THEN 
      'CRITICAL: Pool exhaustion (' || pool_utilization_pct || '%) - increase pool size immediately'
    WHEN avg_checkout_time_ms > 2000 THEN 
      'WARNING: Slow connection checkout (' || avg_checkout_time_ms || 'ms) - check connection health'
    WHEN error_rate_pct > 5 THEN 
      'WARNING: Elevated error rate (' || error_rate_pct || '%) - monitor closely'
    WHEN pool_utilization_pct > 85 THEN 
      'WARNING: High pool utilization (' || pool_utilization_pct || '%) - consider scaling'
    ELSE 'INFO: Pool operating normally'
  END as alert_message,
  
  CASE 
    WHEN error_rate_pct > 10 OR pool_utilization_pct > 95 THEN 'CRITICAL'
    WHEN error_rate_pct > 5 OR pool_utilization_pct > 85 OR avg_checkout_time_ms > 2000 THEN 'WARNING'
    ELSE 'INFO'
  END as alert_severity,
  
  CURRENT_TIMESTAMP as alert_timestamp

FROM (
  SELECT 
    CONNECTION_POOL_NAME() as pool_name,
    CASE 
      WHEN CONNECTION_POOL_ERROR_COUNT()::float / NULLIF(CONNECTION_POOL_OPERATION_COUNT(), 0) > 0.1 THEN 'UNHEALTHY'
      WHEN CONNECTION_POOL_CURRENT_SIZE()::float / CONNECTION_POOL_MAX_SIZE() > 0.9 THEN 'WARNING'
      WHEN CONNECTION_POOL_AVG_CHECKOUT_TIME() > 1000 THEN 'WARNING'
      ELSE 'HEALTHY'
    END as health_status,
    CONNECTION_POOL_CURRENT_SIZE() as current_connections,
    ROUND((CONNECTION_POOL_CURRENT_SIZE()::float / CONNECTION_POOL_MAX_SIZE()) * 100, 2) as pool_utilization_pct,
    ROUND((CONNECTION_POOL_ERROR_COUNT()::float / NULLIF(CONNECTION_POOL_OPERATION_COUNT(), 0)) * 100, 2) as error_rate_pct,
    CONNECTION_POOL_AVG_CHECKOUT_TIME() as avg_checkout_time_ms
  FROM CONNECTION_POOLS()
) pool_health_check
WHERE alert_severity IN ('CRITICAL', 'WARNING')  -- Only show alerts that need attention
ORDER BY 
  CASE alert_severity 
    WHEN 'CRITICAL' THEN 1
    WHEN 'WARNING' THEN 2
    ELSE 3
  END,
  error_rate_pct DESC,
  pool_utilization_pct DESC;

-- QueryLeaf provides comprehensive connection pool management:
-- 1. SQL-familiar connection pool configuration and creation
-- 2. Automatic connection lifecycle management and optimization  
-- 3. Built-in performance monitoring and health assessment
-- 4. Specialized pools for different workload patterns (read/write/batch)
-- 5. Real-time alerting and anomaly detection
-- 6. Load balancing and failover handling
-- 7. Resource utilization optimization and auto-scaling recommendations
-- 8. Integration with MongoDB driver performance features  
-- 9. Connection pool statistics and performance analytics
-- 10. Production-ready error handling and recovery mechanisms
```

## Best Practices for Connection Pool Optimization

### Design Guidelines

Essential practices for optimal connection pool configuration:

1. **Pool Sizing Strategy**: Size pools based on application concurrency patterns and database server capacity
2. **Workload Separation**: Use separate pools for read/write operations to optimize for different performance characteristics  
3. **Health Monitoring**: Implement comprehensive monitoring and alerting for pool health and performance
4. **Timeout Configuration**: Set appropriate timeouts for connection establishment, operations, and idle connections
5. **Error Handling**: Implement robust error handling with automatic retry and recovery mechanisms
6. **Resource Management**: Monitor resource utilization and implement auto-scaling strategies

### Performance Optimization

Optimize connection pools for maximum throughput and efficiency:

1. **Connection Reuse**: Maximize connection reuse through appropriate idle timeout configuration
2. **Load Balancing**: Distribute load across replica set members using read preferences
3. **Compression**: Enable compression for improved network efficiency and reduced bandwidth usage
4. **Batch Operations**: Use specialized batch processing pools for high-volume data operations
5. **Resource Pooling**: Pool not just connections but also prepared statements and query plans
6. **Performance Monitoring**: Continuously monitor and optimize based on real-world usage patterns

## Conclusion

MongoDB connection pooling provides essential infrastructure for scalable, high-performance database applications. By implementing sophisticated connection management with automatic lifecycle handling, load balancing, and performance optimization, connection pools eliminate the overhead and complexity of per-request connection management while delivering predictable performance characteristics.

Key connection pooling benefits include:

- **Resource Efficiency**: Optimal utilization of database connections and system resources
- **Predictable Performance**: Consistent response times regardless of concurrent load
- **Automatic Management**: Built-in connection lifecycle, health monitoring, and recovery
- **High Availability**: Automatic failover and retry mechanisms for robust error handling  
- **Scalable Architecture**: Support for various deployment patterns from single-instance to globally distributed

Whether you're building high-traffic web applications, batch processing systems, multi-tenant SaaS platforms, or globally distributed services, MongoDB connection pooling with QueryLeaf's familiar SQL interface provides the foundation for robust database connectivity. This combination enables you to implement sophisticated connection management strategies while preserving familiar development patterns and operational approaches.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB connection pool configuration, monitoring, and optimization while providing SQL-familiar connection management syntax. Complex pooling strategies, performance monitoring, and resource optimization are seamlessly handled through familiar SQL patterns, making high-performance database connectivity both powerful and accessible.

The integration of advanced connection pooling with SQL-style database operations makes MongoDB an ideal platform for applications requiring both high-performance database connectivity and familiar interaction patterns, ensuring your database infrastructure remains both efficient and maintainable as it scales and evolves.