---
title: "MongoDB Aggregation Framework Optimization and Performance Tuning: Advanced Pipeline Design with SQL-Style Query Performance"
description: "Master MongoDB aggregation pipeline optimization, performance tuning, and advanced aggregation patterns. Learn pipeline design strategies, index utilization, and SQL-familiar aggregation optimization techniques for high-performance analytics."
date: 2025-09-23
tags: [mongodb, aggregation, performance, optimization, analytics, sql, pipeline-design]
---

# MongoDB Aggregation Framework Optimization and Performance Tuning: Advanced Pipeline Design with SQL-Style Query Performance

Modern data analytics require sophisticated data processing pipelines that can handle complex transformations, aggregations, and analytics across large datasets efficiently. Traditional SQL approaches often struggle with complex nested data structures, multi-stage transformations, and the performance overhead of multiple query roundtrips needed for complex analytics workflows.

MongoDB's Aggregation Framework provides a powerful pipeline-based approach that enables complex data transformations and analytics in a single, optimized operation. Unlike traditional SQL aggregation that requires multiple queries or complex subqueries, MongoDB aggregations can perform sophisticated multi-stage processing with intelligent optimization and index utilization.

## The Traditional Analytics Performance Challenge

Traditional approaches to complex data aggregation and analytics have significant performance and architectural limitations:

```sql
-- Traditional SQL approach - multiple queries and complex joins

-- PostgreSQL complex analytics query with performance challenges
WITH user_segments AS (
  SELECT 
    user_id,
    email,
    registration_date,
    subscription_tier,
    
    -- User activity aggregation (expensive subquery)
    (SELECT COUNT(*) FROM user_activities ua WHERE ua.user_id = u.user_id) as total_activities,
    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id) as total_orders,
    (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.user_id = u.user_id) as lifetime_value,
    
    -- Recent activity indicators (more expensive subqueries)
    (SELECT COUNT(*) FROM user_activities ua 
     WHERE ua.user_id = u.user_id 
       AND ua.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as recent_activities,
    (SELECT COUNT(*) FROM orders o 
     WHERE o.user_id = u.user_id 
       AND o.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as recent_orders,
    
    -- Engagement scoring (complex calculation)
    CASE 
      WHEN (SELECT COUNT(*) FROM user_activities ua WHERE ua.user_id = u.user_id AND ua.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days') > 10 THEN 'high'
      WHEN (SELECT COUNT(*) FROM user_activities ua WHERE ua.user_id = u.user_id AND ua.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') > 5 THEN 'medium'
      ELSE 'low'
    END as engagement_level
    
  FROM users u
  WHERE u.status = 'active'
),

order_analytics AS (
  SELECT 
    o.user_id,
    COUNT(*) as order_count,
    SUM(o.total_amount) as total_spent,
    AVG(o.total_amount) as avg_order_value,
    MAX(o.created_at) as last_order_date,
    
    -- Product category analysis (expensive join)
    (SELECT string_agg(DISTINCT p.category, ',') 
     FROM order_items oi 
     JOIN products p ON oi.product_id = p.product_id 
     WHERE oi.order_id = o.order_id) as purchased_categories,
    
    -- Time-based patterns (complex calculations)
    EXTRACT(DOW FROM o.created_at) as order_day_of_week,
    EXTRACT(HOUR FROM o.created_at) as order_hour,
    
    -- Seasonality analysis
    CASE 
      WHEN EXTRACT(MONTH FROM o.created_at) IN (12, 1, 2) THEN 'winter'
      WHEN EXTRACT(MONTH FROM o.created_at) IN (3, 4, 5) THEN 'spring'
      WHEN EXTRACT(MONTH FROM o.created_at) IN (6, 7, 8) THEN 'summer'
      ELSE 'fall'
    END as season
    
  FROM orders o
  WHERE o.status = 'completed'
    AND o.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 year'
  GROUP BY o.user_id, EXTRACT(DOW FROM o.created_at), EXTRACT(HOUR FROM o.created_at),
    CASE 
      WHEN EXTRACT(MONTH FROM o.created_at) IN (12, 1, 2) THEN 'winter'
      WHEN EXTRACT(MONTH FROM o.created_at) IN (3, 4, 5) THEN 'spring'  
      WHEN EXTRACT(MONTH FROM o.created_at) IN (6, 7, 8) THEN 'summer'
      ELSE 'fall'
    END
),

product_preferences AS (
  -- Complex product affinity analysis
  SELECT 
    o.user_id,
    p.category,
    COUNT(*) as category_purchases,
    SUM(oi.quantity * oi.unit_price) as category_spend,
    
    -- Preference scoring
    ROW_NUMBER() OVER (PARTITION BY o.user_id ORDER BY COUNT(*) DESC) as category_rank,
    
    -- Purchase timing patterns
    AVG(EXTRACT(EPOCH FROM (o.created_at - LAG(o.created_at) OVER (PARTITION BY o.user_id, p.category ORDER BY o.created_at)))) / 86400 as avg_days_between_category_purchases
    
  FROM orders o
  JOIN order_items oi ON o.order_id = oi.order_id
  JOIN products p ON oi.product_id = p.product_id
  WHERE o.status = 'completed'
  GROUP BY o.user_id, p.category
),

final_analytics AS (
  SELECT 
    us.user_id,
    us.email,
    us.subscription_tier,
    us.total_activities,
    us.total_orders,
    us.lifetime_value,
    us.engagement_level,
    
    -- Order analytics
    COALESCE(oa.order_count, 0) as recent_order_count,
    COALESCE(oa.total_spent, 0) as recent_total_spent,
    COALESCE(oa.avg_order_value, 0) as recent_avg_order_value,
    
    -- Product preferences (expensive array aggregation)
    ARRAY(
      SELECT pp.category 
      FROM product_preferences pp 
      WHERE pp.user_id = us.user_id 
        AND pp.category_rank <= 3
      ORDER BY pp.category_rank
    ) as top_product_categories,
    
    -- Customer lifetime value prediction (complex calculation)
    CASE
      WHEN us.lifetime_value > 1000 AND us.recent_orders > 2 THEN us.lifetime_value * 1.2
      WHEN us.lifetime_value > 500 AND us.recent_activities > 10 THEN us.lifetime_value * 1.1
      ELSE us.lifetime_value
    END as predicted_ltv,
    
    -- Churn risk assessment
    CASE
      WHEN us.recent_activities = 0 AND oa.last_order_date < CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'high'
      WHEN us.recent_activities < 5 AND oa.last_order_date < CURRENT_TIMESTAMP - INTERVAL '45 days' THEN 'medium'
      ELSE 'low'
    END as churn_risk,
    
    -- Segmentation
    CASE
      WHEN us.lifetime_value > 1000 AND us.engagement_level = 'high' THEN 'vip'
      WHEN us.lifetime_value > 500 OR us.engagement_level = 'high' THEN 'loyal'
      WHEN us.total_orders > 0 THEN 'customer'
      ELSE 'prospect'
    END as user_segment
    
  FROM user_segments us
  LEFT JOIN order_analytics oa ON us.user_id = oa.user_id
)

SELECT *
FROM final_analytics
ORDER BY predicted_ltv DESC, engagement_level DESC;

-- Problems with traditional SQL aggregation:
-- 1. Multiple expensive subqueries for each user
-- 2. Complex joins across many tables with poor performance
-- 3. Difficult to optimize with multiple aggregation layers
-- 4. Limited support for complex nested data transformations
-- 5. Poor performance with large datasets due to multiple passes
-- 6. Complex window functions with high memory usage
-- 7. Difficulty handling semi-structured data efficiently
-- 8. Limited parallelization opportunities
-- 9. Complex query plans that are hard to optimize
-- 10. High resource usage for multi-stage analytics

-- MySQL approach (even more limited)
SELECT 
  u.user_id,
  u.email,
  u.subscription_tier,
  COUNT(DISTINCT ua.activity_id) as total_activities,
  COUNT(DISTINCT o.order_id) as total_orders,
  COALESCE(SUM(o.total_amount), 0) as lifetime_value,
  
  -- Limited aggregation capabilities
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN ua.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN ua.activity_id END) > 10 THEN 'high'
    WHEN COUNT(DISTINCT CASE WHEN ua.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN ua.activity_id END) > 5 THEN 'medium'
    ELSE 'low'
  END as engagement_level,
  
  -- Basic JSON aggregation (limited functionality)
  JSON_ARRAYAGG(DISTINCT p.category) as purchased_categories

FROM users u
LEFT JOIN user_activities ua ON u.user_id = ua.user_id
LEFT JOIN orders o ON u.user_id = o.user_id AND o.status = 'completed'
LEFT JOIN order_items oi ON o.order_id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.product_id
WHERE u.status = 'active'
GROUP BY u.user_id, u.email, u.subscription_tier;

-- MySQL limitations:
-- - Very limited JSON and array processing capabilities
-- - Poor window function support in older versions
-- - Basic aggregation functions with limited customization
-- - No sophisticated data transformation capabilities
-- - Limited support for complex analytical queries
-- - Poor performance with large result sets
-- - Minimal support for nested data structures
```

MongoDB Aggregation Framework provides optimized, pipeline-based analytics:

```javascript
// MongoDB Aggregation Framework - optimized pipeline-based analytics
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('analytics_platform');

// Advanced aggregation pipeline optimization strategies
class MongoAggregationOptimizer {
  constructor(db) {
    this.db = db;
    this.pipelineStats = new Map();
    this.indexRecommendations = [];
  }

  async optimizeUserAnalyticsPipeline() {
    console.log('Running optimized user analytics aggregation pipeline...');
    
    const users = this.db.collection('users');
    
    // Highly optimized aggregation pipeline
    const pipeline = [
      // Stage 1: Initial filtering - leverage indexes early
      {
        $match: {
          status: 'active',
          registrationDate: { 
            $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) 
          }
        }
      },
      
      // Stage 2: Early projection to reduce document size
      {
        $project: {
          _id: 1,
          email: 1,
          subscriptionTier: 1,
          registrationDate: 1,
          lastLoginAt: 1,
          preferences: 1
        }
      },
      
      // Stage 3: Lookup user activities with optimized pipeline
      {
        $lookup: {
          from: 'user_activities',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
                createdAt: { 
                  $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) 
                }
              }
            },
            {
              $group: {
                _id: null,
                totalActivities: { $sum: 1 },
                recentActivities: {
                  $sum: {
                    $cond: {
                      if: { 
                        $gte: ['$createdAt', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] 
                      },
                      then: 1,
                      else: 0
                    }
                  }
                },
                weeklyActivities: {
                  $sum: {
                    $cond: {
                      if: { 
                        $gte: ['$createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] 
                      },
                      then: 1,
                      else: 0
                    }
                  }
                },
                activityTypes: { $addToSet: '$activityType' },
                lastActivity: { $max: '$createdAt' },
                avgSessionDuration: { $avg: '$sessionDuration' }
              }
            }
          ],
          as: 'activityStats'
        }
      },
      
      // Stage 4: Lookup order data with aggregated calculations
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
                status: 'completed',
                createdAt: { 
                  $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) 
                }
              }
            },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                lifetimeValue: { $sum: '$totalAmount' },
                avgOrderValue: { $avg: '$totalAmount' },
                lastOrderDate: { $max: '$createdAt' },
                recentOrders: {
                  $sum: {
                    $cond: {
                      if: { 
                        $gte: ['$createdAt', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] 
                      },
                      then: 1,
                      else: 0
                    }
                  }
                },
                recentSpend: {
                  $sum: {
                    $cond: {
                      if: { 
                        $gte: ['$createdAt', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] 
                      },
                      then: '$totalAmount',
                      else: 0
                    }
                  }
                },
                orderDaysOfWeek: { $push: { $dayOfWeek: '$createdAt' } },
                orderHours: { $push: { $hour: '$createdAt' } },
                seasonality: {
                  $push: {
                    $switch: {
                      branches: [
                        { case: { $in: [{ $month: '$createdAt' }, [12, 1, 2]] }, then: 'winter' },
                        { case: { $in: [{ $month: '$createdAt' }, [3, 4, 5]] }, then: 'spring' },
                        { case: { $in: [{ $month: '$createdAt' }, [6, 7, 8]] }, then: 'summer' }
                      ],
                      default: 'fall'
                    }
                  }
                }
              }
            }
          ],
          as: 'orderStats'
        }
      },
      
      // Stage 5: Product preference analysis
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
                status: 'completed'
              }
            },
            {
              $unwind: '$items'
            },
            {
              $lookup: {
                from: 'products',
                localField: 'items.productId',
                foreignField: '_id',
                as: 'product'
              }
            },
            {
              $unwind: '$product'
            },
            {
              $group: {
                _id: '$product.category',
                categoryPurchases: { $sum: 1 },
                categorySpend: { $sum: '$items.totalPrice' },
                avgDaysBetweenPurchases: {
                  $avg: {
                    $divide: [
                      { $subtract: ['$createdAt', { $min: '$createdAt' }] },
                      86400000 // milliseconds to days
                    ]
                  }
                }
              }
            },
            {
              $sort: { categoryPurchases: -1 }
            },
            {
              $limit: 5 // Top 5 categories only
            },
            {
              $group: {
                _id: null,
                topCategories: {
                  $push: {
                    category: '$_id',
                    purchases: '$categoryPurchases',
                    spend: '$categorySpend',
                    avgDaysBetween: '$avgDaysBetweenPurchases'
                  }
                }
              }
            }
          ],
          as: 'productPreferences'
        }
      },
      
      // Stage 6: Flatten and calculate derived metrics
      {
        $addFields: {
          // Extract activity stats
          activityStats: { $arrayElemAt: ['$activityStats', 0] },
          orderStats: { $arrayElemAt: ['$orderStats', 0] },
          productPreferences: { $arrayElemAt: ['$productPreferences', 0] }
        }
      },
      
      // Stage 7: Advanced calculated fields and scoring
      {
        $addFields: {
          // Engagement scoring
          engagementScore: {
            $add: [
              { $multiply: [{ $ifNull: ['$activityStats.weeklyActivities', 0] }, 2] },
              { $multiply: [{ $ifNull: ['$activityStats.recentActivities', 0] }, 1] },
              { $multiply: [{ $ifNull: ['$orderStats.recentOrders', 0] }, 5] }
            ]
          },
          
          // Engagement level classification
          engagementLevel: {
            $switch: {
              branches: [
                {
                  case: { $gt: [{ $ifNull: ['$activityStats.weeklyActivities', 0] }, 10] },
                  then: 'high'
                },
                {
                  case: { $gt: [{ $ifNull: ['$activityStats.recentActivities', 0] }, 5] },
                  then: 'medium'
                }
              ],
              default: 'low'
            }
          },
          
          // Customer lifetime value prediction
          predictedLTV: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gt: [{ $ifNull: ['$orderStats.lifetimeValue', 0] }, 1000] },
                      { $gt: [{ $ifNull: ['$orderStats.recentOrders', 0] }, 2] }
                    ]
                  },
                  then: { $multiply: [{ $ifNull: ['$orderStats.lifetimeValue', 0] }, 1.2] }
                },
                {
                  case: {
                    $and: [
                      { $gt: [{ $ifNull: ['$orderStats.lifetimeValue', 0] }, 500] },
                      { $gt: [{ $ifNull: ['$activityStats.recentActivities', 0] }, 10] }
                    ]
                  },
                  then: { $multiply: [{ $ifNull: ['$orderStats.lifetimeValue', 0] }, 1.1] }
                }
              ],
              default: { $ifNull: ['$orderStats.lifetimeValue', 0] }
            }
          },
          
          // Churn risk assessment
          churnRisk: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $eq: [{ $ifNull: ['$activityStats.recentActivities', 0] }, 0] },
                      {
                        $lt: [
                          { $ifNull: ['$orderStats.lastOrderDate', new Date(0)] },
                          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
                        ]
                      }
                    ]
                  },
                  then: 'high'
                },
                {
                  case: {
                    $and: [
                      { $lt: [{ $ifNull: ['$activityStats.recentActivities', 0] }, 5] },
                      {
                        $lt: [
                          { $ifNull: ['$orderStats.lastOrderDate', new Date(0)] },
                          new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
                        ]
                      }
                    ]
                  },
                  then: 'medium'
                }
              ],
              default: 'low'
            }
          },
          
          // User segmentation
          userSegment: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gt: [{ $ifNull: ['$orderStats.lifetimeValue', 0] }, 1000] },
                      { $eq: ['$engagementLevel', 'high'] }
                    ]
                  },
                  then: 'vip'
                },
                {
                  case: {
                    $or: [
                      { $gt: [{ $ifNull: ['$orderStats.lifetimeValue', 0] }, 500] },
                      { $eq: ['$engagementLevel', 'high'] }
                    ]
                  },
                  then: 'loyal'
                },
                {
                  case: { $gt: [{ $ifNull: ['$orderStats.totalOrders', 0] }, 0] },
                  then: 'customer'
                }
              ],
              default: 'prospect'
            }
          },
          
          // Behavioral patterns
          behaviorPattern: {
            $let: {
              vars: {
                dayOfWeekMode: {
                  $arrayElemAt: [
                    {
                      $map: {
                        input: { $range: [1, 8] },
                        as: 'day',
                        in: {
                          day: '$$day',
                          count: {
                            $size: {
                              $filter: {
                                input: { $ifNull: ['$orderStats.orderDaysOfWeek', []] },
                                cond: { $eq: ['$$this', '$$day'] }
                              }
                            }
                          }
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: {
                preferredOrderDay: '$$dayOfWeekMode.day',
                orderFrequency: {
                  $cond: {
                    if: { $gt: [{ $ifNull: ['$orderStats.totalOrders', 0] }, 1] },
                    then: {
                      $divide: [
                        365,
                        {
                          $divide: [
                            { 
                              $subtract: [
                                { $ifNull: ['$orderStats.lastOrderDate', new Date()] },
                                '$registrationDate'
                              ] 
                            },
                            86400000
                          ]
                        }
                      ]
                    },
                    else: 0
                  }
                }
              }
            }
          }
        }
      },
      
      // Stage 8: Final projection with optimized field selection
      {
        $project: {
          _id: 1,
          email: 1,
          subscriptionTier: 1,
          registrationDate: 1,
          
          // Activity metrics
          totalActivities: { $ifNull: ['$activityStats.totalActivities', 0] },
          recentActivities: { $ifNull: ['$activityStats.recentActivities', 0] },
          weeklyActivities: { $ifNull: ['$activityStats.weeklyActivities', 0] },
          activityTypes: { $ifNull: ['$activityStats.activityTypes', []] },
          lastActivity: '$activityStats.lastActivity',
          avgSessionDuration: { $round: [{ $ifNull: ['$activityStats.avgSessionDuration', 0] }, 2] },
          
          // Order metrics
          totalOrders: { $ifNull: ['$orderStats.totalOrders', 0] },
          lifetimeValue: { $round: [{ $ifNull: ['$orderStats.lifetimeValue', 0] }, 2] },
          avgOrderValue: { $round: [{ $ifNull: ['$orderStats.avgOrderValue', 0] }, 2] },
          lastOrderDate: '$orderStats.lastOrderDate',
          recentOrders: { $ifNull: ['$orderStats.recentOrders', 0] },
          recentSpend: { $round: [{ $ifNull: ['$orderStats.recentSpend', 0] }, 2] },
          
          // Product preferences
          topProductCategories: { 
            $ifNull: ['$productPreferences.topCategories', []] 
          },
          
          // Calculated metrics
          engagementScore: { $round: ['$engagementScore', 0] },
          engagementLevel: 1,
          predictedLTV: { $round: ['$predictedLTV', 2] },
          churnRisk: 1,
          userSegment: 1,
          behaviorPattern: 1,
          
          // Performance indicators
          isHighValue: { $gte: [{ $ifNull: ['$orderStats.lifetimeValue', 0] }, 1000] },
          isRecentlyActive: { 
            $gte: [{ $ifNull: ['$activityStats.recentActivities', 0] }, 5] 
          },
          isAtRisk: { $eq: ['$churnRisk', 'high'] },
          
          // Days since last activity/order
          daysSinceLastActivity: {
            $cond: {
              if: { $ne: ['$activityStats.lastActivity', null] },
              then: {
                $divide: [
                  { $subtract: [new Date(), '$activityStats.lastActivity'] },
                  86400000
                ]
              },
              else: 999
            }
          },
          daysSinceLastOrder: {
            $cond: {
              if: { $ne: ['$orderStats.lastOrderDate', null] },
              then: {
                $divide: [
                  { $subtract: [new Date(), '$orderStats.lastOrderDate'] },
                  86400000
                ]
              },
              else: 999
            }
          }
        }
      },
      
      // Stage 9: Sorting for optimal performance
      {
        $sort: {
          predictedLTV: -1,
          engagementScore: -1,
          lastActivity: -1
        }
      },
      
      // Stage 10: Optional limit for performance
      {
        $limit: 10000
      }
    ];

    // Execute pipeline with performance tracking
    const startTime = Date.now();
    const results = await users.aggregate(pipeline).toArray();
    const executionTime = Date.now() - startTime;
    
    console.log(`Aggregation completed in ${executionTime}ms, ${results.length} results`);
    
    // Track pipeline performance
    this.pipelineStats.set('userAnalytics', {
      executionTime,
      resultCount: results.length,
      pipelineStages: pipeline.length,
      timestamp: new Date()
    });
    
    return results;
  }

  async optimizeProductAnalyticsPipeline() {
    console.log('Running optimized product analytics aggregation pipeline...');
    
    const orders = this.db.collection('orders');
    
    const pipeline = [
      // Stage 1: Filter completed orders from last year
      {
        $match: {
          status: 'completed',
          createdAt: { 
            $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) 
          }
        }
      },
      
      // Stage 2: Unwind order items for product-level analysis
      {
        $unwind: '$items'
      },
      
      // Stage 3: Lookup product details
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      
      // Stage 4: Unwind product array
      {
        $unwind: '$product'
      },
      
      // Stage 5: Add time-based fields for analysis
      {
        $addFields: {
          orderMonth: { $month: '$createdAt' },
          orderDayOfWeek: { $dayOfWeek: '$createdAt' },
          orderHour: { $hour: '$createdAt' },
          season: {
            $switch: {
              branches: [
                { case: { $in: [{ $month: '$createdAt' }, [12, 1, 2]] }, then: 'winter' },
                { case: { $in: [{ $month: '$createdAt' }, [3, 4, 5]] }, then: 'spring' },
                { case: { $in: [{ $month: '$createdAt' }, [6, 7, 8]] }, then: 'summer' }
              ],
              default: 'fall'
            }
          },
          revenue: '$items.totalPrice',
          profit: {
            $subtract: ['$items.totalPrice', { $multiply: ['$items.quantity', '$product.cost'] }]
          },
          profitMargin: {
            $cond: {
              if: { $gt: ['$items.totalPrice', 0] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ['$items.totalPrice', { $multiply: ['$items.quantity', '$product.cost'] }] },
                      '$items.totalPrice'
                    ]
                  },
                  100
                ]
              },
              else: 0
            }
          }
        }
      },
      
      // Stage 6: Group by product for comprehensive analytics
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$product.name' },
          category: { $first: '$product.category' },
          price: { $first: '$product.price' },
          cost: { $first: '$product.cost' },
          
          // Volume metrics
          totalSold: { $sum: '$items.quantity' },
          totalOrders: { $sum: 1 },
          uniqueCustomers: { $addToSet: '$userId' },
          
          // Revenue metrics
          totalRevenue: { $sum: '$revenue' },
          totalProfit: { $sum: '$profit' },
          avgOrderValue: { $avg: '$revenue' },
          avgProfitMargin: { $avg: '$profitMargin' },
          
          // Time-based patterns
          salesByMonth: {
            $push: {
              month: '$orderMonth',
              quantity: '$items.quantity',
              revenue: '$revenue'
            }
          },
          salesByDayOfWeek: {
            $push: {
              dayOfWeek: '$orderDayOfWeek',
              quantity: '$items.quantity'
            }
          },
          salesByHour: {
            $push: {
              hour: '$orderHour',
              quantity: '$items.quantity'
            }
          },
          salesBySeason: {
            $push: {
              season: '$season',
              quantity: '$items.quantity',
              revenue: '$revenue'
            }
          },
          
          // Performance indicators
          firstSale: { $min: '$createdAt' },
          lastSale: { $max: '$createdAt' },
          peakSaleMonth: {
            $max: {
              month: '$orderMonth',
              quantity: '$items.quantity'
            }
          }
        }
      },
      
      // Stage 7: Calculate advanced metrics
      {
        $addFields: {
          uniqueCustomerCount: { $size: '$uniqueCustomers' },
          avgQuantityPerOrder: { $divide: ['$totalSold', '$totalOrders'] },
          revenuePerCustomer: { 
            $divide: ['$totalRevenue', { $size: '$uniqueCustomers' }] 
          },
          daysSinceLastSale: {
            $divide: [
              { $subtract: [new Date(), '$lastSale'] },
              86400000
            ]
          },
          productLifespanDays: {
            $divide: [
              { $subtract: ['$lastSale', '$firstSale'] },
              86400000
            ]
          },
          
          // Monthly sales distribution
          monthlySalesStats: {
            $let: {
              vars: {
                monthlyAgg: {
                  $reduce: {
                    input: { $range: [1, 13] },
                    initialValue: [],
                    in: {
                      $concatArrays: [
                        '$$value',
                        [{
                          month: '$$this',
                          totalQuantity: {
                            $sum: {
                              $map: {
                                input: {
                                  $filter: {
                                    input: '$salesByMonth',
                                    cond: { $eq: ['$$this.month', '$$this'] }
                                  }
                                },
                                in: '$$this.quantity'
                              }
                            }
                          },
                          totalRevenue: {
                            $sum: {
                              $map: {
                                input: {
                                  $filter: {
                                    input: '$salesByMonth',
                                    cond: { $eq: ['$$this.month', '$$this'] }
                                  }
                                },
                                in: '$$this.revenue'
                              }
                            }
                          }
                        }]
                      ]
                    }
                  }
                }
              },
              in: {
                bestMonth: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$$monthlyAgg',
                        cond: {
                          $eq: [
                            '$$this.totalQuantity',
                            { $max: '$$monthlyAgg.totalQuantity' }
                          ]
                        }
                      }
                    },
                    0
                  ]
                },
                monthlyTrend: '$$monthlyAgg'
              }
            }
          }
        }
      },
      
      // Stage 8: Product performance classification
      {
        $addFields: {
          performanceCategory: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gt: ['$totalRevenue', 10000] },
                      { $gt: ['$avgProfitMargin', 20] },
                      { $gt: ['$uniqueCustomerCount', 100] }
                    ]
                  },
                  then: 'star'
                },
                {
                  case: {
                    $and: [
                      { $gt: ['$totalRevenue', 5000] },
                      { $gt: ['$avgProfitMargin', 10] }
                    ]
                  },
                  then: 'strong'
                },
                {
                  case: {
                    $and: [
                      { $gt: ['$totalRevenue', 1000] },
                      { $gt: ['$totalSold', 10] }
                    ]
                  },
                  then: 'moderate'
                },
                {
                  case: { $lt: ['$daysSinceLastSale', 30] },
                  then: 'active'
                }
              ],
              default: 'underperforming'
            }
          },
          
          inventoryStatus: {
            $switch: {
              branches: [
                { case: { $gt: ['$daysSinceLastSale', 90] }, then: 'stale' },
                { case: { $gt: ['$daysSinceLastSale', 30] }, then: 'slow_moving' },
                { case: { $lt: ['$daysSinceLastSale', 7] }, then: 'hot' }
              ],
              default: 'normal'
            }
          },
          
          // Demand predictability
          demandConsistency: {
            $let: {
              vars: {
                monthlyQuantities: '$monthlySalesStats.monthlyTrend.totalQuantity',
                avgMonthly: {
                  $avg: '$monthlySalesStats.monthlyTrend.totalQuantity'
                }
              },
              in: {
                $cond: {
                  if: { $gt: ['$$avgMonthly', 0] },
                  then: {
                    $divide: [
                      {
                        $stdDevPop: '$$monthlyQuantities'
                      },
                      '$$avgMonthly'
                    ]
                  },
                  else: 0
                }
              }
            }
          }
        }
      },
      
      // Stage 9: Final projection
      {
        $project: {
          productId: '$_id',
          productName: 1,
          category: 1,
          price: 1,
          cost: 1,
          
          // Sales metrics
          totalSold: 1,
          totalOrders: 1,
          uniqueCustomerCount: 1,
          avgQuantityPerOrder: { $round: ['$avgQuantityPerOrder', 2] },
          
          // Financial metrics
          totalRevenue: { $round: ['$totalRevenue', 2] },
          totalProfit: { $round: ['$totalProfit', 2] },
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          avgProfitMargin: { $round: ['$avgProfitMargin', 1] },
          revenuePerCustomer: { $round: ['$revenuePerCustomer', 2] },
          
          // Performance classification
          performanceCategory: 1,
          inventoryStatus: 1,
          demandConsistency: { $round: ['$demandConsistency', 3] },
          
          // Time-based insights
          daysSinceLastSale: { $round: ['$daysSinceLastSale', 0] },
          productLifespanDays: { $round: ['$productLifespanDays', 0] },
          bestSellingMonth: '$monthlySalesStats.bestMonth.month',
          bestMonthQuantity: '$monthlySalesStats.bestMonth.totalQuantity',
          bestMonthRevenue: { 
            $round: ['$monthlySalesStats.bestMonth.totalRevenue', 2] 
          },
          
          // Flags for business decisions
          isTopPerformer: { $eq: ['$performanceCategory', 'star'] },
          needsAttention: { $in: ['$performanceCategory', ['underperforming']] },
          isInventoryRisk: { $in: ['$inventoryStatus', ['stale', 'slow_moving']] },
          isHighDemand: { $eq: ['$inventoryStatus', 'hot'] },
          isPredictableDemand: { $lt: ['$demandConsistency', 0.5] }
        }
      },
      
      // Stage 10: Sort by business priority
      {
        $sort: {
          totalRevenue: -1,
          totalProfit: -1,
          uniqueCustomerCount: -1
        }
      }
    ];

    const startTime = Date.now();
    const results = await orders.aggregate(pipeline).toArray();
    const executionTime = Date.now() - startTime;
    
    console.log(`Product analytics completed in ${executionTime}ms, ${results.length} results`);
    
    this.pipelineStats.set('productAnalytics', {
      executionTime,
      resultCount: results.length,
      pipelineStages: pipeline.length,
      timestamp: new Date()
    });
    
    return results;
  }

  async analyzeAggregationPerformance(collection, pipeline, sampleSize = 1000) {
    console.log('Analyzing aggregation performance...');
    
    // Get explain plan for the pipeline
    const explainResult = await collection.aggregate(pipeline, { explain: true }).toArray();
    
    // Run with different hints and options to compare performance
    const performanceTests = [];
    
    // Test 1: Default execution
    const test1Start = Date.now();
    const test1Results = await collection.aggregate(pipeline).limit(sampleSize).toArray();
    const test1Time = Date.now() - test1Start;
    
    performanceTests.push({
      name: 'default',
      executionTime: test1Time,
      resultCount: test1Results.length,
      avgTimePerResult: test1Time / test1Results.length
    });
    
    // Test 2: With allowDiskUse for large datasets
    const test2Start = Date.now();
    const test2Results = await collection.aggregate(pipeline, { 
      allowDiskUse: true 
    }).limit(sampleSize).toArray();
    const test2Time = Date.now() - test2Start;
    
    performanceTests.push({
      name: 'allowDiskUse',
      executionTime: test2Time,
      resultCount: test2Results.length,
      avgTimePerResult: test2Time / test2Results.length
    });
    
    // Test 3: With maxTimeMS limit
    try {
      const test3Start = Date.now();
      const test3Results = await collection.aggregate(pipeline, { 
        maxTimeMS: 30000 
      }).limit(sampleSize).toArray();
      const test3Time = Date.now() - test3Start;
      
      performanceTests.push({
        name: 'maxTimeMS_30s',
        executionTime: test3Time,
        resultCount: test3Results.length,
        avgTimePerResult: test3Time / test3Results.length
      });
    } catch (error) {
      performanceTests.push({
        name: 'maxTimeMS_30s',
        error: error.message,
        executionTime: 30000,
        resultCount: 0
      });
    }
    
    // Analyze pipeline stages
    const stageAnalysis = pipeline.map((stage, index) => {
      const stageType = Object.keys(stage)[0];
      return {
        stage: index + 1,
        type: stageType,
        complexity: this.analyzeStageComplexity(stage),
        indexUtilization: this.analyzeIndexUsage(stage),
        optimizationOpportunities: this.identifyOptimizations(stage)
      };
    });
    
    return {
      explainPlan: explainResult,
      performanceTests: performanceTests,
      stageAnalysis: stageAnalysis,
      recommendations: this.generateOptimizationRecommendations(performanceTests, stageAnalysis)
    };
  }

  analyzeStageComplexity(stage) {
    const stageType = Object.keys(stage)[0];
    const complexityScores = {
      '$match': 1,
      '$project': 2,
      '$addFields': 3,
      '$group': 5,
      '$lookup': 7,
      '$unwind': 3,
      '$sort': 4,
      '$limit': 1,
      '$skip': 1,
      '$facet': 8,
      '$bucket': 6,
      '$sortByCount': 4
    };
    
    return complexityScores[stageType] || 3;
  }

  analyzeIndexUsage(stage) {
    const stageType = Object.keys(stage)[0];
    
    if (stageType === '$match') {
      const matchFields = Object.keys(stage[stageType]);
      return {
        canUseIndex: true,
        indexFields: matchFields,
        recommendation: `Ensure compound index exists for fields: ${matchFields.join(', ')}`
      };
    } else if (stageType === '$sort') {
      const sortFields = Object.keys(stage[stageType]);
      return {
        canUseIndex: true,
        indexFields: sortFields,
        recommendation: `Create index with sort field order: ${sortFields.join(', ')}`
      };
    }
    
    return {
      canUseIndex: false,
      recommendation: 'Stage cannot directly utilize indexes'
    };
  }

  identifyOptimizations(stage) {
    const stageType = Object.keys(stage)[0];
    const optimizations = [];
    
    switch (stageType) {
      case '$match':
        optimizations.push('Place $match stages as early as possible in pipeline');
        optimizations.push('Use indexes for filter conditions');
        break;
      case '$project':
        optimizations.push('Project only necessary fields to reduce document size');
        optimizations.push('Place projection early to reduce pipeline data volume');
        break;
      case '$lookup':
        optimizations.push('Use pipeline in $lookup for better performance');
        optimizations.push('Ensure foreign collection has appropriate indexes');
        optimizations.push('Consider embedding documents instead of lookups if data size permits');
        break;
      case '$group':
        optimizations.push('Group operations may require memory - consider allowDiskUse');
        optimizations.push('Use $bucket or $bucketAuto for large groupings');
        break;
      case '$sort':
        optimizations.push('Use indexes for sorting when possible');
        optimizations.push('Limit sort data with early $match and $limit stages');
        break;
    }
    
    return optimizations;
  }

  generateOptimizationRecommendations(performanceTests, stageAnalysis) {
    const recommendations = [];
    
    // Performance analysis
    const fastest = performanceTests.reduce((prev, current) => 
      prev.executionTime < current.executionTime ? prev : current
    );
    
    if (fastest.name !== 'default') {
      recommendations.push(`Best performance achieved with ${fastest.name} option`);
    }
    
    // High complexity stages
    const highComplexityStages = stageAnalysis.filter(s => s.complexity >= 6);
    if (highComplexityStages.length > 0) {
      recommendations.push(`High complexity stages detected: ${highComplexityStages.map(s => s.type).join(', ')}`);
    }
    
    // Index recommendations
    const indexableStages = stageAnalysis.filter(s => s.indexUtilization.canUseIndex);
    if (indexableStages.length > 0) {
      recommendations.push(`Create indexes for stages: ${indexableStages.map(s => s.type).join(', ')}`);
    }
    
    // General optimization
    const totalComplexity = stageAnalysis.reduce((sum, s) => sum + s.complexity, 0);
    if (totalComplexity > 30) {
      recommendations.push('Consider breaking pipeline into smaller parts');
      recommendations.push('Use $limit early to reduce dataset size');
    }
    
    return recommendations;
  }

  async createOptimalIndexes(collection, aggregationPatterns) {
    console.log('Creating optimal indexes for aggregation patterns...');
    
    const indexRecommendations = [];
    
    for (const pattern of aggregationPatterns) {
      const { pipeline, frequency, avgExecutionTime } = pattern;
      
      // Analyze pipeline for index opportunities
      const matchStages = pipeline.filter(stage => stage.$match);
      const sortStages = pipeline.filter(stage => stage.$sort);
      const lookupStages = pipeline.filter(stage => stage.$lookup);
      
      // Create compound indexes for $match + $sort combinations
      for (const matchStage of matchStages) {
        const matchFields = Object.keys(matchStage.$match);
        
        for (const sortStage of sortStages) {
          const sortFields = Object.keys(sortStage.$sort);
          
          // Combine match and sort fields following ESR rule
          const indexSpec = {};
          
          // Equality fields first
          matchFields.forEach(field => {
            if (typeof matchStage.$match[field] !== 'object') {
              indexSpec[field] = 1;
            }
          });
          
          // Sort fields next
          sortFields.forEach(field => {
            if (!indexSpec[field]) {
              indexSpec[field] = sortStage.$sort[field];
            }
          });
          
          // Range fields last
          matchFields.forEach(field => {
            if (typeof matchStage.$match[field] === 'object' && !indexSpec[field]) {
              indexSpec[field] = 1;
            }
          });
          
          if (Object.keys(indexSpec).length > 1) {
            indexRecommendations.push({
              collection: collection.collectionName,
              indexSpec: indexSpec,
              reason: 'Compound index for $match + $sort optimization',
              frequency: frequency,
              priority: frequency * avgExecutionTime,
              estimatedBenefit: this.estimateIndexBenefit(indexSpec, pattern)
            });
          }
        }
      }
      
      // Create indexes for $lookup foreign collections
      for (const lookupStage of lookupStages) {
        const { from, foreignField } = lookupStage.$lookup;
        
        if (foreignField) {
          indexRecommendations.push({
            collection: from,
            indexSpec: { [foreignField]: 1 },
            reason: 'Index for $lookup foreign field',
            frequency: frequency,
            priority: frequency * avgExecutionTime * 0.8,
            estimatedBenefit: 'High - improves lookup performance significantly'
          });
        }
      }
    }
    
    // Sort by priority and create top indexes
    const topRecommendations = indexRecommendations
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10);
    
    for (const rec of topRecommendations) {
      try {
        const targetCollection = this.db.collection(rec.collection);
        const indexName = `idx_agg_${Object.keys(rec.indexSpec).join('_')}`;
        
        await targetCollection.createIndex(rec.indexSpec, {
          name: indexName,
          background: true
        });
        
        console.log(`Created index ${indexName} on ${rec.collection}`);
        
      } catch (error) {
        console.error(`Failed to create index for ${rec.collection}:`, error.message);
      }
    }
    
    return topRecommendations;
  }

  estimateIndexBenefit(indexSpec, pattern) {
    const fieldCount = Object.keys(indexSpec).length;
    const pipelineComplexity = pattern.pipeline.length;
    
    if (fieldCount >= 3 && pipelineComplexity >= 5) {
      return 'Very High - Complex compound index for multi-stage pipeline';
    } else if (fieldCount >= 2) {
      return 'High - Compound index provides significant benefit';
    } else {
      return 'Medium - Single field index provides moderate benefit';
    }
  }

  async getPipelinePerformanceMetrics() {
    const metrics = {
      totalPipelines: this.pipelineStats.size,
      pipelines: Array.from(this.pipelineStats.entries()).map(([name, stats]) => ({
        name: name,
        executionTime: stats.executionTime,
        resultCount: stats.resultCount,
        stageCount: stats.pipelineStages,
        throughput: Math.round(stats.resultCount / (stats.executionTime / 1000)),
        lastRun: stats.timestamp
      })),
      indexRecommendations: this.indexRecommendations,
      
      // Performance categories
      fastPipelines: Array.from(this.pipelineStats.entries())
        .filter(([_, stats]) => stats.executionTime < 1000),
      slowPipelines: Array.from(this.pipelineStats.entries())
        .filter(([_, stats]) => stats.executionTime > 5000),
        
      // Overall health
      avgExecutionTime: Array.from(this.pipelineStats.values())
        .reduce((sum, stats) => sum + stats.executionTime, 0) / this.pipelineStats.size || 0
    };
    
    return metrics;
  }
}

// Benefits of MongoDB Aggregation Framework:
// - Single-pass processing eliminates multiple query roundtrips
// - Intelligent pipeline optimization with automatic stage reordering
// - Native index utilization throughout the pipeline stages
// - Memory-efficient streaming processing for large datasets
// - Built-in parallelization across shards in distributed deployments
// - Rich expression language for complex transformations and calculations
// - Integration with MongoDB's query optimizer for optimal execution plans
// - Support for complex nested document operations and transformations
// - Automatic spill-to-disk capabilities for memory-intensive operations
// - Native support for advanced analytics patterns and statistical functions

module.exports = {
  MongoAggregationOptimizer
};
```

