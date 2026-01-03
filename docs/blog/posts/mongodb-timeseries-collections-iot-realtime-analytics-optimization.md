---
title: "MongoDB Time Series Collections for IoT and Real-Time Analytics: High-Performance Sensor Data Management and Stream Processing"
description: "Master MongoDB time series collections for IoT sensor data ingestion, real-time analytics, and high-performance stream processing with optimized storage, aggregation pipelines, and SQL-familiar query patterns."
date: 2025-01-02
tags: [mongodb, timeseries, iot, real-time-analytics, sensor-data, stream-processing, optimization, sql]
---

# MongoDB Time Series Collections for IoT and Real-Time Analytics: High-Performance Sensor Data Management and Stream Processing

Modern IoT applications generate massive volumes of time-stamped sensor data that require specialized storage and query optimization strategies. Traditional relational databases struggle with the volume, velocity, and analytical requirements of IoT workloads, particularly when dealing with millions of data points per second from distributed sensor networks, real-time alerting systems, and complex analytical queries across historical time ranges.

MongoDB time series collections provide purpose-built storage and query optimization specifically designed for time-stamped data, offering automatic data organization, specialized compression algorithms, and optimized aggregation pipelines that can handle high-velocity IoT data ingestion while supporting real-time analytics and historical trend analysis at scale.

## The IoT Data Challenge

Traditional approaches to storing and analyzing time series data face significant scalability and performance limitations:

```sql
-- Traditional PostgreSQL time series approach - performance bottlenecks
CREATE TABLE sensor_readings (
    reading_id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    value DECIMAL(15,4) NOT NULL,
    unit VARCHAR(20),
    location_lat DECIMAL(10,8),
    location_lng DECIMAL(11,8),
    
    -- Basic metadata
    device_status VARCHAR(20) DEFAULT 'online',
    data_quality INTEGER DEFAULT 100,
    
    CONSTRAINT valid_quality CHECK (data_quality BETWEEN 0 AND 100)
);

-- Partitioning by time (complex maintenance)
CREATE TABLE sensor_readings_2025_01 PARTITION OF sensor_readings
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE sensor_readings_2025_02 PARTITION OF sensor_readings
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Multiple indexes required for different query patterns
CREATE INDEX idx_sensor_device_time ON sensor_readings (device_id, timestamp);
CREATE INDEX idx_sensor_type_time ON sensor_readings (sensor_type, timestamp);
CREATE INDEX idx_sensor_location ON sensor_readings (location_lat, location_lng);
CREATE INDEX idx_sensor_timestamp ON sensor_readings (timestamp);

-- Complex aggregation queries for analytics
WITH hourly_averages AS (
    SELECT 
        device_id,
        sensor_type,
        DATE_TRUNC('hour', timestamp) as hour_bucket,
        AVG(value) as avg_value,
        COUNT(*) as reading_count,
        MIN(value) as min_value,
        MAX(value) as max_value,
        STDDEV(value) as stddev_value
    FROM sensor_readings
    WHERE timestamp >= NOW() - INTERVAL '24 hours'
      AND device_status = 'online'
      AND data_quality > 80
    GROUP BY device_id, sensor_type, DATE_TRUNC('hour', timestamp)
),

device_statistics AS (
    SELECT 
        device_id,
        sensor_type,
        COUNT(*) as total_hours,
        AVG(avg_value) as daily_average,
        MAX(max_value) as daily_peak,
        MIN(min_value) as daily_low,
        AVG(reading_count) as avg_readings_per_hour,
        
        -- Calculate trend using linear regression approximation
        CASE 
            WHEN COUNT(*) > 1 THEN
                (COUNT(*) * SUM(EXTRACT(EPOCH FROM hour_bucket) * avg_value) - 
                 SUM(EXTRACT(EPOCH FROM hour_bucket)) * SUM(avg_value)) /
                (COUNT(*) * SUM(POWER(EXTRACT(EPOCH FROM hour_bucket), 2)) - 
                 POWER(SUM(EXTRACT(EPOCH FROM hour_bucket)), 2))
            ELSE 0
        END as trend_slope
    FROM hourly_averages
    GROUP BY device_id, sensor_type
)

-- Final aggregation (performance intensive)
SELECT 
    ds.device_id,
    ds.sensor_type,
    ROUND(ds.daily_average, 2) as avg_24h,
    ROUND(ds.daily_peak, 2) as peak_24h,
    ROUND(ds.daily_low, 2) as low_24h,
    ROUND(ds.avg_readings_per_hour, 0) as readings_per_hour,
    
    -- Trend analysis
    CASE 
        WHEN ds.trend_slope > 0.1 THEN 'rising'
        WHEN ds.trend_slope < -0.1 THEN 'falling'
        ELSE 'stable'
    END as trend_direction,
    
    -- Alert conditions
    CASE 
        WHEN ds.daily_peak > 100 THEN 'high_alert'
        WHEN ds.daily_low < 10 THEN 'low_alert'
        WHEN ds.avg_readings_per_hour < 5 THEN 'connectivity_alert'
        ELSE 'normal'
    END as alert_status,
    
    ds.total_hours
    
FROM device_statistics ds
WHERE ds.total_hours >= 20  -- At least 20 hours of data
ORDER BY ds.device_id, ds.sensor_type;

-- Challenges with traditional time series approaches:
-- 1. Storage overhead - separate tables and partition management
-- 2. Index explosion - multiple indexes needed for various query patterns
-- 3. Query complexity - complex CTEs and window functions for basic analytics
-- 4. Maintenance burden - manual partition creation and cleanup
-- 5. Limited compression - basic storage compression insufficient for time series patterns
-- 6. Scaling bottlenecks - horizontal scaling requires complex sharding strategies
-- 7. Real-time constraints - difficult to optimize for both writes and analytics
-- 8. Data lifecycle management - complex procedures for archiving and cleanup

-- Real-time ingestion performance issues
INSERT INTO sensor_readings (
    device_id, sensor_type, timestamp, value, unit, 
    location_lat, location_lng, device_status, data_quality
)
SELECT 
    'device_' || (random() * 1000)::int,
    CASE (random() * 5)::int 
        WHEN 0 THEN 'temperature'
        WHEN 1 THEN 'humidity'
        WHEN 2 THEN 'pressure'
        WHEN 3 THEN 'light'
        ELSE 'motion'
    END,
    NOW() - (random() * interval '1 hour'),
    random() * 100,
    CASE (random() * 5)::int 
        WHEN 0 THEN 'celsius'
        WHEN 1 THEN 'percent'
        WHEN 2 THEN 'pascal'
        WHEN 3 THEN 'lux'
        ELSE 'boolean'
    END,
    40.7128 + (random() - 0.5) * 0.1,
    -74.0060 + (random() - 0.5) * 0.1,
    CASE WHEN random() > 0.1 THEN 'online' ELSE 'offline' END,
    80 + (random() * 20)::int
FROM generate_series(1, 10000) -- 10K inserts - already showing performance issues
ON CONFLICT DO NOTHING;

-- Problems:
-- 1. Linear performance degradation with data volume
-- 2. Index maintenance overhead during high-velocity writes
-- 3. Lock contention during concurrent analytics and writes
-- 4. Complex query optimization required for time-range queries
-- 5. Storage bloat due to lack of time-series specific compression
-- 6. Difficult to implement real-time alerting efficiently
-- 7. Complex setup for distributed deployments across geographic regions
-- 8. Limited built-in support for time-series specific operations
```

MongoDB Time Series Collections eliminate these limitations with purpose-built time series capabilities:

```javascript
// MongoDB Time Series Collections - optimized for IoT and analytics workloads
const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017/?replicaSet=rs0');
const db = client.db('iot_platform');

class MongoDBTimeSeriesManager {
  constructor(db) {
    this.db = db;
    
    // Time series collections with automatic optimization
    this.sensorData = null;
    this.deviceMetrics = null;
    this.analyticsCache = null;
    
    this.initializeTimeSeriesCollections();
  }

  async initializeTimeSeriesCollections() {
    console.log('Setting up optimized time series collections...');
    
    try {
      // Primary sensor data collection
      await this.db.createCollection('sensor_readings', {
        timeseries: {
          timeField: 'timestamp',
          metaField: 'device',
          granularity: 'seconds', // Optimal for IoT sensor data
          bucketMaxSpanSeconds: 3600, // 1-hour buckets
          bucketRoundingSeconds: 60 // Round to nearest minute
        },
        expireAfterSeconds: 31536000, // 1 year retention
        storageEngine: { wiredTiger: { configString: 'block_compressor=zstd' } }
      });

      // Device analytics and metrics collection
      await this.db.createCollection('device_metrics', {
        timeseries: {
          timeField: 'timestamp',
          metaField: 'device_info',
          granularity: 'minutes', // Aggregated data points
          bucketMaxSpanSeconds: 86400, // 24-hour buckets for analytics
          bucketRoundingSeconds: 3600 // Round to nearest hour
        },
        expireAfterSeconds: 94608000 // 3 year retention for analytics
      });

      // Real-time analytics cache for dashboard queries
      await this.db.createCollection('analytics_cache', {
        timeseries: {
          timeField: 'computed_at',
          metaField: 'computation_type',
          granularity: 'minutes'
        },
        expireAfterSeconds: 604800 // 1 week cache retention
      });

      this.sensorData = this.db.collection('sensor_readings');
      this.deviceMetrics = this.db.collection('device_metrics');
      this.analyticsCache = this.db.collection('analytics_cache');

      // Create specialized indexes for time series queries
      await this.createOptimizedIndexes();
      
      console.log('Time series collections initialized successfully');
      
    } catch (error) {
      console.error('Error initializing time series collections:', error);
      throw error;
    }
  }

  async createOptimizedIndexes() {
    console.log('Creating optimized time series indexes...');
    
    // Sensor data indexes
    await this.sensorData.createIndexes([
      // Compound index for device + time range queries
      { 
        key: { 'device.id': 1, timestamp: 1 },
        name: 'device_time_optimal'
      },
      
      // Sensor type + time for analytics
      { 
        key: { 'device.sensor_type': 1, timestamp: 1 },
        name: 'sensor_type_time'
      },
      
      // Geospatial index for location-based queries
      { 
        key: { 'device.location': '2dsphere' },
        name: 'device_location_geo'
      },
      
      // Value range index for threshold queries
      { 
        key: { 'measurements.value': 1, timestamp: 1 },
        name: 'value_threshold_time',
        partialFilterExpression: { 'measurements.value': { $exists: true } }
      }
    ]);

    // Device metrics indexes
    await this.deviceMetrics.createIndexes([
      {
        key: { 'device_info.id': 1, timestamp: -1 },
        name: 'device_metrics_latest'
      },
      
      {
        key: { 'device_info.facility': 1, timestamp: 1 },
        name: 'facility_time_series'
      }
    ]);

    console.log('Time series indexes created successfully');
  }

  async ingestSensorData(deviceId, sensorType, measurements, metadata = {}) {
    const timestamp = new Date();
    
    try {
      const document = {
        timestamp: timestamp,
        
        // Metadata field for efficient bucketing
        device: {
          id: deviceId,
          sensor_type: sensorType,
          facility: metadata.facility || 'default',
          zone: metadata.zone || 'unspecified',
          location: metadata.location ? {
            type: 'Point',
            coordinates: [metadata.location.lng, metadata.location.lat]
          } : null,
          
          // Device characteristics
          model: metadata.model || 'unknown',
          firmware_version: metadata.firmware_version || '1.0',
          installation_date: metadata.installation_date,
          
          // Network information
          network_info: {
            connection_type: metadata.connection_type || 'wifi',
            signal_strength: metadata.signal_strength || -50,
            gateway_id: metadata.gateway_id
          }
        },
        
        // Time series measurements
        measurements: this.normalizeMeasurements(measurements),
        
        // Data quality and status
        quality_metrics: {
          data_quality_score: this.calculateDataQuality(measurements, metadata),
          sensor_health: metadata.sensor_health || 'normal',
          calibration_status: metadata.calibration_status || 'valid',
          measurement_accuracy: metadata.measurement_accuracy || 0.95
        },
        
        // Processing metadata
        processing_info: {
          ingestion_timestamp: timestamp,
          processing_latency_ms: 0,
          source: metadata.source || 'sensor_direct',
          batch_id: metadata.batch_id,
          schema_version: '2.0'
        }
      };

      const result = await this.sensorData.insertOne(document);
      
      // Trigger real-time processing if enabled
      if (metadata.enable_realtime_processing !== false) {
        await this.processRealTimeAnalytics(document);
      }

      return {
        success: true,
        documentId: result.insertedId,
        timestamp: timestamp,
        bucketed: true, // Time series collections automatically bucket
        processing_time_ms: Date.now() - timestamp.getTime()
      };

    } catch (error) {
      console.error('Sensor data ingestion failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: timestamp
      };
    }
  }

  normalizeMeasurements(rawMeasurements) {
    // Normalize different measurement formats into consistent structure
    const normalized = {};
    
    if (Array.isArray(rawMeasurements)) {
      // Handle array of measurement objects
      rawMeasurements.forEach(measurement => {
        if (measurement.type && measurement.value !== undefined) {
          normalized[measurement.type] = {
            value: Number(measurement.value),
            unit: measurement.unit || '',
            precision: measurement.precision || 2,
            range: measurement.range || { min: null, max: null }
          };
        }
      });
    } else if (typeof rawMeasurements === 'object') {
      // Handle object with measurement properties
      Object.entries(rawMeasurements).forEach(([key, value]) => {
        if (typeof value === 'number') {
          normalized[key] = {
            value: value,
            unit: '',
            precision: 2,
            range: { min: null, max: null }
          };
        } else if (typeof value === 'object' && value.value !== undefined) {
          normalized[key] = {
            value: Number(value.value),
            unit: value.unit || '',
            precision: value.precision || 2,
            range: value.range || { min: null, max: null }
          };
        }
      });
    }

    return normalized;
  }

  calculateDataQuality(measurements, metadata) {
    let qualityScore = 100;
    
    // Check signal strength impact
    if (metadata.signal_strength < -80) {
      qualityScore -= 20;
    } else if (metadata.signal_strength < -70) {
      qualityScore -= 10;
    }
    
    // Check measurement consistency
    Object.values(measurements).forEach(measurement => {
      if (typeof measurement === 'object' && measurement.value !== undefined) {
        const value = Number(measurement.value);
        const range = measurement.range;
        
        if (range && range.min !== null && range.max !== null) {
          if (value < range.min || value > range.max) {
            qualityScore -= 15; // Out of expected range
          }
        }
        
        // Check for anomalous readings
        if (isNaN(value) || !isFinite(value)) {
          qualityScore -= 30;
        }
      }
    });

    return Math.max(0, qualityScore);
  }

  async processRealTimeAnalytics(document) {
    const deviceId = document.device.id;
    const timestamp = document.timestamp;
    
    // Real-time threshold monitoring
    await this.checkAlertThresholds(document);
    
    // Update device status and health metrics
    await this.updateDeviceHealthMetrics(deviceId, document);
    
    // Calculate rolling averages for dashboard
    await this.updateRollingAverages(deviceId, document);
  }

  async checkAlertThresholds(document) {
    const measurements = document.measurements;
    const deviceId = document.device.id;
    const sensorType = document.device.sensor_type;
    
    // Define threshold rules (could be stored in configuration collection)
    const thresholds = {
      temperature: { min: -10, max: 60, critical: 80 },
      humidity: { min: 0, max: 100, critical: 95 },
      pressure: { min: 900, max: 1100, critical: 1200 },
      light: { min: 0, max: 100000, critical: 120000 },
      motion: { min: 0, max: 1, critical: null }
    };

    const sensorThresholds = thresholds[sensorType];
    if (!sensorThresholds) return;

    Object.entries(measurements).forEach(async ([measurementType, measurement]) => {
      const value = measurement.value;
      const threshold = sensorThresholds;
      
      let alertLevel = null;
      let alertMessage = null;
      
      if (threshold.critical && value > threshold.critical) {
        alertLevel = 'critical';
        alertMessage = `Critical ${measurementType} level: ${value} (threshold: ${threshold.critical})`;
      } else if (value > threshold.max) {
        alertLevel = 'high';
        alertMessage = `High ${measurementType} level: ${value} (max: ${threshold.max})`;
      } else if (value < threshold.min) {
        alertLevel = 'low';
        alertMessage = `Low ${measurementType} level: ${value} (min: ${threshold.min})`;
      }

      if (alertLevel) {
        await this.createAlert({
          device_id: deviceId,
          sensor_type: sensorType,
          measurement_type: measurementType,
          alert_level: alertLevel,
          message: alertMessage,
          value: value,
          threshold: threshold,
          timestamp: document.timestamp,
          location: document.device.location
        });
      }
    });
  }

  async createAlert(alertData) {
    const alertsCollection = this.db.collection('alerts');
    
    const alert = {
      _id: new ObjectId(),
      ...alertData,
      created_at: new Date(),
      status: 'active',
      acknowledged: false,
      acknowledged_by: null,
      acknowledged_at: null,
      resolved: false,
      resolved_at: null,
      escalation_level: 0,
      
      // Alert metadata
      correlation_id: `${alertData.device_id}_${alertData.sensor_type}_${alertData.measurement_type}`,
      alert_hash: this.calculateAlertHash(alertData)
    };

    // Check for duplicate recent alerts (deduplication)
    const recentAlert = await alertsCollection.findOne({
      alert_hash: alert.alert_hash,
      created_at: { $gte: new Date(Date.now() - 300000) }, // Last 5 minutes
      status: 'active'
    });

    if (!recentAlert) {
      await alertsCollection.insertOne(alert);
      
      // Trigger real-time notifications
      await this.sendAlertNotification(alert);
    } else {
      // Update escalation level for repeated alerts
      await alertsCollection.updateOne(
        { _id: recentAlert._id },
        { 
          $inc: { escalation_level: 1 },
          $set: { last_occurrence: new Date() }
        }
      );
    }
  }

  calculateAlertHash(alertData) {
    const crypto = require('crypto');
    const hashString = `${alertData.device_id}:${alertData.sensor_type}:${alertData.measurement_type}:${alertData.alert_level}`;
    return crypto.createHash('md5').update(hashString).digest('hex');
  }

  async sendAlertNotification(alert) {
    // Implementation would integrate with notification systems
    console.log(`ALERT [${alert.alert_level.toUpperCase()}]: ${alert.message}`);
    
    // Here you would integrate with:
    // - Email/SMS services
    // - Slack/Teams webhooks  
    // - PagerDuty/OpsGenie
    // - Custom notification APIs
  }

  async updateDeviceHealthMetrics(deviceId, document) {
    const now = new Date();
    
    // Calculate device health score based on multiple factors
    const healthMetrics = {
      timestamp: now,
      device_info: {
        id: deviceId,
        facility: document.device.facility,
        zone: document.device.zone
      },
      
      health_indicators: {
        data_quality_score: document.quality_metrics.data_quality_score,
        signal_strength: document.device.network_info.signal_strength,
        sensor_health: document.quality_metrics.sensor_health,
        measurement_frequency: await this.calculateMeasurementFrequency(deviceId),
        last_communication: now,
        
        // Calculated health score
        overall_health_score: this.calculateOverallHealthScore(document),
        
        // Status indicators
        is_online: true,
        is_responsive: true,
        calibration_valid: document.quality_metrics.calibration_status === 'valid'
      },
      
      performance_metrics: {
        uptime_percentage: await this.calculateUptimePercentage(deviceId),
        average_response_time_ms: document.processing_info.processing_latency_ms,
        data_completeness_percentage: 100, // Could be calculated based on expected vs actual measurements
        error_rate_percentage: 0 // Could be calculated from failed measurements
      }
    };

    await this.deviceMetrics.insertOne(healthMetrics);
  }

  calculateOverallHealthScore(document) {
    let score = 100;
    
    // Factor in data quality
    score = score * (document.quality_metrics.data_quality_score / 100);
    
    // Factor in signal strength
    const signalStrength = document.device.network_info.signal_strength;
    if (signalStrength < -80) {
      score *= 0.8;
    } else if (signalStrength < -70) {
      score *= 0.9;
    }
    
    // Factor in sensor health
    if (document.quality_metrics.sensor_health !== 'normal') {
      score *= 0.7;
    }
    
    return Math.round(score);
  }

  async calculateMeasurementFrequency(deviceId, windowMinutes = 60) {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    const count = await this.sensorData.countDocuments({
      'device.id': deviceId,
      timestamp: { $gte: windowStart }
    });
    
    return count / windowMinutes; // Measurements per minute
  }

  async calculateUptimePercentage(deviceId, windowHours = 24) {
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    
    // Get expected measurement intervals (assuming every minute)
    const expectedMeasurements = windowHours * 60;
    
    const actualMeasurements = await this.sensorData.countDocuments({
      'device.id': deviceId,
      timestamp: { $gte: windowStart }
    });
    
    return Math.min(100, (actualMeasurements / expectedMeasurements) * 100);
  }

  async updateRollingAverages(deviceId, document) {
    // Update cached analytics for dashboard performance
    const measurementTypes = Object.keys(document.measurements);
    
    for (const measurementType of measurementTypes) {
      const value = document.measurements[measurementType].value;
      
      // Calculate rolling averages for different time windows
      const timeWindows = [
        { name: '5min', minutes: 5 },
        { name: '1hour', minutes: 60 },
        { name: '24hour', minutes: 1440 }
      ];

      for (const window of timeWindows) {
        await this.updateWindowAverage(deviceId, measurementType, value, window);
      }
    }
  }

  async updateWindowAverage(deviceId, measurementType, currentValue, window) {
    const windowStart = new Date(Date.now() - window.minutes * 60 * 1000);
    
    // Calculate average for the time window using aggregation
    const pipeline = [
      {
        $match: {
          'device.id': deviceId,
          timestamp: { $gte: windowStart },
          [`measurements.${measurementType}`]: { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          average: { $avg: `$measurements.${measurementType}.value` },
          count: { $sum: 1 },
          min: { $min: `$measurements.${measurementType}.value` },
          max: { $max: `$measurements.${measurementType}.value` },
          stddev: { $stdDevPop: `$measurements.${measurementType}.value` }
        }
      }
    ];

    const result = await this.sensorData.aggregate(pipeline).next();
    
    if (result) {
      const cacheDocument = {
        computed_at: new Date(),
        computation_type: {
          type: 'rolling_average',
          device_id: deviceId,
          measurement_type: measurementType,
          window: window.name
        },
        
        statistics: {
          average: result.average,
          count: result.count,
          min: result.min,
          max: result.max,
          stddev: result.stddev || 0,
          current_value: currentValue,
          
          // Trend calculation
          trend: currentValue > result.average ? 'rising' : 
                 currentValue < result.average ? 'falling' : 'stable',
          deviation_percentage: Math.abs((currentValue - result.average) / result.average * 100)
        }
      };

      await this.analyticsCache.replaceOne(
        { 
          'computation_type.type': 'rolling_average',
          'computation_type.device_id': deviceId,
          'computation_type.measurement_type': measurementType,
          'computation_type.window': window.name
        },
        cacheDocument,
        { upsert: true }
      );
    }
  }

  async getDeviceAnalytics(deviceId, options = {}) {
    const timeRange = options.timeRange || '24h';
    const measurementTypes = options.measurementTypes || null;
    const includeAggregations = options.includeAggregations !== false;
    
    try {
      // Parse time range
      const timeRangeMs = this.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);
      
      // Build aggregation pipeline
      const pipeline = [
        {
          $match: {
            'device.id': deviceId,
            timestamp: { $gte: startTime }
          }
        }
      ];

      // Add measurement type filtering if specified
      if (measurementTypes && measurementTypes.length > 0) {
        const measurementFilters = {};
        measurementTypes.forEach(type => {
          measurementFilters[`measurements.${type}`] = { $exists: true };
        });
        pipeline.push({ $match: { $or: Object.entries(measurementFilters).map(([key, value]) => ({ [key]: value })) } });
      }

      if (includeAggregations) {
        // Add aggregation stages for comprehensive analytics
        pipeline.push(
          {
            $addFields: {
              hour_bucket: {
                $dateTrunc: { date: '$timestamp', unit: 'hour' }
              }
            }
          },
          {
            $group: {
              _id: {
                hour: '$hour_bucket',
                sensor_type: '$device.sensor_type'
              },
              
              // Time and count metrics
              measurement_count: { $sum: 1 },
              first_measurement: { $min: '$timestamp' },
              last_measurement: { $max: '$timestamp' },
              
              // Data quality metrics
              avg_quality_score: { $avg: '$quality_metrics.data_quality_score' },
              min_quality_score: { $min: '$quality_metrics.data_quality_score' },
              
              // Network metrics
              avg_signal_strength: { $avg: '$device.network_info.signal_strength' },
              
              // Measurement statistics (dynamic based on available measurements)
              measurements: { $push: '$measurements' }
            }
          },
          {
            $addFields: {
              // Process measurements to calculate statistics for each type
              measurement_stats: {
                $reduce: {
                  input: '$measurements',
                  initialValue: {},
                  in: {
                    $mergeObjects: [
                      '$$value',
                      {
                        $arrayToObject: {
                          $map: {
                            input: { $objectToArray: '$$this' },
                            in: {
                              k: '$$this.k',
                              v: {
                                values: { $concatArrays: [{ $ifNull: [{ $getField: { field: 'values', input: { $getField: { field: '$$this.k', input: '$$value' } } } }, []] }, ['$$this.v.value']] },
                                unit: '$$this.v.unit'
                              }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            }
          },
          {
            $addFields: {
              // Calculate final statistics for each measurement type
              final_measurement_stats: {
                $arrayToObject: {
                  $map: {
                    input: { $objectToArray: '$measurement_stats' },
                    in: {
                      k: '$$this.k',
                      v: {
                        count: { $size: '$$this.v.values' },
                        average: { $avg: '$$this.v.values' },
                        min: { $min: '$$this.v.values' },
                        max: { $max: '$$this.v.values' },
                        stddev: { $stdDevPop: '$$this.v.values' },
                        unit: '$$this.v.unit'
                      }
                    }
                  }
                }
              }
            }
          },
          {
            $sort: { '_id.hour': 1 }
          }
        );
      } else {
        // Simple data retrieval without aggregations
        pipeline.push(
          {
            $sort: { timestamp: -1 }
          },
          {
            $limit: options.limit || 1000
          }
        );
      }

      const results = await this.sensorData.aggregate(pipeline).toArray();
      
      // Get cached analytics for quick dashboard metrics
      const cachedAnalytics = await this.getCachedAnalytics(deviceId, measurementTypes);
      
      return {
        success: true,
        device_id: deviceId,
        time_range: timeRange,
        query_timestamp: new Date(),
        data_points: results,
        cached_analytics: cachedAnalytics,
        
        summary: {
          total_measurements: results.reduce((sum, item) => sum + (item.measurement_count || 1), 0),
          time_span: {
            start: startTime,
            end: new Date()
          },
          measurement_types: measurementTypes || 'all'
        }
      };

    } catch (error) {
      console.error('Error retrieving device analytics:', error);
      return {
        success: false,
        error: error.message,
        device_id: deviceId
      };
    }
  }

  async getCachedAnalytics(deviceId, measurementTypes = null) {
    const query = {
      'computation_type.device_id': deviceId
    };

    if (measurementTypes && measurementTypes.length > 0) {
      query['computation_type.measurement_type'] = { $in: measurementTypes };
    }

    const cachedResults = await this.analyticsCache.find(query)
      .sort({ computed_at: -1 })
      .toArray();

    // Organize cached results by measurement type and window
    const organized = {};
    
    cachedResults.forEach(result => {
      const measurementType = result.computation_type.measurement_type;
      const window = result.computation_type.window;
      
      if (!organized[measurementType]) {
        organized[measurementType] = {};
      }
      
      organized[measurementType][window] = {
        ...result.statistics,
        computed_at: result.computed_at
      };
    });

    return organized;
  }

  parseTimeRange(timeRange) {
    const ranges = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    return ranges[timeRange] || ranges['24h'];
  }

  async getFacilityOverview(facility, options = {}) {
    const timeRange = options.timeRange || '24h';
    const timeRangeMs = this.parseTimeRange(timeRange);
    const startTime = new Date(Date.now() - timeRangeMs);

    try {
      const pipeline = [
        {
          $match: {
            'device.facility': facility,
            timestamp: { $gte: startTime }
          }
        },
        {
          $group: {
            _id: {
              device_id: '$device.id',
              zone: '$device.zone',
              sensor_type: '$device.sensor_type'
            },
            
            latest_timestamp: { $max: '$timestamp' },
            measurement_count: { $sum: 1 },
            avg_data_quality: { $avg: '$quality_metrics.data_quality_score' },
            avg_signal_strength: { $avg: '$device.network_info.signal_strength' },
            
            // Latest measurements for current values
            latest_measurements: { $last: '$measurements' },
            
            // Device info
            device_info: { $last: '$device' },
            latest_quality_metrics: { $last: '$quality_metrics' }
          }
        },
        {
          $addFields: {
            // Calculate device status
            device_status: {
              $switch: {
                branches: [
                  {
                    case: { $lt: ['$latest_timestamp', { $subtract: [new Date(), 300000] }] }, // 5 minutes
                    then: 'offline'
                  },
                  {
                    case: { $lt: ['$avg_data_quality', 50] },
                    then: 'degraded'
                  },
                  {
                    case: { $lt: ['$avg_signal_strength', -80] },
                    then: 'poor_connectivity'
                  }
                ],
                default: 'online'
              }
            },
            
            // Time since last measurement
            minutes_since_last_measurement: {
              $divide: [
                { $subtract: [new Date(), '$latest_timestamp'] },
                60000
              ]
            }
          }
        },
        {
          $group: {
            _id: '$_id.zone',
            
            device_count: { $sum: 1 },
            
            // Status distribution
            online_devices: {
              $sum: { $cond: [{ $eq: ['$device_status', 'online'] }, 1, 0] }
            },
            offline_devices: {
              $sum: { $cond: [{ $eq: ['$device_status', 'offline'] }, 1, 0] }
            },
            degraded_devices: {
              $sum: { $cond: [{ $eq: ['$device_status', 'degraded'] }, 1, 0] }
            },
            
            // Performance metrics
            avg_data_quality: { $avg: '$avg_data_quality' },
            avg_signal_strength: { $avg: '$avg_signal_strength' },
            total_measurements: { $sum: '$measurement_count' },
            
            // Sensor type distribution
            sensor_types: { $addToSet: '$_id.sensor_type' },
            
            // Device details
            devices: {
              $push: {
                device_id: '$_id.device_id',
                sensor_type: '$_id.sensor_type',
                status: '$device_status',
                last_seen: '$latest_timestamp',
                data_quality: '$avg_data_quality',
                signal_strength: '$avg_signal_strength',
                measurement_count: '$measurement_count',
                latest_measurements: '$latest_measurements'
              }
            }
          }
        },
        {
          $sort: { '_id': 1 }
        }
      ];

      const results = await this.sensorData.aggregate(pipeline).toArray();
      
      // Calculate facility-wide statistics
      const facilityStats = results.reduce((stats, zone) => {
        stats.total_devices += zone.device_count;
        stats.total_online += zone.online_devices;
        stats.total_offline += zone.offline_devices;
        stats.total_degraded += zone.degraded_devices;
        stats.total_measurements += zone.total_measurements;
        
        stats.avg_data_quality = (stats.avg_data_quality * stats.zones_processed + zone.avg_data_quality) / (stats.zones_processed + 1);
        stats.avg_signal_strength = (stats.avg_signal_strength * stats.zones_processed + zone.avg_signal_strength) / (stats.zones_processed + 1);
        stats.zones_processed += 1;
        
        // Collect unique sensor types
        zone.sensor_types.forEach(type => {
          if (!stats.sensor_types.includes(type)) {
            stats.sensor_types.push(type);
          }
        });
        
        return stats;
      }, {
        total_devices: 0,
        total_online: 0,
        total_offline: 0,
        total_degraded: 0,
        total_measurements: 0,
        avg_data_quality: 0,
        avg_signal_strength: 0,
        sensor_types: [],
        zones_processed: 0
      });

      // Calculate health score
      const healthScore = Math.round(
        (facilityStats.total_online / Math.max(facilityStats.total_devices, 1)) * 0.6 +
        (facilityStats.avg_data_quality / 100) * 0.3 +
        ((facilityStats.avg_signal_strength + 100) / 50) * 0.1
      );

      return {
        success: true,
        facility: facility,
        time_range: timeRange,
        generated_at: new Date(),
        
        facility_overview: {
          total_devices: facilityStats.total_devices,
          online_devices: facilityStats.total_online,
          offline_devices: facilityStats.total_offline,
          degraded_devices: facilityStats.total_degraded,
          
          uptime_percentage: Math.round((facilityStats.total_online / Math.max(facilityStats.total_devices, 1)) * 100),
          avg_data_quality: Math.round(facilityStats.avg_data_quality),
          avg_signal_strength: Math.round(facilityStats.avg_signal_strength),
          facility_health_score: healthScore,
          
          sensor_types: facilityStats.sensor_types,
          total_measurements_today: facilityStats.total_measurements,
          
          zones: results
        }
      };

    } catch (error) {
      console.error('Error generating facility overview:', error);
      return {
        success: false,
        error: error.message,
        facility: facility
      };
    }
  }

  async performBatchIngestion(batchData, options = {}) {
    const batchSize = options.batchSize || 1000;
    const enableValidation = options.enableValidation !== false;
    const startTime = Date.now();
    
    console.log(`Starting batch ingestion of ${batchData.length} records...`);
    
    try {
      const results = {
        total_records: batchData.length,
        processed_records: 0,
        failed_records: 0,
        batches_processed: 0,
        processing_time_ms: 0,
        errors: []
      };

      // Process in batches for optimal performance
      for (let i = 0; i < batchData.length; i += batchSize) {
        const batch = batchData.slice(i, i + batchSize);
        const batchStartTime = Date.now();
        
        // Prepare documents for insertion
        const documents = batch.map(record => {
          try {
            if (enableValidation) {
              this.validateBatchRecord(record);
            }
            
            return {
              timestamp: new Date(record.timestamp),
              
              device: {
                id: record.device_id,
                sensor_type: record.sensor_type,
                facility: record.facility || 'unknown',
                zone: record.zone || 'unspecified',
                location: record.location ? {
                  type: 'Point',
                  coordinates: [record.location.lng, record.location.lat]
                } : null,
                model: record.device_model || 'unknown',
                firmware_version: record.firmware_version || '1.0',
                network_info: {
                  connection_type: record.connection_type || 'unknown',
                  signal_strength: record.signal_strength || -50,
                  gateway_id: record.gateway_id
                }
              },
              
              measurements: this.normalizeMeasurements(record.measurements || record.values),
              
              quality_metrics: {
                data_quality_score: record.data_quality_score || 95,
                sensor_health: record.sensor_health || 'normal',
                calibration_status: record.calibration_status || 'valid',
                measurement_accuracy: record.measurement_accuracy || 0.95
              },
              
              processing_info: {
                ingestion_timestamp: new Date(),
                processing_latency_ms: 0,
                source: 'batch_import',
                batch_id: options.batchId || `batch_${Date.now()}`,
                schema_version: '2.0'
              }
            };
          } catch (validationError) {
            results.errors.push({
              record_index: i + batch.indexOf(record),
              error: validationError.message,
              record: record
            });
            return null;
          }
        }).filter(doc => doc !== null);

        if (documents.length > 0) {
          try {
            await this.sensorData.insertMany(documents, { 
              ordered: false,
              writeConcern: { w: 'majority', j: true }
            });
            
            results.processed_records += documents.length;
          } catch (insertError) {
            results.failed_records += documents.length;
            results.errors.push({
              batch_index: results.batches_processed,
              error: insertError.message,
              documents_count: documents.length
            });
          }
        }

        results.batches_processed += 1;
        const batchTime = Date.now() - batchStartTime;
        
        console.log(`Batch ${results.batches_processed} processed: ${documents.length} records in ${batchTime}ms`);
      }

      results.processing_time_ms = Date.now() - startTime;
      results.success_rate = (results.processed_records / results.total_records) * 100;
      results.throughput_records_per_second = Math.round(results.processed_records / (results.processing_time_ms / 1000));

      console.log(`Batch ingestion completed: ${results.processed_records}/${results.total_records} records processed in ${results.processing_time_ms}ms`);

      return {
        success: true,
        results: results
      };

    } catch (error) {
      console.error('Batch ingestion failed:', error);
      return {
        success: false,
        error: error.message,
        processing_time_ms: Date.now() - startTime
      };
    }
  }

  validateBatchRecord(record) {
    if (!record.device_id) {
      throw new Error('device_id is required');
    }
    
    if (!record.sensor_type) {
      throw new Error('sensor_type is required');
    }
    
    if (!record.timestamp) {
      throw new Error('timestamp is required');
    }
    
    if (!record.measurements && !record.values) {
      throw new Error('measurements or values are required');
    }

    // Validate timestamp format
    const timestamp = new Date(record.timestamp);
    if (isNaN(timestamp.getTime())) {
      throw new Error('Invalid timestamp format');
    }

    // Validate timestamp is not in the future
    if (timestamp > new Date()) {
      throw new Error('Timestamp cannot be in the future');
    }

    // Validate timestamp is not too old (more than 1 year)
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    if (timestamp < oneYearAgo) {
      throw new Error('Timestamp too old (more than 1 year)');
    }
  }
}

module.exports = { MongoDBTimeSeriesManager };
```

