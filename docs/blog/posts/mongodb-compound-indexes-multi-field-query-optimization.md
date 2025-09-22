---
title: "MongoDB Compound Indexes and Multi-Field Query Optimization: Advanced Indexing Strategies with SQL-Style Query Performance"
description: "Master MongoDB compound indexes for multi-field query optimization, index intersection, and performance tuning. Learn advanced indexing strategies, query planning, and SQL-familiar index management techniques."
date: 2025-09-21
tags: [mongodb, compound-indexes, query-optimization, performance, indexing, sql, query-planning]
---

# MongoDB Compound Indexes and Multi-Field Query Optimization: Advanced Indexing Strategies with SQL-Style Query Performance

Modern applications require sophisticated query patterns that filter, sort, and aggregate data across multiple fields simultaneously, demanding carefully optimized indexing strategies for optimal performance. Traditional database approaches often struggle with efficient multi-field query support, requiring complex index planning, manual query optimization, and extensive performance tuning to achieve acceptable response times.

MongoDB Compound Indexes provide advanced multi-field indexing capabilities that enable efficient querying across multiple dimensions with automatic query optimization, intelligent index selection, and sophisticated query planning. Unlike simple single-field indexes, compound indexes support complex query patterns including range queries, equality matches, and sorting operations across multiple fields with optimal performance characteristics.

## The Traditional Multi-Field Query Challenge

Conventional approaches to multi-field indexing and query optimization have significant limitations for modern applications:

```sql
-- Traditional relational multi-field indexing - limited and complex

-- PostgreSQL approach with multiple single indexes
CREATE TABLE user_activities (
    activity_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    application_id VARCHAR(100) NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    priority INTEGER DEFAULT 5,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- User context
    session_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    
    -- Activity data
    activity_data JSONB,
    metadata JSONB,
    
    -- Performance tracking
    execution_time_ms INTEGER,
    error_count INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    
    -- Categorization
    category VARCHAR(100),
    subcategory VARCHAR(100),
    tags TEXT[],
    
    -- Geographic data
    country_code CHAR(2),
    region VARCHAR(100),
    city VARCHAR(100)
);

-- Multiple single-field indexes (inefficient for compound queries)
CREATE INDEX idx_user_activities_user_id ON user_activities (user_id);
CREATE INDEX idx_user_activities_app_id ON user_activities (application_id);
CREATE INDEX idx_user_activities_type ON user_activities (activity_type);
CREATE INDEX idx_user_activities_status ON user_activities (status);
CREATE INDEX idx_user_activities_created ON user_activities (created_at);
CREATE INDEX idx_user_activities_priority ON user_activities (priority);

-- Attempt at compound indexes (order matters significantly)
CREATE INDEX idx_user_app_status ON user_activities (user_id, application_id, status);
CREATE INDEX idx_app_type_created ON user_activities (application_id, activity_type, created_at);
CREATE INDEX idx_status_priority_created ON user_activities (status, priority, created_at);

-- Complex multi-field query with suboptimal performance
EXPLAIN (ANALYZE, BUFFERS) 
SELECT 
    ua.activity_id,
    ua.user_id,
    ua.application_id,
    ua.activity_type,
    ua.status,
    ua.priority,
    ua.created_at,
    ua.execution_time_ms,
    ua.activity_data,
    
    -- Derived metrics
    CASE 
        WHEN ua.completed_at IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (ua.completed_at - ua.created_at)) * 1000
        ELSE NULL 
    END as total_duration_ms,
    
    -- Window functions for ranking
    ROW_NUMBER() OVER (
        PARTITION BY ua.user_id, ua.application_id 
        ORDER BY ua.priority DESC, ua.created_at DESC
    ) as user_app_rank,
    
    -- Activity scoring
    CASE
        WHEN ua.error_count = 0 AND ua.status = 'completed' THEN 100
        WHEN ua.error_count = 0 AND ua.status = 'in_progress' THEN 75
        WHEN ua.error_count > 0 AND ua.retry_count <= 3 THEN 50
        ELSE 25
    END as activity_score

FROM user_activities ua
WHERE 
    -- Multi-field filtering (challenging for optimizer)
    ua.user_id IN (12345, 23456, 34567, 45678)
    AND ua.application_id IN ('web_app', 'mobile_app', 'api_service')
    AND ua.activity_type IN ('login', 'purchase', 'api_call', 'data_export')
    AND ua.status IN ('completed', 'in_progress', 'failed')
    AND ua.priority >= 3
    AND ua.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND ua.created_at <= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    
    -- Geographic filtering
    AND ua.country_code IN ('US', 'CA', 'GB', 'DE')
    AND ua.region IS NOT NULL
    
    -- Performance filtering
    AND (ua.execution_time_ms IS NULL OR ua.execution_time_ms < 10000)
    AND ua.error_count <= 5
    
    -- Category filtering
    AND ua.category IN ('user_interaction', 'system_process', 'data_operation')
    
    -- JSON data filtering (expensive)
    AND ua.activity_data->>'source' IN ('web', 'mobile', 'api')
    AND COALESCE((ua.activity_data->>'amount')::numeric, 0) > 10

ORDER BY 
    ua.priority DESC,
    ua.created_at DESC,
    ua.user_id ASC
LIMIT 50;

-- Problems with traditional compound indexing:
-- 1. Index order critically affects query performance
-- 2. Limited flexibility for varying query patterns
-- 3. Index intersection overhead for multiple conditions
-- 4. Complex query planning with unpredictable performance
-- 5. Maintenance overhead with multiple specialized indexes
-- 6. Poor support for mixed equality and range conditions
-- 7. Difficulty optimizing for sorting requirements
-- 8. Limited support for JSON/document field indexing

-- Query performance analysis
WITH index_usage AS (
    SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        
        -- Index effectiveness metrics
        CASE 
            WHEN idx_scan > 0 THEN idx_tup_read::numeric / idx_scan 
            ELSE 0 
        END as avg_tuples_per_scan,
        
        CASE 
            WHEN idx_tup_read > 0 THEN idx_tup_fetch::numeric / idx_tup_read * 100
            ELSE 0 
        END as fetch_ratio_percent

    FROM pg_stat_user_indexes
    WHERE tablename = 'user_activities'
),
table_performance AS (
    SELECT 
        schemaname,
        tablename,
        seq_scan,
        seq_tup_read,
        idx_scan,
        idx_tup_fetch,
        n_tup_ins,
        n_tup_upd,
        n_tup_del,
        
        -- Table scan ratios
        CASE 
            WHEN (seq_scan + idx_scan) > 0 
            THEN seq_scan::numeric / (seq_scan + idx_scan) * 100
            ELSE 0 
        END as seq_scan_ratio_percent
        
    FROM pg_stat_user_tables
    WHERE tablename = 'user_activities'
)
SELECT 
    -- Index usage analysis
    iu.indexname,
    iu.idx_scan as index_scans,
    ROUND(iu.avg_tuples_per_scan, 2) as avg_tuples_per_scan,
    ROUND(iu.fetch_ratio_percent, 1) as fetch_efficiency_pct,
    
    -- Index effectiveness assessment
    CASE
        WHEN iu.idx_scan = 0 THEN 'unused'
        WHEN iu.avg_tuples_per_scan > 100 THEN 'inefficient'
        WHEN iu.fetch_ratio_percent < 50 THEN 'poor_selectivity'
        ELSE 'effective'
    END as index_status,
    
    -- Table-level performance
    tp.seq_scan as table_scans,
    ROUND(tp.seq_scan_ratio_percent, 1) as seq_scan_pct,
    
    -- Recommendations
    CASE 
        WHEN iu.idx_scan = 0 THEN 'Consider dropping unused index'
        WHEN iu.avg_tuples_per_scan > 100 THEN 'Improve index selectivity or reorder fields'
        WHEN tp.seq_scan_ratio_percent > 20 THEN 'Add missing indexes for common queries'
        ELSE 'Index performing within acceptable parameters'
    END as recommendation

FROM index_usage iu
CROSS JOIN table_performance tp
ORDER BY iu.idx_scan DESC, iu.avg_tuples_per_scan DESC;

-- MySQL compound indexing (more limited capabilities)
CREATE TABLE mysql_activities (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    app_id VARCHAR(100) NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    priority INT DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activity_data JSON,
    
    -- Compound indexes (limited optimization capabilities)
    INDEX idx_user_app_status (user_id, app_id, status),
    INDEX idx_app_type_created (app_id, activity_type, created_at),
    INDEX idx_status_priority (status, priority)
);

-- Basic multi-field query in MySQL
SELECT 
    user_id,
    app_id,
    activity_type,
    status,
    priority,
    created_at,
    JSON_EXTRACT(activity_data, '$.source') as source
FROM mysql_activities
WHERE user_id IN (12345, 23456)
  AND app_id = 'web_app'
  AND status = 'completed'
  AND priority >= 3
  AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY priority DESC, created_at DESC
LIMIT 50;

-- MySQL limitations for compound indexing:
-- - Limited query optimization capabilities
-- - Poor JSON field indexing support
-- - Restrictive index intersection algorithms
-- - Basic query planning with limited statistics
-- - Limited support for complex sorting requirements
-- - Poor performance with large result sets
-- - Minimal support for index-only scans
```

