---
title: "MongoDB Time-Series Data Management and IoT Analytics: Advanced Optimization Patterns for Real-Time Sensor Data Processing"
description: "Master MongoDB time-series data management for IoT analytics. Learn advanced sensor data patterns, real-time aggregation optimization, and SQL-familiar time-series operations for scalable IoT data processing and analytics."
date: 2025-12-18
tags: [mongodb, time-series, iot, analytics, sensor-data, real-time, optimization, sql]
---

# MongoDB Time-Series Data Management and IoT Analytics: Advanced Optimization Patterns for Real-Time Sensor Data Processing

Internet of Things (IoT) applications generate massive volumes of time-stamped sensor data that require specialized database architectures capable of handling high-velocity data ingestion, efficient storage optimization, and real-time analytical processing. Traditional relational databases struggle with the unique characteristics of time-series data: irregular intervals, high write throughput, temporal query patterns, and the need for real-time aggregation across millions of data points from distributed sensors and devices.

MongoDB's time-series collections provide purpose-built capabilities for IoT data management that dramatically improve storage efficiency, query performance, and analytical processing through automatic data bucketing, intelligent compression, and optimized indexing strategies. Unlike traditional databases that treat time-series data as regular tables, MongoDB's native time-series architecture is specifically designed for temporal workloads with built-in optimization for IoT use cases, sensor data patterns, and real-time analytics requirements.

## The Traditional IoT Data Management Challenge

Conventional relational database approaches for IoT time-series data face significant performance and scalability limitations:

```sql
-- Traditional PostgreSQL approach for IoT sensor data - inefficient and problematic

-- Typical IoT sensor data table with poor time-series optimization
CREATE TABLE sensor_readings (
    reading_id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    location VARCHAR(200) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Multiple sensor measurements (inefficient normalized structure)
    temperature DECIMAL(5,2),
    humidity DECIMAL(5,2),
    pressure DECIMAL(7,2),
    voltage DECIMAL(4,2),
    current DECIMAL(6,3),
    power_consumption DECIMAL(8,2),
    
    -- Device metadata (repetitive storage)
    device_model VARCHAR(100),
    firmware_version VARCHAR(50),
    installation_date DATE,
    
    -- Location data (redundant storage)
    building_id VARCHAR(50),
    floor_number INTEGER,
    room_number VARCHAR(20),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    
    -- Quality and status indicators
    signal_strength INTEGER,
    battery_level DECIMAL(5,2),
    reading_quality VARCHAR(20),
    data_source VARCHAR(50),
    
    -- Audit and tracking fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    validation_status VARCHAR(20) DEFAULT 'pending'
);

-- Attempt at optimization with basic indexes (insufficient for time-series workloads)
CREATE INDEX sensor_readings_device_time_idx ON sensor_readings (device_id, timestamp DESC);
CREATE INDEX sensor_readings_timestamp_idx ON sensor_readings (timestamp DESC);
CREATE INDEX sensor_readings_sensor_type_idx ON sensor_readings (sensor_type, timestamp DESC);
CREATE INDEX sensor_readings_location_idx ON sensor_readings (building_id, floor_number, timestamp DESC);

-- Example of problematic IoT data insertion (individual row inserts are slow)
INSERT INTO sensor_readings (
    device_id, sensor_type, location, timestamp,
    temperature, humidity, pressure, voltage, current, power_consumption,
    device_model, firmware_version, installation_date,
    building_id, floor_number, room_number, latitude, longitude,
    signal_strength, battery_level, reading_quality, data_source
) VALUES (
    'TEMP_SENSOR_001_FLOOR_1_ROOM_A', 
    'Environmental Sensor',
    'Building A - Floor 1 - Room A - North Wall',
    CURRENT_TIMESTAMP,
    22.5, 65.3, 1013.25, 3.3, 0.125, 0.4125,
    'SensorTech ST-2000 Environmental Monitor',
    'v2.1.5',
    '2024-01-15',
    'BUILDING_A_MAIN_CAMPUS',
    1,
    'A101',
    40.7128,
    -74.0060,
    85,
    94.2,
    'excellent',
    'real_time_telemetry'
);

-- This approach requires individual inserts for each sensor reading:
-- - Device TEMP_SENSOR_001 sends reading every 30 seconds = 2,880 inserts/day
-- - Device HUMIDITY_SENSOR_002 sends reading every 60 seconds = 1,440 inserts/day  
-- - Device PRESSURE_SENSOR_003 sends reading every 15 seconds = 5,760 inserts/day
-- - For 1,000 devices = millions of individual INSERT operations per day

-- Example of inefficient time-series queries
-- Get hourly averages for temperature sensors (slow aggregation)
SELECT 
    device_id,
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    
    -- Basic aggregations (computationally expensive)
    AVG(temperature) as avg_temperature,
    MIN(temperature) as min_temperature,
    MAX(temperature) as max_temperature,
    STDDEV(temperature) as temperature_variance,
    
    -- Count and quality metrics
    COUNT(*) as reading_count,
    COUNT(*) FILTER (WHERE reading_quality = 'excellent') as excellent_readings,
    AVG(signal_strength) as avg_signal_strength,
    
    -- Power consumption analysis
    AVG(power_consumption) as avg_power,
    SUM(power_consumption) as total_power
    
FROM sensor_readings
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND sensor_type = 'Environmental Sensor'
  AND temperature IS NOT NULL
GROUP BY device_id, DATE_TRUNC('hour', timestamp)
ORDER BY device_id, hour_bucket DESC;

-- Problems with traditional time-series queries:
-- 1. Full table scans despite indexes when dealing with large time ranges
-- 2. Expensive GROUP BY operations on timestamp truncation
-- 3. Multiple aggregation calculations are computationally intensive
-- 4. Poor performance with concurrent analytical queries
-- 5. No pre-aggregated rollups or materialized views for common patterns
-- 6. Inefficient storage with repeated device metadata in every row

-- Attempting to get device performance trends (extremely slow)
WITH daily_device_metrics AS (
    SELECT 
        device_id,
        DATE_TRUNC('day', timestamp) as date_bucket,
        
        -- Performance indicators
        AVG(temperature) as avg_temp,
        AVG(humidity) as avg_humidity,
        AVG(pressure) as avg_pressure,
        AVG(power_consumption) as avg_power,
        AVG(battery_level) as avg_battery,
        AVG(signal_strength) as avg_signal,
        
        -- Operational metrics
        COUNT(*) as total_readings,
        COUNT(*) FILTER (WHERE reading_quality = 'poor') as poor_quality_readings,
        
        -- Calculate uptime percentage
        (COUNT(*)::DECIMAL / (24 * 60 * 2)) * 100 as uptime_percentage, -- Assuming 30-second intervals
        
        -- Data quality assessment
        (COUNT(*) FILTER (WHERE reading_quality IN ('excellent', 'good'))::DECIMAL / COUNT(*)) * 100 as quality_percentage
        
    FROM sensor_readings
    WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY device_id, DATE_TRUNC('day', timestamp)
),

device_trend_analysis AS (
    SELECT 
        device_id,
        
        -- Performance trends using window functions (very expensive)
        AVG(avg_temp) as overall_avg_temp,
        STDDEV(avg_temp) as temp_stability,
        
        -- Power consumption trends
        AVG(avg_power) as overall_avg_power,
        
        -- Calculate linear regression slope for temperature trend
        REGR_SLOPE(avg_temp, EXTRACT(EPOCH FROM date_bucket)) as temp_trend_slope,
        REGR_R2(avg_temp, EXTRACT(EPOCH FROM date_bucket)) as temp_trend_correlation,
        
        -- Battery degradation analysis
        REGR_SLOPE(avg_battery, EXTRACT(EPOCH FROM date_bucket)) as battery_degradation_slope,
        
        -- Reliability metrics
        AVG(uptime_percentage) as avg_uptime,
        MIN(quality_percentage) as min_quality_percentage,
        
        -- Trend classification
        CASE 
            WHEN REGR_SLOPE(avg_temp, EXTRACT(EPOCH FROM date_bucket)) > 0.01 THEN 'temperature_increasing'
            WHEN REGR_SLOPE(avg_temp, EXTRACT(EPOCH FROM date_bucket)) < -0.01 THEN 'temperature_decreasing'
            ELSE 'temperature_stable'
        END as temperature_trend,
        
        CASE 
            WHEN REGR_SLOPE(avg_battery, EXTRACT(EPOCH FROM date_bucket)) < -0.1 THEN 'battery_degrading'
            WHEN REGR_SLOPE(avg_battery, EXTRACT(EPOCH FROM date_bucket)) > 0.1 THEN 'battery_improving'
            ELSE 'battery_stable'
        END as battery_trend
        
    FROM daily_device_metrics
    GROUP BY device_id
)

-- This query would take minutes or hours on large datasets
SELECT 
    device_id,
    overall_avg_temp,
    temp_stability,
    overall_avg_power,
    temp_trend_slope,
    battery_degradation_slope,
    avg_uptime,
    temperature_trend,
    battery_trend,
    
    -- Device health scoring
    CASE 
        WHEN avg_uptime > 95 AND min_quality_percentage > 90 AND battery_degradation_slope > -0.05 THEN 'excellent'
        WHEN avg_uptime > 90 AND min_quality_percentage > 80 AND battery_degradation_slope > -0.1 THEN 'good'
        WHEN avg_uptime > 80 AND min_quality_percentage > 70 THEN 'fair'
        ELSE 'poor'
    END as device_health_grade
    
FROM device_trend_analysis
ORDER BY overall_avg_power DESC;

-- Storage analysis showing massive inefficiency
SELECT 
    schemaname,
    tablename,
    
    -- Table size metrics showing bloat
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size,
    
    -- Row statistics
    n_tup_ins as total_rows,
    CASE 
        WHEN n_tup_ins > 0 THEN 
            pg_relation_size(schemaname||'.'||tablename) / n_tup_ins 
        ELSE 0 
    END as avg_row_size_bytes,
    
    -- Storage efficiency (poor due to repetitive data)
    CASE 
        WHEN n_tup_ins > 0 THEN
            ROUND((pg_relation_size(schemaname||'.'||tablename)::DECIMAL / 1024 / 1024 / 1024), 2)
        ELSE 0.0
    END as storage_size_gb
    
FROM pg_stat_user_tables 
WHERE tablename = 'sensor_readings'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Traditional approach problems:
-- 1. Massive storage bloat due to repetitive device metadata in every row
-- 2. Poor compression due to mixed data types and variable-length fields
-- 3. Inefficient indexing strategies that don't leverage time-series patterns
-- 4. Slow aggregation queries that require full scans and expensive calculations
-- 5. No built-in support for time-based data retention and archival
-- 6. Complex partitioning strategies required for reasonable performance
-- 7. Poor concurrent read/write performance for mixed analytical and operational workloads
-- 8. Difficult real-time analytics due to lack of incremental aggregation support
-- 9. No specialized compression for time-series data patterns
-- 10. Manual optimization required for downsample and rollup operations

-- PostgreSQL time partitioning attempt (complex and limited)
-- Manual partitioning by month (operational overhead)
CREATE TABLE sensor_readings_2024_12 PARTITION OF sensor_readings
FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

CREATE TABLE sensor_readings_2024_11 PARTITION OF sensor_readings  
FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

-- Even with partitioning:
-- 1. Manual partition management overhead
-- 2. Limited optimization for time-series specific operations
-- 3. No automatic data retention and archival policies
-- 4. Complex cross-partition analytics and aggregation
-- 5. Poor storage compression compared to purpose-built time-series systems
```

