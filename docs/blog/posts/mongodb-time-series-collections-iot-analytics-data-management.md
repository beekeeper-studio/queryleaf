---
title: "MongoDB Time-Series Collections for IoT and Analytics: High-Performance Data Management with SQL-Style Time-Series Operations"
description: "Master MongoDB time-series collections for IoT data, sensor analytics, and high-frequency data management. Learn time-series optimization, aggregation patterns, and SQL-familiar temporal data operations for real-time analytics."
date: 2025-09-24
tags: [mongodb, time-series, iot, analytics, performance, sql, real-time]
---

# MongoDB Time-Series Collections for IoT and Analytics: High-Performance Data Management with SQL-Style Time-Series Operations

Modern IoT applications, sensor networks, and real-time analytics systems generate massive volumes of time-series data that require specialized storage and query optimization to maintain performance at scale. Traditional relational databases struggle with the high ingestion rates, storage efficiency, and specialized query patterns typical of time-series workloads.

MongoDB Time-Series Collections provide purpose-built optimization for temporal data storage and retrieval, enabling efficient handling of high-frequency sensor data, metrics, logs, and analytics with automatic bucketing, compression, and time-based indexing. Unlike generic document storage that treats all data equally, time-series collections optimize for temporal access patterns, data compression, and analytical aggregations.

## The Traditional Time-Series Data Challenge

Conventional approaches to managing high-volume time-series data face significant scalability and performance limitations:

```sql
-- Traditional relational approach - poor performance with high-volume time-series data

-- PostgreSQL time-series table with performance challenges
CREATE TABLE sensor_readings (
  id BIGSERIAL PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  sensor_type VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  value NUMERIC(15,6) NOT NULL,
  unit VARCHAR(20),
  location_lat NUMERIC(10,8),
  location_lng NUMERIC(11,8),
  quality_score INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for time-series queries (heavy overhead)
CREATE INDEX idx_sensor_device_time ON sensor_readings(device_id, timestamp DESC);
CREATE INDEX idx_sensor_type_time ON sensor_readings(sensor_type, timestamp DESC);
CREATE INDEX idx_sensor_time_range ON sensor_readings(timestamp DESC);
CREATE INDEX idx_sensor_location ON sensor_readings USING GIST(location_lat, location_lng);

-- High-frequency data insertion challenges
INSERT INTO sensor_readings (device_id, sensor_type, timestamp, value, unit, location_lat, location_lng, quality_score, metadata)
SELECT 
  'device_' || (i % 1000)::text,
  CASE (i % 5)
    WHEN 0 THEN 'temperature'
    WHEN 1 THEN 'humidity'
    WHEN 2 THEN 'pressure'
    WHEN 3 THEN 'light'
    ELSE 'motion'
  END,
  NOW() - (i || ' seconds')::interval,
  RANDOM() * 100,
  CASE (i % 5)
    WHEN 0 THEN 'celsius'
    WHEN 1 THEN 'percent'
    WHEN 2 THEN 'pascal'
    WHEN 3 THEN 'lux'
    ELSE 'boolean'
  END,
  40.7128 + (RANDOM() - 0.5) * 0.1,
  -74.0060 + (RANDOM() - 0.5) * 0.1,
  (RANDOM() * 100)::integer,
  ('{"source": "sensor_' || (i % 50)::text || '", "batch_id": "' || (i / 1000)::text || '"}')::jsonb
FROM generate_series(1, 1000000) as i;

-- Complex time-series aggregation with performance issues
WITH hourly_aggregates AS (
  SELECT 
    device_id,
    sensor_type,
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    
    -- Basic aggregations (expensive with large datasets)
    COUNT(*) as reading_count,
    AVG(value) as avg_value,
    MIN(value) as min_value,
    MAX(value) as max_value,
    STDDEV(value) as std_deviation,
    
    -- Percentile calculations (very expensive)
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as median,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99,
    
    -- Quality metrics
    AVG(quality_score) as avg_quality,
    COUNT(*) FILTER (WHERE quality_score > 90) as high_quality_readings,
    
    -- Data completeness analysis
    COUNT(DISTINCT EXTRACT(MINUTE FROM timestamp)) as minutes_with_data,
    (COUNT(DISTINCT EXTRACT(MINUTE FROM timestamp)) / 60.0 * 100) as data_completeness_percent,
    
    -- Location analysis (expensive with geographic functions)
    AVG(location_lat) as avg_lat,
    AVG(location_lng) as avg_lng,
    ST_ConvexHull(ST_Collect(ST_Point(location_lng, location_lat))) as reading_area
    
  FROM sensor_readings 
  WHERE timestamp >= NOW() - INTERVAL '7 days'
    AND timestamp < NOW()
    AND quality_score > 50
  GROUP BY device_id, sensor_type, DATE_TRUNC('hour', timestamp)
),

daily_trends AS (
  SELECT 
    device_id,
    sensor_type,
    DATE_TRUNC('day', hour_bucket) as day_bucket,
    
    -- Daily aggregations from hourly data
    SUM(reading_count) as daily_reading_count,
    AVG(avg_value) as daily_avg_value,
    MIN(min_value) as daily_min_value,
    MAX(max_value) as daily_max_value,
    
    -- Trend analysis (complex calculations)
    REGR_SLOPE(avg_value, EXTRACT(HOUR FROM hour_bucket)) as hourly_trend_slope,
    REGR_R2(avg_value, EXTRACT(HOUR FROM hour_bucket)) as trend_correlation,
    
    -- Volatility analysis
    STDDEV(avg_value) as daily_volatility,
    (MAX(avg_value) - MIN(avg_value)) as daily_range,
    
    -- Peak hour identification
    (array_agg(EXTRACT(HOUR FROM hour_bucket) ORDER BY avg_value DESC))[1] as peak_hour,
    (array_agg(avg_value ORDER BY avg_value DESC))[1] as peak_value,
    
    -- Data quality metrics
    AVG(avg_quality) as daily_avg_quality,
    AVG(data_completeness_percent) as avg_completeness
    
  FROM hourly_aggregates
  GROUP BY device_id, sensor_type, DATE_TRUNC('day', hour_bucket)
),

sensor_performance_analysis AS (
  SELECT 
    s.device_id,
    s.sensor_type,
    
    -- Performance metrics over analysis period
    COUNT(*) as total_readings,
    AVG(s.value) as overall_avg_value,
    STDDEV(s.value) as overall_std_deviation,
    
    -- Operational metrics
    EXTRACT(EPOCH FROM (MAX(s.timestamp) - MIN(s.timestamp))) / 3600 as hours_active,
    COUNT(*) / NULLIF(EXTRACT(EPOCH FROM (MAX(s.timestamp) - MIN(s.timestamp))) / 3600, 0) as avg_readings_per_hour,
    
    -- Reliability analysis
    COUNT(*) FILTER (WHERE s.quality_score > 90) / COUNT(*)::float as high_quality_ratio,
    COUNT(*) FILTER (WHERE s.value IS NULL) / COUNT(*)::float as null_value_ratio,
    
    -- Geographic consistency
    STDDEV(s.location_lat) as lat_consistency,
    STDDEV(s.location_lng) as lng_consistency,
    
    -- Recent performance vs historical
    AVG(s.value) FILTER (WHERE s.timestamp >= NOW() - INTERVAL '1 day') as recent_avg,
    AVG(s.value) FILTER (WHERE s.timestamp < NOW() - INTERVAL '1 day') as historical_avg,
    
    -- Anomaly detection (simplified)
    COUNT(*) FILTER (WHERE ABS(s.value - AVG(s.value) OVER (PARTITION BY s.device_id, s.sensor_type)) > 3 * STDDEV(s.value) OVER (PARTITION BY s.device_id, s.sensor_type)) as anomaly_count
    
  FROM sensor_readings s
  WHERE s.timestamp >= NOW() - INTERVAL '7 days'
  GROUP BY s.device_id, s.sensor_type
)

SELECT 
  spa.device_id,
  spa.sensor_type,
  spa.total_readings,
  ROUND(spa.overall_avg_value::numeric, 3) as avg_value,
  ROUND(spa.overall_std_deviation::numeric, 3) as std_deviation,
  ROUND(spa.hours_active::numeric, 1) as hours_active,
  ROUND(spa.avg_readings_per_hour::numeric, 1) as readings_per_hour,
  ROUND(spa.high_quality_ratio::numeric * 100, 1) as quality_percent,
  spa.anomaly_count,
  
  -- Daily trend summary
  ROUND(AVG(dt.daily_avg_value)::numeric, 3) as avg_daily_value,
  ROUND(STDDEV(dt.daily_avg_value)::numeric, 3) as daily_volatility,
  ROUND(AVG(dt.hourly_trend_slope)::numeric, 6) as avg_hourly_trend,
  
  -- Performance assessment
  CASE 
    WHEN spa.high_quality_ratio > 0.95 AND spa.avg_readings_per_hour > 50 THEN 'excellent'
    WHEN spa.high_quality_ratio > 0.90 AND spa.avg_readings_per_hour > 20 THEN 'good'
    WHEN spa.high_quality_ratio > 0.75 AND spa.avg_readings_per_hour > 5 THEN 'acceptable'
    ELSE 'poor'
  END as performance_rating,
  
  -- Alerting flags
  spa.anomaly_count > spa.total_readings * 0.05 as high_anomaly_rate,
  ABS(spa.recent_avg - spa.historical_avg) > spa.overall_std_deviation * 2 as significant_recent_change,
  spa.avg_readings_per_hour < 1 as low_frequency_readings

FROM sensor_performance_analysis spa
LEFT JOIN daily_trends dt ON spa.device_id = dt.device_id AND spa.sensor_type = dt.sensor_type
GROUP BY spa.device_id, spa.sensor_type, spa.total_readings, spa.overall_avg_value, 
         spa.overall_std_deviation, spa.hours_active, spa.avg_readings_per_hour, 
         spa.high_quality_ratio, spa.anomaly_count, spa.recent_avg, spa.historical_avg
ORDER BY spa.total_readings DESC, spa.avg_readings_per_hour DESC;

-- Problems with traditional time-series approaches:
-- 1. Poor insertion performance due to index maintenance overhead
-- 2. Inefficient storage with high space usage for repetitive time-series data
-- 3. Complex partitioning strategies required for time-based data management
-- 4. Expensive aggregation queries across large time ranges
-- 5. Limited built-in optimization for temporal access patterns
-- 6. Manual compression and archival strategies needed
-- 7. Poor performance with high-cardinality device/sensor combinations
-- 8. Complex schema evolution for changing sensor types and metadata
-- 9. Difficulty with real-time analytics on streaming time-series data
-- 10. Limited support for time-based bucketing and automatic rollups

-- MySQL time-series approach (even more limitations)
CREATE TABLE mysql_sensor_data (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  sensor_type VARCHAR(50) NOT NULL,
  reading_time DATETIME(3) NOT NULL,
  sensor_value DECIMAL(15,6),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_device_time (device_id, reading_time),
  INDEX idx_sensor_time (sensor_type, reading_time)
) ENGINE=InnoDB;

-- Basic time-series aggregation with MySQL limitations
SELECT 
  device_id,
  sensor_type,
  DATE_FORMAT(reading_time, '%Y-%m-%d %H:00:00') as hour_bucket,
  COUNT(*) as reading_count,
  AVG(sensor_value) as avg_value,
  MIN(sensor_value) as min_value,
  MAX(sensor_value) as max_value,
  STDDEV(sensor_value) as std_deviation
FROM mysql_sensor_data
WHERE reading_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY device_id, sensor_type, DATE_FORMAT(reading_time, '%Y-%m-%d %H:00:00')
ORDER BY device_id, sensor_type, hour_bucket;

-- MySQL limitations:
-- - Limited JSON support for sensor metadata and flexible schemas
-- - Basic time functions without sophisticated temporal operations
-- - Poor performance with large time-series datasets
-- - No native time-series optimizations or automatic bucketing
-- - Limited aggregation and windowing functions
-- - Simple partitioning options for time-based data
-- - Minimal support for real-time analytics patterns
```

