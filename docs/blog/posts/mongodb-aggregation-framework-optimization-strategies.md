---
title: "MongoDB Aggregation Framework Optimization: Advanced Performance Strategies for Complex Data Processing Pipelines"
description: "Master MongoDB aggregation framework optimization with advanced pipeline strategies, indexing techniques, and performance tuning. Learn SQL-familiar aggregation patterns for efficient data processing and analysis with QueryLeaf integration."
date: 2025-09-30
tags: [mongodb, aggregation, performance, optimization, pipeline, data-processing, sql]
---

# MongoDB Aggregation Framework Optimization: Advanced Performance Strategies for Complex Data Processing Pipelines

Complex data analysis and processing require sophisticated aggregation capabilities that can handle large datasets efficiently while maintaining query performance and resource optimization. The MongoDB Aggregation Framework provides a powerful pipeline-based approach to data transformation, filtering, grouping, and analysis that scales from simple queries to complex analytical workloads.

MongoDB's aggregation pipeline enables developers to build sophisticated data processing workflows using a series of stages that transform documents as they flow through the pipeline. Unlike traditional SQL aggregation approaches that can become unwieldy for complex operations, MongoDB's stage-based design provides clarity, composability, and optimization opportunities that support both real-time analytics and batch processing scenarios.

## The Traditional SQL Aggregation Complexity Challenge

Conventional SQL aggregation approaches often become complex and difficult to optimize for advanced data processing requirements:

```sql
-- Traditional PostgreSQL complex aggregation with performance limitations

-- Complex sales analysis requiring multiple subqueries and window functions
WITH regional_sales_base AS (
  SELECT 
    r.region_id,
    r.region_name,
    r.country,
    u.user_id,
    u.email,
    u.created_at as user_registration_date,
    o.order_id,
    o.order_date,
    o.total_amount,
    o.discount_amount,
    o.status as order_status,
    
    -- Complex date calculations
    EXTRACT(YEAR FROM o.order_date) as order_year,
    EXTRACT(MONTH FROM o.order_date) as order_month,
    EXTRACT(QUARTER FROM o.order_date) as order_quarter,
    
    -- Category analysis requiring joins
    STRING_AGG(DISTINCT p.category, ', ') as product_categories,
    COUNT(DISTINCT oi.product_id) as unique_products_ordered,
    SUM(oi.quantity) as total_items_ordered,
    AVG(oi.unit_price) as avg_item_price,
    
    -- Complex business logic calculations
    CASE 
      WHEN o.total_amount > 1000 THEN 'high_value'
      WHEN o.total_amount > 500 THEN 'medium_value'
      ELSE 'low_value'
    END as order_value_category,
    
    -- Window functions for ranking and comparisons
    ROW_NUMBER() OVER (PARTITION BY r.region_id ORDER BY o.total_amount DESC) as region_order_rank,
    PERCENT_RANK() OVER (PARTITION BY r.region_id ORDER BY o.total_amount) as region_percentile_rank,
    
    -- Running totals and moving averages
    SUM(o.total_amount) OVER (
      PARTITION BY r.region_id 
      ORDER BY o.order_date 
      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) as seven_day_rolling_total

  FROM regions r
  INNER JOIN users u ON r.region_id = u.region_id
  INNER JOIN orders o ON u.user_id = o.user_id
  INNER JOIN order_items oi ON o.order_id = oi.order_id
  INNER JOIN products p ON oi.product_id = p.product_id
  WHERE 
    o.order_date >= CURRENT_DATE - INTERVAL '2 years'
    AND o.status IN ('completed', 'shipped', 'delivered')
    AND r.country IN ('US', 'CA', 'UK', 'AU', 'DE')
    AND u.status = 'active'
  GROUP BY 
    r.region_id, r.region_name, r.country, u.user_id, u.email, u.created_at,
    o.order_id, o.order_date, o.total_amount, o.discount_amount, o.status
),

-- Nested aggregation for customer segments
customer_segments AS (
  SELECT 
    user_id,
    email,
    region_name,
    country,
    
    -- Customer value calculations
    COUNT(DISTINCT order_id) as total_orders,
    SUM(total_amount) as lifetime_value,
    AVG(total_amount) as avg_order_value,
    MAX(order_date) as last_order_date,
    MIN(order_date) as first_order_date,
    
    -- Time-based analysis
    EXTRACT(DAYS FROM (MAX(order_date) - MIN(order_date))) as customer_tenure_days,
    COUNT(DISTINCT order_year) as active_years,
    COUNT(DISTINCT order_quarter) as active_quarters,
    
    -- Product diversity analysis
    COUNT(DISTINCT unique_products_ordered) as product_diversity,
    STRING_AGG(DISTINCT product_categories, '; ') as all_categories_purchased,
    
    -- Value segmentation
    CASE 
      WHEN SUM(total_amount) > 5000 AND COUNT(DISTINCT order_id) > 10 THEN 'vip'
      WHEN SUM(total_amount) > 2000 OR COUNT(DISTINCT order_id) > 15 THEN 'loyal'
      WHEN SUM(total_amount) > 500 OR COUNT(DISTINCT order_id) > 5 THEN 'regular'
      ELSE 'occasional'
    END as customer_segment,
    
    -- Recency analysis
    CASE 
      WHEN MAX(order_date) >= CURRENT_DATE - INTERVAL '30 days' THEN 'active'
      WHEN MAX(order_date) >= CURRENT_DATE - INTERVAL '90 days' THEN 'recent'
      WHEN MAX(order_date) >= CURRENT_DATE - INTERVAL '180 days' THEN 'dormant'
      ELSE 'inactive'
    END as recency_status

  FROM regional_sales_base
  GROUP BY user_id, email, region_name, country
),

-- Regional performance aggregation
regional_performance AS (
  SELECT 
    region_name,
    country,
    order_year,
    order_quarter,
    
    -- Volume metrics
    COUNT(DISTINCT user_id) as unique_customers,
    COUNT(DISTINCT order_id) as total_orders,
    SUM(total_amount) as total_revenue,
    SUM(total_items_ordered) as total_items_sold,
    
    -- Average metrics
    AVG(total_amount) as avg_order_value,
    AVG(avg_item_price) as avg_item_price,
    
    -- Growth calculations requiring complex window functions
    LAG(SUM(total_amount)) OVER (
      PARTITION BY region_name 
      ORDER BY order_year, order_quarter
    ) as previous_quarter_revenue,
    
    -- Calculate growth rate
    CASE 
      WHEN LAG(SUM(total_amount)) OVER (
        PARTITION BY region_name 
        ORDER BY order_year, order_quarter
      ) > 0 THEN
        ROUND(
          ((SUM(total_amount) - LAG(SUM(total_amount)) OVER (
            PARTITION BY region_name 
            ORDER BY order_year, order_quarter
          )) / LAG(SUM(total_amount)) OVER (
            PARTITION BY region_name 
            ORDER BY order_year, order_quarter
          ) * 100)::numeric, 2
        )
      ELSE NULL
    END as quarter_over_quarter_growth_pct,
    
    -- Market share analysis
    SUM(total_amount) / SUM(SUM(total_amount)) OVER (PARTITION BY order_year, order_quarter) * 100 as market_share_pct,
    
    -- Customer distribution by segment
    COUNT(*) FILTER (WHERE order_value_category = 'high_value') as high_value_orders,
    COUNT(*) FILTER (WHERE order_value_category = 'medium_value') as medium_value_orders,
    COUNT(*) FILTER (WHERE order_value_category = 'low_value') as low_value_orders

  FROM regional_sales_base
  GROUP BY region_name, country, order_year, order_quarter
),

-- Final comprehensive analysis
comprehensive_analysis AS (
  SELECT 
    rp.*,
    
    -- Customer segment distribution
    cs_stats.vip_customers,
    cs_stats.loyal_customers,
    cs_stats.regular_customers,
    cs_stats.occasional_customers,
    
    -- Recency analysis
    cs_stats.active_customers,
    cs_stats.recent_customers,
    cs_stats.dormant_customers,
    cs_stats.inactive_customers,
    
    -- Customer value metrics
    cs_stats.avg_customer_lifetime_value,
    cs_stats.avg_customer_tenure_days,
    
    -- Performance ranking
    DENSE_RANK() OVER (ORDER BY rp.total_revenue DESC) as revenue_rank,
    DENSE_RANK() OVER (ORDER BY rp.unique_customers DESC) as customer_count_rank,
    DENSE_RANK() OVER (ORDER BY rp.avg_order_value DESC) as aov_rank

  FROM regional_performance rp
  LEFT JOIN (
    SELECT 
      region_name,
      country,
      COUNT(*) FILTER (WHERE customer_segment = 'vip') as vip_customers,
      COUNT(*) FILTER (WHERE customer_segment = 'loyal') as loyal_customers,
      COUNT(*) FILTER (WHERE customer_segment = 'regular') as regular_customers,
      COUNT(*) FILTER (WHERE customer_segment = 'occasional') as occasional_customers,
      COUNT(*) FILTER (WHERE recency_status = 'active') as active_customers,
      COUNT(*) FILTER (WHERE recency_status = 'recent') as recent_customers,
      COUNT(*) FILTER (WHERE recency_status = 'dormant') as dormant_customers,
      COUNT(*) FILTER (WHERE recency_status = 'inactive') as inactive_customers,
      AVG(lifetime_value) as avg_customer_lifetime_value,
      AVG(customer_tenure_days) as avg_customer_tenure_days
    FROM customer_segments
    GROUP BY region_name, country
  ) cs_stats ON rp.region_name = cs_stats.region_name AND rp.country = cs_stats.country
)

SELECT 
  region_name,
  country,
  order_year,
  order_quarter,
  
  -- Core metrics
  unique_customers,
  total_orders,
  ROUND(total_revenue::numeric, 2) as total_revenue,
  ROUND(avg_order_value::numeric, 2) as avg_order_value,
  
  -- Growth analysis
  COALESCE(quarter_over_quarter_growth_pct, 0) as growth_rate_pct,
  ROUND(market_share_pct::numeric, 2) as market_share_pct,
  
  -- Customer segments
  COALESCE(vip_customers, 0) as vip_customers,
  COALESCE(loyal_customers, 0) as loyal_customers,
  COALESCE(regular_customers, 0) as regular_customers,
  
  -- Customer activity
  COALESCE(active_customers, 0) as active_customers,
  COALESCE(dormant_customers + inactive_customers, 0) as at_risk_customers,
  
  -- Performance indicators
  revenue_rank,
  customer_count_rank,
  aov_rank,
  
  -- Composite performance score
  CASE 
    WHEN revenue_rank <= 3 AND customer_count_rank <= 5 AND growth_rate_pct > 10 THEN 'excellent'
    WHEN revenue_rank <= 5 AND growth_rate_pct > 5 THEN 'good'
    WHEN revenue_rank <= 10 OR growth_rate_pct > 0 THEN 'average'
    ELSE 'underperforming'
  END as performance_category,
  
  -- Strategic recommendations
  CASE 
    WHEN at_risk_customers > active_customers * 0.3 THEN 'Focus on customer retention'
    WHEN growth_rate_pct < 0 THEN 'Investigate declining performance'
    WHEN vip_customers = 0 THEN 'Develop VIP customer programs'
    WHEN market_share_pct < 5 THEN 'Expand market presence'
    ELSE 'Maintain current strategies'
  END as recommended_action

FROM comprehensive_analysis
WHERE order_year >= 2023
ORDER BY 
  order_year DESC, 
  order_quarter DESC, 
  total_revenue DESC
LIMIT 50;

-- Problems with traditional SQL aggregation approaches:
-- 1. Complex nested queries that are difficult to understand and maintain
-- 2. Multiple passes through data requiring expensive joins and subqueries
-- 3. Limited optimization opportunities due to rigid query structure
-- 4. Window functions and CTEs create performance bottlenecks with large datasets
-- 5. Difficult to compose and reuse aggregation logic across different queries
-- 6. Limited support for complex data transformations and conditional logic
-- 7. Poor performance with document-oriented or semi-structured data
-- 8. Inflexible aggregation patterns that don't adapt well to changing requirements
-- 9. Complex indexing requirements that may conflict across different aggregation needs
-- 10. Limited support for hierarchical or nested aggregation patterns
```

