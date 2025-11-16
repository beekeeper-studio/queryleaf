---
title: "MongoDB Time-Series Collections for IoT Analytics: High-Performance Data Processing and Real-Time Analytics with SQL-Compatible Operations"
description: "Master MongoDB Time-Series Collections for IoT data management, real-time analytics, and high-throughput sensor data processing. Learn optimized storage patterns, aggregation pipelines, and SQL-familiar time-series operations."
date: 2025-11-15
tags: [mongodb, time-series, iot, analytics, sensor-data, real-time, aggregation, sql]
---

# MongoDB Time-Series Collections for IoT Analytics: High-Performance Data Processing and Real-Time Analytics with SQL-Compatible Operations

Modern IoT applications generate massive volumes of time-stamped sensor data, requiring specialized database architectures that can efficiently ingest, store, and analyze temporal data at scale. Traditional relational databases struggle with the unique characteristics of time-series workloads: high write throughput, time-based queries, and analytical operations across large temporal ranges.

MongoDB Time-Series Collections provide native support for temporal data patterns with optimized storage engines, intelligent compression algorithms, and high-performance analytical capabilities specifically designed for IoT, monitoring, and analytics use cases. Unlike generic document collections or traditional time-series databases that require complex sharding strategies, Time-Series Collections automatically optimize storage layout, indexing, and query execution for temporal data patterns.

## The Traditional Time-Series Data Challenge

Managing time-series data with conventional database approaches creates significant performance and operational challenges:

```sql
-- Traditional PostgreSQL time-series implementation - complex partitioning and maintenance

-- Sensor readings table with time-based partitioning
CREATE TABLE sensor_readings (
    reading_id BIGSERIAL,
    device_id VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    value NUMERIC(10,4) NOT NULL,
    quality_score SMALLINT DEFAULT 100,
    
    -- Location and device metadata
    device_location VARCHAR(100),
    facility_id VARCHAR(50),
    building_id VARCHAR(50),
    floor_id VARCHAR(50),
    
    -- Environmental context
    ambient_temperature NUMERIC(5,2),
    humidity_percent NUMERIC(5,2),
    atmospheric_pressure NUMERIC(7,2),
    
    -- System metadata
    ingestion_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    data_source VARCHAR(50),
    processing_pipeline_version VARCHAR(20),
    
    -- Constraint for partitioning
    PRIMARY KEY (reading_id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions (requires ongoing maintenance)
CREATE TABLE sensor_readings_2025_01 PARTITION OF sensor_readings
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE sensor_readings_2025_02 PARTITION OF sensor_readings
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE sensor_readings_2025_03 PARTITION OF sensor_readings
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
-- ... (requires creating new partitions monthly)

-- Indexes for time-series query patterns
CREATE INDEX idx_readings_device_time ON sensor_readings (device_id, timestamp DESC);
CREATE INDEX idx_readings_type_time ON sensor_readings (sensor_type, timestamp DESC);
CREATE INDEX idx_readings_facility_time ON sensor_readings (facility_id, timestamp DESC);
CREATE INDEX idx_readings_timestamp ON sensor_readings (timestamp DESC);

-- Sensor metadata table for device information
CREATE TABLE sensor_devices (
    device_id VARCHAR(50) PRIMARY KEY,
    device_name VARCHAR(200) NOT NULL,
    device_type VARCHAR(100) NOT NULL,
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    firmware_version VARCHAR(50),
    
    -- Installation details
    installation_date DATE NOT NULL,
    location_description TEXT,
    coordinates POINT,
    
    -- Configuration
    sampling_interval_seconds INTEGER DEFAULT 300,
    measurement_units JSONB,
    calibration_data JSONB,
    alert_thresholds JSONB,
    
    -- Status tracking
    is_active BOOLEAN DEFAULT true,
    last_communication TIMESTAMPTZ,
    battery_level_percent SMALLINT,
    signal_strength_dbm INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Complex time-series aggregation query with window functions
WITH hourly_aggregations AS (
    SELECT 
        device_id,
        sensor_type,
        facility_id,
        DATE_TRUNC('hour', timestamp) as hour_bucket,
        
        -- Statistical aggregations
        COUNT(*) as reading_count,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        STDDEV(value) as stddev_value,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as median_value,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95_value,
        
        -- Quality metrics
        AVG(quality_score) as avg_quality,
        COUNT(*) FILTER (WHERE quality_score < 80) as poor_quality_count,
        
        -- Environmental correlations
        AVG(ambient_temperature) as avg_ambient_temp,
        AVG(humidity_percent) as avg_humidity,
        
        -- Time-based metrics
        MAX(timestamp) as latest_reading,
        MIN(timestamp) as earliest_reading
        
    FROM sensor_readings
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        AND timestamp < CURRENT_TIMESTAMP
        AND quality_score >= 50  -- Filter out very poor quality readings
    GROUP BY device_id, sensor_type, facility_id, DATE_TRUNC('hour', timestamp)
),

device_performance_metrics AS (
    SELECT 
        ha.*,
        sd.device_name,
        sd.device_type,
        sd.manufacturer,
        sd.sampling_interval_seconds,
        sd.location_description,
        
        -- Performance calculations
        CASE 
            WHEN ha.reading_count < (3600 / sd.sampling_interval_seconds) * 0.8 THEN 'Poor'
            WHEN ha.reading_count < (3600 / sd.sampling_interval_seconds) * 0.95 THEN 'Fair'  
            ELSE 'Good'
        END as data_completeness,
        
        -- Anomaly detection using z-score
        ABS(ha.avg_value - LAG(ha.avg_value, 1) OVER (
            PARTITION BY ha.device_id, ha.sensor_type 
            ORDER BY ha.hour_bucket
        )) / NULLIF(ha.stddev_value, 0) as hour_over_hour_zscore,
        
        -- Rate of change analysis
        (ha.avg_value - LAG(ha.avg_value, 1) OVER (
            PARTITION BY ha.device_id, ha.sensor_type 
            ORDER BY ha.hour_bucket
        )) as hour_over_hour_change,
        
        -- Moving averages for trend analysis
        AVG(ha.avg_value) OVER (
            PARTITION BY ha.device_id, ha.sensor_type 
            ORDER BY ha.hour_bucket 
            ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
        ) as moving_avg_24h,
        
        -- Deviation from baseline
        ABS(ha.avg_value - AVG(ha.avg_value) OVER (
            PARTITION BY ha.device_id, ha.sensor_type, EXTRACT(hour FROM ha.hour_bucket)
        )) as deviation_from_baseline
        
    FROM hourly_aggregations ha
    JOIN sensor_devices sd ON ha.device_id = sd.device_id
),

alert_analysis AS (
    SELECT 
        dpm.*,
        
        -- Alert conditions
        CASE 
            WHEN dpm.data_completeness = 'Poor' THEN 'Data Availability Alert'
            WHEN dpm.hour_over_hour_zscore > 3 THEN 'Anomaly Alert'
            WHEN dpm.avg_quality < 70 THEN 'Data Quality Alert'
            WHEN dpm.deviation_from_baseline > dpm.stddev_value * 2 THEN 'Baseline Deviation Alert'
            ELSE NULL
        END as alert_type,
        
        -- Alert priority
        CASE 
            WHEN dpm.data_completeness = 'Poor' AND dpm.avg_quality < 60 THEN 'Critical'
            WHEN dpm.hour_over_hour_zscore > 4 THEN 'High'
            WHEN dpm.deviation_from_baseline > dpm.stddev_value * 3 THEN 'High'
            WHEN dpm.data_completeness = 'Fair' THEN 'Medium'
            ELSE 'Low'
        END as alert_priority
        
    FROM device_performance_metrics dpm
)

SELECT 
    device_id,
    device_name,
    sensor_type,
    facility_id,
    TO_CHAR(hour_bucket, 'YYYY-MM-DD HH24:00') as analysis_hour,
    
    -- Core metrics
    reading_count,
    ROUND(avg_value::numeric, 3) as average_value,
    ROUND(min_value::numeric, 3) as minimum_value,
    ROUND(max_value::numeric, 3) as maximum_value,
    ROUND(stddev_value::numeric, 3) as std_deviation,
    ROUND(median_value::numeric, 3) as median_value,
    
    -- Performance indicators
    data_completeness,
    ROUND(avg_quality::numeric, 1) as average_quality_score,
    poor_quality_count,
    
    -- Analytical insights
    ROUND(hour_over_hour_change::numeric, 4) as hourly_change,
    ROUND(hour_over_hour_zscore::numeric, 2) as change_zscore,
    ROUND(moving_avg_24h::numeric, 3) as daily_moving_average,
    ROUND(deviation_from_baseline::numeric, 3) as baseline_deviation,
    
    -- Environmental factors
    ROUND(avg_ambient_temp::numeric, 1) as ambient_temperature,
    ROUND(avg_humidity::numeric, 1) as humidity_percent,
    
    -- Alerts and notifications
    alert_type,
    alert_priority,
    
    -- Data freshness
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - latest_reading)) / 60 as minutes_since_last_reading

FROM alert_analysis
WHERE hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY 
    facility_id, 
    device_id, 
    sensor_type,
    hour_bucket DESC;

-- Problems with traditional time-series approaches:
-- 1. Complex manual partitioning requiring ongoing maintenance and planning
-- 2. Limited compression and storage optimization for temporal data patterns
-- 3. Expensive analytical queries across large time ranges and multiple partitions
-- 4. Manual index management for various time-based query patterns
-- 5. Difficult schema evolution as IoT requirements change
-- 6. Limited support for hierarchical time-based aggregations
-- 7. Complex data lifecycle management and archival strategies
-- 8. Poor performance for high-frequency data ingestion and concurrent analytics
-- 9. Expensive infrastructure scaling for time-series workloads
-- 10. Limited real-time aggregation capabilities for streaming analytics
```

