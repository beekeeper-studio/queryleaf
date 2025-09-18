---
title: "MongoDB Time Series Collections and IoT Data Management: SQL-Style Time Series Analytics with High-Performance Data Ingestion"
description: "Master MongoDB Time Series Collections for IoT data management, sensor analytics, and time-based aggregations. Learn high-performance data ingestion, time series queries, and SQL-familiar temporal analytics patterns."
date: 2025-09-17
tags: [mongodb, time-series, iot, sensor-data, analytics, temporal-queries, sql, data-ingestion]
---

# MongoDB Time Series Collections and IoT Data Management: SQL-Style Time Series Analytics with High-Performance Data Ingestion

Modern IoT applications generate massive volumes of time-stamped data from sensors, devices, and monitoring systems requiring specialized storage, querying, and analysis capabilities. Traditional relational databases struggle with time series workloads due to their rigid schema requirements, poor compression for temporal data, and inefficient querying patterns for time-based aggregations and analytics.

MongoDB Time Series Collections provide purpose-built capabilities for storing, querying, and analyzing time-stamped data with automatic partitioning, compression, and optimized indexing. Unlike traditional collection storage, time series collections automatically organize data by time ranges, apply sophisticated compression algorithms, and provide specialized query patterns optimized for temporal analytics and IoT workloads.

## The Traditional Time Series Challenge

Relational database approaches to time series data have significant performance and scalability limitations:

```sql
-- Traditional relational time series design - inefficient and complex

-- PostgreSQL time series approach with partitioning
CREATE TABLE sensor_readings (
    reading_id BIGSERIAL,
    sensor_id VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    timestamp TIMESTAMP NOT NULL,
    temperature DECIMAL(5,2),
    humidity DECIMAL(5,2),
    pressure DECIMAL(7,2),
    battery_level DECIMAL(3,2),
    signal_strength INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions (manual maintenance required)
CREATE TABLE sensor_readings_2024_01 PARTITION OF sensor_readings
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE sensor_readings_2024_02 PARTITION OF sensor_readings
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE sensor_readings_2024_03 PARTITION OF sensor_readings
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
-- ... manual partition creation for each month

-- Indexes for time series queries
CREATE INDEX idx_sensor_readings_timestamp ON sensor_readings (timestamp);
CREATE INDEX idx_sensor_readings_sensor_id_timestamp ON sensor_readings (sensor_id, timestamp);
CREATE INDEX idx_sensor_readings_device_timestamp ON sensor_readings (device_id, timestamp);

-- Complex time series aggregation query
SELECT 
    sensor_id,
    device_id,
    DATE_TRUNC('hour', timestamp) as hour_bucket,
    
    -- Statistical aggregations
    COUNT(*) as reading_count,
    AVG(temperature) as avg_temperature,
    MIN(temperature) as min_temperature,
    MAX(temperature) as max_temperature,
    STDDEV(temperature) as temp_stddev,
    
    AVG(humidity) as avg_humidity,
    AVG(pressure) as avg_pressure,
    AVG(battery_level) as avg_battery,
    
    -- Time-based calculations
    FIRST_VALUE(temperature) OVER (
        PARTITION BY sensor_id, DATE_TRUNC('hour', timestamp) 
        ORDER BY timestamp
    ) as first_temp,
    LAST_VALUE(temperature) OVER (
        PARTITION BY sensor_id, DATE_TRUNC('hour', timestamp) 
        ORDER BY timestamp 
        RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as last_temp,
    
    -- Lag calculations for trends
    LAG(AVG(temperature)) OVER (
        PARTITION BY sensor_id 
        ORDER BY DATE_TRUNC('hour', timestamp)
    ) as prev_hour_avg_temp

FROM sensor_readings
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND sensor_id IN ('TEMP_001', 'TEMP_002', 'TEMP_003')
GROUP BY sensor_id, device_id, DATE_TRUNC('hour', timestamp)
ORDER BY sensor_id, hour_bucket;

-- Problems with traditional time series approach:
-- 1. Manual partition management and maintenance overhead
-- 2. Poor compression ratios for time-stamped data
-- 3. Complex query patterns for time-based aggregations
-- 4. Limited scalability for high-frequency data ingestion
-- 5. Inefficient storage for sparse or irregular time series
-- 6. Difficult downsampling and data retention management
-- 7. Poor performance for cross-time-range analytics
-- 8. Complex indexing strategies for temporal queries

-- InfluxDB-style approach (specialized but limited)
-- INSERT INTO sensor_data,sensor_id=TEMP_001,device_id=DEV_001,location=warehouse_A 
--   temperature=23.5,humidity=65.2,pressure=1013.25,battery_level=85.3 1640995200000000000

-- InfluxDB limitations:
-- - Specialized query language (InfluxQL/Flux) not SQL compatible
-- - Limited JOIN capabilities across measurements
-- - Complex data modeling for hierarchical sensor networks
-- - Difficult integration with existing application stacks
-- - Limited support for complex business logic
-- - Vendor lock-in with proprietary tools and ecosystem
-- - Complex migration paths from existing SQL-based systems
```

MongoDB Time Series Collections provide comprehensive time series capabilities:

```javascript
// MongoDB Time Series Collections - purpose-built for temporal data
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('iot_platform');

// Create time series collection with automatic optimization
const createTimeSeriesCollection = async () => {
  try {
    // Create time series collection with comprehensive configuration
    const collection = await db.createCollection('sensor_readings', {
      timeseries: {
        // Time field - required, used for automatic partitioning
        timeField: 'timestamp',
        
        // Meta field - optional, groups related time series together
        metaField: 'metadata',
        
        // Granularity for automatic bucketing and compression
        granularity: 'minutes', // 'seconds', 'minutes', 'hours'
        
        // Automatic expiration for data retention
        expireAfterSeconds: 60 * 60 * 24 * 365 // 1 year retention
      }
    });

    console.log('Time series collection created successfully');
    return collection;

  } catch (error) {
    console.error('Error creating time series collection:', error);
    throw error;
  }
};

// High-performance time series data ingestion
const ingestSensorData = async () => {
  const sensorReadings = db.collection('sensor_readings');

  // Batch insert for optimal performance
  const batchData = [];
  const batchSize = 1000;
  const currentTime = new Date();

  // Generate realistic IoT sensor data
  for (let i = 0; i < batchSize; i++) {
    const timestamp = new Date(currentTime.getTime() - (i * 60000)); // Every minute
    
    // Multiple sensors per batch
    ['TEMP_001', 'TEMP_002', 'TEMP_003', 'HUM_001', 'PRESS_001'].forEach(sensorId => {
      batchData.push({
        // Time field (required for time series)
        timestamp: timestamp,
        
        // Metadata field - groups related measurements
        metadata: {
          sensorId: sensorId,
          deviceId: sensorId.startsWith('TEMP') ? 'CLIMATE_DEV_001' : 
                   sensorId.startsWith('HUM') ? 'CLIMATE_DEV_001' : 'PRESSURE_DEV_001',
          location: {
            building: 'Warehouse_A',
            floor: 1,
            room: 'Storage_Room_1',
            coordinates: {
              x: Math.floor(Math.random() * 100),
              y: Math.floor(Math.random() * 100)
            }
          },
          sensorType: sensorId.startsWith('TEMP') ? 'temperature' :
                     sensorId.startsWith('HUM') ? 'humidity' : 'pressure',
          unit: sensorId.startsWith('TEMP') ? 'celsius' :
                sensorId.startsWith('HUM') ? 'percent' : 'hPa',
          calibrationDate: new Date('2024-01-01'),
          firmwareVersion: '2.1.3'
        },

        // Measurement data - varies by sensor type
        measurements: generateMeasurements(sensorId, timestamp),
        
        // System metadata
        ingestionTime: new Date(),
        dataQuality: {
          isValid: Math.random() > 0.02, // 2% invalid readings
          confidence: 0.95 + (Math.random() * 0.05), // 95-100% confidence
          calibrationStatus: 'valid',
          lastCalibration: new Date('2024-01-01')
        },
        
        // Device health metrics
        deviceHealth: {
          batteryLevel: 85 + Math.random() * 15, // 85-100%
          signalStrength: -30 - Math.random() * 40, // -30 to -70 dBm
          temperature: 20 + Math.random() * 10, // Device temp 20-30°C
          uptime: Math.floor(Math.random() * 86400 * 30) // Up to 30 days
        }
      });
    });
  }

  // Batch insert for optimal ingestion performance
  try {
    const result = await sensorReadings.insertMany(batchData, { 
      ordered: false, // Allow parallel insertions
      writeConcern: { w: 1 } // Optimize for ingestion speed
    });
    
    console.log(`Inserted ${result.insertedCount} sensor readings`);
    return result;

  } catch (error) {
    console.error('Error inserting sensor data:', error);
    throw error;
  }
};

function generateMeasurements(sensorId, timestamp) {
  const baseValues = {
    'TEMP_001': { value: 22, variance: 5 },
    'TEMP_002': { value: 24, variance: 3 },
    'TEMP_003': { value: 20, variance: 4 },
    'HUM_001': { value: 65, variance: 15 },
    'PRESS_001': { value: 1013.25, variance: 5 }
  };

  const base = baseValues[sensorId];
  if (!base) return {};

  // Add some realistic patterns and noise
  const hourOfDay = timestamp.getHours();
  const seasonalEffect = Math.sin((timestamp.getMonth() * Math.PI) / 6) * 2;
  const dailyEffect = Math.sin((hourOfDay * Math.PI) / 12) * 1.5;
  const randomNoise = (Math.random() - 0.5) * base.variance;
  
  const value = base.value + seasonalEffect + dailyEffect + randomNoise;

  return {
    value: Math.round(value * 100) / 100,
    rawValue: value,
    processed: true,
    
    // Statistical context
    range: {
      min: base.value - base.variance,
      max: base.value + base.variance
    },
    
    // Quality indicators
    outlierScore: Math.abs(randomNoise) / base.variance,
    trend: dailyEffect > 0 ? 'increasing' : 'decreasing'
  };
}

// Advanced time series queries and analytics
const performTimeSeriesAnalytics = async () => {
  const sensorReadings = db.collection('sensor_readings');

  // 1. Real-time dashboard data - last 24 hours
  const realtimeDashboard = await sensorReadings.aggregate([
    // Filter to last 24 hours
    {
      $match: {
        timestamp: {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        },
        'dataQuality.isValid': true
      }
    },

    // Group by sensor and time bucket for aggregation
    {
      $group: {
        _id: {
          sensorId: '$metadata.sensorId',
          sensorType: '$metadata.sensorType',
          location: '$metadata.location.room',
          // 15-minute time buckets
          timeBucket: {
            $dateTrunc: {
              date: '$timestamp',
              unit: 'minute',
              binSize: 15
            }
          }
        },
        
        // Statistical aggregations
        count: { $sum: 1 },
        avgValue: { $avg: '$measurements.value' },
        minValue: { $min: '$measurements.value' },
        maxValue: { $max: '$measurements.value' },
        stdDev: { $stdDevPop: '$measurements.value' },
        
        // First and last readings in bucket
        firstReading: { $first: '$measurements.value' },
        lastReading: { $last: '$measurements.value' },
        
        // Data quality metrics
        validReadings: {
          $sum: { $cond: ['$dataQuality.isValid', 1, 0] }
        },
        avgConfidence: { $avg: '$dataQuality.confidence' },
        
        // Device health aggregations
        avgBatteryLevel: { $avg: '$deviceHealth.batteryLevel' },
        avgSignalStrength: { $avg: '$deviceHealth.signalStrength' }
      }
    },

    // Calculate derived metrics
    {
      $addFields: {
        // Value change within bucket
        valueChange: { $subtract: ['$lastReading', '$firstReading'] },
        
        // Coefficient of variation (relative variability)
        coefficientOfVariation: {
          $cond: {
            if: { $ne: ['$avgValue', 0] },
            then: { $divide: ['$stdDev', '$avgValue'] },
            else: 0
          }
        },
        
        // Data quality ratio
        dataQualityRatio: { $divide: ['$validReadings', '$count'] },
        
        // Device health status
        deviceHealthStatus: {
          $switch: {
            branches: [
              {
                case: { 
                  $and: [
                    { $gte: ['$avgBatteryLevel', 80] },
                    { $gte: ['$avgSignalStrength', -50] }
                  ]
                },
                then: 'excellent'
              },
              {
                case: { 
                  $and: [
                    { $gte: ['$avgBatteryLevel', 50] },
                    { $gte: ['$avgSignalStrength', -65] }
                  ]
                },
                then: 'good'
              },
              {
                case: { 
                  $or: [
                    { $lt: ['$avgBatteryLevel', 20] },
                    { $lt: ['$avgSignalStrength', -80] }
                  ]
                },
                then: 'critical'
              }
            ],
            default: 'warning'
          }
        }
      }
    },

    // Sort by sensor and time
    {
      $sort: {
        '_id.sensorId': 1,
        '_id.timeBucket': 1
      }
    },

    // Format output for dashboard consumption
    {
      $group: {
        _id: '$_id.sensorId',
        sensorType: { $first: '$_id.sensorType' },
        location: { $first: '$_id.location' },
        
        // Time series data points
        timeSeries: {
          $push: {
            timestamp: '$_id.timeBucket',
            value: '$avgValue',
            min: '$minValue',
            max: '$maxValue',
            count: '$count',
            quality: '$dataQualityRatio',
            deviceHealth: '$deviceHealthStatus'
          }
        },
        
        // Aggregate statistics across all time buckets
        overallStats: {
          $push: {
            avg: '$avgValue',
            stdDev: '$stdDev',
            cv: '$coefficientOfVariation'
          }
        },
        
        // Latest values
        latestValue: { $last: '$avgValue' },
        latestChange: { $last: '$valueChange' },
        latestQuality: { $last: '$dataQualityRatio' }
      }
    },

    // Calculate final sensor-level statistics
    {
      $addFields: {
        overallAvg: { $avg: '$overallStats.avg' },
        overallStdDev: { $avg: '$overallStats.stdDev' },
        avgCV: { $avg: '$overallStats.cv' },
        
        // Trend analysis
        trend: {
          $cond: {
            if: { $gt: ['$latestChange', 0.1] },
            then: 'increasing',
            else: {
              $cond: {
                if: { $lt: ['$latestChange', -0.1] },
                then: 'decreasing',
                else: 'stable'
              }
            }
          }
        }
      }
    }
  ]).toArray();

  console.log('Real-time dashboard data:', JSON.stringify(realtimeDashboard, null, 2));

  // 2. Anomaly detection using statistical methods
  const anomalyDetection = await sensorReadings.aggregate([
    {
      $match: {
        timestamp: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      }
    },

    // Calculate rolling statistics for anomaly detection
    {
      $setWindowFields: {
        partitionBy: '$metadata.sensorId',
        sortBy: { timestamp: 1 },
        output: {
          // Rolling 30-point average and standard deviation
          rollingAvg: {
            $avg: '$measurements.value',
            window: {
              documents: [-15, 15] // 30-point centered window
            }
          },
          rollingStdDev: {
            $stdDevPop: '$measurements.value',
            window: {
              documents: [-15, 15]
            }
          },
          
          // Previous values for change detection
          prevValue: {
            $first: '$measurements.value',
            window: {
              documents: [-1, -1]
            }
          }
        }
      }
    },

    // Identify anomalies using statistical thresholds
    {
      $addFields: {
        // Z-score calculation
        zScore: {
          $cond: {
            if: { $ne: ['$rollingStdDev', 0] },
            then: {
              $divide: [
                { $subtract: ['$measurements.value', '$rollingAvg'] },
                '$rollingStdDev'
              ]
            },
            else: 0
          }
        },
        
        // Rate of change
        rateOfChange: {
          $cond: {
            if: { $and: ['$prevValue', { $ne: ['$prevValue', 0] }] },
            then: {
              $divide: [
                { $subtract: ['$measurements.value', '$prevValue'] },
                '$prevValue'
              ]
            },
            else: 0
          }
        }
      }
    },

    // Filter to potential anomalies
    {
      $match: {
        $or: [
          { zScore: { $gt: 3 } }, // Values > 3 standard deviations
          { zScore: { $lt: -3 } },
          { rateOfChange: { $gt: 0.5 } }, // > 50% change
          { rateOfChange: { $lt: -0.5 } }
        ]
      }
    },

    // Classify anomaly types
    {
      $addFields: {
        anomalyType: {
          $switch: {
            branches: [
              {
                case: { $gt: ['$zScore', 3] },
                then: 'statistical_high'
              },
              {
                case: { $lt: ['$zScore', -3] },
                then: 'statistical_low'
              },
              {
                case: { $gt: ['$rateOfChange', 0.5] },
                then: 'rapid_increase'
              },
              {
                case: { $lt: ['$rateOfChange', -0.5] },
                then: 'rapid_decrease'
              }
            ],
            default: 'unknown'
          }
        },
        
        anomalySeverity: {
          $switch: {
            branches: [
              {
                case: { 
                  $or: [
                    { $gt: ['$zScore', 5] },
                    { $lt: ['$zScore', -5] }
                  ]
                },
                then: 'critical'
              },
              {
                case: { 
                  $or: [
                    { $gt: ['$zScore', 4] },
                    { $lt: ['$zScore', -4] }
                  ]
                },
                then: 'high'
              }
            ],
            default: 'medium'
          }
        }
      }
    },

    // Group anomalies by sensor and type
    {
      $group: {
        _id: {
          sensorId: '$metadata.sensorId',
          anomalyType: '$anomalyType'
        },
        count: { $sum: 1 },
        avgSeverity: { $avg: '$zScore' },
        latestAnomaly: { $max: '$timestamp' },
        anomalies: {
          $push: {
            timestamp: '$timestamp',
            value: '$measurements.value',
            zScore: '$zScore',
            rateOfChange: '$rateOfChange',
            severity: '$anomalySeverity'
          }
        }
      }
    },

    {
      $sort: {
        '_id.sensorId': 1,
        count: -1
      }
    }
  ]).toArray();

  console.log('Anomaly detection results:', JSON.stringify(anomalyDetection, null, 2));

  // 3. Predictive maintenance analysis
  const predictiveMaintenance = await sensorReadings.aggregate([
    {
      $match: {
        timestamp: {
          $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    },

    // Calculate device health trends
    {
      $group: {
        _id: {
          deviceId: '$metadata.deviceId',
          day: {
            $dateTrunc: {
              date: '$timestamp',
              unit: 'day'
            }
          }
        },
        
        avgBatteryLevel: { $avg: '$deviceHealth.batteryLevel' },
        avgSignalStrength: { $avg: '$deviceHealth.signalStrength' },
        readingCount: { $sum: 1 },
        errorRate: {
          $avg: { $cond: ['$dataQuality.isValid', 0, 1] }
        }
      }
    },

    // Calculate trends using linear regression approximation
    {
      $setWindowFields: {
        partitionBy: '$_id.deviceId',
        sortBy: { '_id.day': 1 },
        output: {
          batteryTrend: {
            $linearFill: '$avgBatteryLevel'
          },
          signalTrend: {
            $linearFill: '$avgSignalStrength'
          }
        }
      }
    },

    // Predict maintenance needs
    {
      $addFields: {
        batteryDaysRemaining: {
          $cond: {
            if: { $lt: ['$batteryTrend', 0] },
            then: {
              $ceil: {
                $divide: ['$avgBatteryLevel', { $abs: '$batteryTrend' }]
              }
            },
            else: 365 // Battery not declining
          }
        },
        
        maintenanceRisk: {
          $switch: {
            branches: [
              {
                case: {
                  $or: [
                    { $lt: ['$avgBatteryLevel', 20] },
                    { $gt: ['$errorRate', 0.1] }
                  ]
                },
                then: 'immediate'
              },
              {
                case: {
                  $or: [
                    { $lt: ['$avgBatteryLevel', 40] },
                    { $lt: ['$avgSignalStrength', -70] }
                  ]
                },
                then: 'high'
              },
              {
                case: { $lt: ['$avgBatteryLevel', 60] },
                then: 'medium'
              }
            ],
            default: 'low'
          }
        }
      }
    },

    // Group by device with latest status
    {
      $group: {
        _id: '$_id.deviceId',
        latestBatteryLevel: { $last: '$avgBatteryLevel' },
        latestSignalStrength: { $last: '$avgSignalStrength' },
        batteryTrend: { $last: '$batteryTrend' },
        signalTrend: { $last: '$signalTrend' },
        estimatedBatteryDays: { $last: '$batteryDaysRemaining' },
        maintenanceRisk: { $last: '$maintenanceRisk' },
        avgErrorRate: { $avg: '$errorRate' }
      }
    },

    {
      $sort: {
        maintenanceRisk: 1, // immediate first
        estimatedBatteryDays: 1
      }
    }
  ]).toArray();

  console.log('Predictive maintenance analysis:', JSON.stringify(predictiveMaintenance, null, 2));

  return {
    realtimeDashboard,
    anomalyDetection,
    predictiveMaintenance
  };
};

// Benefits of MongoDB Time Series Collections:
// - Automatic data partitioning and compression optimized for time-based data
// - Built-in retention policies with automatic expiration
// - Optimized indexes and query patterns for temporal analytics
// - High-performance ingestion with automatic bucketing
// - Native aggregation framework support for complex time series analysis
// - Flexible schema evolution for changing IoT device requirements
// - Horizontal scaling across sharded clusters
// - Integration with existing MongoDB ecosystem and tools
// - Real-time analytics with change streams for live dashboards
// - Cost-effective storage with intelligent compression algorithms
```

