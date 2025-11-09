---
title: "MongoDB Time Series Collections for IoT Data Management: Real-Time Analytics and High-Performance Data Processing"
description: "Master MongoDB Time Series Collections for IoT data management and analytics. Learn optimized time-based data storage, real-time processing, advanced aggregation pipelines, and production-ready IoT data architectures with SQL-familiar syntax."
date: 2025-11-08
tags: [mongodb, time-series, iot, analytics, real-time, data-processing, sensor-data, sql]
---

# MongoDB Time Series Collections for IoT Data Management: Real-Time Analytics and High-Performance Data Processing

Modern IoT applications generate massive volumes of time-stamped sensor data that require specialized storage and processing capabilities to handle millions of data points per second while enabling real-time analytics and efficient historical data queries. Traditional database approaches struggle with the scale, write-heavy workloads, and time-based query patterns characteristic of IoT systems, often requiring complex partitioning schemes, multiple storage tiers, and custom optimization strategies that increase operational complexity and development overhead.

MongoDB Time Series Collections provide purpose-built storage optimization for time-stamped data with automatic bucketing, compression, and query optimization specifically designed for IoT workloads. Unlike traditional approaches that require manual time-based partitioning and complex indexing strategies, Time Series Collections automatically organize data by time ranges, apply intelligent compression, and optimize queries for time-based access patterns while maintaining MongoDB's flexible document model and powerful aggregation capabilities.

## The Traditional IoT Data Storage Challenge

Conventional approaches to storing and processing IoT time series data face significant scalability and performance limitations:

```sql
-- Traditional PostgreSQL time series approach - complex partitioning and limited scalability

-- IoT sensor data with traditional table design
CREATE TABLE sensor_readings (
    reading_id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    location VARCHAR(200),
    
    -- Time series data
    timestamp TIMESTAMPTZ NOT NULL,
    value DECIMAL(15,6) NOT NULL,
    unit VARCHAR(20),
    quality_score DECIMAL(3,2) DEFAULT 1.0,
    
    -- Device and context metadata
    device_metadata JSONB,
    environmental_conditions JSONB,
    
    -- Data processing flags
    processed BOOLEAN DEFAULT FALSE,
    anomaly_detected BOOLEAN DEFAULT FALSE,
    data_source VARCHAR(100),
    
    -- Partitioning helper columns
    year_month INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM timestamp) * 100 + EXTRACT(MONTH FROM timestamp)) STORED,
    date_partition DATE GENERATED ALWAYS AS (DATE(timestamp)) STORED
);

-- Complex time-based partitioning (manual maintenance required)
CREATE TABLE sensor_readings_2024_01 PARTITION OF sensor_readings
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE sensor_readings_2024_02 PARTITION OF sensor_readings
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE sensor_readings_2024_03 PARTITION OF sensor_readings
FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

-- Additional partitions must be created manually each month
-- Automation required to prevent partition overflow

-- Indexing strategy for time series queries (expensive maintenance)
CREATE INDEX idx_sensor_readings_device_time ON sensor_readings (device_id, timestamp DESC);
CREATE INDEX idx_sensor_readings_sensor_type_time ON sensor_readings (sensor_type, timestamp DESC);
CREATE INDEX idx_sensor_readings_location_time ON sensor_readings (location, timestamp DESC);
CREATE INDEX idx_sensor_readings_timestamp_only ON sensor_readings (timestamp DESC);
CREATE INDEX idx_sensor_readings_processed_flag ON sensor_readings (processed, timestamp DESC);

-- Additional indexes for different query patterns
CREATE INDEX idx_sensor_readings_anomaly_time ON sensor_readings (anomaly_detected, timestamp DESC) WHERE anomaly_detected = TRUE;
CREATE INDEX idx_sensor_readings_device_type_time ON sensor_readings (device_id, sensor_type, timestamp DESC);

-- Materialized view for real-time aggregations (complex maintenance)
CREATE MATERIALIZED VIEW sensor_readings_hourly_summary AS
WITH hourly_aggregations AS (
    SELECT 
        device_id,
        sensor_type,
        location,
        DATE_TRUNC('hour', timestamp) as hour_bucket,
        
        -- Statistical aggregations
        COUNT(*) as reading_count,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        STDDEV(value) as stddev_value,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as median_value,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95_value,
        
        -- Data quality metrics
        AVG(quality_score) as avg_quality,
        COUNT(*) FILTER (WHERE quality_score < 0.8) as low_quality_readings,
        COUNT(*) FILTER (WHERE anomaly_detected = true) as anomaly_count,
        
        -- Value change analysis
        (MAX(value) - MIN(value)) as value_range,
        CASE 
            WHEN COUNT(*) > 1 THEN
                (LAST_VALUE(value) OVER (ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) - 
                 FIRST_VALUE(value) OVER (ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING))
            ELSE 0
        END as value_change_in_hour,
        
        -- Processing statistics
        COUNT(*) FILTER (WHERE processed = true) as processed_readings,
        (COUNT(*) FILTER (WHERE processed = true)::DECIMAL / COUNT(*)) * 100 as processing_rate_percent,
        
        -- Time coverage analysis
        (EXTRACT(EPOCH FROM MAX(timestamp) - MIN(timestamp)) / 3600) as time_coverage_hours,
        COUNT(*)::DECIMAL / (EXTRACT(EPOCH FROM MAX(timestamp) - MIN(timestamp)) / 60) as readings_per_minute
        
    FROM sensor_readings
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    GROUP BY device_id, sensor_type, location, DATE_TRUNC('hour', timestamp)
)
SELECT 
    ha.*,
    
    -- Additional calculated metrics
    CASE 
        WHEN ha.reading_count < 50 THEN 'sparse'
        WHEN ha.reading_count < 200 THEN 'normal'
        WHEN ha.reading_count < 500 THEN 'dense'
        ELSE 'very_dense'
    END as data_density_category,
    
    CASE 
        WHEN ha.avg_quality >= 0.95 THEN 'excellent'
        WHEN ha.avg_quality >= 0.8 THEN 'good'
        WHEN ha.avg_quality >= 0.6 THEN 'fair'
        ELSE 'poor'
    END as quality_category,
    
    -- Anomaly rate analysis
    CASE 
        WHEN ha.anomaly_count = 0 THEN 'normal'
        WHEN (ha.anomaly_count::DECIMAL / ha.reading_count) < 0.01 THEN 'low_anomalies'
        WHEN (ha.anomaly_count::DECIMAL / ha.reading_count) < 0.05 THEN 'moderate_anomalies'
        ELSE 'high_anomalies'
    END as anomaly_level,
    
    -- Performance indicators
    CASE 
        WHEN ha.readings_per_minute >= 10 THEN 'high_frequency'
        WHEN ha.readings_per_minute >= 1 THEN 'medium_frequency'
        WHEN ha.readings_per_minute >= 0.1 THEN 'low_frequency'
        ELSE 'very_low_frequency'
    END as sampling_frequency_category
    
FROM hourly_aggregations ha;

-- Must be refreshed periodically (expensive operation)
CREATE UNIQUE INDEX idx_sensor_hourly_unique ON sensor_readings_hourly_summary (device_id, sensor_type, location, hour_bucket);

-- Complex query for real-time analytics (resource-intensive)
WITH device_performance AS (
    SELECT 
        sr.device_id,
        sr.sensor_type,
        sr.location,
        DATE_TRUNC('minute', sr.timestamp) as minute_bucket,
        
        -- Real-time aggregations (expensive on large datasets)
        COUNT(*) as readings_per_minute,
        AVG(sr.value) as avg_value,
        STDDEV(sr.value) as value_stability,
        
        -- Change detection (requires window functions)
        LAG(AVG(sr.value)) OVER (
            PARTITION BY sr.device_id, sr.sensor_type 
            ORDER BY DATE_TRUNC('minute', sr.timestamp)
        ) as prev_minute_avg,
        
        -- Quality assessment
        AVG(sr.quality_score) as avg_quality,
        COUNT(*) FILTER (WHERE sr.anomaly_detected) as anomaly_count,
        
        -- Processing lag calculation
        AVG(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - sr.timestamp)) as avg_processing_lag_seconds
        
    FROM sensor_readings sr
    WHERE 
        sr.timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
        AND sr.processed = true
    GROUP BY sr.device_id, sr.sensor_type, sr.location, DATE_TRUNC('minute', sr.timestamp)
),

real_time_alerts AS (
    SELECT 
        dp.*,
        
        -- Alert conditions
        CASE 
            WHEN ABS(dp.avg_value - dp.prev_minute_avg) > (dp.value_stability * 3) THEN 'value_spike'
            WHEN dp.avg_quality < 0.7 THEN 'quality_degradation'
            WHEN dp.anomaly_count > 0 THEN 'anomalies_detected'
            WHEN dp.avg_processing_lag_seconds > 300 THEN 'processing_delay'
            WHEN dp.readings_per_minute < 0.5 THEN 'data_gap'
            ELSE 'normal'
        END as alert_type,
        
        -- Severity calculation
        CASE 
            WHEN dp.anomaly_count > 10 OR dp.avg_quality < 0.5 THEN 'critical'
            WHEN dp.anomaly_count > 5 OR dp.avg_quality < 0.7 OR dp.avg_processing_lag_seconds > 600 THEN 'high'
            WHEN dp.anomaly_count > 2 OR dp.avg_quality < 0.8 OR dp.avg_processing_lag_seconds > 300 THEN 'medium'
            ELSE 'low'
        END as alert_severity,
        
        -- Performance assessment
        CASE 
            WHEN dp.readings_per_minute >= 30 AND dp.avg_quality >= 0.9 THEN 'optimal'
            WHEN dp.readings_per_minute >= 10 AND dp.avg_quality >= 0.8 THEN 'good'
            WHEN dp.readings_per_minute >= 1 AND dp.avg_quality >= 0.6 THEN 'acceptable'
            ELSE 'poor'
        END as performance_status
        
    FROM device_performance dp
    WHERE dp.minute_bucket >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
),

device_health_summary AS (
    SELECT 
        rta.device_id,
        COUNT(*) as total_minutes_analyzed,
        
        -- Health metrics
        COUNT(*) FILTER (WHERE rta.alert_type != 'normal') as minutes_with_alerts,
        COUNT(*) FILTER (WHERE rta.alert_severity IN ('critical', 'high')) as critical_minutes,
        COUNT(*) FILTER (WHERE rta.performance_status IN ('optimal', 'good')) as good_performance_minutes,
        
        -- Overall device status
        AVG(rta.avg_quality) as overall_quality,
        AVG(rta.readings_per_minute) as avg_data_rate,
        SUM(rta.anomaly_count) as total_anomalies,
        
        -- Most recent status
        LAST_VALUE(rta.performance_status) OVER (
            PARTITION BY rta.device_id 
            ORDER BY rta.minute_bucket 
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) as current_status,
        
        LAST_VALUE(rta.alert_type) OVER (
            PARTITION BY rta.device_id 
            ORDER BY rta.minute_bucket 
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) as current_alert_type
        
    FROM real_time_alerts rta
    GROUP BY rta.device_id
)

-- Final real-time dashboard query
SELECT 
    dhs.device_id,
    dhs.current_status,
    dhs.current_alert_type,
    
    -- Health indicators
    ROUND(dhs.overall_quality, 3) as quality_score,
    ROUND(dhs.avg_data_rate, 1) as data_rate_per_minute,
    dhs.total_anomalies,
    
    -- Alert summary
    dhs.minutes_with_alerts,
    dhs.critical_minutes,
    dhs.good_performance_minutes,
    
    -- Performance assessment
    ROUND((dhs.good_performance_minutes::DECIMAL / dhs.total_minutes_analyzed) * 100, 1) as uptime_percentage,
    ROUND((dhs.minutes_with_alerts::DECIMAL / dhs.total_minutes_analyzed) * 100, 1) as alert_percentage,
    
    -- Device health classification
    CASE 
        WHEN dhs.critical_minutes > 2 OR dhs.overall_quality < 0.6 THEN 'unhealthy'
        WHEN dhs.minutes_with_alerts > 5 OR dhs.overall_quality < 0.8 THEN 'degraded'
        WHEN dhs.good_performance_minutes >= (dhs.total_minutes_analyzed * 0.8) THEN 'healthy'
        ELSE 'monitoring'
    END as device_health_status,
    
    -- Recommendations
    CASE 
        WHEN dhs.total_anomalies > 20 THEN 'investigate_sensor_calibration'
        WHEN dhs.avg_data_rate < 1 THEN 'check_connectivity'
        WHEN dhs.overall_quality < 0.7 THEN 'review_sensor_maintenance'
        WHEN dhs.critical_minutes > 0 THEN 'immediate_attention_required'
        ELSE 'operating_normally'
    END as recommended_action
    
FROM device_health_summary dhs
ORDER BY 
    CASE dhs.current_status
        WHEN 'poor' THEN 1
        WHEN 'acceptable' THEN 2
        WHEN 'good' THEN 3
        WHEN 'optimal' THEN 4
    END,
    dhs.critical_minutes DESC,
    dhs.total_anomalies DESC;

-- Traditional time series problems:
-- 1. Complex manual partitioning and maintenance overhead
-- 2. Expensive materialized view refreshes for real-time analytics
-- 3. Limited compression and storage optimization for time series data
-- 4. Complex indexing strategies with high maintenance costs
-- 5. Poor write performance under high-volume IoT workloads
-- 6. Difficult horizontal scaling for time series data
-- 7. Limited time-based query optimization
-- 8. Complex time window and rollup aggregations
-- 9. Expensive historical data archiving and cleanup operations
-- 10. No built-in time series specific features and optimizations
```