MongoDB Aggregation Framework provides powerful, optimizable pipeline processing:

```javascript
// MongoDB Aggregation Framework - optimized pipeline processing with advanced strategies
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('ecommerce_analytics_platform');

// Advanced aggregation framework optimization and pipeline management system
class MongoAggregationOptimizer {
  constructor(db) {
    this.db = db;
    this.collections = {
      orders: db.collection('orders'),
      users: db.collection('users'),
      products: db.collection('products'),
      regions: db.collection('regions'),
      analytics: db.collection('analytics_cache')
    };
    
    this.pipelineCache = new Map();
    this.performanceMetrics = new Map();
    this.optimizationStrategies = {
      earlyFiltering: true,
      indexHints: true,
      stageReordering: true,
      memoryOptimization: true,
      incrementalProcessing: true
    };
  }

  async buildOptimizedSalesAnalysisPipeline(options = {}) {
    console.log('Building optimized sales analysis aggregation pipeline...');
    
    const {
      dateRange = { start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), end: new Date() },
      regions = [],
      includeCustomerSegmentation = true,
      includeProductAnalysis = true,
      includeTemporalAnalysis = true,
      optimizationLevel = 'aggressive'
    } = options;

    // Stage 1: Early filtering for maximum performance (always first)
    const matchStage = {
      $match: {
        order_date: { 
          $gte: dateRange.start, 
          $lte: dateRange.end 
        },
        status: { $in: ['completed', 'shipped', 'delivered'] },
        ...(regions.length > 0 && { 'user.region': { $in: regions } }),
        total_amount: { $gt: 0 } // Exclude zero-value orders early
      }
    };

    // Stage 2: Lookup optimizations with targeted field selection
    const userLookupStage = {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user_data',
        pipeline: [ // Use pipeline to reduce data transfer
          {
            $match: { 
              status: 'active',
              ...(regions.length > 0 && { region: { $in: regions } })
            }
          },
          {
            $project: {
              _id: 1,
              email: 1,
              region: 1,
              country: 1,
              registration_date: 1,
              customer_segment: 1
            }
          }
        ]
      }
    };

    // Stage 3: Unwind and reshape data efficiently
    const unwindUserStage = { $unwind: '$user_data' };

    // Stage 4: Add computed fields for analysis
    const addFieldsStage = {
      $addFields: {
        // Date calculations optimized for indexing
        order_year: { $year: '$order_date' },
        order_month: { $month: '$order_date' },
        order_quarter: { 
          $ceil: { $divide: [{ $month: '$order_date' }, 3] }
        },
        order_day_of_week: { $dayOfWeek: '$order_date' },
        
        // Business logic calculations
        order_value_category: {
          $switch: {
            branches: [
              { case: { $gte: ['$total_amount', 1000] }, then: 'high_value' },
              { case: { $gte: ['$total_amount', 500] }, then: 'medium_value' }
            ],
            default: 'low_value'
          }
        },
        
        // Profit margin calculations
        profit_margin: {
          $multiply: [
            { $divide: [
              { $subtract: ['$total_amount', '$cost_amount'] },
              '$total_amount'
            ]},
            100
          ]
        },
        
        // Discount analysis
        discount_percentage: {
          $cond: {
            if: { $gt: ['$total_amount', 0] },
            then: { 
              $multiply: [
                { $divide: ['$discount_amount', { $add: ['$total_amount', '$discount_amount'] }] },
                100
              ]
            },
            else: 0
          }
        },
        
        // Customer tenure at time of order
        customer_tenure_days: {
          $divide: [
            { $subtract: ['$order_date', '$user_data.registration_date'] },
            86400000 // Convert milliseconds to days
          ]
        }
      }
    };

    // Stage 5: Product analysis lookup (conditional)
    const productAnalysisStages = includeProductAnalysis ? [
      {
        $lookup: {
          from: 'order_items',
          localField: '_id',
          foreignField: 'order_id',
          as: 'order_items',
          pipeline: [
            {
              $lookup: {
                from: 'products',
                localField: 'product_id',
                foreignField: '_id',
                as: 'product',
                pipeline: [
                  {
                    $project: {
                      name: 1,
                      category: 1,
                      sub_category: 1,
                      brand: 1,
                      cost_price: 1,
                      margin_percentage: 1
                    }
                  }
                ]
              }
            },
            { $unwind: '$product' },
            {
              $group: {
                _id: '$order_id',
                product_count: { $sum: 1 },
                total_quantity: { $sum: '$quantity' },
                categories: { $addToSet: '$product.category' },
                brands: { $addToSet: '$product.brand' },
                avg_item_margin: { $avg: '$product.margin_percentage' }
              }
            }
          ]
        }
      },
      { $unwind: { path: '$order_items', preserveNullAndEmptyArrays: true } }
    ] : [];

    // Stage 6: Main aggregation pipeline for comprehensive analysis
    const groupingStage = {
      $group: {
        _id: {
          region: '$user_data.region',
          country: '$user_data.country',
          year: '$order_year',
          quarter: '$order_quarter',
          ...(includeTemporalAnalysis && {
            month: '$order_month',
            day_of_week: '$order_day_of_week'
          })
        },
        
        // Volume metrics
        total_orders: { $sum: 1 },
        unique_customers: { $addToSet: '$user_id' },
        total_revenue: { $sum: '$total_amount' },
        total_items_sold: { $sum: { $ifNull: ['$order_items.total_quantity', 0] } },
        
        // Value metrics
        avg_order_value: { $avg: '$total_amount' },
        median_order_value: { $median: { input: '$total_amount', method: 'approximate' } },
        max_order_value: { $max: '$total_amount' },
        min_order_value: { $min: '$total_amount' },
        
        // Profitability metrics
        total_profit: { $sum: { $multiply: ['$total_amount', { $divide: ['$profit_margin', 100] }] } },
        avg_profit_margin: { $avg: '$profit_margin' },
        
        // Discount analysis
        total_discounts_given: { $sum: '$discount_amount' },
        avg_discount_percentage: { $avg: '$discount_percentage' },
        orders_with_discounts: { 
          $sum: { $cond: [{ $gt: ['$discount_amount', 0] }, 1, 0] }
        },
        
        // Customer value distribution
        high_value_orders: { 
          $sum: { $cond: [{ $eq: ['$order_value_category', 'high_value'] }, 1, 0] }
        },
        medium_value_orders: {
          $sum: { $cond: [{ $eq: ['$order_value_category', 'medium_value'] }, 1, 0] }
        },
        low_value_orders: {
          $sum: { $cond: [{ $eq: ['$order_value_category', 'low_value'] }, 1, 0] }
        },
        
        // Product diversity (when product analysis enabled)
        ...(includeProductAnalysis && {
          unique_categories: { $addToSet: '$order_items.categories' },
          unique_brands: { $addToSet: '$order_items.brands' },
          avg_products_per_order: { $avg: '$order_items.product_count' },
          avg_item_margin: { $avg: '$order_items.avg_item_margin' }
        }),
        
        // Customer tenure analysis
        avg_customer_tenure: { $avg: '$customer_tenure_days' },
        new_customer_orders: {
          $sum: { $cond: [{ $lte: ['$customer_tenure_days', 30] }, 1, 0] }
        },
        
        // Sample data for detailed analysis
        sample_order_dates: { $push: '$order_date' },
        sample_customer_segments: { $push: '$user_data.customer_segment' }
      }
    };

    // Stage 7: Post-processing calculations
    const postProcessingStage = {
      $addFields: {
        // Customer metrics
        unique_customer_count: { $size: '$unique_customers' },
        orders_per_customer: { 
          $divide: ['$total_orders', { $size: '$unique_customers' }]
        },
        
        // Revenue per customer
        revenue_per_customer: {
          $divide: ['$total_revenue', { $size: '$unique_customers' }]
        },
        
        // Profit margins
        profit_margin_percentage: {
          $cond: {
            if: { $gt: ['$total_revenue', 0] },
            then: { $multiply: [{ $divide: ['$total_profit', '$total_revenue'] }, 100] },
            else: 0
          }
        },
        
        // Discount impact
        discount_rate: {
          $cond: {
            if: { $gt: ['$total_orders', 0] },
            then: { $multiply: [{ $divide: ['$orders_with_discounts', '$total_orders'] }, 100] },
            else: 0
          }
        },
        
        // Order value distribution
        high_value_percentage: {
          $multiply: [{ $divide: ['$high_value_orders', '$total_orders'] }, 100]
        },
        
        // New vs returning customer ratio
        new_customer_percentage: {
          $multiply: [{ $divide: ['$new_customer_orders', '$total_orders'] }, 100]
        },
        
        // Category diversity (when product analysis enabled)
        ...(includeProductAnalysis && {
          category_diversity_score: {
            $size: { $reduce: {
              input: '$unique_categories',
              initialValue: [],
              in: { $setUnion: ['$$value', '$$this'] }
            }}
          }
        }),
        
        // Performance indicators
        performance_score: {
          $add: [
            { $multiply: [{ $ln: { $add: ['$total_revenue', 1] } }, 0.3] },
            { $multiply: ['$avg_profit_margin', 0.2] },
            { $multiply: [{ $ln: { $add: ['$unique_customer_count', 1] } }, 0.3] },
            { $multiply: ['$orders_per_customer', 0.2] }
          ]
        }
      }
    };

    // Stage 8: Growth analysis using window operations
    const windowAnalysisStage = {
      $setWindowFields: {
        partitionBy: { region: '$_id.region', country: '$_id.country' },
        sortBy: { year: '$_id.year', quarter: '$_id.quarter' },
        output: {
          previous_quarter_revenue: {
            $shift: {
              output: '$total_revenue',
              by: -1
            }
          },
          revenue_trend: {
            $linearFill: '$total_revenue'
          },
          quarter_rank: {
            $rank: {}
          },
          rolling_avg_revenue: {
            $avg: '$total_revenue',
            window: {
              range: [-3, 0],
              unit: 'position'
            }
          }
        }
      }
    };

    // Stage 9: Growth calculations
    const growthCalculationStage = {
      $addFields: {
        quarter_over_quarter_growth: {
          $cond: {
            if: { $and: [
              { $ne: ['$previous_quarter_revenue', null] },
              { $gt: ['$previous_quarter_revenue', 0] }
            ]},
            then: {
              $multiply: [
                { $divide: [
                  { $subtract: ['$total_revenue', '$previous_quarter_revenue'] },
                  '$previous_quarter_revenue'
                ]},
                100
              ]
            },
            else: null
          }
        },
        
        performance_vs_avg: {
          $multiply: [
            { $divide: [
              { $subtract: ['$total_revenue', '$rolling_avg_revenue'] },
              '$rolling_avg_revenue'
            ]},
            100
          ]
        },
        
        growth_classification: {
          $switch: {
            branches: [
              { case: { $gte: ['$quarter_over_quarter_growth', 20] }, then: 'high_growth' },
              { case: { $gte: ['$quarter_over_quarter_growth', 10] }, then: 'moderate_growth' },
              { case: { $gte: ['$quarter_over_quarter_growth', 0] }, then: 'stable' },
              { case: { $gte: ['$quarter_over_quarter_growth', -10] }, then: 'declining' }
            ],
            default: 'rapidly_declining'
          }
        }
      }
    };

    // Stage 10: Final projections and cleanup
    const finalProjectionStage = {
      $project: {
        // Location data
        region: '$_id.region',
        country: '$_id.country',
        year: '$_id.year',
        quarter: '$_id.quarter',
        ...(includeTemporalAnalysis && {
          month: '$_id.month',
          day_of_week: '$_id.day_of_week'
        }),
        
        // Core metrics (rounded for presentation)
        total_orders: 1,
        unique_customer_count: 1,
        total_revenue: { $round: ['$total_revenue', 2] },
        total_profit: { $round: ['$total_profit', 2] },
        
        // Averages and rates
        avg_order_value: { $round: ['$avg_order_value', 2] },
        median_order_value: { $round: ['$median_order_value', 2] },
        revenue_per_customer: { $round: ['$revenue_per_customer', 2] },
        orders_per_customer: { $round: ['$orders_per_customer', 2] },
        
        // Percentages
        profit_margin_percentage: { $round: ['$profit_margin_percentage', 2] },
        discount_rate: { $round: ['$discount_rate', 2] },
        high_value_percentage: { $round: ['$high_value_percentage', 2] },
        new_customer_percentage: { $round: ['$new_customer_percentage', 2] },
        
        // Growth metrics
        quarter_over_quarter_growth: { $round: ['$quarter_over_quarter_growth', 2] },
        performance_vs_avg: { $round: ['$performance_vs_avg', 2] },
        growth_classification: 1,
        
        // Performance indicators
        performance_score: { $round: ['$performance_score', 2] },
        quarter_rank: 1,
        
        // Product analysis (conditional)
        ...(includeProductAnalysis && {
          category_diversity_score: 1,
          avg_products_per_order: { $round: ['$avg_products_per_order', 2] },
          avg_item_margin: { $round: ['$avg_item_margin', 2] }
        }),
        
        // Strategic indicators
        strategic_priority: {
          $switch: {
            branches: [
              { 
                case: { 
                  $and: [
                    { $gte: ['$performance_score', 15] },
                    { $gte: ['$quarter_over_quarter_growth', 10] }
                  ]
                }, 
                then: 'high_potential' 
              },
              { 
                case: { 
                  $and: [
                    { $gte: ['$total_revenue', 50000] },
                    { $gte: ['$profit_margin_percentage', 15] }
                  ]
                }, 
                then: 'cash_cow' 
              },
              { 
                case: { $lte: ['$quarter_over_quarter_growth', -10] }, 
                then: 'needs_attention' 
              }
            ],
            default: 'monitor'
          }
        }
      }
    };

    // Stage 11: Sorting for optimal presentation
    const sortStage = {
      $sort: {
        year: -1,
        quarter: -1,
        total_revenue: -1,
        performance_score: -1
      }
    };

    // Build complete optimized pipeline
    const pipeline = [
      matchStage,
      userLookupStage,
      unwindUserStage,
      addFieldsStage,
      ...productAnalysisStages,
      groupingStage,
      postProcessingStage,
      windowAnalysisStage,
      growthCalculationStage,
      finalProjectionStage,
      sortStage
    ];

    // Add performance optimization hints based on level
    const optimizedPipeline = await this.applyOptimizationStrategies(pipeline, optimizationLevel);
    
    console.log(`Optimized aggregation pipeline built with ${optimizedPipeline.length} stages`);
    return optimizedPipeline;
  }

  async applyOptimizationStrategies(pipeline, optimizationLevel = 'standard') {
    console.log(`Applying ${optimizationLevel} optimization strategies...`);
    
    let optimizedPipeline = [...pipeline];
    
    if (this.optimizationStrategies.earlyFiltering) {
      // Ensure filtering stages are as early as possible
      optimizedPipeline = this.moveFilteringStagesEarly(optimizedPipeline);
    }
    
    if (this.optimizationStrategies.indexHints) {
      // Add index hints for better query planning
      optimizedPipeline = this.addIndexHints(optimizedPipeline);
    }
    
    if (this.optimizationStrategies.stageReordering && optimizationLevel === 'aggressive') {
      // Reorder stages for optimal performance
      optimizedPipeline = this.reorderPipelineStages(optimizedPipeline);
    }
    
    if (this.optimizationStrategies.memoryOptimization) {
      // Add memory usage optimizations
      optimizedPipeline = this.optimizeMemoryUsage(optimizedPipeline);
    }
    
    return optimizedPipeline;
  }

  moveFilteringStagesEarly(pipeline) {
    const filterStages = [];
    const otherStages = [];
    
    pipeline.forEach(stage => {
      if (stage.$match) {
        filterStages.push(stage);
      } else {
        otherStages.push(stage);
      }
    });
    
    return [...filterStages, ...otherStages];
  }

  addIndexHints(pipeline) {
    // Add allowDiskUse and other performance hints
    const firstStage = pipeline[0];
    
    if (firstStage && firstStage.$match) {
      // Add hint for optimal index usage
      pipeline.unshift({
        $indexStats: {}
      });
    }
    
    return pipeline;
  }

  optimizeMemoryUsage(pipeline) {
    // Add memory optimization settings
    return pipeline.map(stage => {
      if (stage.$group || stage.$sort) {
        return {
          ...stage,
          allowDiskUse: true
        };
      }
      return stage;
    });
  }

  async executeOptimizedAggregation(pipeline, options = {}) {
    console.log('Executing optimized aggregation pipeline...');
    
    const {
      collection = 'orders',
      explain = false,
      allowDiskUse = true,
      maxTimeMS = 300000, // 5 minutes
      batchSize = 1000
    } = options;

    const targetCollection = this.collections[collection];
    const startTime = Date.now();
    
    try {
      if (explain) {
        // Return execution plan for analysis
        const explainResult = await targetCollection.aggregate(pipeline).explain('executionStats');
        return {
          success: true,
          explain: explainResult,
          executionTimeMs: Date.now() - startTime
        };
      }

      // Execute aggregation with options
      const cursor = targetCollection.aggregate(pipeline, {
        allowDiskUse,
        maxTimeMS,
        batchSize,
        comment: `Optimized aggregation - ${new Date().toISOString()}`
      });

      const results = await cursor.toArray();
      const executionTime = Date.now() - startTime;
      
      // Cache pipeline performance metrics
      const pipelineHash = this.generatePipelineHash(pipeline);
      this.performanceMetrics.set(pipelineHash, {
        executionTimeMs: executionTime,
        resultCount: results.length,
        timestamp: new Date(),
        collection: collection
      });

      console.log(`Aggregation completed in ${executionTime}ms, returned ${results.length} documents`);
      
      return {
        success: true,
        results: results,
        executionTimeMs: executionTime,
        resultCount: results.length,
        pipelineHash: pipelineHash
      };
      
    } catch (error) {
      console.error('Aggregation execution failed:', error);
      return {
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      };
    }
  }

  async buildCustomerSegmentationPipeline(options = {}) {
    console.log('Building advanced customer segmentation pipeline...');
    
    const {
      lookbackMonths = 12,
      includeProductAffinity = true,
      includeGeographicAnalysis = true,
      segmentationModel = 'rfm' // recency, frequency, monetary
    } = options;

    const lookbackDate = new Date();
    lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);

    const pipeline = [
      // Stage 1: Filter active users and recent data
      {
        $match: {
          status: 'active',
          created_at: { $lte: new Date() },
          deleted_at: { $exists: false }
        }
      },
      
      // Stage 2: Join with order data
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'user_id',
          as: 'orders',
          pipeline: [
            {
              $match: {
                order_date: { $gte: lookbackDate },
                status: { $in: ['completed', 'shipped', 'delivered'] },
                total_amount: { $gt: 0 }
              }
            },
            {
              $project: {
                order_date: 1,
                total_amount: 1,
                discount_amount: 1,
                items: 1,
                product_categories: 1
              }
            }
          ]
        }
      },
      
      // Stage 3: Calculate RFM metrics
      {
        $addFields: {
          // Recency: Days since last purchase
          recency_days: {
            $cond: {
              if: { $gt: [{ $size: '$orders' }, 0] },
              then: {
                $divide: [
                  { $subtract: [
                    new Date(),
                    { $max: '$orders.order_date' }
                  ]},
                  86400000 // Convert to days
                ]
              },
              else: 9999 // Very high number for users with no orders
            }
          },
          
          // Frequency: Number of orders
          frequency: { $size: '$orders' },
          
          // Monetary: Total amount spent
          monetary_value: { $sum: '$orders.total_amount' },
          
          // Additional metrics
          avg_order_value: { $avg: '$orders.total_amount' },
          total_discount_used: { $sum: '$orders.discount_amount' },
          order_date_range: {
            $cond: {
              if: { $gt: [{ $size: '$orders' }, 0] },
              then: {
                $divide: [
                  { $subtract: [
                    { $max: '$orders.order_date' },
                    { $min: '$orders.order_date' }
                  ]},
                  86400000
                ]
              },
              else: 0
            }
          }
        }
      },
      
      // Stage 4: Product affinity analysis (conditional)
      ...(includeProductAffinity ? [
        {
          $addFields: {
            product_categories: {
              $reduce: {
                input: '$orders.product_categories',
                initialValue: [],
                in: { $setUnion: ['$$value', '$$this'] }
              }
            },
            category_diversity: {
              $size: {
                $reduce: {
                  input: '$orders.product_categories',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] }
                }
              }
            }
          }
        }
      ] : []),
      
      // Stage 5: Calculate percentiles for RFM scoring
      {
        $setWindowFields: {
          sortBy: { recency_days: 1 },
          output: {
            recency_percentile: {
              $percentRank: {
                input: '$recency_days',
                range: [0, 1]
              }
            }
          }
        }
      },
      {
        $setWindowFields: {
          sortBy: { frequency: 1 },
          output: {
            frequency_percentile: {
              $percentRank: {
                input: '$frequency',
                range: [0, 1]
              }
            }
          }
        }
      },
      {
        $setWindowFields: {
          sortBy: { monetary_value: 1 },
          output: {
            monetary_percentile: {
              $percentRank: {
                input: '$monetary_value',
                range: [0, 1]
              }
            }
          }
        }
      },
      
      // Stage 6: Calculate RFM scores
      {
        $addFields: {
          // Invert recency score (lower days = higher score)
          recency_score: {
            $ceil: { $multiply: [{ $subtract: [1, '$recency_percentile'] }, 5] }
          },
          frequency_score: {
            $ceil: { $multiply: ['$frequency_percentile', 5] }
          },
          monetary_score: {
            $ceil: { $multiply: ['$monetary_percentile', 5] }
          }
        }
      },
      
      // Stage 7: Generate customer segments
      {
        $addFields: {
          rfm_score: {
            $concat: [
              { $toString: '$recency_score' },
              { $toString: '$frequency_score' },
              { $toString: '$monetary_score' }
            ]
          },
          
          // Comprehensive customer segment classification
          customer_segment: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ['$recency_score', 4] },
                      { $gte: ['$frequency_score', 4] },
                      { $gte: ['$monetary_score', 4] }
                    ]
                  },
                  then: 'champions'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$recency_score', 3] },
                      { $gte: ['$frequency_score', 3] },
                      { $gte: ['$monetary_score', 4] }
                    ]
                  },
                  then: 'loyal_customers'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$recency_score', 4] },
                      { $lte: ['$frequency_score', 2] },
                      { $gte: ['$monetary_score', 3] }
                    ]
                  },
                  then: 'potential_loyalists'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$recency_score', 4] },
                      { $lte: ['$frequency_score', 1] },
                      { $lte: ['$monetary_score', 2] }
                    ]
                  },
                  then: 'new_customers'
                },
                {
                  case: {
                    $and: [
                      { $lte: ['$recency_score', 2] },
                      { $gte: ['$frequency_score', 3] },
                      { $gte: ['$monetary_score', 3] }
                    ]
                  },
                  then: 'at_risk'
                },
                {
                  case: {
                    $and: [
                      { $lte: ['$recency_score', 2] },
                      { $lte: ['$frequency_score', 2] },
                      { $gte: ['$monetary_score', 3] }
                    ]
                  },
                  then: 'cannot_lose_them'
                },
                {
                  case: {
                    $and: [
                      { $lte: ['$recency_score', 2] },
                      { $lte: ['$frequency_score', 2] },
                      { $lte: ['$monetary_score', 2] }
                    ]
                  },
                  then: 'hibernating'
                }
              ],
              default: 'promising'
            }
          },
          
          // Customer lifetime value prediction
          predicted_clv: {
            $multiply: [
              '$avg_order_value',
              '$frequency',
              { $divide: ['$order_date_range', 365] }, // Annualized frequency
              { $subtract: [5, { $divide: ['$recency_days', 73] }] } // Recency factor
            ]
          },
          
          // Churn risk score
          churn_risk_score: {
            $cond: {
              if: { $gt: ['$recency_days', 90] },
              then: {
                $add: [
                  { $multiply: ['$recency_days', 0.01] },
                  { $multiply: [{ $subtract: [5, '$frequency_score'] }, 0.2] }
                ]
              },
              else: 0.1
            }
          }
        }
      },
      
      // Stage 8: Final projection with insights
      {
        $project: {
          _id: 1,
          email: 1,
          region: 1,
          country: 1,
          registration_date: 1,
          
          // RFM metrics
          recency_days: { $round: ['$recency_days', 0] },
          frequency: 1,
          monetary_value: { $round: ['$monetary_value', 2] },
          avg_order_value: { $round: ['$avg_order_value', 2] },
          
          // RFM scores
          recency_score: 1,
          frequency_score: 1,
          monetary_score: 1,
          rfm_score: 1,
          
          // Segmentation
          customer_segment: 1,
          predicted_clv: { $round: ['$predicted_clv', 2] },
          churn_risk_score: { $round: ['$churn_risk_score', 2] },
          
          // Additional insights
          ...(includeProductAffinity && {
            category_diversity: 1,
            preferred_categories: '$product_categories'
          }),
          
          // Actionable recommendations
          recommended_action: {
            $switch: {
              branches: [
                { case: { $eq: ['$customer_segment', 'champions'] }, then: 'Reward and upsell' },
                { case: { $eq: ['$customer_segment', 'loyal_customers'] }, then: 'Maintain engagement' },
                { case: { $eq: ['$customer_segment', 'potential_loyalists'] }, then: 'Increase frequency' },
                { case: { $eq: ['$customer_segment', 'new_customers'] }, then: 'Onboarding focus' },
                { case: { $eq: ['$customer_segment', 'at_risk'] }, then: 'Re-engagement campaign' },
                { case: { $eq: ['$customer_segment', 'cannot_lose_them'] }, then: 'Win-back strategy' },
                { case: { $eq: ['$customer_segment', 'hibernating'] }, then: 'Reactivation offer' }
              ],
              default: 'General nurturing'
            }
          }
        }
      },
      
      // Stage 9: Sort by value for prioritization
      {
        $sort: {
          customer_segment: 1,
          predicted_clv: -1,
          monetary_value: -1
        }
      }
    ];

    console.log('Customer segmentation pipeline built successfully');
    return pipeline;
  }

  async performPipelineBenchmarking(pipelines, options = {}) {
    console.log('Performing comprehensive pipeline benchmarking...');
    
    const {
      iterations = 3,
      includeExplainPlans = true,
      warmupRuns = 1
    } = options;

    const benchmarkResults = [];
    
    for (const [pipelineName, pipeline] of Object.entries(pipelines)) {
      console.log(`Benchmarking pipeline: ${pipelineName}`);
      
      const pipelineResults = {
        name: pipelineName,
        stages: pipeline.length,
        iterations: [],
        avgExecutionTime: 0,
        minExecutionTime: Infinity,
        maxExecutionTime: 0,
        explainPlan: null
      };

      // Warmup runs
      for (let w = 0; w < warmupRuns; w++) {
        await this.executeOptimizedAggregation(pipeline, { collection: 'orders' });
      }

      // Benchmark iterations
      for (let i = 0; i < iterations; i++) {
        const result = await this.executeOptimizedAggregation(pipeline, { 
          collection: 'orders',
          explain: i === 0 && includeExplainPlans
        });
        
        if (result.success) {
          if (result.explain) {
            pipelineResults.explainPlan = result.explain;
          }
          
          if (result.executionTimeMs) {
            pipelineResults.iterations.push(result.executionTimeMs);
            pipelineResults.minExecutionTime = Math.min(pipelineResults.minExecutionTime, result.executionTimeMs);
            pipelineResults.maxExecutionTime = Math.max(pipelineResults.maxExecutionTime, result.executionTimeMs);
          }
        }
      }

      // Calculate averages
      if (pipelineResults.iterations.length > 0) {
        pipelineResults.avgExecutionTime = pipelineResults.iterations.reduce((sum, time) => sum + time, 0) / pipelineResults.iterations.length;
      }

      benchmarkResults.push(pipelineResults);
    }

    // Sort by performance
    benchmarkResults.sort((a, b) => a.avgExecutionTime - b.avgExecutionTime);

    console.log('Pipeline benchmarking completed');
    return benchmarkResults;
  }

  generatePipelineHash(pipeline) {
    const pipelineString = JSON.stringify(pipeline, Object.keys(pipeline).sort());
    return require('crypto').createHash('md5').update(pipelineString).digest('hex');
  }

  async createOptimalIndexes() {
    console.log('Creating optimal indexes for aggregation performance...');
    
    const orders = this.collections.orders;
    const users = this.collections.users;
    
    try {
      // Compound indexes for common aggregation patterns
      await orders.createIndex({ 
        order_date: -1, 
        status: 1, 
        user_id: 1 
      }, { background: true });
      
      await orders.createIndex({ 
        user_id: 1, 
        order_date: -1, 
        total_amount: -1 
      }, { background: true });
      
      await orders.createIndex({ 
        status: 1, 
        order_date: -1 
      }, { background: true });
      
      await users.createIndex({ 
        status: 1, 
        region: 1, 
        created_at: -1 
      }, { background: true });
      
      console.log('Optimal indexes created successfully');
    } catch (error) {
      console.warn('Index creation warning:', error.message);
    }
  }
}

// Benefits of MongoDB Aggregation Framework Optimization:
// - Pipeline-based design enables clear, composable data transformations
// - Automatic query optimization and index utilization across pipeline stages  
// - Memory and performance optimizations with allowDiskUse and stage reordering
// - Advanced window functions and statistical operations for complex analysis
// - Flexible stage composition that adapts to changing analytical requirements
// - Integration with MongoDB's distributed architecture for horizontal scaling
// - Real-time and batch processing capabilities with consistent optimization patterns
// - Rich data transformation functions supporting nested documents and arrays
// - Performance monitoring and explain plan analysis for continuous optimization
// - SQL-compatible aggregation patterns through QueryLeaf integration

module.exports = {
  MongoAggregationOptimizer
};
```

