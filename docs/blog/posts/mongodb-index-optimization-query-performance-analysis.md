---
title: "MongoDB Index Optimization and Query Performance Analysis: Advanced Database Performance Tuning and Query Optimization for High-Performance Applications"
description: "Master MongoDB index optimization with advanced query performance analysis. Learn indexing strategies, query plan analysis, performance monitoring, and SQL-familiar optimization techniques for scalable database operations."
date: 2025-10-18
tags: [mongodb, index-optimization, query-performance, database-tuning, explain-plans, performance-analysis, sql]
---

# MongoDB Index Optimization and Query Performance Analysis: Advanced Database Performance Tuning and Query Optimization for High-Performance Applications

High-performance database applications require sophisticated indexing strategies and comprehensive query optimization techniques that can handle complex query patterns, large data volumes, and evolving access requirements while maintaining optimal response times. Traditional database optimization approaches often struggle with dynamic workloads, compound query patterns, and the complexity of managing multiple index strategies across diverse data access patterns, leading to suboptimal performance, excessive resource consumption, and operational challenges in production environments.

MongoDB provides comprehensive index optimization capabilities through advanced indexing strategies, sophisticated query analysis tools, and intelligent performance monitoring features that enable database administrators and developers to achieve optimal query performance with minimal resource overhead. Unlike traditional databases that require complex index tuning procedures and manual optimization workflows, MongoDB integrates performance analysis directly into the database with automated index recommendations, real-time query analysis, and built-in optimization guidance.

## The Traditional Query Performance Challenge

Conventional approaches to database query optimization in relational systems face significant limitations in performance analysis and index management:

```sql
-- Traditional PostgreSQL query optimization - manual index management with limited analysis capabilities

-- Basic index tracking table with minimal functionality
CREATE TABLE index_usage_stats (
    index_id SERIAL PRIMARY KEY,
    schema_name VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    index_name VARCHAR(100) NOT NULL,
    index_type VARCHAR(50),
    
    -- Basic usage statistics (very limited visibility)
    index_scans BIGINT DEFAULT 0,
    tuples_read BIGINT DEFAULT 0,
    tuples_fetched BIGINT DEFAULT 0,
    
    -- Size information (manual tracking)
    index_size_bytes BIGINT,
    table_size_bytes BIGINT,
    
    -- Basic metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_analyzed TIMESTAMP,
    is_unique BOOLEAN DEFAULT false,
    is_partial BOOLEAN DEFAULT false,
    
    -- Simple effectiveness metrics
    scan_ratio DECIMAL(10,4),
    selectivity_estimate DECIMAL(10,4)
);

-- Query performance tracking table (basic functionality)
CREATE TABLE query_performance_log (
    query_id SERIAL PRIMARY KEY,
    query_hash VARCHAR(64),
    query_text TEXT,
    
    -- Basic execution metrics
    execution_time_ms INTEGER,
    rows_examined BIGINT,
    rows_returned BIGINT,
    execution_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Resource usage (limited tracking)
    cpu_usage_ms INTEGER,
    memory_usage_kb INTEGER,
    disk_reads INTEGER,
    
    -- Connection information
    database_name VARCHAR(100),
    username VARCHAR(100),
    application_name VARCHAR(100),
    
    -- Basic query plan information (very limited)
    query_plan_hash VARCHAR(64),
    index_usage TEXT[], -- Simple array of index names
    
    -- Performance classification
    performance_category VARCHAR(50) DEFAULT 'unknown'
);

-- Manual query plan analysis function (very basic capabilities)
CREATE OR REPLACE FUNCTION analyze_query_performance(
    query_text_param TEXT,
    execution_count INTEGER DEFAULT 1
) RETURNS TABLE (
    avg_execution_time_ms INTEGER,
    total_rows_examined BIGINT,
    total_rows_returned BIGINT,
    selectivity_ratio DECIMAL(10,4),
    suggested_indexes TEXT[],
    performance_rating VARCHAR(20)
) AS $$
DECLARE
    total_execution_time INTEGER := 0;
    total_examined BIGINT := 0;
    total_returned BIGINT := 0;
    execution_counter INTEGER := 0;
    current_execution_time INTEGER;
    current_examined BIGINT;
    current_returned BIGINT;
    plan_info TEXT;
BEGIN
    -- Simulate multiple query executions for analysis
    WHILE execution_counter < execution_count LOOP
        -- Execute EXPLAIN ANALYZE (simplified simulation)
        BEGIN
            -- This would be an actual EXPLAIN ANALYZE in reality
            EXECUTE 'EXPLAIN ANALYZE ' || query_text_param INTO plan_info;
            
            -- Extract basic metrics (very simplified parsing)
            current_execution_time := (random() * 1000 + 10)::INTEGER; -- Simulated execution time
            current_examined := (random() * 10000 + 100)::BIGINT; -- Simulated rows examined
            current_returned := (random() * 1000 + 10)::BIGINT; -- Simulated rows returned
            
            total_execution_time := total_execution_time + current_execution_time;
            total_examined := total_examined + current_examined;
            total_returned := total_returned + current_returned;
            
            -- Log query performance
            INSERT INTO query_performance_log (
                query_text,
                execution_time_ms,
                rows_examined,
                rows_returned,
                query_plan_hash
            ) VALUES (
                query_text_param,
                current_execution_time,
                current_examined,
                current_returned,
                md5(plan_info)
            );
            
        EXCEPTION WHEN OTHERS THEN
            -- Basic error handling
            current_execution_time := 9999; -- Error indicator
            current_examined := 0;
            current_returned := 0;
        END;
        
        execution_counter := execution_counter + 1;
    END LOOP;
    
    -- Calculate average metrics
    RETURN QUERY SELECT 
        (total_execution_time / execution_count)::INTEGER,
        total_examined,
        total_returned,
        CASE 
            WHEN total_examined > 0 THEN (total_returned::DECIMAL / total_examined)
            ELSE 0
        END,
        
        -- Very basic index suggestions (limited analysis)
        CASE 
            WHEN total_execution_time > 1000 THEN ARRAY['Consider adding indexes on WHERE clause columns']
            WHEN total_examined > total_returned * 10 THEN ARRAY['Add indexes to improve selectivity']
            ELSE ARRAY['Performance appears acceptable']
        END::TEXT[],
        
        -- Simple performance rating
        CASE 
            WHEN total_execution_time < 100 THEN 'excellent'
            WHEN total_execution_time < 500 THEN 'good'
            WHEN total_execution_time < 1000 THEN 'acceptable'
            ELSE 'poor'
        END;
        
END;
$$ LANGUAGE plpgsql;

-- Execute query performance analysis (basic functionality)
SELECT * FROM analyze_query_performance('SELECT * FROM users WHERE email = ''test@example.com'' AND created_at > ''2023-01-01''', 5);

-- Index effectiveness monitoring (limited capabilities)
WITH index_effectiveness AS (
    SELECT 
        ius.schema_name,
        ius.table_name,
        ius.index_name,
        ius.index_type,
        ius.index_scans,
        ius.tuples_read,
        ius.tuples_fetched,
        ius.index_size_bytes,
        
        -- Basic effectiveness calculations
        CASE 
            WHEN ius.index_scans > 0 AND ius.tuples_read > 0 THEN
                ius.tuples_fetched::DECIMAL / ius.tuples_read
            ELSE 0
        END as fetch_ratio,
        
        CASE 
            WHEN ius.table_size_bytes > 0 AND ius.index_size_bytes > 0 THEN
                (ius.index_size_bytes::DECIMAL / ius.table_size_bytes) * 100
            ELSE 0
        END as size_overhead_percent,
        
        -- Usage frequency analysis
        CASE 
            WHEN ius.index_scans = 0 THEN 'unused'
            WHEN ius.index_scans < 10 THEN 'rarely_used'
            WHEN ius.index_scans < 100 THEN 'moderately_used'
            ELSE 'frequently_used'
        END as usage_category
        
    FROM index_usage_stats ius
    WHERE ius.last_analyzed >= CURRENT_DATE - INTERVAL '7 days'
),

query_patterns AS (
    SELECT 
        qpl.database_name,
        qpl.query_hash,
        COUNT(*) as execution_count,
        AVG(qpl.execution_time_ms) as avg_execution_time,
        MAX(qpl.execution_time_ms) as max_execution_time,
        AVG(qpl.rows_examined) as avg_rows_examined,
        AVG(qpl.rows_returned) as avg_rows_returned,
        
        -- Performance trend analysis (very basic)
        CASE 
            WHEN COUNT(*) > 100 AND AVG(qpl.execution_time_ms) > 500 THEN 'high_impact_slow'
            WHEN COUNT(*) > 1000 THEN 'high_frequency'
            WHEN AVG(qpl.execution_time_ms) > 1000 THEN 'slow_query'
            ELSE 'normal'
        END as query_pattern_type,
        
        -- Index usage analysis from query logs
        STRING_AGG(DISTINCT unnest(qpl.index_usage), ', ') as indexes_used,
        
        -- Execution time trends
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY qpl.execution_time_ms) as p95_execution_time
        
    FROM query_performance_log qpl
    WHERE qpl.execution_timestamp >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY qpl.database_name, qpl.query_hash
)

SELECT 
    ie.schema_name,
    ie.table_name,
    ie.index_name,
    ie.index_type,
    ie.usage_category,
    
    -- Index effectiveness metrics
    ie.index_scans,
    ROUND(ie.fetch_ratio, 4) as selectivity_ratio,
    ROUND(ie.size_overhead_percent, 2) as size_overhead_percent,
    
    -- Size analysis
    ROUND(ie.index_size_bytes / 1024.0 / 1024.0, 2) as index_size_mb,
    
    -- Related query patterns
    COUNT(qp.query_hash) as related_query_patterns,
    COALESCE(AVG(qp.avg_execution_time), 0) as avg_query_time_using_index,
    COALESCE(AVG(qp.avg_rows_examined), 0) as avg_rows_examined,
    
    -- Index recommendations (very basic logic)
    CASE 
        WHEN ie.usage_category = 'unused' AND ie.index_size_bytes > 100*1024*1024 THEN 'consider_dropping'
        WHEN ie.fetch_ratio < 0.1 AND ie.index_scans > 0 THEN 'poor_selectivity'
        WHEN ie.usage_category = 'frequently_used' AND ie.fetch_ratio > 0.8 THEN 'high_performance'
        WHEN ie.size_overhead_percent > 50 THEN 'review_necessity'
        ELSE 'monitor'
    END as recommendation,
    
    -- Performance impact assessment
    CASE 
        WHEN ie.usage_category IN ('frequently_used', 'moderately_used') AND ie.fetch_ratio > 0.5 THEN 'positive_impact'
        WHEN ie.usage_category = 'unused' THEN 'no_impact'
        WHEN ie.fetch_ratio < 0.1 THEN 'negative_impact'
        ELSE 'unclear_impact'
    END as performance_impact
    
FROM index_effectiveness ie
LEFT JOIN query_patterns qp ON qp.indexes_used LIKE '%' || ie.index_name || '%'
GROUP BY 
    ie.schema_name, ie.table_name, ie.index_name, ie.index_type, 
    ie.usage_category, ie.index_scans, ie.fetch_ratio, 
    ie.size_overhead_percent, ie.index_size_bytes
ORDER BY 
    ie.index_scans DESC, 
    ie.fetch_ratio DESC,
    ie.index_size_bytes DESC;

-- Query optimization recommendations (very limited analysis)
WITH slow_queries AS (
    SELECT 
        query_hash,
        query_text,
        COUNT(*) as execution_count,
        AVG(execution_time_ms) as avg_time,
        MAX(execution_time_ms) as max_time,
        AVG(rows_examined) as avg_examined,
        AVG(rows_returned) as avg_returned,
        
        -- Basic pattern detection
        CASE 
            WHEN query_text ILIKE '%WHERE%=%' THEN 'equality_filter'
            WHEN query_text ILIKE '%WHERE%>%' OR query_text ILIKE '%WHERE%<%' THEN 'range_filter'
            WHEN query_text ILIKE '%ORDER BY%' THEN 'sorting'
            WHEN query_text ILIKE '%GROUP BY%' THEN 'aggregation'
            ELSE 'unknown_pattern'
        END as query_pattern
        
    FROM query_performance_log
    WHERE execution_time_ms > 500  -- Focus on slow queries
    AND execution_timestamp >= CURRENT_DATE - INTERVAL '24 hours'
    GROUP BY query_hash, query_text
    HAVING COUNT(*) >= 5  -- Frequently executed slow queries
)

SELECT 
    sq.query_hash,
    LEFT(sq.query_text, 100) || '...' as query_preview,
    sq.execution_count,
    ROUND(sq.avg_time, 0) as avg_execution_ms,
    sq.max_time as max_execution_ms,
    ROUND(sq.avg_examined, 0) as avg_rows_examined,
    ROUND(sq.avg_returned, 0) as avg_rows_returned,
    sq.query_pattern,
    
    -- Selectivity analysis
    CASE 
        WHEN sq.avg_examined > 0 THEN 
            ROUND((sq.avg_returned / sq.avg_examined) * 100, 2)
        ELSE 0
    END as selectivity_percent,
    
    -- Impact assessment
    ROUND(sq.execution_count * sq.avg_time, 0) as total_time_impact_ms,
    
    -- Basic optimization suggestions (very limited)
    CASE 
        WHEN sq.query_pattern = 'equality_filter' AND sq.avg_examined > sq.avg_returned * 10 THEN 
            'Add single-column index on equality filter columns'
        WHEN sq.query_pattern = 'range_filter' AND sq.avg_time > 1000 THEN 
            'Consider range-optimized index or query rewrite'
        WHEN sq.query_pattern = 'sorting' AND sq.avg_time > 800 THEN 
            'Add index supporting ORDER BY clause'
        WHEN sq.query_pattern = 'aggregation' AND sq.avg_examined > 10000 THEN 
            'Consider partial index or pre-aggregated data'
        WHEN sq.avg_examined > sq.avg_returned * 100 THEN 
            'Review query selectivity and indexing strategy'
        ELSE 'Manual analysis required'
    END as optimization_suggestion,
    
    -- Priority assessment
    CASE 
        WHEN sq.execution_count > 100 AND sq.avg_time > 1000 THEN 'high'
        WHEN sq.execution_count > 50 OR sq.avg_time > 2000 THEN 'medium'
        ELSE 'low'
    END as optimization_priority
    
FROM slow_queries sq
ORDER BY 
    CASE 
        WHEN sq.execution_count > 100 AND sq.avg_time > 1000 THEN 1
        WHEN sq.execution_count > 50 OR sq.avg_time > 2000 THEN 2
        ELSE 3
    END,
    (sq.execution_count * sq.avg_time) DESC;

-- Problems with traditional query optimization approaches:
-- 1. Manual index management with no automated recommendations
-- 2. Limited query plan analysis and optimization guidance
-- 3. Basic performance metrics with no comprehensive analysis
-- 4. No real-time query performance monitoring
-- 5. Minimal index effectiveness assessment
-- 6. Complex manual tuning procedures requiring deep database expertise
-- 7. No support for compound index optimization strategies
-- 8. Limited visibility into query execution patterns and resource usage
-- 9. Basic alerting with no proactive optimization suggestions
-- 10. No integration with application performance monitoring systems
```