MongoDB Time-Series Collections provide optimized temporal data management:

```javascript
// MongoDB Time-Series Collections - optimized for high-performance temporal data
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('iot_platform');

// Advanced time-series data management and analytics platform
class TimeSeriesDataManager {
  constructor(db) {
    this.db = db;
    this.collections = new Map();
    this.compressionConfig = {
      blockSize: 4096,
      compressionLevel: 9,
      bucketing: 'automatic'
    };
    this.indexingStrategy = {
      timeField: 'timestamp',
      metaField: 'metadata',
      granularity: 'minutes'
    };
  }

  async initializeTimeSeriesCollections() {
    console.log('Initializing optimized time-series collections...');
    
    // Create time-series collection for sensor data with optimal configuration
    try {
      await this.db.createCollection('sensor_readings', {
        timeseries: {
          timeField: 'timestamp',
          metaField: 'metadata',  // Groups related time-series together
          granularity: 'minutes'  // Optimize for minute-level bucketing
        },
        storageEngine: {
          wiredTiger: {
            configString: 'block_compressor=zstd'  // High compression for time-series data
          }
        }
      });
      
      console.log('Created time-series collection: sensor_readings');
      this.collections.set('sensor_readings', this.db.collection('sensor_readings'));
      
    } catch (error) {
      if (error.code !== 48) { // Collection already exists
        throw error;
      }
      console.log('Time-series collection sensor_readings already exists');
      this.collections.set('sensor_readings', this.db.collection('sensor_readings'));
    }

    // Create additional optimized time-series collections for different data types
    const timeSeriesCollections = [
      {
        name: 'device_metrics',
        granularity: 'seconds',  // High-frequency system metrics
        metaField: 'device'
      },
      {
        name: 'environmental_data',
        granularity: 'minutes',  // Environmental sensor data
        metaField: 'location'
      },
      {
        name: 'application_logs',
        granularity: 'seconds',  // Application performance logs
        metaField: 'application'
      },
      {
        name: 'financial_ticks',
        granularity: 'seconds',  // Financial market data
        metaField: 'symbol'
      }
    ];

    for (const config of timeSeriesCollections) {
      try {
        await this.db.createCollection(config.name, {
          timeseries: {
            timeField: 'timestamp',
            metaField: config.metaField,
            granularity: config.granularity
          },
          storageEngine: {
            wiredTiger: {
              configString: 'block_compressor=zstd'
            }
          }
        });
        
        this.collections.set(config.name, this.db.collection(config.name));
        console.log(`Created time-series collection: ${config.name}`);
        
      } catch (error) {
        if (error.code !== 48) {
          throw error;
        }
        this.collections.set(config.name, this.db.collection(config.name));
      }
    }

    // Create optimal indexes for time-series queries
    await this.createTimeSeriesIndexes();
    
    return Array.from(this.collections.keys());
  }

  async createTimeSeriesIndexes() {
    console.log('Creating optimized time-series indexes...');
    
    const sensorReadings = this.collections.get('sensor_readings');
    
    // Compound indexes optimized for common time-series query patterns
    const indexSpecs = [
      // Primary access pattern: device + time range
      { 'metadata.deviceId': 1, 'timestamp': 1 },
      
      // Sensor type + time pattern
      { 'metadata.sensorType': 1, 'timestamp': 1 },
      
      // Location-based queries with time
      { 'metadata.location': '2dsphere', 'timestamp': 1 },
      
      // Quality-based filtering with time
      { 'metadata.qualityScore': 1, 'timestamp': 1 },
      
      // Multi-device aggregation patterns
      { 'metadata.deviceGroup': 1, 'metadata.sensorType': 1, 'timestamp': 1 },
      
      // Real-time queries (recent data first)
      { 'timestamp': -1 },
      
      // Data source tracking
      { 'metadata.source': 1, 'timestamp': 1 }
    ];

    for (const indexSpec of indexSpecs) {
      try {
        await sensorReadings.createIndex(indexSpec, {
          background: true,
          partialFilterExpression: { 
            'metadata.qualityScore': { $gt: 0 } // Only index quality data
          }
        });
      } catch (error) {
        console.warn(`Index creation warning for ${JSON.stringify(indexSpec)}:`, error.message);
      }
    }

    console.log('Time-series indexes created successfully');
  }

  async ingestHighFrequencyData(sensorData) {
    console.log(`Ingesting ${sensorData.length} high-frequency sensor readings...`);
    
    const sensorReadings = this.collections.get('sensor_readings');
    const batchSize = 1000;
    const batches = [];
    
    // Prepare data with time-series optimized structure
    const optimizedData = sensorData.map(reading => ({
      timestamp: new Date(reading.timestamp),
      value: reading.value,
      
      // Metadata field for grouping and filtering
      metadata: {
        deviceId: reading.deviceId,
        sensorType: reading.sensorType,
        deviceGroup: reading.deviceGroup || 'default',
        location: {
          type: 'Point',
          coordinates: [reading.longitude, reading.latitude]
        },
        unit: reading.unit,
        qualityScore: reading.qualityScore || 100,
        source: reading.source || 'unknown',
        firmware: reading.firmware,
        calibrationDate: reading.calibrationDate,
        
        // Additional contextual metadata
        environment: {
          temperature: reading.ambientTemperature,
          humidity: reading.ambientHumidity,
          pressure: reading.ambientPressure
        },
        
        // Operational metadata
        batteryLevel: reading.batteryLevel,
        signalStrength: reading.signalStrength,
        networkLatency: reading.networkLatency
      },
      
      // Optional: Additional measurement fields for multi-sensor devices
      ...(reading.additionalMeasurements && {
        measurements: reading.additionalMeasurements
      })
    }));

    // Split into batches for optimal insertion performance
    for (let i = 0; i < optimizedData.length; i += batchSize) {
      batches.push(optimizedData.slice(i, i + batchSize));
    }

    // Insert batches with optimal write concern for time-series data
    let totalInserted = 0;
    const insertionStart = Date.now();
    
    for (const batch of batches) {
      try {
        const result = await sensorReadings.insertMany(batch, {
          ordered: false,  // Allow partial success for high-throughput ingestion
          writeConcern: { w: 1, j: false }  // Optimize for speed over durability for sensor data
        });
        
        totalInserted += result.insertedCount;
        
      } catch (error) {
        console.error('Batch insertion error:', error.message);
        
        // Handle partial batch failures gracefully
        if (error.result && error.result.insertedCount) {
          totalInserted += error.result.insertedCount;
          console.log(`Partial batch success: ${error.result.insertedCount} documents inserted`);
        }
      }
    }

    const insertionTime = Date.now() - insertionStart;
    const throughput = Math.round(totalInserted / (insertionTime / 1000));
    
    console.log(`High-frequency ingestion completed: ${totalInserted} documents in ${insertionTime}ms (${throughput} docs/sec)`);
    
    return {
      totalInserted,
      insertionTime,
      throughput,
      batchCount: batches.length
    };
  }

  async performTimeSeriesAnalytics(deviceId, timeRange, analysisType = 'comprehensive') {
    console.log(`Performing ${analysisType} time-series analytics for device: ${deviceId}`);
    
    const sensorReadings = this.collections.get('sensor_readings');
    const startTime = new Date(Date.now() - timeRange.hours * 60 * 60 * 1000);
    const endTime = new Date();

    // Comprehensive time-series aggregation pipeline
    const pipeline = [
      // Stage 1: Time range filtering with index utilization
      {
        $match: {
          'metadata.deviceId': deviceId,
          timestamp: {
            $gte: startTime,
            $lte: endTime
          },
          'metadata.qualityScore': { $gt: 50 }  // Filter low-quality readings
        }
      },
      
      // Stage 2: Add time-based bucketing fields
      {
        $addFields: {
          hourBucket: {
            $dateTrunc: {
              date: '$timestamp',
              unit: 'hour'
            }
          },
          minuteBucket: {
            $dateTrunc: {
              date: '$timestamp',
              unit: 'minute'
            }
          },
          dayOfWeek: { $dayOfWeek: '$timestamp' },
          hourOfDay: { $hour: '$timestamp' },
          
          // Calculate time since previous reading
          timeIndex: {
            $divide: [
              { $subtract: ['$timestamp', startTime] },
              1000 * 60  // Convert to minutes
            ]
          }
        }
      },
      
      // Stage 3: Group by time buckets and sensor type for detailed analytics
      {
        $group: {
          _id: {
            sensorType: '$metadata.sensorType',
            hourBucket: '$hourBucket',
            deviceId: '$metadata.deviceId'
          },
          
          // Basic statistical measures
          readingCount: { $sum: 1 },
          avgValue: { $avg: '$value' },
          minValue: { $min: '$value' },
          maxValue: { $max: '$value' },
          stdDev: { $stdDevPop: '$value' },
          
          // Percentile calculations for distribution analysis
          valueArray: { $push: '$value' },
          
          // Quality metrics
          avgQualityScore: { $avg: '$metadata.qualityScore' },
          highQualityCount: {
            $sum: {
              $cond: [{ $gt: ['$metadata.qualityScore', 90] }, 1, 0]
            }
          },
          
          // Operational metrics
          avgBatteryLevel: { $avg: '$metadata.batteryLevel' },
          avgSignalStrength: { $avg: '$metadata.signalStrength' },
          avgNetworkLatency: { $avg: '$metadata.networkLatency' },
          
          // Environmental context
          avgAmbientTemp: { $avg: '$metadata.environment.temperature' },
          avgAmbientHumidity: { $avg: '$metadata.environment.humidity' },
          avgAmbientPressure: { $avg: '$metadata.environment.pressure' },
          
          // Time distribution analysis
          firstReading: { $min: '$timestamp' },
          lastReading: { $max: '$timestamp' },
          timeSpread: { $stdDevPop: '$timeIndex' },
          
          // Data completeness tracking
          uniqueMinutes: { $addToSet: '$minuteBucket' },
          
          // Trend analysis preparation
          timeValuePairs: {
            $push: {
              time: '$timeIndex',
              value: '$value'
            }
          }
        }
      },
      
      // Stage 4: Calculate advanced analytics and derived metrics
      {
        $addFields: {
          // Statistical analysis
          valueRange: { $subtract: ['$maxValue', '$minValue'] },
          coefficientOfVariation: {
            $cond: {
              if: { $gt: ['$avgValue', 0] },
              then: { $divide: ['$stdDev', '$avgValue'] },
              else: 0
            }
          },
          
          // Percentile calculations
          median: {
            $arrayElemAt: [
              '$valueArray',
              { $floor: { $multiply: [{ $size: '$valueArray' }, 0.5] } }
            ]
          },
          p95: {
            $arrayElemAt: [
              '$valueArray',
              { $floor: { $multiply: [{ $size: '$valueArray' }, 0.95] } }
            ]
          },
          p99: {
            $arrayElemAt: [
              '$valueArray',
              { $floor: { $multiply: [{ $size: '$valueArray' }, 0.99] } }
            ]
          },
          
          // Data quality assessment
          qualityRatio: {
            $divide: ['$highQualityCount', '$readingCount']
          },
          
          // Data completeness calculation
          dataCompleteness: {
            $divide: [
              { $size: '$uniqueMinutes' },
              {
                $divide: [
                  { $subtract: ['$lastReading', '$firstReading'] },
                  60000  // Minutes in milliseconds
                ]
              }
            ]
          },
          
          // Operational health scoring
          operationalScore: {
            $multiply: [
              { $ifNull: ['$avgBatteryLevel', 100] },
              { $divide: [{ $ifNull: ['$avgSignalStrength', 100] }, 100] },
              {
                $cond: {
                  if: { $gt: [{ $ifNull: ['$avgNetworkLatency', 0] }, 0] },
                  then: { $divide: [1000, { $add: ['$avgNetworkLatency', 1000] }] },
                  else: 1
                }
              }
            ]
          },
          
          // Trend analysis using linear regression
          trendSlope: {
            $let: {
              vars: {
                n: { $size: '$timeValuePairs' },
                sumX: {
                  $reduce: {
                    input: '$timeValuePairs',
                    initialValue: 0,
                    in: { $add: ['$$value', '$$this.time'] }
                  }
                },
                sumY: {
                  $reduce: {
                    input: '$timeValuePairs',
                    initialValue: 0,
                    in: { $add: ['$$value', '$$this.value'] }
                  }
                },
                sumXY: {
                  $reduce: {
                    input: '$timeValuePairs',
                    initialValue: 0,
                    in: { $add: ['$$value', { $multiply: ['$$this.time', '$$this.value'] }] }
                  }
                },
                sumX2: {
                  $reduce: {
                    input: '$timeValuePairs',
                    initialValue: 0,
                    in: { $add: ['$$value', { $multiply: ['$$this.time', '$$this.time'] }] }
                  }
                }
              },
              in: {
                $cond: {
                  if: {
                    $gt: [
                      { $subtract: [{ $multiply: ['$$n', '$$sumX2'] }, { $multiply: ['$$sumX', '$$sumX'] }] },
                      0
                    ]
                  },
                  then: {
                    $divide: [
                      { $subtract: [{ $multiply: ['$$n', '$$sumXY'] }, { $multiply: ['$$sumX', '$$sumY'] }] },
                      { $subtract: [{ $multiply: ['$$n', '$$sumX2'] }, { $multiply: ['$$sumX', '$$sumX'] }] }
                    ]
                  },
                  else: 0
                }
              }
            }
          }
        }
      },
      
      // Stage 5: Anomaly detection and alerting
      {
        $addFields: {
          // Anomaly flags based on statistical analysis
          hasHighVariance: { $gt: ['$coefficientOfVariation', 0.5] },
          hasDataGaps: { $lt: ['$dataCompleteness', 0.85] },
          hasLowQuality: { $lt: ['$qualityRatio', 0.9] },
          hasOperationalIssues: { $lt: ['$operationalScore', 50] },
          hasSignificantTrend: { $gt: [{ $abs: '$trendSlope' }, 0.1] },
          
          // Performance classification
          performanceCategory: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $gt: ['$qualityRatio', 0.95] },
                      { $gt: ['$dataCompleteness', 0.95] },
                      { $gt: ['$operationalScore', 80] }
                    ]
                  },
                  then: 'excellent'
                },
                {
                  case: {
                    $and: [
                      { $gt: ['$qualityRatio', 0.90] },
                      { $gt: ['$dataCompleteness', 0.90] },
                      { $gt: ['$operationalScore', 60] }
                    ]
                  },
                  then: 'good'
                },
                {
                  case: {
                    $and: [
                      { $gt: ['$qualityRatio', 0.75] },
                      { $gt: ['$dataCompleteness', 0.75] }
                    ]
                  },
                  then: 'acceptable'
                }
              ],
              default: 'poor'
            }
          },
          
          // Alert priority calculation
          alertPriority: {
            $cond: {
              if: {
                $or: [
                  { $lt: ['$operationalScore', 25] },
                  { $lt: ['$dataCompleteness', 0.5] },
                  { $gt: [{ $abs: '$trendSlope' }, 1.0] }
                ]
              },
              then: 'critical',
              else: {
                $cond: {
                  if: {
                    $or: [
                      { $lt: ['$operationalScore', 50] },
                      { $lt: ['$qualityRatio', 0.8] },
                      { $gt: ['$coefficientOfVariation', 0.8] }
                    ]
                  },
                  then: 'warning',
                  else: 'normal'
                }
              }
            }
          }
        }
      },
      
      // Stage 6: Final projection with comprehensive metrics
      {
        $project: {
          _id: 1,
          deviceId: '$_id.deviceId',
          sensorType: '$_id.sensorType',
          hourBucket: '$_id.hourBucket',
          
          // Core statistics
          readingCount: 1,
          avgValue: { $round: ['$avgValue', 3] },
          minValue: { $round: ['$minValue', 3] },
          maxValue: { $round: ['$maxValue', 3] },
          stdDev: { $round: ['$stdDev', 3] },
          valueRange: { $round: ['$valueRange', 3] },
          coefficientOfVariation: { $round: ['$coefficientOfVariation', 3] },
          
          // Distribution metrics
          median: { $round: ['$median', 3] },
          p95: { $round: ['$p95', 3] },
          p99: { $round: ['$p99', 3] },
          
          // Quality and completeness
          qualityRatio: { $round: ['$qualityRatio', 3] },
          dataCompleteness: { $round: ['$dataCompleteness', 3] },
          
          // Operational metrics
          operationalScore: { $round: ['$operationalScore', 1] },
          avgBatteryLevel: { $round: ['$avgBatteryLevel', 1] },
          avgSignalStrength: { $round: ['$avgSignalStrength', 1] },
          avgNetworkLatency: { $round: ['$avgNetworkLatency', 1] },
          
          // Environmental context
          avgAmbientTemp: { $round: ['$avgAmbientTemp', 2] },
          avgAmbientHumidity: { $round: ['$avgAmbientHumidity', 2] },
          avgAmbientPressure: { $round: ['$avgAmbientPressure', 2] },
          
          // Trend analysis
          trendSlope: { $round: ['$trendSlope', 6] },
          timeSpread: { $round: ['$timeSpread', 2] },
          
          // Time range
          firstReading: 1,
          lastReading: 1,
          analysisHours: {
            $round: [
              { $divide: [{ $subtract: ['$lastReading', '$firstReading'] }, 3600000] },
              2
            ]
          },
          
          // Classification and alerts
          performanceCategory: 1,
          alertPriority: 1,
          
          // Anomaly flags
          anomalies: {
            highVariance: '$hasHighVariance',
            dataGaps: '$hasDataGaps',
            lowQuality: '$hasLowQuality',
            operationalIssues: '$hasOperationalIssues',
            significantTrend: '$hasSignificantTrend'
          }
        }
      },
      
      // Stage 7: Sort by time bucket for temporal analysis
      {
        $sort: {
          sensorType: 1,
          hourBucket: 1
        }
      }
    ];

    // Execute comprehensive time-series analytics
    const analyticsStart = Date.now();
    const results = await sensorReadings.aggregate(pipeline, {
      allowDiskUse: true,
      hint: { 'metadata.deviceId': 1, 'timestamp': 1 }
    }).toArray();
    
    const analyticsTime = Date.now() - analyticsStart;
    
    console.log(`Time-series analytics completed in ${analyticsTime}ms for ${results.length} time buckets`);
    
    // Generate summary insights
    const insights = this.generateAnalyticsInsights(results, timeRange);
    
    return {
      deviceId: deviceId,
      analysisType: analysisType,
      timeRange: {
        start: startTime,
        end: endTime,
        hours: timeRange.hours
      },
      executionTime: analyticsTime,
      bucketCount: results.length,
      hourlyData: results,
      insights: insights
    };
  }

  generateAnalyticsInsights(analyticsResults, timeRange) {
    const insights = {
      summary: {},
      trends: {},
      quality: {},
      alerts: [],
      recommendations: []
    };

    if (analyticsResults.length === 0) {
      insights.alerts.push({
        type: 'no_data',
        severity: 'critical',
        message: 'No sensor data found for the specified time range and quality criteria'
      });
      return insights;
    }

    // Summary statistics
    const totalReadings = analyticsResults.reduce((sum, r) => sum + r.readingCount, 0);
    const avgQuality = analyticsResults.reduce((sum, r) => sum + r.qualityRatio, 0) / analyticsResults.length;
    const avgCompleteness = analyticsResults.reduce((sum, r) => sum + r.dataCompleteness, 0) / analyticsResults.length;
    const avgOperationalScore = analyticsResults.reduce((sum, r) => sum + r.operationalScore, 0) / analyticsResults.length;

    insights.summary = {
      totalReadings: totalReadings,
      avgReadingsPerHour: Math.round(totalReadings / timeRange.hours),
      avgQualityRatio: Math.round(avgQuality * 100) / 100,
      avgDataCompleteness: Math.round(avgCompleteness * 100) / 100,
      avgOperationalScore: Math.round(avgOperationalScore * 100) / 100,
      sensorTypes: [...new Set(analyticsResults.map(r => r.sensorType))],
      performanceDistribution: {
        excellent: analyticsResults.filter(r => r.performanceCategory === 'excellent').length,
        good: analyticsResults.filter(r => r.performanceCategory === 'good').length,
        acceptable: analyticsResults.filter(r => r.performanceCategory === 'acceptable').length,
        poor: analyticsResults.filter(r => r.performanceCategory === 'poor').length
      }
    };

    // Trend analysis
    const trendingUp = analyticsResults.filter(r => r.trendSlope > 0.05).length;
    const trendingDown = analyticsResults.filter(r => r.trendSlope < -0.05).length;
    const stable = analyticsResults.length - trendingUp - trendingDown;

    insights.trends = {
      trendingUp: trendingUp,
      trendingDown: trendingDown,
      stable: stable,
      strongestUpTrend: Math.max(...analyticsResults.map(r => r.trendSlope)),
      strongestDownTrend: Math.min(...analyticsResults.map(r => r.trendSlope)),
      mostVolatile: Math.max(...analyticsResults.map(r => r.coefficientOfVariation))
    };

    // Quality analysis
    const lowQualityBuckets = analyticsResults.filter(r => r.qualityRatio < 0.8);
    const dataGapBuckets = analyticsResults.filter(r => r.dataCompleteness < 0.8);

    insights.quality = {
      lowQualityBuckets: lowQualityBuckets.length,
      dataGapBuckets: dataGapBuckets.length,
      worstQuality: Math.min(...analyticsResults.map(r => r.qualityRatio)),
      bestQuality: Math.max(...analyticsResults.map(r => r.qualityRatio)),
      worstCompleteness: Math.min(...analyticsResults.map(r => r.dataCompleteness)),
      bestCompleteness: Math.max(...analyticsResults.map(r => r.dataCompleteness))
    };

    // Generate alerts based on analysis
    const criticalAlerts = analyticsResults.filter(r => r.alertPriority === 'critical');
    const warningAlerts = analyticsResults.filter(r => r.alertPriority === 'warning');

    criticalAlerts.forEach(result => {
      insights.alerts.push({
        type: 'critical_performance',
        severity: 'critical',
        sensorType: result.sensorType,
        hourBucket: result.hourBucket,
        message: `Critical performance issues detected: ${result.performanceCategory} performance with operational score ${result.operationalScore}`
      });
    });

    warningAlerts.forEach(result => {
      insights.alerts.push({
        type: 'performance_warning',
        severity: 'warning',
        sensorType: result.sensorType,
        hourBucket: result.hourBucket,
        message: `Performance warning: ${result.performanceCategory} performance with quality ratio ${result.qualityRatio}`
      });
    });

    // Generate recommendations
    if (avgQuality < 0.9) {
      insights.recommendations.push('Consider sensor calibration or replacement due to low quality scores');
    }
    
    if (avgCompleteness < 0.85) {
      insights.recommendations.push('Investigate data transmission issues causing data gaps');
    }
    
    if (avgOperationalScore < 60) {
      insights.recommendations.push('Review device operational status - low battery or connectivity issues detected');
    }
    
    if (insights.trends.trendingDown > insights.trends.trendingUp * 2) {
      insights.recommendations.push('Multiple sensors showing downward trends - investigate environmental factors');
    }

    return insights;
  }

  async performRealTimeAggregation(collectionName, windowSize = '5m') {
    console.log(`Performing real-time aggregation with ${windowSize} window...`);
    
    const collection = this.collections.get(collectionName);
    const windowMs = this.parseTimeWindow(windowSize);
    const currentTime = new Date();
    const windowStart = new Date(currentTime.getTime() - windowMs);

    const pipeline = [
      // Match recent data within the time window
      {
        $match: {
          timestamp: { $gte: windowStart, $lte: currentTime }
        }
      },
      
      // Add time bucketing for sub-window analysis
      {
        $addFields: {
          timeBucket: {
            $dateTrunc: {
              date: '$timestamp',
              unit: 'minute'
            }
          }
        }
      },
      
      // Group by metadata and time bucket
      {
        $group: {
          _id: {
            metaKey: '$metadata',
            timeBucket: '$timeBucket'
          },
          count: { $sum: 1 },
          avgValue: { $avg: '$value' },
          minValue: { $min: '$value' },
          maxValue: { $max: '$value' },
          latestReading: { $max: '$timestamp' },
          values: { $push: '$value' }
        }
      },
      
      // Calculate real-time statistics
      {
        $addFields: {
          stdDev: { $stdDevPop: '$values' },
          variance: { $pow: [{ $stdDevPop: '$values' }, 2] },
          range: { $subtract: ['$maxValue', '$minValue'] },
          
          // Real-time anomaly detection
          isAnomalous: {
            $let: {
              vars: {
                mean: '$avgValue',
                std: { $stdDevPop: '$values' }
              },
              in: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: '$values',
                        cond: {
                          $gt: [
                            { $abs: { $subtract: ['$$this', '$$mean'] } },
                            { $multiply: ['$$std', 2] }
                          ]
                        }
                      }
                    }
                  },
                  { $multiply: [{ $size: '$values' }, 0.05] }  // More than 5% outliers
                ]
              }
            }
          }
        }
      },
      
      // Sort by latest readings first
      {
        $sort: { 'latestReading': -1 }
      },
      
      // Limit to prevent overwhelming results
      {
        $limit: 100
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();
    
    return {
      windowSize: windowSize,
      windowStart: windowStart,
      windowEnd: currentTime,
      aggregations: results,
      totalBuckets: results.length
    };
  }

  parseTimeWindow(windowString) {
    const match = windowString.match(/^(\d+)([smhd])$/);
    if (!match) return 5 * 60 * 1000; // Default 5 minutes
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    const multipliers = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };
    
    return value * multipliers[unit];
  }

  async optimizeTimeSeriesPerformance() {
    console.log('Optimizing time-series collection performance...');
    
    const optimizations = [];
    
    for (const [collectionName, collection] of this.collections) {
      console.log(`Optimizing collection: ${collectionName}`);
      
      // Get collection statistics
      const stats = await this.db.runCommand({ collStats: collectionName });
      
      // Check for optimal bucketing configuration
      if (stats.timeseries) {
        const bucketInfo = {
          granularity: stats.timeseries.granularity,
          bucketCount: stats.timeseries.numBuckets,
          avgBucketSize: stats.size / (stats.timeseries.numBuckets || 1),
          compressionRatio: stats.timeseries.compressionRatio || 'N/A'
        };
        
        optimizations.push({
          collection: collectionName,
          type: 'bucketing_analysis',
          current: bucketInfo,
          recommendations: this.generateBucketingRecommendations(bucketInfo)
        });
      }
      
      // Analyze index usage
      const indexStats = await collection.aggregate([{ $indexStats: {} }]).toArray();
      const indexRecommendations = this.analyzeIndexUsage(indexStats);
      
      optimizations.push({
        collection: collectionName,
        type: 'index_analysis',
        indexes: indexStats,
        recommendations: indexRecommendations
      });
      
      // Check for data retention optimization opportunities
      const oldestDocument = await collection.findOne({}, { sort: { timestamp: 1 } });
      const newestDocument = await collection.findOne({}, { sort: { timestamp: -1 } });
      
      if (oldestDocument && newestDocument) {
        const dataSpan = newestDocument.timestamp - oldestDocument.timestamp;
        const dataSpanDays = dataSpan / (1000 * 60 * 60 * 24);
        
        optimizations.push({
          collection: collectionName,
          type: 'retention_analysis',
          dataSpanDays: Math.round(dataSpanDays),
          oldestDocument: oldestDocument.timestamp,
          newestDocument: newestDocument.timestamp,
          recommendations: dataSpanDays > 365 ? 
            ['Consider implementing data archival strategy for data older than 1 year'] : []
        });
      }
    }
    
    return optimizations;
  }

  generateBucketingRecommendations(bucketInfo) {
    const recommendations = [];
    
    if (bucketInfo.avgBucketSize > 10 * 1024 * 1024) { // 10MB
      recommendations.push('Consider reducing granularity - buckets are very large');
    }
    
    if (bucketInfo.avgBucketSize < 64 * 1024) { // 64KB
      recommendations.push('Consider increasing granularity - buckets are too small for optimal compression');
    }
    
    if (bucketInfo.bucketCount > 1000000) {
      recommendations.push('High bucket count may impact query performance - review time-series collection design');
    }
    
    return recommendations;
  }

  analyzeIndexUsage(indexStats) {
    const recommendations = [];
    const lowUsageThreshold = 100;
    
    indexStats.forEach(stat => {
      if (stat.accesses && stat.accesses.ops < lowUsageThreshold) {
        recommendations.push(`Consider dropping low-usage index: ${stat.name} (${stat.accesses.ops} operations)`);
      }
    });
    
    return recommendations;
  }
}

// Benefits of MongoDB Time-Series Collections:
// - Automatic data bucketing and compression optimized for temporal data patterns
// - Built-in indexing strategies designed for time-range and metadata queries
// - Up to 90% storage space reduction compared to regular collections
// - Optimized aggregation pipelines with time-aware query planning
// - Native support for high-frequency data ingestion with minimal overhead
// - Automatic handling of out-of-order insertions common in IoT scenarios
// - Integration with MongoDB's change streams for real-time analytics
// - Support for complex metadata structures while maintaining query performance
// - Time-aware sharding strategies for horizontal scaling
// - Native compatibility with BI and analytics tools through standard MongoDB interfaces

module.exports = {
  TimeSeriesDataManager
};
```

