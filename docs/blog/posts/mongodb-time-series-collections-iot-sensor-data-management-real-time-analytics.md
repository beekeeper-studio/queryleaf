---
title: "MongoDB Time Series Collections for IoT Sensor Data Management: Real-Time Analytics and High-Performance Time-Based Data Processing"
description: "Master MongoDB Time Series Collections for IoT sensor data, real-time analytics, and high-performance temporal data management. Learn time-series optimization, retention policies, and SQL-familiar time-based query patterns for scalable IoT applications."
date: 2025-11-23
tags: [mongodb, time-series, iot, sensor-data, real-time-analytics, temporal-data, sql]
---

# MongoDB Time Series Collections for IoT Sensor Data Management: Real-Time Analytics and High-Performance Time-Based Data Processing

Modern IoT applications generate massive volumes of time-stamped sensor data that require specialized storage and processing strategies to handle high ingestion rates, efficient time-based queries, and real-time analytics workloads. Traditional relational databases struggle with time series data due to their row-oriented storage models, lack of built-in time-based optimizations, and inefficient handling of high-frequency data ingestion patterns common in IoT environments.

MongoDB Time Series Collections provide native support for time-stamped data with automatic data organization, compression optimizations, and specialized indexing strategies designed specifically for temporal workloads. Unlike traditional approaches that require custom partitioning schemes and complex query optimization, MongoDB's time series collections automatically optimize storage layout, query performance, and data retention policies while maintaining familiar query interfaces and operational simplicity.

## The Traditional Time Series Data Challenge

Relational databases face significant limitations when handling high-volume time series data:

```sql
-- Traditional PostgreSQL time series data management - complex partitioning and limited optimization

-- IoT sensor readings table with manual partitioning strategy
CREATE TABLE sensor_readings (
    reading_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Sensor measurement values
    temperature DECIMAL(5,2),
    humidity DECIMAL(5,2),
    pressure DECIMAL(7,2),
    battery_level DECIMAL(5,2),
    signal_strength INTEGER,
    
    -- Location data
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    altitude DECIMAL(8,2),
    
    -- Device status information
    device_status VARCHAR(20) DEFAULT 'active',
    firmware_version VARCHAR(20),
    last_calibration TIMESTAMP WITH TIME ZONE,
    
    -- Data quality indicators
    data_quality_score DECIMAL(3,2) DEFAULT 1.0,
    anomaly_detected BOOLEAN DEFAULT false,
    validation_flags JSONB,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processing_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT chk_timestamp_valid CHECK (timestamp <= CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    CONSTRAINT chk_temperature_range CHECK (temperature BETWEEN -50 AND 125),
    CONSTRAINT chk_humidity_range CHECK (humidity BETWEEN 0 AND 100),
    CONSTRAINT chk_battery_level CHECK (battery_level BETWEEN 0 AND 100)
) PARTITION BY RANGE (timestamp);

-- Device metadata table
CREATE TABLE devices (
    device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_name VARCHAR(200) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    firmware_version VARCHAR(20),
    
    -- Installation details
    installation_location VARCHAR(200),
    installation_date DATE,
    installation_coordinates POINT,
    
    -- Configuration
    sampling_interval_seconds INTEGER DEFAULT 60,
    reporting_interval_seconds INTEGER DEFAULT 300,
    sensor_configuration JSONB,
    
    -- Status tracking
    device_status VARCHAR(20) DEFAULT 'active',
    last_seen TIMESTAMP WITH TIME ZONE,
    last_maintenance TIMESTAMP WITH TIME ZONE,
    next_maintenance_due DATE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Manual monthly partitioning (requires maintenance)
CREATE TABLE sensor_readings_2025_01 PARTITION OF sensor_readings
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE sensor_readings_2025_02 PARTITION OF sensor_readings
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE sensor_readings_2025_03 PARTITION OF sensor_readings
FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Need to create partitions for every month manually or with automation
-- This becomes a maintenance burden and source of potential failures

-- Indexing strategy for time series queries (limited effectiveness)
CREATE INDEX idx_sensor_readings_timestamp ON sensor_readings (timestamp DESC);
CREATE INDEX idx_sensor_readings_device_time ON sensor_readings (device_id, timestamp DESC);
CREATE INDEX idx_sensor_readings_sensor_type_time ON sensor_readings (sensor_type, timestamp DESC);
CREATE INDEX idx_sensor_readings_location ON sensor_readings USING GIST (ST_MakePoint(longitude, latitude));

-- Complex aggregation query for sensor analytics
WITH hourly_sensor_averages AS (
  SELECT 
    device_id,
    sensor_type,
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    
    -- Aggregated measurements
    COUNT(*) as reading_count,
    AVG(temperature) as avg_temperature,
    AVG(humidity) as avg_humidity,
    AVG(pressure) as avg_pressure,
    AVG(battery_level) as avg_battery_level,
    AVG(signal_strength) as avg_signal_strength,
    
    -- Statistical measures
    STDDEV(temperature) as temp_stddev,
    MIN(temperature) as min_temperature,
    MAX(temperature) as max_temperature,
    
    -- Data quality metrics
    AVG(data_quality_score) as avg_data_quality,
    COUNT(*) FILTER (WHERE anomaly_detected = true) as anomaly_count,
    
    -- Time-based calculations
    MIN(timestamp) as period_start,
    MAX(timestamp) as period_end,
    MAX(timestamp) - MIN(timestamp) as actual_duration
    
  FROM sensor_readings sr
  WHERE sr.timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND sr.device_status = 'active'
    AND sr.data_quality_score >= 0.8
  GROUP BY device_id, sensor_type, DATE_TRUNC('hour', timestamp)
),

device_performance_analysis AS (
  SELECT 
    hsa.*,
    d.device_name,
    d.device_type,
    d.installation_location,
    d.sampling_interval_seconds,
    
    -- Performance calculations
    CASE 
      WHEN hsa.reading_count < (3600 / d.sampling_interval_seconds) * 0.8 THEN 'under_reporting'
      WHEN hsa.reading_count > (3600 / d.sampling_interval_seconds) * 1.2 THEN 'over_reporting'
      ELSE 'normal'
    END as reporting_status,
    
    -- Battery analysis
    CASE 
      WHEN hsa.avg_battery_level < 20 THEN 'critical'
      WHEN hsa.avg_battery_level < 40 THEN 'low'
      WHEN hsa.avg_battery_level < 60 THEN 'medium'
      ELSE 'good'
    END as battery_status,
    
    -- Signal strength analysis
    CASE 
      WHEN hsa.avg_signal_strength < -80 THEN 'poor'
      WHEN hsa.avg_signal_strength < -60 THEN 'fair'
      WHEN hsa.avg_signal_strength < -40 THEN 'good'
      ELSE 'excellent'
    END as signal_status,
    
    -- Calculate trends using window functions (expensive)
    LAG(hsa.avg_temperature) OVER (
      PARTITION BY hsa.device_id, hsa.sensor_type 
      ORDER BY hsa.hour_bucket
    ) as prev_hour_temperature,
    
    -- Rolling averages (very expensive across partitions)
    AVG(hsa.avg_temperature) OVER (
      PARTITION BY hsa.device_id, hsa.sensor_type 
      ORDER BY hsa.hour_bucket 
      ROWS 23 PRECEDING
    ) as rolling_24h_avg_temperature
    
  FROM hourly_sensor_averages hsa
  JOIN devices d ON hsa.device_id = d.device_id
),

environmental_conditions AS (
  -- Complex environmental analysis requiring expensive calculations
  SELECT 
    dpa.hour_bucket,
    dpa.installation_location,
    
    -- Location-based aggregations
    AVG(dpa.avg_temperature) as location_avg_temperature,
    AVG(dpa.avg_humidity) as location_avg_humidity,
    AVG(dpa.avg_pressure) as location_avg_pressure,
    
    -- Device count and health by location
    COUNT(*) as active_devices,
    COUNT(*) FILTER (WHERE dpa.battery_status = 'critical') as critical_battery_devices,
    COUNT(*) FILTER (WHERE dpa.signal_status = 'poor') as poor_signal_devices,
    COUNT(*) FILTER (WHERE dpa.anomaly_count > 0) as devices_with_anomalies,
    
    -- Environmental variance analysis
    STDDEV(dpa.avg_temperature) as temperature_variance,
    STDDEV(dpa.avg_humidity) as humidity_variance,
    
    -- Extreme conditions detection
    BOOL_OR(dpa.avg_temperature > 40 OR dpa.avg_temperature < -10) as extreme_temperature_detected,
    BOOL_OR(dpa.avg_humidity > 90 OR dpa.avg_humidity < 10) as extreme_humidity_detected,
    
    -- Data quality aggregation
    AVG(dpa.avg_data_quality) as location_data_quality,
    SUM(dpa.anomaly_count) as total_location_anomalies
    
  FROM device_performance_analysis dpa
  GROUP BY dpa.hour_bucket, dpa.installation_location
)

SELECT 
  ec.hour_bucket,
  ec.installation_location,
  ec.active_devices,
  
  -- Environmental metrics
  ROUND(ec.location_avg_temperature::NUMERIC, 2) as avg_temperature,
  ROUND(ec.location_avg_humidity::NUMERIC, 2) as avg_humidity,
  ROUND(ec.location_avg_pressure::NUMERIC, 2) as avg_pressure,
  
  -- Device health summary
  ec.critical_battery_devices,
  ec.poor_signal_devices,
  ec.devices_with_anomalies,
  
  -- Environmental conditions
  CASE 
    WHEN ec.extreme_temperature_detected OR ec.extreme_humidity_detected THEN 'extreme'
    WHEN ec.temperature_variance > 5 OR ec.humidity_variance > 15 THEN 'variable'
    ELSE 'stable'
  END as environmental_stability,
  
  -- Data quality indicators
  ROUND(ec.location_data_quality::NUMERIC, 3) as data_quality_score,
  ec.total_location_anomalies,
  
  -- Health scoring
  (
    100 - 
    (ec.critical_battery_devices * 20) - 
    (ec.poor_signal_devices * 10) - 
    (ec.devices_with_anomalies * 5) -
    CASE WHEN ec.location_data_quality < 0.9 THEN 15 ELSE 0 END
  ) as location_health_score,
  
  -- Operational recommendations
  CASE 
    WHEN ec.critical_battery_devices > 0 THEN 'URGENT: Replace batteries on ' || ec.critical_battery_devices || ' devices'
    WHEN ec.poor_signal_devices > ec.active_devices * 0.3 THEN 'Consider signal boosters for location'
    WHEN ec.total_location_anomalies > 10 THEN 'Investigate environmental factors causing anomalies'
    WHEN ec.location_data_quality < 0.8 THEN 'Review device calibration and maintenance schedules'
    ELSE 'Location operating within normal parameters'
  END as operational_recommendation

FROM environmental_conditions ec
ORDER BY ec.hour_bucket DESC, ec.location_health_score ASC;

-- Performance problems with traditional time series approaches:
-- 1. Manual partition management creates operational overhead and failure points
-- 2. Complex query plans across multiple partitions reduce performance
-- 3. Limited compression and storage optimization for time-stamped data
-- 4. No native support for time-based retention policies and archiving
-- 5. Expensive aggregation operations across large time ranges
-- 6. Poor performance for recent data queries due to partition pruning limitations
-- 7. Complex indexing strategies required for different time-based access patterns
-- 8. Difficult to optimize for both high-throughput writes and analytical reads
-- 9. No built-in support for downsampling and data compaction strategies
-- 10. Limited ability to handle irregular time intervals and sparse data efficiently

-- Attempt at data retention management (complex and error-prone)
CREATE OR REPLACE FUNCTION manage_sensor_data_retention()
RETURNS void AS $$
DECLARE
    partition_name text;
    retention_date timestamp;
BEGIN
    -- Calculate retention boundary (keep 1 year of data)
    retention_date := CURRENT_TIMESTAMP - INTERVAL '1 year';
    
    -- Find partitions older than retention period
    FOR partition_name IN
        SELECT schemaname||'.'||tablename
        FROM pg_tables 
        WHERE tablename LIKE 'sensor_readings_%'
        AND schemaname = 'public'
    LOOP
        -- Extract date from partition name (fragile parsing)
        IF partition_name ~ 'sensor_readings_[0-9]{4}_[0-9]{2}$' THEN
            -- This logic is complex and error-prone
            -- Need to parse partition name, validate dates, check data
            -- Then carefully drop partitions without losing data
            RAISE NOTICE 'Would evaluate partition % for retention', partition_name;
        END IF;
    END LOOP;
    
    -- Complex logic needed to:
    -- 1. Verify partition contains only old data
    -- 2. Archive data if needed before deletion  
    -- 3. Update constraints and metadata
    -- 4. Handle dependencies and foreign keys
    -- 5. Clean up indexes and statistics
    
EXCEPTION
    WHEN OTHERS THEN
        -- Error handling for partition management failures
        RAISE EXCEPTION 'Retention management failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Expensive real-time alerting query
WITH real_time_sensor_status AS (
  SELECT DISTINCT ON (device_id, sensor_type)
    device_id,
    sensor_type,
    timestamp,
    temperature,
    humidity,
    battery_level,
    signal_strength,
    anomaly_detected,
    data_quality_score
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
  ORDER BY device_id, sensor_type, timestamp DESC
),

alert_conditions AS (
  SELECT 
    rtss.*,
    d.device_name,
    d.installation_location,
    
    -- Define alert conditions
    CASE 
      WHEN rtss.temperature > 50 OR rtss.temperature < -20 THEN 'temperature_extreme'
      WHEN rtss.humidity > 95 OR rtss.humidity < 5 THEN 'humidity_extreme'
      WHEN rtss.battery_level < 15 THEN 'battery_critical'
      WHEN rtss.signal_strength < -85 THEN 'signal_poor'
      WHEN rtss.anomaly_detected = true THEN 'anomaly_detected'
      WHEN rtss.data_quality_score < 0.7 THEN 'data_quality_poor'
      WHEN rtss.timestamp < CURRENT_TIMESTAMP - INTERVAL '10 minutes' THEN 'device_offline'
      ELSE null
    END as alert_type,
    
    -- Alert severity
    CASE 
      WHEN rtss.battery_level < 10 OR rtss.timestamp < CURRENT_TIMESTAMP - INTERVAL '20 minutes' THEN 'critical'
      WHEN rtss.temperature > 45 OR rtss.temperature < -15 OR rtss.anomaly_detected THEN 'high'
      WHEN rtss.battery_level < 20 OR rtss.signal_strength < -80 THEN 'medium'
      ELSE 'low'
    END as alert_severity
    
  FROM real_time_sensor_status rtss
  JOIN devices d ON rtss.device_id = d.device_id
  WHERE d.device_status = 'active'
)

SELECT 
  device_id,
  device_name,
  installation_location,
  sensor_type,
  alert_type,
  alert_severity,
  temperature,
  humidity,
  battery_level,
  signal_strength,
  timestamp,
  
  -- Alert message generation
  CASE alert_type
    WHEN 'temperature_extreme' THEN FORMAT('Temperature %s°C is outside safe range', temperature)
    WHEN 'humidity_extreme' THEN FORMAT('Humidity %s%% is at extreme level', humidity)
    WHEN 'battery_critical' THEN FORMAT('Battery level %s%% requires immediate attention', battery_level)
    WHEN 'signal_poor' THEN FORMAT('Signal strength %s dBm indicates connectivity issues', signal_strength)
    WHEN 'anomaly_detected' THEN 'Sensor readings show anomalous patterns'
    WHEN 'data_quality_poor' THEN FORMAT('Data quality score %s indicates sensor issues', data_quality_score)
    WHEN 'device_offline' THEN FORMAT('Device has not reported for %s minutes', EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp))/60)
    ELSE 'Unknown alert condition'
  END as alert_message,
  
  -- Recommended actions
  CASE alert_type
    WHEN 'temperature_extreme' THEN 'Check environmental conditions and sensor calibration'
    WHEN 'humidity_extreme' THEN 'Verify sensor operation and environmental factors'
    WHEN 'battery_critical' THEN 'Schedule immediate battery replacement'
    WHEN 'signal_poor' THEN 'Check device antenna and network infrastructure'
    WHEN 'anomaly_detected' THEN 'Investigate sensor readings and potential interference'
    WHEN 'data_quality_poor' THEN 'Perform sensor calibration and diagnostic checks'
    WHEN 'device_offline' THEN 'Check device power and network connectivity'
    ELSE 'Monitor device status'
  END as recommended_action

FROM alert_conditions
WHERE alert_type IS NOT NULL
ORDER BY 
  CASE alert_severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  timestamp DESC;

-- Traditional limitations for IoT time series data:
-- 1. Manual partition management and maintenance complexity
-- 2. Poor compression ratios for repetitive time series data patterns
-- 3. Expensive aggregation queries across large time ranges
-- 4. Limited real-time query performance for recent data analysis
-- 5. Complex retention policy implementation and data archiving
-- 6. No native support for irregular time intervals and sparse sensor data
-- 7. Difficult optimization for mixed analytical and operational workloads
-- 8. Limited scalability for high-frequency data ingestion (>1000 inserts/sec)
-- 9. Complex alerting and real-time monitoring query patterns
-- 10. Poor storage efficiency for IoT metadata and device information duplication
```