## Understanding MongoDB Aggregation Performance Architecture

### Advanced Pipeline Optimization Strategies

Implement sophisticated aggregation optimization techniques for maximum performance:

```javascript
// Advanced aggregation optimization patterns
class AggregationPerformanceTuner {
  constructor(db) {
    this.db = db;
    this.performanceProfiles = new Map();
    this.optimizationRules = this.loadOptimizationRules();
  }

  async optimizePipelineOrder(pipeline) {
    console.log('Optimizing pipeline stage order for maximum performance...');
    
    // Analyze current pipeline
    const analysis = this.analyzePipelineStages(pipeline);
    
    // Apply optimization rules
    const optimizedPipeline = this.applyOptimizationRules(pipeline, analysis);
    
    // Estimate performance improvement
    const improvement = this.estimatePerformanceImprovement(pipeline, optimizedPipeline);
    
    return {
      originalPipeline: pipeline,
      optimizedPipeline: optimizedPipeline,
      optimizations: analysis.optimizations,
      estimatedImprovement: improvement
    };
  }

  analyzePipelineStages(pipeline) {
    const analysis = {
      stages: [],
      optimizations: [],
      indexOpportunities: [],
      memoryUsage: 0,
      diskUsage: false
    };
    
    pipeline.forEach((stage, index) => {
      const stageType = Object.keys(stage)[0];
      const stageAnalysis = {
        index: index,
        type: stageType,
        selectivity: this.calculateSelectivity(stage),
        memoryImpact: this.estimateMemoryUsage(stage),
        indexable: this.isIndexable(stage),
        earlyPlacement: this.canPlaceEarly(stage)
      };
      
      analysis.stages.push(stageAnalysis);
      
      // Track memory usage
      analysis.memoryUsage += stageAnalysis.memoryImpact;
      
      // Check for disk usage requirements
      if (stageType === '$group' || stageType === '$sort') {
        analysis.diskUsage = true;
      }
      
      // Identify optimization opportunities
      if (stageAnalysis.earlyPlacement && index > 2) {
        analysis.optimizations.push({
          type: 'move_early',
          stage: stageType,
          currentIndex: index,
          suggestedIndex: 0,
          reason: 'High selectivity stage should be placed early'
        });
      }
      
      if (stageAnalysis.indexable && !this.hasAppropriateIndex(stage)) {
        analysis.indexOpportunities.push({
          stage: stageType,
          indexSpec: this.suggestIndexSpec(stage),
          priority: stageAnalysis.selectivity * 10
        });
      }
    });
    
    return analysis;
  }

  applyOptimizationRules(pipeline, analysis) {
    let optimizedPipeline = [...pipeline];
    
    // Rule 1: Move high-selectivity $match stages to the beginning
    const matchStages = optimizedPipeline
      .map((stage, index) => ({ stage, index }))
      .filter(item => item.stage.$match)
      .sort((a, b) => {
        const selectivityA = this.calculateSelectivity(a.stage);
        const selectivityB = this.calculateSelectivity(b.stage);
        return selectivityA - selectivityB; // Higher selectivity first
      });
    
    // Reorder match stages
    matchStages.forEach((matchItem, newIndex) => {
      if (matchItem.index !== newIndex) {
        const stage = optimizedPipeline.splice(matchItem.index, 1)[0];
        optimizedPipeline.splice(newIndex, 0, stage);
      }
    });
    
    // Rule 2: Place $project stages early to reduce document size
    const projectIndex = optimizedPipeline.findIndex(stage => stage.$project);
    if (projectIndex > 2) {
      const projectStage = optimizedPipeline.splice(projectIndex, 1)[0];
      optimizedPipeline.splice(2, 0, projectStage);
    }
    
    // Rule 3: Move $limit stages as early as possible
    const limitIndex = optimizedPipeline.findIndex(stage => stage.$limit);
    if (limitIndex > -1) {
      const limitStage = optimizedPipeline[limitIndex];
      
      // Find appropriate position after filtering stages
      let insertPosition = 0;
      for (let i = 0; i < optimizedPipeline.length; i++) {
        const stageType = Object.keys(optimizedPipeline[i])[0];
        if (['$match', '$project'].includes(stageType)) {
          insertPosition = i + 1;
        } else {
          break;
        }
      }
      
      if (limitIndex !== insertPosition) {
        optimizedPipeline.splice(limitIndex, 1);
        optimizedPipeline.splice(insertPosition, 0, limitStage);
      }
    }
    
    // Rule 4: Combine adjacent $addFields stages
    optimizedPipeline = this.combineAdjacentAddFields(optimizedPipeline);
    
    // Rule 5: Push $match conditions into $lookup pipelines
    optimizedPipeline = this.optimizeLookupStages(optimizedPipeline);
    
    return optimizedPipeline;
  }

  calculateSelectivity(stage) {
    const stageType = Object.keys(stage)[0];
    
    switch (stageType) {
      case '$match':
        return this.calculateMatchSelectivity(stage.$match);
      case '$limit':
        return 0.1; // Very high selectivity
      case '$project':
        return 0.8; // Reduces document size
      case '$addFields':
        return 1.0; // No selectivity change
      case '$group':
        return 0.3; // Significant reduction typically
      case '$lookup':
        return 1.2; // May increase document size
      case '$unwind':
        return 1.5; // Increases document count
      case '$sort':
        return 1.0; // No selectivity change
      default:
        return 1.0;
    }
  }

  calculateMatchSelectivity(matchCondition) {
    let selectivity = 1.0;
    
    for (const [field, condition] of Object.entries(matchCondition)) {
      if (typeof condition === 'object') {
        // Range or complex conditions
        if (condition.$gte || condition.$lte || condition.$lt || condition.$gt) {
          selectivity *= 0.3; // Range queries are moderately selective
        } else if (condition.$in) {
          selectivity *= Math.min(0.5, condition.$in.length / 10);
        } else if (condition.$ne || condition.$nin) {
          selectivity *= 0.9; // Negative conditions are less selective
        } else if (condition.$exists) {
          selectivity *= condition.$exists ? 0.8 : 0.2;
        }
      } else {
        // Equality condition
        selectivity *= 0.1; // Equality is highly selective
      }
    }
    
    return Math.max(selectivity, 0.01); // Minimum selectivity
  }

  estimateMemoryUsage(stage) {
    const stageType = Object.keys(stage)[0];
    const memoryScores = {
      '$match': 10,
      '$project': 20,
      '$addFields': 30,
      '$group': 500,
      '$lookup': 200,
      '$unwind': 50,
      '$sort': 300,
      '$limit': 5,
      '$skip': 5,
      '$facet': 800,
      '$bucket': 400
    };
    
    return memoryScores[stageType] || 50;
  }

  isIndexable(stage) {
    const stageType = Object.keys(stage)[0];
    return ['$match', '$sort'].includes(stageType);
  }

  canPlaceEarly(stage) {
    const stageType = Object.keys(stage)[0];
    return ['$match', '$limit', '$project'].includes(stageType);
  }

  combineAdjacentAddFields(pipeline) {
    const optimized = [];
    let pendingAddFields = null;
    
    for (const stage of pipeline) {
      const stageType = Object.keys(stage)[0];
      
      if (stageType === '$addFields') {
        if (pendingAddFields) {
          // Merge with previous $addFields
          pendingAddFields.$addFields = {
            ...pendingAddFields.$addFields,
            ...stage.$addFields
          };
        } else {
          pendingAddFields = { ...stage };
        }
      } else {
        // Flush pending $addFields
        if (pendingAddFields) {
          optimized.push(pendingAddFields);
          pendingAddFields = null;
        }
        optimized.push(stage);
      }
    }
    
    // Flush any remaining $addFields
    if (pendingAddFields) {
      optimized.push(pendingAddFields);
    }
    
    return optimized;
  }

  optimizeLookupStages(pipeline) {
    return pipeline.map(stage => {
      if (stage.$lookup && !stage.$lookup.pipeline) {
        // Convert simple lookup to pipeline-based lookup for better performance
        const { from, localField, foreignField, as } = stage.$lookup;
        
        return {
          $lookup: {
            from: from,
            let: { localValue: `$${localField}` },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: [`$${foreignField}`, '$$localValue'] }
                }
              }
            ],
            as: as
          }
        };
      }
      return stage;
    });
  }

  estimatePerformanceImprovement(originalPipeline, optimizedPipeline) {
    const originalScore = this.scorePipeline(originalPipeline);
    const optimizedScore = this.scorePipeline(optimizedPipeline);
    
    const improvement = (optimizedScore - originalScore) / originalScore * 100;
    
    return {
      originalScore: originalScore,
      optimizedScore: optimizedScore,
      improvementPercentage: Math.round(improvement),
      category: improvement > 50 ? 'Significant' :
                improvement > 20 ? 'Moderate' :
                improvement > 5 ? 'Minor' : 'Negligible'
    };
  }

  scorePipeline(pipeline) {
    let score = 100;
    let documentSizeMultiplier = 1;
    
    for (let i = 0; i < pipeline.length; i++) {
      const stage = pipeline[i];
      const stageType = Object.keys(stage)[0];
      
      // Penalties for poor stage ordering
      switch (stageType) {
        case '$match':
          if (i > 2) score -= 20; // Should be early
          break;
        case '$limit':
          if (i > 3) score -= 15; // Should be early
          break;
        case '$project':
          if (i > 1) score -= 10; // Should be early
          break;
        case '$sort':
          if (i === pipeline.length - 1) score += 5; // Good at end
          break;
        case '$group':
          score -= this.estimateMemoryUsage(stage) / 10;
          break;
        case '$lookup':
          score -= 20; // Expensive operation
          if (!stage.$lookup.pipeline) score -= 10; // No pipeline optimization
          break;
      }
      
      // Track document size changes
      const selectivity = this.calculateSelectivity(stage);
      documentSizeMultiplier *= selectivity;
      
      // Penalty for processing large documents through expensive stages
      if (documentSizeMultiplier > 1.5 && ['$group', '$lookup'].includes(stageType)) {
        score -= 25;
      }
    }
    
    return Math.max(score, 10);
  }

  loadOptimizationRules() {
    return [
      {
        name: 'early_filtering',
        description: 'Move high-selectivity $match stages early in pipeline',
        priority: 10
      },
      {
        name: 'index_utilization',
        description: 'Ensure indexable stages can use appropriate indexes',
        priority: 9
      },
      {
        name: 'document_size_reduction',
        description: 'Use $project early to reduce document size',
        priority: 8
      },
      {
        name: 'memory_optimization',
        description: 'Minimize memory usage in aggregation stages',
        priority: 7
      },
      {
        name: 'lookup_optimization',
        description: 'Optimize $lookup operations with pipelines',
        priority: 6
      }
    ];
  }

  async benchmarkPipelineVariations(collection, basePipeline, variations = []) {
    console.log('Benchmarking pipeline variations...');
    
    const results = [];
    const testDataSize = 1000;
    
    // Test base pipeline
    const baseResult = await this.benchmarkSinglePipeline(
      collection, 
      basePipeline, 
      'original', 
      testDataSize
    );
    results.push(baseResult);
    
    // Test optimized version
    const optimizationResult = await this.optimizePipelineOrder(basePipeline);
    const optimizedResult = await this.benchmarkSinglePipeline(
      collection,
      optimizationResult.optimizedPipeline,
      'optimized',
      testDataSize
    );
    results.push(optimizedResult);
    
    // Test custom variations
    for (let i = 0; i < variations.length; i++) {
      const variationResult = await this.benchmarkSinglePipeline(
        collection,
        variations[i].pipeline,
        variations[i].name || `variation_${i + 1}`,
        testDataSize
      );
      results.push(variationResult);
    }
    
    // Analyze results
    const analysis = this.analyzePerformanceResults(results);
    
    return {
      results: results,
      analysis: analysis,
      recommendation: this.generatePerformanceRecommendation(results, analysis)
    };
  }

  async benchmarkSinglePipeline(collection, pipeline, name, limit) {
    const iterations = 3;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      try {
        const results = await collection.aggregate([
          ...pipeline,
          { $limit: limit }
        ]).toArray();
        
        const endTime = Date.now();
        times.push({
          executionTime: endTime - startTime,
          resultCount: results.length,
          success: true
        });
        
      } catch (error) {
        times.push({
          executionTime: null,
          resultCount: 0,
          success: false,
          error: error.message
        });
      }
    }
    
    const successfulRuns = times.filter(t => t.success);
    const avgTime = successfulRuns.length > 0 ? 
      successfulRuns.reduce((sum, t) => sum + t.executionTime, 0) / successfulRuns.length : null;
    
    return {
      name: name,
      pipeline: pipeline,
      iterations: iterations,
      successfulRuns: successfulRuns.length,
      averageTime: avgTime,
      minTime: successfulRuns.length > 0 ? Math.min(...successfulRuns.map(t => t.executionTime)) : null,
      maxTime: successfulRuns.length > 0 ? Math.max(...successfulRuns.map(t => t.executionTime)) : null,
      resultCount: successfulRuns.length > 0 ? successfulRuns[0].resultCount : 0,
      errors: times.filter(t => !t.success).map(t => t.error)
    };
  }

  analyzePerformanceResults(results) {
    const analysis = {
      bestPerforming: null,
      worstPerforming: null,
      performanceGains: [],
      consistencyAnalysis: []
    };
    
    // Find best and worst performing
    const validResults = results.filter(r => r.averageTime !== null);
    if (validResults.length > 0) {
      analysis.bestPerforming = validResults.reduce((best, current) => 
        current.averageTime < best.averageTime ? current : best
      );
      
      analysis.worstPerforming = validResults.reduce((worst, current) => 
        current.averageTime > worst.averageTime ? current : worst
      );
    }
    
    // Calculate performance gains
    const baseline = results.find(r => r.name === 'original');
    if (baseline && baseline.averageTime) {
      results.forEach(result => {
        if (result.name !== 'original' && result.averageTime) {
          const improvementPercent = ((baseline.averageTime - result.averageTime) / baseline.averageTime) * 100;
          analysis.performanceGains.push({
            name: result.name,
            improvementPercent: Math.round(improvementPercent),
            absoluteImprovement: baseline.averageTime - result.averageTime
          });
        }
      });
    }
    
    // Consistency analysis
    results.forEach(result => {
      if (result.minTime && result.maxTime && result.averageTime) {
        const variance = result.maxTime - result.minTime;
        const consistency = variance / result.averageTime;
        
        analysis.consistencyAnalysis.push({
          name: result.name,
          variance: variance,
          consistencyScore: consistency,
          rating: consistency < 0.1 ? 'Excellent' :
                  consistency < 0.3 ? 'Good' :
                  consistency < 0.5 ? 'Fair' : 'Poor'
        });
      }
    });
    
    return analysis;
  }

  generatePerformanceRecommendation(results, analysis) {
    const recommendations = [];
    
    if (analysis.bestPerforming) {
      recommendations.push(`Best performance achieved with: ${analysis.bestPerforming.name} (${analysis.bestPerforming.averageTime}ms average)`);
    }
    
    const significantGains = analysis.performanceGains.filter(g => g.improvementPercent > 20);
    if (significantGains.length > 0) {
      recommendations.push(`Significant performance improvements found: ${significantGains.map(g => `${g.name} (+${g.improvementPercent}%)`).join(', ')}`);
    }
    
    const poorConsistency = analysis.consistencyAnalysis.filter(c => c.rating === 'Poor');
    if (poorConsistency.length > 0) {
      recommendations.push(`Poor consistency detected in: ${poorConsistency.map(c => c.name).join(', ')} - consider allowDiskUse or different approach`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('All pipeline variations perform similarly - current implementation is adequate');
    }
    
    return recommendations;
  }
}
```

