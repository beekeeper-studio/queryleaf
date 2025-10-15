---
title: "MongoDB Time Series Data Storage and Optimization: Advanced Temporal Data Analytics and High-Performance Storage Strategies"
description: "Master MongoDB time series collections for optimal temporal data management. Learn advanced time-based indexing, data compression, analytics aggregation, and SQL-familiar time series operations for scalable IoT and monitoring applications."
date: 2025-10-14
tags: [mongodb, time-series, temporal-data, analytics, iot, monitoring, performance-optimization, sql]
---

# MongoDB Time Series Data Storage and Optimization: Advanced Temporal Data Analytics and High-Performance Storage Strategies

Modern applications generate massive volumes of time-stamped data from IoT devices, system monitoring, financial markets, user analytics, and sensor networks. Managing temporal data efficiently requires specialized storage strategies that can handle high ingestion rates, optimize storage utilization, and provide fast analytical queries across time ranges. Traditional relational databases struggle with time series workloads due to inefficient storage patterns, limited compression capabilities, and poor query performance for temporal analytics.

MongoDB's time series collections provide purpose-built capabilities for temporal data management through advanced compression algorithms, optimized storage layouts, and specialized indexing strategies. Unlike traditional approaches that require complex partitioning schemes and manual optimization, MongoDB time series collections automatically optimize storage efficiency, query performance, and analytical capabilities while maintaining schema flexibility for diverse time-stamped data formats.

## The Traditional Time Series Data Challenge

Conventional approaches to time series data management in relational databases face significant limitations:

```sql
-- Traditional PostgreSQL time series data handling - inefficient storage and limited optimization

-- Basic time series table with poor storage efficiency
CREATE TABLE sensor_readings (
    reading_id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    location VARCHAR(100),
    timestamp TIMESTAMP NOT NULL,
    
    -- Measurements stored as separate columns (inflexible schema)
    temperature DECIMAL(5,2),
    humidity DECIMAL(5,2),
    pressure DECIMAL(7,2),
    battery_level INTEGER,
    signal_strength INTEGER,
    
    -- Limited metadata support
    device_metadata JSONB,
    
    -- Basic audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Manual partitioning hint
    partition_key DATE GENERATED ALWAYS AS (DATE(timestamp)) STORED
);

-- Manual partitioning setup (complex maintenance overhead)
CREATE INDEX idx_sensor_readings_timestamp ON sensor_readings(timestamp DESC);
CREATE INDEX idx_sensor_readings_device_time ON sensor_readings(device_id, timestamp DESC);
CREATE INDEX idx_sensor_readings_type_time ON sensor_readings(sensor_type, timestamp DESC);

-- Attempt at time-based partitioning (limited automation)
DO $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
BEGIN
    start_date := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months');
    
    WHILE start_date <= DATE_TRUNC('month', CURRENT_DATE + INTERVAL '3 months') LOOP
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'sensor_readings_' || TO_CHAR(start_date, 'YYYY_MM');
        
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I PARTITION OF sensor_readings
            FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date);
            
        start_date := end_date;
    END LOOP;
END;
$$;

-- Time series aggregation queries (inefficient for large datasets)
WITH hourly_averages AS (
    SELECT 
        device_id,
        sensor_type,
        DATE_TRUNC('hour', timestamp) as hour_bucket,
        
        -- Basic aggregations (limited analytical functions)
        COUNT(*) as reading_count,
        AVG(temperature) as avg_temperature,
        AVG(humidity) as avg_humidity,
        AVG(pressure) as avg_pressure,
        MIN(temperature) as min_temperature,
        MAX(temperature) as max_temperature,
        
        -- Standard deviation calculations (expensive)
        STDDEV(temperature) as temp_stddev,
        STDDEV(humidity) as humidity_stddev,
        
        -- Battery and connectivity metrics
        AVG(battery_level) as avg_battery,
        AVG(signal_strength) as avg_signal_strength,
        
        -- Data quality metrics
        COUNT(*) FILTER (WHERE temperature IS NOT NULL) as valid_temp_readings,
        COUNT(*) FILTER (WHERE humidity IS NOT NULL) as valid_humidity_readings
        
    FROM sensor_readings sr
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND timestamp < CURRENT_TIMESTAMP
    GROUP BY device_id, sensor_type, DATE_TRUNC('hour', timestamp)
),

daily_summaries AS (
    SELECT 
        device_id,
        sensor_type,
        DATE_TRUNC('day', hour_bucket) as day_bucket,
        
        -- Aggregation of aggregations (double computation overhead)
        SUM(reading_count) as total_readings_per_day,
        AVG(avg_temperature) as daily_avg_temperature,
        MIN(min_temperature) as daily_min_temperature,
        MAX(max_temperature) as daily_max_temperature,
        AVG(avg_humidity) as daily_avg_humidity,
        AVG(avg_pressure) as daily_avg_pressure,
        
        -- Battery consumption analysis
        MIN(avg_battery) as daily_min_battery,
        AVG(avg_battery) as daily_avg_battery,
        
        -- Connectivity quality
        AVG(avg_signal_strength) as daily_avg_signal,
        
        -- Data completeness metrics
        ROUND(
            (SUM(valid_temp_readings) * 100.0) / NULLIF(SUM(reading_count), 0), 2
        ) as temperature_data_completeness_percent,
        
        ROUND(
            (SUM(valid_humidity_readings) * 100.0) / NULLIF(SUM(reading_count), 0), 2
        ) as humidity_data_completeness_percent
        
    FROM hourly_averages
    GROUP BY device_id, sensor_type, DATE_TRUNC('day', hour_bucket)
),

device_health_analysis AS (
    -- Complex analysis requiring multiple scans
    SELECT 
        ds.device_id,
        ds.sensor_type,
        COUNT(*) as analysis_days,
        
        -- Temperature trend analysis (limited analytical capabilities)
        AVG(ds.daily_avg_temperature) as overall_avg_temperature,
        STDDEV(ds.daily_avg_temperature) as temperature_variability,
        
        -- Battery degradation analysis
        CASE 
            WHEN COUNT(*) > 1 THEN
                -- Simple linear trend approximation
                (MAX(ds.daily_avg_battery) - MIN(ds.daily_avg_battery)) / NULLIF(COUNT(*) - 1, 0)
            ELSE NULL
        END as daily_battery_degradation_rate,
        
        -- Connectivity stability
        AVG(ds.daily_avg_signal) as avg_connectivity,
        STDDEV(ds.daily_avg_signal) as connectivity_stability,
        
        -- Data quality assessment
        AVG(ds.temperature_data_completeness_percent) as avg_data_completeness,
        
        -- Device status classification
        CASE 
            WHEN AVG(ds.daily_avg_battery) < 20 THEN 'low_battery'
            WHEN AVG(ds.daily_avg_signal) < 30 THEN 'poor_connectivity'  
            WHEN AVG(ds.temperature_data_completeness_percent) < 80 THEN 'unreliable_data'
            ELSE 'healthy'
        END as device_status,
        
        -- Alert generation
        ARRAY[
            CASE WHEN AVG(ds.daily_avg_battery) < 15 THEN 'CRITICAL_BATTERY' END,
            CASE WHEN AVG(ds.daily_avg_signal) < 20 THEN 'CRITICAL_CONNECTIVITY' END,
            CASE WHEN AVG(ds.temperature_data_completeness_percent) < 50 THEN 'DATA_QUALITY_ISSUE' END,
            CASE WHEN STDDEV(ds.daily_avg_temperature) > 10 THEN 'TEMPERATURE_ANOMALY' END
        ]::TEXT[] as active_alerts
        
    FROM daily_summaries ds
    WHERE ds.day_bucket >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY ds.device_id, ds.sensor_type
)
SELECT 
    device_id,
    sensor_type,
    analysis_days,
    
    -- Performance metrics
    ROUND(overall_avg_temperature, 2) as avg_temp,
    ROUND(temperature_variability, 2) as temp_variability,
    ROUND(daily_battery_degradation_rate, 4) as battery_degradation_per_day,
    ROUND(avg_connectivity, 1) as avg_signal_strength,
    ROUND(avg_data_completeness, 1) as data_completeness_percent,
    
    -- Status and alerts
    device_status,
    ARRAY_REMOVE(active_alerts, NULL) as alerts,
    
    -- Recommendations
    CASE device_status
        WHEN 'low_battery' THEN 'Schedule battery replacement or reduce sampling frequency'
        WHEN 'poor_connectivity' THEN 'Check network coverage or relocate device'
        WHEN 'unreliable_data' THEN 'Inspect device sensors and calibration'
        ELSE 'Device operating normally'
    END as recommendation
    
FROM device_health_analysis
ORDER BY 
    CASE device_status 
        WHEN 'low_battery' THEN 1
        WHEN 'poor_connectivity' THEN 2  
        WHEN 'unreliable_data' THEN 3
        ELSE 4
    END,
    overall_avg_temperature DESC;

-- Traditional approach problems:
-- 1. Inefficient storage - no automatic compression for time series patterns
-- 2. Manual partitioning overhead with limited automation
-- 3. Poor query performance for time range analytics
-- 4. Complex aggregation logic requiring multiple query stages
-- 5. Limited schema flexibility for diverse sensor data
-- 6. No built-in time series analytical functions
-- 7. Expensive index maintenance for time-based queries
-- 8. Poor compression ratios leading to high storage costs
-- 9. Complex retention policy implementation
-- 10. Limited support for high-frequency data ingestion

-- Attempt at high-frequency data insertion (poor performance)
INSERT INTO sensor_readings (
    device_id, sensor_type, location, timestamp,
    temperature, humidity, pressure, battery_level, signal_strength
)
VALUES 
    ('device_001', 'environmental', 'warehouse_a', '2024-10-14 10:00:00', 23.5, 45.2, 1013.2, 85, 75),
    ('device_001', 'environmental', 'warehouse_a', '2024-10-14 10:00:10', 23.6, 45.1, 1013.3, 85, 76),
    ('device_001', 'environmental', 'warehouse_a', '2024-10-14 10:00:20', 23.4, 45.3, 1013.1, 85, 74),
    ('device_002', 'environmental', 'warehouse_b', '2024-10-14 10:00:00', 24.1, 42.8, 1012.8, 90, 82),
    ('device_002', 'environmental', 'warehouse_b', '2024-10-14 10:00:10', 24.2, 42.9, 1012.9, 90, 83);
-- Individual inserts are extremely inefficient for high-frequency data

-- Range queries with limited optimization
SELECT 
    device_id,
    AVG(temperature) as avg_temp,
    COUNT(*) as reading_count
FROM sensor_readings
WHERE timestamp BETWEEN '2024-10-14 09:00:00' AND '2024-10-14 11:00:00'
    AND sensor_type = 'environmental'
GROUP BY device_id
ORDER BY avg_temp DESC;

-- Problems:
-- 1. Full table scan for time range queries despite indexing
-- 2. No automatic data compression reducing storage efficiency
-- 3. Poor aggregation performance for time-based analytics
-- 4. Limited analytical functions for time series analysis
-- 5. Complex retention and archival policy implementation
-- 6. No built-in support for irregular time intervals
-- 7. Inefficient handling of sparse data and missing measurements
-- 8. Manual optimization required for high ingestion rates
-- 9. Limited support for multi-metric time series analysis
-- 10. Complex downsampling and data summarization requirements
```

