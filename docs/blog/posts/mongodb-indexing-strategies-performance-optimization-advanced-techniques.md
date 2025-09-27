---
title: "MongoDB Indexing Strategies and Performance Optimization: Advanced Techniques for High-Performance Database Operations"
description: "Master MongoDB indexing strategies for optimal query performance, covering compound indexes, partial indexes, text search optimization, and advanced indexing patterns. Learn SQL-familiar index management for scalable MongoDB applications."
date: 2025-09-26
tags: [mongodb, indexing, performance, optimization, compound-indexes, partial-indexes, sql]
---

# MongoDB Indexing Strategies and Performance Optimization: Advanced Techniques for High-Performance Database Operations

High-performance database applications depend heavily on strategic indexing to deliver fast query response times, efficient data retrieval, and optimal resource utilization. Poor indexing decisions can lead to slow queries, excessive memory usage, and degraded application performance that becomes increasingly problematic as data volumes grow.

MongoDB's flexible indexing system provides powerful capabilities for optimizing query performance across diverse data patterns and access scenarios. Unlike rigid relational indexing approaches, MongoDB indexes support complex document structures, array fields, geospatial data, and text search, enabling sophisticated optimization strategies that align with modern application requirements while maintaining query performance at scale.

## The Traditional Database Indexing Limitations

Conventional relational database indexing approaches have significant constraints for modern application patterns:

```sql
-- Traditional PostgreSQL indexing - rigid structure with limited flexibility

-- Basic single-column indexes with limited optimization potential
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_country ON users(country);

-- Simple compound index with fixed column order
CREATE INDEX idx_users_country_status_created ON users(country, status, created_at);

-- Basic partial index (PostgreSQL specific)
CREATE INDEX idx_active_users_email ON users(email) 
WHERE status = 'active';

-- Limited text search capabilities
CREATE INDEX idx_users_name_fts ON users 
USING GIN(to_tsvector('english', first_name || ' ' || last_name));

-- Complex query with multiple conditions
WITH user_search AS (
  SELECT 
    user_id,
    email,
    first_name,
    last_name,
    status,
    country,
    created_at,
    last_login_at,
    
    -- Multiple index usage may not be optimal
    CASE 
      WHEN status = 'active' AND last_login_at >= CURRENT_DATE - INTERVAL '30 days' THEN 'active_recent'
      WHEN status = 'active' AND last_login_at < CURRENT_DATE - INTERVAL '30 days' THEN 'active_stale'
      WHEN status = 'inactive' THEN 'inactive'
      ELSE 'pending'
    END as user_category,
    
    -- Basic scoring for relevance
    CASE country
      WHEN 'US' THEN 3
      WHEN 'CA' THEN 2  
      WHEN 'UK' THEN 2
      ELSE 1
    END as priority_score

  FROM users
  WHERE 
    -- Multiple WHERE conditions that may require different indexes
    status IN ('active', 'inactive') 
    AND country IN ('US', 'CA', 'UK', 'AU', 'DE')
    AND created_at >= CURRENT_DATE - INTERVAL '2 years'
    AND (
      email ILIKE '%@company.com' OR 
      first_name ILIKE 'John%' OR
      last_name ILIKE 'Smith%'
    )
),

user_enrichment AS (
  SELECT 
    us.*,
    
    -- Subquery requiring additional index
    (SELECT COUNT(*) 
     FROM orders o 
     WHERE o.user_id = us.user_id 
       AND o.created_at >= CURRENT_DATE - INTERVAL '1 year'
    ) as orders_last_year,
    
    -- Another subquery with different access pattern
    (SELECT SUM(total_amount) 
     FROM orders o 
     WHERE o.user_id = us.user_id 
       AND o.status = 'completed'
    ) as total_spent,
    
    -- JSON field access (limited optimization)
    preferences->>'theme' as preferred_theme,
    preferences->>'language' as preferred_language,
    
    -- Array field contains check (poor performance without GIN)
    CASE 
      WHEN tags && ARRAY['premium', 'vip'] THEN true 
      ELSE false 
    END as is_premium_user

  FROM user_search us
),

final_results AS (
  SELECT 
    ue.user_id,
    ue.email,
    ue.first_name,
    ue.last_name,
    ue.status,
    ue.country,
    ue.user_category,
    ue.priority_score,
    ue.orders_last_year,
    ue.total_spent,
    ue.preferred_theme,
    ue.preferred_language,
    ue.is_premium_user,
    
    -- Complex ranking calculation
    (ue.priority_score * 0.3 + 
     CASE 
       WHEN ue.orders_last_year > 10 THEN 5
       WHEN ue.orders_last_year > 5 THEN 3
       WHEN ue.orders_last_year > 0 THEN 1
       ELSE 0
     END * 0.4 +
     CASE
       WHEN ue.total_spent > 1000 THEN 5
       WHEN ue.total_spent > 500 THEN 3
       WHEN ue.total_spent > 100 THEN 1
       ELSE 0
     END * 0.3
    ) as relevance_score,
    
    -- Row number for pagination
    ROW_NUMBER() OVER (
      ORDER BY 
        ue.priority_score DESC,
        ue.orders_last_year DESC,
        ue.total_spent DESC,
        ue.created_at DESC
    ) as row_num,
    
    COUNT(*) OVER () as total_results

  FROM user_enrichment ue
  WHERE ue.orders_last_year > 0 OR ue.total_spent > 50
)

SELECT 
  user_id,
  email,
  first_name || ' ' || last_name as full_name,
  status,
  country,
  user_category,
  orders_last_year,
  ROUND(total_spent::numeric, 2) as total_spent,
  is_premium_user,
  ROUND(relevance_score::numeric, 2) as relevance_score,
  row_num,
  total_results

FROM final_results
WHERE row_num BETWEEN 1 AND 50
ORDER BY relevance_score DESC, row_num ASC;

-- PostgreSQL indexing problems:
-- 1. Fixed column order in compound indexes limits query flexibility
-- 2. Limited support for JSON field indexing and optimization  
-- 3. Poor performance with array field operations and contains queries
-- 4. Complex partial index syntax with limited conditional logic
-- 5. Inefficient handling of multi-field text search scenarios
-- 6. Index maintenance overhead increases significantly with table size
-- 7. Limited support for dynamic query patterns and field combinations
-- 8. Poor integration with application-level data structures
-- 9. Complex index selection logic requires deep database expertise
-- 10. Inflexible index types for specialized data patterns (geo, time-series)

-- Additional index requirements for above query
CREATE INDEX idx_users_compound_search ON users(status, country, created_at) 
WHERE status IN ('active', 'inactive');

CREATE INDEX idx_users_email_pattern ON users(email) 
WHERE email LIKE '%@company.com';

CREATE INDEX idx_users_name_pattern ON users(first_name, last_name) 
WHERE first_name LIKE 'John%' OR last_name LIKE 'Smith%';

CREATE INDEX idx_orders_user_recent ON orders(user_id, created_at) 
WHERE created_at >= CURRENT_DATE - INTERVAL '1 year';

CREATE INDEX idx_orders_user_completed ON orders(user_id, total_amount) 
WHERE status = 'completed';

-- JSON field indexing (limited capabilities)
CREATE INDEX idx_users_preferences_gin ON users USING GIN(preferences);

-- Array field indexing  
CREATE INDEX idx_users_tags_gin ON users USING GIN(tags);

-- MySQL approach (even more limited)
-- Basic indexes only
CREATE INDEX idx_mysql_users_email ON mysql_users(email);
CREATE INDEX idx_mysql_users_status_country ON mysql_users(status, country);
CREATE INDEX idx_mysql_users_created ON mysql_users(created_at);

-- Limited JSON support in older versions
-- ALTER TABLE mysql_users ADD INDEX idx_preferences ((preferences->>'$.theme'));

-- Basic query with limited optimization
SELECT 
  user_id,
  email,
  first_name,
  last_name,
  status,
  country,
  created_at
FROM mysql_users
WHERE status = 'active' 
  AND country IN ('US', 'CA')
  AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
ORDER BY created_at DESC
LIMIT 50;

-- MySQL limitations:
-- - Very limited JSON indexing capabilities
-- - No partial indexes or conditional indexing
-- - Basic compound index support with rigid column ordering
-- - Poor performance with complex queries and joins
-- - Limited text search capabilities without additional engines
-- - Minimal support for array operations and specialized data types
-- - Simple index optimization with limited query planner sophistication
```

MongoDB's advanced indexing system provides comprehensive optimization capabilities:

```javascript
// MongoDB Advanced Indexing - flexible, powerful, and application-optimized
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('user_analytics_platform');

// Advanced MongoDB indexing strategy manager
class MongoDBIndexingManager {
  constructor(db) {
    this.db = db;
    this.collections = {
      users: db.collection('users'),
      orders: db.collection('orders'),
      products: db.collection('products'),
      analytics: db.collection('analytics'),
      indexMetrics: db.collection('index_metrics')
    };
    this.indexingStrategies = new Map();
    this.performanceTargets = {
      maxQueryTime: 100, // milliseconds
      maxIndexSize: 1024, // MB
      minSelectivity: 0.01 // 1% selectivity threshold
    };
  }

  async createComprehensiveIndexingStrategy() {
    console.log('Creating comprehensive MongoDB indexing strategy...');
    
    // 1. Single field indexes for basic queries
    await this.createSingleFieldIndexes();
    
    // 2. Compound indexes for complex multi-field queries
    await this.createCompoundIndexes();
    
    // 3. Partial indexes for filtered queries
    await this.createPartialIndexes();
    
    // 4. Text indexes for search functionality
    await this.createTextSearchIndexes();
    
    // 5. Geospatial indexes for location-based queries
    await this.createGeospatialIndexes();
    
    // 6. Sparse indexes for optional fields
    await this.createSparseIndexes();
    
    // 7. TTL indexes for data expiration
    await this.createTTLIndexes();
    
    // 8. Wildcard indexes for flexible schemas
    await this.createWildcardIndexes();

    console.log('Comprehensive indexing strategy implemented successfully');
  }

  async createSingleFieldIndexes() {
    console.log('Creating optimized single field indexes...');
    
    const userIndexes = [
      // High-cardinality unique fields
      { email: 1 }, // Unique identifier, high selectivity
      { username: 1 }, // Unique identifier, high selectivity
      
      // High-frequency filter fields
      { status: 1 }, // Limited values but frequently queried
      { country: 1 }, // Geographic filtering
      { accountType: 1 }, // User segmentation
      
      // Temporal fields for range queries
      { createdAt: 1 }, // Registration date queries
      { lastLoginAt: 1 }, // Activity-based filtering
      { subscriptionExpiresAt: 1 }, // Subscription management
      
      // Numerical fields for range and sort operations
      { totalSpent: -1 }, // Customer value analysis (descending)
      { loyaltyPoints: -1 }, // Rewards program queries
      { riskScore: 1 } // Security and fraud detection
    ];

    for (const indexSpec of userIndexes) {
      const fieldName = Object.keys(indexSpec)[0];
      const indexName = `idx_users_${fieldName}`;
      
      try {
        await this.collections.users.createIndex(indexSpec, {
          name: indexName,
          background: true,
          // Add performance hints
          partialFilterExpression: this.getPartialFilterForField(fieldName)
        });
        
        console.log(`Created single field index: ${indexName}`);
        await this.recordIndexMetrics(indexName, 'single_field', indexSpec);
        
      } catch (error) {
        console.error(`Failed to create index ${indexName}:`, error);
      }
    }

    // Order indexes for e-commerce scenarios
    const orderIndexes = [
      { userId: 1 }, // Customer order lookup
      { status: 1 }, // Order status filtering
      { createdAt: -1 }, // Recent orders first
      { totalAmount: -1 }, // High-value orders
      { paymentStatus: 1 }, // Payment tracking
      { shippingMethod: 1 } // Fulfillment queries
    ];

    for (const indexSpec of orderIndexes) {
      const fieldName = Object.keys(indexSpec)[0];
      const indexName = `idx_orders_${fieldName}`;
      
      await this.collections.orders.createIndex(indexSpec, {
        name: indexName,
        background: true
      });
      
      console.log(`Created order index: ${indexName}`);
    }
  }

  async createCompoundIndexes() {
    console.log('Creating optimized compound indexes...');
    
    // User compound indexes following ESR (Equality, Sort, Range) rule
    const userCompoundIndexes = [
      {
        name: 'idx_users_country_status_created',
        spec: { country: 1, status: 1, createdAt: -1 },
        purpose: 'Geographic user filtering with status and recency',
        queryPatterns: ['country + status filters', 'country + status + date range']
      },
      {
        name: 'idx_users_status_activity_spent',
        spec: { status: 1, lastLoginAt: -1, totalSpent: -1 },
        purpose: 'Active user analysis with spending patterns',
        queryPatterns: ['status + activity analysis', 'customer value segmentation']
      },
      {
        name: 'idx_users_type_tier_points',
        spec: { accountType: 1, loyaltyTier: 1, loyaltyPoints: -1 },
        purpose: 'Customer segmentation and loyalty program queries',
        queryPatterns: ['loyalty program analysis', 'customer tier management']
      },
      {
        name: 'idx_users_email_verification_created',
        spec: { 'verification.email': 1, 'verification.phone': 1, createdAt: -1 },
        purpose: 'User verification status with registration timeline',
        queryPatterns: ['verification status queries', 'onboarding analytics']
      },
      {
        name: 'idx_users_preferences_activity',
        spec: { 'preferences.marketing': 1, 'preferences.notifications': 1, lastLoginAt: -1 },
        purpose: 'Marketing segmentation with activity correlation',
        queryPatterns: ['marketing campaign targeting', 'notification preferences']
      }
    ];

    for (const indexConfig of userCompoundIndexes) {
      try {
        await this.collections.users.createIndex(indexConfig.spec, {
          name: indexConfig.name,
          background: true
        });
        
        console.log(`Created compound index: ${indexConfig.name}`);
        console.log(`  Purpose: ${indexConfig.purpose}`);
        console.log(`  Query patterns: ${indexConfig.queryPatterns.join(', ')}`);
        
        await this.recordIndexMetrics(indexConfig.name, 'compound', indexConfig.spec, {
          purpose: indexConfig.purpose,
          queryPatterns: indexConfig.queryPatterns
        });
        
      } catch (error) {
        console.error(`Failed to create compound index ${indexConfig.name}:`, error);
      }
    }

    // Order compound indexes for e-commerce analytics
    const orderCompoundIndexes = [
      {
        name: 'idx_orders_user_status_date',
        spec: { userId: 1, status: 1, createdAt: -1 },
        purpose: 'Customer order history with status filtering'
      },
      {
        name: 'idx_orders_status_payment_amount',
        spec: { status: 1, paymentStatus: 1, totalAmount: -1 },
        purpose: 'Revenue analysis and payment processing queries'
      },
      {
        name: 'idx_orders_product_date_amount',
        spec: { 'items.productId': 1, createdAt: -1, totalAmount: -1 },
        purpose: 'Product performance analysis with sales trends'
      },
      {
        name: 'idx_orders_shipping_region_date',
        spec: { 'shippingAddress.country': 1, 'shippingAddress.state': 1, createdAt: -1 },
        purpose: 'Geographic sales analysis and shipping optimization'
      }
    ];

    for (const indexConfig of orderCompoundIndexes) {
      await this.collections.orders.createIndex(indexConfig.spec, {
        name: indexConfig.name,
        background: true
      });
      
      console.log(`Created order compound index: ${indexConfig.name}`);
    }
  }

  async createPartialIndexes() {
    console.log('Creating partial indexes for filtered queries...');
    
    const partialIndexes = [
      {
        name: 'idx_users_active_email',
        collection: 'users',
        spec: { email: 1 },
        filter: { status: 'active' },
        purpose: 'Active user email lookups (reduces index size by ~70%)'
      },
      {
        name: 'idx_users_premium_spending',
        collection: 'users', 
        spec: { totalSpent: -1, loyaltyPoints: -1 },
        filter: { accountType: 'premium' },
        purpose: 'Premium customer analysis and loyalty tracking'
      },
      {
        name: 'idx_users_recent_active',
        collection: 'users',
        spec: { lastLoginAt: -1, country: 1 },
        filter: { 
          status: 'active',
          lastLoginAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        },
        purpose: 'Recently active users for engagement campaigns'
      },
      {
        name: 'idx_orders_high_value_completed',
        collection: 'orders',
        spec: { totalAmount: -1, createdAt: -1 },
        filter: { 
          status: 'completed',
          totalAmount: { $gte: 500 }
        },
        purpose: 'High-value completed orders for VIP customer analysis'
      },
      {
        name: 'idx_orders_pending_payment',
        collection: 'orders',
        spec: { createdAt: 1, userId: 1 },
        filter: {
          status: { $in: ['pending', 'processing'] },
          paymentStatus: 'pending'
        },
        purpose: 'Orders requiring payment processing attention'
      },
      {
        name: 'idx_users_verification_required',
        collection: 'users',
        spec: { createdAt: 1, riskScore: -1 },
        filter: {
          $or: [
            { 'verification.email': false },
            { 'verification.phone': false },
            { 'verification.identity': false }
          ]
        },
        purpose: 'Users requiring additional verification steps'
      }
    ];

    for (const partialIndex of partialIndexes) {
      try {
        const collection = this.collections[partialIndex.collection];
        
        await collection.createIndex(partialIndex.spec, {
          name: partialIndex.name,
          partialFilterExpression: partialIndex.filter,
          background: true
        });
        
        console.log(`Created partial index: ${partialIndex.name}`);
        console.log(`  Filter: ${JSON.stringify(partialIndex.filter)}`);
        console.log(`  Purpose: ${partialIndex.purpose}`);
        
        // Measure index size reduction
        const fullIndexStats = await this.estimateIndexSize(partialIndex.spec);
        const partialIndexStats = await collection.aggregate([
          { $match: partialIndex.filter },
          { $count: "documentCount" }
        ]).toArray();
        
        const reductionPercent = ((1 - (partialIndexStats[0]?.documentCount || 0) / fullIndexStats.documentCount) * 100).toFixed(1);
        console.log(`  Index size reduction: ~${reductionPercent}%`);
        
      } catch (error) {
        console.error(`Failed to create partial index ${partialIndex.name}:`, error);
      }
    }
  }

  async createTextSearchIndexes() {
    console.log('Creating text search indexes for full-text search...');
    
    const textIndexes = [
      {
        name: 'idx_users_fulltext_search',
        collection: 'users',
        spec: {
          firstName: 'text',
          lastName: 'text',
          email: 'text',
          'profile.bio': 'text',
          'profile.company': 'text'
        },
        weights: {
          firstName: 10,
          lastName: 10,
          email: 5,
          'profile.bio': 1,
          'profile.company': 3
        },
        purpose: 'Comprehensive user search across name, email, and profile data'
      },
      {
        name: 'idx_products_search',
        collection: 'products',
        spec: {
          name: 'text',
          description: 'text',
          brand: 'text',
          'tags': 'text',
          'specifications.features': 'text'
        },
        weights: {
          name: 20,
          brand: 15,
          tags: 10,
          description: 5,
          'specifications.features': 3
        },
        purpose: 'Product catalog search with relevance weighting'
      },
      {
        name: 'idx_orders_search',
        collection: 'orders',
        spec: {
          orderNumber: 'text',
          'customer.email': 'text',
          'items.productName': 'text',
          'shippingAddress.street': 'text',
          'shippingAddress.city': 'text'
        },
        weights: {
          orderNumber: 20,
          'customer.email': 15,
          'items.productName': 10,
          'shippingAddress.street': 3,
          'shippingAddress.city': 5
        },
        purpose: 'Order search by number, customer, products, or shipping details'
      }
    ];

    for (const textIndex of textIndexes) {
      try {
        const collection = this.collections[textIndex.collection];
        
        await collection.createIndex(textIndex.spec, {
          name: textIndex.name,
          weights: textIndex.weights,
          background: true,
          // Configure text search options
          default_language: 'english',
          language_override: 'language' // Field name for document language
        });
        
        console.log(`Created text search index: ${textIndex.name}`);
        console.log(`  Purpose: ${textIndex.purpose}`);
        console.log(`  Weighted fields: ${Object.keys(textIndex.weights).join(', ')}`);
        
      } catch (error) {
        console.error(`Failed to create text index ${textIndex.name}:`, error);
      }
    }
  }

  async createGeospatialIndexes() {
    console.log('Creating geospatial indexes for location-based queries...');
    
    const geoIndexes = [
      {
        name: 'idx_users_location_2dsphere',
        collection: 'users',
        spec: { 'location.coordinates': '2dsphere' },
        purpose: 'User location queries for proximity and regional analysis'
      },
      {
        name: 'idx_orders_shipping_location',
        collection: 'orders',
        spec: { 'shippingAddress.coordinates': '2dsphere' },
        purpose: 'Shipping destination analysis and route optimization'
      },
      {
        name: 'idx_stores_location_2dsphere',
        collection: 'stores',
        spec: { 'address.coordinates': '2dsphere' },
        purpose: 'Store locator and catchment area analysis'
      }
    ];

    for (const geoIndex of geoIndexes) {
      try {
        const collection = this.collections[geoIndex.collection] || this.db.collection(geoIndex.collection);
        
        await collection.createIndex(geoIndex.spec, {
          name: geoIndex.name,
          background: true,
          // 2dsphere specific options
          '2dsphereIndexVersion': 3 // Use latest version
        });
        
        console.log(`Created geospatial index: ${geoIndex.name}`);
        console.log(`  Purpose: ${geoIndex.purpose}`);
        
      } catch (error) {
        console.error(`Failed to create geo index ${geoIndex.name}:`, error);
      }
    }
  }

  async createSparseIndexes() {
    console.log('Creating sparse indexes for optional fields...');
    
    const sparseIndexes = [
      {
        name: 'idx_users_social_profiles_sparse',
        collection: 'users',
        spec: { 'socialProfiles.twitter': 1, 'socialProfiles.linkedin': 1 },
        purpose: 'Social media profile lookups (only for users with social profiles)'
      },
      {
        name: 'idx_users_subscription_sparse',
        collection: 'users',
        spec: { 'subscription.planId': 1, 'subscription.renewsAt': 1 },
        purpose: 'Subscription management (only for subscribed users)'
      },
      {
        name: 'idx_users_referral_sparse',
        collection: 'users',
        spec: { 'referral.code': 1, 'referral.referredBy': 1 },
        purpose: 'Referral program tracking (only for users in referral program)'
      },
      {
        name: 'idx_orders_tracking_sparse',
        collection: 'orders',
        spec: { 'shipping.trackingNumber': 1, 'shipping.carrier': 1 },
        purpose: 'Package tracking (only for shipped orders)'
      }
    ];

    for (const sparseIndex of sparseIndexes) {
      try {
        const collection = this.collections[sparseIndex.collection];
        
        await collection.createIndex(sparseIndex.spec, {
          name: sparseIndex.name,
          sparse: true, // Skip documents where indexed fields are missing
          background: true
        });
        
        console.log(`Created sparse index: ${sparseIndex.name}`);
        console.log(`  Purpose: ${sparseIndex.purpose}`);
        
      } catch (error) {
        console.error(`Failed to create sparse index ${sparseIndex.name}:`, error);
      }
    }
  }

  async createTTLIndexes() {
    console.log('Creating TTL indexes for automatic data expiration...');
    
    const ttlIndexes = [
      {
        name: 'idx_analytics_events_ttl',
        collection: 'analytics',
        spec: { createdAt: 1 },
        expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
        purpose: 'Automatic cleanup of analytics events after 30 days'
      },
      {
        name: 'idx_user_sessions_ttl',
        collection: 'userSessions',
        spec: { lastActivity: 1 },
        expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days
        purpose: 'Session cleanup after 7 days of inactivity'
      },
      {
        name: 'idx_password_resets_ttl',
        collection: 'passwordResets',
        spec: { createdAt: 1 },
        expireAfterSeconds: 24 * 60 * 60, // 24 hours
        purpose: 'Password reset token expiration after 24 hours'
      },
      {
        name: 'idx_email_verification_ttl',
        collection: 'emailVerifications',
        spec: { createdAt: 1 },
        expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days
        purpose: 'Email verification token cleanup after 7 days'
      }
    ];

    for (const ttlIndex of ttlIndexes) {
      try {
        const collection = this.db.collection(ttlIndex.collection);
        
        await collection.createIndex(ttlIndex.spec, {
          name: ttlIndex.name,
          expireAfterSeconds: ttlIndex.expireAfterSeconds,
          background: true
        });
        
        const expireDays = Math.round(ttlIndex.expireAfterSeconds / (24 * 60 * 60));
        console.log(`Created TTL index: ${ttlIndex.name} (expires after ${expireDays} days)`);
        console.log(`  Purpose: ${ttlIndex.purpose}`);
        
      } catch (error) {
        console.error(`Failed to create TTL index ${ttlIndex.name}:`, error);
      }
    }
  }

  async createWildcardIndexes() {
    console.log('Creating wildcard indexes for flexible schema queries...');
    
    const wildcardIndexes = [
      {
        name: 'idx_users_metadata_wildcard',
        collection: 'users',
        spec: { 'metadata.$**': 1 },
        purpose: 'Flexible querying of user metadata fields with varying schemas'
      },
      {
        name: 'idx_products_attributes_wildcard',
        collection: 'products',
        spec: { 'attributes.$**': 1 },
        purpose: 'Dynamic product attribute queries for catalog flexibility'
      },
      {
        name: 'idx_orders_customFields_wildcard',
        collection: 'orders',
        spec: { 'customFields.$**': 1 },
        purpose: 'Custom order fields for different business verticals'
      }
    ];

    for (const wildcardIndex of wildcardIndexes) {
      try {
        const collection = this.collections[wildcardIndex.collection] || this.db.collection(wildcardIndex.collection);
        
        await collection.createIndex(wildcardIndex.spec, {
          name: wildcardIndex.name,
          background: true,
          // Wildcard index options
          wildcardProjection: { 
            _id: 1 // Always include _id for efficiency
          }
        });
        
        console.log(`Created wildcard index: ${wildcardIndex.name}`);
        console.log(`  Purpose: ${wildcardIndex.purpose}`);
        
      } catch (error) {
        console.error(`Failed to create wildcard index ${wildcardIndex.name}:`, error);
      }
    }
  }

  async performQueryOptimizationAnalysis() {
    console.log('Performing comprehensive query optimization analysis...');
    
    const analysisResults = {
      slowQueries: [],
      indexUsage: [],
      recommendedIndexes: [],
      performanceMetrics: {}
    };

    // 1. Analyze slow queries from profiler data
    const slowQueries = await this.db.collection('system.profile').find({
      ts: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      millis: { $gte: 100 } // Queries taking > 100ms
    }).sort({ millis: -1 }).limit(50).toArray();

    analysisResults.slowQueries = slowQueries.map(query => ({
      namespace: query.ns,
      duration: query.millis,
      command: query.command,
      executionStats: query.execStats,
      timestamp: query.ts,
      recommendation: this.generateOptimizationRecommendation(query)
    }));

    // 2. Analyze index usage statistics
    for (const collectionName of Object.keys(this.collections)) {
      const collection = this.collections[collectionName];
      
      try {
        const indexStats = await collection.aggregate([
          { $indexStats: {} }
        ]).toArray();
        
        const indexUsage = indexStats.map(stat => ({
          collection: collectionName,
          indexName: stat.name,
          usageCount: stat.accesses.ops,
          lastUsed: stat.accesses.since,
          size: stat.size,
          efficiency: this.calculateIndexEfficiency(stat)
        }));
        
        analysisResults.indexUsage.push(...indexUsage);
        
      } catch (error) {
        console.warn(`Could not get index stats for ${collectionName}:`, error.message);
      }
    }

    // 3. Generate index recommendations
    analysisResults.recommendedIndexes = await this.generateIndexRecommendations(analysisResults.slowQueries);

    // 4. Calculate performance metrics
    analysisResults.performanceMetrics = await this.calculatePerformanceMetrics();

    console.log('Query optimization analysis completed');
    
    // Store analysis results for historical tracking
    await this.collections.indexMetrics.insertOne({
      analysisType: 'query_optimization',
      timestamp: new Date(),
      results: analysisResults
    });

    return analysisResults;
  }

  generateOptimizationRecommendation(slowQuery) {
    const recommendations = [];
    
    // Check for missing indexes based on query pattern
    if (slowQuery.execStats?.executionStats?.stage === 'COLLSCAN') {
      recommendations.push('Query requires collection scan - consider adding index');
    }
    
    if (slowQuery.execStats?.executionStats?.stage === 'IXSCAN' && 
        slowQuery.execStats?.executionStats?.keysExamined > slowQuery.execStats?.executionStats?.docsExamined * 10) {
      recommendations.push('Index selectivity is poor - consider compound index or partial index');
    }
    
    // Check for sort optimization
    if (slowQuery.command?.sort && 
        slowQuery.execStats?.executionStats?.stages?.some(stage => stage.stage === 'SORT')) {
      recommendations.push('Sort operation not using index - add sort fields to index');
    }
    
    // Check for projection optimization
    if (slowQuery.command?.projection && Object.keys(slowQuery.command.projection).length < 5) {
      recommendations.push('Consider covered query with projection fields in index');
    }
    
    return recommendations.length > 0 ? recommendations : ['Query performance acceptable'];
  }

  calculateIndexEfficiency(indexStat) {
    // Calculate index efficiency based on usage patterns
    const size = indexStat.size || 0;
    const usage = indexStat.accesses?.ops || 0;
    const daysSinceCreated = (Date.now() - indexStat.creationTime) / (24 * 60 * 60 * 1000);
    
    // Efficiency metric: usage per day per MB
    const efficiency = usage / Math.max(daysSinceCreated, 1) / Math.max(size / (1024 * 1024), 1);
    
    return Math.round(efficiency * 100) / 100;
  }

  async generateIndexRecommendations(slowQueries) {
    const recommendations = [];
    const queryPatterns = new Map();
    
    // Analyze query patterns to suggest indexes
    for (const query of slowQueries) {
      const command = query.command;
      if (!command?.find && !command?.aggregate) continue;
      
      const collection = query.namespace.split('.')[1];
      const filter = command.find ? command.filter : 
                    command.aggregate?.[0]?.$match;
      
      if (filter) {
        const pattern = this.extractQueryPattern(filter);
        const key = `${collection}:${pattern}`;
        
        if (!queryPatterns.has(key)) {
          queryPatterns.set(key, {
            collection,
            pattern,
            frequency: 0,
            avgDuration: 0,
            queries: []
          });
        }
        
        const patternData = queryPatterns.get(key);
        patternData.frequency++;
        patternData.avgDuration = (patternData.avgDuration * (patternData.frequency - 1) + query.duration) / patternData.frequency;
        patternData.queries.push(query);
      }
    }
    
    // Generate recommendations based on frequent slow patterns
    for (const [key, patternData] of queryPatterns) {
      if (patternData.frequency >= 3 && patternData.avgDuration >= 100) {
        const recommendedIndex = this.generateIndexSpecFromPattern(patternData.pattern);
        
        recommendations.push({
          collection: patternData.collection,
          recommendedIndex,
          reason: `Frequent slow queries (${patternData.frequency} occurrences, avg ${patternData.avgDuration}ms)`,
          queryPattern: patternData.pattern,
          estimatedImprovement: this.estimatePerformanceImprovement(patternData)
        });
      }
    }
    
    return recommendations;
  }

  extractQueryPattern(filter) {
    // Extract query pattern for index recommendation
    const pattern = {};
    
    for (const [field, condition] of Object.entries(filter)) {
      if (field === '$and' || field === '$or') {
        // Handle logical operators
        pattern[field] = 'logical_operator';
      } else if (typeof condition === 'object' && condition !== null) {
        // Handle range/comparison queries
        const operators = Object.keys(condition);
        if (operators.some(op => ['$gt', '$gte', '$lt', '$lte'].includes(op))) {
          pattern[field] = 'range';
        } else if (operators.includes('$in')) {
          pattern[field] = 'in_list';
        } else if (operators.includes('$regex')) {
          pattern[field] = 'regex';
        } else {
          pattern[field] = 'equality';
        }
      } else {
        pattern[field] = 'equality';
      }
    }
    
    return JSON.stringify(pattern);
  }

  generateIndexSpecFromPattern(patternStr) {
    const pattern = JSON.parse(patternStr);
    const indexSpec = {};
    
    // Apply ESR (Equality, Sort, Range) rule
    const equalityFields = [];
    const rangeFields = [];
    
    for (const [field, type] of Object.entries(pattern)) {
      if (type === 'equality' || type === 'in_list') {
        equalityFields.push(field);
      } else if (type === 'range') {
        rangeFields.push(field);
      }
    }
    
    // Build index spec: equality fields first, then range fields
    for (const field of equalityFields) {
      indexSpec[field] = 1;
    }
    for (const field of rangeFields) {
      indexSpec[field] = 1;
    }
    
    return indexSpec;
  }

  estimatePerformanceImprovement(patternData) {
    // Estimate performance improvement based on query characteristics
    const baseImprovement = 50; // Base 50% improvement assumption
    
    // Higher improvement for collection scans
    if (patternData.queries.some(q => q.executionStats?.stage === 'COLLSCAN')) {
      return Math.min(90, baseImprovement + 30);
    }
    
    // Moderate improvement for index scans with poor selectivity
    if (patternData.avgDuration > 500) {
      return Math.min(80, baseImprovement + 20);
    }
    
    return baseImprovement;
  }

  async calculatePerformanceMetrics() {
    const metrics = {};
    
    try {
      // Get database stats
      const dbStats = await this.db.stats();
      metrics.totalIndexSize = dbStats.indexSize;
      metrics.totalDataSize = dbStats.dataSize;
      metrics.indexToDataRatio = (dbStats.indexSize / dbStats.dataSize * 100).toFixed(1) + '%';
      
      // Get collection-level metrics
      for (const collectionName of Object.keys(this.collections)) {
        const collection = this.collections[collectionName];
        const stats = await collection.stats();
        
        metrics[collectionName] = {
          documentCount: stats.count,
          avgDocumentSize: stats.avgObjSize,
          indexCount: stats.nindexes,
          totalIndexSize: stats.totalIndexSize,
          indexSizeRatio: (stats.totalIndexSize / stats.size * 100).toFixed(1) + '%'
        };
      }
      
    } catch (error) {
      console.warn('Could not calculate all performance metrics:', error.message);
    }
    
    return metrics;
  }

  async recordIndexMetrics(indexName, indexType, indexSpec, metadata = {}) {
    try {
      await this.collections.indexMetrics.insertOne({
        indexName,
        indexType,
        indexSpec,
        metadata,
        createdAt: new Date(),
        status: 'active'
      });
    } catch (error) {
      console.warn('Failed to record index metrics:', error.message);
    }
  }

  getPartialFilterForField(fieldName) {
    // Return appropriate partial filter expressions for common fields
    const partialFilters = {
      email: { email: { $exists: true, $ne: null } },
      lastLoginAt: { lastLoginAt: { $exists: true } },
      totalSpent: { totalSpent: { $gt: 0 } },
      riskScore: { riskScore: { $exists: true } }
    };
    
    return partialFilters[fieldName] || null;
  }

  async estimateIndexSize(indexSpec) {
    // Estimate index size based on collection statistics
    try {
      const collection = this.collections.users; // Default to users collection
      const sampleDoc = await collection.findOne();
      const stats = await collection.stats();
      
      if (sampleDoc && stats) {
        const avgDocSize = stats.avgObjSize;
        const fieldSize = this.estimateFieldSize(sampleDoc, Object.keys(indexSpec));
        const indexOverhead = fieldSize * 1.2; // 20% overhead for B-tree structure
        
        return {
          documentCount: stats.count,
          estimatedIndexSize: indexOverhead * stats.count,
          avgFieldSize: fieldSize
        };
      }
    } catch (error) {
      console.warn('Could not estimate index size:', error.message);
    }
    
    return { documentCount: 0, estimatedIndexSize: 0, avgFieldSize: 0 };
  }

  estimateFieldSize(document, fieldNames) {
    let totalSize = 0;
    
    for (const fieldName of fieldNames) {
      const value = this.getNestedValue(document, fieldName);
      totalSize += this.calculateValueSize(value);
    }
    
    return totalSize;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  calculateValueSize(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string') return value.length * 2; // UTF-8 overhead
    if (typeof value === 'number') return 8; // 64-bit numbers
    if (typeof value === 'boolean') return 1;
    if (value instanceof Date) return 8;
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + this.calculateValueSize(item), 0);
    if (typeof value === 'object') return Object.values(value).reduce((sum, val) => sum + this.calculateValueSize(val), 0);
    
    return 50; // Default estimate for unknown types
  }

  async optimizeExistingIndexes() {
    console.log('Optimizing existing indexes...');
    
    const optimizationResults = {
      rebuiltIndexes: [],
      droppedIndexes: [],
      recommendations: []
    };

    for (const collectionName of Object.keys(this.collections)) {
      const collection = this.collections[collectionName];
      
      try {
        // Get current indexes
        const indexes = await collection.indexes();
        const indexStats = await collection.aggregate([{ $indexStats: {} }]).toArray();
        
        for (const index of indexes) {
          if (index.name === '_id_') continue; // Skip default _id index
          
          const stat = indexStats.find(s => s.name === index.name);
          const usage = stat?.accesses?.ops || 0;
          const daysSinceCreated = stat ? (Date.now() - stat.accesses.since) / (24 * 60 * 60 * 1000) : 0;
          
          // Check for unused indexes (no usage in 30 days)
          if (daysSinceCreated > 30 && usage === 0) {
            console.log(`Dropping unused index: ${index.name} in ${collectionName}`);
            await collection.dropIndex(index.name);
            optimizationResults.droppedIndexes.push({
              collection: collectionName,
              indexName: index.name,
              reason: 'Unused for 30+ days'
            });
          }
          
          // Check for low-efficiency indexes
          const efficiency = stat ? this.calculateIndexEfficiency(stat) : 0;
          if (efficiency < 0.1 && usage > 0) {
            optimizationResults.recommendations.push({
              collection: collectionName,
              indexName: index.name,
              recommendation: 'Low efficiency - consider redesigning or adding partial filter',
              currentEfficiency: efficiency
            });
          }
        }
        
      } catch (error) {
        console.error(`Error optimizing indexes for ${collectionName}:`, error);
      }
    }
    
    console.log('Index optimization completed');
    return optimizationResults;
  }
}

// Benefits of MongoDB Advanced Indexing:
// - Flexible compound indexes with optimal field ordering for complex queries
// - Partial indexes that dramatically reduce index size and improve performance
// - Text search indexes with weighted relevance and language support
// - Geospatial indexes for location-based queries and proximity searches
// - Sparse indexes for optional fields that save storage and improve efficiency
// - TTL indexes for automatic data lifecycle management
// - Wildcard indexes for dynamic schema flexibility
// - Real-time index usage analysis and optimization recommendations
// - Integration with query profiler for performance bottleneck identification
// - Sophisticated index strategy management with automated optimization

module.exports = {
  MongoDBIndexingManager
};
```

