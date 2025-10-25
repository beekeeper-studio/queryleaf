---
title: "MongoDB Aggregation Framework for Real-Time Analytics Dashboards: Advanced Data Processing and Visualization Pipelines"
description: "Master MongoDB's aggregation framework for building powerful real-time analytics dashboards. Learn advanced aggregation patterns, performance optimization, and SQL-compatible analytics queries for data-driven applications."
date: 2025-10-24
tags: [mongodb, aggregation, analytics, dashboards, real-time, data-processing, performance, sql]
---

# MongoDB Aggregation Framework for Real-Time Analytics Dashboards: Advanced Data Processing and Visualization Pipelines

Modern data-driven applications require sophisticated analytics capabilities that can process large volumes of data in real-time, generate insights across multiple dimensions, and power interactive dashboards that provide immediate business intelligence. Traditional analytics approaches often involve complex ETL processes, separate analytics databases, and batch processing systems that introduce significant latency between data creation and insight availability, limiting the ability to make real-time business decisions.

MongoDB's Aggregation Framework provides comprehensive real-time analytics capabilities through powerful data processing pipelines that enable complex calculations, multi-stage transformations, and advanced statistical operations directly within the database. Unlike traditional analytics systems that require data movement and separate processing infrastructure, MongoDB aggregation pipelines can process operational data immediately, providing real-time insights with minimal latency and infrastructure complexity.

## The Traditional Analytics Challenge

Conventional approaches to real-time analytics and dashboard creation have significant limitations for modern data-driven applications:

```sql
-- Traditional PostgreSQL analytics - complex and resource-intensive approaches

-- Basic analytics table structure with limited real-time capabilities
CREATE TABLE sales_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    product_id UUID NOT NULL,
    transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    sales_channel VARCHAR(50) NOT NULL,
    region VARCHAR(100) NOT NULL,
    
    -- Manual aggregation tracking (limited granularity)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Basic customer demographics table
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    age INTEGER,
    gender VARCHAR(20),
    city VARCHAR(100),
    state VARCHAR(50),
    country VARCHAR(50),
    customer_segment VARCHAR(50),
    registration_date TIMESTAMP NOT NULL,
    lifetime_value DECIMAL(15,2) DEFAULT 0
);

-- Product catalog with basic attributes
CREATE TABLE products (
    product_id UUID PRIMARY KEY,
    product_name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    brand VARCHAR(100),
    unit_cost DECIMAL(10,2) NOT NULL,
    list_price DECIMAL(10,2) NOT NULL,
    margin_percent DECIMAL(5,2),
    stock_quantity INTEGER DEFAULT 0,
    supplier_id UUID
);

-- Pre-aggregated summary tables (manual maintenance required)
CREATE TABLE daily_sales_summary (
    summary_date DATE NOT NULL,
    region VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    total_transactions INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_units_sold INTEGER DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,
    avg_transaction_value DECIMAL(10,2) DEFAULT 0,
    
    -- Manual timestamp tracking
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (summary_date, region, category)
);

-- Complex materialized view for real-time dashboard (limited refresh capabilities)
CREATE MATERIALIZED VIEW current_sales_dashboard AS
WITH hourly_metrics AS (
    SELECT 
        DATE_TRUNC('hour', st.transaction_date) as hour_bucket,
        st.region,
        p.category,
        p.brand,
        c.customer_segment,
        
        -- Basic aggregations (limited computational capability)
        COUNT(*) as transaction_count,
        COUNT(DISTINCT st.customer_id) as unique_customers,
        SUM(st.total_amount) as total_revenue,
        SUM(st.quantity) as total_units,
        AVG(st.total_amount) as avg_transaction_value,
        SUM(st.discount_amount) as total_discounts,
        
        -- Limited statistical calculations
        STDDEV(st.total_amount) as revenue_stddev,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY st.total_amount) as median_transaction_value,
        
        -- Payment method breakdown (basic pivot)
        COUNT(*) FILTER (WHERE st.payment_method = 'credit_card') as credit_card_transactions,
        COUNT(*) FILTER (WHERE st.payment_method = 'debit_card') as debit_card_transactions,
        COUNT(*) FILTER (WHERE st.payment_method = 'cash') as cash_transactions,
        COUNT(*) FILTER (WHERE st.payment_method = 'digital_wallet') as digital_wallet_transactions
        
    FROM sales_transactions st
    JOIN customers c ON st.customer_id = c.customer_id
    JOIN products p ON st.product_id = p.product_id
    WHERE st.transaction_date >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    GROUP BY 
        DATE_TRUNC('hour', st.transaction_date),
        st.region, p.category, p.brand, c.customer_segment
),

regional_performance AS (
    SELECT 
        hm.region,
        
        -- Regional aggregations (limited granularity)
        SUM(hm.transaction_count) as total_transactions,
        SUM(hm.total_revenue) as total_revenue,
        SUM(hm.unique_customers) as unique_customers,
        AVG(hm.avg_transaction_value) as avg_transaction_value,
        
        -- Simple ranking (no advanced analytics)
        RANK() OVER (ORDER BY SUM(hm.total_revenue) DESC) as revenue_rank,
        
        -- Basic percentage calculations
        SUM(hm.total_revenue) / SUM(SUM(hm.total_revenue)) OVER () * 100 as revenue_percentage,
        
        -- Limited trend analysis
        SUM(hm.total_revenue) FILTER (WHERE hm.hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '12 hours') as revenue_last_12h,
        SUM(hm.total_revenue) FILTER (WHERE hm.hour_bucket < CURRENT_TIMESTAMP - INTERVAL '12 hours') as revenue_prev_12h
        
    FROM hourly_metrics hm
    GROUP BY hm.region
),

category_analysis AS (
    SELECT 
        hm.category,
        hm.brand,
        
        -- Category-level aggregations
        SUM(hm.transaction_count) as category_transactions,
        SUM(hm.total_revenue) as category_revenue,
        SUM(hm.total_units) as category_units,
        
        -- Limited cross-category analysis
        SUM(hm.total_revenue) / SUM(SUM(hm.total_revenue)) OVER () * 100 as category_revenue_share,
        DENSE_RANK() OVER (ORDER BY SUM(hm.total_revenue) DESC) as category_rank,
        
        -- Basic growth calculations (limited time series analysis)
        SUM(hm.total_revenue) FILTER (WHERE hm.hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '6 hours') as recent_revenue,
        SUM(hm.total_revenue) FILTER (WHERE hm.hour_bucket < CURRENT_TIMESTAMP - INTERVAL '6 hours') as earlier_revenue
        
    FROM hourly_metrics hm
    GROUP BY hm.category, hm.brand
)

SELECT 
    CURRENT_TIMESTAMP as dashboard_last_updated,
    
    -- Overall metrics (basic calculations only)
    (SELECT SUM(total_transactions) FROM regional_performance) as total_transactions_24h,
    (SELECT SUM(total_revenue) FROM regional_performance) as total_revenue_24h,
    (SELECT SUM(unique_customers) FROM regional_performance) as unique_customers_24h,
    (SELECT AVG(avg_transaction_value) FROM regional_performance) as avg_transaction_value_24h,
    
    -- Regional performance (limited analysis depth)
    (SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
            'region', region,
            'revenue', total_revenue,
            'transactions', total_transactions,
            'rank', revenue_rank,
            'percentage', ROUND(revenue_percentage, 2),
            'trend', CASE 
                WHEN revenue_last_12h > revenue_prev_12h THEN 'up'
                WHEN revenue_last_12h < revenue_prev_12h THEN 'down' 
                ELSE 'flat'
            END
        ) ORDER BY revenue_rank
    ) FROM regional_performance) as regional_data,
    
    -- Category analysis (basic breakdown only)
    (SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
            'category', category,
            'brand', brand,
            'revenue', category_revenue,
            'units', category_units,
            'share', ROUND(category_revenue_share, 2),
            'rank', category_rank,
            'growth', CASE 
                WHEN recent_revenue > earlier_revenue THEN 'positive'
                WHEN recent_revenue < earlier_revenue THEN 'negative'
                ELSE 'neutral'
            END
        ) ORDER BY category_rank
    ) FROM category_analysis) as category_data,
    
    -- Payment method distribution (static breakdown)
    (SELECT JSON_BUILD_OBJECT(
        'credit_card', SUM(credit_card_transactions),
        'debit_card', SUM(debit_card_transactions), 
        'cash', SUM(cash_transactions),
        'digital_wallet', SUM(digital_wallet_transactions)
    ) FROM hourly_metrics) as payment_methods,
    
    -- Customer segment analysis (limited segmentation)
    (SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
            'segment', customer_segment,
            'transactions', SUM(transaction_count),
            'revenue', SUM(total_revenue),
            'avg_value', AVG(avg_transaction_value)
        )
    ) FROM hourly_metrics GROUP BY customer_segment) as customer_segments;

-- Problems with traditional analytics approaches:
-- 1. Materialized views require manual refresh and don't support real-time updates
-- 2. Limited aggregation and statistical calculation capabilities
-- 3. Complex join operations impact performance with large datasets
-- 4. No support for advanced analytics like time series analysis or forecasting
-- 5. Difficult to handle nested data structures or dynamic schema requirements
-- 6. Pre-aggregation tables require significant maintenance and storage overhead
-- 7. Limited flexibility for ad-hoc analytics queries and dashboard customization
-- 8. No built-in support for complex data transformations or calculated metrics
-- 9. Poor scalability for high-volume real-time analytics workloads
-- 10. Complex query optimization and index management requirements

-- Manual refresh process (resource-intensive and not real-time)
REFRESH MATERIALIZED VIEW CONCURRENTLY current_sales_dashboard;

-- Attempt at real-time hourly summary calculation (performance bottleneck)
WITH real_time_hourly AS (
    SELECT 
        DATE_TRUNC('hour', CURRENT_TIMESTAMP) as current_hour,
        
        -- Current hour calculations (heavy resource usage)
        COUNT(*) as current_hour_transactions,
        SUM(total_amount) as current_hour_revenue,
        COUNT(DISTINCT customer_id) as current_hour_customers,
        AVG(total_amount) as current_hour_avg_value,
        
        -- Limited real-time comparisons
        COUNT(*) FILTER (WHERE transaction_date >= DATE_TRUNC('hour', CURRENT_TIMESTAMP)) as this_hour_so_far,
        COUNT(*) FILTER (WHERE transaction_date >= DATE_TRUNC('hour', CURRENT_TIMESTAMP - INTERVAL '1 hour')
                        AND transaction_date < DATE_TRUNC('hour', CURRENT_TIMESTAMP)) as previous_hour_full,
        
        -- Basic percentage calculations
        SUM(total_amount) FILTER (WHERE transaction_date >= DATE_TRUNC('hour', CURRENT_TIMESTAMP)) as revenue_this_hour,
        SUM(total_amount) FILTER (WHERE transaction_date >= DATE_TRUNC('hour', CURRENT_TIMESTAMP - INTERVAL '1 hour')
                                  AND transaction_date < DATE_TRUNC('hour', CURRENT_TIMESTAMP)) as revenue_previous_hour
        
    FROM sales_transactions
    WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '2 hours'
),

performance_indicators AS (
    SELECT 
        rth.*,
        
        -- Limited performance metrics
        CASE 
            WHEN revenue_previous_hour > 0 THEN
                ROUND(((revenue_this_hour - revenue_previous_hour) / revenue_previous_hour) * 100, 2)
            ELSE NULL
        END as revenue_change_percent,
        
        CASE 
            WHEN previous_hour_full > 0 THEN
                ROUND(((this_hour_so_far - previous_hour_full) / previous_hour_full::FLOAT) * 100, 2)
            ELSE NULL
        END as transaction_change_percent,
        
        -- Simple trend classification
        CASE 
            WHEN revenue_this_hour > revenue_previous_hour THEN 'increasing'
            WHEN revenue_this_hour < revenue_previous_hour THEN 'decreasing'
            ELSE 'stable'
        END as revenue_trend
        
    FROM real_time_hourly rth
)

SELECT 
    current_hour,
    current_hour_transactions,
    ROUND(current_hour_revenue::NUMERIC, 2) as current_hour_revenue,
    current_hour_customers,
    ROUND(current_hour_avg_value::NUMERIC, 2) as current_hour_avg_value,
    
    -- Trend indicators
    revenue_change_percent,
    transaction_change_percent,
    revenue_trend,
    
    -- Performance assessment (basic classification)
    CASE 
        WHEN revenue_change_percent > 20 THEN 'excellent'
        WHEN revenue_change_percent > 10 THEN 'good'
        WHEN revenue_change_percent > 0 THEN 'positive'
        WHEN revenue_change_percent > -10 THEN 'neutral'
        ELSE 'concerning'
    END as performance_status,
    
    CURRENT_TIMESTAMP as calculated_at
    
FROM performance_indicators;

-- Traditional limitations:
-- 1. No real-time dashboard updates - requires manual refresh or polling
-- 2. Limited analytical capabilities compared to specialized analytics databases
-- 3. Performance degrades significantly with large datasets and complex calculations
-- 4. Difficult to implement advanced analytics like cohort analysis or forecasting
-- 5. No support for nested document analysis or flexible schema structures
-- 6. Complex index management and query optimization requirements
-- 7. Limited ability to handle streaming data or event-driven analytics
-- 8. Poor integration with modern visualization tools and BI platforms
-- 9. Significant infrastructure and maintenance overhead for analytics workloads
-- 10. Inflexible aggregation patterns that don't adapt to changing business requirements
```