## Advanced Time Series Analytics Patterns

### Real-Time Aggregation Pipelines

Implement sophisticated real-time analytics using MongoDB aggregation frameworks:

```javascript
// Advanced analytics and alerting system
class TimeSeriesAnalyticsEngine {
  constructor(timeSeriesManager) {
    this.tsManager = timeSeriesManager;
    this.db = timeSeriesManager.db;
    this.alertRules = new Map();
    this.analyticsCache = new Map();
  }

  async createAdvancedAnalyticsPipeline(analysisConfig) {
    const {
      deviceFilter = {},
      timeRange = '24h',
      aggregationLevel = 'hour',
      analysisTypes = ['trend', 'anomaly', 'correlation'],
      realTimeEnabled = true
    } = analysisConfig;

    try {
      const timeRangeMs = this.tsManager.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      // Build comprehensive analytics pipeline
      const pipeline = [
        // Stage 1: Filter data by time and device criteria
        {
          $match: {
            timestamp: { $gte: startTime },
            ...this.buildDeviceFilter(deviceFilter)
          }
        },

        // Stage 2: Add time bucketing for aggregation
        {
          $addFields: {
            time_bucket: this.getTimeBucketExpression(aggregationLevel),
            hour_of_day: { $hour: '$timestamp' },
            day_of_week: { $dayOfWeek: '$timestamp' },
            is_business_hours: {
              $and: [
                { $gte: [{ $hour: '$timestamp' }, 8] },
                { $lte: [{ $hour: '$timestamp' }, 18] }
              ]
            }
          }
        },

        // Stage 3: Unwind measurements for individual analysis
        {
          $addFields: {
            measurement_array: {
              $objectToArray: '$measurements'
            }
          }
        },

        {
          $unwind: '$measurement_array'
        },

        // Stage 4: Group by time bucket, device, and measurement type
        {
          $group: {
            _id: {
              time_bucket: '$time_bucket',
              device_id: '$device.id',
              measurement_type: '$measurement_array.k',
              facility: '$device.facility',
              zone: '$device.zone'
            },

            // Statistical aggregations
            count: { $sum: 1 },
            avg_value: { $avg: '$measurement_array.v.value' },
            min_value: { $min: '$measurement_array.v.value' },
            max_value: { $max: '$measurement_array.v.value' },
            sum_value: { $sum: '$measurement_array.v.value' },
            stddev_value: { $stdDevPop: '$measurement_array.v.value' },

            // Data quality metrics
            avg_data_quality: { $avg: '$quality_metrics.data_quality_score' },
            min_data_quality: { $min: '$quality_metrics.data_quality_score' },

            // Network performance
            avg_signal_strength: { $avg: '$device.network_info.signal_strength' },

            // Time-based metrics
            first_timestamp: { $min: '$timestamp' },
            last_timestamp: { $max: '$timestamp' },

            // Business context
            business_hours_readings: {
              $sum: { $cond: ['$is_business_hours', 1, 0] }
            },
            
            // Value arrays for advanced calculations
            values: { $push: '$measurement_array.v.value' },
            timestamps: { $push: '$timestamp' },

            // Metadata
            unit: { $last: '$measurement_array.v.unit' },
            device_info: { $last: '$device' }
          }
        },

        // Stage 5: Calculate advanced metrics
        {
          $addFields: {
            // Variance and coefficient of variation
            variance: { $pow: ['$stddev_value', 2] },
            coefficient_of_variation: {
              $cond: [
                { $ne: ['$avg_value', 0] },
                { $divide: ['$stddev_value', '$avg_value'] },
                0
              ]
            },

            // Range and percentiles (approximated)
            value_range: { $subtract: ['$max_value', '$min_value'] },
            
            // Data completeness
            expected_readings: {
              $divide: [
                { $subtract: ['$last_timestamp', '$first_timestamp'] },
                { $multiply: [this.getExpectedInterval(aggregationLevel), 1000] }
              ]
            },

            // Time span coverage
            time_span_hours: {
              $divide: [
                { $subtract: ['$last_timestamp', '$first_timestamp'] },
                3600000
              ]
            },

            // Business hours coverage
            business_hours_percentage: {
              $multiply: [
                { $divide: ['$business_hours_readings', '$count'] },
                100
              ]
            }
          }
        },

        // Stage 6: Calculate trend indicators
        {
          $addFields: {
            // Simple trend approximation
            trend_direction: {
              $switch: {
                branches: [
                  {
                    case: { $gt: ['$coefficient_of_variation', 0.5] },
                    then: 'highly_variable'
                  },
                  {
                    case: { $gt: ['$max_value', { $multiply: ['$avg_value', 1.2] }] },
                    then: 'trending_high'
                  },
                  {
                    case: { $lt: ['$min_value', { $multiply: ['$avg_value', 0.8] }] },
                    then: 'trending_low'
                  }
                ],
                default: 'stable'
              }
            },

            // Anomaly detection flags
            anomaly_indicators: {
              $let: {
                vars: {
                  three_sigma_upper: { $add: ['$avg_value', { $multiply: ['$stddev_value', 3] }] },
                  three_sigma_lower: { $subtract: ['$avg_value', { $multiply: ['$stddev_value', 3] }] }
                },
                in: {
                  has_outliers: {
                    $or: [
                      { $gt: ['$max_value', '$$three_sigma_upper'] },
                      { $lt: ['$min_value', '$$three_sigma_lower'] }
                    ]
                  },
                  outlier_percentage: {
                    $multiply: [
                      {
                        $divide: [
                          {
                            $size: {
                              $filter: {
                                input: '$values',
                                cond: {
                                  $or: [
                                    { $gt: ['$$this', '$$three_sigma_upper'] },
                                    { $lt: ['$$this', '$$three_sigma_lower'] }
                                  ]
                                }
                              }
                            }
                          },
                          '$count'
                        ]
                      },
                      100
                    ]
                  }
                }
              }
            },

            // Performance indicators
            performance_score: {
              $multiply: [
                // Data quality component (40%)
                { $multiply: [{ $divide: ['$avg_data_quality', 100] }, 0.4] },
                
                // Connectivity component (30%)
                { $multiply: [{ $divide: [{ $add: ['$avg_signal_strength', 100] }, 50] }, 0.3] },
                
                // Completeness component (30%)
                { $multiply: [{ $min: [{ $divide: ['$count', '$expected_readings'] }, 1] }, 0.3] },
                
                100
              ]
            }
          }
        },

        // Stage 7: Add comparative context
        {
          $lookup: {
            from: 'sensor_readings',
            let: {
              device_id: '$_id.device_id',
              measurement_type: '$_id.measurement_type',
              current_start: '$first_timestamp'
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$device.id', '$$device_id'] },
                      { $lt: ['$timestamp', '$$current_start'] },
                      { $gte: ['$timestamp', { $subtract: ['$$current_start', timeRangeMs] }] }
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  historical_avg: { $avg: { $getField: { field: '$$measurement_type', input: '$measurements' } } }
                }
              }
            ],
            as: 'historical_context'
          }
        },

        // Stage 8: Final calculations and categorization
        {
          $addFields: {
            // Historical comparison
            historical_avg: {
              $ifNull: [
                { $arrayElemAt: ['$historical_context.historical_avg', 0] },
                '$avg_value'
              ]
            },

            // Calculate change from historical baseline
            historical_change_percentage: {
              $let: {
                vars: {
                  historical: {
                    $ifNull: [
                      { $arrayElemAt: ['$historical_context.historical_avg', 0] },
                      '$avg_value'
                    ]
                  }
                },
                in: {
                  $cond: [
                    { $ne: ['$$historical', 0] },
                    {
                      $multiply: [
                        { $divide: [{ $subtract: ['$avg_value', '$$historical'] }, '$$historical'] },
                        100
                      ]
                    },
                    0
                  ]
                }
              }
            },

            // Overall health assessment
            health_status: {
              $switch: {
                branches: [
                  {
                    case: { $lt: ['$performance_score', 50] },
                    then: 'critical'
                  },
                  {
                    case: { $lt: ['$performance_score', 70] },
                    then: 'warning'
                  },
                  {
                    case: { $gt: ['$anomaly_indicators.outlier_percentage', 10] },
                    then: 'anomalous'
                  }
                ],
                default: 'healthy'
              }
            },

            // Analysis timestamp
            analyzed_at: new Date(),
            analysis_duration_ms: { $subtract: [new Date(), startTime] }
          }
        },

        // Stage 9: Sort by relevance
        {
          $sort: {
            performance_score: 1, // Worst performers first
            'anomaly_indicators.outlier_percentage': -1,
            '_id.time_bucket': -1
          }
        }
      ];

      const results = await this.tsManager.sensorData.aggregate(pipeline).toArray();

      // Process results for real-time actions
      if (realTimeEnabled) {
        await this.processAnalyticsForAlerts(results);
      }

      // Cache results for dashboard performance
      const cacheKey = this.generateAnalyticsCacheKey(analysisConfig);
      this.analyticsCache.set(cacheKey, {
        results: results,
        generated_at: new Date(),
        config: analysisConfig
      });

      return {
        success: true,
        analysis_config: analysisConfig,
        results: results,
        summary: this.generateAnalyticsSummary(results),
        generated_at: new Date(),
        cache_key: cacheKey
      };

    } catch (error) {
      console.error('Advanced analytics pipeline failed:', error);
      return {
        success: false,
        error: error.message,
        analysis_config: analysisConfig
      };
    }
  }

  buildDeviceFilter(deviceFilter) {
    const filter = {};
    
    if (deviceFilter.device_ids && deviceFilter.device_ids.length > 0) {
      filter['device.id'] = { $in: deviceFilter.device_ids };
    }
    
    if (deviceFilter.facilities && deviceFilter.facilities.length > 0) {
      filter['device.facility'] = { $in: deviceFilter.facilities };
    }
    
    if (deviceFilter.zones && deviceFilter.zones.length > 0) {
      filter['device.zone'] = { $in: deviceFilter.zones };
    }
    
    if (deviceFilter.sensor_types && deviceFilter.sensor_types.length > 0) {
      filter['device.sensor_type'] = { $in: deviceFilter.sensor_types };
    }

    if (deviceFilter.location_radius) {
      const { center, radius_meters } = deviceFilter.location_radius;
      filter['device.location'] = {
        $geoWithin: {
          $centerSphere: [[center.lng, center.lat], radius_meters / 6378137] // Earth radius in meters
        }
      };
    }

    return filter;
  }

  getTimeBucketExpression(aggregationLevel) {
    const buckets = {
      minute: { $dateTrunc: { date: '$timestamp', unit: 'minute' } },
      hour: { $dateTrunc: { date: '$timestamp', unit: 'hour' } },
      day: { $dateTrunc: { date: '$timestamp', unit: 'day' } },
      week: {
        $dateAdd: {
          startDate: { $dateTrunc: { date: '$timestamp', unit: 'week', startOfWeek: 'monday' } },
          unit: 'day',
          amount: 0
        }
      },
      month: { $dateTrunc: { date: '$timestamp', unit: 'month' } }
    };

    return buckets[aggregationLevel] || buckets.hour;
  }

  getExpectedInterval(aggregationLevel) {
    const intervals = {
      minute: 60,     // 60 seconds
      hour: 3600,     // 3600 seconds  
      day: 86400,     // 86400 seconds
      week: 604800,   // 604800 seconds
      month: 2592000  // ~30 days in seconds
    };

    return intervals[aggregationLevel] || intervals.hour;
  }

  async processAnalyticsForAlerts(analyticsResults) {
    for (const result of analyticsResults) {
      // Check for alert conditions
      if (result.health_status === 'critical') {
        await this.createAnalyticsAlert('critical_performance', result);
      }

      if (result.anomaly_indicators.outlier_percentage > 15) {
        await this.createAnalyticsAlert('anomaly_detected', result);
      }

      if (Math.abs(result.historical_change_percentage) > 50) {
        await this.createAnalyticsAlert('significant_trend_change', result);
      }

      if (result.performance_score < 30) {
        await this.createAnalyticsAlert('poor_performance', result);
      }
    }
  }

  async createAnalyticsAlert(alertType, analyticsData) {
    const alertsCollection = this.db.collection('analytics_alerts');
    
    const alert = {
      _id: new ObjectId(),
      alert_type: alertType,
      device_id: analyticsData._id.device_id,
      measurement_type: analyticsData._id.measurement_type,
      facility: analyticsData._id.facility,
      zone: analyticsData._id.zone,
      
      // Alert details
      severity: this.calculateAlertSeverity(alertType, analyticsData),
      description: this.generateAlertDescription(alertType, analyticsData),
      
      // Analytics context
      analytics_data: {
        time_bucket: analyticsData._id.time_bucket,
        performance_score: analyticsData.performance_score,
        health_status: analyticsData.health_status,
        anomaly_indicators: analyticsData.anomaly_indicators,
        historical_change_percentage: analyticsData.historical_change_percentage,
        avg_value: analyticsData.avg_value,
        trend_direction: analyticsData.trend_direction
      },
      
      // Timestamps
      created_at: new Date(),
      acknowledged: false,
      resolved: false
    };

    await alertsCollection.insertOne(alert);
    console.log(`Analytics Alert Created: ${alertType} for device ${analyticsData._id.device_id}`);
  }

  calculateAlertSeverity(alertType, analyticsData) {
    switch (alertType) {
      case 'critical_performance':
        return analyticsData.performance_score < 20 ? 'critical' : 'high';
      
      case 'anomaly_detected':
        return analyticsData.anomaly_indicators.outlier_percentage > 25 ? 'high' : 'medium';
      
      case 'significant_trend_change':
        return Math.abs(analyticsData.historical_change_percentage) > 100 ? 'high' : 'medium';
      
      case 'poor_performance':
        return analyticsData.performance_score < 20 ? 'high' : 'medium';
      
      default:
        return 'medium';
    }
  }

  generateAlertDescription(alertType, analyticsData) {
    const device = analyticsData._id.device_id;
    const measurement = analyticsData._id.measurement_type;
    
    switch (alertType) {
      case 'critical_performance':
        return `Critical performance degradation detected for ${device} ${measurement} sensor. Performance score: ${Math.round(analyticsData.performance_score)}%`;
      
      case 'anomaly_detected':
        return `Anomalous readings detected for ${device} ${measurement}. ${Math.round(analyticsData.anomaly_indicators.outlier_percentage)}% of readings are outliers`;
      
      case 'significant_trend_change':
        return `Significant trend change for ${device} ${measurement}. ${Math.round(analyticsData.historical_change_percentage)}% change from historical baseline`;
      
      case 'poor_performance':
        return `Poor performance detected for ${device} ${measurement}. Performance score: ${Math.round(analyticsData.performance_score)}%`;
      
      default:
        return `Analytics alert for ${device} ${measurement}`;
    }
  }

  generateAnalyticsSummary(results) {
    if (results.length === 0) {
      return { total_devices: 0, total_measurements: 0 };
    }

    const summary = {
      total_analyses: results.length,
      unique_devices: new Set(results.map(r => r._id.device_id)).size,
      unique_measurements: new Set(results.map(r => r._id.measurement_type)).size,
      unique_facilities: new Set(results.map(r => r._id.facility)).size,
      
      // Health distribution
      health_status_distribution: {},
      
      // Performance metrics
      avg_performance_score: 0,
      min_performance_score: 100,
      max_performance_score: 0,
      
      // Anomaly statistics
      anomalous_analyses: 0,
      avg_outlier_percentage: 0,
      
      // Trend distribution
      trend_distribution: {},
      
      // Time range
      earliest_bucket: null,
      latest_bucket: null
    };

    // Calculate distributions and averages
    results.forEach(result => {
      // Health status distribution
      const status = result.health_status;
      summary.health_status_distribution[status] = (summary.health_status_distribution[status] || 0) + 1;
      
      // Performance metrics
      summary.avg_performance_score += result.performance_score;
      summary.min_performance_score = Math.min(summary.min_performance_score, result.performance_score);
      summary.max_performance_score = Math.max(summary.max_performance_score, result.performance_score);
      
      // Anomaly tracking
      if (result.anomaly_indicators.has_outliers) {
        summary.anomalous_analyses++;
      }
      summary.avg_outlier_percentage += result.anomaly_indicators.outlier_percentage;
      
      // Trend distribution
      const trend = result.trend_direction;
      summary.trend_distribution[trend] = (summary.trend_distribution[trend] || 0) + 1;
      
      // Time range
      const bucket = result._id.time_bucket;
      if (!summary.earliest_bucket || bucket < summary.earliest_bucket) {
        summary.earliest_bucket = bucket;
      }
      if (!summary.latest_bucket || bucket > summary.latest_bucket) {
        summary.latest_bucket = bucket;
      }
    });

    // Calculate averages
    summary.avg_performance_score = Math.round(summary.avg_performance_score / results.length);
    summary.avg_outlier_percentage = Math.round(summary.avg_outlier_percentage / results.length);
    summary.anomaly_rate = Math.round((summary.anomalous_analyses / results.length) * 100);

    return summary;
  }

  generateAnalyticsCacheKey(analysisConfig) {
    const keyData = {
      devices: JSON.stringify(analysisConfig.deviceFilter || {}),
      timeRange: analysisConfig.timeRange,
      aggregationLevel: analysisConfig.aggregationLevel,
      analysisTypes: JSON.stringify(analysisConfig.analysisTypes || [])
    };
    
    const crypto = require('crypto');
    return crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');
  }
}

module.exports = { TimeSeriesAnalyticsEngine };
```