MongoDB Compound Indexes provide comprehensive multi-field optimization:

```javascript
// MongoDB Compound Indexes - advanced multi-field query optimization
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('optimization_platform');

// Create collection with comprehensive compound index strategy
const setupAdvancedIndexing = async () => {
  const userActivities = db.collection('user_activities');

  // 1. Primary compound index for user-centric queries
  await userActivities.createIndex(
    {
      userId: 1,
      applicationId: 1,
      status: 1,
      createdAt: -1
    },
    {
      name: 'idx_user_app_status_time',
      background: true
    }
  );

  // 2. Application-centric compound index
  await userActivities.createIndex(
    {
      applicationId: 1,
      activityType: 1,
      priority: -1,
      createdAt: -1
    },
    {
      name: 'idx_app_type_priority_time',
      background: true
    }
  );

  // 3. Status and performance monitoring index
  await userActivities.createIndex(
    {
      status: 1,
      priority: -1,
      executionTimeMs: 1,
      createdAt: -1
    },
    {
      name: 'idx_status_priority_performance',
      background: true
    }
  );

  // 4. Geographic and categorization index
  await userActivities.createIndex(
    {
      countryCode: 1,
      region: 1,
      category: 1,
      subcategory: 1,
      createdAt: -1
    },
    {
      name: 'idx_geo_category_time',
      background: true
    }
  );

  // 5. Advanced compound index with embedded document fields
  await userActivities.createIndex(
    {
      'metadata.source': 1,
      activityType: 1,
      'activityData.amount': -1,
      createdAt: -1
    },
    {
      name: 'idx_source_type_amount_time',
      background: true,
      partialFilterExpression: {
        'metadata.source': { $exists: true },
        'activityData.amount': { $exists: true, $gt: 0 }
      }
    }
  );

  // 6. Text search compound index
  await userActivities.createIndex(
    {
      userId: 1,
      applicationId: 1,
      activityType: 1,
      title: 'text',
      description: 'text',
      'metadata.keywords': 'text'
    },
    {
      name: 'idx_user_app_type_text',
      background: true,
      weights: {
        title: 10,
        description: 5,
        'metadata.keywords': 3
      }
    }
  );

  // 7. Sparse index for optional fields
  await userActivities.createIndex(
    {
      completedAt: -1,
      userId: 1,
      'performance.totalDuration': -1
    },
    {
      name: 'idx_completed_user_duration',
      sparse: true,
      background: true
    }
  );

  // 8. TTL index for automatic data cleanup
  await userActivities.createIndex(
    {
      createdAt: 1
    },
    {
      name: 'idx_ttl_cleanup',
      expireAfterSeconds: 60 * 60 * 24 * 90, // 90 days
      background: true
    }
  );

  console.log('Advanced compound indexes created successfully');
};

// High-performance multi-field query examples
const performAdvancedQueries = async () => {
  const userActivities = db.collection('user_activities');

  // Query 1: User activity dashboard with compound index optimization
  const userDashboard = await userActivities.aggregate([
    // Stage 1: Efficient filtering using compound index
    {
      $match: {
        userId: { $in: [12345, 23456, 34567, 45678] },
        applicationId: { $in: ['web_app', 'mobile_app', 'api_service'] },
        status: { $in: ['completed', 'in_progress', 'failed'] },
        createdAt: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          $lte: new Date(Date.now() - 60 * 60 * 1000)
        }
      }
    },

    // Stage 2: Additional filtering leveraging partial indexes
    {
      $match: {
        priority: { $gte: 3 },
        countryCode: { $in: ['US', 'CA', 'GB', 'DE'] },
        region: { $exists: true },
        $or: [
          { executionTimeMs: null },
          { executionTimeMs: { $lt: 10000 } }
        ],
        errorCount: { $lte: 5 },
        category: { $in: ['user_interaction', 'system_process', 'data_operation'] },
        'metadata.source': { $in: ['web', 'mobile', 'api'] },
        'activityData.amount': { $gt: 10 }
      }
    },

    // Stage 3: Add computed fields
    {
      $addFields: {
        totalDurationMs: {
          $cond: {
            if: { $ne: ['$completedAt', null] },
            then: { $subtract: ['$completedAt', '$createdAt'] },
            else: null
          }
        },
        
        activityScore: {
          $switch: {
            branches: [
              {
                case: { 
                  $and: [
                    { $eq: ['$errorCount', 0] },
                    { $eq: ['$status', 'completed'] }
                  ]
                },
                then: 100
              },
              {
                case: { 
                  $and: [
                    { $eq: ['$errorCount', 0] },
                    { $eq: ['$status', 'in_progress'] }
                  ]
                },
                then: 75
              },
              {
                case: { 
                  $and: [
                    { $gt: ['$errorCount', 0] },
                    { $lte: ['$retryCount', 3] }
                  ]
                },
                then: 50
              }
            ],
            default: 25
          }
        }
      }
    },

    // Stage 4: Window functions for ranking
    {
      $setWindowFields: {
        partitionBy: { userId: '$userId', applicationId: '$applicationId' },
        sortBy: { priority: -1, createdAt: -1 },
        output: {
          userAppRank: {
            $denseRank: {}
          },
          
          // Rolling statistics
          rollingAvgDuration: {
            $avg: '$executionTimeMs',
            window: {
              documents: [-4, 0] // Last 5 activities
            }
          }
        }
      }
    },

    // Stage 5: Final sorting leveraging compound indexes
    {
      $sort: {
        priority: -1,
        createdAt: -1,
        userId: 1
      }
    },

    // Stage 6: Limit results
    {
      $limit: 50
    },

    // Stage 7: Project final structure
    {
      $project: {
        activityId: '$_id',
        userId: 1,
        applicationId: 1,
        activityType: 1,
        status: 1,
        priority: 1,
        createdAt: 1,
        executionTimeMs: 1,
        activityData: 1,
        totalDurationMs: 1,
        userAppRank: 1,
        activityScore: 1,
        rollingAvgDuration: { $round: ['$rollingAvgDuration', 2] },
        
        // Performance indicators
        isHighPriority: { $gte: ['$priority', 8] },
        isRecentActivity: { 
          $gte: ['$createdAt', new Date(Date.now() - 24 * 60 * 60 * 1000)]
        },
        hasPerformanceIssue: { $gt: ['$executionTimeMs', 5000] }
      }
    }
  ]).toArray();

  console.log('User dashboard query completed:', userDashboard.length, 'results');

  // Query 2: Application performance analysis with optimized grouping
  const appPerformanceAnalysis = await userActivities.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        executionTimeMs: { $exists: true }
      }
    },

    // Group by application and activity type
    {
      $group: {
        _id: {
          applicationId: '$applicationId',
          activityType: '$activityType',
          status: '$status'
        },
        
        // Volume metrics
        totalActivities: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        
        // Performance metrics
        avgExecutionTime: { $avg: '$executionTimeMs' },
        minExecutionTime: { $min: '$executionTimeMs' },
        maxExecutionTime: { $max: '$executionTimeMs' },
        p95ExecutionTime: { 
          $percentile: { 
            input: '$executionTimeMs', 
            p: [0.95], 
            method: 'approximate' 
          } 
        },
        
        // Error metrics
        errorCount: { $sum: '$errorCount' },
        retryCount: { $sum: '$retryCount' },
        
        // Success metrics
        successCount: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        
        // Time distribution
        activitiesByHour: {
          $push: { $hour: '$createdAt' }
        },
        
        // Priority distribution
        avgPriority: { $avg: '$priority' },
        maxPriority: { $max: '$priority' }
      }
    },

    // Calculate derived metrics
    {
      $addFields: {
        uniqueUserCount: { $size: '$uniqueUsers' },
        successRate: {
          $multiply: [
            { $divide: ['$successCount', '$totalActivities'] },
            100
          ]
        },
        errorRate: {
          $multiply: [
            { $divide: ['$errorCount', '$totalActivities'] },
            100
          ]
        },
        
        // Performance classification
        performanceCategory: {
          $switch: {
            branches: [
              {
                case: { $lt: ['$avgExecutionTime', 1000] },
                then: 'fast'
              },
              {
                case: { $lt: ['$avgExecutionTime', 5000] },
                then: 'moderate'
              },
              {
                case: { $lt: ['$avgExecutionTime', 10000] },
                then: 'slow'
              }
            ],
            default: 'critical'
          }
        }
      }
    },

    // Sort by performance issues first
    {
      $sort: {
        performanceCategory: -1, // Critical first
        errorRate: -1,
        avgExecutionTime: -1
      }
    }
  ]).toArray();

  console.log('Application performance analysis completed:', appPerformanceAnalysis.length, 'results');

  // Query 3: Advanced text search with compound index
  const textSearchResults = await userActivities.aggregate([
    {
      $match: {
        userId: { $in: [12345, 23456, 34567] },
        applicationId: 'web_app',
        activityType: 'search_query',
        $text: {
          $search: 'performance optimization mongodb',
          $caseSensitive: false,
          $diacriticSensitive: false
        }
      }
    },

    {
      $addFields: {
        textScore: { $meta: 'textScore' },
        relevanceScore: {
          $multiply: [
            { $meta: 'textScore' },
            {
              $switch: {
                branches: [
                  { case: { $eq: ['$priority', 10] }, then: 1.5 },
                  { case: { $gte: ['$priority', 8] }, then: 1.2 },
                  { case: { $gte: ['$priority', 5] }, then: 1.0 }
                ],
                default: 0.8
              }
            }
          ]
        }
      }
    },

    {
      $sort: {
        relevanceScore: -1,
        createdAt: -1
      }
    },

    {
      $limit: 20
    }
  ]).toArray();

  console.log('Text search results:', textSearchResults.length, 'matches');

  return {
    userDashboard,
    appPerformanceAnalysis,
    textSearchResults
  };
};

// Index performance analysis and optimization
const analyzeIndexPerformance = async () => {
  const userActivities = db.collection('user_activities');

  // Get index statistics
  const indexStats = await userActivities.aggregate([
    { $indexStats: {} }
  ]).toArray();

  // Analyze query execution plans
  const explainPlan = await userActivities.find({
    userId: { $in: [12345, 23456] },
    applicationId: 'web_app',
    status: 'completed',
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  }).explain('executionStats');

  // Index usage recommendations
  const indexRecommendations = indexStats.map(index => {
    const usage = index.accesses;
    const effectiveness = usage.ops / Math.max(usage.since.getTime(), 1);
    
    return {
      indexName: index.name,
      keyPattern: index.key,
      usage: usage,
      effectiveness: effectiveness,
      recommendation: effectiveness < 0.001 ? 'Consider dropping - low usage' :
                     effectiveness < 0.01 ? 'Monitor usage patterns' :
                     effectiveness < 0.1 ? 'Optimize query patterns' :
                     'Performing well',
      
      // Size and memory impact
      estimatedSize: index.spec?.storageSize || 'N/A',
      
      // Usage patterns
      opsPerDay: usage.ops
    };
  });

  console.log('Index Performance Analysis:');
  console.log(JSON.stringify(indexRecommendations, null, 2));

  return {
    indexStats,
    explainPlan,
    indexRecommendations
  };
};

// Advanced compound index patterns for specific use cases
const setupSpecializedIndexes = async () => {
  const userActivities = db.collection('user_activities');

  // 1. Multikey index for array fields
  await userActivities.createIndex(
    {
      tags: 1,
      category: 1,
      createdAt: -1
    },
    {
      name: 'idx_tags_category_time',
      background: true
    }
  );

  // 2. Compound index with hashed sharding key
  await userActivities.createIndex(
    {
      userId: 'hashed',
      createdAt: -1,
      applicationId: 1
    },
    {
      name: 'idx_user_hash_time_app',
      background: true
    }
  );

  // 3. Compound wildcard index for dynamic schemas
  await userActivities.createIndex(
    {
      'metadata.$**': 1,
      activityType: 1
    },
    {
      name: 'idx_metadata_wildcard_type',
      background: true,
      wildcardProjection: {
        'metadata.sensitive': 0 // Exclude sensitive fields
      }
    }
  );

  // 4. Compound 2dsphere index for geospatial queries
  await userActivities.createIndex(
    {
      'location.coordinates': '2dsphere',
      activityType: 1,
      createdAt: -1
    },
    {
      name: 'idx_geo_type_time',
      background: true
    }
  );

  // 5. Compound partial index for conditional optimization
  await userActivities.createIndex(
    {
      status: 1,
      'performance.executionTimeMs': -1,
      userId: 1
    },
    {
      name: 'idx_status_performance_user_partial',
      background: true,
      partialFilterExpression: {
        status: { $in: ['failed', 'timeout'] },
        'performance.executionTimeMs': { $gt: 5000 }
      }
    }
  );

  console.log('Specialized compound indexes created');
};

// Benefits of MongoDB Compound Indexes:
// - Efficient multi-field query optimization with automatic index selection
// - Support for complex query patterns including range and equality conditions
// - Intelligent query planning with cost-based optimization
// - Index intersection capabilities for optimal query performance
// - Support for sorting and filtering in a single index scan
// - Flexible index ordering to match query patterns
// - Integration with aggregation pipeline optimization
// - Advanced index types including text, geospatial, and wildcard
// - Partial and sparse indexing for memory efficiency
// - Background index building for zero-downtime optimization

module.exports = {
  setupAdvancedIndexing,
  performAdvancedQueries,
  analyzeIndexPerformance,
  setupSpecializedIndexes
};
```