MongoDB provides comprehensive index optimization with advanced query performance analysis capabilities:

```javascript
// MongoDB Advanced Index Optimization and Query Performance Analysis
const { MongoClient } = require('mongodb');
const { EventEmitter } = require('events');

// Comprehensive MongoDB Performance Optimizer
class AdvancedPerformanceOptimizer extends EventEmitter {
  constructor(mongoUri, optimizationConfig = {}) {
    super();
    this.mongoUri = mongoUri;
    this.client = null;
    this.db = null;
    
    // Advanced optimization configuration
    this.config = {
      // Performance analysis configuration
      enableQueryProfiling: optimizationConfig.enableQueryProfiling !== false,
      profilingSampleRate: optimizationConfig.profilingSampleRate || 0.1,
      slowQueryThresholdMs: optimizationConfig.slowQueryThresholdMs || 100,
      
      // Index optimization settings
      enableAutomaticIndexRecommendations: optimizationConfig.enableAutomaticIndexRecommendations !== false,
      enableIndexUsageAnalysis: optimizationConfig.enableIndexUsageAnalysis !== false,
      enableCompoundIndexOptimization: optimizationConfig.enableCompoundIndexOptimization || false,
      
      // Monitoring and alerting
      enablePerformanceMonitoring: optimizationConfig.enablePerformanceMonitoring !== false,
      enableRealTimeAnalysis: optimizationConfig.enableRealTimeAnalysis || false,
      enablePerformanceAlerting: optimizationConfig.enablePerformanceAlerting || false,
      
      // Analysis parameters
      analysisWindowHours: optimizationConfig.analysisWindowHours || 24,
      minQueryExecutions: optimizationConfig.minQueryExecutions || 10,
      indexUsageThreshold: optimizationConfig.indexUsageThreshold || 0.1,
      
      // Resource optimization
      enableResourceOptimization: optimizationConfig.enableResourceOptimization || false,
      enableQueryPlanCaching: optimizationConfig.enableQueryPlanCaching !== false,
      enableConnectionPoolOptimization: optimizationConfig.enableConnectionPoolOptimization || false
    };
    
    // Performance tracking and analysis state
    this.queryPatterns = new Map();
    this.indexUsageStats = new Map();
    this.performanceMetrics = new Map();
    this.optimizationRecommendations = [];
    
    // Query execution tracking
    this.queryExecutionHistory = [];
    this.slowQueryLog = [];
    this.indexEffectivenessCache = new Map();
    
    this.initializePerformanceOptimizer();
  }

  async initializePerformanceOptimizer() {
    console.log('Initializing advanced MongoDB performance optimizer...');
    
    try {
      // Connect to MongoDB
      this.client = new MongoClient(this.mongoUri, {
        // Optimized connection settings
        maxPoolSize: 20,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 10000
      });
      
      await this.client.connect();
      this.db = this.client.db();
      
      // Setup performance monitoring infrastructure
      await this.setupPerformanceInfrastructure();
      
      // Enable query profiling if configured
      if (this.config.enableQueryProfiling) {
        await this.enableQueryProfiling();
      }
      
      // Start real-time monitoring if enabled
      if (this.config.enableRealTimeAnalysis) {
        await this.startRealTimeMonitoring();
      }
      
      // Initialize index analysis
      if (this.config.enableIndexUsageAnalysis) {
        await this.initializeIndexAnalysis();
      }
      
      console.log('Advanced performance optimizer initialized successfully');
      
    } catch (error) {
      console.error('Error initializing performance optimizer:', error);
      throw error;
    }
  }

  async setupPerformanceInfrastructure() {
    console.log('Setting up performance monitoring infrastructure...');
    
    try {
      // Create collections for performance tracking
      const collections = {
        queryPerformanceLog: this.db.collection('query_performance_log'),
        indexUsageStats: this.db.collection('index_usage_stats'),
        performanceMetrics: this.db.collection('performance_metrics'),
        optimizationRecommendations: this.db.collection('optimization_recommendations'),
        queryPatterns: this.db.collection('query_patterns')
      };

      // Create indexes for performance collections
      await collections.queryPerformanceLog.createIndex(
        { timestamp: -1, executionTimeMs: -1 },
        { background: true, expireAfterSeconds: 7 * 24 * 60 * 60 } // 7 days retention
      );
      
      await collections.indexUsageStats.createIndex(
        { collection: 1, indexName: 1, timestamp: -1 },
        { background: true }
      );
      
      await collections.performanceMetrics.createIndex(
        { metricType: 1, timestamp: -1 },
        { background: true, expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days retention
      );
      
      this.collections = collections;
      
    } catch (error) {
      console.error('Error setting up performance infrastructure:', error);
      throw error;
    }
  }

  async enableQueryProfiling() {
    console.log('Enabling MongoDB query profiling...');
    
    try {
      // Set profiling level based on configuration
      await this.db.admin().command({
        profile: 2, // Profile all operations
        slowms: this.config.slowQueryThresholdMs,
        sampleRate: this.config.profilingSampleRate
      });
      
      console.log(`Query profiling enabled with ${this.config.slowQueryThresholdMs}ms threshold and ${this.config.profilingSampleRate} sample rate`);
      
    } catch (error) {
      console.error('Error enabling query profiling:', error);
      // Don't throw - profiling is optional
    }
  }

  async analyzeQueryPerformance(timeRangeHours = 24) {
    console.log(`Analyzing query performance for the last ${timeRangeHours} hours...`);
    
    try {
      const analysisStartTime = new Date(Date.now() - (timeRangeHours * 60 * 60 * 1000));
      
      // Analyze profiler data for slow queries and patterns
      const slowQueries = await this.analyzeSlowQueries(analysisStartTime);
      const queryPatterns = await this.analyzeQueryPatterns(analysisStartTime);
      const indexUsageAnalysis = await this.analyzeIndexUsage(analysisStartTime);
      
      // Generate performance insights
      const performanceInsights = {
        analysisTimestamp: new Date(),
        timeRangeHours: timeRangeHours,
        
        // Query performance summary
        queryPerformanceSummary: {
          totalQueries: slowQueries.totalQueries,
          slowQueries: slowQueries.slowQueryCount,
          averageExecutionTime: slowQueries.averageExecutionTime,
          p95ExecutionTime: slowQueries.p95ExecutionTime,
          p99ExecutionTime: slowQueries.p99ExecutionTime,
          
          // Query type distribution
          queryTypeDistribution: queryPatterns.queryTypeDistribution,
          
          // Resource usage patterns
          resourceUsage: {
            totalExaminedDocuments: slowQueries.totalExaminedDocuments,
            totalReturnedDocuments: slowQueries.totalReturnedDocuments,
            averageSelectivityRatio: slowQueries.averageSelectivityRatio
          }
        },
        
        // Index effectiveness analysis
        indexEffectiveness: {
          totalIndexes: indexUsageAnalysis.totalIndexes,
          activelyUsedIndexes: indexUsageAnalysis.activelyUsedIndexes,
          unusedIndexes: indexUsageAnalysis.unusedIndexes,
          inefficientIndexes: indexUsageAnalysis.inefficientIndexes,
          
          // Index usage patterns
          indexUsagePatterns: indexUsageAnalysis.usagePatterns,
          
          // Index performance metrics
          averageIndexSelectivity: indexUsageAnalysis.averageSelectivity,
          indexSizeOverhead: indexUsageAnalysis.totalIndexSizeBytes
        },
        
        // Performance bottlenecks
        performanceBottlenecks: await this.identifyPerformanceBottlenecks(slowQueries, queryPatterns, indexUsageAnalysis),
        
        // Optimization opportunities
        optimizationOpportunities: await this.generateOptimizationRecommendations(slowQueries, queryPatterns, indexUsageAnalysis)
      };
      
      // Store performance analysis results
      await this.collections.performanceMetrics.insertOne({
        metricType: 'comprehensive_analysis',
        timestamp: new Date(),
        analysisResults: performanceInsights
      });
      
      this.emit('performanceAnalysisCompleted', performanceInsights);
      
      return {
        success: true,
        analysisResults: performanceInsights
      };
      
    } catch (error) {
      console.error('Error analyzing query performance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async analyzeSlowQueries(startTime) {
    console.log('Analyzing slow query patterns...');
    
    try {
      // Query the profiler collection for slow queries
      const profilerCollection = this.db.collection('system.profile');
      
      const slowQueryAggregation = [
        {
          $match: {
            ts: { $gte: startTime },
            op: { $in: ['query', 'getmore'] }, // Focus on read operations
            millis: { $gte: this.config.slowQueryThresholdMs }
          }
        },
        {
          $addFields: {
            // Normalize query shape for pattern analysis
            queryShape: {
              $function: {
                body: function(command) {
                  // Simplified query shape normalization
                  if (!command || !command.find) return 'unknown';
                  
                  const filter = command.find.filter || {};
                  const sort = command.find.sort || {};
                  const projection = command.find.projection || {};
                  
                  // Create shape by replacing values with type indicators
                  const shapeFilter = Object.keys(filter).reduce((acc, key) => {
                    acc[key] = typeof filter[key];
                    return acc;
                  }, {});
                  
                  return JSON.stringify({
                    filter: shapeFilter,
                    sort: Object.keys(sort),
                    projection: Object.keys(projection)
                  });
                },
                args: ['$command'],
                lang: 'js'
              }
            },
            
            // Extract collection name
            targetCollection: {
              $ifNull: ['$command.find', '$command.collection']
            },
            
            // Calculate selectivity ratio
            selectivityRatio: {
              $cond: [
                { $and: [{ $gt: ['$docsExamined', 0] }, { $gt: ['$nreturned', 0] }] },
                { $divide: ['$nreturned', '$docsExamined'] },
                0
              ]
            }
          }
        },
        {
          $group: {
            _id: {
              queryShape: '$queryShape',
              collection: '$targetCollection'
            },
            
            // Execution statistics
            executionCount: { $sum: 1 },
            totalExecutionTime: { $sum: '$millis' },
            averageExecutionTime: { $avg: '$millis' },
            maxExecutionTime: { $max: '$millis' },
            minExecutionTime: { $min: '$millis' },
            
            // Document examination statistics
            totalDocsExamined: { $sum: '$docsExamined' },
            totalDocsReturned: { $sum: '$nreturned' },
            averageSelectivity: { $avg: '$selectivityRatio' },
            
            // Index usage tracking
            indexesUsed: { $addToSet: '$planSummary' },
            
            // Resource usage
            totalKeysExamined: { $sum: '$keysExamined' },
            
            // Sample query for reference
            sampleQuery: { $first: '$command' },
            sampleTimestamp: { $first: '$ts' }
          }
        },
        {
          $addFields: {
            // Calculate performance impact
            performanceImpact: {
              $multiply: ['$executionCount', '$averageExecutionTime']
            },
            
            // Assess query efficiency
            queryEfficiency: {
              $cond: [
                { $gt: ['$averageSelectivity', 0.1] },
                'efficient',
                { $cond: [{ $gt: ['$averageSelectivity', 0.01] }, 'moderate', 'inefficient'] }
              ]
            }
          }
        },
        {
          $sort: { performanceImpact: -1 }
        },
        {
          $limit: 100 // Top 100 slow query patterns
        }
      ];

      const slowQueryResults = await profilerCollection.aggregate(slowQueryAggregation).toArray();
      
      // Calculate summary statistics
      const totalQueries = slowQueryResults.reduce((sum, query) => sum + query.executionCount, 0);
      const totalExecutionTime = slowQueryResults.reduce((sum, query) => sum + query.totalExecutionTime, 0);
      const allExecutionTimes = slowQueryResults.flatMap(query => Array(query.executionCount).fill(query.averageExecutionTime));
      
      // Calculate percentiles
      allExecutionTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(allExecutionTimes.length * 0.95);
      const p99Index = Math.floor(allExecutionTimes.length * 0.99);
      
      return {
        slowQueryPatterns: slowQueryResults,
        totalQueries: totalQueries,
        slowQueryCount: slowQueryResults.length,
        averageExecutionTime: totalQueries > 0 ? totalExecutionTime / totalQueries : 0,
        p95ExecutionTime: allExecutionTimes[p95Index] || 0,
        p99ExecutionTime: allExecutionTimes[p99Index] || 0,
        totalExaminedDocuments: slowQueryResults.reduce((sum, query) => sum + query.totalDocsExamined, 0),
        totalReturnedDocuments: slowQueryResults.reduce((sum, query) => sum + query.totalDocsReturned, 0),
        averageSelectivityRatio: slowQueryResults.length > 0 
          ? slowQueryResults.reduce((sum, query) => sum + (query.averageSelectivity || 0), 0) / slowQueryResults.length 
          : 0
      };
      
    } catch (error) {
      console.error('Error analyzing slow queries:', error);
      throw error;
    }
  }

  async analyzeQueryPatterns(startTime) {
    console.log('Analyzing query execution patterns...');
    
    try {
      const profilerCollection = this.db.collection('system.profile');
      
      // Analyze query type distribution and patterns
      const queryPatternAggregation = [
        {
          $match: {
            ts: { $gte: startTime },
            op: { $in: ['query', 'getmore', 'update', 'delete', 'insert'] }
          }
        },
        {
          $addFields: {
            // Categorize query operations
            queryCategory: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$op', 'query'] },
                    then: {
                      $cond: [
                        { $ifNull: ['$command.find.sort', false] },
                        'sorted_query',
                        { $cond: [
                          { $gt: [{ $size: { $objectToArray: { $ifNull: ['$command.find.filter', {}] } } }, 0] },
                          'filtered_query',
                          'full_scan'
                        ]}
                      ]
                    }
                  },
                  { case: { $eq: ['$op', 'update'] }, then: 'update_operation' },
                  { case: { $eq: ['$op', 'delete'] }, then: 'delete_operation' },
                  { case: { $eq: ['$op', 'insert'] }, then: 'insert_operation' }
                ],
                default: 'other_operation'
              }
            },
            
            // Analyze query complexity
            queryComplexity: {
              $switch: {
                branches: [
                  {
                    case: { $and: [
                      { $eq: ['$op', 'query'] },
                      { $gt: [{ $size: { $objectToArray: { $ifNull: ['$command.find.filter', {}] } } }, 5] }
                    ]},
                    then: 'complex'
                  },
                  {
                    case: { $and: [
                      { $eq: ['$op', 'query'] },
                      { $gt: [{ $size: { $objectToArray: { $ifNull: ['$command.find.filter', {}] } } }, 2] }
                    ]},
                    then: 'moderate'
                  }
                ],
                default: 'simple'
              }
            }
          }
        },
        {
          $group: {
            _id: {
              collection: { $ifNull: ['$command.find', '$command.collection', '$ns'] },
              queryCategory: '$queryCategory',
              queryComplexity: '$queryComplexity'
            },
            
            // Pattern statistics
            executionCount: { $sum: 1 },
            averageExecutionTime: { $avg: '$millis' },
            totalExecutionTime: { $sum: '$millis' },
            
            // Resource usage patterns
            averageDocsExamined: { $avg: '$docsExamined' },
            averageDocsReturned: { $avg: '$nreturned' },
            
            // Index usage patterns
            commonIndexes: { $addToSet: '$planSummary' },
            
            // Performance characteristics
            maxExecutionTime: { $max: '$millis' },
            minExecutionTime: { $min: '$millis' }
          }
        },
        {
          $sort: { totalExecutionTime: -1 }
        }
      ];

      const queryPatternResults = await profilerCollection.aggregate(queryPatternAggregation).toArray();
      
      // Calculate query type distribution
      const queryTypeDistribution = queryPatternResults.reduce((distribution, pattern) => {
        const category = pattern._id.queryCategory;
        if (!distribution[category]) {
          distribution[category] = {
            count: 0,
            totalTime: 0,
            avgTime: 0
          };
        }
        
        distribution[category].count += pattern.executionCount;
        distribution[category].totalTime += pattern.totalExecutionTime;
        distribution[category].avgTime = distribution[category].totalTime / distribution[category].count;
        
        return distribution;
      }, {});
      
      return {
        queryPatterns: queryPatternResults,
        queryTypeDistribution: queryTypeDistribution,
        totalPatterns: queryPatternResults.length
      };
      
    } catch (error) {
      console.error('Error analyzing query patterns:', error);
      throw error;
    }
  }

  async analyzeIndexUsage(startTime) {
    console.log('Analyzing index usage effectiveness...');
    
    try {
      // Get all collections for comprehensive index analysis
      const collections = await this.db.listCollections().toArray();
      const indexAnalysisResults = [];
      
      for (const collectionInfo of collections) {
        if (collectionInfo.type === 'collection') {
          const collection = this.db.collection(collectionInfo.name);
          
          // Get index information
          const indexes = await collection.indexes();
          
          // Analyze each index
          for (const index of indexes) {
            try {
              // Get index usage statistics
              const indexStats = await collection.aggregate([
                { $indexStats: {} },
                { $match: { name: index.name } }
              ]).toArray();
              
              const indexStat = indexStats[0];
              
              if (indexStat) {
                // Calculate index effectiveness metrics
                const indexAnalysis = {
                  collection: collectionInfo.name,
                  indexName: index.name,
                  indexKeys: index.key,
                  indexType: this.determineIndexType(index),
                  
                  // Usage statistics
                  usageCount: indexStat.accesses?.ops || 0,
                  lastUsed: indexStat.accesses?.since || null,
                  
                  // Size and storage information
                  indexSize: index.size || 0,
                  
                  // Effectiveness calculations
                  usageEffectiveness: this.calculateIndexEffectiveness(indexStat, index),
                  
                  // Index health assessment
                  healthStatus: this.assessIndexHealth(indexStat, index),
                  
                  // Optimization opportunities
                  optimizationOpportunities: await this.identifyIndexOptimizations(collection, index, indexStat)
                };
                
                indexAnalysisResults.push(indexAnalysis);
              }
              
            } catch (indexError) {
              console.warn(`Error analyzing index ${index.name} on ${collectionInfo.name}:`, indexError.message);
            }
          }
        }
      }
      
      // Calculate summary statistics
      const totalIndexes = indexAnalysisResults.length;
      const activelyUsedIndexes = indexAnalysisResults.filter(index => index.usageCount > 0).length;
      const unusedIndexes = indexAnalysisResults.filter(index => index.usageCount === 0);
      const inefficientIndexes = indexAnalysisResults.filter(index => 
        index.healthStatus === 'inefficient' || index.usageEffectiveness < 0.1
      );
      
      // Analyze usage patterns
      const usagePatterns = this.analyzeIndexUsagePatterns(indexAnalysisResults);
      
      return {
        indexAnalysisResults: indexAnalysisResults,
        totalIndexes: totalIndexes,
        activelyUsedIndexes: activelyUsedIndexes,
        unusedIndexes: unusedIndexes,
        inefficientIndexes: inefficientIndexes,
        usagePatterns: usagePatterns,
        averageSelectivity: this.calculateAverageIndexSelectivity(indexAnalysisResults),
        totalIndexSizeBytes: indexAnalysisResults.reduce((total, index) => total + (index.indexSize || 0), 0)
      };
      
    } catch (error) {
      console.error('Error analyzing index usage:', error);
      throw error;
    }
  }

  async generateOptimizationRecommendations(slowQueries, queryPatterns, indexUsage) {
    console.log('Generating performance optimization recommendations...');
    
    try {
      const recommendations = [];
      
      // Analyze slow queries for index recommendations
      for (const slowQuery of slowQueries.slowQueryPatterns) {
        if (slowQuery.averageSelectivity < 0.1 && slowQuery.executionCount > this.config.minQueryExecutions) {
          recommendations.push({
            type: 'index_recommendation',
            priority: 'high',
            collection: slowQuery._id.collection,
            issue: 'Low selectivity query pattern with high execution frequency',
            recommendation: await this.generateIndexRecommendation(slowQuery),
            expectedImprovement: this.estimatePerformanceImprovement(slowQuery),
            implementationComplexity: 'medium',
            estimatedImpact: slowQuery.performanceImpact
          });
        }
      }
      
      // Analyze unused indexes
      for (const unusedIndex of indexUsage.unusedIndexes) {
        if (unusedIndex.indexName !== '_id_') { // Never recommend dropping _id index
          recommendations.push({
            type: 'index_cleanup',
            priority: 'medium',
            collection: unusedIndex.collection,
            issue: `Unused index consuming storage space: ${unusedIndex.indexName}`,
            recommendation: `Consider dropping unused index '${unusedIndex.indexName}' to save ${Math.round((unusedIndex.indexSize || 0) / 1024 / 1024)} MB storage`,
            expectedImprovement: {
              storageReduction: unusedIndex.indexSize || 0,
              maintenanceOverheadReduction: 'low'
            },
            implementationComplexity: 'low',
            estimatedImpact: unusedIndex.indexSize || 0
          });
        }
      }
      
      // Analyze compound index opportunities
      if (this.config.enableCompoundIndexOptimization) {
        const compoundIndexOpportunities = await this.analyzeCompoundIndexOpportunities(queryPatterns);
        recommendations.push(...compoundIndexOpportunities);
      }
      
      // Sort recommendations by priority and estimated impact
      recommendations.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        
        if (priorityDiff !== 0) return priorityDiff;
        return (b.estimatedImpact || 0) - (a.estimatedImpact || 0);
      });
      
      return recommendations.slice(0, 20); // Return top 20 recommendations
      
    } catch (error) {
      console.error('Error generating optimization recommendations:', error);
      return [];
    }
  }

  async generateIndexRecommendation(slowQuery) {
    try {
      // Analyze the query shape to determine optimal index structure
      const queryShape = JSON.parse(slowQuery._id.queryShape);
      const filterFields = Object.keys(queryShape.filter || {});
      const sortFields = queryShape.sort || [];
      
      let recommendedIndex = {};
      
      // Build compound index recommendation based on query patterns
      // Rule 1: Equality filters first
      filterFields.forEach(field => {
        if (queryShape.filter[field] === 'string' || queryShape.filter[field] === 'number') {
          recommendedIndex[field] = 1;
        }
      });
      
      // Rule 2: Range filters after equality filters
      filterFields.forEach(field => {
        if (queryShape.filter[field] === 'object') { // Likely range query
          if (!recommendedIndex[field]) {
            recommendedIndex[field] = 1;
          }
        }
      });
      
      // Rule 3: Sort fields last
      sortFields.forEach(field => {
        if (!recommendedIndex[field]) {
          recommendedIndex[field] = 1;
        }
      });
      
      return {
        suggestedIndex: recommendedIndex,
        indexCommand: `db.${slowQuery._id.collection}.createIndex(${JSON.stringify(recommendedIndex)})`,
        reasoning: `Compound index optimized for query pattern with ${filterFields.length} filter fields and ${sortFields.length} sort fields`,
        estimatedSize: this.estimateIndexSize(recommendedIndex, slowQuery._id.collection)
      };
      
    } catch (error) {
      console.error('Error generating index recommendation:', error);
      return {
        suggestedIndex: {},
        indexCommand: 'Manual analysis required',
        reasoning: 'Unable to analyze query pattern automatically',
        estimatedSize: 0
      };
    }
  }

  async explainQuery(collection, query, options = {}) {
    console.log(`Explaining query execution plan for collection: ${collection}`);
    
    try {
      const targetCollection = this.db.collection(collection);
      
      // Execute explain with detailed execution stats
      const explainResult = await targetCollection
        .find(query.filter || {}, options)
        .sort(query.sort || {})
        .limit(query.limit || 0)
        .explain('executionStats');
      
      // Analyze execution plan
      const executionAnalysis = this.analyzeExecutionPlan(explainResult);
      
      // Generate optimization insights
      const optimizationInsights = await this.generateQueryOptimizationInsights(
        collection, 
        query, 
        explainResult, 
        executionAnalysis
      );
      
      return {
        success: true,
        query: query,
        executionPlan: explainResult,
        executionAnalysis: executionAnalysis,
        optimizationInsights: optimizationInsights,
        explainTimestamp: new Date()
      };
      
    } catch (error) {
      console.error(`Error explaining query for collection ${collection}:`, error);
      return {
        success: false,
        collection: collection,
        query: query,
        error: error.message
      };
    }
  }

  analyzeExecutionPlan(explainResult) {
    try {
      const executionStats = explainResult.executionStats;
      const winningPlan = explainResult.queryPlanner?.winningPlan;
      
      const analysis = {
        // Basic execution metrics
        executionTime: executionStats.executionTimeMillis,
        documentsExamined: executionStats.totalDocsExamined,
        documentsReturned: executionStats.totalDocsReturned,
        keysExamined: executionStats.totalKeysExamined,
        
        // Efficiency calculations
        selectivityRatio: executionStats.totalDocsExamined > 0 
          ? executionStats.totalDocsReturned / executionStats.totalDocsExamined 
          : 0,
        
        indexEfficiency: executionStats.totalKeysExamined > 0 
          ? executionStats.totalDocsReturned / executionStats.totalKeysExamined 
          : 0,
        
        // Plan analysis
        planType: this.identifyPlanType(winningPlan),
        indexesUsed: this.extractIndexesUsed(winningPlan),
        hasSort: this.hasSortStage(winningPlan),
        hasBlockingSort: this.hasBlockingSortStage(winningPlan),
        
        // Performance assessment
        performanceRating: this.assessQueryPerformance(executionStats, winningPlan),
        
        // Resource usage
        workingSetSize: executionStats.workingSetSize || 0,
        
        // Optimization opportunities
        needsOptimization: this.needsOptimization(executionStats, winningPlan)
      };
      
      return analysis;
      
    } catch (error) {
      console.error('Error analyzing execution plan:', error);
      return {
        error: 'Failed to analyze execution plan',
        executionTime: 0,
        documentsExamined: 0,
        documentsReturned: 0,
        needsOptimization: true
      };
    }
  }

  async generateQueryOptimizationInsights(collection, query, explainResult, executionAnalysis) {
    try {
      const insights = [];
      
      // Check for full collection scans
      if (executionAnalysis.planType === 'COLLSCAN') {
        insights.push({
          type: 'full_scan_detected',
          severity: 'high',
          message: 'Query is performing a full collection scan',
          recommendation: 'Add an appropriate index to avoid collection scanning',
          suggestedIndex: await this.suggestIndexForQuery(query)
        });
      }
      
      // Check for low selectivity
      if (executionAnalysis.selectivityRatio < 0.1) {
        insights.push({
          type: 'low_selectivity',
          severity: 'medium',
          message: `Query selectivity is low (${(executionAnalysis.selectivityRatio * 100).toFixed(2)}%)`,
          recommendation: 'Consider more selective query conditions or compound indexes',
          currentSelectivity: executionAnalysis.selectivityRatio
        });
      }
      
      // Check for blocking sorts
      if (executionAnalysis.hasBlockingSort) {
        insights.push({
          type: 'blocking_sort',
          severity: 'high',
          message: 'Query requires in-memory sorting which can be expensive',
          recommendation: 'Create an index that supports the sort order',
          suggestedIndex: this.suggestSortIndex(query.sort)
        });
      }
      
      // Check for excessive key examination
      if (executionAnalysis.keysExamined > executionAnalysis.documentsReturned * 10) {
        insights.push({
          type: 'excessive_key_examination',
          severity: 'medium',
          message: 'Query is examining significantly more keys than documents returned',
          recommendation: 'Consider compound indexes to improve key examination efficiency',
          keysExamined: executionAnalysis.keysExamined,
          documentsReturned: executionAnalysis.documentsReturned
        });
      }
      
      // Check execution time
      if (executionAnalysis.executionTime > this.config.slowQueryThresholdMs) {
        insights.push({
          type: 'slow_execution',
          severity: executionAnalysis.executionTime > this.config.slowQueryThresholdMs * 5 ? 'high' : 'medium',
          message: `Query execution time (${executionAnalysis.executionTime}ms) exceeds threshold`,
          recommendation: 'Consider query optimization or index improvements',
          executionTime: executionAnalysis.executionTime,
          threshold: this.config.slowQueryThresholdMs
        });
      }
      
      return insights;
      
    } catch (error) {
      console.error('Error generating query optimization insights:', error);
      return [];
    }
  }

  async getPerformanceMetrics(timeRangeHours = 24) {
    console.log(`Retrieving performance metrics for the last ${timeRangeHours} hours...`);
    
    try {
      const startTime = new Date(Date.now() - (timeRangeHours * 60 * 60 * 1000));
      
      // Get comprehensive performance metrics
      const metrics = await this.collections.performanceMetrics
        .find({
          timestamp: { $gte: startTime }
        })
        .sort({ timestamp: -1 })
        .toArray();
      
      // Calculate summary statistics
      const performanceSummary = this.calculatePerformanceSummary(metrics);
      
      // Get current optimization recommendations
      const currentRecommendations = await this.collections.optimizationRecommendations
        .find({
          createdAt: { $gte: startTime },
          status: { $ne: 'implemented' }
        })
        .sort({ priority: -1, estimatedImpact: -1 })
        .limit(10)
        .toArray();
      
      return {
        success: true,
        timeRangeHours: timeRangeHours,
        metricsCollected: metrics.length,
        performanceSummary: performanceSummary,
        currentRecommendations: currentRecommendations,
        lastUpdated: new Date()
      };
      
    } catch (error) {
      console.error('Error retrieving performance metrics:', error);
      return {
        success: false,
        error: error.message,
        timeRangeHours: timeRangeHours
      };
    }
  }

  calculatePerformanceSummary(metrics) {
    if (metrics.length === 0) {
      return {
        totalQueries: 0,
        averageExecutionTime: 0,
        slowQueries: 0,
        indexEffectiveness: 'unknown'
      };
    }
    
    // Extract metrics from analysis results
    const analysisResults = metrics
      .filter(metric => metric.metricType === 'comprehensive_analysis')
      .map(metric => metric.analysisResults);
    
    if (analysisResults.length === 0) {
      return {
        totalQueries: 0,
        averageExecutionTime: 0,
        slowQueries: 0,
        indexEffectiveness: 'no_data'
      };
    }
    
    const latestAnalysis = analysisResults[0];
    
    return {
      totalQueries: latestAnalysis.queryPerformanceSummary?.totalQueries || 0,
      averageExecutionTime: latestAnalysis.queryPerformanceSummary?.averageExecutionTime || 0,
      p95ExecutionTime: latestAnalysis.queryPerformanceSummary?.p95ExecutionTime || 0,
      slowQueries: latestAnalysis.queryPerformanceSummary?.slowQueries || 0,
      
      // Index effectiveness
      indexEffectiveness: {
        totalIndexes: latestAnalysis.indexEffectiveness?.totalIndexes || 0,
        activelyUsedIndexes: latestAnalysis.indexEffectiveness?.activelyUsedIndexes || 0,
        unusedIndexes: latestAnalysis.indexEffectiveness?.unusedIndexes?.length || 0,
        averageSelectivity: latestAnalysis.indexEffectiveness?.averageIndexSelectivity || 0
      },
      
      // Performance trends
      performanceBottlenecks: latestAnalysis.performanceBottlenecks || [],
      optimizationOpportunities: latestAnalysis.optimizationOpportunities?.length || 0
    };
  }

  // Utility methods for performance analysis

  determineIndexType(index) {
    if (index.name === '_id_') return 'primary';
    if (index.unique) return 'unique';
    if (index.sparse) return 'sparse';
    if (index.partialFilterExpression) return 'partial';
    if (Object.values(index.key).includes('text')) return 'text';
    if (Object.values(index.key).includes('2dsphere')) return 'geospatial';
    if (Object.keys(index.key).length > 1) return 'compound';
    return 'single';
  }

  calculateIndexEffectiveness(indexStat, index) {
    const usageCount = indexStat.accesses?.ops || 0;
    const indexSize = index.size || 0;
    
    // Calculate effectiveness based on usage frequency and size efficiency
    if (usageCount === 0) return 0;
    if (indexSize === 0) return 1;
    
    // Simple effectiveness metric: usage per MB of index size
    const sizeInMB = indexSize / (1024 * 1024);
    return Math.min(usageCount / Math.max(sizeInMB, 1), 100);
  }

  assessIndexHealth(indexStat, index) {
    const usageCount = indexStat.accesses?.ops || 0;
    const effectiveness = this.calculateIndexEffectiveness(indexStat, index);
    
    if (usageCount === 0) return 'unused';
    if (effectiveness < 0.1) return 'inefficient';
    if (effectiveness > 10) return 'highly_effective';
    return 'moderate';
  }

  identifyPlanType(winningPlan) {
    if (!winningPlan) return 'unknown';
    if (winningPlan.stage === 'COLLSCAN') return 'COLLSCAN';
    if (winningPlan.stage === 'IXSCAN') return 'IXSCAN';
    if (winningPlan.inputStage?.stage === 'IXSCAN') return 'IXSCAN';
    return winningPlan.stage || 'unknown';
  }

  extractIndexesUsed(winningPlan) {
    const indexes = [];
    
    function extractFromStage(stage) {
      if (stage.indexName) {
        indexes.push(stage.indexName);
      }
      if (stage.inputStage) {
        extractFromStage(stage.inputStage);
      }
      if (stage.inputStages) {
        stage.inputStages.forEach(extractFromStage);
      }
    }
    
    if (winningPlan) {
      extractFromStage(winningPlan);
    }
    
    return [...new Set(indexes)]; // Remove duplicates
  }

  hasSortStage(winningPlan) {
    if (!winningPlan) return false;
    
    function checkForSort(stage) {
      if (stage.stage === 'SORT') return true;
      if (stage.inputStage) return checkForSort(stage.inputStage);
      if (stage.inputStages) return stage.inputStages.some(checkForSort);
      return false;
    }
    
    return checkForSort(winningPlan);
  }

  hasBlockingSortStage(winningPlan) {
    if (!winningPlan) return false;
    
    function checkForBlockingSort(stage) {
      // A sort is blocking if it's not supported by an index
      if (stage.stage === 'SORT' && !stage.inputStage?.stage?.includes('IXSCAN')) {
        return true;
      }
      if (stage.inputStage) return checkForBlockingSort(stage.inputStage);
      if (stage.inputStages) return stage.inputStages.some(checkForBlockingSort);
      return false;
    }
    
    return checkForBlockingSort(winningPlan);
  }

  assessQueryPerformance(executionStats, winningPlan) {
    const executionTime = executionStats.executionTimeMillis || 0;
    const selectivityRatio = executionStats.totalDocsExamined > 0 
      ? executionStats.totalDocsReturned / executionStats.totalDocsExamined 
      : 0;
    
    // Performance rating based on multiple factors
    let score = 100;
    
    // Penalize slow execution
    if (executionTime > 1000) score -= 40;
    else if (executionTime > 500) score -= 20;
    else if (executionTime > 100) score -= 10;
    
    // Penalize low selectivity
    if (selectivityRatio < 0.01) score -= 30;
    else if (selectivityRatio < 0.1) score -= 15;
    
    // Penalize full collection scans
    if (winningPlan?.stage === 'COLLSCAN') score -= 25;
    
    // Penalize blocking sorts
    if (this.hasBlockingSortStage(winningPlan)) score -= 15;
    
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  needsOptimization(executionStats, winningPlan) {
    const executionTime = executionStats.executionTimeMillis || 0;
    const selectivityRatio = executionStats.totalDocsExamined > 0 
      ? executionStats.totalDocsReturned / executionStats.totalDocsExamined 
      : 0;
    
    return executionTime > this.config.slowQueryThresholdMs ||
           selectivityRatio < 0.1 ||
           winningPlan?.stage === 'COLLSCAN' ||
           this.hasBlockingSortStage(winningPlan);
  }

  estimatePerformanceImprovement(slowQuery) {
    return {
      executionTimeReduction: '60-80%',
      documentExaminationReduction: '90-95%',
      resourceUsageReduction: '70-85%',
      confidenceLevel: 'high'
    };
  }

  estimateIndexSize(indexKeys, collection) {
    // Simplified index size estimation
    const keyCount = Object.keys(indexKeys).length;
    const estimatedDocumentSize = 100; // Average document size estimate
    const estimatedCollectionSize = 100000; // Estimate
    
    return keyCount * estimatedDocumentSize * estimatedCollectionSize * 0.1;
  }

  async shutdown() {
    console.log('Shutting down performance optimizer...');
    
    try {
      // Disable profiling
      if (this.config.enableQueryProfiling) {
        await this.db.admin().command({ profile: 0 });
      }
      
      // Close MongoDB connection
      if (this.client) {
        await this.client.close();
      }
      
      console.log('Performance optimizer shutdown complete');
      
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }

  // Additional methods would include implementations for:
  // - startRealTimeMonitoring()
  // - initializeIndexAnalysis()
  // - identifyPerformanceBottlenecks()
  // - analyzeIndexUsagePatterns()
  // - calculateAverageIndexSelectivity()
  // - analyzeCompoundIndexOpportunities()
  // - identifyIndexOptimizations()
  // - suggestIndexForQuery()
  // - suggestSortIndex()
}

// Benefits of MongoDB Advanced Performance Optimization:
// - Comprehensive query performance analysis and monitoring
// - Intelligent index optimization recommendations
// - Real-time performance bottleneck identification
// - Advanced execution plan analysis and insights
// - Automated slow query detection and optimization
// - Index usage effectiveness assessment
// - Compound index optimization strategies
// - SQL-compatible performance operations through QueryLeaf integration
// - Production-ready monitoring and alerting capabilities
// - Enterprise-grade performance tuning automation

module.exports = {
  AdvancedPerformanceOptimizer
};
```