## Understanding MongoDB Time-Series Collection Architecture

### Advanced Time-Series Optimization Strategies

Implement sophisticated time-series patterns for maximum performance and storage efficiency:

```javascript
// Advanced time-series optimization and real-time analytics patterns
class TimeSeriesOptimizer {
  constructor(db) {
    this.db = db;
    this.performanceMetrics = new Map();
    this.compressionStrategies = {
      zstd: { level: 9, ratio: 0.85 },
      snappy: { level: 1, ratio: 0.75 },
      lz4: { level: 1, ratio: 0.70 }
    };
  }

  async optimizeIngestionPipeline(deviceTypes) {
    console.log('Optimizing time-series ingestion pipeline for device types:', deviceTypes);
    
    const optimizations = {};
    
    for (const deviceType of deviceTypes) {
      // Analyze ingestion patterns for each device type
      const ingestionAnalysis = await this.analyzeIngestionPatterns(deviceType);
      
      // Determine optimal collection configuration
      const optimalConfig = this.calculateOptimalConfiguration(ingestionAnalysis);
      
      // Create optimized collection if needed
      const collectionName = `ts_${deviceType.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      
      try {
        await this.db.createCollection(collectionName, {
          timeseries: {
            timeField: 'timestamp',
            metaField: 'device',
            granularity: optimalConfig.granularity
          },
          storageEngine: {
            wiredTiger: {
              configString: `block_compressor=${optimalConfig.compression}`
            }
          }
        });
        
        // Create optimal indexes for the device type
        await this.createOptimalIndexes(collectionName, ingestionAnalysis.queryPatterns);
        
        optimizations[deviceType] = {
          collection: collectionName,
          configuration: optimalConfig,
          expectedPerformance: {
            ingestionRate: optimalConfig.estimatedIngestionRate,
            compressionRatio: optimalConfig.estimatedCompressionRatio,
            queryPerformance: optimalConfig.estimatedQueryPerformance
          }
        };
        
      } catch (error) {
        console.warn(`Collection ${collectionName} already exists or creation failed:`, error.message);
      }
    }
    
    return optimizations;
  }

  async analyzeIngestionPatterns(deviceType) {
    // Simulate analysis of historical ingestion patterns
    const patterns = {
      temperature: {
        avgFrequency: 60, // seconds
        avgBatchSize: 1,
        dataVariability: 0.2,
        queryPatterns: ['recent_values', 'hourly_aggregates', 'anomaly_detection']
      },
      pressure: {
        avgFrequency: 30,
        avgBatchSize: 1,
        dataVariability: 0.1,
        queryPatterns: ['trend_analysis', 'threshold_monitoring']
      },
      vibration: {
        avgFrequency: 1, // High frequency
        avgBatchSize: 100,
        dataVariability: 0.8,
        queryPatterns: ['fft_analysis', 'peak_detection', 'real_time_monitoring']
      },
      gps: {
        avgFrequency: 10,
        avgBatchSize: 1,
        dataVariability: 0.5,
        queryPatterns: ['geospatial_queries', 'route_analysis', 'location_history']
      }
    };
    
    return patterns[deviceType] || patterns.temperature;
  }

  calculateOptimalConfiguration(ingestionAnalysis) {
    const { avgFrequency, avgBatchSize, dataVariability, queryPatterns } = ingestionAnalysis;
    
    // Determine optimal granularity based on frequency
    let granularity;
    if (avgFrequency <= 1) {
      granularity = 'seconds';
    } else if (avgFrequency <= 60) {
      granularity = 'minutes';
    } else {
      granularity = 'hours';
    }
    
    // Choose compression strategy based on data characteristics
    let compression;
    if (dataVariability < 0.3) {
      compression = 'zstd'; // High compression for low variability data
    } else if (dataVariability < 0.6) {
      compression = 'snappy'; // Balanced compression/speed
    } else {
      compression = 'lz4'; // Fast compression for high variability
    }
    
    // Estimate performance characteristics
    const estimatedIngestionRate = Math.floor((3600 / avgFrequency) * avgBatchSize);
    const compressionStrategy = this.compressionStrategies[compression];
    
    return {
      granularity,
      compression,
      estimatedIngestionRate,
      estimatedCompressionRatio: compressionStrategy.ratio,
      estimatedQueryPerformance: this.estimateQueryPerformance(queryPatterns, granularity),
      recommendedIndexes: this.recommendIndexes(queryPatterns)
    };
  }

  estimateQueryPerformance(queryPatterns, granularity) {
    const performanceScores = {
      recent_values: granularity === 'seconds' ? 95 : granularity === 'minutes' ? 90 : 80,
      hourly_aggregates: granularity === 'minutes' ? 95 : granularity === 'hours' ? 100 : 85,
      trend_analysis: granularity === 'minutes' ? 90 : granularity === 'hours' ? 95 : 75,
      anomaly_detection: granularity === 'seconds' ? 85 : granularity === 'minutes' ? 95 : 70,
      geospatial_queries: 85,
      real_time_monitoring: granularity === 'seconds' ? 100 : granularity === 'minutes' ? 80 : 60
    };
    
    const avgScore = queryPatterns.reduce((sum, pattern) => 
      sum + (performanceScores[pattern] || 75), 0) / queryPatterns.length;
    
    return Math.round(avgScore);
  }

  recommendIndexes(queryPatterns) {
    const indexRecommendations = {
      recent_values: [{ timestamp: -1 }],
      hourly_aggregates: [{ 'device.deviceId': 1, timestamp: 1 }],
      trend_analysis: [{ 'device.sensorType': 1, timestamp: 1 }],
      anomaly_detection: [{ 'device.deviceId': 1, 'device.sensorType': 1, timestamp: 1 }],
      geospatial_queries: [{ 'device.location': '2dsphere', timestamp: 1 }],
      real_time_monitoring: [{ timestamp: -1 }, { 'device.alertLevel': 1, timestamp: -1 }]
    };
    
    const recommendedIndexes = new Set();
    queryPatterns.forEach(pattern => {
      if (indexRecommendations[pattern]) {
        indexRecommendations[pattern].forEach(index => 
          recommendedIndexes.add(JSON.stringify(index))
        );
      }
    });
    
    return Array.from(recommendedIndexes).map(indexStr => JSON.parse(indexStr));
  }

  async createOptimalIndexes(collectionName, queryPatterns) {
    const collection = this.db.collection(collectionName);
    const recommendedIndexes = this.recommendIndexes(queryPatterns);
    
    for (const indexSpec of recommendedIndexes) {
      try {
        await collection.createIndex(indexSpec, { background: true });
        console.log(`Created index on ${collectionName}:`, indexSpec);
      } catch (error) {
        console.warn(`Index creation failed for ${collectionName}:`, error.message);
      }
    }
  }

  async implementRealTimeStreamProcessing(collectionName, processingRules) {
    console.log(`Implementing real-time stream processing for ${collectionName}`);
    
    const collection = this.db.collection(collectionName);
    
    // Create change stream for real-time processing
    const changeStream = collection.watch([], {
      fullDocument: 'updateLookup'
    });
    
    const processor = {
      rules: processingRules,
      stats: {
        processed: 0,
        alerts: 0,
        errors: 0,
        startTime: new Date()
      },
      
      async processChange(change) {
        this.stats.processed++;
        
        try {
          if (change.operationType === 'insert') {
            const document = change.fullDocument;
            
            // Apply processing rules
            for (const rule of this.rules) {
              const result = await this.applyRule(rule, document);
              
              if (result.triggered) {
                await this.handleRuleTriggered(rule, document, result);
                this.stats.alerts++;
              }
            }
          }
        } catch (error) {
          console.error('Stream processing error:', error);
          this.stats.errors++;
        }
      },
      
      async applyRule(rule, document) {
        switch (rule.type) {
          case 'threshold':
            return {
              triggered: this.evaluateThreshold(document.value, rule.threshold, rule.operator),
              value: document.value,
              threshold: rule.threshold
            };
            
          case 'anomaly':
            return await this.detectAnomaly(document, rule.parameters);
            
          case 'trend':
            return await this.detectTrend(document, rule.parameters);
            
          default:
            return { triggered: false };
        }
      },
      
      evaluateThreshold(value, threshold, operator) {
        switch (operator) {
          case '>': return value > threshold;
          case '<': return value < threshold;
          case '>=': return value >= threshold;
          case '<=': return value <= threshold;
          case '==': return Math.abs(value - threshold) < 0.001;
          default: return false;
        }
      },
      
      async detectAnomaly(document, parameters) {
        // Simplified anomaly detection using recent historical data
        const recentData = await collection.find({
          'device.deviceId': document.device.deviceId,
          'device.sensorType': document.device.sensorType,
          timestamp: {
            $gte: new Date(Date.now() - parameters.windowMs),
            $lt: document.timestamp
          }
        }).limit(parameters.sampleSize).toArray();
        
        if (recentData.length < parameters.minSamples) {
          return { triggered: false, reason: 'insufficient_data' };
        }
        
        const values = recentData.map(d => d.value);
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        const zScore = Math.abs(document.value - mean) / stdDev;
        const isAnomalous = zScore > parameters.threshold;
        
        return {
          triggered: isAnomalous,
          zScore: zScore,
          mean: mean,
          stdDev: stdDev,
          value: document.value
        };
      },
      
      async detectTrend(document, parameters) {
        // Simplified trend detection using linear regression
        const trendData = await collection.find({
          'device.deviceId': document.device.deviceId,
          'device.sensorType': document.device.sensorType,
          timestamp: {
            $gte: new Date(Date.now() - parameters.windowMs)
          }
        }).sort({ timestamp: 1 }).toArray();
        
        if (trendData.length < parameters.minPoints) {
          return { triggered: false, reason: 'insufficient_data' };
        }
        
        // Calculate trend slope
        const n = trendData.length;
        const sumX = trendData.reduce((sum, d, i) => sum + i, 0);
        const sumY = trendData.reduce((sum, d) => sum + d.value, 0);
        const sumXY = trendData.reduce((sum, d, i) => sum + i * d.value, 0);
        const sumX2 = trendData.reduce((sum, d, i) => sum + i * i, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const isSignificant = Math.abs(slope) > parameters.slopeThreshold;
        
        return {
          triggered: isSignificant,
          slope: slope,
          direction: slope > 0 ? 'increasing' : 'decreasing',
          dataPoints: n
        };
      },
      
      async handleRuleTriggered(rule, document, result) {
        console.log(`Rule triggered: ${rule.name}`, {
          device: document.device.deviceId,
          sensor: document.device.sensorType,
          value: document.value,
          timestamp: document.timestamp,
          result: result
        });
        
        // Store alert
        await this.db.collection('alerts').insertOne({
          ruleName: rule.name,
          ruleType: rule.type,
          deviceId: document.device.deviceId,
          sensorType: document.device.sensorType,
          value: document.value,
          timestamp: document.timestamp,
          triggerResult: result,
          severity: rule.severity || 'medium',
          createdAt: new Date()
        });
        
        // Execute actions if configured
        if (rule.actions) {
          for (const action of rule.actions) {
            await this.executeAction(action, document, result);
          }
        }
      },
      
      async executeAction(action, document, result) {
        switch (action.type) {
          case 'webhook':
            // Simulate webhook call
            console.log(`Webhook action: ${action.url}`, { document, result });
            break;
            
          case 'email':
            console.log(`Email action: ${action.recipient}`, { document, result });
            break;
            
          case 'database':
            await this.db.collection(action.collection).insertOne({
              ...action.document,
              sourceDocument: document,
              triggerResult: result,
              createdAt: new Date()
            });
            break;
        }
      },
      
      getStats() {
        const runtime = Date.now() - this.stats.startTime.getTime();
        return {
          ...this.stats,
          runtimeMs: runtime,
          processingRate: this.stats.processed / (runtime / 1000),
          errorRate: this.stats.errors / this.stats.processed
        };
      }
    };
    
    // Set up change stream event handlers
    changeStream.on('change', async (change) => {
      await processor.processChange(change);
    });
    
    changeStream.on('error', (error) => {
      console.error('Change stream error:', error);
      processor.stats.errors++;
    });
    
    return {
      processor: processor,
      changeStream: changeStream,
      stop: () => changeStream.close()
    };
  }

  async performTimeSeriesBenchmark(collectionName, testConfig) {
    console.log(`Performing time-series benchmark on ${collectionName}`);
    
    const collection = this.db.collection(collectionName);
    const results = {
      ingestion: {},
      queries: {},
      aggregations: {}
    };
    
    // Benchmark high-frequency ingestion
    console.log('Benchmarking ingestion performance...');
    const ingestionStart = Date.now();
    const testData = this.generateBenchmarkData(testConfig.documentCount);
    
    const batchSize = testConfig.batchSize || 1000;
    let totalInserted = 0;
    
    for (let i = 0; i < testData.length; i += batchSize) {
      const batch = testData.slice(i, i + batchSize);
      
      try {
        const insertResult = await collection.insertMany(batch, { ordered: false });
        totalInserted += insertResult.insertedCount;
      } catch (error) {
        console.warn('Batch insertion error:', error.message);
        if (error.result && error.result.insertedCount) {
          totalInserted += error.result.insertedCount;
        }
      }
    }
    
    const ingestionTime = Date.now() - ingestionStart;
    results.ingestion = {
      documentsInserted: totalInserted,
      timeMs: ingestionTime,
      documentsPerSecond: Math.round(totalInserted / (ingestionTime / 1000)),
      avgBatchTime: Math.round(ingestionTime / Math.ceil(testData.length / batchSize))
    };
    
    // Benchmark time-range queries
    console.log('Benchmarking query performance...');
    const queryTests = [
      {
        name: 'recent_data',
        filter: { timestamp: { $gte: new Date(Date.now() - 3600000) } } // Last hour
      },
      {
        name: 'device_specific',
        filter: { 'device.deviceId': testData[0].device.deviceId }
      },
      {
        name: 'sensor_type_filter',
        filter: { 'device.sensorType': 'temperature' }
      },
      {
        name: 'complex_filter',
        filter: {
          'device.sensorType': 'temperature',
          value: { $gt: 20, $lt: 30 },
          timestamp: { $gte: new Date(Date.now() - 7200000) }
        }
      }
    ];
    
    results.queries = {};
    
    for (const queryTest of queryTests) {
      const queryStart = Date.now();
      const queryResults = await collection.find(queryTest.filter).limit(1000).toArray();
      const queryTime = Date.now() - queryStart;
      
      results.queries[queryTest.name] = {
        timeMs: queryTime,
        documentsReturned: queryResults.length,
        documentsPerSecond: Math.round(queryResults.length / (queryTime / 1000))
      };
    }
    
    // Benchmark aggregation performance
    console.log('Benchmarking aggregation performance...');
    const aggregationTests = [
      {
        name: 'hourly_averages',
        pipeline: [
          { $match: { timestamp: { $gte: new Date(Date.now() - 86400000) } } },
          {
            $group: {
              _id: {
                hour: { $dateToString: { format: '%Y-%m-%d-%H', date: '$timestamp' } },
                deviceId: '$device.deviceId',
                sensorType: '$device.sensorType'
              },
              avgValue: { $avg: '$value' },
              count: { $sum: 1 }
            }
          }
        ]
      },
      {
        name: 'device_statistics',
        pipeline: [
          { $match: { timestamp: { $gte: new Date(Date.now() - 86400000) } } },
          {
            $group: {
              _id: '$device.deviceId',
              sensors: { $addToSet: '$device.sensorType' },
              totalReadings: { $sum: 1 },
              avgValue: { $avg: '$value' },
              minValue: { $min: '$value' },
              maxValue: { $max: '$value' }
            }
          }
        ]
      },
      {
        name: 'time_series_bucketing',
        pipeline: [
          { $match: { timestamp: { $gte: new Date(Date.now() - 3600000) } } },
          {
            $bucket: {
              groupBy: '$value',
              boundaries: [0, 10, 20, 30, 40, 50, 100],
              default: 'other',
              output: {
                count: { $sum: 1 },
                avgTimestamp: { $avg: '$timestamp' }
              }
            }
          }
        ]
      }
    ];
    
    results.aggregations = {};
    
    for (const aggTest of aggregationTests) {
      const aggStart = Date.now();
      const aggResults = await collection.aggregate(aggTest.pipeline, { allowDiskUse: true }).toArray();
      const aggTime = Date.now() - aggStart;
      
      results.aggregations[aggTest.name] = {
        timeMs: aggTime,
        resultsReturned: aggResults.length
      };
    }
    
    return results;
  }

  generateBenchmarkData(count) {
    const deviceIds = Array.from({ length: 10 }, (_, i) => `device_${i.toString().padStart(3, '0')}`);
    const sensorTypes = ['temperature', 'humidity', 'pressure', 'vibration', 'light'];
    const baseTimestamp = Date.now() - (count * 1000); // Spread over time
    
    return Array.from({ length: count }, (_, i) => ({
      timestamp: new Date(baseTimestamp + i * 1000 + Math.random() * 1000),
      value: Math.random() * 100,
      device: {
        deviceId: deviceIds[Math.floor(Math.random() * deviceIds.length)],
        sensorType: sensorTypes[Math.floor(Math.random() * sensorTypes.length)],
        location: {
          type: 'Point',
          coordinates: [
            -74.0060 + (Math.random() - 0.5) * 0.1,
            40.7128 + (Math.random() - 0.5) * 0.1
          ]
        },
        batteryLevel: Math.random() * 100,
        signalStrength: Math.random() * 100
      }
    }));
  }
}
```

## SQL-Style Time-Series Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB time-series collections and temporal operations:

```sql
-- QueryLeaf time-series operations with SQL-familiar syntax