## Understanding MongoDB Aggregation Framework Architecture

### Advanced Pipeline Optimization Strategies and Performance Tuning

Implement sophisticated aggregation optimization patterns for production-scale analytics:

```javascript
// Advanced aggregation optimization patterns and performance monitoring
class ProductionAggregationManager {
  constructor(db) {
    this.db = db;
    this.pipelineLibrary = new Map();
    this.performanceBaselines = new Map();
    this.optimizationRules = [
      'early_filtering',
      'index_utilization', 
      'memory_optimization',
      'stage_reordering',
      'parallel_processing'
    ];
  }

  async buildRealtimeAnalyticsPipeline(analyticsConfig) {
    console.log('Building real-time analytics aggregation pipeline...');
    
    const {
      timeWindow = '1h',
      updateInterval = '5m',
      includeTrends = true,
      includeAnomalyDetection = true,
      alertThresholds = {}
    } = analyticsConfig;

    // Real-time metrics pipeline with change stream integration
    const realtimePipeline = [
      {
        $match: {
          operationType: { $in: ['insert', 'update'] },
          'fullDocument.order_date': {
            $gte: new Date(Date.now() - this.parseTimeWindow(timeWindow))
          },
          'fullDocument.status': { $in: ['completed', 'shipped', 'delivered'] }
        }
      },
      
      {
        $replaceRoot: {
          newRoot: '$fullDocument'
        }
      },
      
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: '$order_date',
              unit: 'minute',
              binSize: parseInt(updateInterval)
            }
          },
          
          // Real-time metrics
          order_count: { $sum: 1 },
          revenue: { $sum: '$total_amount' },
          avg_order_value: { $avg: '$total_amount' },
          unique_customers: { $addToSet: '$user_id' },
          
          // Geographic distribution
          regions: { $addToSet: '$region' },
          countries: { $addToSet: '$country' },
          
          // Product performance
          product_categories: { $push: '$product_categories' },
          
          // Anomaly detection data points
          revenue_samples: { $push: '$total_amount' },
          order_timestamps: { $push: '$order_date' }
        }
      },
      
      {
        $addFields: {
          time_bucket: '$_id',
          unique_customer_count: { $size: '$unique_customers' },
          region_diversity: { $size: '$regions' },
          
          // Statistical measures for anomaly detection
          revenue_std: { $stdDevPop: '$revenue_samples' },
          revenue_median: { $median: { input: '$revenue_samples', method: 'approximate' } },
          
          // Performance indicators
          orders_per_minute: { 
            $divide: ['$order_count', parseInt(updateInterval)]
          },
          revenue_per_minute: {
            $divide: ['$revenue', parseInt(updateInterval)]
          }
        }
      },
      
      // Trend analysis using window operations
      {
        $setWindowFields: {
          sortBy: { time_bucket: 1 },
          output: {
            revenue_trend: {
              $linearFill: '$revenue'
            },
            moving_avg_revenue: {
              $avg: '$revenue',
              window: {
                range: [-6, 0], // 7-period moving average
                unit: 'position'
              }
            },
            revenue_change: {
              $subtract: [
                '$revenue',
                {
                  $shift: {
                    output: '$revenue',
                    by: -1
                  }
                }
              ]
            }
          }
        }
      },
      
      // Anomaly detection
      ...(includeAnomalyDetection ? [
        {
          $addFields: {
            anomaly_score: {
              $abs: {
                $divide: [
                  { $subtract: ['$revenue', '$moving_avg_revenue'] },
                  { $add: ['$revenue_std', 1] }
                ]
              }
            },
            
            is_anomaly: {
              $gt: [
                {
                  $abs: {
                    $divide: [
                      { $subtract: ['$revenue', '$moving_avg_revenue'] },
                      { $add: ['$revenue_std', 1] }
                    ]
                  }
                },
                2 // 2 standard deviations
              ]
            },
            
            performance_alert: {
              $cond: {
                if: {
                  $or: [
                    { $lt: ['$revenue', alertThresholds.minRevenue || 0] },
                    { $gt: ['$orders_per_minute', alertThresholds.maxOrderRate || 1000] },
                    { $lt: ['$avg_order_value', alertThresholds.minAOV || 0] }
                  ]
                },
                then: true,
                else: false
              }
            }
          }
        }
      ] : []),
      
      {
        $project: {
          time_bucket: 1,
          order_count: 1,
          revenue: { $round: ['$revenue', 2] },
          avg_order_value: { $round: ['$avg_order_value', 2] },
          unique_customer_count: 1,
          region_diversity: 1,
          
          // Trend indicators
          ...(includeTrends && {
            revenue_change: { $round: ['$revenue_change', 2] },
            moving_avg_revenue: { $round: ['$moving_avg_revenue', 2] },
            trend_direction: {
              $switch: {
                branches: [
                  { case: { $gt: ['$revenue_change', 0] }, then: 'up' },
                  { case: { $lt: ['$revenue_change', 0] }, then: 'down' }
                ],
                default: 'stable'
              }
            }
          }),
          
          // Alert information
          ...(includeAnomalyDetection && {
            anomaly_score: { $round: ['$anomaly_score', 3] },
            is_anomaly: 1,
            performance_alert: 1
          }),
          
          // Timestamp for real-time tracking
          computed_at: new Date()
        }
      },
      
      {
        $sort: { time_bucket: -1 }
      },
      
      {
        $limit: 100 // Keep recent data points
      }
    ];

    return realtimePipeline;
  }

  async optimizePipelineForScale(pipeline, scaleRequirements) {
    console.log('Optimizing pipeline for scale requirements...');
    
    const {
      expectedDocuments = 1000000,
      maxExecutionTime = 60000,
      memoryLimit = '100M',
      parallelization = true
    } = scaleRequirements;

    let optimizedPipeline = [...pipeline];

    // 1. Add early filtering based on data volume
    if (expectedDocuments > 100000) {
      optimizedPipeline = this.addEarlyFiltering(optimizedPipeline);
    }

    // 2. Optimize grouping operations for large datasets
    optimizedPipeline = this.optimizeGroupingStages(optimizedPipeline, expectedDocuments);

    // 3. Add memory management directives
    optimizedPipeline = this.addMemoryManagement(optimizedPipeline, memoryLimit);

    // 4. Enable parallelization where possible
    if (parallelization) {
      optimizedPipeline = this.enableParallelProcessing(optimizedPipeline);
    }

    // 5. Add performance monitoring
    optimizedPipeline = this.addPerformanceMonitoring(optimizedPipeline);

    return optimizedPipeline;
  }

  addEarlyFiltering(pipeline) {
    // Move all $match stages to the beginning
    const matchStages = pipeline.filter(stage => stage.$match);
    const otherStages = pipeline.filter(stage => !stage.$match);
    
    return [...matchStages, ...otherStages];
  }

  optimizeGroupingStages(pipeline, expectedDocuments) {
    return pipeline.map(stage => {
      if (stage.$group && expectedDocuments > 500000) {
        return {
          ...stage,
          allowDiskUse: true,
          // Use approximate algorithms for large datasets
          ...(stage.$group.$median && {
            $group: {
              ...stage.$group,
              $median: {
                ...stage.$group.$median,
                method: 'approximate'
              }
            }
          })
        };
      }
      return stage;
    });
  }

  addMemoryManagement(pipeline, memoryLimit) {
    return pipeline.map((stage, index) => {
      // Add memory management for memory-intensive stages
      if (stage.$sort || stage.$group || stage.$bucket) {
        return {
          ...stage,
          allowDiskUse: true,
          maxMemoryUsageBytes: this.parseMemoryLimit(memoryLimit)
        };
      }
      return stage;
    });
  }

  parseMemoryLimit(limit) {
    const units = { M: 1024 * 1024, G: 1024 * 1024 * 1024 };
    const match = limit.match(/(\d+)([MG])/);
    return match ? parseInt(match[1]) * units[match[2]] : 100 * 1024 * 1024;
  }

  parseTimeWindow(timeWindow) {
    const units = { m: 60000, h: 3600000, d: 86400000 };
    const match = timeWindow.match(/(\d+)([mhd])/);
    return match ? parseInt(match[1]) * units[match[2]] : 3600000;
  }
}
```