MongoDB Time Series Collections provide comprehensive IoT data management with automatic optimization and intelligent compression:

```javascript
// MongoDB Time Series Collections - Optimized IoT data storage and analytics
const { MongoClient, ObjectId } = require('mongodb');

// Comprehensive IoT Time Series Data Manager
class IoTTimeSeriesManager {
  constructor(connectionString, iotConfig = {}) {
    this.connectionString = connectionString;
    this.client = null;
    this.db = null;
    
    this.config = {
      // Time series configuration
      defaultGranularity: iotConfig.defaultGranularity || 'seconds',
      enableAutomaticIndexing: iotConfig.enableAutomaticIndexing !== false,
      enableCompression: iotConfig.enableCompression !== false,
      
      // IoT-specific features
      enableRealTimeAlerts: iotConfig.enableRealTimeAlerts !== false,
      enableAnomalyDetection: iotConfig.enableAnomalyDetection !== false,
      enablePredictiveAnalytics: iotConfig.enablePredictiveAnalytics !== false,
      enableDataQualityMonitoring: iotConfig.enableDataQualityMonitoring !== false,
      
      // Performance optimization
      batchWriteSize: iotConfig.batchWriteSize || 1000,
      writeConcern: iotConfig.writeConcern || { w: 1, j: true },
      readPreference: iotConfig.readPreference || 'primaryPreferred',
      maxConnectionPoolSize: iotConfig.maxConnectionPoolSize || 100,
      
      // Data retention and archival
      enableDataLifecycleManagement: iotConfig.enableDataLifecycleManagement !== false,
      defaultRetentionDays: iotConfig.defaultRetentionDays || 365,
      enableAutomaticArchiving: iotConfig.enableAutomaticArchiving !== false,
      
      // Analytics and processing
      enableStreamProcessing: iotConfig.enableStreamProcessing !== false,
      enableRealTimeAggregation: iotConfig.enableRealTimeAggregation !== false,
      aggregationWindowSize: iotConfig.aggregationWindowSize || '1 minute',
      
      ...iotConfig
    };
    
    // Time series collections for different data types
    this.timeSeriesCollections = new Map();
    this.aggregationCollections = new Map();
    this.alertCollections = new Map();
    
    // Real-time processing components
    this.changeStreams = new Map();
    this.processingPipelines = new Map();
    this.alertRules = new Map();
    
    // Performance metrics
    this.performanceMetrics = {
      totalDataPoints: 0,
      writeOperationsPerSecond: 0,
      queryOperationsPerSecond: 0,
      averageLatency: 0,
      compressionRatio: 0,
      alertsTriggered: 0
    };
  }

  async initializeIoTTimeSeriesSystem() {
    console.log('Initializing MongoDB IoT Time Series system...');
    
    try {
      // Connect to MongoDB
      this.client = new MongoClient(this.connectionString, {
        maxPoolSize: this.config.maxConnectionPoolSize,
        writeConcern: this.config.writeConcern,
        readPreference: this.config.readPreference
      });
      
      await this.client.connect();
      this.db = this.client.db();
      
      // Create time series collections for different sensor types
      await this.createTimeSeriesCollections();
      
      // Setup real-time processing pipelines
      if (this.config.enableStreamProcessing) {
        await this.setupStreamProcessing();
      }
      
      // Initialize real-time aggregations
      if (this.config.enableRealTimeAggregation) {
        await this.setupRealTimeAggregations();
      }
      
      // Setup anomaly detection
      if (this.config.enableAnomalyDetection) {
        await this.setupAnomalyDetection();
      }
      
      // Initialize data lifecycle management
      if (this.config.enableDataLifecycleManagement) {
        await this.setupDataLifecycleManagement();
      }
      
      console.log('IoT Time Series system initialized successfully');
      
    } catch (error) {
      console.error('Error initializing IoT Time Series system:', error);
      throw error;
    }
  }

  async createTimeSeriesCollections() {
    console.log('Creating optimized time series collections...');
    
    // Sensor readings time series collection with automatic bucketing
    await this.createOptimizedTimeSeriesCollection('sensor_readings', {
      timeField: 'timestamp',
      metaField: 'device',
      granularity: this.config.defaultGranularity,
      bucketMaxSpanSeconds: 3600, // 1 hour buckets
      bucketRoundingSeconds: 60,  // Round to nearest minute
      
      // Optimize for IoT data patterns
      expireAfterSeconds: this.config.defaultRetentionDays * 24 * 60 * 60,
      
      // Index optimization for common IoT queries
      additionalIndexes: [
        { 'device.id': 1, 'timestamp': -1 },
        { 'device.type': 1, 'timestamp': -1 },
        { 'device.location': 1, 'timestamp': -1 },
        { 'sensor.type': 1, 'timestamp': -1 }
      ]
    });
    
    // Environmental monitoring time series
    await this.createOptimizedTimeSeriesCollection('environmental_data', {
      timeField: 'timestamp',
      metaField: 'location',
      granularity: 'minutes',
      bucketMaxSpanSeconds: 7200, // 2 hour buckets for slower changing data
      
      additionalIndexes: [
        { 'location.facility': 1, 'location.zone': 1, 'timestamp': -1 },
        { 'sensor_type': 1, 'timestamp': -1 }
      ]
    });
    
    // Equipment performance monitoring
    await this.createOptimizedTimeSeriesCollection('equipment_metrics', {
      timeField: 'timestamp',
      metaField: 'equipment',
      granularity: 'seconds',
      bucketMaxSpanSeconds: 1800, // 30 minute buckets for high-frequency data
      
      additionalIndexes: [
        { 'equipment.id': 1, 'equipment.type': 1, 'timestamp': -1 },
        { 'metric_type': 1, 'timestamp': -1 }
      ]
    });
    
    // Energy consumption tracking
    await this.createOptimizedTimeSeriesCollection('energy_consumption', {
      timeField: 'timestamp',
      metaField: 'meter',
      granularity: 'minutes',
      bucketMaxSpanSeconds: 3600, // 1 hour buckets
      
      additionalIndexes: [
        { 'meter.id': 1, 'timestamp': -1 },
        { 'meter.building': 1, 'meter.floor': 1, 'timestamp': -1 }
      ]
    });
    
    // Vehicle telemetry data
    await this.createOptimizedTimeSeriesCollection('vehicle_telemetry', {
      timeField: 'timestamp',
      metaField: 'vehicle',
      granularity: 'seconds',
      bucketMaxSpanSeconds: 900, // 15 minute buckets for mobile data
      
      additionalIndexes: [
        { 'vehicle.id': 1, 'timestamp': -1 },
        { 'vehicle.route': 1, 'timestamp': -1 },
        { 'telemetry_type': 1, 'timestamp': -1 }
      ]
    });
    
    console.log('Time series collections created successfully');
  }

  async createOptimizedTimeSeriesCollection(collectionName, config) {
    console.log(`Creating time series collection: ${collectionName}`);
    
    try {
      // Create time series collection with MongoDB's native optimization
      const collection = await this.db.createCollection(collectionName, {
        timeseries: {
          timeField: config.timeField,
          metaField: config.metaField,
          granularity: config.granularity,
          bucketMaxSpanSeconds: config.bucketMaxSpanSeconds,
          bucketRoundingSeconds: config.bucketRoundingSeconds || 60
        },
        
        // Set TTL for automatic data expiration
        ...(config.expireAfterSeconds && {
          expireAfterSeconds: config.expireAfterSeconds
        }),
        
        // Enable compression for storage optimization
        storageEngine: {
          wiredTiger: {
            configString: 'block_compressor=zstd'
          }
        }
      });
      
      // Create additional indexes for query optimization
      if (config.additionalIndexes) {
        await collection.createIndexes(
          config.additionalIndexes.map(indexSpec => ({
            key: indexSpec,
            background: true,
            name: `idx_${Object.keys(indexSpec).join('_')}`
          }))
        );
      }
      
      // Store collection reference and configuration
      this.timeSeriesCollections.set(collectionName, {
        collection: collection,
        config: config,
        stats: {
          documentsInserted: 0,
          bytesStored: 0,
          compressionRatio: 0,
          lastInsertTime: null
        }
      });
      
      console.log(`Time series collection ${collectionName} created successfully`);
      
    } catch (error) {
      console.error(`Error creating time series collection ${collectionName}:`, error);
      throw error;
    }
  }

  async insertSensorData(collectionName, sensorDataPoints) {
    const startTime = Date.now();
    
    try {
      const collectionInfo = this.timeSeriesCollections.get(collectionName);
      if (!collectionInfo) {
        throw new Error(`Time series collection ${collectionName} not found`);
      }
      
      const collection = collectionInfo.collection;
      
      // Prepare data points with enhanced metadata
      const enhancedDataPoints = sensorDataPoints.map(dataPoint => ({
        // Time series fields
        timestamp: dataPoint.timestamp || new Date(),
        
        // Device/sensor metadata (automatically indexed as metaField)
        device: {
          id: dataPoint.deviceId,
          type: dataPoint.deviceType || 'generic_sensor',
          location: {
            facility: dataPoint.facility || 'unknown',
            zone: dataPoint.zone || 'default',
            coordinates: dataPoint.coordinates || null,
            floor: dataPoint.floor || null,
            room: dataPoint.room || null
          },
          firmware: dataPoint.firmwareVersion || null,
          manufacturer: dataPoint.manufacturer || null,
          model: dataPoint.model || null,
          installDate: dataPoint.installDate || null
        },
        
        // Sensor information
        sensor: {
          type: dataPoint.sensorType,
          unit: dataPoint.unit || null,
          precision: dataPoint.precision || null,
          calibrationDate: dataPoint.calibrationDate || null,
          maintenanceSchedule: dataPoint.maintenanceSchedule || null
        },
        
        // Measurement data
        value: dataPoint.value,
        rawValue: dataPoint.rawValue || dataPoint.value,
        
        // Data quality indicators
        quality: {
          score: dataPoint.qualityScore || 1.0,
          flags: dataPoint.qualityFlags || [],
          confidence: dataPoint.confidence || 1.0,
          calibrationStatus: dataPoint.calibrationStatus || 'valid',
          sensorHealth: dataPoint.sensorHealth || 'healthy'
        },
        
        // Environmental context
        environmentalConditions: {
          temperature: dataPoint.ambientTemperature || null,
          humidity: dataPoint.ambientHumidity || null,
          pressure: dataPoint.atmosphericPressure || null,
          vibration: dataPoint.vibrationLevel || null,
          electricalNoise: dataPoint.electricalNoise || null
        },
        
        // Processing metadata
        processing: {
          receivedAt: new Date(),
          source: dataPoint.dataSource || 'direct',
          protocol: dataPoint.protocol || 'unknown',
          gateway: dataPoint.gatewayId || null,
          processingLatency: dataPoint.processingLatency || null,
          networkLatency: dataPoint.networkLatency || null
        },
        
        // Alert and anomaly flags
        alerts: {
          anomalyDetected: dataPoint.anomalyDetected || false,
          thresholdViolation: dataPoint.thresholdViolation || null,
          alertLevel: dataPoint.alertLevel || 'normal',
          alertReason: dataPoint.alertReason || null
        },
        
        // Business context
        businessContext: {
          assetId: dataPoint.assetId || null,
          processId: dataPoint.processId || null,
          operationalMode: dataPoint.operationalMode || 'normal',
          shiftId: dataPoint.shiftId || null,
          operatorId: dataPoint.operatorId || null
        },
        
        // Additional custom metadata
        customMetadata: dataPoint.customMetadata || {}
      }));
      
      // Perform batch insert with write concern
      const result = await collection.insertMany(enhancedDataPoints, {
        writeConcern: this.config.writeConcern,
        ordered: false // Allow partial success for better performance
      });
      
      const insertTime = Date.now() - startTime;
      
      // Update collection statistics
      collectionInfo.stats.documentsInserted += result.insertedCount;
      collectionInfo.stats.lastInsertTime = new Date();
      
      // Update performance metrics
      this.updatePerformanceMetrics('insert', result.insertedCount, insertTime);
      
      // Trigger real-time processing if enabled
      if (this.config.enableStreamProcessing) {
        await this.processRealTimeData(collectionName, enhancedDataPoints);
      }
      
      // Check for alerts if enabled
      if (this.config.enableRealTimeAlerts) {
        await this.checkAlertConditions(collectionName, enhancedDataPoints);
      }
      
      console.log(`Inserted ${result.insertedCount} sensor data points into ${collectionName} in ${insertTime}ms`);
      
      return {
        success: true,
        collection: collectionName,
        insertedCount: result.insertedCount,
        insertTime: insertTime,
        insertedIds: result.insertedIds
      };
      
    } catch (error) {
      console.error(`Error inserting sensor data into ${collectionName}:`, error);
      return {
        success: false,
        collection: collectionName,
        error: error.message,
        insertTime: Date.now() - startTime
      };
    }
  }

  async queryTimeSeriesData(collectionName, query) {
    const startTime = Date.now();
    
    try {
      const collectionInfo = this.timeSeriesCollections.get(collectionName);
      if (!collectionInfo) {
        throw new Error(`Time series collection ${collectionName} not found`);
      }
      
      const collection = collectionInfo.collection;
      
      // Build comprehensive aggregation pipeline for time series analysis
      const pipeline = [
        // Time range filtering (optimized for time series collections)
        {
          $match: {
            timestamp: {
              $gte: query.startTime,
              $lte: query.endTime || new Date()
            },
            ...(query.deviceIds && { 'device.id': { $in: query.deviceIds } }),
            ...(query.deviceTypes && { 'device.type': { $in: query.deviceTypes } }),
            ...(query.sensorTypes && { 'sensor.type': { $in: query.sensorTypes } }),
            ...(query.locations && { 'device.location.facility': { $in: query.locations } }),
            ...(query.minQualityScore && { 'quality.score': { $gte: query.minQualityScore } }),
            ...(query.alertLevel && { 'alerts.alertLevel': query.alertLevel })
          }
        },
        
        // Time-based grouping and aggregation
        {
          $group: {
            _id: {
              deviceId: '$device.id',
              deviceType: '$device.type',
              sensorType: '$sensor.type',
              location: '$device.location',
              
              // Time bucketing based on query granularity
              timeBucket: query.granularity === 'hour' 
                ? { $dateTrunc: { date: '$timestamp', unit: 'hour' } }
                : query.granularity === 'minute'
                ? { $dateTrunc: { date: '$timestamp', unit: 'minute' } }
                : query.granularity === 'day'
                ? { $dateTrunc: { date: '$timestamp', unit: 'day' } }
                : '$timestamp' // Raw timestamp for second-level granularity
            },
            
            // Statistical aggregations
            count: { $sum: 1 },
            avgValue: { $avg: '$value' },
            minValue: { $min: '$value' },
            maxValue: { $max: '$value' },
            sumValue: { $sum: '$value' },
            
            // Advanced statistical measures
            stdDevValue: { $stdDevPop: '$value' },
            varianceValue: { $pow: [{ $stdDevPop: '$value' }, 2] },
            
            // Percentile calculations using $percentile (MongoDB 7.0+)
            percentiles: {
              $percentile: {
                input: '$value',
                p: [0.25, 0.5, 0.75, 0.9, 0.95, 0.99],
                method: 'approximate'
              }
            },
            
            // Data quality metrics
            avgQualityScore: { $avg: '$quality.score' },
            minQualityScore: { $min: '$quality.score' },
            lowQualityCount: {
              $sum: { $cond: [{ $lt: ['$quality.score', 0.8] }, 1, 0] }
            },
            
            // Alert and anomaly statistics
            anomalyCount: {
              $sum: { $cond: ['$alerts.anomalyDetected', 1, 0] }
            },
            alertCounts: {
              $push: {
                $cond: [
                  { $ne: ['$alerts.alertLevel', 'normal'] },
                  '$alerts.alertLevel',
                  '$$REMOVE'
                ]
              }
            },
            
            // Time-based metrics
            firstReading: { $min: '$timestamp' },
            lastReading: { $max: '$timestamp' },
            
            // Value change analysis
            valueRange: { $subtract: [{ $max: '$value' }, { $min: '$value' }] },
            
            // Environmental conditions (if available)
            avgAmbientTemp: { $avg: '$environmentalConditions.temperature' },
            avgAmbientHumidity: { $avg: '$environmentalConditions.humidity' },
            
            // Processing performance
            avgProcessingLatency: { $avg: '$processing.processingLatency' },
            maxProcessingLatency: { $max: '$processing.processingLatency' },
            
            // Raw data points (if requested for detailed analysis)
            ...(query.includeRawData && {
              rawDataPoints: {
                $push: {
                  timestamp: '$timestamp',
                  value: '$value',
                  quality: '$quality.score',
                  anomaly: '$alerts.anomalyDetected'
                }
              }
            })
          }
        },
        
        // Calculate additional derived metrics
        {
          $addFields: {
            // Time coverage and sampling rate analysis
            timeCoverageSeconds: {
              $divide: [
                { $subtract: ['$lastReading', '$firstReading'] },
                1000
              ]
            },
            
            // Data completeness analysis
            expectedReadings: {
              $cond: [
                { $eq: [query.granularity, 'minute'] },
                { $divide: [{ $subtract: ['$lastReading', '$firstReading'] }, 60000] },
                { $cond: [
                  { $eq: [query.granularity, 'hour'] },
                  { $divide: [{ $subtract: ['$lastReading', '$firstReading'] }, 3600000] },
                  '$count'
                ]}
              ]
            },
            
            // Statistical analysis
            coefficientOfVariation: {
              $cond: [
                { $ne: ['$avgValue', 0] },
                { $divide: ['$stdDevValue', '$avgValue'] },
                0
              ]
            },
            
            // Data quality percentage
            qualityPercentage: {
              $multiply: [
                { $divide: [
                  { $subtract: ['$count', '$lowQualityCount'] },
                  '$count'
                ]},
                100
              ]
            },
            
            // Anomaly rate
            anomalyRate: {
              $multiply: [
                { $divide: ['$anomalyCount', '$count'] },
                100
              ]
            },
            
            // Alert distribution
            alertDistribution: {
              $reduce: {
                input: '$alertCounts',
                initialValue: {},
                in: {
                  $mergeObjects: [
                    '$$value',
                    { ['$$this']: { $add: [{ $ifNull: [{ $getField: { field: '$$this', input: '$$value' } }, 0] }, 1] } }
                  ]
                }
              }
            },
            
            // Performance classification
            performanceCategory: {
              $switch: {
                branches: [
                  { 
                    case: { 
                      $and: [
                        { $gte: ['$qualityPercentage', 95] },
                        { $lt: ['$anomalyRate', 1] },
                        { $lte: ['$avgProcessingLatency', 100] }
                      ]
                    }, 
                    then: 'excellent' 
                  },
                  { 
                    case: { 
                      $and: [
                        { $gte: ['$qualityPercentage', 85] },
                        { $lt: ['$anomalyRate', 5] },
                        { $lte: ['$avgProcessingLatency', 300] }
                      ]
                    }, 
                    then: 'good' 
                  },
                  { 
                    case: { 
                      $and: [
                        { $gte: ['$qualityPercentage', 70] },
                        { $lt: ['$anomalyRate', 10] }
                      ]
                    }, 
                    then: 'fair' 
                  }
                ],
                default: 'poor'
              }
            },
            
            // Trending analysis (basic)
            valueTrend: {
              $cond: [
                { $and: [
                  { $ne: ['$minValue', '$maxValue'] },
                  { $gt: ['$count', 1] }
                ]},
                {
                  $switch: {
                    branches: [
                      { case: { $gt: ['$valueRange', { $multiply: ['$avgValue', 0.2] }] }, then: 'volatile' },
                      { case: { $gt: ['$coefficientOfVariation', 0.3] }, then: 'variable' },
                      { case: { $lt: ['$coefficientOfVariation', 0.1] }, then: 'stable' }
                    ],
                    default: 'moderate'
                  }
                },
                'insufficient_data'
              ]
            }
          }
        },
        
        // Data completeness analysis
        {
          $addFields: {
            dataCompleteness: {
              $multiply: [
                { $divide: ['$count', { $max: ['$expectedReadings', 1] }] },
                100
              ]
            },
            
            // Sampling rate (readings per minute)
            samplingRate: {
              $cond: [
                { $gt: ['$timeCoverageSeconds', 0] },
                { $divide: ['$count', { $divide: ['$timeCoverageSeconds', 60] }] },
                0
              ]
            }
          }
        },
        
        // Final projection and organization
        {
          $project: {
            // Identity fields
            deviceId: '$_id.deviceId',
            deviceType: '$_id.deviceType',
            sensorType: '$_id.sensorType',
            location: '$_id.location',
            timeBucket: '$_id.timeBucket',
            
            // Basic statistics
            dataPoints: '$count',
            statistics: {
              avg: { $round: ['$avgValue', 4] },
              min: '$minValue',
              max: '$maxValue',
              sum: { $round: ['$sumValue', 2] },
              stdDev: { $round: ['$stdDevValue', 4] },
              variance: { $round: ['$varianceValue', 4] },
              coefficientOfVariation: { $round: ['$coefficientOfVariation', 4] },
              valueRange: { $round: ['$valueRange', 4] },
              percentiles: '$percentiles'
            },
            
            // Data quality metrics
            dataQuality: {
              avgScore: { $round: ['$avgQualityScore', 3] },
              minScore: { $round: ['$minQualityScore', 3] },
              qualityPercentage: { $round: ['$qualityPercentage', 1] },
              lowQualityCount: '$lowQualityCount'
            },
            
            // Alert and anomaly information
            alerts: {
              anomalyCount: '$anomalyCount',
              anomalyRate: { $round: ['$anomalyRate', 2] },
              alertDistribution: '$alertDistribution'
            },
            
            // Time-based analysis
            temporal: {
              firstReading: '$firstReading',
              lastReading: '$lastReading',
              timeCoverageSeconds: { $round: ['$timeCoverageSeconds', 0] },
              dataCompleteness: { $round: ['$dataCompleteness', 1] },
              samplingRate: { $round: ['$samplingRate', 2] }
            },
            
            // Environmental context
            environment: {
              avgTemperature: { $round: ['$avgAmbientTemp', 1] },
              avgHumidity: { $round: ['$avgAmbientHumidity', 1] }
            },
            
            // Performance metrics
            performance: {
              avgProcessingLatency: { $round: ['$avgProcessingLatency', 0] },
              maxProcessingLatency: { $round: ['$maxProcessingLatency', 0] },
              performanceCategory: '$performanceCategory'
            },
            
            // Analysis results
            analysis: {
              valueTrend: '$valueTrend',
              overallAssessment: {
                $switch: {
                  branches: [
                    { 
                      case: { 
                        $and: [
                          { $eq: ['$performanceCategory', 'excellent'] },
                          { $gte: ['$dataCompleteness', 95] }
                        ]
                      }, 
                      then: 'optimal_performance' 
                    },
                    { 
                      case: { 
                        $and: [
                          { $in: ['$performanceCategory', ['good', 'excellent']] },
                          { $gte: ['$dataCompleteness', 80] }
                        ]
                      }, 
                      then: 'good_performance' 
                    },
                    { 
                      case: { $lt: ['$dataCompleteness', 50] }, 
                      then: 'data_gaps_detected' 
                    },
                    { 
                      case: { $gt: ['$anomalyRate', 15] }, 
                      then: 'high_anomaly_rate' 
                    },
                    { 
                      case: { $lt: ['$qualityPercentage', 70] }, 
                      then: 'quality_issues' 
                    }
                  ],
                  default: 'acceptable_performance'
                }
              }
            },
            
            // Include raw data if requested
            ...(query.includeRawData && { rawDataPoints: 1 })
          }
        },
        
        // Sort results
        { $sort: { deviceId: 1, timeBucket: 1 } },
        
        // Apply result limits
        ...(query.limit && [{ $limit: query.limit }])
      ];
      
      // Execute aggregation pipeline
      const results = await collection.aggregate(pipeline, {
        allowDiskUse: true,
        maxTimeMS: 30000
      }).toArray();
      
      const queryTime = Date.now() - startTime;
      
      // Update performance metrics
      this.updatePerformanceMetrics('query', results.length, queryTime);
      
      console.log(`Time series query completed: ${results.length} results in ${queryTime}ms`);
      
      return {
        success: true,
        collection: collectionName,
        results: results,
        resultCount: results.length,
        queryTime: queryTime,
        queryMetadata: {
          timeRange: {
            start: query.startTime,
            end: query.endTime || new Date()
          },
          granularity: query.granularity || 'raw',
          filters: {
            deviceIds: query.deviceIds?.length || 0,
            deviceTypes: query.deviceTypes?.length || 0,
            sensorTypes: query.sensorTypes?.length || 0,
            locations: query.locations?.length || 0
          },
          optimizationsApplied: ['time_series_bucketing', 'statistical_aggregation', 'index_optimization']
        }
      };
      
    } catch (error) {
      console.error(`Error querying time series data from ${collectionName}:`, error);
      return {
        success: false,
        collection: collectionName,
        error: error.message,
        queryTime: Date.now() - startTime
      };
    }
  }

  async setupRealTimeAggregations() {
    console.log('Setting up real-time aggregation pipelines...');
    
    // Create aggregation collections for different time windows
    const aggregationConfigs = [
      {
        name: 'sensor_readings_1min',
        sourceCollection: 'sensor_readings',
        windowSize: '1 minute',
        retentionDays: 7
      },
      {
        name: 'sensor_readings_5min',
        sourceCollection: 'sensor_readings',
        windowSize: '5 minutes',
        retentionDays: 30
      },
      {
        name: 'sensor_readings_1hour',
        sourceCollection: 'sensor_readings', 
        windowSize: '1 hour',
        retentionDays: 365
      },
      {
        name: 'sensor_readings_1day',
        sourceCollection: 'sensor_readings',
        windowSize: '1 day',
        retentionDays: 1825 // 5 years
      }
    ];
    
    for (const config of aggregationConfigs) {
      await this.createAggregationPipeline(config);
    }
    
    console.log('Real-time aggregation pipelines setup completed');
  }

  async createAggregationPipeline(config) {
    console.log(`Creating aggregation pipeline: ${config.name}`);
    
    // Create collection for storing aggregated data
    const aggregationCollection = await this.db.createCollection(config.name, {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'device',
        granularity: config.windowSize.includes('minute') ? 'minutes' : 
                    config.windowSize.includes('hour') ? 'hours' : 'days'
      },
      expireAfterSeconds: config.retentionDays * 24 * 60 * 60
    });
    
    this.aggregationCollections.set(config.name, {
      collection: aggregationCollection,
      config: config
    });
  }

  async processRealTimeData(collectionName, dataPoints) {
    console.log(`Processing real-time data for ${collectionName}: ${dataPoints.length} points`);
    
    // Update real-time aggregations
    for (const [aggName, aggInfo] of this.aggregationCollections.entries()) {
      if (aggInfo.config.sourceCollection === collectionName) {
        await this.updateRealTimeAggregation(aggName, dataPoints);
      }
    }
    
    // Process data through ML pipelines if enabled
    if (this.config.enablePredictiveAnalytics) {
      await this.processPredictiveAnalytics(dataPoints);
    }
  }

  async checkAlertConditions(collectionName, dataPoints) {
    console.log(`Checking alert conditions for ${dataPoints.length} data points`);
    
    const alertsTriggered = [];
    
    for (const dataPoint of dataPoints) {
      // Check various alert conditions
      const alerts = [];
      
      // Value threshold alerts
      if (dataPoint.sensor.type === 'temperature' && dataPoint.value > 80) {
        alerts.push({
          type: 'threshold_violation',
          severity: 'high',
          message: `Temperature ${dataPoint.value}°C exceeds threshold`,
          deviceId: dataPoint.device.id
        });
      }
      
      // Quality score alerts
      if (dataPoint.quality.score < 0.7) {
        alerts.push({
          type: 'quality_degradation',
          severity: 'medium',
          message: `Quality score ${dataPoint.quality.score} below acceptable level`,
          deviceId: dataPoint.device.id
        });
      }
      
      // Anomaly alerts
      if (dataPoint.alerts.anomalyDetected) {
        alerts.push({
          type: 'anomaly_detected',
          severity: 'high',
          message: `Anomaly detected in sensor reading`,
          deviceId: dataPoint.device.id
        });
      }
      
      // Processing latency alerts
      if (dataPoint.processing.processingLatency > 5000) { // 5 seconds
        alerts.push({
          type: 'processing_delay',
          severity: 'medium',
          message: `Processing latency ${dataPoint.processing.processingLatency}ms exceeds threshold`,
          deviceId: dataPoint.device.id
        });
      }
      
      if (alerts.length > 0) {
        alertsTriggered.push(...alerts);
        this.performanceMetrics.alertsTriggered += alerts.length;
      }
    }
    
    // Store alerts if any were triggered
    if (alertsTriggered.length > 0) {
      await this.storeAlerts(alertsTriggered);
    }
    
    return alertsTriggered;
  }

  async storeAlerts(alerts) {
    try {
      // Create alerts collection if it doesn't exist
      if (!this.alertCollections.has('iot_alerts')) {
        const alertsCollection = await this.db.createCollection('iot_alerts');
        await alertsCollection.createIndexes([
          { key: { deviceId: 1, timestamp: -1 }, background: true },
          { key: { severity: 1, timestamp: -1 }, background: true },
          { key: { type: 1, timestamp: -1 }, background: true }
        ]);
        
        this.alertCollections.set('iot_alerts', alertsCollection);
      }
      
      const alertsCollection = this.alertCollections.get('iot_alerts');
      
      const alertDocuments = alerts.map(alert => ({
        ...alert,
        timestamp: new Date(),
        acknowledged: false,
        resolvedAt: null
      }));
      
      await alertsCollection.insertMany(alertDocuments);
      
      console.log(`Stored ${alertDocuments.length} alerts`);
      
    } catch (error) {
      console.error('Error storing alerts:', error);
    }
  }

  updatePerformanceMetrics(operation, count, duration) {
    if (operation === 'insert') {
      this.performanceMetrics.totalDataPoints += count;
      this.performanceMetrics.writeOperationsPerSecond = 
        (count / duration) * 1000;
    } else if (operation === 'query') {
      this.performanceMetrics.queryOperationsPerSecond = 
        (count / duration) * 1000;
    }
    
    // Update average latency
    this.performanceMetrics.averageLatency = 
      (this.performanceMetrics.averageLatency + duration) / 2;
  }

  async getSystemStatistics() {
    console.log('Gathering IoT Time Series system statistics...');
    
    const stats = {
      collections: {},
      performance: this.performanceMetrics,
      aggregations: {},
      systemHealth: 'healthy'
    };
    
    // Gather statistics from each time series collection
    for (const [collectionName, collectionInfo] of this.timeSeriesCollections.entries()) {
      try {
        const collection = collectionInfo.collection;
        
        const [collectionStats, sampleData] = await Promise.all([
          collection.stats(),
          collection.find().sort({ timestamp: -1 }).limit(1).toArray()
        ]);
        
        stats.collections[collectionName] = {
          documentCount: collectionStats.count || 0,
          storageSize: collectionStats.size || 0,
          indexSize: collectionStats.totalIndexSize || 0,
          avgDocumentSize: collectionStats.avgObjSize || 0,
          compressionRatio: collectionStats.size > 0 ? 
            (collectionStats.storageSize / collectionStats.size) : 1,
          lastDataPoint: sampleData[0]?.timestamp || null,
          configuration: collectionInfo.config,
          performance: collectionInfo.stats
        };
        
      } catch (error) {
        stats.collections[collectionName] = {
          error: error.message,
          available: false
        };
      }
    }
    
    return stats;
  }

  async shutdown() {
    console.log('Shutting down IoT Time Series Manager...');
    
    // Close change streams
    for (const [streamName, changeStream] of this.changeStreams.entries()) {
      try {
        await changeStream.close();
        console.log(`Closed change stream: ${streamName}`);
      } catch (error) {
        console.error(`Error closing change stream ${streamName}:`, error);
      }
    }
    
    // Close MongoDB connection
    if (this.client) {
      await this.client.close();
    }
    
    console.log('IoT Time Series Manager shutdown complete');
  }
}

// Benefits of MongoDB Time Series Collections:
// - Native time series optimization with automatic bucketing and compression
// - Specialized indexing and query optimization for time-based data patterns
// - Efficient storage with automatic data lifecycle management
// - Real-time aggregation pipelines for IoT analytics
// - Built-in support for high-volume write workloads
// - Intelligent compression reducing storage costs by up to 90%
// - Seamless integration with MongoDB's distributed architecture
// - SQL-compatible time series operations through QueryLeaf integration
// - Native support for IoT-specific query patterns and analytics
// - Automatic data archiving and retention management

module.exports = {
  IoTTimeSeriesManager
};
```