-- Create time-series table with optimal configuration
CREATE TABLE sensor_readings (
  timestamp TIMESTAMP NOT NULL,
  value NUMERIC(15,6) NOT NULL,
  device_id VARCHAR(50) NOT NULL,
  sensor_type VARCHAR(50) NOT NULL,
  location GEOGRAPHY(POINT),
  quality_score INTEGER,
  metadata JSONB
) WITH (
  time_series = true,
  time_field = 'timestamp',
  meta_field = 'device_metadata',
  granularity = 'minutes',
  compression = 'zstd'
);

-- High-frequency sensor data insertion optimized for time-series
INSERT INTO sensor_readings (
  timestamp, value, device_id, sensor_type, location, quality_score, metadata
)
SELECT 
  NOW() - (generate_series * INTERVAL '1 second') as timestamp,
  RANDOM() * 100 as value,
  'device_' || LPAD((generate_series % 100)::text, 3, '0') as device_id,
  CASE (generate_series % 5)
    WHEN 0 THEN 'temperature'
    WHEN 1 THEN 'humidity'
    WHEN 2 THEN 'pressure'
    WHEN 3 THEN 'vibration'
    ELSE 'light'
  END as sensor_type,
  ST_Point(
    -74.0060 + (RANDOM() - 0.5) * 0.1,
    40.7128 + (RANDOM() - 0.5) * 0.1
  ) as location,
  (RANDOM() * 100)::integer as quality_score,
  JSON_BUILD_OBJECT(
    'firmware_version', '2.1.' || (generate_series % 10)::text,
    'battery_level', (RANDOM() * 100)::integer,
    'signal_strength', (RANDOM() * 100)::integer,
    'calibration_date', NOW() - (RANDOM() * 365 || ' days')::interval
  ) as metadata