## Understanding MongoDB Performance Architecture

### Advanced Query Optimization and Index Management Patterns

Implement sophisticated performance optimization workflows for enterprise MongoDB deployments:

```javascript
// Enterprise-grade performance optimization with advanced analytics capabilities
class EnterprisePerformanceManager extends AdvancedPerformanceOptimizer {
  constructor(mongoUri, enterpriseConfig) {
    super(mongoUri, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      enablePredictiveOptimization: true,
      enableCapacityPlanning: true,
      enableAutomatedTuning: true,
      enablePerformanceForecasting: true,
      enableComplianceReporting: true
    };
    
    this.setupEnterpriseCapabilities();
    this.initializePredictiveAnalytics();
    this.setupAutomatedOptimization();
  }

  async implementAdvancedOptimizationStrategy() {
    console.log('Implementing enterprise optimization strategy...');
    
    const optimizationStrategy = {
      // Multi-tier optimization approach
      optimizationTiers: {
        realTimeOptimization: {
          enabled: true,
          responseTimeThreshold: 100,
          automaticIndexCreation: true,
          queryRewriting: true
        },
        batchOptimization: {
          enabled: true,
          analysisInterval: '1h',
          comprehensiveIndexAnalysis: true,
          workloadPatternAnalysis: true
        },
        predictiveOptimization: {
          enabled: true,
          forecastingHorizon: '7d',
          capacityPlanning: true,
          performanceTrendAnalysis: true
        }
      },
      
      // Advanced analytics
      performanceAnalytics: {
        enableMachineLearning: true,
        anomalyDetection: true,
        performanceForecasting: true,
        workloadCharacterization: true
      }
    };

    return await this.deployOptimizationStrategy(optimizationStrategy);
  }
}
```