## SQL-Style Aggregation Optimization with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB aggregation optimization and complex analytics:

```sql
-- QueryLeaf aggregation framework optimization with SQL-familiar patterns

-- Advanced sales analysis with optimized aggregation pipeline
WITH regional_sales_optimized AS (
  SELECT 
    region,
    country,
    YEAR(order_date) as order_year,
    QUARTER(order_date) as order_quarter,
    MONTH(order_date) as order_month,
    
    -- Optimized aggregation functions
    COUNT(*) as total_orders,
    COUNT(DISTINCT user_id) as unique_customers,
    SUM(total_amount) as total_revenue,
    AVG(total_amount) as avg_order_value,
    MEDIAN_APPROX(total_amount) as median_order_value,
    STDDEV(total_amount) as revenue_stddev,
    
    -- Advanced statistical functions
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_amount) as q1_order_value,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_amount) as q3_order_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_amount) as p95_order_value,
    
    -- Product diversity metrics
    COUNT(DISTINCT UNNEST(product_categories)) as unique_categories,
    AVG(ARRAY_LENGTH(product_categories)) as avg_categories_per_order,
    
    -- Customer behavior analysis
    COUNT(*) FILTER (WHERE total_amount > 1000) as high_value_orders,
    COUNT(*) FILTER (WHERE discount_amount > 0) as discounted_orders,
    AVG(discount_amount) as avg_discount,
    
    -- Time-based patterns
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM order_date) IN (0, 6)) as weekend_orders,
    COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM order_date) BETWEEN 9 AND 17) as business_hours_orders,
    
    -- Customer tenure analysis
    AVG(EXTRACT(DAYS FROM order_date - user_registration_date)) as avg_customer_tenure,
    
    -- Seasonal indicators
    CASE 
      WHEN MONTH(order_date) IN (12, 1, 2) THEN 'winter'
      WHEN MONTH(order_date) IN (3, 4, 5) THEN 'spring'
      WHEN MONTH(order_date) IN (6, 7, 8) THEN 'summer'
      ELSE 'fall'
    END as season
    
  FROM orders o
  INNER JOIN users u ON o.user_id = u._id
  WHERE o.order_date >= CURRENT_DATE - INTERVAL '2 years'
    AND o.status IN ('completed', 'shipped', 'delivered')
    AND o.total_amount > 0
    AND u.status = 'active'
  GROUP BY region, country, order_year, order_quarter, order_month
  
  -- QueryLeaf optimization hints
  USING INDEX (order_date_status_user_idx)
  WITH AGGREGATION_OPTIONS (
    allow_disk_use = true,
    max_memory_usage = '200M',
    optimization_level = 'aggressive'
  )
),

-- Window functions for trend analysis and growth calculations
growth_analysis AS (
  SELECT 
    *,
    
    -- Period-over-period growth calculations
    LAG(total_revenue) OVER (
      PARTITION BY region, country 
      ORDER BY order_year, order_quarter, order_month
    ) as previous_period_revenue,
    
    LAG(unique_customers) OVER (
      PARTITION BY region, country
      ORDER BY order_year, order_quarter, order_month  
    ) as previous_period_customers,
    
    -- Moving averages for trend smoothing
    AVG(total_revenue) OVER (
      PARTITION BY region, country
      ORDER BY order_year, order_quarter, order_month
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) as three_period_avg_revenue,
    
    AVG(avg_order_value) OVER (
      PARTITION BY region, country
      ORDER BY order_year, order_quarter, order_month
      ROWS BETWEEN 5 PRECEDING AND CURRENT ROW  
    ) as six_period_avg_aov,
    
    -- Rank and percentile calculations
    RANK() OVER (
      PARTITION BY order_year, order_quarter
      ORDER BY total_revenue DESC
    ) as revenue_rank,
    
    PERCENT_RANK() OVER (
      PARTITION BY order_year, order_quarter
      ORDER BY total_revenue
    ) as revenue_percentile,
    
    -- Running totals and cumulative metrics
    SUM(total_revenue) OVER (
      PARTITION BY region, country, order_year
      ORDER BY order_quarter, order_month
      ROWS UNBOUNDED PRECEDING
    ) as ytd_revenue,
    
    -- Anomaly detection using statistical functions
    ABS(total_revenue - AVG(total_revenue) OVER (
      PARTITION BY region, country
      ORDER BY order_year, order_quarter, order_month
      ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
    )) / STDDEV(total_revenue) OVER (
      PARTITION BY region, country  
      ORDER BY order_year, order_quarter, order_month
      ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
    ) as revenue_z_score
    
  FROM regional_sales_optimized
),

-- Customer segmentation using advanced analytics
customer_segmentation AS (
  SELECT 
    user_id,
    region,
    country,
    registration_date,
    
    -- RFM analysis (Recency, Frequency, Monetary)
    EXTRACT(DAYS FROM CURRENT_DATE - MAX(order_date)) as recency_days,
    COUNT(*) as frequency,
    SUM(total_amount) as monetary_value,
    AVG(total_amount) as avg_order_value,
    
    -- Advanced customer metrics
    MAX(order_date) - MIN(order_date) as customer_lifespan,
    COUNT(DISTINCT EXTRACT(QUARTER FROM order_date)) as active_quarters,
    STDDEV(total_amount) as order_consistency,
    
    -- Product affinity analysis
    COUNT(DISTINCT UNNEST(product_categories)) as category_diversity,
    MODE() WITHIN GROUP (ORDER BY UNNEST(product_categories)) as preferred_category,
    
    -- Seasonal behavior patterns
    AVG(total_amount) FILTER (WHERE season = 'winter') as winter_avg_spend,
    AVG(total_amount) FILTER (WHERE season = 'summer') as summer_avg_spend,
    
    -- Channel preference analysis  
    COUNT(*) FILTER (WHERE channel = 'mobile') as mobile_orders,
    COUNT(*) FILTER (WHERE channel = 'web') as web_orders,
    COUNT(*) FILTER (WHERE channel = 'store') as store_orders,
    
    -- Time-based behavior patterns
    AVG(EXTRACT(HOUR FROM order_timestamp)) as preferred_hour,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM order_date) IN (0, 6)) / COUNT(*)::float as weekend_preference,
    
    -- Discount utilization patterns
    COUNT(*) FILTER (WHERE discount_amount > 0) / COUNT(*)::float as discount_utilization_rate,
    AVG(discount_amount) FILTER (WHERE discount_amount > 0) as avg_discount_when_used
    
  FROM orders o
  INNER JOIN users u ON o.user_id = u._id
  WHERE o.order_date >= CURRENT_DATE - INTERVAL '1 year'
    AND o.status IN ('completed', 'shipped', 'delivered')
    AND u.status = 'active'
  GROUP BY user_id, region, country, registration_date
),

-- RFM scoring and segmentation
customer_segments_scored AS (
  SELECT 
    *,
    
    -- RFM quintile scoring (1-5 scale)
    NTILE(5) OVER (ORDER BY recency_days DESC) as recency_score, -- Lower recency = higher score
    NTILE(5) OVER (ORDER BY frequency ASC) as frequency_score,
    NTILE(5) OVER (ORDER BY monetary_value ASC) as monetary_score,
    
    -- Comprehensive customer segment classification
    CASE 
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) >= 4 
           AND NTILE(5) OVER (ORDER BY frequency ASC) >= 4 
           AND NTILE(5) OVER (ORDER BY monetary_value ASC) >= 4 THEN 'champions'
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) >= 4 
           AND NTILE(5) OVER (ORDER BY frequency ASC) >= 3 
           AND NTILE(5) OVER (ORDER BY monetary_value ASC) >= 3 THEN 'loyal_customers'  
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) >= 4 
           AND NTILE(5) OVER (ORDER BY frequency ASC) <= 2 
           AND NTILE(5) OVER (ORDER BY monetary_value ASC) >= 3 THEN 'potential_loyalists'
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) >= 4 
           AND NTILE(5) OVER (ORDER BY frequency ASC) <= 1 THEN 'new_customers'
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) BETWEEN 2 AND 3 
           AND NTILE(5) OVER (ORDER BY frequency ASC) >= 3 THEN 'at_risk'
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) <= 2 
           AND NTILE(5) OVER (ORDER BY frequency ASC) >= 3 
           AND NTILE(5) OVER (ORDER BY monetary_value ASC) >= 3 THEN 'cannot_lose_them'
      WHEN NTILE(5) OVER (ORDER BY recency_days DESC) <= 2 
           AND NTILE(5) OVER (ORDER BY frequency ASC) <= 2 THEN 'hibernating'
      ELSE 'promising'
    END as customer_segment,
    
    -- Customer Lifetime Value prediction
    (avg_order_value * frequency * 
     CASE WHEN customer_lifespan > 0 THEN 365.0 / EXTRACT(DAYS FROM customer_lifespan) ELSE 12 END *
     (6 - LEAST(5, recency_days / 30.0))) as predicted_clv,
    
    -- Churn risk assessment
    CASE 
      WHEN recency_days > 180 THEN 'high_risk'
      WHEN recency_days > 90 THEN 'medium_risk'
      WHEN recency_days > 30 THEN 'low_risk'
      ELSE 'active'
    END as churn_risk,
    
    -- Channel preference classification
    CASE 
      WHEN mobile_orders > web_orders AND mobile_orders > store_orders THEN 'mobile_first'
      WHEN web_orders > mobile_orders AND web_orders > store_orders THEN 'web_first' 
      WHEN store_orders > mobile_orders AND store_orders > web_orders THEN 'store_first'
      ELSE 'omnichannel'
    END as channel_preference
    
  FROM customer_segmentation
),

-- Comprehensive business intelligence summary
business_intelligence_summary AS (
  SELECT 
    ga.region,
    ga.country,
    ga.order_year,
    ga.order_quarter,
    
    -- Performance metrics with growth indicators
    ga.total_revenue,
    ga.unique_customers,
    ga.avg_order_value,
    
    -- Growth calculations
    CASE 
      WHEN ga.previous_period_revenue > 0 THEN
        ROUND(((ga.total_revenue - ga.previous_period_revenue) / ga.previous_period_revenue * 100)::numeric, 2)
      ELSE NULL
    END as revenue_growth_pct,
    
    CASE
      WHEN ga.previous_period_customers > 0 THEN
        ROUND(((ga.unique_customers - ga.previous_period_customers) / ga.previous_period_customers * 100)::numeric, 2) 
      ELSE NULL
    END as customer_growth_pct,
    
    -- Trend indicators
    CASE 
      WHEN ga.total_revenue > ga.three_period_avg_revenue * 1.1 THEN 'growing'
      WHEN ga.total_revenue < ga.three_period_avg_revenue * 0.9 THEN 'declining'
      ELSE 'stable'
    END as revenue_trend,
    
    -- Performance rankings
    ga.revenue_rank,
    ga.revenue_percentile,
    
    -- Anomaly detection
    CASE 
      WHEN ga.revenue_z_score > 2 THEN 'positive_anomaly'
      WHEN ga.revenue_z_score < -2 THEN 'negative_anomaly'
      ELSE 'normal'
    END as anomaly_status,
    
    -- Customer segment distribution
    css.champions_count,
    css.loyal_customers_count,
    css.at_risk_count,
    css.hibernating_count,
    
    -- Customer value metrics
    css.avg_predicted_clv,
    css.high_risk_customers,
    
    -- Channel distribution
    css.mobile_first_customers,
    css.web_first_customers,
    css.omnichannel_customers,
    
    -- Strategic recommendations
    CASE 
      WHEN ga.revenue_growth_pct < -10 AND css.at_risk_count > css.loyal_customers_count THEN 'urgent_retention_focus'
      WHEN ga.revenue_growth_pct > 20 AND ga.revenue_rank <= 5 THEN 'scale_and_expand'
      WHEN css.hibernating_count > css.champions_count THEN 'reactivation_campaign'  
      WHEN ga.avg_order_value < ga.six_period_avg_aov * 0.9 THEN 'upselling_opportunity'
      ELSE 'maintain_momentum'
    END as strategic_recommendation
    
  FROM growth_analysis ga
  LEFT JOIN (
    SELECT 
      region,
      country,
      COUNT(*) FILTER (WHERE customer_segment = 'champions') as champions_count,
      COUNT(*) FILTER (WHERE customer_segment = 'loyal_customers') as loyal_customers_count,
      COUNT(*) FILTER (WHERE customer_segment = 'at_risk') as at_risk_count,
      COUNT(*) FILTER (WHERE customer_segment = 'hibernating') as hibernating_count,
      AVG(predicted_clv) as avg_predicted_clv,
      COUNT(*) FILTER (WHERE churn_risk = 'high_risk') as high_risk_customers,
      COUNT(*) FILTER (WHERE channel_preference = 'mobile_first') as mobile_first_customers,
      COUNT(*) FILTER (WHERE channel_preference = 'web_first') as web_first_customers,
      COUNT(*) FILTER (WHERE channel_preference = 'omnichannel') as omnichannel_customers
    FROM customer_segments_scored
    GROUP BY region, country
  ) css ON ga.region = css.region AND ga.country = css.country
  
  WHERE ga.order_year >= 2023
)

SELECT 
  region,
  country,
  order_year,
  order_quarter,
  
  -- Core performance metrics
  total_revenue,
  unique_customers,
  ROUND(avg_order_value::numeric, 2) as avg_order_value,
  
  -- Growth indicators
  COALESCE(revenue_growth_pct, 0) as revenue_growth_pct,
  COALESCE(customer_growth_pct, 0) as customer_growth_pct,
  revenue_trend,
  
  -- Market position
  revenue_rank,
  ROUND((revenue_percentile * 100)::numeric, 1) as revenue_percentile_rank,
  anomaly_status,
  
  -- Customer portfolio health
  COALESCE(champions_count, 0) as champions,
  COALESCE(loyal_customers_count, 0) as loyal_customers,
  COALESCE(at_risk_count, 0) as at_risk_customers,
  COALESCE(high_risk_customers, 0) as churn_risk_customers,
  
  -- Channel insights
  COALESCE(mobile_first_customers, 0) as mobile_focused,
  COALESCE(omnichannel_customers, 0) as omnichannel_users,
  
  -- Value predictions
  ROUND(COALESCE(avg_predicted_clv, 0)::numeric, 2) as avg_customer_ltv,
  
  -- Strategic guidance
  strategic_recommendation,
  
  -- Executive summary scoring
  CASE 
    WHEN revenue_growth_pct > 15 AND revenue_rank <= 3 THEN 'excellent'
    WHEN revenue_growth_pct > 5 AND revenue_rank <= 10 THEN 'good' 
    WHEN revenue_growth_pct >= 0 OR revenue_rank <= 20 THEN 'acceptable'
    ELSE 'needs_improvement'
  END as overall_performance_grade

FROM business_intelligence_summary
ORDER BY 
  order_year DESC,
  order_quarter DESC,
  total_revenue DESC
LIMIT 100;

-- Real-time aggregation pipeline with change streams
CREATE MATERIALIZED VIEW real_time_metrics AS
SELECT 
  DATE_TRUNC('minute', order_timestamp, 5) as time_bucket, -- 5-minute buckets
  region,
  
  -- Real-time KPIs
  COUNT(*) as orders_per_5min,
  SUM(total_amount) as revenue_per_5min,
  COUNT(DISTINCT user_id) as unique_customers_5min,
  AVG(total_amount) as avg_order_value_5min,
  
  -- Velocity metrics
  COUNT(*) / 5.0 as orders_per_minute,
  SUM(total_amount) / 5.0 as revenue_per_minute,
  
  -- Performance alerts
  CASE 
    WHEN COUNT(*) > 1000 THEN 'high_volume_alert'
    WHEN AVG(total_amount) < 50 THEN 'low_aov_alert'
    WHEN COUNT(DISTINCT user_id) / COUNT(*)::float < 0.7 THEN 'retention_concern'
    ELSE 'normal'
  END as alert_status,
  
  -- Trend indicators
  LAG(SUM(total_amount)) OVER (
    PARTITION BY region 
    ORDER BY DATE_TRUNC('minute', order_timestamp, 5)
  ) as previous_bucket_revenue,
  
  CURRENT_TIMESTAMP as computed_at

FROM orders
WHERE order_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  AND status IN ('completed', 'shipped', 'delivered')
GROUP BY DATE_TRUNC('minute', order_timestamp, 5), region

-- QueryLeaf optimization features:
WITH AGGREGATION_SETTINGS (
  refresh_interval = '1 minute',
  allow_disk_use = true,
  max_memory_usage = '500M',
  parallel_processing = true,
  index_hints = ['order_timestamp_region_idx', 'user_status_idx'],
  change_stream_enabled = true
);

-- QueryLeaf provides comprehensive aggregation optimization:
-- 1. SQL-familiar syntax for complex MongoDB aggregation pipelines
-- 2. Automatic pipeline optimization with index hints and memory management
-- 3. Advanced window functions and statistical operations for analytics
-- 4. Real-time aggregation capabilities with change streams integration  
-- 5. Performance monitoring and explain plan analysis tools
-- 6. Materialized view support for frequently accessed aggregations
-- 7. Customer segmentation and RFM analysis with built-in algorithms
-- 8. Anomaly detection and alerting capabilities for operational intelligence
-- 9. Growth analysis and trend calculation functions
-- 10. Strategic business intelligence reporting with actionable insights
```