MongoDB provides sophisticated time series collection capabilities with automatic optimization:

```javascript
// MongoDB Advanced Time Series Data Management
const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('advanced_time_series');

// Comprehensive MongoDB Time Series Manager
class AdvancedTimeSeriesManager {
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      // Time series collection configuration
      defaultGranularity: config.defaultGranularity || 'seconds',
      defaultExpiration: config.defaultExpiration || 86400 * 30, // 30 days
      enableCompression: config.enableCompression !== false,
      
      // Bucketing and storage optimization
      bucketMaxSpanSeconds: config.bucketMaxSpanSeconds || 3600, // 1 hour
      bucketRoundingSeconds: config.bucketRoundingSeconds || 60, // 1 minute
      
      // Performance optimization
      enablePreAggregation: config.enablePreAggregation || false,
      aggregationLevels: config.aggregationLevels || ['hourly', 'daily'],
      enableAutomaticIndexing: config.enableAutomaticIndexing !== false,
      
      // Data retention and lifecycle
      enableAutomaticExpiration: config.enableAutomaticExpiration !== false,
      retentionPolicies: config.retentionPolicies || {
        raw: 7 * 24 * 3600,      // 7 days
        hourly: 90 * 24 * 3600,  // 90 days  
        daily: 365 * 24 * 3600   // 1 year
      },
      
      // Quality and monitoring
      enableDataQualityTracking: config.enableDataQualityTracking || false,
      enableAnomalyDetection: config.enableAnomalyDetection || false,
      alertingThresholds: config.alertingThresholds || {}
    };
    
    this.collections = new Map();
    this.aggregationPipelines = new Map();
    
    this.initializeTimeSeriesSystem();
  }

  async initializeTimeSeriesSystem() {
    console.log('Initializing advanced time series system...');
    
    try {
      // Setup time series collections with optimization
      await this.setupTimeSeriesCollections();
      
      // Configure automatic aggregation pipelines  
      if (this.config.enablePreAggregation) {
        await this.setupPreAggregationPipelines();
      }
      
      // Setup data quality monitoring
      if (this.config.enableDataQualityTracking) {
        await this.setupDataQualityMonitoring();
      }
      
      // Initialize retention policies
      if (this.config.enableAutomaticExpiration) {
        await this.setupRetentionPolicies();
      }
      
      console.log('Time series system initialized successfully');
      
    } catch (error) {
      console.error('Error initializing time series system:', error);
      throw error;
    }
  }

  async createTimeSeriesCollection(collectionName, options = {}) {
    console.log(`Creating optimized time series collection: ${collectionName}`);
    
    try {
      const timeSeriesOptions = {
        timeseries: {
          timeField: options.timeField || 'timestamp',
          metaField: options.metaField || 'metadata',
          granularity: options.granularity || this.config.defaultGranularity,
          
          // Advanced bucketing configuration
          bucketMaxSpanSeconds: options.bucketMaxSpanSeconds || this.config.bucketMaxSpanSeconds,
          bucketRoundingSeconds: options.bucketRoundingSeconds || this.config.bucketRoundingSeconds
        },
        
        // Automatic expiration configuration
        expireAfterSeconds: options.expireAfterSeconds || this.config.defaultExpiration,
        
        // Storage optimization
        storageEngine: {
          wiredTiger: {
            configString: options.enableCompression ? 'block_compressor=zstd' : undefined
          }
        }
      };

      // Create the time series collection
      const collection = await this.db.createCollection(collectionName, timeSeriesOptions);
      
      // Store collection reference for management
      this.collections.set(collectionName, {
        collection: collection,
        config: timeSeriesOptions,
        createdAt: new Date()
      });

      // Create optimized indexes for time series queries
      await this.createTimeSeriesIndexes(collection, options);
      
      console.log(`Time series collection '${collectionName}' created successfully`);
      
      return {
        success: true,
        collectionName: collectionName,
        configuration: timeSeriesOptions,
        indexesCreated: true
      };
      
    } catch (error) {
      console.error(`Error creating time series collection '${collectionName}':`, error);
      return {
        success: false,
        error: error.message,
        collectionName: collectionName
      };
    }
  }

  async createTimeSeriesIndexes(collection, options = {}) {
    console.log('Creating optimized indexes for time series collection...');
    
    try {
      const indexes = [
        // Compound index for time range queries with metadata
        {
          key: { 
            [`${options.metaField || 'metadata'}.device_id`]: 1,
            [`${options.timeField || 'timestamp'}`]: -1 
          },
          name: 'device_time_idx',
          background: true
        },
        
        // Index for sensor type queries
        {
          key: { 
            [`${options.metaField || 'metadata'}.sensor_type`]: 1,
            [`${options.timeField || 'timestamp'}`]: -1 
          },
          name: 'sensor_time_idx',
          background: true
        },
        
        // Compound index for location-based queries
        {
          key: { 
            [`${options.metaField || 'metadata'}.location`]: 1,
            [`${options.metaField || 'metadata'}.device_id`]: 1,
            [`${options.timeField || 'timestamp'}`]: -1 
          },
          name: 'location_device_time_idx',
          background: true
        },
        
        // Index for data quality queries
        {
          key: { 
            [`${options.metaField || 'metadata'}.data_quality`]: 1,
            [`${options.timeField || 'timestamp'}`]: -1 
          },
          name: 'quality_time_idx',
          background: true,
          sparse: true
        }
      ];

      // Create all indexes
      await collection.createIndexes(indexes);
      
      console.log(`Created ${indexes.length} optimized indexes for time series collection`);
      
    } catch (error) {
      console.error('Error creating time series indexes:', error);
      throw error;
    }
  }

  async insertTimeSeriesData(collectionName, documents, options = {}) {
    console.log(`Inserting ${documents.length} time series documents into ${collectionName}...`);
    
    try {
      const collectionInfo = this.collections.get(collectionName);
      if (!collectionInfo) {
        throw new Error(`Time series collection '${collectionName}' not found`);
      }
      
      const collection = collectionInfo.collection;
      
      // Prepare documents for time series insertion
      const preparedDocuments = documents.map(doc => this.prepareTimeSeriesDocument(doc, options));
      
      // Execute optimized bulk insertion
      const insertOptions = {
        ordered: options.ordered !== undefined ? options.ordered : false,
        writeConcern: options.writeConcern || { w: 'majority', j: true },
        ...options.insertOptions
      };

      const insertResult = await collection.insertMany(preparedDocuments, insertOptions);
      
      // Update data quality metrics if enabled
      if (this.config.enableDataQualityTracking) {
        await this.updateDataQualityMetrics(collectionName, preparedDocuments);
      }
      
      // Trigger anomaly detection if enabled
      if (this.config.enableAnomalyDetection) {
        await this.checkForAnomalies(collectionName, preparedDocuments);
      }
      
      return {
        success: true,
        collectionName: collectionName,
        documentsInserted: insertResult.insertedCount,
        insertedIds: insertResult.insertedIds,
        
        // Performance metrics
        averageDocumentSize: this.calculateAverageDocumentSize(preparedDocuments),
        compressionEnabled: collectionInfo.config.timeseries.enableCompression,
        
        // Data quality summary
        dataQualityScore: options.trackQuality ? this.calculateDataQualityScore(preparedDocuments) : null
      };
      
    } catch (error) {
      console.error(`Error inserting time series data into '${collectionName}':`, error);
      return {
        success: false,
        error: error.message,
        collectionName: collectionName
      };
    }
  }

  prepareTimeSeriesDocument(document, options = {}) {
    // Ensure proper time series document structure
    const prepared = {
      timestamp: document.timestamp || new Date(),
      
      // Organize metadata for optimal bucketing
      metadata: {
        device_id: document.device_id || document.metadata?.device_id,
        sensor_type: document.sensor_type || document.metadata?.sensor_type,
        location: document.location || document.metadata?.location,
        
        // Device-specific metadata
        device_model: document.device_model || document.metadata?.device_model,
        firmware_version: document.firmware_version || document.metadata?.firmware_version,
        
        // Data quality indicators
        data_quality: options.calculateQuality ? this.assessDataQuality(document) : undefined,
        
        // Additional metadata preservation
        ...document.metadata
      },
      
      // Measurements with proper data types
      measurements: {
        // Environmental measurements
        temperature: this.validateMeasurement(document.temperature, 'temperature'),
        humidity: this.validateMeasurement(document.humidity, 'humidity'),
        pressure: this.validateMeasurement(document.pressure, 'pressure'),
        
        // Device status measurements
        battery_level: this.validateMeasurement(document.battery_level, 'battery'),
        signal_strength: this.validateMeasurement(document.signal_strength, 'signal'),
        
        // Custom measurements
        ...this.extractCustomMeasurements(document)
      }
    };

    // Remove undefined values to optimize storage
    this.removeUndefinedValues(prepared);
    
    return prepared;
  }

  validateMeasurement(value, measurementType) {
    if (value === null || value === undefined) return undefined;
    
    // Type-specific validation and normalization
    const validationRules = {
      temperature: { min: -50, max: 100, precision: 2 },
      humidity: { min: 0, max: 100, precision: 1 },
      pressure: { min: 900, max: 1100, precision: 1 },
      battery: { min: 0, max: 100, precision: 0 },
      signal: { min: 0, max: 100, precision: 0 }
    };
    
    const rule = validationRules[measurementType];
    if (!rule) return value; // No validation rule, return as-is
    
    const numericValue = Number(value);
    if (isNaN(numericValue)) return undefined;
    
    // Apply bounds checking
    const boundedValue = Math.max(rule.min, Math.min(rule.max, numericValue));
    
    // Apply precision rounding
    return Number(boundedValue.toFixed(rule.precision));
  }

  async performTimeSeriesAggregation(collectionName, aggregationRequest) {
    console.log(`Performing time series aggregation on ${collectionName}...`);
    
    try {
      const collectionInfo = this.collections.get(collectionName);
      if (!collectionInfo) {
        throw new Error(`Time series collection '${collectionName}' not found`);
      }
      
      const collection = collectionInfo.collection;
      
      // Build optimized aggregation pipeline
      const aggregationPipeline = this.buildTimeSeriesAggregationPipeline(aggregationRequest);
      
      // Execute aggregation with appropriate options
      const aggregationOptions = {
        allowDiskUse: true,
        maxTimeMS: aggregationRequest.maxTimeMS || 60000,
        hint: aggregationRequest.hint,
        comment: `time_series_aggregation_${Date.now()}`
      };
      
      const results = await collection.aggregate(aggregationPipeline, aggregationOptions).toArray();
      
      // Post-process results for enhanced analytics
      const processedResults = this.processAggregationResults(results, aggregationRequest);
      
      return {
        success: true,
        collectionName: collectionName,
        aggregationType: aggregationRequest.type,
        resultCount: results.length,
        
        // Aggregation results
        results: processedResults,
        
        // Execution metadata
        executionStats: {
          pipelineStages: aggregationPipeline.length,
          executionTime: Date.now(),
          dataPointsAnalyzed: this.estimateDataPointsAnalyzed(aggregationRequest)
        }
      };
      
    } catch (error) {
      console.error(`Error performing time series aggregation on '${collectionName}':`, error);
      return {
        success: false,
        error: error.message,
        collectionName: collectionName,
        aggregationType: aggregationRequest.type
      };
    }
  }

  buildTimeSeriesAggregationPipeline(request) {
    const pipeline = [];
    
    // Time range filtering (essential first stage for performance)
    if (request.timeRange) {
      pipeline.push({
        $match: {
          timestamp: {
            $gte: new Date(request.timeRange.start),
            $lte: new Date(request.timeRange.end)
          }
        }
      });
    }
    
    // Metadata filtering
    if (request.filters) {
      const matchConditions = {};
      
      if (request.filters.device_ids) {
        matchConditions['metadata.device_id'] = { $in: request.filters.device_ids };
      }
      
      if (request.filters.sensor_types) {
        matchConditions['metadata.sensor_type'] = { $in: request.filters.sensor_types };
      }
      
      if (request.filters.locations) {
        matchConditions['metadata.location'] = { $in: request.filters.locations };
      }
      
      if (Object.keys(matchConditions).length > 0) {
        pipeline.push({ $match: matchConditions });
      }
    }
    
    // Time-based grouping and aggregation
    switch (request.type) {
      case 'time_bucket_aggregation':
        pipeline.push(...this.buildTimeBucketAggregation(request));
        break;
      case 'device_summary':
        pipeline.push(...this.buildDeviceSummaryAggregation(request));
        break;
      case 'trend_analysis':
        pipeline.push(...this.buildTrendAnalysisAggregation(request));
        break;
      case 'anomaly_detection':
        pipeline.push(...this.buildAnomalyDetectionAggregation(request));
        break;
      default:
        pipeline.push(...this.buildDefaultAggregation(request));
    }
    
    // Result limiting and sorting
    if (request.sort) {
      pipeline.push({ $sort: request.sort });
    }
    
    if (request.limit) {
      pipeline.push({ $limit: request.limit });
    }
    
    return pipeline;
  }

  buildTimeBucketAggregation(request) {
    const bucketSize = request.bucketSize || 'hour';
    const bucketFormat = this.getBucketDateFormat(bucketSize);
    
    return [
      {
        $group: {
          _id: {
            time_bucket: {
              $dateFromString: {
                dateString: {
                  $dateToString: {
                    date: '$timestamp',
                    format: bucketFormat
                  }
                }
              }
            },
            device_id: '$metadata.device_id',
            sensor_type: '$metadata.sensor_type'
          },
          
          // Statistical aggregations
          measurement_count: { $sum: 1 },
          
          // Temperature statistics
          avg_temperature: { $avg: '$measurements.temperature' },
          min_temperature: { $min: '$measurements.temperature' },
          max_temperature: { $max: '$measurements.temperature' },
          temp_variance: { $stdDevPop: '$measurements.temperature' },
          
          // Humidity statistics
          avg_humidity: { $avg: '$measurements.humidity' },
          min_humidity: { $min: '$measurements.humidity' },
          max_humidity: { $max: '$measurements.humidity' },
          
          // Pressure statistics
          avg_pressure: { $avg: '$measurements.pressure' },
          pressure_range: {
            $subtract: [
              { $max: '$measurements.pressure' },
              { $min: '$measurements.pressure' }
            ]
          },
          
          // Device health metrics
          avg_battery_level: { $avg: '$measurements.battery_level' },
          min_battery_level: { $min: '$measurements.battery_level' },
          avg_signal_strength: { $avg: '$measurements.signal_strength' },
          
          // Data quality metrics
          data_completeness: {
            $avg: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ['$measurements.temperature', null] },
                    { $ne: ['$measurements.humidity', null] },
                    { $ne: ['$measurements.pressure', null] }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          
          // Time range within bucket
          earliest_reading: { $min: '$timestamp' },
          latest_reading: { $max: '$timestamp' }
        }
      },
      
      // Post-processing and enrichment
      {
        $addFields: {
          time_bucket: '$_id.time_bucket',
          device_id: '$_id.device_id',
          sensor_type: '$_id.sensor_type',
          
          // Calculate additional metrics
          temperature_stability: {
            $cond: {
              if: { $gt: ['$temp_variance', 0] },
              then: { $divide: ['$temp_variance', '$avg_temperature'] },
              else: 0
            }
          },
          
          // Battery consumption rate (simplified)
          estimated_battery_consumption: {
            $subtract: [100, '$avg_battery_level']
          },
          
          // Data quality score
          data_quality_score: {
            $multiply: ['$data_completeness', 100]
          },
          
          // Bucket duration in minutes
          bucket_duration_minutes: {
            $divide: [
              { $subtract: ['$latest_reading', '$earliest_reading'] },
              60000
            ]
          }
        }
      },
      
      // Remove the grouped _id field
      {
        $project: { _id: 0 }
      }
    ];
  }

  buildDeviceSummaryAggregation(request) {
    return [
      {
        $group: {
          _id: '$metadata.device_id',
          
          // Basic metrics
          total_readings: { $sum: 1 },
          sensor_types: { $addToSet: '$metadata.sensor_type' },
          locations: { $addToSet: '$metadata.location' },
          
          // Time range
          first_reading: { $min: '$timestamp' },
          last_reading: { $max: '$timestamp' },
          
          // Environmental averages
          avg_temperature: { $avg: '$measurements.temperature' },
          avg_humidity: { $avg: '$measurements.humidity' },
          avg_pressure: { $avg: '$measurements.pressure' },
          
          // Environmental ranges
          temperature_range: {
            $subtract: [
              { $max: '$measurements.temperature' },
              { $min: '$measurements.temperature' }
            ]
          },
          humidity_range: {
            $subtract: [
              { $max: '$measurements.humidity' },
              { $min: '$measurements.humidity' }
            ]
          },
          
          // Device health metrics
          current_battery_level: { $last: '$measurements.battery_level' },
          min_battery_level: { $min: '$measurements.battery_level' },
          avg_signal_strength: { $avg: '$measurements.signal_strength' },
          min_signal_strength: { $min: '$measurements.signal_strength' },
          
          // Data quality assessment
          complete_readings: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ['$measurements.temperature', null] },
                    { $ne: ['$measurements.humidity', null] },
                    { $ne: ['$measurements.pressure', null] }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          }
        }
      },
      
      {
        $addFields: {
          device_id: '$_id',
          
          // Operational duration
          operational_duration_hours: {
            $divide: [
              { $subtract: ['$last_reading', '$first_reading'] },
              3600000
            ]
          },
          
          // Reading frequency
          avg_reading_interval_minutes: {
            $cond: {
              if: { $gt: ['$total_readings', 1] },
              then: {
                $divide: [
                  { $subtract: ['$last_reading', '$first_reading'] },
                  { $multiply: [{ $subtract: ['$total_readings', 1] }, 60000] }
                ]
              },
              else: null
            }
          },
          
          // Data completeness percentage
          data_completeness_percent: {
            $multiply: [
              { $divide: ['$complete_readings', '$total_readings'] },
              100
            ]
          },
          
          // Device health status
          device_health_status: {
            $switch: {
              branches: [
                {
                  case: { $lt: ['$current_battery_level', 15] },
                  then: 'critical_battery'
                },
                {
                  case: { $lt: ['$avg_signal_strength', 30] },
                  then: 'poor_connectivity'
                },
                {
                  case: {
                    $lt: [
                      { $divide: ['$complete_readings', '$total_readings'] },
                      0.8
                    ]
                  },
                  then: 'data_quality_issues'
                }
              ],
              default: 'healthy'
            }
          }
        }
      },
      
      {
        $project: { _id: 0 }
      }
    ];
  }

  getBucketDateFormat(bucketSize) {
    const formats = {
      'minute': '%Y-%m-%d %H:%M:00',
      'hour': '%Y-%m-%d %H:00:00',
      'day': '%Y-%m-%d 00:00:00',
      'week': '%Y-%U 00:00:00', // Year-Week
      'month': '%Y-%m-01 00:00:00'
    };
    
    return formats[bucketSize] || formats['hour'];
  }

  async setupRetentionPolicies() {
    console.log('Setting up automatic data retention policies...');
    
    try {
      for (const [collectionName, collectionInfo] of this.collections.entries()) {
        // Configure TTL indexes for automatic expiration
        const collection = collectionInfo.collection;
        
        await collection.createIndex(
          { timestamp: 1 },
          {
            name: 'ttl_index',
            expireAfterSeconds: collectionInfo.config.expireAfterSeconds,
            background: true
          }
        );
        
        console.log(`Retention policy configured for ${collectionName}: ${collectionInfo.config.expireAfterSeconds} seconds`);
      }
      
    } catch (error) {
      console.error('Error setting up retention policies:', error);
      throw error;
    }
  }

  async setupPreAggregationPipelines() {
    console.log('Setting up pre-aggregation pipelines...');
    
    // This would typically involve setting up MongoDB change streams
    // or scheduled aggregation jobs for common query patterns
    
    for (const level of this.config.aggregationLevels) {
      const pipelineName = `pre_aggregation_${level}`;
      
      // Store pipeline configuration for later execution
      this.aggregationPipelines.set(pipelineName, {
        level: level,
        schedule: this.getAggregationSchedule(level),
        pipeline: this.buildPreAggregationPipeline(level)
      });
      
      console.log(`Pre-aggregation pipeline configured for ${level} level`);
    }
  }

  // Utility methods for time series management
  
  calculateAverageDocumentSize(documents) {
    if (!documents || documents.length === 0) return 0;
    
    const totalSize = documents.reduce((size, doc) => {
      return size + JSON.stringify(doc).length;
    }, 0);
    
    return Math.round(totalSize / documents.length);
  }

  assessDataQuality(document) {
    let qualityScore = 0;
    let totalChecks = 0;
    
    // Check for presence of key measurements
    const measurements = ['temperature', 'humidity', 'pressure'];
    for (const measurement of measurements) {
      totalChecks++;
      if (document[measurement] !== null && document[measurement] !== undefined) {
        qualityScore++;
      }
    }
    
    // Check for reasonable value ranges
    if (document.temperature !== null && document.temperature >= -50 && document.temperature <= 100) {
      qualityScore += 0.5;
    }
    totalChecks += 0.5;
    
    if (document.humidity !== null && document.humidity >= 0 && document.humidity <= 100) {
      qualityScore += 0.5;
    }
    totalChecks += 0.5;
    
    return totalChecks > 0 ? qualityScore / totalChecks : 0;
  }

  extractCustomMeasurements(document) {
    const customMeasurements = {};
    const standardFields = ['timestamp', 'device_id', 'sensor_type', 'location', 'metadata', 'temperature', 'humidity', 'pressure', 'battery_level', 'signal_strength'];
    
    for (const [key, value] of Object.entries(document)) {
      if (!standardFields.includes(key) && typeof value === 'number') {
        customMeasurements[key] = value;
      }
    }
    
    return customMeasurements;
  }

  removeUndefinedValues(obj) {
    Object.keys(obj).forEach(key => {
      if (obj[key] === undefined) {
        delete obj[key];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.removeUndefinedValues(obj[key]);
        
        // Remove empty objects
        if (Object.keys(obj[key]).length === 0) {
          delete obj[key];
        }
      }
    });
  }

  processAggregationResults(results, request) {
    // Add additional context and calculations to aggregation results
    return results.map(result => ({
      ...result,
      
      // Add computed fields based on aggregation type
      aggregation_metadata: {
        request_type: request.type,
        generated_at: new Date(),
        bucket_size: request.bucketSize,
        time_range: request.timeRange
      }
    }));
  }

  estimateDataPointsAnalyzed(request) {
    // Simplified estimation based on time range and expected frequency
    if (!request.timeRange) return 'unknown';
    
    const timeRangeMs = new Date(request.timeRange.end) - new Date(request.timeRange.start);
    const assumedFrequencyMs = 60000; // Assume 1 minute intervals
    
    return Math.round(timeRangeMs / assumedFrequencyMs);
  }

  getAggregationSchedule(level) {
    const schedules = {
      'hourly': '0 */1 * * * *',     // Every hour
      'daily': '0 0 */1 * * *',      // Every day at midnight
      'weekly': '0 0 0 */7 * *',     // Every week
      'monthly': '0 0 0 1 */1 *'     // Every month on 1st
    };
    
    return schedules[level] || schedules['daily'];
  }

  buildPreAggregationPipeline(level) {
    // Simplified pre-aggregation pipeline
    // In production, this would be much more sophisticated
    return [
      {
        $match: {
          timestamp: {
            $gte: new Date(Date.now() - this.getLevelTimeRange(level))
          }
        }
      },
      {
        $group: {
          _id: {
            device_id: '$metadata.device_id',
            time_bucket: this.getTimeBucketExpression(level)
          },
          avg_temperature: { $avg: '$measurements.temperature' },
          avg_humidity: { $avg: '$measurements.humidity' },
          count: { $sum: 1 }
        }
      }
    ];
  }

  getLevelTimeRange(level) {
    const ranges = {
      'hourly': 24 * 60 * 60 * 1000,      // 1 day
      'daily': 30 * 24 * 60 * 60 * 1000,  // 30 days
      'weekly': 12 * 7 * 24 * 60 * 60 * 1000, // 12 weeks
      'monthly': 12 * 30 * 24 * 60 * 60 * 1000 // 12 months
    };
    
    return ranges[level] || ranges['daily'];
  }

  getTimeBucketExpression(level) {
    const expressions = {
      'hourly': {
        $dateFromString: {
          dateString: {
            $dateToString: {
              date: '$timestamp',
              format: '%Y-%m-%d %H:00:00'
            }
          }
        }
      },
      'daily': {
        $dateFromString: {
          dateString: {
            $dateToString: {
              date: '$timestamp',
              format: '%Y-%m-%d 00:00:00'
            }
          }
        }
      }
    };
    
    return expressions[level] || expressions['hourly'];
  }
}

// Benefits of MongoDB Advanced Time Series Collections:
// - Purpose-built storage optimization with automatic compression
// - Intelligent bucketing for optimal query performance  
// - Built-in retention policies and automatic data expiration
// - Advanced indexing strategies optimized for temporal queries
// - Schema flexibility for diverse sensor and measurement data
// - Native aggregation capabilities for time series analytics
// - Automatic storage optimization and compression
// - High ingestion performance for IoT and monitoring workloads
// - Built-in support for metadata organization and filtering
// - SQL-compatible time series operations through QueryLeaf integration

module.exports = {
  AdvancedTimeSeriesManager
};
```

