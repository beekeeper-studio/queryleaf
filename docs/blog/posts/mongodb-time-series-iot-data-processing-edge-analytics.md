---
title: "MongoDB Time-Series Collections for IoT Data Processing: Edge Analytics and Real-Time Stream Processing"
description: "Master MongoDB time-series collections for IoT applications. Learn edge analytics, real-time stream processing, data aggregation, and production-scale IoT data management with SQL-familiar patterns."
date: 2025-12-24
tags: [mongodb, time-series, iot, analytics, edge-computing, streaming, sensor-data]
---

# MongoDB Time-Series Collections for IoT Data Processing: Edge Analytics and Real-Time Stream Processing

Modern IoT applications generate massive volumes of time-stamped sensor data requiring efficient storage, real-time analysis, and historical trend analysis. MongoDB's time-series collections provide specialized storage optimization and query capabilities designed specifically for time-ordered data workloads, enabling high-performance IoT data processing with familiar SQL-style analytics patterns.

Time-series collections in MongoDB automatically optimize storage layout, indexing strategies, and query execution for temporal data patterns, significantly improving performance for IoT sensor readings, device telemetry, financial market data, and application metrics while maintaining the flexibility to handle complex nested sensor data structures.

## The IoT Data Processing Challenge

Consider a smart manufacturing facility with thousands of sensors generating continuous data streams:

```javascript
// Traditional document storage - inefficient for time-series data
{
  "_id": ObjectId("..."),
  "device_id": "SENSOR_001_TEMP",
  "device_type": "temperature",
  "location": "assembly_line_1", 
  "timestamp": ISODate("2025-12-24T10:15:30.123Z"),
  "temperature_celsius": 23.5,
  "humidity_percent": 45.2,
  "pressure_bar": 1.013,
  "battery_level": 87,
  "signal_strength": -65,
  "metadata": {
    "firmware_version": "2.1.4",
    "calibration_date": ISODate("2025-11-15T00:00:00Z"),
    "maintenance_status": "ok"
  }
}

// Problems with traditional collections for IoT data:
// 1. Storage Overhead: Full document structure repeated for each reading
// 2. Index Inefficiency: Generic indexes not optimized for time-ordered queries
// 3. Query Performance: Range queries on timestamp fields are slow
// 4. Memory Usage: Large working sets for time-based aggregations
// 5. Disk I/O: Scattered document layout reduces sequential read performance
// 6. Scaling Issues: Hot-spotting on insertion due to monotonic timestamps
// 7. Compression: Limited compression opportunities with varied document structures

// Example of inefficient time-range query performance:
db.sensor_data.find({
  "device_id": "SENSOR_001_TEMP",
  "timestamp": {
    $gte: ISODate("2025-12-24T00:00:00Z"),
    $lt: ISODate("2025-12-24T01:00:00Z")
  }
}).explain("executionStats")
// Result: Full collection scan, high disk I/O, poor cache utilization
```

MongoDB time-series collections solve these challenges through specialized optimizations:

```javascript
// Create optimized time-series collection for IoT data
db.createCollection("iot_sensor_readings", {
  timeseries: {
    timeField: "timestamp",           // Required: field containing timestamp
    metaField: "device_info",         // Optional: field containing metadata
    granularity: "seconds",           // Optimization hint: seconds, minutes, or hours
    bucketMaxSpanSeconds: 3600,       // Maximum time span per bucket (1 hour)
    bucketRoundingSeconds: 3600       // Round bucket boundaries to hour marks
  },
  expireAfterSeconds: 7776000,        // TTL: expire data after 90 days
  clusteredIndex: {                   // Optimize for time-ordered access
    key: { timestamp: 1 },
    unique: false
  }
})

// Optimized IoT sensor data structure for time-series collections
{
  "timestamp": ISODate("2025-12-24T10:15:30.123Z"),    // Time field - always required
  "device_info": {                                      // Meta field - constant per device
    "device_id": "SENSOR_001_TEMP",
    "device_type": "temperature",
    "location": "assembly_line_1",
    "firmware_version": "2.1.4",
    "calibration_date": ISODate("2025-11-15T00:00:00Z")
  },
  // Measurement fields - vary over time
  "temperature_celsius": 23.5,
  "humidity_percent": 45.2,
  "pressure_bar": 1.013,
  "battery_level": 87,
  "signal_strength_dbm": -65,
  "status": "operational"
}
```

## IoT Data Ingestion and Streaming

### High-Throughput Sensor Data Insertion

```javascript
// Batch insertion for high-volume IoT data streams
const sensorReadings = [
  {
    timestamp: new Date("2025-12-24T10:15:00Z"),
    device_info: {
      device_id: "TEMP_001",
      location: "warehouse_zone_a",
      device_type: "environmental"
    },
    temperature_celsius: 22.1,
    humidity_percent: 43.5,
    battery_level: 89
  },
  {
    timestamp: new Date("2025-12-24T10:15:30Z"),
    device_info: {
      device_id: "TEMP_001", 
      location: "warehouse_zone_a",
      device_type: "environmental"
    },
    temperature_celsius: 22.3,
    humidity_percent: 43.2,
    battery_level: 89
  },
  {
    timestamp: new Date("2025-12-24T10:15:00Z"),
    device_info: {
      device_id: "PRESS_002",
      location: "hydraulic_system_1",
      device_type: "pressure"
    },
    pressure_bar: 15.7,
    flow_rate_lpm: 125.3,
    valve_position_percent: 67
  }
  // ... thousands more readings
];

// Efficient bulk insertion with time-series optimizations
const result = await db.iot_sensor_readings.insertMany(sensorReadings, {
  ordered: false,        // Allow parallel inserts for better performance
  writeConcern: {        // Balance between performance and durability
    w: 1,               // Acknowledge from primary only
    j: false            // Don't wait for journal sync for high throughput
  }
});

console.log(`Inserted ${result.insertedCount} sensor readings`);
```

