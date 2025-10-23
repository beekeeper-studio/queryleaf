---
title: "MongoDB Aggregation Framework for Real-Time Analytics: Advanced Data Processing Pipelines and SQL-Compatible Query Patterns"
description: "Master MongoDB aggregation framework for real-time analytics and advanced data processing. Learn complex aggregation pipelines, window functions, time-series analytics, and SQL-familiar aggregation patterns for high-performance applications."
date: 2025-10-22
tags: [mongodb, aggregation, real-time-analytics, data-processing, pipelines, time-series, sql]
---

# MongoDB Aggregation Framework for Real-Time Analytics: Advanced Data Processing Pipelines and SQL-Compatible Query Patterns

Modern applications require sophisticated data processing capabilities that can handle complex analytical queries, real-time aggregations, and advanced transformations at scale. Traditional approaches to data analytics often rely on separate ETL processes, batch processing systems, and complex data warehouses that introduce latency, complexity, and operational overhead that becomes increasingly problematic as data volumes and processing demands grow.

MongoDB's Aggregation Framework provides powerful in-database processing capabilities that enable real-time analytics, complex data transformations, and sophisticated analytical queries directly within the operational database. Unlike traditional batch-oriented analytics approaches, MongoDB aggregation pipelines process data in real-time, support complex multi-stage transformations, and integrate seamlessly with operational workloads while delivering high-performance analytical results.

## The Traditional Data Analytics Limitations

Conventional relational database analytics approaches have significant constraints for modern real-time processing requirements:

```sql
-- Traditional PostgreSQL analytics - limited window functions and complex subqueries

-- Basic sales analytics with traditional SQL limitations
WITH monthly_sales_summary AS (
  SELECT 
    DATE_TRUNC('month', order_date) as month,
    product_category,
    customer_id,
    salesperson_id,
    region,
    
    -- Basic aggregations
    COUNT(*) as order_count,
    SUM(total_amount) as total_revenue,
    AVG(total_amount) as avg_order_value,
    MIN(total_amount) as min_order_value,
    MAX(total_amount) as max_order_value,
    
    -- Limited window function capabilities
    SUM(total_amount) OVER (
      PARTITION BY product_category, region 
      ORDER BY DATE_TRUNC('month', order_date)
      RANGE BETWEEN INTERVAL '3 months' PRECEDING AND CURRENT ROW
    ) as rolling_3_month_revenue,
    
    LAG(SUM(total_amount)) OVER (
      PARTITION BY product_category, region 
      ORDER BY DATE_TRUNC('month', order_date)
    ) as previous_month_revenue,
    
    -- Row number for ranking (limited functionality)
    ROW_NUMBER() OVER (
      PARTITION BY DATE_TRUNC('month', order_date), region
      ORDER BY SUM(total_amount) DESC
    ) as revenue_rank_in_region
    
  FROM orders o
  LEFT JOIN order_items oi ON o.order_id = oi.order_id
  LEFT JOIN products p ON oi.product_id = p.product_id
  LEFT JOIN customers c ON o.customer_id = c.customer_id
  LEFT JOIN salespeople s ON o.salesperson_id = s.salesperson_id
  WHERE o.order_date >= CURRENT_DATE - INTERVAL '12 months'
    AND o.status = 'completed'
  GROUP BY 
    DATE_TRUNC('month', order_date), 
    product_category, 
    customer_id, 
    salesperson_id, 
    region
),

customer_segmentation AS (
  SELECT 
    customer_id,
    region,
    
    -- Customer metrics calculation
    COUNT(*) as total_orders,
    SUM(total_revenue) as lifetime_revenue,
    AVG(avg_order_value) as avg_order_value,
    MAX(month) as last_order_month,
    MIN(month) as first_order_month,
    
    -- Recency, Frequency, Monetary calculation (limited)
    EXTRACT(DAYS FROM (CURRENT_DATE - MAX(month))) as days_since_last_order,
    COUNT(*) as frequency_score,
    SUM(total_revenue) as monetary_score,
    
    -- Simple percentile calculation (limited support)
    PERCENT_RANK() OVER (ORDER BY SUM(total_revenue)) as revenue_percentile,
    PERCENT_RANK() OVER (ORDER BY COUNT(*)) as frequency_percentile,
    
    -- Basic customer categorization
    CASE 
      WHEN SUM(total_revenue) > 10000 AND COUNT(*) > 10 THEN 'high_value'
      WHEN SUM(total_revenue) > 5000 OR COUNT(*) > 5 THEN 'medium_value'
      WHEN EXTRACT(DAYS FROM (CURRENT_DATE - MAX(month))) > 90 THEN 'at_risk'
      ELSE 'low_value'
    END as customer_segment,
    
    -- Growth trend analysis (very limited)
    CASE 
      WHEN COUNT(*) FILTER (WHERE month >= CURRENT_DATE - INTERVAL '3 months') > 0 THEN 'active'
      WHEN COUNT(*) FILTER (WHERE month >= CURRENT_DATE - INTERVAL '6 months') > 0 THEN 'declining'
      ELSE 'inactive'
    END as activity_trend
    
  FROM monthly_sales_summary
  GROUP BY customer_id, region
),

product_performance AS (
  SELECT 
    product_category,
    region,
    month,
    
    -- Product metrics
    SUM(order_count) as total_orders,
    SUM(total_revenue) as category_revenue,
    AVG(avg_order_value) as avg_category_order_value,
    COUNT(DISTINCT customer_id) as unique_customers,
    
    -- Market share calculation (complex with traditional SQL)
    SUM(total_revenue) / (
      SELECT SUM(total_revenue) 
      FROM monthly_sales_summary mss2 
      WHERE mss2.month = monthly_sales_summary.month 
        AND mss2.region = monthly_sales_summary.region
    ) * 100 as market_share_percent,
    
    -- Growth rate calculation
    SUM(total_revenue) / NULLIF(LAG(SUM(total_revenue)) OVER (
      PARTITION BY product_category, region 
      ORDER BY month
    ), 0) - 1 as month_over_month_growth,
    
    -- Seasonal analysis (limited capabilities)
    AVG(SUM(total_revenue)) OVER (
      PARTITION BY product_category, region, EXTRACT(MONTH FROM month)
      ORDER BY month
      ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
    ) as seasonal_avg_revenue
    
  FROM monthly_sales_summary
  GROUP BY product_category, region, month
),

advanced_analytics AS (
  SELECT 
    cs.customer_segment,
    cs.region,
    cs.activity_trend,
    
    -- Customer segment analysis
    COUNT(*) as customers_in_segment,
    AVG(cs.lifetime_revenue) as avg_lifetime_value,
    AVG(cs.total_orders) as avg_orders_per_customer,
    AVG(cs.days_since_last_order) as avg_days_since_last_order,
    
    -- Revenue contribution by segment
    SUM(cs.lifetime_revenue) as segment_total_revenue,
    SUM(cs.lifetime_revenue) / (
      SELECT SUM(lifetime_revenue) FROM customer_segmentation
    ) * 100 as revenue_contribution_percent,
    
    -- Top products for each segment (limited subquery approach)
    (
      SELECT product_category 
      FROM monthly_sales_summary mss
      WHERE mss.customer_id IN (
        SELECT cs2.customer_id 
        FROM customer_segmentation cs2 
        WHERE cs2.customer_segment = cs.customer_segment
          AND cs2.region = cs.region
      )
      GROUP BY product_category
      ORDER BY SUM(total_revenue) DESC
      LIMIT 1
    ) as top_product_category,
    
    -- Cohort analysis (very complex with traditional SQL)
    COUNT(*) FILTER (
      WHERE cs.first_order_month >= CURRENT_DATE - INTERVAL '1 month'
    ) as new_customers_this_month,
    
    COUNT(*) FILTER (
      WHERE cs.last_order_month >= CURRENT_DATE - INTERVAL '1 month'
        AND cs.first_order_month < CURRENT_DATE - INTERVAL '1 month'
    ) as returning_customers_this_month
    
  FROM customer_segmentation cs
  GROUP BY cs.customer_segment, cs.region, cs.activity_trend
)

SELECT 
  customer_segment,
  region,
  activity_trend,
  customers_in_segment,
  ROUND(avg_lifetime_value::numeric, 2) as avg_lifetime_value,
  ROUND(avg_orders_per_customer::numeric, 2) as avg_orders_per_customer,
  ROUND(avg_days_since_last_order::numeric, 1) as avg_days_since_last_order,
  ROUND(segment_total_revenue::numeric, 2) as segment_revenue,
  ROUND(revenue_contribution_percent::numeric, 2) as revenue_contribution_pct,
  top_product_category,
  new_customers_this_month,
  returning_customers_this_month,
  
  -- Customer health score (simplified)
  CASE 
    WHEN customer_segment = 'high_value' AND activity_trend = 'active' THEN 95
    WHEN customer_segment = 'high_value' AND activity_trend = 'declining' THEN 70
    WHEN customer_segment = 'medium_value' AND activity_trend = 'active' THEN 80
    WHEN customer_segment = 'medium_value' AND activity_trend = 'declining' THEN 55
    WHEN customer_segment = 'low_value' AND activity_trend = 'active' THEN 65
    WHEN activity_trend = 'inactive' THEN 25
    ELSE 40
  END as customer_health_score,
  
  -- Recommendations (limited business logic)
  CASE 
    WHEN customer_segment = 'high_value' AND activity_trend = 'declining' THEN 'Urgent: Re-engagement campaign needed'
    WHEN customer_segment = 'medium_value' AND activity_trend = 'active' THEN 'Opportunity: Upsell to premium products'
    WHEN customer_segment = 'at_risk' THEN 'Action: Retention campaign required'
    WHEN new_customers_this_month > returning_customers_this_month THEN 'Focus: Improve customer retention'
    ELSE 'Monitor: Continue current strategy'
  END as recommended_action

FROM advanced_analytics
ORDER BY 
  CASE customer_segment 
    WHEN 'high_value' THEN 1 
    WHEN 'medium_value' THEN 2 
    WHEN 'low_value' THEN 3 
    ELSE 4 
  END,
  segment_revenue DESC;

-- Traditional PostgreSQL analytics problems:
-- 1. Complex multi-table JOINs required for comprehensive analysis
-- 2. Limited window function capabilities for advanced analytics
-- 3. Difficult to implement complex transformations and nested aggregations
-- 4. Poor performance with large datasets and complex calculations
-- 5. Limited support for hierarchical and nested data structures
-- 6. No built-in support for time-series analytics and forecasting
-- 7. Complex subqueries required for conditional aggregations
-- 8. Difficult to implement real-time analytics and streaming calculations
-- 9. Limited flexibility for dynamic grouping and pivot operations
-- 10. No native support for advanced statistical functions and machine learning

-- MySQL limitations are even more severe
SELECT 
  DATE_FORMAT(order_date, '%Y-%m') as month,
  product_category,
  region,
  COUNT(*) as order_count,
  SUM(total_amount) as revenue,
  AVG(total_amount) as avg_order_value,
  
  -- Very limited analytical capabilities
  -- No window functions in older MySQL versions
  -- No complex aggregation support
  -- Limited JSON processing capabilities
  -- Poor performance with complex queries
  
  (SELECT SUM(total_amount) 
   FROM orders o2 
   WHERE DATE_FORMAT(o2.order_date, '%Y-%m') = DATE_FORMAT(orders.order_date, '%Y-%m')
     AND o2.region = orders.region) as region_monthly_total

FROM orders
JOIN order_items ON orders.order_id = order_items.order_id
JOIN products ON order_items.product_id = products.product_id
WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
  AND status = 'completed'
GROUP BY 
  DATE_FORMAT(order_date, '%Y-%m'), 
  product_category, 
  region
ORDER BY month DESC, revenue DESC;

-- MySQL problems:
-- - No window functions in older versions
-- - Very limited JSON support and processing
-- - Basic aggregation functions only
-- - Poor performance with complex analytical queries
-- - No support for advanced statistical calculations
-- - Limited date/time processing capabilities
-- - No native support for real-time analytics
-- - Basic subquery support with performance issues
```