## SQL-Style Time Series Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB time series operations:

```sql
-- QueryLeaf Time Series operations with SQL-familiar syntax

-- Insert time series data with automatic optimization
INSERT INTO sensor_readings (
  timestamp,
  device_id,
  sensor_type,
  measurements,
  location,
  quality_metrics
)
VALUES (
  CURRENT_TIMESTAMP,
  'device_001',
  'temperature',
  JSON_BUILD_OBJECT(
    'temperature', JSON_BUILD_OBJECT('value', 23.5, 'unit', 'celsius'),
    'humidity', JSON_BUILD_OBJECT('value', 65.2, 'unit', 'percent')
  ),
  ST_GeomFromText('POINT(-74.0060 40.7128)', 4326),
  JSON_BUILD_OBJECT(
    'data_quality_score', 95,
    'sensor_health', 'normal',
    'signal_strength', -45
  )
);

-- Advanced time series analytics with window functions
WITH hourly_analytics AS (
  SELECT 
    device_id,
    sensor_type,
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    
    -- Basic statistics
    COUNT(*) as reading_count,
    AVG(measurements->>'temperature'->>'value') as avg_temperature,
    MIN(measurements->>'temperature'->>'value') as min_temperature,
    MAX(measurements->>'temperature'->>'value') as max_temperature,
    STDDEV(measurements->>'temperature'->>'value') as temp_stddev,
    
    -- Time series specific aggregations
    FIRST_VALUE(measurements->>'temperature'->>'value') OVER (
      PARTITION BY device_id, DATE_TRUNC('hour', timestamp)
      ORDER BY timestamp ASC
      ROWS UNBOUNDED PRECEDING
    ) as first_reading,
    
    LAST_VALUE(measurements->>'temperature'->>'value') OVER (
      PARTITION BY device_id, DATE_TRUNC('hour', timestamp) 
      ORDER BY timestamp ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as last_reading,
    
    -- Moving averages
    AVG(measurements->>'temperature'->>'value') OVER (
      PARTITION BY device_id
      ORDER BY timestamp
      ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
    ) as moving_avg_6_readings,
    
    -- Data quality metrics
    AVG(quality_metrics->>'data_quality_score') as avg_data_quality,
    MIN(quality_metrics->>'signal_strength') as min_signal_strength,
    
    -- Geographical aggregation
    device.facility,
    device.zone,
    ST_AsText(AVG(device.location)) as avg_location
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND device.sensor_type = 'temperature'
  GROUP BY 
    device_id, 
    sensor_type, 
    DATE_TRUNC('hour', timestamp),
    device.facility,
    device.zone
),

trend_analysis AS (
  -- Calculate trends and changes over time
  SELECT 
    *,
    
    -- Hour-over-hour trend calculation
    LAG(avg_temperature, 1) OVER (
      PARTITION BY device_id 
      ORDER BY hour_bucket
    ) as prev_hour_temp,
    
    -- Trend direction
    CASE 
      WHEN avg_temperature > LAG(avg_temperature, 1) OVER (
        PARTITION BY device_id ORDER BY hour_bucket
      ) + temp_stddev THEN 'rising_fast'
      WHEN avg_temperature > LAG(avg_temperature, 1) OVER (
        PARTITION BY device_id ORDER BY hour_bucket
      ) THEN 'rising'
      WHEN avg_temperature < LAG(avg_temperature, 1) OVER (
        PARTITION BY device_id ORDER BY hour_bucket
      ) - temp_stddev THEN 'falling_fast'
      WHEN avg_temperature < LAG(avg_temperature, 1) OVER (
        PARTITION BY device_id ORDER BY hour_bucket
      ) THEN 'falling'
      ELSE 'stable'
    END as trend_direction,
    
    -- Anomaly detection using statistical boundaries
    CASE 
      WHEN ABS(avg_temperature - AVG(avg_temperature) OVER (
        PARTITION BY device_id 
        ORDER BY hour_bucket 
        ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
      )) > 3 * STDDEV(avg_temperature) OVER (
        PARTITION BY device_id 
        ORDER BY hour_bucket 
        ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
      ) THEN true
      ELSE false
    END as is_anomaly,
    
    -- Performance scoring
    CASE 
      WHEN avg_data_quality >= 90 AND min_signal_strength >= -60 THEN 'excellent'
      WHEN avg_data_quality >= 80 AND min_signal_strength >= -70 THEN 'good'
      WHEN avg_data_quality >= 70 AND min_signal_strength >= -80 THEN 'fair'
      ELSE 'poor'
    END as performance_rating,
    
    -- Operational status
    CASE 
      WHEN reading_count < 50 THEN 'low_frequency'  -- Expected: 60 readings per hour
      WHEN reading_count > 70 THEN 'high_frequency'
      ELSE 'normal_frequency'
    END as operational_status
    
  FROM hourly_analytics
),

facility_overview AS (
  -- Facility-level aggregations and insights
  SELECT 
    facility,
    zone,
    hour_bucket,
    
    -- Device and measurement counts
    COUNT(DISTINCT device_id) as active_devices,
    SUM(reading_count) as total_readings,
    
    -- Temperature analytics
    AVG(avg_temperature) as facility_avg_temp,
    MIN(min_temperature) as facility_min_temp,
    MAX(max_temperature) as facility_max_temp,
    
    -- Performance metrics
    AVG(avg_data_quality) as facility_data_quality,
    AVG(min_signal_strength) as facility_avg_signal,
    
    -- Status distribution
    COUNT(*) FILTER (WHERE performance_rating = 'excellent') as excellent_devices,
    COUNT(*) FILTER (WHERE performance_rating = 'good') as good_devices,
    COUNT(*) FILTER (WHERE performance_rating = 'fair') as fair_devices,
    COUNT(*) FILTER (WHERE performance_rating = 'poor') as poor_devices,
    
    -- Anomaly and trend insights
    COUNT(*) FILTER (WHERE is_anomaly = true) as anomalous_devices,
    COUNT(*) FILTER (WHERE trend_direction LIKE '%rising%') as rising_trend_devices,
    COUNT(*) FILTER (WHERE trend_direction LIKE '%falling%') as falling_trend_devices,
    
    -- Operational health
    COUNT(*) FILTER (WHERE operational_status = 'normal_frequency') as normal_operation_devices,
    COUNT(*) FILTER (WHERE operational_status = 'low_frequency') as low_frequency_devices,
    
    -- Geographic insights (if location data available)
    COUNT(DISTINCT avg_location) as location_diversity
    
  FROM trend_analysis
  GROUP BY facility, zone, hour_bucket
)

-- Final comprehensive time series analytics dashboard
SELECT 
  f.facility,
  f.zone,
  f.hour_bucket,
  
  -- Device and data summary
  f.active_devices,
  f.total_readings,
  ROUND(f.total_readings::numeric / NULLIF(f.active_devices, 0), 0) as avg_readings_per_device,
  
  -- Environmental metrics
  ROUND(f.facility_avg_temp, 2) as avg_temperature,
  ROUND(f.facility_min_temp, 2) as min_temperature,
  ROUND(f.facility_max_temp, 2) as max_temperature,
  ROUND(f.facility_max_temp - f.facility_min_temp, 2) as temperature_range,
  
  -- Performance assessment
  ROUND(f.facility_data_quality, 1) as data_quality_percentage,
  ROUND(f.facility_avg_signal, 0) as avg_signal_strength,
  
  -- Health score calculation
  ROUND(
    (f.excellent_devices * 100 + f.good_devices * 80 + f.fair_devices * 60 + f.poor_devices * 40) 
    / NULLIF(f.active_devices, 0), 
    1
  ) as facility_health_score,
  
  -- Status distribution percentages
  ROUND((f.excellent_devices::numeric / NULLIF(f.active_devices, 0)) * 100, 1) as excellent_percentage,
  ROUND((f.good_devices::numeric / NULLIF(f.active_devices, 0)) * 100, 1) as good_percentage,
  ROUND((f.fair_devices::numeric / NULLIF(f.active_devices, 0)) * 100, 1) as fair_percentage,
  ROUND((f.poor_devices::numeric / NULLIF(f.active_devices, 0)) * 100, 1) as poor_percentage,
  
  -- Trend and anomaly insights
  f.anomalous_devices,
  ROUND((f.anomalous_devices::numeric / NULLIF(f.active_devices, 0)) * 100, 1) as anomaly_percentage,
  f.rising_trend_devices,
  f.falling_trend_devices,
  
  -- Operational status
  f.normal_operation_devices,
  f.low_frequency_devices,
  ROUND((f.normal_operation_devices::numeric / NULLIF(f.active_devices, 0)) * 100, 1) as operational_health_percentage,
  
  -- Alert conditions
  CASE 
    WHEN f.anomalous_devices > (f.active_devices * 0.2) THEN 'high_anomaly_alert'
    WHEN f.poor_devices > (f.active_devices * 0.3) THEN 'poor_performance_alert'
    WHEN f.low_frequency_devices > (f.active_devices * 0.4) THEN 'connectivity_alert'
    WHEN f.facility_avg_temp > 40 OR f.facility_avg_temp < 0 THEN 'environmental_alert'
    ELSE 'normal'
  END as alert_status,
  
  -- Recommendations
  CASE 
    WHEN f.poor_devices > (f.active_devices * 0.2) THEN 'Investigate device performance issues'
    WHEN f.anomalous_devices > (f.active_devices * 0.1) THEN 'Review anomalous readings for pattern analysis'
    WHEN f.facility_data_quality < 80 THEN 'Improve data quality monitoring and sensor calibration'
    WHEN f.facility_avg_signal < -70 THEN 'Consider network infrastructure improvements'
    ELSE 'System operating within normal parameters'
  END as recommendation,
  
  -- Metadata
  CURRENT_TIMESTAMP as report_generated_at,
  '24h_analysis' as analysis_type
  
FROM facility_overview f
WHERE f.hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY 
  f.facility, 
  f.zone, 
  f.hour_bucket DESC;

-- Real-time alerting with time series patterns
WITH real_time_thresholds AS (
  SELECT 
    device_id,
    sensor_type,
    
    -- Current reading
    measurements->>'temperature'->>'value' as current_temp,
    measurements->>'humidity'->>'value' as current_humidity,
    quality_metrics->>'data_quality_score' as current_quality,
    
    -- Historical context (last hour average)
    AVG(measurements->>'temperature'->>'value') OVER (
      PARTITION BY device_id
      ORDER BY timestamp
      RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND INTERVAL '1 minute' PRECEDING
    ) as historical_avg_temp,
    
    -- Recent trend (last 5 readings)
    AVG(measurements->>'temperature'->>'value') OVER (
      PARTITION BY device_id
      ORDER BY timestamp
      ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
    ) as recent_avg_temp,
    
    -- Device metadata
    device.facility,
    device.zone,
    device.location,
    timestamp,
    
    -- Network health
    quality_metrics->>'signal_strength' as signal_strength
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    AND device.sensor_type = 'temperature'
),

alert_conditions AS (
  SELECT 
    *,
    
    -- Threshold breaches
    CASE 
      WHEN current_temp > 80 THEN 'critical_high_temperature'
      WHEN current_temp < -10 THEN 'critical_low_temperature'
      WHEN current_temp > 60 THEN 'high_temperature_warning'
      WHEN current_temp < 5 THEN 'low_temperature_warning'
      ELSE null
    END as temperature_alert,
    
    -- Rapid changes
    CASE 
      WHEN ABS(current_temp - recent_avg_temp) > 10 THEN 'rapid_temperature_change'
      WHEN ABS(current_temp - historical_avg_temp) > 15 THEN 'significant_deviation'
      ELSE null
    END as change_alert,
    
    -- Data quality issues
    CASE 
      WHEN current_quality < 50 THEN 'critical_data_quality'
      WHEN current_quality < 70 THEN 'poor_data_quality'
      WHEN signal_strength < -90 THEN 'poor_connectivity'
      ELSE null
    END as quality_alert,
    
    -- Combined severity assessment
    CASE 
      WHEN current_temp > 80 OR current_temp < -10 OR current_quality < 50 THEN 'critical'
      WHEN current_temp > 60 OR current_temp < 5 OR current_quality < 70 OR ABS(current_temp - recent_avg_temp) > 10 THEN 'warning'
      WHEN ABS(current_temp - historical_avg_temp) > 15 OR signal_strength < -80 THEN 'info'
      ELSE 'normal'
    END as overall_severity
    
  FROM real_time_thresholds
)

-- Generate active alerts with context
SELECT 
  device_id,
  facility,
  zone,
  ST_AsText(location) as device_location,
  timestamp as alert_timestamp,
  overall_severity,
  
  -- Primary alert
  COALESCE(temperature_alert, change_alert, quality_alert, 'normal') as primary_alert_type,
  
  -- Alert message
  CASE 
    WHEN temperature_alert IS NOT NULL THEN 
      CONCAT('Temperature alert: ', current_temp, '°C detected')
    WHEN change_alert IS NOT NULL THEN 
      CONCAT('Temperature change alert: ', ROUND(ABS(current_temp - recent_avg_temp), 1), '°C change detected')
    WHEN quality_alert IS NOT NULL THEN 
      CONCAT('Data quality alert: ', current_quality, '% quality score')
    ELSE 'System normal'
  END as alert_message,
  
  -- Current readings
  ROUND(current_temp, 2) as current_temperature,
  ROUND(current_humidity, 1) as current_humidity,
  current_quality as data_quality_percentage,
  signal_strength as signal_strength_dbm,
  
  -- Context
  ROUND(historical_avg_temp, 2) as hourly_avg_temperature,
  ROUND(recent_avg_temp, 2) as recent_avg_temperature,
  ROUND(ABS(current_temp - historical_avg_temp), 2) as deviation_from_hourly_avg,
  
  -- Action required
  CASE overall_severity
    WHEN 'critical' THEN 'IMMEDIATE ACTION REQUIRED'
    WHEN 'warning' THEN 'Investigation recommended'
    WHEN 'info' THEN 'Monitor for trends'
    ELSE 'No action required'
  END as recommended_action,
  
  -- Contact priority
  CASE overall_severity
    WHEN 'critical' THEN 'Notify operations team immediately'
    WHEN 'warning' THEN 'Escalate to facility manager'
    ELSE 'Log for review'
  END as escalation_level

FROM alert_conditions
WHERE overall_severity IN ('critical', 'warning', 'info')
ORDER BY 
  CASE overall_severity 
    WHEN 'critical' THEN 1 
    WHEN 'warning' THEN 2 
    WHEN 'info' THEN 3 
  END,
  timestamp DESC;

-- Time series data lifecycle management
WITH data_lifecycle_analysis AS (
  SELECT 
    DATE_TRUNC('day', timestamp) as date_bucket,
    device.facility,
    COUNT(*) as daily_record_count,
    AVG(quality_metrics->>'data_quality_score') as avg_daily_quality,
    
    -- Data size estimation (approximate)
    COUNT(*) * 1024 as estimated_bytes_per_day, -- Rough estimate
    
    -- Retention category
    CASE 
      WHEN DATE_TRUNC('day', timestamp) >= CURRENT_DATE - INTERVAL '7 days' THEN 'hot_data'
      WHEN DATE_TRUNC('day', timestamp) >= CURRENT_DATE - INTERVAL '90 days' THEN 'warm_data'
      WHEN DATE_TRUNC('day', timestamp) >= CURRENT_DATE - INTERVAL '365 days' THEN 'cold_data'
      ELSE 'archive_data'
    END as retention_category,
    
    -- Archive recommendations
    CASE 
      WHEN DATE_TRUNC('day', timestamp) < CURRENT_DATE - INTERVAL '2 years' THEN 'candidate_for_deletion'
      WHEN DATE_TRUNC('day', timestamp) < CURRENT_DATE - INTERVAL '1 year' 
           AND AVG(quality_metrics->>'data_quality_score') < 70 THEN 'candidate_for_archive'
      ELSE 'keep_active'
    END as lifecycle_recommendation
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_DATE - INTERVAL '2 years'
  GROUP BY DATE_TRUNC('day', timestamp), device.facility
)

SELECT 
  retention_category,
  COUNT(*) as day_buckets,
  SUM(daily_record_count) as total_records,
  ROUND(AVG(avg_daily_quality), 1) as avg_quality_score,
  
  -- Storage estimates
  ROUND(SUM(estimated_bytes_per_day) / (1024 * 1024), 1) as estimated_mb,
  ROUND(SUM(estimated_bytes_per_day) / (1024 * 1024 * 1024), 2) as estimated_gb,
  
  -- Lifecycle recommendations
  SUM(CASE WHEN lifecycle_recommendation = 'candidate_for_deletion' THEN daily_record_count ELSE 0 END) as records_for_deletion,
  SUM(CASE WHEN lifecycle_recommendation = 'candidate_for_archive' THEN daily_record_count ELSE 0 END) as records_for_archive,
  SUM(CASE WHEN lifecycle_recommendation = 'keep_active' THEN daily_record_count ELSE 0 END) as records_to_keep,
  
  -- Storage optimization potential
  ROUND(
    SUM(CASE WHEN lifecycle_recommendation IN ('candidate_for_deletion', 'candidate_for_archive') 
             THEN estimated_bytes_per_day ELSE 0 END) / (1024 * 1024), 1
  ) as potential_storage_savings_mb
  
FROM data_lifecycle_analysis
GROUP BY retention_category
ORDER BY 
  CASE retention_category 
    WHEN 'hot_data' THEN 1 
    WHEN 'warm_data' THEN 2 
    WHEN 'cold_data' THEN 3 
    WHEN 'archive_data' THEN 4 
  END;

-- QueryLeaf provides comprehensive time series capabilities:
-- 1. High-performance data ingestion with automatic time series optimization
-- 2. Advanced analytics using familiar SQL window functions and aggregations
-- 3. Real-time alerting and threshold monitoring with SQL expressions
-- 4. Facility and device-level dashboards using complex analytical queries
-- 5. Trend analysis and anomaly detection through statistical SQL functions
-- 6. Data lifecycle management with retention and archiving recommendations
-- 7. Geospatial analytics for location-aware IoT deployments
-- 8. Integration with MongoDB's native time series compression and bucketing
```

