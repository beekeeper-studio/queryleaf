---
title: "MongoDB Aggregation Framework: Advanced Analytics and Real-Time Data Transformations for Enterprise Applications"
description: "Master MongoDB Aggregation Framework for complex analytics, data transformations, and real-time processing. Learn advanced pipeline operations, performance optimization, and SQL-familiar aggregation patterns for enterprise data processing."
date: 2025-11-09
tags: [mongodb, aggregation, analytics, data-transformation, real-time-processing, pipeline, sql, performance-optimization]
---

# MongoDB Aggregation Framework: Advanced Analytics and Real-Time Data Transformations for Enterprise Applications

Modern enterprise applications require sophisticated data processing capabilities that can handle complex transformations, real-time analytics, and multi-stage data aggregations with high performance and scalability. Traditional database approaches often struggle with complex analytical queries, requiring expensive joins, subqueries, and multiple round trips that create performance bottlenecks and operational complexity in production environments.

MongoDB's Aggregation Framework provides comprehensive data processing pipelines that enable sophisticated analytics, transformations, and real-time computations within the database itself. Unlike traditional SQL approaches that require complex joins and expensive operations, MongoDB's aggregation pipelines deliver optimized, single-pass data processing with automatic query optimization, distributed processing capabilities, and native support for complex document transformations.

## The Traditional Analytics Challenge

Conventional relational database approaches to complex analytics face significant performance and scalability limitations:

```sql
-- Traditional PostgreSQL analytics - complex joins and expensive operations

-- Multi-table sales analytics with complex aggregations
WITH customer_segments AS (
    SELECT 
        c.customer_id,
        c.customer_name,
        c.email,
        c.registration_date,
        c.country,
        c.state,
        
        -- Customer segmentation logic
        CASE 
            WHEN c.registration_date >= CURRENT_DATE - INTERVAL '90 days' THEN 'new_customer'
            WHEN c.last_order_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'active_customer'
            WHEN c.last_order_date >= CURRENT_DATE - INTERVAL '180 days' THEN 'returning_customer'
            ELSE 'dormant_customer'
        END as customer_segment,
        
        -- Calculate customer lifetime metrics
        c.total_orders,
        c.total_spent,
        c.average_order_value,
        c.last_order_date,
        
        -- Geographic classification
        CASE 
            WHEN c.country = 'US' THEN 'domestic'
            WHEN c.country IN ('CA', 'MX') THEN 'north_america'
            WHEN c.country IN ('GB', 'DE', 'FR', 'IT', 'ES') THEN 'europe'
            ELSE 'international'
        END as geographic_segment
        
    FROM customers c
    WHERE c.is_active = true
),

order_analytics AS (
    SELECT 
        o.order_id,
        o.customer_id,
        o.order_date,
        o.order_status,
        o.total_amount,
        o.discount_amount,
        o.tax_amount,
        o.shipping_amount,
        
        -- Time-based analytics
        DATE_TRUNC('month', o.order_date) as order_month,
        DATE_TRUNC('quarter', o.order_date) as order_quarter,
        DATE_TRUNC('year', o.order_date) as order_year,
        EXTRACT(dow FROM o.order_date) as day_of_week,
        EXTRACT(hour FROM o.order_date) as hour_of_day,
        
        -- Order categorization
        CASE 
            WHEN o.total_amount >= 1000 THEN 'high_value'
            WHEN o.total_amount >= 500 THEN 'medium_value'
            WHEN o.total_amount >= 100 THEN 'low_value'
            ELSE 'micro_transaction'
        END as order_value_segment,
        
        -- Seasonal analysis
        CASE 
            WHEN EXTRACT(month FROM o.order_date) IN (12, 1, 2) THEN 'winter'
            WHEN EXTRACT(month FROM o.order_date) IN (3, 4, 5) THEN 'spring'
            WHEN EXTRACT(month FROM o.order_date) IN (6, 7, 8) THEN 'summer'
            ELSE 'fall'
        END as season,
        
        -- Payment method analysis
        o.payment_method,
        o.payment_processor,
        
        -- Fulfillment metrics
        o.shipping_method,
        o.warehouse_id,
        EXTRACT(EPOCH FROM (o.shipped_date - o.order_date)) / 86400 as fulfillment_days
        
    FROM orders o
    WHERE o.order_date >= CURRENT_DATE - INTERVAL '2 years'
      AND o.order_status IN ('completed', 'shipped', 'delivered')
),

product_analytics AS (
    SELECT 
        oi.order_id,
        oi.product_id,
        p.product_name,
        p.category,
        p.subcategory,
        p.brand,
        p.supplier_id,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        oi.discount_amount as item_discount,
        
        -- Product performance metrics
        p.cost_per_unit,
        (oi.unit_price - p.cost_per_unit) as unit_margin,
        (oi.unit_price - p.cost_per_unit) * oi.quantity as total_margin,
        
        -- Product categorization
        CASE 
            WHEN p.category = 'Electronics' THEN 'tech'
            WHEN p.category IN ('Clothing', 'Shoes', 'Accessories') THEN 'fashion'
            WHEN p.category IN ('Home', 'Garden', 'Furniture') THEN 'home'
            ELSE 'other'
        END as product_group,
        
        -- Inventory and supply chain
        p.current_stock,
        p.reorder_level,
        CASE 
            WHEN p.current_stock <= p.reorder_level THEN 'low_stock'
            WHEN p.current_stock <= p.reorder_level * 2 THEN 'medium_stock'
            ELSE 'high_stock'
        END as stock_status,
        
        -- Supplier performance
        s.supplier_name,
        s.supplier_rating,
        s.average_lead_time
        
    FROM order_items oi
    JOIN products p ON oi.product_id = p.product_id
    JOIN suppliers s ON p.supplier_id = s.supplier_id
    WHERE p.is_active = true
),

comprehensive_sales_analytics AS (
    SELECT 
        cs.customer_id,
        cs.customer_name,
        cs.customer_segment,
        cs.geographic_segment,
        
        oa.order_id,
        oa.order_date,
        oa.order_month,
        oa.order_quarter,
        oa.order_value_segment,
        oa.season,
        oa.payment_method,
        oa.shipping_method,
        oa.fulfillment_days,
        
        pa.product_id,
        pa.product_name,
        pa.category,
        pa.brand,
        pa.product_group,
        pa.quantity,
        pa.unit_price,
        pa.total_price,
        pa.total_margin,
        pa.stock_status,
        pa.supplier_name,
        
        -- Advanced calculations requiring window functions
        SUM(pa.total_price) OVER (
            PARTITION BY cs.customer_id, oa.order_month
        ) as customer_monthly_spend,
        
        AVG(pa.unit_price) OVER (
            PARTITION BY pa.category, oa.order_quarter
        ) as category_avg_price_quarterly,
        
        ROW_NUMBER() OVER (
            PARTITION BY cs.customer_id 
            ORDER BY oa.order_date DESC
        ) as customer_order_recency,
        
        RANK() OVER (
            PARTITION BY oa.order_month 
            ORDER BY pa.total_margin DESC
        ) as product_margin_rank_monthly,
        
        -- Complex aggregations with multiple groupings
        COUNT(*) OVER (
            PARTITION BY cs.geographic_segment, oa.season
        ) as segment_seasonal_order_count,
        
        SUM(pa.total_price) OVER (
            PARTITION BY pa.brand, oa.order_quarter
        ) as brand_quarterly_revenue
        
    FROM customer_segments cs
    JOIN order_analytics oa ON cs.customer_id = oa.customer_id
    JOIN product_analytics pa ON oa.order_id = pa.order_id
),

performance_metrics AS (
    SELECT 
        csa.*,
        
        -- Customer behavior analysis
        CASE 
            WHEN customer_order_recency <= 3 THEN 'frequent_buyer'
            WHEN customer_order_recency <= 10 THEN 'regular_buyer'
            ELSE 'occasional_buyer'
        END as buying_frequency,
        
        -- Product performance analysis
        CASE 
            WHEN product_margin_rank_monthly <= 10 THEN 'top_margin_product'
            WHEN product_margin_rank_monthly <= 50 THEN 'good_margin_product'
            ELSE 'low_margin_product'
        END as margin_performance,
        
        -- Market analysis
        ROUND(
            (customer_monthly_spend / NULLIF(segment_seasonal_order_count::DECIMAL, 0)) * 100, 
            2
        ) as customer_segment_contribution_pct,
        
        ROUND(
            (brand_quarterly_revenue / SUM(brand_quarterly_revenue) OVER ()) * 100,
            2
        ) as brand_market_share_pct
        
    FROM comprehensive_sales_analytics csa
)

SELECT 
    -- Dimensional attributes
    customer_segment,
    geographic_segment,
    order_quarter,
    season,
    product_group,
    category,
    brand,
    payment_method,
    shipping_method,
    
    -- Aggregated metrics
    COUNT(DISTINCT customer_id) as unique_customers,
    COUNT(DISTINCT order_id) as total_orders,
    COUNT(DISTINCT product_id) as unique_products,
    
    -- Revenue metrics
    SUM(total_price) as total_revenue,
    AVG(total_price) as avg_order_value,
    SUM(total_margin) as total_margin,
    ROUND(AVG(total_margin), 2) as avg_margin_per_item,
    ROUND((SUM(total_margin) / SUM(total_price)) * 100, 1) as margin_percentage,
    
    -- Customer metrics
    AVG(customer_monthly_spend) as avg_customer_monthly_spend,
    COUNT(DISTINCT CASE WHEN buying_frequency = 'frequent_buyer' THEN customer_id END) as frequent_buyers,
    COUNT(DISTINCT CASE WHEN buying_frequency = 'regular_buyer' THEN customer_id END) as regular_buyers,
    
    -- Product performance
    COUNT(CASE WHEN margin_performance = 'top_margin_product' THEN 1 END) as top_margin_products,
    AVG(category_avg_price_quarterly) as avg_category_price,
    
    -- Operational metrics
    AVG(fulfillment_days) as avg_fulfillment_days,
    COUNT(CASE WHEN stock_status = 'low_stock' THEN 1 END) as low_stock_items,
    COUNT(DISTINCT supplier_name) as unique_suppliers,
    
    -- Time-based trends
    AVG(brand_market_share_pct) as avg_brand_market_share,
    ROUND(AVG(customer_segment_contribution_pct), 1) as avg_segment_contribution,
    
    -- Growth indicators (comparing to previous period)
    LAG(SUM(total_price)) OVER (
        PARTITION BY customer_segment, geographic_segment, product_group
        ORDER BY order_quarter
    ) as prev_quarter_revenue,
    
    ROUND(
        ((SUM(total_price) - LAG(SUM(total_price)) OVER (
            PARTITION BY customer_segment, geographic_segment, product_group
            ORDER BY order_quarter
        )) / NULLIF(LAG(SUM(total_price)) OVER (
            PARTITION BY customer_segment, geographic_segment, product_group
            ORDER BY order_quarter
        ), 0)) * 100,
        1
    ) as revenue_growth_pct

FROM performance_metrics
GROUP BY 
    customer_segment, geographic_segment, order_quarter, season,
    product_group, category, brand, payment_method, shipping_method
HAVING 
    COUNT(DISTINCT customer_id) >= 10  -- Filter for statistical significance
    AND SUM(total_price) >= 1000       -- Minimum revenue threshold
ORDER BY 
    order_quarter DESC,
    total_revenue DESC,
    unique_customers DESC
LIMIT 1000;

-- Problems with traditional SQL analytics approach:
-- 1. Extremely complex query structure with multiple CTEs and window functions
-- 2. Expensive JOIN operations across multiple large tables
-- 3. Poor performance due to multiple aggregation passes
-- 4. Limited support for nested data structures and arrays
-- 5. Difficult to maintain and modify complex analytical logic
-- 6. Memory-intensive operations with large intermediate result sets
-- 7. No native support for document-based data transformations
-- 8. Complex indexing requirements for optimal performance
-- 9. Difficult real-time processing due to query complexity
-- 10. Limited horizontal scaling for large analytical workloads

-- MySQL analytical limitations (even more restrictive)
SELECT 
    c.customer_segment,
    DATE_FORMAT(o.order_date, '%Y-%m') as order_month,
    COUNT(DISTINCT o.customer_id) as customers,
    SUM(o.total_amount) as revenue,
    AVG(o.total_amount) as avg_order_value
FROM (
    SELECT 
        customer_id,
        CASE 
            WHEN registration_date >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 'new'
            WHEN last_order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 'active'  
            ELSE 'dormant'
        END as customer_segment
    FROM customers 
) c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR)
GROUP BY c.customer_segment, DATE_FORMAT(o.order_date, '%Y-%m')
ORDER BY order_month DESC, revenue DESC;

-- MySQL limitations for analytics:
-- - No window functions in older versions (pre-8.0)
-- - Limited CTE support 
-- - Poor JSON handling for complex nested data
-- - Basic aggregation functions only
-- - No advanced analytical functions
-- - Limited support for complex data transformations
-- - Poor performance with large analytical queries
-- - No native support for real-time streaming analytics
```

