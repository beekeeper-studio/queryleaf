---
title: "MongoDB Aggregation Pipeline Performance Optimization: Advanced Techniques for High-Performance Data Processing and Analytics"
description: "Master MongoDB aggregation pipeline optimization for maximum performance. Learn advanced pipeline stages, index utilization, memory management, and SQL-familiar aggregation patterns for scalable data processing operations."
date: 2025-09-29
tags: [mongodb, aggregation, pipeline, performance, optimization, analytics, sql, data-processing]
---

# MongoDB Aggregation Pipeline Performance Optimization: Advanced Techniques for High-Performance Data Processing and Analytics

Modern applications increasingly rely on complex data analytics, real-time reporting, and sophisticated data transformations that demand high-performance aggregation capabilities. Poor aggregation pipeline design can lead to slow response times, excessive memory usage, and resource bottlenecks that become critical performance issues as data volumes and analytical complexity grow.

MongoDB's aggregation framework provides powerful capabilities for data processing, analysis, and transformation that can handle complex analytical workloads efficiently when properly optimized. Unlike limited relational database aggregation approaches, MongoDB pipelines support flexible document processing, nested data analysis, and sophisticated transformations that align with modern application requirements while maintaining performance at scale.

## The Traditional Database Aggregation Limitations

Conventional relational database aggregation approaches impose significant constraints for modern analytical workloads:

```sql
-- Traditional PostgreSQL aggregation - rigid structure with performance limitations

-- Basic aggregation with limited optimization potential
WITH customer_metrics AS (
  SELECT 
    u.user_id,
    u.country,
    u.registration_date,
    u.status,
    COUNT(o.order_id) as order_count,
    SUM(o.total_amount) as total_spent,
    AVG(o.total_amount) as avg_order_value,
    MAX(o.created_at) as last_order_date,
    
    -- Limited JSON aggregation capabilities
    COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_orders,
    COUNT(CASE WHEN o.status = 'pending' THEN 1 END) as pending_orders,
    COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelled_orders,
    
    -- Basic window functions
    ROW_NUMBER() OVER (PARTITION BY u.country ORDER BY SUM(o.total_amount) DESC) as country_rank,
    PERCENT_RANK() OVER (ORDER BY SUM(o.total_amount)) as spending_percentile
    
  FROM users u
  LEFT JOIN orders o ON u.user_id = o.user_id
  WHERE u.registration_date >= CURRENT_DATE - INTERVAL '2 years'
    AND u.status = 'active'
  GROUP BY u.user_id, u.country, u.registration_date, u.status
),

product_analysis AS (
  SELECT 
    p.product_id,
    p.category,
    p.brand,
    p.price,
    COUNT(oi.order_item_id) as times_ordered,
    SUM(oi.quantity) as total_quantity_sold,
    SUM(oi.quantity * oi.unit_price) as total_revenue,
    
    -- Limited array and JSON processing
    AVG(CAST(r.rating AS NUMERIC)) as avg_rating,
    COUNT(r.review_id) as review_count,
    
    -- Complex subquery for related data
    (SELECT STRING_AGG(DISTINCT c.name, ', ') 
     FROM categories c 
     JOIN product_categories pc ON c.category_id = pc.category_id 
     WHERE pc.product_id = p.product_id
    ) as category_names,
    
    -- Percentile calculations require window functions
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY oi.unit_price) as price_q1,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY oi.unit_price) as price_median,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY oi.unit_price) as price_q3
    
  FROM products p
  LEFT JOIN order_items oi ON p.product_id = oi.product_id
  LEFT JOIN orders o ON oi.order_id = o.order_id
  LEFT JOIN reviews r ON p.product_id = r.product_id
  WHERE o.status = 'completed'
    AND o.created_at >= CURRENT_DATE - INTERVAL '1 year'
  GROUP BY p.product_id, p.category, p.brand, p.price
),

sales_trends AS (
  SELECT 
    DATE_TRUNC('month', o.created_at) as month,
    u.country,
    p.category,
    COUNT(o.order_id) as orders,
    SUM(o.total_amount) as revenue,
    COUNT(DISTINCT u.user_id) as unique_customers,
    AVG(o.total_amount) as avg_order_value,
    
    -- Complex trend calculations
    LAG(SUM(o.total_amount)) OVER (
      PARTITION BY u.country, p.category 
      ORDER BY DATE_TRUNC('month', o.created_at)
    ) as prev_month_revenue,
    
    -- Percentage change calculation
    CASE 
      WHEN LAG(SUM(o.total_amount)) OVER (
        PARTITION BY u.country, p.category 
        ORDER BY DATE_TRUNC('month', o.created_at)
      ) > 0 THEN
        ROUND(
          (SUM(o.total_amount) - LAG(SUM(o.total_amount)) OVER (
            PARTITION BY u.country, p.category 
            ORDER BY DATE_TRUNC('month', o.created_at)
          )) / LAG(SUM(o.total_amount)) OVER (
            PARTITION BY u.country, p.category 
            ORDER BY DATE_TRUNC('month', o.created_at)
          ) * 100, 2
        )
      ELSE NULL
    END as revenue_growth_pct
    
  FROM orders o
  JOIN users u ON o.user_id = u.user_id
  JOIN order_items oi ON o.order_id = oi.order_id
  JOIN products p ON oi.product_id = p.product_id
  WHERE o.status = 'completed'
    AND o.created_at >= CURRENT_DATE - INTERVAL '18 months'
  GROUP BY DATE_TRUNC('month', o.created_at), u.country, p.category
)

-- Final complex analytical query with multiple CTEs
SELECT 
  cm.country,
  COUNT(DISTINCT cm.user_id) as total_customers,
  SUM(cm.total_spent) as country_revenue,
  AVG(cm.avg_order_value) as country_avg_order_value,
  
  -- Customer segmentation
  COUNT(CASE WHEN cm.total_spent > 1000 THEN 1 END) as high_value_customers,
  COUNT(CASE WHEN cm.total_spent BETWEEN 100 AND 1000 THEN 1 END) as medium_value_customers,
  COUNT(CASE WHEN cm.total_spent < 100 THEN 1 END) as low_value_customers,
  
  -- Activity analysis
  COUNT(CASE WHEN cm.last_order_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as recent_customers,
  COUNT(CASE WHEN cm.last_order_date < CURRENT_DATE - INTERVAL '90 days' THEN 1 END) as inactive_customers,
  
  -- Product performance correlation
  (SELECT AVG(pa.avg_rating) 
   FROM product_analysis pa 
   JOIN order_items oi ON pa.product_id = oi.product_id 
   JOIN orders o ON oi.order_id = o.order_id 
   JOIN users u ON o.user_id = u.user_id 
   WHERE u.country = cm.country) as avg_product_rating,
   
  -- Sales trend analysis
  (SELECT AVG(st.revenue_growth_pct) 
   FROM sales_trends st 
   WHERE st.country = cm.country 
     AND st.month >= CURRENT_DATE - INTERVAL '6 months') as avg_growth_rate,
     
  -- Market share calculation
  ROUND(
    SUM(cm.total_spent) / 
    (SELECT SUM(total_spent) FROM customer_metrics) * 100, 2
  ) as market_share_pct,
  
  -- Customer concentration (top 20% of customers by spending)
  COUNT(CASE WHEN cm.spending_percentile >= 0.8 THEN 1 END) as top_tier_customers,
  
  -- Ranking by country performance
  RANK() OVER (ORDER BY SUM(cm.total_spent) DESC) as country_rank,
  DENSE_RANK() OVER (ORDER BY AVG(cm.avg_order_value) DESC) as aov_rank

FROM customer_metrics cm
GROUP BY cm.country
HAVING COUNT(DISTINCT cm.user_id) >= 100  -- Filter countries with sufficient data
ORDER BY SUM(cm.total_spent) DESC, AVG(cm.avg_order_value) DESC;

-- PostgreSQL aggregation problems:
-- 1. Complex multi-table joins required for nested data analysis
-- 2. Limited support for dynamic grouping and flexible document structures
-- 3. Poor performance with large datasets requiring multiple table scans
-- 4. Inflexible aggregation stages that cannot be easily reordered or optimized
-- 5. Basic JSON aggregation capabilities with limited nested field support
-- 6. Complex window function syntax for trend analysis and rankings
-- 7. Inefficient handling of array fields and multi-value attributes
-- 8. Limited memory management options for large aggregation operations
-- 9. Rigid aggregation pipeline that cannot adapt to varying data patterns
-- 10. Poor integration with modern application data structures

-- Additional performance issues:
-- - Memory exhaustion with large GROUP BY operations
-- - Nested subquery performance degradation
-- - Complex JOIN operations across multiple large tables
-- - Limited parallel processing capabilities for aggregation stages
-- - Inefficient handling of sparse data and optional fields

-- MySQL approach (even more limited)
SELECT 
  u.country,
  COUNT(DISTINCT u.user_id) as customers,
  COUNT(o.order_id) as orders,
  SUM(o.total_amount) as revenue,
  AVG(o.total_amount) as avg_order_value,
  
  -- Basic JSON functions (limited capabilities)
  AVG(CAST(JSON_EXTRACT(u.profile, '$.age') AS SIGNED)) as avg_age,
  COUNT(CASE WHEN JSON_EXTRACT(u.preferences, '$.newsletter') = true THEN 1 END) as newsletter_subscribers
  
FROM users u
LEFT JOIN orders o ON u.user_id = o.user_id
WHERE u.status = 'active'
  AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
GROUP BY u.country
HAVING COUNT(DISTINCT u.user_id) >= 50
ORDER BY SUM(o.total_amount) DESC;

-- MySQL limitations:
-- - Very basic JSON aggregation functions
-- - Limited window function support in older versions
-- - Poor performance with complex aggregations
-- - Basic GROUP BY optimization
-- - Limited support for nested data analysis
-- - Minimal analytical function capabilities
-- - Simple aggregation pipeline with rigid structure
```

MongoDB's aggregation pipeline provides comprehensive, optimized data processing:

```javascript
// MongoDB Advanced Aggregation Pipeline - flexible, powerful, and performance-optimized
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('ecommerce_analytics');

// Advanced MongoDB aggregation pipeline manager
class MongoAggregationOptimizer {
  constructor(db) {
    this.db = db;
    this.collections = {
      users: db.collection('users'),
      orders: db.collection('orders'),
      products: db.collection('products'),
      reviews: db.collection('reviews'),
      analytics: db.collection('analytics')
    };
    this.pipelineCache = new Map();
    this.performanceTargets = {
      maxExecutionTime: 5000, // 5 seconds for complex analytics
      maxMemoryUsage: 100, // 100MB memory limit
      maxStages: 20 // Maximum pipeline stages
    };
  }

  async buildComprehensiveAnalyticsPipeline() {
    console.log('Building comprehensive analytics aggregation pipeline...');
    
    // Advanced customer analytics with optimized pipeline
    const customerAnalyticsPipeline = [
      // Stage 1: Initial match to reduce dataset early
      {
        $match: {
          status: 'active',
          createdAt: { $gte: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) }, // Last 2 years
          totalSpent: { $exists: true }
        }
      },
      
      // Stage 2: Project only required fields to reduce memory usage
      {
        $project: {
          userId: '$_id',
          country: 1,
          status: 1,
          createdAt: 1,
          totalSpent: 1,
          loyaltyTier: 1,
          preferences: 1,
          // Create computed fields early in pipeline
          registrationYear: { $year: '$createdAt' },
          registrationMonth: { $month: '$createdAt' },
          customerAge: {
            $divide: [
              { $subtract: [new Date(), '$createdAt'] },
              365 * 24 * 60 * 60 * 1000 // Convert to years
            ]
          }
        }
      },
      
      // Stage 3: Lookup orders with targeted fields only
      {
        $lookup: {
          from: 'orders',
          localField: 'userId',
          foreignField: 'userId',
          as: 'orders',
          pipeline: [
            {
              $match: {
                status: { $in: ['completed', 'pending', 'cancelled'] },
                createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } // Last year
              }
            },
            {
              $project: {
                orderId: '$_id',
                status: 1,
                totalAmount: 1,
                createdAt: 1,
                items: {
                  $map: {
                    input: '$items',
                    as: 'item',
                    in: {
                      productId: '$$item.productId',
                      quantity: '$$item.quantity',
                      unitPrice: '$$item.unitPrice',
                      category: '$$item.category'
                    }
                  }
                }
              }
            }
          ]
        }
      },
      
      // Stage 4: Add computed fields for customer analysis
      {
        $addFields: {
          // Order statistics
          orderCount: { $size: '$orders' },
          completedOrders: {
            $size: {
              $filter: {
                input: '$orders',
                cond: { $eq: ['$$this.status', 'completed'] }
              }
            }
          },
          pendingOrders: {
            $size: {
              $filter: {
                input: '$orders',
                cond: { $eq: ['$$this.status', 'pending'] }
              }
            }
          },
          cancelledOrders: {
            $size: {
              $filter: {
                input: '$orders',
                cond: { $eq: ['$$this.status', 'cancelled'] }
              }
            }
          },
          
          // Revenue calculations
          totalRevenue: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$orders',
                    cond: { $eq: ['$$this.status', 'completed'] }
                  }
                },
                as: 'order',
                in: '$$order.totalAmount'
              }
            }
          },
          
          // Customer behavior analysis
          avgOrderValue: {
            $cond: {
              if: { $gt: [{ $size: '$orders' }, 0] },
              then: {
                $avg: {
                  $map: {
                    input: {
                      $filter: {
                        input: '$orders',
                        cond: { $eq: ['$$this.status', 'completed'] }
                      }
                    },
                    as: 'order',
                    in: '$$order.totalAmount'
                  }
                }
              },
              else: 0
            }
          },
          
          // Recency analysis
          lastOrderDate: {
            $max: {
              $map: {
                input: '$orders',
                as: 'order',
                in: '$$order.createdAt'
              }
            }
          },
          
          // Product diversity analysis
          uniqueCategories: {
            $size: {
              $setUnion: {
                $reduce: {
                  input: '$orders',
                  initialValue: [],
                  in: {
                    $setUnion: [
                      '$$value',
                      {
                        $map: {
                          input: '$$this.items',
                          as: 'item',
                          in: '$$item.category'
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      
      // Stage 5: Customer segmentation
      {
        $addFields: {
          // Value segmentation
          valueSegment: {
            $switch: {
              branches: [
                {
                  case: { $gte: ['$totalRevenue', 1000] },
                  then: 'high_value'
                },
                {
                  case: { $gte: ['$totalRevenue', 100] },
                  then: 'medium_value'
                }
              ],
              default: 'low_value'
            }
          },
          
          // Activity segmentation
          activitySegment: {
            $switch: {
              branches: [
                {
                  case: {
                    $gte: [
                      '$lastOrderDate',
                      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  then: 'active'
                },
                {
                  case: {
                    $gte: [
                      '$lastOrderDate',
                      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  then: 'recent'
                },
                {
                  case: {
                    $gte: [
                      '$lastOrderDate',
                      new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  then: 'inactive'
                }
              ],
              default: 'dormant'
            }
          },
          
          // Engagement scoring
          engagementScore: {
            $add: [
              // Order frequency component (0-40 points)
              { $multiply: [{ $min: ['$orderCount', 10] }, 4] },
              
              // Revenue component (0-30 points)
              { $multiply: [{ $min: [{ $divide: ['$totalRevenue', 100] }, 10] }, 3] },
              
              // Category diversity component (0-20 points)
              { $multiply: [{ $min: ['$uniqueCategories', 10] }, 2] },
              
              // Recency component (0-10 points)
              {
                $cond: {
                  if: {
                    $gte: [
                      '$lastOrderDate',
                      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  then: 10,
                  else: {
                    $cond: {
                      if: {
                        $gte: [
                          '$lastOrderDate',
                          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
                        ]
                      },
                      then: 5,
                      else: 0
                    }
                  }
                }
              }
            ]
          }
        }
      },
      
      // Stage 6: Group by country and segments for analysis
      {
        $group: {
          _id: {
            country: '$country',
            valueSegment: '$valueSegment',
            activitySegment: '$activitySegment'
          },
          
          // Customer counts
          customerCount: { $sum: 1 },
          
          // Revenue metrics
          totalRevenue: { $sum: '$totalRevenue' },
          avgRevenue: { $avg: '$totalRevenue' },
          maxRevenue: { $max: '$totalRevenue' },
          minRevenue: { $min: '$totalRevenue' },
          
          // Order metrics
          totalOrders: { $sum: '$orderCount' },
          avgOrdersPerCustomer: { $avg: '$orderCount' },
          totalCompletedOrders: { $sum: '$completedOrders' },
          
          // Behavioral metrics
          avgOrderValue: { $avg: '$avgOrderValue' },
          avgEngagementScore: { $avg: '$engagementScore' },
          avgCategoryDiversity: { $avg: '$uniqueCategories' },
          
          // Customer lifecycle metrics
          avgCustomerAge: { $avg: '$customerAge' },
          
          // Statistical measures
          revenueStdDev: { $stdDevPop: '$totalRevenue' },
          engagementStdDev: { $stdDevPop: '$engagementScore' },
          
          // Percentile calculations using $bucketAuto approach
          customers: {
            $push: {
              userId: '$userId',
              totalRevenue: '$totalRevenue',
              engagementScore: '$engagementScore',
              orderCount: '$orderCount'
            }
          }
        }
      },
      
      // Stage 7: Calculate percentiles and advanced metrics
      {
        $addFields: {
          // Revenue percentiles
          revenuePercentiles: {
            $let: {
              vars: {
                sortedRevenues: {
                  $map: {
                    input: {
                      $sortArray: {
                        input: '$customers.totalRevenue',
                        sortBy: 1
                      }
                    },
                    as: 'rev',
                    in: '$$rev'
                  }
                }
              },
              in: {
                p25: {
                  $arrayElemAt: [
                    '$$sortedRevenues',
                    { $floor: { $multiply: [{ $size: '$$sortedRevenues' }, 0.25] } }
                  ]
                },
                p50: {
                  $arrayElemAt: [
                    '$$sortedRevenues',
                    { $floor: { $multiply: [{ $size: '$$sortedRevenues' }, 0.5] } }
                  ]
                },
                p75: {
                  $arrayElemAt: [
                    '$$sortedRevenues',
                    { $floor: { $multiply: [{ $size: '$$sortedRevenues' }, 0.75] } }
                  ]
                },
                p90: {
                  $arrayElemAt: [
                    '$$sortedRevenues',
                    { $floor: { $multiply: [{ $size: '$$sortedRevenues' }, 0.9] } }
                  ]
                }
              }
            }
          },
          
          // Customer concentration metrics
          topCustomerRevenue: {
            $sum: {
              $slice: [
                {
                  $sortArray: {
                    input: '$customers.totalRevenue',
                    sortBy: -1
                  }
                },
                { $min: [{ $ceil: { $multiply: ['$customerCount', 0.2] } }, 10] }
              ]
            }
          }
        }
      },
      
      // Stage 8: Add market analysis
      {
        $addFields: {
          // Customer concentration (top 20% revenue share)
          customerConcentration: {
            $divide: ['$topCustomerRevenue', '$totalRevenue']
          },
          
          // Segment performance indicators
          performanceIndicators: {
            revenuePerCustomer: { $divide: ['$totalRevenue', '$customerCount'] },
            ordersPerCustomer: { $divide: ['$totalOrders', '$customerCount'] },
            completionRate: {
              $cond: {
                if: { $gt: ['$totalOrders', 0] },
                then: { $divide: ['$totalCompletedOrders', '$totalOrders'] },
                else: 0
              }
            }
          },
          
          // Growth potential scoring
          growthPotential: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $eq: ['$_id.valueSegment', 'high_value'] },
                      { $eq: ['$_id.activitySegment', 'active'] }
                    ]
                  },
                  then: 'maintain'
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$_id.valueSegment', 'high_value'] },
                      { $ne: ['$_id.activitySegment', 'active'] }
                    ]
                  },
                  then: 'reactivate'
                },
                {
                  case: {
                    $and: [
                      { $ne: ['$_id.valueSegment', 'low_value'] },
                      { $eq: ['$_id.activitySegment', 'active'] }
                    ]
                  },
                  then: 'upsell'
                },
                {
                  case: { $eq: ['$_id.activitySegment', 'dormant'] },
                  then: 'winback'
                }
              ],
              default: 'nurture'
            }
          }
        }
      },
      
      // Stage 9: Remove detailed customer data to reduce output size
      {
        $project: {
          customers: 0 // Remove large array to optimize output
        }
      },
      
      // Stage 10: Sort by strategic importance
      {
        $sort: {
          totalRevenue: -1,
          customerCount: -1,
          '_id.country': 1
        }
      },
      
      // Stage 11: Add final computed fields for presentation
      {
        $addFields: {
          segmentId: {
            $concat: [
              '$_id.country',
              '_',
              '$_id.valueSegment',
              '_',
              '$_id.activitySegment'
            ]
          },
          
          // Strategic priority scoring
          strategicPriority: {
            $add: [
              // Revenue weight (40%)
              { $multiply: [{ $divide: ['$totalRevenue', 10000] }, 0.4] },
              
              // Customer count weight (30%)
              { $multiply: [{ $divide: ['$customerCount', 100] }, 0.3] },
              
              // Engagement weight (20%)
              { $multiply: [{ $divide: ['$avgEngagementScore', 100] }, 0.2] },
              
              // Growth potential weight (10%)
              {
                $switch: {
                  branches: [
                    { case: { $eq: ['$growthPotential', 'upsell'] }, then: 0.1 },
                    { case: { $eq: ['$growthPotential', 'reactivate'] }, then: 0.08 },
                    { case: { $eq: ['$growthPotential', 'maintain'] }, then: 0.06 },
                    { case: { $eq: ['$growthPotential', 'nurture'] }, then: 0.04 }
                  ],
                  default: 0.02
                }
              }
            ]
          }
        }
      }
    ];

    console.log('Executing comprehensive customer analytics pipeline...');
    const startTime = Date.now();
    
    try {
      const results = await this.collections.users.aggregate(
        customerAnalyticsPipeline,
        {
          allowDiskUse: true, // Enable disk usage for large datasets
          maxTimeMS: this.performanceTargets.maxExecutionTime,
          hint: { status: 1, createdAt: 1, totalSpent: 1 }, // Suggest optimal index
          cursor: { batchSize: 1000 } // Optimize cursor batch size
        }
      ).toArray();
      
      const executionTime = Date.now() - startTime;
      
      console.log(`Pipeline executed successfully in ${executionTime}ms`);
      console.log(`Processed ${results.length} customer segments`);
      
      // Cache results for performance optimization
      this.pipelineCache.set('customer_analytics', {
        results,
        timestamp: new Date(),
        executionTime
      });
      
      return {
        results,
        executionStats: {
          executionTime,
          segmentsAnalyzed: results.length,
          performanceGrade: this.calculatePerformanceGrade(executionTime)
        }
      };
      
    } catch (error) {
      console.error('Pipeline execution failed:', error);
      throw error;
    }
  }

  async buildProductPerformanceAnalytics() {
    console.log('Building product performance analytics pipeline...');
    
    const productAnalyticsPipeline = [
      // Stage 1: Match active products with recent sales
      {
        $match: {
          status: 'active',
          createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
        }
      },
      
      // Stage 2: Lookup orders and reviews with sub-pipeline optimization
      {
        $lookup: {
          from: 'orders',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$$productId', '$items.productId'] },
                    { $eq: ['$status', 'completed'] },
                    { $gte: ['$createdAt', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)] }
                  ]
                }
              }
            },
            {
              $unwind: '$items'
            },
            {
              $match: {
                $expr: { $eq: ['$items.productId', '$$productId'] }
              }
            },
            {
              $project: {
                orderId: '$_id',
                userId: 1,
                createdAt: 1,
                quantity: '$items.quantity',
                unitPrice: '$items.unitPrice',
                revenue: { $multiply: ['$items.quantity', '$items.unitPrice'] }
              }
            }
          ],
          as: 'sales'
        }
      },
      
      // Stage 3: Lookup reviews with aggregation
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'productId',
          pipeline: [
            {
              $match: {
                status: 'published',
                rating: { $gte: 1, $lte: 5 }
              }
            },
            {
              $group: {
                _id: null,
                avgRating: { $avg: '$rating' },
                reviewCount: { $sum: 1 },
                ratingDistribution: {
                  $push: {
                    rating: '$rating',
                    helpful: '$helpfulVotes',
                    sentiment: '$sentiment'
                  }
                }
              }
            }
          ],
          as: 'reviewMetrics'
        }
      },
      
      // Stage 4: Calculate comprehensive product metrics
      {
        $addFields: {
          // Sales performance
          totalSales: { $size: '$sales' },
          totalRevenue: { $sum: '$sales.revenue' },
          totalQuantitySold: { $sum: '$sales.quantity' },
          avgOrderQuantity: { $avg: '$sales.quantity' },
          avgUnitPrice: { $avg: '$sales.unitPrice' },
          
          // Customer metrics
          uniqueCustomers: {
            $size: {
              $setUnion: {
                $map: {
                  input: '$sales',
                  as: 'sale',
                  in: '$$sale.userId'
                }
              }
            }
          },
          
          // Temporal analysis
          salesByMonth: {
            $reduce: {
              input: {
                $map: {
                  input: '$sales',
                  as: 'sale',
                  in: {
                    month: { $dateToString: { format: '%Y-%m', date: '$$sale.createdAt' } },
                    revenue: '$$sale.revenue',
                    quantity: '$$sale.quantity'
                  }
                }
              },
              initialValue: {},
              in: {
                $mergeObjects: [
                  '$$value',
                  {
                    $arrayToObject: [
                      [{
                        k: '$$this.month',
                        v: {
                          revenue: { $add: [{ $ifNull: [{ $getField: { field: '$$this.month', input: '$$value' } }.revenue, 0] }, '$$this.revenue'] },
                          quantity: { $add: [{ $ifNull: [{ $getField: { field: '$$this.month', input: '$$value' } }.quantity, 0] }, '$$this.quantity'] },
                          orders: { $add: [{ $ifNull: [{ $getField: { field: '$$this.month', input: '$$value' } }.orders, 0] }, 1] }
                        }
                      }]
                    ]
                  }
                ]
              }
            }
          },
          
          // Review metrics
          avgRating: { $arrayElemAt: ['$reviewMetrics.avgRating', 0] },
          reviewCount: { $arrayElemAt: ['$reviewMetrics.reviewCount', 0] },
          
          // Performance indicators
          salesVelocity: {
            $cond: {
              if: { $gt: [{ $size: '$sales' }, 0] },
              then: {
                $divide: [
                  { $size: '$sales' },
                  {
                    $divide: [
                      {
                        $subtract: [
                          new Date(),
                          { $min: '$sales.createdAt' }
                        ]
                      },
                      30 * 24 * 60 * 60 * 1000 // 30-day periods
                    ]
                  }
                ]
              },
              else: 0
            }
          }
        }
      },
      
      // Stage 5: Product classification and scoring
      {
        $addFields: {
          // Performance classification
          performanceClass: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ['$totalRevenue', 10000] },
                      { $gte: ['$uniqueCustomers', 100] },
                      { $gte: [{ $ifNull: ['$avgRating', 0] }, 4.0] }
                    ]
                  },
                  then: 'star'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$totalRevenue', 5000] },
                      { $gte: ['$uniqueCustomers', 50] },
                      { $gte: [{ $ifNull: ['$avgRating', 0] }, 3.5] }
                    ]
                  },
                  then: 'strong'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$totalRevenue', 1000] },
                      { $gte: ['$uniqueCustomers', 20] }
                    ]
                  },
                  then: 'growing'
                },
                {
                  case: { $lte: ['$totalSales', 5] },
                  then: 'new'
                }
              ],
              default: 'underperforming'
            }
          },
          
          // Profitability scoring (simplified model)
          profitabilityScore: {
            $multiply: [
              // Revenue factor (40%)
              { $multiply: [{ $divide: ['$totalRevenue', 1000] }, 0.4] },
              
              // Customer satisfaction factor (30%)
              { $multiply: [{ $divide: [{ $ifNull: ['$avgRating', 3] }, 5] }, 0.3] },
              
              // Market penetration factor (20%)
              { $multiply: [{ $divide: ['$uniqueCustomers', 100] }, 0.2] },
              
              // Sales velocity factor (10%)
              { $multiply: [{ $min: ['$salesVelocity', 10] }, 0.01] }
            ]
          },
          
          // Inventory turnover estimation
          inventoryTurnover: {
            $cond: {
              if: { $and: [{ $gt: ['$stock', 0] }, { $gt: ['$totalQuantitySold', 0] }] },
              then: { $divide: ['$totalQuantitySold', '$stock'] },
              else: 0
            }
          }
        }
      },
      
      // Stage 6: Group by category for market analysis
      {
        $group: {
          _id: {
            category: '$category',
            brand: '$brand',
            performanceClass: '$performanceClass'
          },
          
          productCount: { $sum: 1 },
          
          // Revenue aggregations
          totalCategoryRevenue: { $sum: '$totalRevenue' },
          avgProductRevenue: { $avg: '$totalRevenue' },
          maxProductRevenue: { $max: '$totalRevenue' },
          
          // Customer aggregations
          totalUniqueCustomers: { $sum: '$uniqueCustomers' },
          avgCustomersPerProduct: { $avg: '$uniqueCustomers' },
          
          // Rating aggregations
          avgCategoryRating: { $avg: { $ifNull: ['$avgRating', 0] } },
          avgReviewCount: { $avg: { $ifNull: ['$reviewCount', 0] } },
          
          // Performance aggregations
          avgProfitabilityScore: { $avg: '$profitabilityScore' },
          avgSalesVelocity: { $avg: '$salesVelocity' },
          avgInventoryTurnover: { $avg: '$inventoryTurnover' },
          
          // Product examples for reference
          topProducts: {
            $push: {
              $cond: {
                if: { $gte: ['$profitabilityScore', 5] },
                then: {
                  productId: '$_id',
                  name: '$name',
                  revenue: '$totalRevenue',
                  rating: '$avgRating',
                  profitabilityScore: '$profitabilityScore'
                },
                else: '$$REMOVE'
              }
            }
          }
        }
      },
      
      // Stage 7: Calculate category market share
      {
        $addFields: {
          topProducts: { $slice: [{ $sortArray: { input: '$topProducts', sortBy: { profitabilityScore: -1 } } }, 3] }
        }
      },
      
      // Stage 8: Add competitive analysis
      {
        $lookup: {
          from: 'products',
          let: { currentCategory: '$_id.category' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$category', '$$currentCategory'] },
                status: 'active'
              }
            },
            {
              $group: {
                _id: null,
                totalCategoryProducts: { $sum: 1 },
                avgCategoryPrice: { $avg: '$price' },
                categoryPriceRange: {
                  min: { $min: '$price' },
                  max: { $max: '$price' }
                }
              }
            }
          ],
          as: 'categoryContext'
        }
      },
      
      // Stage 9: Final metrics and insights
      {
        $addFields: {
          // Market share within category
          categoryMarketShare: {
            $divide: [
              '$productCount',
              { $arrayElemAt: ['$categoryContext.totalCategoryProducts', 0] }
            ]
          },
          
          // Performance vs category average
          performanceVsCategory: {
            $divide: [
              '$avgProductRevenue',
              { $arrayElemAt: ['$categoryContext.avgCategoryPrice', 0] }
            ]
          },
          
          // Strategic recommendations
          strategicRecommendation: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $eq: ['$_id.performanceClass', 'star'] },
                      { $gte: ['$avgInventoryTurnover', 4] }
                    ]
                  },
                  then: 'expand_and_invest'
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$_id.performanceClass', 'strong'] },
                      { $gte: ['$categoryMarketShare', 0.1] }
                    ]
                  },
                  then: 'market_leader_strategy'
                },
                {
                  case: { $eq: ['$_id.performanceClass', 'growing'] },
                  then: 'nurture_and_optimize'
                },
                {
                  case: { $eq: ['$_id.performanceClass', 'underperforming'] },
                  then: 'review_and_improve'
                }
              ],
              default: 'monitor'
            }
          }
        }
      },
      
      // Stage 10: Clean up and sort
      {
        $project: {
          categoryContext: 0 // Remove lookup data to reduce output size
        }
      },
      
      {
        $sort: {
          totalCategoryRevenue: -1,
          avgProfitabilityScore: -1,
          '_id.category': 1
        }
      }
    ];

    console.log('Executing product performance analytics pipeline...');
    const startTime = Date.now();
    
    try {
      const results = await this.collections.products.aggregate(
        productAnalyticsPipeline,
        {
          allowDiskUse: true,
          maxTimeMS: this.performanceTargets.maxExecutionTime,
          cursor: { batchSize: 500 }
        }
      ).toArray();
      
      const executionTime = Date.now() - startTime;
      
      console.log(`Product analytics pipeline executed in ${executionTime}ms`);
      console.log(`Analyzed ${results.length} product categories`);
      
      return {
        results,
        executionStats: {
          executionTime,
          categoriesAnalyzed: results.length,
          performanceGrade: this.calculatePerformanceGrade(executionTime)
        }
      };
      
    } catch (error) {
      console.error('Product analytics pipeline failed:', error);
      throw error;
    }
  }

  async buildTimeSeriesAnalytics() {
    console.log('Building time-series analytics pipeline...');
    
    const timeSeriesPipeline = [
      // Stage 1: Match recent orders for trend analysis
      {
        $match: {
          status: 'completed',
          createdAt: {
            $gte: new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000) // 18 months
          }
        }
      },
      
      // Stage 2: Create time buckets and extract relevant fields
      {
        $addFields: {
          // Multiple time granularities
          yearMonth: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          quarter: { $ceil: { $divide: [{ $month: '$createdAt' }, 3] } },
          weekOfYear: { $week: '$createdAt' },
          dayOfWeek: { $dayOfWeek: '$createdAt' },
          hourOfDay: { $hour: '$createdAt' },
          
          // Business metrics
          itemCount: { $size: '$items' },
          avgItemPrice: { $avg: '$items.unitPrice' }
        }
      },
      
      // Stage 3: Unwind items for product-level analysis
      {
        $unwind: '$items'
      },
      
      // Stage 4: Group by time periods with comprehensive metrics
      {
        $group: {
          _id: {
            yearMonth: '$yearMonth',
            year: '$year',
            month: '$month',
            quarter: '$quarter',
            category: '$items.category',
            userCountry: '$userCountry'
          },
          
          // Volume metrics
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
          totalQuantity: { $sum: '$items.quantity' },
          uniqueCustomers: { $addToSet: '$userId' },
          uniqueProducts: { $addToSet: '$items.productId' },
          
          // Average metrics
          avgOrderValue: { $avg: '$totalAmount' },
          avgQuantityPerOrder: { $avg: '$items.quantity' },
          avgUnitPrice: { $avg: '$items.unitPrice' },
          
          // Distribution metrics
          orderSizes: { $push: '$totalAmount' },
          customerFrequency: { $push: '$userId' },
          
          // Time-based patterns
          hourDistribution: {
            $push: {
              hour: '$hourOfDay',
              dayOfWeek: '$dayOfWeek',
              amount: '$totalAmount'
            }
          },
          
          // Product performance
          productMix: {
            $push: {
              productId: '$items.productId',
              category: '$items.category',
              quantity: '$items.quantity',
              revenue: { $multiply: ['$items.quantity', '$items.unitPrice'] }
            }
          }
        }
      },
      
      // Stage 5: Calculate advanced time-series metrics
      {
        $addFields: {
          uniqueCustomerCount: { $size: '$uniqueCustomers' },
          uniqueProductCount: { $size: '$uniqueProducts' },
          
          // Customer behavior metrics
          repeatCustomerRate: {
            $divide: [
              {
                $size: {
                  $filter: {
                    input: {
                      $reduce: {
                        input: '$customerFrequency',
                        initialValue: {},
                        in: {
                          $mergeObjects: [
                            '$$value',
                            {
                              $arrayToObject: [
                                [{
                                  k: { $toString: '$$this' },
                                  v: { $add: [{ $ifNull: [{ $getField: { field: { $toString: '$$this' }, input: '$$value' } }, 0] }, 1] }
                                }]
                              ]
                            }
                          ]
                        }
                      }
                    },
                    cond: { $gt: ['$$this.v', 1] }
                  }
                }
              },
              '$uniqueCustomerCount'
            ]
          },
          
          // Revenue concentration (top 20% of orders)
          revenueConcentration: {
            $let: {
              vars: {
                sortedOrders: { $sortArray: { input: '$orderSizes', sortBy: -1 } },
                top20PercentCount: { $ceil: { $multiply: ['$orderCount', 0.2] } }
              },
              in: {
                $divide: [
                  { $sum: { $slice: ['$$sortedOrders', '$$top20PercentCount'] } },
                  '$totalRevenue'
                ]
              }
            }
          },
          
          // Peak hour analysis
          peakHours: {
            $let: {
              vars: {
                hourlyTotals: {
                  $reduce: {
                    input: '$hourDistribution',
                    initialValue: {},
                    in: {
                      $mergeObjects: [
                        '$$value',
                        {
                          $arrayToObject: [
                            [{
                              k: { $toString: '$$this.hour' },
                              v: {
                                orders: { $add: [{ $ifNull: [{ $getField: { field: { $toString: '$$this.hour' }, input: '$$value' } }.orders, 0] }, 1] },
                                revenue: { $add: [{ $ifNull: [{ $getField: { field: { $toString: '$$this.hour' }, input: '$$value' } }.revenue, 0] }, '$$this.amount'] }
                              }
                            }]
                          ]
                        }
                      ]
                    }
                  }
                }
              },
              in: {
                $arrayElemAt: [
                  {
                    $sortArray: {
                      input: {
                        $objectToArray: '$$hourlyTotals'
                      },
                      sortBy: { 'v.revenue': -1 }
                    }
                  },
                  0
                ]
              }
            }
          }
        }
      },
      
      // Stage 6: Sort for time-series analysis
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.category': 1,
          '_id.userCountry': 1
        }
      },
      
      // Stage 7: Window functions for trend analysis
      {
        $setWindowFields: {
          partitionBy: { category: '$_id.category', country: '$_id.userCountry' },
          sortBy: { '_id.year': 1, '_id.month': 1 },
          output: {
            // Moving averages
            movingAvgRevenue: {
              $avg: '$totalRevenue',
              window: { range: [-2, 0], unit: 'position' } // 3-month moving average
            },
            
            movingAvgOrders: {
              $avg: '$orderCount',
              window: { range: [-2, 0], unit: 'position' }
            },
            
            // Growth calculations
            prevMonthRevenue: {
              $shift: { output: '$totalRevenue', by: -1 }
            },
            
            prevYearRevenue: {
              $shift: { output: '$totalRevenue', by: -12 }
            },
            
            // Ranking
            revenueRank: {
              $denseRank: {}
            },
            
            // Cumulative metrics
            cumulativeRevenue: {
              $sum: '$totalRevenue',
              window: { range: ['unbounded', 0], unit: 'position' }
            }
          }
        }
      },
      
      // Stage 8: Calculate growth rates and trends
      {
        $addFields: {
          // Month-over-month growth
          momGrowthRate: {
            $cond: {
              if: { $and: [{ $ne: ['$prevMonthRevenue', null] }, { $gt: ['$prevMonthRevenue', 0] }] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ['$totalRevenue', '$prevMonthRevenue'] },
                      '$prevMonthRevenue'
                    ]
                  },
                  100
                ]
              },
              else: null
            }
          },
          
          // Year-over-year growth
          yoyGrowthRate: {
            $cond: {
              if: { $and: [{ $ne: ['$prevYearRevenue', null] }, { $gt: ['$prevYearRevenue', 0] }] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ['$totalRevenue', '$prevYearRevenue'] },
                      '$prevYearRevenue'
                    ]
                  },
                  100
                ]
              },
              else: null
            }
          },
          
          // Trend classification
          trendClassification: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: [{ $ifNull: ['$momGrowthRate', 0] }, 10] },
                      { $gte: ['$totalRevenue', '$movingAvgRevenue'] }
                    ]
                  },
                  then: 'strong_growth'
                },
                {
                  case: {
                    $and: [
                      { $gte: [{ $ifNull: ['$momGrowthRate', 0] }, 0] },
                      { $lte: [{ $ifNull: ['$momGrowthRate', 0] }, 10] }
                    ]
                  },
                  then: 'steady_growth'
                },
                {
                  case: { $lt: [{ $ifNull: ['$momGrowthRate', 0] }, -10] },
                  then: 'declining'
                }
              ],
              default: 'stable'
            }
          },
          
          // Seasonality indicators
          seasonalityScore: {
            $cond: {
              if: { $in: ['$_id.month', [11, 12, 1]] }, // Holiday season
              then: 1.2,
              else: {
                $cond: {
                  if: { $in: ['$_id.month', [6, 7, 8]] }, // Summer
                  then: 0.9,
                  else: 1.0
                }
              }
            }
          }
        }
      },
      
      // Stage 9: Final grouping for summary insights
      {
        $group: {
          _id: {
            category: '$_id.category',
            country: '$_id.userCountry'
          },
          
          // Time series data points
          monthlyData: {
            $push: {
              yearMonth: '$_id.yearMonth',
              revenue: '$totalRevenue',
              orders: '$orderCount',
              customers: '$uniqueCustomerCount',
              avgOrderValue: '$avgOrderValue',
              momGrowth: '$momGrowthRate',
              yoyGrowth: '$yoyGrowthRate',
              trend: '$trendClassification'
            }
          },
          
          // Summary statistics
          totalPeriodRevenue: { $sum: '$totalRevenue' },
          totalPeriodOrders: { $sum: '$orderCount' },
          avgMonthlyRevenue: { $avg: '$totalRevenue' },
          
          // Growth metrics
          avgMomGrowth: { $avg: { $ifNull: ['$momGrowthRate', 0] } },
          avgYoyGrowth: { $avg: { $ifNull: ['$yoyGrowthRate', 0] } },
          
          // Volatility measures
          revenueVolatility: { $stdDevPop: '$totalRevenue' },
          orderVolatility: { $stdDevPop: '$orderCount' },
          
          // Trend analysis
          trendDistribution: {
            $push: '$trendClassification'
          },
          
          // Peak performance
          peakMonthRevenue: { $max: '$totalRevenue' },
          peakMonthOrders: { $max: '$orderCount' }
        }
      },
      
      // Stage 10: Final insights and recommendations
      {
        $addFields: {
          // Dominant trend
          dominantTrend: {
            $let: {
              vars: {
                trendCounts: {
                  $reduce: {
                    input: '$trendDistribution',
                    initialValue: {},
                    in: {
                      $mergeObjects: [
                        '$$value',
                        {
                          $arrayToObject: [
                            [{
                              k: '$$this',
                              v: { $add: [{ $ifNull: [{ $getField: { field: '$$this', input: '$$value' } }, 0] }, 1] }
                            }]
                          ]
                        }
                      ]
                    }
                  }
                }
              },
              in: {
                $arrayElemAt: [
                  {
                    $sortArray: {
                      input: { $objectToArray: '$$trendCounts' },
                      sortBy: { v: -1 }
                    }
                  },
                  0
                ]
              }
            }
          },
          
          // Performance classification
          performanceClassification: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ['$avgYoyGrowth', 20] },
                      { $lte: ['$revenueVolatility', '$avgMonthlyRevenue'] }
                    ]
                  },
                  then: 'high_growth_stable'
                },
                {
                  case: { $gte: ['$avgYoyGrowth', 20] },
                  then: 'high_growth_volatile'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$avgYoyGrowth', 5] },
                      { $lte: ['$revenueVolatility', '$avgMonthlyRevenue'] }
                    ]
                  },
                  then: 'steady_growth'
                },
                {
                  case: { $lt: ['$avgYoyGrowth', -5] },
                  then: 'declining'
                }
              ],
              default: 'mature_stable'
            }
          }
        }
      },
      
      {
        $sort: {
          totalPeriodRevenue: -1,
          avgYoyGrowth: -1
        }
      }
    ];

    console.log('Executing time-series analytics pipeline...');
    const startTime = Date.now();
    
    try {
      const results = await this.collections.orders.aggregate(
        timeSeriesPipeline,
        {
          allowDiskUse: true,
          maxTimeMS: this.performanceTargets.maxExecutionTime,
          cursor: { batchSize: 100 }
        }
      ).toArray();
      
      const executionTime = Date.now() - startTime;
      
      console.log(`Time-series analytics executed in ${executionTime}ms`);
      console.log(`Analyzed ${results.length} category-country combinations`);
      
      return {
        results,
        executionStats: {
          executionTime,
          timeSeriesAnalyzed: results.length,
          performanceGrade: this.calculatePerformanceGrade(executionTime)
        }
      };
      
    } catch (error) {
      console.error('Time-series analytics failed:', error);
      throw error;
    }
  }

  calculatePerformanceGrade(executionTimeMs) {
    // Performance grading based on execution time
    if (executionTimeMs <= 1000) return 'A';
    if (executionTimeMs <= 2500) return 'B';
    if (executionTimeMs <= 5000) return 'C';
    if (executionTimeMs <= 10000) return 'D';
    return 'F';
  }

  async optimizePipelinePerformance(pipeline, options = {}) {
    console.log('Optimizing aggregation pipeline performance...');
    
    const {
      enableIndexHints = true,
      enableDiskUsage = true,
      optimizeBatchSize = true,
      enablePipelineReordering = true
    } = options;

    // Performance optimization strategies
    const optimizedPipeline = [...pipeline];
    
    if (enablePipelineReordering) {
      // Move $match stages to the beginning
      const matchStages = [];
      const otherStages = [];
      
      for (const stage of optimizedPipeline) {
        if (stage.$match) {
          matchStages.push(stage);
        } else {
          otherStages.push(stage);
        }
      }
      
      // Reorder: matches first, then other stages
      optimizedPipeline.length = 0;
      optimizedPipeline.push(...matchStages, ...otherStages);
    }
    
    // Add $project stages early to reduce data size
    const hasEarlyProject = optimizedPipeline.slice(0, 3).some(stage => stage.$project);
    if (!hasEarlyProject && optimizedPipeline.length > 5) {
      // Insert projection after initial match stages
      const insertIndex = optimizedPipeline.findIndex(stage => !stage.$match) || 1;
      optimizedPipeline.splice(insertIndex, 0, {
        $project: {
          // Project only commonly used fields
          _id: 1,
          status: 1,
          createdAt: 1,
          totalAmount: 1,
          userId: 1,
          items: 1
        }
      });
    }
    
    // Aggregation options
    const aggregationOptions = {
      allowDiskUse: enableDiskUsage,
      maxTimeMS: this.performanceTargets.maxExecutionTime
    };
    
    if (optimizeBatchSize) {
      aggregationOptions.cursor = { batchSize: 1000 };
    }
    
    if (enableIndexHints) {
      // Suggest optimal index based on initial match conditions
      const firstMatch = optimizedPipeline.find(stage => stage.$match);
      if (firstMatch) {
        const matchFields = Object.keys(firstMatch.$match);
        aggregationOptions.hint = this.suggestOptimalIndex(matchFields);
      }
    }
    
    return {
      optimizedPipeline,
      aggregationOptions,
      optimizations: {
        reorderedStages: enablePipelineReordering,
        addedEarlyProjection: !hasEarlyProject && optimizedPipeline.length > 5,
        indexHint: aggregationOptions.hint || null,
        diskUsageEnabled: enableDiskUsage
      }
    };
  }

  suggestOptimalIndex(matchFields) {
    // Simple heuristic for index suggestion
    const indexSuggestions = {
      status: { status: 1 },
      createdAt: { createdAt: -1 },
      userId: { userId: 1 },
      totalAmount: { totalAmount: -1 }
    };
    
    // Return compound index if multiple fields
    if (matchFields.length > 1) {
      const compoundIndex = {};
      for (const field of matchFields) {
        if (field === 'createdAt' || field === 'totalAmount') {
          compoundIndex[field] = -1;
        } else {
          compoundIndex[field] = 1;
        }
      }
      return compoundIndex;
    }
    
    return indexSuggestions[matchFields[0]] || { [matchFields[0]]: 1 };
  }

  async analyzePipelinePerformance(collection, pipeline) {
    console.log('Analyzing pipeline performance...');
    
    try {
      // Execute explain to get execution statistics
      const explainResult = await collection.aggregate(pipeline).explain('executionStats');
      
      const analysis = {
        totalExecutionTime: this.extractExecutionTime(explainResult),
        stageBreakdown: this.analyzeStagePerformance(explainResult),
        indexUsage: this.analyzeIndexUsage(explainResult),
        memoryUsage: this.estimateMemoryUsage(explainResult),
        recommendations: []
      };
      
      // Generate optimization recommendations
      analysis.recommendations = this.generatePipelineRecommendations(analysis);
      
      return analysis;
      
    } catch (error) {
      console.error('Pipeline analysis failed:', error);
      return {
        error: error.message,
        recommendations: ['Unable to analyze pipeline - check syntax and data availability']
      };
    }
  }

  extractExecutionTime(explainResult) {
    // Extract execution time from explain result
    if (explainResult.stages && explainResult.stages.length > 0) {
      const lastStage = explainResult.stages[explainResult.stages.length - 1];
      return lastStage.$cursor?.executionStats?.executionTimeMillis || 0;
    }
    return 0;
  }

  analyzeStagePerformance(explainResult) {
    // Analyze performance of individual pipeline stages
    if (!explainResult.stages) return [];
    
    return explainResult.stages.map((stage, index) => {
      const stageInfo = {
        stageIndex: index,
        stageType: Object.keys(stage)[0],
        executionTime: 0,
        documentsProcessed: 0,
        documentsOutput: 0
      };
      
      // Extract stage-specific metrics
      if (stage.$cursor?.executionStats) {
        stageInfo.executionTime = stage.$cursor.executionStats.executionTimeMillis;
        stageInfo.documentsProcessed = stage.$cursor.executionStats.totalDocsExamined;
        stageInfo.documentsOutput = stage.$cursor.executionStats.totalDocsReturned;
      }
      
      return stageInfo;
    });
  }

  analyzeIndexUsage(explainResult) {
    // Analyze index usage patterns
    const indexUsage = {
      indexesUsed: [],
      collectionScans: 0,
      indexScans: 0,
      efficiency: 0
    };
    
    // Implementation would analyze explain result for index usage
    // This is a simplified version
    
    return indexUsage;
  }

  estimateMemoryUsage(explainResult) {
    // Estimate memory usage based on pipeline operations
    let estimatedMemory = 0;
    
    if (explainResult.stages) {
      for (const stage of explainResult.stages) {
        // Estimate memory for different stage types
        const stageType = Object.keys(stage)[0];
        
        switch (stageType) {
          case '$group':
            estimatedMemory += 10; // MB estimate
            break;
          case '$sort':
            estimatedMemory += 20; // MB estimate
            break;
          case '$lookup':
            estimatedMemory += 15; // MB estimate
            break;
          default:
            estimatedMemory += 2; // MB estimate
        }
      }
    }
    
    return estimatedMemory;
  }

  generatePipelineRecommendations(analysis) {
    const recommendations = [];
    
    // High execution time
    if (analysis.totalExecutionTime > this.performanceTargets.maxExecutionTime) {
      recommendations.push({
        type: 'PERFORMANCE_WARNING',
        message: `Pipeline execution time (${analysis.totalExecutionTime}ms) exceeds target`,
        suggestion: 'Consider adding indexes, reducing data volume, or optimizing pipeline stages'
      });
    }
    
    // High memory usage
    if (analysis.memoryUsage > this.performanceTargets.maxMemoryUsage) {
      recommendations.push({
        type: 'MEMORY_WARNING',
        message: `Estimated memory usage (${analysis.memoryUsage}MB) may cause performance issues`,
        suggestion: 'Enable allowDiskUse option or reduce pipeline complexity'
      });
    }
    
    // Collection scans detected
    if (analysis.indexUsage.collectionScans > 0) {
      recommendations.push({
        type: 'INDEX_MISSING',
        message: 'Pipeline includes collection scans',
        suggestion: 'Create indexes for fields used in $match stages'
      });
    }
    
    return recommendations;
  }
}

// Benefits of MongoDB Advanced Aggregation Pipelines:
// - Flexible multi-stage data processing with optimizable pipeline ordering
// - Rich aggregation operators supporting complex calculations and transformations
// - Built-in memory management with disk usage options for large datasets
// - Advanced analytical capabilities including window functions and time-series analysis
// - Efficient handling of nested documents and array operations
// - Comprehensive performance monitoring and optimization recommendations
// - Integration with MongoDB's query optimizer and index system
// - Support for real-time analytics and complex business intelligence queries
// - Scalable architecture that works across replica sets and sharded clusters
// - SQL-familiar aggregation patterns through QueryLeaf integration

module.exports = {
  MongoAggregationOptimizer
};
```