MongoDB provides powerful time-series collection capabilities designed specifically for IoT data management:

```javascript
// MongoDB Advanced Time-Series Data Management for IoT Analytics

const { MongoClient, ObjectId } = require('mongodb');

// Comprehensive IoT Time-Series Data Management System
class MongoDBIoTTimeSeriesManager {
  constructor(connectionString, config = {}) {
    this.client = new MongoClient(connectionString);
    this.db = null;
    this.timeSeriesCollections = new Map();
    
    // Advanced time-series configuration for IoT workloads
    this.config = {
      // Time-series collection optimization
      timeSeries: {
        metaField: 'device', // Device metadata field
        timeField: 'timestamp', // Time field
        granularity: 'seconds', // Data granularity: seconds, minutes, hours
        enableOptimization: true,
        enableCompression: true
      },
      
      // IoT-specific optimization settings
      iotOptimization: {
        enableDeviceBatching: config.enableDeviceBatching !== false,
        enableSensorGrouping: config.enableSensorGrouping !== false,
        enableDataValidation: config.enableDataValidation !== false,
        enableRealTimeAggregation: config.enableRealTimeAggregation !== false,
        enableAnomalyDetection: config.enableAnomalyDetection || false
      },
      
      // Data retention and archival
      dataRetention: {
        enableAutoArchival: config.enableAutoArchival || false,
        hotDataRetentionDays: config.hotDataRetentionDays || 30,
        warmDataRetentionDays: config.warmDataRetentionDays || 90,
        coldDataRetentionDays: config.coldDataRetentionDays || 365,
        enableCompression: config.enableRetentionCompression !== false
      },
      
      // Performance and monitoring
      performance: {
        enableMetrics: config.enableMetrics !== false,
        enableAlerts: config.enableAlerts || false,
        enablePerformanceOptimization: config.enablePerformanceOptimization !== false,
        maxConcurrentReads: config.maxConcurrentReads || 10,
        maxConcurrentWrites: config.maxConcurrentWrites || 5
      },
      
      // Real-time analytics
      analytics: {
        enableRealTimeAggregation: config.enableRealTimeAggregation !== false,
        enableTrendAnalysis: config.enableTrendAnalysis || false,
        enablePredictiveAnalytics: config.enablePredictiveAnalytics || false,
        aggregationWindowSizes: config.aggregationWindowSizes || ['1m', '5m', '15m', '1h', '1d']
      }
    };
    
    this.deviceRegistry = new Map();
    this.metricsCollector = null;
    this.alertManager = null;
  }

  async initialize() {
    console.log('Initializing MongoDB IoT Time-Series management system...');
    
    try {
      await this.client.connect();
      this.db = this.client.db('iot_time_series_platform');
      
      // Setup time-series collections for different sensor types
      await this.setupTimeSeriesCollections();
      
      // Initialize device registry and metadata management
      await this.setupDeviceManagement();
      
      // Setup real-time aggregation pipelines
      await this.setupRealTimeAggregation();
      
      // Initialize monitoring and alerting
      await this.setupMonitoringAndAlerting();
      
      console.log('IoT Time-Series system initialized successfully');
      
    } catch (error) {
      console.error('Error initializing IoT Time-Series system:', error);
      throw error;
    }
  }

  async setupTimeSeriesCollections() {
    console.log('Setting up optimized time-series collections for IoT data...');
    
    try {
      // Environmental sensor data collection
      await this.createTimeSeriesCollection('environmental_sensors', {
        metaField: 'device',
        timeField: 'timestamp',
        granularity: 'seconds'
      });
      
      // Power monitoring collection
      await this.createTimeSeriesCollection('power_monitoring', {
        metaField: 'device',
        timeField: 'timestamp',
        granularity: 'seconds'
      });
      
      // Network performance collection
      await this.createTimeSeriesCollection('network_performance', {
        metaField: 'device',
        timeField: 'timestamp',
        granularity: 'seconds'
      });
      
      // Device health and diagnostics collection
      await this.createTimeSeriesCollection('device_diagnostics', {
        metaField: 'device',
        timeField: 'timestamp',
        granularity: 'minutes'
      });
      
      // Security events collection
      await this.createTimeSeriesCollection('security_events', {
        metaField: 'device',
        timeField: 'timestamp',
        granularity: 'seconds'
      });

    } catch (error) {
      console.error('Error setting up time-series collections:', error);
      throw error;
    }
  }

  async createTimeSeriesCollection(collectionName, timeSeriesOptions) {
    console.log(`Creating optimized time-series collection: ${collectionName}`);
    
    try {
      // Create time-series collection with MongoDB native optimization
      await this.db.createCollection(collectionName, {
        timeseries: {
          timeField: timeSeriesOptions.timeField,
          metaField: timeSeriesOptions.metaField,
          granularity: timeSeriesOptions.granularity
        },
        // Enable compression for storage efficiency
        storageEngine: {
          wiredTiger: {
            configString: 'block_compressor=zstd'
          }
        }
      });
      
      const collection = this.db.collection(collectionName);
      
      // Create optimized indexes for time-series access patterns
      await collection.createIndex({ 
        [timeSeriesOptions.metaField + '.device_id']: 1, 
        [timeSeriesOptions.timeField]: -1 
      });
      
      await collection.createIndex({ 
        [timeSeriesOptions.metaField + '.location']: 1, 
        [timeSeriesOptions.timeField]: -1 
      });
      
      await collection.createIndex({ 
        [timeSeriesOptions.metaField + '.sensor_type']: 1, 
        [timeSeriesOptions.timeField]: -1 
      });
      
      // Store collection reference
      this.timeSeriesCollections.set(collectionName, {
        collection: collection,
        options: timeSeriesOptions
      });
      
      console.log(`Time-series collection ${collectionName} created successfully`);
      
    } catch (error) {
      console.error(`Error creating time-series collection ${collectionName}:`, error);
      throw error;
    }
  }

  async setupDeviceManagement() {
    console.log('Setting up device registry and metadata management...');
    
    const deviceRegistry = this.db.collection('device_registry');
    
    // Create indexes for device management
    await deviceRegistry.createIndex({ device_id: 1 }, { unique: true });
    await deviceRegistry.createIndex({ location: 1 });
    await deviceRegistry.createIndex({ sensor_type: 1 });
    await deviceRegistry.createIndex({ status: 1, last_seen: -1 });
    
    // Create device groups collection for hierarchical organization
    const deviceGroups = this.db.collection('device_groups');
    await deviceGroups.createIndex({ group_id: 1 }, { unique: true });
    await deviceGroups.createIndex({ parent_group: 1 });
  }

  async registerIoTDevice(deviceData) {
    console.log(`Registering IoT device: ${deviceData.device_id}`);
    
    try {
      const deviceRegistry = this.db.collection('device_registry');
      
      // Check for existing device
      const existingDevice = await deviceRegistry.findOne({ device_id: deviceData.device_id });
      if (existingDevice) {
        throw new Error(`Device already registered: ${deviceData.device_id}`);
      }

      const deviceRegistration = {
        device_id: deviceData.device_id,
        device_name: deviceData.device_name,
        sensor_type: deviceData.sensor_type,
        
        // Location and installation information
        location: {
          building: deviceData.building,
          floor: deviceData.floor,
          room: deviceData.room,
          coordinates: {
            latitude: deviceData.latitude || null,
            longitude: deviceData.longitude || null
          },
          zone: deviceData.zone || null
        },
        
        // Technical specifications
        specifications: {
          model: deviceData.model,
          manufacturer: deviceData.manufacturer,
          firmware_version: deviceData.firmware_version,
          hardware_revision: deviceData.hardware_revision,
          communication_protocol: deviceData.communication_protocol || 'mqtt',
          power_source: deviceData.power_source || 'battery',
          sampling_rate: deviceData.sampling_rate || 60 // seconds
        },
        
        // Operational configuration
        configuration: {
          data_retention_days: deviceData.data_retention_days || 365,
          alert_thresholds: deviceData.alert_thresholds || {},
          measurement_units: deviceData.measurement_units || {},
          calibration_data: deviceData.calibration_data || {},
          quality_settings: deviceData.quality_settings || {}
        },
        
        // Status and monitoring
        status: 'active',
        health_status: 'unknown',
        last_seen: null,
        last_reading: null,
        
        // Registration metadata
        registered_at: new Date(),
        updated_at: new Date(),
        registered_by: deviceData.registered_by || 'system'
      };

      const result = await deviceRegistry.insertOne(deviceRegistration);
      
      // Add to in-memory registry for quick access
      this.deviceRegistry.set(deviceData.device_id, deviceRegistration);
      
      console.log(`Device ${deviceData.device_id} registered successfully`);
      return {
        success: true,
        device_id: deviceData.device_id,
        registration_id: result.insertedId
      };

    } catch (error) {
      console.error(`Error registering device ${deviceData.device_id}:`, error);
      throw error;
    }
  }

  async insertSensorData(collectionName, deviceId, sensorData, options = {}) {
    console.log(`Inserting sensor data for device ${deviceId} into ${collectionName}`);
    
    try {
      const timeSeriesInfo = this.timeSeriesCollections.get(collectionName);
      if (!timeSeriesInfo) {
        throw new Error(`Time-series collection not found: ${collectionName}`);
      }
      
      const collection = timeSeriesInfo.collection;
      
      // Get device metadata
      const deviceInfo = await this.getDeviceInfo(deviceId);
      if (!deviceInfo) {
        throw new Error(`Device not registered: ${deviceId}`);
      }
      
      // Prepare optimized time-series document
      const timeSeriesDocument = {
        timestamp: sensorData.timestamp || new Date(),
        
        // Device metadata (stored efficiently in metaField)
        device: {
          device_id: deviceId,
          sensor_type: deviceInfo.sensor_type,
          location: deviceInfo.location,
          model: deviceInfo.specifications.model
        },
        
        // Sensor measurements (optimized structure)
        measurements: this.optimizeMeasurements(sensorData.measurements),
        
        // Data quality indicators
        quality: {
          signal_strength: sensorData.signal_strength,
          battery_level: sensorData.battery_level,
          reading_quality: sensorData.reading_quality || 'good',
          data_source: sensorData.data_source || 'sensor'
        },
        
        // Operational metadata
        metadata: {
          firmware_version: deviceInfo.specifications.firmware_version,
          sampling_interval: deviceInfo.specifications.sampling_rate,
          processing_flags: sensorData.processing_flags || []
        }
      };
      
      // Apply data validation if enabled
      if (this.config.iotOptimization.enableDataValidation) {
        await this.validateSensorData(deviceId, timeSeriesDocument);
      }
      
      // Insert with time-series optimization
      const result = await collection.insertOne(timeSeriesDocument, {
        writeConcern: { w: 'majority', j: true }
      });
      
      // Update device last seen timestamp
      await this.updateDeviceLastSeen(deviceId);
      
      // Trigger real-time aggregation if enabled
      if (this.config.analytics.enableRealTimeAggregation) {
        await this.triggerRealTimeAggregation(collectionName, deviceId, timeSeriesDocument);
      }
      
      return {
        success: true,
        inserted_id: result.insertedId,
        collection: collectionName,
        device_id: deviceId,
        timestamp: timeSeriesDocument.timestamp
      };

    } catch (error) {
      console.error(`Error inserting sensor data for device ${deviceId}:`, error);
      throw error;
    }
  }

  optimizeMeasurements(measurements) {
    if (!measurements || typeof measurements !== 'object') {
      return measurements;
    }
    
    // Optimize measurement structure for compression and query performance
    const optimized = {};
    
    Object.entries(measurements).forEach(([key, value]) => {
      if (typeof value === 'number') {
        // Round to reasonable precision to improve compression
        optimized[key] = Math.round(value * 100) / 100;
      } else {
        optimized[key] = value;
      }
    });
    
    return optimized;
  }

  async validateSensorData(deviceId, document) {
    const deviceInfo = this.deviceRegistry.get(deviceId);
    if (!deviceInfo) return;
    
    // Apply device-specific validation rules
    const thresholds = deviceInfo.configuration.alert_thresholds;
    
    Object.entries(document.measurements).forEach(([measurement, value]) => {
      if (thresholds[measurement]) {
        const threshold = thresholds[measurement];
        
        if (value < threshold.min || value > threshold.max) {
          // Log anomaly but don't reject data
          console.warn(`Measurement ${measurement} out of range for device ${deviceId}: ${value}`);
          document.quality.anomaly_detected = true;
          document.quality.anomaly_type = `${measurement}_out_of_range`;
        }
      }
    });
  }

  async getDeviceInfo(deviceId) {
    if (this.deviceRegistry.has(deviceId)) {
      return this.deviceRegistry.get(deviceId);
    }
    
    const deviceRegistry = this.db.collection('device_registry');
    const device = await deviceRegistry.findOne({ device_id: deviceId });
    
    if (device) {
      this.deviceRegistry.set(deviceId, device);
    }
    
    return device;
  }

  async updateDeviceLastSeen(deviceId) {
    try {
      const deviceRegistry = this.db.collection('device_registry');
      
      await deviceRegistry.updateOne(
        { device_id: deviceId },
        { 
          $set: { 
            last_seen: new Date(),
            updated_at: new Date()
          }
        }
      );
      
      // Update in-memory cache
      if (this.deviceRegistry.has(deviceId)) {
        const device = this.deviceRegistry.get(deviceId);
        device.last_seen = new Date();
        device.updated_at = new Date();
      }

    } catch (error) {
      console.error(`Error updating last seen for device ${deviceId}:`, error);
      // Don't throw - last seen updates shouldn't break data insertion
    }
  }

  async queryTimeSeriesData(collectionName, query = {}, options = {}) {
    console.log(`Querying time-series data from ${collectionName}`);
    
    try {
      const timeSeriesInfo = this.timeSeriesCollections.get(collectionName);
      if (!timeSeriesInfo) {
        throw new Error(`Time-series collection not found: ${collectionName}`);
      }
      
      const collection = timeSeriesInfo.collection;
      const startTime = Date.now();
      
      // Apply time-series optimized query patterns
      const optimizedQuery = this.optimizeTimeSeriesQuery(query);
      const optimizedOptions = this.optimizeQueryOptions(options);
      
      const results = await collection.find(optimizedQuery, optimizedOptions).toArray();
      const queryTime = Date.now() - startTime;
      
      console.log(`Time-series query completed in ${queryTime}ms, returned ${results.length} documents`);
      
      return {
        data: results,
        metadata: {
          collection: collectionName,
          query_time_ms: queryTime,
          document_count: results.length,
          query: optimizedQuery
        }
      };

    } catch (error) {
      console.error(`Error querying time-series data from ${collectionName}:`, error);
      throw error;
    }
  }

  optimizeTimeSeriesQuery(query) {
    const optimized = { ...query };
    
    // Optimize time range queries for time-series performance
    if (query.timestamp) {
      optimized.timestamp = query.timestamp;
    } else if (query.timeRange) {
      optimized.timestamp = {
        $gte: new Date(query.timeRange.start),
        $lte: new Date(query.timeRange.end)
      };
      delete optimized.timeRange;
    }
    
    // Optimize device filtering for metadata field
    if (query.device_id) {
      optimized['device.device_id'] = query.device_id;
      delete optimized.device_id;
    }
    
    if (query.sensor_type) {
      optimized['device.sensor_type'] = query.sensor_type;
      delete optimized.sensor_type;
    }
    
    return optimized;
  }

  optimizeQueryOptions(options) {
    const optimized = {
      ...options,
      // Default sort by timestamp descending for time-series efficiency
      sort: options.sort || { timestamp: -1 },
      // Limit results for performance unless explicitly requested
      limit: options.limit || 1000
    };
    
    return optimized;
  }

  // Advanced time-series aggregation operations
  async generateDeviceAnalytics(deviceId, timeRange, granularity = '1h') {
    console.log(`Generating analytics for device ${deviceId} with ${granularity} granularity`);
    
    try {
      const pipeline = [
        {
          $match: {
            'device.device_id': deviceId,
            timestamp: {
              $gte: new Date(timeRange.start),
              $lte: new Date(timeRange.end)
            }
          }
        },
        {
          $group: {
            _id: {
              $dateTrunc: {
                date: '$timestamp',
                unit: this.getTimeUnit(granularity),
                binSize: this.getBinSize(granularity)
              }
            },
            
            // Basic statistics
            reading_count: { $sum: 1 },
            avg_signal_strength: { $avg: '$quality.signal_strength' },
            avg_battery_level: { $avg: '$quality.battery_level' },
            
            // Measurement aggregations (dynamic based on sensor type)
            measurements: {
              $push: '$measurements'
            }
          }
        },
        {
          $addFields: {
            timestamp: '$_id',
            // Calculate measurement statistics
            measurement_stats: {
              $reduce: {
                input: '$measurements',
                initialValue: {},
                in: this.createMeasurementReducer()
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            timestamp: 1,
            reading_count: 1,
            avg_signal_strength: 1,
            avg_battery_level: 1,
            measurement_stats: 1
          }
        },
        {
          $sort: { timestamp: 1 }
        }
      ];
      
      // Execute aggregation on appropriate collection
      const collection = this.getCollectionForDevice(deviceId);
      const results = await collection.aggregate(pipeline).toArray();
      
      return {
        device_id: deviceId,
        time_range: timeRange,
        granularity: granularity,
        analytics: results
      };

    } catch (error) {
      console.error(`Error generating analytics for device ${deviceId}:`, error);
      throw error;
    }
  }

  async generateFleetAnalytics(fleetQuery, timeRange, granularity = '1h') {
    console.log(`Generating fleet analytics with ${granularity} granularity`);
    
    try {
      const pipeline = [
        {
          $match: {
            ...this.optimizeTimeSeriesQuery(fleetQuery),
            timestamp: {
              $gte: new Date(timeRange.start),
              $lte: new Date(timeRange.end)
            }
          }
        },
        {
          $group: {
            _id: {
              time_bucket: {
                $dateTrunc: {
                  date: '$timestamp',
                  unit: this.getTimeUnit(granularity),
                  binSize: this.getBinSize(granularity)
                }
              },
              device_id: '$device.device_id',
              location: '$device.location.building'
            },
            
            // Device-level aggregations
            reading_count: { $sum: 1 },
            avg_battery: { $avg: '$quality.battery_level' },
            avg_signal: { $avg: '$quality.signal_strength' },
            
            // Measurement aggregations
            measurements: { $push: '$measurements' }
          }
        },
        {
          $group: {
            _id: '$_id.time_bucket',
            
            // Fleet-level metrics
            total_devices: { $sum: 1 },
            total_readings: { $sum: '$reading_count' },
            avg_fleet_battery: { $avg: '$avg_battery' },
            avg_fleet_signal: { $avg: '$avg_signal' },
            
            // Device health distribution
            healthy_devices: {
              $sum: {
                $cond: [
                  { $and: [
                    { $gte: ['$avg_battery', 20] },
                    { $gte: ['$avg_signal', 50] }
                  ]},
                  1,
                  0
                ]
              }
            },
            
            // Location distribution
            locations: {
              $addToSet: '$_id.location'
            }
          }
        },
        {
          $addFields: {
            timestamp: '$_id',
            device_health_percentage: {
              $multiply: [
                { $divide: ['$healthy_devices', '$total_devices'] },
                100
              ]
            }
          }
        },
        {
          $project: {
            _id: 0,
            timestamp: 1,
            total_devices: 1,
            total_readings: 1,
            avg_fleet_battery: { $round: ['$avg_fleet_battery', 2] },
            avg_fleet_signal: { $round: ['$avg_fleet_signal', 2] },
            device_health_percentage: { $round: ['$device_health_percentage', 2] },
            healthy_devices: 1,
            unique_locations: { $size: '$locations' }
          }
        },
        {
          $sort: { timestamp: 1 }
        }
      ];
      
      const collection = this.db.collection('environmental_sensors'); // Default collection
      const results = await collection.aggregate(pipeline).toArray();
      
      return {
        fleet_query: fleetQuery,
        time_range: timeRange,
        granularity: granularity,
        analytics: results
      };

    } catch (error) {
      console.error(`Error generating fleet analytics:`, error);
      throw error;
    }
  }

  getTimeUnit(granularity) {
    const unitMap = {
      '1s': 'second',
      '1m': 'minute',
      '5m': 'minute',
      '15m': 'minute',
      '1h': 'hour',
      '1d': 'day'
    };
    return unitMap[granularity] || 'hour';
  }

  getBinSize(granularity) {
    const binMap = {
      '1s': 1,
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '1h': 1,
      '1d': 1
    };
    return binMap[granularity] || 1;
  }

  createMeasurementReducer() {
    return {
      $function: {
        body: `function(accumulator, measurement) {
          for (let key in measurement) {
            if (typeof measurement[key] === 'number') {
              if (!accumulator[key]) {
                accumulator[key] = { sum: 0, count: 0, min: measurement[key], max: measurement[key] };
              }
              accumulator[key].sum += measurement[key];
              accumulator[key].count++;
              accumulator[key].min = Math.min(accumulator[key].min, measurement[key]);
              accumulator[key].max = Math.max(accumulator[key].max, measurement[key]);
              accumulator[key].avg = accumulator[key].sum / accumulator[key].count;
            }
          }
          return accumulator;
        }`,
        args: ['$$value', '$$this'],
        lang: 'js'
      }
    };
  }

  getCollectionForDevice(deviceId) {
    // Simple mapping - in production, this would use device registry
    return this.timeSeriesCollections.get('environmental_sensors').collection;
  }

  async setupRealTimeAggregation() {
    if (!this.config.analytics.enableRealTimeAggregation) {
      return;
    }
    
    console.log('Setting up real-time aggregation pipelines...');
    
    // Setup materialized views for common aggregations
    await this.createMaterializedViews();
    
    // Setup change streams for real-time updates
    await this.setupChangeStreams();
  }

  async createMaterializedViews() {
    console.log('Creating materialized views for real-time analytics...');
    
    // Hourly device summaries
    await this.db.createCollection('device_hourly_summary');
    
    // Daily fleet metrics  
    await this.db.createCollection('fleet_daily_metrics');
    
    // Real-time alerts collection
    await this.db.createCollection('real_time_alerts');
  }

  async setupChangeStreams() {
    console.log('Setting up change streams for real-time processing...');
    
    for (const [collectionName, collectionInfo] of this.timeSeriesCollections) {
      const collection = collectionInfo.collection;
      
      const changeStream = collection.watch([], { fullDocument: 'updateLookup' });
      
      changeStream.on('change', async (change) => {
        if (change.operationType === 'insert') {
          await this.processRealTimeInsert(collectionName, change.fullDocument);
        }
      });
    }
  }

  async processRealTimeInsert(collectionName, document) {
    try {
      // Update real-time aggregations
      await this.updateRealTimeAggregations(collectionName, document);
      
      // Check for alerts
      if (this.config.performance.enableAlerts) {
        await this.checkAlertConditions(document);
      }

    } catch (error) {
      console.error(`Error processing real-time insert:`, error);
      // Don't throw - real-time processing shouldn't break inserts
    }
  }

  async updateRealTimeAggregations(collectionName, document) {
    const deviceId = document.device.device_id;
    const timestamp = document.timestamp;
    const hourBucket = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate(), timestamp.getHours());
    
    // Update hourly device summary
    const deviceHourlySummary = this.db.collection('device_hourly_summary');
    
    await deviceHourlySummary.updateOne(
      {
        device_id: deviceId,
        hour_bucket: hourBucket
      },
      {
        $inc: {
          reading_count: 1,
          'quality.signal_strength_sum': document.quality.signal_strength || 0,
          'quality.battery_level_sum': document.quality.battery_level || 0
        },
        $min: {
          'timestamp.first_reading': timestamp
        },
        $max: {
          'timestamp.last_reading': timestamp
        },
        $set: {
          device: document.device,
          updated_at: new Date()
        }
      },
      { upsert: true }
    );
  }

  async checkAlertConditions(document) {
    const deviceId = document.device.device_id;
    const deviceInfo = await this.getDeviceInfo(deviceId);
    
    if (!deviceInfo || !deviceInfo.configuration.alert_thresholds) {
      return;
    }
    
    const thresholds = deviceInfo.configuration.alert_thresholds;
    const alerts = [];
    
    // Check measurement thresholds
    Object.entries(document.measurements).forEach(([measurement, value]) => {
      const threshold = thresholds[measurement];
      if (threshold) {
        if (value < threshold.critical_min || value > threshold.critical_max) {
          alerts.push({
            type: 'critical_threshold',
            measurement: measurement,
            value: value,
            threshold: threshold,
            severity: 'critical'
          });
        } else if (value < threshold.warning_min || value > threshold.warning_max) {
          alerts.push({
            type: 'warning_threshold',
            measurement: measurement,
            value: value,
            threshold: threshold,
            severity: 'warning'
          });
        }
      }
    });
    
    // Check device health
    if (document.quality.battery_level < 20) {
      alerts.push({
        type: 'low_battery',
        value: document.quality.battery_level,
        severity: 'warning'
      });
    }
    
    if (document.quality.signal_strength < 30) {
      alerts.push({
        type: 'poor_signal',
        value: document.quality.signal_strength,
        severity: 'warning'
      });
    }
    
    // Store alerts if any
    if (alerts.length > 0) {
      await this.storeAlerts(deviceId, document.timestamp, alerts);
    }
  }

  async storeAlerts(deviceId, timestamp, alerts) {
    const realTimeAlerts = this.db.collection('real_time_alerts');
    
    const alertDocument = {
      device_id: deviceId,
      timestamp: timestamp,
      alerts: alerts,
      status: 'active',
      created_at: new Date()
    };
    
    await realTimeAlerts.insertOne(alertDocument);
    console.log(`Stored ${alerts.length} alerts for device ${deviceId}`);
  }

  async setupMonitoringAndAlerting() {
    if (this.config.performance.enableMetrics) {
      console.log('Setting up performance monitoring and alerting...');
      
      // Create metrics collection
      const metricsCollection = this.db.collection('system_metrics');
      await metricsCollection.createIndex({ timestamp: -1 });
      await metricsCollection.createIndex({ metric_type: 1, timestamp: -1 });
      
      // Start metrics collection
      this.startMetricsCollection();
    }
  }

  startMetricsCollection() {
    setInterval(async () => {
      try {
        await this.collectSystemMetrics();
      } catch (error) {
        console.error('Error collecting system metrics:', error);
      }
    }, 60000); // Collect metrics every minute
  }

  async collectSystemMetrics() {
    const timestamp = new Date();
    
    // Collect performance metrics for each time-series collection
    for (const [collectionName, collectionInfo] of this.timeSeriesCollections) {
      const collection = collectionInfo.collection;
      
      // Get collection stats
      const stats = await this.db.runCommand({ collStats: collectionName });
      
      // Calculate recent insertion rate
      const oneMinuteAgo = new Date(timestamp.getTime() - 60000);
      const recentInserts = await collection.countDocuments({
        timestamp: { $gte: oneMinuteAgo }
      });
      
      const metrics = {
        timestamp: timestamp,
        metric_type: 'collection_performance',
        collection_name: collectionName,
        metrics: {
          document_count: stats.count,
          storage_size: stats.storageSize,
          index_size: stats.totalIndexSize,
          recent_inserts_per_minute: recentInserts,
          avg_object_size: stats.avgObjSize
        }
      };
      
      await this.db.collection('system_metrics').insertOne(metrics);
    }
  }
}

// Example usage: Comprehensive IoT time-series platform
async function demonstrateIoTTimeSeriesManagement() {
  const iotManager = new MongoDBIoTTimeSeriesManager('mongodb://localhost:27017', {
    enableRealTimeAggregation: true,
    enableAnomalyDetection: true,
    enableMetrics: true,
    hotDataRetentionDays: 30,
    warmDataRetentionDays: 90
  });
  
  await iotManager.initialize();
  
  // Register IoT devices
  await iotManager.registerIoTDevice({
    device_id: 'ENV_SENSOR_001',
    device_name: 'Environmental Sensor - Conference Room A',
    sensor_type: 'environmental',
    building: 'Main Office',
    floor: 2,
    room: 'Conference Room A',
    model: 'SensorTech ST-ENV-2000',
    manufacturer: 'SensorTech Corp',
    firmware_version: 'v2.1.3',
    communication_protocol: 'mqtt',
    sampling_rate: 60,
    alert_thresholds: {
      temperature: { min: 18, max: 26, warning_min: 20, warning_max: 24, critical_min: 15, critical_max: 30 },
      humidity: { min: 30, max: 70, warning_min: 40, warning_max: 60, critical_min: 20, critical_max: 80 }
    }
  });
  
  // Insert time-series sensor data
  await iotManager.insertSensorData('environmental_sensors', 'ENV_SENSOR_001', {
    measurements: {
      temperature: 22.5,
      humidity: 55.2,
      pressure: 1013.25,
      light_level: 450
    },
    signal_strength: 85,
    battery_level: 92,
    reading_quality: 'excellent'
  });
  
  // Generate device analytics
  const deviceAnalytics = await iotManager.generateDeviceAnalytics(
    'ENV_SENSOR_001',
    {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      end: new Date()
    },
    '1h'
  );
  
  console.log('Device Analytics:', deviceAnalytics);
  
  // Generate fleet analytics
  const fleetAnalytics = await iotManager.generateFleetAnalytics(
    { 'device.sensor_type': 'environmental' },
    {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      end: new Date()
    },
    '1d'
  );
  
  console.log('Fleet Analytics:', fleetAnalytics);
}

module.exports = {
  MongoDBIoTTimeSeriesManager
};
```