## Best Practices for Production Time Series Deployments

### Performance Optimization Strategies

Essential optimization techniques for high-throughput time series workloads:

1. **Time Series Collection Configuration**: Choose optimal granularity and bucket settings based on data patterns
2. **Index Strategy**: Create compound indexes optimized for time-range and device queries  
3. **Data Retention**: Implement automated lifecycle policies for different data temperatures
4. **Aggregation Performance**: Design materialized views for frequently accessed analytics
5. **Real-Time Processing**: Optimize change streams and triggers for low-latency analytics
6. **Compression Settings**: Configure appropriate compression algorithms for time series data patterns

### IoT Architecture Design

Design principles for scalable IoT time series systems:

1. **Device Management**: Implement device registration, health monitoring, and metadata management
2. **Network Optimization**: Design efficient data transmission protocols for IoT constraints
3. **Edge Processing**: Implement edge analytics to reduce data transmission and latency
4. **Fault Tolerance**: Design robust error handling and offline data synchronization
5. **Security Implementation**: Implement device authentication, encryption, and access controls
6. **Scalability Planning**: Plan for horizontal scaling across geographic regions and device growth

## Conclusion

MongoDB Time Series Collections provide enterprise-grade IoT data management capabilities that address the unique challenges of sensor data ingestion, real-time analytics, and long-term historical analysis. The purpose-built time series optimizations eliminate the complexity and performance limitations of traditional database approaches while delivering sophisticated analytics and monitoring capabilities at IoT scale.