### Real-Time Data Streaming Pipeline

```javascript
// MongoDB Change Streams for real-time IoT data processing
const changeStream = db.iot_sensor_readings.watch([
  {
    $match: {
      "operationType": "insert",
      // Filter for specific device types or locations
      "fullDocument.device_info.device_type": { $in: ["temperature", "pressure"] },
      "fullDocument.device_info.location": { $regex: /^production_line/ }
    }
  },
  {
    $project: {
      timestamp: "$fullDocument.timestamp",
      device_id: "$fullDocument.device_info.device_id",
      location: "$fullDocument.device_info.location",
      temperature: "$fullDocument.temperature_celsius",
      pressure: "$fullDocument.pressure_bar",
      inserted_at: "$$clusterTime"
    }
  }
], { fullDocument: 'updateLookup' });

// Real-time alert processing
changeStream.on('change', async (changeEvent) => {
  const { timestamp, device_id, location, temperature, pressure } = changeEvent;
  
  // Temperature threshold monitoring
  if (temperature !== undefined && temperature > 35.0) {
    await processTemperatureAlert({
      device_id,
      location,
      temperature,
      timestamp,
      severity: temperature > 40.0 ? 'critical' : 'warning'
    });
  }
  
  // Pressure threshold monitoring  
  if (pressure !== undefined && pressure > 20.0) {
    await processPressureAlert({
      device_id,
      location,
      pressure,
      timestamp,
      severity: pressure > 25.0 ? 'critical' : 'warning'
    });
  }
  
  // Update real-time dashboard
  await updateDashboardMetrics({
    device_id,
    location,
    latest_reading: { temperature, pressure, timestamp }
  });
});

async function processTemperatureAlert(alertData) {
  // Check for sustained high temperature
  const recentReadings = await db.iot_sensor_readings.aggregate([
    {
      $match: {
        "device_info.device_id": alertData.device_id,
        "timestamp": {
          $gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
        },
        "temperature_celsius": { $gt: 35.0 }
      }
    },
    {
      $group: {
        _id: null,
        avg_temperature: { $avg: "$temperature_celsius" },
        max_temperature: { $max: "$temperature_celsius" },
        reading_count: { $sum: 1 }
      }
    }
  ]).next();
  
  if (recentReadings && recentReadings.reading_count >= 3) {
    // Sustained high temperature - trigger maintenance alert
    await db.maintenance_alerts.insertOne({
      alert_type: "temperature_sustained_high",
      device_id: alertData.device_id,
      location: alertData.location,
      severity: alertData.severity,
      current_temperature: alertData.temperature,
      avg_temperature_5min: recentReadings.avg_temperature,
      max_temperature_5min: recentReadings.max_temperature,
      created_at: new Date(),
      acknowledged: false
    });
    
    // Send notification to operations team
    await sendAlert({
      type: 'email',
      recipients: ['operations@manufacturing.com'],
      subject: `High Temperature Alert - ${alertData.location}`,
      body: `Device ${alertData.device_id} reporting sustained high temperature: ${alertData.temperature}°C`
    });
  }
}
```

## Time-Series Analytics and Aggregations

### SQL-Style Time-Based Analytics