## Understanding MongoDB Time Series Architecture

### Advanced Temporal Data Management and Storage Optimization Strategies

Implement sophisticated time series patterns for production MongoDB deployments:

```javascript
// Production-ready MongoDB time series with enterprise-grade optimization and monitoring
class ProductionTimeSeriesManager extends AdvancedTimeSeriesManager {
  constructor(db, productionConfig) {
    super(db, productionConfig);
    
    this.productionConfig = {
      ...productionConfig,
      enableDistributedCollection: true,
      enableRealTimeAggregation: true,
      enablePredictiveAnalytics: true,
      enableAutomaticScaling: true,
      enableComplianceTracking: true,
      enableAdvancedAlerting: true
    };
    
    this.setupProductionOptimizations();
    this.initializeRealTimeProcessing();
    this.setupPredictiveAnalytics();
  }

  async implementDistributedTimeSeriesProcessing(collections, distributionStrategy) {
    console.log('Implementing distributed time series processing across multiple collections...');
    
    const distributedStrategy = {
      // Temporal sharding strategies
      temporalSharding: {
        enableTimeBasedSharding: true,
        shardingGranularity: 'monthly',
        automaticShardRotation: true,
        optimizeForQueryPatterns: true
      },
      
      // Data lifecycle management
      lifecycleManagement: {
        hotDataRetention: '7d',
        warmDataRetention: '90d', 
        coldDataArchival: '1y',
        automaticTiering: true
      },
      
      // Performance optimization
      performanceOptimization: {
        compressionOptimization: true,
        indexingOptimization: true,
        bucketingOptimization: true,
        aggregationOptimization: true
      }
    };

    return await this.deployDistributedTimeSeriesArchitecture(collections, distributedStrategy);
  }

  async setupAdvancedTimeSeriesAnalytics() {
    console.log('Setting up advanced time series analytics and machine learning capabilities...');
    
    const analyticsCapabilities = {
      // Real-time analytics
      realTimeAnalytics: {
        streamingAggregation: true,
        anomalyDetection: true,
        trendAnalysis: true,
        alertingPipelines: true
      },
      
      // Predictive analytics
      predictiveAnalytics: {
        forecastingModels: true,
        patternRecognition: true,
        seasonalityDetection: true,
        capacityPlanning: true
      },
      
      // Advanced reporting
      reportingCapabilities: {
        automaticDashboards: true,
        customMetrics: true,
        correlationAnalysis: true,
        performanceReporting: true
      }
    };

    return await this.deployAdvancedAnalytics(analyticsCapabilities);
  }
}
```