## Understanding MongoDB Aggregation Architecture

### Advanced Pipeline Design Patterns and Optimization Strategies

Implement sophisticated aggregation patterns for optimal performance and analytical capabilities:

```javascript
// Advanced aggregation patterns for specialized analytical use cases
class AdvancedAggregationPatterns {
  constructor(db) {
    this.db = db;
    this.performanceMetrics = new Map();
    this.pipelineTemplates = new Map();
  }

  async implementRealTimeAnalytics() {
    console.log('Implementing real-time analytics aggregation patterns...');
    
    // Real-time dashboard metrics with incremental processing
    const realTimeDashboardPipeline = [
      // Stage 1: Match recent data only (last 24 hours)
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          status: { $in: ['completed', 'processing'] }
        }
      },
      
      // Stage 2: Fast aggregation for key metrics
      {
        $facet: {
          // Revenue metrics
          revenueMetrics: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$totalAmount' },
                orderCount: { $sum: 1 },
                avgOrderValue: { $avg: '$totalAmount' },
                maxOrderValue: { $max: '$totalAmount' }
              }
            }
          ],
          
          // Hourly breakdown
          hourlyBreakdown: [
            {
              $group: {
                _id: { hour: { $hour: '$createdAt' } },
                revenue: { $sum: '$totalAmount' },
                orders: { $sum: 1 }
              }
            },
            { $sort: { '_id.hour': 1 } }
          ],
          
          // Top products (by revenue)
          topProducts: [
            { $unwind: '$items' },
            {
              $group: {
                _id: '$items.productId',
                revenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
                quantity: { $sum: '$items.quantity' }
              }
            },
            { $sort: { revenue: -1 } },
            { $limit: 10 }
          ],
          
          // Geographic distribution
          geoDistribution: [
            {
              $group: {
                _id: '$shippingAddress.country',
                orders: { $sum: 1 },
                revenue: { $sum: '$totalAmount' }
              }
            },
            { $sort: { revenue: -1 } },
            { $limit: 20 }
          ],
          
          // Customer segments
          customerSegments: [
            {
              $group: {
                _id: {
                  segment: {
                    $switch: {
                      branches: [
                        { case: { $gte: ['$totalAmount', 500] }, then: 'premium' },
                        { case: { $gte: ['$totalAmount', 100] }, then: 'standard' }
                      ],
                      default: 'basic'
                    }
                  }
                },
                count: { $sum: 1 },
                revenue: { $sum: '$totalAmount' }
              }
            }
          ]
        }
      }
    ];

    const realTimeResults = await this.db.collection('orders').aggregate(
      realTimeDashboardPipeline,
      { maxTimeMS: 1000 } // 1 second timeout for real-time
    ).toArray();

    console.log('Real-time analytics completed');
    return realTimeResults[0];
  }

  async implementCustomerLifecycleAnalysis() {
    console.log('Building customer lifecycle analysis pipeline...');
    
    const lifecyclePipeline = [
      // Stage 1: Get all customers with their order history
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'userId',
          as: 'orders',
          pipeline: [
            { $match: { status: 'completed' } },
            { $sort: { createdAt: 1 } },
            {
              $project: {
                createdAt: 1,
                totalAmount: 1,
                daysSinceRegistration: {
                  $divide: [
                    { $subtract: ['$createdAt', '$$ROOT.createdAt'] },
                    24 * 60 * 60 * 1000
                  ]
                }
              }
            }
          ]
        }
      },
      
      // Stage 2: Calculate lifecycle metrics
      {
        $addFields: {
          // Basic lifecycle metrics
          totalOrders: { $size: '$orders' },
          totalSpent: { $sum: '$orders.totalAmount' },
          avgOrderValue: { $avg: '$orders.totalAmount' },
          
          // Timing analysis
          firstOrderDate: { $min: '$orders.createdAt' },
          lastOrderDate: { $max: '$orders.createdAt' },
          customerLifespanDays: {
            $divide: [
              { $subtract: [{ $max: '$orders.createdAt' }, { $min: '$orders.createdAt' }] },
              24 * 60 * 60 * 1000
            ]
          },
          
          // Purchase intervals
          orderIntervals: {
            $map: {
              input: { $range: [1, { $size: '$orders' }] },
              as: 'idx',
              in: {
                $divide: [
                  {
                    $subtract: [
                      { $arrayElemAt: ['$orders.createdAt', '$$idx'] },
                      { $arrayElemAt: ['$orders.createdAt', { $subtract: ['$$idx', 1] }] }
                    ]
                  },
                  24 * 60 * 60 * 1000 // Convert to days
                ]
              }
            }
          },
          
          // CLV calculation (simplified)
          estimatedCLV: {
            $multiply: [
              { $avg: '$orders.totalAmount' }, // Average order value
              { $size: '$orders' }, // Order frequency
              {
                $cond: {
                  if: { $gt: [{ $size: '$orders' }, 1] },
                  then: {
                    $divide: [
                      365, // Days in year
                      { $avg: '$orderIntervals' } // Average days between orders
                    ]
                  },
                  else: 1
                }
              }
            ]
          }
        }
      },
      
      // Stage 3: Lifecycle stage classification
      {
        $addFields: {
          lifecycleStage: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$totalOrders', 1] },
                  then: 'new_customer'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$totalOrders', 2] },
                      { $lte: ['$totalOrders', 5] },
                      {
                        $gte: [
                          '$lastOrderDate',
                          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
                        ]
                      }
                    ]
                  },
                  then: 'developing'
                },
                {
                  case: {
                    $and: [
                      { $gt: ['$totalOrders', 5] },
                      { $gte: ['$totalSpent', 500] },
                      {
                        $gte: [
                          '$lastOrderDate',
                          new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
                        ]
                      }
                    ]
                  },
                  then: 'loyal'
                },
                {
                  case: {
                    $and: [
                      { $gt: ['$totalOrders', 10] },
                      { $gte: ['$totalSpent', 2000] }
                    ]
                  },
                  then: 'champion'
                },
                {
                  case: {
                    $lt: [
                      '$lastOrderDate',
                      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  then: 'dormant'
                }
              ],
              default: 'at_risk'
            }
          },
          
          // Churn risk scoring
          churnRisk: {
            $let: {
              vars: {
                daysSinceLastOrder: {
                  $divide: [
                    { $subtract: [new Date(), '$lastOrderDate'] },
                    24 * 60 * 60 * 1000
                  ]
                },
                avgInterval: { $avg: '$orderIntervals' }
              },
              in: {
                $switch: {
                  branches: [
                    {
                      case: { $gt: ['$$daysSinceLastOrder', { $multiply: ['$$avgInterval', 3] }] },
                      then: 'high'
                    },
                    {
                      case: { $gt: ['$$daysSinceLastOrder', { $multiply: ['$$avgInterval', 2] }] },
                      then: 'medium'
                    }
                  ],
                  default: 'low'
                }
              }
            }
          }
        }
      },
      
      // Stage 4: Group by lifecycle stage for analysis
      {
        $group: {
          _id: {
            lifecycleStage: '$lifecycleStage',
            churnRisk: '$churnRisk'
          },
          
          customerCount: { $sum: 1 },
          totalRevenue: { $sum: '$totalSpent' },
          avgCLV: { $avg: '$estimatedCLV' },
          avgLifespan: { $avg: '$customerLifespanDays' },
          avgOrderFrequency: { $avg: { $avg: '$orderIntervals' } },
          
          // Statistical measures
          clvDistribution: {
            $push: {
              $bucket: {
                groupBy: '$estimatedCLV',
                boundaries: [0, 100, 500, 1000, 5000, 10000],
                default: 'high_value'
              }
            }
          }
        }
      },
      
      {
        $sort: { totalRevenue: -1 }
      }
    ];

    console.log('Executing customer lifecycle analysis...');
    const results = await this.db.collection('users').aggregate(lifecyclePipeline, {
      allowDiskUse: true,
      maxTimeMS: 30000
    }).toArray();

    return results;
  }

  async implementAdvancedTextAnalysis() {
    console.log('Building advanced text analysis pipeline...');
    
    // Advanced text analysis for reviews and feedback
    const textAnalysisPipeline = [
      // Stage 1: Match published reviews
      {
        $match: {
          status: 'published',
          reviewText: { $exists: true, $ne: '' }
        }
      },
      
      // Stage 2: Text processing and sentiment analysis
      {
        $addFields: {
          // Text metrics
          wordCount: {
            $size: {
              $split: [{ $trim: { input: '$reviewText' } }, ' ']
            }
          },
          
          // Sentiment indicators (simplified keyword approach)
          positiveWords: {
            $size: {
              $filter: {
                input: {
                  $split: [
                    { $toLower: '$reviewText' },
                    ' '
                  ]
                },
                cond: {
                  $in: [
                    '$$this',
                    ['excellent', 'great', 'amazing', 'love', 'perfect', 'awesome', 'fantastic', 'wonderful', 'outstanding', 'superb']
                  ]
                }
              }
            }
          },
          
          negativeWords: {
            $size: {
              $filter: {
                input: {
                  $split: [
                    { $toLower: '$reviewText' },
                    ' '
                  ]
                },
                cond: {
                  $in: [
                    '$$this',
                    ['terrible', 'awful', 'bad', 'horrible', 'worst', 'hate', 'disappointing', 'useless', 'broken', 'defective']
                  ]
                }
              }
            }
          },
          
          // Quality indicators
          qualityKeywords: {
            $size: {
              $filter: {
                input: {
                  $split: [
                    { $toLower: '$reviewText' },
                    ' '
                  ]
                },
                cond: {
                  $in: [
                    '$$this',
                    ['quality', 'durable', 'sturdy', 'well-made', 'premium', 'solid', 'reliable', 'long-lasting']
                  ]
                }
              }
            }
          },
          
          // Service indicators
          serviceKeywords: {
            $size: {
              $filter: {
                input: {
                  $split: [
                    { $toLower: '$reviewText' },
                    ' '
                  ]
                },
                cond: {
                  $in: [
                    '$$this',
                    ['service', 'support', 'shipping', 'delivery', 'customer', 'help', 'staff', 'team']
                  ]
                }
              }
            }
          }
        }
      },
      
      // Stage 3: Sentiment scoring
      {
        $addFields: {
          sentimentScore: {
            $subtract: ['$positiveWords', '$negativeWords']
          },
          
          sentimentCategory: {
            $switch: {
              branches: [
                {
                  case: { $gte: [{ $subtract: ['$positiveWords', '$negativeWords'] }, 2] },
                  then: 'very_positive'
                },
                {
                  case: { $gte: [{ $subtract: ['$positiveWords', '$negativeWords'] }, 1] },
                  then: 'positive'
                },
                {
                  case: { $lte: [{ $subtract: ['$positiveWords', '$negativeWords'] }, -2] },
                  then: 'very_negative'
                },
                {
                  case: { $lte: [{ $subtract: ['$positiveWords', '$negativeWords'] }, -1] },
                  then: 'negative'
                }
              ],
              default: 'neutral'
            }
          },
          
          reviewQuality: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ['$wordCount', 50] },
                      { $gte: ['$rating', 4] },
                      { $gte: ['$helpfulVotes', 3] }
                    ]
                  },
                  then: 'high_quality'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$wordCount', 20] },
                      { $or: [{ $gte: ['$rating', 4] }, { $lte: ['$rating', 2] }] }
                    ]
                  },
                  then: 'moderate_quality'
                }
              ],
              default: 'low_quality'
            }
          }
        }
      },
      
      // Stage 4: Group by product for analysis
      {
        $group: {
          _id: '$productId',
          
          // Review volume metrics
          totalReviews: { $sum: 1 },
          avgRating: { $avg: '$rating' },
          ratingDistribution: {
            $push: {
              rating: '$rating',
              sentiment: '$sentimentCategory'
            }
          },
          
          // Text analysis metrics
          avgWordCount: { $avg: '$wordCount' },
          avgSentimentScore: { $avg: '$sentimentScore' },
          
          // Sentiment distribution
          veryPositive: {
            $sum: { $cond: [{ $eq: ['$sentimentCategory', 'very_positive'] }, 1, 0] }
          },
          positive: {
            $sum: { $cond: [{ $eq: ['$sentimentCategory', 'positive'] }, 1, 0] }
          },
          neutral: {
            $sum: { $cond: [{ $eq: ['$sentimentCategory', 'neutral'] }, 1, 0] }
          },
          negative: {
            $sum: { $cond: [{ $eq: ['$sentimentCategory', 'negative'] }, 1, 0] }
          },
          veryNegative: {
            $sum: { $cond: [{ $eq: ['$sentimentCategory', 'very_negative'] }, 1, 0] }
          },
          
          // Quality and service mentions
          qualityMentions: { $sum: '$qualityKeywords' },
          serviceMentions: { $sum: '$serviceKeywords' },
          
          // Review quality distribution
          highQualityReviews: {
            $sum: { $cond: [{ $eq: ['$reviewQuality', 'high_quality'] }, 1, 0] }
          },
          
          // Most helpful reviews
          topReviews: {
            $push: {
              $cond: {
                if: { $gte: ['$helpfulVotes', 5] },
                then: {
                  reviewId: '$_id',
                  rating: '$rating',
                  sentiment: '$sentimentCategory',
                  helpfulVotes: '$helpfulVotes',
                  wordCount: '$wordCount'
                },
                else: '$$REMOVE'
              }
            }
          }
        }
      },
      
      // Stage 5: Calculate comprehensive text metrics
      {
        $addFields: {
          // Overall sentiment ratio
          positiveRatio: {
            $divide: [
              { $add: ['$veryPositive', '$positive'] },
              '$totalReviews'
            ]
          },
          
          negativeRatio: {
            $divide: [
              { $add: ['$negative', '$veryNegative'] },
              '$totalReviews'
            ]
          },
          
          // Quality score
          qualityScore: {
            $add: [
              // Rating component (40%)
              { $multiply: [{ $divide: ['$avgRating', 5] }, 40] },
              
              // Sentiment component (30%)
              { $multiply: [{ $divide: [{ $add: ['$veryPositive', '$positive'] }, '$totalReviews'] }, 30] },
              
              // Review depth component (20%)
              { $multiply: [{ $min: [{ $divide: ['$avgWordCount', 100] }, 1] }, 20] },
              
              // Quality mentions component (10%)
              { $multiply: [{ $min: [{ $divide: ['$qualityMentions', '$totalReviews'] }, 1] }, 10] }
            ]
          },
          
          // Text analysis insights
          textInsights: {
            dominantSentiment: {
              $switch: {
                branches: [
                  { case: { $gte: ['$veryPositive', { $max: ['$positive', '$neutral', '$negative', '$veryNegative'] }] }, then: 'very_positive' },
                  { case: { $gte: ['$positive', { $max: ['$neutral', '$negative', '$veryNegative'] }] }, then: 'positive' },
                  { case: { $gte: ['$neutral', { $max: ['$negative', '$veryNegative'] }] }, then: 'neutral' },
                  { case: { $gte: ['$negative', '$veryNegative'] }, then: 'negative' }
                ],
                default: 'very_negative'
              }
            },
            
            reviewEngagement: {
              $divide: ['$highQualityReviews', '$totalReviews']
            },
            
            serviceAttention: {
              $divide: ['$serviceMentions', '$totalReviews']
            }
          }
        }
      },
      
      // Stage 6: Sort by quality score
      {
        $sort: { qualityScore: -1 }
      },
      
      // Stage 7: Lookup product information
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
          pipeline: [
            {
              $project: {
                name: 1,
                category: 1,
                brand: 1,
                price: 1
              }
            }
          ]
        }
      },
      
      {
        $addFields: {
          productInfo: { $arrayElemAt: ['$product', 0] }
        }
      },
      
      {
        $project: {
          product: 0 // Remove array field
        }
      }
    ];

    console.log('Executing advanced text analysis...');
    const results = await this.db.collection('reviews').aggregate(textAnalysisPipeline, {
      allowDiskUse: true,
      maxTimeMS: 45000
    }).toArray();

    return results;
  }

  async monitorPipelinePerformance() {
    console.log('Monitoring aggregation pipeline performance...');
    
    const performanceMetrics = {
      collections: {},
      systemMetrics: {},
      recommendations: []
    };

    // Analyze recent aggregation operations
    try {
      const recentAggregations = await this.db.collection('system.profile').find({
        ts: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        'command.aggregate': { $exists: true },
        millis: { $gte: 1000 } // Operations taking more than 1 second
      }).sort({ millis: -1 }).limit(20).toArray();

      for (const aggOp of recentAggregations) {
        const analysis = {
          collection: aggOp.command.aggregate,
          duration: aggOp.millis,
          stages: aggOp.command.pipeline ? aggOp.command.pipeline.length : 0,
          allowDiskUse: aggOp.command.allowDiskUse || false,
          timestamp: aggOp.ts
        };

        if (!performanceMetrics.collections[analysis.collection]) {
          performanceMetrics.collections[analysis.collection] = {
            operations: [],
            avgDuration: 0,
            slowOperations: 0
          };
        }

        performanceMetrics.collections[analysis.collection].operations.push(analysis);
        
        if (analysis.duration > 5000) {
          performanceMetrics.collections[analysis.collection].slowOperations++;
        }
      }

      // Calculate averages and generate recommendations
      for (const [collection, metrics] of Object.entries(performanceMetrics.collections)) {
        const operations = metrics.operations;
        metrics.avgDuration = operations.reduce((sum, op) => sum + op.duration, 0) / operations.length;
        
        if (metrics.avgDuration > 10000) {
          performanceMetrics.recommendations.push({
            type: 'PERFORMANCE_WARNING',
            collection: collection,
            message: `Average aggregation duration (${metrics.avgDuration}ms) is high`,
            suggestions: [
              'Review pipeline stage ordering',
              'Add appropriate indexes',
              'Enable allowDiskUse for large datasets',
              'Consider data preprocessing'
            ]
          });
        }
        
        if (metrics.slowOperations > operations.length * 0.5) {
          performanceMetrics.recommendations.push({
            type: 'FREQUENT_SLOW_OPERATIONS',
            collection: collection,
            message: `${metrics.slowOperations} of ${operations.length} operations are slow`,
            suggestions: [
              'Optimize pipeline stages',
              'Review data volume and filtering',
              'Consider aggregation result caching'
            ]
          });
        }
      }

    } catch (error) {
      console.warn('Could not analyze aggregation performance:', error.message);
    }

    return performanceMetrics;
  }
}
```