MongoDB provides sophisticated real-time analytics capabilities through its powerful Aggregation Framework:

```javascript
// MongoDB Advanced Real-Time Analytics Dashboard System
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017/?replicaSet=rs0');
const db = client.db('realtime_analytics_system');

// Comprehensive MongoDB Analytics Dashboard Manager
class RealtimeAnalyticsDashboard {
  constructor(db, config = {}) {
    this.db = db;
    this.collections = {
      salesTransactions: db.collection('sales_transactions'),
      customers: db.collection('customers'),
      products: db.collection('products'),
      analyticsCache: db.collection('analytics_cache'),
      dashboardMetrics: db.collection('dashboard_metrics'),
      userSessions: db.collection('user_sessions')
    };
    
    // Advanced analytics configuration
    this.config = {
      // Real-time processing settings
      enableRealTimeUpdates: config.enableRealTimeUpdates !== false,
      updateInterval: config.updateInterval || 30000, // 30 seconds
      cacheExpiration: config.cacheExpiration || 300000, // 5 minutes
      
      // Performance optimization
      enableAggregationOptimization: config.enableAggregationOptimization !== false,
      useIndexes: config.useIndexes !== false,
      enableParallelProcessing: config.enableParallelProcessing !== false,
      maxConcurrentPipelines: config.maxConcurrentPipelines || 5,
      
      // Analytics features
      enableAdvancedMetrics: config.enableAdvancedMetrics !== false,
      enablePredictiveAnalytics: config.enablePredictiveAnalytics || false,
      enableCohortAnalysis: config.enableCohortAnalysis || false,
      enableAnomalyDetection: config.enableAnomalyDetection || false,
      
      // Dashboard customization
      timeWindows: config.timeWindows || ['1h', '6h', '24h', '7d', '30d'],
      metrics: config.metrics || ['revenue', 'transactions', 'customers', 'conversion'],
      dimensions: config.dimensions || ['region', 'category', 'channel', 'segment'],
      
      // Data retention
      rawDataRetention: config.rawDataRetention || 90, // days
      aggregatedDataRetention: config.aggregatedDataRetention || 365 // days
    };
    
    // Analytics state management
    this.dashboardState = {
      lastUpdate: null,
      activeConnections: 0,
      processingStats: {
        totalQueries: 0,
        avgResponseTime: 0,
        cacheHitRate: 0
      }
    };
    
    // Initialize analytics system
    this.initializeAnalyticsSystem();
  }

  async initializeAnalyticsSystem() {
    console.log('Initializing comprehensive MongoDB real-time analytics system...');
    
    try {
      // Setup analytics indexes for optimal performance
      await this.setupAnalyticsIndexes();
      
      // Initialize real-time data processing
      await this.setupRealTimeProcessing();
      
      // Setup analytics caching layer
      await this.setupAnalyticsCache();
      
      // Initialize dashboard metrics collection
      await this.initializeDashboardMetrics();
      
      // Setup performance monitoring
      await this.setupPerformanceMonitoring();
      
      console.log('Real-time analytics system initialized successfully');
      
    } catch (error) {
      console.error('Error initializing analytics system:', error);
      throw error;
    }
  }

  async setupAnalyticsIndexes() {
    console.log('Setting up analytics-optimized indexes...');
    
    try {
      // Sales transactions indexes for time-series analytics
      await this.collections.salesTransactions.createIndexes([
        { key: { transaction_date: 1, region: 1 }, background: true },
        { key: { transaction_date: 1, product_category: 1 }, background: true },
        { key: { customer_id: 1, transaction_date: 1 }, background: true },
        { key: { region: 1, sales_channel: 1, transaction_date: 1 }, background: true },
        { key: { product_id: 1, transaction_date: 1 }, background: true },
        { key: { payment_method: 1, transaction_date: 1 }, background: true }
      ]);
      
      // Customer analytics indexes
      await this.collections.customers.createIndexes([
        { key: { customer_segment: 1, registration_date: 1 }, background: true },
        { key: { region: 1, customer_segment: 1 }, background: true },
        { key: { lifetime_value: 1 }, background: true }
      ]);
      
      // Product catalog indexes
      await this.collections.products.createIndexes([
        { key: { category: 1, subcategory: 1 }, background: true },
        { key: { brand: 1, category: 1 }, background: true },
        { key: { margin_percent: 1 }, background: true }
      ]);
      
      console.log('Analytics indexes created successfully');
      
    } catch (error) {
      console.error('Error setting up analytics indexes:', error);
      throw error;
    }
  }

  async generateRealtimeSalesDashboard(timeWindow = '24h', filters = {}) {
    console.log(`Generating real-time sales dashboard for ${timeWindow} window...`);
    
    try {
      // Calculate time range based on window
      const timeRange = this.calculateTimeRange(timeWindow);
      
      // Build comprehensive aggregation pipeline for dashboard metrics
      const dashboardPipeline = [
        // Stage 1: Time-based filtering with optional additional filters
        {
          $match: {
            transaction_date: {
              $gte: timeRange.startDate,
              $lte: timeRange.endDate
            },
            ...this.buildDynamicFilters(filters)
          }
        },
        
        // Stage 2: Join with customer data for segmentation
        {
          $lookup: {
            from: 'customers',
            localField: 'customer_id',
            foreignField: '_id',
            as: 'customer_info'
          }
        },
        
        // Stage 3: Join with product data for category analysis
        {
          $lookup: {
            from: 'products',
            localField: 'product_id',
            foreignField: '_id',
            as: 'product_info'
          }
        },
        
        // Stage 4: Flatten joined data and add computed fields
        {
          $addFields: {
            customer: { $arrayElemAt: ['$customer_info', 0] },
            product: { $arrayElemAt: ['$product_info', 0] },
            transaction_hour: { $dateToString: { format: '%Y-%m-%d %H:00:00', date: '$transaction_date' } },
            transaction_day: { $dateToString: { format: '%Y-%m-%d', date: '$transaction_date' } },
            profit_margin: {
              $multiply: [
                { $subtract: ['$unit_price', '$product.unit_cost'] },
                '$quantity'
              ]
            },
            is_weekend: {
              $in: [{ $dayOfWeek: '$transaction_date' }, [1, 7]]
            },
            time_of_day: {
              $switch: {
                branches: [
                  { case: { $lt: [{ $hour: '$transaction_date' }, 6] }, then: 'night' },
                  { case: { $lt: [{ $hour: '$transaction_date' }, 12] }, then: 'morning' },
                  { case: { $lt: [{ $hour: '$transaction_date' }, 18] }, then: 'afternoon' },
                  { case: { $lt: [{ $hour: '$transaction_date' }, 22] }, then: 'evening' }
                ],
                default: 'night'
              }
            }
          }
        },
        
        // Stage 5: Advanced multi-dimensional aggregations
        {
          $facet: {
            // Overall metrics for the time period
            overallMetrics: [
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: '$total_amount' },
                  totalTransactions: { $sum: 1 },
                  totalUnits: { $sum: '$quantity' },
                  uniqueCustomers: { $addToSet: '$customer_id' },
                  totalProfit: { $sum: '$profit_margin' },
                  avgTransactionValue: { $avg: '$total_amount' },
                  avgOrderSize: { $avg: '$quantity' },
                  totalDiscounts: { $sum: '$discount_amount' },
                  totalTax: { $sum: '$tax_amount' },
                  
                  // Advanced statistical metrics
                  revenueStdDev: { $stdDevSamp: '$total_amount' },
                  transactionValuePercentiles: {
                    $push: '$total_amount'
                  }
                }
              },
              {
                $addFields: {
                  uniqueCustomerCount: { $size: '$uniqueCustomers' },
                  avgRevenuePerCustomer: {
                    $divide: ['$totalRevenue', { $size: '$uniqueCustomers' }]
                  },
                  profitMargin: {
                    $multiply: [
                      { $divide: ['$totalProfit', '$totalRevenue'] },
                      100
                    ]
                  },
                  discountRate: {
                    $multiply: [
                      { $divide: ['$totalDiscounts', '$totalRevenue'] },
                      100
                    ]
                  }
                }
              }
            ],
            
            // Time-based trend analysis (hourly breakdown)
            hourlyTrends: [
              {
                $group: {
                  _id: '$transaction_hour',
                  revenue: { $sum: '$total_amount' },
                  transactions: { $sum: 1 },
                  uniqueCustomers: { $addToSet: '$customer_id' },
                  avgTransactionValue: { $avg: '$total_amount' },
                  profit: { $sum: '$profit_margin' }
                }
              },
              {
                $addFields: {
                  uniqueCustomerCount: { $size: '$uniqueCustomers' },
                  hour: '$_id'
                }
              },
              {
                $sort: { _id: 1 }
              }
            ],
            
            // Regional performance analysis
            regionalPerformance: [
              {
                $group: {
                  _id: '$region',
                  revenue: { $sum: '$total_amount' },
                  transactions: { $sum: 1 },
                  uniqueCustomers: { $addToSet: '$customer_id' },
                  profit: { $sum: '$profit_margin' },
                  avgTransactionValue: { $avg: '$total_amount' },
                  topPaymentMethods: {
                    $push: '$payment_method'
                  }
                }
              },
              {
                $addFields: {
                  uniqueCustomerCount: { $size: '$uniqueCustomers' },
                  region: '$_id',
                  profitMargin: {
                    $multiply: [{ $divide: ['$profit', '$revenue'] }, 100]
                  }
                }
              },
              {
                $sort: { revenue: -1 }
              }
            ],
            
            // Product category analysis with advanced metrics
            categoryAnalysis: [
              {
                $group: {
                  _id: {
                    category: '$product.category',
                    subcategory: '$product.subcategory'
                  },
                  revenue: { $sum: '$total_amount' },
                  transactions: { $sum: 1 },
                  totalUnits: { $sum: '$quantity' },
                  profit: { $sum: '$profit_margin' },
                  avgUnitPrice: { $avg: '$unit_price' },
                  uniqueProducts: { $addToSet: '$product_id' },
                  brands: { $addToSet: '$product.brand' }
                }
              },
              {
                $addFields: {
                  category: '$_id.category',
                  subcategory: '$_id.subcategory',
                  uniqueProductCount: { $size: '$uniqueProducts' },
                  uniqueBrandCount: { $size: '$brands' },
                  profitMargin: {
                    $multiply: [{ $divide: ['$profit', '$revenue'] }, 100]
                  },
                  revenuePerProduct: {
                    $divide: ['$revenue', { $size: '$uniqueProducts' }]
                  }
                }
              },
              {
                $sort: { revenue: -1 }
              }
            ],
            
            // Customer segment performance
            customerSegmentAnalysis: [
              {
                $group: {
                  _id: '$customer.customer_segment',
                  revenue: { $sum: '$total_amount' },
                  transactions: { $sum: 1 },
                  uniqueCustomers: { $addToSet: '$customer_id' },
                  profit: { $sum: '$profit_margin' },
                  avgTransactionValue: { $avg: '$total_amount' },
                  avgAge: { $avg: '$customer.age' },
                  genderDistribution: { $push: '$customer.gender' }
                }
              },
              {
                $addFields: {
                  segment: '$_id',
                  uniqueCustomerCount: { $size: '$uniqueCustomers' },
                  revenuePerCustomer: {
                    $divide: ['$revenue', { $size: '$uniqueCustomers' }]
                  },
                  transactionsPerCustomer: {
                    $divide: ['$transactions', { $size: '$uniqueCustomers' }]
                  }
                }
              },
              {
                $sort: { revenuePerCustomer: -1 }
              }
            ],
            
            // Payment method and channel analysis
            paymentChannelAnalysis: [
              {
                $group: {
                  _id: {
                    paymentMethod: '$payment_method',
                    salesChannel: '$sales_channel'
                  },
                  revenue: { $sum: '$total_amount' },
                  transactions: { $sum: 1 },
                  avgTransactionValue: { $avg: '$total_amount' },
                  profit: { $sum: '$profit_margin' }
                }
              },
              {
                $addFields: {
                  paymentMethod: '$_id.paymentMethod',
                  salesChannel: '$_id.salesChannel'
                }
              },
              {
                $sort: { revenue: -1 }
              }
            ],
            
            // Time-of-day and weekend analysis
            temporalAnalysis: [
              {
                $group: {
                  _id: {
                    timeOfDay: '$time_of_day',
                    isWeekend: '$is_weekend'
                  },
                  revenue: { $sum: '$total_amount' },
                  transactions: { $sum: 1 },
                  avgTransactionValue: { $avg: '$total_amount' },
                  uniqueCustomers: { $addToSet: '$customer_id' }
                }
              },
              {
                $addFields: {
                  timeOfDay: '$_id.timeOfDay',
                  isWeekend: '$_id.isWeekend',
                  uniqueCustomerCount: { $size: '$uniqueCustomers' }
                }
              },
              {
                $sort: { revenue: -1 }
              }
            ]
          }
        }
      ];
      
      // Execute the aggregation pipeline
      const dashboardResults = await this.collections.salesTransactions
        .aggregate(dashboardPipeline, {
          allowDiskUse: true,
          hint: { transaction_date: 1, region: 1 }
        })
        .toArray();
      
      // Process and enrich the results
      const enrichedResults = await this.enrichDashboardResults(dashboardResults[0], timeWindow);
      
      // Cache the results for performance
      await this.cacheDashboardResults(enrichedResults, timeWindow, filters);
      
      // Update dashboard metrics
      await this.updateDashboardMetrics(enrichedResults);
      
      return enrichedResults;
      
    } catch (error) {
      console.error('Error generating real-time sales dashboard:', error);
      throw error;
    }
  }

  async enrichDashboardResults(results, timeWindow) {
    console.log('Enriching dashboard results with advanced analytics...');
    
    try {
      const overallMetrics = results.overallMetrics[0] || {};
      
      // Calculate percentiles for transaction values
      if (overallMetrics.transactionValuePercentiles) {
        const sortedValues = overallMetrics.transactionValuePercentiles.sort((a, b) => a - b);
        const length = sortedValues.length;
        
        overallMetrics.percentiles = {
          p25: this.calculatePercentile(sortedValues, 25),
          p50: this.calculatePercentile(sortedValues, 50),
          p75: this.calculatePercentile(sortedValues, 75),
          p90: this.calculatePercentile(sortedValues, 90),
          p95: this.calculatePercentile(sortedValues, 95)
        };
        
        delete overallMetrics.transactionValuePercentiles; // Remove raw data
      }
      
      // Add growth calculations (comparing with previous period)
      const previousPeriodMetrics = await this.getPreviousPeriodMetrics(timeWindow);
      if (previousPeriodMetrics) {
        overallMetrics.growth = {
          revenueGrowth: this.calculateGrowthRate(overallMetrics.totalRevenue, previousPeriodMetrics.totalRevenue),
          transactionGrowth: this.calculateGrowthRate(overallMetrics.totalTransactions, previousPeriodMetrics.totalTransactions),
          customerGrowth: this.calculateGrowthRate(overallMetrics.uniqueCustomerCount, previousPeriodMetrics.uniqueCustomerCount),
          avgValueGrowth: this.calculateGrowthRate(overallMetrics.avgTransactionValue, previousPeriodMetrics.avgTransactionValue)
        };
      }
      
      // Add revenue distribution analysis
      if (results.regionalPerformance) {
        const totalRevenue = overallMetrics.totalRevenue || 0;
        results.regionalPerformance = results.regionalPerformance.map(region => ({
          ...region,
          revenueShare: (region.revenue / totalRevenue * 100).toFixed(2),
          customerDensity: (region.uniqueCustomerCount / region.transactions * 100).toFixed(2)
        }));
      }
      
      // Add category performance rankings
      if (results.categoryAnalysis) {
        results.categoryAnalysis = results.categoryAnalysis.map((category, index) => ({
          ...category,
          rank: index + 1,
          performanceScore: this.calculateCategoryPerformanceScore(category)
        }));
      }
      
      // Add temporal insights
      if (results.temporalAnalysis) {
        results.temporalAnalysis = results.temporalAnalysis.map(period => ({
          ...period,
          efficiency: (period.revenue / period.transactions).toFixed(2),
          customerEngagement: (period.uniqueCustomerCount / period.transactions * 100).toFixed(2)
        }));
      }
      
      // Add dashboard metadata
      const enrichedResults = {
        ...results,
        metadata: {
          timeWindow: timeWindow,
          generatedAt: new Date(),
          dataFreshness: this.calculateDataFreshness(),
          performanceMetrics: {
            queryExecutionTime: Date.now() - this.queryStartTime,
            dataPoints: overallMetrics.totalTransactions,
            cacheStatus: 'fresh'
          }
        },
        overallMetrics: overallMetrics
      };
      
      return enrichedResults;
      
    } catch (error) {
      console.error('Error enriching dashboard results:', error);
      throw error;
    }
  }

  calculatePercentile(sortedArray, percentile) {
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    return (sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight).toFixed(2);
  }

  calculateGrowthRate(current, previous) {
    if (!previous || previous === 0) return null;
    return (((current - previous) / previous) * 100).toFixed(2);
  }

  calculateCategoryPerformanceScore(category) {
    // Weighted scoring based on revenue, profit margin, and transaction volume
    const revenueScore = Math.min(category.revenue / 10000, 100); // Scale revenue
    const profitScore = Math.max(0, Math.min(category.profitMargin || 0, 100));
    const volumeScore = Math.min(category.transactions / 100, 100);
    
    return ((revenueScore * 0.5) + (profitScore * 0.3) + (volumeScore * 0.2)).toFixed(2);
  }

  buildDynamicFilters(filters) {
    const mongoFilters = {};
    
    if (filters.regions && filters.regions.length > 0) {
      mongoFilters.region = { $in: filters.regions };
    }
    
    if (filters.categories && filters.categories.length > 0) {
      mongoFilters.product_category = { $in: filters.categories };
    }
    
    if (filters.paymentMethods && filters.paymentMethods.length > 0) {
      mongoFilters.payment_method = { $in: filters.paymentMethods };
    }
    
    if (filters.minAmount || filters.maxAmount) {
      mongoFilters.total_amount = {};
      if (filters.minAmount) mongoFilters.total_amount.$gte = filters.minAmount;
      if (filters.maxAmount) mongoFilters.total_amount.$lte = filters.maxAmount;
    }
    
    return mongoFilters;
  }

  calculateTimeRange(timeWindow) {
    const endDate = new Date();
    let startDate = new Date();
    
    switch (timeWindow) {
      case '1h':
        startDate.setHours(endDate.getHours() - 1);
        break;
      case '6h':
        startDate.setHours(endDate.getHours() - 6);
        break;
      case '24h':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      default:
        startDate.setDate(endDate.getDate() - 1);
    }
    
    return { startDate, endDate };
  }

  async generateCustomerLifetimeValueAnalysis() {
    console.log('Generating advanced customer lifetime value analysis...');
    
    try {
      const clvAnalysisPipeline = [
        // Stage 1: Join transactions with customer data
        {
          $lookup: {
            from: 'customers',
            localField: 'customer_id',
            foreignField: '_id',
            as: 'customer'
          }
        },
        
        // Stage 2: Flatten customer data
        {
          $addFields: {
            customer: { $arrayElemAt: ['$customer', 0] }
          }
        },
        
        // Stage 3: Calculate customer metrics
        {
          $group: {
            _id: '$customer_id',
            customerInfo: { $first: '$customer' },
            firstPurchase: { $min: '$transaction_date' },
            lastPurchase: { $max: '$transaction_date' },
            totalRevenue: { $sum: '$total_amount' },
            totalProfit: { 
              $sum: { 
                $multiply: [
                  { $subtract: ['$unit_price', { $ifNull: ['$unit_cost', 0] }] },
                  '$quantity'
                ]
              }
            },
            totalTransactions: { $sum: 1 },
            totalUnits: { $sum: '$quantity' },
            avgOrderValue: { $avg: '$total_amount' },
            purchaseFrequency: { $sum: 1 },
            categories: { $addToSet: '$product_category' },
            paymentMethods: { $push: '$payment_method' },
            channels: { $addToSet: '$sales_channel' }
          }
        },
        
        // Stage 4: Calculate advanced CLV metrics
        {
          $addFields: {
            customerLifespanDays: {
              $divide: [
                { $subtract: ['$lastPurchase', '$firstPurchase'] },
                1000 * 60 * 60 * 24
              ]
            },
            avgDaysBetweenPurchases: {
              $cond: {
                if: { $gt: ['$totalTransactions', 1] },
                then: {
                  $divide: [
                    { $divide: [
                      { $subtract: ['$lastPurchase', '$firstPurchase'] },
                      1000 * 60 * 60 * 24
                    ]},
                    { $subtract: ['$totalTransactions', 1] }
                  ]
                },
                else: null
              }
            },
            categoryDiversity: { $size: '$categories' },
            channelDiversity: { $size: '$channels' },
            profitMargin: {
              $multiply: [
                { $divide: ['$totalProfit', '$totalRevenue'] },
                100
              ]
            }
          }
        },
        
        // Stage 5: Calculate predicted CLV (simplified model)
        {
          $addFields: {
            predictedMonthlyValue: {
              $cond: {
                if: { $and: [
                  { $gt: ['$avgDaysBetweenPurchases', 0] },
                  { $lte: ['$avgDaysBetweenPurchases', 365] }
                ]},
                then: {
                  $multiply: [
                    '$avgOrderValue',
                    { $divide: [30, '$avgDaysBetweenPurchases'] }
                  ]
                },
                else: 0
              }
            },
            predictedAnnualValue: {
              $cond: {
                if: { $and: [
                  { $gt: ['$avgDaysBetweenPurchases', 0] },
                  { $lte: ['$avgDaysBetweenPurchases', 365] }
                ]},
                then: {
                  $multiply: [
                    '$avgOrderValue',
                    { $divide: [365, '$avgDaysBetweenPurchases'] }
                  ]
                },
                else: '$totalRevenue'
              }
            }
          }
        },
        
        // Stage 6: Customer segmentation
        {
          $addFields: {
            valueSegment: {
              $switch: {
                branches: [
                  { case: { $gte: ['$totalRevenue', 5000] }, then: 'high_value' },
                  { case: { $gte: ['$totalRevenue', 1000] }, then: 'medium_value' },
                  { case: { $gte: ['$totalRevenue', 100] }, then: 'low_value' }
                ],
                default: 'minimal_value'
              }
            },
            frequencySegment: {
              $switch: {
                branches: [
                  { case: { $gte: ['$totalTransactions', 20] }, then: 'very_frequent' },
                  { case: { $gte: ['$totalTransactions', 10] }, then: 'frequent' },
                  { case: { $gte: ['$totalTransactions', 5] }, then: 'occasional' }
                ],
                default: 'rare'
              }
            },
            recencySegment: {
              $switch: {
                branches: [
                  { 
                    case: { 
                      $gte: [
                        '$lastPurchase',
                        { $subtract: [new Date(), 30 * 24 * 60 * 60 * 1000] }
                      ]
                    },
                    then: 'recent'
                  },
                  {
                    case: {
                      $gte: [
                        '$lastPurchase',
                        { $subtract: [new Date(), 90 * 24 * 60 * 60 * 1000] }
                      ]
                    },
                    then: 'moderate'
                  }
                ],
                default: 'dormant'
              }
            }
          }
        },
        
        // Stage 7: Final CLV calculation and risk assessment
        {
          $addFields: {
            rfmScore: {
              $add: [
                {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$recencySegment', 'recent'] }, then: 4 },
                      { case: { $eq: ['$recencySegment', 'moderate'] }, then: 2 }
                    ],
                    default: 1
                  }
                },
                {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$frequencySegment', 'very_frequent'] }, then: 4 },
                      { case: { $eq: ['$frequencySegment', 'frequent'] }, then: 3 },
                      { case: { $eq: ['$frequencySegment', 'occasional'] }, then: 2 }
                    ],
                    default: 1
                  }
                },
                {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$valueSegment', 'high_value'] }, then: 4 },
                      { case: { $eq: ['$valueSegment', 'medium_value'] }, then: 3 },
                      { case: { $eq: ['$valueSegment', 'low_value'] }, then: 2 }
                    ],
                    default: 1
                  }
                }
              ]
            },
            churnRisk: {
              $switch: {
                branches: [
                  {
                    case: {
                      $and: [
                        { $eq: ['$recencySegment', 'dormant'] },
                        { $lt: ['$avgDaysBetweenPurchases', 60] }
                      ]
                    },
                    then: 'high'
                  },
                  {
                    case: {
                      $and: [
                        { $eq: ['$recencySegment', 'moderate'] },
                        { $gt: ['$avgDaysBetweenPurchases', 30] }
                      ]
                    },
                    then: 'medium'
                  }
                ],
                default: 'low'
              }
            }
          }
        },
        
        // Stage 8: Sort by predicted annual value
        {
          $sort: { predictedAnnualValue: -1, totalRevenue: -1 }
        }
      ];
      
      const clvResults = await this.collections.salesTransactions
        .aggregate(clvAnalysisPipeline, { allowDiskUse: true })
        .toArray();
      
      return {
        customerAnalysis: clvResults,
        summary: await this.generateCLVSummary(clvResults),
        generatedAt: new Date()
      };
      
    } catch (error) {
      console.error('Error generating CLV analysis:', error);
      throw error;
    }
  }

  async generateCLVSummary(clvResults) {
    const totalCustomers = clvResults.length;
    const totalValue = clvResults.reduce((sum, customer) => sum + customer.totalRevenue, 0);
    const totalPredictedValue = clvResults.reduce((sum, customer) => sum + (customer.predictedAnnualValue || 0), 0);
    
    return {
      totalCustomers,
      totalHistoricalValue: totalValue,
      totalPredictedAnnualValue: totalPredictedValue,
      averageCustomerValue: totalValue / totalCustomers,
      averagePredictedValue: totalPredictedValue / totalCustomers,
      segmentBreakdown: {
        highValue: clvResults.filter(c => c.valueSegment === 'high_value').length,
        mediumValue: clvResults.filter(c => c.valueSegment === 'medium_value').length,
        lowValue: clvResults.filter(c => c.valueSegment === 'low_value').length,
        minimalValue: clvResults.filter(c => c.valueSegment === 'minimal_value').length
      },
      churnRiskDistribution: {
        high: clvResults.filter(c => c.churnRisk === 'high').length,
        medium: clvResults.filter(c => c.churnRisk === 'medium').length,
        low: clvResults.filter(c => c.churnRisk === 'low').length
      },
      topPerformers: clvResults.slice(0, 10).map(customer => ({
        customerId: customer._id,
        totalRevenue: customer.totalRevenue,
        predictedAnnualValue: customer.predictedAnnualValue,
        rfmScore: customer.rfmScore,
        segment: customer.valueSegment
      }))
    };
  }

  async cacheDashboardResults(results, timeWindow, filters) {
    try {
      const cacheKey = `dashboard_${timeWindow}_${JSON.stringify(filters)}`;
      
      await this.collections.analyticsCache.replaceOne(
        { cacheKey },
        {
          cacheKey,
          results,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + this.config.cacheExpiration)
        },
        { upsert: true }
      );
    } catch (error) {
      console.warn('Error caching dashboard results:', error.message);
    }
  }

  async getPreviousPeriodMetrics(timeWindow) {
    try {
      // Calculate previous period time range
      const previousTimeRange = this.calculatePreviousPeriodRange(timeWindow);
      
      const previousMetrics = await this.collections.salesTransactions.aggregate([
        {
          $match: {
            transaction_date: {
              $gte: previousTimeRange.startDate,
              $lte: previousTimeRange.endDate
            }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total_amount' },
            totalTransactions: { $sum: 1 },
            uniqueCustomers: { $addToSet: '$customer_id' },
            avgTransactionValue: { $avg: '$total_amount' }
          }
        },
        {
          $addFields: {
            uniqueCustomerCount: { $size: '$uniqueCustomers' }
          }
        }
      ]).toArray();
      
      return previousMetrics[0] || null;
      
    } catch (error) {
      console.warn('Error getting previous period metrics:', error.message);
      return null;
    }
  }

  calculatePreviousPeriodRange(timeWindow) {
    const currentEndDate = new Date();
    let currentStartDate = new Date();
    
    // Calculate current period duration
    switch (timeWindow) {
      case '1h':
        currentStartDate.setHours(currentEndDate.getHours() - 1);
        break;
      case '6h':
        currentStartDate.setHours(currentEndDate.getHours() - 6);
        break;
      case '24h':
        currentStartDate.setDate(currentEndDate.getDate() - 1);
        break;
      case '7d':
        currentStartDate.setDate(currentEndDate.getDate() - 7);
        break;
      case '30d':
        currentStartDate.setDate(currentEndDate.getDate() - 30);
        break;
      default:
        currentStartDate.setDate(currentEndDate.getDate() - 1);
    }
    
    // Calculate previous period (same duration, preceding the current period)
    const periodDuration = currentEndDate.getTime() - currentStartDate.getTime();
    const previousEndDate = new Date(currentStartDate.getTime());
    const previousStartDate = new Date(currentStartDate.getTime() - periodDuration);
    
    return { startDate: previousStartDate, endDate: previousEndDate };
  }

  calculateDataFreshness() {
    // Calculate how fresh the data is based on the latest transaction
    const now = new Date();
    // This would typically query for the latest transaction timestamp
    // For demo purposes, assuming data is fresh within the last 5 minutes
    return 'fresh'; // 'fresh', 'stale', 'outdated'
  }

  async updateDashboardMetrics(results) {
    try {
      await this.collections.dashboardMetrics.insertOne({
        timestamp: new Date(),
        metrics: {
          totalRevenue: results.overallMetrics?.totalRevenue || 0,
          totalTransactions: results.overallMetrics?.totalTransactions || 0,
          uniqueCustomers: results.overallMetrics?.uniqueCustomerCount || 0,
          avgTransactionValue: results.overallMetrics?.avgTransactionValue || 0
        },
        performance: results.metadata?.performanceMetrics || {}
      });
      
      // Cleanup old metrics (keep last 1000 entries)
      const totalCount = await this.collections.dashboardMetrics.countDocuments();
      if (totalCount > 1000) {
        const oldestRecords = await this.collections.dashboardMetrics
          .find()
          .sort({ timestamp: 1 })
          .limit(totalCount - 1000)
          .toArray();
        
        const idsToDelete = oldestRecords.map(record => record._id);
        await this.collections.dashboardMetrics.deleteMany({
          _id: { $in: idsToDelete }
        });
      }
    } catch (error) {
      console.warn('Error updating dashboard metrics:', error.message);
    }
  }

  async setupRealTimeProcessing() {
    if (!this.config.enableRealTimeUpdates) return;
    
    console.log('Setting up real-time dashboard processing...');
    
    // Setup interval for dashboard updates
    setInterval(async () => {
      try {
        // Generate fresh dashboard data
        const dashboardData = await this.generateRealtimeSalesDashboard('1h');
        
        // Emit real-time updates (in a real implementation, this would push to connected clients)
        this.emit('dashboardUpdate', {
          timestamp: new Date(),
          data: dashboardData
        });
        
        this.dashboardState.lastUpdate = new Date();
        
      } catch (error) {
        console.error('Error in real-time processing:', error);
      }
    }, this.config.updateInterval);
  }

  async setupAnalyticsCache() {
    console.log('Setting up analytics caching layer...');
    
    try {
      // Create TTL index for cache expiration
      await this.collections.analyticsCache.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, background: true }
      );
      
      console.log('Analytics cache configured successfully');
      
    } catch (error) {
      console.error('Error setting up analytics cache:', error);
      throw error;
    }
  }

  async setupPerformanceMonitoring() {
    console.log('Setting up performance monitoring...');
    
    setInterval(async () => {
      try {
        // Monitor query performance
        const queryStats = await this.db.stats();
        
        // Update processing statistics
        this.dashboardState.processingStats.totalQueries++;
        
        // Log performance metrics
        console.log('Dashboard performance metrics:', {
          activeConnections: this.dashboardState.activeConnections,
          avgResponseTime: this.dashboardState.processingStats.avgResponseTime,
          cacheHitRate: this.dashboardState.processingStats.cacheHitRate,
          dbStats: {
            collections: queryStats.collections,
            dataSize: queryStats.dataSize,
            indexSize: queryStats.indexSize
          }
        });
        
      } catch (error) {
        console.warn('Error in performance monitoring:', error);
      }
    }, 60000); // Every minute
  }
}

// Benefits of MongoDB Advanced Real-Time Analytics:
// - Real-time dashboard updates with minimal latency through change streams integration
// - Complex multi-dimensional aggregations with advanced statistical calculations
// - Flexible data transformation and enrichment during query execution
// - Sophisticated customer segmentation and lifetime value analysis
// - Built-in performance optimization with intelligent caching strategies
// - Scalable architecture supporting high-volume analytics workloads
// - Native MongoDB aggregation framework providing SQL-compatible analytics
// - Advanced temporal analysis with time-series data processing capabilities
// - Comprehensive business intelligence with predictive analytics support
// - SQL-familiar analytics operations through QueryLeaf integration

module.exports = {
  RealtimeAnalyticsDashboard
};
```