## Best Practices for Aggregation Framework Optimization

### Pipeline Design Strategy

Essential principles for building high-performance MongoDB aggregation pipelines:

1. **Early Stage Filtering**: Place `$match` stages as early as possible to reduce documents flowing through the pipeline
2. **Index Utilization**: Design indexes specifically for aggregation query patterns and filter conditions  
3. **Stage Ordering**: Order stages to minimize memory usage and maximize index effectiveness
4. **Memory Management**: Use `allowDiskUse` for large dataset operations and monitor memory consumption
5. **Pipeline Composition**: Break complex pipelines into reusable, testable components
6. **Performance Monitoring**: Implement comprehensive explain plan analysis and execution time tracking

### Production Optimization Techniques

Optimize MongoDB aggregation pipelines for production-scale workloads:

1. **Index Strategy**: Create compound indexes aligned with aggregation filter and grouping patterns
2. **Memory Optimization**: Balance memory usage with disk spillover for optimal performance
3. **Parallel Processing**: Leverage MongoDB's parallel processing capabilities for large dataset aggregations
4. **Caching Strategies**: Implement result caching and materialized views for frequently accessed aggregations
5. **Real-time Analytics**: Use change streams and incremental processing for real-time analytical workloads  
6. **Monitoring Integration**: Deploy comprehensive performance monitoring and alerting for production pipelines