FROM generate_series(1, 100000) as generate_series;

-- Time-series analytics with window functions and temporal aggregations
WITH time_buckets AS (
  SELECT 
    device_id,
    sensor_type,
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    
    -- MongoDB time-series optimized aggregations
    COUNT(*) as reading_count,
    AVG(value) as avg_value,
    MIN(value) as min_value,
    MAX(value) as max_value,
    STDDEV(value) as std_deviation,
    
    -- Percentile functions for distribution analysis
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as median,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99,
    
    -- Quality metrics using JSON functions
    AVG((metadata->>'quality_score')::numeric) as avg_quality,
    AVG((metadata->>'battery_level')::numeric) as avg_battery,
    AVG((metadata->>'signal_strength')::numeric) as avg_signal,
    
    -- Time-series specific calculations
    COUNT(DISTINCT DATE_TRUNC('minute', timestamp)) as minutes_with_data,
    (COUNT(DISTINCT DATE_TRUNC('minute', timestamp)) / 60.0 * 100) as completeness_percent,
    
    -- Geospatial analytics
    ST_Centroid(ST_Collect(location)) as avg_location,
    ST_ConvexHull(ST_Collect(location)) as reading_area,
    
    -- Array aggregation for detailed analysis
    ARRAY_AGG(value ORDER BY timestamp) as value_sequence,
    ARRAY_AGG(timestamp ORDER BY timestamp) as timestamp_sequence
    
  FROM sensor_readings
  WHERE timestamp >= NOW() - INTERVAL '24 hours'
    AND quality_score > 70
  GROUP BY device_id, sensor_type, DATE_TRUNC('hour', timestamp)
),