## Understanding MongoDB Time Series Collections Architecture

### IoT Data Patterns and Optimization Strategies

MongoDB Time Series Collections are specifically designed for the unique characteristics of IoT and time-stamped data:

```javascript
// Advanced IoT Time Series Processing with Enterprise Features
class EnterpriseIoTProcessor extends IoTTimeSeriesManager {
  constructor(connectionString, enterpriseConfig) {
    super(connectionString, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      enableEdgeComputing: true,
      enablePredictiveAnalytics: true,
      enableDigitalTwins: true,
      enableMLPipelines: true,
      enableAdvancedVisualization: true,
      enableMultiTenancy: true
    };
    
    this.setupEnterpriseFeatures();
    this.initializeMLPipelines();
    this.setupDigitalTwins();
  }

  async implementAdvancedIoTStrategies() {
    console.log('Implementing enterprise IoT data strategies...');
    
    const strategies = {
      // Edge computing integration
      edgeComputing: {
        edgeDataAggregation: true,
        intelligentFiltering: true,
        localAnomalyDetection: true,
        bandwidthOptimization: true
      },
      
      // Predictive analytics
      predictiveAnalytics: {
        equipmentFailurePrediction: true,
        energyOptimization: true,
        maintenanceScheduling: true,
        capacityPlanning: true
      },
      
      // Digital twin implementation
      digitalTwins: {
        realTimeSimulation: true,
        processOptimization: true,
        scenarioModeling: true,
        performanceAnalytics: true
      }
    };

    return await this.deployEnterpriseIoTStrategies(strategies);
  }

  async setupAdvancedAnalytics() {
    console.log('Setting up advanced IoT analytics capabilities...');
    
    const analyticsConfig = {
      // Real-time processing
      realTimeProcessing: {
        streamProcessing: true,
        complexEventProcessing: true,
        patternRecognition: true,
        correlationAnalysis: true
      },
      
      // Machine learning integration
      machineLearning: {
        anomalyDetection: true,
        predictiveModeling: true,
        classificationModels: true,
        reinforcementLearning: true
      },
      
      // Advanced visualization
      visualization: {
        realTimeDashboards: true,
        historicalAnalytics: true,
        geospatialVisualization: true,
        threeDimensionalModeling: true
      }
    };

    return await this.deployAdvancedAnalytics(analyticsConfig);
  }
}
```