MongoDB Time-Series Collections provide optimized temporal data management:

```javascript
// MongoDB Time-Series Collections - native high-performance temporal data management
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('iot_analytics_platform');

// Advanced Time-Series Collection Management
class MongoTimeSeriesManager {
  constructor(db) {
    this.db = db;
    this.collections = new Map();
    this.aggregationPipelines = new Map();
    this.realtimeStreams = new Map();
  }

  async createOptimizedTimeSeriesCollections() {
    console.log('Creating optimized time-series collections for IoT analytics...');
    
    // Primary sensor readings collection
    const sensorReadingsSpec = {
      timeseries: {
        timeField: "timestamp",
        metaField: "device",
        granularity: "minutes"  // Optimizes for minute-level bucketing
      },
      expireAfterSeconds: 60 * 60 * 24 * 365 * 2  // 2 years retention
    };

    await this.db.createCollection('sensor_readings', sensorReadingsSpec);
    
    // Device heartbeat collection (higher frequency data)
    const heartbeatSpec = {
      timeseries: {
        timeField: "timestamp", 
        metaField: "device",
        granularity: "seconds"  // Optimizes for second-level data
      },
      expireAfterSeconds: 60 * 60 * 24 * 30  // 30 days retention
    };

    await this.db.createCollection('device_heartbeat', heartbeatSpec);
    
    // Aggregated analytics collection (lower frequency, longer retention)
    const analyticsSpec = {
      timeseries: {
        timeField: "window_start",
        metaField: "aggregation_metadata", 
        granularity: "hours"  // Optimizes for hourly aggregations
      },
      expireAfterSeconds: 60 * 60 * 24 * 365 * 5  // 5 years retention
    };

    await this.db.createCollection('analytics_aggregations', analyticsSpec);

    // Create collections references
    this.collections.set('readings', this.db.collection('sensor_readings'));
    this.collections.set('heartbeat', this.db.collection('device_heartbeat'));
    this.collections.set('analytics', this.db.collection('analytics_aggregations'));
    
    // Create supporting indexes for efficient queries
    await this.createTimeSeriesIndexes();
    
    console.log('✅ Time-series collections created with optimal configuration');
    return this.collections;
  }

  async createTimeSeriesIndexes() {
    console.log('Creating optimized indexes for time-series query patterns...');
    
    const readingsCollection = this.collections.get('readings');
    
    // Compound indexes for common query patterns
    await readingsCollection.createIndexes([
      {
        key: { "device.device_id": 1, "timestamp": -1 },
        name: "idx_device_time_desc",
        background: true
      },
      {
        key: { "device.sensor_type": 1, "timestamp": -1 }, 
        name: "idx_sensor_type_time",
        background: true
      },
      {
        key: { "device.facility_id": 1, "device.sensor_type": 1, "timestamp": -1 },
        name: "idx_facility_sensor_time",
        background: true
      },
      {
        key: { "measurements.value": 1, "timestamp": -1 },
        name: "idx_value_time_range",
        background: true
      }
    ]);

    console.log('✅ Time-series indexes created');
  }

  async ingestSensorData(sensorReadings) {
    console.log(`Ingesting ${sensorReadings.length} sensor readings...`);
    
    const readingsCollection = this.collections.get('readings');
    const batchSize = 10000;
    let totalIngested = 0;

    // Process readings in optimized batches
    for (let i = 0; i < sensorReadings.length; i += batchSize) {
      const batch = sensorReadings.slice(i, i + batchSize);
      
      try {
        // Transform readings to time-series document format
        const timeSeriesDocuments = batch.map(reading => ({
          timestamp: new Date(reading.timestamp),
          
          // Device metadata (metaField)
          device: {
            device_id: reading.device_id,
            sensor_type: reading.sensor_type,
            facility_id: reading.facility_id,
            building_id: reading.building_id,
            floor_id: reading.floor_id,
            location: reading.location,
            
            // Device specifications
            manufacturer: reading.manufacturer,
            model: reading.model,
            firmware_version: reading.firmware_version,
            
            // Operational context
            sampling_interval: reading.sampling_interval,
            calibration_date: reading.calibration_date,
            maintenance_schedule: reading.maintenance_schedule
          },
          
          // Measurement data (time-varying fields)
          measurements: {
            value: reading.value,
            unit: reading.unit,
            quality_score: reading.quality_score || 100,
            
            // Multiple sensor values (for multi-sensor devices)
            ...(reading.secondary_values && {
              secondary_measurements: reading.secondary_values
            })
          },
          
          // Environmental context
          environment: {
            ambient_temperature: reading.ambient_temperature,
            humidity: reading.humidity,
            atmospheric_pressure: reading.atmospheric_pressure,
            light_level: reading.light_level,
            noise_level: reading.noise_level
          },
          
          // System metadata
          system: {
            ingestion_timestamp: new Date(),
            data_source: reading.data_source || 'iot-gateway',
            processing_pipeline: reading.processing_pipeline || 'v1.0',
            batch_id: reading.batch_id,
            
            // Quality indicators
            transmission_latency_ms: reading.transmission_latency_ms,
            signal_strength: reading.signal_strength,
            battery_level: reading.battery_level
          },
          
          // Derived analytics (computed during ingestion)
          analytics: {
            is_anomaly: this.detectSimpleAnomaly(reading),
            trend_direction: this.calculateTrendDirection(reading),
            data_completeness_score: this.calculateCompletenessScore(reading)
          }
        }));

        // Bulk insert with ordered: false for better performance
        const result = await readingsCollection.insertMany(timeSeriesDocuments, {
          ordered: false,
          writeConcern: { w: 1, j: false }  // Optimized for throughput
        });

        totalIngested += result.insertedCount;
        
        if (i % (batchSize * 10) === 0) {
          console.log(`Ingested ${totalIngested}/${sensorReadings.length} readings...`);
        }

      } catch (error) {
        console.error(`Error ingesting batch starting at index ${i}:`, error);
        continue;
      }
    }

    console.log(`✅ Ingestion completed: ${totalIngested}/${sensorReadings.length} readings`);
    return { totalIngested, totalReceived: sensorReadings.length };
  }

  async performRealTimeAnalytics(deviceId, timeRange = '1h', options = {}) {
    console.log(`Performing real-time analytics for device ${deviceId}...`);
    
    const {
      aggregationLevel = 'minute',
      includeAnomalyDetection = true,
      calculateTrends = true,
      environmentalCorrelation = true
    } = options;

    const readingsCollection = this.collections.get('readings');
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - this.parseTimeRange(timeRange));
    
    try {
      const analyticalPipeline = [
        // Stage 1: Filter by device and time range
        {
          $match: {
            "device.device_id": deviceId,
            "timestamp": {
              $gte: startTime,
              $lte: endTime
            },
            "measurements.quality_score": { $gte: 70 }  // Filter poor quality data
          }
        },
        
        // Stage 2: Time-based bucketing
        {
          $group: {
            _id: {
              time_bucket: {
                $dateTrunc: {
                  date: "$timestamp",
                  unit: aggregationLevel,
                  ...(aggregationLevel === 'minute' && { binSize: 5 })  // 5-minute buckets
                }
              },
              sensor_type: "$device.sensor_type",
              facility_id: "$device.facility_id"
            },
            
            // Statistical aggregations
            reading_count: { $sum: 1 },
            avg_value: { $avg: "$measurements.value" },
            min_value: { $min: "$measurements.value" },
            max_value: { $max: "$measurements.value" },
            sum_value: { $sum: "$measurements.value" },
            
            // Advanced statistical measures
            values: { $push: "$measurements.value" },  // For percentile calculations
            
            // Quality metrics
            avg_quality: { $avg: "$measurements.quality_score" },
            poor_quality_count: {
              $sum: {
                $cond: [{ $lt: ["$measurements.quality_score", 80] }, 1, 0]
              }
            },
            
            // Environmental correlations
            avg_ambient_temp: { $avg: "$environment.ambient_temperature" },
            avg_humidity: { $avg: "$environment.humidity" },
            avg_pressure: { $avg: "$environment.atmospheric_pressure" },
            
            // System health indicators
            avg_signal_strength: { $avg: "$system.signal_strength" },
            avg_battery_level: { $avg: "$system.battery_level" },
            avg_transmission_latency: { $avg: "$system.transmission_latency_ms" },
            
            // Time boundaries
            first_timestamp: { $min: "$timestamp" },
            last_timestamp: { $max: "$timestamp" },
            
            // Device metadata (take first occurrence)
            device_metadata: { $first: "$device" }
          }
        },
        
        // Stage 3: Calculate advanced statistics
        {
          $addFields: {
            // Statistical measures
            value_range: { $subtract: ["$max_value", "$min_value"] },
            data_completeness: {
              $divide: [
                "$reading_count",
                { $divide: [
                  { $subtract: ["$last_timestamp", "$first_timestamp"] },
                  1000 * 60 * (aggregationLevel === 'minute' ? 5 : 1)  // Expected interval
                ]}
              ]
            },
            
            // Percentile calculations (approximated)
            median_value: {
              $arrayElemAt: [
                { $sortArray: { input: "$values", sortBy: 1 } },
                { $floor: { $multiply: [{ $size: "$values" }, 0.5] } }
              ]
            },
            p95_value: {
              $arrayElemAt: [
                { $sortArray: { input: "$values", sortBy: 1 } },
                { $floor: { $multiply: [{ $size: "$values" }, 0.95] } }
              ]
            },
            
            // Quality scoring
            quality_score: {
              $multiply: [
                { $divide: ["$avg_quality", 100] },
                { $min: ["$data_completeness", 1] }
              ]
            }
          }
        },
        
        // Stage 4: Add time-based analytical features
        {
          $setWindowFields: {
            partitionBy: { 
              sensor_type: "$_id.sensor_type",
              facility_id: "$_id.facility_id"
            },
            sortBy: { "_id.time_bucket": 1 },
            output: {
              // Moving averages
              moving_avg_3: {
                $avg: "$avg_value",
                window: { range: [-2, 0], unit: "position" }
              },
              moving_avg_6: {
                $avg: "$avg_value", 
                window: { range: [-5, 0], unit: "position" }
              },
              
              // Rate of change
              previous_avg: {
                $shift: { 
                  output: "$avg_value", 
                  by: -1 
                }
              },
              
              // Trend analysis
              trend_slope: {
                $linearFill: "$avg_value"
              }
            }
          }
        },
        
        // Stage 5: Calculate derived analytics
        {
          $addFields: {
            // Rate of change calculations
            rate_of_change: {
              $cond: {
                if: { $ne: ["$previous_avg", null] },
                then: { $subtract: ["$avg_value", "$previous_avg"] },
                else: 0
              }
            },
            
            // Anomaly detection (simple z-score based)
            is_potential_anomaly: {
              $gt: [
                { $abs: { $subtract: ["$avg_value", "$moving_avg_6"] } },
                { $multiply: [{ $sqrt: "$value_range" }, 2] }  // Simple threshold
              ]
            },
            
            // Trend classification
            trend_direction: {
              $switch: {
                branches: [
                  { 
                    case: { $gt: ["$rate_of_change", { $multiply: ["$value_range", 0.05] }] },
                    then: "increasing"
                  },
                  { 
                    case: { $lt: ["$rate_of_change", { $multiply: ["$value_range", -0.05] }] },
                    then: "decreasing" 
                  }
                ],
                default: "stable"
              }
            },
            
            // Performance classification
            performance_status: {
              $switch: {
                branches: [
                  {
                    case: { 
                      $and: [
                        { $gte: ["$quality_score", 0.9] },
                        { $gte: ["$data_completeness", 0.95] }
                      ]
                    },
                    then: "excellent"
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ["$quality_score", 0.7] },
                        { $gte: ["$data_completeness", 0.8] }
                      ]
                    },
                    then: "good"
                  },
                  {
                    case: {
                      $or: [
                        { $lt: ["$quality_score", 0.5] },
                        { $lt: ["$data_completeness", 0.6] }
                      ]
                    },
                    then: "poor"
                  }
                ],
                default: "fair"
              }
            }
          }
        },
        
        // Stage 6: Final projection and formatting
        {
          $project: {
            _id: 0,
            time_bucket: "$_id.time_bucket",
            sensor_type: "$_id.sensor_type",
            facility_id: "$_id.facility_id",
            device_id: deviceId,
            
            // Core metrics
            reading_count: 1,
            avg_value: { $round: ["$avg_value", 3] },
            min_value: { $round: ["$min_value", 3] },
            max_value: { $round: ["$max_value", 3] },
            median_value: { $round: ["$median_value", 3] },
            p95_value: { $round: ["$p95_value", 3] },
            value_range: { $round: ["$value_range", 3] },
            
            // Quality and completeness
            data_completeness: { $round: ["$data_completeness", 3] },
            quality_score: { $round: ["$quality_score", 3] },
            poor_quality_count: 1,
            
            // Analytical insights
            moving_avg_3: { $round: ["$moving_avg_3", 3] },
            moving_avg_6: { $round: ["$moving_avg_6", 3] },
            rate_of_change: { $round: ["$rate_of_change", 4] },
            trend_direction: 1,
            is_potential_anomaly: 1,
            performance_status: 1,
            
            // Environmental factors
            environmental_context: {
              ambient_temperature: { $round: ["$avg_ambient_temp", 1] },
              humidity: { $round: ["$avg_humidity", 1] },
              atmospheric_pressure: { $round: ["$avg_pressure", 1] }
            },
            
            // System health
            system_health: {
              signal_strength: { $round: ["$avg_signal_strength", 1] },
              battery_level: { $round: ["$avg_battery_level", 1] },
              transmission_latency: { $round: ["$avg_transmission_latency", 1] }
            },
            
            // Time boundaries
            time_range: {
              start: "$first_timestamp",
              end: "$last_timestamp",
              duration_minutes: {
                $round: [
                  { $divide: [
                    { $subtract: ["$last_timestamp", "$first_timestamp"] },
                    60000
                  ]}, 
                  1
                ]
              }
            },
            
            // Device context
            device_metadata: "$device_metadata"
          }
        },
        
        // Stage 7: Sort by time
        {
          $sort: { "time_bucket": 1 }
        }
      ];

      const startAnalysis = Date.now();
      const analyticsResults = await readingsCollection.aggregate(analyticalPipeline, {
        allowDiskUse: true,
        maxTimeMS: 30000  // 30 second timeout
      }).toArray();
      const analysisTime = Date.now() - startAnalysis;

      console.log(`✅ Real-time analytics completed in ${analysisTime}ms`);
      console.log(`Generated ${analyticsResults.length} analytical data points`);
      
      // Calculate summary statistics
      const summary = this.calculateAnalyticsSummary(analyticsResults);
      
      return {
        deviceId,
        timeRange,
        analysisTime: analysisTime,
        dataPoints: analyticsResults.length,
        analytics: analyticsResults,
        summary: summary
      };

    } catch (error) {
      console.error('Error performing real-time analytics:', error);
      throw error;
    }
  }

  calculateAnalyticsSummary(analyticsResults) {
    if (analyticsResults.length === 0) return {};
    
    const summary = {
      totalReadings: analyticsResults.reduce((sum, point) => sum + point.reading_count, 0),
      averageQuality: analyticsResults.reduce((sum, point) => sum + point.quality_score, 0) / analyticsResults.length,
      averageCompleteness: analyticsResults.reduce((sum, point) => sum + point.data_completeness, 0) / analyticsResults.length,
      
      anomalyCount: analyticsResults.filter(point => point.is_potential_anomaly).length,
      trendDistribution: {
        increasing: analyticsResults.filter(p => p.trend_direction === 'increasing').length,
        decreasing: analyticsResults.filter(p => p.trend_direction === 'decreasing').length, 
        stable: analyticsResults.filter(p => p.trend_direction === 'stable').length
      },
      
      performanceDistribution: {
        excellent: analyticsResults.filter(p => p.performance_status === 'excellent').length,
        good: analyticsResults.filter(p => p.performance_status === 'good').length,
        fair: analyticsResults.filter(p => p.performance_status === 'fair').length,
        poor: analyticsResults.filter(p => p.performance_status === 'poor').length
      }
    };
    
    return summary;
  }

  async createRealTimeAggregations() {
    console.log('Setting up real-time aggregation pipelines...');
    
    const readingsCollection = this.collections.get('readings');
    const analyticsCollection = this.collections.get('analytics');
    
    // Create change stream for real-time processing
    const changeStream = readingsCollection.watch([
      {
        $match: {
          'fullDocument.measurements.quality_score': { $gte: 80 }
        }
      }
    ], {
      fullDocument: 'updateLookup'
    });
    
    changeStream.on('change', async (change) => {
      if (change.operationType === 'insert') {
        await this.processRealTimeUpdate(change.fullDocument);
      }
    });
    
    this.realtimeStreams.set('readings_processor', changeStream);
    console.log('✅ Real-time aggregation pipelines active');
  }

  async processRealTimeUpdate(newReading) {
    // Process individual readings for real-time dashboards
    const deviceId = newReading.device.device_id;
    const sensorType = newReading.device.sensor_type;
    
    // Update running statistics
    await this.updateRunningStatistics(deviceId, sensorType, newReading);
    
    // Check for anomalies
    const anomalyCheck = await this.checkForAnomalies(deviceId, newReading);
    if (anomalyCheck.isAnomaly) {
      await this.handleAnomalyAlert(deviceId, anomalyCheck);
    }
  }

  async updateRunningStatistics(deviceId, sensorType, reading) {
    // Update minute-level running statistics for real-time dashboards
    const analyticsCollection = this.collections.get('analytics');
    const currentMinute = new Date();
    currentMinute.setSeconds(0, 0);
    
    await analyticsCollection.updateOne(
      {
        "aggregation_metadata.device_id": deviceId,
        "aggregation_metadata.sensor_type": sensorType,
        "window_start": currentMinute
      },
      {
        $inc: {
          "metrics.reading_count": 1,
          "metrics.value_sum": reading.measurements.value
        },
        $min: { "metrics.min_value": reading.measurements.value },
        $max: { "metrics.max_value": reading.measurements.value },
        $push: {
          "metrics.recent_values": {
            $each: [reading.measurements.value],
            $slice: -100  // Keep last 100 values for rolling calculations
          }
        },
        $setOnInsert: {
          aggregation_metadata: {
            device_id: deviceId,
            sensor_type: sensorType,
            facility_id: reading.device.facility_id,
            aggregation_type: "real_time_minute"
          },
          window_start: currentMinute,
          created_at: new Date()
        }
      },
      { upsert: true }
    );
  }

  async checkForAnomalies(deviceId, reading) {
    // Simple anomaly detection based on recent history
    const readingsCollection = this.collections.get('readings');
    const lookbackTime = new Date(reading.timestamp.getTime() - (60 * 60 * 1000)); // 1 hour lookback
    
    const recentStats = await readingsCollection.aggregate([
      {
        $match: {
          "device.device_id": deviceId,
          "device.sensor_type": reading.device.sensor_type,
          "timestamp": { $gte: lookbackTime, $lt: reading.timestamp }
        }
      },
      {
        $group: {
          _id: null,
          avg_value: { $avg: "$measurements.value" },
          stddev_value: { $stdDevPop: "$measurements.value" },
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    
    if (recentStats.length === 0 || recentStats[0].count < 10) {
      return { isAnomaly: false, reason: 'insufficient_history' };
    }
    
    const stats = recentStats[0];
    const currentValue = reading.measurements.value;
    const zScore = Math.abs(currentValue - stats.avg_value) / (stats.stddev_value || 1);
    
    const isAnomaly = zScore > 3;  // 3-sigma threshold
    
    return {
      isAnomaly,
      zScore,
      currentValue,
      historicalAverage: stats.avg_value,
      historicalStdDev: stats.stddev_value,
      reason: isAnomaly ? 'statistical_outlier' : 'normal_variation'
    };
  }

  async handleAnomalyAlert(deviceId, anomalyDetails) {
    console.log(`🚨 Anomaly detected for device ${deviceId}:`);
    console.log(`  Z-Score: ${anomalyDetails.zScore.toFixed(2)}`);
    console.log(`  Current Value: ${anomalyDetails.currentValue}`);
    console.log(`  Historical Average: ${anomalyDetails.historicalAverage.toFixed(2)}`);
    
    // Store anomaly record
    await this.db.collection('anomaly_alerts').insertOne({
      device_id: deviceId,
      detection_timestamp: new Date(),
      anomaly_details: anomalyDetails,
      alert_status: 'active',
      severity: anomalyDetails.zScore > 5 ? 'critical' : 'warning'
    });
  }

  // Utility methods
  parseTimeRange(timeRange) {
    const timeMap = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    return timeMap[timeRange] || timeMap['1h'];
  }

  detectSimpleAnomaly(reading) {
    // Placeholder for simple anomaly detection during ingestion
    return false;
  }

  calculateTrendDirection(reading) {
    // Placeholder for trend calculation during ingestion
    return 'stable';
  }

  calculateCompletenessScore(reading) {
    // Calculate data completeness based on expected vs actual fields
    const requiredFields = ['device_id', 'sensor_type', 'value', 'timestamp'];
    const presentFields = requiredFields.filter(field => reading[field] != null);
    return presentFields.length / requiredFields.length;
  }

  async generatePerformanceReport() {
    console.log('Generating time-series performance report...');
    
    const collections = ['sensor_readings', 'device_heartbeat', 'analytics_aggregations'];
    const report = {
      generated_at: new Date(),
      collections: {}
    };
    
    for (const collectionName of collections) {
      try {
        const stats = await this.db.runCommand({ collStats: collectionName });
        report.collections[collectionName] = {
          documentCount: stats.count,
          storageSize: stats.storageSize,
          avgObjSize: stats.avgObjSize,
          totalIndexSize: stats.totalIndexSize,
          compressionRatio: stats.storageSize > 0 ? (stats.size / stats.storageSize).toFixed(2) : 0
        };
      } catch (error) {
        report.collections[collectionName] = { error: error.message };
      }
    }
    
    return report;
  }

  async shutdown() {
    console.log('Shutting down time-series manager...');
    
    // Close change streams
    for (const [name, stream] of this.realtimeStreams) {
      await stream.close();
      console.log(`✅ Closed stream: ${name}`);
    }
    
    await this.client.close();
    console.log('Time-series manager shutdown completed');
  }
}

// Export the time-series manager
module.exports = { MongoTimeSeriesManager };

// Benefits of MongoDB Time-Series Collections:
// - Automatic storage optimization and compression for temporal data patterns
// - Native support for time-based bucketing and aggregations without manual partitioning
// - Intelligent indexing strategies optimized for time-series query patterns
// - Built-in data lifecycle management with TTL (time-to-live) capabilities
// - High-performance ingestion with optimized write operations for time-series workloads
// - Advanced analytical capabilities with window functions and statistical aggregations
// - Real-time change streams for immediate processing of incoming sensor data
// - Flexible schema evolution without complex migration strategies
// - Integrated anomaly detection and alerting capabilities
// - SQL-compatible analytical operations through QueryLeaf integration
```