```javascript
// Advanced time-series aggregation for IoT analytics
db.iot_sensor_readings.aggregate([
  // Stage 1: Filter recent sensor data
  {
    $match: {
      "timestamp": {
        $gte: ISODate("2025-12-24T00:00:00Z"),
        $lt: ISODate("2025-12-25T00:00:00Z")
      },
      "device_info.location": { $regex: /^production_line/ }
    }
  },
  
  // Stage 2: Time-based grouping (hourly buckets)
  {
    $group: {
      _id: {
        device_id: "$device_info.device_id",
        location: "$device_info.location", 
        device_type: "$device_info.device_type",
        hour: {
          $dateToString: {
            format: "%Y-%m-%d %H:00:00",
            date: "$timestamp"
          }
        }
      },
      
      // Temperature analytics
      avg_temperature: { $avg: "$temperature_celsius" },
      min_temperature: { $min: "$temperature_celsius" },
      max_temperature: { $max: "$temperature_celsius" },
      temperature_readings: { $sum: { $cond: [{ $ne: ["$temperature_celsius", null] }, 1, 0] } },
      
      // Pressure analytics
      avg_pressure: { $avg: "$pressure_bar" },
      min_pressure: { $min: "$pressure_bar" },
      max_pressure: { $max: "$pressure_bar" },
      pressure_readings: { $sum: { $cond: [{ $ne: ["$pressure_bar", null] }, 1, 0] } },
      
      // Humidity analytics
      avg_humidity: { $avg: "$humidity_percent" },
      min_humidity: { $min: "$humidity_percent" },
      max_humidity: { $max: "$humidity_percent" },
      
      // Battery level monitoring
      avg_battery: { $avg: "$battery_level" },
      min_battery: { $min: "$battery_level" },
      low_battery_count: { 
        $sum: { $cond: [{ $and: [{ $ne: ["$battery_level", null] }, { $lt: ["$battery_level", 20] }] }, 1, 0] }
      },
      
      // Data quality metrics
      total_readings: { $sum: 1 },
      missing_data_count: { 
        $sum: { 
          $cond: [
            {
              $and: [
                { $eq: ["$temperature_celsius", null] },
                { $eq: ["$pressure_bar", null] },
                { $eq: ["$humidity_percent", null] }
              ]
            }, 
            1, 
            0
          ]
        }
      },
      
      // Signal quality
      avg_signal_strength: { $avg: "$signal_strength_dbm" },
      weak_signal_count: {
        $sum: { $cond: [{ $and: [{ $ne: ["$signal_strength_dbm", null] }, { $lt: ["$signal_strength_dbm", -80] }] }, 1, 0] }
      },
      
      first_reading_time: { $min: "$timestamp" },
      last_reading_time: { $max: "$timestamp" }
    }
  },
  
  // Stage 3: Calculate derived metrics and data quality indicators
  {
    $addFields: {
      // Temperature variation coefficient
      temperature_variation_coefficient: {
        $cond: [
          { $gt: ["$avg_temperature", 0] },
          {
            $divide: [
              { $subtract: ["$max_temperature", "$min_temperature"] },
              "$avg_temperature"
            ]
          },
          null
        ]
      },
      
      // Pressure stability indicator
      pressure_stability_score: {
        $cond: [
          { $and: [{ $gt: ["$avg_pressure", 0] }, { $gt: ["$pressure_readings", 10] }] },
          {
            $subtract: [
              1,
              {
                $divide: [
                  { $subtract: ["$max_pressure", "$min_pressure"] },
                  { $multiply: ["$avg_pressure", 2] }
                ]
              }
            ]
          },
          null
        ]
      },
      
      // Data completeness percentage
      data_completeness_percent: {
        $multiply: [
          {
            $divide: [
              { $subtract: ["$total_readings", "$missing_data_count"] },
              "$total_readings"
            ]
          },
          100
        ]
      },
      
      // Equipment health score (composite metric)
      equipment_health_score: {
        $multiply: [
          {
            $avg: [
              // Battery health factor (0-1)
              { $divide: ["$avg_battery", 100] },
              
              // Signal quality factor (0-1)
              { 
                $cond: [
                  { $ne: ["$avg_signal_strength", null] },
                  { $divide: [{ $add: ["$avg_signal_strength", 100] }, 100] },
                  0.5
                ]
              },
              
              // Data quality factor (0-1)
              { $divide: ["$data_completeness_percent", 100] }
            ]
          },
          100
        ]
      }
    }
  },
  
  // Stage 4: Quality and threshold analysis
  {
    $addFields: {
      temperature_status: {
        $switch: {
          branches: [
            { case: { $gt: ["$max_temperature", 40] }, then: "critical" },
            { case: { $gt: ["$avg_temperature", 35] }, then: "warning" },
            { case: { $lt: ["$avg_temperature", 15] }, then: "too_cold" },
            { case: { $gt: ["$temperature_variation_coefficient", 0.3] }, then: "unstable" }
          ],
          default: "normal"
        }
      },
      
      pressure_status: {
        $switch: {
          branches: [
            { case: { $gt: ["$max_pressure", 25] }, then: "critical" },
            { case: { $gt: ["$avg_pressure", 20] }, then: "warning" },
            { case: { $lt: ["$pressure_stability_score", 0.7] }, then: "unstable" }
          ],
          default: "normal"
        }
      },
      
      battery_status: {
        $switch: {
          branches: [
            { case: { $lt: ["$min_battery", 10] }, then: "critical" },
            { case: { $lt: ["$avg_battery", 20] }, then: "low" },
            { case: { $gt: ["$low_battery_count", 5] }, then: "degrading" }
          ],
          default: "normal"
        }
      },
      
      overall_status: {
        $switch: {
          branches: [
            { 
              case: { 
                $or: [
                  { $eq: ["$temperature_status", "critical"] },
                  { $eq: ["$pressure_status", "critical"] },
                  { $eq: ["$battery_status", "critical"] }
                ]
              }, 
              then: "critical" 
            },
            {
              case: {
                $or: [
                  { $eq: ["$temperature_status", "warning"] },
                  { $eq: ["$pressure_status", "warning"] },
                  { $eq: ["$battery_status", "low"] },
                  { $lt: ["$data_completeness_percent", 90] }
                ]
              },
              then: "warning"
            }
          ],
          default: "normal"
        }
      }
    }
  },
  
  // Stage 5: Sort and format results
  {
    $sort: {
      "_id.location": 1,
      "_id.device_id": 1,
      "_id.hour": 1
    }
  },
  
  // Stage 6: Project final analytics results
  {
    $project: {
      device_id: "$_id.device_id",
      location: "$_id.location",
      device_type: "$_id.device_type",
      hour: "$_id.hour",
      
      // Environmental metrics
      temperature_metrics: {
        average: { $round: ["$avg_temperature", 1] },
        minimum: { $round: ["$min_temperature", 1] },
        maximum: { $round: ["$max_temperature", 1] },
        variation_coefficient: { $round: ["$temperature_variation_coefficient", 3] },
        reading_count: "$temperature_readings",
        status: "$temperature_status"
      },
      
      pressure_metrics: {
        average: { $round: ["$avg_pressure", 2] },
        minimum: { $round: ["$min_pressure", 2] },
        maximum: { $round: ["$max_pressure", 2] },
        stability_score: { $round: ["$pressure_stability_score", 3] },
        reading_count: "$pressure_readings", 
        status: "$pressure_status"
      },
      
      humidity_metrics: {
        average: { $round: ["$avg_humidity", 1] },
        minimum: { $round: ["$min_humidity", 1] },
        maximum: { $round: ["$max_humidity", 1] }
      },
      
      // Equipment health
      equipment_metrics: {
        battery_average: { $round: ["$avg_battery", 1] },
        battery_minimum: "$min_battery",
        low_battery_incidents: "$low_battery_count",
        battery_status: "$battery_status",
        signal_strength_avg: { $round: ["$avg_signal_strength", 1] },
        weak_signal_count: "$weak_signal_count",
        health_score: { $round: ["$equipment_health_score", 1] }
      },
      
      // Data quality
      data_quality: {
        total_readings: "$total_readings",
        completeness_percent: { $round: ["$data_completeness_percent", 1] },
        missing_readings: "$missing_data_count",
        time_span_minutes: {
          $divide: [
            { $subtract: ["$last_reading_time", "$first_reading_time"] },
            60000
          ]
        }
      },
      
      overall_status: "$overall_status",
      analysis_timestamp: "$$NOW"
    }
  }
])
```