MongoDB Time Series Collections provide comprehensive optimization for temporal data workloads:

```javascript
// MongoDB Time Series Collections - optimized for IoT sensor data and real-time analytics
const { MongoClient, ObjectId } = require('mongodb');

// Advanced IoT Time Series Data Manager
class IoTTimeSeriesDataManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.collections = new Map();
    this.performanceMetrics = new Map();
    this.alertingRules = new Map();
    this.retentionPolicies = new Map();
  }

  async initialize() {
    console.log('Initializing IoT Time Series Data Manager...');
    
    // Connect with optimized settings for time series workloads
    this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017', {
      // Optimized for high-throughput time series writes
      maxPoolSize: 50,
      minPoolSize: 10,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      
      // Write settings for time series data
      writeConcern: { 
        w: 1, 
        j: false, // Disable journaling for better write performance
        wtimeout: 5000
      },
      
      // Read preferences for time series queries
      readPreference: 'primaryPreferred',
      readConcern: { level: 'local' },
      
      // Compression for large time series datasets
      compressors: ['zstd', 'zlib'],
      
      appName: 'IoTTimeSeriesManager'
    });

    await this.client.connect();
    this.db = this.client.db('iot_platform');
    
    // Initialize time series collections with optimized configurations
    await this.setupTimeSeriesCollections();
    
    // Setup data retention policies
    await this.setupRetentionPolicies();
    
    // Initialize real-time alerting system
    await this.setupRealTimeAlerting();
    
    console.log('✅ IoT Time Series Data Manager initialized');
  }

  async setupTimeSeriesCollections() {
    console.log('Setting up optimized time series collections...');
    
    try {
      // Primary sensor readings time series collection
      const sensorReadingsTS = await this.db.createCollection('sensor_readings', {
        timeseries: {
          timeField: 'timestamp',           // Field containing the timestamp
          metaField: 'device',             // Field containing device metadata
          granularity: 'minutes',          // Optimized for minute-level granularity
          bucketMaxSpanSeconds: 3600       // 1-hour buckets for optimal compression
        },
        
        // Storage optimization
        storageEngine: {
          wiredTiger: {
            configString: 'block_compressor=zstd'  // Use zstd compression
          }
        }
      });

      // Device status and health time series
      const deviceHealthTS = await this.db.createCollection('device_health', {
        timeseries: {
          timeField: 'timestamp',
          metaField: 'device_info',
          granularity: 'hours',            // Less frequent health updates
          bucketMaxSpanSeconds: 86400      // 24-hour buckets
        }
      });

      // Environmental conditions aggregated data
      const environmentalTS = await this.db.createCollection('environmental_conditions', {
        timeseries: {
          timeField: 'timestamp',
          metaField: 'location',
          granularity: 'hours',
          bucketMaxSpanSeconds: 86400
        }
      });

      // Alert events time series
      const alertsTS = await this.db.createCollection('alert_events', {
        timeseries: {
          timeField: 'timestamp',
          metaField: 'alert_context',
          granularity: 'seconds',          // Fine-grained for alert analysis
          bucketMaxSpanSeconds: 3600
        }
      });

      // Store collection references
      this.collections.set('sensor_readings', this.db.collection('sensor_readings'));
      this.collections.set('device_health', this.db.collection('device_health'));
      this.collections.set('environmental_conditions', this.db.collection('environmental_conditions'));
      this.collections.set('alert_events', this.db.collection('alert_events'));

      // Create supporting collections for device metadata
      await this.setupDeviceCollections();

      // Create optimized indexes for time series queries
      await this.createTimeSeriesIndexes();

      console.log('✅ Time series collections configured with optimal settings');

    } catch (error) {
      console.error('Error setting up time series collections:', error);
      throw error;
    }
  }

  async setupDeviceCollections() {
    console.log('Setting up device metadata collections...');
    
    // Device registry collection (regular collection)
    const devicesCollection = this.db.collection('devices');
    await devicesCollection.createIndex({ device_id: 1 }, { unique: true });
    await devicesCollection.createIndex({ installation_location: 1 });
    await devicesCollection.createIndex({ device_type: 1 });
    await devicesCollection.createIndex({ "location_coordinates": "2dsphere" });
    
    // Location registry for environmental analytics
    const locationsCollection = this.db.collection('locations');
    await locationsCollection.createIndex({ location_id: 1 }, { unique: true });
    await locationsCollection.createIndex({ "coordinates": "2dsphere" });
    
    this.collections.set('devices', devicesCollection);
    this.collections.set('locations', locationsCollection);
    
    console.log('✅ Device metadata collections configured');
  }

  async createTimeSeriesIndexes() {
    console.log('Creating optimized time series indexes...');
    
    const sensorReadings = this.collections.get('sensor_readings');
    
    // Compound indexes optimized for common query patterns
    await sensorReadings.createIndex({ 
      'device.device_id': 1, 
      'timestamp': -1 
    }, { 
      name: 'device_timestamp_desc',
      background: true 
    });

    await sensorReadings.createIndex({ 
      'device.sensor_type': 1, 
      'timestamp': -1 
    }, { 
      name: 'sensor_type_timestamp_desc',
      background: true 
    });

    await sensorReadings.createIndex({ 
      'device.installation_location': 1, 
      'timestamp': -1 
    }, { 
      name: 'location_timestamp_desc',
      background: true 
    });

    // Partial indexes for alerting queries
    await sensorReadings.createIndex(
      { 'timestamp': -1 },
      { 
        name: 'recent_readings_partial',
        partialFilterExpression: { 
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        background: true
      }
    );

    console.log('✅ Time series indexes created');
  }

  async ingestSensorData(sensorDataBatch) {
    console.log(`Ingesting batch of ${sensorDataBatch.length} sensor readings...`);
    
    const startTime = Date.now();
    
    try {
      // Transform data for time series optimized format
      const timeSeriesDocuments = sensorDataBatch.map(reading => ({
        timestamp: new Date(reading.timestamp),
        
        // Device metadata (metaField for automatic bucketing)
        device: {
          device_id: reading.device_id,
          sensor_type: reading.sensor_type,
          installation_location: reading.installation_location,
          device_model: reading.device_model
        },
        
        // Measurement values (optimized for compression)
        measurements: {
          temperature: reading.temperature,
          humidity: reading.humidity,
          pressure: reading.pressure,
          battery_level: reading.battery_level,
          signal_strength: reading.signal_strength
        },
        
        // Location data (when available)
        ...(reading.latitude && reading.longitude && {
          location: {
            coordinates: [reading.longitude, reading.latitude],
            altitude: reading.altitude
          }
        }),
        
        // Data quality and status
        quality: {
          data_quality_score: reading.data_quality_score || 1.0,
          anomaly_detected: reading.anomaly_detected || false,
          validation_flags: reading.validation_flags || {}
        },
        
        // Processing metadata
        ingestion_time: new Date(),
        processing_version: '1.0'
      }));

      // Bulk insert with optimal batch size for time series
      const insertResult = await this.collections.get('sensor_readings').insertMany(
        timeSeriesDocuments,
        { 
          ordered: false,  // Allow parallel inserts
          writeConcern: { w: 1, j: false }  // Optimize for throughput
        }
      );

      // Update device health tracking
      await this.updateDeviceHealthTracking(sensorDataBatch);

      // Process real-time alerts
      await this.processRealTimeAlerts(timeSeriesDocuments);

      // Update performance metrics
      const ingestionTime = Date.now() - startTime;
      await this.trackIngestionMetrics({
        batchSize: sensorDataBatch.length,
        ingestionTimeMs: ingestionTime,
        documentsInserted: insertResult.insertedCount,
        timestamp: new Date()
      });

      console.log(`✅ Ingested ${insertResult.insertedCount} sensor readings in ${ingestionTime}ms`);
      
      return {
        success: true,
        documentsInserted: insertResult.insertedCount,
        ingestionTimeMs: ingestionTime,
        throughput: (insertResult.insertedCount / ingestionTime * 1000).toFixed(2) + ' docs/sec'
      };

    } catch (error) {
      console.error('Error ingesting sensor data:', error);
      return { success: false, error: error.message };
    }
  }

  async queryRecentSensorData(deviceId, timeRangeMinutes = 60) {
    console.log(`Querying recent sensor data for device ${deviceId} over ${timeRangeMinutes} minutes...`);
    
    const startTime = Date.now();
    const queryStartTime = new Date(Date.now() - timeRangeMinutes * 60 * 1000);
    
    try {
      const pipeline = [
        {
          $match: {
            'device.device_id': deviceId,
            timestamp: { $gte: queryStartTime }
          }
        },
        {
          $sort: { timestamp: -1 }
        },
        {
          $limit: 1000  // Reasonable limit for recent data
        },
        {
          $project: {
            timestamp: 1,
            'device.sensor_type': 1,
            'device.installation_location': 1,
            measurements: 1,
            location: 1,
            'quality.data_quality_score': 1,
            'quality.anomaly_detected': 1
          }
        }
      ];

      const results = await this.collections.get('sensor_readings')
        .aggregate(pipeline, { allowDiskUse: false })
        .toArray();

      const queryTime = Date.now() - startTime;
      
      console.log(`✅ Retrieved ${results.length} readings in ${queryTime}ms`);
      
      return {
        deviceId: deviceId,
        timeRangeMinutes: timeRangeMinutes,
        readingCount: results.length,
        queryTimeMs: queryTime,
        data: results,
        
        // Data summary
        summary: {
          latestReading: results[0]?.timestamp,
          oldestReading: results[results.length - 1]?.timestamp,
          sensorTypes: [...new Set(results.map(r => r.device.sensor_type))],
          averageDataQuality: results.reduce((sum, r) => sum + (r.quality.data_quality_score || 1), 0) / results.length,
          anomaliesDetected: results.filter(r => r.quality.anomaly_detected).length
        }
      };

    } catch (error) {
      console.error('Error querying recent sensor data:', error);
      return { success: false, error: error.message };
    }
  }

  async performTimeSeriesAggregation(aggregationOptions) {
    console.log('Performing optimized time series aggregation...');
    
    const {
      timeRange = { hours: 24 },
      granularity = 'hour',
      metrics = ['temperature', 'humidity', 'pressure'],
      groupBy = ['device.installation_location'],
      filters = {}
    } = aggregationOptions;

    const startTime = Date.now();
    
    try {
      // Calculate time range
      const timeRangeMs = (timeRange.days || 0) * 24 * 60 * 60 * 1000 +
                          (timeRange.hours || 0) * 60 * 60 * 1000 +
                          (timeRange.minutes || 0) * 60 * 1000;
      const queryStartTime = new Date(Date.now() - timeRangeMs);

      // Build granularity for $dateTrunc
      const granularityMap = {
        'minute': 'minute',
        'hour': 'hour', 
        'day': 'day',
        'week': 'week'
      };

      const pipeline = [
        // Match stage with time range and filters
        {
          $match: {
            timestamp: { $gte: queryStartTime },
            ...filters
          }
        },
        
        // Add time bucket field
        {
          $addFields: {
            timeBucket: {
              $dateTrunc: {
                date: '$timestamp',
                unit: granularityMap[granularity] || 'hour'
              }
            }
          }
        },
        
        // Group by time bucket and specified dimensions
        {
          $group: {
            _id: {
              timeBucket: '$timeBucket',
              ...Object.fromEntries(groupBy.map(field => [field.replace('.', '_'), `$${field}`]))
            },
            
            // Count and time range
            readingCount: { $sum: 1 },
            periodStart: { $min: '$timestamp' },
            periodEnd: { $max: '$timestamp' },
            
            // Dynamic metric aggregations
            ...Object.fromEntries(metrics.flatMap(metric => [
              [`avg_${metric}`, { $avg: `$measurements.${metric}` }],
              [`min_${metric}`, { $min: `$measurements.${metric}` }],
              [`max_${metric}`, { $max: `$measurements.${metric}` }],
              [`stdDev_${metric}`, { $stdDevPop: `$measurements.${metric}` }]
            ])),
            
            // Data quality metrics
            avgDataQuality: { $avg: '$quality.data_quality_score' },
            anomalyCount: {
              $sum: { $cond: [{ $eq: ['$quality.anomaly_detected', true] }, 1, 0] }
            },
            
            // Device diversity
            uniqueDevices: { $addToSet: '$device.device_id' },
            sensorTypes: { $addToSet: '$device.sensor_type' }
          }
        },
        
        // Calculate derived metrics
        {
          $addFields: {
            // Device count
            deviceCount: { $size: '$uniqueDevices' },
            sensorTypeCount: { $size: '$sensorTypes' },
            
            // Data coverage and reliability
            dataCoveragePercent: {
              $multiply: [
                { $divide: ['$readingCount', { $multiply: ['$deviceCount', 60] }] }, // Assuming 1-minute intervals
                100
              ]
            },
            
            // Anomaly rate
            anomalyRate: {
              $cond: [
                { $gt: ['$readingCount', 0] },
                { $divide: ['$anomalyCount', '$readingCount'] },
                0
              ]
            }
          }
        },
        
        // Sort by time bucket
        {
          $sort: { '_id.timeBucket': 1 }
        },
        
        // Project final structure
        {
          $project: {
            timeBucket: '$_id.timeBucket',
            grouping: {
              $objectToArray: {
                $arrayToObject: {
                  $filter: {
                    input: { $objectToArray: '$_id' },
                    cond: { $ne: ['$$this.k', 'timeBucket'] }
                  }
                }
              }
            },
            
            // Measurements
            measurements: Object.fromEntries(metrics.map(metric => [
              metric,
              {
                avg: { $round: [`$avg_${metric}`, 2] },
                min: { $round: [`$min_${metric}`, 2] },
                max: { $round: [`$max_${metric}`, 2] },
                stdDev: { $round: [`$stdDev_${metric}`, 3] }
              }
            ])),
            
            // Metadata
            metadata: {
              readingCount: '$readingCount',
              deviceCount: '$deviceCount',
              sensorTypeCount: '$sensorTypeCount',
              periodStart: '$periodStart',
              periodEnd: '$periodEnd',
              dataCoveragePercent: { $round: ['$dataCoveragePercent', 1] },
              avgDataQuality: { $round: ['$avgDataQuality', 3] },
              anomalyCount: '$anomalyCount',
              anomalyRate: { $round: ['$anomalyRate', 4] }
            }
          }
        }
      ];

      // Execute aggregation with optimization hints
      const results = await this.collections.get('sensor_readings').aggregate(pipeline, {
        allowDiskUse: false,  // Use memory for better performance
        maxTimeMS: 30000,     // 30-second timeout
        hint: 'location_timestamp_desc'  // Use optimized index
      }).toArray();

      const aggregationTime = Date.now() - startTime;

      console.log(`✅ Completed time series aggregation: ${results.length} buckets in ${aggregationTime}ms`);
      
      return {
        success: true,
        aggregationTimeMs: aggregationTime,
        bucketCount: results.length,
        timeRange: timeRange,
        granularity: granularity,
        data: results,
        
        // Performance metrics
        performance: {
          documentsScanned: results.reduce((sum, bucket) => sum + bucket.metadata.readingCount, 0),
          averageBucketProcessingTime: aggregationTime / results.length,
          throughput: (results.length / aggregationTime * 1000).toFixed(2) + ' buckets/sec'
        }
      };

    } catch (error) {
      console.error('Error performing time series aggregation:', error);
      return { success: false, error: error.message };
    }
  }

  async setupRetentionPolicies() {
    console.log('Setting up automated data retention policies...');
    
    const retentionConfigs = {
      sensor_readings: {
        rawDataRetentionDays: 90,      // Keep raw data for 90 days
        aggregatedDataRetentionDays: 365, // Keep aggregated data for 1 year
        archiveAfterDays: 30,          // Archive data older than 30 days
        compressionLevel: 'high'
      },
      
      device_health: {
        rawDataRetentionDays: 180,     // Keep device health for 6 months
        aggregatedDataRetentionDays: 730, // Keep aggregated health data for 2 years
        archiveAfterDays: 60
      },
      
      alert_events: {
        rawDataRetentionDays: 365,     // Keep alerts for 1 year
        archiveAfterDays: 90
      }
    };

    // Store retention policies
    for (const [collection, config] of Object.entries(retentionConfigs)) {
      this.retentionPolicies.set(collection, config);
      
      // Create TTL indexes for automatic deletion
      await this.collections.get(collection).createIndex(
        { timestamp: 1 },
        { 
          expireAfterSeconds: config.rawDataRetentionDays * 24 * 60 * 60,
          name: `ttl_${collection}`,
          background: true
        }
      );
    }

    console.log('✅ Retention policies configured');
  }

  async processRealTimeAlerts(sensorDocuments) {
    const alertingRules = [
      {
        name: 'temperature_extreme',
        condition: (doc) => doc.measurements.temperature > 50 || doc.measurements.temperature < -20,
        severity: 'critical',
        message: (doc) => `Extreme temperature ${doc.measurements.temperature}°C detected at ${doc.device.installation_location}`
      },
      {
        name: 'battery_critical',
        condition: (doc) => doc.measurements.battery_level < 15,
        severity: 'high',
        message: (doc) => `Critical battery level ${doc.measurements.battery_level}% on device ${doc.device.device_id}`
      },
      {
        name: 'anomaly_detected',
        condition: (doc) => doc.quality.anomaly_detected === true,
        severity: 'medium',
        message: (doc) => `Anomalous readings detected from device ${doc.device.device_id}`
      },
      {
        name: 'data_quality_poor',
        condition: (doc) => doc.quality.data_quality_score < 0.7,
        severity: 'medium',
        message: (doc) => `Poor data quality (${doc.quality.data_quality_score}) from device ${doc.device.device_id}`
      }
    ];

    const alerts = [];
    const currentTime = new Date();

    for (const document of sensorDocuments) {
      for (const rule of alertingRules) {
        if (rule.condition(document)) {
          alerts.push({
            timestamp: currentTime,
            alert_context: {
              rule_name: rule.name,
              device_id: document.device.device_id,
              location: document.device.installation_location,
              sensor_type: document.device.sensor_type
            },
            severity: rule.severity,
            message: rule.message(document),
            source_data: {
              measurements: document.measurements,
              quality: document.quality,
              reading_timestamp: document.timestamp
            },
            status: 'active',
            acknowledgment: null,
            created_at: currentTime
          });
        }
      }
    }

    // Insert alerts into time series collection
    if (alerts.length > 0) {
      await this.collections.get('alert_events').insertMany(alerts, {
        ordered: false,
        writeConcern: { w: 1, j: false }
      });

      console.log(`🚨 Generated ${alerts.length} real-time alerts`);
    }

    return alerts;
  }

  async updateDeviceHealthTracking(sensorDataBatch) {
    // Aggregate device health metrics from sensor readings
    const deviceHealthUpdates = {};
    
    for (const reading of sensorDataBatch) {
      if (!deviceHealthUpdates[reading.device_id]) {
        deviceHealthUpdates[reading.device_id] = {
          readings: [],
          location: reading.installation_location,
          deviceModel: reading.device_model
        };
      }
      deviceHealthUpdates[reading.device_id].readings.push(reading);
    }

    const healthDocuments = Object.entries(deviceHealthUpdates).map(([deviceId, data]) => {
      const readings = data.readings;
      const avgBattery = readings.reduce((sum, r) => sum + (r.battery_level || 0), 0) / readings.length;
      const avgSignal = readings.reduce((sum, r) => sum + (r.signal_strength || -50), 0) / readings.length;
      const avgDataQuality = readings.reduce((sum, r) => sum + (r.data_quality_score || 1), 0) / readings.length;
      
      return {
        timestamp: new Date(),
        device_info: {
          device_id: deviceId,
          installation_location: data.location,
          device_model: data.deviceModel
        },
        health_metrics: {
          battery_level: avgBattery,
          signal_strength: avgSignal,
          data_quality_score: avgDataQuality,
          reading_frequency: readings.length,
          last_reading_time: new Date(Math.max(...readings.map(r => new Date(r.timestamp))))
        },
        health_status: {
          battery_status: avgBattery > 40 ? 'good' : avgBattery > 20 ? 'warning' : 'critical',
          connectivity_status: avgSignal > -60 ? 'excellent' : avgSignal > -80 ? 'good' : 'poor',
          overall_health: avgBattery > 20 && avgSignal > -80 && avgDataQuality > 0.8 ? 'healthy' : 'attention_needed'
        }
      };
    });

    if (healthDocuments.length > 0) {
      await this.collections.get('device_health').insertMany(healthDocuments, {
        ordered: false,
        writeConcern: { w: 1, j: false }
      });
    }
  }

  async trackIngestionMetrics(metrics) {
    const key = `${metrics.timestamp.getFullYear()}-${metrics.timestamp.getMonth() + 1}-${metrics.timestamp.getDate()}`;
    
    if (!this.performanceMetrics.has(key)) {
      this.performanceMetrics.set(key, {
        totalBatches: 0,
        totalDocuments: 0,
        totalIngestionTime: 0,
        averageBatchSize: 0,
        averageThroughput: 0
      });
    }
    
    const dailyMetrics = this.performanceMetrics.get(key);
    dailyMetrics.totalBatches++;
    dailyMetrics.totalDocuments += metrics.documentsInserted;
    dailyMetrics.totalIngestionTime += metrics.ingestionTimeMs;
    dailyMetrics.averageBatchSize = dailyMetrics.totalDocuments / dailyMetrics.totalBatches;
    dailyMetrics.averageThroughput = dailyMetrics.totalDocuments / (dailyMetrics.totalIngestionTime / 1000);
  }

  async getPerformanceMetrics() {
    const metrics = {
      timestamp: new Date(),
      ingestionMetrics: Object.fromEntries(this.performanceMetrics),
      
      // Collection statistics
      collectionStats: {},
      
      // Current throughput (last 5 minutes)
      recentThroughput: await this.calculateRecentThroughput(),
      
      // Storage efficiency
      storageStats: await this.getStorageStatistics()
    };

    // Get collection stats
    for (const [name, collection] of this.collections) {
      try {
        if (name.includes('sensor_readings') || name.includes('device_health')) {
          const stats = await this.db.command({ collStats: collection.collectionName });
          metrics.collectionStats[name] = {
            documentCount: stats.count,
            storageSize: stats.storageSize,
            averageDocumentSize: stats.avgObjSize,
            indexSize: stats.totalIndexSize,
            compressionRatio: stats.storageSize > 0 ? (stats.size / stats.storageSize).toFixed(2) : 0
          };
        }
      } catch (error) {
        console.warn(`Could not get stats for collection ${name}:`, error.message);
      }
    }

    return metrics;
  }

  async calculateRecentThroughput() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    try {
      const recentCount = await this.collections.get('sensor_readings').countDocuments({
        timestamp: { $gte: fiveMinutesAgo }
      });
      
      return {
        documentsLast5Minutes: recentCount,
        throughputDocsPerSecond: (recentCount / 300).toFixed(2)
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async getStorageStatistics() {
    try {
      const dbStats = await this.db.command({ dbStats: 1 });
      
      return {
        totalDataSize: dbStats.dataSize,
        totalStorageSize: dbStats.storageSize,
        totalIndexSize: dbStats.indexSize,
        compressionRatio: dbStats.dataSize > 0 ? (dbStats.dataSize / dbStats.storageSize).toFixed(2) : 0,
        collections: dbStats.collections,
        objects: dbStats.objects
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async shutdown() {
    console.log('Shutting down IoT Time Series Data Manager...');
    
    if (this.client) {
      await this.client.close();
      console.log('✅ MongoDB connection closed');
    }
    
    this.collections.clear();
    this.performanceMetrics.clear();
    this.alertingRules.clear();
    this.retentionPolicies.clear();
  }
}

// Export the IoT time series data manager
module.exports = { IoTTimeSeriesDataManager };

// Benefits of MongoDB Time Series Collections for IoT:
// - Native time series optimization with automatic bucketing and compression
// - High-throughput data ingestion optimized for IoT sensor data patterns
// - Efficient storage with specialized compression algorithms for time series data
// - Automatic data retention policies with TTL indexes
// - Real-time query performance for recent data analysis and alerting
// - Flexible metadata handling for diverse IoT device types and sensor configurations
// - Built-in support for time-based aggregations and analytics
// - Seamless integration with existing MongoDB tooling and ecosystem
// - SQL-compatible time series operations through QueryLeaf integration
// - Enterprise-grade scalability for high-volume IoT data ingestion
```