## Understanding MongoDB Time-Series Architecture

### Advanced Analytics Patterns for IoT Data

MongoDB Time-Series Collections enable sophisticated analytical patterns for IoT applications:

```javascript
// Advanced IoT analytics patterns with MongoDB Time-Series Collections
class IoTAnalyticsProcessor {
  constructor(db) {
    this.db = db;
    this.analyticsCache = new Map();
    this.alertThresholds = new Map();
  }

  async implementAdvancedAnalytics() {
    console.log('Implementing advanced IoT analytics patterns...');
    
    // Pattern 1: Hierarchical time-series aggregations
    await this.createHierarchicalAggregations();
    
    // Pattern 2: Cross-device correlation analysis
    await this.implementCrossDeviceAnalysis();
    
    // Pattern 3: Predictive maintenance analytics
    await this.setupPredictiveAnalytics();
    
    // Pattern 4: Real-time dashboard feeds
    await this.createRealTimeDashboards();
    
    console.log('Advanced analytics patterns implemented');
  }

  async createHierarchicalAggregations() {
    console.log('Creating hierarchical time-series aggregations...');
    
    const readingsCollection = this.db.collection('sensor_readings');
    
    // Multi-level time aggregation pipeline
    const hierarchicalPipeline = [
      {
        $match: {
          "timestamp": {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          },
          "measurements.quality_score": { $gte: 70 }
        }
      },
      
      // Create multiple time bucket levels
      {
        $facet: {
          // Minute-level aggregations
          minutely: [
            {
              $group: {
                _id: {
                  facility: "$device.facility_id",
                  building: "$device.building_id",
                  sensor_type: "$device.sensor_type",
                  minute: {
                    $dateTrunc: { date: "$timestamp", unit: "minute" }
                  }
                },
                avg_value: { $avg: "$measurements.value" },
                min_value: { $min: "$measurements.value" },
                max_value: { $max: "$measurements.value" },
                reading_count: { $sum: 1 },
                quality_avg: { $avg: "$measurements.quality_score" }
              }
            }
          ],
          
          // Hourly aggregations
          hourly: [
            {
              $group: {
                _id: {
                  facility: "$device.facility_id",
                  sensor_type: "$device.sensor_type",
                  hour: {
                    $dateTrunc: { date: "$timestamp", unit: "hour" }
                  }
                },
                avg_value: { $avg: "$measurements.value" },
                min_value: { $min: "$measurements.value" },
                max_value: { $max: "$measurements.value" },
                reading_count: { $sum: 1 },
                device_count: { $addToSet: "$device.device_id" },
                building_coverage: { $addToSet: "$device.building_id" }
              }
            },
            {
              $addFields: {
                device_count: { $size: "$device_count" },
                building_count: { $size: "$building_coverage" }
              }
            }
          ],
          
          // Daily aggregations  
          daily: [
            {
              $group: {
                _id: {
                  facility: "$device.facility_id",
                  sensor_type: "$device.sensor_type",
                  day: {
                    $dateTrunc: { date: "$timestamp", unit: "day" }
                  }
                },
                avg_value: { $avg: "$measurements.value" },
                min_value: { $min: "$measurements.value" },
                max_value: { $max: "$measurements.value" },
                reading_count: { $sum: 1 },
                unique_devices: { $addToSet: "$device.device_id" },
                data_coverage_hours: {
                  $addToSet: {
                    $dateTrunc: { date: "$timestamp", unit: "hour" }
                  }
                }
              }
            },
            {
              $addFields: {
                device_count: { $size: "$unique_devices" },
                coverage_hours: { $size: "$data_coverage_hours" },
                coverage_percentage: {
                  $multiply: [
                    { $divide: [{ $size: "$data_coverage_hours" }, 24] },
                    100
                  ]
                }
              }
            }
          ]
        }
      }
    ];

    const hierarchicalResults = await readingsCollection.aggregate(hierarchicalPipeline, {
      allowDiskUse: true
    }).toArray();

    // Store aggregated results
    const analyticsCollection = this.db.collection('analytics_aggregations');
    
    for (const levelName of ['minutely', 'hourly', 'daily']) {
      const levelData = hierarchicalResults[0][levelName];
      
      if (levelData && levelData.length > 0) {
        const documents = levelData.map(agg => ({
          window_start: agg._id[levelName === 'minutely' ? 'minute' : levelName === 'hourly' ? 'hour' : 'day'],
          aggregation_metadata: {
            aggregation_level: levelName,
            facility_id: agg._id.facility,
            sensor_type: agg._id.sensor_type,
            building_id: agg._id.building,
            generated_at: new Date()
          },
          metrics: {
            avg_value: agg.avg_value,
            min_value: agg.min_value,
            max_value: agg.max_value,
            reading_count: agg.reading_count,
            device_count: agg.device_count,
            coverage_percentage: agg.coverage_percentage,
            quality_average: agg.quality_avg
          }
        }));

        await analyticsCollection.insertMany(documents, { ordered: false });
      }
    }

    console.log('✅ Hierarchical aggregations completed');
  }

  async implementCrossDeviceAnalysis() {
    console.log('Implementing cross-device correlation analysis...');
    
    const readingsCollection = this.db.collection('sensor_readings');
    
    // Cross-device correlation pipeline
    const correlationPipeline = [
      {
        $match: {
          "timestamp": {
            $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) // Last 6 hours
          },
          "device.facility_id": { $exists: true }
        }
      },
      
      // Group by facility and time windows
      {
        $group: {
          _id: {
            facility: "$device.facility_id",
            time_window: {
              $dateTrunc: { 
                date: "$timestamp", 
                unit: "minute",
                binSize: 15  // 15-minute windows
              }
            }
          },
          
          // Collect readings by sensor type
          temperature_readings: {
            $push: {
              $cond: [
                { $eq: ["$device.sensor_type", "temperature"] },
                "$measurements.value",
                "$$REMOVE"
              ]
            }
          },
          humidity_readings: {
            $push: {
              $cond: [
                { $eq: ["$device.sensor_type", "humidity"] },
                "$measurements.value", 
                "$$REMOVE"
              ]
            }
          },
          co2_readings: {
            $push: {
              $cond: [
                { $eq: ["$device.sensor_type", "co2"] },
                "$measurements.value",
                "$$REMOVE"
              ]
            }
          },
          air_quality_readings: {
            $push: {
              $cond: [
                { $eq: ["$device.sensor_type", "air_quality"] },
                "$measurements.value",
                "$$REMOVE"
              ]
            }
          },
          
          total_readings: { $sum: 1 },
          unique_devices: { $addToSet: "$device.device_id" }
        }
      },
      
      // Calculate correlations and insights
      {
        $addFields: {
          // Calculate averages for each sensor type
          avg_temperature: { $avg: "$temperature_readings" },
          avg_humidity: { $avg: "$humidity_readings" },
          avg_co2: { $avg: "$co2_readings" },
          avg_air_quality: { $avg: "$air_quality_readings" },
          
          device_count: { $size: "$unique_devices" },
          
          // Data completeness by sensor type
          temperature_coverage: { $size: "$temperature_readings" },
          humidity_coverage: { $size: "$humidity_readings" },
          co2_coverage: { $size: "$co2_readings" },
          air_quality_coverage: { $size: "$air_quality_readings" }
        }
      },
      
      // Add correlation analysis
      {
        $addFields: {
          // Environmental comfort index calculation
          comfort_index: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gte: ["$avg_temperature", 20] },
                      { $lte: ["$avg_temperature", 24] },
                      { $gte: ["$avg_humidity", 30] },
                      { $lte: ["$avg_humidity", 60] }
                    ]
                  },
                  then: "optimal"
                },
                {
                  case: {
                    $and: [
                      { $gte: ["$avg_temperature", 18] },
                      { $lte: ["$avg_temperature", 26] },
                      { $gte: ["$avg_humidity", 25] },
                      { $lte: ["$avg_humidity", 70] }
                    ]
                  },
                  then: "good"
                }
              ],
              default: "suboptimal"
            }
          },
          
          // Air quality assessment
          air_quality_status: {
            $switch: {
              branches: [
                { case: { $lte: ["$avg_co2", 1000] }, then: "excellent" },
                { case: { $lte: ["$avg_co2", 1500] }, then: "good" },
                { case: { $lte: ["$avg_co2", 2000] }, then: "moderate" }
              ],
              default: "poor"
            }
          },
          
          // Data quality assessment
          data_quality_score: {
            $divide: [
              {
                $add: [
                  "$temperature_coverage",
                  "$humidity_coverage", 
                  "$co2_coverage",
                  "$air_quality_coverage"
                ]
              },
              { $multiply: ["$device_count", 4] }  // Assuming 4 sensor types per device
            ]
          }
        }
      },
      
      // Filter for meaningful results
      {
        $match: {
          "device_count": { $gte: 2 },  // At least 2 devices
          "total_readings": { $gte: 10 } // At least 10 readings
        }
      },
      
      // Sort by time window
      {
        $sort: { "_id.time_window": 1 }
      }
    ];

    const correlationResults = await readingsCollection.aggregate(correlationPipeline, {
      allowDiskUse: true
    }).toArray();

    // Store correlation analysis results
    if (correlationResults.length > 0) {
      const correlationDocs = correlationResults.map(result => ({
        window_start: result._id.time_window,
        aggregation_metadata: {
          aggregation_type: "cross_device_correlation",
          facility_id: result._id.facility,
          analysis_timestamp: new Date()
        },
        environmental_metrics: {
          avg_temperature: result.avg_temperature,
          avg_humidity: result.avg_humidity,
          avg_co2: result.avg_co2,
          avg_air_quality: result.avg_air_quality
        },
        assessments: {
          comfort_index: result.comfort_index,
          air_quality_status: result.air_quality_status,
          data_quality_score: result.data_quality_score
        },
        coverage_stats: {
          device_count: result.device_count,
          total_readings: result.total_readings,
          sensor_coverage: {
            temperature: result.temperature_coverage,
            humidity: result.humidity_coverage,
            co2: result.co2_coverage,
            air_quality: result.air_quality_coverage
          }
        }
      }));

      await this.db.collection('analytics_aggregations').insertMany(correlationDocs, {
        ordered: false
      });
    }

    console.log(`✅ Cross-device correlation analysis completed: ${correlationResults.length} facility-time windows analyzed`);
  }

  async setupPredictiveAnalytics() {
    console.log('Setting up predictive maintenance analytics...');
    
    const readingsCollection = this.db.collection('sensor_readings');
    
    // Predictive analytics pipeline for device health
    const predictivePipeline = [
      {
        $match: {
          "timestamp": {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        }
      },
      
      // Group by device and calculate health indicators
      {
        $group: {
          _id: {
            device_id: "$device.device_id",
            sensor_type: "$device.sensor_type"
          },
          
          // Time-series health metrics
          reading_timestamps: { $push: "$timestamp" },
          quality_scores: { $push: "$measurements.quality_score" },
          values: { $push: "$measurements.value" },
          
          // System health indicators  
          battery_levels: { $push: "$system.battery_level" },
          signal_strengths: { $push: "$system.signal_strength" },
          transmission_latencies: { $push: "$system.transmission_latency_ms" },
          
          // Basic statistics
          total_readings: { $sum: 1 },
          avg_value: { $avg: "$measurements.value" },
          avg_quality: { $avg: "$measurements.quality_score" },
          
          // Device metadata
          device_info: { $first: "$device" },
          latest_timestamp: { $max: "$timestamp" },
          earliest_timestamp: { $min: "$timestamp" }
        }
      },
      
      // Calculate predictive health indicators
      {
        $addFields: {
          // Expected readings calculation
          time_span_hours: {
            $divide: [
              { $subtract: ["$latest_timestamp", "$earliest_timestamp"] },
              3600000  // Convert to hours
            ]
          },
          
          expected_readings: {
            $divide: [
              { $multiply: ["$time_span_hours", 3600] },  // Total seconds
              { $ifNull: ["$device_info.sampling_interval", 300] }  // Default 5 min interval
            ]
          }
        }
      },
      
      {
        $addFields: {
          // Data availability percentage
          data_availability: {
            $multiply: [
              { $divide: ["$total_readings", "$expected_readings"] },
              100
            ]
          },
          
          // Quality trend analysis
          recent_quality: {
            $avg: {
              $slice: ["$quality_scores", -20]  // Last 20 readings
            }
          },
          
          historical_quality: {
            $avg: {
              $slice: ["$quality_scores", 0, 20]  // First 20 readings  
            }
          },
          
          // Battery health trend
          current_battery: {
            $avg: {
              $slice: ["$battery_levels", -10]  // Last 10 readings
            }
          },
          
          initial_battery: {
            $avg: {
              $slice: ["$battery_levels", 0, 10]  // First 10 readings
            }
          },
          
          // Signal quality trend
          avg_signal_strength: { $avg: "$signal_strengths" },
          avg_latency: { $avg: "$transmission_latencies" }
        }
      },
      
      // Calculate health scores and predictions
      {
        $addFields: {
          // Overall device health score (0-100)
          health_score: {
            $min: [
              100,
              {
                $multiply: [
                  {
                    $add: [
                      // Data availability component (40%)
                      { $multiply: [{ $min: ["$data_availability", 100] }, 0.4] },
                      
                      // Quality component (30%)
                      { $multiply: ["$avg_quality", 0.3] },
                      
                      // Battery component (20%)
                      { 
                        $multiply: [
                          { $ifNull: ["$current_battery", 100] },
                          0.2
                        ]
                      },
                      
                      // Signal component (10%)
                      {
                        $multiply: [
                          {
                            $cond: {
                              if: { $gte: ["$avg_signal_strength", -70] },
                              then: 100,
                              else: {
                                $max: [0, { $add: [100, { $multiply: ["$avg_signal_strength", 1.5] }] }]
                              }
                            }
                          },
                          0.1
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          
          // Maintenance predictions
          quality_trend: {
            $cond: {
              if: { $gt: ["$recent_quality", "$historical_quality"] },
              then: "improving",
              else: {
                $cond: {
                  if: { $lt: ["$recent_quality", { $multiply: ["$historical_quality", 0.9] }] },
                  then: "degrading",
                  else: "stable"
                }
              }
            }
          },
          
          battery_trend: {
            $cond: {
              if: { $and: ["$current_battery", "$initial_battery"] },
              then: {
                $cond: {
                  if: { $lt: ["$current_battery", { $multiply: ["$initial_battery", 0.8] }] },
                  then: "declining",
                  else: "stable"
                }
              },
              else: "unknown"
            }
          },
          
          // Estimated days until maintenance needed
          maintenance_urgency: {
            $switch: {
              branches: [
                {
                  case: { $lt: ["$health_score", 60] },
                  then: "immediate"
                },
                {
                  case: { $lt: ["$health_score", 75] },
                  then: "within_week"
                },
                {
                  case: { $lt: ["$health_score", 85] },
                  then: "within_month"
                }
              ],
              default: "routine"
            }
          }
        }
      },
      
      // Filter devices that need attention
      {
        $match: {
          $or: [
            { "health_score": { $lt: 90 } },
            { "quality_trend": "degrading" },
            { "battery_trend": "declining" },
            { "data_availability": { $lt: 90 } }
          ]
        }
      },
      
      // Sort by health score (worst first)
      {
        $sort: { "health_score": 1 }
      }
    ];

    const predictiveResults = await readingsCollection.aggregate(predictivePipeline, {
      allowDiskUse: true
    }).toArray();

    // Store predictive analytics results
    if (predictiveResults.length > 0) {
      const maintenanceDocs = predictiveResults.map(result => ({
        window_start: new Date(),
        aggregation_metadata: {
          aggregation_type: "predictive_maintenance",
          device_id: result._id.device_id,
          sensor_type: result._id.sensor_type,
          analysis_timestamp: new Date()
        },
        health_assessment: {
          overall_health_score: Math.round(result.health_score * 100) / 100,
          data_availability: Math.round(result.data_availability * 100) / 100,
          quality_trend: result.quality_trend,
          battery_trend: result.battery_trend,
          maintenance_urgency: result.maintenance_urgency
        },
        metrics: {
          total_readings: result.total_readings,
          avg_quality: Math.round(result.avg_quality * 100) / 100,
          avg_signal_strength: result.avg_signal_strength,
          avg_latency: result.avg_latency,
          current_battery_level: result.current_battery
        },
        recommendations: this.generateMaintenanceRecommendations(result)
      }));

      await this.db.collection('maintenance_predictions').insertMany(maintenanceDocs, {
        ordered: false
      });
    }

    console.log(`✅ Predictive analytics completed: ${predictiveResults.length} devices analyzed`);
    return predictiveResults;
  }

  generateMaintenanceRecommendations(deviceAnalysis) {
    const recommendations = [];
    
    if (deviceAnalysis.health_score < 60) {
      recommendations.push('Immediate inspection required - device health critical');
    }
    
    if (deviceAnalysis.data_availability < 80) {
      recommendations.push('Check connectivity and power supply');
    }
    
    if (deviceAnalysis.quality_trend === 'degrading') {
      recommendations.push('Sensor calibration may be needed');
    }
    
    if (deviceAnalysis.battery_trend === 'declining') {
      recommendations.push('Schedule battery replacement');
    }
    
    if (deviceAnalysis.avg_signal_strength < -80) {
      recommendations.push('Improve network coverage or relocate device');
    }
    
    return recommendations.length > 0 ? recommendations : ['Continue routine monitoring'];
  }
}

// Export the analytics processor
module.exports = { IoTAnalyticsProcessor };
```