## SQL-Style Aggregation with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB aggregation operations:

```sql
-- QueryLeaf aggregation with SQL-familiar syntax

-- Complex analytical query with multiple aggregation levels
WITH customer_analytics AS (
  SELECT 
    u.country,
    u.registration_year,
    u.status,
    
    -- Customer metrics
    COUNT(*) as customer_count,
    AVG(u.total_spent) as avg_customer_value,
    SUM(u.total_spent) as total_revenue,
    
    -- Customer segmentation
    COUNT(CASE WHEN u.total_spent > 1000 THEN 1 END) as high_value_customers,
    COUNT(CASE WHEN u.total_spent BETWEEN 100 AND 1000 THEN 1 END) as medium_value_customers,
    COUNT(CASE WHEN u.total_spent < 100 THEN 1 END) as low_value_customers,
    
    -- Behavioral metrics
    AVG(u.order_count) as avg_orders_per_customer,
    AVG(DATEDIFF(CURRENT_DATE, u.last_order_date)) as avg_days_since_last_order,
    
    -- Geographic performance
    COUNT(DISTINCT u.state) as states_served,
    COUNT(DISTINCT u.city) as cities_served,
    
    -- Temporal analysis
    COUNT(CASE WHEN u.last_login >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as active_users,
    COUNT(CASE WHEN u.last_login < CURRENT_DATE - INTERVAL '90 days' THEN 1 END) as inactive_users

  FROM users u
  WHERE u.created_at >= CURRENT_DATE - INTERVAL '2 years'
    AND u.status != 'deleted'
  GROUP BY u.country, u.registration_year, u.status
),

product_performance AS (
  SELECT 
    p.category,
    p.brand,
    
    -- Product metrics
    COUNT(*) as product_count,
    AVG(p.price) as avg_price,
    SUM(COALESCE(p.total_sales, 0)) as category_sales,
    
    -- Performance indicators
    AVG(p.rating) as avg_rating,
    COUNT(CASE WHEN p.rating >= 4.0 THEN 1 END) as highly_rated_products,
    COUNT(CASE WHEN p.stock_level < 10 THEN 1 END) as low_stock_products,
    
    -- Revenue analysis with complex calculations
    SUM(p.price * COALESCE(p.units_sold, 0)) as gross_revenue,
    AVG(p.price * COALESCE(p.units_sold, 0)) as avg_product_revenue,
    
    -- Market penetration
    COUNT(DISTINCT p.supplier_id) as supplier_diversity,
    
    -- Product lifecycle analysis
    COUNT(CASE WHEN p.created_at >= CURRENT_DATE - INTERVAL '6 months' THEN 1 END) as new_products,
    COUNT(CASE WHEN p.last_sold < CURRENT_DATE - INTERVAL '3 months' THEN 1 END) as stale_products,
    
    -- Statistical measures
    STDDEV(p.price) as price_variance,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.price) as median_price,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY p.price) as price_p90

  FROM products p
  WHERE p.status = 'active'
  GROUP BY p.category, p.brand
  HAVING COUNT(*) >= 5  -- Categories with sufficient products
),

time_series_analysis AS (
  SELECT 
    DATE_TRUNC('month', o.created_at) as month,
    o.customer_country,
    
    -- Volume metrics
    COUNT(*) as order_count,
    SUM(o.total_amount) as monthly_revenue,
    COUNT(DISTINCT o.user_id) as unique_customers,
    
    -- Average metrics
    AVG(o.total_amount) as avg_order_value,
    AVG(JSON_LENGTH(o.items)) as avg_items_per_order,
    
    -- Growth calculations using window functions
    LAG(SUM(o.total_amount)) OVER (
      PARTITION BY o.customer_country 
      ORDER BY DATE_TRUNC('month', o.created_at)
    ) as prev_month_revenue,
    
    LAG(SUM(o.total_amount), 12) OVER (
      PARTITION BY o.customer_country 
      ORDER BY DATE_TRUNC('month', o.created_at)
    ) as same_month_last_year,
    
    -- Cumulative metrics
    SUM(SUM(o.total_amount)) OVER (
      PARTITION BY o.customer_country 
      ORDER BY DATE_TRUNC('month', o.created_at)
      ROWS UNBOUNDED PRECEDING
    ) as cumulative_revenue,
    
    -- Moving averages
    AVG(SUM(o.total_amount)) OVER (
      PARTITION BY o.customer_country 
      ORDER BY DATE_TRUNC('month', o.created_at)
      ROWS 2 PRECEDING
    ) as three_month_avg_revenue,
    
    -- Rankings
    RANK() OVER (
      PARTITION BY DATE_TRUNC('month', o.created_at)
      ORDER BY SUM(o.total_amount) DESC
    ) as monthly_country_rank

  FROM orders o
  WHERE o.status = 'completed'
    AND o.created_at >= CURRENT_DATE - INTERVAL '18 months'
  GROUP BY DATE_TRUNC('month', o.created_at), o.customer_country
),

advanced_text_analysis AS (
  SELECT 
    r.product_id,
    p.category,
    
    -- Review volume and ratings
    COUNT(*) as review_count,
    AVG(r.rating) as avg_rating,
    
    -- Sentiment analysis using text functions
    COUNT(CASE 
      WHEN LOWER(r.review_text) SIMILAR TO '%(excellent|great|amazing|love|perfect)%' 
      THEN 1 
    END) as positive_reviews,
    
    COUNT(CASE 
      WHEN LOWER(r.review_text) SIMILAR TO '%(terrible|awful|bad|horrible|hate)%' 
      THEN 1 
    END) as negative_reviews,
    
    -- Text quality metrics
    AVG(LENGTH(r.review_text)) as avg_review_length,
    COUNT(CASE WHEN LENGTH(r.review_text) > 100 THEN 1 END) as detailed_reviews,
    
    -- Helpfulness metrics
    AVG(r.helpful_votes) as avg_helpfulness,
    COUNT(CASE WHEN r.helpful_votes >= 5 THEN 1 END) as highly_helpful_reviews,
    
    -- Topic analysis using keyword matching
    COUNT(CASE 
      WHEN LOWER(r.review_text) SIMILAR TO '%(quality|durable|sturdy|well-made)%' 
      THEN 1 
    END) as quality_mentions,
    
    COUNT(CASE 
      WHEN LOWER(r.review_text) SIMILAR TO '%(shipping|delivery|fast|quick)%' 
      THEN 1 
    END) as shipping_mentions,
    
    -- Rating distribution analysis
    JSON_OBJECT(
      'rating_5', COUNT(CASE WHEN r.rating = 5 THEN 1 END),
      'rating_4', COUNT(CASE WHEN r.rating = 4 THEN 1 END),
      'rating_3', COUNT(CASE WHEN r.rating = 3 THEN 1 END),
      'rating_2', COUNT(CASE WHEN r.rating = 2 THEN 1 END),
      'rating_1', COUNT(CASE WHEN r.rating = 1 THEN 1 END)
    ) as rating_distribution

  FROM reviews r
  JOIN products p ON r.product_id = p.id
  WHERE r.status = 'published'
    AND r.created_at >= CURRENT_DATE - INTERVAL '1 year'
  GROUP BY r.product_id, p.category
  HAVING COUNT(*) >= 10  -- Products with sufficient reviews
)

-- Final comprehensive analysis combining all CTEs
SELECT 
  ca.country,
  ca.customer_count,
  ca.total_revenue,
  ROUND(ca.avg_customer_value, 2) as avg_customer_ltv,
  
  -- Customer segmentation percentages
  ROUND((ca.high_value_customers / ca.customer_count::float) * 100, 1) as high_value_pct,
  ROUND((ca.medium_value_customers / ca.customer_count::float) * 100, 1) as medium_value_pct,
  ROUND((ca.low_value_customers / ca.customer_count::float) * 100, 1) as low_value_pct,
  
  -- Activity metrics
  ROUND((ca.active_users / ca.customer_count::float) * 100, 1) as active_user_pct,
  ROUND(ca.avg_orders_per_customer, 1) as avg_orders_per_customer,
  
  -- Product ecosystem metrics
  (SELECT COUNT(DISTINCT pp.category) 
   FROM product_performance pp) as total_categories,
  
  (SELECT AVG(pp.avg_rating) 
   FROM product_performance pp) as overall_product_rating,
  
  -- Time series insights (latest month data)
  (SELECT tsa.monthly_revenue 
   FROM time_series_analysis tsa 
   WHERE tsa.customer_country = ca.country 
   ORDER BY tsa.month DESC 
   LIMIT 1) as latest_month_revenue,
  
  -- Growth rate calculation
  (SELECT 
     CASE 
       WHEN tsa.prev_month_revenue > 0 THEN
         ROUND(((tsa.monthly_revenue - tsa.prev_month_revenue) / tsa.prev_month_revenue * 100), 2)
       ELSE NULL
     END
   FROM time_series_analysis tsa 
   WHERE tsa.customer_country = ca.country 
   ORDER BY tsa.month DESC 
   LIMIT 1) as mom_growth_rate,
  
  -- Year over year growth
  (SELECT 
     CASE 
       WHEN tsa.same_month_last_year > 0 THEN
         ROUND(((tsa.monthly_revenue - tsa.same_month_last_year) / tsa.same_month_last_year * 100), 2)
       ELSE NULL
     END
   FROM time_series_analysis tsa 
   WHERE tsa.customer_country = ca.country 
   ORDER BY tsa.month DESC 
   LIMIT 1) as yoy_growth_rate,
  
  -- Text sentiment analysis
  (SELECT 
     ROUND(AVG(ata.positive_reviews / ata.review_count::float) * 100, 1)
   FROM advanced_text_analysis ata) as avg_positive_sentiment_pct,
  
  -- Quality perception
  (SELECT 
     ROUND(AVG(ata.quality_mentions / ata.review_count::float) * 100, 1)
   FROM advanced_text_analysis ata) as quality_mention_pct,
  
  -- Strategic classification
  CASE 
    WHEN ca.total_revenue > 100000 AND ca.high_value_customers > ca.customer_count * 0.2 THEN 'key_market'
    WHEN ca.total_revenue > 50000 AND ca.active_users > ca.customer_count * 0.6 THEN 'growth_market'
    WHEN ca.inactive_users > ca.customer_count * 0.5 THEN 'retention_focus'
    ELSE 'development_market'
  END as market_classification,
  
  -- Opportunity scoring
  (ca.total_revenue * 0.4 + 
   ca.customer_count * 10 * 0.3 + 
   ca.active_users * 15 * 0.3) as opportunity_score

FROM customer_analytics ca
WHERE ca.customer_count >= 50  -- Markets with sufficient size
ORDER BY ca.total_revenue DESC, ca.customer_count DESC;

-- Real-time dashboard query with faceted aggregation
SELECT 
  -- Today's metrics
  'today_metrics' as facet,
  JSON_OBJECT(
    'orders', COUNT(CASE WHEN o.created_at >= CURRENT_DATE THEN 1 END),
    'revenue', SUM(CASE WHEN o.created_at >= CURRENT_DATE THEN o.total_amount ELSE 0 END),
    'customers', COUNT(DISTINCT CASE WHEN o.created_at >= CURRENT_DATE THEN o.user_id END),
    'avg_order_value', AVG(CASE WHEN o.created_at >= CURRENT_DATE THEN o.total_amount END)
  ) as metrics
FROM orders o
WHERE o.status = 'completed' 
  AND o.created_at >= CURRENT_DATE - INTERVAL '1 day'

UNION ALL

-- Hourly breakdown for today
SELECT 
  'hourly_breakdown' as facet,
  JSON_OBJECT(
    'data', JSON_ARRAYAGG(
      JSON_OBJECT(
        'hour', EXTRACT(HOUR FROM o.created_at),
        'orders', COUNT(*),
        'revenue', SUM(o.total_amount)
      )
    )
  ) as metrics
FROM orders o
WHERE o.status = 'completed'
  AND o.created_at >= CURRENT_DATE
GROUP BY EXTRACT(HOUR FROM o.created_at)

UNION ALL

-- Top performing products today  
SELECT 
  'top_products' as facet,
  JSON_OBJECT(
    'data', JSON_ARRAYAGG(
      JSON_OBJECT(
        'product_id', oi.product_id,
        'revenue', SUM(oi.quantity * oi.unit_price),
        'units_sold', SUM(oi.quantity)
      )
    )
  ) as metrics
FROM orders o
JOIN JSON_TABLE(o.items, '$[*]' COLUMNS (
  product_id VARCHAR(50) PATH '$.productId',
  quantity INT PATH '$.quantity', 
  unit_price DECIMAL(10,2) PATH '$.unitPrice'
)) oi ON TRUE
WHERE o.status = 'completed'
  AND o.created_at >= CURRENT_DATE
GROUP BY oi.product_id
ORDER BY SUM(oi.quantity * oi.unit_price) DESC
LIMIT 10;

-- QueryLeaf provides comprehensive aggregation capabilities:
-- 1. Complex multi-level aggregations with CTEs and subqueries
-- 2. Advanced window functions for time-series analysis and trends
-- 3. JSON aggregation functions for flexible data processing
-- 4. Text analysis capabilities with pattern matching and sentiment analysis
-- 5. Statistical functions including percentiles and standard deviation
-- 6. Faceted queries for dashboard and real-time analytics
-- 7. Flexible grouping and segmentation with conditional logic
-- 8. Performance optimization with proper indexing hints
-- 9. Real-time metrics calculation with temporal filtering
-- 10. Integration with MongoDB's native aggregation framework optimizations
```