## Understanding MongoDB Time Series Architecture

### Advanced IoT Data Processing and Analytics Patterns

Implement sophisticated time series data management for production IoT deployments:

```javascript
// Production-ready IoT time series processing with advanced analytics and monitoring
class ProductionIoTTimeSeriesProcessor extends IoTTimeSeriesDataManager {
  constructor(productionConfig) {
    super();
    
    this.productionConfig = {
      ...productionConfig,
      enableAdvancedAnalytics: true,
      enablePredictiveAlerting: true,
      enableDataQualityMonitoring: true,
      enableAutomaticScaling: true,
      enableCompliance: true,
      enableDisasterRecovery: true
    };
    
    this.analyticsEngine = new Map();
    this.predictionModels = new Map();
    this.qualityMetrics = new Map();
    this.complianceTracking = new Map();
  }

  async setupAdvancedAnalytics() {
    console.log('Setting up advanced IoT analytics pipeline...');
    
    // Time series analytics configurations
    const analyticsConfigs = {
      // Real-time stream processing for immediate insights
      realTimeAnalytics: {
        windowSizes: ['5min', '15min', '1hour'],
        metrics: ['avg', 'min', 'max', 'stddev', 'percentiles'],
        alertingThresholds: {
          temperature: { min: -20, max: 50, stddev: 5 },
          humidity: { min: 0, max: 100, stddev: 10 },
          battery: { critical: 15, warning: 30 }
        },
        processingLatency: 'sub_second'
      },
      
      // Predictive analytics for proactive maintenance
      predictiveAnalytics: {
        algorithms: ['linear_trend', 'seasonal_decomposition', 'anomaly_detection'],
        predictionHorizons: ['1hour', '6hours', '24hours', '7days'],
        confidenceIntervals: [0.95, 0.99],
        modelRetraining: 'daily'
      },
      
      // Environmental correlation analysis
      environmentalAnalytics: {
        correlationAnalysis: true,
        spatialAnalysis: true,
        temporalPatterns: true,
        crossDeviceAnalysis: true
      },
      
      // Device performance analytics
      devicePerformanceAnalytics: {
        batteryLifePrediction: true,
        connectivityAnalysis: true,
        sensorDriftDetection: true,
        maintenancePrediction: true
      }
    };

    // Initialize analytics pipelines
    for (const [analyticsType, config] of Object.entries(analyticsConfigs)) {
      await this.initializeAnalyticsPipeline(analyticsType, config);
    }

    console.log('✅ Advanced analytics pipelines configured');
  }

  async performPredictiveAnalytics(deviceId, predictionType, horizonHours = 24) {
    console.log(`Performing predictive analytics for device ${deviceId}...`);
    
    const historicalHours = horizonHours * 10; // Use 10x horizon for historical analysis
    const startTime = new Date(Date.now() - historicalHours * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          'device.device_id': deviceId,
          timestamp: { $gte: startTime }
        }
      },
      {
        $sort: { timestamp: 1 }
      },
      {
        $group: {
          _id: {
            hour: { $dateToString: { format: '%Y-%m-%d-%H', date: '$timestamp' } }
          },
          avgTemperature: { $avg: '$measurements.temperature' },
          avgHumidity: { $avg: '$measurements.humidity' },
          avgBattery: { $avg: '$measurements.battery_level' },
          avgSignal: { $avg: '$measurements.signal_strength' },
          readingCount: { $sum: 1 },
          anomalyCount: { $sum: { $cond: ['$quality.anomaly_detected', 1, 0] } },
          minTimestamp: { $min: '$timestamp' },
          maxTimestamp: { $max: '$timestamp' }
        }
      },
      {
        $sort: { '_id.hour': 1 }
      },
      {
        $project: {
          hour: '$_id.hour',
          metrics: {
            temperature: '$avgTemperature',
            humidity: '$avgHumidity',
            battery: '$avgBattery',
            signal: '$avgSignal',
            readingCount: '$readingCount',
            anomalyRate: { $divide: ['$anomalyCount', '$readingCount'] }
          },
          timeRange: {
            start: '$minTimestamp',
            end: '$maxTimestamp'
          }
        }
      }
    ];

    const historicalData = await this.collections.get('sensor_readings')
      .aggregate(pipeline)
      .toArray();

    // Perform predictive analysis based on historical patterns
    const predictions = await this.generatePredictions(deviceId, historicalData, predictionType, horizonHours);
    
    return {
      deviceId: deviceId,
      predictionType: predictionType,
      horizon: `${horizonHours} hours`,
      historicalDataPoints: historicalData.length,
      predictions: predictions,
      confidence: this.calculatePredictionConfidence(historicalData),
      recommendations: this.generateMaintenanceRecommendations(predictions)
    };
  }

  async generatePredictions(deviceId, historicalData, predictionType, horizonHours) {
    const predictions = {
      batteryLife: null,
      temperatureTrends: null,
      connectivityHealth: null,
      maintenanceNeeds: null
    };

    if (predictionType === 'battery_life' || predictionType === 'all') {
      predictions.batteryLife = this.predictBatteryLife(historicalData, horizonHours);
    }

    if (predictionType === 'temperature_trends' || predictionType === 'all') {
      predictions.temperatureTrends = this.predictTemperatureTrends(historicalData, horizonHours);
    }

    if (predictionType === 'connectivity' || predictionType === 'all') {
      predictions.connectivityHealth = this.predictConnectivityHealth(historicalData, horizonHours);
    }

    if (predictionType === 'maintenance' || predictionType === 'all') {
      predictions.maintenanceNeeds = this.predictMaintenanceNeeds(historicalData, horizonHours);
    }

    return predictions;
  }

  predictBatteryLife(historicalData, horizonHours) {
    if (historicalData.length < 24) { // Need at least 24 hours of data
      return { error: 'Insufficient historical data for battery prediction' };
    }

    // Simple linear regression on battery level
    const batteryData = historicalData
      .filter(d => d.metrics.battery !== null)
      .map((d, index) => ({ x: index, y: d.metrics.battery }));

    if (batteryData.length < 10) {
      return { error: 'Insufficient battery data points' };
    }

    // Calculate linear trend
    const n = batteryData.length;
    const sumX = batteryData.reduce((sum, d) => sum + d.x, 0);
    const sumY = batteryData.reduce((sum, d) => sum + d.y, 0);
    const sumXY = batteryData.reduce((sum, d) => sum + (d.x * d.y), 0);
    const sumXX = batteryData.reduce((sum, d) => sum + (d.x * d.x), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Project battery level
    const currentBattery = batteryData[batteryData.length - 1].y;
    const futureX = batteryData.length - 1 + horizonHours;
    const projectedBattery = slope * futureX + intercept;

    // Calculate time until battery reaches critical level (15%)
    const criticalTime = slope !== 0 ? (15 - intercept) / slope : null;
    const hoursUntilCritical = criticalTime ? Math.max(0, criticalTime - (batteryData.length - 1)) : null;

    return {
      currentLevel: Math.round(currentBattery * 10) / 10,
      projectedLevel: Math.round(projectedBattery * 10) / 10,
      drainRate: Math.round((-slope) * 100) / 100, // % per hour
      hoursUntilCritical: hoursUntilCritical,
      confidence: this.calculateTrendConfidence(batteryData, slope, intercept),
      recommendation: hoursUntilCritical && hoursUntilCritical < 72 ? 
        'Schedule battery replacement within 3 days' : 
        'Battery levels normal'
    };
  }

  predictTemperatureTrends(historicalData, horizonHours) {
    const temperatureData = historicalData
      .filter(d => d.metrics.temperature !== null)
      .map((d, index) => ({ 
        x: index, 
        y: d.metrics.temperature,
        hour: d.hour
      }));

    if (temperatureData.length < 12) {
      return { error: 'Insufficient temperature data for trend analysis' };
    }

    // Calculate moving averages and trends
    const recentAvg = temperatureData.slice(-6).reduce((sum, d) => sum + d.y, 0) / 6;
    const historicalAvg = temperatureData.reduce((sum, d) => sum + d.y, 0) / temperatureData.length;
    const trend = recentAvg - historicalAvg;

    // Detect patterns (simplified seasonal detection)
    const hourlyAverages = this.calculateHourlyAverages(temperatureData);
    const dailyPattern = this.detectDailyPattern(hourlyAverages);

    return {
      currentAverage: Math.round(recentAvg * 100) / 100,
      historicalAverage: Math.round(historicalAvg * 100) / 100,
      trend: Math.round(trend * 100) / 100,
      trendDirection: trend > 1 ? 'increasing' : trend < -1 ? 'decreasing' : 'stable',
      dailyPattern: dailyPattern,
      extremeRisk: recentAvg > 40 || recentAvg < -10 ? 'high' : 'low',
      projectedRange: {
        min: Math.round((recentAvg + trend - 5) * 100) / 100,
        max: Math.round((recentAvg + trend + 5) * 100) / 100
      }
    };
  }

  predictConnectivityHealth(historicalData, horizonHours) {
    const signalData = historicalData
      .filter(d => d.metrics.signal !== null)
      .map(d => d.metrics.signal);

    const readingCountData = historicalData.map(d => d.metrics.readingCount);

    if (signalData.length < 6) {
      return { error: 'Insufficient connectivity data' };
    }

    const avgSignal = signalData.reduce((sum, s) => sum + s, 0) / signalData.length;
    const signalTrend = this.calculateSimpleTrend(signalData);
    
    const avgReadings = readingCountData.reduce((sum, r) => sum + r, 0) / readingCountData.length;
    const expectedReadings = 60; // Assuming 1-minute intervals
    const connectivityRatio = avgReadings / expectedReadings;

    return {
      averageSignalStrength: Math.round(avgSignal),
      signalTrend: Math.round(signalTrend * 100) / 100,
      connectivityRatio: Math.round(connectivityRatio * 1000) / 1000,
      connectivityStatus: connectivityRatio > 0.9 ? 'excellent' : 
                         connectivityRatio > 0.8 ? 'good' : 
                         connectivityRatio > 0.6 ? 'fair' : 'poor',
      projectedSignal: Math.round((avgSignal + signalTrend * horizonHours)),
      riskFactors: this.identifyConnectivityRisks(avgSignal, connectivityRatio, signalTrend)
    };
  }

  predictMaintenanceNeeds(historicalData, horizonHours) {
    const anomalyRates = historicalData.map(d => d.metrics.anomalyRate || 0);
    const recentAnomalyRate = anomalyRates.slice(-6).reduce((sum, r) => sum + r, 0) / 6;
    
    const batteryPrediction = this.predictBatteryLife(historicalData, horizonHours);
    const connectivityPrediction = this.predictConnectivityHealth(historicalData, horizonHours);
    
    const maintenanceScore = this.calculateMaintenanceScore(
      recentAnomalyRate,
      batteryPrediction,
      connectivityPrediction
    );

    return {
      maintenanceScore: Math.round(maintenanceScore),
      priority: maintenanceScore > 80 ? 'critical' :
                maintenanceScore > 60 ? 'high' :
                maintenanceScore > 40 ? 'medium' : 'low',
      
      recommendedActions: this.generateMaintenanceActions(
        maintenanceScore,
        batteryPrediction,
        connectivityPrediction,
        recentAnomalyRate
      ),
      
      estimatedMaintenanceWindow: this.estimateMaintenanceWindow(maintenanceScore),
      
      riskAssessment: {
        dataLossRisk: recentAnomalyRate > 0.1 ? 'high' : 'low',
        deviceFailureRisk: maintenanceScore > 70 ? 'high' : 'medium',
        serviceDisruptionRisk: connectivityPrediction.connectivityStatus === 'poor' ? 'high' : 'low'
      }
    };
  }

  calculateSimpleTrend(data) {
    if (data.length < 2) return 0;
    
    const n = data.length;
    const sumX = (n - 1) * n / 2; // Sum of 0,1,2,...,n-1
    const sumY = data.reduce((sum, y) => sum + y, 0);
    const sumXY = data.reduce((sum, y, x) => sum + (x * y), 0);
    const sumXX = (n - 1) * n * (2 * n - 1) / 6; // Sum of squares
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  calculateMaintenanceScore(anomalyRate, batteryPrediction, connectivityPrediction) {
    let score = 0;
    
    // Anomaly rate impact (0-30 points)
    score += Math.min(30, anomalyRate * 300);
    
    // Battery level impact (0-40 points)
    if (batteryPrediction && !batteryPrediction.error) {
      if (batteryPrediction.currentLevel < 20) score += 40;
      else if (batteryPrediction.currentLevel < 40) score += 25;
      else if (batteryPrediction.currentLevel < 60) score += 10;
      
      if (batteryPrediction.hoursUntilCritical && batteryPrediction.hoursUntilCritical < 72) {
        score += 30;
      }
    }
    
    // Connectivity impact (0-30 points)
    if (connectivityPrediction && !connectivityPrediction.error) {
      if (connectivityPrediction.connectivityStatus === 'poor') score += 30;
      else if (connectivityPrediction.connectivityStatus === 'fair') score += 20;
      else if (connectivityPrediction.connectivityStatus === 'good') score += 10;
    }
    
    return Math.min(100, score);
  }

  generateMaintenanceActions(score, batteryPrediction, connectivityPrediction, anomalyRate) {
    const actions = [];
    
    if (batteryPrediction && !batteryPrediction.error && batteryPrediction.currentLevel < 30) {
      actions.push({
        action: 'Replace device battery',
        priority: batteryPrediction.currentLevel < 15 ? 'urgent' : 'high',
        timeframe: batteryPrediction.currentLevel < 15 ? '24 hours' : '72 hours'
      });
    }
    
    if (connectivityPrediction && !connectivityPrediction.error && 
        connectivityPrediction.connectivityStatus === 'poor') {
      actions.push({
        action: 'Inspect device antenna and positioning',
        priority: 'high',
        timeframe: '48 hours'
      });
    }
    
    if (anomalyRate > 0.1) {
      actions.push({
        action: 'Perform sensor calibration and diagnostic check',
        priority: 'medium',
        timeframe: '1 week'
      });
    }
    
    if (score > 70) {
      actions.push({
        action: 'Comprehensive device health inspection',
        priority: 'high',
        timeframe: '48 hours'
      });
    }
    
    return actions.length > 0 ? actions : [{
      action: 'Continue routine monitoring',
      priority: 'low',
      timeframe: 'next_maintenance_cycle'
    }];
  }

  estimateMaintenanceWindow(score) {
    if (score > 80) return '0-24 hours';
    if (score > 60) return '1-3 days';
    if (score > 40) return '1-2 weeks';
    return '1-3 months';
  }

  calculateTrendConfidence(data, slope, intercept) {
    // Calculate R-squared for trend confidence
    const yMean = data.reduce((sum, d) => sum + d.y, 0) / data.length;
    const ssTotal = data.reduce((sum, d) => sum + Math.pow(d.y - yMean, 2), 0);
    const ssRes = data.reduce((sum, d) => {
      const predicted = slope * d.x + intercept;
      return sum + Math.pow(d.y - predicted, 2);
    }, 0);
    
    const rSquared = ssTotal > 0 ? 1 - (ssRes / ssTotal) : 0;
    
    if (rSquared > 0.8) return 'high';
    if (rSquared > 0.6) return 'medium';
    return 'low';
  }

  calculateHourlyAverages(temperatureData) {
    // Simplified hourly pattern detection
    const hourlyData = {};
    
    temperatureData.forEach(d => {
      const hour = d.hour.split('-')[3]; // Extract hour from YYYY-MM-DD-HH format
      if (!hourlyData[hour]) {
        hourlyData[hour] = [];
      }
      hourlyData[hour].push(d.y);
    });
    
    const hourlyAverages = {};
    for (const [hour, temps] of Object.entries(hourlyData)) {
      hourlyAverages[hour] = temps.reduce((sum, t) => sum + t, 0) / temps.length;
    }
    
    return hourlyAverages;
  }

  detectDailyPattern(hourlyAverages) {
    const hours = Object.keys(hourlyAverages).sort();
    if (hours.length < 6) return 'insufficient_data';
    
    const temperatures = hours.map(h => hourlyAverages[h]);
    const minTemp = Math.min(...temperatures);
    const maxTemp = Math.max(...temperatures);
    const range = maxTemp - minTemp;
    
    if (range > 10) return 'high_variation';
    if (range > 5) return 'moderate_variation';
    return 'stable';
  }

  identifyConnectivityRisks(avgSignal, connectivityRatio, signalTrend) {
    const risks = [];
    
    if (avgSignal < -80) {
      risks.push('Weak signal strength may cause intermittent connectivity');
    }
    
    if (connectivityRatio < 0.7) {
      risks.push('High packet loss affecting data reliability');
    }
    
    if (signalTrend < -1) {
      risks.push('Degrading signal strength trend detected');
    }
    
    if (risks.length === 0) {
      risks.push('No significant connectivity risks identified');
    }
    
    return risks;
  }

  generateMaintenanceRecommendations(predictions) {
    const recommendations = [];
    
    // Battery recommendations
    if (predictions.batteryLife && !predictions.batteryLife.error) {
      if (predictions.batteryLife.hoursUntilCritical && predictions.batteryLife.hoursUntilCritical < 168) {
        recommendations.push({
          type: 'battery',
          urgency: 'high',
          message: `Battery replacement needed within ${Math.ceil(predictions.batteryLife.hoursUntilCritical / 24)} days`,
          action: 'schedule_battery_replacement'
        });
      }
    }
    
    // Temperature recommendations
    if (predictions.temperatureTrends && !predictions.temperatureTrends.error) {
      if (predictions.temperatureTrends.extremeRisk === 'high') {
        recommendations.push({
          type: 'environmental',
          urgency: 'medium',
          message: 'Device operating in extreme temperature conditions',
          action: 'verify_installation_environment'
        });
      }
    }
    
    // Connectivity recommendations
    if (predictions.connectivityHealth && !predictions.connectivityHealth.error) {
      if (predictions.connectivityHealth.connectivityStatus === 'poor') {
        recommendations.push({
          type: 'connectivity',
          urgency: 'high',
          message: 'Poor connectivity affecting data transmission reliability',
          action: 'inspect_device_positioning_and_antenna'
        });
      }
    }
    
    // Maintenance recommendations
    if (predictions.maintenanceNeeds && !predictions.maintenanceNeeds.error) {
      if (predictions.maintenanceNeeds.priority === 'critical') {
        recommendations.push({
          type: 'maintenance',
          urgency: 'critical',
          message: 'Device requires immediate maintenance attention',
          action: 'schedule_emergency_maintenance'
        });
      }
    }
    
    return recommendations.length > 0 ? recommendations : [{
      type: 'status',
      urgency: 'none',
      message: 'Device operating within normal parameters',
      action: 'continue_monitoring'
    }];
  }

  calculatePredictionConfidence(historicalData) {
    if (historicalData.length < 12) return 'low';
    if (historicalData.length < 48) return 'medium';
    return 'high';
  }

  async getAdvancedAnalytics() {
    return {
      timestamp: new Date(),
      analyticsEngine: Object.fromEntries(this.analyticsEngine),
      predictionModels: Object.fromEntries(this.predictionModels),
      qualityMetrics: Object.fromEntries(this.qualityMetrics),
      systemHealth: await this.assessSystemHealth()
    };
  }

  async assessSystemHealth() {
    return {
      ingestionRate: 'optimal',
      queryPerformance: 'good',
      storageUtilization: 'normal',
      alertingSystem: 'operational',
      predictiveModels: 'trained'
    };
  }
}

// Export the production time series processor
module.exports = { ProductionIoTTimeSeriesProcessor };
```