trend_analysis AS (
  SELECT 
    tb.*,
    
    -- Time-series trend calculation using linear regression
    REGR_SLOPE(
      (row_number() OVER (PARTITION BY device_id, sensor_type ORDER BY hour_bucket))::numeric,
      avg_value
    ) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY hour_bucket 
      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) as trend_slope,
    
    -- Moving averages for smoothing
    AVG(avg_value) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY hour_bucket 
      ROWS BETWEEN 2 PRECEDING AND 2 FOLLOWING
    ) as smoothed_avg,
    
    -- Volatility analysis
    STDDEV(avg_value) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY hour_bucket 
      ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
    ) as volatility_6h,
    
    -- Change detection
    LAG(avg_value, 1) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY hour_bucket
    ) as prev_hour_avg,
    
    LAG(avg_value, 24) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY hour_bucket
    ) as same_hour_yesterday,
    
    -- Anomaly scoring based on historical patterns
    (avg_value - AVG(avg_value) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY hour_bucket 
      ROWS BETWEEN 23 PRECEDING AND 1 PRECEDING
    )) / NULLIF(STDDEV(avg_value) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY hour_bucket 
      ROWS BETWEEN 23 PRECEDING AND 1 PRECEDING
    ), 0) as z_score
    
  FROM time_buckets tb
),