## SQL-Style Aggregation Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB aggregation operations:

```sql
-- QueryLeaf aggregation operations with SQL-familiar syntax

-- Complex user analytics with optimized aggregation
WITH user_activity_stats AS (
  SELECT 
    u.user_id,
    u.email,
    u.subscription_tier,
    u.registration_date,
    
    -- Activity metrics using MongoDB aggregation expressions
    COUNT(ua.activity_id) as total_activities,
    COUNT(ua.activity_id) FILTER (WHERE ua.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as recent_activities,
    COUNT(ua.activity_id) FILTER (WHERE ua.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days') as weekly_activities,
    
    -- Engagement scoring with MongoDB operators
    ARRAY_AGG(DISTINCT ua.activity_type) as activity_types,
    MAX(ua.created_at) as last_activity,
    AVG(ua.session_duration) as avg_session_duration,
    
    -- Complex engagement calculation
    (COUNT(ua.activity_id) FILTER (WHERE ua.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days') * 2) +
    (COUNT(ua.activity_id) FILTER (WHERE ua.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') * 1) as engagement_score
    
  FROM users u
  LEFT JOIN user_activities ua ON u.user_id = ua.user_id 
    AND ua.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 year'
  WHERE u.status = 'active'
    AND u.registration_date >= CURRENT_TIMESTAMP - INTERVAL '1 year'
  GROUP BY u.user_id, u.email, u.subscription_tier, u.registration_date
),

order_analytics AS (
  SELECT 
    o.user_id,
    COUNT(*) as total_orders,
    SUM(o.total_amount) as lifetime_value,
    AVG(o.total_amount) as avg_order_value,
    MAX(o.created_at) as last_order_date,
    COUNT(*) FILTER (WHERE o.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as recent_orders,
    SUM(o.total_amount) FILTER (WHERE o.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as recent_spend,
    
    -- Time-based patterns using MongoDB date operators
    MODE() WITHIN GROUP (ORDER BY EXTRACT(DOW FROM o.created_at)) as preferred_order_day,
    ARRAY_AGG(
      CASE 
        WHEN EXTRACT(MONTH FROM o.created_at) IN (12, 1, 2) THEN 'winter'
        WHEN EXTRACT(MONTH FROM o.created_at) IN (3, 4, 5) THEN 'spring'
        WHEN EXTRACT(MONTH FROM o.created_at) IN (6, 7, 8) THEN 'summer'
        ELSE 'fall'
      END
    ) as seasonal_patterns
    
  FROM orders o
  WHERE o.status = 'completed'
    AND o.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 year'
  GROUP BY o.user_id
),

product_preferences AS (
  -- Optimized product affinity analysis
  SELECT 
    o.user_id,
    -- Use MongoDB aggregation for complex transformations
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'category', p.category,
        'purchases', COUNT(*),
        'spend', SUM(oi.quantity * oi.unit_price),
        'avg_days_between', AVG(
          EXTRACT(EPOCH FROM (o.created_at - LAG(o.created_at) OVER (
            PARTITION BY o.user_id, p.category 
            ORDER BY o.created_at
          ))) / 86400
        )
      )
      ORDER BY COUNT(*) DESC
      LIMIT 5
    ) as top_categories
    
  FROM orders o
  JOIN order_items oi ON o.order_id = oi.order_id
  JOIN products p ON oi.product_id = p.product_id
  WHERE o.status = 'completed'
  GROUP BY o.user_id
),

final_user_analytics AS (
  SELECT 
    uas.user_id,
    uas.email,
    uas.subscription_tier,
    uas.registration_date,
    
    -- Activity metrics
    uas.total_activities,
    uas.recent_activities,
    uas.weekly_activities,
    uas.activity_types,
    uas.last_activity,
    ROUND(uas.avg_session_duration::numeric, 2) as avg_session_duration,
    uas.engagement_score,
    
    -- Order metrics
    COALESCE(oa.total_orders, 0) as total_orders,
    COALESCE(oa.lifetime_value, 0) as lifetime_value,
    COALESCE(oa.avg_order_value, 0) as avg_order_value,
    oa.last_order_date,
    COALESCE(oa.recent_orders, 0) as recent_orders,
    COALESCE(oa.recent_spend, 0) as recent_spend,
    
    -- Product preferences
    pp.top_categories,
    
    -- Calculated fields using MongoDB-style conditional logic
    CASE 
      WHEN uas.weekly_activities > 10 THEN 'high'
      WHEN uas.recent_activities > 5 THEN 'medium'
      ELSE 'low'
    END as engagement_level,
    
    -- Predictive LTV using MongoDB conditional expressions
    CASE
      WHEN COALESCE(oa.lifetime_value, 0) > 1000 AND COALESCE(oa.recent_orders, 0) > 2 
        THEN COALESCE(oa.lifetime_value, 0) * 1.2
      WHEN COALESCE(oa.lifetime_value, 0) > 500 AND uas.recent_activities > 10 
        THEN COALESCE(oa.lifetime_value, 0) * 1.1
      ELSE COALESCE(oa.lifetime_value, 0)
    END as predicted_ltv,
    
    -- Churn risk assessment
    CASE
      WHEN uas.recent_activities = 0 AND oa.last_order_date < CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'high'
      WHEN uas.recent_activities < 5 AND oa.last_order_date < CURRENT_TIMESTAMP - INTERVAL '45 days' THEN 'medium'
      ELSE 'low'
    END as churn_risk,
    
    -- User segmentation
    CASE
      WHEN COALESCE(oa.lifetime_value, 0) > 1000 AND uas.engagement_score > 50 THEN 'vip'
      WHEN COALESCE(oa.lifetime_value, 0) > 500 OR uas.engagement_score > 30 THEN 'loyal'
      WHEN COALESCE(oa.total_orders, 0) > 0 THEN 'customer'
      ELSE 'prospect'
    END as user_segment,
    
    -- Behavioral patterns
    oa.preferred_order_day,
    CASE 
      WHEN COALESCE(oa.total_orders, 0) > 1 THEN
        365.0 / GREATEST(
          EXTRACT(EPOCH FROM (oa.last_order_date - uas.registration_date)) / 86400.0,
          1
        )
      ELSE 0
    END as order_frequency,
    
    -- Performance indicators
    COALESCE(oa.lifetime_value, 0) >= 1000 as is_high_value,
    uas.recent_activities >= 5 as is_recently_active,
    CASE
      WHEN uas.recent_activities = 0 AND oa.last_order_date < CURRENT_TIMESTAMP - INTERVAL '90 days' THEN true
      ELSE false
    END as is_at_risk,
    
    -- Time since last activity/order
    CASE 
      WHEN uas.last_activity IS NOT NULL THEN
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - uas.last_activity)) / 86400
      ELSE 999
    END as days_since_last_activity,
    
    CASE 
      WHEN oa.last_order_date IS NOT NULL THEN
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - oa.last_order_date)) / 86400
      ELSE 999
    END as days_since_last_order
    
  FROM user_activity_stats uas
  LEFT JOIN order_analytics oa ON uas.user_id = oa.user_id
  LEFT JOIN product_preferences pp ON uas.user_id = pp.user_id
)

SELECT *
FROM final_user_analytics
ORDER BY predicted_ltv DESC, engagement_score DESC, last_activity DESC
LIMIT 1000;

-- Advanced product performance analytics
WITH product_sales_analysis AS (
  SELECT 
    p.product_id,
    p.name as product_name,
    p.category,
    p.price,
    p.cost,
    
    -- Volume metrics using MongoDB aggregation
    SUM(oi.quantity) as total_sold,
    COUNT(DISTINCT o.order_id) as total_orders,
    COUNT(DISTINCT o.user_id) as unique_customers,
    AVG(oi.quantity) as avg_quantity_per_order,
    
    -- Revenue and profit calculations
    SUM(oi.quantity * oi.unit_price) as total_revenue,
    SUM(oi.quantity * (oi.unit_price - p.cost)) as total_profit,
    AVG(oi.quantity * oi.unit_price) as avg_order_value,
    AVG((oi.unit_price - p.cost) / oi.unit_price * 100) as avg_profit_margin,
    SUM(oi.quantity * oi.unit_price) / COUNT(DISTINCT o.user_id) as revenue_per_customer,
    
    -- Time-based analysis using MongoDB date functions
    MIN(o.created_at) as first_sale,
    MAX(o.created_at) as last_sale,
    EXTRACT(EPOCH FROM (MAX(o.created_at) - MIN(o.created_at))) / 86400 as product_lifespan_days,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MAX(o.created_at))) / 86400 as days_since_last_sale,
    
    -- Monthly sales pattern analysis
    JSON_OBJECT_AGG(
      EXTRACT(MONTH FROM o.created_at),
      JSON_BUILD_OBJECT(
        'quantity', SUM(oi.quantity),
        'revenue', SUM(oi.quantity * oi.unit_price)
      )
    ) as monthly_sales,
    
    -- Day of week patterns
    JSON_OBJECT_AGG(
      EXTRACT(DOW FROM o.created_at),
      SUM(oi.quantity)
    ) as dow_sales_pattern,
    
    -- Seasonal analysis
    JSON_OBJECT_AGG(
      CASE 
        WHEN EXTRACT(MONTH FROM o.created_at) IN (12, 1, 2) THEN 'winter'
        WHEN EXTRACT(MONTH FROM o.created_at) IN (3, 4, 5) THEN 'spring'
        WHEN EXTRACT(MONTH FROM o.created_at) IN (6, 7, 8) THEN 'summer'
        ELSE 'fall'
      END,
      JSON_BUILD_OBJECT(
        'quantity', SUM(oi.quantity),
        'revenue', SUM(oi.quantity * oi.unit_price)
      )
    ) as seasonal_performance
    
  FROM products p
  JOIN order_items oi ON p.product_id = oi.product_id
  JOIN orders o ON oi.order_id = o.order_id
  WHERE o.status = 'completed'
    AND o.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 year'
  GROUP BY p.product_id, p.name, p.category, p.price, p.cost
),

product_performance_classification AS (
  SELECT *,
    -- Performance scoring using MongoDB-style conditional logic
    CASE 
      WHEN total_revenue > 10000 AND avg_profit_margin > 20 AND unique_customers > 100 THEN 'star'
      WHEN total_revenue > 5000 AND avg_profit_margin > 10 THEN 'strong'
      WHEN total_revenue > 1000 AND total_sold > 10 THEN 'moderate'
      WHEN days_since_last_sale < 30 THEN 'active'
      ELSE 'underperforming'
    END as performance_category,
    
    -- Inventory status
    CASE 
      WHEN days_since_last_sale > 90 THEN 'stale'
      WHEN days_since_last_sale > 30 THEN 'slow_moving'
      WHEN days_since_last_sale < 7 THEN 'hot'
      ELSE 'normal'
    END as inventory_status,
    
    -- Demand predictability using MongoDB expressions
    -- Calculate coefficient of variation for monthly sales
    (
      SELECT STDDEV(monthly_quantity) / AVG(monthly_quantity)
      FROM (
        SELECT (monthly_sales->>month_num)::numeric as monthly_quantity
        FROM generate_series(1, 12) as month_num
      ) monthly_data
      WHERE monthly_quantity > 0
    ) as demand_consistency,
    
    -- Best performing periods
    (
      SELECT month_num
      FROM (
        SELECT 
          month_num,
          (monthly_sales->>month_num)::numeric as quantity
        FROM generate_series(1, 12) as month_num
      ) monthly_rank
      ORDER BY quantity DESC NULLS LAST
      LIMIT 1
    ) as best_month,
    
    -- Performance flags
    total_revenue >= 10000 as is_top_performer,
    performance_category = 'underperforming' as needs_attention,
    inventory_status IN ('stale', 'slow_moving') as is_inventory_risk,
    inventory_status = 'hot' as is_high_demand,
    demand_consistency < 0.5 as is_predictable_demand
    
  FROM product_sales_analysis
)

SELECT 
  product_id,
  product_name,
  category,
  price,
  cost,
  
  -- Volume metrics
  total_sold,
  total_orders,
  unique_customers,
  ROUND(avg_quantity_per_order::numeric, 2) as avg_quantity_per_order,
  
  -- Financial metrics
  ROUND(total_revenue::numeric, 2) as total_revenue,
  ROUND(total_profit::numeric, 2) as total_profit,
  ROUND(avg_order_value::numeric, 2) as avg_order_value,
  ROUND(avg_profit_margin::numeric, 1) as avg_profit_margin_pct,
  ROUND(revenue_per_customer::numeric, 2) as revenue_per_customer,
  
  -- Performance classification
  performance_category,
  inventory_status,
  ROUND(demand_consistency::numeric, 3) as demand_consistency,
  
  -- Time-based insights
  ROUND(days_since_last_sale::numeric, 0) as days_since_last_sale,
  ROUND(product_lifespan_days::numeric, 0) as product_lifespan_days,
  best_month,
  
  -- Business flags
  is_top_performer,
  needs_attention,
  is_inventory_risk,
  is_high_demand,
  is_predictable_demand,
  
  -- Additional insights
  monthly_sales,
  seasonal_performance
  
FROM product_performance_classification
ORDER BY total_revenue DESC, total_profit DESC, unique_customers DESC
LIMIT 500;

-- Real-time aggregation with windowed analytics
SELECT 
  user_id,
  activity_type,
  DATE_TRUNC('hour', created_at) as hour_bucket,
  
  -- Window functions with MongoDB-style aggregations
  COUNT(*) as activities_this_hour,
  SUM(session_duration) as total_session_time,
  AVG(session_duration) as avg_session_duration,
  
  -- Moving averages over time windows
  AVG(COUNT(*)) OVER (
    PARTITION BY user_id, activity_type 
    ORDER BY DATE_TRUNC('hour', created_at)
    ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
  ) as avg_activities_24h,
  
  -- Rank activities within user sessions
  DENSE_RANK() OVER (
    PARTITION BY user_id, DATE_TRUNC('day', created_at)
    ORDER BY COUNT(*) DESC
  ) as daily_activity_rank,
  
  -- Calculate cumulative metrics
  SUM(COUNT(*)) OVER (
    PARTITION BY user_id 
    ORDER BY DATE_TRUNC('hour', created_at)
  ) as cumulative_activities,
  
  -- Detect anomalies using MongoDB statistical functions
  COUNT(*) > (
    AVG(COUNT(*)) OVER (
      PARTITION BY user_id, activity_type
      ORDER BY DATE_TRUNC('hour', created_at)
      ROWS BETWEEN 167 PRECEDING AND 1 PRECEDING
    ) + 2 * STDDEV(COUNT(*)) OVER (
      PARTITION BY user_id, activity_type
      ORDER BY DATE_TRUNC('hour', created_at)
      ROWS BETWEEN 167 PRECEDING AND 1 PRECEDING
    )
  ) as is_anomaly,
  
  -- Performance indicators
  CASE
    WHEN COUNT(*) > 100 THEN 'high_activity'
    WHEN COUNT(*) > 50 THEN 'moderate_activity'
    ELSE 'low_activity'
  END as activity_level
  
FROM user_activities
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY user_id, activity_type, DATE_TRUNC('hour', created_at)
ORDER BY user_id, hour_bucket DESC;

-- QueryLeaf provides comprehensive aggregation optimization:
-- 1. SQL-familiar aggregation syntax with MongoDB performance benefits
-- 2. Automatic pipeline optimization and stage reordering
-- 3. Intelligent index utilization for aggregation stages
-- 4. Memory-efficient processing for large dataset analytics
-- 5. Advanced window functions and statistical operations
-- 6. Real-time aggregation with streaming analytics capabilities
-- 7. Integration with MongoDB's native aggregation optimizations
-- 8. Familiar SQL patterns for complex analytical queries
-- 9. Automatic spill-to-disk handling for memory-intensive operations
-- 10. Performance monitoring and optimization recommendations
```