MongoDB's Aggregation Framework provides comprehensive real-time analytics capabilities:

```javascript
// MongoDB Advanced Aggregation Framework - powerful real-time analytics and data processing
const { MongoClient } = require('mongodb');

class MongoDBAnalyticsEngine {
  constructor(db) {
    this.db = db;
    this.collections = {
      orders: db.collection('orders'),
      products: db.collection('products'),
      customers: db.collection('customers'),
      analytics: db.collection('analytics_cache')
    };
    this.pipelineCache = new Map();
  }

  async performComprehensiveAnalytics() {
    console.log('Executing comprehensive real-time analytics with MongoDB Aggregation Framework...');
    
    // Execute multiple analytical pipelines in parallel
    const [
      salesAnalytics,
      customerSegmentation,
      productPerformance,
      timeSeriesAnalysis,
      predictiveInsights
    ] = await Promise.all([
      this.executeSalesAnalyticsPipeline(),
      this.executeCustomerSegmentationPipeline(),
      this.executeProductPerformancePipeline(),
      this.executeTimeSeriesAnalytics(),
      this.executePredictiveAnalytics()
    ]);

    return {
      salesAnalytics,
      customerSegmentation,
      productPerformance,
      timeSeriesAnalysis,
      predictiveInsights,
      generatedAt: new Date()
    };
  }

  async executeSalesAnalyticsPipeline() {
    console.log('Executing advanced sales analytics pipeline...');
    
    const pipeline = [
      // Stage 1: Match recent completed orders
      {
        $match: {
          status: 'completed',
          orderDate: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }, // Last 12 months
          'totals.total': { $gt: 0 }
        }
      },
      
      // Stage 2: Add computed fields and date transformations
      {
        $addFields: {
          year: { $year: '$orderDate' },
          month: { $month: '$orderDate' },
          dayOfYear: { $dayOfYear: '$orderDate' },
          weekOfYear: { $week: '$orderDate' },
          quarter: { 
            $ceil: { $divide: [{ $month: '$orderDate' }, 3] }
          },
          
          // Calculate order metrics
          orderValue: '$totals.total',
          itemCount: { $size: '$items' },
          avgItemValue: { 
            $divide: ['$totals.total', { $size: '$items' }] 
          },
          
          // Customer type classification
          customerType: {
            $switch: {
              branches: [
                { case: { $gte: ['$totals.total', 1000] }, then: 'high_value' },
                { case: { $gte: ['$totals.total', 500] }, then: 'medium_value' },
                { case: { $gte: ['$totals.total', 100] }, then: 'regular' }
              ],
              default: 'low_value'
            }
          },
          
          // Season classification
          season: {
            $switch: {
              branches: [
                { case: { $in: [{ $month: '$orderDate' }, [12, 1, 2]] }, then: 'winter' },
                { case: { $in: [{ $month: '$orderDate' }, [3, 4, 5]] }, then: 'spring' },
                { case: { $in: [{ $month: '$orderDate' }, [6, 7, 8]] }, then: 'summer' },
                { case: { $in: [{ $month: '$orderDate' }, [9, 10, 11]] }, then: 'fall' }
              ],
              default: 'unknown'
            }
          }
        }
      },
      
      // Stage 3: Lookup customer information
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
          pipeline: [
            {
              $project: {
                name: 1,
                email: 1,
                'profile.location.country': 1,
                'profile.location.region': 1,
                'account.type': 1,
                'account.registrationDate': 1,
                'preferences.category': 1
              }
            }
          ]
        }
      },
      
      // Stage 4: Unwind customer data
      { $unwind: '$customer' },
      
      // Stage 5: Unwind order items for detailed analysis
      { $unwind: '$items' },
      
      // Stage 6: Lookup product information
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product',
          pipeline: [
            {
              $project: {
                name: 1,
                category: 1,
                brand: 1,
                'pricing.cost': 1,
                'specifications.weight': 1,
                'inventory.supplier': 1
              }
            }
          ]
        }
      },
      
      // Stage 7: Unwind product data
      { $unwind: '$product' },
      
      // Stage 8: Calculate item-level metrics
      {
        $addFields: {
          itemRevenue: { $multiply: ['$items.quantity', '$items.unitPrice'] },
          itemProfit: { 
            $multiply: [
              '$items.quantity', 
              { $subtract: ['$items.unitPrice', '$product.pricing.cost'] }
            ]
          },
          profitMargin: {
            $divide: [
              { $subtract: ['$items.unitPrice', '$product.pricing.cost'] },
              '$items.unitPrice'
            ]
          }
        }
      },
      
      // Stage 9: Group by multiple dimensions for comprehensive analysis
      {
        $group: {
          _id: {
            year: '$year',
            month: '$month',
            quarter: '$quarter',
            season: '$season',
            category: '$product.category',
            brand: '$product.brand',
            country: '$customer.profile.location.country',
            region: '$customer.profile.location.region',
            customerType: '$customerType',
            accountType: '$customer.account.type'
          },
          
          // Order-level metrics
          totalOrders: { $sum: 1 },
          uniqueCustomers: { $addToSet: '$customerId' },
          totalRevenue: { $sum: '$itemRevenue' },
          totalProfit: { $sum: '$itemProfit' },
          totalQuantity: { $sum: '$items.quantity' },
          
          // Statistical measures
          avgOrderValue: { $avg: '$orderValue' },
          minOrderValue: { $min: '$orderValue' },
          maxOrderValue: { $max: '$orderValue' },
          stdDevOrderValue: { $stdDevPop: '$orderValue' },
          
          // Product performance
          avgProfitMargin: { $avg: '$profitMargin' },
          avgItemPrice: { $avg: '$items.unitPrice' },
          totalWeight: { $sum: { $multiply: ['$items.quantity', '$product.specifications.weight'] } },
          
          // Customer insights
          newCustomers: {
            $sum: {
              $cond: [
                { $gte: [
                  '$customer.account.registrationDate',
                  { $dateFromParts: { year: '$year', month: '$month', day: 1 } }
                ]},
                1, 0
              ]
            }
          },
          
          // Supplier diversity
          uniqueSuppliers: { $addToSet: '$product.inventory.supplier' },
          
          // Sample orders for detailed analysis
          sampleOrders: { $push: {
            orderId: '$_id',
            customerId: '$customerId',
            orderValue: '$orderValue',
            itemCount: '$itemCount',
            orderDate: '$orderDate'
          }}
        }
      },
      
      // Stage 10: Calculate derived metrics
      {
        $addFields: {
          uniqueCustomerCount: { $size: '$uniqueCustomers' },
          uniqueSupplierCount: { $size: '$uniqueSuppliers' },
          averageOrdersPerCustomer: { 
            $divide: ['$totalOrders', { $size: '$uniqueCustomers' }] 
          },
          revenuePerCustomer: { 
            $divide: ['$totalRevenue', { $size: '$uniqueCustomers' }] 
          },
          profitMarginPercent: { 
            $multiply: [{ $divide: ['$totalProfit', '$totalRevenue'] }, 100] 
          },
          customerAcquisitionRate: {
            $divide: ['$newCustomers', { $size: '$uniqueCustomers' }]
          }
        }
      },
      
      // Stage 11: Add ranking and percentile information
      {
        $setWindowFields: {
          partitionBy: { year: '$_id.year', quarter: '$_id.quarter' },
          sortBy: { totalRevenue: -1 },
          output: {
            revenueRank: { $rank: {} },
            revenuePercentile: { $percentRank: {} },
            cumulativeRevenue: { $sum: '$totalRevenue', window: { documents: ['unbounded preceding', 'current'] } },
            movingAvgRevenue: { $avg: '$totalRevenue', window: { documents: [-2, 2] } }
          }
        }
      },
      
      // Stage 12: Calculate growth rates using window functions
      {
        $setWindowFields: {
          partitionBy: { 
            category: '$_id.category', 
            country: '$_id.country' 
          },
          sortBy: { year: 1, month: 1 },
          output: {
            previousMonthRevenue: { 
              $shift: { output: '$totalRevenue', by: -1 } 
            },
            previousYearRevenue: { 
              $shift: { output: '$totalRevenue', by: -12 } 
            }
          }
        }
      },
      
      // Stage 13: Calculate final growth metrics
      {
        $addFields: {
          monthOverMonthGrowth: {
            $cond: [
              { $gt: ['$previousMonthRevenue', 0] },
              { 
                $subtract: [
                  { $divide: ['$totalRevenue', '$previousMonthRevenue'] },
                  1
                ]
              },
              null
            ]
          },
          yearOverYearGrowth: {
            $cond: [
              { $gt: ['$previousYearRevenue', 0] },
              { 
                $subtract: [
                  { $divide: ['$totalRevenue', '$previousYearRevenue'] },
                  1
                ]
              },
              null
            ]
          }
        }
      },
      
      // Stage 14: Add performance indicators
      {
        $addFields: {
          performanceIndicator: {
            $switch: {
              branches: [
                { 
                  case: { $and: [
                    { $gt: ['$monthOverMonthGrowth', 0.1] },
                    { $gt: ['$profitMarginPercent', 20] }
                  ]},
                  then: 'excellent'
                },
                { 
                  case: { $and: [
                    { $gt: ['$monthOverMonthGrowth', 0.05] },
                    { $gt: ['$profitMarginPercent', 15] }
                  ]},
                  then: 'good'
                },
                { 
                  case: { $or: [
                    { $lt: ['$monthOverMonthGrowth', -0.1] },
                    { $lt: ['$profitMarginPercent', 5] }
                  ]},
                  then: 'concerning'
                }
              ],
              default: 'average'
            }
          },
          
          // Business recommendations
          recommendation: {
            $switch: {
              branches: [
                { 
                  case: { $lt: ['$monthOverMonthGrowth', -0.2] },
                  then: 'Urgent: Investigate revenue decline and implement recovery strategy'
                },
                { 
                  case: { $lt: ['$profitMarginPercent', 5] },
                  then: 'Action: Review pricing strategy and cost structure'
                },
                { 
                  case: { $and: [
                    { $gt: ['$monthOverMonthGrowth', 0.15] },
                    { $gt: ['$revenuePercentile', 0.8] }
                  ]},
                  then: 'Opportunity: Scale successful strategies and increase investment'
                },
                { 
                  case: { $lt: ['$customerAcquisitionRate', 0.1] },
                  then: 'Focus: Improve customer acquisition and marketing effectiveness'
                }
              ],
              default: 'Monitor: Continue current strategies with minor optimizations'
            }
          }
        }
      },
      
      // Stage 15: Sort by strategic importance
      {
        $sort: {
          'totalRevenue': -1,
          'profitMarginPercent': -1,
          '_id.year': -1,
          '_id.month': -1
        }
      },
      
      // Stage 16: Limit to top performing segments for detailed analysis
      { $limit: 100 }
    ];

    const results = await this.collections.orders.aggregate(pipeline).toArray();
    
    console.log(`Sales analytics completed: ${results.length} segments analyzed`);
    return results;
  }

  async executeCustomerSegmentationPipeline() {
    console.log('Executing advanced customer segmentation pipeline...');
    
    const pipeline = [
      // Stage 1: Match active customers with orders
      {
        $match: {
          'account.status': 'active',
          'account.createdAt': { $gte: new Date(Date.now() - 730 * 24 * 60 * 60 * 1000) } // Last 2 years
        }
      },
      
      // Stage 2: Lookup customer orders
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          as: 'orders',
          pipeline: [
            {
              $match: {
                status: 'completed',
                orderDate: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
              }
            },
            {
              $project: {
                orderDate: 1,
                'totals.total': 1,
                'totals.currency': 1,
                items: 1
              }
            }
          ]
        }
      },
      
      // Stage 3: Calculate RFM metrics (Recency, Frequency, Monetary)
      {
        $addFields: {
          // Recency: Days since last order
          recency: {
            $cond: [
              { $gt: [{ $size: '$orders' }, 0] },
              {
                $divide: [
                  { $subtract: [new Date(), { $max: '$orders.orderDate' }] },
                  1000 * 60 * 60 * 24 // Convert to days
                ]
              },
              999 // Default high recency for customers with no orders
            ]
          },
          
          // Frequency: Number of orders
          frequency: { $size: '$orders' },
          
          // Monetary: Total spending
          monetary: {
            $reduce: {
              input: '$orders',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.totals.total'] }
            }
          },
          
          // Additional customer metrics
          avgOrderValue: {
            $cond: [
              { $gt: [{ $size: '$orders' }, 0] },
              {
                $divide: [
                  {
                    $reduce: {
                      input: '$orders',
                      initialValue: 0,
                      in: { $add: ['$$value', '$$this.totals.total'] }
                    }
                  },
                  { $size: '$orders' }
                ]
              },
              0
            ]
          },
          
          firstOrderDate: { $min: '$orders.orderDate' },
          lastOrderDate: { $max: '$orders.orderDate' },
          
          // Calculate customer lifetime (days)
          customerLifetime: {
            $cond: [
              { $gt: [{ $size: '$orders' }, 0] },
              {
                $divide: [
                  { $subtract: [{ $max: '$orders.orderDate' }, { $min: '$orders.orderDate' }] },
                  1000 * 60 * 60 * 24
                ]
              },
              0
            ]
          }
        }
      },
      
      // Stage 4: Calculate RFM scores using percentile ranking
      {
        $setWindowFields: {
          sortBy: { recency: 1 }, // Lower recency is better (more recent)
          output: {
            recencyScore: {
              $percentRank: {}
            }
          }
        }
      },
      
      {
        $setWindowFields: {
          sortBy: { frequency: -1 }, // Higher frequency is better
          output: {
            frequencyScore: {
              $percentRank: {}
            }
          }
        }
      },
      
      {
        $setWindowFields: {
          sortBy: { monetary: -1 }, // Higher monetary is better
          output: {
            monetaryScore: {
              $percentRank: {}
            }
          }
        }
      },
      
      // Stage 5: Create RFM segments
      {
        $addFields: {
          // Convert percentile scores to 1-5 scale
          recencyBucket: {
            $ceil: { $multiply: [{ $subtract: [1, '$recencyScore'] }, 5] }
          },
          frequencyBucket: {
            $ceil: { $multiply: ['$frequencyScore', 5] }
          },
          monetaryBucket: {
            $ceil: { $multiply: ['$monetaryScore', 5] }
          }
        }
      },
      
      // Stage 6: Create customer segments based on RFM
      {
        $addFields: {
          rfmScore: {
            $concat: [
              { $toString: '$recencyBucket' },
              { $toString: '$frequencyBucket' },
              { $toString: '$monetaryBucket' }
            ]
          },
          
          customerSegment: {
            $switch: {
              branches: [
                // Champions: High value, bought recently, buy often
                { 
                  case: { $and: [
                    { $gte: ['$recencyBucket', 4] },
                    { $gte: ['$frequencyBucket', 4] },
                    { $gte: ['$monetaryBucket', 4] }
                  ]},
                  then: 'champions'
                },
                // Loyal customers: High frequency and monetary, but not recent
                { 
                  case: { $and: [
                    { $gte: ['$frequencyBucket', 4] },
                    { $gte: ['$monetaryBucket', 4] }
                  ]},
                  then: 'loyal_customers'
                },
                // Potential loyalists: Recent customers with good frequency
                { 
                  case: { $and: [
                    { $gte: ['$recencyBucket', 4] },
                    { $gte: ['$frequencyBucket', 3] }
                  ]},
                  then: 'potential_loyalists'
                },
                // New customers: Recent but low frequency/monetary
                { 
                  case: { $and: [
                    { $gte: ['$recencyBucket', 4] },
                    { $lte: ['$frequencyBucket', 2] }
                  ]},
                  then: 'new_customers'
                },
                // Promising: Recent moderate spenders
                { 
                  case: { $and: [
                    { $gte: ['$recencyBucket', 3] },
                    { $gte: ['$monetaryBucket', 3] }
                  ]},
                  then: 'promising'
                },
                // Need attention: Recent low spenders
                { 
                  case: { $and: [
                    { $gte: ['$recencyBucket', 3] },
                    { $lte: ['$monetaryBucket', 2] }
                  ]},
                  then: 'need_attention'
                },
                // About to sleep: Low recency but good historical value
                { 
                  case: { $and: [
                    { $lte: ['$recencyBucket', 2] },
                    { $gte: ['$monetaryBucket', 3] }
                  ]},
                  then: 'about_to_sleep'
                },
                // At risk: Low recency and frequency but good monetary
                { 
                  case: { $and: [
                    { $lte: ['$recencyBucket', 2] },
                    { $lte: ['$frequencyBucket', 2] },
                    { $gte: ['$monetaryBucket', 3] }
                  ]},
                  then: 'at_risk'
                },
                // Cannot lose: Very low recency but high monetary
                { 
                  case: { $and: [
                    { $eq: ['$recencyBucket', 1] },
                    { $gte: ['$monetaryBucket', 4] }
                  ]},
                  then: 'cannot_lose'
                },
                // Hibernating: Low across all dimensions
                { 
                  case: { $and: [
                    { $lte: ['$recencyBucket', 2] },
                    { $lte: ['$frequencyBucket', 2] },
                    { $lte: ['$monetaryBucket', 2] }
                  ]},
                  then: 'hibernating'
                }
              ],
              default: 'others'
            }
          },
          
          // Calculate customer lifetime value
          customerLifetimeValue: {
            $multiply: [
              '$avgOrderValue',
              { $divide: ['$frequency', { $max: [1, { $divide: ['$customerLifetime', 365] }] }] }, // Orders per year
              3 // Projected future years
            ]
          },
          
          // Churn risk assessment
          churnRisk: {
            $switch: {
              branches: [
                { case: { $gte: ['$recency', 180] }, then: 'high' },
                { case: { $gte: ['$recency', 90] }, then: 'medium' },
                { case: { $gte: ['$recency', 30] }, then: 'low' }
              ],
              default: 'very_low'
            }
          }
        }
      },
      
      // Stage 7: Enrich with customer profile data
      {
        $addFields: {
          profileCompleteness: {
            $divide: [
              {
                $add: [
                  { $cond: [{ $ne: ['$profile.firstName', null] }, 1, 0] },
                  { $cond: [{ $ne: ['$profile.lastName', null] }, 1, 0] },
                  { $cond: [{ $ne: ['$profile.phone', null] }, 1, 0] },
                  { $cond: [{ $ne: ['$profile.location', null] }, 1, 0] },
                  { $cond: [{ $ne: ['$profile.dateOfBirth', null] }, 1, 0] },
                  { $cond: [{ $ne: ['$preferences', null] }, 1, 0] }
                ]
              },
              6
            ]
          },
          
          engagementLevel: {
            $switch: {
              branches: [
                { 
                  case: { $and: [
                    { $gte: ['$frequency', 10] },
                    { $lte: ['$recency', 30] }
                  ]},
                  then: 'highly_engaged'
                },
                { 
                  case: { $and: [
                    { $gte: ['$frequency', 5] },
                    { $lte: ['$recency', 60] }
                  ]},
                  then: 'moderately_engaged'
                },
                { 
                  case: { $and: [
                    { $gte: ['$frequency', 2] },
                    { $lte: ['$recency', 120] }
                  ]},
                  then: 'lightly_engaged'
                }
              ],
              default: 'disengaged'
            }
          }
        }
      },
      
      // Stage 8: Create final customer analysis
      {
        $project: {
          _id: 1,
          email: 1,
          'profile.firstName': 1,
          'profile.lastName': 1,
          'profile.location.country': 1,
          'profile.location.region': 1,
          'account.type': 1,
          'account.createdAt': 1,
          
          // RFM Analysis
          recency: { $round: ['$recency', 1] },
          frequency: 1,
          monetary: { $round: ['$monetary', 2] },
          rfmScore: 1,
          recencyBucket: 1,
          frequencyBucket: 1,
          monetaryBucket: 1,
          
          // Customer Classification
          customerSegment: 1,
          churnRisk: 1,
          engagementLevel: 1,
          
          // Business Metrics
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          customerLifetimeValue: { $round: ['$customerLifetimeValue', 2] },
          customerLifetime: { $round: ['$customerLifetime', 0] },
          profileCompleteness: { $round: [{ $multiply: ['$profileCompleteness', 100] }, 1] },
          
          // Timeline
          firstOrderDate: 1,
          lastOrderDate: 1,
          
          // Marketing recommendations
          marketingAction: {
            $switch: {
              branches: [
                { case: { $eq: ['$customerSegment', 'champions'] }, then: 'Reward and advocate program' },
                { case: { $eq: ['$customerSegment', 'loyal_customers'] }, then: 'Upsell and cross-sell premium products' },
                { case: { $eq: ['$customerSegment', 'potential_loyalists'] }, then: 'Loyalty program enrollment' },
                { case: { $eq: ['$customerSegment', 'new_customers'] }, then: 'Onboarding and education campaign' },
                { case: { $eq: ['$customerSegment', 'promising'] }, then: 'Targeted promotions and engagement' },
                { case: { $eq: ['$customerSegment', 'need_attention'] }, then: 'Value demonstration and support' },
                { case: { $eq: ['$customerSegment', 'about_to_sleep'] }, then: 'Re-engagement campaign with incentives' },
                { case: { $eq: ['$customerSegment', 'at_risk'] }, then: 'Urgent retention program' },
                { case: { $eq: ['$customerSegment', 'cannot_lose'] }, then: 'Win-back campaign with premium offers' },
                { case: { $eq: ['$customerSegment', 'hibernating'] }, then: 'Reactivation with significant discount' }
              ],
              default: 'Monitor and nurture'
            }
          }
        }
      },
      
      // Stage 9: Sort by customer value and risk
      {
        $sort: {
          customerLifetimeValue: -1,
          recency: 1,
          frequency: -1
        }
      }
    ];

    const results = await this.collections.customers.aggregate(pipeline).toArray();
    
    console.log(`Customer segmentation completed: ${results.length} customers analyzed`);
    return results;
  }

  async executeProductPerformancePipeline() {
    console.log('Executing product performance analysis pipeline...');
    
    const pipeline = [
      // Stage 1: Match products with sales data
      {
        $lookup: {
          from: 'orders',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                status: 'completed',
                orderDate: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
              }
            },
            { $unwind: '$items' },
            {
              $match: {
                $expr: { $eq: ['$items.productId', '$$productId'] }
              }
            },
            {
              $project: {
                orderDate: 1,
                customerId: 1,
                quantity: '$items.quantity',
                unitPrice: '$items.unitPrice',
                totalPrice: '$items.totalPrice',
                'customer.location.country': 1
              }
            }
          ],
          as: 'sales'
        }
      },
      
      // Stage 2: Calculate comprehensive product metrics
      {
        $addFields: {
          // Sales volume metrics
          totalUnitsSold: {
            $reduce: {
              input: '$sales',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.quantity'] }
            }
          },
          
          totalRevenue: {
            $reduce: {
              input: '$sales',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.totalPrice'] }
            }
          },
          
          totalOrders: { $size: '$sales' },
          uniqueCustomers: { $size: { $setUnion: [{ $map: { input: '$sales', as: 'sale', in: '$$sale.customerId' } }, []] } },
          
          // Pricing analysis
          avgSellingPrice: {
            $cond: [
              { $gt: [{ $size: '$sales' }, 0] },
              {
                $divide: [
                  {
                    $reduce: {
                      input: '$sales',
                      initialValue: 0,
                      in: { $add: ['$$value', '$$this.unitPrice'] }
                    }
                  },
                  { $size: '$sales' }
                ]
              },
              0
            ]
          },
          
          // Profit analysis
          totalProfit: {
            $reduce: {
              input: '$sales',
              initialValue: 0,
              in: { 
                $add: [
                  '$$value', 
                  { 
                    $multiply: [
                      '$$this.quantity',
                      { $subtract: ['$$this.unitPrice', '$pricing.cost'] }
                    ]
                  }
                ]
              }
            }
          },
          
          // Time-based analysis
          firstSaleDate: { $min: '$sales.orderDate' },
          lastSaleDate: { $max: '$sales.orderDate' },
          
          // Calculate monthly sales trend
          monthlySales: {
            $map: {
              input: { $range: [0, 12] },
              as: 'monthOffset',
              in: {
                month: {
                  $dateFromParts: {
                    year: { $year: { $dateSubtract: { startDate: new Date(), unit: 'month', amount: '$$monthOffset' } } },
                    month: { $month: { $dateSubtract: { startDate: new Date(), unit: 'month', amount: '$$monthOffset' } } },
                    day: 1
                  }
                },
                sales: {
                  $reduce: {
                    input: {
                      $filter: {
                        input: '$sales',
                        cond: {
                          $and: [
                            { $gte: ['$$this.orderDate', { $dateSubtract: { startDate: new Date(), unit: 'month', amount: { $add: ['$$monthOffset', 1] } } }] },
                            { $lt: ['$$this.orderDate', { $dateSubtract: { startDate: new Date(), unit: 'month', amount: '$$monthOffset' } }] }
                          ]
                        }
                      }
                    },
                    initialValue: 0,
                    in: { $add: ['$$value', '$$this.totalPrice'] }
                  }
                }
              }
            }
          }
        }
      },
      
      // Stage 3: Calculate performance indicators
      {
        $addFields: {
          // Performance ratios
          profitMargin: {
            $cond: [
              { $gt: ['$totalRevenue', 0] },
              { $divide: ['$totalProfit', '$totalRevenue'] },
              0
            ]
          },
          
          revenuePerCustomer: {
            $cond: [
              { $gt: ['$uniqueCustomers', 0] },
              { $divide: ['$totalRevenue', '$uniqueCustomers'] },
              0
            ]
          },
          
          avgOrderValue: {
            $cond: [
              { $gt: ['$totalOrders', 0] },
              { $divide: ['$totalRevenue', '$totalOrders'] },
              0
            ]
          },
          
          // Inventory turnover (simplified)
          inventoryTurnover: {
            $cond: [
              { $gt: ['$inventory.quantity', 0] },
              { $divide: ['$totalUnitsSold', '$inventory.quantity'] },
              0
            ]
          },
          
          // Product lifecycle stage
          lifecycleStage: {
            $switch: {
              branches: [
                { 
                  case: { 
                    $lt: [
                      '$firstSaleDate', 
                      { $dateSubtract: { startDate: new Date(), unit: 'day', amount: 90 } }
                    ]
                  },
                  then: 'new'
                },
                {
                  case: { $and: [
                    { $gt: ['$totalRevenue', 10000] },
                    { $gt: ['$profitMargin', 0.2] }
                  ]},
                  then: 'growth'
                },
                {
                  case: { $and: [
                    { $gt: ['$totalRevenue', 50000] },
                    { $gte: ['$profitMargin', 0.15] }
                  ]},
                  then: 'maturity'
                },
                {
                  case: { $or: [
                    { $lt: ['$profitMargin', 0.1] },
                    { $lt: [
                      '$lastSaleDate',
                      { $dateSubtract: { startDate: new Date(), unit: 'day', amount: 60 } }
                    ]}
                  ]},
                  then: 'decline'
                }
              ],
              default: 'development'
            }
          },
          
          // Sales trend analysis
          salesTrend: {
            $let: {
              vars: {
                recentSales: { $slice: ['$monthlySales.sales', 0, 6] },
                olderSales: { $slice: ['$monthlySales.sales', 6, 6] }
              },
              in: {
                $cond: [
                  { $and: [
                    { $gt: [{ $avg: '$$recentSales' }, { $avg: '$$olderSales' }] },
                    { $gt: [{ $avg: '$$recentSales' }, 0] }
                  ]},
                  'growing',
                  {
                    $cond: [
                      { $lt: [{ $avg: '$$recentSales' }, { $multiply: [{ $avg: '$$olderSales' }, 0.8] }] },
                      'declining',
                      'stable'
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      
      // Stage 4: Add competitive analysis using window functions
      {
        $setWindowFields: {
          partitionBy: '$category',
          sortBy: { totalRevenue: -1 },
          output: {
            categoryRank: { $rank: {} },
            categoryPercentile: { $percentRank: {} },
            marketShareInCategory: {
              $divide: [
                '$totalRevenue',
                { $sum: '$totalRevenue', window: { documents: ['unbounded preceding', 'unbounded following'] } }
              ]
            }
          }
        }
      },
      
      // Stage 5: Calculate final performance scores
      {
        $addFields: {
          // Overall performance score (0-100)
          performanceScore: {
            $multiply: [
              {
                $add: [
                  { $multiply: ['$categoryPercentile', 0.3] }, // Market position
                  { $multiply: [{ $min: ['$profitMargin', 0.5] }, 0.25] }, // Profitability (capped at 50%)
                  { $multiply: [{ $divide: [{ $min: ['$inventoryTurnover', 10] }, 10] }, 0.2] }, // Efficiency (capped at 10x)
                  { 
                    $multiply: [
                      {
                        $switch: {
                          branches: [
                            { case: { $eq: ['$salesTrend', 'growing'] }, then: 1 },
                            { case: { $eq: ['$salesTrend', 'stable'] }, then: 0.7 },
                            { case: { $eq: ['$salesTrend', 'declining'] }, then: 0.3 }
                          ],
                          default: 0.5
                        }
                      },
                      0.25
                    ]
                  } // Growth trend
                ]
              },
              100
            ]
          },
          
          // Strategic recommendations
          strategicRecommendation: {
            $switch: {
              branches: [
                {
                  case: { $and: [
                    { $eq: ['$salesTrend', 'growing'] },
                    { $gt: ['$profitMargin', 0.25] },
                    { $lt: ['$categoryRank', 5] }
                  ]},
                  then: 'Star Product: Increase investment and marketing focus'
                },
                {
                  case: { $and: [
                    { $eq: ['$lifecycleStage', 'maturity'] },
                    { $gt: ['$profitMargin', 0.2] }
                  ]},
                  then: 'Cash Cow: Optimize operations and maintain market share'
                },
                {
                  case: { $and: [
                    { $eq: ['$salesTrend', 'growing'] },
                    { $lt: ['$profitMargin', 0.15] }
                  ]},
                  then: 'Question Mark: Improve margins or consider repositioning'
                },
                {
                  case: { $and: [
                    { $eq: ['$salesTrend', 'declining'] },
                    { $lt: ['$profitMargin', 0.1] }
                  ]},
                  then: 'Dog: Consider discontinuation or major repositioning'
                },
                {
                  case: { $eq: ['$lifecycleStage', 'new'] },
                  then: 'Monitor closely and provide marketing support'
                }
              ],
              default: 'Maintain current strategy with regular monitoring'
            }
          }
        }
      },
      
      // Stage 6: Final projection and sorting
      {
        $project: {
          _id: 1,
          name: 1,
          category: 1,
          brand: 1,
          'pricing.cost': 1,
          'pricing.retail': 1,
          
          // Sales performance
          totalUnitsSold: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          totalProfit: { $round: ['$totalProfit', 2] },
          totalOrders: 1,
          uniqueCustomers: 1,
          
          // Financial metrics
          avgSellingPrice: { $round: ['$avgSellingPrice', 2] },
          profitMargin: { $round: [{ $multiply: ['$profitMargin', 100] }, 2] },
          revenuePerCustomer: { $round: ['$revenuePerCustomer', 2] },
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          
          // Performance indicators
          performanceScore: { $round: ['$performanceScore', 1] },
          lifecycleStage: 1,
          salesTrend: 1,
          categoryRank: 1,
          marketShareInCategory: { $round: [{ $multiply: ['$marketShareInCategory', 100] }, 3] },
          
          // Operational metrics
          inventoryTurnover: { $round: ['$inventoryTurnover', 2] },
          'inventory.quantity': 1,
          'inventory.lowStockThreshold': 1,
          
          // Timeline
          firstSaleDate: 1,
          lastSaleDate: 1,
          
          // Strategic guidance
          strategicRecommendation: 1,
          
          // Monthly trend data (last 6 months)
          recentMonthlySales: { $slice: ['$monthlySales', 0, 6] }
        }
      },
      
      // Stage 7: Sort by performance score and revenue
      {
        $sort: {
          performanceScore: -1,
          totalRevenue: -1
        }
      }
    ];

    const results = await this.collections.products.aggregate(pipeline).toArray();
    
    console.log(`Product performance analysis completed: ${results.length} products analyzed`);
    return results;
  }

  async executeTimeSeriesAnalytics() {
    console.log('Executing time-series analytics with advanced forecasting...');
    
    const pipeline = [
      // Stage 1: Match recent orders for time-series analysis
      {
        $match: {
          status: 'completed',
          orderDate: { $gte: new Date(Date.now() - 730 * 24 * 60 * 60 * 1000) } // Last 2 years
        }
      },
      
      // Stage 2: Group by time periods
      {
        $group: {
          _id: {
            year: { $year: '$orderDate' },
            month: { $month: '$orderDate' },
            week: { $week: '$orderDate' },
            dayOfWeek: { $dayOfWeek: '$orderDate' },
            hour: { $hour: '$orderDate' }
          },
          
          // Core metrics
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: '$totals.total' },
          avgOrderValue: { $avg: '$totals.total' },
          uniqueCustomers: { $addToSet: '$customerId' },
          
          // Item-level aggregations
          totalItemsSold: {
            $sum: {
              $reduce: {
                input: '$items',
                initialValue: 0,
                in: { $add: ['$$value', '$$this.quantity'] }
              }
            }
          },
          
          // Distribution analysis
          orderValues: { $push: '$totals.total' },
          
          // Customer behavior
          newCustomers: {
            $sum: {
              $cond: [
                { $eq: [{ $dayOfYear: '$orderDate' }, { $dayOfYear: '$customer.account.createdAt' }] },
                1,
                0
              ]
            }
          },
          
          // Geographic distribution
          countries: { $addToSet: '$shippingAddress.country' },
          regions: { $addToSet: '$shippingAddress.region' }
        }
      },
      
      // Stage 3: Add time-based calculations
      {
        $addFields: {
          // Convert _id to more usable date format
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: 1
            }
          },
          
          uniqueCustomerCount: { $size: '$uniqueCustomers' },
          uniqueCountryCount: { $size: '$countries' },
          
          // Statistical measures
          revenueStdDev: { $stdDevPop: '$orderValues' },
          medianOrderValue: {
            $let: {
              vars: {
                sortedValues: {
                  $sortArray: {
                    input: '$orderValues',
                    sortBy: 1
                  }
                }
              },
              in: {
                $arrayElemAt: [
                  '$$sortedValues',
                  { $floor: { $divide: [{ $size: '$$sortedValues' }, 2] } }
                ]
              }
            }
          },
          
          // Time period classifications
          periodType: {
            $switch: {
              branches: [
                { case: { $gte: ['$_id.dayOfWeek', 2] }, then: 'weekend' },
                { case: { $lte: ['$_id.dayOfWeek', 6] }, then: 'weekday' }
              ],
              default: 'weekend'
            }
          },
          
          timeOfDay: {
            $switch: {
              branches: [
                { case: { $lt: ['$_id.hour', 6] }, then: 'late_night' },
                { case: { $lt: ['$_id.hour', 12] }, then: 'morning' },
                { case: { $lt: ['$_id.hour', 18] }, then: 'afternoon' },
                { case: { $lt: ['$_id.hour', 22] }, then: 'evening' }
              ],
              default: 'night'
            }
          }
        }
      },
      
      // Stage 4: Add moving averages and trend analysis
      {
        $setWindowFields: {
          partitionBy: null,
          sortBy: { date: 1 },
          output: {
            // Moving averages
            revenue7DayMA: {
              $avg: '$totalRevenue',
              window: { documents: [-6, 0] }
            },
            revenue30DayMA: {
              $avg: '$totalRevenue',
              window: { documents: [-29, 0] }
            },
            
            // Growth calculations
            previousDayRevenue: {
              $shift: { output: '$totalRevenue', by: -1 }
            },
            previousWeekRevenue: {
              $shift: { output: '$totalRevenue', by: -7 }
            },
            previousMonthRevenue: {
              $shift: { output: '$totalRevenue', by: -30 }
            },
            
            // Volatility measures
            revenueVolatility: {
              $stdDevPop: '$totalRevenue',
              window: { documents: [-29, 0] }
            },
            
            // Trend strength
            trendLine: {
              $linearFill: '$totalRevenue'
            }
          }
        }
      },
      
      // Stage 5: Calculate growth rates and trend indicators
      {
        $addFields: {
          dayOverDayGrowth: {
            $cond: [
              { $gt: ['$previousDayRevenue', 0] },
              { $subtract: [{ $divide: ['$totalRevenue', '$previousDayRevenue'] }, 1] },
              null
            ]
          },
          
          weekOverWeekGrowth: {
            $cond: [
              { $gt: ['$previousWeekRevenue', 0] },
              { $subtract: [{ $divide: ['$totalRevenue', '$previousWeekRevenue'] }, 1] },
              null
            ]
          },
          
          monthOverMonthGrowth: {
            $cond: [
              { $gt: ['$previousMonthRevenue', 0] },
              { $subtract: [{ $divide: ['$totalRevenue', '$previousMonthRevenue'] }, 1] },
              null
            ]
          },
          
          // Trend classification
          trendDirection: {
            $switch: {
              branches: [
                { 
                  case: { $gt: ['$revenue7DayMA', { $multiply: ['$revenue30DayMA', 1.05] }] },
                  then: 'strong_upward'
                },
                { 
                  case: { $gt: ['$revenue7DayMA', { $multiply: ['$revenue30DayMA', 1.02] }] },
                  then: 'upward'
                },
                { 
                  case: { $lt: ['$revenue7DayMA', { $multiply: ['$revenue30DayMA', 0.95] }] },
                  then: 'strong_downward'
                },
                { 
                  case: { $lt: ['$revenue7DayMA', { $multiply: ['$revenue30DayMA', 0.98] }] },
                  then: 'downward'
                }
              ],
              default: 'stable'
            }
          },
          
          // Seasonality detection
          seasonalityScore: {
            $divide: [
              '$revenueStdDev',
              { $max: ['$revenue30DayMA', 1] }
            ]
          },
          
          // Performance classification
          performanceCategory: {
            $switch: {
              branches: [
                { 
                  case: { $gte: ['$totalRevenue', { $multiply: ['$revenue30DayMA', 1.2] }] },
                  then: 'exceptional'
                },
                { 
                  case: { $gte: ['$totalRevenue', { $multiply: ['$revenue30DayMA', 1.1] }] },
                  then: 'above_average'
                },
                { 
                  case: { $lte: ['$totalRevenue', { $multiply: ['$revenue30DayMA', 0.8] }] },
                  then: 'below_average'
                },
                { 
                  case: { $lte: ['$totalRevenue', { $multiply: ['$revenue30DayMA', 0.9] }] },
                  then: 'poor'
                }
              ],
              default: 'average'
            }
          }
        }
      },
      
      // Stage 6: Add forecasting indicators
      {
        $addFields: {
          // Simple linear trend projection (next 7 days)
          next7DayForecast: {
            $add: [
              '$revenue7DayMA',
              {
                $multiply: [
                  7,
                  { $subtract: ['$revenue7DayMA', { $shift: { output: '$revenue7DayMA', by: -7 } }] }
                ]
              }
            ]
          },
          
          // Confidence interval for forecast
          forecastConfidence: {
            $subtract: [
              100,
              { $multiply: [{ $divide: ['$revenueVolatility', '$revenue7DayMA'] }, 100] }
            ]
          },
          
          // Anomaly detection
          isAnomaly: {
            $or: [
              { $gt: ['$totalRevenue', { $add: ['$revenue7DayMA', { $multiply: ['$revenueVolatility', 2] }] }] },
              { $lt: ['$totalRevenue', { $subtract: ['$revenue7DayMA', { $multiply: ['$revenueVolatility', 2] }] }] }
            ]
          },
          
          // Business recommendations
          recommendation: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$trendDirection', 'strong_downward'] },
                  then: 'Urgent: Investigate revenue decline and implement recovery strategies'
                },
                {
                  case: { $eq: ['$trendDirection', 'strong_upward'] },
                  then: 'Opportunity: Scale successful initiatives and increase capacity'
                },
                {
                  case: { $gt: ['$seasonalityScore', 0.5] },
                  then: 'High volatility detected: Implement demand smoothing strategies'
                },
                {
                  case: { $eq: ['$performanceCategory', 'exceptional'] },
                  then: 'Analyze success factors for replication'
                }
              ],
              default: 'Continue monitoring with current strategy'
            }
          }
        }
      },
      
      // Stage 7: Final projection and filtering
      {
        $project: {
          date: 1,
          year: '$_id.year',
          month: '$_id.month',
          week: '$_id.week',
          dayOfWeek: '$_id.dayOfWeek',
          hour: '$_id.hour',
          
          // Core metrics
          orderCount: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          uniqueCustomerCount: 1,
          totalItemsSold: 1,
          
          // Statistical measures
          medianOrderValue: { $round: ['$medianOrderValue', 2] },
          revenueStdDev: { $round: ['$revenueStdDev', 2] },
          
          // Trend analysis
          revenue7DayMA: { $round: ['$revenue7DayMA', 2] },
          revenue30DayMA: { $round: ['$revenue30DayMA', 2] },
          dayOverDayGrowth: { $round: [{ $multiply: ['$dayOverDayGrowth', 100] }, 2] },
          weekOverWeekGrowth: { $round: [{ $multiply: ['$weekOverWeekGrowth', 100] }, 2] },
          monthOverMonthGrowth: { $round: [{ $multiply: ['$monthOverMonthGrowth', 100] }, 2] },
          
          trendDirection: 1,
          performanceCategory: 1,
          seasonalityScore: { $round: ['$seasonalityScore', 3] },
          
          // Forecasting
          next7DayForecast: { $round: ['$next7DayForecast', 2] },
          forecastConfidence: { $round: ['$forecastConfidence', 1] },
          isAnomaly: 1,
          
          // Context
          periodType: 1,
          timeOfDay: 1,
          uniqueCountryCount: 1,
          
          // Business intelligence
          recommendation: 1
        }
      },
      
      // Stage 8: Sort by date descending
      {
        $sort: { date: -1 }
      },
      
      // Stage 9: Limit to recent data for performance
      {
        $limit: 365 // Last year of daily data
      }
    ];

    const results = await this.collections.orders.aggregate(pipeline).toArray();
    
    console.log(`Time-series analytics completed: ${results.length} time periods analyzed`);
    return results;
  }

  async executePredictiveAnalytics() {
    console.log('Executing predictive analytics and machine learning insights...');
    
    const pipeline = [
      // Stage 1: Create customer behavioral features
      {
        $match: {
          'account.status': 'active'
        }
      },
      
      // Stage 2: Lookup order history
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          as: 'orders',
          pipeline: [
            {
              $match: {
                status: 'completed',
                orderDate: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
              }
            },
            {
              $project: {
                orderDate: 1,
                'totals.total': 1,
                daysSinceRegistration: {
                  $divide: [
                    { $subtract: ['$orderDate', '$customer.account.createdAt'] },
                    1000 * 60 * 60 * 24
                  ]
                }
              }
            },
            { $sort: { orderDate: 1 } }
          ]
        }
      },
      
      // Stage 3: Calculate predictive features
      {
        $addFields: {
          // Temporal features
          daysSinceRegistration: {
            $divide: [
              { $subtract: [new Date(), '$account.createdAt'] },
              1000 * 60 * 60 * 24
            ]
          },
          
          daysSinceLastOrder: {
            $cond: [
              { $gt: [{ $size: '$orders' }, 0] },
              {
                $divide: [
                  { $subtract: [new Date(), { $max: '$orders.orderDate' }] },
                  1000 * 60 * 60 * 24
                ]
              },
              999
            ]
          },
          
          // Purchase behavior features
          totalOrders: { $size: '$orders' },
          totalSpent: {
            $reduce: {
              input: '$orders',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.totals.total'] }
            }
          },
          
          // Purchase frequency and regularity
          avgDaysBetweenOrders: {
            $cond: [
              { $gt: [{ $size: '$orders' }, 1] },
              {
                $divide: [
                  {
                    $divide: [
                      { $subtract: [{ $max: '$orders.orderDate' }, { $min: '$orders.orderDate' }] },
                      1000 * 60 * 60 * 24
                    ]
                  },
                  { $subtract: [{ $size: '$orders' }, 1] }
                ]
              },
              null
            ]
          },
          
          // Purchase pattern analysis
          orderFrequencyTrend: {
            $let: {
              vars: {
                recentOrders: {
                  $size: {
                    $filter: {
                      input: '$orders',
                      cond: { $gte: ['$$this.orderDate', { $dateSubtract: { startDate: new Date(), unit: 'day', amount: 90 } }] }
                    }
                  }
                },
                olderOrders: {
                  $size: {
                    $filter: {
                      input: '$orders',
                      cond: { 
                        $and: [
                          { $lt: ['$$this.orderDate', { $dateSubtract: { startDate: new Date(), unit: 'day', amount: 90 } }] },
                          { $gte: ['$$this.orderDate', { $dateSubtract: { startDate: new Date(), unit: 'day', amount: 180 } }] }
                        ]
                      }
                    }
                  }
                }
              },
              in: {
                $cond: [
                  { $gt: ['$$olderOrders', 0] },
                  { $subtract: [{ $divide: ['$$recentOrders', 90] }, { $divide: ['$$olderOrders', 90] }] },
                  0
                ]
              }
            }
          }
        }
      },
      
      // Stage 4: Calculate churn probability using logistic regression approximation
      {
        $addFields: {
          // Feature normalization and scoring
          recencyScore: {
            $cond: [
              { $gt: ['$daysSinceLastOrder', 180] }, 0.8,
              { $cond: [
                { $gt: ['$daysSinceLastOrder', 90] }, 0.6,
                { $cond: [
                  { $gt: ['$daysSinceLastOrder', 30] }, 0.3,
                  0.1
                ]}
              ]}
            ]
          },
          
          frequencyScore: {
            $cond: [
              { $lt: ['$totalOrders', 2] }, 0.7,
              { $cond: [
                { $lt: ['$totalOrders', 5] }, 0.5,
                { $cond: [
                  { $lt: ['$totalOrders', 10] }, 0.3,
                  0.1
                ]}
              ]}
            ]
          },
          
          monetaryScore: {
            $cond: [
              { $lt: ['$totalSpent', 100] }, 0.6,
              { $cond: [
                { $lt: ['$totalSpent', 500] }, 0.4,
                { $cond: [
                  { $lt: ['$totalSpent', 1000] }, 0.2,
                  0.1
                ]}
              ]}
            ]
          },
          
          engagementScore: {
            $cond: [
              { $lt: ['$orderFrequencyTrend', -0.5] }, 0.8,
              { $cond: [
                { $lt: ['$orderFrequencyTrend', 0] }, 0.6,
                { $cond: [
                  { $gt: ['$orderFrequencyTrend', 0.5] }, 0.1,
                  0.3
                ]}
              ]}
            ]
          }
        }
      },
      
      // Stage 5: Calculate composite churn probability
      {
        $addFields: {
          churnProbability: {
            $multiply: [
              {
                $add: [
                  { $multiply: ['$recencyScore', 0.35] },
                  { $multiply: ['$frequencyScore', 0.25] },
                  { $multiply: ['$monetaryScore', 0.25] },
                  { $multiply: ['$engagementScore', 0.15] }
                ]
              },
              100
            ]
          },
          
          // Customer lifetime value prediction
          predictedLifetimeValue: {
            $cond: [
              { $and: [
                { $gt: ['$totalOrders', 0] },
                { $gt: ['$avgDaysBetweenOrders', 0] }
              ]},
              {
                $multiply: [
                  { $divide: ['$totalSpent', '$totalOrders'] }, // Average order value
                  { $divide: [365, '$avgDaysBetweenOrders'] }, // Orders per year
                  { $subtract: [5, { $multiply: ['$churnProbability', 0.05] }] } // Expected years (adjusted for churn risk)
                ]
              },
              '$totalSpent'
            ]
          },
          
          // Next purchase prediction
          nextPurchasePrediction: {
            $cond: [
              { $gt: ['$avgDaysBetweenOrders', 0] },
              {
                $dateAdd: {
                  startDate: { $max: '$orders.orderDate' },
                  unit: 'day',
                  amount: { 
                    $multiply: [
                      '$avgDaysBetweenOrders',
                      { $add: [1, { $multiply: ['$churnProbability', 0.01] }] } // Adjust for churn risk
                    ]
                  }
                }
              },
              null
            ]
          },
          
          // Upselling opportunity score
          upsellOpportunity: {
            $multiply: [
              {
                $add: [
                  { $cond: [{ $gt: ['$totalOrders', 5] }, 0.3, 0] },
                  { $cond: [{ $gt: ['$totalSpent', 500] }, 0.3, 0] },
                  { $cond: [{ $lt: ['$daysSinceLastOrder', 30] }, 0.25, 0] },
                  { $cond: [{ $gt: ['$orderFrequencyTrend', 0] }, 0.15, 0] }
                ]
              },
              100
            ]
          }
        }
      },
      
      // Stage 6: Risk segmentation and recommendations
      {
        $addFields: {
          riskSegment: {
            $switch: {
              branches: [
                { case: { $gte: ['$churnProbability', 70] }, then: 'high_risk' },
                { case: { $gte: ['$churnProbability', 50] }, then: 'medium_risk' },
                { case: { $gte: ['$churnProbability', 30] }, then: 'low_risk' }
              ],
              default: 'stable'
            }
          },
          
          valueSegment: {
            $switch: {
              branches: [
                { case: { $gte: ['$predictedLifetimeValue', 2000] }, then: 'high_value' },
                { case: { $gte: ['$predictedLifetimeValue', 1000] }, then: 'medium_value' },
                { case: { $gte: ['$predictedLifetimeValue', 500] }, then: 'moderate_value' }
              ],
              default: 'low_value'
            }
          },
          
          // AI-driven marketing recommendations
          marketingRecommendation: {
            $switch: {
              branches: [
                {
                  case: { $and: [
                    { $eq: ['$riskSegment', 'high_risk'] },
                    { $in: ['$valueSegment', ['high_value', 'medium_value']] }
                  ]},
                  then: 'Urgent win-back campaign with premium incentives'
                },
                {
                  case: { $and: [
                    { $eq: ['$riskSegment', 'medium_risk'] },
                    { $gte: ['$upsellOpportunity', 60] }
                  ]},
                  then: 'Proactive engagement with upselling opportunities'
                },
                {
                  case: { $and: [
                    { $eq: ['$riskSegment', 'stable'] },
                    { $gte: ['$upsellOpportunity', 70] }
                  ]},
                  then: 'Cross-sell and premium product recommendations'
                },
                {
                  case: { $eq: ['$riskSegment', 'low_risk'] },
                  then: 'Retention campaign with loyalty program enrollment'
                }
              ],
              default: 'Monitor and maintain current engagement level'
            }
          }
        }
      },
      
      // Stage 7: Add market basket analysis
      {
        $lookup: {
          from: 'orders',
          let: { customerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$customerId', '$$customerId'] },
                status: 'completed'
              }
            },
            { $unwind: '$items' },
            {
              $group: {
                _id: '$items.productId',
                purchaseCount: { $sum: 1 },
                totalQuantity: { $sum: '$items.quantity' },
                totalSpent: { $sum: '$items.totalPrice' }
              }
            },
            { $sort: { purchaseCount: -1 } },
            { $limit: 5 }
          ],
          as: 'topProducts'
        }
      },
      
      // Stage 8: Final projection
      {
        $project: {
          _id: 1,
          email: 1,
          'profile.firstName': 1,
          'profile.lastName': 1,
          'account.type': 1,
          'account.createdAt': 1,
          
          // Behavioral metrics
          daysSinceRegistration: { $round: ['$daysSinceRegistration', 0] },
          daysSinceLastOrder: { $round: ['$daysSinceLastOrder', 0] },
          totalOrders: 1,
          totalSpent: { $round: ['$totalSpent', 2] },
          avgDaysBetweenOrders: { $round: ['$avgDaysBetweenOrders', 1] },
          
          // Predictive scores
          churnProbability: { $round: ['$churnProbability', 1] },
          predictedLifetimeValue: { $round: ['$predictedLifetimeValue', 2] },
          upsellOpportunity: { $round: ['$upsellOpportunity', 1] },
          
          // Segmentation
          riskSegment: 1,
          valueSegment: 1,
          
          // Predictions
          nextPurchasePrediction: 1,
          marketingRecommendation: 1,
          
          // Product affinity
          topProducts: 1,
          
          // Trend analysis
          orderFrequencyTrend: { $round: ['$orderFrequencyTrend', 3] }
        }
      },
      
      // Stage 9: Sort by strategic importance
      {
        $sort: {
          predictedLifetimeValue: -1,
          churnProbability: -1,
          upsellOpportunity: -1
        }
      },
      
      // Stage 10: Limit to top opportunities
      {
        $limit: 1000
      }
    ];

    const results = await this.collections.customers.aggregate(pipeline).toArray();
    
    console.log(`Predictive analytics completed: ${results.length} customers analyzed with ML insights`);
    return results;
  }

  async cacheAnalyticsResults(analysisType, data) {
    console.log(`Caching ${analysisType} analytics results...`);
    
    try {
      await this.collections.analytics.replaceOne(
        { type: analysisType },
        {
          type: analysisType,
          data: data,
          generatedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hour TTL
        },
        { upsert: true }
      );
      
    } catch (error) {
      console.warn('Failed to cache analytics results:', error.message);
    }
  }

  async getAnalyticsDashboard() {
    console.log('Generating comprehensive analytics dashboard...');
    
    const [
      salesSummary,
      customerInsights,
      productInsights,
      timeSeriesInsights,
      predictiveInsights
    ] = await Promise.all([
      this.getSalesSummary(),
      this.getCustomerInsights(),
      this.getProductInsights(),
      this.getTimeSeriesInsights(),
      this.getPredictiveInsights()
    ]);

    return {
      dashboard: {
        salesSummary,
        customerInsights,
        productInsights,
        timeSeriesInsights,
        predictiveInsights
      },
      metadata: {
        generatedAt: new Date(),
        dataFreshness: '< 1 hour',
        recordsCovered: {
          orders: salesSummary.totalOrders || 0,
          customers: customerInsights.totalCustomers || 0,
          products: productInsights.totalProducts || 0
        }
      }
    };
  }

  async getSalesSummary() {
    const pipeline = [
      {
        $match: {
          status: 'completed',
          orderDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totals.total' },
          avgOrderValue: { $avg: '$totals.total' },
          uniqueCustomers: { $addToSet: '$customerId' }
        }
      },
      {
        $project: {
          totalOrders: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          uniqueCustomers: { $size: '$uniqueCustomers' }
        }
      }
    ];

    const result = await this.collections.orders.aggregate(pipeline).toArray();
    return result[0] || {};
  }

  async getCustomerInsights() {
    const pipeline = [
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          activeCustomers: { $sum: { $cond: [{ $eq: ['$account.status', 'active'] }, 1, 0] } },
          premiumCustomers: { $sum: { $cond: [{ $eq: ['$account.type', 'premium'] }, 1, 0] } }
        }
      }
    ];

    const result = await this.collections.customers.aggregate(pipeline).toArray();
    return result[0] || {};
  }

  async getProductInsights() {
    const pipeline = [
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          activeProducts: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          avgPrice: { $avg: '$pricing.retail' }
        }
      },
      {
        $project: {
          totalProducts: 1,
          activeProducts: 1,
          avgPrice: { $round: ['$avgPrice', 2] }
        }
      }
    ];

    const result = await this.collections.products.aggregate(pipeline).toArray();
    return result[0] || {};
  }

  async getTimeSeriesInsights() {
    return {
      trend: 'upward',
      growthRate: 12.5,
      volatility: 'moderate'
    };
  }

  async getPredictiveInsights() {
    return {
      averageChurnRisk: 25.3,
      highValueCustomers: 150,
      upsellOpportunities: 320
    };
  }
}

// Benefits of MongoDB Advanced Aggregation Framework:
// - Real-time analytics processing without ETL pipelines or data warehouses
// - Complex multi-stage transformations with window functions and statistical operations
// - Advanced time-series analysis with forecasting and trend detection capabilities
// - Machine learning integration for predictive analytics and customer segmentation
// - Flexible aggregation patterns that adapt to changing analytical requirements
// - High-performance processing that scales with data volume and complexity
// - SQL-compatible analytical operations through QueryLeaf integration
// - Comprehensive business intelligence capabilities within the operational database
// - Advanced statistical functions and mathematical operations for data science
// - Real-time dashboard generation with automated insights and recommendations

module.exports = {
  MongoDBAnalyticsEngine
};
```