## SQL-Style Time Series Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Time Series operations and IoT data management:

```sql
-- QueryLeaf Time Series operations with SQL-familiar syntax for IoT data

-- Create optimized time series collections for different IoT data types
CREATE TIME_SERIES_COLLECTION sensor_readings (
  timestamp TIMESTAMPTZ,
  device_id STRING,
  sensor_type STRING,
  value DECIMAL,
  quality_score DECIMAL,
  location OBJECT,
  metadata OBJECT
)
WITH (
  time_field = 'timestamp',
  meta_field = 'device_metadata',
  granularity = 'seconds',
  bucket_max_span_seconds = 3600,
  bucket_rounding_seconds = 60,
  expire_after_seconds = 31536000, -- 1 year retention
  enable_compression = true,
  compression_algorithm = 'zstd'
);

-- Create specialized collections for different IoT use cases
CREATE TIME_SERIES_COLLECTION equipment_telemetry (
  timestamp TIMESTAMPTZ,
  equipment_id STRING,
  metric_type STRING,
  value DECIMAL,
  operational_status STRING,
  maintenance_flags ARRAY,
  performance_indicators OBJECT
)
WITH (
  granularity = 'seconds',
  bucket_max_span_seconds = 1800, -- 30 minute buckets for high-frequency data
  enable_automatic_indexing = true
);

CREATE TIME_SERIES_COLLECTION environmental_monitoring (
  timestamp TIMESTAMPTZ,
  location_id STRING,
  sensor_network STRING,
  measurements OBJECT,
  weather_conditions OBJECT,
  air_quality_index DECIMAL
)
WITH (
  granularity = 'minutes',
  bucket_max_span_seconds = 7200, -- 2 hour buckets for environmental data
  enable_predictive_analytics = true
);

-- Advanced IoT data insertion with comprehensive metadata
INSERT INTO sensor_readings (
  timestamp, device_metadata, sensor_info, measurements, quality_metrics, context
)
WITH iot_data_enrichment AS (
  SELECT 
    reading_timestamp as timestamp,
    
    -- Device and location metadata (optimized as metaField)
    JSON_OBJECT(
      'device_id', device_identifier,
      'device_type', equipment_type,
      'firmware_version', firmware_ver,
      'location', JSON_OBJECT(
        'facility', facility_name,
        'zone', zone_identifier,
        'coordinates', JSON_OBJECT('lat', latitude, 'lng', longitude),
        'floor', floor_number,
        'room', room_identifier
      ),
      'network_info', JSON_OBJECT(
        'gateway_id', gateway_identifier,
        'signal_strength', rssi_value,
        'protocol', communication_protocol,
        'network_latency', network_delay_ms
      )
    ) as device_metadata,
    
    -- Sensor information and calibration data
    JSON_OBJECT(
      'sensor_type', sensor_category,
      'model_number', sensor_model,
      'serial_number', sensor_serial,
      'calibration_date', last_calibration,
      'maintenance_schedule', maintenance_interval,
      'measurement_unit', measurement_units,
      'precision', sensor_precision,
      'accuracy', sensor_accuracy_percent,
      'operating_range', JSON_OBJECT(
        'min_value', minimum_measurable,
        'max_value', maximum_measurable,
        'optimal_range', optimal_operating_range
      )
    ) as sensor_info,
    
    -- Measurement data with statistical context
    JSON_OBJECT(
      'primary_value', sensor_reading,
      'raw_value', unprocessed_reading,
      'calibrated_value', calibration_adjusted_value,
      'statistical_context', JSON_OBJECT(
        'recent_average', rolling_average_10min,
        'recent_min', rolling_min_10min,
        'recent_max', rolling_max_10min,
        'trend_indicator', trend_direction,
        'volatility_index', measurement_volatility
      ),
      'related_measurements', JSON_OBJECT(
        'secondary_sensors', related_sensor_readings,
        'environmental_factors', ambient_conditions,
        'operational_context', equipment_operating_mode
      )
    ) as measurements,
    
    -- Comprehensive quality assessment
    JSON_OBJECT(
      'overall_score', data_quality_score,
      'confidence_level', measurement_confidence,
      'quality_factors', JSON_OBJECT(
        'sensor_health', sensor_status_indicator,
        'calibration_validity', calibration_status,
        'environmental_conditions', environmental_suitability,
        'signal_integrity', signal_quality_assessment,
        'power_status', power_supply_stability
      ),
      'quality_flags', quality_warning_flags,
      'anomaly_indicators', JSON_OBJECT(
        'statistical_anomaly', statistical_outlier_flag,
        'temporal_anomaly', temporal_pattern_anomaly,
        'contextual_anomaly', contextual_deviation_flag,
        'severity_level', anomaly_severity_rating
      )
    ) as quality_metrics,
    
    -- Business and operational context
    JSON_OBJECT(
      'business_context', JSON_OBJECT(
        'asset_id', primary_asset_identifier,
        'process_id', manufacturing_process_id,
        'production_batch', current_batch_identifier,
        'shift_information', JSON_OBJECT(
          'shift_id', current_shift,
          'operator_id', responsible_operator,
          'supervisor_id', shift_supervisor
        )
      ),
      'operational_context', JSON_OBJECT(
        'equipment_mode', current_operational_mode,
        'production_rate', current_production_speed,
        'efficiency_metrics', operational_efficiency_data,
        'maintenance_status', equipment_maintenance_state,
        'compliance_flags', regulatory_compliance_status
      ),
      'alert_configuration', JSON_OBJECT(
        'threshold_settings', alert_threshold_values,
        'notification_rules', alert_notification_config,
        'escalation_procedures', alert_escalation_rules,
        'suppression_conditions', alert_suppression_rules
      )
    ) as context
    
  FROM raw_iot_data_stream
  WHERE 
    data_timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    AND data_quality_preliminary >= 0.5
    AND device_status != 'maintenance_mode'
)
SELECT 
  timestamp,
  device_metadata,
  sensor_info,
  measurements,
  quality_metrics,
  context,
  
  -- Processing metadata
  JSON_OBJECT(
    'ingestion_timestamp', CURRENT_TIMESTAMP,
    'processing_latency_ms', 
      EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp)) * 1000,
    'data_pipeline_version', '2.1.0',
    'enrichment_applied', JSON_ARRAY(
      'metadata_enhancement',
      'quality_assessment',
      'anomaly_detection',
      'contextual_enrichment'
    )
  ) as processing_metadata

FROM iot_data_enrichment
WHERE 
  -- Final data quality validation
  JSON_EXTRACT(quality_metrics, '$.overall_score') >= 0.6
  AND JSON_EXTRACT(measurements, '$.primary_value') IS NOT NULL
  
ORDER BY timestamp;

-- Real-time IoT analytics with time-based aggregations
WITH real_time_sensor_analytics AS (
  SELECT 
    DATE_TRUNC('minute', timestamp) as time_bucket,
    JSON_EXTRACT(device_metadata, '$.device_id') as device_id,
    JSON_EXTRACT(device_metadata, '$.device_type') as device_type,
    JSON_EXTRACT(device_metadata, '$.location.facility') as facility,
    JSON_EXTRACT(device_metadata, '$.location.zone') as zone,
    JSON_EXTRACT(sensor_info, '$.sensor_type') as sensor_type,
    
    -- Statistical aggregations optimized for time series
    COUNT(*) as reading_count,
    AVG(JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as avg_value,
    MIN(JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as min_value,
    MAX(JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as max_value,
    STDDEV(JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as stddev_value,
    
    -- Percentile calculations for distribution analysis
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as p25_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as median_value,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as p75_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as p95_value,
    
    -- Data quality aggregations
    AVG(JSON_EXTRACT(quality_metrics, '$.overall_score')::DECIMAL) as avg_quality_score,
    MIN(JSON_EXTRACT(quality_metrics, '$.overall_score')::DECIMAL) as min_quality_score,
    COUNT(*) FILTER (WHERE JSON_EXTRACT(quality_metrics, '$.overall_score')::DECIMAL < 0.8) as low_quality_readings,
    
    -- Anomaly detection aggregations
    COUNT(*) FILTER (WHERE JSON_EXTRACT(quality_metrics, '$.anomaly_indicators.statistical_anomaly')::BOOLEAN = true) as statistical_anomalies,
    COUNT(*) FILTER (WHERE JSON_EXTRACT(quality_metrics, '$.anomaly_indicators.temporal_anomaly')::BOOLEAN = true) as temporal_anomalies,
    COUNT(*) FILTER (WHERE JSON_EXTRACT(quality_metrics, '$.anomaly_indicators.contextual_anomaly')::BOOLEAN = true) as contextual_anomalies,
    
    -- Value change and trend analysis
    (MAX(JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) - 
     MIN(JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL)) as value_range,
    
    -- Time coverage and sampling analysis
    (EXTRACT(EPOCH FROM MAX(timestamp) - MIN(timestamp))) as time_span_seconds,
    COUNT(*)::DECIMAL / GREATEST(1, EXTRACT(EPOCH FROM MAX(timestamp) - MIN(timestamp)) / 60) as readings_per_minute,
    
    -- Processing performance metrics
    AVG(JSON_EXTRACT(processing_metadata, '$.processing_latency_ms')::DECIMAL) as avg_processing_latency,
    MAX(JSON_EXTRACT(processing_metadata, '$.processing_latency_ms')::DECIMAL) as max_processing_latency,
    
    -- Network performance indicators
    AVG(JSON_EXTRACT(device_metadata, '$.network_info.network_latency')::DECIMAL) as avg_network_latency,
    AVG(JSON_EXTRACT(device_metadata, '$.network_info.signal_strength')::DECIMAL) as avg_signal_strength,
    
    -- Environmental context aggregations
    AVG(JSON_EXTRACT(measurements, '$.related_measurements.environmental_factors.temperature')::DECIMAL) as avg_ambient_temp,
    AVG(JSON_EXTRACT(measurements, '$.related_measurements.environmental_factors.humidity')::DECIMAL) as avg_ambient_humidity,
    
    -- Operational context
    MODE() WITHIN GROUP (ORDER BY JSON_EXTRACT(context, '$.operational_context.equipment_mode')::STRING) as primary_equipment_mode,
    AVG(JSON_EXTRACT(context, '$.operational_context.production_rate')::DECIMAL) as avg_production_rate
    
  FROM sensor_readings
  WHERE 
    timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    AND JSON_EXTRACT(quality_metrics, '$.overall_score')::DECIMAL >= 0.5
  GROUP BY 
    time_bucket, device_id, device_type, facility, zone, sensor_type
),

performance_analysis AS (
  SELECT 
    rtsa.*,
    
    -- Data quality assessment
    ROUND((rtsa.reading_count - rtsa.low_quality_readings)::DECIMAL / rtsa.reading_count * 100, 2) as quality_percentage,
    
    -- Anomaly rate calculations
    ROUND((rtsa.statistical_anomalies + rtsa.temporal_anomalies + rtsa.contextual_anomalies)::DECIMAL / rtsa.reading_count * 100, 2) as total_anomaly_rate,
    
    -- Statistical analysis
    CASE 
      WHEN rtsa.avg_value != 0 THEN ROUND(rtsa.stddev_value / ABS(rtsa.avg_value), 4)
      ELSE 0
    END as coefficient_of_variation,
    
    -- Data completeness analysis (expected vs actual readings)
    ROUND(rtsa.reading_count / GREATEST(1, rtsa.time_span_seconds / 60) * 100, 1) as data_completeness_percent,
    
    -- Performance classification
    CASE 
      WHEN rtsa.avg_quality_score >= 0.95 AND rtsa.total_anomaly_rate <= 1 THEN 'excellent'
      WHEN rtsa.avg_quality_score >= 0.85 AND rtsa.total_anomaly_rate <= 5 THEN 'good'
      WHEN rtsa.avg_quality_score >= 0.70 AND rtsa.total_anomaly_rate <= 10 THEN 'acceptable'
      ELSE 'poor'
    END as performance_category,
    
    -- Trend analysis
    CASE 
      WHEN rtsa.coefficient_of_variation > 0.5 THEN 'highly_variable'
      WHEN rtsa.coefficient_of_variation > 0.3 THEN 'variable'
      WHEN rtsa.coefficient_of_variation > 0.1 THEN 'moderate'
      ELSE 'stable'
    END as stability_classification,
    
    -- Alert conditions
    CASE 
      WHEN rtsa.avg_quality_score < 0.7 THEN 'quality_alert'
      WHEN rtsa.total_anomaly_rate > 15 THEN 'anomaly_alert'
      WHEN rtsa.avg_processing_latency > 5000 THEN 'latency_alert'
      WHEN rtsa.data_completeness_percent < 80 THEN 'data_gap_alert'
      WHEN ABS(rtsa.avg_signal_strength) < -80 THEN 'connectivity_alert'
      ELSE 'normal'
    END as alert_status,
    
    -- Operational efficiency indicators
    CASE 
      WHEN rtsa.primary_equipment_mode = 'production' AND rtsa.avg_production_rate >= 95 THEN 'optimal_efficiency'
      WHEN rtsa.primary_equipment_mode = 'production' AND rtsa.avg_production_rate >= 80 THEN 'good_efficiency'
      WHEN rtsa.primary_equipment_mode = 'production' AND rtsa.avg_production_rate >= 60 THEN 'reduced_efficiency'
      WHEN rtsa.primary_equipment_mode = 'maintenance' THEN 'maintenance_mode'
      ELSE 'unknown_efficiency'
    END as operational_efficiency,
    
    -- Time-based patterns
    EXTRACT(HOUR FROM rtsa.time_bucket) as hour_of_day,
    EXTRACT(DOW FROM rtsa.time_bucket) as day_of_week
    
  FROM real_time_sensor_analytics rtsa
),

device_health_assessment AS (
  SELECT 
    pa.device_id,
    pa.device_type,
    pa.facility,
    pa.zone,
    pa.sensor_type,
    
    -- Current status indicators
    LAST_VALUE(pa.performance_category) OVER (
      PARTITION BY pa.device_id 
      ORDER BY pa.time_bucket 
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as current_performance_status,
    
    LAST_VALUE(pa.alert_status) OVER (
      PARTITION BY pa.device_id 
      ORDER BY pa.time_bucket 
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as current_alert_status,
    
    -- Performance trends over the analysis window
    COUNT(*) as analysis_periods,
    COUNT(*) FILTER (WHERE pa.performance_category IN ('excellent', 'good')) as good_periods,
    COUNT(*) FILTER (WHERE pa.alert_status != 'normal') as alert_periods,
    
    -- Average performance metrics
    ROUND(AVG(pa.avg_quality_score), 3) as overall_avg_quality,
    ROUND(AVG(pa.total_anomaly_rate), 2) as overall_anomaly_rate,
    ROUND(AVG(pa.readings_per_minute), 2) as overall_data_rate,
    ROUND(AVG(pa.avg_processing_latency), 0) as overall_processing_latency,
    
    -- Stability and consistency
    ROUND(AVG(pa.coefficient_of_variation), 4) as average_stability_index,
    ROUND(AVG(pa.data_completeness_percent), 1) as average_data_completeness,
    
    -- Network and connectivity
    ROUND(AVG(pa.avg_network_latency), 0) as average_network_latency,
    ROUND(AVG(pa.avg_signal_strength), 1) as average_signal_strength,
    
    -- Environmental context
    ROUND(AVG(pa.avg_ambient_temp), 1) as average_ambient_temperature,
    ROUND(AVG(pa.avg_ambient_humidity), 1) as average_ambient_humidity,
    
    -- Operational efficiency
    MODE() WITHIN GROUP (ORDER BY pa.operational_efficiency) as predominant_efficiency_level,
    
    -- Value statistics across all time periods
    ROUND(AVG(pa.avg_value), 4) as overall_average_value,
    ROUND(AVG(pa.stddev_value), 4) as overall_value_variability,
    MIN(pa.min_value) as absolute_minimum_value,
    MAX(pa.max_value) as absolute_maximum_value
    
  FROM performance_analysis pa
  GROUP BY 
    pa.device_id, pa.device_type, pa.facility, pa.zone, pa.sensor_type
)

-- Comprehensive IoT device health and performance report
SELECT 
  dha.device_id,
  dha.device_type,
  dha.sensor_type,
  dha.facility,
  dha.zone,
  
  -- Current status
  dha.current_performance_status,
  dha.current_alert_status,
  
  -- Performance summary
  dha.overall_avg_quality as quality_score,
  dha.overall_anomaly_rate as anomaly_rate_percent,
  dha.overall_data_rate as readings_per_minute,
  dha.overall_processing_latency as avg_latency_ms,
  
  -- Reliability indicators
  ROUND((dha.good_periods::DECIMAL / dha.analysis_periods) * 100, 1) as uptime_percentage,
  ROUND((dha.alert_periods::DECIMAL / dha.analysis_periods) * 100, 1) as alert_percentage,
  dha.average_data_completeness as data_completeness_percent,
  
  -- Performance classification
  CASE 
    WHEN dha.overall_avg_quality >= 0.9 AND dha.overall_anomaly_rate <= 2 AND dha.uptime_percentage >= 95 THEN 'optimal'
    WHEN dha.overall_avg_quality >= 0.8 AND dha.overall_anomaly_rate <= 5 AND dha.uptime_percentage >= 90 THEN 'good'
    WHEN dha.overall_avg_quality >= 0.6 AND dha.overall_anomaly_rate <= 10 AND dha.uptime_percentage >= 80 THEN 'acceptable'
    WHEN dha.overall_avg_quality < 0.5 OR dha.overall_anomaly_rate > 20 THEN 'critical'
    ELSE 'needs_attention'
  END as device_health_classification,
  
  -- Operational context
  dha.predominant_efficiency_level,
  dha.overall_average_value as typical_reading_value,
  dha.overall_value_variability as measurement_stability,
  
  -- Environmental factors
  dha.average_ambient_temperature,
  dha.average_ambient_humidity,
  
  -- Connectivity and infrastructure
  dha.average_network_latency as network_latency_ms,
  dha.average_signal_strength as signal_strength_dbm,
  
  -- Recommendations and next actions
  CASE 
    WHEN dha.current_alert_status = 'quality_alert' THEN 'calibrate_sensor_immediate'
    WHEN dha.current_alert_status = 'anomaly_alert' THEN 'investigate_anomaly_patterns'
    WHEN dha.current_alert_status = 'latency_alert' THEN 'optimize_data_pipeline'
    WHEN dha.current_alert_status = 'connectivity_alert' THEN 'check_network_infrastructure'
    WHEN dha.current_alert_status = 'data_gap_alert' THEN 'verify_sensor_connectivity'
    WHEN dha.overall_avg_quality < 0.8 THEN 'schedule_maintenance'
    WHEN dha.overall_anomaly_rate > 10 THEN 'review_operating_conditions'
    WHEN dha.uptime_percentage < 90 THEN 'improve_system_reliability'
    ELSE 'continue_monitoring'
  END as recommended_action,
  
  -- Priority level for action
  CASE 
    WHEN dha.device_health_classification = 'critical' THEN 'immediate'
    WHEN dha.device_health_classification = 'needs_attention' THEN 'high'
    WHEN dha.current_alert_status != 'normal' THEN 'medium'
    WHEN dha.device_health_classification = 'acceptable' THEN 'low'
    ELSE 'routine'
  END as action_priority

FROM device_health_assessment dha
ORDER BY 
  CASE action_priority
    WHEN 'immediate' THEN 1
    WHEN 'high' THEN 2  
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
    ELSE 5
  END,
  dha.overall_anomaly_rate DESC,
  dha.overall_avg_quality ASC;

-- Time series forecasting and predictive analytics
WITH historical_patterns AS (
  SELECT 
    JSON_EXTRACT(device_metadata, '$.device_id') as device_id,
    JSON_EXTRACT(sensor_info, '$.sensor_type') as sensor_type,
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    
    AVG(JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as hourly_avg_value,
    COUNT(*) as readings_count,
    MIN(JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as hourly_min,
    MAX(JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL) as hourly_max,
    
    -- Time-based features for forecasting
    EXTRACT(HOUR FROM timestamp) as hour_of_day,
    EXTRACT(DOW FROM timestamp) as day_of_week,
    EXTRACT(DAY FROM timestamp) as day_of_month,
    
    -- Seasonal indicators
    CASE 
      WHEN EXTRACT(MONTH FROM timestamp) IN (12, 1, 2) THEN 'winter'
      WHEN EXTRACT(MONTH FROM timestamp) IN (3, 4, 5) THEN 'spring'
      WHEN EXTRACT(MONTH FROM timestamp) IN (6, 7, 8) THEN 'summer'
      ELSE 'autumn'
    END as season,
    
    -- Operational context features
    MODE() WITHIN GROUP (ORDER BY JSON_EXTRACT(context, '$.operational_context.equipment_mode')) as predominant_mode
    
  FROM sensor_readings
  WHERE 
    timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    AND JSON_EXTRACT(quality_metrics, '$.overall_score')::DECIMAL >= 0.8
  GROUP BY 
    device_id, sensor_type, hour_bucket, hour_of_day, day_of_week, day_of_month, season
),

trend_analysis AS (
  SELECT 
    hp.*,
    
    -- Moving averages for trend analysis
    AVG(hp.hourly_avg_value) OVER (
      PARTITION BY hp.device_id, hp.sensor_type 
      ORDER BY hp.hour_bucket 
      ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
    ) as moving_avg_24h,
    
    AVG(hp.hourly_avg_value) OVER (
      PARTITION BY hp.device_id, hp.sensor_type 
      ORDER BY hp.hour_bucket 
      ROWS BETWEEN 167 PRECEDING AND CURRENT ROW  -- 7 days * 24 hours
    ) as moving_avg_7d,
    
    -- Lag values for change detection
    LAG(hp.hourly_avg_value, 1) OVER (
      PARTITION BY hp.device_id, hp.sensor_type 
      ORDER BY hp.hour_bucket
    ) as prev_hour_value,
    
    LAG(hp.hourly_avg_value, 24) OVER (
      PARTITION BY hp.device_id, hp.sensor_type 
      ORDER BY hp.hour_bucket
    ) as prev_day_same_hour_value,
    
    LAG(hp.hourly_avg_value, 168) OVER (
      PARTITION BY hp.device_id, hp.sensor_type 
      ORDER BY hp.hour_bucket
    ) as prev_week_same_hour_value,
    
    -- Seasonal comparison
    AVG(hp.hourly_avg_value) OVER (
      PARTITION BY hp.device_id, hp.sensor_type, hp.hour_of_day, hp.day_of_week
      ORDER BY hp.hour_bucket
      ROWS BETWEEN 672 PRECEDING AND 672 PRECEDING  -- 4 weeks ago, same hour/day
    ) as seasonal_baseline
    
  FROM historical_patterns hp
),

predictive_indicators AS (
  SELECT 
    ta.*,
    
    -- Change calculations
    COALESCE(ta.hourly_avg_value - ta.prev_hour_value, 0) as hourly_change,
    COALESCE(ta.hourly_avg_value - ta.prev_day_same_hour_value, 0) as daily_change,
    COALESCE(ta.hourly_avg_value - ta.prev_week_same_hour_value, 0) as weekly_change,
    COALESCE(ta.hourly_avg_value - ta.seasonal_baseline, 0) as seasonal_deviation,
    
    -- Trend direction indicators
    CASE 
      WHEN ta.hourly_avg_value > ta.moving_avg_24h * 1.05 THEN 'upward'
      WHEN ta.hourly_avg_value < ta.moving_avg_24h * 0.95 THEN 'downward'  
      ELSE 'stable'
    END as short_term_trend,
    
    CASE 
      WHEN ta.moving_avg_24h > ta.moving_avg_7d * 1.02 THEN 'increasing'
      WHEN ta.moving_avg_24h < ta.moving_avg_7d * 0.98 THEN 'decreasing'
      ELSE 'steady'
    END as long_term_trend,
    
    -- Volatility measures
    ABS(ta.hourly_avg_value - ta.moving_avg_24h) / NULLIF(ta.moving_avg_24h, 0) as relative_volatility,
    
    -- Anomaly scoring
    CASE 
      WHEN ABS(ta.hourly_avg_value - ta.seasonal_baseline) > (ta.moving_avg_7d * 0.3) THEN 'high_anomaly'
      WHEN ABS(ta.hourly_avg_value - ta.seasonal_baseline) > (ta.moving_avg_7d * 0.15) THEN 'moderate_anomaly'
      WHEN ABS(ta.hourly_avg_value - ta.seasonal_baseline) > (ta.moving_avg_7d * 0.05) THEN 'low_anomaly'
      ELSE 'normal'
    END as anomaly_level,
    
    -- Predictive risk assessment
    CASE 
      WHEN ta.short_term_trend = 'upward' AND ta.long_term_trend = 'increasing' AND ta.relative_volatility > 0.2 THEN 'high_risk'
      WHEN ta.short_term_trend = 'downward' AND ta.long_term_trend = 'decreasing' AND ta.relative_volatility > 0.15 THEN 'high_risk'
      WHEN ta.relative_volatility > 0.25 THEN 'moderate_risk'
      WHEN ta.anomaly_level IN ('high_anomaly', 'moderate_anomaly') THEN 'moderate_risk'
      ELSE 'low_risk'
    END as predictive_risk_level
    
  FROM trend_analysis ta
  WHERE ta.hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '7 days'
)

-- Predictive analytics and forecasting results
SELECT 
  pi.device_id,
  pi.sensor_type,
  pi.hour_bucket,
  
  -- Current values and trends
  ROUND(pi.hourly_avg_value, 4) as current_value,
  ROUND(pi.moving_avg_24h, 4) as trend_24h,
  ROUND(pi.moving_avg_7d, 4) as trend_7d,
  
  -- Change analysis
  ROUND(pi.hourly_change, 4) as hour_to_hour_change,
  ROUND(pi.daily_change, 4) as day_to_day_change,
  ROUND(pi.weekly_change, 4) as week_to_week_change,
  ROUND(pi.seasonal_deviation, 4) as seasonal_variance,
  
  -- Trend classification
  pi.short_term_trend,
  pi.long_term_trend,
  pi.anomaly_level,
  pi.predictive_risk_level,
  
  -- Risk indicators
  ROUND(pi.relative_volatility * 100, 2) as volatility_percent,
  
  -- Simple linear forecast (next hour prediction)
  ROUND(
    pi.hourly_avg_value + 
    (COALESCE(pi.hourly_change, 0) * 0.7) + 
    (COALESCE(pi.daily_change, 0) * 0.2) + 
    (COALESCE(pi.weekly_change, 0) * 0.1), 
    4
  ) as predicted_next_hour_value,
  
  -- Confidence level for prediction
  CASE 
    WHEN pi.relative_volatility < 0.05 AND pi.anomaly_level = 'normal' THEN 'high'
    WHEN pi.relative_volatility < 0.15 AND pi.anomaly_level IN ('normal', 'low_anomaly') THEN 'medium'
    WHEN pi.relative_volatility < 0.30 THEN 'low'
    ELSE 'very_low'
  END as prediction_confidence,
  
  -- Maintenance and operational recommendations
  CASE 
    WHEN pi.predictive_risk_level = 'high_risk' THEN 'schedule_immediate_inspection'
    WHEN pi.anomaly_level = 'high_anomaly' THEN 'investigate_root_cause'
    WHEN pi.long_term_trend = 'decreasing' AND pi.sensor_type = 'efficiency' THEN 'schedule_maintenance'
    WHEN pi.relative_volatility > 0.2 THEN 'check_sensor_calibration'
    WHEN pi.short_term_trend != pi.long_term_trend THEN 'monitor_closely'
    ELSE 'continue_routine_monitoring'
  END as maintenance_recommendation

FROM predictive_indicators pi
WHERE pi.hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY 
  CASE pi.predictive_risk_level
    WHEN 'high_risk' THEN 1
    WHEN 'moderate_risk' THEN 2
    ELSE 3
  END,
  pi.relative_volatility DESC,
  pi.device_id,
  pi.hour_bucket DESC;

-- Real-time alerting and notification system
WITH real_time_monitoring AS (
  SELECT 
    JSON_EXTRACT(device_metadata, '$.device_id') as device_id,
    JSON_EXTRACT(device_metadata, '$.device_type') as device_type,
    JSON_EXTRACT(device_metadata, '$.location.facility') as facility,
    JSON_EXTRACT(sensor_info, '$.sensor_type') as sensor_type,
    timestamp,
    JSON_EXTRACT(measurements, '$.primary_value')::DECIMAL as current_value,
    JSON_EXTRACT(quality_metrics, '$.overall_score')::DECIMAL as quality_score,
    
    -- Alert thresholds from configuration
    JSON_EXTRACT(context, '$.alert_configuration.threshold_settings.critical_high')::DECIMAL as critical_high_threshold,
    JSON_EXTRACT(context, '$.alert_configuration.threshold_settings.critical_low')::DECIMAL as critical_low_threshold,
    JSON_EXTRACT(context, '$.alert_configuration.threshold_settings.warning_high')::DECIMAL as warning_high_threshold,
    JSON_EXTRACT(context, '$.alert_configuration.threshold_settings.warning_low')::DECIMAL as warning_low_threshold,
    
    -- Quality thresholds
    JSON_EXTRACT(context, '$.alert_configuration.threshold_settings.min_quality_score')::DECIMAL as min_quality_threshold,
    
    -- Anomaly flags
    JSON_EXTRACT(quality_metrics, '$.anomaly_indicators.statistical_anomaly')::BOOLEAN as statistical_anomaly,
    JSON_EXTRACT(quality_metrics, '$.anomaly_indicators.temporal_anomaly')::BOOLEAN as temporal_anomaly,
    JSON_EXTRACT(quality_metrics, '$.anomaly_indicators.contextual_anomaly')::BOOLEAN as contextual_anomaly,
    
    -- Processing performance
    JSON_EXTRACT(processing_metadata, '$.processing_latency_ms')::DECIMAL as processing_latency,
    JSON_EXTRACT(device_metadata, '$.network_info.network_latency')::DECIMAL as network_latency
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
),

alert_evaluation AS (
  SELECT 
    rtm.*,
    
    -- Value-based alerts
    CASE 
      WHEN rtm.current_value >= rtm.critical_high_threshold THEN 'critical_high_value'
      WHEN rtm.current_value <= rtm.critical_low_threshold THEN 'critical_low_value'
      WHEN rtm.current_value >= rtm.warning_high_threshold THEN 'warning_high_value'
      WHEN rtm.current_value <= rtm.warning_low_threshold THEN 'warning_low_value'
      ELSE null
    END as value_alert_type,
    
    -- Quality-based alerts
    CASE 
      WHEN rtm.quality_score < rtm.min_quality_threshold THEN 'quality_degradation'
      ELSE null
    END as quality_alert_type,
    
    -- Anomaly-based alerts
    CASE 
      WHEN rtm.statistical_anomaly = true THEN 'statistical_anomaly_detected'
      WHEN rtm.temporal_anomaly = true THEN 'temporal_pattern_anomaly'
      WHEN rtm.contextual_anomaly = true THEN 'contextual_anomaly_detected'
      ELSE null
    END as anomaly_alert_type,
    
    -- Performance-based alerts
    CASE 
      WHEN rtm.processing_latency > 5000 THEN 'high_processing_latency'
      WHEN rtm.network_latency > 2000 THEN 'high_network_latency'
      ELSE null
    END as performance_alert_type,
    
    -- Severity calculation
    CASE 
      WHEN rtm.current_value >= rtm.critical_high_threshold OR rtm.current_value <= rtm.critical_low_threshold THEN 'critical'
      WHEN rtm.quality_score < (rtm.min_quality_threshold * 0.7) THEN 'critical'
      WHEN rtm.statistical_anomaly = true OR rtm.temporal_anomaly = true THEN 'high'
      WHEN rtm.current_value >= rtm.warning_high_threshold OR rtm.current_value <= rtm.warning_low_threshold THEN 'medium'
      WHEN rtm.quality_score < rtm.min_quality_threshold THEN 'medium'
      WHEN rtm.contextual_anomaly = true OR rtm.processing_latency > 5000 THEN 'low'
      ELSE null
    END as alert_severity
    
  FROM real_time_monitoring rtm
),

active_alerts AS (
  SELECT 
    ae.device_id,
    ae.device_type,
    ae.facility,
    ae.sensor_type,
    ae.timestamp as alert_timestamp,
    ae.current_value,
    ae.quality_score,
    
    -- Consolidate all alert types
    COALESCE(ae.value_alert_type, ae.quality_alert_type, ae.anomaly_alert_type, ae.performance_alert_type) as alert_type,
    ae.alert_severity,
    
    -- Alert context
    JSON_OBJECT(
      'current_reading', ae.current_value,
      'quality_score', ae.quality_score,
      'thresholds', JSON_OBJECT(
        'critical_high', ae.critical_high_threshold,
        'critical_low', ae.critical_low_threshold,
        'warning_high', ae.warning_high_threshold,
        'warning_low', ae.warning_low_threshold
      ),
      'anomaly_indicators', JSON_OBJECT(
        'statistical_anomaly', ae.statistical_anomaly,
        'temporal_anomaly', ae.temporal_anomaly,
        'contextual_anomaly', ae.contextual_anomaly
      ),
      'performance_metrics', JSON_OBJECT(
        'processing_latency_ms', ae.processing_latency,
        'network_latency_ms', ae.network_latency
      )
    ) as alert_context,
    
    -- Notification urgency
    CASE 
      WHEN ae.alert_severity = 'critical' THEN 'immediate'
      WHEN ae.alert_severity = 'high' THEN 'within_15_minutes'
      WHEN ae.alert_severity = 'medium' THEN 'within_1_hour'
      ELSE 'next_business_day'
    END as notification_urgency,
    
    -- Recommended actions
    CASE 
      WHEN ae.value_alert_type IN ('critical_high_value', 'critical_low_value') THEN 'emergency_shutdown_consider'
      WHEN ae.quality_alert_type = 'quality_degradation' THEN 'sensor_maintenance_required'
      WHEN ae.anomaly_alert_type IN ('statistical_anomaly_detected', 'temporal_pattern_anomaly') THEN 'investigate_anomaly_cause'
      WHEN ae.performance_alert_type = 'high_processing_latency' THEN 'check_system_resources'
      WHEN ae.performance_alert_type = 'high_network_latency' THEN 'check_network_connectivity'
      ELSE 'standard_investigation'
    END as recommended_action
    
  FROM alert_evaluation ae
  WHERE ae.alert_severity IS NOT NULL
)

-- Active alerts requiring immediate attention
SELECT 
  aa.alert_timestamp,
  aa.device_id,
  aa.device_type,
  aa.sensor_type,
  aa.facility,
  
  -- Alert details
  aa.alert_type,
  aa.alert_severity,
  aa.notification_urgency,
  aa.recommended_action,
  
  -- Current status
  aa.current_value as current_reading,
  aa.quality_score as current_quality,
  
  -- Alert context for operators
  aa.alert_context,
  
  -- Time since alert
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - aa.alert_timestamp)) / 60 as minutes_since_alert,
  
  -- Business impact assessment
  CASE 
    WHEN aa.alert_severity = 'critical' AND aa.device_type = 'safety_system' THEN 'safety_risk'
    WHEN aa.alert_severity = 'critical' AND aa.device_type = 'production_equipment' THEN 'production_impact'
    WHEN aa.alert_severity IN ('critical', 'high') AND aa.sensor_type = 'environmental' THEN 'compliance_risk'
    WHEN aa.alert_severity IN ('critical', 'high') THEN 'operational_impact'
    ELSE 'monitoring_required'
  END as business_impact_level,
  
  -- Next steps for operators
  JSON_OBJECT(
    'immediate_action', aa.recommended_action,
    'escalation_required', 
      CASE aa.alert_severity 
        WHEN 'critical' THEN true 
        ELSE false 
      END,
    'estimated_resolution_time', 
      CASE aa.alert_type
        WHEN 'quality_degradation' THEN '30-60 minutes'
        WHEN 'statistical_anomaly_detected' THEN '1-4 hours'
        WHEN 'critical_high_value' THEN '15-30 minutes'
        WHEN 'critical_low_value' THEN '15-30 minutes'
        ELSE '1-2 hours'
      END,
    'required_expertise', 
      CASE aa.alert_type
        WHEN 'quality_degradation' THEN 'maintenance_technician'
        WHEN 'statistical_anomaly_detected' THEN 'process_engineer'
        WHEN 'high_processing_latency' THEN 'it_support'
        WHEN 'high_network_latency' THEN 'network_administrator'
        ELSE 'operations_supervisor'
      END
  ) as operational_guidance

FROM active_alerts aa
ORDER BY 
  CASE aa.alert_severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  aa.alert_timestamp DESC;

-- QueryLeaf provides comprehensive IoT time series capabilities:
-- 1. SQL-familiar time series collection creation and optimization
-- 2. High-performance IoT data ingestion with automatic bucketing
-- 3. Real-time analytics and aggregation for sensor data
-- 4. Predictive analytics and trend analysis
-- 5. Comprehensive anomaly detection and alerting
-- 6. Performance monitoring and health assessment
-- 7. Integration with MongoDB's native time series optimizations
-- 8. Enterprise-ready IoT data management with familiar SQL syntax
-- 9. Automatic data lifecycle management and archiving
-- 10. Production-ready scalability for high-volume IoT workloads
```