## Understanding MongoDB Time Series Architecture

### Time Series Collection Design Patterns

Implement comprehensive time series patterns for different IoT scenarios:

```javascript
// Advanced time series collection design patterns
class IoTTimeSeriesManager {
  constructor(db) {
    this.db = db;
    this.collections = new Map();
    this.ingestionBuffers = new Map();
  }

  async createIoTTimeSeriesCollections() {
    // Pattern 1: High-frequency sensor data
    const highFrequencyConfig = {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'sensor',
        granularity: 'seconds', // For sub-minute data
        bucketMaxSpanSeconds: 3600, // 1-hour buckets
        bucketRoundingSeconds: 60 // Round to minute boundaries
      },
      expireAfterSeconds: 60 * 60 * 24 * 30 // 30 days retention
    };

    const highFrequencySensors = await this.db.createCollection(
      'high_frequency_sensors', 
      highFrequencyConfig
    );

    // Pattern 2: Environmental monitoring (medium frequency)
    const environmentalConfig = {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'location',
        granularity: 'minutes',
        bucketMaxSpanSeconds: 86400, // 24-hour buckets
        bucketRoundingSeconds: 3600 // Round to hour boundaries
      },
      expireAfterSeconds: 60 * 60 * 24 * 365 // 1 year retention
    };

    const environmentalData = await this.db.createCollection(
      'environmental_monitoring',
      environmentalConfig
    );

    // Pattern 3: Device health metrics (low frequency)
    const deviceHealthConfig = {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'device',
        granularity: 'hours',
        bucketMaxSpanSeconds: 86400 * 7, // Weekly buckets
        bucketRoundingSeconds: 86400 // Round to day boundaries
      },
      expireAfterSeconds: 60 * 60 * 24 * 365 * 5 // 5 years retention
    };

    const deviceHealth = await this.db.createCollection(
      'device_health_metrics',
      deviceHealthConfig
    );

    // Pattern 4: Event-based time series (irregular intervals)
    const eventBasedConfig = {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'eventSource',
        granularity: 'minutes' // Flexible for irregular events
      },
      expireAfterSeconds: 60 * 60 * 24 * 90 // 90 days retention
    };

    const eventTimeSeries = await this.db.createCollection(
      'event_time_series',
      eventBasedConfig
    );

    // Store collection references
    this.collections.set('highFrequency', highFrequencySensors);
    this.collections.set('environmental', environmentalData);
    this.collections.set('deviceHealth', deviceHealth);
    this.collections.set('events', eventTimeSeries);

    console.log('Time series collections created successfully');
    return this.collections;
  }

  async setupOptimalIndexes() {
    // Create compound indexes for common query patterns
    for (const [name, collection] of this.collections.entries()) {
      try {
        // Metadata + time range queries
        await collection.createIndex({
          'sensor.id': 1,
          'timestamp': 1
        });

        // Location-based queries
        await collection.createIndex({
          'sensor.location.building': 1,
          'sensor.location.floor': 1,
          'timestamp': 1
        });

        // Device type queries
        await collection.createIndex({
          'sensor.type': 1,
          'timestamp': 1
        });

        // Data quality queries
        await collection.createIndex({
          'quality.isValid': 1,
          'timestamp': 1
        });

        console.log(`Indexes created for ${name} collection`);

      } catch (error) {
        console.error(`Error creating indexes for ${name}:`, error);
      }
    }
  }

  async ingestHighFrequencyData(sensorData) {
    // High-performance ingestion with batching
    const collection = this.collections.get('highFrequency');
    const batchSize = 10000;
    const batches = [];

    // Prepare optimized document structure
    const documents = sensorData.map(reading => ({
      timestamp: new Date(reading.timestamp),
      
      // Metadata field - groups related time series
      sensor: {
        id: reading.sensorId,
        type: reading.sensorType,
        model: reading.model || 'Unknown',
        location: {
          building: reading.building,
          floor: reading.floor,
          room: reading.room,
          coordinates: reading.coordinates
        },
        specifications: {
          accuracy: reading.accuracy,
          range: reading.range,
          units: reading.units
        }
      },

      // Measurements - optimized for compression
      temp: reading.temperature,
      hum: reading.humidity,
      press: reading.pressure,
      
      // Device status
      batt: reading.batteryLevel,
      signal: reading.signalStrength,
      
      // Data quality indicators
      quality: {
        isValid: reading.isValid !== false,
        confidence: reading.confidence || 1.0,
        source: reading.source || 'sensor'
      }
    }));

    // Split into batches for optimal ingestion
    for (let i = 0; i < documents.length; i += batchSize) {
      batches.push(documents.slice(i, i + batchSize));
    }

    // Parallel batch ingestion
    const ingestionPromises = batches.map(async (batch, index) => {
      try {
        const result = await collection.insertMany(batch, {
          ordered: false,
          writeConcern: { w: 1 }
        });
        
        console.log(`Batch ${index + 1}: Inserted ${result.insertedCount} documents`);
        return result.insertedCount;

      } catch (error) {
        console.error(`Batch ${index + 1} failed:`, error);
        return 0;
      }
    });

    const results = await Promise.all(ingestionPromises);
    const totalInserted = results.reduce((sum, count) => sum + count, 0);

    console.log(`Total documents inserted: ${totalInserted}`);
    return totalInserted;
  }

  async performRealTimeAnalytics(timeRange = '1h', sensorIds = []) {
    const collection = this.collections.get('highFrequency');
    
    // Calculate time range
    const timeRangeMs = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000
    };

    const startTime = new Date(Date.now() - timeRangeMs[timeRange]);

    const pipeline = [
      // Time range and sensor filtering
      {
        $match: {
          timestamp: { $gte: startTime },
          ...(sensorIds.length > 0 && { 'sensor.id': { $in: sensorIds } }),
          'quality.isValid': true
        }
      },

      // Time-based bucketing for aggregation
      {
        $group: {
          _id: {
            sensorId: '$sensor.id',
            sensorType: '$sensor.type',
            location: '$sensor.location.room',
            // Dynamic time bucketing based on range
            timeBucket: {
              $dateTrunc: {
                date: '$timestamp',
                unit: 'minute',
                binSize: timeRange === '15m' ? 1 : 
                        timeRange === '1h' ? 5 : 
                        timeRange === '6h' ? 15 : 60
              }
            }
          },
          
          // Statistical aggregations
          count: { $sum: 1 },
          
          // Temperature metrics
          tempAvg: { $avg: '$temp' },
          tempMin: { $min: '$temp' },
          tempMax: { $max: '$temp' },
          tempStdDev: { $stdDevPop: '$temp' },
          
          // Humidity metrics
          humAvg: { $avg: '$hum' },
          humMin: { $min: '$hum' },
          humMax: { $max: '$hum' },
          
          // Pressure metrics
          pressAvg: { $avg: '$press' },
          pressMin: { $min: '$press' },
          pressMax: { $max: '$press' },
          
          // Device health metrics
          battAvg: { $avg: '$batt' },
          battMin: { $min: '$batt' },
          signalAvg: { $avg: '$signal' },
          signalMin: { $min: '$signal' },
          
          // Data quality metrics
          validReadings: { $sum: 1 },
          avgConfidence: { $avg: '$quality.confidence' },
          
          // First and last values for trend calculation
          firstTemp: { $first: '$temp' },
          lastTemp: { $last: '$temp' },
          firstTimestamp: { $first: '$timestamp' },
          lastTimestamp: { $last: '$timestamp' }
        }
      },

      // Calculate derived metrics
      {
        $addFields: {
          // Temperature trends
          tempTrend: { $subtract: ['$lastTemp', '$firstTemp'] },
          tempCV: {
            $cond: {
              if: { $ne: ['$tempAvg', 0] },
              then: { $divide: ['$tempStdDev', '$tempAvg'] },
              else: 0
            }
          },
          
          // Time span for rate calculations
          timeSpanMinutes: {
            $divide: [
              { $subtract: ['$lastTimestamp', '$firstTimestamp'] },
              60000
            ]
          },
          
          // Device health status
          deviceStatus: {
            $switch: {
              branches: [
                {
                  case: { 
                    $and: [
                      { $gte: ['$battAvg', 80] },
                      { $gte: ['$signalAvg', -50] }
                    ]
                  },
                  then: 'excellent'
                },
                {
                  case: {
                    $and: [
                      { $gte: ['$battAvg', 50] },
                      { $gte: ['$signalAvg', -65] }
                    ]
                  },
                  then: 'good'
                },
                {
                  case: {
                    $or: [
                      { $lt: ['$battAvg', 20] },
                      { $lt: ['$signalAvg', -80] }
                    ]
                  },
                  then: 'critical'
                }
              ],
              default: 'warning'
            }
          }
        }
      },

      // Sort for time series presentation
      {
        $sort: {
          '_id.sensorId': 1,
          '_id.timeBucket': 1
        }
      },

      // Format for dashboard consumption
      {
        $group: {
          _id: '$_id.sensorId',
          sensorType: { $first: '$_id.sensorType' },
          location: { $first: '$_id.location' },
          
          // Time series data
          timeSeries: {
            $push: {
              timestamp: '$_id.timeBucket',
              temperature: {
                avg: '$tempAvg',
                min: '$tempMin',
                max: '$tempMax',
                trend: '$tempTrend',
                cv: '$tempCV'
              },
              humidity: {
                avg: '$humAvg',
                min: '$humMin',
                max: '$humMax'
              },
              pressure: {
                avg: '$pressAvg',
                min: '$pressMin',
                max: '$pressMax'
              },
              deviceHealth: {
                battery: '$battAvg',
                signal: '$signalAvg',
                status: '$deviceStatus'
              },
              dataQuality: {
                readingCount: '$count',
                confidence: '$avgConfidence'
              }
            }
          },
          
          // Summary statistics
          summaryStats: {
            totalReadings: { $sum: '$count' },
            avgTemperature: { $avg: '$tempAvg' },
            temperatureRange: {
              $subtract: [{ $max: '$tempMax' }, { $min: '$tempMin' }]
            },
            overallDeviceStatus: { $last: '$deviceStatus' }
          }
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();
    
    // Add metadata about the query
    return {
      timeRange: timeRange,
      queryTime: new Date(),
      startTime: startTime,
      endTime: new Date(),
      sensorCount: results.length,
      data: results
    };
  }

  async detectAnomaliesAdvanced(sensorId, lookbackHours = 168) { // 1 week default
    const collection = this.collections.get('highFrequency');
    const lookbackTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    const pipeline = [
      {
        $match: {
          'sensor.id': sensorId,
          timestamp: { $gte: lookbackTime },
          'quality.isValid': true
        }
      },

      { $sort: { timestamp: 1 } },

      // Calculate rolling statistics using window functions
      {
        $setWindowFields: {
          sortBy: { timestamp: 1 },
          output: {
            // Rolling 50-point statistics for anomaly detection
            rollingMean: {
              $avg: '$temp',
              window: { documents: [-25, 25] }
            },
            rollingStd: {
              $stdDevPop: '$temp',
              window: { documents: [-25, 25] }
            },
            
            // Seasonal decomposition (24-hour pattern)
            dailyMean: {
              $avg: '$temp',
              window: { range: [-12, 12], unit: 'hour' }
            },
            
            // Trend analysis
            trendSlope: {
              $linearFill: '$temp'
            },
            
            // Previous values for rate of change
            prevTemp: {
              $first: '$temp',
              window: { documents: [-1, -1] }
            }
          }
        }
      },

      // Calculate anomaly scores
      {
        $addFields: {
          // Z-score anomaly detection
          zScore: {
            $cond: {
              if: { $ne: ['$rollingStd', 0] },
              then: {
                $divide: [
                  { $subtract: ['$temp', '$rollingMean'] },
                  '$rollingStd'
                ]
              },
              else: 0
            }
          },
          
          // Seasonal anomaly (deviation from daily pattern)
          seasonalAnomaly: {
            $cond: {
              if: { $ne: ['$dailyMean', 0] },
              then: {
                $abs: {
                  $divide: [
                    { $subtract: ['$temp', '$dailyMean'] },
                    '$dailyMean'
                  ]
                }
              },
              else: 0
            }
          },
          
          // Rate of change anomaly
          rateOfChange: {
            $cond: {
              if: { $and: ['$prevTemp', { $ne: ['$prevTemp', 0] }] },
              then: {
                $abs: {
                  $divide: [
                    { $subtract: ['$temp', '$prevTemp'] },
                    '$prevTemp'
                  ]
                }
              },
              else: 0
            }
          }
        }
      },

      // Identify anomalies using multiple criteria
      {
        $addFields: {
          isAnomaly: {
            $or: [
              { $gt: [{ $abs: '$zScore' }, 3] }, // Statistical outlier
              { $gt: ['$seasonalAnomaly', 0.3] }, // 30% deviation from seasonal
              { $gt: ['$rateOfChange', 0.5] } // 50% rate of change
            ]
          },
          
          anomalyType: {
            $switch: {
              branches: [
                {
                  case: { $gt: ['$zScore', 3] },
                  then: 'statistical_high'
                },
                {
                  case: { $lt: ['$zScore', -3] },
                  then: 'statistical_low'
                },
                {
                  case: { $gt: ['$seasonalAnomaly', 0.3] },
                  then: 'seasonal_deviation'
                },
                {
                  case: { $gt: ['$rateOfChange', 0.5] },
                  then: 'rapid_change'
                }
              ],
              default: 'normal'
            }
          },
          
          anomalySeverity: {
            $switch: {
              branches: [
                {
                  case: { $gt: [{ $abs: '$zScore' }, 5] },
                  then: 'critical'
                },
                {
                  case: { $gt: [{ $abs: '$zScore' }, 4] },
                  then: 'high'
                },
                {
                  case: { $gt: [{ $abs: '$zScore' }, 3] },
                  then: 'medium'
                }
              ],
              default: 'low'
            }
          }
        }
      },

      // Filter to anomalies only
      { $match: { isAnomaly: true } },

      // Group consecutive anomalies into events
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d-%H',
              date: '$timestamp'
            }
          },
          
          anomalyCount: { $sum: 1 },
          avgSeverityScore: { $avg: { $abs: '$zScore' } },
          
          anomalies: {
            $push: {
              timestamp: '$timestamp',
              value: '$temp',
              zScore: '$zScore',
              type: '$anomalyType',
              severity: '$anomalySeverity',
              seasonalDeviation: '$seasonalAnomaly',
              rateOfChange: '$rateOfChange'
            }
          },
          
          startTime: { $min: '$timestamp' },
          endTime: { $max: '$timestamp' }
        }
      },

      { $sort: { startTime: -1 } }
    ];

    return await collection.aggregate(pipeline).toArray();
  }

  async generatePerformanceReports(reportType = 'daily') {
    const collection = this.collections.get('highFrequency');
    
    // Calculate report time range
    const timeRanges = {
      'hourly': 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000,
      'weekly': 7 * 24 * 60 * 60 * 1000,
      'monthly': 30 * 24 * 60 * 60 * 1000
    };

    const startTime = new Date(Date.now() - timeRanges[reportType]);

    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startTime }
        }
      },

      // Group by sensor and time period
      {
        $group: {
          _id: {
            sensorId: '$sensor.id',
            sensorType: '$sensor.type',
            location: '$sensor.location',
            period: {
              $dateTrunc: {
                date: '$timestamp',
                unit: reportType === 'hourly' ? 'hour' :
                      reportType === 'daily' ? 'day' :
                      reportType === 'weekly' ? 'week' : 'month'
              }
            }
          },

          // Data volume metrics
          totalReadings: { $sum: 1 },
          validReadings: {
            $sum: { $cond: ['$quality.isValid', 1, 0] }
          },
          
          // Data quality metrics
          avgConfidence: { $avg: '$quality.confidence' },
          dataQualityRatio: {
            $avg: { $cond: ['$quality.isValid', 1, 0] }
          },
          
          // Measurement statistics
          tempStats: {
            $push: {
              avg: { $avg: '$temp' },
              min: { $min: '$temp' },
              max: { $max: '$temp' },
              stdDev: { $stdDevPop: '$temp' }
            }
          },
          
          // Device health metrics
          avgBatteryLevel: { $avg: '$batt' },
          minBatteryLevel: { $min: '$batt' },
          avgSignalStrength: { $avg: '$signal' },
          minSignalStrength: { $min: '$signal' },
          
          // Time coverage
          firstReading: { $min: '$timestamp' },
          lastReading: { $max: '$timestamp' }
        }
      },

      // Calculate performance indicators
      {
        $addFields: {
          // Coverage percentage
          coveragePercentage: {
            $multiply: [
              {
                $divide: [
                  { $subtract: ['$lastReading', '$firstReading'] },
                  timeRanges[reportType]
                ]
              },
              100
            ]
          },
          
          // Device health score
          deviceHealthScore: {
            $multiply: [
              {
                $add: [
                  { $divide: ['$avgBatteryLevel', 100] }, // Battery factor
                  { $divide: [{ $add: ['$avgSignalStrength', 100] }, 50] } // Signal factor
                ]
              },
              50
            ]
          },
          
          // Overall performance score
          performanceScore: {
            $multiply: [
              {
                $add: [
                  { $multiply: ['$dataQualityRatio', 0.4] },
                  { $multiply: [{ $divide: ['$avgConfidence', 1] }, 0.3] },
                  { $multiply: [{ $divide: ['$avgBatteryLevel', 100] }, 0.2] },
                  { $multiply: [{ $divide: [{ $add: ['$avgSignalStrength', 100] }, 50] }, 0.1] }
                ]
              },
              100
            ]
          }
        }
      },

      // Generate recommendations
      {
        $addFields: {
          recommendations: {
            $switch: {
              branches: [
                {
                  case: { $lt: ['$dataQualityRatio', 0.9] },
                  then: ['Investigate data quality issues', 'Check sensor calibration']
                },
                {
                  case: { $lt: ['$avgBatteryLevel', 30] },
                  then: ['Schedule battery replacement', 'Consider solar charging']
                },
                {
                  case: { $lt: ['$avgSignalStrength', -75] },
                  then: ['Check network connectivity', 'Consider signal boosters']
                },
                {
                  case: { $lt: ['$coveragePercentage', 95] },
                  then: ['Investigate data gaps', 'Check device uptime']
                }
              ],
              default: ['Performance within normal parameters']
            }
          },
          
          alertLevel: {
            $switch: {
              branches: [
                {
                  case: { $lt: ['$performanceScore', 60] },
                  then: 'critical'
                },
                {
                  case: { $lt: ['$performanceScore', 80] },
                  then: 'warning'
                }
              ],
              default: 'normal'
            }
          }
        }
      },

      {
        $sort: {
          performanceScore: 1, // Lowest scores first
          '_id.sensorId': 1
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    return {
      reportType: reportType,
      generatedAt: new Date(),
      timeRange: {
        start: startTime,
        end: new Date()
      },
      summary: {
        totalSensors: results.length,
        criticalAlerts: results.filter(r => r.alertLevel === 'critical').length,
        warnings: results.filter(r => r.alertLevel === 'warning').length,
        avgPerformanceScore: results.reduce((sum, r) => sum + r.performanceScore, 0) / results.length
      },
      sensorReports: results
    };
  }
}
```