## SQL-Style Aggregation with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB aggregation operations:

```sql
-- QueryLeaf advanced analytics with SQL-familiar aggregation syntax

-- Complex sales analytics with window functions and advanced aggregations
WITH monthly_sales_analysis AS (
  SELECT 
    DATE_TRUNC('month', order_date) as month,
    product_category,
    customer_location.country,
    customer_type,
    
    -- Basic aggregations
    COUNT(*) as order_count,
    COUNT(DISTINCT customer_id) as unique_customers,
    SUM(total_amount) as total_revenue,
    AVG(total_amount) as avg_order_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_amount) as median_order_value,
    STDDEV_POP(total_amount) as order_value_stddev,
    
    -- Item-level aggregations
    SUM(item_quantity) as total_items_sold,
    AVG(item_quantity) as avg_items_per_order,
    SUM(item_quantity * item_unit_price) as item_revenue,
    AVG(item_unit_price) as avg_item_price,
    
    -- Advanced calculations
    SUM(item_quantity * (item_unit_price - product_cost)) as total_profit,
    AVG((item_unit_price - product_cost) / item_unit_price) as avg_profit_margin,
    
    -- Customer behavior metrics
    COUNT(*) FILTER (WHERE customer_registration_date >= DATE_TRUNC('month', order_date)) as new_customers,
    COUNT(DISTINCT customer_id) FILTER (WHERE previous_order_date < DATE_TRUNC('month', order_date) - INTERVAL '3 months') as returning_customers,
    
    -- Geographic diversity
    COUNT(DISTINCT customer_location.country) as unique_countries,
    COUNT(DISTINCT customer_location.region) as unique_regions
    
  FROM orders o
  CROSS JOIN UNNEST(o.items) as item
  JOIN products p ON item.product_id = p._id
  JOIN customers c ON o.customer_id = c._id
  WHERE o.status = 'completed'
    AND o.order_date >= CURRENT_DATE - INTERVAL '24 months'
  GROUP BY 
    DATE_TRUNC('month', order_date),
    product_category,
    customer_location.country,
    customer_type
),

-- Advanced window functions for trend analysis
sales_with_trends AS (
  SELECT 
    *,
    
    -- Moving averages
    AVG(total_revenue) OVER (
      PARTITION BY product_category, customer_location.country
      ORDER BY month
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) as revenue_3month_ma,
    
    AVG(total_revenue) OVER (
      PARTITION BY product_category, customer_location.country
      ORDER BY month  
      ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
    ) as revenue_6month_ma,
    
    -- Growth calculations
    LAG(total_revenue, 1) OVER (
      PARTITION BY product_category, customer_location.country
      ORDER BY month
    ) as prev_month_revenue,
    
    LAG(total_revenue, 12) OVER (
      PARTITION BY product_category, customer_location.country
      ORDER BY month
    ) as prev_year_revenue,
    
    -- Ranking and percentiles
    RANK() OVER (
      PARTITION BY month
      ORDER BY total_revenue DESC
    ) as monthly_revenue_rank,
    
    PERCENT_RANK() OVER (
      PARTITION BY month
      ORDER BY total_revenue
    ) as monthly_revenue_percentile,
    
    -- Cumulative calculations
    SUM(total_revenue) OVER (
      PARTITION BY product_category, customer_location.country
      ORDER BY month
      ROWS UNBOUNDED PRECEDING
    ) as cumulative_revenue,
    
    -- Volatility measures
    STDDEV(total_revenue) OVER (
      PARTITION BY product_category, customer_location.country
      ORDER BY month
      ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
    ) as revenue_volatility,
    
    -- Lead/lag for forecasting
    LEAD(total_revenue, 1) OVER (
      PARTITION BY product_category, customer_location.country
      ORDER BY month
    ) as next_month_actual,
    
    -- Dense rank for market position
    DENSE_RANK() OVER (
      PARTITION BY month
      ORDER BY total_revenue DESC
    ) as market_position
    
  FROM monthly_sales_analysis
),

-- Calculate growth rates and performance indicators
performance_metrics AS (
  SELECT 
    *,
    
    -- Growth rate calculations
    CASE 
      WHEN prev_month_revenue > 0 THEN 
        ROUND(((total_revenue - prev_month_revenue) / prev_month_revenue * 100), 2)
      ELSE NULL
    END as month_over_month_growth,
    
    CASE 
      WHEN prev_year_revenue > 0 THEN
        ROUND(((total_revenue - prev_year_revenue) / prev_year_revenue * 100), 2)
      ELSE NULL
    END as year_over_year_growth,
    
    -- Trend classification
    CASE 
      WHEN revenue_3month_ma > revenue_6month_ma * 1.05 THEN 'strong_growth'
      WHEN revenue_3month_ma > revenue_6month_ma * 1.02 THEN 'moderate_growth'
      WHEN revenue_3month_ma < revenue_6month_ma * 0.95 THEN 'declining'
      WHEN revenue_3month_ma < revenue_6month_ma * 0.98 THEN 'weak_growth'
      ELSE 'stable'
    END as trend_classification,
    
    -- Performance assessment
    CASE 
      WHEN monthly_revenue_percentile >= 0.9 THEN 'top_performer'
      WHEN monthly_revenue_percentile >= 0.75 THEN 'strong_performer'
      WHEN monthly_revenue_percentile >= 0.5 THEN 'average_performer'
      WHEN monthly_revenue_percentile >= 0.25 THEN 'weak_performer'
      ELSE 'bottom_performer'
    END as performance_category,
    
    -- Volatility assessment
    CASE 
      WHEN revenue_volatility / NULLIF(revenue_6month_ma, 0) > 0.3 THEN 'high_volatility'
      WHEN revenue_volatility / NULLIF(revenue_6month_ma, 0) > 0.15 THEN 'moderate_volatility'
      ELSE 'low_volatility'
    END as volatility_level,
    
    -- Market share approximation
    ROUND(
      (total_revenue / SUM(total_revenue) OVER (PARTITION BY month) * 100), 
      3
    ) as market_share_percent,
    
    -- Customer metrics
    ROUND((total_revenue / unique_customers), 2) as revenue_per_customer,
    ROUND((total_profit / total_revenue * 100), 2) as profit_margin_percent,
    ROUND((new_customers / unique_customers * 100), 2) as new_customer_rate,
    
    -- Operational efficiency
    ROUND((total_items_sold / order_count), 2) as items_per_order,
    ROUND((total_revenue / total_items_sold), 2) as revenue_per_item
    
  FROM sales_with_trends
),

-- Advanced customer segmentation with RFM analysis
customer_rfm_analysis AS (
  SELECT 
    customer_id,
    customer_type,
    customer_location.country,
    customer_registration_date,
    
    -- Recency calculation (days since last order)
    EXTRACT(DAYS FROM (CURRENT_DATE - MAX(order_date))) as recency_days,
    
    -- Frequency (number of orders)
    COUNT(*) as frequency,
    
    -- Monetary (total spending)
    SUM(total_amount) as monetary_value,
    
    -- Additional behavioral metrics
    AVG(total_amount) as avg_order_value,
    MIN(order_date) as first_order_date,
    MAX(order_date) as last_order_date,
    COUNT(DISTINCT product_category) as unique_categories_purchased,
    EXTRACT(DAYS FROM (MAX(order_date) - MIN(order_date))) as customer_lifetime_days,
    
    -- Purchase patterns
    AVG(EXTRACT(DAYS FROM (order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date)))) as avg_days_between_orders,
    STDDEV(total_amount) as order_value_consistency,
    
    -- Seasonal analysis
    COUNT(*) FILTER (WHERE EXTRACT(QUARTER FROM order_date) = 1) as q1_orders,
    COUNT(*) FILTER (WHERE EXTRACT(QUARTER FROM order_date) = 2) as q2_orders,
    COUNT(*) FILTER (WHERE EXTRACT(QUARTER FROM order_date) = 3) as q3_orders,
    COUNT(*) FILTER (WHERE EXTRACT(QUARTER FROM order_date) = 4) as q4_orders
    
  FROM orders o
  JOIN customers c ON o.customer_id = c._id
  WHERE o.status = 'completed'
    AND o.order_date >= CURRENT_DATE - INTERVAL '24 months'
  GROUP BY customer_id, customer_type, customer_location.country, customer_registration_date
),

-- Calculate RFM scores and customer segments
customer_segments AS (
  SELECT 
    *,
    
    -- RFM score calculations using percentile ranking
    NTILE(5) OVER (ORDER BY recency_days ASC) as recency_score, -- Lower recency is better
    NTILE(5) OVER (ORDER BY frequency DESC) as frequency_score, -- Higher frequency is better  
    NTILE(5) OVER (ORDER BY monetary_value DESC) as monetary_score, -- Higher monetary is better
    
    -- Customer lifetime value prediction
    CASE 
      WHEN avg_days_between_orders > 0 THEN
        ROUND(
          (avg_order_value * (365.0 / avg_days_between_orders) * 3), -- 3 year projection
          2
        )
      ELSE monetary_value
    END as predicted_lifetime_value,
    
    -- Churn risk assessment
    CASE 
      WHEN recency_days > 180 THEN 'high_risk'
      WHEN recency_days > 90 THEN 'medium_risk'
      WHEN recency_days > 30 THEN 'low_risk'
      ELSE 'active'
    END as churn_risk,
    
    -- Engagement level
    CASE 
      WHEN frequency >= 10 AND recency_days <= 30 THEN 'highly_engaged'
      WHEN frequency >= 5 AND recency_days <= 60 THEN 'moderately_engaged'
      WHEN frequency >= 2 AND recency_days <= 120 THEN 'lightly_engaged'
      ELSE 'disengaged'
    END as engagement_level,
    
    -- Purchase diversity
    CASE 
      WHEN unique_categories_purchased >= 5 THEN 'diverse_buyer'
      WHEN unique_categories_purchased >= 3 THEN 'selective_buyer'
      ELSE 'focused_buyer'
    END as purchase_diversity
    
  FROM customer_rfm_analysis
),

-- Final customer classification
customer_classification AS (
  SELECT 
    *,
    
    -- RFM segment classification
    CASE 
      WHEN recency_score >= 4 AND frequency_score >= 4 AND monetary_score >= 4 THEN 'champions'
      WHEN recency_score >= 2 AND frequency_score >= 3 AND monetary_score >= 3 THEN 'loyal_customers'
      WHEN recency_score >= 3 AND frequency_score <= 3 AND monetary_score <= 3 THEN 'potential_loyalists'
      WHEN recency_score >= 4 AND frequency_score <= 1 THEN 'new_customers'
      WHEN recency_score >= 3 AND frequency_score <= 1 AND monetary_score <= 2 THEN 'promising'
      WHEN recency_score <= 2 AND frequency_score >= 2 AND monetary_score >= 2 THEN 'need_attention'
      WHEN recency_score <= 2 AND frequency_score <= 2 AND monetary_score >= 3 THEN 'about_to_sleep'
      WHEN recency_score <= 2 AND frequency_score <= 2 AND monetary_score <= 2 THEN 'at_risk'
      WHEN recency_score <= 1 AND frequency_score <= 2 AND monetary_score >= 4 THEN 'cannot_lose_them'
      ELSE 'hibernating'
    END as rfm_segment,
    
    -- Marketing action recommendations
    CASE 
      WHEN recency_score >= 4 AND frequency_score >= 4 THEN 'Reward with loyalty program and exclusive offers'
      WHEN monetary_score >= 4 AND recency_score <= 2 THEN 'Win-back campaign with premium incentives'
      WHEN recency_score >= 4 AND frequency_score <= 2 THEN 'Nurture with educational content and onboarding'
      WHEN frequency_score >= 3 AND recency_days > 60 THEN 'Re-engagement campaign with personalized offers'
      WHEN churn_risk = 'high_risk' AND monetary_score >= 3 THEN 'Urgent retention campaign'
      ELSE 'Monitor and maintain regular communication'
    END as marketing_recommendation
    
  FROM customer_segments
),

-- Product performance analysis with advanced metrics
product_performance AS (
  SELECT 
    p._id as product_id,
    p.name as product_name,
    p.category,
    p.brand,
    p.pricing.cost,
    p.pricing.retail,
    
    -- Sales metrics from orders
    COALESCE(sales.total_units_sold, 0) as total_units_sold,
    COALESCE(sales.total_revenue, 0) as total_revenue,
    COALESCE(sales.total_orders, 0) as total_orders,
    COALESCE(sales.unique_customers, 0) as unique_customers,
    COALESCE(sales.avg_selling_price, p.pricing.retail) as avg_selling_price,
    
    -- Profitability analysis
    COALESCE(sales.total_profit, 0) as total_profit,
    CASE 
      WHEN COALESCE(sales.total_revenue, 0) > 0 THEN
        ROUND((COALESCE(sales.total_profit, 0) / sales.total_revenue * 100), 2)
      ELSE 0
    END as profit_margin_percent,
    
    -- Performance indicators
    CASE 
      WHEN COALESCE(sales.total_revenue, 0) = 0 THEN 'no_sales'
      WHEN sales.first_sale_date >= CURRENT_DATE - INTERVAL '90 days' THEN 'new_product'
      WHEN sales.total_revenue >= 50000 AND sales.total_profit / sales.total_revenue >= 0.2 THEN 'star'
      WHEN sales.total_revenue >= 10000 AND sales.total_profit / sales.total_revenue >= 0.15 THEN 'promising'
      WHEN sales.last_sale_date < CURRENT_DATE - INTERVAL '60 days' THEN 'declining'
      ELSE 'stable'
    END as performance_category,
    
    -- Inventory analysis
    p.inventory.quantity as current_stock,
    CASE 
      WHEN COALESCE(sales.total_units_sold, 0) > 0 AND p.inventory.quantity > 0 THEN
        ROUND((sales.total_units_sold / p.inventory.quantity), 2)
      ELSE 0
    END as inventory_turnover,
    
    -- Market position
    sales.category_rank,
    sales.category_market_share,
    
    -- Time-based metrics
    sales.first_sale_date,
    sales.last_sale_date,
    sales.sales_trend
    
  FROM products p
  LEFT JOIN (
    SELECT 
      item.product_id,
      COUNT(DISTINCT o.order_id) as total_orders,
      SUM(item.quantity) as total_units_sold,
      SUM(item.quantity * item.unit_price) as total_revenue,
      COUNT(DISTINCT o.customer_id) as unique_customers,
      AVG(item.unit_price) as avg_selling_price,
      MIN(o.order_date) as first_sale_date,
      MAX(o.order_date) as last_sale_date,
      SUM(item.quantity * (item.unit_price - p.pricing.cost)) as total_profit,
      
      -- Category ranking
      RANK() OVER (PARTITION BY p.category ORDER BY SUM(item.quantity * item.unit_price) DESC) as category_rank,
      
      -- Market share within category
      ROUND(
        (SUM(item.quantity * item.unit_price) / 
         SUM(SUM(item.quantity * item.unit_price)) OVER (PARTITION BY p.category) * 100),
        2
      ) as category_market_share,
      
      -- Sales trend analysis
      CASE 
        WHEN COUNT(*) FILTER (WHERE o.order_date >= CURRENT_DATE - INTERVAL '90 days') >
             COUNT(*) FILTER (WHERE o.order_date BETWEEN CURRENT_DATE - INTERVAL '180 days' AND CURRENT_DATE - INTERVAL '90 days') 
        THEN 'growing'
        WHEN COUNT(*) FILTER (WHERE o.order_date >= CURRENT_DATE - INTERVAL '90 days') <
             COUNT(*) FILTER (WHERE o.order_date BETWEEN CURRENT_DATE - INTERVAL '180 days' AND CURRENT_DATE - INTERVAL '90 days') * 0.8
        THEN 'declining'  
        ELSE 'stable'
      END as sales_trend
      
    FROM orders o
    CROSS JOIN UNNEST(o.items) as item
    JOIN products p ON item.product_id = p._id
    WHERE o.status = 'completed'
      AND o.order_date >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY item.product_id, p.category, p.pricing.cost
  ) sales ON p._id = sales.product_id
)

-- Final consolidated analytics report
SELECT 
  'EXECUTIVE_SUMMARY' as report_section,
  
  -- Overall business performance
  (SELECT COUNT(*) FROM performance_metrics WHERE month >= CURRENT_DATE - INTERVAL '1 month') as current_month_segments,
  (SELECT ROUND(AVG(total_revenue), 2) FROM performance_metrics WHERE month >= CURRENT_DATE - INTERVAL '1 month') as avg_monthly_revenue,
  (SELECT ROUND(AVG(month_over_month_growth), 2) FROM performance_metrics WHERE month_over_month_growth IS NOT NULL) as avg_growth_rate,
  
  -- Customer insights
  (SELECT COUNT(*) FROM customer_classification WHERE rfm_segment = 'champions') as champion_customers,
  (SELECT COUNT(*) FROM customer_classification WHERE churn_risk = 'high_risk') as high_risk_customers,
  (SELECT ROUND(AVG(predicted_lifetime_value), 2) FROM customer_classification) as avg_customer_lifetime_value,
  
  -- Product insights
  (SELECT COUNT(*) FROM product_performance WHERE performance_category = 'star') as star_products,
  (SELECT COUNT(*) FROM product_performance WHERE performance_category = 'declining') as declining_products,
  (SELECT ROUND(AVG(profit_margin_percent), 2) FROM product_performance WHERE total_revenue > 0) as avg_profit_margin,
  
  -- Strategic recommendations
  CASE 
    WHEN (SELECT AVG(month_over_month_growth) FROM performance_metrics WHERE month_over_month_growth IS NOT NULL) < -10 
    THEN 'URGENT: Implement revenue recovery strategy'
    WHEN (SELECT COUNT(*) FROM customer_classification WHERE churn_risk = 'high_risk') > 
         (SELECT COUNT(*) FROM customer_classification WHERE rfm_segment = 'champions')
    THEN 'FOCUS: Customer retention and re-engagement programs'
    WHEN (SELECT COUNT(*) FROM product_performance WHERE performance_category = 'star') < 5
    THEN 'OPPORTUNITY: Invest in product development and innovation'
    ELSE 'MAINTAIN: Continue current strategies with incremental improvements'
  END as primary_strategic_recommendation

UNION ALL

-- Performance trends
SELECT 
  'PERFORMANCE_TRENDS',
  month::text,
  product_category,
  customer_location.country,
  total_revenue,
  month_over_month_growth,
  trend_classification,
  performance_category,
  market_share_percent
FROM performance_metrics
WHERE month >= CURRENT_DATE - INTERVAL '6 months'
ORDER BY month DESC, total_revenue DESC
LIMIT 20

UNION ALL

-- Top customer segments  
SELECT 
  'CUSTOMER_SEGMENTS',
  rfm_segment,
  COUNT(*)::text as customer_count,
  ROUND(AVG(monetary_value), 2)::text as avg_lifetime_value,
  churn_risk,
  engagement_level,
  marketing_recommendation
FROM customer_classification  
GROUP BY rfm_segment, churn_risk, engagement_level, marketing_recommendation
ORDER BY AVG(monetary_value) DESC
LIMIT 15

UNION ALL

-- Product performance summary
SELECT 
  'PRODUCT_PERFORMANCE',
  product_name,
  category,
  total_revenue::text,
  profit_margin_percent::text,
  performance_category,
  inventory_turnover::text,
  sales_trend,
  CASE category_rank WHEN 1 THEN 'Category Leader' ELSE category_rank::text END
FROM product_performance
WHERE total_revenue > 0
ORDER BY total_revenue DESC
LIMIT 25;

-- QueryLeaf provides comprehensive aggregation capabilities:
-- 1. SQL-familiar window functions with OVER clauses and frame specifications  
-- 2. Advanced statistical functions including percentiles, standard deviation, and ranking
-- 3. Complex GROUP BY operations with ROLLUP, CUBE, and GROUPING SETS support
-- 4. Sophisticated JOIN operations including LATERAL joins for nested processing
-- 5. CTEs (Common Table Expressions) for complex multi-stage analytical queries  
-- 6. CASE expressions and conditional logic for business rule implementation
-- 7. Date/time functions for temporal analysis and time-series processing
-- 8. String and array functions for text processing and data transformation
-- 9. JSON processing functions for nested document analysis and extraction
-- 10. Integration with MongoDB's native aggregation optimizations and indexing
```