MongoDB Aggregation Framework provides powerful, optimized data processing pipelines:

```javascript
// MongoDB Aggregation Framework - Comprehensive analytics and data transformation
const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('enterprise_analytics');

// Comprehensive Enterprise Analytics with MongoDB Aggregation Framework
class AdvancedAnalyticsProcessor {
  constructor(db) {
    this.db = db;
    this.collections = {
      customers: db.collection('customers'),
      orders: db.collection('orders'),
      products: db.collection('products'),
      analytics: db.collection('analytics_results'),
      realTimeMetrics: db.collection('real_time_metrics')
    };
    
    // Performance optimization settings
    this.aggregationOptions = {
      allowDiskUse: true,
      maxTimeMS: 300000, // 5 minutes timeout
      hint: null, // Will be set dynamically based on query
      explain: false,
      comment: 'enterprise_analytics_query'
    };
    
    this.setupAnalyticsIndexes();
  }

  async setupAnalyticsIndexes() {
    console.log('Setting up optimized indexes for analytics...');
    
    try {
      // Customer collection indexes
      await this.collections.customers.createIndexes([
        { key: { customerId: 1 }, background: true, name: 'customer_id_idx' },
        { key: { registrationDate: -1, customerSegment: 1 }, background: true, name: 'registration_segment_idx' },
        { key: { 'address.country': 1, 'address.state': 1 }, background: true, name: 'geographic_idx' },
        { key: { loyaltyTier: 1, totalSpent: -1 }, background: true, name: 'loyalty_spending_idx' },
        { key: { lastOrderDate: -1, isActive: 1 }, background: true, name: 'activity_idx' }
      ]);
      
      // Orders collection indexes
      await this.collections.orders.createIndexes([
        { key: { customerId: 1, orderDate: -1 }, background: true, name: 'customer_date_idx' },
        { key: { orderDate: -1, status: 1 }, background: true, name: 'date_status_idx' },
        { key: { 'financial.total': -1, orderDate: -1 }, background: true, name: 'value_date_idx' },
        { key: { 'items.productId': 1, orderDate: -1 }, background: true, name: 'product_date_idx' },
        { key: { 'shipping.region': 1, orderDate: -1 }, background: true, name: 'region_date_idx' }
      ]);
      
      // Products collection indexes  
      await this.collections.products.createIndexes([
        { key: { productId: 1 }, background: true, name: 'product_id_idx' },
        { key: { category: 1, subcategory: 1 }, background: true, name: 'category_idx' },
        { key: { brand: 1, 'pricing.currentPrice': -1 }, background: true, name: 'brand_price_idx' },
        { key: { 'inventory.currentStock': 1, 'inventory.reorderLevel': 1 }, background: true, name: 'inventory_idx' },
        { key: { supplierId: 1, isActive: 1 }, background: true, name: 'supplier_active_idx' }
      ]);
      
      console.log('Analytics indexes created successfully');
      
    } catch (error) {
      console.error('Error creating analytics indexes:', error);
    }
  }

  async performComprehensiveCustomerAnalytics(timeRange = 'last_12_months', customerSegments = null) {
    console.log(`Performing comprehensive customer analytics for ${timeRange}...`);
    
    const startTime = Date.now();
    
    // Calculate date range
    const dateRanges = {
      'last_30_days': new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      'last_90_days': new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      'last_6_months': new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
      'last_12_months': new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000),
      'last_2_years': new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
    };
    
    const startDate = dateRanges[timeRange] || dateRanges['last_12_months'];
    
    const pipeline = [
      // Stage 1: Match orders within time range
      {
        $match: {
          orderDate: { $gte: startDate },
          status: { $in: ['completed', 'shipped', 'delivered'] }
        }
      },
      
      // Stage 2: Lookup customer information
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: 'customerId',
          as: 'customer'
        }
      },
      
      // Stage 3: Unwind customer array (should be single document)
      {
        $unwind: '$customer'
      },
      
      // Stage 4: Filter by customer segments if specified
      ...(customerSegments ? [{
        $match: {
          'customer.segment': { $in: customerSegments }
        }
      }] : []),
      
      // Stage 5: Lookup product information for each order item
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: 'productId',
          as: 'productDetails'
        }
      },
      
      // Stage 6: Add comprehensive calculated fields
      {
        $addFields: {
          // Time-based dimensions
          orderMonth: {
            $dateTrunc: {
              date: '$orderDate',
              unit: 'month'
            }
          },
          orderQuarter: {
            $concat: [
              { $toString: { $year: '$orderDate' } },
              '-Q',
              { $toString: {
                $ceil: { $divide: [{ $month: '$orderDate' }, 3] }
              }}
            ]
          },
          orderYear: { $year: '$orderDate' },
          dayOfWeek: { $dayOfWeek: '$orderDate' },
          hourOfDay: { $hour: '$orderDate' },
          
          // Seasonal classification
          season: {
            $switch: {
              branches: [
                {
                  case: { $in: [{ $month: '$orderDate' }, [12, 1, 2]] },
                  then: 'winter'
                },
                {
                  case: { $in: [{ $month: '$orderDate' }, [3, 4, 5]] },
                  then: 'spring'
                },
                {
                  case: { $in: [{ $month: '$orderDate' }, [6, 7, 8]] },
                  then: 'summer'
                }
              ],
              default: 'fall'
            }
          },
          
          // Customer segmentation
          customerSegment: {
            $switch: {
              branches: [
                {
                  case: {
                    $gte: [
                      '$customer.registrationDate',
                      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  then: 'new_customer'
                },
                {
                  case: {
                    $gte: [
                      '$customer.lastOrderDate',
                      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  then: 'active_customer'
                },
                {
                  case: {
                    $gte: [
                      '$customer.lastOrderDate',
                      new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
                    ]
                  },
                  then: 'returning_customer'
                }
              ],
              default: 'dormant_customer'
            }
          },
          
          // Geographic classification
          geographicSegment: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$customer.address.country', 'US'] },
                  then: 'domestic'
                },
                {
                  case: { $in: ['$customer.address.country', ['CA', 'MX']] },
                  then: 'north_america'
                },
                {
                  case: { $in: ['$customer.address.country', ['GB', 'DE', 'FR', 'IT', 'ES']] },
                  then: 'europe'
                }
              ],
              default: 'international'
            }
          },
          
          // Order value classification
          orderValueSegment: {
            $switch: {
              branches: [
                {
                  case: { $gte: ['$financial.total', 1000] },
                  then: 'high_value'
                },
                {
                  case: { $gte: ['$financial.total', 500] },
                  then: 'medium_value'
                },
                {
                  case: { $gte: ['$financial.total', 100] },
                  then: 'low_value'
                }
              ],
              default: 'micro_transaction'
            }
          },
          
          // Enhanced item analysis with product details
          enrichedItems: {
            $map: {
              input: '$items',
              as: 'item',
              in: {
                $mergeObjects: [
                  '$$item',
                  {
                    productDetails: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$productDetails',
                            cond: { $eq: ['$$this.productId', '$$item.productId'] }
                          }
                        },
                        0
                      ]
                    }
                  },
                  {
                    // Calculate margins and performance metrics
                    unitMargin: {
                      $subtract: [
                        '$$item.unitPrice',
                        {
                          $arrayElemAt: [
                            {
                              $map: {
                                input: {
                                  $filter: {
                                    input: '$productDetails',
                                    cond: { $eq: ['$$this.productId', '$$item.productId'] }
                                  }
                                },
                                in: '$$this.costPerUnit'
                              }
                            },
                            0
                          ]
                        }
                      ]
                    },
                    
                    categoryGroup: {
                      $let: {
                        vars: {
                          category: {
                            $arrayElemAt: [
                              {
                                $map: {
                                  input: {
                                    $filter: {
                                      input: '$productDetails',
                                      cond: { $eq: ['$$this.productId', '$$item.productId'] }
                                    }
                                  },
                                  in: '$$this.category'
                                }
                              },
                              0
                            ]
                          }
                        },
                        in: {
                          $switch: {
                            branches: [
                              { case: { $eq: ['$$category', 'Electronics'] }, then: 'tech' },
                              { case: { $in: ['$$category', ['Clothing', 'Shoes', 'Accessories']] }, then: 'fashion' },
                              { case: { $in: ['$$category', ['Home', 'Garden', 'Furniture']] }, then: 'home' }
                            ],
                            default: 'other'
                          }
                        }
                      }
                    }
                  }
                ]
              }
            }
          },
          
          // Customer lifetime metrics (approximation)
          estimatedCustomerValue: {
            $multiply: [
              '$financial.total',
              { $add: ['$customer.averageOrdersPerYear', 1] }
            ]
          },
          
          // Fulfillment performance
          fulfillmentDays: {
            $cond: {
              if: { $and: ['$fulfillment.shippedAt', '$orderDate'] },
              then: {
                $divide: [
                  { $subtract: ['$fulfillment.shippedAt', '$orderDate'] },
                  86400000 // Convert milliseconds to days
                ]
              },
              else: null
            }
          }
        }
      },
      
      // Stage 7: Group by multiple dimensions for comprehensive analytics
      {
        $group: {
          _id: {
            customerSegment: '$customerSegment',
            geographicSegment: '$geographicSegment',
            orderMonth: '$orderMonth',
            orderQuarter: '$orderQuarter',
            season: '$season',
            orderValueSegment: '$orderValueSegment'
          },
          
          // Customer metrics
          uniqueCustomers: { $addToSet: '$customerId' },
          totalOrders: { $sum: 1 },
          
          // Financial metrics
          totalRevenue: { $sum: '$financial.total' },
          totalDiscount: { $sum: '$financial.discount' },
          totalTax: { $sum: '$financial.tax' },
          totalShipping: { $sum: '$financial.shipping' },
          
          // Order value statistics
          avgOrderValue: { $avg: '$financial.total' },
          maxOrderValue: { $max: '$financial.total' },
          minOrderValue: { $min: '$financial.total' },
          
          // Product and item metrics
          totalItems: { $sum: { $size: '$items' } },
          avgItemsPerOrder: { $avg: { $size: '$items' } },
          uniqueProducts: { 
            $addToSet: {
              $reduce: {
                input: '$items',
                initialValue: [],
                in: { $concatArrays: ['$$value', ['$$this.productId']] }
              }
            }
          },
          
          // Category distribution
          categoryBreakdown: {
            $push: {
              $map: {
                input: '$enrichedItems',
                in: '$$this.categoryGroup'
              }
            }
          },
          
          // Customer behavior metrics
          avgCustomerValue: { $avg: '$estimatedCustomerValue' },
          loyaltyTierDistribution: { $push: '$customer.loyaltyTier' },
          
          // Operational metrics
          avgFulfillmentDays: { $avg: '$fulfillmentDays' },
          paymentMethodDistribution: { $push: '$payment.method' },
          shippingMethodDistribution: { $push: '$shipping.method' },
          
          // Geographic insights
          stateDistribution: { $push: '$customer.address.state' },
          countryDistribution: { $push: '$customer.address.country' },
          
          // Time-based patterns
          dayOfWeekDistribution: { $push: '$dayOfWeek' },
          hourOfDayDistribution: { $push: '$hourOfDay' },
          
          // Customer acquisition and retention
          newCustomersCount: {
            $sum: {
              $cond: [{ $eq: ['$customerSegment', 'new_customer'] }, 1, 0]
            }
          },
          returningCustomersCount: {
            $sum: {
              $cond: [{ $eq: ['$customerSegment', 'returning_customer'] }, 1, 0]
            }
          },
          
          // First and last order dates for trend analysis
          firstOrderDate: { $min: '$orderDate' },
          lastOrderDate: { $max: '$orderDate' }
        }
      },
      
      // Stage 8: Calculate derived metrics and insights
      {
        $addFields: {
          // Calculate actual unique counts
          uniqueCustomerCount: { $size: '$uniqueCustomers' },
          uniqueProductCount: {
            $size: {
              $reduce: {
                input: '$uniqueProducts',
                initialValue: [],
                in: { $setUnion: ['$$value', '$$this'] }
              }
            }
          },
          
          // Revenue per customer
          revenuePerCustomer: {
            $cond: {
              if: { $gt: [{ $size: '$uniqueCustomers' }, 0] },
              then: { $divide: ['$totalRevenue', { $size: '$uniqueCustomers' }] },
              else: 0
            }
          },
          
          // Margin analysis
          grossMargin: { $subtract: ['$totalRevenue', '$totalDiscount'] },
          marginPercentage: {
            $multiply: [
              { $divide: [{ $subtract: ['$totalRevenue', '$totalDiscount'] }, '$totalRevenue'] },
              100
            ]
          },
          
          // Category insights
          topCategories: {
            $slice: [
              {
                $map: {
                  input: {
                    $sortArray: {
                      input: {
                        $objectToArray: {
                          $reduce: {
                            input: {
                              $reduce: {
                                input: '$categoryBreakdown',
                                initialValue: [],
                                in: { $concatArrays: ['$$value', '$$this'] }
                              }
                            },
                            initialValue: {},
                            in: {
                              $mergeObjects: [
                                '$$value',
                                { ['$$this']: { $add: [{ $ifNull: [{ $getField: ['$$this', '$$value'] }, 0] }, 1] } }
                              ]
                            }
                          }
                        }
                      },
                      sortBy: { v: -1 }
                    }
                  },
                  in: { category: '$$this.k', count: '$$this.v' }
                }
              },
              5 // Top 5 categories
            ]
          },
          
          // Customer distribution insights
          customerSegmentMetrics: {
            newCustomerPercentage: {
              $multiply: [
                { $divide: ['$newCustomersCount', '$totalOrders'] },
                100
              ]
            },
            returningCustomerPercentage: {
              $multiply: [
                { $divide: ['$returningCustomersCount', '$totalOrders'] },
                100
              ]
            }
          },
          
          // Time range analysis
          analysisPeriodDays: {
            $divide: [
              { $subtract: ['$lastOrderDate', '$firstOrderDate'] },
              86400000 // Convert to days
            ]
          },
          
          // Performance indicators
          performanceMetrics: {
            ordersPerDay: {
              $divide: [
                '$totalOrders',
                { $divide: [{ $subtract: ['$lastOrderDate', '$firstOrderDate'] }, 86400000] }
              ]
            },
            avgRevenuePerDay: {
              $divide: [
                '$totalRevenue',
                { $divide: [{ $subtract: ['$lastOrderDate', '$firstOrderDate'] }, 86400000] }
              ]
            }
          }
        }
      },
      
      // Stage 9: Project final results with clean structure
      {
        $project: {
          _id: 0,
          
          // Dimensions
          dimensions: '$_id',
          
          // Core metrics
          metrics: {
            customers: {
              total: '$uniqueCustomerCount',
              new: '$newCustomersCount',
              returning: '$returningCustomersCount',
              newPercentage: '$customerSegmentMetrics.newCustomerPercentage',
              returningPercentage: '$customerSegmentMetrics.returningCustomerPercentage'
            },
            
            orders: {
              total: '$totalOrders',
              averageValue: '$avgOrderValue',
              maxValue: '$maxOrderValue',
              minValue: '$minOrderValue',
              itemsPerOrder: '$avgItemsPerOrder'
            },
            
            revenue: {
              total: '$totalRevenue',
              gross: '$grossMargin',
              marginPercentage: '$marginPercentage',
              revenuePerCustomer: '$revenuePerCustomer',
              totalDiscount: '$totalDiscount',
              totalTax: '$totalTax',
              totalShipping: '$totalShipping'
            },
            
            products: {
              uniqueCount: '$uniqueProductCount',
              totalItems: '$totalItems',
              topCategories: '$topCategories'
            },
            
            operations: {
              avgFulfillmentDays: '$avgFulfillmentDays',
              analysisPeriodDays: '$analysisPeriodDays'
            },
            
            performance: '$performanceMetrics'
          },
          
          // Insights and distributions
          insights: {
            loyaltyTiers: '$loyaltyTierDistribution',
            paymentMethods: '$paymentMethodDistribution',
            shippingMethods: '$shippingMethodDistribution',
            geographic: {
              states: '$stateDistribution',
              countries: '$countryDistribution'
            },
            temporal: {
              daysOfWeek: '$dayOfWeekDistribution',
              hoursOfDay: '$hourOfDayDistribution'
            }
          },
          
          // Time range
          timeRange: {
            startDate: '$firstOrderDate',
            endDate: '$lastOrderDate'
          }
        }
      },
      
      // Stage 10: Sort results by significance
      {
        $sort: {
          'metrics.revenue.total': -1,
          'metrics.customers.total': -1
        }
      }
    ];
    
    try {
      const results = await this.collections.orders.aggregate(pipeline, this.aggregationOptions).toArray();
      
      const processingTime = Date.now() - startTime;
      console.log(`Customer analytics completed in ${processingTime}ms, found ${results.length} result groups`);
      
      return {
        success: true,
        processingTimeMs: processingTime,
        timeRange: timeRange,
        resultCount: results.length,
        analytics: results,
        metadata: {
          queryComplexity: 'high',
          stagesCount: pipeline.length,
          indexesUsed: 'multiple_compound_indexes',
          aggregationFeatures: [
            'lookup_joins',
            'complex_expressions',
            'grouping_aggregations', 
            'conditional_logic',
            'array_operations',
            'date_functions',
            'mathematical_operations'
          ]
        }
      };
      
    } catch (error) {
      console.error('Error performing customer analytics:', error);
      return {
        success: false,
        error: error.message,
        processingTimeMs: Date.now() - startTime
      };
    }
  }

  async performRealTimeProductAnalytics(refreshInterval = 60000) {
    console.log('Starting real-time product performance analytics...');
    
    const pipeline = [
      // Stage 1: Match recent orders (last 24 hours)
      {
        $match: {
          orderDate: { 
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) 
          },
          status: { $in: ['completed', 'processing', 'shipped'] }
        }
      },
      
      // Stage 2: Unwind order items for item-level analysis
      {
        $unwind: '$items'
      },
      
      // Stage 3: Lookup product details
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: 'productId',
          as: 'product'
        }
      },
      
      // Stage 4: Unwind product (should be single document)
      {
        $unwind: '$product'
      },
      
      // Stage 5: Lookup current inventory levels
      {
        $lookup: {
          from: 'inventory',
          localField: 'items.productId',
          foreignField: 'productId',
          as: 'inventory'
        }
      },
      
      // Stage 6: Add calculated fields for real-time metrics
      {
        $addFields: {
          // Time buckets for real-time analysis
          hourBucket: {
            $dateTrunc: {
              date: '$orderDate',
              unit: 'hour'
            }
          },
          
          // Product performance metrics
          itemRevenue: { $multiply: ['$items.quantity', '$items.unitPrice'] },
          itemMargin: {
            $multiply: [
              '$items.quantity',
              { $subtract: ['$items.unitPrice', '$product.costPerUnit'] }
            ]
          },
          
          // Inventory status
          currentStock: { $arrayElemAt: ['$inventory.currentStock', 0] },
          reorderLevel: { $arrayElemAt: ['$inventory.reorderLevel', 0] },
          
          // Product categorization
          categoryGroup: {
            $switch: {
              branches: [
                { case: { $eq: ['$product.category', 'Electronics'] }, then: 'tech' },
                { case: { $in: ['$product.category', ['Clothing', 'Shoes']] }, then: 'fashion' },
                { case: { $in: ['$product.category', ['Home', 'Garden']] }, then: 'home' }
              ],
              default: 'other'
            }
          },
          
          // Price performance
          pricePoint: {
            $switch: {
              branches: [
                { case: { $gte: ['$items.unitPrice', 500] }, then: 'premium' },
                { case: { $gte: ['$items.unitPrice', 100] }, then: 'mid_range' },
                { case: { $gte: ['$items.unitPrice', 25] }, then: 'budget' }
              ],
              default: 'economy'
            }
          },
          
          // Velocity indicators
          orderRecency: {
            $divide: [
              { $subtract: [new Date(), '$orderDate'] },
              3600000 // Convert to hours
            ]
          }
        }
      },
      
      // Stage 7: Group by product and time buckets for real-time aggregation
      {
        $group: {
          _id: {
            productId: '$items.productId',
            productName: '$product.name',
            category: '$product.category',
            categoryGroup: '$categoryGroup',
            brand: '$product.brand',
            pricePoint: '$pricePoint',
            hourBucket: '$hourBucket'
          },
          
          // Sales metrics
          totalQuantitySold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$itemRevenue' },
          totalMargin: { $sum: '$itemMargin' },
          uniqueOrders: { $addToSet: '$_id' },
          avgOrderQuantity: { $avg: '$items.quantity' },
          
          // Pricing metrics
          avgSellingPrice: { $avg: '$items.unitPrice' },
          maxSellingPrice: { $max: '$items.unitPrice' },
          minSellingPrice: { $min: '$items.unitPrice' },
          
          // Inventory insights
          currentStockLevel: { $first: '$currentStock' },
          reorderThreshold: { $first: '$reorderLevel' },
          
          // Time-based insights
          avgOrderRecency: { $avg: '$orderRecency' },
          latestOrderTime: { $max: '$orderDate' },
          earliestOrderTime: { $min: '$orderDate' },
          
          // Customer insights
          uniqueCustomers: { $addToSet: '$customerId' },
          
          // Geographic distribution
          regions: { $addToSet: '$customer.address.state' },
          
          // Order characteristics
          avgOrderValue: { $avg: '$financial.total' },
          shippingMethodsUsed: { $addToSet: '$shipping.method' }
        }
      },
      
      // Stage 8: Calculate performance indicators and rankings
      {
        $addFields: {
          // Performance calculations
          marginPercentage: {
            $cond: {
              if: { $gt: ['$totalRevenue', 0] },
              then: { $multiply: [{ $divide: ['$totalMargin', '$totalRevenue'] }, 100] },
              else: 0
            }
          },
          
          uniqueOrderCount: { $size: '$uniqueOrders' },
          uniqueCustomerCount: { $size: '$uniqueCustomers' },
          
          // Inventory health
          stockStatus: {
            $switch: {
              branches: [
                {
                  case: { $lte: ['$currentStockLevel', 0] },
                  then: 'out_of_stock'
                },
                {
                  case: { $lte: ['$currentStockLevel', '$reorderThreshold'] },
                  then: 'low_stock'
                },
                {
                  case: { $lte: ['$currentStockLevel', { $multiply: ['$reorderThreshold', 2] }] },
                  then: 'medium_stock'
                }
              ],
              default: 'high_stock'
            }
          },
          
          // Velocity metrics
          salesVelocity: {
            $divide: ['$totalQuantitySold', { $max: ['$avgOrderRecency', 1] }]
          },
          
          // Customer engagement
          customerRetention: {
            $divide: ['$uniqueCustomerCount', '$uniqueOrderCount']
          },
          
          // Regional penetration
          regionalReach: { $size: '$regions' }
        }
      },
      
      // Stage 9: Add ranking and performance classification
      {
        $setWindowFields: {
          sortBy: { totalRevenue: -1 },
          output: {
            revenueRank: { $rank: {} },
            revenuePercentile: { $percentRank: {} }
          }
        }
      },
      
      {
        $setWindowFields: {
          partitionBy: '$_id.categoryGroup',
          sortBy: { totalQuantitySold: -1 },
          output: {
            categoryRank: { $rank: {} }
          }
        }
      },
      
      // Stage 10: Add performance classification
      {
        $addFields: {
          performanceClassification: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $lte: ['$revenueRank', 10] },
                      { $gt: ['$marginPercentage', 20] },
                      { $gt: ['$uniqueCustomerCount', 5] }
                    ]
                  },
                  then: 'star_performer'
                },
                {
                  case: {
                    $and: [
                      { $lte: ['$revenueRank', 50] },
                      { $gt: ['$marginPercentage', 15] }
                    ]
                  },
                  then: 'strong_performer'
                },
                {
                  case: {
                    $and: [
                      { $gt: ['$totalRevenue', 100] },
                      { $gt: ['$marginPercentage', 10] }
                    ]
                  },
                  then: 'solid_performer'
                },
                {
                  case: { $lte: ['$totalRevenue', 50] },
                  then: 'low_performer'
                }
              ],
              default: 'average_performer'
            }
          },
          
          // Action recommendations
          recommendations: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$stockStatus', 'out_of_stock'] },
                  then: ['urgent_restock', 'review_demand_forecast']
                },
                {
                  case: { $eq: ['$stockStatus', 'low_stock'] },
                  then: ['schedule_restock', 'monitor_sales_velocity']
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$performanceClassification', 'star_performer'] },
                      { $gt: ['$currentStockLevel', '$reorderThreshold'] }
                    ]
                  },
                  then: ['increase_marketing', 'optimize_pricing', 'expand_availability']
                },
                {
                  case: { $eq: ['$performanceClassification', 'low_performer'] },
                  then: ['review_pricing', 'improve_marketing', 'consider_discontinuation']
                }
              ],
              default: ['monitor_performance', 'optimize_inventory_levels']
            }
          },
          
          // Real-time alerts
          alerts: {
            $filter: {
              input: [
                {
                  $cond: {
                    if: { $eq: ['$stockStatus', 'out_of_stock'] },
                    then: {
                      type: 'critical',
                      message: 'Product is out of stock with active sales',
                      priority: 'high'
                    },
                    else: null
                  }
                },
                {
                  $cond: {
                    if: {
                      $and: [
                        { $eq: ['$performanceClassification', 'star_performer'] },
                        { $eq: ['$stockStatus', 'low_stock'] }
                      ]
                    },
                    then: {
                      type: 'opportunity',
                      message: 'High-performing product running low on stock',
                      priority: 'medium'
                    },
                    else: null
                  }
                },
                {
                  $cond: {
                    if: { $lt: ['$marginPercentage', 5] },
                    then: {
                      type: 'margin_concern',
                      message: 'Product margin below threshold',
                      priority: 'low'
                    },
                    else: null
                  }
                }
              ],
              cond: { $ne: ['$$this', null] }
            }
          }
        }
      },
      
      // Stage 11: Final projection with structured output
      {
        $project: {
          _id: 0,
          
          // Product identification
          product: {
            id: '$_id.productId',
            name: '$_id.productName',
            category: '$_id.category',
            categoryGroup: '$_id.categoryGroup',
            brand: '$_id.brand',
            pricePoint: '$_id.pricePoint'
          },
          
          // Time context
          timeContext: {
            hourBucket: '$_id.hourBucket',
            latestOrder: '$latestOrderTime',
            earliestOrder: '$earliestOrderTime',
            avgOrderRecencyHours: '$avgOrderRecency'
          },
          
          // Performance metrics
          performance: {
            totalQuantitySold: '$totalQuantitySold',
            totalRevenue: { $round: ['$totalRevenue', 2] },
            totalMargin: { $round: ['$totalMargin', 2] },
            marginPercentage: { $round: ['$marginPercentage', 1] },
            uniqueOrders: '$uniqueOrderCount',
            uniqueCustomers: '$uniqueCustomerCount',
            avgOrderQuantity: { $round: ['$avgOrderQuantity', 2] },
            salesVelocity: { $round: ['$salesVelocity', 3] },
            customerRetention: { $round: ['$customerRetention', 3] }
          },
          
          // Pricing insights
          pricing: {
            avgSellingPrice: { $round: ['$avgSellingPrice', 2] },
            maxSellingPrice: '$maxSellingPrice',
            minSellingPrice: '$minSellingPrice',
            priceVariation: { $subtract: ['$maxSellingPrice', '$minSellingPrice'] }
          },
          
          // Inventory status
          inventory: {
            currentStock: '$currentStockLevel',
            reorderLevel: '$reorderThreshold',
            stockStatus: '$stockStatus',
            stockTurnover: {
              $cond: {
                if: { $gt: ['$currentStockLevel', 0] },
                then: { $divide: ['$totalQuantitySold', '$currentStockLevel'] },
                else: null
              }
            }
          },
          
          // Market position
          marketPosition: {
            revenueRank: '$revenueRank',
            revenuePercentile: { $round: ['$revenuePercentile', 3] },
            categoryRank: '$categoryRank',
            performanceClass: '$performanceClassification'
          },
          
          // Geographic and market reach
          marketReach: {
            regionalReach: '$regionalReach',
            regions: '$regions',
            avgOrderValue: { $round: ['$avgOrderValue', 2] },
            shippingMethods: '$shippingMethodsUsed'
          },
          
          // Actionable insights
          insights: {
            recommendations: '$recommendations',
            alerts: '$alerts',
            
            // Key insights derived from data
            keyInsights: {
              $filter: {
                input: [
                  {
                    $cond: {
                      if: { $gt: ['$uniqueCustomerCount', 10] },
                      then: 'High customer engagement - good repeat purchase potential',
                      else: null
                    }
                  },
                  {
                    $cond: {
                      if: { $gt: ['$regionalReach', 5] },
                      then: 'Strong geographic distribution - consider expanding marketing',
                      else: null
                    }
                  },
                  {
                    $cond: {
                      if: { $gt: ['$salesVelocity', 1] },
                      then: 'Fast-moving product - ensure adequate inventory levels',
                      else: null
                    }
                  }
                ],
                cond: { $ne: ['$$this', null] }
              }
            }
          }
        }
      },
      
      // Stage 12: Sort by performance and significance
      {
        $sort: {
          'performance.totalRevenue': -1,
          'performance.uniqueCustomers': -1,
          'inventory.stockTurnover': -1
        }
      },
      
      // Stage 13: Limit to top performers for real-time display
      {
        $limit: 100
      }
    ];
    
    try {
      const results = await this.collections.orders.aggregate(pipeline, {
        ...this.aggregationOptions,
        maxTimeMS: 30000 // Shorter timeout for real-time queries
      }).toArray();
      
      // Store results for real-time dashboard
      await this.collections.realTimeMetrics.replaceOne(
        { type: 'product_performance' },
        {
          type: 'product_performance',
          timestamp: new Date(),
          refreshInterval: refreshInterval,
          dataCount: results.length,
          data: results
        },
        { upsert: true }
      );
      
      console.log(`Real-time product analytics completed: ${results.length} products analyzed`);
      
      return {
        success: true,
        timestamp: new Date(),
        productCount: results.length,
        analytics: results,
        summary: {
          totalRevenue: results.reduce((sum, product) => sum + product.performance.totalRevenue, 0),
          totalQuantitySold: results.reduce((sum, product) => sum + product.performance.totalQuantitySold, 0),
          avgMarginPercentage: results.reduce((sum, product) => sum + product.performance.marginPercentage, 0) / results.length,
          outOfStockProducts: results.filter(product => product.inventory.stockStatus === 'out_of_stock').length,
          starPerformers: results.filter(product => product.marketPosition.performanceClass === 'star_performer').length,
          criticalAlerts: results.reduce((sum, product) => 
            sum + product.insights.alerts.filter(alert => alert.priority === 'high').length, 0
          )
        }
      };
      
    } catch (error) {
      console.error('Error performing real-time product analytics:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async performAdvancedCohortAnalysis(cohortType = 'monthly', lookbackPeriods = 12) {
    console.log(`Performing ${cohortType} cohort analysis for ${lookbackPeriods} periods...`);
    
    const startTime = Date.now();
    
    // Calculate cohort periods based on type
    const cohortConfig = {
      'weekly': { unit: 'week', periodMs: 7 * 24 * 60 * 60 * 1000 },
      'monthly': { unit: 'month', periodMs: 30 * 24 * 60 * 60 * 1000 },
      'quarterly': { unit: 'quarter', periodMs: 90 * 24 * 60 * 60 * 1000 }
    };
    
    const config = cohortConfig[cohortType] || cohortConfig['monthly'];
    const startDate = new Date(Date.now() - lookbackPeriods * config.periodMs);
    
    const pipeline = [
      // Stage 1: Get all customer first orders to establish cohorts
      {
        $match: {
          orderDate: { $gte: startDate },
          status: { $in: ['completed', 'shipped', 'delivered'] }
        }
      },
      
      // Stage 2: Get customer first order dates
      {
        $group: {
          _id: '$customerId',
          firstOrderDate: { $min: '$orderDate' },
          allOrders: {
            $push: {
              orderId: '$_id',
              orderDate: '$orderDate',
              total: '$financial.total',
              items: '$items'
            }
          },
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$financial.total' },
          lastOrderDate: { $max: '$orderDate' }
        }
      },
      
      // Stage 3: Calculate cohort membership and period analysis
      {
        $addFields: {
          // Determine which cohort this customer belongs to
          cohortPeriod: {
            $dateTrunc: {
              date: '$firstOrderDate',
              unit: config.unit
            }
          },
          
          // Calculate customer lifetime span
          lifetimeSpanDays: {
            $divide: [
              { $subtract: ['$lastOrderDate', '$firstOrderDate'] },
              86400000
            ]
          },
          
          // Analyze orders by period
          ordersByPeriod: {
            $map: {
              input: '$allOrders',
              as: 'order',
              in: {
                $mergeObjects: [
                  '$$order',
                  {
                    orderPeriod: {
                      $dateTrunc: {
                        date: '$$order.orderDate',
                        unit: config.unit
                      }
                    },
                    periodsFromFirstOrder: {
                      $divide: [
                        {
                          $subtract: [
                            {
                              $dateTrunc: {
                                date: '$$order.orderDate',
                                unit: config.unit
                              }
                            },
                            {
                              $dateTrunc: {
                                date: '$firstOrderDate',
                                unit: config.unit
                              }
                            }
                          ]
                        },
                        config.periodMs
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },
      
      // Stage 4: Unwind orders to analyze period-by-period behavior
      {
        $unwind: '$ordersByPeriod'
      },
      
      // Stage 5: Group by cohort and period for retention analysis
      {
        $group: {
          _id: {
            cohortPeriod: '$cohortPeriod',
            orderPeriod: '$ordersByPeriod.orderPeriod',
            periodsFromFirst: { 
              $floor: '$ordersByPeriod.periodsFromFirstOrder' 
            }
          },
          
          // Customer retention metrics
          activeCustomers: { $addToSet: '$_id' },
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$ordersByPeriod.total' },
          avgOrderValue: { $avg: '$ordersByPeriod.total' },
          
          // Customer behavior metrics
          avgLifetimeSpan: { $avg: '$lifetimeSpanDays' },
          totalCustomerLifetimeValue: { $avg: '$totalSpent' },
          avgOrdersPerCustomer: { $avg: '$totalOrders' },
          
          // Period-specific insights
          newCustomersInPeriod: {
            $sum: {
              $cond: [
                { $eq: ['$ordersByPeriod.periodsFromFirstOrder', 0] },
                1,
                0
              ]
            }
          },
          
          // Revenue distribution
          revenueDistribution: {
            $push: '$ordersByPeriod.total'
          },
          
          // Order frequency analysis
          orderFrequencyDistribution: {
            $push: '$totalOrders'
          }
        }
      },
      
      // Stage 6: Calculate cohort size (initial customers in each cohort)
      {
        $lookup: {
          from: 'orders',
          pipeline: [
            {
              $match: {
                orderDate: { $gte: startDate },
                status: { $in: ['completed', 'shipped', 'delivered'] }
              }
            },
            {
              $group: {
                _id: '$customerId',
                firstOrderDate: { $min: '$orderDate' }
              }
            },
            {
              $addFields: {
                cohortPeriod: {
                  $dateTrunc: {
                    date: '$firstOrderDate',
                    unit: config.unit
                  }
                }
              }
            },
            {
              $group: {
                _id: '$cohortPeriod',
                cohortSize: { $sum: 1 }
              }
            }
          ],
          as: 'cohortSizes'
        }
      },
      
      // Stage 7: Add cohort size information
      {
        $addFields: {
          cohortSize: {
            $let: {
              vars: {
                matchingCohort: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$cohortSizes',
                        cond: { $eq: ['$$this._id', '$_id.cohortPeriod'] }
                      }
                    },
                    0
                  ]
                }
              },
              in: '$$matchingCohort.cohortSize'
            }
          },
          
          activeCustomerCount: { $size: '$activeCustomers' },
          
          // Calculate retention rate
          retentionRate: {
            $let: {
              vars: {
                cohortSize: {
                  $arrayElemAt: [
                    {
                      $map: {
                        input: {
                          $filter: {
                            input: '$cohortSizes',
                            cond: { $eq: ['$$this._id', '$_id.cohortPeriod'] }
                          }
                        },
                        in: '$$this.cohortSize'
                      }
                    },
                    0
                  ]
                }
              },
              in: {
                $multiply: [
                  { $divide: [{ $size: '$activeCustomers' }, '$$cohortSize'] },
                  100
                ]
              }
            }
          }
        }
      },
      
      // Stage 8: Calculate advanced cohort metrics
      {
        $addFields: {
          // Revenue per customer in this period
          revenuePerCustomer: {
            $divide: ['$totalRevenue', '$activeCustomerCount']
          },
          
          // Customer engagement score
          engagementScore: {
            $multiply: [
              { $divide: ['$totalOrders', '$activeCustomerCount'] },
              { $divide: ['$retentionRate', 100] }
            ]
          },
          
          // Revenue distribution analysis
          revenueMetrics: {
            median: {
              $arrayElemAt: [
                {
                  $sortArray: {
                    input: '$revenueDistribution',
                    sortBy: 1
                  }
                },
                { $floor: { $divide: [{ $size: '$revenueDistribution' }, 2] } }
              ]
            },
            total: '$totalRevenue',
            average: '$avgOrderValue',
            max: { $max: '$revenueDistribution' },
            min: { $min: '$revenueDistribution' }
          },
          
          // Period classification
          periodClassification: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id.periodsFromFirst', 0] }, then: 'acquisition' },
                { case: { $lte: ['$_id.periodsFromFirst', 3] }, then: 'early_engagement' },
                { case: { $lte: ['$_id.periodsFromFirst', 12] }, then: 'mature_relationship' }
              ],
              default: 'long_term_loyalty'
            }
          }
        }
      },
      
      // Stage 9: Group by cohort for final analysis
      {
        $group: {
          _id: '$_id.cohortPeriod',
          cohortSize: { $first: '$cohortSize' },
          
          // Retention analysis by period
          retentionByPeriod: {
            $push: {
              period: '$_id.periodsFromFirst',
              orderPeriod: '$_id.orderPeriod',
              activeCustomers: '$activeCustomerCount',
              retentionRate: '$retentionRate',
              totalRevenue: '$totalRevenue',
              revenuePerCustomer: '$revenuePerCustomer',
              avgOrderValue: '$avgOrderValue',
              totalOrders: '$totalOrders',
              engagementScore: '$engagementScore',
              periodClassification: '$periodClassification',
              revenueMetrics: '$revenueMetrics'
            }
          },
          
          // Aggregate cohort metrics
          totalLifetimeRevenue: { $sum: '$totalRevenue' },
          avgLifetimeValue: { $avg: '$totalCustomerLifetimeValue' },
          peakRetentionRate: { $max: '$retentionRate' },
          finalRetentionRate: { $last: '$retentionRate' },
          avgEngagementScore: { $avg: '$engagementScore' },
          
          // Cohort performance classification
          cohortHealth: {
            $avg: {
              $cond: [
                { $gte: ['$retentionRate', 30] }, // 30% retention considered healthy
                1,
                0
              ]
            }
          }
        }
      },
      
      // Stage 10: Calculate cohort performance indicators
      {
        $addFields: {
          // Lifetime value per customer in cohort
          lifetimeValuePerCustomer: {
            $divide: ['$totalLifetimeRevenue', '$cohortSize']
          },
          
          // Retention curve analysis
          retentionTrend: {
            $let: {
              vars: {
                firstPeriodRetention: {
                  $arrayElemAt: [
                    {
                      $map: {
                        input: {
                          $filter: {
                            input: '$retentionByPeriod',
                            cond: { $eq: ['$$this.period', 0] }
                          }
                        },
                        in: '$$this.retentionRate'
                      }
                    },
                    0
                  ]
                },
                lastPeriodRetention: '$finalRetentionRate'
              },
              in: {
                $subtract: ['$$lastPeriodRetention', '$$firstPeriodRetention']
              }
            }
          },
          
          // Cohort quality classification
          cohortQuality: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ['$peakRetentionRate', 50] },
                      { $gte: ['$avgEngagementScore', 1.5] },
                      { $gte: ['$lifetimeValuePerCustomer', 500] }
                    ]
                  },
                  then: 'excellent'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$peakRetentionRate', 35] },
                      { $gte: ['$avgEngagementScore', 1.0] },
                      { $gte: ['$lifetimeValuePerCustomer', 250] }
                    ]
                  },
                  then: 'good'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$peakRetentionRate', 20] },
                      { $gte: ['$avgEngagementScore', 0.5] }
                    ]
                  },
                  then: 'fair'
                }
              ],
              default: 'poor'
            }
          },
          
          // Strategic recommendations
          recommendations: {
            $switch: {
              branches: [
                {
                  case: { $lt: ['$peakRetentionRate', 20] },
                  then: ['improve_onboarding', 'enhance_early_engagement', 'review_product_fit']
                },
                {
                  case: { $lt: ['$finalRetentionRate', 10] },
                  then: ['develop_loyalty_program', 'improve_long_term_value', 'increase_engagement']
                },
                {
                  case: { $lt: ['$avgEngagementScore', 0.5] },
                  then: ['enhance_customer_experience', 'increase_purchase_frequency', 'improve_product_recommendations']
                }
              ],
              default: ['maintain_excellence', 'scale_successful_strategies', 'explore_expansion_opportunities']
            }
          }
        }
      },
      
      // Stage 11: Final projection and formatting
      {
        $project: {
          _id: 0,
          
          // Cohort identification
          cohortPeriod: '$_id',
          cohortSize: 1,
          cohortQuality: 1,
          
          // Key performance metrics
          performance: {
            lifetimeValuePerCustomer: { $round: ['$lifetimeValuePerCustomer', 2] },
            avgLifetimeValue: { $round: ['$avgLifetimeValue', 2] },
            totalLifetimeRevenue: { $round: ['$totalLifetimeRevenue', 2] },
            peakRetentionRate: { $round: ['$peakRetentionRate', 1] },
            finalRetentionRate: { $round: ['$finalRetentionRate', 1] },
            retentionTrend: { $round: ['$retentionTrend', 1] },
            avgEngagementScore: { $round: ['$avgEngagementScore', 2] },
            cohortHealth: { $round: ['$cohortHealth', 2] }
          },
          
          // Detailed retention analysis
          retentionAnalysis: {
            $map: {
              input: { $sortArray: { input: '$retentionByPeriod', sortBy: { period: 1 } } },
              in: {
                period: '$$this.period',
                orderPeriod: '$$this.orderPeriod',
                activeCustomers: '$$this.activeCustomers',
                retentionRate: { $round: ['$$this.retentionRate', 1] },
                revenuePerCustomer: { $round: ['$$this.revenuePerCustomer', 2] },
                avgOrderValue: { $round: ['$$this.avgOrderValue', 2] },
                totalRevenue: { $round: ['$$this.totalRevenue', 2] },
                totalOrders: '$$this.totalOrders',
                engagementScore: { $round: ['$$this.engagementScore', 2] },
                periodClassification: '$$this.periodClassification',
                revenueMetrics: {
                  median: { $round: ['$$this.revenueMetrics.median', 2] },
                  average: { $round: ['$$this.revenueMetrics.average', 2] },
                  max: '$$this.revenueMetrics.max',
                  min: '$$this.revenueMetrics.min'
                }
              }
            }
          },
          
          // Strategic insights
          insights: {
            recommendations: '$recommendations',
            keyInsights: {
              $filter: {
                input: [
                  {
                    $cond: {
                      if: { $gt: ['$peakRetentionRate', 40] },
                      then: 'High-quality cohort with strong initial engagement',
                      else: null
                    }
                  },
                  {
                    $cond: {
                      if: { $gt: ['$retentionTrend', 0] },
                      then: 'Retention improving over time - successful loyalty building',
                      else: null
                    }
                  },
                  {
                    $cond: {
                      if: { $gt: ['$avgEngagementScore', 2] },
                      then: 'Highly engaged cohort with frequent repeat purchases',
                      else: null
                    }
                  },
                  {
                    $cond: {
                      if: { $gt: ['$lifetimeValuePerCustomer', 1000] },
                      then: 'High-value cohort - focus on retention and expansion',
                      else: null
                    }
                  }
                ],
                cond: { $ne: ['$$this', null] }
              }
            }
          }
        }
      },
      
      // Stage 12: Sort by cohort period (most recent first)
      {
        $sort: { cohortPeriod: -1 }
      }
    ];
    
    try {
      const results = await this.collections.orders.aggregate(pipeline, this.aggregationOptions).toArray();
      
      const processingTime = Date.now() - startTime;
      console.log(`Cohort analysis completed in ${processingTime}ms, analyzed ${results.length} cohorts`);
      
      // Calculate cross-cohort insights
      const crossCohortInsights = {
        totalCohorts: results.length,
        avgCohortSize: results.reduce((sum, cohort) => sum + cohort.cohortSize, 0) / results.length,
        avgLifetimeValue: results.reduce((sum, cohort) => sum + cohort.performance.lifetimeValuePerCustomer, 0) / results.length,
        bestPerformingCohort: results.reduce((best, current) => 
          current.performance.lifetimeValuePerCustomer > best.performance.lifetimeValuePerCustomer ? current : best, results[0]
        ),
        retentionTrendAvg: results.reduce((sum, cohort) => sum + cohort.performance.retentionTrend, 0) / results.length,
        excellentCohorts: results.filter(cohort => cohort.cohortQuality === 'excellent').length,
        improvingCohorts: results.filter(cohort => cohort.performance.retentionTrend > 0).length
      };
      
      return {
        success: true,
        processingTimeMs: processingTime,
        cohortType: cohortType,
        lookbackPeriods: lookbackPeriods,
        analysisDate: new Date(),
        cohortCount: results.length,
        cohorts: results,
        crossCohortInsights: crossCohortInsights,
        metadata: {
          aggregationComplexity: 'very_high',
          stagesCount: pipeline.length,
          analyticsFeatures: [
            'customer_lifetime_value',
            'retention_analysis',
            'cohort_segmentation',
            'behavioral_analysis',
            'revenue_attribution',
            'trend_analysis',
            'performance_classification',
            'strategic_recommendations'
          ]
        }
      };
      
    } catch (error) {
      console.error('Error performing cohort analysis:', error);
      return {
        success: false,
        error: error.message,
        processingTimeMs: Date.now() - startTime
      };
    }
  }
}

// Benefits of MongoDB Aggregation Framework:
// - Single-pass processing for complex multi-stage analytics
// - Native document transformation without expensive JOINs
// - Automatic query optimization and index utilization
// - Horizontal scaling across sharded clusters
// - Real-time processing capabilities with streaming aggregation
// - Rich expression language for complex calculations
// - Built-in statistical and analytical functions
// - Memory-efficient processing with spill-to-disk support
// - Integration with MongoDB's native features (GeoSpatial, Text Search, etc.)
// - SQL-compatible operations through QueryLeaf integration

module.exports = {
  AdvancedAnalyticsProcessor
};
```