## Understanding MongoDB Indexing Architecture

### Advanced Index Design Patterns and Strategies

Implement sophisticated indexing patterns for optimal query performance:

```javascript
// Advanced indexing patterns for specialized use cases
class AdvancedIndexingPatterns {
  constructor(db) {
    this.db = db;
    this.performanceTargets = {
      maxQueryTime: 50, // milliseconds for standard queries
      maxComplexQueryTime: 200, // milliseconds for complex analytical queries
      maxIndexSizeRatio: 0.3 // Index size should not exceed 30% of data size
    };
  }

  async implementCoveredQueryOptimization() {
    console.log('Implementing covered query optimization patterns...');
    
    // Covered queries that can be satisfied entirely from index
    const coveredQueryIndexes = [
      {
        name: 'idx_user_dashboard_covered',
        collection: 'users',
        spec: { 
          status: 1, 
          country: 1, 
          email: 1, 
          firstName: 1, 
          lastName: 1, 
          totalSpent: 1,
          loyaltyPoints: 1,
          createdAt: 1 
        },
        purpose: 'Cover user dashboard queries without document retrieval',
        coveredQueries: [
          'User listing with basic info and spending',
          'Geographic user distribution',
          'Customer segmentation queries'
        ]
      },
      {
        name: 'idx_order_summary_covered',
        collection: 'orders', 
        spec: {
          userId: 1,
          status: 1,
          totalAmount: 1,
          createdAt: 1,
          paymentStatus: 1,
          'shipping.method': 1
        },
        purpose: 'Cover order summary queries for customer service',
        coveredQueries: [
          'Customer order history summaries',
          'Revenue reporting by status and date',
          'Shipping method analysis'
        ]
      }
    ];

    for (const coveredIndex of coveredQueryIndexes) {
      const collection = this.db.collection(coveredIndex.collection);
      
      await collection.createIndex(coveredIndex.spec, {
        name: coveredIndex.name,
        background: true
      });
      
      console.log(`Created covered query index: ${coveredIndex.name}`);
      console.log(`  Covered queries: ${coveredIndex.coveredQueries.join(', ')}`);
    }
  }

  async implementHashedIndexingStrategy() {
    console.log('Implementing hashed indexing for sharded collections...');
    
    // Hashed indexes for even distribution across shards
    const hashedIndexes = [
      {
        name: 'idx_users_id_hashed',
        collection: 'users',
        spec: { _id: 'hashed' },
        purpose: 'Even distribution of users across shards'
      },
      {
        name: 'idx_orders_customer_hashed', 
        collection: 'orders',
        spec: { userId: 'hashed' },
        purpose: 'Distribute customer orders evenly across shards'
      },
      {
        name: 'idx_analytics_session_hashed',
        collection: 'analytics',
        spec: { sessionId: 'hashed' },
        purpose: 'Balance analytics data across sharded cluster'
      }
    ];

    for (const hashedIndex of hashedIndexes) {
      const collection = this.db.collection(hashedIndex.collection);
      
      await collection.createIndex(hashedIndex.spec, {
        name: hashedIndex.name,
        background: true
      });
      
      console.log(`Created hashed index: ${hashedIndex.name}`);
    }
  }

  async implementMultikeyIndexOptimization() {
    console.log('Implementing multikey index optimization for arrays...');
    
    // Optimized indexes for array fields
    const multikeyIndexes = [
      {
        name: 'idx_users_tags_interests',
        collection: 'users',
        spec: { tags: 1, 'interests.category': 1 },
        purpose: 'User segmentation by tags and interest categories'
      },
      {
        name: 'idx_products_categories_brands',
        collection: 'products',
        spec: { categories: 1, brand: 1, status: 1 },
        purpose: 'Product catalog queries with category and brand filtering'
      },
      {
        name: 'idx_orders_product_items',
        collection: 'orders',
        spec: { 'items.productId': 1, 'items.category': 1, status: 1 },
        purpose: 'Product performance analysis across orders'
      }
    ];

    for (const multikeyIndex of multikeyIndexes) {
      const collection = this.db.collection(multikeyIndex.collection);
      
      // Check if index involves multiple array fields (compound multikey limitation)
      const sampleDoc = await collection.findOne();
      const arrayFields = this.identifyArrayFields(sampleDoc, Object.keys(multikeyIndex.spec));
      
      if (arrayFields.length > 1) {
        console.warn(`Index ${multikeyIndex.name} may have compound multikey limitations`);
        // Create alternative single-array indexes
        for (const arrayField of arrayFields) {
          const alternativeSpec = { [arrayField]: 1 };
          await collection.createIndex(alternativeSpec, {
            name: `${multikeyIndex.name}_${arrayField}`,
            background: true
          });
        }
      } else {
        await collection.createIndex(multikeyIndex.spec, {
          name: multikeyIndex.name,
          background: true
        });
      }
      
      console.log(`Created multikey index: ${multikeyIndex.name}`);
    }
  }

  identifyArrayFields(document, fieldNames) {
    const arrayFields = [];
    
    for (const fieldName of fieldNames) {
      const value = this.getNestedValue(document, fieldName);
      if (Array.isArray(value)) {
        arrayFields.push(fieldName);
      }
    }
    
    return arrayFields;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  async implementIndexIntersectionStrategies() {
    console.log('Implementing index intersection strategies...');
    
    // Design indexes that work well together for intersection
    const intersectionIndexes = [
      {
        name: 'idx_users_status_single',
        collection: 'users',
        spec: { status: 1 },
        purpose: 'Status filtering for intersection'
      },
      {
        name: 'idx_users_country_single',
        collection: 'users', 
        spec: { country: 1 },
        purpose: 'Geographic filtering for intersection'
      },
      {
        name: 'idx_users_activity_single',
        collection: 'users',
        spec: { lastLoginAt: -1 },
        purpose: 'Activity-based filtering for intersection'
      },
      {
        name: 'idx_users_spending_single',
        collection: 'users',
        spec: { totalSpent: -1 },
        purpose: 'Spending analysis for intersection'
      }
    ];

    // Create single-field indexes that can be intersected
    for (const index of intersectionIndexes) {
      const collection = this.db.collection(index.collection);
      
      await collection.createIndex(index.spec, {
        name: index.name,
        background: true
      });
      
      console.log(`Created intersection index: ${index.name}`);
    }

    // Test intersection performance
    await this.testIndexIntersectionPerformance();
  }

  async testIndexIntersectionPerformance() {
    console.log('Testing index intersection performance...');
    
    const collection = this.db.collection('users');
    
    // Query that should use index intersection
    const intersectionQuery = {
      status: 'active',
      country: 'US', 
      lastLoginAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      totalSpent: { $gte: 100 }
    };

    const explain = await collection.find(intersectionQuery).explain('executionStats');
    
    if (explain.executionStats.executionStages.stage === 'AND_HASH' ||
        explain.executionStats.executionStages.stage === 'AND_SORTED') {
      console.log('✅ Query successfully using index intersection');
      console.log(`Execution time: ${explain.executionStats.executionTimeMillis}ms`);
    } else {
      console.log('❌ Query not using index intersection, consider compound index');
      console.log(`Current stage: ${explain.executionStats.executionStages.stage}`);
    }
  }

  async implementTimesSeriesIndexing() {
    console.log('Implementing time-series optimized indexing...');
    
    const timeSeriesIndexes = [
      {
        name: 'idx_metrics_time_metric',
        collection: 'metrics',
        spec: { timestamp: 1, metricType: 1, value: 1 },
        purpose: 'Time-series metrics queries with metric type filtering'
      },
      {
        name: 'idx_events_time_user',
        collection: 'events',
        spec: { timestamp: 1, userId: 1, eventType: 1 },
        purpose: 'User activity timeline and event analysis'
      },
      {
        name: 'idx_logs_time_level',
        collection: 'logs', 
        spec: { timestamp: 1, level: 1, service: 1 },
        purpose: 'Log analysis with severity and service filtering'
      }
    ];

    for (const tsIndex of timeSeriesIndexes) {
      const collection = this.db.collection(tsIndex.collection);
      
      await collection.createIndex(tsIndex.spec, {
        name: tsIndex.name,
        background: true
      });
      
      console.log(`Created time-series index: ${tsIndex.name}`);
    }

    // Create time-based partial indexes for recent data
    const recentDataIndexes = [
      {
        name: 'idx_metrics_recent_hot',
        collection: 'metrics',
        spec: { timestamp: 1, metricType: 1, userId: 1 },
        filter: { 
          timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        purpose: 'Hot data access for recent metrics (last 7 days)'
      },
      {
        name: 'idx_events_recent_active',
        collection: 'events',
        spec: { userId: 1, eventType: 1, timestamp: -1 },
        filter: {
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        purpose: 'Recent user activity (last 24 hours)'
      }
    ];

    for (const recentIndex of recentDataIndexes) {
      const collection = this.db.collection(recentIndex.collection);
      
      await collection.createIndex(recentIndex.spec, {
        name: recentIndex.name,
        partialFilterExpression: recentIndex.filter,
        background: true
      });
      
      console.log(`Created recent data index: ${recentIndex.name}`);
    }
  }

  async monitorIndexPerformanceMetrics() {
    console.log('Monitoring index performance metrics...');
    
    const performanceMetrics = {
      collections: {},
      globalMetrics: {},
      recommendations: []
    };

    for (const collectionName of ['users', 'orders', 'products', 'analytics']) {
      const collection = this.db.collection(collectionName);
      
      try {
        // Get collection statistics
        const stats = await collection.stats();
        const indexStats = await collection.aggregate([{ $indexStats: {} }]).toArray();
        
        performanceMetrics.collections[collectionName] = {
          documentCount: stats.count,
          avgDocumentSize: stats.avgObjSize,
          dataSize: stats.size,
          indexCount: stats.nindexes,
          totalIndexSize: stats.totalIndexSize,
          indexSizeRatio: (stats.totalIndexSize / stats.size).toFixed(3),
          indexes: indexStats.map(stat => ({
            name: stat.name,
            size: stat.size,
            usageCount: stat.accesses?.ops || 0,
            lastUsed: stat.accesses?.since,
            efficiency: this.calculateIndexEfficiency(stat, stats)
          }))
        };

        // Generate recommendations
        const collectionRecommendations = this.generateCollectionIndexRecommendations(
          collectionName, 
          performanceMetrics.collections[collectionName]
        );
        performanceMetrics.recommendations.push(...collectionRecommendations);
        
      } catch (error) {
        console.warn(`Could not analyze ${collectionName}:`, error.message);
      }
    }

    // Calculate global metrics
    const totalDataSize = Object.values(performanceMetrics.collections)
      .reduce((sum, col) => sum + col.dataSize, 0);
    const totalIndexSize = Object.values(performanceMetrics.collections)
      .reduce((sum, col) => sum + col.totalIndexSize, 0);
    
    performanceMetrics.globalMetrics = {
      totalDataSize,
      totalIndexSize,
      globalIndexRatio: (totalIndexSize / totalDataSize).toFixed(3),
      totalIndexCount: Object.values(performanceMetrics.collections)
        .reduce((sum, col) => sum + col.indexCount, 0),
      avgIndexEfficiency: this.calculateAverageIndexEfficiency(performanceMetrics.collections)
    };

    console.log('Index performance monitoring completed');
    console.log(`Global index ratio: ${performanceMetrics.globalMetrics.globalIndexRatio}`);
    console.log(`Total indexes: ${performanceMetrics.globalMetrics.totalIndexCount}`);
    console.log(`Recommendations generated: ${performanceMetrics.recommendations.length}`);

    return performanceMetrics;
  }

  calculateIndexEfficiency(indexStat, collectionStats) {
    const usagePerMB = (indexStat.accesses?.ops || 0) / Math.max(indexStat.size / (1024 * 1024), 0.1);
    const sizeRatio = indexStat.size / collectionStats.size;
    const daysSinceLastUse = indexStat.accesses?.since ? 
      (Date.now() - indexStat.accesses.since) / (24 * 60 * 60 * 1000) : 999;
    
    // Efficiency score: usage frequency weighted by size efficiency and recency
    const efficiencyScore = (usagePerMB * 0.5) + 
                           ((1 - sizeRatio) * 50 * 0.3) + 
                           (Math.max(0, 30 - daysSinceLastUse) * 0.2);
    
    return Math.round(efficiencyScore * 100) / 100;
  }

  calculateAverageIndexEfficiency(collections) {
    let totalEfficiency = 0;
    let indexCount = 0;
    
    for (const collection of Object.values(collections)) {
      for (const index of collection.indexes) {
        if (index.name !== '_id_') { // Exclude default _id index
          totalEfficiency += index.efficiency;
          indexCount++;
        }
      }
    }
    
    return indexCount > 0 ? (totalEfficiency / indexCount).toFixed(2) : 0;
  }

  generateCollectionIndexRecommendations(collectionName, collectionData) {
    const recommendations = [];
    
    // Check for high index-to-data ratio
    if (parseFloat(collectionData.indexSizeRatio) > this.performanceTargets.maxIndexSizeRatio) {
      recommendations.push({
        collection: collectionName,
        type: 'SIZE_WARNING',
        message: `Index size ratio (${collectionData.indexSizeRatio}) exceeds recommended threshold`,
        suggestion: 'Review index necessity and consider partial indexes'
      });
    }
    
    // Check for unused indexes
    const unusedIndexes = collectionData.indexes.filter(idx => 
      idx.name !== '_id_' && idx.usageCount === 0
    );
    
    if (unusedIndexes.length > 0) {
      recommendations.push({
        collection: collectionName,
        type: 'UNUSED_INDEXES',
        message: `Found ${unusedIndexes.length} unused indexes`,
        suggestion: `Consider dropping: ${unusedIndexes.map(idx => idx.name).join(', ')}`
      });
    }
    
    // Check for low-efficiency indexes
    const inefficientIndexes = collectionData.indexes.filter(idx => 
      idx.name !== '_id_' && idx.efficiency < 1.0
    );
    
    if (inefficientIndexes.length > 0) {
      recommendations.push({
        collection: collectionName,
        type: 'LOW_EFFICIENCY',
        message: `Found ${inefficientIndexes.length} low-efficiency indexes`,
        suggestion: 'Review usage patterns and consider redesigning or adding partial filters'
      });
    }
    
    // Check for missing compound indexes (heuristic)
    if (collectionData.indexCount < 3 && collectionData.documentCount > 10000) {
      recommendations.push({
        collection: collectionName,
        type: 'MISSING_COMPOUND_INDEXES',
        message: 'Large collection with few indexes may benefit from compound indexes',
        suggestion: 'Analyze query patterns and create compound indexes for frequently combined filters'
      });
    }
    
    return recommendations;
  }
}
```