## Best Practices for MongoDB Aggregation Implementation

### Pipeline Design Principles

Essential guidelines for effective aggregation pipeline construction:

1. **Early Filtering**: Place `$match` stages early to reduce data volume through the pipeline
2. **Index Utilization**: Design pipelines to leverage existing indexes for optimal performance
3. **Stage Ordering**: Order stages to minimize computational overhead and data transfer
4. **Memory Management**: Monitor memory usage and use `allowDiskUse` for large datasets
5. **Field Projection**: Use `$project` to limit fields and reduce document size early
6. **Pipeline Caching**: Cache frequently-used aggregation results for improved performance

### Performance Optimization Strategies

Optimize MongoDB aggregation pipelines for production workloads:

1. **Compound Indexes**: Create indexes that support multiple pipeline stages
2. **Covered Queries**: Design pipelines that can be satisfied entirely from indexes
3. **Parallel Processing**: Use multiple concurrent pipelines for independent analyses
4. **Result Caching**: Implement intelligent caching for expensive aggregations
5. **Incremental Updates**: Process only new/changed data for time-series analytics
6. **Resource Monitoring**: Track aggregation performance and optimize accordingly

## Conclusion

MongoDB's Aggregation Framework provides comprehensive real-time analytics capabilities that eliminate the need for separate ETL processes, data warehouses, and batch processing systems. The powerful pipeline architecture enables sophisticated data transformations, statistical analysis, and predictive modeling directly within the operational database, delivering immediate insights while maintaining high performance at scale.

Key MongoDB Aggregation Framework benefits include:

- **Real-Time Processing**: Immediate analytical results without data movement or batch delays
- **Advanced Analytics**: Comprehensive statistical functions, window operations, and machine learning integration
- **Flexible Pipelines**: Multi-stage transformations that adapt to evolving analytical requirements
- **Scalable Performance**: High-performance processing that scales with data volume and complexity
- **SQL Compatibility**: Familiar analytical operations through QueryLeaf's SQL interface
- **Integrated Architecture**: Seamless integration with operational workloads and existing applications

Whether you're building real-time dashboards, customer analytics platforms, financial reporting systems, or any application requiring sophisticated data analysis, MongoDB's Aggregation Framework with QueryLeaf's familiar SQL interface provides the foundation for powerful, maintainable analytical solutions.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB aggregation operations while providing SQL-familiar analytics syntax, window functions, and statistical operations. Complex analytical queries, predictive models, and real-time insights are seamlessly handled through familiar SQL constructs, making advanced data processing both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's native aggregation capabilities with SQL-style analytics operations makes MongoDB an ideal platform for applications requiring both operational efficiency and analytical sophistication, ensuring your applications can deliver immediate insights while maintaining optimal performance as data volumes and complexity grow.