## Understanding MongoDB Analytics Architecture

### Advanced Aggregation Pipeline Design and Performance Optimization

Implement sophisticated analytics patterns for production MongoDB deployments:

```javascript
// Production-ready MongoDB analytics with enterprise-grade optimization
class EnterpriseAnalyticsPlatform extends RealtimeAnalyticsDashboard {
  constructor(db, enterpriseConfig) {
    super(db, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      enableDistributedAnalytics: true,
      enableMachineLearning: true,
      enablePredictiveModeling: true,
      enableDataGovernance: true,
      enableComplianceReporting: true,
      enableAdvancedVisualization: true
    };
    
    this.setupEnterpriseFeatures();
    this.initializeMLPipelines();
    this.setupDataGovernance();
  }

  async implementAdvancedTimeSeriesAnalytics() {
    console.log('Implementing advanced time series analytics with forecasting...');
    
    const timeSeriesConfig = {
      // Time series aggregation strategies
      temporalAggregation: {
        enableSeasonalityDetection: true,
        enableTrendAnalysis: true,
        enableAnomalyDetection: true,
        forecastHorizon: 30 // days
      },
      
      // Statistical modeling
      statisticalModeling: {
        enableMovingAverages: true,
        enableExponentialSmoothing: true,
        enableRegressionAnalysis: true,
        confidenceIntervals: true
      },
      
      // Performance optimization
      performanceOptimization: {
        enableTimeSeriesCollections: true,
        optimizedIndexes: true,
        compressionStrategies: true,
        partitioningSchemes: true
      }
    };

    return await this.deployTimeSeriesAnalytics(timeSeriesConfig);
  }

  async setupAdvancedMLPipelines() {
    console.log('Setting up machine learning pipelines for predictive analytics...');
    
    const mlPipelineConfig = {
      // Customer behavior prediction
      customerBehaviorML: {
        churnPredictionModel: true,
        clvPredictionModel: true,
        recommendationEngine: true,
        segmentationOptimization: true
      },
      
      // Sales forecasting
      salesForecastingML: {
        demandForecasting: true,
        inventoryOptimization: true,
        priceOptimization: true,
        seasonalityModeling: true
      },
      
      // Real-time decision making
      realTimeDecisionEngine: {
        dynamicPricing: true,
        inventoryAlerts: true,
        customerTargeting: true,
        fraudDetection: true
      }
    };

    return await this.implementMLPipelines(mlPipelineConfig);
  }
}
```