Key MongoDB Time Series advantages include:

- **Optimized Storage**: Automatic bucketing and compression specifically designed for time-stamped data
- **High-Velocity Ingestion**: Purpose-built write optimization for high-frequency sensor data streams
- **Advanced Analytics**: Sophisticated aggregation pipelines for real-time and historical analytics
- **Automatic Lifecycle Management**: Built-in data retention and archiving capabilities
- **Scalable Architecture**: Horizontal scaling optimized for time series query patterns
- **SQL Accessibility**: Familiar time series operations through QueryLeaf's SQL interface

Whether you're building IoT monitoring systems, industrial sensor networks, environmental tracking applications, or real-time analytics platforms, MongoDB Time Series Collections with QueryLeaf's SQL interface provide the foundation for efficient, scalable, and maintainable time series data management that can adapt to evolving IoT requirements while maintaining familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes SQL-style time series operations for MongoDB's specialized time series collections, enabling developers to leverage advanced IoT analytics through familiar SQL syntax. Complex sensor data aggregations, real-time alerting logic, and trend analysis queries are seamlessly translated into MongoDB's high-performance time series operations, making sophisticated IoT analytics accessible without requiring specialized time series expertise.

The combination of MongoDB's time series optimizations with SQL-familiar operations creates an ideal platform for IoT applications requiring both high-performance data processing and familiar database interaction patterns, ensuring your IoT systems can scale efficiently while maintaining data accessibility and analytical capabilities.