## Understanding MongoDB Time-Series Architecture for IoT

### Native Time-Series Optimization and Storage Efficiency

MongoDB's time-series collections provide specialized optimization for IoT data management:

```javascript
// Enterprise-grade IoT analytics with advanced time-series optimization
class EnterpriseIoTAnalyticsManager extends MongoDBIoTTimeSeriesManager {
  constructor(connectionString, enterpriseConfig) {
    super(connectionString, enterpriseConfig);
    
    this.enterpriseConfig = {
      ...enterpriseConfig,
      
      // Advanced analytics capabilities
      enablePredictiveAnalytics: true,
      enableMachineLearning: true,
      enableAnomalyDetection: true,
      enableTrendForecasting: true,
      
      // Performance optimization
      enableDataPreAggregation: true,
      enableIntelligentArchival: true,
      enableAdaptiveIndexing: true,
      enableQueryOptimization: true,
      
      // Enterprise features
      enableDataLineage: true,
      enableComplianceTracking: true,
      enableDataGovernance: true,
      enableAuditTrails: true
    };
  }

  async setupAdvancedAnalytics() {
    console.log('Setting up enterprise-grade IoT analytics pipelines...');
    
    // Setup predictive analytics collections
    await this.setupPredictiveAnalytics();
    
    // Initialize machine learning pipelines
    await this.setupMachineLearningPipelines();
    
    // Configure intelligent data lifecycle management
    await this.setupIntelligentDataLifecycle();
  }

  async performPredictiveAnalysis(deviceId, predictionHorizon = '7d') {
    console.log(`Performing predictive analysis for device ${deviceId}...`);
    
    const pipeline = [
      {
        $match: {
          'device.device_id': deviceId,
          timestamp: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days historical
          }
        }
      },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: '$timestamp',
              unit: 'hour'
            }
          },
          avg_temperature: { $avg: '$measurements.temperature' },
          avg_humidity: { $avg: '$measurements.humidity' },
          avg_battery: { $avg: '$quality.battery_level' },
          reading_count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $setWindowFields: {
          sortBy: { _id: 1 },
          output: {
            // Calculate moving averages
            temp_7h_ma: {
              $avg: '$avg_temperature',
              window: { range: [-3, 3], unit: 'position' }
            },
            humidity_7h_ma: {
              $avg: '$avg_humidity',
              window: { range: [-3, 3], unit: 'position' }
            },
            // Calculate trends
            temp_trend: {
              $linearFill: '$avg_temperature'
            },
            battery_degradation: {
              $derivative: {
                input: '$avg_battery',
                unit: 'hour'
              }
            }
          }
        }
      }
    ];
    
    const collection = this.getCollectionForDevice(deviceId);
    const results = await collection.aggregate(pipeline).toArray();
    
    return this.generatePredictions(results, predictionHorizon);
  }

  generatePredictions(historicalData, horizon) {
    // Simplified prediction logic - in production, use advanced ML models
    const predictions = {
      temperature: this.predictTrend(historicalData, 'temp_trend', horizon),
      humidity: this.predictTrend(historicalData, 'humidity_7h_ma', horizon),
      battery_life: this.predictBatteryLife(historicalData),
      maintenance_needed: this.predictMaintenanceWindow(historicalData),
      anomaly_probability: this.calculateAnomalyProbability(historicalData)
    };
    
    return predictions;
  }

  async performFleetOptimizationAnalysis(fleetQuery) {
    console.log('Performing fleet optimization analysis...');
    
    const pipeline = [
      {
        $match: this.optimizeTimeSeriesQuery(fleetQuery)
      },
      {
        $group: {
          _id: '$device.device_id',
          
          // Performance metrics
          avg_efficiency: { $avg: '$measurements.efficiency' },
          avg_power_consumption: { $avg: '$measurements.power_consumption' },
          avg_uptime: { $avg: { $cond: [{ $gt: ['$quality.signal_strength', 0] }, 1, 0] } },
          
          // Maintenance indicators
          maintenance_score: {
            $avg: {
              $add: [
                { $cond: [{ $lt: ['$quality.battery_level', 30] }, 0.3, 0] },
                { $cond: [{ $lt: ['$quality.signal_strength', 50] }, 0.2, 0] },
                { $cond: [{ $gt: ['$measurements.temperature', 25] }, 0.2, 0] }
              ]
            }
          },
          
          // Location and deployment data
          location: { $first: '$device.location' },
          last_seen: { $max: '$timestamp' }
        }
      },
      {
        $addFields: {
          // Calculate optimization recommendations
          optimization_priority: {
            $cond: [
              { $gt: ['$maintenance_score', 0.5] }, 'high',
              { $cond: [
                { $gt: ['$maintenance_score', 0.3] }, 'medium', 'low'
              ]}
            ]
          },
          
          efficiency_grade: {
            $cond: [
              { $gt: ['$avg_efficiency', 0.8] }, 'A',
              { $cond: [
                { $gt: ['$avg_efficiency', 0.6] }, 'B',
                { $cond: [
                  { $gt: ['$avg_efficiency', 0.4] }, 'C', 'D'
                ]}
              ]}
            ]
          }
        }
      },
      {
        $sort: { maintenance_score: -1, avg_efficiency: 1 }
      }
    ];
    
    const collection = this.db.collection('environmental_sensors');
    const results = await collection.aggregate(pipeline).toArray();
    
    return this.generateFleetOptimizationReport(results);
  }

  generateFleetOptimizationReport(analysisResults) {
    const report = {
      generated_at: new Date(),
      total_devices: analysisResults.length,
      
      // Fleet health summary
      health_distribution: {
        high_priority: analysisResults.filter(d => d.optimization_priority === 'high').length,
        medium_priority: analysisResults.filter(d => d.optimization_priority === 'medium').length,
        low_priority: analysisResults.filter(d => d.optimization_priority === 'low').length
      },
      
      // Efficiency distribution
      efficiency_grades: {
        grade_a: analysisResults.filter(d => d.efficiency_grade === 'A').length,
        grade_b: analysisResults.filter(d => d.efficiency_grade === 'B').length,
        grade_c: analysisResults.filter(d => d.efficiency_grade === 'C').length,
        grade_d: analysisResults.filter(d => d.efficiency_grade === 'D').length
      },
      
      // Detailed device recommendations
      device_recommendations: analysisResults.slice(0, 10), // Top 10 priority devices
      
      // Fleet-wide recommendations
      fleet_recommendations: this.generateFleetRecommendations(analysisResults)
    };
    
    return report;
  }

  generateFleetRecommendations(devices) {
    const recommendations = [];
    
    const highMaintenanceDevices = devices.filter(d => d.maintenance_score > 0.5);
    if (highMaintenanceDevices.length > devices.length * 0.2) {
      recommendations.push({
        type: 'maintenance_schedule',
        priority: 'high',
        description: `${highMaintenanceDevices.length} devices require immediate maintenance attention`,
        action: 'Schedule preventive maintenance for high-priority devices'
      });
    }
    
    const lowEfficiencyDevices = devices.filter(d => d.efficiency_grade === 'D');
    if (lowEfficiencyDevices.length > 0) {
      recommendations.push({
        type: 'efficiency_improvement',
        priority: 'medium',
        description: `${lowEfficiencyDevices.length} devices operating at low efficiency`,
        action: 'Review device configuration and environmental conditions'
      });
    }
    
    return recommendations;
  }
}
```