## SQL-Style Analytics with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB analytics and dashboard operations:

```sql
-- QueryLeaf advanced real-time analytics with SQL-familiar syntax for MongoDB

-- Configure comprehensive analytics dashboard with real-time updates
CONFIGURE ANALYTICS_DASHBOARD
SET real_time_updates = true,
    update_interval_seconds = 30,
    cache_expiration_minutes = 5,
    enable_predictive_analytics = true,
    enable_advanced_metrics = true,
    enable_cohort_analysis = true,
    time_windows = ['1h', '6h', '24h', '7d', '30d'],
    dimensions = ['region', 'category', 'channel', 'segment'];

-- Advanced real-time sales dashboard with comprehensive metrics and analytics
WITH sales_analytics AS (
  -- Primary transaction data with enriched customer and product information
  SELECT 
    st.transaction_id,
    st.transaction_date,
    st.customer_id,
    st.product_id,
    st.total_amount,
    st.quantity,
    st.unit_price,
    st.discount_amount,
    st.tax_amount,
    st.payment_method,
    st.sales_channel,
    st.region,
    
    -- Customer enrichment
    c.customer_segment,
    c.age,
    c.gender,
    c.city,
    c.state,
    c.registration_date,
    c.lifetime_value,
    
    -- Product enrichment
    p.category,
    p.subcategory,
    p.brand,
    p.unit_cost,
    p.list_price,
    p.margin_percent,
    
    -- Calculated fields for analytics
    (st.unit_price - p.unit_cost) * st.quantity as profit_margin,
    st.total_amount - st.discount_amount - st.tax_amount as net_revenue,
    
    -- Time-based dimensions
    DATE_TRUNC('hour', st.transaction_date) as transaction_hour,
    DATE_TRUNC('day', st.transaction_date) as transaction_day,
    EXTRACT(hour FROM st.transaction_date) as hour_of_day,
    EXTRACT(dow FROM st.transaction_date) as day_of_week,
    EXTRACT(dow FROM st.transaction_date) IN (0, 6) as is_weekend,
    
    -- Time categorization
    CASE 
      WHEN EXTRACT(hour FROM st.transaction_date) BETWEEN 6 AND 11 THEN 'morning'
      WHEN EXTRACT(hour FROM st.transaction_date) BETWEEN 12 AND 17 THEN 'afternoon'  
      WHEN EXTRACT(hour FROM st.transaction_date) BETWEEN 18 AND 21 THEN 'evening'
      ELSE 'night'
    END as time_of_day_category,
    
    -- Customer lifecycle stage
    CASE 
      WHEN st.transaction_date - c.registration_date <= INTERVAL '30 days' THEN 'new_customer'
      WHEN st.transaction_date - c.registration_date <= INTERVAL '365 days' THEN 'established_customer'
      ELSE 'loyal_customer'
    END as customer_lifecycle_stage
    
  FROM sales_transactions st
  JOIN customers c ON st.customer_id = c.customer_id
  JOIN products p ON st.product_id = p.product_id
  WHERE st.transaction_date >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
),

-- Overall metrics with advanced statistical calculations
overall_metrics AS (
  SELECT 
    -- Basic volume metrics
    COUNT(*) as total_transactions,
    COUNT(DISTINCT customer_id) as unique_customers,
    SUM(total_amount) as total_revenue,
    SUM(net_revenue) as total_net_revenue,
    SUM(quantity) as total_units_sold,
    SUM(profit_margin) as total_profit,
    SUM(discount_amount) as total_discounts,
    SUM(tax_amount) as total_tax,
    
    -- Advanced statistical metrics
    AVG(total_amount) as avg_transaction_value,
    STDDEV(total_amount) as transaction_value_stddev,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_amount) as q1_transaction_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_amount) as median_transaction_value,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_amount) as q3_transaction_value,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_amount) as p90_transaction_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_amount) as p95_transaction_value,
    
    -- Derived metrics
    AVG(quantity) as avg_order_size,
    AVG(profit_margin) as avg_profit_per_transaction,
    AVG(total_amount / NULLIF(quantity, 0)) as avg_price_per_unit,
    
    -- Efficiency metrics
    SUM(total_revenue) / COUNT(DISTINCT customer_id) as revenue_per_customer,
    COUNT(*) / COUNT(DISTINCT customer_id) as transactions_per_customer,
    SUM(profit_margin) / SUM(total_revenue) * 100 as overall_profit_margin_percent,
    SUM(discount_amount) / SUM(total_revenue) * 100 as overall_discount_rate_percent,
    
    -- Time-based metrics
    MIN(transaction_date) as earliest_transaction,
    MAX(transaction_date) as latest_transaction,
    COUNT(DISTINCT transaction_hour) as active_hours,
    COUNT(DISTINCT transaction_day) as active_days
    
  FROM sales_analytics
),

-- Temporal trend analysis with pattern detection
temporal_trends AS (
  SELECT 
    transaction_hour,
    
    -- Hourly volume metrics
    COUNT(*) as hourly_transactions,
    COUNT(DISTINCT customer_id) as hourly_unique_customers,
    SUM(total_amount) as hourly_revenue,
    SUM(profit_margin) as hourly_profit,
    AVG(total_amount) as hourly_avg_transaction_value,
    SUM(quantity) as hourly_units_sold,
    
    -- Hour-over-hour growth calculations
    LAG(SUM(total_amount)) OVER (ORDER BY transaction_hour) as prev_hour_revenue,
    LAG(COUNT(*)) OVER (ORDER BY transaction_hour) as prev_hour_transactions,
    
    -- Moving averages for trend smoothing
    AVG(SUM(total_amount)) OVER (
      ORDER BY transaction_hour 
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) as revenue_3h_moving_avg,
    
    AVG(COUNT(*)) OVER (
      ORDER BY transaction_hour 
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW  
    ) as transactions_3h_moving_avg,
    
    -- Peak detection
    RANK() OVER (ORDER BY SUM(total_amount) DESC) as revenue_rank,
    RANK() OVER (ORDER BY COUNT(*) DESC) as transaction_rank,
    
    -- Performance classification
    CASE 
      WHEN SUM(total_amount) > AVG(SUM(total_amount)) OVER () * 1.5 THEN 'peak'
      WHEN SUM(total_amount) > AVG(SUM(total_amount)) OVER () THEN 'above_average'
      WHEN SUM(total_amount) > AVG(SUM(total_amount)) OVER () * 0.5 THEN 'below_average'
      ELSE 'low'
    END as performance_tier
    
  FROM sales_analytics
  GROUP BY transaction_hour
  ORDER BY transaction_hour
),

-- Regional performance analysis with competitive ranking
regional_performance AS (
  SELECT 
    region,
    
    -- Regional volume metrics
    COUNT(*) as region_transactions,
    COUNT(DISTINCT customer_id) as region_unique_customers,
    COUNT(DISTINCT product_id) as region_unique_products,
    SUM(total_amount) as region_revenue,
    SUM(profit_margin) as region_profit,
    SUM(quantity) as region_units_sold,
    
    -- Regional efficiency metrics
    AVG(total_amount) as region_avg_transaction_value,
    SUM(total_amount) / COUNT(DISTINCT customer_id) as region_revenue_per_customer,
    COUNT(*) / COUNT(DISTINCT customer_id) as region_frequency_per_customer,
    SUM(profit_margin) / SUM(total_amount) * 100 as region_profit_margin_percent,
    
    -- Market share calculations
    SUM(total_amount) / SUM(SUM(total_amount)) OVER () * 100 as region_revenue_share,
    COUNT(*) / SUM(COUNT(*)) OVER () * 100 as region_transaction_share,
    COUNT(DISTINCT customer_id) / SUM(COUNT(DISTINCT customer_id)) OVER () * 100 as region_customer_share,
    
    -- Regional ranking
    RANK() OVER (ORDER BY SUM(total_amount) DESC) as revenue_rank,
    RANK() OVER (ORDER BY SUM(profit_margin) DESC) as profit_rank,
    RANK() OVER (ORDER BY COUNT(DISTINCT customer_id) DESC) as customer_base_rank,
    
    -- Customer density and engagement
    COUNT(DISTINCT customer_id) / COUNT(*) * 100 as customer_density_percent,
    AVG(
      CASE WHEN customer_lifecycle_stage = 'new_customer' THEN 1 ELSE 0 END
    ) * 100 as new_customer_percent,
    
    -- Channel and payment preferences
    MODE() WITHIN GROUP (ORDER BY sales_channel) as dominant_sales_channel,
    MODE() WITHIN GROUP (ORDER BY payment_method) as dominant_payment_method,
    
    -- Performance indicators
    CASE 
      WHEN SUM(total_amount) / SUM(SUM(total_amount)) OVER () > 0.2 THEN 'market_leader'
      WHEN SUM(total_amount) / SUM(SUM(total_amount)) OVER () > 0.1 THEN 'major_market'
      WHEN SUM(total_amount) / SUM(SUM(total_amount)) OVER () > 0.05 THEN 'secondary_market'
      ELSE 'emerging_market'
    END as market_position
    
  FROM sales_analytics
  GROUP BY region
),

-- Advanced product category analysis with profitability insights
category_analysis AS (
  SELECT 
    category,
    subcategory,
    brand,
    
    -- Category performance metrics
    COUNT(*) as category_transactions,
    COUNT(DISTINCT customer_id) as category_customers,
    COUNT(DISTINCT product_id) as category_products,
    SUM(total_amount) as category_revenue,
    SUM(profit_margin) as category_profit,
    SUM(quantity) as category_units,
    
    -- Category efficiency and profitability
    AVG(total_amount) as category_avg_transaction_value,
    AVG(profit_margin) as category_avg_profit_per_transaction,
    SUM(profit_margin) / SUM(total_amount) * 100 as category_profit_margin_percent,
    AVG(unit_price) as category_avg_unit_price,
    AVG(margin_percent) as category_avg_product_margin,
    
    -- Market positioning
    SUM(total_amount) / SUM(SUM(total_amount)) OVER () * 100 as category_revenue_share,
    COUNT(*) / SUM(COUNT(*)) OVER () * 100 as category_transaction_share,
    
    -- Category rankings
    RANK() OVER (ORDER BY SUM(total_amount) DESC) as revenue_rank,
    RANK() OVER (ORDER BY SUM(profit_margin) DESC) as profit_rank,
    RANK() OVER (ORDER BY COUNT(*) DESC) as volume_rank,
    RANK() OVER (ORDER BY SUM(profit_margin) / SUM(total_amount) DESC) as margin_rank,
    
    -- Customer engagement
    COUNT(DISTINCT customer_id) / COUNT(*) * 100 as customer_diversity_percent,
    SUM(total_amount) / COUNT(DISTINCT customer_id) as revenue_per_customer,
    COUNT(*) / COUNT(DISTINCT customer_id) as repeat_purchase_rate,
    
    -- Product performance distribution
    AVG(list_price) as category_avg_list_price,
    AVG(unit_cost) as category_avg_unit_cost,
    STDDEV(unit_price) as category_price_variance,
    
    -- Growth and trend indicators
    SUM(total_amount) FILTER (WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '6 hours') as recent_6h_revenue,
    SUM(total_amount) FILTER (WHERE transaction_date < CURRENT_TIMESTAMP - INTERVAL '6 hours') as earlier_18h_revenue,
    
    -- Performance classification
    CASE 
      WHEN SUM(profit_margin) / SUM(total_amount) > 0.3 THEN 'high_margin'
      WHEN SUM(profit_margin) / SUM(total_amount) > 0.15 THEN 'medium_margin'
      ELSE 'low_margin'
    END as profitability_tier,
    
    CASE 
      WHEN SUM(total_amount) / SUM(SUM(total_amount)) OVER () > 0.15 THEN 'star_category'
      WHEN SUM(total_amount) / SUM(SUM(total_amount)) OVER () > 0.05 THEN 'growth_category'
      ELSE 'niche_category'
    END as strategic_category
    
  FROM sales_analytics
  GROUP BY category, subcategory, brand
),

-- Customer segmentation analysis with behavioral insights
customer_segment_analysis AS (
  SELECT 
    customer_segment,
    customer_lifecycle_stage,
    
    -- Segment volume metrics
    COUNT(*) as segment_transactions,
    COUNT(DISTINCT customer_id) as segment_customers,
    SUM(total_amount) as segment_revenue,
    SUM(profit_margin) as segment_profit,
    SUM(quantity) as segment_units,
    
    -- Segment behavior analysis
    AVG(total_amount) as segment_avg_transaction_value,
    SUM(total_amount) / COUNT(DISTINCT customer_id) as segment_revenue_per_customer,
    COUNT(*) / COUNT(DISTINCT customer_id) as segment_transactions_per_customer,
    AVG(age) as segment_avg_age,
    
    -- Demographic breakdown
    AVG(CASE WHEN gender = 'male' THEN 1 ELSE 0 END) * 100 as male_percentage,
    AVG(CASE WHEN gender = 'female' THEN 1 ELSE 0 END) * 100 as female_percentage,
    COUNT(DISTINCT city) as cities_represented,
    COUNT(DISTINCT state) as states_represented,
    
    -- Channel preferences  
    AVG(CASE WHEN sales_channel = 'online' THEN 1 ELSE 0 END) * 100 as online_preference_percent,
    AVG(CASE WHEN sales_channel = 'retail' THEN 1 ELSE 0 END) * 100 as retail_preference_percent,
    AVG(CASE WHEN sales_channel = 'mobile' THEN 1 ELSE 0 END) * 100 as mobile_preference_percent,
    
    -- Payment behavior
    AVG(CASE WHEN payment_method = 'credit_card' THEN 1 ELSE 0 END) * 100 as credit_card_usage_percent,
    AVG(CASE WHEN payment_method = 'digital_wallet' THEN 1 ELSE 0 END) * 100 as digital_wallet_usage_percent,
    
    -- Temporal behavior
    AVG(CASE WHEN is_weekend THEN 1 ELSE 0 END) * 100 as weekend_shopping_percent,
    MODE() WITHIN GROUP (ORDER BY time_of_day_category) as preferred_shopping_time,
    
    -- Value and profitability
    SUM(profit_margin) / SUM(total_amount) * 100 as segment_profit_margin_percent,
    AVG(lifetime_value) as segment_avg_lifetime_value,
    
    -- Segment rankings
    RANK() OVER (ORDER BY SUM(total_amount) DESC) as revenue_rank,
    RANK() OVER (ORDER BY SUM(total_amount) / COUNT(DISTINCT customer_id) DESC) as value_per_customer_rank,
    RANK() OVER (ORDER BY COUNT(*) / COUNT(DISTINCT customer_id) DESC) as engagement_rank,
    
    -- Segment classification
    CASE 
      WHEN SUM(total_amount) / COUNT(DISTINCT customer_id) > 1000 THEN 'high_value_segment'
      WHEN SUM(total_amount) / COUNT(DISTINCT customer_id) > 500 THEN 'medium_value_segment'
      ELSE 'opportunity_segment'
    END as value_classification
    
  FROM sales_analytics
  GROUP BY customer_segment, customer_lifecycle_stage
),

-- Payment method and channel effectiveness analysis  
channel_payment_analysis AS (
  SELECT 
    sales_channel,
    payment_method,
    
    -- Channel-payment combination metrics
    COUNT(*) as combination_transactions,
    SUM(total_amount) as combination_revenue,
    AVG(total_amount) as combination_avg_value,
    SUM(profit_margin) as combination_profit,
    COUNT(DISTINCT customer_id) as combination_customers,
    
    -- Effectiveness metrics
    SUM(total_amount) / COUNT(DISTINCT customer_id) as revenue_per_customer,
    COUNT(*) / COUNT(DISTINCT customer_id) as transactions_per_customer,
    SUM(profit_margin) / SUM(total_amount) * 100 as combination_profit_margin,
    
    -- Market share within channel
    SUM(total_amount) / SUM(SUM(total_amount)) OVER (PARTITION BY sales_channel) * 100 as payment_share_in_channel,
    
    -- Market share within payment method
    SUM(total_amount) / SUM(SUM(total_amount)) OVER (PARTITION BY payment_method) * 100 as channel_share_in_payment,
    
    -- Overall market share
    SUM(total_amount) / SUM(SUM(total_amount)) OVER () * 100 as overall_market_share,
    
    -- Customer behavior insights
    AVG(age) as combination_avg_customer_age,
    AVG(CASE WHEN customer_segment = 'premium' THEN 1 ELSE 0 END) * 100 as premium_customer_percent,
    AVG(CASE WHEN is_weekend THEN 1 ELSE 0 END) * 100 as weekend_usage_percent,
    
    -- Performance ranking
    RANK() OVER (ORDER BY SUM(total_amount) DESC) as revenue_rank,
    RANK() OVER (ORDER BY COUNT(*) DESC) as volume_rank,
    RANK() OVER (ORDER BY SUM(profit_margin) / SUM(total_amount) DESC) as profitability_rank
    
  FROM sales_analytics  
  GROUP BY sales_channel, payment_method
),

-- Advanced growth and trend analysis
growth_trend_analysis AS (
  SELECT 
    -- Current period metrics (last 6 hours)
    SUM(total_amount) FILTER (WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '6 hours') as current_6h_revenue,
    COUNT(*) FILTER (WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '6 hours') as current_6h_transactions,
    COUNT(DISTINCT customer_id) FILTER (WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '6 hours') as current_6h_customers,
    
    -- Previous period metrics (6-12 hours ago)
    SUM(total_amount) FILTER (
      WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '12 hours' 
      AND transaction_date < CURRENT_TIMESTAMP - INTERVAL '6 hours'
    ) as previous_6h_revenue,
    COUNT(*) FILTER (
      WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '12 hours' 
      AND transaction_date < CURRENT_TIMESTAMP - INTERVAL '6 hours'
    ) as previous_6h_transactions,
    COUNT(DISTINCT customer_id) FILTER (
      WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '12 hours' 
      AND transaction_date < CURRENT_TIMESTAMP - INTERVAL '6 hours'
    ) as previous_6h_customers,
    
    -- Earlier period metrics (12-18 hours ago) for trend detection
    SUM(total_amount) FILTER (
      WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '18 hours' 
      AND transaction_date < CURRENT_TIMESTAMP - INTERVAL '12 hours'
    ) as earlier_6h_revenue,
    COUNT(*) FILTER (
      WHERE transaction_date >= CURRENT_TIMESTAMP - INTERVAL '18 hours' 
      AND transaction_date < CURRENT_TIMESTAMP - INTERVAL '12 hours'
    ) as earlier_6h_transactions,
    
    -- Peak analysis
    MAX(total_amount) as peak_transaction_value,
    MIN(total_amount) as min_transaction_value,
    MODE() WITHIN GROUP (ORDER BY EXTRACT(hour FROM transaction_date)) as peak_hour,
    MODE() WITHIN GROUP (ORDER BY region) as dominant_region,
    MODE() WITHIN GROUP (ORDER BY category) as dominant_category
    
  FROM sales_analytics
)

-- Final dashboard results with comprehensive analytics
SELECT 
  CURRENT_TIMESTAMP as dashboard_generated_at,
  
  -- Overall performance summary
  JSON_OBJECT(
    'total_transactions', om.total_transactions,
    'total_revenue', ROUND(om.total_revenue::NUMERIC, 2),
    'total_net_revenue', ROUND(om.total_net_revenue::NUMERIC, 2), 
    'total_profit', ROUND(om.total_profit::NUMERIC, 2),
    'unique_customers', om.unique_customers,
    'avg_transaction_value', ROUND(om.avg_transaction_value::NUMERIC, 2),
    'median_transaction_value', ROUND(om.median_transaction_value::NUMERIC, 2),
    'profit_margin_percent', ROUND((om.total_profit / om.total_revenue * 100)::NUMERIC, 2),
    'discount_rate_percent', ROUND((om.total_discounts / om.total_revenue * 100)::NUMERIC, 2),
    'revenue_per_customer', ROUND(om.revenue_per_customer::NUMERIC, 2),
    'transactions_per_customer', ROUND(om.transactions_per_customer::NUMERIC, 2)
  ) as overall_metrics,
  
  -- Temporal trends with growth indicators
  (SELECT JSON_AGG(
    JSON_OBJECT(
      'hour', transaction_hour,
      'revenue', ROUND(hourly_revenue::NUMERIC, 2),
      'transactions', hourly_transactions,
      'customers', hourly_unique_customers,
      'avg_value', ROUND(hourly_avg_transaction_value::NUMERIC, 2),
      'units_sold', hourly_units_sold,
      'growth_rate_revenue', 
        CASE 
          WHEN prev_hour_revenue > 0 THEN
            ROUND(((hourly_revenue - prev_hour_revenue) / prev_hour_revenue * 100)::NUMERIC, 2)
          ELSE NULL
        END,
      'growth_rate_transactions',
        CASE 
          WHEN prev_hour_transactions > 0 THEN  
            ROUND(((hourly_transactions - prev_hour_transactions) / prev_hour_transactions::FLOAT * 100)::NUMERIC, 2)
          ELSE NULL
        END,
      'revenue_3h_moving_avg', ROUND(revenue_3h_moving_avg::NUMERIC, 2),
      'performance_tier', performance_tier,
      'revenue_rank', revenue_rank
    ) ORDER BY transaction_hour
  ) FROM temporal_trends) as hourly_trends,
  
  -- Regional performance with competitive analysis  
  (SELECT JSON_AGG(
    JSON_OBJECT(
      'region', region,
      'revenue', ROUND(region_revenue::NUMERIC, 2),
      'revenue_share', ROUND(region_revenue_share::NUMERIC, 2),
      'transactions', region_transactions,
      'customers', region_unique_customers,
      'products', region_unique_products,
      'avg_transaction_value', ROUND(region_avg_transaction_value::NUMERIC, 2),
      'revenue_per_customer', ROUND(region_revenue_per_customer::NUMERIC, 2),
      'profit_margin_percent', ROUND(region_profit_margin_percent::NUMERIC, 2),
      'revenue_rank', revenue_rank,
      'profit_rank', profit_rank,
      'customer_base_rank', customer_base_rank,
      'market_position', market_position,
      'dominant_channel', dominant_sales_channel,
      'dominant_payment', dominant_payment_method,
      'customer_density_percent', ROUND(customer_density_percent::NUMERIC, 2),
      'new_customer_percent', ROUND(new_customer_percent::NUMERIC, 2)
    ) ORDER BY revenue_rank
  ) FROM regional_performance) as regional_analysis,
  
  -- Category analysis with profitability insights
  (SELECT JSON_AGG(
    JSON_OBJECT(
      'category', category,
      'subcategory', subcategory,
      'brand', brand,
      'revenue', ROUND(category_revenue::NUMERIC, 2),
      'revenue_share', ROUND(category_revenue_share::NUMERIC, 2),
      'transactions', category_transactions,
      'customers', category_customers,
      'products', category_products,
      'profit_margin_percent', ROUND(category_profit_margin_percent::NUMERIC, 2),
      'avg_transaction_value', ROUND(category_avg_transaction_value::NUMERIC, 2),
      'revenue_per_customer', ROUND(revenue_per_customer::NUMERIC, 2),
      'revenue_rank', revenue_rank,
      'profit_rank', profit_rank,
      'margin_rank', margin_rank,
      'profitability_tier', profitability_tier,
      'strategic_category', strategic_category,
      'growth_indicator',
        CASE 
          WHEN earlier_18h_revenue > 0 THEN
            CASE 
              WHEN recent_6h_revenue > earlier_18h_revenue THEN 'growing'
              WHEN recent_6h_revenue < earlier_18h_revenue THEN 'declining'
              ELSE 'stable'
            END
          ELSE 'insufficient_data'
        END
    ) ORDER BY revenue_rank
  ) FROM category_analysis) as category_performance,
  
  -- Customer segment insights
  (SELECT JSON_AGG(
    JSON_OBJECT(
      'segment', customer_segment,
      'lifecycle_stage', customer_lifecycle_stage,
      'revenue', ROUND(segment_revenue::NUMERIC, 2),
      'customers', segment_customers,
      'transactions', segment_transactions,
      'revenue_per_customer', ROUND(segment_revenue_per_customer::NUMERIC, 2),
      'transactions_per_customer', ROUND(segment_transactions_per_customer::NUMERIC, 2),
      'avg_age', ROUND(segment_avg_age::NUMERIC, 1),
      'avg_lifetime_value', ROUND(segment_avg_lifetime_value::NUMERIC, 2),
      'profit_margin_percent', ROUND(segment_profit_margin_percent::NUMERIC, 2),
      'male_percentage', ROUND(male_percentage::NUMERIC, 1),
      'female_percentage', ROUND(female_percentage::NUMERIC, 1),
      'online_preference_percent', ROUND(online_preference_percent::NUMERIC, 1),
      'weekend_shopping_percent', ROUND(weekend_shopping_percent::NUMERIC, 1),
      'preferred_shopping_time', preferred_shopping_time,
      'value_classification', value_classification,
      'revenue_rank', revenue_rank
    ) ORDER BY revenue_rank
  ) FROM customer_segment_analysis) as segment_analysis,
  
  -- Channel and payment method effectiveness
  (SELECT JSON_AGG(
    JSON_OBJECT(
      'channel', sales_channel,
      'payment_method', payment_method,
      'revenue', ROUND(combination_revenue::NUMERIC, 2),
      'transactions', combination_transactions,
      'customers', combination_customers,
      'avg_transaction_value', ROUND(combination_avg_value::NUMERIC, 2),
      'revenue_per_customer', ROUND(revenue_per_customer::NUMERIC, 2),
      'profit_margin_percent', ROUND(combination_profit_margin::NUMERIC, 2),
      'overall_market_share', ROUND(overall_market_share::NUMERIC, 2),
      'payment_share_in_channel', ROUND(payment_share_in_channel::NUMERIC, 2),
      'channel_share_in_payment', ROUND(channel_share_in_payment::NUMERIC, 2),
      'premium_customer_percent', ROUND(premium_customer_percent::NUMERIC, 1),
      'weekend_usage_percent', ROUND(weekend_usage_percent::NUMERIC, 1),
      'revenue_rank', revenue_rank,
      'profitability_rank', profitability_rank
    ) ORDER BY revenue_rank
  ) FROM channel_payment_analysis) as channel_payment_effectiveness,
  
  -- Growth trends and momentum indicators
  (SELECT JSON_OBJECT(
    'current_6h_revenue', ROUND(current_6h_revenue::NUMERIC, 2),
    'current_6h_transactions', current_6h_transactions,
    'current_6h_customers', current_6h_customers,
    'previous_6h_revenue', ROUND(previous_6h_revenue::NUMERIC, 2),
    'previous_6h_transactions', previous_6h_transactions,
    'previous_6h_customers', previous_6h_customers,
    'revenue_growth_rate',
      CASE 
        WHEN previous_6h_revenue > 0 THEN
          ROUND(((current_6h_revenue - previous_6h_revenue) / previous_6h_revenue * 100)::NUMERIC, 2)
        ELSE NULL
      END,
    'transaction_growth_rate',
      CASE 
        WHEN previous_6h_transactions > 0 THEN
          ROUND(((current_6h_transactions - previous_6h_transactions) / previous_6h_transactions::FLOAT * 100)::NUMERIC, 2)
        ELSE NULL
      END,
    'customer_growth_rate',
      CASE 
        WHEN previous_6h_customers > 0 THEN
          ROUND(((current_6h_customers - previous_6h_customers) / previous_6h_customers::FLOAT * 100)::NUMERIC, 2)
        ELSE NULL
      END,
    'momentum_indicator',
      CASE 
        WHEN previous_6h_revenue > 0 AND earlier_6h_revenue > 0 THEN
          CASE 
            WHEN current_6h_revenue > previous_6h_revenue AND previous_6h_revenue > earlier_6h_revenue THEN 'accelerating'
            WHEN current_6h_revenue > previous_6h_revenue AND previous_6h_revenue <= earlier_6h_revenue THEN 'recovering'
            WHEN current_6h_revenue <= previous_6h_revenue AND previous_6h_revenue > earlier_6h_revenue THEN 'slowing'
            WHEN current_6h_revenue <= previous_6h_revenue AND previous_6h_revenue <= earlier_6h_revenue THEN 'declining'
            ELSE 'stable'
          END
        ELSE 'insufficient_data'
      END,
    'peak_transaction_value', ROUND(peak_transaction_value::NUMERIC, 2),
    'min_transaction_value', ROUND(min_transaction_value::NUMERIC, 2),
    'peak_hour', peak_hour,
    'dominant_region', dominant_region,
    'dominant_category', dominant_category
  ) FROM growth_trend_analysis) as growth_trends,
  
  -- Dashboard metadata and performance indicators
  JSON_OBJECT(
    'data_freshness_minutes', 
      EXTRACT(MINUTES FROM CURRENT_TIMESTAMP - (SELECT MAX(transaction_date) FROM sales_analytics)),
    'analysis_time_window', '24 hours',
    'total_data_points', (SELECT total_transactions FROM overall_metrics),
    'analysis_depth', 'comprehensive',
    'last_updated', CURRENT_TIMESTAMP,
    'performance_indicators', JSON_OBJECT(
      'query_complexity', 'high',
      'data_completeness', 'complete',
      'analytical_accuracy', 'high',
      'real_time_capability', true
    )
  ) as dashboard_metadata

FROM overall_metrics om
CROSS JOIN growth_trend_analysis gta;

-- Advanced customer lifetime value analysis with SQL aggregations
WITH customer_transaction_history AS (
  SELECT 
    st.customer_id,
    c.customer_segment,
    c.registration_date,
    c.age,
    c.gender,
    c.city,
    c.state,
    
    -- Transaction aggregations
    MIN(st.transaction_date) as first_purchase_date,
    MAX(st.transaction_date) as last_purchase_date,
    COUNT(*) as total_transactions,
    SUM(st.total_amount) as lifetime_revenue,
    AVG(st.total_amount) as avg_transaction_value,
    SUM(st.quantity) as total_units_purchased,
    SUM(st.profit_margin) as lifetime_profit,
    
    -- Temporal behavior
    COUNT(DISTINCT DATE_TRUNC('month', st.transaction_date)) as active_months,
    COUNT(DISTINCT p.category) as categories_purchased,
    COUNT(DISTINCT st.sales_channel) as channels_used,
    COUNT(DISTINCT st.payment_method) as payment_methods_used,
    
    -- Calculated metrics
    EXTRACT(DAYS FROM MAX(st.transaction_date) - MIN(st.transaction_date)) as customer_lifespan_days,
    AVG(EXTRACT(DAYS FROM st.transaction_date - LAG(st.transaction_date) OVER (
      PARTITION BY st.customer_id ORDER BY st.transaction_date
    ))) as avg_days_between_purchases
    
  FROM sales_transactions st
  JOIN customers c ON st.customer_id = c.customer_id
  JOIN products p ON st.product_id = p.product_id
  WHERE st.transaction_date >= CURRENT_TIMESTAMP - INTERVAL '365 days'
  GROUP BY st.customer_id, c.customer_segment, c.registration_date, c.age, c.gender, c.city, c.state
),

customer_segmentation_and_prediction AS (
  SELECT 
    cth.*,
    
    -- CLV calculations
    CASE 
      WHEN avg_days_between_purchases > 0 AND avg_days_between_purchases <= 365 THEN
        avg_transaction_value * (365 / avg_days_between_purchases)
      ELSE lifetime_revenue
    END as predicted_annual_value,
    
    CASE 
      WHEN avg_days_between_purchases > 0 AND avg_days_between_purchases <= 365 THEN
        avg_transaction_value * (30 / avg_days_between_purchases)
      ELSE lifetime_revenue / GREATEST(active_months, 1)
    END as predicted_monthly_value,
    
    -- RFM scoring
    NTILE(5) OVER (ORDER BY last_purchase_date DESC) as recency_score,
    NTILE(5) OVER (ORDER BY total_transactions DESC) as frequency_score, 
    NTILE(5) OVER (ORDER BY lifetime_revenue DESC) as monetary_score,
    
    -- Customer lifecycle classification
    CASE 
      WHEN last_purchase_date >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 'active'
      WHEN last_purchase_date >= CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'at_risk'
      WHEN last_purchase_date >= CURRENT_TIMESTAMP - INTERVAL '180 days' THEN 'dormant'
      ELSE 'churned'
    END as lifecycle_status,
    
    -- Value segmentation
    CASE 
      WHEN lifetime_revenue >= 5000 THEN 'vip'
      WHEN lifetime_revenue >= 1000 THEN 'high_value'
      WHEN lifetime_revenue >= 500 THEN 'medium_value'
      WHEN lifetime_revenue >= 100 THEN 'low_value'
      ELSE 'minimal_value'
    END as value_segment,
    
    -- Engagement classification
    CASE 
      WHEN total_transactions >= 20 THEN 'highly_engaged'
      WHEN total_transactions >= 10 THEN 'engaged'
      WHEN total_transactions >= 5 THEN 'moderately_engaged'
      ELSE 'low_engagement'
    END as engagement_level,
    
    -- Churn risk assessment
    CASE 
      WHEN last_purchase_date < CURRENT_TIMESTAMP - INTERVAL '90 days' AND avg_days_between_purchases < 60 THEN 'high_risk'
      WHEN last_purchase_date < CURRENT_TIMESTAMP - INTERVAL '60 days' AND avg_days_between_purchases < 45 THEN 'medium_risk'
      WHEN last_purchase_date < CURRENT_TIMESTAMP - INTERVAL '30 days' AND total_transactions > 5 THEN 'low_risk'
      ELSE 'minimal_risk'
    END as churn_risk
    
  FROM customer_transaction_history cth
)

SELECT 
  -- Customer lifetime value summary
  JSON_OBJECT(
    'total_customers_analyzed', COUNT(*),
    'total_historical_revenue', SUM(lifetime_revenue),
    'total_predicted_annual_revenue', SUM(predicted_annual_value),
    'avg_customer_lifetime_value', AVG(lifetime_revenue),
    'avg_predicted_annual_value', AVG(predicted_annual_value),
    'avg_customer_lifespan_days', AVG(customer_lifespan_days),
    'avg_purchase_frequency_days', AVG(avg_days_between_purchases)
  ) as clv_summary,
  
  -- Value segment distribution
  (SELECT JSON_OBJECT_AGG(
    value_segment,
    JSON_OBJECT(
      'customer_count', COUNT(*),
      'total_revenue', SUM(lifetime_revenue),
      'avg_revenue_per_customer', AVG(lifetime_revenue),
      'avg_predicted_annual_value', AVG(predicted_annual_value),
      'avg_transactions', AVG(total_transactions),
      'revenue_share_percent', ROUND(SUM(lifetime_revenue) / SUM(SUM(lifetime_revenue)) OVER () * 100, 2)
    )
  ) FROM customer_segmentation_and_prediction GROUP BY value_segment) as value_segments,
  
  -- Lifecycle status analysis
  (SELECT JSON_OBJECT_AGG(
    lifecycle_status,
    JSON_OBJECT(
      'customer_count', COUNT(*),
      'total_revenue', SUM(lifetime_revenue),
      'avg_revenue_per_customer', AVG(lifetime_revenue),
      'avg_recency_score', AVG(recency_score),
      'avg_frequency_score', AVG(frequency_score),
      'avg_monetary_score', AVG(monetary_score)
    )
  ) FROM customer_segmentation_and_prediction GROUP BY lifecycle_status) as lifecycle_analysis,
  
  -- Churn risk assessment
  (SELECT JSON_OBJECT_AGG(
    churn_risk,
    JSON_OBJECT(
      'customer_count', COUNT(*),
      'at_risk_revenue', SUM(lifetime_revenue),
      'avg_predicted_annual_loss', AVG(predicted_annual_value),
      'high_value_customers_at_risk', COUNT(*) FILTER (WHERE value_segment IN ('vip', 'high_value'))
    )
  ) FROM customer_segmentation_and_prediction GROUP BY churn_risk) as churn_risk_analysis,
  
  -- Top performers
  (SELECT JSON_AGG(
    JSON_OBJECT(
      'customer_id', customer_id,
      'lifetime_revenue', ROUND(lifetime_revenue::NUMERIC, 2),
      'predicted_annual_value', ROUND(predicted_annual_value::NUMERIC, 2),
      'total_transactions', total_transactions,
      'customer_lifespan_days', customer_lifespan_days,
      'avg_transaction_value', ROUND(avg_transaction_value::NUMERIC, 2),
      'value_segment', value_segment,
      'engagement_level', engagement_level,
      'rfm_combined_score', recency_score + frequency_score + monetary_score,
      'churn_risk', churn_risk
    ) ORDER BY lifetime_revenue DESC LIMIT 20
  )) as top_customers,
  
  CURRENT_TIMESTAMP as analysis_generated_at

FROM customer_segmentation_and_prediction;

-- Real-time analytics performance monitoring
CREATE VIEW analytics_performance_dashboard AS
WITH performance_metrics AS (
  SELECT 
    -- Query performance indicators
    COUNT(*) as total_dashboard_queries_24h,
    AVG(query_duration_ms) as avg_query_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY query_duration_ms) as p95_query_duration_ms,
    MAX(query_duration_ms) as max_query_duration_ms,
    
    -- Data freshness metrics
    AVG(EXTRACT(MINUTES FROM query_timestamp - data_timestamp)) as avg_data_age_minutes,
    MAX(EXTRACT(MINUTES FROM query_timestamp - data_timestamp)) as max_data_age_minutes,
    
    -- Cache performance
    COUNT(*) FILTER (WHERE cache_hit = true) as cache_hits,
    COUNT(*) FILTER (WHERE cache_hit = false) as cache_misses,
    
    -- Resource utilization
    AVG(memory_usage_mb) as avg_memory_usage_mb,
    MAX(memory_usage_mb) as peak_memory_usage_mb,
    AVG(cpu_utilization_percent) as avg_cpu_utilization,
    
    -- Error rates
    COUNT(*) FILTER (WHERE query_status = 'error') as query_errors,
    COUNT(*) FILTER (WHERE query_status = 'timeout') as query_timeouts
    
  FROM analytics_query_log
  WHERE query_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
)

SELECT 
  CURRENT_TIMESTAMP as dashboard_time,
  
  -- Performance indicators
  total_dashboard_queries_24h,
  ROUND(avg_query_duration_ms::NUMERIC, 2) as avg_response_time_ms,
  ROUND(p95_query_duration_ms::NUMERIC, 2) as p95_response_time_ms,
  ROUND(max_query_duration_ms::NUMERIC, 2) as max_response_time_ms,
  
  -- Data quality indicators
  ROUND(avg_data_age_minutes::NUMERIC, 2) as avg_data_freshness_minutes,
  ROUND(max_data_age_minutes::NUMERIC, 2) as max_data_age_minutes,
  
  -- Cache effectiveness
  cache_hits,
  cache_misses,
  CASE 
    WHEN (cache_hits + cache_misses) > 0 THEN
      ROUND((cache_hits::FLOAT / (cache_hits + cache_misses) * 100)::NUMERIC, 2)
    ELSE 0
  END as cache_hit_rate_percent,
  
  -- System resource utilization
  ROUND(avg_memory_usage_mb::NUMERIC, 2) as avg_memory_mb,
  ROUND(peak_memory_usage_mb::NUMERIC, 2) as peak_memory_mb,
  ROUND(avg_cpu_utilization::NUMERIC, 2) as avg_cpu_percent,
  
  -- Reliability indicators
  query_errors,
  query_timeouts,
  CASE 
    WHEN total_dashboard_queries_24h > 0 THEN
      ROUND(((total_dashboard_queries_24h - query_errors - query_timeouts)::FLOAT / total_dashboard_queries_24h * 100)::NUMERIC, 2)
    ELSE 100
  END as success_rate_percent,
  
  -- Health status
  CASE 
    WHEN avg_query_duration_ms > 5000 OR (query_errors + query_timeouts) > total_dashboard_queries_24h * 0.05 THEN 'critical'
    WHEN avg_query_duration_ms > 2000 OR (query_errors + query_timeouts) > total_dashboard_queries_24h * 0.02 THEN 'warning'
    ELSE 'healthy'
  END as system_health,
  
  -- Performance recommendations
  ARRAY[
    CASE WHEN avg_query_duration_ms > 3000 THEN 'Consider query optimization or caching improvements' END,
    CASE WHEN cache_hit_rate_percent < 70 THEN 'Cache hit rate is low - review caching strategy' END,
    CASE WHEN avg_data_age_minutes > 10 THEN 'Data freshness may impact real-time insights' END,
    CASE WHEN peak_memory_usage_mb > 1000 THEN 'High memory usage detected - consider resource scaling' END
  ]::TEXT[] as recommendations

FROM performance_metrics;

-- QueryLeaf provides comprehensive MongoDB analytics capabilities:
-- 1. SQL-familiar syntax for complex aggregation pipelines and dashboard queries
-- 2. Advanced real-time analytics with multi-dimensional data processing
-- 3. Customer lifetime value analysis with predictive modeling capabilities
-- 4. Sophisticated segmentation and behavioral analysis through SQL constructs
-- 5. Real-time performance monitoring with comprehensive health indicators
-- 6. Advanced temporal trend analysis with growth rate calculations
-- 7. Production-ready analytics operations with caching and optimization
-- 8. Integration with MongoDB's native aggregation framework optimizations
-- 9. Comprehensive business intelligence with statistical analysis support
-- 10. Enterprise-grade analytics dashboards accessible through familiar SQL patterns
```