## SQL-Style Time-Series Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Time-Series Collections operations:

```sql
-- QueryLeaf time-series operations with SQL-familiar syntax

-- Create time-series collection with SQL DDL syntax
CREATE TABLE sensor_readings (
  timestamp TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(50) NOT NULL,
  sensor_type VARCHAR(50) NOT NULL,
  value NUMERIC(10,4) NOT NULL,
  quality_score INTEGER DEFAULT 100,
  
  -- Device metadata (metaField in MongoDB)
  facility_id VARCHAR(50),
  building_id VARCHAR(50), 
  location VARCHAR(200),
  
  -- Environmental context
  ambient_temperature NUMERIC(5,2),
  humidity NUMERIC(5,2),
  atmospheric_pressure NUMERIC(7,2)
) WITH (
  collection_type = 'timeseries',
  time_field = 'timestamp',
  meta_field = 'device_metadata',
  granularity = 'minutes',
  expire_after_seconds = 63072000  -- 2 years
);

-- Time-series data ingestion with SQL INSERT
INSERT INTO sensor_readings (
  timestamp, device_id, sensor_type, value, quality_score,
  facility_id, building_id, location,
  ambient_temperature, humidity, atmospheric_pressure
) VALUES 
  ('2025-11-15 10:00:00'::TIMESTAMPTZ, 'TEMP-001', 'temperature', 22.5, 98, 'FAC-A', 'BLDG-1', 'Conference Room A', 22.5, 45.2, 1013.25),
  ('2025-11-15 10:00:00'::TIMESTAMPTZ, 'HUM-001', 'humidity', 45.2, 95, 'FAC-A', 'BLDG-1', 'Conference Room A', 22.5, 45.2, 1013.25),
  ('2025-11-15 10:00:00'::TIMESTAMPTZ, 'CO2-001', 'co2', 850, 92, 'FAC-A', 'BLDG-1', 'Conference Room A', 22.5, 45.2, 1013.25);

-- Time-series analytical queries with window functions
WITH hourly_sensor_analytics AS (
  SELECT 
    device_id,
    sensor_type,
    facility_id,
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    
    -- Statistical aggregations
    COUNT(*) as reading_count,
    AVG(value) as avg_value,
    MIN(value) as min_value,  
    MAX(value) as max_value,
    STDDEV(value) as stddev_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as median_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95_value,
    
    -- Quality metrics
    AVG(quality_score) as avg_quality,
    COUNT(*) FILTER (WHERE quality_score < 80) as poor_quality_count,
    
    -- Environmental correlations
    AVG(ambient_temperature) as avg_ambient_temp,
    AVG(humidity) as avg_humidity,
    CORR(value, ambient_temperature) as temp_correlation,
    CORR(value, humidity) as humidity_correlation,
    
    -- Data completeness assessment
    COUNT(*) * 100.0 / 60 as data_completeness_percent  -- Expected: 60 readings per hour
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND timestamp < CURRENT_TIMESTAMP
    AND quality_score >= 50  -- Filter poor quality data
  GROUP BY device_id, sensor_type, facility_id, DATE_TRUNC('hour', timestamp)
),

time_series_insights AS (
  SELECT 
    hsa.*,
    
    -- Time-based analytical functions
    LAG(avg_value) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY hour_bucket
    ) as previous_hour_avg,
    
    -- Moving averages for trend analysis
    AVG(avg_value) OVER (
      PARTITION BY device_id, sensor_type
      ORDER BY hour_bucket
      ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
    ) as moving_avg_6h,
    
    AVG(avg_value) OVER (
      PARTITION BY device_id, sensor_type
      ORDER BY hour_bucket  
      ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
    ) as moving_avg_24h,
    
    -- Anomaly detection using z-score
    (avg_value - AVG(avg_value) OVER (
      PARTITION BY device_id, sensor_type, EXTRACT(hour FROM hour_bucket)
    )) / NULLIF(STDDEV(avg_value) OVER (
      PARTITION BY device_id, sensor_type, EXTRACT(hour FROM hour_bucket)
    ), 0) as hourly_zscore,
    
    -- Rate of change calculations
    CASE 
      WHEN LAG(avg_value) OVER (PARTITION BY device_id, sensor_type ORDER BY hour_bucket) IS NOT NULL
      THEN (avg_value - LAG(avg_value) OVER (PARTITION BY device_id, sensor_type ORDER BY hour_bucket)) 
           / NULLIF(LAG(avg_value) OVER (PARTITION BY device_id, sensor_type ORDER BY hour_bucket), 0) * 100
      ELSE 0
    END as hourly_change_percent
    
  FROM hourly_sensor_analytics hsa
),

anomaly_detection AS (
  SELECT 
    tsi.*,
    
    -- Anomaly classification
    CASE 
      WHEN ABS(hourly_zscore) > 3 THEN 'statistical_anomaly'
      WHEN ABS(hourly_change_percent) > 50 AND moving_avg_6h IS NOT NULL THEN 'rapid_change'
      WHEN data_completeness_percent < 70 THEN 'data_availability_issue'
      WHEN avg_quality < 70 THEN 'data_quality_issue'
      ELSE 'normal'
    END as anomaly_type,
    
    -- Alert priority
    CASE 
      WHEN ABS(hourly_zscore) > 4 OR ABS(hourly_change_percent) > 75 THEN 'critical'
      WHEN ABS(hourly_zscore) > 3 OR ABS(hourly_change_percent) > 50 THEN 'high'
      WHEN data_completeness_percent < 70 OR avg_quality < 70 THEN 'medium'
      ELSE 'low'
    END as alert_priority,
    
    -- Performance classification  
    CASE 
      WHEN data_completeness_percent >= 95 AND avg_quality >= 90 THEN 'excellent'
      WHEN data_completeness_percent >= 85 AND avg_quality >= 80 THEN 'good'
      WHEN data_completeness_percent >= 70 AND avg_quality >= 70 THEN 'fair'
      ELSE 'poor'
    END as performance_rating
    
  FROM time_series_insights tsi
)

SELECT 
  device_id,
  sensor_type,
  facility_id,
  TO_CHAR(hour_bucket, 'YYYY-MM-DD HH24:00') as analysis_hour,
  
  -- Core time-series metrics
  reading_count,
  ROUND(avg_value::NUMERIC, 3) as average_value,
  ROUND(min_value::NUMERIC, 3) as minimum_value,
  ROUND(max_value::NUMERIC, 3) as maximum_value,
  ROUND(stddev_value::NUMERIC, 3) as std_deviation,
  ROUND(median_value::NUMERIC, 3) as median_value,
  ROUND(p95_value::NUMERIC, 3) as p95_value,
  
  -- Trend analysis
  ROUND(hourly_change_percent::NUMERIC, 2) as hourly_change_pct,
  ROUND(moving_avg_6h::NUMERIC, 3) as six_hour_moving_avg,
  ROUND(moving_avg_24h::NUMERIC, 3) as daily_moving_avg,
  
  -- Anomaly detection
  ROUND(hourly_zscore::NUMERIC, 3) as anomaly_zscore,
  anomaly_type,
  alert_priority,
  
  -- Quality and performance
  ROUND(data_completeness_percent::NUMERIC, 1) as data_completeness_pct,
  ROUND(avg_quality::NUMERIC, 1) as average_quality_score,
  poor_quality_count,
  performance_rating,
  
  -- Environmental correlations
  ROUND(temp_correlation::NUMERIC, 3) as temperature_correlation,
  ROUND(humidity_correlation::NUMERIC, 3) as humidity_correlation,
  ROUND(avg_ambient_temp::NUMERIC, 1) as avg_ambient_temperature,
  ROUND(avg_humidity::NUMERIC, 1) as avg_humidity_percent,
  
  -- Alert conditions
  CASE 
    WHEN anomaly_type != 'normal' THEN 
      CONCAT('Alert: ', anomaly_type, ' detected with ', alert_priority, ' priority')
    WHEN performance_rating IN ('poor', 'fair') THEN
      CONCAT('Performance issue: ', performance_rating, ' quality detected')
    ELSE 'Normal operation'
  END as status_message

FROM anomaly_detection
WHERE hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY 
  facility_id,
  device_id,
  sensor_type,
  hour_bucket DESC;

-- Cross-device environmental correlation analysis
WITH facility_environmental_data AS (
  SELECT 
    facility_id,
    building_id,
    DATE_TRUNC('minute', timestamp, 15) as time_window,  -- 15-minute buckets
    
    -- Aggregate by sensor type
    AVG(CASE WHEN sensor_type = 'temperature' THEN value END) as avg_temperature,
    AVG(CASE WHEN sensor_type = 'humidity' THEN value END) as avg_humidity,
    AVG(CASE WHEN sensor_type = 'co2' THEN value END) as avg_co2,
    AVG(CASE WHEN sensor_type = 'air_quality' THEN value END) as avg_air_quality,
    
    -- Count devices by type
    COUNT(DISTINCT CASE WHEN sensor_type = 'temperature' THEN device_id END) as temp_devices,
    COUNT(DISTINCT CASE WHEN sensor_type = 'humidity' THEN device_id END) as humidity_devices,
    COUNT(DISTINCT CASE WHEN sensor_type = 'co2' THEN device_id END) as co2_devices,
    
    -- Overall data quality
    AVG(quality_score) as avg_quality,
    COUNT(*) as total_readings
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '6 hours'
    AND facility_id IS NOT NULL
    AND quality_score >= 70
  GROUP BY facility_id, building_id, DATE_TRUNC('minute', timestamp, 15)
  HAVING COUNT(*) >= 5  -- Minimum readings threshold
),

environmental_assessment AS (
  SELECT 
    fed.*,
    
    -- Environmental comfort calculations
    CASE 
      WHEN avg_temperature BETWEEN 20 AND 24 AND avg_humidity BETWEEN 30 AND 60 THEN 'optimal'
      WHEN avg_temperature BETWEEN 18 AND 26 AND avg_humidity BETWEEN 25 AND 70 THEN 'comfortable'
      WHEN avg_temperature BETWEEN 16 AND 28 AND avg_humidity BETWEEN 20 AND 80 THEN 'acceptable'
      ELSE 'uncomfortable'
    END as comfort_level,
    
    -- Air quality assessment
    CASE 
      WHEN avg_co2 <= 1000 THEN 'excellent'
      WHEN avg_co2 <= 1500 THEN 'good'  
      WHEN avg_co2 <= 2000 THEN 'moderate'
      WHEN avg_co2 <= 5000 THEN 'poor'
      ELSE 'hazardous'
    END as air_quality_level,
    
    -- Data coverage assessment
    CASE 
      WHEN temp_devices >= 2 AND humidity_devices >= 2 AND co2_devices >= 1 THEN 'comprehensive'
      WHEN temp_devices >= 1 AND humidity_devices >= 1 THEN 'basic'
      ELSE 'limited'
    END as sensor_coverage,
    
    -- Environmental health score (0-100)
    (
      CASE 
        WHEN avg_temperature BETWEEN 20 AND 24 THEN 25
        WHEN avg_temperature BETWEEN 18 AND 26 THEN 20
        WHEN avg_temperature BETWEEN 16 AND 28 THEN 15
        ELSE 5
      END +
      CASE 
        WHEN avg_humidity BETWEEN 40 AND 50 THEN 25
        WHEN avg_humidity BETWEEN 30 AND 60 THEN 20
        WHEN avg_humidity BETWEEN 25 AND 70 THEN 15
        ELSE 5
      END +
      CASE 
        WHEN avg_co2 <= 800 THEN 25
        WHEN avg_co2 <= 1000 THEN 20
        WHEN avg_co2 <= 1500 THEN 15
        WHEN avg_co2 <= 2000 THEN 10
        ELSE 0
      END +
      CASE 
        WHEN avg_air_quality >= 80 THEN 25
        WHEN avg_air_quality >= 60 THEN 20
        WHEN avg_air_quality >= 40 THEN 15
        ELSE 5
      END
    ) as environmental_health_score
    
  FROM facility_environmental_data fed
)

SELECT 
  facility_id,
  building_id,
  TO_CHAR(time_window, 'YYYY-MM-DD HH24:MI') as measurement_time,
  
  -- Environmental measurements
  ROUND(avg_temperature::NUMERIC, 1) as temperature_c,
  ROUND(avg_humidity::NUMERIC, 1) as humidity_percent,
  ROUND(avg_co2::NUMERIC, 0) as co2_ppm,
  ROUND(avg_air_quality::NUMERIC, 1) as air_quality_index,
  
  -- Assessment results
  comfort_level,
  air_quality_level,
  sensor_coverage,
  environmental_health_score,
  
  -- Device coverage
  temp_devices,
  humidity_devices,  
  co2_devices,
  total_readings,
  
  -- Data quality
  ROUND(avg_quality::NUMERIC, 1) as average_data_quality,
  
  -- Recommendations
  CASE 
    WHEN environmental_health_score >= 90 THEN 'Optimal environmental conditions'
    WHEN environmental_health_score >= 75 THEN 'Good environmental conditions'
    WHEN comfort_level = 'uncomfortable' THEN 'Adjust HVAC settings for comfort'
    WHEN air_quality_level IN ('poor', 'hazardous') THEN 'Improve ventilation immediately'
    WHEN sensor_coverage = 'limited' THEN 'Add more environmental sensors'
    ELSE 'Monitor conditions closely'
  END as recommendation,
  
  -- Alert conditions
  CASE 
    WHEN avg_co2 > 2000 THEN 'HIGH CO2 ALERT'
    WHEN avg_temperature > 28 OR avg_temperature < 16 THEN 'TEMPERATURE ALERT'
    WHEN avg_humidity > 80 OR avg_humidity < 20 THEN 'HUMIDITY ALERT'
    WHEN environmental_health_score < 50 THEN 'ENVIRONMENTAL QUALITY ALERT'
    ELSE NULL
  END as alert_status

FROM environmental_assessment
WHERE time_window >= CURRENT_TIMESTAMP - INTERVAL '6 hours'
ORDER BY 
  facility_id,
  building_id,
  time_window DESC;

-- Predictive maintenance analytics with time-series data
CREATE VIEW device_health_predictions AS
WITH device_performance_history AS (
  SELECT 
    device_id,
    sensor_type,
    facility_id,
    
    -- Performance metrics over time
    COUNT(*) as total_readings_7d,
    AVG(quality_score) as avg_quality_7d,
    STDDEV(quality_score) as quality_stability,
    
    -- Expected vs actual readings
    COUNT(*) * 100.0 / (7 * 24 * 12) as data_availability_percent,  -- Expected: 5min intervals
    
    -- Value stability analysis
    STDDEV(value) as value_volatility,
    AVG(value) as avg_value_7d,
    
    -- Trend analysis using linear regression
    REGR_SLOPE(quality_score, EXTRACT(EPOCH FROM timestamp)) as quality_trend_slope,
    REGR_SLOPE(value, EXTRACT(EPOCH FROM timestamp)) as value_trend_slope,
    
    -- Time coverage
    MAX(timestamp) as last_reading_time,
    MIN(timestamp) as first_reading_time,
    
    -- Recent performance (last 24h vs historical)
    AVG(CASE WHEN timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours' 
         THEN quality_score END) as recent_quality_24h,
    AVG(CASE WHEN timestamp < CURRENT_TIMESTAMP - INTERVAL '24 hours' 
         THEN quality_score END) as historical_quality
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
  GROUP BY device_id, sensor_type, facility_id
  HAVING COUNT(*) >= 100  -- Minimum data threshold for analysis
),

health_scoring AS (
  SELECT 
    dph.*,
    
    -- Overall device health score (0-100)
    (
      -- Data availability component (40%)
      (LEAST(data_availability_percent, 100) * 0.4) +
      
      -- Quality component (30%)  
      (avg_quality_7d * 0.3) +
      
      -- Stability component (20%)
      (GREATEST(0, 100 - quality_stability) * 0.2) +
      
      -- Recency component (10%)
      (CASE 
        WHEN last_reading_time >= CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN 10
        WHEN last_reading_time >= CURRENT_TIMESTAMP - INTERVAL '6 hours' THEN 8
        WHEN last_reading_time >= CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 5
        ELSE 0
      END)
    ) as device_health_score,
    
    -- Maintenance predictions
    CASE 
      WHEN data_availability_percent < 70 THEN 'connectivity_issue'
      WHEN avg_quality_7d < 70 THEN 'sensor_degradation'
      WHEN quality_trend_slope < -0.1 THEN 'declining_quality'
      WHEN quality_stability > 15 THEN 'unstable_readings'
      WHEN last_reading_time < CURRENT_TIMESTAMP - INTERVAL '6 hours' THEN 'communication_failure'
      ELSE 'normal_operation'
    END as maintenance_issue,
    
    -- Urgency assessment
    CASE 
      WHEN data_availability_percent < 50 OR avg_quality_7d < 50 THEN 'immediate'
      WHEN data_availability_percent < 80 OR avg_quality_7d < 75 THEN 'within_week'
      WHEN quality_trend_slope < -0.05 OR quality_stability > 10 THEN 'within_month'
      ELSE 'routine'
    END as maintenance_urgency,
    
    -- Performance trend
    CASE 
      WHEN recent_quality_24h > historical_quality * 1.1 THEN 'improving'
      WHEN recent_quality_24h < historical_quality * 0.9 THEN 'degrading'
      ELSE 'stable'
    END as performance_trend
    
  FROM device_performance_history dph
)

SELECT 
  device_id,
  sensor_type,
  facility_id,
  
  -- Health metrics
  ROUND(device_health_score::NUMERIC, 1) as health_score,
  ROUND(data_availability_percent::NUMERIC, 1) as data_availability_pct,
  ROUND(avg_quality_7d::NUMERIC, 1) as avg_quality_score,
  ROUND(quality_stability::NUMERIC, 2) as quality_std_dev,
  
  -- Performance indicators
  performance_trend,
  maintenance_issue,
  maintenance_urgency,
  
  -- Trend analysis
  CASE 
    WHEN quality_trend_slope > 0.1 THEN 'Quality Improving'
    WHEN quality_trend_slope < -0.1 THEN 'Quality Declining'
    ELSE 'Quality Stable'
  END as quality_trend,
  
  -- Data freshness
  ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_reading_time)) / 3600::NUMERIC, 1) as hours_since_last_reading,
  
  -- Maintenance recommendations
  CASE maintenance_issue
    WHEN 'connectivity_issue' THEN 'Check network connectivity and power supply'
    WHEN 'sensor_degradation' THEN 'Schedule sensor calibration or replacement'
    WHEN 'declining_quality' THEN 'Investigate environmental factors affecting sensor'
    WHEN 'unstable_readings' THEN 'Check sensor mounting and interference sources'
    WHEN 'communication_failure' THEN 'Immediate device inspection required'
    ELSE 'Continue routine monitoring'
  END as maintenance_recommendation,
  
  -- Priority ranking
  CASE maintenance_urgency
    WHEN 'immediate' THEN 1
    WHEN 'within_week' THEN 2  
    WHEN 'within_month' THEN 3
    ELSE 4
  END as priority_rank

FROM health_scoring
ORDER BY 
  CASE maintenance_urgency
    WHEN 'immediate' THEN 1
    WHEN 'within_week' THEN 2
    WHEN 'within_month' THEN 3
    ELSE 4
  END,
  device_health_score ASC;

-- QueryLeaf provides comprehensive time-series capabilities:
-- 1. SQL-familiar CREATE TABLE syntax for time-series collections
-- 2. Advanced window functions and time-based aggregations
-- 3. Built-in anomaly detection with statistical analysis
-- 4. Cross-device correlation analysis and environmental assessments
-- 5. Predictive maintenance analytics with health scoring
-- 6. Real-time monitoring and alerting with SQL queries
-- 7. Hierarchical time aggregations (minute/hour/day levels)
-- 8. Performance trend analysis and maintenance recommendations
-- 9. Native integration with MongoDB time-series optimizations
-- 10. Familiar SQL patterns for complex IoT analytics requirements
```