## QueryLeaf Time-Series Operations

QueryLeaf provides familiar SQL syntax for MongoDB time-series operations and IoT analytics:

```sql
-- QueryLeaf time-series operations with SQL-familiar syntax for MongoDB IoT analytics

-- Create time-series enabled tables for IoT sensor data
CREATE TABLE environmental_sensors (
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    
    -- Device metadata (automatically optimized in MongoDB metaField)
    location JSONB NOT NULL,
    device_model VARCHAR(100),
    firmware_version VARCHAR(50),
    
    -- Sensor measurements (stored efficiently in MongoDB measurements)
    temperature DECIMAL(5,2),
    humidity DECIMAL(5,2),
    pressure DECIMAL(7,2),
    light_level INTEGER,
    air_quality_index INTEGER,
    
    -- Device health indicators
    battery_level DECIMAL(5,2),
    signal_strength INTEGER,
    reading_quality VARCHAR(20) DEFAULT 'good',
    
    -- Quality and operational metadata
    data_source VARCHAR(50) DEFAULT 'sensor',
    processing_flags TEXT[],
    
    -- Time-series optimization (QueryLeaf automatically configures MongoDB time-series collection)
    PRIMARY KEY (device_id, timestamp),
    
    -- Time-series specific indexes (optimized for temporal queries)
    INDEX ts_device_time_idx (device_id, timestamp DESC),
    INDEX ts_sensor_type_time_idx (sensor_type, timestamp DESC),
    INDEX ts_location_time_idx ((location->>'building'), (location->>'floor'), timestamp DESC)
    
) WITH (
    -- MongoDB time-series collection configuration
    timeseries_timefield = 'timestamp',
    timeseries_metafield = 'device_metadata',
    timeseries_granularity = 'seconds',
    
    -- Storage optimization
    compression_algorithm = 'zstd',
    enable_compression = true,
    
    -- Performance settings
    enable_time_series_optimization = true,
    enable_automatic_bucketing = true,
    bucket_max_span_seconds = 3600 -- 1 hour buckets
);

-- Power monitoring time-series table
CREATE TABLE power_monitoring (
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    meter_type VARCHAR(50) NOT NULL,
    
    -- Device and location metadata
    location JSONB NOT NULL,
    circuit_id VARCHAR(50),
    panel_id VARCHAR(50),
    
    -- Power measurements
    voltage DECIMAL(6,2),
    current DECIMAL(8,3),
    power_active DECIMAL(10,2),
    power_reactive DECIMAL(10,2),
    power_factor DECIMAL(4,3),
    frequency DECIMAL(5,2),
    energy_consumed_kwh DECIMAL(12,3),
    
    -- Power quality metrics
    voltage_thd DECIMAL(5,2), -- Total Harmonic Distortion
    current_thd DECIMAL(5,2),
    power_interruptions INTEGER DEFAULT 0,
    
    -- Device status
    meter_status VARCHAR(20) DEFAULT 'operational',
    communication_status VARCHAR(20) DEFAULT 'online',
    last_calibration_date DATE,
    
    PRIMARY KEY (device_id, timestamp),
    INDEX ts_power_device_time_idx (device_id, timestamp DESC),
    INDEX ts_power_circuit_time_idx (circuit_id, timestamp DESC),
    INDEX ts_power_consumption_idx (energy_consumed_kwh, timestamp DESC)
    
) WITH (
    timeseries_timefield = 'timestamp',
    timeseries_metafield = 'meter_metadata',
    timeseries_granularity = 'seconds',
    compression_algorithm = 'zstd',
    enable_time_series_optimization = true
);

-- Advanced time-series data insertion with automatic optimization
INSERT INTO environmental_sensors (
    timestamp, device_id, sensor_type, location, device_model, firmware_version,
    temperature, humidity, pressure, light_level, air_quality_index,
    battery_level, signal_strength, reading_quality
)
SELECT 
    -- Generate realistic time-series data for demonstration
    CURRENT_TIMESTAMP - (generate_series * INTERVAL '1 minute'),
    'ENV_SENSOR_' || LPAD(device_num::text, 3, '0'),
    'environmental',
    
    -- Location data as JSONB
    JSON_BUILD_OBJECT(
        'building', 'Building ' || CHAR(64 + (device_num % 3) + 1),
        'floor', (device_num % 5) + 1,
        'room', 'Room ' || LPAD(((device_num % 20) + 1)::text, 3, '0'),
        'zone', 'Zone ' || CHAR(64 + (device_num % 4) + 1),
        'coordinates', JSON_BUILD_OBJECT(
            'latitude', 40.7128 + (RANDOM() - 0.5) * 0.01,
            'longitude', -74.0060 + (RANDOM() - 0.5) * 0.01
        )
    ),
    
    'SensorTech ST-ENV-2000',
    'v2.1.' || (3 + (device_num % 5))::text,
    
    -- Environmental measurements with realistic variations
    ROUND((20 + 5 * SIN(generate_series * 0.1) + (RANDOM() - 0.5) * 2)::numeric, 2) as temperature,
    ROUND((50 + 10 * COS(generate_series * 0.05) + (RANDOM() - 0.5) * 5)::numeric, 2) as humidity,
    ROUND((1013 + 2 * SIN(generate_series * 0.02) + (RANDOM() - 0.5) * 1)::numeric, 2) as pressure,
    (400 + (100 * SIN(generate_series * 0.3)) + (RANDOM() * 50))::integer as light_level,
    (50 + (20 * COS(generate_series * 0.1)) + (RANDOM() * 10))::integer as air_quality_index,
    
    -- Device health with degradation over time
    GREATEST(20, 100 - (generate_series * 0.001) + (RANDOM() - 0.5) * 5)::numeric(5,2) as battery_level,
    (70 + (RANDOM() * 30))::integer as signal_strength,
    
    CASE 
        WHEN RANDOM() < 0.85 THEN 'excellent'
        WHEN RANDOM() < 0.95 THEN 'good'  
        WHEN RANDOM() < 0.99 THEN 'fair'
        ELSE 'poor'
    END as reading_quality

FROM generate_series(1, 1440) as generate_series, -- 24 hours of minute-by-minute data
     generate_series(1, 50) as device_num          -- 50 devices
WHERE generate_series <= 1440; -- Limit to 24 hours

-- QueryLeaf automatically optimizes this bulk insert for MongoDB time-series collections

-- Advanced time-series analytics with SQL window functions
WITH hourly_environmental_metrics AS (
    SELECT 
        device_id,
        location->>'building' as building,
        location->>'floor' as floor,
        
        -- Time bucketing for hourly aggregation
        DATE_TRUNC('hour', timestamp) as hour_bucket,
        
        -- Basic statistical aggregations
        COUNT(*) as reading_count,
        AVG(temperature) as avg_temperature,
        MIN(temperature) as min_temperature,  
        MAX(temperature) as max_temperature,
        STDDEV(temperature) as temp_stddev,
        
        AVG(humidity) as avg_humidity,
        MIN(humidity) as min_humidity,
        MAX(humidity) as max_humidity,
        
        AVG(pressure) as avg_pressure,
        AVG(light_level) as avg_light_level,
        AVG(air_quality_index) as avg_air_quality,
        
        -- Device health metrics
        AVG(battery_level) as avg_battery_level,
        AVG(signal_strength) as avg_signal_strength,
        
        -- Data quality assessment
        COUNT(*) FILTER (WHERE reading_quality = 'excellent') as excellent_readings,
        COUNT(*) FILTER (WHERE reading_quality IN ('excellent', 'good')) as good_readings,
        (COUNT(*) FILTER (WHERE reading_quality IN ('excellent', 'good'))::DECIMAL / COUNT(*)) * 100 as quality_percentage
        
    FROM environmental_sensors
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    GROUP BY device_id, location->>'building', location->>'floor', DATE_TRUNC('hour', timestamp)
),

environmental_trends AS (
    SELECT 
        hem.*,
        
        -- Time-series trend analysis using window functions
        LAG(avg_temperature, 1) OVER (
            PARTITION BY device_id 
            ORDER BY hour_bucket
        ) as prev_hour_temp,
        
        LAG(avg_temperature, 24) OVER (
            PARTITION BY device_id 
            ORDER BY hour_bucket
        ) as same_hour_yesterday_temp,
        
        -- Calculate temperature trends
        avg_temperature - LAG(avg_temperature, 1) OVER (
            PARTITION BY device_id 
            ORDER BY hour_bucket
        ) as temp_hourly_change,
        
        avg_temperature - LAG(avg_temperature, 24) OVER (
            PARTITION BY device_id 
            ORDER BY hour_bucket
        ) as temp_daily_change,
        
        -- Moving averages for smoothing
        AVG(avg_temperature) OVER (
            PARTITION BY device_id 
            ORDER BY hour_bucket 
            ROWS BETWEEN 5 PRECEDING AND 1 FOLLOWING
        ) as temp_7h_moving_avg,
        
        AVG(avg_humidity) OVER (
            PARTITION BY device_id 
            ORDER BY hour_bucket 
            ROWS BETWEEN 5 PRECEDING AND 1 FOLLOWING  
        ) as humidity_7h_moving_avg,
        
        -- Battery degradation analysis
        FIRST_VALUE(avg_battery_level) OVER (
            PARTITION BY device_id 
            ORDER BY hour_bucket 
            ROWS UNBOUNDED PRECEDING
        ) as initial_battery_level,
        
        -- Calculate linear regression slope for trends
        REGR_SLOPE(avg_temperature, EXTRACT(EPOCH FROM hour_bucket)) OVER (
            PARTITION BY device_id
            ORDER BY hour_bucket
            ROWS BETWEEN 23 PRECEDING AND CURRENT ROW -- 24-hour window
        ) as temp_trend_slope,
        
        REGR_R2(avg_temperature, EXTRACT(EPOCH FROM hour_bucket)) OVER (
            PARTITION BY device_id
            ORDER BY hour_bucket
            ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
        ) as temp_trend_r2,
        
        -- Device performance ranking
        DENSE_RANK() OVER (
            PARTITION BY building, floor, hour_bucket
            ORDER BY quality_percentage DESC, avg_signal_strength DESC
        ) as device_performance_rank
        
    FROM hourly_environmental_metrics hem
),

anomaly_detection AS (
    SELECT 
        et.*,
        
        -- Statistical anomaly detection
        CASE 
            WHEN ABS(avg_temperature - temp_7h_moving_avg) > (2 * temp_stddev) THEN 'temperature_anomaly'
            WHEN temp_hourly_change > 5 OR temp_hourly_change < -5 THEN 'rapid_temperature_change'
            WHEN avg_battery_level < 20 THEN 'low_battery'
            WHEN avg_signal_strength < 30 THEN 'poor_connectivity'
            WHEN quality_percentage < 80 THEN 'poor_data_quality'
            ELSE 'normal'
        END as anomaly_type,
        
        -- Severity assessment
        CASE 
            WHEN avg_battery_level < 10 OR avg_signal_strength < 20 THEN 'critical'
            WHEN avg_battery_level < 20 OR avg_signal_strength < 30 OR quality_percentage < 70 THEN 'high'
            WHEN ABS(temp_hourly_change) > 3 OR quality_percentage < 90 THEN 'medium'
            ELSE 'low'
        END as anomaly_severity,
        
        -- Trend classification
        CASE 
            WHEN temp_trend_slope > 0.01 AND temp_trend_r2 > 0.7 THEN 'increasing_trend'
            WHEN temp_trend_slope < -0.01 AND temp_trend_r2 > 0.7 THEN 'decreasing_trend'
            WHEN ABS(temp_trend_slope) <= 0.01 THEN 'stable'
            ELSE 'irregular'
        END as temperature_trend_classification,
        
        -- Battery health assessment  
        CASE 
            WHEN (initial_battery_level - avg_battery_level) / GREATEST(EXTRACT(DAYS FROM (hour_bucket - (SELECT MIN(hour_bucket) FROM environmental_trends WHERE device_id = et.device_id))), 1) > 2 THEN 'fast_degradation'
            WHEN (initial_battery_level - avg_battery_level) / GREATEST(EXTRACT(DAYS FROM (hour_bucket - (SELECT MIN(hour_bucket) FROM environmental_trends WHERE device_id = et.device_id))), 1) > 0.5 THEN 'normal_degradation'
            ELSE 'stable_battery'
        END as battery_health_status
        
    FROM environmental_trends et
)

-- Generate comprehensive IoT device analytics report
SELECT 
    ad.device_id,
    ad.building,
    ad.floor,
    ad.hour_bucket,
    
    -- Current measurements
    ROUND(ad.avg_temperature, 2) as current_avg_temperature,
    ROUND(ad.avg_humidity, 2) as current_avg_humidity,
    ROUND(ad.avg_pressure, 2) as current_avg_pressure,
    ad.avg_light_level,
    ad.avg_air_quality,
    
    -- Trend analysis
    ROUND(ad.temp_7h_moving_avg, 2) as temperature_trend,
    ROUND(ad.temp_hourly_change, 2) as hourly_temp_change,
    ROUND(ad.temp_daily_change, 2) as daily_temp_change,
    ad.temperature_trend_classification,
    
    -- Device health
    ROUND(ad.avg_battery_level, 1) as battery_level,
    ad.avg_signal_strength,
    ROUND(ad.quality_percentage, 1) as data_quality_pct,
    ad.battery_health_status,
    
    -- Performance metrics
    ad.reading_count,
    ad.device_performance_rank,
    
    -- Anomaly and alert information
    ad.anomaly_type,
    ad.anomaly_severity,
    
    -- Operational insights
    CASE 
        WHEN ad.anomaly_severity = 'critical' THEN 'immediate_maintenance_required'
        WHEN ad.anomaly_severity = 'high' AND ad.battery_health_status = 'fast_degradation' THEN 'schedule_battery_replacement'
        WHEN ad.temperature_trend_classification = 'irregular' AND ad.quality_percentage < 85 THEN 'investigate_sensor_calibration'
        WHEN ad.avg_signal_strength < 50 THEN 'improve_network_connectivity'
        WHEN ad.device_performance_rank > 3 THEN 'investigate_environmental_factors'
        ELSE 'normal_operation'
    END as recommended_action,
    
    -- Predictive maintenance scoring
    ROUND(
        (
            CASE WHEN ad.avg_battery_level < 30 THEN 0.3 ELSE 0 END +
            CASE WHEN ad.avg_signal_strength < 50 THEN 0.2 ELSE 0 END +
            CASE WHEN ad.quality_percentage < 85 THEN 0.2 ELSE 0 END +
            CASE WHEN ad.temperature_trend_classification = 'irregular' THEN 0.15 ELSE 0 END +
            CASE WHEN ABS(ad.temp_hourly_change) > 3 THEN 0.15 ELSE 0 END
        ) * 100, 1
    ) as maintenance_priority_score,
    
    -- Time context
    ad.hour_bucket as analysis_time,
    CURRENT_TIMESTAMP as report_generated_at

FROM anomaly_detection ad
WHERE ad.hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND (ad.anomaly_type != 'normal' OR ad.maintenance_priority_score > 30)
ORDER BY ad.maintenance_priority_score DESC, ad.device_id, ad.hour_bucket DESC
LIMIT 100;

-- Advanced fleet-wide analytics with cross-device correlations
WITH fleet_performance_metrics AS (
    SELECT 
        DATE_TRUNC('hour', timestamp) as hour_bucket,
        location->>'building' as building,
        location->>'floor' as floor,
        
        -- Fleet-wide aggregations
        COUNT(DISTINCT device_id) as active_devices,
        COUNT(*) as total_readings,
        
        -- Environmental averages across fleet
        AVG(temperature) as fleet_avg_temperature,
        STDDEV(temperature) as fleet_temp_stddev,
        MIN(temperature) as fleet_min_temperature,
        MAX(temperature) as fleet_max_temperature,
        
        AVG(humidity) as fleet_avg_humidity,
        AVG(pressure) as fleet_avg_pressure,
        AVG(air_quality_index) as fleet_avg_air_quality,
        
        -- Fleet health metrics
        AVG(battery_level) as fleet_avg_battery,
        MIN(battery_level) as fleet_min_battery,
        AVG(signal_strength) as fleet_avg_signal,
        MIN(signal_strength) as fleet_min_signal,
        
        -- Data quality across fleet
        COUNT(*) FILTER (WHERE reading_quality IN ('excellent', 'good')) as quality_readings,
        (COUNT(*) FILTER (WHERE reading_quality IN ('excellent', 'good'))::DECIMAL / COUNT(*)) * 100 as fleet_quality_percentage,
        
        -- Device health distribution
        COUNT(DISTINCT device_id) FILTER (WHERE battery_level > 50 AND signal_strength > 70) as healthy_devices,
        COUNT(DISTINCT device_id) FILTER (WHERE battery_level < 20 OR signal_strength < 30) as critical_devices,
        
        -- Environmental comfort assessment
        COUNT(*) FILTER (WHERE temperature BETWEEN 20 AND 24 AND humidity BETWEEN 40 AND 60) as comfort_readings,
        (COUNT(*) FILTER (WHERE temperature BETWEEN 20 AND 24 AND humidity BETWEEN 40 AND 60)::DECIMAL / COUNT(*)) * 100 as comfort_percentage
        
    FROM environmental_sensors
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    GROUP BY DATE_TRUNC('hour', timestamp), location->>'building', location->>'floor'
),

fleet_trends AS (
    SELECT 
        fpm.*,
        
        -- Fleet efficiency trends  
        LAG(fleet_avg_temperature, 1) OVER (
            PARTITION BY building, floor
            ORDER BY hour_bucket
        ) as prev_hour_fleet_temp,
        
        LAG(fleet_quality_percentage, 24) OVER (
            PARTITION BY building, floor
            ORDER BY hour_bucket  
        ) as same_hour_yesterday_quality,
        
        -- Calculate fleet-wide trends
        fleet_quality_percentage - LAG(fleet_quality_percentage, 24) OVER (
            PARTITION BY building, floor
            ORDER BY hour_bucket
        ) as daily_quality_change,
        
        -- Fleet health scoring
        ROUND(
            (
                (fleet_avg_battery / 100.0) * 0.3 +
                (fleet_avg_signal / 100.0) * 0.2 +
                (fleet_quality_percentage / 100.0) * 0.3 +
                (comfort_percentage / 100.0) * 0.2
            ) * 100, 1
        ) as fleet_health_score
        
    FROM fleet_performance_metrics fpm
)

-- Generate fleet optimization and management dashboard
SELECT 
    ft.building,
    ft.floor,
    ft.hour_bucket,
    
    -- Fleet operational metrics
    ft.active_devices,
    ft.total_readings,
    ROUND(ft.fleet_avg_temperature, 1) as avg_temperature,
    ROUND(ft.fleet_avg_humidity, 1) as avg_humidity,
    ft.fleet_avg_air_quality,
    
    -- Fleet health assessment
    ft.healthy_devices,
    ft.critical_devices,
    ROUND(ft.fleet_avg_battery, 1) as avg_battery_level,
    ROUND(ft.fleet_avg_signal, 1) as avg_signal_strength,
    ROUND(ft.fleet_quality_percentage, 1) as data_quality_pct,
    ft.fleet_health_score,
    
    -- Environmental management
    ROUND(ft.comfort_percentage, 1) as comfort_zone_percentage,
    
    -- Trend analysis
    ROUND(ft.daily_quality_change, 2) as quality_trend_24h,
    
    -- Fleet status classification
    CASE 
        WHEN ft.fleet_health_score >= 85 THEN 'optimal'
        WHEN ft.fleet_health_score >= 75 THEN 'good'
        WHEN ft.fleet_health_score >= 65 THEN 'fair'
        ELSE 'attention_required'
    END as fleet_status,
    
    -- Management recommendations
    CASE 
        WHEN ft.critical_devices > ft.active_devices * 0.2 THEN 'urgent_maintenance_needed'
        WHEN ft.fleet_avg_battery < 30 THEN 'battery_replacement_program'
        WHEN ft.fleet_quality_percentage < 80 THEN 'calibration_review_required'
        WHEN ft.comfort_percentage < 70 THEN 'environmental_adjustment_needed'
        WHEN ft.fleet_avg_signal < 60 THEN 'network_infrastructure_upgrade'
        ELSE 'continue_monitoring'
    END as fleet_recommendation,
    
    -- Efficiency metrics
    ROUND(ft.total_readings::DECIMAL / ft.active_devices, 1) as avg_readings_per_device,
    
    -- Time context
    ft.hour_bucket as analysis_time

FROM fleet_trends ft
WHERE ft.hour_bucket >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
ORDER BY ft.building, ft.floor, ft.hour_bucket DESC;

-- Real-time alerting and monitoring setup
CREATE OR REPLACE VIEW real_time_device_alerts AS
WITH recent_readings AS (
    SELECT 
        device_id,
        timestamp,
        temperature,
        humidity,
        battery_level,
        signal_strength,
        reading_quality,
        location,
        
        -- Calculate recent trends
        LAG(temperature, 1) OVER (PARTITION BY device_id ORDER BY timestamp) as prev_temperature,
        LAG(battery_level, 1) OVER (PARTITION BY device_id ORDER BY timestamp) as prev_battery
        
    FROM environmental_sensors
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
),

alert_conditions AS (
    SELECT 
        rr.*,
        
        -- Temperature alerts
        CASE 
            WHEN temperature > 30 THEN 'high_temperature_critical'
            WHEN temperature < 15 THEN 'low_temperature_critical'
            WHEN temperature > 26 THEN 'high_temperature_warning'
            WHEN temperature < 18 THEN 'low_temperature_warning'
            WHEN ABS(temperature - prev_temperature) > 5 THEN 'rapid_temperature_change'
            ELSE NULL
        END as temperature_alert,
        
        -- Device health alerts
        CASE 
            WHEN battery_level < 10 THEN 'battery_critical'
            WHEN battery_level < 20 THEN 'battery_low'
            WHEN signal_strength < 20 THEN 'connectivity_critical'
            WHEN signal_strength < 40 THEN 'connectivity_poor'
            WHEN reading_quality = 'poor' THEN 'data_quality_poor'
            ELSE NULL
        END as device_alert,
        
        -- Environmental comfort alerts
        CASE 
            WHEN temperature > 26 AND humidity > 70 THEN 'comfort_poor_hot_humid'
            WHEN temperature < 20 AND humidity < 30 THEN 'comfort_poor_cold_dry'
            WHEN humidity > 80 THEN 'humidity_excessive'
            WHEN humidity < 20 THEN 'humidity_insufficient'
            ELSE NULL
        END as comfort_alert
        
    FROM recent_readings rr
)

SELECT 
    device_id,
    timestamp,
    location->>'building' as building,
    location->>'floor' as floor,
    location->>'room' as room,
    
    -- Current measurements
    temperature,
    humidity,
    battery_level,
    signal_strength,
    reading_quality,
    
    -- Alert information
    COALESCE(temperature_alert, device_alert, comfort_alert) as alert_type,
    
    CASE 
        WHEN temperature_alert LIKE '%critical' OR device_alert LIKE '%critical' THEN 'critical'
        WHEN temperature_alert LIKE '%warning' OR device_alert LIKE '%poor' OR comfort_alert IS NOT NULL THEN 'warning'
        ELSE 'info'
    END as alert_severity,
    
    -- Alert context
    CASE 
        WHEN temperature_alert IS NOT NULL THEN 'Environmental conditions outside normal range'
        WHEN device_alert LIKE '%battery%' THEN 'Device requires battery maintenance'
        WHEN device_alert LIKE '%connectivity%' THEN 'Device has communication issues'
        WHEN comfort_alert IS NOT NULL THEN 'Environmental comfort affected'
        ELSE 'Device operating normally'
    END as alert_message,
    
    timestamp as alert_timestamp

FROM alert_conditions
WHERE temperature_alert IS NOT NULL 
   OR device_alert IS NOT NULL 
   OR comfort_alert IS NOT NULL
ORDER BY timestamp DESC, 
         CASE 
           WHEN temperature_alert LIKE '%critical' OR device_alert LIKE '%critical' THEN 1
           WHEN temperature_alert LIKE '%warning' OR device_alert LIKE '%poor' THEN 2
           ELSE 3
         END;

-- QueryLeaf provides comprehensive time-series capabilities:
-- 1. Native MongoDB time-series collection optimization with SQL syntax
-- 2. Advanced temporal analytics with window functions and trend analysis
-- 3. Real-time IoT data processing with automatic bucketing and compression
-- 4. Fleet-wide analytics and cross-device correlation analysis
-- 5. Predictive maintenance and anomaly detection capabilities
-- 6. Automated alerting and monitoring with configurable thresholds
-- 7. Efficient storage and query optimization for high-velocity sensor data
-- 8. Familiar SQL interface for complex time-series operations and analytics
```