### Moving Averages and Trend Analysis

```javascript
// Calculate moving averages and trend detection for predictive maintenance
db.iot_sensor_readings.aggregate([
  {
    $match: {
      "device_info.device_id": "MOTOR_PUMP_001",
      "timestamp": {
        $gte: ISODate("2025-12-20T00:00:00Z"),
        $lt: ISODate("2025-12-25T00:00:00Z")
      }
    }
  },
  
  // Sort by timestamp for window functions
  { $sort: { "timestamp": 1 } },
  
  // Calculate moving averages using sliding windows
  {
    $setWindowFields: {
      partitionBy: "$device_info.device_id",
      sortBy: { "timestamp": 1 },
      output: {
        // 5-minute moving average for vibration
        vibration_ma_5min: {
          $avg: "$vibration_amplitude_mm",
          window: {
            range: [-300, 0], // 5 minutes in seconds
            unit: "second"
          }
        },
        
        // 15-minute moving average for temperature
        temperature_ma_15min: {
          $avg: "$temperature_celsius",
          window: {
            range: [-900, 0], // 15 minutes in seconds
            unit: "second"
          }
        },
        
        // 1-hour moving average for pressure
        pressure_ma_1hour: {
          $avg: "$pressure_bar",
          window: {
            range: [-3600, 0], // 1 hour in seconds
            unit: "second"
          }
        },
        
        // Rolling standard deviation for anomaly detection
        vibration_std_5min: {
          $stdDevSamp: "$vibration_amplitude_mm",
          window: {
            range: [-300, 0],
            unit: "second"
          }
        },
        
        // Previous reading for trend calculation
        prev_vibration: {
          $shift: {
            output: "$vibration_amplitude_mm",
            by: -1
          }
        },
        
        // Previous moving average for trend direction
        prev_vibration_ma: {
          $shift: {
            output: {
              $avg: "$vibration_amplitude_mm",
              window: {
                range: [-300, 0],
                unit: "second"
              }
            },
            by: -60 // 1-minute lag for trend detection
          }
        }
      }
    }
  },
  
  // Calculate derived trend metrics
  {
    $addFields: {
      // Vibration trend direction
      vibration_trend: {
        $cond: [
          { $and: [{ $ne: ["$vibration_ma_5min", null] }, { $ne: ["$prev_vibration_ma", null] }] },
          {
            $switch: {
              branches: [
                { 
                  case: { $gt: [{ $subtract: ["$vibration_ma_5min", "$prev_vibration_ma"] }, 0.1] },
                  then: "increasing"
                },
                {
                  case: { $lt: [{ $subtract: ["$vibration_ma_5min", "$prev_vibration_ma"] }, -0.1] },
                  then: "decreasing" 
                }
              ],
              default: "stable"
            }
          },
          null
        ]
      },
      
      // Anomaly detection using z-score
      vibration_anomaly_score: {
        $cond: [
          { $and: [{ $gt: ["$vibration_std_5min", 0] }, { $ne: ["$vibration_ma_5min", null] }] },
          {
            $abs: {
              $divide: [
                { $subtract: ["$vibration_amplitude_mm", "$vibration_ma_5min"] },
                "$vibration_std_5min"
              ]
            }
          },
          null
        ]
      },
      
      // Predictive maintenance indicators
      maintenance_risk_score: {
        $multiply: [
          {
            $add: [
              // High vibration factor
              { $cond: [{ $gt: ["$vibration_ma_5min", 2.5] }, 25, 0] },
              
              // Increasing vibration trend factor
              { $cond: [{ $eq: ["$vibration_trend", "increasing"] }, 15, 0] },
              
              // High temperature factor
              { $cond: [{ $gt: ["$temperature_ma_15min", 75] }, 20, 0] },
              
              // Anomaly factor
              { $cond: [{ $gt: ["$vibration_anomaly_score", 2] }, 30, 0] },
              
              // Pressure variation factor
              { $cond: [{ $gt: [{ $abs: { $subtract: ["$pressure_bar", "$pressure_ma_1hour"] } }, 2] }, 10, 0] }
            ]
          },
          0.01 // Scale to 0-100
        ]
      }
    }
  },
  
  // Filter to significant readings and add maintenance recommendations
  {
    $match: {
      $or: [
        { "vibration_anomaly_score": { $gt: 1.5 } },
        { "maintenance_risk_score": { $gt: 30 } },
        { "vibration_trend": "increasing" }
      ]
    }
  },
  
  // Add maintenance recommendations
  {
    $addFields: {
      maintenance_recommendation: {
        $switch: {
          branches: [
            {
              case: { $gt: ["$maintenance_risk_score", 70] },
              then: {
                priority: "immediate",
                action: "schedule_emergency_inspection",
                description: "High risk indicators detected - immediate inspection required"
              }
            },
            {
              case: { $gt: ["$maintenance_risk_score", 50] },
              then: {
                priority: "high",
                action: "schedule_maintenance_window",
                description: "Elevated risk indicators - schedule maintenance within 24 hours"
              }
            },
            {
              case: { $gt: ["$maintenance_risk_score", 30] },
              then: {
                priority: "medium",
                action: "monitor_closely",
                description: "Potential issues detected - increase monitoring frequency"
              }
            }
          ],
          default: {
            priority: "low", 
            action: "continue_monitoring",
            description: "Minor anomalies detected - continue standard monitoring"
          }
        }
      }
    }
  },
  
  // Project final predictive maintenance report
  {
    $project: {
      timestamp: 1,
      device_id: "$device_info.device_id",
      
      current_readings: {
        vibration_amplitude: "$vibration_amplitude_mm",
        temperature: "$temperature_celsius",
        pressure: "$pressure_bar"
      },
      
      moving_averages: {
        vibration_5min: { $round: ["$vibration_ma_5min", 2] },
        temperature_15min: { $round: ["$temperature_ma_15min", 1] },
        pressure_1hour: { $round: ["$pressure_ma_1hour", 2] }
      },
      
      trend_analysis: {
        vibration_trend: "$vibration_trend",
        anomaly_score: { $round: ["$vibration_anomaly_score", 2] },
        risk_score: { $round: ["$maintenance_risk_score", 0] }
      },
      
      maintenance_recommendation: 1,
      analysis_timestamp: "$$NOW"
    }
  },
  
  { $sort: { "timestamp": -1 } },
  { $limit: 100 }
])
```