## Understanding MongoDB Compound Index Architecture

### Advanced Compound Index Design Patterns

Implement sophisticated compound indexing strategies for different query scenarios:

```javascript
// Advanced compound indexing design patterns
class CompoundIndexOptimizer {
  constructor(db) {
    this.db = db;
    this.indexAnalytics = new Map();
    this.queryPatterns = new Map();
  }

  async analyzeQueryPatterns(collection, sampleSize = 10000) {
    console.log(`Analyzing query patterns for ${collection.collectionName}...`);
    
    // Capture query patterns from operations
    const operations = await this.db.admin().command({
      currentOp: 1,
      $all: true,
      ns: { $regex: collection.collectionName }
    });

    // Analyze existing queries from profiler data
    const profilerData = await this.db.collection('system.profile')
      .find({
        ns: `${this.db.databaseName}.${collection.collectionName}`,
        op: { $in: ['query', 'find', 'aggregate'] }
      })
      .sort({ ts: -1 })
      .limit(sampleSize)
      .toArray();

    // Extract query patterns
    const queryPatterns = this.extractQueryPatterns(profilerData);
    
    console.log(`Found ${queryPatterns.length} unique query patterns`);
    return queryPatterns;
  }

  extractQueryPatterns(profilerData) {
    const patterns = new Map();

    profilerData.forEach(op => {
      if (op.command && op.command.filter) {
        const filterFields = Object.keys(op.command.filter);
        const sortFields = op.command.sort ? Object.keys(op.command.sort) : [];
        
        const patternKey = JSON.stringify({
          filter: filterFields.sort(),
          sort: sortFields
        });

        if (!patterns.has(patternKey)) {
          patterns.set(patternKey, {
            filterFields,
            sortFields,
            frequency: 0,
            avgExecutionTime: 0,
            totalExecutionTime: 0
          });
        }

        const pattern = patterns.get(patternKey);
        pattern.frequency++;
        pattern.totalExecutionTime += op.millis || 0;
        pattern.avgExecutionTime = pattern.totalExecutionTime / pattern.frequency;
      }
    });

    return Array.from(patterns.values());
  }

  async generateOptimalIndexes(collection, queryPatterns) {
    console.log('Generating optimal compound indexes...');
    
    const indexRecommendations = [];

    // Sort patterns by frequency and performance impact
    const sortedPatterns = queryPatterns.sort((a, b) => 
      (b.frequency * b.avgExecutionTime) - (a.frequency * a.avgExecutionTime)
    );

    for (const pattern of sortedPatterns.slice(0, 10)) { // Top 10 patterns
      const indexSpec = this.designCompoundIndex(pattern);
      
      if (indexSpec && indexSpec.fields.length > 0) {
        indexRecommendations.push({
          pattern: pattern,
          indexSpec: indexSpec,
          estimatedBenefit: pattern.frequency * pattern.avgExecutionTime,
          priority: this.calculateIndexPriority(pattern)
        });
      }
    }

    return indexRecommendations;
  }

  designCompoundIndex(queryPattern) {
    const { filterFields, sortFields } = queryPattern;
    
    // ESR rule: Equality, Sort, Range
    const equalityFields = [];
    const rangeFields = [];
    
    // Analyze field types (would need actual query analysis)
    filterFields.forEach(field => {
      // This is simplified - in practice, analyze actual query operators
      if (this.isEqualityField(field)) {
        equalityFields.push(field);
      } else {
        rangeFields.push(field);
      }
    });

    // Construct compound index following ESR rule
    const indexFields = [
      ...equalityFields,
      ...sortFields.filter(field => !equalityFields.includes(field)),
      ...rangeFields.filter(field => 
        !equalityFields.includes(field) && !sortFields.includes(field)
      )
    ];

    return {
      fields: indexFields,
      spec: this.buildIndexSpec(indexFields, sortFields),
      rule: 'ESR (Equality, Sort, Range)',
      rationale: this.explainIndexDesign(equalityFields, sortFields, rangeFields)
    };
  }

  buildIndexSpec(indexFields, sortFields) {
    const spec = {};
    
    indexFields.forEach(field => {
      // Determine sort order based on usage pattern
      if (sortFields.includes(field)) {
        // Use descending for time-based fields, ascending for others
        spec[field] = field.includes('time') || field.includes('date') || 
                     field.includes('created') || field.includes('updated') ? -1 : 1;
      } else {
        spec[field] = 1; // Default ascending for filtering
      }
    });

    return spec;
  }

  isEqualityField(field) {
    // Heuristic to determine if field is typically used for equality
    const equalityHints = ['id', 'status', 'type', 'category', 'code'];
    return equalityHints.some(hint => field.toLowerCase().includes(hint));
  }

  explainIndexDesign(equalityFields, sortFields, rangeFields) {
    return {
      equalityFields: equalityFields,
      sortFields: sortFields,
      rangeFields: rangeFields,
      reasoning: [
        'Equality fields placed first for maximum selectivity',
        'Sort fields positioned to enable index-based sorting',
        'Range fields placed last to minimize index scan overhead'
      ]
    };
  }

  calculateIndexPriority(pattern) {
    const frequencyWeight = 0.4;
    const performanceWeight = 0.6;
    
    const normalizedFrequency = Math.min(pattern.frequency / 100, 1);
    const normalizedPerformance = Math.min(pattern.avgExecutionTime / 1000, 1);
    
    return (normalizedFrequency * frequencyWeight) + 
           (normalizedPerformance * performanceWeight);
  }

  async implementIndexRecommendations(collection, recommendations) {
    console.log(`Implementing ${recommendations.length} index recommendations...`);
    
    const results = [];
    
    for (const rec of recommendations) {
      try {
        const indexName = `idx_optimized_${rec.pattern.filterFields.join('_')}`;
        
        await collection.createIndex(rec.indexSpec.spec, {
          name: indexName,
          background: true
        });

        results.push({
          indexName: indexName,
          spec: rec.indexSpec.spec,
          status: 'created',
          estimatedBenefit: rec.estimatedBenefit,
          priority: rec.priority
        });

        console.log(`Created index: ${indexName}`);

      } catch (error) {
        results.push({
          indexName: `idx_failed_${rec.pattern.filterFields.join('_')}`,
          spec: rec.indexSpec.spec,
          status: 'failed',
          error: error.message
        });

        console.error(`Failed to create index:`, error.message);
      }
    }

    return results;
  }

  async monitorIndexEffectiveness(collection, duration = 24 * 60 * 60 * 1000) {
    console.log('Starting index effectiveness monitoring...');
    
    const initialStats = await collection.aggregate([{ $indexStats: {} }]).toArray();
    
    // Wait for monitoring period
    await new Promise(resolve => setTimeout(resolve, duration));
    
    const finalStats = await collection.aggregate([{ $indexStats: {} }]).toArray();
    
    // Compare statistics
    const effectiveness = this.compareIndexStats(initialStats, finalStats);
    
    return effectiveness;
  }

  compareIndexStats(initialStats, finalStats) {
    const effectiveness = [];
    
    finalStats.forEach(finalStat => {
      const initialStat = initialStats.find(stat => stat.name === finalStat.name);
      
      if (initialStat) {
        const opsChange = finalStat.accesses.ops - initialStat.accesses.ops;
        const timeChange = finalStat.accesses.since - initialStat.accesses.since;
        const opsPerHour = timeChange > 0 ? (opsChange / timeChange) * 3600 : 0;
        
        effectiveness.push({
          indexName: finalStat.name,
          keyPattern: finalStat.key,
          operationsChange: opsChange,
          operationsPerHour: Math.round(opsPerHour),
          effectiveness: this.assessEffectiveness(opsPerHour),
          recommendation: this.getEffectivenessRecommendation(opsPerHour)
        });
      }
    });
    
    return effectiveness;
  }

  assessEffectiveness(opsPerHour) {
    if (opsPerHour < 0.1) return 'unused';
    if (opsPerHour < 1) return 'low';
    if (opsPerHour < 10) return 'moderate';
    if (opsPerHour < 100) return 'high';
    return 'critical';
  }

  getEffectivenessRecommendation(opsPerHour) {
    if (opsPerHour < 0.1) return 'Consider dropping this index';
    if (opsPerHour < 1) return 'Monitor usage patterns';
    if (opsPerHour < 10) return 'Index is providing moderate benefit';
    return 'Index is highly effective';
  }

  async performCompoundIndexBenchmark(collection, testQueries) {
    console.log('Running compound index benchmark...');
    
    const benchmarkResults = [];
    
    for (const query of testQueries) {
      console.log(`Testing query: ${JSON.stringify(query.filter)}`);
      
      // Benchmark without hint (let MongoDB choose)
      const autoResult = await this.benchmarkQuery(collection, query, null);
      
      // Benchmark with different index hints
      const hintResults = [];
      const indexes = await collection.indexes();
      
      for (const index of indexes) {
        if (Object.keys(index.key).length > 1) { // Compound indexes only
          const hintResult = await this.benchmarkQuery(collection, query, index.key);
          hintResults.push({
            indexHint: index.key,
            indexName: index.name,
            ...hintResult
          });
        }
      }
      
      benchmarkResults.push({
        query: query,
        automatic: autoResult,
        withHints: hintResults.sort((a, b) => a.executionTime - b.executionTime)
      });
    }
    
    return benchmarkResults;
  }

  async benchmarkQuery(collection, query, indexHint, iterations = 5) {
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      let cursor = collection.find(query.filter);
      
      if (indexHint) {
        cursor = cursor.hint(indexHint);
      }
      
      if (query.sort) {
        cursor = cursor.sort(query.sort);
      }
      
      if (query.limit) {
        cursor = cursor.limit(query.limit);
      }
      
      const results = await cursor.toArray();
      const endTime = Date.now();
      
      times.push({
        executionTime: endTime - startTime,
        resultCount: results.length
      });
    }
    
    const avgTime = times.reduce((sum, t) => sum + t.executionTime, 0) / times.length;
    const minTime = Math.min(...times.map(t => t.executionTime));
    const maxTime = Math.max(...times.map(t => t.executionTime));
    
    return {
      averageExecutionTime: Math.round(avgTime),
      minExecutionTime: minTime,
      maxExecutionTime: maxTime,
      resultCount: times[0].resultCount,
      consistency: maxTime - minTime
    };
  }

  async optimizeExistingIndexes(collection) {
    console.log('Analyzing existing indexes for optimization opportunities...');
    
    const indexes = await collection.indexes();
    const indexStats = await collection.aggregate([{ $indexStats: {} }]).toArray();
    
    const optimizations = [];
    
    // Identify unused indexes
    const unusedIndexes = indexStats.filter(stat => 
      stat.accesses.ops === 0 && stat.name !== '_id_'
    );
    
    // Identify overlapping indexes
    const overlappingIndexes = this.findOverlappingIndexes(indexes);
    
    // Identify missing indexes based on query patterns
    const queryPatterns = await this.analyzeQueryPatterns(collection);
    const missingIndexes = this.identifyMissingIndexes(indexes, queryPatterns);
    
    optimizations.push({
      type: 'unused_indexes',
      count: unusedIndexes.length,
      indexes: unusedIndexes.map(idx => idx.name),
      recommendation: 'Consider dropping these indexes to save storage and maintenance overhead'
    });
    
    optimizations.push({
      type: 'overlapping_indexes',
      count: overlappingIndexes.length,
      indexes: overlappingIndexes,
      recommendation: 'Consolidate overlapping indexes to improve efficiency'
    });
    
    optimizations.push({
      type: 'missing_indexes',
      count: missingIndexes.length,
      recommendations: missingIndexes,
      recommendation: 'Create these indexes to improve query performance'
    });
    
    return optimizations;
  }

  findOverlappingIndexes(indexes) {
    const overlapping = [];
    
    for (let i = 0; i < indexes.length; i++) {
      for (let j = i + 1; j < indexes.length; j++) {
        const idx1 = indexes[i];
        const idx2 = indexes[j];
        
        if (this.areIndexesOverlapping(idx1.key, idx2.key)) {
          overlapping.push({
            index1: idx1.name,
            index2: idx2.name,
            keys1: idx1.key,
            keys2: idx2.key,
            overlapType: this.getOverlapType(idx1.key, idx2.key)
          });
        }
      }
    }
    
    return overlapping;
  }

  areIndexesOverlapping(keys1, keys2) {
    const fields1 = Object.keys(keys1);
    const fields2 = Object.keys(keys2);
    
    // Check if one index is a prefix of another
    return this.isPrefix(fields1, fields2) || this.isPrefix(fields2, fields1);
  }

  isPrefix(fields1, fields2) {
    if (fields1.length > fields2.length) return false;
    
    for (let i = 0; i < fields1.length; i++) {
      if (fields1[i] !== fields2[i]) return false;
    }
    
    return true;
  }

  getOverlapType(keys1, keys2) {
    const fields1 = Object.keys(keys1);
    const fields2 = Object.keys(keys2);
    
    if (this.isPrefix(fields1, fields2)) {
      return `${fields1.join(',')} is prefix of ${fields2.join(',')}`;
    } else if (this.isPrefix(fields2, fields1)) {
      return `${fields2.join(',')} is prefix of ${fields1.join(',')}`;
    }
    
    return 'partial_overlap';
  }

  identifyMissingIndexes(existingIndexes, queryPatterns) {
    const missing = [];
    const existingSpecs = existingIndexes.map(idx => JSON.stringify(idx.key));
    
    queryPatterns.forEach(pattern => {
      const recommendedIndex = this.designCompoundIndex(pattern);
      const specStr = JSON.stringify(recommendedIndex.spec);
      
      if (!existingSpecs.includes(specStr) && recommendedIndex.fields.length > 0) {
        missing.push({
          pattern: pattern,
          recommendedIndex: recommendedIndex,
          priority: this.calculateIndexPriority(pattern)
        });
      }
    });
    
    return missing.sort((a, b) => b.priority - a.priority);
  }
}
```