device_health_analysis AS (
  SELECT 
    ta.device_id,
    ta.sensor_type,
    ta.hour_bucket,
    ta.reading_count,
    ta.avg_value,
    ta.median,
    ta.p95,
    ta.completeness_percent,
    
    -- Trend classification
    CASE 
      WHEN ta.trend_slope > 0.1 THEN 'increasing'
      WHEN ta.trend_slope < -0.1 THEN 'decreasing'
      ELSE 'stable'
    END as trend_direction,
    
    -- Change analysis
    ROUND((ta.avg_value - ta.prev_hour_avg)::numeric, 3) as hour_over_hour_change,
    ROUND(((ta.avg_value - ta.prev_hour_avg) / NULLIF(ta.prev_hour_avg, 0) * 100)::numeric, 2) as hour_over_hour_pct,
    
    ROUND((ta.avg_value - ta.same_hour_yesterday)::numeric, 3) as day_over_day_change,
    ROUND(((ta.avg_value - ta.same_hour_yesterday) / NULLIF(ta.same_hour_yesterday, 0) * 100)::numeric, 2) as day_over_day_pct,
    
    -- Anomaly detection
    ROUND(ta.z_score::numeric, 3) as anomaly_score,
    CASE 
      WHEN ABS(ta.z_score) > 3 THEN 'critical'
      WHEN ABS(ta.z_score) > 2 THEN 'warning'
      ELSE 'normal'
    END as anomaly_level,
    
    -- Performance scoring
    CASE 
      WHEN ta.completeness_percent > 95 AND ta.avg_quality > 90 THEN 'excellent'
      WHEN ta.completeness_percent > 85 AND ta.avg_quality > 80 THEN 'good'
      WHEN ta.completeness_percent > 70 AND ta.avg_quality > 70 THEN 'acceptable'
      ELSE 'poor'
    END as data_quality,
    
    -- Operational health
    ROUND(ta.avg_battery::numeric, 1) as avg_battery_level,
    ROUND(ta.avg_signal::numeric, 1) as avg_signal_strength,
    
    CASE 
      WHEN ta.avg_battery > 80 AND ta.avg_signal > 80 THEN 'healthy'
      WHEN ta.avg_battery > 50 AND ta.avg_signal > 60 THEN 'degraded'
      ELSE 'critical'
    END as operational_status,
    
    -- Geographic analysis
    ST_X(ta.avg_location) as avg_longitude,
    ST_Y(ta.avg_location) as avg_latitude,
    ST_Area(ta.reading_area::geography) / 1000000 as coverage_area_km2
    
  FROM trend_analysis ta
),

alert_generation AS (
  SELECT 
    dha.*,
    
    -- Generate alerts based on multiple criteria
    CASE 
      WHEN dha.anomaly_level = 'critical' AND dha.operational_status = 'critical' THEN 'CRITICAL'
      WHEN dha.anomaly_level IN ('critical', 'warning') OR dha.operational_status = 'critical' THEN 'HIGH' 
      WHEN dha.data_quality = 'poor' OR dha.operational_status = 'degraded' THEN 'MEDIUM'
      WHEN ABS(dha.day_over_day_pct) > 50 THEN 'MEDIUM'
      ELSE 'LOW'
    END as alert_priority,
    
    -- Alert message generation
    CONCAT_WS('; ',
      CASE WHEN dha.anomaly_level = 'critical' THEN 'Anomaly detected (z-score: ' || dha.anomaly_score || ')' END,
      CASE WHEN dha.operational_status = 'critical' THEN 'Operational issues (battery: ' || dha.avg_battery_level || '%, signal: ' || dha.avg_signal_strength || '%)' END,
      CASE WHEN dha.data_quality = 'poor' THEN 'Poor data quality (' || dha.completeness_percent || '% completeness)' END,
      CASE WHEN ABS(dha.day_over_day_pct) > 50 THEN 'Significant day-over-day change: ' || dha.day_over_day_pct || '%' END
    ) as alert_message,
    
    -- Recommended actions
    ARRAY_REMOVE(ARRAY[
      CASE WHEN dha.avg_battery_level < 20 THEN 'Replace battery' END,
      CASE WHEN dha.avg_signal_strength < 30 THEN 'Check network connectivity' END,
      CASE WHEN dha.completeness_percent < 70 THEN 'Investigate data transmission issues' END,
      CASE WHEN ABS(dha.anomaly_score) > 3 THEN 'Verify sensor calibration' END,
      CASE WHEN dha.trend_direction != 'stable' THEN 'Monitor trend continuation' END
    ], NULL) as recommended_actions
    
  FROM device_health_analysis dha
)