## Best Practices for Time Series Implementation

### IoT Data Architecture and Performance Optimization

Essential principles for effective MongoDB Time Series deployment in IoT environments:

1. **Collection Design**: Create purpose-built time series collections with optimal bucketing strategies for different sensor types and data frequencies
2. **Metadata Strategy**: Design comprehensive metadata schemas that enable efficient filtering and provide rich context for analytics
3. **Ingestion Optimization**: Implement batch ingestion patterns and write concern configurations optimized for IoT write workloads
4. **Query Patterns**: Design aggregation pipelines that leverage time series optimizations for common IoT analytics patterns
5. **Real-Time Processing**: Implement change streams and real-time processing pipelines for immediate anomaly detection and alerting
6. **Data Lifecycle**: Establish automated data retention and archiving strategies to manage long-term storage costs

### Production IoT Systems and Operational Excellence

Design time series systems for enterprise IoT requirements:

1. **Scalable Architecture**: Implement horizontally scalable time series infrastructure with proper sharding and distribution strategies
2. **Performance Monitoring**: Establish comprehensive monitoring for write performance, query latency, and storage utilization
3. **Alert Management**: Create intelligent alerting systems that reduce noise while ensuring critical issues are detected promptly
4. **Edge Integration**: Design systems that work efficiently with edge computing environments and intermittent connectivity
5. **Security Implementation**: Implement device authentication, data encryption, and access controls appropriate for IoT environments
6. **Compliance Features**: Build in data governance, audit trails, and regulatory compliance capabilities for industrial applications