## SQL-Style Compound Index Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB compound index management:

```sql
-- QueryLeaf compound index operations with SQL-familiar syntax

-- Create comprehensive compound indexes
CREATE COMPOUND INDEX idx_user_app_status_time ON user_activities (
  user_id ASC,
  application_id ASC, 
  status ASC,
  created_at DESC
) WITH (
  background = true,
  unique = false
);

CREATE COMPOUND INDEX idx_app_type_priority_performance ON user_activities (
  application_id ASC,
  activity_type ASC,
  priority DESC,
  execution_time_ms ASC,
  created_at DESC
) WITH (
  background = true,
  partial_filter = 'execution_time_ms IS NOT NULL AND priority >= 5'
);

-- Create compound text search index
CREATE COMPOUND INDEX idx_user_app_text_search ON user_activities (
  user_id ASC,
  application_id ASC,
  activity_type ASC,
  title TEXT,
  description TEXT,
  keywords TEXT
) WITH (
  weights = JSON_BUILD_OBJECT('title', 10, 'description', 5, 'keywords', 3),
  background = true
);

-- Optimized multi-field queries leveraging compound indexes
WITH user_activity_analysis AS (
  SELECT 
    user_id,
    application_id,
    activity_type,
    status,
    priority,
    created_at,
    execution_time_ms,
    error_count,
    retry_count,
    activity_data,
    
    -- Performance categorization
    CASE 
      WHEN execution_time_ms IS NULL THEN 'no_data'
      WHEN execution_time_ms < 1000 THEN 'fast'
      WHEN execution_time_ms < 5000 THEN 'moderate' 
      WHEN execution_time_ms < 10000 THEN 'slow'
      ELSE 'critical'
    END as performance_category,
    
    -- Activity scoring
    CASE
      WHEN error_count = 0 AND status = 'completed' THEN 100
      WHEN error_count = 0 AND status = 'in_progress' THEN 75
      WHEN error_count > 0 AND retry_count <= 3 THEN 50
      ELSE 25
    END as activity_score,
    
    -- Time-based metrics
    EXTRACT(hour FROM created_at) as activity_hour,
    DATE_TRUNC('day', created_at) as activity_date,
    
    -- User context
    activity_data->>'source' as source_system,
    CAST(activity_data->>'amount' AS NUMERIC) as transaction_amount,
    activity_data->>'category' as data_category
    
  FROM user_activities
  WHERE 
    -- Multi-field filtering optimized by compound index
    user_id IN (12345, 23456, 34567, 45678)
    AND application_id IN ('web_app', 'mobile_app', 'api_service')
    AND status IN ('completed', 'in_progress', 'failed')
    AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND created_at <= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    AND priority >= 3
    AND (execution_time_ms IS NULL OR execution_time_ms < 30000)
    AND error_count <= 5
),

performance_metrics AS (
  SELECT 
    user_id,
    application_id,
    activity_type,
    
    -- Volume metrics
    COUNT(*) as total_activities,
    COUNT(DISTINCT DATE_TRUNC('day', created_at)) as active_days,
    COUNT(DISTINCT activity_hour) as active_hours,
    
    -- Performance distribution
    COUNT(*) FILTER (WHERE performance_category = 'fast') as fast_activities,
    COUNT(*) FILTER (WHERE performance_category = 'moderate') as moderate_activities,
    COUNT(*) FILTER (WHERE performance_category = 'slow') as slow_activities,
    COUNT(*) FILTER (WHERE performance_category = 'critical') as critical_activities,
    
    -- Execution time statistics
    AVG(execution_time_ms) as avg_execution_time,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms) as median_execution_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_execution_time,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms) as p99_execution_time,
    MIN(execution_time_ms) as min_execution_time,
    MAX(execution_time_ms) as max_execution_time,
    STDDEV_POP(execution_time_ms) as execution_time_stddev,
    
    -- Status distribution
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
    
    -- Error and retry analysis
    SUM(error_count) as total_errors,
    SUM(retry_count) as total_retries,
    AVG(error_count) as avg_error_rate,
    MAX(error_count) as max_errors_per_activity,
    
    -- Quality metrics
    AVG(activity_score) as avg_activity_score,
    MIN(activity_score) as min_activity_score,
    MAX(activity_score) as max_activity_score,
    
    -- Transaction analysis
    AVG(transaction_amount) FILTER (WHERE transaction_amount > 0) as avg_transaction_amount,
    SUM(transaction_amount) FILTER (WHERE transaction_amount > 0) as total_transaction_amount,
    COUNT(*) FILTER (WHERE transaction_amount > 100) as high_value_transactions,
    
    -- Activity timing patterns
    mode() WITHIN GROUP (ORDER BY activity_hour) as most_active_hour,
    COUNT(DISTINCT source_system) as unique_source_systems,
    
    -- Recent activity indicators
    MAX(created_at) as last_activity_time,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as recent_24h_activities,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour') as recent_1h_activities
    
  FROM user_activity_analysis
  GROUP BY user_id, application_id, activity_type
),

ranked_performance AS (
  SELECT *,
    -- Performance rankings
    ROW_NUMBER() OVER (
      PARTITION BY application_id 
      ORDER BY avg_execution_time DESC
    ) as slowest_rank,
    
    ROW_NUMBER() OVER (
      PARTITION BY application_id
      ORDER BY total_errors DESC
    ) as error_rank,
    
    ROW_NUMBER() OVER (
      PARTITION BY application_id
      ORDER BY total_activities DESC
    ) as volume_rank,
    
    -- Efficiency scoring
    CASE 
      WHEN avg_execution_time IS NULL THEN 0
      WHEN avg_execution_time > 0 THEN 
        (completed_count::numeric / total_activities) / (avg_execution_time / 1000.0) * 1000
      ELSE 0
    END as efficiency_score,
    
    -- Performance categorization
    CASE
      WHEN p95_execution_time > 10000 THEN 'critical'
      WHEN p95_execution_time > 5000 THEN 'poor'
      WHEN p95_execution_time > 2000 THEN 'moderate'
      WHEN p95_execution_time > 1000 THEN 'good'
      ELSE 'excellent'
    END as performance_grade,
    
    -- Error rate classification
    CASE 
      WHEN total_activities > 0 THEN
        CASE
          WHEN (total_errors::numeric / total_activities) > 0.1 THEN 'high_error'
          WHEN (total_errors::numeric / total_activities) > 0.05 THEN 'moderate_error'
          WHEN (total_errors::numeric / total_activities) > 0.01 THEN 'low_error'
          ELSE 'minimal_error'
        END
      ELSE 'no_data'
    END as error_grade
    
  FROM performance_metrics
),

final_analysis AS (
  SELECT 
    user_id,
    application_id,
    activity_type,
    total_activities,
    active_days,
    
    -- Performance summary
    ROUND(avg_execution_time::numeric, 2) as avg_execution_time_ms,
    ROUND(median_execution_time::numeric, 2) as median_execution_time_ms,
    ROUND(p95_execution_time::numeric, 2) as p95_execution_time_ms,
    ROUND(p99_execution_time::numeric, 2) as p99_execution_time_ms,
    performance_grade,
    
    -- Success metrics
    ROUND((completed_count::numeric / total_activities) * 100, 1) as success_rate_pct,
    ROUND((failed_count::numeric / total_activities) * 100, 1) as failure_rate_pct,
    error_grade,
    
    -- Volume and efficiency
    volume_rank,
    ROUND(efficiency_score::numeric, 2) as efficiency_score,
    
    -- Financial metrics
    ROUND(total_transaction_amount::numeric, 2) as total_transaction_value,
    high_value_transactions,
    
    -- Activity patterns
    most_active_hour,
    recent_24h_activities,
    recent_1h_activities,
    
    -- Rankings and alerts
    slowest_rank,
    error_rank,
    
    CASE 
      WHEN performance_grade = 'critical' OR error_grade = 'high_error' THEN 'immediate_attention'
      WHEN performance_grade = 'poor' OR error_grade = 'moderate_error' THEN 'needs_optimization'
      WHEN slowest_rank <= 3 OR error_rank <= 3 THEN 'monitor_closely'
      ELSE 'performing_normally'
    END as alert_level,
    
    -- Recommendations
    CASE 
      WHEN performance_grade = 'critical' THEN 'Investigate performance bottlenecks immediately'
      WHEN error_grade = 'high_error' THEN 'Review error patterns and implement fixes'
      WHEN efficiency_score < 50 THEN 'Optimize processing efficiency'
      WHEN recent_1h_activities = 0 AND recent_24h_activities > 0 THEN 'Monitor for potential issues'
      ELSE 'Continue normal monitoring'
    END as recommendation
    
  FROM ranked_performance
)
SELECT *
FROM final_analysis
ORDER BY 
  CASE alert_level
    WHEN 'immediate_attention' THEN 1
    WHEN 'needs_optimization' THEN 2
    WHEN 'monitor_closely' THEN 3
    ELSE 4
  END,
  performance_grade DESC,
  total_activities DESC;

-- Advanced compound index analysis and optimization
WITH index_performance AS (
  SELECT 
    index_name,
    key_pattern,
    index_size_mb,
    
    -- Usage statistics
    total_operations,
    operations_per_day,
    avg_operations_per_query,
    
    -- Performance impact
    index_hit_ratio,
    avg_query_time_with_index,
    avg_query_time_without_index,
    performance_improvement_pct,
    
    -- Maintenance overhead
    build_time_minutes,
    storage_overhead_pct,
    update_overhead_ms,
    
    -- Effectiveness scoring
    (operations_per_day * performance_improvement_pct * index_hit_ratio) / 
    (index_size_mb * update_overhead_ms) as effectiveness_score
    
  FROM INDEX_PERFORMANCE_STATS()
  WHERE index_type = 'compound'
),

index_recommendations AS (
  SELECT 
    index_name,
    key_pattern,
    operations_per_day,
    ROUND(effectiveness_score::numeric, 4) as effectiveness_score,
    
    -- Performance classification
    CASE 
      WHEN effectiveness_score > 1000 THEN 'highly_effective'
      WHEN effectiveness_score > 100 THEN 'effective'
      WHEN effectiveness_score > 10 THEN 'moderately_effective' 
      WHEN effectiveness_score > 1 THEN 'minimally_effective'
      ELSE 'ineffective'
    END as effectiveness_category,
    
    -- Optimization recommendations
    CASE
      WHEN operations_per_day < 1 AND index_size_mb > 100 THEN 'Consider dropping - low usage, high storage cost'
      WHEN effectiveness_score < 1 THEN 'Review index design and query patterns'
      WHEN performance_improvement_pct < 10 THEN 'Minimal performance benefit - evaluate necessity'
      WHEN index_hit_ratio < 0.5 THEN 'Poor selectivity - consider reordering fields'
      WHEN update_overhead_ms > 100 THEN 'High maintenance cost - optimize for write workload'
      ELSE 'Index performing within acceptable parameters'
    END as recommendation,
    
    -- Priority for attention
    CASE
      WHEN effectiveness_score < 0.1 THEN 'high_priority'
      WHEN effectiveness_score < 1 THEN 'medium_priority'
      ELSE 'low_priority'
    END as optimization_priority,
    
    -- Storage and performance details
    ROUND(index_size_mb::numeric, 2) as size_mb,
    ROUND(performance_improvement_pct::numeric, 1) as performance_gain_pct,
    ROUND(index_hit_ratio::numeric, 3) as selectivity_ratio,
    build_time_minutes
    
  FROM index_performance
)
SELECT 
  index_name,
  key_pattern,
  effectiveness_category,
  effectiveness_score,
  operations_per_day,
  performance_gain_pct,
  selectivity_ratio,
  size_mb,
  optimization_priority,
  recommendation
  
FROM index_recommendations
ORDER BY 
  CASE optimization_priority
    WHEN 'high_priority' THEN 1
    WHEN 'medium_priority' THEN 2
    ELSE 3
  END,
  effectiveness_score DESC;

-- Query execution plan analysis for compound indexes
EXPLAIN (ANALYZE true, VERBOSE true)
SELECT 
  user_id,
  application_id,
  activity_type,
  status,
  priority,
  execution_time_ms,
  created_at
FROM user_activities
WHERE user_id IN (12345, 23456, 34567)
  AND application_id = 'web_app'
  AND status IN ('completed', 'failed')
  AND priority >= 5
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY priority DESC, created_at DESC
LIMIT 100;

-- Index intersection analysis
WITH query_analysis AS (
  SELECT 
    query_pattern,
    execution_count,
    avg_execution_time_ms,
    index_used,
    index_intersection_count,
    
    -- Index effectiveness
    rows_examined,
    rows_returned, 
    CASE 
      WHEN rows_examined > 0 THEN rows_returned::numeric / rows_examined
      ELSE 0
    END as index_selectivity,
    
    -- Performance indicators
    CASE
      WHEN avg_execution_time_ms > 5000 THEN 'slow'
      WHEN avg_execution_time_ms > 1000 THEN 'moderate'
      ELSE 'fast'
    END as performance_category
    
  FROM QUERY_EXECUTION_STATS()
  WHERE query_type = 'multi_field'
    AND time_period >= CURRENT_TIMESTAMP - INTERVAL '7 days'
)
SELECT 
  query_pattern,
  execution_count,
  ROUND(avg_execution_time_ms::numeric, 2) as avg_time_ms,
  performance_category,
  index_used,
  index_intersection_count,
  ROUND(index_selectivity::numeric, 4) as selectivity,
  
  -- Optimization opportunities
  CASE 
    WHEN index_selectivity < 0.1 THEN 'Poor index selectivity - consider compound index'
    WHEN index_intersection_count > 2 THEN 'Multiple index intersection - create compound index'
    WHEN performance_category = 'slow' THEN 'Performance issue - review indexing strategy'
    ELSE 'Acceptable performance'
  END as optimization_opportunity,
  
  rows_examined,
  rows_returned
  
FROM query_analysis
WHERE execution_count > 10  -- Focus on frequently executed queries
ORDER BY avg_execution_time_ms DESC, execution_count DESC;

-- QueryLeaf provides comprehensive compound indexing capabilities:
-- 1. SQL-familiar compound index creation with advanced options
-- 2. Multi-field query optimization with automatic index selection  
-- 3. Performance analysis and index effectiveness monitoring
-- 4. Query execution plan analysis with detailed statistics
-- 5. Index intersection detection and optimization recommendations
-- 6. Background index building for zero-downtime optimization
-- 7. Partial and sparse indexing for memory and storage efficiency
-- 8. Text search integration with compound field indexing
-- 9. Integration with MongoDB's query planner and optimization
-- 10. Familiar SQL syntax for complex multi-dimensional queries
```