## SQL-Style Time Series Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB time series operations:

```sql
-- QueryLeaf time series operations with SQL-familiar syntax for MongoDB

-- Create time series collection with SQL-style DDL
CREATE TIME SERIES COLLECTION sensor_readings (
  timestamp TIMESTAMP PRIMARY KEY,
  device OBJECT AS metaField (
    device_id VARCHAR(50),
    sensor_type VARCHAR(50),
    installation_location VARCHAR(200),
    device_model VARCHAR(100)
  ),
  measurements OBJECT (
    temperature DECIMAL(5,2),
    humidity DECIMAL(5,2), 
    pressure DECIMAL(7,2),
    battery_level DECIMAL(5,2),
    signal_strength INTEGER
  ),
  location OBJECT (
    coordinates ARRAY[2] OF DECIMAL(11,8),
    altitude DECIMAL(8,2)
  ),
  quality OBJECT (
    data_quality_score DECIMAL(3,2) DEFAULT 1.0,
    anomaly_detected BOOLEAN DEFAULT FALSE,
    validation_flags JSON
  )
)
WITH (
  granularity = 'minutes',
  bucket_max_span_seconds = 3600,
  compression = 'zstd',
  retention_days = 90
);

-- Insert time series data using familiar SQL syntax
INSERT INTO sensor_readings (timestamp, device, measurements, quality)
VALUES 
  (
    CURRENT_TIMESTAMP,
    JSON_OBJECT(
      'device_id', 'sensor_001',
      'sensor_type', 'environmental', 
      'installation_location', 'Warehouse A',
      'device_model', 'TempHumid Pro'
    ),
    JSON_OBJECT(
      'temperature', 23.5,
      'humidity', 45.2,
      'pressure', 1013.25,
      'battery_level', 87.5,
      'signal_strength', -65
    ),
    JSON_OBJECT(
      'data_quality_score', 0.95,
      'anomaly_detected', FALSE
    )
  );

-- Time-based queries with SQL window functions and time series optimizations
WITH recent_readings AS (
  SELECT 
    device->>'device_id' as device_id,
    device->>'installation_location' as location,
    timestamp,
    measurements->>'temperature'::DECIMAL as temperature,
    measurements->>'humidity'::DECIMAL as humidity,
    measurements->>'battery_level'::DECIMAL as battery_level,
    quality->>'data_quality_score'::DECIMAL as data_quality
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND quality->>'data_quality_score'::DECIMAL >= 0.8
),

time_series_analysis AS (
  SELECT 
    device_id,
    location,
    timestamp,
    temperature,
    humidity,
    battery_level,
    
    -- Time series window functions for trend analysis
    AVG(temperature) OVER (
      PARTITION BY device_id 
      ORDER BY timestamp 
      ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
    ) as temperature_12_point_avg,
    
    LAG(temperature, 1) OVER (
      PARTITION BY device_id 
      ORDER BY timestamp
    ) as prev_temperature,
    
    -- Calculate rate of change
    (temperature - LAG(temperature, 1) OVER (
      PARTITION BY device_id ORDER BY timestamp
    )) / EXTRACT(EPOCH FROM (
      timestamp - LAG(timestamp, 1) OVER (
        PARTITION BY device_id ORDER BY timestamp
      )
    )) * 3600 as temp_change_per_hour,
    
    -- Moving standard deviation for anomaly detection
    STDDEV(temperature) OVER (
      PARTITION BY device_id 
      ORDER BY timestamp 
      ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
    ) as temperature_24_point_stddev,
    
    -- Battery drain analysis
    FIRST_VALUE(battery_level) OVER (
      PARTITION BY device_id 
      ORDER BY timestamp 
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) - battery_level as total_battery_drain,
    
    -- Time-based calculations
    EXTRACT(HOUR FROM timestamp) as hour_of_day,
    EXTRACT(DOW FROM timestamp) as day_of_week,
    DATE_TRUNC('hour', timestamp) as hour_bucket
    
  FROM recent_readings
),

hourly_aggregations AS (
  SELECT 
    hour_bucket,
    location,
    COUNT(*) as reading_count,
    
    -- Statistical aggregations optimized for time series
    AVG(temperature) as avg_temperature,
    MIN(temperature) as min_temperature,
    MAX(temperature) as max_temperature,
    STDDEV(temperature) as temp_stddev,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY temperature) as temp_median,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY temperature) as temp_p95,
    
    AVG(humidity) as avg_humidity,
    STDDEV(humidity) as humidity_stddev,
    
    -- Battery analysis
    AVG(battery_level) as avg_battery_level,
    MIN(battery_level) as min_battery_level,
    COUNT(*) FILTER (WHERE battery_level < 20) as low_battery_readings,
    
    -- Data quality metrics
    AVG(data_quality) as avg_data_quality,
    COUNT(*) FILTER (WHERE data_quality < 0.9) as poor_quality_readings,
    
    -- Anomaly detection indicators
    COUNT(*) FILTER (WHERE ABS(temp_change_per_hour) > 5) as rapid_temp_changes,
    COUNT(*) FILTER (WHERE ABS(temperature - temperature_12_point_avg) > 2 * temperature_24_point_stddev) as statistical_anomalies
    
  FROM time_series_analysis
  GROUP BY hour_bucket, location
),

location_health_analysis AS (
  SELECT 
    location,
    
    -- Time range analysis
    MIN(hour_bucket) as analysis_start,
    MAX(hour_bucket) as analysis_end,
    COUNT(*) as total_hours,
    
    -- Environmental conditions
    AVG(avg_temperature) as overall_avg_temperature,
    MAX(max_temperature) as peak_temperature,
    MIN(min_temperature) as lowest_temperature,
    AVG(temp_stddev) as avg_temperature_variability,
    
    AVG(avg_humidity) as overall_avg_humidity,
    AVG(humidity_stddev) as avg_humidity_variability,
    
    -- Device health indicators
    AVG(avg_battery_level) as location_avg_battery,
    SUM(low_battery_readings) as total_low_battery_readings,
    AVG(avg_data_quality) as location_data_quality,
    SUM(poor_quality_readings) as total_poor_quality_readings,
    
    -- Anomaly aggregations
    SUM(rapid_temp_changes) as total_rapid_changes,
    SUM(statistical_anomalies) as total_anomalies,
    SUM(reading_count) as total_readings,
    
    -- Calculated health metrics
    (SUM(reading_count) - SUM(poor_quality_readings)) * 100.0 / NULLIF(SUM(reading_count), 0) as data_reliability_percent,
    
    CASE 
      WHEN AVG(avg_temperature) BETWEEN 18 AND 25 AND AVG(avg_humidity) BETWEEN 40 AND 60 THEN 'optimal'
      WHEN AVG(avg_temperature) BETWEEN 15 AND 30 AND AVG(avg_humidity) BETWEEN 30 AND 70 THEN 'acceptable'
      WHEN AVG(avg_temperature) BETWEEN 10 AND 35 AND AVG(avg_humidity) BETWEEN 20 AND 80 THEN 'suboptimal'
      ELSE 'extreme'
    END as environmental_classification,
    
    CASE 
      WHEN AVG(avg_battery_level) > 60 THEN 'healthy'
      WHEN AVG(avg_battery_level) > 30 THEN 'moderate'
      WHEN AVG(avg_battery_level) > 15 THEN 'concerning'
      ELSE 'critical'
    END as battery_health_status
    
  FROM hourly_aggregations
  GROUP BY location
)

SELECT 
  location,
  TO_CHAR(analysis_start, 'YYYY-MM-DD HH24:MI') as period_start,
  TO_CHAR(analysis_end, 'YYYY-MM-DD HH24:MI') as period_end,
  total_hours,
  
  -- Environmental metrics
  ROUND(overall_avg_temperature::NUMERIC, 2) as avg_temperature_c,
  ROUND(peak_temperature::NUMERIC, 2) as max_temperature_c,
  ROUND(lowest_temperature::NUMERIC, 2) as min_temperature_c,
  ROUND(avg_temperature_variability::NUMERIC, 2) as temperature_stability,
  
  ROUND(overall_avg_humidity::NUMERIC, 2) as avg_humidity_percent,
  ROUND(avg_humidity_variability::NUMERIC, 2) as humidity_stability,
  
  environmental_classification,
  
  -- Device health metrics
  ROUND(location_avg_battery::NUMERIC, 2) as avg_battery_percent,
  battery_health_status,
  total_low_battery_readings,
  
  -- Data quality metrics
  ROUND(location_data_quality::NUMERIC, 3) as avg_data_quality,
  ROUND(data_reliability_percent::NUMERIC, 2) as data_reliability_percent,
  total_poor_quality_readings,
  
  -- Anomaly metrics
  total_rapid_changes,
  total_anomalies,
  ROUND((total_anomalies * 100.0 / NULLIF(total_readings, 0))::NUMERIC, 3) as anomaly_rate_percent,
  
  -- Overall location health score
  (
    CASE environmental_classification
      WHEN 'optimal' THEN 25
      WHEN 'acceptable' THEN 20
      WHEN 'suboptimal' THEN 15
      ELSE 5
    END +
    CASE battery_health_status
      WHEN 'healthy' THEN 25
      WHEN 'moderate' THEN 20
      WHEN 'concerning' THEN 10
      ELSE 5
    END +
    CASE 
      WHEN data_reliability_percent >= 95 THEN 25
      WHEN data_reliability_percent >= 90 THEN 20
      WHEN data_reliability_percent >= 85 THEN 15
      ELSE 10
    END +
    CASE 
      WHEN total_anomalies * 100.0 / NULLIF(total_readings, 0) < 1 THEN 25
      WHEN total_anomalies * 100.0 / NULLIF(total_readings, 0) < 3 THEN 20
      WHEN total_anomalies * 100.0 / NULLIF(total_readings, 0) < 5 THEN 15
      ELSE 10
    END
  ) as location_health_score,
  
  -- Operational recommendations
  CASE 
    WHEN environmental_classification = 'extreme' THEN 'URGENT: Review environmental conditions'
    WHEN battery_health_status = 'critical' THEN 'URGENT: Multiple devices need battery replacement'
    WHEN data_reliability_percent < 90 THEN 'HIGH: Investigate data quality issues'
    WHEN total_anomalies * 100.0 / NULLIF(total_readings, 0) > 5 THEN 'MEDIUM: High anomaly rate needs investigation'
    WHEN environmental_classification = 'suboptimal' THEN 'LOW: Monitor environmental conditions'
    ELSE 'Location operating within normal parameters'
  END as operational_recommendation,
  
  total_readings

FROM location_health_analysis
ORDER BY location_health_score ASC, location;

-- Real-time alerting with time series optimizations
WITH latest_device_readings AS (
  SELECT DISTINCT ON (device->>'device_id')
    device->>'device_id' as device_id,
    device->>'installation_location' as location,
    device->>'sensor_type' as sensor_type,
    timestamp,
    measurements->>'temperature'::DECIMAL as temperature,
    measurements->>'humidity'::DECIMAL as humidity,
    measurements->>'battery_level'::DECIMAL as battery_level,
    measurements->>'signal_strength'::INTEGER as signal_strength,
    quality->>'anomaly_detected'::BOOLEAN as anomaly_detected,
    quality->>'data_quality_score'::DECIMAL as data_quality_score
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
  ORDER BY device->>'device_id', timestamp DESC
),

alert_conditions AS (
  SELECT 
    device_id,
    location,
    sensor_type,
    timestamp,
    temperature,
    humidity,
    battery_level,
    signal_strength,
    data_quality_score,
    
    -- Alert condition evaluation
    CASE 
      WHEN temperature > 50 OR temperature < -20 THEN 'temperature_extreme'
      WHEN humidity > 95 OR humidity < 5 THEN 'humidity_extreme'
      WHEN battery_level < 15 THEN 'battery_critical'
      WHEN signal_strength < -85 THEN 'signal_poor'
      WHEN anomaly_detected = TRUE THEN 'anomaly_detected'
      WHEN data_quality_score < 0.7 THEN 'data_quality_poor'
      WHEN timestamp < CURRENT_TIMESTAMP - INTERVAL '10 minutes' THEN 'device_offline'
    END as alert_type,
    
    -- Alert severity calculation
    CASE 
      WHEN battery_level < 10 OR timestamp < CURRENT_TIMESTAMP - INTERVAL '20 minutes' THEN 'critical'
      WHEN temperature > 45 OR temperature < -15 OR anomaly_detected THEN 'high'
      WHEN battery_level < 20 OR signal_strength < -80 THEN 'medium'
      ELSE 'low'
    END as alert_severity,
    
    -- Time since last reading
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp))/60 as minutes_since_reading

  FROM latest_device_readings
)

SELECT 
  device_id,
  location,
  sensor_type,
  alert_type,
  alert_severity,
  TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') as last_reading_time,
  ROUND(minutes_since_reading::NUMERIC, 1) as minutes_ago,
  
  -- Current sensor values
  temperature,
  humidity,
  battery_level,
  signal_strength,
  ROUND(data_quality_score::NUMERIC, 3) as data_quality,
  
  -- Alert message generation
  CASE alert_type
    WHEN 'temperature_extreme' THEN 
      FORMAT('Temperature %s°C exceeds safe operating range', temperature)
    WHEN 'humidity_extreme' THEN 
      FORMAT('Humidity %s%% is at extreme level', humidity)
    WHEN 'battery_critical' THEN 
      FORMAT('Battery level %s%% requires immediate replacement', battery_level)
    WHEN 'signal_poor' THEN 
      FORMAT('Signal strength %s dBm indicates connectivity issues', signal_strength)
    WHEN 'anomaly_detected' THEN 
      'Sensor anomaly detected in recent readings'
    WHEN 'data_quality_poor' THEN 
      FORMAT('Data quality score %s indicates sensor problems', data_quality_score)
    WHEN 'device_offline' THEN 
      FORMAT('Device offline for %s minutes', ROUND(minutes_since_reading::NUMERIC, 0))
    ELSE 'Unknown alert condition'
  END as alert_message,
  
  -- Recommended actions with time urgency
  CASE alert_type
    WHEN 'temperature_extreme' THEN 'Verify environmental conditions and sensor calibration within 2 hours'
    WHEN 'humidity_extreme' THEN 'Check sensor operation and environmental factors within 4 hours'
    WHEN 'battery_critical' THEN 'Replace battery immediately (within 24 hours)'
    WHEN 'signal_poor' THEN 'Inspect antenna and network infrastructure within 48 hours'
    WHEN 'anomaly_detected' THEN 'Investigate sensor readings and interference within 24 hours'
    WHEN 'data_quality_poor' THEN 'Perform sensor calibration within 48 hours'
    WHEN 'device_offline' THEN 'Check power and connectivity immediately'
    ELSE 'Monitor device status'
  END as recommended_action

FROM alert_conditions
WHERE alert_type IS NOT NULL
ORDER BY 
  CASE alert_severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  timestamp DESC;

-- Time series aggregation with downsampling for long-term analysis
WITH daily_device_summary AS (
  SELECT 
    DATE_TRUNC('day', timestamp) as day,
    device->>'device_id' as device_id,
    device->>'installation_location' as location,
    
    -- Daily statistical aggregations
    COUNT(*) as daily_reading_count,
    
    -- Temperature analysis
    AVG(measurements->>'temperature'::DECIMAL) as avg_temperature,
    MIN(measurements->>'temperature'::DECIMAL) as min_temperature,
    MAX(measurements->>'temperature'::DECIMAL) as max_temperature,
    STDDEV(measurements->>'temperature'::DECIMAL) as temp_daily_stddev,
    
    -- Humidity analysis
    AVG(measurements->>'humidity'::DECIMAL) as avg_humidity,
    STDDEV(measurements->>'humidity'::DECIMAL) as humidity_daily_stddev,
    
    -- Battery degradation tracking
    FIRST_VALUE(measurements->>'battery_level'::DECIMAL) OVER (
      PARTITION BY device->>'device_id', DATE_TRUNC('day', timestamp)
      ORDER BY timestamp ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as day_start_battery,
    
    LAST_VALUE(measurements->>'battery_level'::DECIMAL) OVER (
      PARTITION BY device->>'device_id', DATE_TRUNC('day', timestamp)
      ORDER BY timestamp ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING  
    ) as day_end_battery,
    
    -- Data quality metrics
    AVG(quality->>'data_quality_score'::DECIMAL) as avg_daily_data_quality,
    COUNT(*) FILTER (WHERE quality->>'anomaly_detected'::BOOLEAN = TRUE) as daily_anomaly_count,
    
    -- Connectivity metrics
    AVG(measurements->>'signal_strength'::INTEGER) as avg_signal_strength,
    COUNT(*) as expected_readings, -- Based on device configuration
    
    -- Environmental stability
    CASE 
      WHEN STDDEV(measurements->>'temperature'::DECIMAL) < 2 AND 
           STDDEV(measurements->>'humidity'::DECIMAL) < 5 THEN 'stable'
      WHEN STDDEV(measurements->>'temperature'::DECIMAL) < 5 AND 
           STDDEV(measurements->>'humidity'::DECIMAL) < 15 THEN 'moderate'
      ELSE 'variable'
    END as environmental_stability

  FROM sensor_readings
  WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY DATE_TRUNC('day', timestamp), device->>'device_id', device->>'installation_location'
),

device_trend_analysis AS (
  SELECT 
    device_id,
    location,
    
    -- Time period
    MIN(day) as analysis_start_date,
    MAX(day) as analysis_end_date,
    COUNT(*) as total_days,
    
    -- Reading consistency
    AVG(daily_reading_count) as avg_daily_readings,
    STDDEV(daily_reading_count) as reading_count_consistency,
    
    -- Temperature trends
    AVG(avg_temperature) as overall_avg_temperature,
    STDDEV(avg_temperature) as temperature_day_to_day_variation,
    
    -- Linear regression on daily averages for trend detection
    REGR_SLOPE(avg_temperature, EXTRACT(EPOCH FROM day)) * 86400 as temp_trend_per_day,
    REGR_R2(avg_temperature, EXTRACT(EPOCH FROM day)) as temp_trend_confidence,
    
    -- Battery degradation analysis  
    AVG(day_end_battery - day_start_battery) as avg_daily_battery_drain,
    
    -- Battery trend analysis
    REGR_SLOPE(day_end_battery, EXTRACT(EPOCH FROM day)) * 86400 as battery_trend_per_day,
    REGR_R2(day_end_battery, EXTRACT(EPOCH FROM day)) as battery_trend_confidence,
    
    -- Data quality trends
    AVG(avg_daily_data_quality) as overall_avg_data_quality,
    AVG(daily_anomaly_count) as avg_daily_anomalies,
    
    -- Connectivity trends
    AVG(avg_signal_strength) as overall_avg_signal,
    REGR_SLOPE(avg_signal_strength, EXTRACT(EPOCH FROM day)) * 86400 as signal_trend_per_day,
    
    -- Environmental stability assessment
    MODE() WITHIN GROUP (ORDER BY environmental_stability) as predominant_stability,
    COUNT(*) FILTER (WHERE environmental_stability = 'stable') * 100.0 / COUNT(*) as stable_days_percent
    
  FROM daily_device_summary
  GROUP BY device_id, location
)

SELECT 
  device_id,
  location,
  TO_CHAR(analysis_start_date, 'YYYY-MM-DD') as period_start,
  TO_CHAR(analysis_end_date, 'YYYY-MM-DD') as period_end,
  total_days,
  
  -- Reading consistency metrics
  ROUND(avg_daily_readings::NUMERIC, 1) as avg_daily_readings,
  CASE 
    WHEN reading_count_consistency / NULLIF(avg_daily_readings, 0) < 0.1 THEN 'very_consistent'
    WHEN reading_count_consistency / NULLIF(avg_daily_readings, 0) < 0.2 THEN 'consistent'
    WHEN reading_count_consistency / NULLIF(avg_daily_readings, 0) < 0.4 THEN 'variable'
    ELSE 'inconsistent'
  END as reading_consistency,
  
  -- Temperature analysis
  ROUND(overall_avg_temperature::NUMERIC, 2) as avg_temperature_c,
  ROUND(temperature_day_to_day_variation::NUMERIC, 2) as temp_daily_variation,
  ROUND((temp_trend_per_day * 30)::NUMERIC, 3) as temp_trend_per_month_c,
  CASE 
    WHEN temp_trend_confidence > 0.7 THEN 'high_confidence'
    WHEN temp_trend_confidence > 0.4 THEN 'medium_confidence'
    ELSE 'low_confidence'
  END as temp_trend_reliability,
  
  -- Battery health analysis
  ROUND(avg_daily_battery_drain::NUMERIC, 2) as avg_daily_drain_percent,
  ROUND((battery_trend_per_day * 30)::NUMERIC, 2) as battery_degradation_per_month,
  
  -- Estimated battery life (assuming linear degradation)
  CASE 
    WHEN battery_trend_per_day < -0.1 THEN 
      ROUND((50.0 / ABS(battery_trend_per_day))::NUMERIC, 0) -- Days until 50% from current
    ELSE NULL
  END as estimated_days_until_50_percent,
  
  CASE 
    WHEN battery_trend_per_day < -0.05 THEN 
      ROUND((85.0 / ABS(battery_trend_per_day))::NUMERIC, 0) -- Days until need replacement
    ELSE NULL
  END as estimated_days_until_replacement,
  
  -- Data quality assessment
  ROUND(overall_avg_data_quality::NUMERIC, 3) as avg_data_quality,
  ROUND(avg_daily_anomalies::NUMERIC, 1) as avg_daily_anomalies,
  
  -- Connectivity assessment
  ROUND(overall_avg_signal::NUMERIC, 0) as avg_signal_strength_dbm,
  CASE 
    WHEN signal_trend_per_day < -0.5 THEN 'degrading'
    WHEN signal_trend_per_day > 0.5 THEN 'improving'
    ELSE 'stable'
  END as signal_trend,
  
  -- Environmental assessment
  predominant_stability as environmental_stability,
  ROUND(stable_days_percent::NUMERIC, 1) as stable_days_percent,
  
  -- Overall device health scoring
  (
    -- Reading consistency (0-25 points)
    CASE 
      WHEN reading_count_consistency / NULLIF(avg_daily_readings, 0) < 0.1 THEN 25
      WHEN reading_count_consistency / NULLIF(avg_daily_readings, 0) < 0.2 THEN 20
      WHEN reading_count_consistency / NULLIF(avg_daily_readings, 0) < 0.4 THEN 15
      ELSE 10
    END +
    
    -- Battery health (0-25 points)
    CASE 
      WHEN battery_trend_per_day > -0.05 THEN 25
      WHEN battery_trend_per_day > -0.1 THEN 20
      WHEN battery_trend_per_day > -0.2 THEN 15
      ELSE 10
    END +
    
    -- Data quality (0-25 points)
    CASE 
      WHEN overall_avg_data_quality >= 0.95 THEN 25
      WHEN overall_avg_data_quality >= 0.90 THEN 20
      WHEN overall_avg_data_quality >= 0.85 THEN 15
      ELSE 10
    END +
    
    -- Environmental stability (0-25 points)
    CASE 
      WHEN stable_days_percent >= 80 THEN 25
      WHEN stable_days_percent >= 60 THEN 20
      WHEN stable_days_percent >= 40 THEN 15
      ELSE 10
    END
  ) as device_health_score,
  
  -- Maintenance recommendations
  CASE 
    WHEN battery_trend_per_day < -0.2 OR overall_avg_data_quality < 0.8 THEN 'URGENT: Schedule maintenance'
    WHEN battery_trend_per_day < -0.1 OR stable_days_percent < 50 THEN 'HIGH: Review device status'
    WHEN overall_avg_signal < -80 OR avg_daily_anomalies > 5 THEN 'MEDIUM: Monitor closely'
    ELSE 'LOW: Continue routine monitoring'
  END as maintenance_priority

FROM device_trend_analysis
WHERE total_days >= 7  -- Only analyze devices with sufficient data
ORDER BY device_health_score ASC, device_id;

-- QueryLeaf provides comprehensive time series capabilities:
-- 1. Native time series collection creation with SQL DDL syntax
-- 2. Optimized time-based queries with window functions and aggregations  
-- 3. Real-time alerting with complex condition evaluation
-- 4. Long-term trend analysis with statistical functions
-- 5. Automated data retention and lifecycle management
-- 6. High-performance ingestion optimized for IoT data patterns
-- 7. Advanced analytics with predictive capabilities
-- 8. Integration with MongoDB's time series optimizations
-- 9. Familiar SQL syntax for complex temporal operations
-- 10. Enterprise-grade scalability for high-volume IoT applications
```