## SQL-Style Performance Optimization with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB performance analysis and optimization:

```sql
-- QueryLeaf advanced performance optimization with SQL-familiar syntax for MongoDB

-- Comprehensive query performance analysis
WITH query_performance_analysis AS (
    SELECT 
        collection_name,
        query_shape_hash,
        query_pattern_type,
        
        -- Execution statistics
        COUNT(*) as execution_count,
        AVG(execution_time_ms) as avg_execution_time_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_execution_time_ms,
        MAX(execution_time_ms) as max_execution_time_ms,
        
        -- Document examination analysis
        AVG(documents_examined) as avg_docs_examined,
        AVG(documents_returned) as avg_docs_returned,
        CASE 
            WHEN AVG(documents_examined) > 0 THEN
                AVG(documents_returned) / AVG(documents_examined)
            ELSE 0
        END as avg_selectivity_ratio,
        
        -- Index usage analysis
        STRING_AGG(DISTINCT index_name, ', ') as indexes_used,
        AVG(keys_examined) as avg_keys_examined,
        
        -- Resource utilization
        SUM(execution_time_ms) as total_execution_time_ms,
        AVG(working_set_size_kb) as avg_working_set_kb,
        
        -- Performance categorization
        CASE 
            WHEN AVG(execution_time_ms) < 50 THEN 'fast'
            WHEN AVG(execution_time_ms) < 200 THEN 'moderate' 
            WHEN AVG(execution_time_ms) < 1000 THEN 'slow'
            ELSE 'very_slow'
        END as performance_category,
        
        -- Optimization need assessment
        CASE 
            WHEN AVG(execution_time_ms) > 500 OR 
                 (AVG(documents_examined) > AVG(documents_returned) * 100) OR
                 COUNT(*) > 1000 THEN true
            ELSE false
        END as needs_optimization
        
    FROM QUERY_PERFORMANCE_LOG
    WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    GROUP BY collection_name, query_shape_hash, query_pattern_type
),

index_effectiveness_analysis AS (
    SELECT 
        collection_name,
        index_name,
        index_type,
        COALESCE(JSON_EXTRACT(index_definition, '$'), '{}') as index_keys,
        
        -- Usage statistics
        COALESCE(usage_count, 0) as usage_count,
        COALESCE(last_used_timestamp, '1970-01-01'::timestamp) as last_used,
        
        -- Size and storage analysis
        index_size_bytes,
        ROUND(index_size_bytes / 1024.0 / 1024.0, 2) as index_size_mb,
        
        -- Effectiveness calculations
        CASE 
            WHEN usage_count = 0 THEN 0
            WHEN index_size_bytes > 0 THEN 
                usage_count / GREATEST((index_size_bytes / 1024.0 / 1024.0), 1)
            ELSE usage_count
        END as effectiveness_score,
        
        -- Usage categorization
        CASE 
            WHEN usage_count = 0 THEN 'unused'
            WHEN usage_count < 100 THEN 'rarely_used'
            WHEN usage_count < 1000 THEN 'moderately_used'
            ELSE 'frequently_used'
        END as usage_category,
        
        -- Health assessment
        CASE 
            WHEN usage_count = 0 AND index_name != '_id_' THEN 'candidate_for_removal'
            WHEN usage_count > 0 AND index_size_bytes > 100*1024*1024 AND usage_count < 100 THEN 'review_necessity'
            WHEN usage_count > 1000 THEN 'valuable'
            ELSE 'monitor'
        END as health_status,
        
        -- Age analysis
        EXTRACT(DAYS FROM (CURRENT_TIMESTAMP - COALESCE(last_used_timestamp, created_timestamp))) as days_since_last_use
        
    FROM INDEX_USAGE_STATS
    WHERE analysis_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
),

optimization_opportunities AS (
    SELECT 
        qpa.collection_name,
        qpa.query_pattern_type,
        qpa.execution_count,
        qpa.avg_execution_time_ms,
        qpa.avg_selectivity_ratio,
        qpa.performance_category,
        qpa.needs_optimization,
        
        -- Performance impact calculation
        qpa.total_execution_time_ms as performance_impact_ms,
        ROUND(qpa.total_execution_time_ms / 1000.0, 2) as performance_impact_seconds,
        
        -- Index analysis correlation
        COUNT(iea.index_name) as available_indexes,
        STRING_AGG(iea.index_name, ', ') as collection_indexes,
        AVG(iea.effectiveness_score) as avg_index_effectiveness,
        
        -- Optimization recommendations
        CASE 
            WHEN qpa.avg_selectivity_ratio < 0.01 AND qpa.execution_count > 100 THEN 'create_selective_index'
            WHEN qpa.avg_execution_time_ms > 1000 AND qpa.indexes_used IS NULL THEN 'add_supporting_index'
            WHEN qpa.avg_execution_time_ms > 500 AND qpa.indexes_used LIKE '%COLLSCAN%' THEN 'replace_collection_scan'
            WHEN qpa.performance_category = 'very_slow' THEN 'comprehensive_optimization'
            WHEN qpa.execution_count > 10000 AND qpa.performance_category IN ('slow', 'moderate') THEN 'high_frequency_optimization'
            ELSE 'monitor_performance'
        END as optimization_recommendation,
        
        -- Priority assessment
        CASE 
            WHEN qpa.total_execution_time_ms > 60000 AND qpa.execution_count > 1000 THEN 'critical'
            WHEN qpa.total_execution_time_ms > 30000 OR qpa.avg_execution_time_ms > 2000 THEN 'high'
            WHEN qpa.total_execution_time_ms > 10000 OR qpa.execution_count > 5000 THEN 'medium'
            ELSE 'low'
        END as optimization_priority,
        
        -- Estimated improvement potential
        CASE 
            WHEN qpa.avg_selectivity_ratio < 0.01 THEN '80-90% improvement expected'
            WHEN qpa.performance_category = 'very_slow' THEN '60-80% improvement expected'
            WHEN qpa.performance_category = 'slow' THEN '40-60% improvement expected'
            ELSE '20-40% improvement expected'
        END as estimated_improvement
        
    FROM query_performance_analysis qpa
    LEFT JOIN index_effectiveness_analysis iea ON qpa.collection_name = iea.collection_name
    WHERE qpa.needs_optimization = true
    GROUP BY 
        qpa.collection_name, qpa.query_pattern_type, qpa.execution_count,
        qpa.avg_execution_time_ms, qpa.avg_selectivity_ratio, qpa.performance_category,
        qpa.needs_optimization, qpa.total_execution_time_ms, qpa.indexes_used
)

SELECT 
    oo.collection_name,
    oo.query_pattern_type,
    oo.optimization_priority,
    oo.optimization_recommendation,
    
    -- Performance metrics
    oo.execution_count,
    ROUND(oo.avg_execution_time_ms, 2) as avg_execution_time_ms,
    ROUND(oo.performance_impact_seconds, 2) as total_impact_seconds,
    ROUND(oo.avg_selectivity_ratio * 100, 2) as selectivity_percent,
    
    -- Current state analysis
    oo.performance_category,
    oo.available_indexes,
    COALESCE(oo.collection_indexes, 'No indexes found') as current_indexes,
    ROUND(COALESCE(oo.avg_index_effectiveness, 0), 2) as avg_index_effectiveness,
    
    -- Optimization guidance
    oo.estimated_improvement,
    
    -- Specific recommendations based on analysis
    CASE oo.optimization_recommendation
        WHEN 'create_selective_index' THEN 
            'Create compound index on high-selectivity filter fields for collection: ' || oo.collection_name
        WHEN 'add_supporting_index' THEN 
            'Add index to eliminate collection scans in collection: ' || oo.collection_name
        WHEN 'replace_collection_scan' THEN 
            'Critical: Replace collection scan with indexed access in collection: ' || oo.collection_name
        WHEN 'comprehensive_optimization' THEN 
            'Comprehensive query and index optimization needed for collection: ' || oo.collection_name
        WHEN 'high_frequency_optimization' THEN 
            'Optimize high-frequency queries in collection: ' || oo.collection_name
        ELSE 'Continue monitoring performance trends'
    END as detailed_recommendation,
    
    -- Implementation complexity assessment
    CASE 
        WHEN oo.available_indexes = 0 THEN 'high_complexity'
        WHEN oo.avg_index_effectiveness < 1 THEN 'medium_complexity'
        ELSE 'low_complexity'
    END as implementation_complexity,
    
    -- Business impact estimation
    CASE oo.optimization_priority
        WHEN 'critical' THEN 'High business impact - immediate attention required'
        WHEN 'high' THEN 'Moderate business impact - optimize within 1 week'
        WHEN 'medium' THEN 'Low business impact - optimize within 1 month'
        ELSE 'Minimal business impact - optimize when convenient'
    END as business_impact_assessment,
    
    -- Resource requirements
    CASE 
        WHEN oo.optimization_recommendation IN ('create_selective_index', 'add_supporting_index') THEN 'Index creation: 5-30 minutes'
        WHEN oo.optimization_recommendation = 'comprehensive_optimization' THEN 'Full analysis: 2-8 hours'
        ELSE 'Monitoring: ongoing'
    END as estimated_effort
    
FROM optimization_opportunities oo
ORDER BY 
    CASE oo.optimization_priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        ELSE 4 
    END,
    oo.performance_impact_seconds DESC,
    oo.execution_count DESC;

-- Index usage and effectiveness analysis
WITH index_usage_trends AS (
    SELECT 
        collection_name,
        index_name,
        
        -- Usage trend analysis over time windows
        SUM(CASE WHEN analysis_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN usage_count ELSE 0 END) as usage_last_hour,
        SUM(CASE WHEN analysis_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN usage_count ELSE 0 END) as usage_last_24h,
        SUM(CASE WHEN analysis_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN usage_count ELSE 0 END) as usage_last_7d,
        
        -- Size and storage trends
        AVG(index_size_bytes) as avg_index_size_bytes,
        MAX(index_size_bytes) as max_index_size_bytes,
        
        -- Usage efficiency trends
        AVG(CASE WHEN index_size_bytes > 0 AND usage_count > 0 THEN 
                usage_count / (index_size_bytes / 1024.0 / 1024.0)
            ELSE 0 
        END) as avg_usage_efficiency,
        
        -- Consistency analysis
        COUNT(DISTINCT DATE_TRUNC('day', analysis_timestamp)) as analysis_days,
        STDDEV(usage_count) as usage_variability,
        
        -- Most recent statistics
        MAX(analysis_timestamp) as last_analysis,
        MAX(last_used_timestamp) as most_recent_use
        
    FROM index_usage_stats
    WHERE analysis_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    GROUP BY collection_name, index_name
),

index_recommendations AS (
    SELECT 
        iut.*,
        
        -- Usage trend classification
        CASE 
            WHEN iut.usage_last_hour = 0 AND iut.usage_last_24h = 0 AND iut.usage_last_7d = 0 THEN 'completely_unused'
            WHEN iut.usage_last_hour = 0 AND iut.usage_last_24h = 0 AND iut.usage_last_7d > 0 THEN 'infrequently_used'
            WHEN iut.usage_last_hour = 0 AND iut.usage_last_24h > 0 THEN 'daily_usage'
            WHEN iut.usage_last_hour > 0 THEN 'active_usage'
            ELSE 'unknown_usage'
        END as usage_trend,
        
        -- Storage efficiency assessment
        CASE 
            WHEN iut.avg_index_size_bytes > 1024*1024*1024 AND iut.usage_last_7d < 100 THEN 'storage_inefficient'
            WHEN iut.avg_index_size_bytes > 100*1024*1024 AND iut.usage_last_7d < 10 THEN 'questionable_storage_usage'
            WHEN iut.avg_usage_efficiency > 10 THEN 'storage_efficient'
            ELSE 'acceptable_storage_usage'
        END as storage_efficiency,
        
        -- Recommendation generation
        CASE 
            WHEN iut.usage_last_7d = 0 AND iut.index_name != '_id_' THEN 'consider_dropping'
            WHEN iut.avg_index_size_bytes > 500*1024*1024 AND iut.usage_last_7d < 50 THEN 'evaluate_necessity'
            WHEN iut.usage_variability > iut.usage_last_7d * 0.8 THEN 'inconsistent_usage_investigate'
            WHEN iut.avg_usage_efficiency > 20 THEN 'high_value_maintain'
            WHEN iut.usage_last_hour > 100 THEN 'critical_index_monitor'
            ELSE 'continue_monitoring'
        END as recommendation,
        
        -- Impact assessment for potential changes
        CASE 
            WHEN iut.usage_last_hour > 0 THEN 'high_impact_if_removed'
            WHEN iut.usage_last_24h > 0 THEN 'medium_impact_if_removed'
            WHEN iut.usage_last_7d > 0 THEN 'low_impact_if_removed'
            ELSE 'no_impact_if_removed'
        END as removal_impact,
        
        -- Storage savings potential
        CASE 
            WHEN iut.avg_index_size_bytes > 0 THEN 
                ROUND(iut.avg_index_size_bytes / 1024.0 / 1024.0, 2)
            ELSE 0
        END as storage_savings_mb
        
    FROM index_usage_trends iut
),

collection_performance_summary AS (
    SELECT 
        collection_name,
        COUNT(*) as total_indexes,
        
        -- Usage distribution
        COUNT(*) FILTER (WHERE usage_trend = 'active_usage') as active_indexes,
        COUNT(*) FILTER (WHERE usage_trend = 'daily_usage') as daily_indexes,
        COUNT(*) FILTER (WHERE usage_trend = 'infrequently_used') as infrequent_indexes,
        COUNT(*) FILTER (WHERE usage_trend = 'completely_unused') as unused_indexes,
        
        -- Storage analysis
        SUM(avg_index_size_bytes) as total_index_storage_bytes,
        AVG(avg_usage_efficiency) as collection_avg_efficiency,
        
        -- Optimization potential
        COUNT(*) FILTER (WHERE recommendation = 'consider_dropping') as indexes_to_drop,
        COUNT(*) FILTER (WHERE recommendation = 'evaluate_necessity') as indexes_to_evaluate,
        SUM(CASE WHEN recommendation IN ('consider_dropping', 'evaluate_necessity') 
                 THEN storage_savings_mb ELSE 0 END) as potential_storage_savings_mb,
        
        -- Collection health assessment
        CASE 
            WHEN COUNT(*) FILTER (WHERE usage_trend = 'active_usage') = 0 THEN 'no_active_indexes'
            WHEN COUNT(*) FILTER (WHERE usage_trend = 'completely_unused') > COUNT(*) * 0.5 THEN 'many_unused_indexes'
            WHEN AVG(avg_usage_efficiency) < 1 THEN 'poor_index_efficiency'
            ELSE 'healthy_index_usage'
        END as collection_health
        
    FROM index_recommendations
    GROUP BY collection_name
)

SELECT 
    cps.collection_name,
    cps.total_indexes,
    cps.collection_health,
    
    -- Index usage distribution
    cps.active_indexes,
    cps.daily_indexes,
    cps.infrequent_indexes,
    cps.unused_indexes,
    
    -- Storage utilization
    ROUND(cps.total_index_storage_bytes / 1024.0 / 1024.0, 2) as total_storage_mb,
    ROUND(cps.collection_avg_efficiency, 2) as avg_efficiency_score,
    
    -- Optimization opportunities
    cps.indexes_to_drop,
    cps.indexes_to_evaluate, 
    ROUND(cps.potential_storage_savings_mb, 2) as potential_savings_mb,
    
    -- Optimization priority
    CASE 
        WHEN cps.collection_health = 'no_active_indexes' THEN 'critical_review_needed'
        WHEN cps.unused_indexes > 5 OR cps.potential_storage_savings_mb > 1000 THEN 'high_cleanup_priority'
        WHEN cps.collection_avg_efficiency < 2 THEN 'medium_optimization_priority'
        ELSE 'low_maintenance_priority'
    END as optimization_priority,
    
    -- Recommendations summary
    CASE cps.collection_health
        WHEN 'no_active_indexes' THEN 'URGENT: Collection has no actively used indexes - investigate query patterns'
        WHEN 'many_unused_indexes' THEN 'Multiple unused indexes detected - perform index cleanup'
        WHEN 'poor_index_efficiency' THEN 'Index usage is inefficient - review index design'
        ELSE 'Index usage appears healthy - continue monitoring'
    END as primary_recommendation,
    
    -- Storage efficiency assessment
    CASE 
        WHEN cps.potential_storage_savings_mb > 1000 THEN 
            'High storage optimization potential: ' || ROUND(cps.potential_storage_savings_mb, 0) || 'MB recoverable'
        WHEN cps.potential_storage_savings_mb > 100 THEN 
            'Moderate storage optimization: ' || ROUND(cps.potential_storage_savings_mb, 0) || 'MB recoverable'
        WHEN cps.potential_storage_savings_mb > 10 THEN 
            'Minor storage optimization: ' || ROUND(cps.potential_storage_savings_mb, 0) || 'MB recoverable'
        ELSE 'Minimal storage optimization potential'
    END as storage_optimization_summary,
    
    -- Specific next actions
    ARRAY[
        CASE WHEN cps.indexes_to_drop > 0 THEN 
            'Review and drop ' || cps.indexes_to_drop || ' unused indexes' END,
        CASE WHEN cps.indexes_to_evaluate > 0 THEN 
            'Evaluate necessity of ' || cps.indexes_to_evaluate || ' underutilized indexes' END,
        CASE WHEN cps.collection_avg_efficiency < 1 THEN 
            'Redesign indexes for better efficiency' END,
        CASE WHEN cps.active_indexes = 0 THEN 
            'Investigate why no indexes are actively used' END
    ]::TEXT[] as action_items
    
FROM collection_performance_summary cps
ORDER BY 
    CASE cps.collection_health 
        WHEN 'no_active_indexes' THEN 1 
        WHEN 'many_unused_indexes' THEN 2 
        WHEN 'poor_index_efficiency' THEN 3 
        ELSE 4 
    END,
    cps.potential_storage_savings_mb DESC,
    cps.total_indexes DESC;

-- Real-time query performance monitoring and alerting
CREATE VIEW real_time_performance_dashboard AS
WITH current_performance AS (
    SELECT 
        collection_name,
        query_pattern_type,
        
        -- Recent performance metrics (last hour)
        COUNT(*) FILTER (WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour') as queries_last_hour,
        AVG(execution_time_ms) FILTER (WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour') as avg_time_last_hour,
        MAX(execution_time_ms) FILTER (WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour') as max_time_last_hour,
        
        -- Performance trend comparison (current hour vs previous hour)
        AVG(execution_time_ms) FILTER (WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '2 hours'
                                              AND execution_timestamp < CURRENT_TIMESTAMP - INTERVAL '1 hour') as avg_time_prev_hour,
        
        -- Critical performance indicators
        COUNT(*) FILTER (WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
                               AND execution_time_ms > 5000) as critical_slow_queries,
        COUNT(*) FILTER (WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
                               AND execution_time_ms > 1000) as slow_queries,
        
        -- Resource utilization trends
        AVG(documents_examined) FILTER (WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour') as avg_docs_examined,
        AVG(documents_returned) FILTER (WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour') as avg_docs_returned,
        
        -- Most recent query information
        MAX(execution_timestamp) as last_execution,
        MAX(execution_time_ms) as recent_max_time
        
    FROM query_performance_log
    WHERE execution_timestamp >= CURRENT_TIMESTAMP - INTERVAL '2 hours'
    GROUP BY collection_name, query_pattern_type
),

performance_alerts AS (
    SELECT 
        cp.*,
        
        -- Performance trend analysis
        CASE 
            WHEN cp.avg_time_last_hour > cp.avg_time_prev_hour * 2 THEN 'degradation_alert'
            WHEN cp.avg_time_last_hour > 2000 THEN 'slow_performance_alert'
            WHEN cp.critical_slow_queries > 0 THEN 'critical_performance_alert'
            WHEN cp.queries_last_hour > 1000 AND cp.avg_time_last_hour > 500 THEN 'high_volume_slow_alert'
            ELSE 'normal'
        END as alert_level,
        
        -- Selectivity analysis
        CASE 
            WHEN cp.avg_docs_examined > 0 THEN cp.avg_docs_returned / cp.avg_docs_examined
            ELSE 1
        END as current_selectivity,
        
        -- Performance change calculation
        CASE 
            WHEN cp.avg_time_prev_hour > 0 THEN 
                ROUND(((cp.avg_time_last_hour - cp.avg_time_prev_hour) / cp.avg_time_prev_hour) * 100, 1)
            ELSE 0
        END as performance_change_percent,
        
        -- Alert priority
        CASE 
            WHEN cp.critical_slow_queries > 0 THEN 'critical'
            WHEN cp.avg_time_last_hour > cp.avg_time_prev_hour * 2 THEN 'high'
            WHEN cp.slow_queries > 10 THEN 'medium'
            ELSE 'low'
        END as alert_priority
        
    FROM current_performance cp
    WHERE cp.queries_last_hour > 0
)

SELECT 
    pa.collection_name,
    pa.query_pattern_type,
    pa.alert_level,
    pa.alert_priority,
    
    -- Current performance metrics
    pa.queries_last_hour,
    ROUND(pa.avg_time_last_hour, 2) as current_avg_time_ms,
    pa.max_time_last_hour,
    pa.recent_max_time,
    
    -- Performance comparison
    ROUND(COALESCE(pa.avg_time_prev_hour, 0), 2) as previous_avg_time_ms,
    pa.performance_change_percent || '%' as performance_change,
    
    -- Problem severity indicators
    pa.critical_slow_queries,
    pa.slow_queries,
    ROUND(pa.current_selectivity * 100, 2) as selectivity_percent,
    
    -- Alert messages
    CASE pa.alert_level
        WHEN 'critical_performance_alert' THEN 
            'CRITICAL: ' || pa.critical_slow_queries || ' queries exceeded 5 second threshold'
        WHEN 'degradation_alert' THEN 
            'WARNING: Performance degraded by ' || pa.performance_change_percent || '% from previous hour'
        WHEN 'slow_performance_alert' THEN 
            'WARNING: Average query time (' || ROUND(pa.avg_time_last_hour, 0) || 'ms) exceeds acceptable threshold'
        WHEN 'high_volume_slow_alert' THEN 
            'WARNING: High query volume (' || pa.queries_last_hour || ') with slow performance'
        ELSE 'No performance alerts'
    END as alert_message,
    
    -- Recommended actions
    CASE pa.alert_level
        WHEN 'critical_performance_alert' THEN 'Immediate investigation required - check for index issues or resource constraints'
        WHEN 'degradation_alert' THEN 'Investigate performance regression - check recent changes or resource utilization'
        WHEN 'slow_performance_alert' THEN 'Review query optimization opportunities and index effectiveness'
        WHEN 'high_volume_slow_alert' THEN 'Consider query optimization and capacity scaling'
        ELSE 'Continue monitoring'
    END as recommended_action,
    
    -- Urgency indicator
    CASE pa.alert_priority
        WHEN 'critical' THEN 'Immediate attention required (< 15 minutes)'
        WHEN 'high' THEN 'Urgent attention needed (< 1 hour)'
        WHEN 'medium' THEN 'Should be addressed within 4 hours'
        ELSE 'Monitor and address during normal maintenance'
    END as response_urgency,
    
    -- Last occurrence
    pa.last_execution,
    EXTRACT(MINUTES FROM (CURRENT_TIMESTAMP - pa.last_execution)) as minutes_since_last_query
    
FROM performance_alerts pa
WHERE pa.alert_level != 'normal'
ORDER BY 
    CASE pa.alert_priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        ELSE 4 
    END,
    pa.performance_change_percent DESC,
    pa.avg_time_last_hour DESC;

-- QueryLeaf provides comprehensive MongoDB performance optimization capabilities:
-- 1. Advanced query performance analysis with SQL-familiar syntax
-- 2. Comprehensive index usage monitoring and effectiveness analysis
-- 3. Real-time performance alerting and automated optimization recommendations
-- 4. Detailed execution plan analysis and optimization insights
-- 5. Index optimization strategies including compound index recommendations
-- 6. Performance trend analysis and predictive optimization
-- 7. Resource utilization monitoring and capacity planning
-- 8. Automated slow query detection and optimization guidance
-- 9. Enterprise-grade performance management with minimal configuration
-- 10. Production-ready monitoring and optimization automation
```