## Understanding MongoDB Aggregation Framework Architecture

### Advanced Pipeline Optimization and Performance Patterns

Implement sophisticated aggregation strategies for enterprise MongoDB deployments:

```javascript
// Production-optimized MongoDB Aggregation with advanced performance tuning
class EnterpriseAggregationOptimizer {
  constructor(db, optimizationConfig) {
    this.db = db;
    this.config = {
      ...optimizationConfig,
      enableQueryPlanCache: true,
      enableParallelProcessing: true,
      enableIncrementalProcessing: true,
      maxMemoryUsage: '2GB',
      enableIndexHints: true,
      enableResultCaching: true
    };
    
    this.queryPlanCache = new Map();
    this.resultCache = new Map();
    this.performanceMetrics = new Map();
  }

  async optimizeAggregationPipeline(pipeline, collectionName, options = {}) {
    console.log(`Optimizing aggregation pipeline for ${collectionName}...`);
    
    const optimizationStrategies = [
      this.moveMatchToBeginning,
      this.optimizeIndexUsage,
      this.enableEarlyFiltering,
      this.minimizeDataMovement,
      this.optimizeGroupingOperations,
      this.enableParallelExecution
    ];
    
    let optimizedPipeline = [...pipeline];
    
    for (const strategy of optimizationStrategies) {
      optimizedPipeline = await strategy.call(this, optimizedPipeline, collectionName, options);
    }
    
    return {
      originalStages: pipeline.length,
      optimizedStages: optimizedPipeline.length,
      optimizedPipeline: optimizedPipeline,
      estimatedPerformanceGain: this.calculatePerformanceGain(pipeline, optimizedPipeline)
    };
  }

  async enableRealTimeAggregation(pipeline, collectionName, refreshInterval = 5000) {
    console.log(`Setting up real-time aggregation for ${collectionName}...`);
    
    // Implementation of real-time aggregation with Change Streams
    const changeStream = this.db.collection(collectionName).watch([
      {
        $match: {
          operationType: { $in: ['insert', 'update', 'delete'] }
        }
      }
    ]);
    
    const realTimeProcessor = {
      pipeline: pipeline,
      lastResults: null,
      isProcessing: false,
      
      async processChanges() {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        try {
          const results = await this.db.collection(collectionName)
            .aggregate(pipeline, { allowDiskUse: true })
            .toArray();
            
          this.lastResults = results;
          
          // Emit real-time results to subscribers
          this.emitResults(results);
          
        } catch (error) {
          console.error('Real-time aggregation error:', error);
        } finally {
          this.isProcessing = false;
        }
      }
    };
    
    // Process changes as they occur
    changeStream.on('change', () => {
      realTimeProcessor.processChanges();
    });
    
    return realTimeProcessor;
  }

  async implementIncrementalAggregation(pipeline, collectionName, incrementField = 'updatedAt') {
    console.log(`Setting up incremental aggregation for ${collectionName}...`);
    
    // Track last processed timestamp
    let lastProcessedTime = await this.getLastProcessedTime(collectionName);
    
    const incrementalPipeline = [
      // Only process new/updated documents
      {
        $match: {
          [incrementField]: { $gt: lastProcessedTime }
        }
      },
      ...pipeline
    ];
    
    const results = await this.db.collection(collectionName)
      .aggregate(incrementalPipeline, { allowDiskUse: true })
      .toArray();
    
    // Update last processed time
    await this.updateLastProcessedTime(collectionName, new Date());
    
    return {
      incrementalResults: results,
      lastProcessedTime: lastProcessedTime,
      newProcessedTime: new Date(),
      documentsProcessed: results.length
    };
  }
}
```