## SQL-Style Index Management with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB index operations:

```sql
-- QueryLeaf index management with SQL-familiar syntax

-- Create single-field indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_country ON users(country);
CREATE INDEX idx_users_created_at ON users(created_at DESC); -- Descending sort

-- Create compound indexes following ESR (Equality, Sort, Range) principle
CREATE INDEX idx_users_compound_esr ON users(
  status,           -- Equality: exact match filters
  country,          -- Equality: exact match filters  
  total_spent DESC, -- Sort: ordering field
  created_at        -- Range: range queries
);

-- Create partial indexes with conditions
CREATE INDEX idx_users_active_email ON users(email)
WHERE status = 'active';

CREATE INDEX idx_users_premium_spending ON users(total_spent DESC, loyalty_points DESC)
WHERE account_type = 'premium' AND total_spent > 100;

CREATE INDEX idx_orders_recent_high_value ON orders(total_amount DESC, created_at DESC)
WHERE status = 'completed' 
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
  AND total_amount >= 500;

-- Create text search indexes with weights
CREATE TEXT INDEX idx_users_search ON users(
  first_name WEIGHT 10,
  last_name WEIGHT 10,
  email WEIGHT 5,
  company WEIGHT 3,
  bio WEIGHT 1
) WITH (
  default_language = 'english',
  language_override = 'language'
);

CREATE TEXT INDEX idx_products_search ON products(
  name WEIGHT 20,
  brand WEIGHT 15,
  tags WEIGHT 10,
  description WEIGHT 5,
  features WEIGHT 3
);

-- Create geospatial indexes
CREATE INDEX idx_users_location ON users(location) USING GEO2DSPHERE;
CREATE INDEX idx_stores_address ON stores(address.coordinates) USING GEO2DSPHERE;

-- Create sparse indexes for optional fields
CREATE INDEX idx_users_social_profiles ON users(
  social_profiles.twitter,
  social_profiles.linkedin
) WITH SPARSE;

CREATE INDEX idx_users_subscription ON users(
  subscription.plan_id,
  subscription.expires_at
) WITH SPARSE;

-- Create TTL indexes for automatic data expiration
CREATE INDEX idx_sessions_ttl ON user_sessions(last_activity)
WITH TTL = '7 days';

CREATE INDEX idx_analytics_ttl ON analytics_events(created_at) 
WITH TTL = '30 days';

CREATE INDEX idx_password_resets_ttl ON password_resets(created_at)
WITH TTL = '24 hours';

-- Create wildcard indexes for flexible schemas
CREATE INDEX idx_users_metadata ON users("metadata.$**");
CREATE INDEX idx_products_attributes ON products("attributes.$**");
CREATE INDEX idx_orders_custom_fields ON orders("custom_fields.$**");

-- Advanced compound index patterns
WITH user_activity_analysis AS (
  SELECT 
    user_id,
    status,
    country,
    DATE_TRUNC('month', created_at) as signup_month,
    last_login_at,
    total_spent,
    loyalty_tier,
    
    -- User categorization
    CASE 
      WHEN total_spent > 1000 THEN 'high_value'
      WHEN total_spent > 100 THEN 'medium_value' 
      ELSE 'low_value'
    END as value_segment,
    
    CASE
      WHEN last_login_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 'active'
      WHEN last_login_at >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 'recent'
      WHEN last_login_at >= CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'inactive'
      ELSE 'dormant'
    END as activity_segment

  FROM users
  WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '2 years'
),

index_optimization_analysis AS (
  SELECT 
    -- Query pattern analysis for index design
    COUNT(*) as total_queries,
    COUNT(*) FILTER (WHERE status = 'active') as active_user_queries,
    COUNT(*) FILTER (WHERE country IN ('US', 'CA', 'UK')) as geographic_queries,
    COUNT(*) FILTER (WHERE total_spent > 100) as spending_queries,
    COUNT(*) FILTER (WHERE last_login_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as recent_activity_queries,
    
    -- Compound query patterns
    COUNT(*) FILTER (WHERE status = 'active' AND country = 'US') as status_country_queries,
    COUNT(*) FILTER (WHERE status = 'active' AND total_spent > 100) as status_spending_queries,
    COUNT(*) FILTER (WHERE country = 'US' AND total_spent > 500) as country_spending_queries,
    
    -- Complex filtering patterns
    COUNT(*) FILTER (
      WHERE status = 'active' 
        AND country IN ('US', 'CA') 
        AND total_spent > 100
        AND last_login_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    ) as complex_filter_queries,
    
    -- Sorting patterns
    COUNT(*) FILTER (WHERE ORDER BY created_at DESC IS NOT NULL) as date_sort_queries,
    COUNT(*) FILTER (WHERE ORDER BY total_spent DESC IS NOT NULL) as spending_sort_queries,
    COUNT(*) FILTER (WHERE ORDER BY last_login_at DESC IS NOT NULL) as activity_sort_queries,
    
    -- Range query patterns  
    COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 year') as date_range_queries,
    COUNT(*) FILTER (WHERE total_spent BETWEEN 100 AND 1000) as spending_range_queries

  FROM user_activity_analysis
)

-- Optimal index recommendations based on query patterns
SELECT 
  'CREATE INDEX idx_users_status_country_spending ON users(status, country, total_spent DESC)' as recommended_index,
  'High frequency status + country + spending queries' as justification,
  status_country_queries + country_spending_queries as query_frequency
FROM index_optimization_analysis
WHERE status_country_queries > 100 OR country_spending_queries > 100

UNION ALL

SELECT 
  'CREATE INDEX idx_users_active_recent_spending ON users(status, last_login_at DESC, total_spent DESC) WHERE status = ''active''',
  'Active user analysis with recent activity and spending',
  active_user_queries + recent_activity_queries
FROM index_optimization_analysis  
WHERE active_user_queries > 50

UNION ALL

SELECT 
  'CREATE INDEX idx_users_geographic_value ON users(country, value_segment, activity_segment)',
  'Geographic segmentation with customer value analysis',
  geographic_queries
FROM index_optimization_analysis
WHERE geographic_queries > 75;

-- Index performance monitoring and optimization
WITH index_usage_stats AS (
  SELECT 
    collection_name,
    index_name,
    index_size_mb,
    usage_count,
    last_used,
    
    -- Calculate index efficiency metrics
    usage_count / GREATEST(index_size_mb, 1) as usage_per_mb,
    EXTRACT(DAYS FROM (CURRENT_TIMESTAMP - last_used)) as days_since_last_use,
    
    -- Index selectivity estimation
    CASE 
      WHEN index_name LIKE '%email%' THEN 'high'      -- Unique fields
      WHEN index_name LIKE '%status%' THEN 'low'      -- Few distinct values
      WHEN index_name LIKE '%country%' THEN 'medium'  -- Geographic distribution
      WHEN index_name LIKE '%created_at%' THEN 'high' -- Timestamp fields
      ELSE 'unknown'
    END as estimated_selectivity,
    
    -- Index type classification
    CASE 
      WHEN index_name LIKE '%compound%' OR index_name LIKE '%_%_%' THEN 'compound'
      WHEN index_name LIKE '%text%' OR index_name LIKE '%search%' THEN 'text'
      WHEN index_name LIKE '%geo%' OR index_name LIKE '%location%' THEN 'geospatial'
      WHEN index_name LIKE '%ttl%' THEN 'ttl'
      ELSE 'single_field'
    END as index_type

  FROM mongodb_index_stats  -- Hypothetical system table
  WHERE collection_name IN ('users', 'orders', 'products', 'analytics')
),

index_health_assessment AS (
  SELECT 
    collection_name,
    index_name,
    index_type,
    usage_per_mb,
    days_since_last_use,
    estimated_selectivity,
    
    -- Health score calculation
    CASE 
      WHEN days_since_last_use > 30 AND usage_count = 0 THEN 'UNUSED'
      WHEN usage_per_mb < 0.1 THEN 'LOW_EFFICIENCY' 
      WHEN usage_per_mb > 10 AND estimated_selectivity = 'high' THEN 'OPTIMAL'
      WHEN usage_per_mb > 5 AND estimated_selectivity = 'medium' THEN 'GOOD'
      WHEN usage_per_mb > 1 THEN 'ACCEPTABLE'
      ELSE 'NEEDS_REVIEW'
    END as health_status,
    
    -- Optimization recommendations
    CASE 
      WHEN days_since_last_use > 30 THEN 'Consider dropping unused index'
      WHEN usage_per_mb < 0.1 AND estimated_selectivity = 'low' THEN 'Add partial filter to improve selectivity'
      WHEN index_type = 'single_field' AND usage_per_mb > 5 THEN 'Consider compound index for better coverage'
      WHEN index_size_mb > 100 AND usage_per_mb < 1 THEN 'Large index with low usage - review necessity'
      ELSE 'Index performing within acceptable parameters'
    END as optimization_recommendation

  FROM index_usage_stats
)

SELECT 
  collection_name,
  index_name,
  index_type,
  health_status,
  ROUND(usage_per_mb, 2) as usage_efficiency,
  days_since_last_use,
  optimization_recommendation,
  
  -- Priority scoring for optimization
  CASE health_status
    WHEN 'UNUSED' THEN 100
    WHEN 'LOW_EFFICIENCY' THEN 80
    WHEN 'NEEDS_REVIEW' THEN 60
    WHEN 'ACCEPTABLE' THEN 20
    ELSE 0
  END as optimization_priority

FROM index_health_assessment
WHERE health_status != 'OPTIMAL'
ORDER BY optimization_priority DESC, collection_name, index_name;

-- Real-time query performance analysis with index recommendations
WITH slow_queries AS (
  SELECT 
    collection_name,
    query_pattern,
    avg_execution_time_ms,
    query_count,
    index_used,
    documents_examined,
    documents_returned,
    
    -- Calculate query efficiency metrics  
    documents_examined / GREATEST(documents_returned, 1) as scan_efficiency,
    query_count * avg_execution_time_ms as total_time_impact,
    
    -- Identify optimization opportunities
    CASE 
      WHEN index_used IS NULL OR index_used = 'COLLSCAN' THEN 'MISSING_INDEX'
      WHEN scan_efficiency > 100 THEN 'POOR_SELECTIVITY'
      WHEN avg_execution_time_ms > 100 THEN 'SLOW_QUERY'
      ELSE 'ACCEPTABLE'
    END as performance_issue

  FROM query_performance_log  -- Hypothetical query log table
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    AND avg_execution_time_ms > 50
),

index_recommendations AS (
  SELECT 
    collection_name,
    query_pattern,
    performance_issue,
    total_time_impact,
    
    -- Generate specific index recommendations
    CASE performance_issue
      WHEN 'MISSING_INDEX' THEN 
        'CREATE INDEX ON ' || collection_name || ' FOR: ' || query_pattern
      WHEN 'POOR_SELECTIVITY' THEN
        'CREATE PARTIAL INDEX ON ' || collection_name || ' WITH SELECTIVE FILTER'  
      WHEN 'SLOW_QUERY' THEN
        'OPTIMIZE INDEX ON ' || collection_name || ' FOR QUERY: ' || query_pattern
      ELSE 'No immediate action required'
    END as recommended_action,
    
    -- Estimate performance improvement
    CASE performance_issue
      WHEN 'MISSING_INDEX' THEN LEAST(avg_execution_time_ms * 0.8, 50) -- 80% improvement
      WHEN 'POOR_SELECTIVITY' THEN LEAST(avg_execution_time_ms * 0.6, 30) -- 60% improvement  
      WHEN 'SLOW_QUERY' THEN LEAST(avg_execution_time_ms * 0.4, 20) -- 40% improvement
      ELSE 0
    END as estimated_improvement_ms

  FROM slow_queries
  WHERE performance_issue != 'ACCEPTABLE'
)

SELECT 
  collection_name,
  recommended_action,
  COUNT(*) as affected_query_patterns,
  SUM(total_time_impact) as total_performance_impact,
  ROUND(AVG(estimated_improvement_ms), 1) as avg_improvement_ms,
  
  -- Calculate ROI for optimization effort
  ROUND(SUM(total_time_impact * estimated_improvement_ms / 1000), 2) as optimization_value_score,
  
  -- Priority ranking
  ROW_NUMBER() OVER (ORDER BY SUM(total_time_impact) DESC) as optimization_priority

FROM index_recommendations  
GROUP BY collection_name, recommended_action
HAVING COUNT(*) >= 3  -- Focus on patterns affecting multiple queries
ORDER BY optimization_priority ASC;

-- QueryLeaf provides comprehensive index management capabilities:
-- 1. SQL-familiar index creation syntax with advanced options
-- 2. Partial indexes with complex conditional expressions  
-- 3. Text search indexes with customizable weights and language support
-- 4. Geospatial indexing for location-based queries and analysis
-- 5. TTL indexes with flexible expiration rules and time units
-- 6. Compound index optimization following ESR principles
-- 7. Real-time index performance monitoring and health assessment
-- 8. Automated index recommendations based on query patterns
-- 9. Index usage analytics and optimization priority scoring
-- 10. Integration with MongoDB's native indexing optimizations
```