## Best Practices for Time-Series Implementation

### Collection Design and Optimization

Essential practices for production time-series deployments:

1. **Granularity Selection**: Choose appropriate granularity (seconds/minutes/hours) based on data frequency
2. **MetaField Strategy**: Design metaField schemas that optimize for common query patterns
3. **TTL Management**: Implement time-based data lifecycle policies for storage optimization
4. **Index Planning**: Create indexes that align with time-based and metadata query patterns
5. **Compression Benefits**: Leverage MongoDB's automatic compression for time-series data
6. **Schema Evolution**: Design flexible schemas that accommodate IoT device changes

### Performance and Scalability

Optimize time-series collections for high-throughput IoT workloads:

1. **Batch Ingestion**: Use bulk operations for high-frequency sensor data ingestion
2. **Write Concern**: Balance durability and performance with appropriate write concerns
3. **Read Optimization**: Use aggregation pipelines for efficient analytical queries
4. **Real-time Processing**: Implement change streams for immediate data processing
5. **Memory Management**: Monitor working set size and configure appropriate caching
6. **Sharding Strategy**: Plan horizontal scaling for very high-volume deployments

## Conclusion

MongoDB Time-Series Collections provide comprehensive IoT data management capabilities that eliminate the complexity and overhead of traditional time-series database approaches. The combination of automatic storage optimization, intelligent indexing, and sophisticated analytical capabilities enables high-performance IoT applications that scale efficiently with growing sensor deployments.