SELECT 
  device_id,
  sensor_type,
  hour_bucket,
  avg_value,
  trend_direction,
  anomaly_level,
  data_quality,
  operational_status,
  alert_priority,
  alert_message,
  recommended_actions,
  
  -- Additional context for investigation
  JSON_BUILD_OBJECT(
    'statistics', JSON_BUILD_OBJECT(
      'median', median,
      'p95', p95,
      'completeness', completeness_percent
    ),
    'changes', JSON_BUILD_OBJECT(
      'hour_over_hour', hour_over_hour_pct,
      'day_over_day', day_over_day_pct
    ),
    'operational', JSON_BUILD_OBJECT(
      'battery_level', avg_battery_level,
      'signal_strength', avg_signal_strength
    ),
    'location', JSON_BUILD_OBJECT(
      'longitude', avg_longitude,
      'latitude', avg_latitude,
      'coverage_area_km2', coverage_area_km2
    )
  ) as analysis_context

FROM alert_generation
WHERE alert_priority IN ('CRITICAL', 'HIGH', 'MEDIUM')
ORDER BY 
  CASE alert_priority
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    ELSE 4
  END,
  device_id, sensor_type, hour_bucket DESC;

-- Real-time streaming analytics with time windows
WITH real_time_metrics AS (
  SELECT 
    device_id,
    sensor_type,
    
    -- 5-minute rolling window aggregations
    AVG(value) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY timestamp 
      RANGE BETWEEN INTERVAL '5 minutes' PRECEDING AND CURRENT ROW
    ) as avg_5m,
    
    COUNT(*) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY timestamp 
      RANGE BETWEEN INTERVAL '5 minutes' PRECEDING AND CURRENT ROW
    ) as count_5m,
    
    -- 1-hour rolling window for trend detection
    AVG(value) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY timestamp 
      RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
    ) as avg_1h,
    
    STDDEV(value) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY timestamp 
      RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
    ) as stddev_1h,
    
    -- Rate of change detection
    (value - LAG(value, 10) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY timestamp
    )) / NULLIF(EXTRACT(EPOCH FROM (timestamp - LAG(timestamp, 10) OVER (
      PARTITION BY device_id, sensor_type 
      ORDER BY timestamp
    ))), 0) as rate_of_change,
    
    -- Current values for comparison
    timestamp,
    value,
    quality_score,
    (metadata->>'battery_level')::numeric as battery_level
    
  FROM sensor_readings
  WHERE timestamp >= NOW() - INTERVAL '2 hours'
),

real_time_alerts AS (
  SELECT 
    *,
    
    -- Real-time anomaly detection
    CASE 
      WHEN ABS(value - avg_1h) > 3 * NULLIF(stddev_1h, 0) THEN 'ANOMALY'
      WHEN ABS(rate_of_change) > 10 THEN 'RAPID_CHANGE'  
      WHEN count_5m < 5 AND EXTRACT(EPOCH FROM (NOW() - timestamp)) < 300 THEN 'DATA_GAP'
      WHEN battery_level < 15 THEN 'LOW_BATTERY'
      WHEN quality_score < 60 THEN 'POOR_QUALITY'
      ELSE 'NORMAL'
    END as real_time_alert,
    
    -- Severity assessment
    CASE 
      WHEN ABS(value - avg_1h) > 5 * NULLIF(stddev_1h, 0) OR ABS(rate_of_change) > 50 THEN 'CRITICAL'
      WHEN ABS(value - avg_1h) > 3 * NULLIF(stddev_1h, 0) OR ABS(rate_of_change) > 20 THEN 'HIGH'
      WHEN battery_level < 15 OR quality_score < 40 THEN 'MEDIUM'
      ELSE 'LOW'
    END as alert_severity
    
  FROM real_time_metrics
  WHERE timestamp >= NOW() - INTERVAL '15 minutes'
)

SELECT 
  device_id,
  sensor_type,
  timestamp,
  value,
  real_time_alert,
  alert_severity,
  
  -- Context for immediate action
  ROUND(avg_5m::numeric, 3) as five_min_avg,
  ROUND(avg_1h::numeric, 3) as one_hour_avg,
  ROUND(rate_of_change::numeric, 3) as change_rate,
  count_5m as readings_last_5min,
  battery_level,
  quality_score,
  
  -- Time since alert
  EXTRACT(EPOCH FROM (NOW() - timestamp))::integer as seconds_ago

FROM real_time_alerts
WHERE real_time_alert != 'NORMAL' 
  AND alert_severity IN ('CRITICAL', 'HIGH', 'MEDIUM')
ORDER BY alert_severity DESC, timestamp DESC
LIMIT 100;

-- Time-series data retention and archival management
WITH retention_analysis AS (
  SELECT 
    device_id,
    sensor_type,
    DATE_TRUNC('day', timestamp) as day_bucket,
    COUNT(*) as daily_readings,
    MIN(timestamp) as first_reading,
    MAX(timestamp) as last_reading,
    AVG(quality_score) as avg_daily_quality,
    
    -- Age-based classification
    CASE 
      WHEN DATE_TRUNC('day', timestamp) >= CURRENT_DATE - INTERVAL '30 days' THEN 'recent'
      WHEN DATE_TRUNC('day', timestamp) >= CURRENT_DATE - INTERVAL '90 days' THEN 'standard'
      WHEN DATE_TRUNC('day', timestamp) >= CURRENT_DATE - INTERVAL '365 days' THEN 'historical'
      ELSE 'archive'
    END as data_tier,
    
    -- Storage cost analysis
    COUNT(*) * 0.001 as estimated_storage_mb,
    EXTRACT(DAYS FROM (CURRENT_DATE - DATE_TRUNC('day', timestamp))) as days_old
    
  FROM sensor_readings
  GROUP BY device_id, sensor_type, DATE_TRUNC('day', timestamp)
)

SELECT 
  data_tier,
  COUNT(DISTINCT device_id) as unique_devices,
  COUNT(DISTINCT sensor_type) as sensor_types,
  SUM(daily_readings) as total_readings,
  ROUND(SUM(estimated_storage_mb)::numeric, 2) as total_storage_mb,
  ROUND(AVG(avg_daily_quality)::numeric, 1) as avg_quality_score,
  MIN(days_old) as newest_data_days,
  MAX(days_old) as oldest_data_days,
  
  -- Archival recommendations
  CASE 
    WHEN data_tier = 'archive' THEN 'Move to cold storage or delete low-quality data'
    WHEN data_tier = 'historical' THEN 'Consider compression or aggregation to daily summaries'
    WHEN data_tier = 'standard' THEN 'Maintain current storage with periodic cleanup'
    ELSE 'Keep in high-performance storage'
  END as storage_recommendation

FROM retention_analysis
GROUP BY data_tier
ORDER BY 
  CASE data_tier
    WHEN 'recent' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'historical' THEN 3
    WHEN 'archive' THEN 4
  END;

-- QueryLeaf provides comprehensive time-series capabilities:
-- 1. Optimized time-series collection creation with automatic bucketing
-- 2. High-performance ingestion for streaming sensor and IoT data
-- 3. Advanced temporal aggregations with window functions and trend analysis
-- 4. Real-time anomaly detection and alerting systems
-- 5. Geospatial analytics integration for location-aware time-series data
-- 6. Comprehensive data quality monitoring and operational health tracking
-- 7. Intelligent data retention and archival management strategies
-- 8. SQL-familiar syntax for complex time-series analytics and reporting
-- 9. Integration with MongoDB's native time-series optimizations
-- 10. Familiar SQL patterns for temporal data analysis and visualization
```

## Best Practices for Time-Series Implementation

### Collection Design Strategy

Essential principles for optimal MongoDB time-series collection design:

1. **Granularity Selection**: Choose appropriate granularity based on data frequency and query patterns
2. **Metadata Organization**: Structure metadata fields to enable efficient grouping and filtering
3. **Index Strategy**: Create indexes that support temporal range queries and metadata filtering
4. **Compression Configuration**: Select compression algorithms based on data characteristics
5. **Bucketing Optimization**: Monitor bucket sizes and adjust granularity for optimal performance
6. **Storage Planning**: Plan for data growth and implement retention policies

### Performance and Scalability

Optimize MongoDB time-series collections for production workloads:

1. **Ingestion Optimization**: Use batch insertions and optimal write concerns for high throughput
2. **Query Performance**: Design aggregation pipelines that leverage time-series optimizations
3. **Real-time Analytics**: Implement change streams for real-time processing and alerting
4. **Resource Management**: Monitor memory usage and enable disk spilling for large aggregations
5. **Sharding Strategy**: Plan horizontal scaling for very high-volume time-series data
6. **Monitoring Setup**: Track collection performance, compression ratios, and query patterns

## Conclusion

MongoDB Time-Series Collections provide specialized optimization for temporal data that eliminates the performance and storage inefficiencies of traditional time-series approaches. The combination of automatic bucketing, intelligent compression, and time-aware indexing makes handling high-volume IoT and sensor data both efficient and scalable.

Key MongoDB Time-Series benefits include:

- **Automatic Optimization**: Built-in bucketing and compression optimized for temporal data patterns
- **Storage Efficiency**: Up to 90% storage reduction compared to regular document collections
- **Query Performance**: Time-aware indexing and aggregation pipeline optimization
- **High-Throughput Ingestion**: Optimized write patterns for streaming sensor data
- **Real-Time Analytics**: Integration with change streams for real-time processing
- **Flexible Metadata**: Support for complex device and sensor metadata structures

Whether you're building IoT platforms, sensor networks, financial trading systems, or real-time analytics applications, MongoDB Time-Series Collections with QueryLeaf's familiar SQL interface provides the foundation for high-performance temporal data management.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB time-series operations while providing SQL-familiar temporal analytics, window functions, and time-based aggregations. Advanced time-series patterns, real-time alerting, and performance monitoring are seamlessly handled through familiar SQL constructs, making sophisticated temporal analytics both powerful and accessible to SQL-oriented development teams.

The integration of specialized time-series capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both high-performance temporal data management and familiar database interaction patterns, ensuring your time-series solutions remain both performant and maintainable as they scale to handle massive data volumes and real-time processing requirements.