## Best Practices for MongoDB Index Implementation

### Index Design Guidelines

Essential principles for optimal MongoDB index design:

1. **ESR Rule**: Design compound indexes following Equality, Sort, Range field ordering
2. **Selectivity Focus**: Prioritize high-selectivity fields early in compound indexes
3. **Query Pattern Analysis**: Design indexes based on actual application query patterns
4. **Partial Index Usage**: Use partial indexes to reduce size and improve performance
5. **Index Intersection**: Consider single-field indexes that can be intersected efficiently
6. **Covered Queries**: Design indexes to cover frequently executed queries entirely

### Performance and Maintenance

Optimize MongoDB indexes for production workloads:

1. **Regular Monitoring**: Implement continuous index usage and performance monitoring
2. **Size Management**: Keep total index size reasonable relative to data size
3. **Background Building**: Always build indexes in background for production systems
4. **Usage Analysis**: Regularly review and remove unused or inefficient indexes
5. **Testing Strategy**: Test index changes thoroughly before production deployment
6. **Documentation**: Maintain clear documentation of index purpose and query patterns

## Conclusion

MongoDB's advanced indexing capabilities provide comprehensive optimization strategies that eliminate the limitations and constraints of traditional relational database indexing approaches. The flexible indexing system supports complex document structures, dynamic schemas, and specialized data types while delivering exceptional query performance at scale.

Key MongoDB Indexing benefits include:

- **Flexible Index Types**: Support for compound, partial, text, geospatial, sparse, TTL, and wildcard indexes
- **Advanced Query Optimization**: Sophisticated query planner with index intersection and covered query support  
- **Dynamic Schema Support**: Indexing capabilities that adapt to evolving document structures
- **Specialized Data Support**: Native indexing for arrays, embedded documents, and geospatial data
- **Performance Analytics**: Comprehensive index usage monitoring and optimization recommendations
- **Scalable Architecture**: Index strategies that work across replica sets and sharded clusters

Whether you're optimizing query performance, managing large-scale data operations, or building applications with complex data access patterns, MongoDB's indexing system with QueryLeaf's familiar SQL interface provides the foundation for high-performance database operations.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB indexing operations while providing SQL-familiar index creation, optimization, and monitoring syntax. Advanced indexing patterns, performance analysis, and automated recommendations are seamlessly handled through familiar SQL constructs, making sophisticated database optimization both powerful and accessible to SQL-oriented development teams.

The integration of native MongoDB indexing capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both flexible data modeling and familiar database optimization patterns, ensuring your applications achieve optimal performance while remaining maintainable as they scale and evolve.