## Best Practices for Production Analytics Implementation

### Analytics Pipeline Design and Optimization

Essential principles for effective MongoDB analytics dashboard deployment:

1. **Data Modeling Strategy**: Design analytics-optimized schemas with appropriate indexing strategies for time-series and dimensional queries
2. **Aggregation Optimization**: Implement efficient aggregation pipelines with proper stage ordering and memory-conscious operations
3. **Caching Architecture**: Deploy intelligent caching layers that balance data freshness with query performance requirements
4. **Real-Time Processing**: Configure change stream integration for live dashboard updates without performance degradation
5. **Scalability Design**: Architect analytics systems that can handle growing data volumes and increasing concurrent user loads
6. **Performance Monitoring**: Implement comprehensive monitoring that tracks query performance, resource utilization, and user experience metrics

### Enterprise Analytics Deployment

Optimize analytics platforms for production enterprise environments:

1. **Distributed Processing**: Implement distributed analytics processing that can leverage MongoDB's sharding capabilities for massive datasets
2. **Security Integration**: Ensure analytics operations meet enterprise security requirements with proper access controls and data governance
3. **Compliance Framework**: Design analytics systems that support regulatory requirements for data retention, audit trails, and reporting
4. **Operational Integration**: Integrate analytics platforms with existing monitoring, alerting, and business intelligence infrastructure
5. **Multi-Tenant Architecture**: Support multiple business units and use cases with scalable, isolated analytics environments
6. **Cost Optimization**: Monitor and optimize analytics resource usage and processing costs for efficient operations