## Best Practices for Aggregation Pipeline Optimization

### Pipeline Design Guidelines

Essential principles for optimal MongoDB aggregation performance:

1. **Early Filtering**: Place $match stages as early as possible to reduce dataset size
2. **Index Utilization**: Design pipelines to leverage existing indexes effectively
3. **Memory Management**: Use allowDiskUse for large datasets and monitor memory usage
4. **Stage Ordering**: Follow optimal stage ordering principles for performance
5. **Projection Early**: Use $project stages to reduce document size in pipeline
6. **Batch Size Optimization**: Configure appropriate cursor batch sizes for large results

### Production Performance Optimization

Optimize MongoDB aggregation pipelines for production workloads:

1. **Performance Monitoring**: Implement continuous pipeline performance monitoring
2. **Result Caching**: Cache aggregation results for frequently executed pipelines
3. **Incremental Processing**: Design incremental aggregation patterns for large datasets
4. **Resource Management**: Monitor CPU, memory, and disk usage during aggregation
5. **Query Profiling**: Use MongoDB profiler to identify aggregation bottlenecks
6. **Parallel Processing**: Leverage sharding and replica sets for parallel aggregation

## Conclusion

MongoDB's advanced aggregation framework provides comprehensive data processing capabilities that eliminate the limitations and complexity of traditional relational database aggregation approaches. The flexible pipeline architecture supports sophisticated analytics, real-time processing, and complex transformations while maintaining optimal performance at scale.

Key MongoDB Aggregation benefits include:

- **Flexible Pipeline Architecture**: Multi-stage processing with optimizable stage ordering and memory management
- **Rich Analytical Capabilities**: Advanced operators supporting complex calculations, statistical analysis, and data transformations
- **Performance Optimization**: Built-in query optimization, index integration, and resource management
- **Real-time Processing**: Support for real-time analytics and streaming aggregation operations
- **Scalable Architecture**: Pipeline execution across replica sets and sharded clusters
- **SQL-Familiar Interface**: QueryLeaf integration providing familiar aggregation syntax and patterns

Whether you're building real-time dashboards, conducting complex business intelligence analysis, or implementing sophisticated data processing workflows, MongoDB's aggregation framework with QueryLeaf's familiar SQL interface provides the foundation for high-performance analytical operations.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB aggregation pipelines while providing SQL-familiar aggregation syntax, window functions, and analytical capabilities. Complex data transformations, statistical analysis, and real-time analytics are seamlessly handled through familiar SQL constructs, making sophisticated data processing both powerful and accessible to SQL-oriented development teams.

The combination of native MongoDB aggregation capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both flexible data processing and familiar analytical patterns, ensuring your applications can handle complex analytical workloads while remaining maintainable and performant as they scale.