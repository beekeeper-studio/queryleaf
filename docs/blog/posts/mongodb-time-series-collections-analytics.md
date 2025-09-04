---
title: "MongoDB Time Series Collections: High-Performance Analytics with SQL-Style Time Data Operations"
description: "Master MongoDB time series collections for IoT, metrics, and sensor data. Learn high-performance time-based queries, aggregations, and analytics using familiar SQL patterns for real-time applications."
date: 2025-09-03
tags: [mongodb, time-series, iot, analytics, performance, metrics, sql]
---

# MongoDB Time Series Collections: High-Performance Analytics with SQL-Style Time Data Operations

Modern applications generate massive amounts of time-stamped data from IoT sensors, application metrics, financial trades, user activity logs, and monitoring systems. Whether you're tracking server performance metrics, analyzing user behavior patterns, or processing real-time sensor data from industrial equipment, traditional database approaches often struggle with the volume, velocity, and specific query patterns required for time-series workloads.

Time-series data presents unique challenges: high write throughput, time-based queries, efficient storage compression, and analytics operations that span large time ranges. MongoDB's time series collections provide specialized optimizations for these workloads while maintaining the flexibility and query capabilities that make MongoDB powerful for application development.

## The Time Series Data Challenge

Traditional approaches to storing time-series data have significant limitations:

```sql
-- SQL time series storage challenges

-- Basic table structure for metrics
CREATE TABLE server_metrics (
  id SERIAL PRIMARY KEY,
  server_id VARCHAR(50),
  metric_name VARCHAR(100),
  value DECIMAL(10,4),
  timestamp TIMESTAMP,
  tags JSONB
);

-- High insert volume creates index maintenance overhead
INSERT INTO server_metrics (server_id, metric_name, value, timestamp, tags)
VALUES 
  ('web-01', 'cpu_usage', 85.2, '2025-09-03 10:15:00', '{"datacenter": "us-east", "env": "prod"}'),
  ('web-01', 'memory_usage', 72.1, '2025-09-03 10:15:00', '{"datacenter": "us-east", "env": "prod"}'),
  ('web-01', 'disk_io', 150.8, '2025-09-03 10:15:00', '{"datacenter": "us-east", "env": "prod"}');
-- Problems: Index bloat, storage inefficiency, slow inserts

-- Time-range queries require expensive scans
SELECT 
  server_id,
  metric_name,
  AVG(value) as avg_value,
  MAX(value) as max_value
FROM server_metrics
WHERE timestamp BETWEEN '2025-09-03 00:00:00' AND '2025-09-03 23:59:59'
  AND metric_name = 'cpu_usage'
GROUP BY server_id, metric_name;
-- Problems: Full table scans, no time-series optimization

-- Storage grows rapidly without compression
SELECT 
  pg_size_pretty(pg_total_relation_size('server_metrics')) AS table_size,
  COUNT(*) as row_count,
  MAX(timestamp) - MIN(timestamp) as time_span
FROM server_metrics;
-- Problems: No time-based compression, storage overhead
```

MongoDB time series collections address these challenges:

```javascript
// MongoDB time series collections optimizations
db.createCollection('server_metrics', {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'metadata',
    granularity: 'minutes',
    bucketMaxSpanSeconds: 3600,
    bucketRoundingSeconds: 60
  }
});

// Optimized insertions for high-throughput scenarios
db.server_metrics.insertMany([
  {
    timestamp: ISODate("2025-09-03T10:15:00Z"),
    cpu_usage: 85.2,
    memory_usage: 72.1,
    disk_io: 150.8,
    metadata: {
      server_id: "web-01",
      datacenter: "us-east",
      environment: "prod",
      instance_type: "c5.large"
    }
  },
  {
    timestamp: ISODate("2025-09-03T10:16:00Z"),
    cpu_usage: 87.5,
    memory_usage: 74.3,
    disk_io: 165.2,
    metadata: {
      server_id: "web-01", 
      datacenter: "us-east",
      environment: "prod",
      instance_type: "c5.large"
    }
  }
]);

// Benefits:
// - Automatic bucketing reduces storage overhead by 70%+
// - Time-based indexes optimized for range queries
// - Compression algorithms designed for time-series patterns
// - Query performance optimized for time-range operations
```

## Creating Time Series Collections

### Basic Time Series Setup

Configure time series collections for optimal performance:

```javascript
// Time series collection configuration
class TimeSeriesManager {
  constructor(db) {
    this.db = db;
  }

  async createMetricsCollection(options = {}) {
    // Server metrics time series collection
    return await this.db.createCollection('server_metrics', {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'metadata',
        granularity: options.granularity || 'minutes',
        
        // Bucket configuration for optimization
        bucketMaxSpanSeconds: options.maxSpan || 3600,     // 1 hour buckets
        bucketRoundingSeconds: options.rounding || 60       // Round to nearest minute
      },
      
      // Additional optimizations
      clusteredIndex: {
        key: { _id: 1 },
        unique: true
      }
    });
  }

  async createIoTSensorCollection() {
    // IoT sensor data with high-frequency measurements
    return await this.db.createCollection('sensor_readings', {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'sensor_info',
        granularity: 'seconds',    // High-frequency data
        
        // Shorter buckets for high-frequency data
        bucketMaxSpanSeconds: 300,  // 5 minute buckets
        bucketRoundingSeconds: 10   // Round to nearest 10 seconds
      }
    });
  }

  async createFinancialDataCollection() {
    // Financial market data (trades, prices)
    return await this.db.createCollection('market_data', {
      timeseries: {
        timeField: 'trade_time',
        metaField: 'instrument',
        granularity: 'seconds',
        
        // Financial data specific optimizations
        bucketMaxSpanSeconds: 60,   // 1 minute buckets for market data
        bucketRoundingSeconds: 1    // Precise timing important
      },
      
      // Expire old data automatically (regulatory requirements)
      expireAfterSeconds: 7 * 365 * 24 * 60 * 60  // 7 years retention
    });
  }

  async createUserActivityCollection() {
    // User activity tracking (clicks, views, sessions)
    return await this.db.createCollection('user_activity', {
      timeseries: {
        timeField: 'event_time',
        metaField: 'user_context',
        granularity: 'minutes',
        
        bucketMaxSpanSeconds: 3600,  // 1 hour buckets
        bucketRoundingSeconds: 60    // Minute precision
      },
      
      // Data lifecycle management
      expireAfterSeconds: 90 * 24 * 60 * 60  // 90 days retention
    });
  }
}
```

SQL-style time series table creation concepts:

```sql
-- SQL time series table equivalent patterns
-- Specialized table for time-series data
CREATE TABLE server_metrics (
  timestamp TIMESTAMPTZ NOT NULL,
  server_id VARCHAR(50) NOT NULL,
  datacenter VARCHAR(20),
  environment VARCHAR(10),
  cpu_usage DECIMAL(5,2),
  memory_usage DECIMAL(5,2),
  disk_io DECIMAL(8,2),
  network_bytes_in BIGINT,
  network_bytes_out BIGINT,
  
  -- Time-series optimizations
  CONSTRAINT pk_server_metrics PRIMARY KEY (server_id, timestamp),
  CONSTRAINT check_timestamp_range 
    CHECK (timestamp >= '2024-01-01' AND timestamp < '2030-01-01')
);

-- Time-series specific indexes
CREATE INDEX idx_server_metrics_time_range 
ON server_metrics USING BRIN (timestamp);

-- Partitioning by time for performance
CREATE TABLE server_metrics_2025_09 
PARTITION OF server_metrics
FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

-- Automatic data lifecycle with partitions
CREATE TABLE server_metrics_template (
  LIKE server_metrics INCLUDING ALL
) WITH (
  fillfactor = 100,  -- Optimize for append-only data
  parallel_workers = 8
);

-- Compression for historical data
ALTER TABLE server_metrics_2025_08 SET (
  toast_compression = 'lz4',
  parallel_workers = 4
);
```

## High-Performance Time Series Queries

### Time-Range Analytics

Implement efficient time-based analytics operations:

```javascript
// Time series analytics implementation
class TimeSeriesAnalytics {
  constructor(db) {
    this.db = db;
    this.metricsCollection = db.collection('server_metrics');
  }

  async getMetricSummary(serverId, metricName, startTime, endTime) {
    // Basic time series aggregation with performance optimization
    const pipeline = [
      {
        $match: {
          'metadata.server_id': serverId,
          timestamp: {
            $gte: startTime,
            $lte: endTime
          }
        }
      },
      {
        $group: {
          _id: null,
          avg_value: { $avg: `$${metricName}` },
          min_value: { $min: `$${metricName}` },
          max_value: { $max: `$${metricName}` },
          sample_count: { $sum: 1 },
          first_timestamp: { $min: "$timestamp" },
          last_timestamp: { $max: "$timestamp" }
        }
      },
      {
        $project: {
          _id: 0,
          server_id: serverId,
          metric_name: metricName,
          statistics: {
            average: { $round: ["$avg_value", 2] },
            minimum: "$min_value",
            maximum: "$max_value",
            sample_count: "$sample_count"
          },
          time_range: {
            start: "$first_timestamp",
            end: "$last_timestamp",
            duration_minutes: {
              $divide: [
                { $subtract: ["$last_timestamp", "$first_timestamp"] },
                60000
              ]
            }
          }
        }
      }
    ];

    const results = await this.metricsCollection.aggregate(pipeline).toArray();
    return results[0];
  }

  async getTimeSeriesData(serverId, metricName, startTime, endTime, intervalMinutes = 5) {
    // Time bucketed aggregation for charts and visualization
    const intervalMs = intervalMinutes * 60 * 1000;
    
    const pipeline = [
      {
        $match: {
          'metadata.server_id': serverId,
          timestamp: {
            $gte: startTime,
            $lte: endTime
          }
        }
      },
      {
        $group: {
          _id: {
            // Create time buckets
            time_bucket: {
              $dateFromParts: {
                year: { $year: "$timestamp" },
                month: { $month: "$timestamp" },
                day: { $dayOfMonth: "$timestamp" },
                hour: { $hour: "$timestamp" },
                minute: {
                  $multiply: [
                    { $floor: { $divide: [{ $minute: "$timestamp" }, intervalMinutes] } },
                    intervalMinutes
                  ]
                }
              }
            }
          },
          avg_value: { $avg: `$${metricName}` },
          min_value: { $min: `$${metricName}` },
          max_value: { $max: `$${metricName}` },
          sample_count: { $sum: 1 },
          // Calculate percentiles
          values: { $push: `$${metricName}` }
        }
      },
      {
        $addFields: {
          // Calculate approximate percentiles
          p95_value: {
            $arrayElemAt: [
              "$values",
              { $floor: { $multiply: [{ $size: "$values" }, 0.95] } }
            ]
          }
        }
      },
      {
        $sort: { "_id.time_bucket": 1 }
      },
      {
        $project: {
          timestamp: "$_id.time_bucket",
          metrics: {
            average: { $round: ["$avg_value", 2] },
            minimum: "$min_value",
            maximum: "$max_value",
            p95: "$p95_value",
            sample_count: "$sample_count"
          },
          _id: 0
        }
      }
    ];

    return await this.metricsCollection.aggregate(pipeline).toArray();
  }

  async detectAnomalies(serverId, metricName, windowHours = 24) {
    // Statistical anomaly detection using moving averages
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          'metadata.server_id': serverId,
          timestamp: { $gte: windowStart }
        }
      },
      {
        $sort: { timestamp: 1 }
      },
      {
        $setWindowFields: {
          partitionBy: null,
          sortBy: { timestamp: 1 },
          output: {
            // Moving average over last 10 points
            moving_avg: {
              $avg: `$${metricName}`,
              window: {
                documents: [-9, 0]  // Current + 9 previous points
              }
            },
            // Standard deviation
            moving_std: {
              $stdDevSamp: `$${metricName}`,
              window: {
                documents: [-19, 0]  // Current + 19 previous points
              }
            }
          }
        }
      },
      {
        $addFields: {
          // Detect anomalies using 2-sigma rule
          deviation: {
            $abs: { $subtract: [`$${metricName}`, "$moving_avg"] }
          },
          threshold: { $multiply: ["$moving_std", 2] }
        }
      },
      {
        $addFields: {
          is_anomaly: { $gt: ["$deviation", "$threshold"] },
          anomaly_severity: {
            $cond: {
              if: { $gt: ["$deviation", { $multiply: ["$moving_std", 3] }] },
              then: "high",
              else: {
                $cond: {
                  if: { $gt: ["$deviation", { $multiply: ["$moving_std", 2] }] },
                  then: "medium",
                  else: "low"
                }
              }
            }
          }
        }
      },
      {
        $match: {
          is_anomaly: true
        }
      },
      {
        $project: {
          timestamp: 1,
          value: `$${metricName}`,
          expected_value: { $round: ["$moving_avg", 2] },
          deviation: { $round: ["$deviation", 2] },
          severity: "$anomaly_severity",
          metadata: 1
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $limit: 50
      }
    ];

    return await this.metricsCollection.aggregate(pipeline).toArray();
  }

  async calculateMetricCorrelations(serverIds, metrics, timeWindow) {
    // Analyze correlations between different metrics
    const pipeline = [
      {
        $match: {
          'metadata.server_id': { $in: serverIds },
          timestamp: {
            $gte: new Date(Date.now() - timeWindow)
          }
        }
      },
      {
        // Group by minute for correlation analysis
        $group: {
          _id: {
            server: "$metadata.server_id",
            minute: {
              $dateFromParts: {
                year: { $year: "$timestamp" },
                month: { $month: "$timestamp" },
                day: { $dayOfMonth: "$timestamp" },
                hour: { $hour: "$timestamp" },
                minute: { $minute: "$timestamp" }
              }
            }
          },
          // Average metrics within each minute bucket
          cpu_avg: { $avg: "$cpu_usage" },
          memory_avg: { $avg: "$memory_usage" },
          disk_io_avg: { $avg: "$disk_io" },
          network_in_avg: { $avg: "$network_bytes_in" },
          network_out_avg: { $avg: "$network_bytes_out" }
        }
      },
      {
        $group: {
          _id: "$_id.server",
          data_points: {
            $push: {
              timestamp: "$_id.minute",
              cpu: "$cpu_avg",
              memory: "$memory_avg",
              disk_io: "$disk_io_avg",
              network_in: "$network_in_avg",
              network_out: "$network_out_avg"
            }
          }
        }
      },
      {
        $addFields: {
          // Calculate correlation between CPU and memory
          cpu_memory_correlation: {
            $function: {
              body: function(dataPoints) {
                const n = dataPoints.length;
                if (n < 2) return 0;
                
                const cpuValues = dataPoints.map(d => d.cpu);
                const memValues = dataPoints.map(d => d.memory);
                
                const cpuMean = cpuValues.reduce((a, b) => a + b, 0) / n;
                const memMean = memValues.reduce((a, b) => a + b, 0) / n;
                
                let numerator = 0, cpuSumSq = 0, memSumSq = 0;
                
                for (let i = 0; i < n; i++) {
                  const cpuDiff = cpuValues[i] - cpuMean;
                  const memDiff = memValues[i] - memMean;
                  
                  numerator += cpuDiff * memDiff;
                  cpuSumSq += cpuDiff * cpuDiff;
                  memSumSq += memDiff * memDiff;
                }
                
                const denominator = Math.sqrt(cpuSumSq * memSumSq);
                return denominator === 0 ? 0 : numerator / denominator;
              },
              args: ["$data_points"],
              lang: "js"
            }
          }
        }
      },
      {
        $project: {
          server_id: "$_id",
          correlation_analysis: {
            cpu_memory: { $round: ["$cpu_memory_correlation", 3] },
            data_points: { $size: "$data_points" },
            analysis_period: timeWindow
          },
          _id: 0
        }
      }
    ];

    return await this.metricsCollection.aggregate(pipeline).toArray();
  }

  async getTrendAnalysis(serverId, metricName, days = 7) {
    // Trend analysis with growth rates and predictions
    const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          'metadata.server_id': serverId,
          timestamp: { $gte: daysAgo }
        }
      },
      {
        $group: {
          _id: {
            // Group by hour for trend analysis
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            hour: { $hour: "$timestamp" }
          },
          avg_value: { $avg: `$${metricName}` },
          min_value: { $min: `$${metricName}` },
          max_value: { $max: `$${metricName}` },
          sample_count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.date": 1, "_id.hour": 1 }
      },
      {
        $setWindowFields: {
          sortBy: { "_id.date": 1, "_id.hour": 1 },
          output: {
            // Calculate rate of change
            previous_value: {
              $shift: {
                output: "$avg_value",
                by: -1
              }
            },
            // 24-hour moving average
            daily_trend: {
              $avg: "$avg_value",
              window: {
                documents: [-23, 0]  // 24 hours
              }
            }
          }
        }
      },
      {
        $addFields: {
          hourly_change: {
            $cond: {
              if: { $ne: ["$previous_value", null] },
              then: { $subtract: ["$avg_value", "$previous_value"] },
              else: 0
            }
          },
          change_percentage: {
            $cond: {
              if: { $and: [
                { $ne: ["$previous_value", null] },
                { $ne: ["$previous_value", 0] }
              ]},
              then: {
                $multiply: [
                  { $divide: [
                    { $subtract: ["$avg_value", "$previous_value"] },
                    "$previous_value"
                  ]},
                  100
                ]
              },
              else: 0
            }
          }
        }
      },
      {
        $match: {
          previous_value: { $ne: null }  // Exclude first data point
        }
      },
      {
        $project: {
          date: "$_id.date",
          hour: "$_id.hour",
          metric_value: { $round: ["$avg_value", 2] },
          trend_value: { $round: ["$daily_trend", 2] },
          hourly_change: { $round: ["$hourly_change", 2] },
          change_percentage: { $round: ["$change_percentage", 1] },
          volatility: {
            $abs: { $subtract: ["$avg_value", "$daily_trend"] }
          },
          _id: 0
        }
      }
    ];

    return await this.metricsCollection.aggregate(pipeline).toArray();
  }

  async getCapacityForecast(serverId, metricName, forecastDays = 30) {
    // Simple linear regression for capacity planning
    const historyDays = forecastDays * 2;  // Use 2x history for prediction
    const historyStart = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          'metadata.server_id': serverId,
          timestamp: { $gte: historyStart }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
          },
          daily_avg: { $avg: `$${metricName}` },
          daily_max: { $max: `$${metricName}` },
          sample_count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.date": 1 }
      },
      {
        $group: {
          _id: null,
          daily_data: {
            $push: {
              date: "$_id.date",
              avg_value: "$daily_avg",
              max_value: "$daily_max"
            }
          }
        }
      },
      {
        $addFields: {
          // Linear regression calculation
          regression: {
            $function: {
              body: function(dailyData) {
                const n = dailyData.length;
                if (n < 7) return null;  // Need minimum data points
                
                // Convert dates to day numbers for regression
                const baseDate = new Date(dailyData[0].date).getTime();
                const points = dailyData.map((d, i) => ({
                  x: i,  // Day number
                  y: d.avg_value
                }));
                
                // Calculate linear regression
                const sumX = points.reduce((sum, p) => sum + p.x, 0);
                const sumY = points.reduce((sum, p) => sum + p.y, 0);
                const sumXY = points.reduce((sum, p) => sum + (p.x * p.y), 0);
                const sumXX = points.reduce((sum, p) => sum + (p.x * p.x), 0);
                
                const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                const intercept = (sumY - slope * sumX) / n;
                
                // Calculate R-squared
                const meanY = sumY / n;
                const totalSS = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);
                const residualSS = points.reduce((sum, p) => {
                  const predicted = slope * p.x + intercept;
                  return sum + Math.pow(p.y - predicted, 2);
                }, 0);
                const rSquared = 1 - (residualSS / totalSS);
                
                return {
                  slope: slope,
                  intercept: intercept,
                  correlation: Math.sqrt(Math.max(0, rSquared)),
                  confidence: rSquared > 0.7 ? 'high' : rSquared > 0.4 ? 'medium' : 'low'
                };
              },
              args: ["$daily_data"],
              lang: "js"
            }
          }
        }
      },
      {
        $project: {
          current_trend: "$regression",
          forecast_days: forecastDays,
          historical_data: { $slice: ["$daily_data", -7] },  // Last 7 days
          _id: 0
        }
      }
    ];

    const results = await this.metricsCollection.aggregate(pipeline).toArray();
    
    if (results.length > 0 && results[0].current_trend) {
      const trend = results[0].current_trend;
      const forecastData = [];
      
      // Generate forecast points
      for (let day = 1; day <= forecastDays; day++) {
        const futureDate = new Date(Date.now() + day * 24 * 60 * 60 * 1000);
        const xValue = historyDays + day;
        const predictedValue = trend.slope * xValue + trend.intercept;
        
        forecastData.push({
          date: futureDate.toISOString().split('T')[0],
          predicted_value: Math.round(predictedValue * 100) / 100,
          confidence: trend.confidence
        });
      }
      
      results[0].forecast = forecastData;
    }

    return results[0];
  }

  async getMultiServerComparison(serverIds, metricName, hours = 24) {
    // Compare metrics across multiple servers
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          'metadata.server_id': { $in: serverIds },
          timestamp: { $gte: startTime }
        }
      },
      {
        $group: {
          _id: {
            server: "$metadata.server_id",
            // Hourly buckets for comparison
            hour: {
              $dateFromParts: {
                year: { $year: "$timestamp" },
                month: { $month: "$timestamp" },
                day: { $dayOfMonth: "$timestamp" },
                hour: { $hour: "$timestamp" }
              }
            }
          },
          avg_value: { $avg: `$${metricName}` },
          max_value: { $max: `$${metricName}` },
          sample_count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.hour",
          server_data: {
            $push: {
              server_id: "$_id.server",
              avg_value: "$avg_value",
              max_value: "$max_value",
              sample_count: "$sample_count"
            }
          }
        }
      },
      {
        $addFields: {
          // Calculate statistics across all servers for each hour
          hourly_stats: {
            avg_across_servers: { $avg: "$server_data.avg_value" },
            max_across_servers: { $max: "$server_data.max_value" },
            min_across_servers: { $min: "$server_data.avg_value" },
            server_count: { $size: "$server_data" }
          }
        }
      },
      {
        $sort: { "_id": 1 }
      },
      {
        $project: {
          timestamp: "$_id",
          servers: "$server_data",
          cluster_stats: "$hourly_stats",
          _id: 0
        }
      }
    ];

    return await this.metricsCollection.aggregate(pipeline).toArray();
  }
}
```