## SQL-Style Time Series Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Time Series operations:

```sql
-- QueryLeaf time series operations with SQL-familiar syntax

-- Create time series collection
CREATE TIME_SERIES COLLECTION sensor_readings (
  timestamp TIMESTAMP NOT NULL, -- time field
  sensor_id VARCHAR(100) NOT NULL,
  location VARCHAR(200),
  device_id VARCHAR(100),
  
  -- Measurements
  temperature DECIMAL(5,2),
  humidity DECIMAL(5,2),
  pressure DECIMAL(7,2),
  
  -- Device health
  battery_level DECIMAL(3,2),
  signal_strength INTEGER,
  
  -- Data quality
  is_valid BOOLEAN DEFAULT true,
  confidence DECIMAL(3,2) DEFAULT 1.00
) WITH (
  meta_field = 'sensor_metadata',
  granularity = 'minutes',
  expire_after_seconds = 2678400 -- 31 days
);

-- High-performance batch insert for IoT data
INSERT INTO sensor_readings 
VALUES 
  ('2024-09-17 10:00:00', 'TEMP_001', 'Warehouse_A', 'DEV_001', 23.5, 65.2, 1013.25, 85.3, -45, true, 0.98),
  ('2024-09-17 10:01:00', 'TEMP_001', 'Warehouse_A', 'DEV_001', 23.7, 65.0, 1013.30, 85.2, -46, true, 0.97),
  ('2024-09-17 10:02:00', 'TEMP_001', 'Warehouse_A', 'DEV_001', 23.6, 64.8, 1013.28, 85.1, -44, true, 0.99);

-- Real-time dashboard query with time bucketing
SELECT 
  sensor_id,
  location,
  TIME_BUCKET('15 minutes', timestamp) as time_bucket,
  
  -- Statistical aggregations
  COUNT(*) as reading_count,
  AVG(temperature) as avg_temperature,
  MIN(temperature) as min_temperature,
  MAX(temperature) as max_temperature,
  STDDEV_POP(temperature) as temp_stddev,
  
  AVG(humidity) as avg_humidity,
  AVG(pressure) as avg_pressure,
  
  -- Device health metrics
  AVG(battery_level) as avg_battery,
  MIN(battery_level) as min_battery,
  AVG(signal_strength) as avg_signal,
  
  -- Data quality metrics
  SUM(CASE WHEN is_valid THEN 1 ELSE 0 END) as valid_readings,
  AVG(confidence) as avg_confidence,
  
  -- Trend indicators
  FIRST_VALUE(temperature ORDER BY timestamp) as first_temp,
  LAST_VALUE(temperature ORDER BY timestamp) as last_temp,
  LAST_VALUE(temperature ORDER BY timestamp) - FIRST_VALUE(temperature ORDER BY timestamp) as temp_change

FROM sensor_readings
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND sensor_id IN ('TEMP_001', 'TEMP_002', 'TEMP_003')
  AND is_valid = true
GROUP BY sensor_id, location, TIME_BUCKET('15 minutes', timestamp)
ORDER BY sensor_id, time_bucket;

-- Advanced anomaly detection with window functions
WITH statistical_baseline AS (
  SELECT 
    sensor_id,
    timestamp,
    temperature,
    
    -- Rolling statistics for anomaly detection
    AVG(temperature) OVER (
      PARTITION BY sensor_id
      ORDER BY timestamp
      ROWS BETWEEN 25 PRECEDING AND 25 FOLLOWING
    ) as rolling_avg,
    
    STDDEV_POP(temperature) OVER (
      PARTITION BY sensor_id  
      ORDER BY timestamp
      ROWS BETWEEN 25 PRECEDING AND 25 FOLLOWING
    ) as rolling_stddev,
    
    -- Seasonal baseline (same hour of day pattern)
    AVG(temperature) OVER (
      PARTITION BY sensor_id, EXTRACT(hour FROM timestamp)
      ORDER BY timestamp
      RANGE BETWEEN INTERVAL '7 days' PRECEDING AND INTERVAL '7 days' FOLLOWING
    ) as seasonal_avg,
    
    -- Previous value for rate of change
    LAG(temperature, 1) OVER (
      PARTITION BY sensor_id 
      ORDER BY timestamp
    ) as prev_temperature
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND is_valid = true
),
anomaly_scores AS (
  SELECT *,
    -- Z-score calculation
    CASE 
      WHEN rolling_stddev > 0 THEN (temperature - rolling_avg) / rolling_stddev
      ELSE 0 
    END as z_score,
    
    -- Seasonal deviation
    ABS(temperature - seasonal_avg) / GREATEST(seasonal_avg, 0.1) as seasonal_deviation,
    
    -- Rate of change
    CASE 
      WHEN prev_temperature IS NOT NULL AND prev_temperature != 0 
      THEN ABS(temperature - prev_temperature) / ABS(prev_temperature)
      ELSE 0 
    END as rate_of_change
    
  FROM statistical_baseline
),
classified_anomalies AS (
  SELECT *,
    -- Anomaly classification
    CASE
      WHEN ABS(z_score) > 3 OR seasonal_deviation > 0.3 OR rate_of_change > 0.5 THEN true
      ELSE false
    END as is_anomaly,
    
    CASE 
      WHEN z_score > 3 THEN 'statistical_high'
      WHEN z_score < -3 THEN 'statistical_low'
      WHEN seasonal_deviation > 0.3 THEN 'seasonal_deviation'
      WHEN rate_of_change > 0.5 THEN 'rapid_change'
      ELSE 'normal'
    END as anomaly_type,
    
    CASE
      WHEN ABS(z_score) > 5 THEN 'critical'
      WHEN ABS(z_score) > 4 THEN 'high'
      WHEN ABS(z_score) > 3 THEN 'medium'
      ELSE 'low'
    END as severity
    
  FROM anomaly_scores
)
SELECT 
  sensor_id,
  DATE_TRUNC('hour', timestamp) as anomaly_hour,
  COUNT(*) as anomaly_count,
  AVG(ABS(z_score)) as avg_severity_score,
  
  -- Anomaly details
  json_agg(
    json_build_object(
      'timestamp', timestamp,
      'temperature', temperature,
      'z_score', ROUND(z_score::numeric, 3),
      'type', anomaly_type,
      'severity', severity
    ) ORDER BY timestamp
  ) as anomalies,
  
  MIN(timestamp) as first_anomaly,
  MAX(timestamp) as last_anomaly
  
FROM classified_anomalies
WHERE is_anomaly = true
GROUP BY sensor_id, DATE_TRUNC('hour', timestamp)
ORDER BY sensor_id, anomaly_hour DESC;

-- Predictive maintenance analysis
WITH device_health_trends AS (
  SELECT 
    device_id,
    sensor_id,
    DATE_TRUNC('day', timestamp) as day,
    
    AVG(battery_level) as daily_battery_avg,
    MIN(battery_level) as daily_battery_min,
    AVG(signal_strength) as daily_signal_avg,
    MIN(signal_strength) as daily_signal_min,
    COUNT(*) as daily_reading_count,
    
    -- Data quality metrics
    AVG(CASE WHEN is_valid THEN 1.0 ELSE 0.0 END) as data_quality_ratio,
    AVG(confidence) as avg_confidence
    
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  GROUP BY device_id, sensor_id, DATE_TRUNC('day', timestamp)
),
trend_analysis AS (
  SELECT *,
    -- Linear trend approximation using least squares
    REGR_SLOPE(daily_battery_avg, EXTRACT(epoch FROM day)) * 86400 as battery_daily_slope,
    REGR_SLOPE(daily_signal_avg, EXTRACT(epoch FROM day)) * 86400 as signal_daily_slope,
    
    -- Device health scoring
    (daily_battery_avg * 0.4 + 
     (daily_signal_avg + 100) / 50 * 100 * 0.3 +
     data_quality_ratio * 100 * 0.3) as health_score
     
  FROM device_health_trends
),
maintenance_predictions AS (
  SELECT 
    device_id,
    
    -- Latest status
    LAST_VALUE(daily_battery_avg ORDER BY day) as current_battery,
    LAST_VALUE(daily_signal_avg ORDER BY day) as current_signal,
    LAST_VALUE(data_quality_ratio ORDER BY day) as current_quality,
    LAST_VALUE(health_score ORDER BY day) as current_health_score,
    
    -- Trends
    AVG(battery_daily_slope) as battery_trend,
    AVG(signal_daily_slope) as signal_trend,
    
    -- Predictions
    CASE 
      WHEN AVG(battery_daily_slope) < -0.5 THEN 
        CEIL(LAST_VALUE(daily_battery_avg ORDER BY day) / ABS(AVG(battery_daily_slope)))
      ELSE 365 
    END as estimated_battery_days,
    
    -- Risk assessment
    CASE
      WHEN LAST_VALUE(daily_battery_avg ORDER BY day) < 20 OR 
           LAST_VALUE(data_quality_ratio ORDER BY day) < 0.8 THEN 'immediate'
      WHEN LAST_VALUE(daily_battery_avg ORDER BY day) < 40 OR 
           LAST_VALUE(daily_signal_avg ORDER BY day) < -70 THEN 'high'
      WHEN LAST_VALUE(daily_battery_avg ORDER BY day) < 60 THEN 'medium'
      ELSE 'low'
    END as maintenance_risk,
    
    COUNT(*) as days_monitored
    
  FROM trend_analysis
  GROUP BY device_id
)
SELECT 
  device_id,
  ROUND(current_battery, 1) as battery_level,
  ROUND(current_signal, 1) as signal_strength,
  ROUND(current_quality * 100, 1) as data_quality_pct,
  ROUND(current_health_score, 1) as health_score,
  
  -- Trends
  CASE 
    WHEN battery_trend < -0.1 THEN 'declining'
    WHEN battery_trend > 0.1 THEN 'improving'
    ELSE 'stable'
  END as battery_trend_status,
  
  estimated_battery_days,
  maintenance_risk,
  
  -- Recommendations
  CASE maintenance_risk
    WHEN 'immediate' THEN 'Schedule maintenance within 24 hours'
    WHEN 'high' THEN 'Schedule maintenance within 1 week'  
    WHEN 'medium' THEN 'Schedule maintenance within 1 month'
    ELSE 'Monitor normal schedule'
  END as recommendation,
  
  days_monitored
  
FROM maintenance_predictions
ORDER BY 
  CASE maintenance_risk
    WHEN 'immediate' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  estimated_battery_days ASC;

-- Time series downsampling and data retention
CREATE MATERIALIZED VIEW hourly_sensor_summary AS
SELECT 
  sensor_id,
  location,
  device_id,
  TIME_BUCKET('1 hour', timestamp) as hour_bucket,
  
  -- Statistical summaries
  COUNT(*) as reading_count,
  AVG(temperature) as avg_temperature,
  MIN(temperature) as min_temperature,  
  MAX(temperature) as max_temperature,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY temperature) as median_temperature,
  STDDEV_POP(temperature) as temp_stddev,
  
  AVG(humidity) as avg_humidity,
  AVG(pressure) as avg_pressure,
  
  -- Device health summaries
  AVG(battery_level) as avg_battery,
  MIN(battery_level) as min_battery,
  AVG(signal_strength) as avg_signal,
  
  -- Quality metrics
  AVG(CASE WHEN is_valid THEN 1.0 ELSE 0.0 END) as data_quality,
  AVG(confidence) as avg_confidence,
  
  -- Time range
  MIN(timestamp) as period_start,
  MAX(timestamp) as period_end
  
FROM sensor_readings
WHERE is_valid = true
GROUP BY sensor_id, location, device_id, TIME_BUCKET('1 hour', timestamp);

-- Performance monitoring and optimization
WITH collection_stats AS (
  SELECT 
    'sensor_readings' as collection_name,
    COUNT(*) as total_documents,
    
    -- Time range analysis
    MIN(timestamp) as earliest_data,
    MAX(timestamp) as latest_data,
    MAX(timestamp) - MIN(timestamp) as time_span,
    
    -- Data volume analysis  
    COUNT(*) / EXTRACT(days FROM (MAX(timestamp) - MIN(timestamp))) as avg_docs_per_day,
    
    -- Quality metrics
    AVG(CASE WHEN is_valid THEN 1.0 ELSE 0.0 END) as overall_quality,
    COUNT(DISTINCT sensor_id) as unique_sensors,
    COUNT(DISTINCT device_id) as unique_devices
    
  FROM sensor_readings
),
performance_metrics AS (
  SELECT 
    cs.*,
    
    -- Storage efficiency estimates
    total_documents * 200 as estimated_storage_bytes, -- Rough estimate
    
    -- Query performance indicators
    CASE 
      WHEN avg_docs_per_day > 100000 THEN 'high_volume'
      WHEN avg_docs_per_day > 10000 THEN 'medium_volume'
      ELSE 'low_volume'
    END as volume_category,
    
    -- Recommendations
    CASE
      WHEN overall_quality < 0.9 THEN 'Review data validation and sensor calibration'
      WHEN avg_docs_per_day > 100000 THEN 'Consider additional indexing and archiving strategy'
      WHEN time_span > INTERVAL '6 months' THEN 'Implement data lifecycle management'
      ELSE 'Performance within normal parameters'
    END as recommendation
    
  FROM collection_stats cs
)
SELECT 
  collection_name,
  total_documents,
  TO_CHAR(earliest_data, 'YYYY-MM-DD HH24:MI') as data_start,
  TO_CHAR(latest_data, 'YYYY-MM-DD HH24:MI') as data_end,
  EXTRACT(days FROM time_span) as retention_days,
  ROUND(avg_docs_per_day::numeric, 0) as daily_ingestion_rate,
  ROUND(overall_quality * 100, 1) as quality_percentage,
  unique_sensors,
  unique_devices,
  volume_category,
  ROUND(estimated_storage_bytes / 1024.0 / 1024.0, 1) as estimated_storage_mb,
  recommendation
FROM performance_metrics;

-- QueryLeaf provides comprehensive time series capabilities:
-- 1. SQL-familiar time series collection creation and management
-- 2. High-performance batch data ingestion optimized for IoT workloads  
-- 3. Advanced time bucketing and statistical aggregations
-- 4. Sophisticated anomaly detection using multiple algorithms
-- 5. Predictive maintenance analysis with trend forecasting
-- 6. Automatic data lifecycle management and retention policies
-- 7. Performance monitoring and optimization recommendations
-- 8. Integration with MongoDB's native time series optimizations
-- 9. Real-time analytics with materialized view support
-- 10. Familiar SQL syntax for complex temporal queries and analysis
```