## SQL-Style Time Series Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB time series operations and analytics:

```sql
-- QueryLeaf advanced time series operations with SQL-familiar syntax for MongoDB

-- Create optimized time series collection with advanced configuration
CREATE COLLECTION sensor_data AS TIME_SERIES (
  time_field = 'timestamp',
  meta_field = 'metadata',
  granularity = 'seconds',
  
  -- Storage optimization
  bucket_max_span_seconds = 3600,
  bucket_rounding_seconds = 60,
  expire_after_seconds = 2592000,  -- 30 days
  
  -- Compression settings
  enable_compression = true,
  compression_algorithm = 'zstd',
  
  -- Performance optimization
  enable_automatic_indexing = true,
  optimize_for_ingestion = true,
  optimize_for_analytics = true
);

-- Advanced time series data insertion with automatic optimization
INSERT INTO sensor_data (
  timestamp,
  metadata.device_id,
  metadata.sensor_type,
  metadata.location,
  metadata.data_quality,
  measurements.temperature,
  measurements.humidity,
  measurements.pressure,
  measurements.battery_level,
  measurements.signal_strength
)
SELECT 
  -- Time series specific timestamp handling
  CASE 
    WHEN source_timestamp IS NOT NULL THEN source_timestamp
    ELSE CURRENT_TIMESTAMP
  END as timestamp,
  
  -- Metadata organization for optimal bucketing
  device_identifier as "metadata.device_id",
  sensor_classification as "metadata.sensor_type", 
  installation_location as "metadata.location",
  
  -- Data quality assessment
  CASE 
    WHEN temp_reading IS NOT NULL AND humidity_reading IS NOT NULL AND pressure_reading IS NOT NULL THEN 'complete'
    WHEN temp_reading IS NOT NULL OR humidity_reading IS NOT NULL THEN 'partial'
    ELSE 'incomplete'
  END as "metadata.data_quality",
  
  -- Validated measurements
  CASE 
    WHEN temp_reading BETWEEN -50 AND 100 THEN ROUND(temp_reading, 2)
    ELSE NULL
  END as "measurements.temperature",
  
  CASE 
    WHEN humidity_reading BETWEEN 0 AND 100 THEN ROUND(humidity_reading, 1)
    ELSE NULL  
  END as "measurements.humidity",
  
  CASE 
    WHEN pressure_reading BETWEEN 900 AND 1100 THEN ROUND(pressure_reading, 1)
    ELSE NULL
  END as "measurements.pressure",
  
  -- Device health measurements
  GREATEST(0, LEAST(100, battery_percentage)) as "measurements.battery_level",
  GREATEST(0, LEAST(100, connectivity_strength)) as "measurements.signal_strength"
  
FROM staging_sensor_readings
WHERE ingestion_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
  AND device_identifier IS NOT NULL
  AND source_timestamp IS NOT NULL

-- Time series bulk insert configuration
WITH (
  batch_size = 5000,
  ordered_operations = false,
  write_concern = 'majority',
  enable_compression = true,
  bypass_document_validation = false
);

-- Advanced time-bucket aggregation with comprehensive analytics
WITH time_bucket_analysis AS (
  SELECT 
    -- Time bucketing with flexible granularity
    DATE_TRUNC('hour', timestamp) as time_bucket,
    metadata.device_id,
    metadata.sensor_type,
    metadata.location,
    
    -- Volume metrics
    COUNT(*) as reading_count,
    COUNT(measurements.temperature) as temp_reading_count,
    COUNT(measurements.humidity) as humidity_reading_count,
    COUNT(measurements.pressure) as pressure_reading_count,
    
    -- Temperature analytics
    AVG(measurements.temperature) as avg_temperature,
    MIN(measurements.temperature) as min_temperature,
    MAX(measurements.temperature) as max_temperature,
    STDDEV_POP(measurements.temperature) as temp_stddev,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY measurements.temperature) as temp_median,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY measurements.temperature) as temp_p95,
    
    -- Humidity analytics
    AVG(measurements.humidity) as avg_humidity,
    MIN(measurements.humidity) as min_humidity,
    MAX(measurements.humidity) as max_humidity,
    STDDEV_POP(measurements.humidity) as humidity_stddev,
    
    -- Pressure analytics  
    AVG(measurements.pressure) as avg_pressure,
    MIN(measurements.pressure) as min_pressure,
    MAX(measurements.pressure) as max_pressure,
    (MAX(measurements.pressure) - MIN(measurements.pressure)) as pressure_range,
    
    -- Device health analytics
    AVG(measurements.battery_level) as avg_battery,
    MIN(measurements.battery_level) as min_battery,
    AVG(measurements.signal_strength) as avg_signal,
    MIN(measurements.signal_strength) as min_signal,
    
    -- Data quality analytics
    (COUNT(measurements.temperature) * 100.0 / COUNT(*)) as temp_completeness_percent,
    (COUNT(measurements.humidity) * 100.0 / COUNT(*)) as humidity_completeness_percent,
    (COUNT(measurements.pressure) * 100.0 / COUNT(*)) as pressure_completeness_percent,
    
    -- Time range within bucket
    MIN(timestamp) as bucket_start_time,
    MAX(timestamp) as bucket_end_time,
    
    -- Advanced statistical measures
    (MAX(measurements.temperature) - MIN(measurements.temperature)) as temp_range,
    CASE 
      WHEN AVG(measurements.temperature) > 0 THEN 
        STDDEV_POP(measurements.temperature) / AVG(measurements.temperature) 
      ELSE NULL
    END as temp_coefficient_variation
    
  FROM sensor_data
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND timestamp < CURRENT_TIMESTAMP
    AND metadata.data_quality IN ('complete', 'partial')
  GROUP BY 
    DATE_TRUNC('hour', timestamp),
    metadata.device_id,
    metadata.sensor_type,
    metadata.location
),

anomaly_detection AS (
  SELECT 
    tba.*,
    
    -- Temperature anomaly detection
    CASE 
      WHEN temp_stddev > 0 THEN
        ABS(avg_temperature - LAG(avg_temperature) OVER (
          PARTITION BY device_id 
          ORDER BY time_bucket
        )) / temp_stddev
      ELSE 0
    END as temp_anomaly_score,
    
    -- Humidity anomaly detection  
    CASE 
      WHEN humidity_stddev > 0 THEN
        ABS(avg_humidity - LAG(avg_humidity) OVER (
          PARTITION BY device_id 
          ORDER BY time_bucket
        )) / humidity_stddev
      ELSE 0
    END as humidity_anomaly_score,
    
    -- Battery degradation analysis
    LAG(avg_battery) OVER (
      PARTITION BY device_id 
      ORDER BY time_bucket
    ) - avg_battery as battery_degradation,
    
    -- Signal strength trend
    avg_signal - LAG(avg_signal) OVER (
      PARTITION BY device_id 
      ORDER BY time_bucket
    ) as signal_trend,
    
    -- Data quality trend
    (temp_completeness_percent + humidity_completeness_percent + pressure_completeness_percent) / 3.0 as overall_completeness,
    
    -- Bucket characteristics
    EXTRACT(MINUTES FROM (bucket_end_time - bucket_start_time)) as bucket_duration_minutes
    
  FROM time_bucket_analysis tba
),

device_health_assessment AS (
  SELECT 
    ad.device_id,
    ad.sensor_type,
    ad.location,
    COUNT(*) as analysis_periods,
    
    -- Environmental stability analysis
    AVG(ad.avg_temperature) as device_avg_temperature,
    STDDEV(ad.avg_temperature) as temperature_stability,
    AVG(ad.temp_coefficient_variation) as avg_temp_variability,
    
    -- Environmental range analysis
    MIN(ad.min_temperature) as absolute_min_temperature,
    MAX(ad.max_temperature) as absolute_max_temperature,
    AVG(ad.temp_range) as avg_hourly_temp_range,
    
    -- Humidity environment analysis
    AVG(ad.avg_humidity) as device_avg_humidity,
    STDDEV(ad.avg_humidity) as humidity_stability,
    AVG(ad.pressure_range) as avg_pressure_variation,
    
    -- Device health metrics
    MIN(ad.min_battery) as lowest_battery_level,
    AVG(ad.avg_battery) as avg_battery_level,
    MAX(ad.battery_degradation) as max_battery_drop_per_hour,
    
    -- Connectivity analysis
    AVG(ad.avg_signal) as avg_connectivity,
    MIN(ad.min_signal) as worst_connectivity,
    STDDEV(ad.avg_signal) as connectivity_stability,
    
    -- Data reliability metrics
    AVG(ad.overall_completeness) as avg_data_completeness,
    MIN(ad.overall_completeness) as worst_data_completeness,
    
    -- Anomaly frequency
    COUNT(*) FILTER (WHERE ad.temp_anomaly_score > 2) as temp_anomaly_count,
    COUNT(*) FILTER (WHERE ad.humidity_anomaly_score > 2) as humidity_anomaly_count,
    AVG(ad.temp_anomaly_score) as avg_temp_anomaly_score,
    
    -- Recent trends (last 6 hours vs previous)
    AVG(CASE WHEN ad.time_bucket >= CURRENT_TIMESTAMP - INTERVAL '6 hours' 
             THEN ad.avg_battery ELSE NULL END) - 
    AVG(CASE WHEN ad.time_bucket < CURRENT_TIMESTAMP - INTERVAL '6 hours' 
             THEN ad.avg_battery ELSE NULL END) as recent_battery_trend,
             
    AVG(CASE WHEN ad.time_bucket >= CURRENT_TIMESTAMP - INTERVAL '6 hours' 
             THEN ad.avg_signal ELSE NULL END) - 
    AVG(CASE WHEN ad.time_bucket < CURRENT_TIMESTAMP - INTERVAL '6 hours' 
             THEN ad.avg_signal ELSE NULL END) as recent_signal_trend
    
  FROM anomaly_detection ad
  GROUP BY ad.device_id, ad.sensor_type, ad.location
)

SELECT 
  dha.device_id,
  dha.sensor_type,
  dha.location,
  dha.analysis_periods,
  
  -- Environmental summary
  ROUND(dha.device_avg_temperature, 2) as avg_temperature,
  ROUND(dha.temperature_stability, 3) as temp_stability_stddev,
  ROUND(dha.avg_temp_variability, 3) as avg_temp_coefficient_variation,
  dha.absolute_min_temperature,
  dha.absolute_max_temperature,
  
  -- Environmental classification
  CASE 
    WHEN dha.temperature_stability > 5 THEN 'highly_variable'
    WHEN dha.temperature_stability > 2 THEN 'moderately_variable'  
    WHEN dha.temperature_stability > 1 THEN 'stable'
    ELSE 'very_stable'
  END as temperature_environment_classification,
  
  -- Device health summary
  ROUND(dha.avg_battery_level, 1) as avg_battery_level,
  dha.lowest_battery_level,
  ROUND(dha.max_battery_drop_per_hour, 2) as max_hourly_battery_consumption,
  ROUND(dha.avg_connectivity, 1) as avg_signal_strength,
  
  -- Device status assessment
  CASE 
    WHEN dha.lowest_battery_level < 15 THEN 'critical_battery'
    WHEN dha.avg_battery_level < 25 THEN 'low_battery'
    WHEN dha.avg_connectivity < 30 THEN 'connectivity_issues'
    WHEN dha.avg_data_completeness < 80 THEN 'data_quality_issues'
    WHEN dha.temp_anomaly_count > dha.analysis_periods * 0.2 THEN 'environmental_anomalies'
    ELSE 'healthy'
  END as device_status,
  
  -- Data quality assessment
  ROUND(dha.avg_data_completeness, 1) as avg_data_completeness_percent,
  dha.worst_data_completeness,
  
  -- Anomaly summary
  dha.temp_anomaly_count,
  dha.humidity_anomaly_count,
  ROUND(dha.avg_temp_anomaly_score, 3) as avg_temp_anomaly_score,
  
  -- Recent trends
  ROUND(dha.recent_battery_trend, 2) as recent_battery_change,
  ROUND(dha.recent_signal_trend, 1) as recent_signal_change,
  
  -- Trend classification
  CASE 
    WHEN dha.recent_battery_trend < -2 THEN 'battery_degrading_fast'
    WHEN dha.recent_battery_trend < -0.5 THEN 'battery_degrading'
    WHEN dha.recent_battery_trend > 1 THEN 'battery_improving'  -- Could indicate replacement
    ELSE 'battery_stable'
  END as battery_trend_classification,
  
  CASE 
    WHEN dha.recent_signal_trend < -5 THEN 'connectivity_degrading'
    WHEN dha.recent_signal_trend > 5 THEN 'connectivity_improving'
    ELSE 'connectivity_stable'
  END as connectivity_trend_classification,
  
  -- Alert generation
  ARRAY[
    CASE WHEN dha.lowest_battery_level < 10 THEN 'CRITICAL: Battery critically low' END,
    CASE WHEN dha.avg_connectivity < 25 THEN 'WARNING: Poor connectivity detected' END,
    CASE WHEN dha.avg_data_completeness < 70 THEN 'WARNING: Low data quality' END,
    CASE WHEN dha.recent_battery_trend < -3 THEN 'ALERT: Rapid battery degradation' END,
    CASE WHEN dha.temp_anomaly_count > dha.analysis_periods * 0.3 THEN 'ALERT: Frequent temperature anomalies' END
  ]::TEXT[] as active_alerts,
  
  -- Recommendations
  CASE 
    WHEN dha.lowest_battery_level < 15 THEN 'Schedule immediate battery replacement'
    WHEN dha.avg_connectivity < 30 THEN 'Check network coverage and device positioning'  
    WHEN dha.avg_data_completeness < 80 THEN 'Inspect sensors and perform calibration'
    WHEN dha.temp_anomaly_count > dha.analysis_periods * 0.2 THEN 'Investigate environmental factors'
    ELSE 'Device operating within normal parameters'
  END as maintenance_recommendation

FROM device_health_assessment dha
ORDER BY 
  CASE 
    WHEN dha.lowest_battery_level < 15 THEN 1
    WHEN dha.avg_connectivity < 30 THEN 2
    WHEN dha.avg_data_completeness < 80 THEN 3
    ELSE 4
  END,
  dha.device_id;

-- Advanced time series trend analysis with seasonality detection
WITH daily_aggregates AS (
  SELECT 
    DATE_TRUNC('day', timestamp) as date_bucket,
    metadata.location,
    metadata.sensor_type,
    
    -- Daily environmental summaries
    AVG(measurements.temperature) as daily_avg_temp,
    MIN(measurements.temperature) as daily_min_temp,
    MAX(measurements.temperature) as daily_max_temp,
    AVG(measurements.humidity) as daily_avg_humidity,
    AVG(measurements.pressure) as daily_avg_pressure,
    
    -- Data volume and quality
    COUNT(*) as daily_reading_count,
    (COUNT(measurements.temperature) * 100.0 / COUNT(*)) as daily_completeness
    
  FROM sensor_data
  WHERE timestamp >= CURRENT_DATE - INTERVAL '90 days'
    AND timestamp < CURRENT_DATE
    AND metadata.location IS NOT NULL
  GROUP BY DATE_TRUNC('day', timestamp), metadata.location, metadata.sensor_type
),

weekly_patterns AS (
  SELECT 
    da.*,
    EXTRACT(DOW FROM da.date_bucket) as day_of_week,  -- 0=Sunday, 6=Saturday
    EXTRACT(WEEK FROM da.date_bucket) as week_number,
    
    -- Moving averages for trend analysis
    AVG(da.daily_avg_temp) OVER (
      PARTITION BY da.location, da.sensor_type
      ORDER BY da.date_bucket
      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) as temp_7day_avg,
    
    AVG(da.daily_avg_temp) OVER (
      PARTITION BY da.location, da.sensor_type  
      ORDER BY da.date_bucket
      ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ) as temp_30day_avg,
    
    -- Trend detection
    da.daily_avg_temp - LAG(da.daily_avg_temp, 7) OVER (
      PARTITION BY da.location, da.sensor_type
      ORDER BY da.date_bucket
    ) as week_over_week_temp_change,
    
    -- Seasonality indicators
    LAG(da.daily_avg_temp, 7) OVER (
      PARTITION BY da.location, da.sensor_type
      ORDER BY da.date_bucket
    ) as same_day_last_week_temp,
    
    LAG(da.daily_avg_temp, 30) OVER (
      PARTITION BY da.location, da.sensor_type  
      ORDER BY da.date_bucket
    ) as same_day_last_month_temp
    
  FROM daily_aggregates da
),

trend_analysis AS (
  SELECT 
    wp.location,
    wp.sensor_type,
    COUNT(*) as analysis_days,
    
    -- Overall trend analysis
    AVG(wp.daily_avg_temp) as overall_avg_temp,
    STDDEV(wp.daily_avg_temp) as temp_variability,
    MIN(wp.daily_min_temp) as absolute_min_temp,
    MAX(wp.daily_max_temp) as absolute_max_temp,
    
    -- Seasonal pattern analysis  
    AVG(CASE WHEN wp.day_of_week IN (0,6) THEN wp.daily_avg_temp END) as weekend_avg_temp,
    AVG(CASE WHEN wp.day_of_week BETWEEN 1 AND 5 THEN wp.daily_avg_temp END) as weekday_avg_temp,
    
    -- Weekly cyclical patterns
    AVG(CASE WHEN wp.day_of_week = 0 THEN wp.daily_avg_temp END) as sunday_avg,
    AVG(CASE WHEN wp.day_of_week = 1 THEN wp.daily_avg_temp END) as monday_avg,
    AVG(CASE WHEN wp.day_of_week = 2 THEN wp.daily_avg_temp END) as tuesday_avg,
    AVG(CASE WHEN wp.day_of_week = 3 THEN wp.daily_avg_temp END) as wednesday_avg,
    AVG(CASE WHEN wp.day_of_week = 4 THEN wp.daily_avg_temp END) as thursday_avg,
    AVG(CASE WHEN wp.day_of_week = 5 THEN wp.daily_avg_temp END) as friday_avg,
    AVG(CASE WHEN wp.day_of_week = 6 THEN wp.daily_avg_temp END) as saturday_avg,
    
    -- Trend strength analysis
    AVG(wp.week_over_week_temp_change) as avg_weekly_change,
    STDDEV(wp.week_over_week_temp_change) as weekly_change_variability,
    
    -- Linear trend approximation (simplified)
    (MAX(wp.temp_30day_avg) - MIN(wp.temp_30day_avg)) / 
    NULLIF(EXTRACT(DAYS FROM MAX(wp.date_bucket) - MIN(wp.date_bucket)), 0) as daily_trend_rate,
    
    -- Data quality trend
    AVG(wp.daily_completeness) as avg_data_completeness,
    MIN(wp.daily_completeness) as worst_daily_completeness
    
  FROM weekly_patterns wp
  WHERE wp.date_bucket >= CURRENT_DATE - INTERVAL '60 days'  -- Focus on last 60 days for trends
  GROUP BY wp.location, wp.sensor_type
)

SELECT 
  ta.location,
  ta.sensor_type,
  ta.analysis_days,
  
  -- Environmental summary
  ROUND(ta.overall_avg_temp, 2) as avg_temperature,
  ROUND(ta.temp_variability, 2) as temperature_variability,
  ta.absolute_min_temp,
  ta.absolute_max_temp,
  
  -- Seasonal patterns
  ROUND(COALESCE(ta.weekday_avg_temp, 0), 2) as weekday_avg_temp,
  ROUND(COALESCE(ta.weekend_avg_temp, 0), 2) as weekend_avg_temp,
  ROUND(COALESCE(ta.weekend_avg_temp - ta.weekday_avg_temp, 0), 2) as weekend_weekday_diff,
  
  -- Weekly pattern analysis (day of week variations)
  JSON_OBJECT(
    'sunday', ROUND(COALESCE(ta.sunday_avg, 0), 2),
    'monday', ROUND(COALESCE(ta.monday_avg, 0), 2),
    'tuesday', ROUND(COALESCE(ta.tuesday_avg, 0), 2),
    'wednesday', ROUND(COALESCE(ta.wednesday_avg, 0), 2),
    'thursday', ROUND(COALESCE(ta.thursday_avg, 0), 2),
    'friday', ROUND(COALESCE(ta.friday_avg, 0), 2),
    'saturday', ROUND(COALESCE(ta.saturday_avg, 0), 2)
  ) as daily_temperature_pattern,
  
  -- Trend analysis
  ROUND(ta.avg_weekly_change, 3) as avg_weekly_temperature_change,
  ROUND(ta.daily_trend_rate * 30, 3) as monthly_trend_rate,
  
  -- Trend classification
  CASE 
    WHEN ta.daily_trend_rate > 0.1 THEN 'warming_trend'
    WHEN ta.daily_trend_rate < -0.1 THEN 'cooling_trend'
    ELSE 'stable'
  END as temperature_trend_classification,
  
  -- Seasonal pattern classification
  CASE 
    WHEN ABS(COALESCE(ta.weekend_avg_temp - ta.weekday_avg_temp, 0)) > 2 THEN 'strong_weekly_pattern'
    WHEN ABS(COALESCE(ta.weekend_avg_temp - ta.weekday_avg_temp, 0)) > 1 THEN 'moderate_weekly_pattern'
    ELSE 'minimal_weekly_pattern'
  END as weekly_seasonality,
  
  -- Variability assessment
  CASE 
    WHEN ta.temp_variability > 5 THEN 'highly_variable'
    WHEN ta.temp_variability > 2 THEN 'moderately_variable'
    ELSE 'stable_environment'
  END as environment_stability,
  
  -- Data quality assessment
  ROUND(ta.avg_data_completeness, 1) as avg_data_completeness_percent,
  
  -- Insights and recommendations
  CASE 
    WHEN ABS(ta.daily_trend_rate) > 0.1 THEN 'Monitor for environmental changes'
    WHEN ta.temp_variability > 5 THEN 'High variability - check for external factors'
    WHEN ta.avg_data_completeness < 90 THEN 'Improve sensor reliability'
    ELSE 'Environment stable, monitoring nominal'
  END as analysis_recommendation

FROM trend_analysis ta
WHERE ta.analysis_days >= 30  -- Require at least 30 days for meaningful trend analysis
ORDER BY 
  ABS(ta.daily_trend_rate) DESC,  -- Show locations with strongest trends first
  ta.temp_variability DESC,
  ta.location, 
  ta.sensor_type;

-- Time series data retention and archival with automated lifecycle management
WITH retention_analysis AS (
  SELECT 
    -- Analyze data age distribution
    DATE_TRUNC('day', timestamp) as date_bucket,
    metadata.location,
    COUNT(*) as daily_record_count,
    AVG(JSON_EXTRACT_PATH_TEXT(measurements, 'temperature')::NUMERIC) as daily_avg_temp,
    
    -- Data age categories
    CASE 
      WHEN timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 'hot_data'
      WHEN timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 'warm_data' 
      WHEN timestamp >= CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'cold_data'
      ELSE 'archive_candidate'
    END as data_tier,
    
    -- Storage impact estimation
    COUNT(*) * 500 as estimated_storage_bytes,  -- Assume ~500 bytes per document
    
    -- Access pattern analysis (simplified)
    CURRENT_DATE - DATE_TRUNC('day', timestamp)::DATE as days_old
    
  FROM sensor_data
  WHERE timestamp >= CURRENT_DATE - INTERVAL '180 days'  -- Analyze last 6 months
  GROUP BY DATE_TRUNC('day', timestamp), metadata.location
),

archival_candidates AS (
  SELECT 
    ra.location,
    ra.data_tier,
    COUNT(*) as total_days,
    SUM(ra.daily_record_count) as total_records,
    SUM(ra.estimated_storage_bytes) as total_estimated_bytes,
    MIN(ra.days_old) as newest_data_age_days,
    MAX(ra.days_old) as oldest_data_age_days,
    AVG(ra.daily_avg_temp) as avg_temperature_for_tier
    
  FROM retention_analysis ra
  GROUP BY ra.location, ra.data_tier
),

archival_recommendations AS (
  SELECT 
    ac.location,
    ac.data_tier,
    ac.total_records,
    ROUND(ac.total_estimated_bytes / 1024.0 / 1024.0, 2) as estimated_storage_mb,
    ac.oldest_data_age_days,
    
    -- Archival recommendations
    CASE ac.data_tier
      WHEN 'archive_candidate' THEN 'ARCHIVE: Move to cold storage or delete'
      WHEN 'cold_data' THEN 'CONSIDER: Compress or move to slower storage'
      WHEN 'warm_data' THEN 'OPTIMIZE: Apply compression if not already done'
      ELSE 'KEEP: Hot data for active queries'
    END as retention_recommendation,
    
    -- Priority scoring for archival actions
    CASE 
      WHEN ac.data_tier = 'archive_candidate' AND ac.total_estimated_bytes > 100*1024*1024 THEN 'high_priority'
      WHEN ac.data_tier = 'cold_data' AND ac.total_estimated_bytes > 50*1024*1024 THEN 'medium_priority'
      WHEN ac.data_tier IN ('archive_candidate', 'cold_data') THEN 'low_priority'
      ELSE 'no_action_needed'
    END as archival_priority,
    
    -- Estimated storage savings
    CASE ac.data_tier
      WHEN 'archive_candidate' THEN ac.total_estimated_bytes * 0.9  -- 90% savings from deletion
      WHEN 'cold_data' THEN ac.total_estimated_bytes * 0.6  -- 60% savings from compression
      ELSE 0
    END as potential_storage_savings_bytes
    
  FROM archival_candidates ac
)

SELECT 
  ar.location,
  ar.data_tier,
  ar.total_records,
  ar.estimated_storage_mb,
  ar.oldest_data_age_days,
  ar.retention_recommendation,
  ar.archival_priority,
  ROUND(ar.potential_storage_savings_bytes / 1024.0 / 1024.0, 2) as potential_savings_mb,
  
  -- Specific actions
  CASE ar.data_tier
    WHEN 'archive_candidate' THEN 
      FORMAT('DELETE FROM sensor_data WHERE timestamp < CURRENT_DATE - INTERVAL ''%s days'' AND metadata.location = ''%s''', 
             ar.oldest_data_age_days, ar.location)
    WHEN 'cold_data' THEN
      FORMAT('Consider enabling compression for location: %s', ar.location)
    ELSE 'No action required'
  END as suggested_action
  
FROM archival_recommendations ar
WHERE ar.archival_priority != 'no_action_needed'
ORDER BY 
  CASE ar.archival_priority
    WHEN 'high_priority' THEN 1
    WHEN 'medium_priority' THEN 2  
    WHEN 'low_priority' THEN 3
    ELSE 4
  END,
  ar.estimated_storage_mb DESC;

-- QueryLeaf provides comprehensive MongoDB time series capabilities:
-- 1. Purpose-built time series collections with automatic optimization
-- 2. Advanced temporal aggregation with statistical analysis
-- 3. Intelligent bucketing and compression for storage efficiency
-- 4. Built-in retention policies and lifecycle management
-- 5. Real-time analytics and anomaly detection
-- 6. Comprehensive trend analysis and seasonality detection
-- 7. SQL-familiar syntax for complex time series operations
-- 8. Automatic indexing and query optimization
-- 9. Production-ready time series analytics and reporting
-- 10. Integration with MongoDB's native time series optimizations
```