## Edge Computing and Local Processing

### Edge Analytics with Local Aggregation

```javascript
// Edge device local aggregation before cloud synchronization
class IoTEdgeProcessor {
  constructor(deviceConfig) {
    this.deviceId = deviceConfig.deviceId;
    this.location = deviceConfig.location;
    this.aggregationWindow = deviceConfig.aggregationWindow || 60; // seconds
    this.localBuffer = [];
    this.thresholds = deviceConfig.thresholds || {};
  }
  
  // Process incoming sensor reading at edge
  async processSensorReading(reading) {
    const enhancedReading = {
      ...reading,
      timestamp: new Date(),
      device_info: {
        device_id: this.deviceId,
        location: this.location,
        edge_processed: true
      }
    };
    
    // Add to local buffer
    this.localBuffer.push(enhancedReading);
    
    // Check for immediate alerts
    await this.checkAlertConditions(enhancedReading);
    
    // Perform local aggregation if buffer is full
    if (this.shouldAggregate()) {
      await this.performLocalAggregation();
    }
    
    return enhancedReading;
  }
  
  shouldAggregate() {
    if (this.localBuffer.length === 0) return false;
    
    const oldestReading = this.localBuffer[0];
    const currentTime = new Date();
    const timeDiff = (currentTime - oldestReading.timestamp) / 1000;
    
    return timeDiff >= this.aggregationWindow || this.localBuffer.length >= 100;
  }
  
  async performLocalAggregation() {
    if (this.localBuffer.length === 0) return;
    
    const aggregationPeriod = {
      start: this.localBuffer[0].timestamp,
      end: this.localBuffer[this.localBuffer.length - 1].timestamp
    };
    
    // Calculate edge aggregations
    const aggregatedData = {
      timestamp: aggregationPeriod.start,
      device_info: {
        device_id: this.deviceId,
        location: this.location,
        aggregation_type: "edge_local",
        reading_count: this.localBuffer.length
      },
      
      // Temperature aggregations
      temperature_metrics: this.calculateFieldMetrics(this.localBuffer, 'temperature_celsius'),
      
      // Pressure aggregations  
      pressure_metrics: this.calculateFieldMetrics(this.localBuffer, 'pressure_bar'),
      
      // Humidity aggregations
      humidity_metrics: this.calculateFieldMetrics(this.localBuffer, 'humidity_percent'),
      
      // Battery and signal quality
      battery_level: this.calculateFieldMetrics(this.localBuffer, 'battery_level'),
      signal_strength: this.calculateFieldMetrics(this.localBuffer, 'signal_strength_dbm'),
      
      // Data quality indicators
      data_quality: {
        total_readings: this.localBuffer.length,
        time_span_seconds: (aggregationPeriod.end - aggregationPeriod.start) / 1000,
        missing_data_count: this.countMissingData(),
        completeness_percent: this.calculateDataCompleteness()
      },
      
      // Edge-specific metadata
      edge_metadata: {
        aggregated_at: new Date(),
        local_alerts_triggered: this.localAlertsCount,
        network_quality: this.getNetworkQuality(),
        processing_latency_ms: Date.now() - aggregationPeriod.end.getTime()
      }
    };
    
    // Send to cloud database
    await this.sendToCloud(aggregatedData);
    
    // Keep recent raw data, clear older entries
    this.localBuffer = this.localBuffer.slice(-10); // Keep last 10 readings
    this.localAlertsCount = 0;
  }
  
  calculateFieldMetrics(buffer, fieldName) {
    const values = buffer
      .map(reading => reading[fieldName])
      .filter(value => value !== null && value !== undefined);
    
    if (values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      average: values.reduce((sum, val) => sum + val, 0) / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      median: sorted[Math.floor(sorted.length / 2)],
      standard_deviation: this.calculateStandardDeviation(values),
      reading_count: values.length,
      trend: this.calculateTrend(values)
    };
  }
  
  calculateStandardDeviation(values) {
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }
  
  calculateTrend(values) {
    if (values.length < 3) return "insufficient_data";
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    const threshold = Math.abs(firstAvg) * 0.05; // 5% threshold
    
    if (Math.abs(difference) < threshold) return "stable";
    return difference > 0 ? "increasing" : "decreasing";
  }
  
  async checkAlertConditions(reading) {
    const alerts = [];
    
    // Temperature alerts
    if (reading.temperature_celsius !== undefined) {
      if (reading.temperature_celsius > this.thresholds.temperature_critical || 40) {
        alerts.push({
          type: "temperature_critical",
          value: reading.temperature_celsius,
          threshold: this.thresholds.temperature_critical,
          severity: "critical"
        });
      } else if (reading.temperature_celsius > this.thresholds.temperature_warning || 35) {
        alerts.push({
          type: "temperature_warning", 
          value: reading.temperature_celsius,
          threshold: this.thresholds.temperature_warning,
          severity: "warning"
        });
      }
    }
    
    // Battery alerts
    if (reading.battery_level !== undefined && reading.battery_level < 15) {
      alerts.push({
        type: "battery_low",
        value: reading.battery_level,
        threshold: 15,
        severity: "warning"
      });
    }
    
    // Process alerts locally
    for (const alert of alerts) {
      await this.processEdgeAlert(alert, reading);
      this.localAlertsCount = (this.localAlertsCount || 0) + 1;
    }
  }
  
  async processEdgeAlert(alert, reading) {
    const alertData = {
      alert_id: `edge_${this.deviceId}_${Date.now()}`,
      device_id: this.deviceId,
      location: this.location,
      alert_type: alert.type,
      severity: alert.severity,
      triggered_value: alert.value,
      threshold_value: alert.threshold,
      reading_timestamp: reading.timestamp,
      processed_at_edge: new Date(),
      raw_reading: reading
    };
    
    // Store alert locally for immediate action
    await this.storeLocalAlert(alertData);
    
    // If critical, try immediate cloud notification
    if (alert.severity === "critical") {
      await this.sendCriticalAlertToCloud(alertData);
    }
  }
  
  async sendToCloud(aggregatedData) {
    try {
      await db.iot_edge_aggregations.insertOne(aggregatedData);
    } catch (error) {
      console.error('Failed to send aggregated data to cloud:', error);
      // Store locally for later retry
      await this.queueForRetry(aggregatedData);
    }
  }
  
  getNetworkQuality() {
    // Simulate network quality assessment
    return {
      signal_strength: Math.floor(Math.random() * 100),
      latency_ms: Math.floor(Math.random() * 200) + 50,
      bandwidth_mbps: Math.floor(Math.random() * 100) + 10
    };
  }
}
```