## Best Practices for MongoDB Time Series Implementation

### IoT Data Architecture and Optimization Strategies

Essential practices for production MongoDB time series deployments:

1. **Granularity Selection**: Choose appropriate time series granularity based on data frequency and query patterns
2. **Metadata Organization**: Structure device metadata efficiently in the metaField for optimal bucketing and compression
3. **Index Strategy**: Create compound indexes on metaField components and timestamp for optimal query performance
4. **Retention Policies**: Implement TTL indexes and automated data archiving based on business requirements
5. **Compression Optimization**: Use zstd compression for maximum storage efficiency with time series data
6. **Query Optimization**: Design aggregation pipelines that leverage time series collection optimizations

### Scalability and Production Deployment

Optimize time series collections for enterprise IoT requirements:

1. **High-Throughput Ingestion**: Configure write settings and batch sizes for optimal data ingestion rates
2. **Real-Time Analytics**: Implement efficient real-time query patterns that leverage time series optimizations
3. **Predictive Analytics**: Build statistical models using historical time series data for proactive maintenance
4. **Multi-Tenant Architecture**: Design time series schemas that support multiple device types and customers
5. **Compliance Integration**: Ensure time series data meets regulatory retention and audit requirements
6. **Disaster Recovery**: Implement backup and recovery strategies optimized for time series data volumes