## SQL-Style Aggregation Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Aggregation Framework operations:

```sql
-- QueryLeaf aggregation operations with SQL-familiar syntax

-- Complex customer analytics with CTEs and window functions
WITH customer_segments AS (
  SELECT 
    customer_id,
    customer_name,
    registration_date,
    
    -- Customer segmentation using CASE expressions
    CASE 
      WHEN registration_date >= CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'new_customer'
      WHEN last_order_date >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 'active_customer'
      WHEN last_order_date >= CURRENT_TIMESTAMP - INTERVAL '180 days' THEN 'returning_customer'
      ELSE 'dormant_customer'
    END as customer_segment,
    
    -- Geographic classification using nested CASE
    CASE 
      WHEN JSON_EXTRACT(address, '$.country') = 'US' THEN 'domestic'
      WHEN JSON_EXTRACT(address, '$.country') IN ('CA', 'MX') THEN 'north_america'
      WHEN JSON_EXTRACT(address, '$.country') IN ('GB', 'DE', 'FR', 'IT', 'ES') THEN 'europe'
      ELSE 'international'
    END as geographic_segment,
    
    -- Customer value classification
    total_spent,
    total_orders,
    average_order_value,
    loyalty_tier
    
  FROM customers
  WHERE is_active = true
),

order_analytics AS (
  SELECT 
    o._id as order_id,
    o.customer_id,
    o.order_date,
    
    -- Time-based dimensions using date functions
    DATE_TRUNC('month', o.order_date) as order_month,
    DATE_TRUNC('quarter', o.order_date) as order_quarter,
    EXTRACT(year FROM o.order_date) as order_year,
    EXTRACT(dow FROM o.order_date) as day_of_week,
    EXTRACT(hour FROM o.order_date) as hour_of_day,
    
    -- Seasonal analysis
    CASE 
      WHEN EXTRACT(month FROM o.order_date) IN (12, 1, 2) THEN 'winter'
      WHEN EXTRACT(month FROM o.order_date) IN (3, 4, 5) THEN 'spring'
      WHEN EXTRACT(month FROM o.order_date) IN (6, 7, 8) THEN 'summer'
      ELSE 'fall'
    END as season,
    
    -- Financial metrics
    JSON_EXTRACT(financial, '$.total') as order_total,
    JSON_EXTRACT(financial, '$.discount') as discount_amount,
    JSON_EXTRACT(financial, '$.tax') as tax_amount,
    JSON_EXTRACT(financial, '$.shipping') as shipping_amount,
    
    -- Order classification
    CASE 
      WHEN JSON_EXTRACT(financial, '$.total') >= 1000 THEN 'high_value'
      WHEN JSON_EXTRACT(financial, '$.total') >= 500 THEN 'medium_value'
      WHEN JSON_EXTRACT(financial, '$.total') >= 100 THEN 'low_value'
      ELSE 'micro_transaction'
    END as order_value_segment,
    
    -- Item analysis using JSON functions
    JSON_ARRAY_LENGTH(items) as item_count,
    
    -- Payment and shipping insights
    JSON_EXTRACT(payment, '$.method') as payment_method,
    JSON_EXTRACT(shipping, '$.method') as shipping_method,
    JSON_EXTRACT(shipping, '$.region') as shipping_region
    
  FROM orders o
  WHERE o.order_date >= CURRENT_TIMESTAMP - INTERVAL '12 months'
    AND o.status IN ('completed', 'shipped', 'delivered')
),

product_performance AS (
  SELECT 
    oi.order_id,
    
    -- Unnest items array for item-level analysis
    JSON_EXTRACT(item, '$.product_id') as product_id,
    JSON_EXTRACT(item, '$.quantity') as quantity,
    JSON_EXTRACT(item, '$.unit_price') as unit_price,
    JSON_EXTRACT(item, '$.total_price') as item_total,
    
    -- Product details from JOIN
    p.product_name,
    p.category,
    p.brand,
    p.cost_per_unit,
    
    -- Calculate margins
    (JSON_EXTRACT(item, '$.unit_price') - p.cost_per_unit) as unit_margin,
    (JSON_EXTRACT(item, '$.unit_price') - p.cost_per_unit) * JSON_EXTRACT(item, '$.quantity') as total_margin,
    
    -- Product categorization
    CASE 
      WHEN p.category = 'Electronics' THEN 'tech'
      WHEN p.category IN ('Clothing', 'Shoes', 'Accessories') THEN 'fashion'
      WHEN p.category IN ('Home', 'Garden', 'Furniture') THEN 'home'
      ELSE 'other'
    END as product_group
    
  FROM order_analytics oa
  CROSS JOIN JSON_TABLE(
    oa.items, '$[*]' COLUMNS (
      item JSON PATH '$'
    )
  ) AS items_table
  JOIN products p ON JSON_EXTRACT(items_table.item, '$.product_id') = p.product_id
  WHERE p.is_active = true
),

comprehensive_analytics AS (
  SELECT 
    -- Dimensional attributes
    cs.customer_segment,
    cs.geographic_segment,
    oa.order_month,
    oa.order_quarter,
    oa.season,
    oa.order_value_segment,
    pp.product_group,
    pp.category,
    pp.brand,
    
    -- Aggregated metrics using window functions
    COUNT(DISTINCT cs.customer_id) as unique_customers,
    COUNT(DISTINCT oa.order_id) as total_orders,
    COUNT(DISTINCT pp.product_id) as unique_products,
    
    -- Revenue metrics
    SUM(oa.order_total) as total_revenue,
    AVG(oa.order_total) as avg_order_value,
    SUM(pp.total_margin) as total_margin,
    
    -- Customer metrics with window functions
    AVG(SUM(oa.order_total)) OVER (
      PARTITION BY cs.customer_id
    ) as avg_customer_monthly_spend,
    
    -- Product performance with rankings
    RANK() OVER (
      PARTITION BY oa.order_month
      ORDER BY SUM(pp.total_margin) DESC
    ) as product_margin_rank,
    
    -- Time-based analysis
    COUNT(*) OVER (
      PARTITION BY cs.geographic_segment, oa.season
    ) as segment_seasonal_orders,
    
    -- Advanced statistical functions
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY oa.order_total) as median_order_value,
    STDDEV_POP(oa.order_total) as order_value_stddev,
    
    -- Cohort analysis elements
    MIN(oa.order_date) OVER (PARTITION BY cs.customer_id) as customer_first_order,
    MAX(oa.order_date) OVER (PARTITION BY cs.customer_id) as customer_last_order,
    
    -- Calculate customer lifetime metrics
    COUNT(*) OVER (PARTITION BY cs.customer_id) as customer_total_orders,
    SUM(oa.order_total) OVER (PARTITION BY cs.customer_id) as customer_lifetime_value
    
  FROM customer_segments cs
  JOIN order_analytics oa ON cs.customer_id = oa.customer_id
  JOIN product_performance pp ON oa.order_id = pp.order_id
),

final_analytics AS (
  SELECT 
    customer_segment,
    geographic_segment,
    order_quarter,
    season,
    product_group,
    category,
    brand,
    
    -- Core metrics
    unique_customers,
    total_orders,
    unique_products,
    ROUND(total_revenue, 2) as total_revenue,
    ROUND(avg_order_value, 2) as avg_order_value,
    ROUND(total_margin, 2) as total_margin,
    ROUND((total_margin / total_revenue) * 100, 1) as margin_percentage,
    
    -- Customer insights
    ROUND(avg_customer_monthly_spend, 2) as avg_customer_monthly_spend,
    ROUND(median_order_value, 2) as median_order_value,
    ROUND(order_value_stddev, 2) as order_value_stddev,
    
    -- Performance indicators
    CASE 
      WHEN product_margin_rank <= 10 THEN 'top_performer'
      WHEN product_margin_rank <= 50 THEN 'good_performer'
      ELSE 'average_performer'
    END as performance_tier,
    
    -- Customer behavior analysis
    AVG(EXTRACT(days FROM (customer_last_order - customer_first_order))) as avg_customer_lifespan_days,
    AVG(customer_total_orders) as avg_orders_per_customer,
    ROUND(AVG(customer_lifetime_value), 2) as avg_customer_lifetime_value,
    
    -- Growth analysis using LAG function
    LAG(total_revenue) OVER (
      PARTITION BY customer_segment, geographic_segment, product_group
      ORDER BY order_quarter
    ) as prev_quarter_revenue,
    
    -- Calculate growth rate
    ROUND(
      ((total_revenue - LAG(total_revenue) OVER (
        PARTITION BY customer_segment, geographic_segment, product_group
        ORDER BY order_quarter
      )) / NULLIF(LAG(total_revenue) OVER (
        PARTITION BY customer_segment, geographic_segment, product_group
        ORDER BY order_quarter
      ), 0)) * 100,
      1
    ) as revenue_growth_pct,
    
    -- Market share analysis
    ROUND(
      (total_revenue / SUM(total_revenue) OVER (PARTITION BY order_quarter)) * 100,
      2
    ) as market_share_pct,
    
    -- Seasonal performance indexing
    ROUND(
      total_revenue / AVG(total_revenue) OVER (
        PARTITION BY customer_segment, geographic_segment, product_group
      ) * 100,
      1
    ) as seasonal_index
    
  FROM comprehensive_analytics
)

SELECT 
  -- Dimensional attributes
  customer_segment,
  geographic_segment,
  order_quarter,
  season,
  product_group,
  category,
  brand,
  
  -- Core metrics
  unique_customers,
  total_orders,
  unique_products,
  total_revenue,
  avg_order_value,
  total_margin,
  margin_percentage,
  
  -- Customer insights
  avg_customer_monthly_spend,
  median_order_value,
  order_value_stddev,
  avg_customer_lifespan_days,
  avg_orders_per_customer,
  avg_customer_lifetime_value,
  
  -- Performance classification
  performance_tier,
  
  -- Growth metrics
  prev_quarter_revenue,
  revenue_growth_pct,
  market_share_pct,
  seasonal_index,
  
  -- Business insights and recommendations
  CASE 
    WHEN revenue_growth_pct > 25 THEN 'high_growth_opportunity'
    WHEN revenue_growth_pct > 10 THEN 'steady_growth'
    WHEN revenue_growth_pct > 0 THEN 'slow_growth'
    WHEN revenue_growth_pct IS NULL THEN 'new_segment'
    ELSE 'declining_segment'
  END as growth_classification,
  
  CASE 
    WHEN margin_percentage > 30 AND revenue_growth_pct > 15 THEN 'invest_and_expand'
    WHEN margin_percentage > 30 AND revenue_growth_pct < 0 THEN 'optimize_and_retain'  
    WHEN margin_percentage < 15 AND revenue_growth_pct > 15 THEN 'improve_margins'
    WHEN margin_percentage < 15 AND revenue_growth_pct < 0 THEN 'consider_exit'
    ELSE 'monitor_and_optimize'
  END as strategic_recommendation,
  
  -- Key performance indicators
  CASE 
    WHEN avg_customer_lifetime_value > 1000 AND avg_orders_per_customer > 5 THEN 'high_value_loyal'
    WHEN avg_customer_lifetime_value > 500 THEN 'high_value'
    WHEN avg_orders_per_customer > 3 THEN 'loyal_customers'
    ELSE 'acquisition_focus'
  END as customer_strategy

FROM final_analytics
WHERE total_revenue > 1000  -- Filter for statistical significance
ORDER BY 
  total_revenue DESC,
  revenue_growth_pct DESC NULLS LAST,
  margin_percentage DESC
LIMIT 500;

-- Real-time product performance dashboard
CREATE VIEW real_time_product_performance AS
WITH hourly_product_metrics AS (
  SELECT 
    JSON_EXTRACT(item, '$.product_id') as product_id,
    DATE_TRUNC('hour', order_date) as hour_bucket,
    
    -- Sales metrics
    SUM(JSON_EXTRACT(item, '$.quantity')) as total_quantity_sold,
    SUM(JSON_EXTRACT(item, '$.total_price')) as total_revenue,
    COUNT(DISTINCT order_id) as unique_orders,
    COUNT(DISTINCT customer_id) as unique_customers,
    
    -- Pricing analysis
    AVG(JSON_EXTRACT(item, '$.unit_price')) as avg_selling_price,
    MAX(JSON_EXTRACT(item, '$.unit_price')) as max_selling_price,
    MIN(JSON_EXTRACT(item, '$.unit_price')) as min_selling_price,
    
    -- Performance indicators
    AVG(JSON_EXTRACT(financial, '$.total')) as avg_order_value,
    SUM(JSON_EXTRACT(item, '$.quantity')) / COUNT(DISTINCT order_id) as avg_quantity_per_order
    
  FROM orders o
  CROSS JOIN JSON_TABLE(
    o.items, '$[*]' COLUMNS (
      item JSON PATH '$'
    )
  ) AS items_unnested
  WHERE o.order_date >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND o.status IN ('completed', 'processing', 'shipped')
  GROUP BY 
    JSON_EXTRACT(item, '$.product_id'),
    DATE_TRUNC('hour', order_date)
),

product_rankings AS (
  SELECT 
    hpm.*,
    p.product_name,
    p.category,
    p.brand,
    p.cost_per_unit,
    
    -- Calculate margins
    (hpm.avg_selling_price - p.cost_per_unit) as unit_margin,
    ((hpm.avg_selling_price - p.cost_per_unit) * hpm.total_quantity_sold) as total_margin,
    
    -- Performance rankings using window functions
    RANK() OVER (ORDER BY total_revenue DESC) as revenue_rank,
    RANK() OVER (ORDER BY total_quantity_sold DESC) as quantity_rank,
    RANK() OVER (PARTITION BY p.category ORDER BY total_revenue DESC) as category_rank,
    
    -- Percentile rankings
    PERCENT_RANK() OVER (ORDER BY total_revenue) as revenue_percentile,
    PERCENT_RANK() OVER (ORDER BY total_quantity_sold) as quantity_percentile,
    
    -- Growth analysis (comparing to previous hour)
    LAG(total_revenue) OVER (
      PARTITION BY product_id 
      ORDER BY hour_bucket
    ) as prev_hour_revenue,
    
    LAG(total_quantity_sold) OVER (
      PARTITION BY product_id 
      ORDER BY hour_bucket
    ) as prev_hour_quantity
    
  FROM hourly_product_metrics hpm
  JOIN products p ON hpm.product_id = p.product_id
  WHERE p.is_active = true
)

SELECT 
  product_id,
  product_name,
  category,
  brand,
  hour_bucket,
  
  -- Sales performance
  total_quantity_sold,
  ROUND(total_revenue, 2) as total_revenue,
  unique_orders,
  unique_customers,
  
  -- Pricing metrics
  ROUND(avg_selling_price, 2) as avg_selling_price,
  max_selling_price,
  min_selling_price,
  ROUND(unit_margin, 2) as unit_margin,
  ROUND(total_margin, 2) as total_margin,
  ROUND((total_margin / total_revenue) * 100, 1) as margin_percentage,
  
  -- Performance rankings
  revenue_rank,
  quantity_rank,
  category_rank,
  ROUND(revenue_percentile * 100, 1) as revenue_percentile_score,
  
  -- Growth metrics
  ROUND(
    CASE 
      WHEN prev_hour_revenue > 0 THEN
        ((total_revenue - prev_hour_revenue) / prev_hour_revenue) * 100
      ELSE NULL
    END,
    1
  ) as hourly_revenue_growth_pct,
  
  ROUND(
    CASE 
      WHEN prev_hour_quantity > 0 THEN
        ((total_quantity_sold - prev_hour_quantity) / prev_hour_quantity::DECIMAL) * 100
      ELSE NULL
    END,
    1
  ) as hourly_quantity_growth_pct,
  
  -- Customer metrics
  ROUND(avg_order_value, 2) as avg_order_value,
  ROUND(avg_quantity_per_order, 2) as avg_quantity_per_order,
  ROUND(total_revenue / unique_customers, 2) as revenue_per_customer,
  
  -- Performance classification
  CASE 
    WHEN revenue_rank <= 10 AND margin_percentage > 20 THEN 'star_performer'
    WHEN revenue_rank <= 50 AND margin_percentage > 15 THEN 'strong_performer'
    WHEN revenue_rank <= 100 THEN 'solid_performer'
    ELSE 'monitor_performance'
  END as performance_classification,
  
  -- Alert indicators
  CASE 
    WHEN hourly_revenue_growth_pct > 50 THEN 'trending_up'
    WHEN hourly_revenue_growth_pct < -30 THEN 'trending_down'
    WHEN revenue_rank <= 20 AND margin_percentage < 10 THEN 'margin_concern'
    ELSE 'normal'
  END as alert_status,
  
  -- Recommendations
  CASE 
    WHEN performance_classification = 'star_performer' THEN 'increase_inventory_and_marketing'
    WHEN alert_status = 'trending_down' THEN 'investigate_declining_performance'
    WHEN margin_percentage < 10 THEN 'review_pricing_strategy'
    WHEN revenue_rank > 100 THEN 'consider_promotion_or_discontinuation'
    ELSE 'maintain_current_strategy'
  END as recommendation

FROM product_rankings
WHERE hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY 
  hour_bucket DESC,
  revenue_rank ASC,
  margin_percentage DESC;

-- Advanced cohort analysis with SQL window functions
WITH customer_cohorts AS (
  SELECT 
    customer_id,
    DATE_TRUNC('month', MIN(order_date)) as cohort_month,
    MIN(order_date) as first_order_date,
    COUNT(*) as total_orders,
    SUM(JSON_EXTRACT(financial, '$.total')) as total_spent
    
  FROM orders
  WHERE status IN ('completed', 'delivered')
    AND order_date >= CURRENT_TIMESTAMP - INTERVAL '24 months'
  GROUP BY customer_id
),

cohort_periods AS (
  SELECT 
    cc.customer_id,
    cc.cohort_month,
    cc.first_order_date,
    cc.total_orders,
    cc.total_spent,
    
    o.order_date,
    o._id as order_id,
    JSON_EXTRACT(o.financial, '$.total') as order_value,
    
    -- Calculate periods since first order
    FLOOR(
      MONTHS_BETWEEN(DATE_TRUNC('month', o.order_date), cc.cohort_month)
    ) as periods_since_first_order,
    
    DATE_TRUNC('month', o.order_date) as order_month
    
  FROM customer_cohorts cc
  JOIN orders o ON cc.customer_id = o.customer_id
  WHERE o.status IN ('completed', 'delivered')
    AND o.order_date >= cc.first_order_date
),

cohort_analysis AS (
  SELECT 
    cohort_month,
    periods_since_first_order,
    order_month,
    
    -- Cohort metrics
    COUNT(DISTINCT customer_id) as active_customers,
    COUNT(DISTINCT order_id) as total_orders,
    SUM(order_value) as total_revenue,
    AVG(order_value) as avg_order_value,
    
    -- Customer behavior
    AVG(total_orders) as avg_lifetime_orders,
    AVG(total_spent) as avg_lifetime_value,
    
    -- Period-specific insights
    COUNT(DISTINCT customer_id) / 
    FIRST_VALUE(COUNT(DISTINCT customer_id)) OVER (
      PARTITION BY cohort_month 
      ORDER BY periods_since_first_order
      ROWS UNBOUNDED PRECEDING
    ) as retention_rate
    
  FROM cohort_periods
  GROUP BY cohort_month, periods_since_first_order, order_month
),

cohort_summary AS (
  SELECT 
    cohort_month,
    
    -- Cohort size (customers who made first purchase in this month)
    MAX(CASE WHEN periods_since_first_order = 0 THEN active_customers END) as cohort_size,
    
    -- Retention rates by period
    MAX(CASE WHEN periods_since_first_order = 1 THEN retention_rate END) as month_1_retention,
    MAX(CASE WHEN periods_since_first_order = 3 THEN retention_rate END) as month_3_retention,
    MAX(CASE WHEN periods_since_first_order = 6 THEN retention_rate END) as month_6_retention,
    MAX(CASE WHEN periods_since_first_order = 12 THEN retention_rate END) as month_12_retention,
    
    -- Revenue metrics
    SUM(total_revenue) as cohort_total_revenue,
    AVG(avg_lifetime_value) as avg_customer_ltv,
    
    -- Performance indicators
    MAX(periods_since_first_order) as max_observed_periods,
    AVG(avg_order_value) as cohort_avg_order_value
    
  FROM cohort_analysis
  GROUP BY cohort_month
)

SELECT 
  cohort_month,
  cohort_size,
  
  -- Retention analysis
  ROUND(month_1_retention * 100, 1) as month_1_retention_pct,
  ROUND(month_3_retention * 100, 1) as month_3_retention_pct,
  ROUND(month_6_retention * 100, 1) as month_6_retention_pct,
  ROUND(month_12_retention * 100, 1) as month_12_retention_pct,
  
  -- Financial metrics
  ROUND(cohort_total_revenue, 2) as cohort_total_revenue,
  ROUND(avg_customer_ltv, 2) as avg_customer_ltv,
  ROUND(cohort_avg_order_value, 2) as avg_order_value,
  ROUND(cohort_total_revenue / cohort_size, 2) as revenue_per_customer,
  
  -- Cohort performance classification
  CASE 
    WHEN month_3_retention >= 0.4 AND avg_customer_ltv >= 500 THEN 'excellent'
    WHEN month_3_retention >= 0.3 AND avg_customer_ltv >= 300 THEN 'good'
    WHEN month_3_retention >= 0.2 OR avg_customer_ltv >= 200 THEN 'fair'
    ELSE 'poor'
  END as cohort_quality,
  
  -- Growth trend analysis
  ROUND(
    (month_6_retention - month_1_retention) * 100,
    1
  ) as retention_trend,
  
  -- Business insights
  CASE 
    WHEN month_1_retention < 0.2 THEN 'improve_onboarding'
    WHEN month_12_retention < 0.1 THEN 'enhance_loyalty_program'
    WHEN avg_customer_ltv < 100 THEN 'increase_customer_value'
    ELSE 'maintain_performance'
  END as recommendation,
  
  max_observed_periods

FROM cohort_summary
WHERE cohort_size >= 10  -- Filter for statistical significance
ORDER BY cohort_month DESC;

-- QueryLeaf provides comprehensive aggregation capabilities:
-- 1. SQL-familiar syntax for complex MongoDB aggregation pipelines
-- 2. Advanced analytics with CTEs, window functions, and statistical operations
-- 3. Real-time processing with familiar SQL patterns and aggregation functions  
-- 4. Complex customer segmentation and behavioral analysis using SQL constructs
-- 5. Product performance analytics with rankings and growth calculations
-- 6. Cohort analysis with retention rates and lifetime value calculations
-- 7. Integration with MongoDB's native aggregation optimizations
-- 8. Familiar SQL data types, functions, and expression syntax
-- 9. Advanced time-series analysis and trend detection capabilities
-- 10. Enterprise-ready analytics with performance optimization and scalability
```