## Best Practices for Aggregation Optimization

### Pipeline Design Strategy

Essential principles for optimal aggregation performance:

1. **Early Filtering**: Place `$match` stages as early as possible to reduce dataset size
2. **Index Utilization**: Design indexes that support aggregation stages effectively
3. **Memory Management**: Monitor memory usage and use `allowDiskUse` when necessary
4. **Stage Ordering**: Follow optimization rules for stage placement and combination
5. **Document Size**: Use `$project` early to reduce document size through the pipeline
6. **Parallelization**: Design pipelines that can leverage MongoDB's parallel processing

### Performance and Scalability

Optimize aggregations for production workloads:

1. **Pipeline Optimization**: Use MongoDB's explain functionality to understand execution plans
2. **Resource Planning**: Plan memory and CPU resources for aggregation processing
3. **Sharding Strategy**: Design aggregations that work efficiently across sharded clusters
4. **Caching Strategy**: Implement appropriate caching for frequently-run aggregations
5. **Monitoring Setup**: Track aggregation performance and resource usage
6. **Testing Strategy**: Benchmark different pipeline approaches with realistic data volumes

## Conclusion

MongoDB's Aggregation Framework provides sophisticated data processing capabilities that eliminate the performance limitations and complexity of traditional SQL analytics approaches. The combination of pipeline-based processing, intelligent optimization, and native index utilization makes building high-performance analytics both powerful and efficient.

Key Aggregation Framework benefits include:

- **Single-Pass Processing**: Eliminates multiple query roundtrips for complex analytics
- **Intelligent Optimization**: Automatic pipeline optimization and stage reordering
- **Native Index Integration**: Comprehensive index utilization throughout pipeline stages
- **Memory-Efficient Processing**: Streaming processing with automatic spill-to-disk capabilities
- **Parallel Execution**: Built-in parallelization across distributed deployments
- **Rich Expression Language**: Comprehensive transformation and analytical capabilities

Whether you're building business intelligence dashboards, real-time analytics platforms, data science workflows, or any application requiring sophisticated data processing, MongoDB's Aggregation Framework with QueryLeaf's familiar SQL interface provides the foundation for high-performance analytics solutions.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB aggregation operations while providing SQL-familiar analytics syntax, pipeline optimization, and performance monitoring. Advanced aggregation patterns, index optimization, and performance tuning are seamlessly handled through familiar SQL constructs, making sophisticated analytics both powerful and accessible to SQL-oriented development teams.

The integration of advanced aggregation capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both complex analytical processing and familiar database interaction patterns, ensuring your analytics solutions remain both performant and maintainable as they scale and evolve.