## Best Practices for Production Performance Optimization

### Index Strategy Design Principles

Essential principles for effective MongoDB index optimization deployment:

1. **Compound Index Design**: Create efficient compound indexes following ESR rule (Equality, Sort, Range) for optimal query performance
2. **Index Usage Monitoring**: Continuously monitor index usage patterns and effectiveness to identify optimization opportunities
3. **Query Pattern Analysis**: Analyze query execution patterns to understand workload characteristics and optimization requirements
4. **Performance Testing**: Implement comprehensive performance testing procedures for index changes and query optimizations
5. **Capacity Planning**: Monitor query performance trends and resource utilization for proactive capacity management
6. **Automated Optimization**: Establish automated performance monitoring and optimization recommendation systems

### Enterprise Performance Management

Design performance optimization systems for enterprise-scale requirements:

1. **Real-Time Monitoring**: Implement comprehensive real-time performance monitoring with intelligent alerting and automated responses
2. **Predictive Analytics**: Use performance trend analysis and predictive modeling for proactive optimization and capacity planning
3. **Performance Governance**: Establish performance standards, monitoring procedures, and optimization workflows
4. **Resource Optimization**: Balance query performance with storage efficiency and maintenance overhead
5. **Compliance Integration**: Ensure performance optimization procedures meet operational and compliance requirements
6. **Knowledge Management**: Document optimization procedures, performance patterns, and best practices for operational excellence