## Best Practices for Production Time Series Applications

### Storage Optimization and Performance Strategy

Essential principles for effective MongoDB time series application deployment:

1. **Collection Design**: Configure appropriate time series granularity and bucketing strategies based on data ingestion patterns
2. **Index Strategy**: Create compound indexes optimizing for common query patterns combining time ranges with metadata filters
3. **Compression Management**: Enable appropriate compression algorithms to optimize storage efficiency for temporal data
4. **Retention Policies**: Implement automatic data expiration and archival strategies aligned with business requirements
5. **Aggregation Optimization**: Design aggregation pipelines that leverage time series collection optimizations
6. **Monitoring Integration**: Track collection performance, storage utilization, and query patterns for continuous optimization

### Scalability and Production Deployment

Optimize time series operations for enterprise-scale requirements:

1. **Sharding Strategy**: Design shard keys that support time-based distribution and query patterns
2. **Data Lifecycle Management**: Implement tiered storage strategies for hot, warm, and cold time series data
3. **Real-Time Processing**: Configure streaming aggregation and real-time analytics for time-sensitive applications
4. **Capacity Planning**: Monitor ingestion rates, storage growth, and query performance for scaling decisions
5. **Disaster Recovery**: Design backup and recovery strategies appropriate for time series data characteristics
6. **Integration Patterns**: Implement integration with monitoring, alerting, and visualization platforms