## SQL Integration with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB time-series operations:

```sql
-- QueryLeaf SQL syntax for MongoDB time-series analytics

-- Basic time-series data selection with SQL syntax
SELECT 
    timestamp,
    device_info.device_id,
    device_info.location,
    temperature_celsius,
    pressure_bar,
    humidity_percent,
    battery_level
FROM iot_sensor_readings
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND device_info.location LIKE 'production_line_%'
  AND temperature_celsius IS NOT NULL
ORDER BY timestamp DESC
LIMIT 1000;

-- Time-based aggregation with SQL window functions
SELECT 
    device_info.device_id,
    device_info.location,
    DATE_TRUNC('hour', timestamp) AS hour,
    
    -- Temperature analytics
    AVG(temperature_celsius) AS avg_temperature,
    MIN(temperature_celsius) AS min_temperature,  
    MAX(temperature_celsius) AS max_temperature,
    STDDEV(temperature_celsius) AS temp_std_deviation,
    
    -- Pressure analytics
    AVG(pressure_bar) AS avg_pressure,
    MIN(pressure_bar) AS min_pressure,
    MAX(pressure_bar) AS max_pressure,
    
    -- Data quality metrics
    COUNT(*) AS total_readings,
    COUNT(temperature_celsius) AS temp_reading_count,
    COUNT(pressure_bar) AS pressure_reading_count,
    (COUNT(temperature_celsius) * 100.0 / COUNT(*)) AS temp_data_completeness_pct
    
FROM iot_sensor_readings
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
  AND device_info.device_type IN ('environmental', 'pressure')
GROUP BY device_info.device_id, device_info.location, DATE_TRUNC('hour', timestamp)
HAVING COUNT(*) >= 10  -- Ensure sufficient data points
ORDER BY device_info.location, device_info.device_id, hour;

-- Moving averages using SQL window functions
SELECT 
    timestamp,
    device_info.device_id,
    temperature_celsius,
    pressure_bar,
    
    -- Moving averages with time-based windows
    AVG(temperature_celsius) OVER (
        PARTITION BY device_info.device_id 
        ORDER BY timestamp 
        RANGE BETWEEN INTERVAL '5 minutes' PRECEDING AND CURRENT ROW
    ) AS temperature_ma_5min,
    
    AVG(pressure_bar) OVER (
        PARTITION BY device_info.device_id
        ORDER BY timestamp
        RANGE BETWEEN INTERVAL '15 minutes' PRECEDING AND CURRENT ROW  
    ) AS pressure_ma_15min,
    
    -- Standard deviation for anomaly detection
    STDDEV(temperature_celsius) OVER (
        PARTITION BY device_info.device_id
        ORDER BY timestamp
        RANGE BETWEEN INTERVAL '10 minutes' PRECEDING AND CURRENT ROW
    ) AS temperature_rolling_std,
    
    -- Previous values for trend calculation
    LAG(temperature_celsius, 1) OVER (
        PARTITION BY device_info.device_id 
        ORDER BY timestamp
    ) AS prev_temperature,
    
    -- Z-score calculation for anomaly detection
    (temperature_celsius - AVG(temperature_celsius) OVER (
        PARTITION BY device_info.device_id
        ORDER BY timestamp  
        RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
    )) / NULLIF(STDDEV(temperature_celsius) OVER (
        PARTITION BY device_info.device_id
        ORDER BY timestamp
        RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW  
    ), 0) AS temperature_z_score

FROM iot_sensor_readings
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 day'
  AND device_info.device_id = 'TEMP_SENSOR_001'
ORDER BY timestamp;

-- Anomaly detection with SQL pattern matching
WITH sensor_analytics AS (
    SELECT 
        timestamp,
        device_info.device_id,
        device_info.location,
        temperature_celsius,
        pressure_bar,
        
        -- Calculate moving statistics
        AVG(temperature_celsius) OVER w AS temp_avg,
        STDDEV(temperature_celsius) OVER w AS temp_std,
        AVG(pressure_bar) OVER w AS pressure_avg, 
        STDDEV(pressure_bar) OVER w AS pressure_std
        
    FROM iot_sensor_readings
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '2 days'
    WINDOW w AS (
        PARTITION BY device_info.device_id
        ORDER BY timestamp
        RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
    )
),

anomaly_detection AS (
    SELECT *,
        -- Temperature anomaly score (Z-score)
        ABS(temperature_celsius - temp_avg) / NULLIF(temp_std, 0) AS temp_anomaly_score,
        
        -- Pressure anomaly score  
        ABS(pressure_bar - pressure_avg) / NULLIF(pressure_std, 0) AS pressure_anomaly_score,
        
        -- Classify anomalies
        CASE 
            WHEN ABS(temperature_celsius - temp_avg) / NULLIF(temp_std, 0) > 3 THEN 'severe'
            WHEN ABS(temperature_celsius - temp_avg) / NULLIF(temp_std, 0) > 2 THEN 'moderate'  
            WHEN ABS(temperature_celsius - temp_avg) / NULLIF(temp_std, 0) > 1.5 THEN 'mild'
            ELSE 'normal'
        END AS temperature_anomaly_level,
        
        CASE
            WHEN ABS(pressure_bar - pressure_avg) / NULLIF(pressure_std, 0) > 3 THEN 'severe'
            WHEN ABS(pressure_bar - pressure_avg) / NULLIF(pressure_std, 0) > 2 THEN 'moderate'
            WHEN ABS(pressure_bar - pressure_avg) / NULLIF(pressure_std, 0) > 1.5 THEN 'mild' 
            ELSE 'normal'
        END AS pressure_anomaly_level
        
    FROM sensor_analytics
    WHERE temp_std > 0 AND pressure_std > 0
)

SELECT 
    timestamp,
    device_id,
    location,
    temperature_celsius,
    pressure_bar,
    temp_anomaly_score,
    pressure_anomaly_score,
    temperature_anomaly_level,
    pressure_anomaly_level,
    
    -- Combined risk assessment
    CASE 
        WHEN temperature_anomaly_level IN ('severe', 'moderate') 
             OR pressure_anomaly_level IN ('severe', 'moderate') THEN 'high_risk'
        WHEN temperature_anomaly_level = 'mild' 
             OR pressure_anomaly_level = 'mild' THEN 'medium_risk'
        ELSE 'low_risk'
    END AS overall_risk_level,
    
    -- Maintenance recommendation
    CASE
        WHEN temperature_anomaly_level = 'severe' OR pressure_anomaly_level = 'severe' 
            THEN 'immediate_inspection_required'
        WHEN temperature_anomaly_level = 'moderate' OR pressure_anomaly_level = 'moderate'
            THEN 'schedule_maintenance_check'
        WHEN temperature_anomaly_level = 'mild' OR pressure_anomaly_level = 'mild'
            THEN 'monitor_closely'
        ELSE 'continue_normal_monitoring'
    END AS maintenance_action

FROM anomaly_detection  
WHERE temperature_anomaly_level != 'normal' OR pressure_anomaly_level != 'normal'
ORDER BY timestamp DESC, temp_anomaly_score DESC;

-- Predictive maintenance analytics
WITH equipment_health_trends AS (
    SELECT 
        device_info.device_id,
        device_info.location,
        DATE_TRUNC('day', timestamp) AS date,
        
        -- Daily health metrics
        AVG(temperature_celsius) AS avg_daily_temp,
        MAX(temperature_celsius) AS max_daily_temp,
        STDDEV(temperature_celsius) AS daily_temp_variation,
        
        AVG(pressure_bar) AS avg_daily_pressure,
        MAX(pressure_bar) AS max_daily_pressure,
        STDDEV(pressure_bar) AS daily_pressure_variation,
        
        AVG(battery_level) AS avg_daily_battery,
        MIN(battery_level) AS min_daily_battery,
        
        COUNT(*) AS daily_reading_count,
        COUNT(CASE WHEN temperature_celsius > 35 THEN 1 END) AS high_temp_incidents,
        COUNT(CASE WHEN pressure_bar > 20 THEN 1 END) AS high_pressure_incidents
        
    FROM iot_sensor_readings
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    GROUP BY device_info.device_id, device_info.location, DATE_TRUNC('day', timestamp)
),

health_score_calculation AS (
    SELECT *,
        -- Temperature health factor (0-100)
        GREATEST(0, 100 - (max_daily_temp - 20) * 5) AS temp_health_factor,
        
        -- Pressure health factor (0-100)  
        GREATEST(0, 100 - (max_daily_pressure - 15) * 10) AS pressure_health_factor,
        
        -- Battery health factor (0-100)
        avg_daily_battery AS battery_health_factor,
        
        -- Data quality factor (0-100)
        LEAST(100, daily_reading_count / 1440.0 * 100) AS data_quality_factor, -- Assuming 1 reading per minute ideal
        
        -- Stability factor (0-100) - lower variation is better
        GREATEST(0, 100 - daily_temp_variation * 10) AS temp_stability_factor,
        GREATEST(0, 100 - daily_pressure_variation * 20) AS pressure_stability_factor
        
    FROM equipment_health_trends
),

predictive_scoring AS (
    SELECT *,
        -- Overall equipment health score
        (temp_health_factor * 0.25 + 
         pressure_health_factor * 0.25 + 
         battery_health_factor * 0.20 + 
         data_quality_factor * 0.10 +
         temp_stability_factor * 0.10 +
         pressure_stability_factor * 0.10) AS daily_health_score,
         
        -- Trend analysis using moving average
        AVG(temp_health_factor) OVER (
            PARTITION BY device_id 
            ORDER BY date 
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) AS temp_health_trend_7day,
        
        AVG(pressure_health_factor) OVER (
            PARTITION BY device_id
            ORDER BY date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW  
        ) AS pressure_health_trend_7day
        
    FROM health_score_calculation
)

SELECT 
    device_id,
    location,
    date,
    daily_health_score,
    temp_health_factor,
    pressure_health_factor,
    battery_health_factor,
    
    -- Health trend indicators
    temp_health_trend_7day,
    pressure_health_trend_7day,
    
    -- Predictive maintenance classification
    CASE 
        WHEN daily_health_score < 30 THEN 'critical_maintenance_needed'
        WHEN daily_health_score < 50 THEN 'maintenance_recommended' 
        WHEN daily_health_score < 70 THEN 'monitor_closely'
        ELSE 'healthy'
    END AS maintenance_status,
    
    -- Failure risk prediction
    CASE
        WHEN daily_health_score < 40 AND temp_health_trend_7day < temp_health_factor THEN 'high_failure_risk'
        WHEN daily_health_score < 60 AND (temp_health_trend_7day < temp_health_factor OR pressure_health_trend_7day < pressure_health_factor) THEN 'medium_failure_risk'
        ELSE 'low_failure_risk'
    END AS failure_risk_level,
    
    -- Recommended actions
    CASE
        WHEN daily_health_score < 30 THEN 'schedule_immediate_inspection'
        WHEN daily_health_score < 50 AND temp_health_trend_7day < 50 THEN 'schedule_preventive_maintenance'
        WHEN daily_health_score < 70 THEN 'increase_monitoring_frequency'
        ELSE 'continue_standard_monitoring'
    END AS recommended_action

FROM predictive_scoring
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY device_id, date DESC;

-- QueryLeaf automatically translates these SQL operations to optimized MongoDB time-series aggregations:
-- 1. DATE_TRUNC functions become MongoDB date aggregation operators
-- 2. Window functions translate to MongoDB $setWindowFields operations  
-- 3. Statistical functions map to MongoDB aggregation operators
-- 4. Complex CASE statements become MongoDB $switch expressions
-- 5. Time-based WHERE clauses leverage time-series index optimizations
-- 6. Multi-table operations use MongoDB $lookup for cross-collection analytics
```