## Conclusion

MongoDB's Aggregation Framework provides sophisticated real-time analytics capabilities that enable powerful dashboard creation, complex data processing, and comprehensive business intelligence without the complexity and infrastructure overhead of traditional analytics platforms. Native aggregation operations offer scalable, efficient, and flexible data processing directly within the operational database.

Key MongoDB Analytics benefits include:

- **Real-Time Processing**: Immediate insight generation from operational data without ETL delays or separate analytics infrastructure
- **Advanced Aggregations**: Sophisticated multi-stage data processing with statistical calculations, temporal analysis, and predictive modeling
- **Flexible Analytics**: Dynamic dashboard creation with customizable metrics, dimensions, and filtering capabilities
- **Scalable Architecture**: Native MongoDB integration that scales efficiently with data growth and analytical complexity
- **Performance Optimization**: Built-in optimization features with intelligent caching, indexing, and query planning
- **SQL Accessibility**: Familiar SQL-style analytics operations through QueryLeaf for accessible business intelligence development

Whether you're building executive dashboards, operational analytics, customer insights platforms, or real-time monitoring systems, MongoDB aggregation with QueryLeaf's familiar SQL interface provides the foundation for powerful, scalable, and efficient analytics solutions.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB aggregation pipelines while providing SQL-familiar syntax for complex analytics operations. Advanced dashboard creation, customer segmentation, and predictive analytics are seamlessly handled through familiar SQL constructs, making sophisticated business intelligence accessible to SQL-oriented development teams without requiring deep MongoDB aggregation expertise.

The combination of MongoDB's robust aggregation capabilities with SQL-style analytics operations makes it an ideal platform for applications requiring both real-time operational data processing and familiar business intelligence patterns, ensuring your analytics solutions can deliver immediate insights while maintaining development team productivity and system performance.