## IoT and Sensor Data Management

### Real-Time Sensor Processing

Handle high-frequency IoT sensor data efficiently:

```javascript
// IoT sensor data management for time series
class IoTTimeSeriesManager {
  constructor(db) {
    this.db = db;
    this.sensorCollection = db.collection('sensor_readings');
  }

  async setupSensorIndexes() {
    // Optimized indexes for sensor queries
    await this.sensorCollection.createIndexes([
      // Time range queries
      { 'timestamp': 1, 'sensor_info.device_id': 1 },
      
      // Sensor type and location queries
      { 'sensor_info.sensor_type': 1, 'timestamp': -1 },
      { 'sensor_info.location': '2dsphere', 'timestamp': -1 },
      
      // Multi-sensor aggregation queries
      { 'sensor_info.facility_id': 1, 'sensor_info.sensor_type': 1, 'timestamp': -1 }
    ]);
  }

  async processSensorBatch(sensorReadings) {
    // High-performance batch insertion for IoT data
    const documents = sensorReadings.map(reading => ({
      timestamp: new Date(reading.timestamp),
      temperature: reading.temperature,
      humidity: reading.humidity,
      pressure: reading.pressure,
      vibration: reading.vibration,
      sensor_info: {
        device_id: reading.deviceId,
        sensor_type: reading.sensorType,
        location: {
          type: "Point",
          coordinates: [reading.longitude, reading.latitude]
        },
        facility_id: reading.facilityId,
        installation_date: reading.installationDate,
        firmware_version: reading.firmwareVersion
      }
    }));

    try {
      const result = await this.sensorCollection.insertMany(documents, {
        ordered: false,  // Allow partial success for high throughput
        bypassDocumentValidation: false
      });

      return {
        success: true,
        insertedCount: result.insertedCount,
        insertedIds: result.insertedIds
      };
    } catch (error) {
      // Handle partial failures gracefully
      return {
        success: false,
        error: error.message,
        partialResults: error.writeErrors || []
      };
    }
  }

  async getSensorTelemetry(facilityId, sensorType, timeRange) {
    // Real-time sensor monitoring dashboard
    const pipeline = [
      {
        $match: {
          'sensor_info.facility_id': facilityId,
          'sensor_info.sensor_type': sensorType,
          timestamp: {
            $gte: timeRange.start,
            $lte: timeRange.end
          }
        }
      },
      {
        $group: {
          _id: {
            device_id: "$sensor_info.device_id",
            // 15-minute intervals for real-time monitoring
            interval: {
              $dateFromParts: {
                year: { $year: "$timestamp" },
                month: { $month: "$timestamp" },
                day: { $dayOfMonth: "$timestamp" },
                hour: { $hour: "$timestamp" },
                minute: {
                  $multiply: [
                    { $floor: { $divide: [{ $minute: "$timestamp" }, 15] } },
                    15
                  ]
                }
              }
            }
          },
          // Aggregate sensor readings
          avg_temperature: { $avg: "$temperature" },
          avg_humidity: { $avg: "$humidity" },
          avg_pressure: { $avg: "$pressure" },
          max_vibration: { $max: "$vibration" },
          reading_count: { $sum: 1 },
          // Device metadata
          device_location: { $first: "$sensor_info.location" },
          firmware_version: { $first: "$sensor_info.firmware_version" }
        }
      },
      {
        $addFields: {
          // Health indicators
          health_score: {
            $switch: {
              branches: [
                { 
                  case: { $lt: ["$reading_count", 3] }, 
                  then: "poor"  // Too few readings
                },
                {
                  case: { $gt: ["$max_vibration", 100] },
                  then: "critical"  // High vibration
                },
                {
                  case: { $or: [
                    { $lt: ["$avg_temperature", -10] },
                    { $gt: ["$avg_temperature", 50] }
                  ]},
                  then: "warning"  // Temperature out of range
                }
              ],
              default: "normal"
            }
          }
        }
      },
      {
        $group: {
          _id: "$_id.interval",
          devices: {
            $push: {
              device_id: "$_id.device_id",
              measurements: {
                temperature: { $round: ["$avg_temperature", 1] },
                humidity: { $round: ["$avg_humidity", 1] },
                pressure: { $round: ["$avg_pressure", 1] },
                vibration: { $round: ["$max_vibration", 1] }
              },
              health: "$health_score",
              reading_count: "$reading_count",
              location: "$device_location"
            }
          },
          facility_summary: {
            avg_temp: { $avg: "$avg_temperature" },
            avg_humidity: { $avg: "$avg_humidity" },
            total_devices: { $sum: 1 },
            healthy_devices: {
              $sum: {
                $cond: {
                  if: { $eq: ["$health_score", "normal"] },
                  then: 1,
                  else: 0
                }
              }
            }
          }
        }
      },
      {
        $sort: { "_id": -1 }
      },
      {
        $limit: 24  // Last 24 intervals (6 hours of 15-min intervals)
      },
      {
        $project: {
          timestamp: "$_id",
          devices: 1,
          facility_summary: {
            avg_temperature: { $round: ["$facility_summary.avg_temp", 1] },
            avg_humidity: { $round: ["$facility_summary.avg_humidity", 1] },
            device_health_ratio: {
              $round: [
                { $divide: ["$facility_summary.healthy_devices", "$facility_summary.total_devices"] },
                2
              ]
            }
          },
          _id: 0
        }
      }
    ];

    return await this.sensorCollection.aggregate(pipeline).toArray();
  }

  async detectSensorFailures(facilityId, timeWindowHours = 2) {
    // Identify potentially failed or malfunctioning sensors
    const windowStart = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          'sensor_info.facility_id': facilityId,
          timestamp: { $gte: windowStart }
        }
      },
      {
        $group: {
          _id: "$sensor_info.device_id",
          reading_count: { $sum: 1 },
          last_reading: { $max: "$timestamp" },
          avg_temperature: { $avg: "$temperature" },
          temp_variance: { $stdDevSamp: "$temperature" },
          max_vibration: { $max: "$vibration" },
          location: { $first: "$sensor_info.location" },
          sensor_type: { $first: "$sensor_info.sensor_type" }
        }
      },
      {
        $addFields: {
          minutes_since_last_reading: {
            $divide: [
              { $subtract: [new Date(), "$last_reading"] },
              60000
            ]
          },
          expected_readings: timeWindowHours * 4,  // Assuming 15-min intervals
          reading_ratio: {
            $divide: ["$reading_count", timeWindowHours * 4]
          }
        }
      },
      {
        $addFields: {
          failure_indicators: {
            no_recent_data: { $gt: ["$minutes_since_last_reading", 30] },
            insufficient_readings: { $lt: ["$reading_ratio", 0.5] },
            temperature_anomaly: { $gt: ["$temp_variance", 20] },
            vibration_alert: { $gt: ["$max_vibration", 150] }
          }
        }
      },
      {
        $addFields: {
          failure_score: {
            $add: [
              { $cond: { if: "$failure_indicators.no_recent_data", then: 3, else: 0 } },
              { $cond: { if: "$failure_indicators.insufficient_readings", then: 2, else: 0 } },
              { $cond: { if: "$failure_indicators.temperature_anomaly", then: 2, else: 0 } },
              { $cond: { if: "$failure_indicators.vibration_alert", then: 1, else: 0 } }
            ]
          }
        }
      },
      {
        $match: {
          failure_score: { $gte: 2 }  // Devices with significant failure indicators
        }
      },
      {
        $sort: { failure_score: -1, minutes_since_last_reading: -1 }
      },
      {
        $project: {
          device_id: "$_id",
          sensor_type: 1,
          location: 1,
          failure_score: 1,
          failure_indicators: 1,
          last_reading: 1,
          minutes_since_last_reading: { $round: ["$minutes_since_last_reading", 1] },
          reading_count: 1,
          expected_readings: 1,
          _id: 0
        }
      }
    ];

    return await this.sensorCollection.aggregate(pipeline).toArray();
  }
}
```