## Best Practices for Production IoT Systems

### Performance Optimization for High-Volume IoT Data

1. **Collection Design**: Use appropriate time-series collection settings for your data granularity and retention requirements
2. **Index Strategy**: Create compound indexes on metaField + timeField for optimal query performance  
3. **Bucketing Configuration**: Set granularity and bucket parameters based on your query patterns
4. **TTL Management**: Implement data lifecycle policies with expireAfterSeconds for automatic data expiration
5. **Batch Processing**: Use bulk insertions and optimize write operations for high-throughput scenarios

### Data Quality and Monitoring

1. **Validation**: Implement schema validation for IoT data structure consistency
2. **Anomaly Detection**: Build real-time anomaly detection using statistical analysis and machine learning
3. **Data Completeness**: Monitor and alert on missing data or device connectivity issues
4. **Performance Metrics**: Track insertion rates, query performance, and storage utilization
5. **Alert Systems**: Implement multi-level alerting for device health, data quality, and system performance

## Conclusion

MongoDB time-series collections provide specialized capabilities for IoT data processing that combine high-performance storage optimization with flexible analytics capabilities. The integration with QueryLeaf enables familiar SQL-style analytics while leveraging MongoDB's optimized time-series storage and indexing strategies.

Key advantages of MongoDB time-series collections for IoT include:

- **Storage Efficiency**: Automatic compression and optimized storage layout for time-ordered data
- **Query Performance**: Specialized indexing and query optimization for temporal data patterns  
- **Real-Time Analytics**: Built-in support for streaming analytics and real-time aggregations
- **Edge Integration**: Seamless synchronization between edge devices and cloud databases
- **SQL Accessibility**: Familiar time-series analytics through QueryLeaf's SQL interface
- **Scalable Architecture**: Horizontal scaling capabilities for massive IoT data volumes

Whether you're building smart manufacturing systems, environmental monitoring networks, or industrial IoT platforms, MongoDB's time-series collections with SQL-familiar query patterns provide the foundation for building scalable, high-performance IoT analytics solutions.

> **QueryLeaf Integration**: QueryLeaf seamlessly translates SQL time-series operations into optimized MongoDB time-series queries. Advanced analytics like window functions, moving averages, and anomaly detection are accessible through familiar SQL syntax while leveraging MongoDB's specialized time-series storage optimizations, making sophisticated IoT analytics approachable for SQL-oriented development teams.

The combination of MongoDB's time-series optimizations with SQL-familiar analytics patterns creates an ideal platform for IoT applications that require both high-performance data ingestion and sophisticated analytical capabilities at scale.