## Best Practices for MongoDB Time-Series IoT Architecture

### Performance Optimization and Storage Efficiency

Essential principles for scalable IoT time-series database design:

1. **Time-Series Collection Design**: Configure appropriate granularity and metaField organization for optimal bucketing and compression
2. **Indexing Strategy**: Create time-based indexes optimized for temporal query patterns and device-specific access
3. **Data Retention Policies**: Implement intelligent data lifecycle management with hot, warm, and cold storage tiers
4. **Batch Insert Optimization**: Use bulk operations and batch processing for high-throughput sensor data ingestion
5. **Query Optimization**: Leverage MongoDB's time-series query optimization features for aggregation and analytical workloads
6. **Compression Configuration**: Enable appropriate compression algorithms for time-series data patterns and storage efficiency

### Real-Time Analytics and Monitoring

Optimize time-series architectures for real-time IoT analytics:

1. **Aggregation Pipelines**: Design efficient aggregation pipelines for real-time metrics and trend calculation
2. **Change Stream Processing**: Implement change streams for real-time data processing and alert generation
3. **Materialized Views**: Create pre-computed aggregations for common analytical queries and dashboard requirements
4. **Anomaly Detection**: Implement statistical and machine learning-based anomaly detection for sensor data
5. **Predictive Analytics**: Design predictive models for maintenance scheduling and operational optimization
6. **Alert Management**: Configure intelligent alerting systems with severity classification and escalation policies