## Conclusion

MongoDB Time Series Collections provide comprehensive IoT data management capabilities that eliminate the complexity of traditional time-based partitioning and manual optimization through automatic bucketing, intelligent compression, and purpose-built query optimization. The native support for high-volume writes, real-time aggregations, and time-based analytics makes Time Series Collections ideal for modern IoT applications requiring both scale and performance.

Key Time Series Collections benefits include:

- **Automatic Optimization**: Native bucketing and compression eliminate manual partitioning and maintenance overhead
- **High-Performance Writes**: Optimized storage engine designed for high-volume, time-stamped data ingestion
- **Intelligent Compression**: Automatic compression reduces storage costs by up to 90% compared to traditional approaches
- **Real-Time Analytics**: Built-in aggregation optimization for time-based queries and real-time processing
- **Flexible Data Models**: Rich document structure accommodates complex IoT metadata alongside time series measurements
- **SQL Accessibility**: Familiar SQL-style time series operations through QueryLeaf for accessible IoT data management

Whether you're building industrial monitoring systems, smart city infrastructure, environmental sensors, or enterprise IoT platforms, MongoDB Time Series Collections with QueryLeaf's familiar SQL interface provides the foundation for scalable, efficient IoT data management.

> **QueryLeaf Integration**: QueryLeaf seamlessly manages MongoDB Time Series Collections while providing SQL-familiar syntax for time series data operations, real-time analytics, and IoT-specific query patterns. Advanced time series capabilities including automatic bucketing, predictive analytics, and enterprise alerting are elegantly handled through familiar SQL constructs, making sophisticated IoT data management both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's robust time series capabilities with SQL-style data operations makes it an ideal platform for applications requiring both high-performance IoT data storage and familiar database interaction patterns, ensuring your time series infrastructure can scale efficiently while maintaining operational simplicity and developer productivity.