## Best Practices for Time Series Implementation

### Data Modeling and Schema Design

Essential practices for optimal time series performance:

1. **Granularity Selection**: Choose appropriate time granularity based on data frequency and query patterns
2. **Metadata Organization**: Structure metadata fields to optimize automatic bucketing and compression
3. **Measurement Optimization**: Use efficient data types and avoid deep nesting for measurements
4. **Index Strategy**: Create compound indexes supporting common time range and metadata queries
5. **Retention Policies**: Implement automatic expiration aligned with business requirements
6. **Batch Ingestion**: Use bulk operations for high-throughput IoT data ingestion

### Performance and Scalability

Optimize time series collections for high-performance analytics:

1. **Bucket Sizing**: Configure bucket parameters for optimal compression and query performance
2. **Query Optimization**: Leverage time series specific aggregation patterns and operators
3. **Resource Planning**: Size clusters appropriately for expected data volumes and query loads
4. **Archival Strategy**: Implement data lifecycle management with cold storage integration
5. **Monitoring Setup**: Track collection performance and optimize based on usage patterns
6. **Downsampling**: Use materialized views and pre-aggregated summaries for historical analysis

## Conclusion

MongoDB Time Series Collections provide purpose-built capabilities for IoT data management and temporal analytics that eliminate the complexity and limitations of traditional relational approaches. The integration of automatic compression, optimized indexing, and specialized query patterns makes building high-performance time series applications both powerful and efficient.

Key Time Series benefits include:

- **Purpose-Built Storage**: Automatic partitioning and compression optimized for temporal data
- **High-Performance Ingestion**: Optimized for high-frequency IoT data streams
- **Advanced Analytics**: Native support for complex time-based aggregations and window functions
- **Automatic Lifecycle**: Built-in retention policies and data expiration management
- **Scalable Architecture**: Horizontal scaling across sharded clusters for massive datasets
- **Developer Familiar**: SQL-style query patterns with specialized time series operations

Whether you're building IoT monitoring platforms, sensor networks, financial trading systems, or applications requiring time-based analytics, MongoDB Time Series Collections with QueryLeaf's familiar SQL interface provides the foundation for modern temporal data management. This combination enables you to implement sophisticated time series capabilities while preserving familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Time Series Collections while providing SQL-familiar time bucketing, statistical aggregations, and temporal analytics. Advanced time series features, anomaly detection, and performance optimization are seamlessly handled through familiar SQL patterns, making high-performance time series analytics both powerful and accessible.

The integration of native time series capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both sophisticated temporal analytics and familiar database interaction patterns, ensuring your time series solutions remain both effective and maintainable as they scale and evolve.