## Best Practices for Aggregation Framework Implementation

### Performance Optimization and Pipeline Design

Essential strategies for effective MongoDB Aggregation Framework usage:

1. **Early Stage Filtering**: Place `$match` stages as early as possible to reduce data processing volume
2. **Index Utilization**: Design compound indexes that support aggregation pipeline operations
3. **Memory Management**: Use `allowDiskUse: true` for large aggregations and monitor memory usage
4. **Pipeline Ordering**: Arrange stages to minimize data movement and intermediate result sizes
5. **Expression Optimization**: Use efficient expressions and avoid complex nested operations when possible
6. **Result Set Limiting**: Apply `$limit` stages strategically to control output size

### Enterprise Analytics Architecture

Design scalable aggregation systems for production deployments:

1. **Distributed Processing**: Leverage MongoDB's sharding to distribute aggregation workloads
2. **Caching Strategies**: Implement result caching for frequently accessed aggregations  
3. **Real-time Processing**: Combine aggregation pipelines with Change Streams for live analytics
4. **Incremental Updates**: Design incremental aggregation patterns for large, frequently updated datasets
5. **Performance Monitoring**: Track aggregation performance and optimize based on usage patterns
6. **Resource Planning**: Size clusters appropriately for expected aggregation workloads and data volumes