SQL-style sensor data analytics concepts:

```sql
-- SQL time series sensor analytics equivalent
-- IoT sensor data table with time partitioning
CREATE TABLE sensor_readings (
  timestamp TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(50) NOT NULL,
  sensor_type VARCHAR(20),
  temperature DECIMAL(5,2),
  humidity DECIMAL(5,2),
  pressure DECIMAL(7,2),
  vibration DECIMAL(6,2),
  location POINT,
  facility_id VARCHAR(20),
  
  PRIMARY KEY (device_id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Real-time sensor monitoring query
WITH recent_readings AS (
  SELECT 
    device_id,
    sensor_type,
    AVG(temperature) as avg_temp,
    AVG(humidity) as avg_humidity,
    MAX(vibration) as max_vibration,
    COUNT(*) as reading_count,
    MAX(timestamp) as last_reading
  FROM sensor_readings
  WHERE timestamp >= NOW() - INTERVAL '15 minutes'
    AND facility_id = 'FACILITY_001'
  GROUP BY device_id, sensor_type
)
SELECT 
  device_id,
  sensor_type,
  ROUND(avg_temp, 1) as current_temperature,
  ROUND(avg_humidity, 1) as current_humidity,
  ROUND(max_vibration, 1) as peak_vibration,
  reading_count,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - last_reading)) / 60 > 30 THEN 'OFFLINE'
    WHEN max_vibration > 150 THEN 'CRITICAL' 
    WHEN avg_temp < -10 OR avg_temp > 50 THEN 'WARNING'
    ELSE 'NORMAL'
  END as device_status
FROM recent_readings
ORDER BY 
  CASE device_status 
    WHEN 'CRITICAL' THEN 1 
    WHEN 'WARNING' THEN 2
    WHEN 'OFFLINE' THEN 3
    ELSE 4 
  END,
  device_id;
```

## Financial Time Series Analytics

### Market Data Processing

Process high-frequency financial data with time series collections:

```javascript
// Financial market data time series processing
class FinancialTimeSeriesProcessor {
  constructor(db) {
    this.db = db;
    this.marketDataCollection = db.collection('market_data');
  }

  async processTradeData(trades) {
    // Process high-frequency trade data
    const documents = trades.map(trade => ({
      trade_time: new Date(trade.timestamp),
      price: parseFloat(trade.price),
      volume: parseInt(trade.volume),
      bid_price: parseFloat(trade.bidPrice),
      ask_price: parseFloat(trade.askPrice),
      trade_type: trade.tradeType,  // 'buy' or 'sell'
      instrument: {
        symbol: trade.symbol,
        exchange: trade.exchange,
        market_sector: trade.sector,
        currency: trade.currency
      }
    }));

    return await this.marketDataCollection.insertMany(documents, {
      ordered: false
    });
  }

  async calculateOHLCData(symbol, intervalMinutes = 5, days = 1) {
    // Calculate OHLC (Open, High, Low, Close) data for charting
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          'instrument.symbol': symbol,
          trade_time: { $gte: startTime }
        }
      },
      {
        $group: {
          _id: {
            // Create time buckets for OHLC intervals
            interval_start: {
              $dateFromParts: {
                year: { $year: "$trade_time" },
                month: { $month: "$trade_time" },
                day: { $dayOfMonth: "$trade_time" },
                hour: { $hour: "$trade_time" },
                minute: {
                  $multiply: [
                    { $floor: { $divide: [{ $minute: "$trade_time" }, intervalMinutes] } },
                    intervalMinutes
                  ]
                }
              }
            }
          },
          // OHLC calculations
          open_price: { $first: "$price" },      // First trade in interval
          high_price: { $max: "$price" },        // Highest trade price
          low_price: { $min: "$price" },         // Lowest trade price  
          close_price: { $last: "$price" },      // Last trade in interval
          total_volume: { $sum: "$volume" },
          trade_count: { $sum: 1 },
          
          // Additional analytics
          volume_weighted_price: {
            $divide: [
              { $sum: { $multiply: ["$price", "$volume"] } },
              { $sum: "$volume" }
            ]
          },
          
          // Bid-ask spread analysis
          avg_bid_ask_spread: {
            $avg: { $subtract: ["$ask_price", "$bid_price"] }
          }
        }
      },
      {
        $addFields: {
          // Calculate price movement and volatility
          price_change: { $subtract: ["$close_price", "$open_price"] },
          price_range: { $subtract: ["$high_price", "$low_price"] },
          volatility_ratio: {
            $divide: [
              { $subtract: ["$high_price", "$low_price"] },
              "$open_price"
            ]
          }
        }
      },
      {
        $sort: { "_id.interval_start": 1 }
      },
      {
        $project: {
          timestamp: "$_id.interval_start",
          ohlc: {
            open: { $round: ["$open_price", 4] },
            high: { $round: ["$high_price", 4] },
            low: { $round: ["$low_price", 4] },
            close: { $round: ["$close_price", 4] }
          },
          volume: "$total_volume",
          trades: "$trade_count",
          analytics: {
            vwap: { $round: ["$volume_weighted_price", 4] },
            price_change: { $round: ["$price_change", 4] },
            volatility: { $round: ["$volatility_ratio", 6] },
            avg_spread: { $round: ["$avg_bid_ask_spread", 4] }
          },
          _id: 0
        }
      }
    ];

    return await this.marketDataCollection.aggregate(pipeline).toArray();
  }

  async detectTradingPatterns(symbol, lookbackHours = 4) {
    // Pattern recognition for algorithmic trading
    const startTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          'instrument.symbol': symbol,
          trade_time: { $gte: startTime }
        }
      },
      {
        $sort: { trade_time: 1 }
      },
      {
        $setWindowFields: {
          sortBy: { trade_time: 1 },
          output: {
            // Moving averages for technical analysis
            sma_5: {
              $avg: "$price",
              window: { documents: [-4, 0] }  // 5-point simple moving average
            },
            sma_20: {
              $avg: "$price", 
              window: { documents: [-19, 0] }  // 20-point simple moving average
            },
            
            // Price momentum indicators
            price_change_1: {
              $subtract: [
                "$price",
                { $shift: { output: "$price", by: -1 } }
              ]
            },
            
            // Volume analysis
            volume_ratio: {
              $divide: [
                "$volume",
                {
                  $avg: "$volume",
                  window: { documents: [-9, 0] }  // 10-period volume average
                }
              ]
            }
          }
        }
      },
      {
        $addFields: {
          // Technical indicators
          trend_signal: {
            $cond: {
              if: { $gt: ["$sma_5", "$sma_20"] },
              then: "bullish",
              else: "bearish"
            }
          },
          
          momentum_signal: {
            $switch: {
              branches: [
                { case: { $gt: ["$price_change_1", 0.01] }, then: "strong_buy" },
                { case: { $gt: ["$price_change_1", 0] }, then: "buy" },
                { case: { $lt: ["$price_change_1", -0.01] }, then: "strong_sell" },
                { case: { $lt: ["$price_change_1", 0] }, then: "sell" }
              ],
              default: "hold"
            }
          },
          
          volume_signal: {
            $cond: {
              if: { $gt: ["$volume_ratio", 1.5] },
              then: "high_volume",
              else: "normal_volume"
            }
          }
        }
      },
      {
        $match: {
          sma_5: { $ne: null },  // Exclude initial points without moving averages
          sma_20: { $ne: null }
        }
      },
      {
        $project: {
          trade_time: 1,
          price: { $round: ["$price", 4] },
          volume: 1,
          technical_indicators: {
            sma_5: { $round: ["$sma_5", 4] },
            sma_20: { $round: ["$sma_20", 4] },
            trend: "$trend_signal",
            momentum: "$momentum_signal",
            volume: "$volume_signal"
          },
          _id: 0
        }
      },
      {
        $sort: { trade_time: -1 }
      },
      {
        $limit: 100
      }
    ];

    return await this.marketDataCollection.aggregate(pipeline).toArray();
  }
}
```

## QueryLeaf Time Series Integration

QueryLeaf provides SQL-familiar syntax for time series operations with MongoDB's optimized storage:

```sql
-- QueryLeaf time series operations with SQL-style syntax

-- Time range queries with familiar SQL date functions
SELECT 
  sensor_info.device_id,
  sensor_info.facility_id,
  AVG(temperature) as avg_temperature,
  MAX(humidity) as max_humidity,
  COUNT(*) as reading_count
FROM sensor_readings
WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND sensor_info.sensor_type = 'environmental'
GROUP BY sensor_info.device_id, sensor_info.facility_id
ORDER BY avg_temperature DESC;

-- Time bucketing using SQL date functions
SELECT 
  DATE_TRUNC('hour', timestamp) as hour_bucket,
  instrument.symbol,
  FIRST(price ORDER BY trade_time) as open_price,
  MAX(price) as high_price, 
  MIN(price) as low_price,
  LAST(price ORDER BY trade_time) as close_price,
  SUM(volume) as total_volume,
  COUNT(*) as trade_count
FROM market_data
WHERE trade_time >= CURRENT_DATE - INTERVAL '7 days'
  AND instrument.symbol IN ('AAPL', 'GOOGL', 'MSFT')
GROUP BY hour_bucket, instrument.symbol
ORDER BY hour_bucket DESC, instrument.symbol;

-- Window functions for technical analysis
SELECT 
  trade_time,
  instrument.symbol,
  price,
  volume,
  AVG(price) OVER (
    PARTITION BY instrument.symbol 
    ORDER BY trade_time 
    ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
  ) as sma_5,
  AVG(price) OVER (
    PARTITION BY instrument.symbol
    ORDER BY trade_time
    ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
  ) as sma_20
FROM market_data
WHERE trade_time >= CURRENT_TIMESTAMP - INTERVAL '4 hours'
  AND instrument.symbol = 'BTC-USD'
ORDER BY trade_time DESC;

-- Sensor anomaly detection using SQL analytics
WITH sensor_stats AS (
  SELECT 
    sensor_info.device_id,
    timestamp,
    temperature,
    AVG(temperature) OVER (
      PARTITION BY sensor_info.device_id
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) as rolling_avg,
    STDDEV(temperature) OVER (
      PARTITION BY sensor_info.device_id
      ORDER BY timestamp  
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) as rolling_std
  FROM sensor_readings
  WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    AND sensor_info.facility_id = 'PLANT_001'
)
SELECT 
  device_id,
  timestamp,
  temperature,
  rolling_avg,
  ABS(temperature - rolling_avg) as deviation,
  rolling_std * 2 as anomaly_threshold,
  CASE 
    WHEN ABS(temperature - rolling_avg) > rolling_std * 3 THEN 'CRITICAL'
    WHEN ABS(temperature - rolling_avg) > rolling_std * 2 THEN 'WARNING'
    ELSE 'NORMAL'
  END as anomaly_level
FROM sensor_stats
WHERE ABS(temperature - rolling_avg) > rolling_std * 2
ORDER BY timestamp DESC;

-- QueryLeaf automatically optimizes for:
-- 1. Time series collection bucketing and compression
-- 2. Time-based index utilization for range queries  
-- 3. Efficient aggregation pipelines for time bucketing
-- 4. Window function translation to MongoDB analytics
-- 5. Date/time function mapping to MongoDB operators
-- 6. Automatic data lifecycle management

-- Capacity planning with growth analysis
WITH daily_metrics AS (
  SELECT 
    DATE_TRUNC('day', timestamp) as metric_date,
    metadata.server_id,
    AVG(cpu_usage) as daily_avg_cpu,
    MAX(memory_usage) as daily_peak_memory
  FROM server_metrics
  WHERE timestamp >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY metric_date, metadata.server_id
),
growth_analysis AS (
  SELECT 
    server_id,
    metric_date,
    daily_avg_cpu,
    daily_peak_memory,
    LAG(daily_avg_cpu, 7) OVER (PARTITION BY server_id ORDER BY metric_date) as cpu_week_ago,
    AVG(daily_avg_cpu) OVER (
      PARTITION BY server_id 
      ORDER BY metric_date 
      ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ) as cpu_30_day_avg
  FROM daily_metrics
)
SELECT 
  server_id,
  daily_avg_cpu as current_cpu,
  cpu_30_day_avg,
  CASE 
    WHEN cpu_week_ago IS NOT NULL 
    THEN ((daily_avg_cpu - cpu_week_ago) / cpu_week_ago) * 100
    ELSE NULL 
  END as weekly_growth_percent,
  CASE
    WHEN daily_avg_cpu > cpu_30_day_avg * 1.2 THEN 'SCALING_NEEDED'
    WHEN daily_avg_cpu > cpu_30_day_avg * 1.1 THEN 'MONITOR_CLOSELY'
    ELSE 'NORMAL_CAPACITY'
  END as capacity_status
FROM growth_analysis
WHERE metric_date = CURRENT_DATE - INTERVAL '1 day'
ORDER BY weekly_growth_percent DESC NULLS LAST;
```