## Conclusion

MongoDB index optimization and query performance analysis provides comprehensive database tuning capabilities that enable applications to achieve optimal performance through intelligent indexing strategies, sophisticated query analysis, and automated optimization recommendations. The native performance analysis tools and integrated optimization guidance ensure that database operations maintain peak efficiency with minimal operational overhead.

Key MongoDB Performance Optimization benefits include:

- **Intelligent Analysis**: Advanced query performance analysis with automated bottleneck identification and optimization recommendations
- **Index Optimization**: Comprehensive index usage analysis with effectiveness assessment and automated cleanup suggestions
- **Real-Time Monitoring**: Continuous performance monitoring with intelligent alerting and proactive optimization capabilities
- **Execution Plan Analysis**: Detailed query execution plan analysis with optimization insights and improvement recommendations
- **Automated Recommendations**: AI-powered optimization recommendations based on workload patterns and performance characteristics
- **SQL Accessibility**: Familiar SQL-style performance operations through QueryLeaf for accessible database optimization

Whether you're optimizing high-traffic applications, managing large-scale data workloads, implementing performance monitoring systems, or maintaining enterprise database performance, MongoDB performance optimization with QueryLeaf's familiar SQL interface provides the foundation for sophisticated, scalable database tuning operations.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL-style performance analysis operations into MongoDB's native profiling and indexing capabilities, making advanced performance optimization accessible to SQL-oriented database administrators. Complex index analysis, query optimization recommendations, and performance monitoring are seamlessly handled through familiar SQL constructs, enabling sophisticated database tuning without requiring deep MongoDB performance expertise.

The combination of MongoDB's robust performance analysis capabilities with SQL-style optimization operations makes it an ideal platform for applications requiring both sophisticated database performance management and familiar database administration patterns, ensuring your database operations can maintain optimal performance while scaling efficiently as workload complexity and data volume grow.