Key Time-Series Collection benefits include:

- **Automatic Optimization**: Native storage compression and intelligent bucketing for temporal data patterns
- **Simplified Operations**: No manual partitioning or complex maintenance procedures required  
- **High-Performance Analytics**: Built-in support for statistical aggregations and window functions
- **Real-time Processing**: Change streams enable immediate response to incoming sensor data
- **Flexible Schema**: Easy accommodation of evolving IoT device capabilities and data structures
- **SQL Compatibility**: Familiar query patterns for complex time-series analytical operations

Whether you're building smart building systems, industrial monitoring platforms, environmental sensors networks, or any IoT application requiring temporal data analysis, MongoDB Time-Series Collections with QueryLeaf's SQL-familiar interface provides the foundation for modern IoT analytics that scales efficiently while maintaining familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Time-Series Collections while providing SQL-familiar syntax for time-series operations, statistical analysis, and IoT analytics. Advanced time-based aggregations, anomaly detection, and predictive maintenance patterns are seamlessly accessible through familiar SQL constructs, making sophisticated IoT development both powerful and approachable for SQL-oriented teams.

The integration of optimized time-series capabilities with SQL-style operations makes MongoDB an ideal platform for IoT applications that require both high-performance temporal data processing and familiar analytical query patterns, ensuring your IoT solutions remain both effective and maintainable as they scale and evolve.