## Conclusion

MongoDB Time Series Collections provide comprehensive optimization for IoT sensor data management through native time-stamped data support, automatic compression algorithms, and specialized indexing strategies designed specifically for temporal workloads. The integrated approach eliminates complex manual partitioning while delivering superior performance for high-frequency data ingestion and time-based analytics operations.

Key MongoDB Time Series benefits for IoT applications include:

- **Native IoT Optimization**: Purpose-built time series collections with automatic bucketing and compression for sensor data
- **High-Performance Ingestion**: Optimized write paths capable of handling thousands of sensor readings per second
- **Intelligent Storage Management**: Automatic data compression and retention policies that scale with IoT data volumes  
- **Real-Time Analytics**: Efficient time-based queries and aggregations optimized for recent data analysis and alerting
- **Predictive Capabilities**: Advanced analytics support for device maintenance, trend analysis, and anomaly detection
- **SQL Compatibility**: Familiar time series operations accessible through SQL-style interfaces for operational simplicity

Whether you're managing environmental sensors, industrial equipment monitoring, smart city infrastructure, or consumer IoT devices, MongoDB Time Series Collections with QueryLeaf's SQL-familiar interface provide the foundation for scalable IoT data architecture that maintains high performance while supporting sophisticated real-time analytics and predictive maintenance workflows.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB Time Series Collections while providing SQL-familiar syntax for time series data management, real-time analytics, and predictive maintenance operations. Advanced temporal query patterns, statistical analysis, and IoT-specific optimizations are seamlessly accessible through familiar SQL constructs, making sophisticated time series data management both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's specialized time series optimizations with familiar SQL-style operations makes it an ideal platform for IoT applications that require both high-performance temporal data processing and operational simplicity, ensuring your sensor data architecture scales efficiently while maintaining familiar development and analytical patterns.