## Data Lifecycle and Retention

### Automated Data Management

Implement intelligent data lifecycle policies:

```javascript
// Time series data lifecycle management
class TimeSeriesLifecycleManager {
  constructor(db) {
    this.db = db;
    this.retentionPolicies = new Map();
  }

  defineRetentionPolicy(collection, policy) {
    this.retentionPolicies.set(collection, {
      hotDataDays: policy.hotDataDays || 7,      // High-frequency access
      warmDataDays: policy.warmDataDays || 90,   // Moderate access
      coldDataDays: policy.coldDataDays || 365,  // Archive access
      deleteAfterDays: policy.deleteAfterDays || 2555  // 7 years
    });
  }

  async applyDataLifecycle(collection) {
    const policy = this.retentionPolicies.get(collection);
    if (!policy) return;

    const now = new Date();
    const hotCutoff = new Date(now.getTime() - policy.hotDataDays * 24 * 60 * 60 * 1000);
    const warmCutoff = new Date(now.getTime() - policy.warmDataDays * 24 * 60 * 60 * 1000);
    const coldCutoff = new Date(now.getTime() - policy.coldDataDays * 24 * 60 * 60 * 1000);
    const deleteCutoff = new Date(now.getTime() - policy.deleteAfterDays * 24 * 60 * 60 * 1000);

    // Archive warm data (compress and move to separate collection)
    await this.archiveWarmData(collection, warmCutoff, coldCutoff);
    
    // Move cold data to archive storage
    await this.moveColdData(collection, coldCutoff, deleteCutoff);
    
    // Delete expired data
    await this.deleteExpiredData(collection, deleteCutoff);
    
    return {
      hotDataCutoff: hotCutoff,
      warmDataCutoff: warmCutoff,
      coldDataCutoff: coldCutoff,
      deleteCutoff: deleteCutoff
    };
  }

  async archiveWarmData(collection, startTime, endTime) {
    const archiveCollection = `${collection}_archive`;
    
    // Aggregate and compress warm data
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startTime, $lt: endTime }
        }
      },
      {
        $group: {
          _id: {
            // Compress to hourly aggregates
            hour: {
              $dateFromParts: {
                year: { $year: "$timestamp" },
                month: { $month: "$timestamp" }, 
                day: { $dayOfMonth: "$timestamp" },
                hour: { $hour: "$timestamp" }
              }
            },
            metadata: "$metadata"
          },
          // Statistical aggregates preserve essential information
          avg_values: {
            cpu_usage: { $avg: "$cpu_usage" },
            memory_usage: { $avg: "$memory_usage" },
            disk_io: { $avg: "$disk_io" }
          },
          max_values: {
            cpu_usage: { $max: "$cpu_usage" },
            memory_usage: { $max: "$memory_usage" },
            disk_io: { $max: "$disk_io" }
          },
          min_values: {
            cpu_usage: { $min: "$cpu_usage" },
            memory_usage: { $min: "$memory_usage" },
            disk_io: { $min: "$disk_io" }
          },
          sample_count: { $sum: 1 },
          first_reading: { $min: "$timestamp" },
          last_reading: { $max: "$timestamp" }
        }
      },
      {
        $addFields: {
          archived_at: new Date(),
          data_type: "hourly_aggregate",
          original_collection: collection
        }
      },
      {
        $out: archiveCollection
      }
    ];

    await this.db.collection(collection).aggregate(pipeline).toArray();
    
    // Remove original data after successful archival
    const deleteResult = await this.db.collection(collection).deleteMany({
      timestamp: { $gte: startTime, $lt: endTime }
    });

    return {
      archivedDocuments: deleteResult.deletedCount,
      archiveCollection: archiveCollection
    };
  }
}
```

## Advanced Time Series Analytics

### Complex Time-Based Aggregations

Implement sophisticated analytics operations:

```javascript
// Advanced time series analytics operations
class TimeSeriesAnalyticsEngine {
  constructor(db) {
    this.db = db;
  }

  async generateTimeSeriesForecast(collection, field, options = {}) {
    // Time series forecasting using exponential smoothing
    const days = options.historyDays || 30;
    const forecastDays = options.forecastDays || 7;
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startTime },
          [field]: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
          },
          daily_avg: { $avg: `$${field}` },
          daily_count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.date": 1 }
      },
      {
        $group: {
          _id: null,
          daily_series: {
            $push: {
              date: "$_id.date",
              value: "$daily_avg",
              sample_size: "$daily_count"
            }
          }
        }
      },
      {
        $addFields: {
          // Calculate exponential smoothing forecast
          forecast: {
            $function: {
              body: function(dailySeries, forecastDays) {
                if (dailySeries.length < 7) return null;
                
                // Exponential smoothing parameters
                const alpha = 0.3;  // Smoothing factor
                const beta = 0.1;   // Trend factor
                
                let level = dailySeries[0].value;
                let trend = 0;
                
                // Calculate initial trend
                if (dailySeries.length >= 2) {
                  trend = dailySeries[1].value - dailySeries[0].value;
                }
                
                const smoothed = [];
                const forecasts = [];
                
                // Apply exponential smoothing to historical data
                for (let i = 0; i < dailySeries.length; i++) {
                  const actual = dailySeries[i].value;
                  
                  if (i > 0) {
                    const forecast = level + trend;
                    const error = actual - forecast;
                    
                    // Update level and trend
                    const newLevel = alpha * actual + (1 - alpha) * (level + trend);
                    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
                    
                    level = newLevel;
                    trend = newTrend;
                  }
                  
                  smoothed.push({
                    date: dailySeries[i].date,
                    actual: actual,
                    smoothed: level,
                    trend: trend
                  });
                }
                
                // Generate future forecasts
                for (let i = 1; i <= forecastDays; i++) {
                  const forecastValue = level + (trend * i);
                  const futureDate = new Date(new Date(dailySeries[dailySeries.length - 1].date).getTime() + i * 24 * 60 * 60 * 1000);
                  
                  forecasts.push({
                    date: futureDate.toISOString().split('T')[0],
                    forecast_value: Math.round(forecastValue * 100) / 100,
                    confidence: Math.max(0.1, 1 - (i * 0.1))  // Decreasing confidence
                  });
                }
                
                return {
                  historical_smoothing: smoothed,
                  forecasts: forecasts,
                  model_parameters: {
                    alpha: alpha,
                    beta: beta,
                    final_level: level,
                    final_trend: trend
                  }
                };
              },
              args: ["$daily_series", forecastDays],
              lang: "js"
            }
          }
        }
      },
      {
        $project: {
          field_name: field,
          forecast_analysis: "$forecast",
          data_points: { $size: "$daily_series" },
          forecast_period_days: forecastDays,
          _id: 0
        }
      }
    ];

    const results = await this.db.collection(collection).aggregate(pipeline).toArray();
    return results[0];
  }

  async correlateTimeSeriesMetrics(collection, metrics, timeWindow) {
    // Cross-metric correlation analysis
    const startTime = new Date(Date.now() - timeWindow);
    
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startTime }
        }
      },
      {
        $group: {
          _id: {
            // Hourly buckets for correlation
            hour: {
              $dateFromParts: {
                year: { $year: "$timestamp" },
                month: { $month: "$timestamp" },
                day: { $dayOfMonth: "$timestamp" },
                hour: { $hour: "$timestamp" }
              }
            },
            server: "$metadata.server_id"
          },
          // Average metrics for each hour/server combination
          hourly_metrics: {
            $push: metrics.reduce((obj, metric) => {
              obj[metric] = { $avg: `$${metric}` };
              return obj;
            }, {})
          }
        }
      },
      {
        $group: {
          _id: "$_id.server",
          metric_series: { $push: "$hourly_metrics" }
        }
      },
      {
        $addFields: {
          correlations: {
            $function: {
              body: function(metricSeries, metricNames) {
                const correlations = {};
                
                // Calculate pairwise correlations
                for (let i = 0; i < metricNames.length; i++) {
                  for (let j = i + 1; j < metricNames.length; j++) {
                    const metric1 = metricNames[i];
                    const metric2 = metricNames[j];
                    
                    const values1 = metricSeries.map(s => s[0][metric1]);
                    const values2 = metricSeries.map(s => s[0][metric2]);
                    
                    const correlation = calculateCorrelation(values1, values2);
                    correlations[`${metric1}_${metric2}`] = Math.round(correlation * 1000) / 1000;
                  }
                }
                
                function calculateCorrelation(x, y) {
                  const n = x.length;
                  if (n !== y.length || n < 2) return 0;
                  
                  const sumX = x.reduce((a, b) => a + b, 0);
                  const sumY = y.reduce((a, b) => a + b, 0);
                  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
                  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
                  const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);
                  
                  const numerator = n * sumXY - sumX * sumY;
                  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
                  
                  return denominator === 0 ? 0 : numerator / denominator;
                }
                
                return correlations;
              },
              args: ["$metric_series", metrics],
              lang: "js"
            }
          }
        }
      },
      {
        $project: {
          server_id: "$_id",
          metric_correlations: "$correlations",
          analysis_period: timeWindow,
          _id: 0
        }
      }
    ];

    return await this.db.collection(collection).aggregate(pipeline).toArray();
  }
}
```

## Best Practices for Time Series Collections

### Design Guidelines

Essential practices for MongoDB time series implementations:

1. **Time Field Selection**: Choose appropriate time field granularity based on data frequency
2. **Metadata Organization**: Structure metadata for efficient querying and aggregation
3. **Index Strategy**: Create time-based compound indexes for common query patterns
4. **Bucket Configuration**: Optimize bucket sizes based on data insertion patterns
5. **Retention Policies**: Implement automatic data lifecycle management
6. **Compression Strategy**: Use MongoDB's time series compression for storage efficiency

### Performance Optimization

Optimize time series collection performance:

1. **Write Optimization**: Use batch inserts and optimize insertion order by timestamp
2. **Query Patterns**: Design queries to leverage time series optimizations and indexes
3. **Aggregation Efficiency**: Use time bucketing and window functions for analytics
4. **Memory Management**: Monitor working set size and adjust based on query patterns
5. **Sharding Strategy**: Implement time-based sharding for horizontal scaling
6. **Cache Strategy**: Cache frequently accessed time ranges and aggregations

## Conclusion

MongoDB time series collections provide specialized optimizations for time-stamped data workloads, delivering high-performance storage, querying, and analytics capabilities. Combined with SQL-style query patterns, time series collections enable familiar database operations while leveraging MongoDB's optimization advantages for temporal data.

Key time series benefits include:

- **Storage Efficiency**: Automatic bucketing and compression reduce storage overhead by 70%+
- **Write Performance**: Optimized insertion patterns for high-frequency data streams
- **Query Optimization**: Time-based indexes and aggregation pipelines designed for temporal queries  
- **Analytics Integration**: Built-in support for windowing functions and statistical operations
- **Lifecycle Management**: Automated data aging and retention policy enforcement

Whether you're building IoT monitoring systems, financial analytics platforms, or application performance dashboards, MongoDB time series collections with QueryLeaf's familiar SQL interface provide the foundation for scalable time-based data processing. This combination enables you to implement powerful temporal analytics while preserving the development patterns and query approaches your team already knows.

> **QueryLeaf Integration**: QueryLeaf automatically detects time series collections and optimizes SQL queries to leverage MongoDB's time series storage and indexing optimizations. Window functions, date operations, and time-based grouping are seamlessly translated to efficient MongoDB aggregation pipelines designed for temporal data patterns.

The integration of specialized time series storage with SQL-style temporal analytics makes MongoDB an ideal platform for applications requiring both high-performance time data processing and familiar database interaction patterns, ensuring your time series analytics remain both comprehensive and maintainable as data volumes scale.