## Conclusion

MongoDB time-series collections provide purpose-built capabilities for IoT data management that dramatically improve storage efficiency, query performance, and real-time analytics through native time-series optimization, intelligent data bucketing, and comprehensive aggregation capabilities. The specialized architecture ensures that IoT applications can efficiently handle massive sensor data volumes while maintaining fast query response times and cost-effective storage utilization.

Key MongoDB Time-Series IoT benefits include:

- **Optimized Storage Efficiency**: Native time-series compression and bucketing reduce storage requirements by 60-90% compared to traditional approaches
- **High-Velocity Data Ingestion**: Purpose-built for high-throughput sensor data with automatic optimization for temporal access patterns  
- **Real-Time Analytics**: Built-in aggregation optimization enables real-time analytics and monitoring across massive sensor fleets
- **Intelligent Data Lifecycle**: Automated data retention and archival policies optimize costs while maintaining compliance requirements
- **Scalable Performance**: Time-series collections scale seamlessly from thousands to millions of sensors with consistent performance
- **SQL Accessibility**: Familiar SQL-style time-series operations through QueryLeaf for accessible IoT analytics and management

Whether you're building smart building management systems, industrial IoT monitoring platforms, or large-scale sensor networks, MongoDB time-series collections with QueryLeaf's familiar SQL interface provide the foundation for efficient, scalable IoT data management.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB time-series operations while providing familiar SQL syntax for complex temporal analytics, fleet management, and predictive maintenance workflows. Advanced time-series aggregations, real-time monitoring, and anomaly detection are seamlessly accessible through familiar SQL constructs, making sophisticated IoT analytics approachable for SQL-oriented development teams.

The combination of MongoDB's robust time-series capabilities with SQL-style temporal operations makes it an ideal platform for IoT applications requiring both efficient sensor data management and familiar analytical database patterns, ensuring your IoT infrastructure can scale effectively while maintaining performance and operational simplicity.