## Conclusion

MongoDB's Aggregation Framework provides comprehensive data processing capabilities that eliminate the complexity and performance limitations of traditional SQL analytics approaches through optimized single-pass processing, native document transformations, and distributed execution capabilities. The rich expression language and extensive operator library enable sophisticated analytics while maintaining high performance and operational simplicity.

Key MongoDB Aggregation Framework benefits include:

- **Unified Processing**: Single-pass analytics without expensive JOINs or multiple query rounds
- **Rich Expressions**: Comprehensive mathematical, statistical, and analytical operations  
- **Document-Native**: Native handling of nested documents, arrays, and complex data structures
- **Performance Optimization**: Automatic query optimization with index utilization and parallel processing
- **Horizontal Scaling**: Distributed aggregation processing across sharded MongoDB clusters
- **Real-time Capabilities**: Integration with Change Streams for live analytical processing

Whether you're building business intelligence platforms, real-time analytics systems, customer segmentation tools, or complex reporting solutions, MongoDB's Aggregation Framework with QueryLeaf's familiar SQL interface provides the foundation for powerful, scalable, and maintainable analytical processing.

> **QueryLeaf Integration**: QueryLeaf seamlessly translates SQL analytics queries into optimized MongoDB aggregation pipelines while providing familiar SQL syntax for complex analytics, statistical functions, and reporting operations. Advanced aggregation patterns including cohort analysis, customer segmentation, and real-time analytics are elegantly handled through familiar SQL constructs, making sophisticated data processing both powerful and accessible to SQL-oriented analytics teams.

The combination of MongoDB's robust aggregation capabilities with SQL-style analytical operations makes it an ideal platform for applications requiring both advanced analytics functionality and familiar database interaction patterns, ensuring your analytical infrastructure can deliver insights efficiently while maintaining developer productivity and operational excellence.