## Best Practices for Compound Index Implementation

### Index Design Strategy

Essential principles for optimal compound index design:

1. **ESR Rule**: Follow Equality, Sort, Range field ordering for maximum effectiveness
2. **Query Pattern Analysis**: Analyze actual query patterns before designing indexes
3. **Cardinality Optimization**: Place high-cardinality fields first for better selectivity
4. **Sort Integration**: Design indexes that support both filtering and sorting requirements
5. **Prefix Optimization**: Ensure indexes support multiple query patterns through prefixes
6. **Maintenance Balance**: Balance query performance with index maintenance overhead

### Performance and Scalability

Optimize compound indexes for production workloads:

1. **Index Intersection**: Understand when MongoDB uses multiple indexes vs. compound indexes
2. **Memory Utilization**: Monitor index memory usage and working set requirements
3. **Write Performance**: Balance read optimization with write performance impact
4. **Partial Indexes**: Use partial indexes to reduce storage and maintenance overhead
5. **Index Statistics**: Regularly analyze index usage patterns and effectiveness
6. **Background Building**: Use background index creation for zero-downtime deployments

## Conclusion

MongoDB Compound Indexes provide sophisticated multi-field query optimization that eliminates the complexity and limitations of traditional relational indexing approaches. The integration of intelligent query planning, automatic index selection, and flexible field ordering makes building high-performance multi-dimensional queries both powerful and efficient.

Key Compound Index benefits include:

- **Advanced Query Optimization**: Intelligent index selection and query path optimization
- **Multi-Field Efficiency**: Single index supporting complex filtering, sorting, and range queries  
- **Flexible Design Patterns**: Support for various query patterns through strategic field ordering
- **Performance Monitoring**: Comprehensive index usage analytics and optimization recommendations
- **Scalable Architecture**: Efficient performance across large datasets and high-concurrency workloads
- **Developer Familiarity**: SQL-style compound index creation and management patterns

Whether you're building analytics platforms, real-time dashboards, e-commerce applications, or any system requiring complex multi-field queries, MongoDB Compound Indexes with QueryLeaf's familiar SQL interface provides the foundation for optimal query performance. This combination enables sophisticated indexing strategies while preserving familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB compound index operations while providing SQL-familiar index creation, query optimization, and performance analysis. Advanced indexing strategies, query planning, and index effectiveness monitoring are seamlessly handled through familiar SQL patterns, making sophisticated database optimization both powerful and accessible.

The integration of advanced compound indexing capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both complex multi-field query performance and familiar database interaction patterns, ensuring your optimization strategies remain both effective and maintainable as they scale and evolve.