## Conclusion

MongoDB time series collections provide comprehensive temporal data management capabilities that enable efficient storage, high-performance analytics, and scalable ingestion for IoT, monitoring, and analytical applications through purpose-built storage optimization, advanced compression, and specialized indexing strategies. The native time series support ensures that temporal workloads benefit from MongoDB's storage efficiency, query optimization, and analytical capabilities.

Key MongoDB Time Series benefits include:

- **Storage Optimization**: Automatic compression and bucketing strategies optimized for temporal data patterns
- **Query Performance**: Specialized indexing and aggregation capabilities for time-range and analytical queries
- **Ingestion Efficiency**: High-throughput data insertion with minimal overhead and optimal storage utilization
- **Analytical Capabilities**: Built-in aggregation functions designed for time series analytics and trend analysis
- **Lifecycle Management**: Automatic retention policies and data expiration for operational efficiency
- **SQL Accessibility**: Familiar SQL-style time series operations through QueryLeaf for accessible temporal data management

Whether you're building IoT platforms, system monitoring solutions, financial analytics applications, or sensor data management systems, MongoDB time series collections with QueryLeaf's familiar SQL interface provide the foundation for efficient, scalable temporal data management.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB time series operations while providing SQL-familiar syntax for temporal data management, aggregation, and analytics. Advanced time series patterns, compression strategies, and analytical functions are seamlessly handled through familiar SQL constructs, making sophisticated time series applications accessible to SQL-oriented development teams.

The combination of MongoDB's robust time series capabilities with SQL-style temporal operations makes it an ideal platform for applications requiring both high-performance time series storage and familiar database management patterns, ensuring your temporal data operations can scale efficiently while maintaining query performance and storage optimization as data volume and analytical complexity grow.