## Conclusion

MongoDB's Aggregation Framework provides a powerful, flexible foundation for complex data processing and analytics that scales from simple transformations to sophisticated analytical workloads. The pipeline-based architecture enables clear, maintainable data processing workflows with extensive optimization opportunities that support both real-time and batch processing scenarios.

Key MongoDB Aggregation Framework benefits include:

- **Pipeline Clarity**: Stage-based design that promotes clear, maintainable data transformation logic
- **Performance Optimization**: Sophisticated optimization engine with index utilization and memory management
- **Analytical Power**: Rich statistical functions and window operations for advanced analytics
- **Scalability**: Horizontal scaling capabilities that support growing analytical requirements  
- **Flexibility**: Adaptable pipeline patterns that evolve with changing business requirements
- **Integration**: Seamless integration with MongoDB's document model and distributed architecture

Whether you're building real-time dashboards, customer segmentation systems, business intelligence platforms, or complex analytical applications, MongoDB's Aggregation Framework with QueryLeaf's familiar SQL interface provides the foundation for high-performance data processing at scale.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB aggregation pipelines while providing SQL-familiar syntax for complex analytics, window functions, and statistical operations. Advanced aggregation patterns, performance optimization, and real-time analytics capabilities are seamlessly accessible through familiar SQL constructs, making sophisticated data processing both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's flexible aggregation capabilities with SQL-style operations makes it an ideal platform for modern analytical applications that require both high performance and rapid development cycles, ensuring your data processing workflows can scale efficiently while remaining maintainable and adaptable to evolving business needs.