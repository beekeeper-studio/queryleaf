---
title: "MongoDB Aggregation Framework for Geospatial Analytics: Advanced Location-Based Data Processing and Spatial Intelligence for Enterprise Applications"
description: "Master MongoDB's Aggregation Framework for geospatial analytics and location intelligence. Learn advanced spatial queries, geographic aggregations, proximity analysis, and SQL-familiar geospatial patterns for high-performance location-based applications."
date: 2025-11-21
tags: [mongodb, aggregation, geospatial, analytics, location-intelligence, spatial-queries, sql]
---

# MongoDB Aggregation Framework for Geospatial Analytics: Advanced Location-Based Data Processing and Spatial Intelligence for Enterprise Applications

Modern applications increasingly rely on location-based services and spatial analytics to deliver personalized experiences, optimize operations, and generate business insights. Traditional databases struggle with complex geospatial queries, requiring specialized GIS systems or expensive spatial extensions that complicate development and deployment workflows. Processing location data at scale often requires complex spatial calculations, distance computations, and geographic aggregations that are inefficient in conventional relational systems.

MongoDB's Aggregation Framework provides comprehensive geospatial analytics capabilities that enable sophisticated location-based data processing directly within the database. Unlike traditional databases that require external spatial libraries or complex workarounds, MongoDB's native spatial operators integrate seamlessly with aggregation pipelines while delivering enterprise-grade performance and scalability for real-world location intelligence applications.

## The Traditional Geospatial Analytics Challenge

Implementing location-based analytics with conventional database systems creates significant development and performance challenges:

```sql
-- Traditional PostgreSQL geospatial analytics - complex spatial extensions required

-- Store location tracking data with PostGIS spatial extensions
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE user_locations (
    location_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    device_id VARCHAR(100),
    
    -- Location coordinates using PostGIS geometry types
    coordinates GEOMETRY(POINT, 4326) NOT NULL,
    accuracy_meters DECIMAL(8,2),
    altitude_meters DECIMAL(8,2),
    
    -- Address information
    street_address VARCHAR(500),
    city VARCHAR(100),
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(3),
    
    -- Location metadata
    location_source VARCHAR(50), -- 'gps', 'network', 'passive'
    location_method VARCHAR(50), -- 'check_in', 'automatic', 'manual'
    
    -- Timestamps and tracking
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for spatial operations
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Create spatial indexes (essential for performance)
CREATE INDEX idx_user_locations_gist ON user_locations USING GIST (coordinates);
CREATE INDEX idx_user_locations_user_recorded ON user_locations(user_id, recorded_at);

-- Store points of interest for proximity analysis
CREATE TABLE points_of_interest (
    poi_id SERIAL PRIMARY KEY,
    poi_name VARCHAR(200) NOT NULL,
    poi_category VARCHAR(100) NOT NULL,
    poi_subcategory VARCHAR(100),
    
    -- POI location
    coordinates GEOMETRY(POINT, 4326) NOT NULL,
    
    -- POI details
    description TEXT,
    website VARCHAR(500),
    phone VARCHAR(20),
    
    -- Business hours and metadata
    business_hours JSONB,
    amenities TEXT[],
    rating_average DECIMAL(3,2),
    review_count INTEGER DEFAULT 0,
    
    -- Address and contact
    street_address VARCHAR(500),
    city VARCHAR(100),
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(3),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_poi_gist ON points_of_interest USING GIST (coordinates);
CREATE INDEX idx_poi_category ON points_of_interest(poi_category, poi_subcategory);

-- Complex spatial analytics query - expensive operations
WITH user_daily_paths AS (
  -- Calculate daily movement patterns for users
  SELECT 
    user_id,
    DATE(recorded_at) as tracking_date,
    
    -- Aggregate location points into daily paths
    ST_MakeLine(
      ST_Transform(coordinates, 3857) 
      ORDER BY recorded_at
    ) as daily_path_meters,
    
    -- Calculate total distance traveled
    SUM(
      ST_Distance(
        ST_Transform(coordinates, 3857),
        ST_Transform(
          LAG(coordinates) OVER (
            PARTITION BY user_id, DATE(recorded_at) 
            ORDER BY recorded_at
          ), 3857
        )
      )
    ) as total_distance_meters,
    
    -- Time-based calculations
    MIN(recorded_at) as first_location_time,
    MAX(recorded_at) as last_location_time,
    COUNT(*) as location_points,
    
    -- Geographic bounds
    ST_XMin(ST_Extent(coordinates)) as min_longitude,
    ST_YMin(ST_Extent(coordinates)) as min_latitude,
    ST_XMax(ST_Extent(coordinates)) as max_longitude,
    ST_YMax(ST_Extent(coordinates)) as max_latitude
    
  FROM user_locations
  WHERE recorded_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY user_id, DATE(recorded_at)
  HAVING COUNT(*) >= 5 -- Only days with sufficient tracking
),

poi_proximity_analysis AS (
  -- Analyze proximity to points of interest
  SELECT 
    ul.user_id,
    ul.recorded_at,
    poi.poi_id,
    poi.poi_name,
    poi.poi_category,
    
    -- Distance calculations (expensive spatial operations)
    ST_Distance(
      ST_Transform(ul.coordinates, 3857),
      ST_Transform(poi.coordinates, 3857)
    ) as distance_meters,
    
    -- Determine if user is within proximity zones
    CASE 
      WHEN ST_DWithin(
        ST_Transform(ul.coordinates, 3857),
        ST_Transform(poi.coordinates, 3857),
        100  -- 100 meters
      ) THEN 'immediate_vicinity'
      WHEN ST_DWithin(
        ST_Transform(ul.coordinates, 3857),
        ST_Transform(poi.coordinates, 3857),
        500  -- 500 meters
      ) THEN 'nearby'
      WHEN ST_DWithin(
        ST_Transform(ul.coordinates, 3857),
        ST_Transform(poi.coordinates, 3857),
        1000 -- 1 kilometer
      ) THEN 'walking_distance'
      ELSE 'distant'
    END as proximity_category,
    
    -- Time spent near POI (complex window calculations)
    CASE 
      WHEN ST_DWithin(
        ST_Transform(ul.coordinates, 3857),
        ST_Transform(poi.coordinates, 3857),
        200
      ) THEN 
        EXTRACT(EPOCH FROM (
          LEAD(ul.recorded_at) OVER (
            PARTITION BY ul.user_id 
            ORDER BY ul.recorded_at
          ) - ul.recorded_at
        )) / 60.0 -- Convert to minutes
      ELSE 0
    END as time_spent_minutes
    
  FROM user_locations ul
  CROSS JOIN points_of_interest poi
  WHERE ul.recorded_at >= CURRENT_DATE - INTERVAL '7 days'
    AND ST_DWithin(
      ST_Transform(ul.coordinates, 3857),
      ST_Transform(poi.coordinates, 3857),
      5000 -- Only POIs within 5km
    )
),

geospatial_insights AS (
  -- Generate comprehensive geospatial insights
  SELECT 
    udp.user_id,
    udp.tracking_date,
    
    -- Daily movement analysis
    udp.total_distance_meters,
    ROUND(udp.total_distance_meters / 1000.0, 2) as total_distance_km,
    
    -- Calculate movement velocity and patterns
    CASE 
      WHEN EXTRACT(EPOCH FROM (udp.last_location_time - udp.first_location_time)) > 0
      THEN ROUND(
        udp.total_distance_meters / 
        EXTRACT(EPOCH FROM (udp.last_location_time - udp.first_location_time)) * 3.6,
        2
      )
      ELSE 0
    END as average_speed_kmh,
    
    -- Geographic coverage analysis
    ST_Area(
      ST_Transform(
        ST_MakeEnvelope(
          udp.min_longitude, udp.min_latitude,
          udp.max_longitude, udp.max_latitude,
          4326
        ), 3857
      )
    ) / 1000000.0 as coverage_area_km2, -- Convert to km²
    
    udp.location_points,
    udp.first_location_time,
    udp.last_location_time,
    
    -- POI interaction analysis
    (
      SELECT COUNT(DISTINCT poi_id)
      FROM poi_proximity_analysis ppa
      WHERE ppa.user_id = udp.user_id
        AND DATE(ppa.recorded_at) = udp.tracking_date
        AND ppa.proximity_category IN ('immediate_vicinity', 'nearby')
    ) as unique_pois_visited,
    
    (
      SELECT SUM(time_spent_minutes)
      FROM poi_proximity_analysis ppa
      WHERE ppa.user_id = udp.user_id
        AND DATE(ppa.recorded_at) = udp.tracking_date
        AND ppa.time_spent_minutes > 0
    ) as total_poi_time_minutes,
    
    -- Most frequent POI categories
    (
      SELECT STRING_AGG(poi_category, ', ' ORDER BY visit_count DESC)
      FROM (
        SELECT poi_category, COUNT(*) as visit_count
        FROM poi_proximity_analysis ppa
        WHERE ppa.user_id = udp.user_id
          AND DATE(ppa.recorded_at) = udp.tracking_date
          AND ppa.proximity_category = 'immediate_vicinity'
        GROUP BY poi_category
        ORDER BY visit_count DESC
        LIMIT 3
      ) top_categories
    ) as top_poi_categories,
    
    -- Mobility pattern classification
    CASE 
      WHEN udp.total_distance_meters < 1000 THEN 'stationary'
      WHEN udp.total_distance_meters < 5000 THEN 'local_movement'
      WHEN udp.total_distance_meters < 20000 THEN 'moderate_travel'
      ELSE 'extensive_travel'
    END as mobility_pattern
    
  FROM user_daily_paths udp
)

SELECT 
  gi.user_id,
  gi.tracking_date,
  gi.total_distance_km,
  gi.average_speed_kmh,
  ROUND(gi.coverage_area_km2, 3) as coverage_area_km2,
  gi.location_points,
  gi.unique_pois_visited,
  ROUND(gi.total_poi_time_minutes, 1) as total_poi_time_minutes,
  gi.top_poi_categories,
  gi.mobility_pattern,
  
  -- Daily insights and categorization
  CASE 
    WHEN gi.unique_pois_visited > 5 AND gi.total_distance_km > 10 THEN 'high_mobility_explorer'
    WHEN gi.unique_pois_visited > 3 AND gi.total_distance_km < 5 THEN 'local_explorer'
    WHEN gi.total_distance_km > 20 THEN 'long_distance_traveler'
    WHEN gi.total_poi_time_minutes > 60 THEN 'poi_focused_user'
    ELSE 'standard_user'
  END as user_behavior_profile,
  
  -- Environmental and context factors
  EXTRACT(DOW FROM gi.tracking_date) as day_of_week,
  CASE 
    WHEN EXTRACT(DOW FROM gi.tracking_date) IN (0, 6) THEN 'weekend'
    ELSE 'weekday'
  END as day_type,
  
  -- Performance and data quality metrics
  CASE 
    WHEN gi.location_points < 10 THEN 'insufficient_data'
    WHEN gi.location_points < 50 THEN 'moderate_tracking'
    ELSE 'comprehensive_tracking'
  END as tracking_quality

FROM geospatial_insights gi
ORDER BY gi.user_id, gi.tracking_date;

-- Problems with traditional geospatial analytics:
-- 1. Complex spatial extension dependencies (PostGIS) add deployment overhead
-- 2. Expensive coordinate transformations required for accurate distance calculations
-- 3. Multiple complex JOINs and spatial operations create performance bottlenecks
-- 4. Difficult to scale horizontally due to spatial index requirements
-- 5. Limited aggregation capabilities for complex spatial analytics
-- 6. Complex query syntax that's hard to optimize and maintain
-- 7. Poor integration with application object models
-- 8. Expensive spatial index maintenance and storage overhead
-- 9. Limited real-time processing capabilities for streaming location data
-- 10. Complex deployment and configuration of spatial extensions
```

MongoDB provides native geospatial analytics with powerful aggregation framework integration:

```javascript
// MongoDB Geospatial Aggregation Framework - native spatial analytics
const { MongoClient } = require('mongodb');

// Advanced MongoDB Geospatial Analytics Manager
class MongoGeospatialAnalyticsManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.spatialCollections = new Map();
    this.geospatialIndexes = new Map();
    this.analyticsCache = new Map();
  }

  async initialize() {
    console.log('Initializing MongoDB Geospatial Analytics Manager...');
    
    // Connect with geospatial optimization settings
    this.client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017', {
      // Connection optimization for geospatial operations
      maxPoolSize: 15,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      
      // Read preferences optimized for analytics
      readPreference: 'secondaryPreferred',
      readConcern: { level: 'local' },
      
      // Write concern for location tracking
      writeConcern: { w: 1, j: false }, // Optimized for high-volume tracking
      
      appName: 'GeospatialAnalyticsManager'
    });

    await this.client.connect();
    this.db = this.client.db('location_intelligence');
    
    // Initialize geospatial collections and indexes
    await this.setupGeospatialCollections();
    await this.createSpatialIndexes();
    
    console.log('✅ MongoDB Geospatial Analytics Manager initialized');
  }

  async setupGeospatialCollections() {
    console.log('Setting up geospatial collections...');
    
    const collections = {
      // User location tracking with geospatial data
      userLocations: {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['userId', 'coordinates', 'recordedAt'],
            properties: {
              userId: { bsonType: 'objectId' },
              deviceId: { bsonType: 'string' },
              coordinates: {
                bsonType: 'object',
                required: ['type', 'coordinates'],
                properties: {
                  type: { enum: ['Point'] },
                  coordinates: {
                    bsonType: 'array',
                    minItems: 2,
                    maxItems: 2,
                    items: { bsonType: 'double' }
                  }
                }
              },
              accuracy: { bsonType: 'double', minimum: 0 },
              altitude: { bsonType: 'double' },
              address: {
                bsonType: 'object',
                properties: {
                  street: { bsonType: 'string' },
                  city: { bsonType: 'string' },
                  state: { bsonType: 'string' },
                  postalCode: { bsonType: 'string' },
                  country: { bsonType: 'string' }
                }
              },
              locationSource: { enum: ['gps', 'network', 'passive', 'manual'] },
              locationMethod: { enum: ['checkin', 'automatic', 'manual', 'passive'] },
              recordedAt: { bsonType: 'date' }
            }
          }
        }
      },
      
      // Points of interest for proximity analysis
      pointsOfInterest: {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'category', 'coordinates'],
            properties: {
              name: { bsonType: 'string' },
              category: { bsonType: 'string' },
              subcategory: { bsonType: 'string' },
              coordinates: {
                bsonType: 'object',
                required: ['type', 'coordinates'],
                properties: {
                  type: { enum: ['Point'] },
                  coordinates: {
                    bsonType: 'array',
                    minItems: 2,
                    maxItems: 2,
                    items: { bsonType: 'double' }
                  }
                }
              },
              address: {
                bsonType: 'object',
                properties: {
                  street: { bsonType: 'string' },
                  city: { bsonType: 'string' },
                  state: { bsonType: 'string' },
                  postalCode: { bsonType: 'string' },
                  country: { bsonType: 'string' }
                }
              },
              businessHours: { bsonType: 'object' },
              amenities: { bsonType: 'array' },
              rating: { bsonType: 'double', minimum: 0, maximum: 5 },
              reviewCount: { bsonType: 'int', minimum: 0 }
            }
          }
        }
      },
      
      // Geographic regions and boundaries
      geographicRegions: {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'regionType', 'geometry'],
            properties: {
              name: { bsonType: 'string' },
              regionType: { enum: ['city', 'district', 'neighborhood', 'zone', 'boundary'] },
              geometry: {
                bsonType: 'object',
                required: ['type', 'coordinates'],
                properties: {
                  type: { enum: ['Polygon', 'MultiPolygon'] },
                  coordinates: { bsonType: 'array' }
                }
              },
              properties: { bsonType: 'object' },
              population: { bsonType: 'int', minimum: 0 },
              area: { bsonType: 'double', minimum: 0 }
            }
          }
        }
      }
    };

    for (const [collectionName, options] of Object.entries(collections)) {
      await this.db.createCollection(collectionName, options);
      this.spatialCollections.set(collectionName, this.db.collection(collectionName));
    }

    console.log('✅ Geospatial collections created');
  }

  async createSpatialIndexes() {
    console.log('Creating optimized geospatial indexes...');
    
    const userLocations = this.spatialCollections.get('userLocations');
    const pointsOfInterest = this.spatialCollections.get('pointsOfInterest');
    const geographicRegions = this.spatialCollections.get('geographicRegions');
    
    // User locations indexes
    await userLocations.createIndex({ coordinates: '2dsphere' });
    await userLocations.createIndex({ userId: 1, recordedAt: -1 });
    await userLocations.createIndex({ recordedAt: -1 });
    await userLocations.createIndex({ 
      coordinates: '2dsphere', 
      userId: 1, 
      recordedAt: -1 
    });

    // Points of interest indexes  
    await pointsOfInterest.createIndex({ coordinates: '2dsphere' });
    await pointsOfInterest.createIndex({ category: 1, subcategory: 1 });
    await pointsOfInterest.createIndex({ 
      coordinates: '2dsphere', 
      category: 1 
    });

    // Geographic regions indexes
    await geographicRegions.createIndex({ geometry: '2dsphere' });
    await geographicRegions.createIndex({ regionType: 1 });
    
    console.log('✅ Geospatial indexes created');
  }

  async performUserMobilityAnalysis(userId, dateRange = { days: 7 }) {
    console.log(`Performing mobility analysis for user ${userId}...`);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dateRange.days);
    
    const userLocations = this.spatialCollections.get('userLocations');
    
    const mobilityPipeline = [
      // Match user locations within date range
      {
        $match: {
          userId: userId,
          recordedAt: { $gte: startDate }
        }
      },
      
      // Sort by recording time for path analysis
      { $sort: { recordedAt: 1 } },
      
      // Group by day for daily analysis
      {
        $group: {
          _id: {
            userId: '$userId',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$recordedAt' } }
          },
          
          // Collect all locations for the day
          locations: {
            $push: {
              coordinates: '$coordinates',
              recordedAt: '$recordedAt',
              accuracy: '$accuracy',
              locationSource: '$locationSource'
            }
          },
          
          // Basic aggregations
          locationCount: { $sum: 1 },
          firstLocation: { $first: '$recordedAt' },
          lastLocation: { $last: '$recordedAt' },
          
          // Calculate geographic bounds
          minLongitude: { $min: { $arrayElemAt: ['$coordinates.coordinates', 0] } },
          maxLongitude: { $max: { $arrayElemAt: ['$coordinates.coordinates', 0] } },
          minLatitude: { $min: { $arrayElemAt: ['$coordinates.coordinates', 1] } },
          maxLatitude: { $max: { $arrayElemAt: ['$coordinates.coordinates', 1] } }
        }
      },
      
      // Calculate daily movement metrics
      {
        $addFields: {
          // Calculate coverage area using geographic bounds
          coverageArea: {
            $multiply: [
              { $subtract: ['$maxLongitude', '$minLongitude'] },
              { $subtract: ['$maxLatitude', '$minLatitude'] },
              111320 // Approximate meters per degree (varies by latitude)
            ]
          },
          
          // Calculate time span for velocity analysis
          timeSpanMinutes: {
            $divide: [
              { $subtract: ['$lastLocation', '$firstLocation'] },
              60000 // Convert milliseconds to minutes
            ]
          },
          
          // Data quality assessment
          trackingQuality: {
            $switch: {
              branches: [
                { case: { $gte: ['$locationCount', 50] }, then: 'comprehensive' },
                { case: { $gte: ['$locationCount', 20] }, then: 'moderate' },
                { case: { $gte: ['$locationCount', 5] }, then: 'basic' }
              ],
              default: 'insufficient'
            }
          }
        }
      },
      
      // Calculate movement distances using geospatial operations
      {
        $addFields: {
          movementAnalysis: {
            $reduce: {
              input: { $range: [1, { $size: '$locations' }] },
              initialValue: { 
                totalDistance: 0, 
                segments: [] 
              },
              in: {
                totalDistance: {
                  $add: [
                    '$$value.totalDistance',
                    {
                      $let: {
                        vars: {
                          currentLoc: { $arrayElemAt: ['$locations', '$$this'] },
                          previousLoc: { $arrayElemAt: ['$locations', { $subtract: ['$$this', 1] }] }
                        },
                        in: {
                          // Use $geoNear equivalent calculation for distance
                          $multiply: [
                            {
                              $sqrt: {
                                $add: [
                                  {
                                    $pow: [
                                      {
                                        $multiply: [
                                          { $subtract: [
                                            { $arrayElemAt: ['$$currentLoc.coordinates.coordinates', 0] },
                                            { $arrayElemAt: ['$$previousLoc.coordinates.coordinates', 0] }
                                          ] },
                                          111320 // Meters per degree longitude (approximate)
                                        ]
                                      },
                                      2
                                    ]
                                  },
                                  {
                                    $pow: [
                                      {
                                        $multiply: [
                                          { $subtract: [
                                            { $arrayElemAt: ['$$currentLoc.coordinates.coordinates', 1] },
                                            { $arrayElemAt: ['$$previousLoc.coordinates.coordinates', 1] }
                                          ] },
                                          110540 // Meters per degree latitude
                                        ]
                                      },
                                      2
                                    ]
                                  }
                                ]
                              }
                            },
                            1 // Simplified distance calculation
                          ]
                        }
                      }
                    }
                  ]
                },
                segments: {
                  $concatArrays: [
                    '$$value.segments',
                    [{
                      from: { $arrayElemAt: ['$locations', { $subtract: ['$$this', 1] }] },
                      to: { $arrayElemAt: ['$locations', '$$this'] },
                      distance: '$$value.totalDistance'
                    }]
                  ]
                }
              }
            }
          }
        }
      },
      
      // Calculate velocity and mobility patterns
      {
        $addFields: {
          totalDistanceMeters: '$movementAnalysis.totalDistance',
          totalDistanceKm: { $divide: ['$movementAnalysis.totalDistance', 1000] },
          averageSpeedKmh: {
            $cond: {
              if: { $gt: ['$timeSpanMinutes', 0] },
              then: {
                $multiply: [
                  { $divide: ['$movementAnalysis.totalDistance', 1000] },
                  { $divide: [60, '$timeSpanMinutes'] }
                ]
              },
              else: 0
            }
          },
          
          // Classify mobility pattern
          mobilityPattern: {
            $switch: {
              branches: [
                { case: { $lt: ['$movementAnalysis.totalDistance', 1000] }, then: 'stationary' },
                { case: { $lt: ['$movementAnalysis.totalDistance', 5000] }, then: 'local_movement' },
                { case: { $lt: ['$movementAnalysis.totalDistance', 20000] }, then: 'moderate_travel' }
              ],
              default: 'extensive_travel'
            }
          }
        }
      },
      
      // Final projection with insights
      {
        $project: {
          userId: '$_id.userId',
          analysisDate: '$_id.day',
          totalDistanceKm: { $round: ['$totalDistanceKm', 2] },
          averageSpeedKmh: { $round: ['$averageSpeedKmh', 2] },
          coverageAreaKm2: { $round: [{ $divide: ['$coverageArea', 1000000] }, 4] },
          locationCount: 1,
          timeSpanHours: { $round: [{ $divide: ['$timeSpanMinutes', 60] }, 2] },
          mobilityPattern: 1,
          trackingQuality: 1,
          
          // Geographic bounds for mapping
          bounds: {
            northeast: { lat: '$maxLatitude', lng: '$maxLongitude' },
            southwest: { lat: '$minLatitude', lng: '$minLongitude' }
          },
          
          // Movement insights
          insights: {
            isHighMobility: { $gt: ['$totalDistanceKm', 10] },
            isLocalExplorer: {
              $and: [
                { $lt: ['$totalDistanceKm', 5] },
                { $gt: ['$locationCount', 20] }
              ]
            },
            hasLongPeriods: { $gt: ['$timeSpanMinutes', 480] }, // More than 8 hours
            dataQualitySufficient: { $ne: ['$trackingQuality', 'insufficient'] }
          }
        }
      },
      
      { $sort: { analysisDate: -1 } }
    ];

    const results = await userLocations.aggregate(mobilityPipeline).toArray();
    
    // Calculate summary statistics across all days
    const summaryPipeline = [
      { $match: { userId: userId, recordedAt: { $gte: startDate } } },
      {
        $group: {
          _id: '$userId',
          totalLocations: { $sum: 1 },
          uniqueDays: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$recordedAt' } } },
          averageAccuracy: { $avg: '$accuracy' },
          locationSources: { $addToSet: '$locationSource' },
          timeRange: {
            $push: '$recordedAt'
          }
        }
      },
      {
        $addFields: {
          uniqueDaysCount: { $size: '$uniqueDays' },
          totalTimeSpan: {
            $subtract: [{ $max: '$timeRange' }, { $min: '$timeRange' }]
          }
        }
      }
    ];

    const summary = await userLocations.aggregate(summaryPipeline).toArray();
    
    return {
      userId: userId,
      analysisTimestamp: new Date(),
      dateRange: { startDate, endDate: new Date() },
      dailyAnalysis: results,
      summary: summary.length > 0 ? summary[0] : null,
      recommendations: this.generateMobilityRecommendations(results, summary[0])
    };
  }

  generateMobilityRecommendations(dailyData, summary) {
    const recommendations = [];
    
    if (!summary || !dailyData.length) {
      recommendations.push({
        type: 'data_quality',
        priority: 'high',
        message: 'Insufficient location data for meaningful analysis'
      });
      return recommendations;
    }

    // Analyze movement patterns
    const highMobilityDays = dailyData.filter(day => day.insights.isHighMobility);
    const localExplorerDays = dailyData.filter(day => day.insights.isLocalExplorer);
    
    if (highMobilityDays.length > dailyData.length * 0.5) {
      recommendations.push({
        type: 'behavioral',
        priority: 'medium',
        message: 'High mobility pattern detected - consider travel optimization features',
        insight: `${highMobilityDays.length} of ${dailyData.length} days showed extensive travel`
      });
    }

    if (localExplorerDays.length > dailyData.length * 0.3) {
      recommendations.push({
        type: 'behavioral',
        priority: 'low',
        message: 'Local exploration pattern - recommend nearby POI discovery features',
        insight: `${localExplorerDays.length} days showed intensive local exploration`
      });
    }

    // Data quality recommendations
    const lowQualityDays = dailyData.filter(day => day.trackingQuality === 'insufficient' || day.trackingQuality === 'basic');
    if (lowQualityDays.length > dailyData.length * 0.3) {
      recommendations.push({
        type: 'data_quality',
        priority: 'medium',
        message: 'Consider improving location tracking frequency or accuracy',
        insight: `${lowQualityDays.length} days had insufficient tracking data`
      });
    }

    return recommendations;
  }

  async performPOIProximityAnalysis(userId, proximityRadius = 500) {
    console.log(`Performing POI proximity analysis for user ${userId} within ${proximityRadius}m...`);
    
    const userLocations = this.spatialCollections.get('userLocations');
    const pointsOfInterest = this.spatialCollections.get('pointsOfInterest');
    
    const proximityPipeline = [
      // Start with user locations
      {
        $match: {
          userId: userId,
          recordedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        }
      },
      
      // Geospatial lookup to find nearby POIs
      {
        $lookup: {
          from: 'pointsOfInterest',
          let: { userLocation: '$coordinates' },
          pipeline: [
            {
              $geoNear: {
                near: '$$userLocation',
                distanceField: 'distance',
                maxDistance: proximityRadius,
                spherical: true
              }
            },
            {
              $project: {
                name: 1,
                category: 1,
                subcategory: 1,
                coordinates: 1,
                rating: 1,
                distance: 1
              }
            }
          ],
          as: 'nearbyPOIs'
        }
      },
      
      // Filter locations that have nearby POIs
      {
        $match: {
          nearbyPOIs: { $ne: [] }
        }
      },
      
      // Unwind to analyze each POI interaction
      { $unwind: '$nearbyPOIs' },
      
      // Calculate visit duration and interaction metrics
      {
        $addFields: {
          proximityCategory: {
            $switch: {
              branches: [
                { case: { $lte: ['$nearbyPOIs.distance', 100] }, then: 'immediate_vicinity' },
                { case: { $lte: ['$nearbyPOIs.distance', 200] }, then: 'very_close' },
                { case: { $lte: ['$nearbyPOIs.distance', proximityRadius] }, then: 'nearby' }
              ],
              default: 'distant'
            }
          }
        }
      },
      
      // Group by POI to analyze visit patterns
      {
        $group: {
          _id: {
            poiId: '$nearbyPOIs._id',
            poiName: '$nearbyPOIs.name',
            poiCategory: '$nearbyPOIs.category',
            poiSubcategory: '$nearbyPOIs.subcategory'
          },
          
          visitCount: { $sum: 1 },
          averageDistance: { $avg: '$nearbyPOIs.distance' },
          minDistance: { $min: '$nearbyPOIs.distance' },
          maxDistance: { $max: '$nearbyPOIs.distance' },
          
          visits: {
            $push: {
              timestamp: '$recordedAt',
              distance: '$nearbyPOIs.distance',
              proximityCategory: '$proximityCategory',
              accuracy: '$accuracy'
            }
          },
          
          firstVisit: { $min: '$recordedAt' },
          lastVisit: { $max: '$recordedAt' },
          
          // Calculate proximity engagement
          closeVisits: {
            $sum: {
              $cond: [
                { $lte: ['$nearbyPOIs.distance', 100] },
                1,
                0
              ]
            }
          }
        }
      },
      
      // Calculate visit duration and patterns
      {
        $addFields: {
          visitDurationMinutes: {
            $divide: [
              { $subtract: ['$lastVisit', '$firstVisit'] },
              60000 // Convert to minutes
            ]
          },
          
          engagementLevel: {
            $switch: {
              branches: [
                { case: { $gte: ['$closeVisits', 5] }, then: 'high' },
                { case: { $gte: ['$closeVisits', 2] }, then: 'medium' }
              ],
              default: 'low'
            }
          },
          
          visitFrequency: {
            $switch: {
              branches: [
                { case: { $gte: ['$visitCount', 10] }, then: 'frequent' },
                { case: { $gte: ['$visitCount', 3] }, then: 'occasional' }
              ],
              default: 'rare'
            }
          }
        }
      },
      
      // Final projection and insights
      {
        $project: {
          poiId: '$_id.poiId',
          poiName: '$_id.poiName',
          category: '$_id.poiCategory',
          subcategory: '$_id.poiSubcategory',
          
          visitMetrics: {
            visitCount: '$visitCount',
            visitFrequency: '$visitFrequency',
            averageDistanceMeters: { $round: ['$averageDistance', 1] },
            minDistanceMeters: { $round: ['$minDistance', 1] },
            closeVisits: '$closeVisits',
            engagementLevel: '$engagementLevel'
          },
          
          timeMetrics: {
            firstVisit: '$firstVisit',
            lastVisit: '$lastVisit',
            visitDurationMinutes: { $round: ['$visitDurationMinutes', 1] }
          },
          
          insights: {
            isRegularDestination: { $gte: ['$visitCount', 5] },
            hasCloseInteraction: { $gte: ['$closeVisits', 1] },
            isLongTermRelationship: {
              $gte: [
                { $divide: [{ $subtract: ['$lastVisit', '$firstVisit'] }, 86400000] }, // Days
                7
              ]
            }
          }
        }
      },
      
      { $sort: { 'visitMetrics.visitCount': -1, 'visitMetrics.averageDistanceMeters': 1 } }
    ];

    const poiAnalysis = await userLocations.aggregate(proximityPipeline).toArray();
    
    // Generate category-level insights
    const categoryPipeline = [
      ...proximityPipeline.slice(0, -2), // Reuse pipeline up to final projection
      {
        $group: {
          _id: '$_id.poiCategory',
          
          totalPOIs: { $sum: 1 },
          totalVisits: { $sum: '$visitCount' },
          averageVisitsPerPOI: { $avg: '$visitCount' },
          
          highEngagementPOIs: {
            $sum: {
              $cond: [{ $eq: ['$engagementLevel', 'high'] }, 1, 0]
            }
          },
          
          categories: { $addToSet: '$_id.poiSubcategory' }
        }
      },
      {
        $project: {
          category: '$_id',
          totalPOIs: 1,
          totalVisits: 1,
          averageVisitsPerPOI: { $round: ['$averageVisitsPerPOI', 2] },
          highEngagementPOIs: 1,
          subcategories: '$categories',
          
          categoryInsight: {
            $switch: {
              branches: [
                { case: { $gte: ['$totalVisits', 50] }, then: 'primary_interest' },
                { case: { $gte: ['$totalVisits', 20] }, then: 'significant_interest' },
                { case: { $gte: ['$totalVisits', 5] }, then: 'moderate_interest' }
              ],
              default: 'limited_interest'
            }
          }
        }
      },
      { $sort: { totalVisits: -1 } }
    ];

    const categoryInsights = await userLocations.aggregate(categoryPipeline).toArray();

    return {
      userId: userId,
      analysisTimestamp: new Date(),
      proximityRadius: proximityRadius,
      poiAnalysis: poiAnalysis,
      categoryInsights: categoryInsights,
      summary: {
        totalPOIsInteracted: poiAnalysis.length,
        totalVisits: poiAnalysis.reduce((sum, poi) => sum + poi.visitMetrics.visitCount, 0),
        topCategories: categoryInsights.slice(0, 5),
        behaviorProfile: this.generatePOIBehaviorProfile(poiAnalysis, categoryInsights)
      }
    };
  }

  generatePOIBehaviorProfile(poiAnalysis, categoryInsights) {
    if (!poiAnalysis.length) {
      return 'insufficient_data';
    }

    const frequentPOIs = poiAnalysis.filter(poi => poi.visitMetrics.visitFrequency === 'frequent');
    const highEngagementPOIs = poiAnalysis.filter(poi => poi.visitMetrics.engagementLevel === 'high');
    const primaryCategories = categoryInsights.filter(cat => cat.categoryInsight === 'primary_interest');

    if (frequentPOIs.length >= 3 && highEngagementPOIs.length >= 2) {
      return 'habitual_visitor';
    } else if (primaryCategories.length >= 2) {
      return 'diverse_explorer';
    } else if (poiAnalysis.length > 10 && frequentPOIs.length === 0) {
      return 'casual_explorer';
    } else if (frequentPOIs.length >= 1) {
      return 'routine_focused';
    } else {
      return 'occasional_visitor';
    }
  }

  async performGeographicRegionAnalysis(regionFilters = {}) {
    console.log('Performing geographic region analysis...');
    
    const userLocations = this.spatialCollections.get('userLocations');
    const geographicRegions = this.spatialCollections.get('geographicRegions');
    
    const regionAnalysisPipeline = [
      // Start with geographic regions
      {
        $match: {
          regionType: regionFilters.regionType || { $exists: true }
        }
      },
      
      // Lookup users within each region
      {
        $lookup: {
          from: 'userLocations',
          let: { regionGeometry: '$geometry' },
          pipeline: [
            {
              $match: {
                recordedAt: { 
                  $gte: regionFilters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Default 30 days
                }
              }
            },
            {
              $match: {
                $expr: {
                  $geoWithin: {
                    $geometry: '$$regionGeometry',
                    $centerSphere: ['$coordinates', 0.01] // Simplified spatial match
                  }
                }
              }
            }
          ],
          as: 'locationVisits'
        }
      },
      
      // Calculate region activity metrics
      {
        $addFields: {
          totalVisits: { $size: '$locationVisits' },
          uniqueUsers: {
            $size: {
              $setUnion: {
                $map: {
                  input: '$locationVisits',
                  as: 'visit',
                  in: '$$visit.userId'
                }
              }
            }
          },
          
          visitsByTimeOfDay: {
            $reduce: {
              input: '$locationVisits',
              initialValue: { morning: 0, afternoon: 0, evening: 0, night: 0 },
              in: {
                morning: {
                  $add: [
                    '$$value.morning',
                    {
                      $cond: [
                        { $and: [
                          { $gte: [{ $hour: '$$this.recordedAt' }, 6] },
                          { $lt: [{ $hour: '$$this.recordedAt' }, 12] }
                        ]},
                        1, 0
                      ]
                    }
                  ]
                },
                afternoon: {
                  $add: [
                    '$$value.afternoon',
                    {
                      $cond: [
                        { $and: [
                          { $gte: [{ $hour: '$$this.recordedAt' }, 12] },
                          { $lt: [{ $hour: '$$this.recordedAt' }, 18] }
                        ]},
                        1, 0
                      ]
                    }
                  ]
                },
                evening: {
                  $add: [
                    '$$value.evening',
                    {
                      $cond: [
                        { $and: [
                          { $gte: [{ $hour: '$$this.recordedAt' }, 18] },
                          { $lt: [{ $hour: '$$this.recordedAt' }, 22] }
                        ]},
                        1, 0
                      ]
                    }
                  ]
                },
                night: {
                  $add: [
                    '$$value.night',
                    {
                      $cond: [
                        { $or: [
                          { $gte: [{ $hour: '$$this.recordedAt' }, 22] },
                          { $lt: [{ $hour: '$$this.recordedAt' }, 6] }
                        ]},
                        1, 0
                      ]
                    }
                  ]
                }
              }
            }
          }
        }
      },
      
      // Calculate activity patterns and insights
      {
        $addFields: {
          averageVisitsPerUser: {
            $cond: {
              if: { $gt: ['$uniqueUsers', 0] },
              then: { $divide: ['$totalVisits', '$uniqueUsers'] },
              else: 0
            }
          },
          
          activityLevel: {
            $switch: {
              branches: [
                { case: { $gte: ['$totalVisits', 1000] }, then: 'very_high' },
                { case: { $gte: ['$totalVisits', 500] }, then: 'high' },
                { case: { $gte: ['$totalVisits', 100] }, then: 'medium' },
                { case: { $gte: ['$totalVisits', 10] }, then: 'low' }
              ],
              default: 'very_low'
            }
          },
          
          primaryTimeOfDay: {
            $let: {
              vars: { times: '$visitsByTimeOfDay' },
              in: {
                $switch: {
                  branches: [
                    { case: { $gte: ['$$times.morning', '$$times.afternoon'] }, then: 'morning' },
                    { case: { $gte: ['$$times.afternoon', '$$times.evening'] }, then: 'afternoon' },
                    { case: { $gte: ['$$times.evening', '$$times.night'] }, then: 'evening' }
                  ],
                  default: 'night'
                }
              }
            }
          }
        }
      },
      
      // Final projection
      {
        $project: {
          regionId: '$_id',
          regionName: '$name',
          regionType: '$regionType',
          
          activityMetrics: {
            totalVisits: '$totalVisits',
            uniqueUsers: '$uniqueUsers',
            averageVisitsPerUser: { $round: ['$averageVisitsPerUser', 2] },
            activityLevel: '$activityLevel',
            primaryTimeOfDay: '$primaryTimeOfDay'
          },
          
          timeDistribution: '$visitsByTimeOfDay',
          
          insights: {
            isPopularDestination: { $gte: ['$totalVisits', 500] },
            hasRegularVisitors: { $gte: ['$averageVisitsPerUser', 3] },
            isDaytimeActive: {
              $gt: [
                { $add: ['$visitsByTimeOfDay.morning', '$visitsByTimeOfDay.afternoon'] },
                { $add: ['$visitsByTimeOfDay.evening', '$visitsByTimeOfDay.night'] }
              ]
            }
          },
          
          regionProperties: '$properties',
          area: '$area',
          population: '$population'
        }
      },
      
      { $sort: { 'activityMetrics.totalVisits': -1 } }
    ];

    const regionAnalysis = await geographicRegions.aggregate(regionAnalysisPipeline).toArray();
    
    return {
      analysisTimestamp: new Date(),
      regionFilters: regionFilters,
      regionAnalysis: regionAnalysis,
      summary: {
        totalRegionsAnalyzed: regionAnalysis.length,
        mostActiveRegion: regionAnalysis.length > 0 ? regionAnalysis[0] : null,
        averageActivityLevel: this.calculateAverageActivityLevel(regionAnalysis)
      }
    };
  }

  calculateAverageActivityLevel(regions) {
    if (!regions.length) return 'no_data';
    
    const activityScores = {
      'very_high': 5,
      'high': 4,
      'medium': 3,
      'low': 2,
      'very_low': 1
    };
    
    const totalScore = regions.reduce((sum, region) => {
      return sum + (activityScores[region.activityMetrics.activityLevel] || 0);
    }, 0);
    
    const averageScore = totalScore / regions.length;
    
    if (averageScore >= 4.5) return 'very_high';
    if (averageScore >= 3.5) return 'high';
    if (averageScore >= 2.5) return 'medium';
    if (averageScore >= 1.5) return 'low';
    return 'very_low';
  }

  async getGeospatialAnalyticsMetrics() {
    console.log('Generating geospatial analytics metrics...');
    
    const collections = [
      { name: 'userLocations', collection: this.spatialCollections.get('userLocations') },
      { name: 'pointsOfInterest', collection: this.spatialCollections.get('pointsOfInterest') },
      { name: 'geographicRegions', collection: this.spatialCollections.get('geographicRegions') }
    ];
    
    const metrics = {
      timestamp: new Date(),
      collections: {},
      geospatialIndexes: {},
      queryPerformance: {},
      dataQuality: {}
    };
    
    for (const { name, collection } of collections) {
      try {
        // Basic collection statistics
        const stats = await this.db.command({ collStats: name });
        
        // Document count and size
        metrics.collections[name] = {
          documentCount: stats.count,
          storageSize: stats.storageSize,
          avgDocumentSize: stats.avgObjSize,
          indexCount: stats.nindexes,
          indexSize: stats.totalIndexSize
        };
        
        // Geospatial-specific metrics
        if (name === 'userLocations') {
          const locationMetrics = await collection.aggregate([
            {
              $group: {
                _id: null,
                totalLocations: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' },
                dateRange: { $push: '$recordedAt' },
                locationSources: { $addToSet: '$locationSource' },
                averageAccuracy: { $avg: '$accuracy' }
              }
            },
            {
              $addFields: {
                uniqueUsersCount: { $size: '$uniqueUsers' },
                timeSpanDays: {
                  $divide: [
                    { $subtract: [{ $max: '$dateRange' }, { $min: '$dateRange' }] },
                    86400000
                  ]
                }
              }
            }
          ]).toArray();
          
          metrics.dataQuality.userLocations = locationMetrics[0] || {};
        }
        
      } catch (error) {
        metrics.collections[name] = { error: error.message };
      }
    }
    
    return metrics;
  }

  async shutdown() {
    console.log('Shutting down MongoDB Geospatial Analytics Manager...');
    
    if (this.client) {
      await this.client.close();
      console.log('✅ MongoDB connection closed');
    }
    
    this.spatialCollections.clear();
    this.geospatialIndexes.clear();
    this.analyticsCache.clear();
  }
}

// Export the geospatial analytics manager
module.exports = { MongoGeospatialAnalyticsManager };

// Benefits of MongoDB Geospatial Analytics:
// - Native 2dsphere indexes provide optimized spatial query performance
// - Aggregation framework enables complex geospatial calculations and analytics
// - Built-in distance calculations and proximity analysis without external libraries
// - Seamless integration of spatial operations with business logic and data transformations
// - Scalable geospatial processing that works across sharded deployments
// - Advanced spatial aggregation patterns for location intelligence applications
// - Real-time geospatial analytics with high-performance spatial indexing
// - Flexible coordinate system support and projection transformations
// - Production-ready spatial analytics with comprehensive monitoring and optimization
// - SQL-compatible geospatial operations through QueryLeaf integration
```

## Understanding MongoDB Geospatial Aggregation Capabilities

### Advanced Spatial Analytics Patterns

Implement sophisticated geospatial analytics with MongoDB's native spatial operators:

```javascript
// Advanced geospatial aggregation patterns for enterprise location intelligence
class LocationIntelligenceProcessor extends MongoGeospatialAnalyticsManager {
  constructor() {
    super();
    this.spatialProcessors = new Map();
    this.heatmapGenerators = new Map();
    this.routeAnalyzers = new Map();
  }

  async generateLocationHeatmaps(parameters = {}) {
    console.log('Generating location density heatmaps...');
    
    const { 
      gridSize = 0.01, // Degrees for grid cells
      minDensity = 5,   // Minimum locations per cell
      dateRange = 30    // Days of data
    } = parameters;
    
    const userLocations = this.spatialCollections.get('userLocations');
    
    const heatmapPipeline = [
      // Filter recent locations
      {
        $match: {
          recordedAt: { 
            $gte: new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000) 
          }
        }
      },
      
      // Create grid-based grouping for heatmap
      {
        $addFields: {
          gridCell: {
            lat: {
              $multiply: [
                { $floor: { $divide: [{ $arrayElemAt: ['$coordinates.coordinates', 1] }, gridSize] } },
                gridSize
              ]
            },
            lng: {
              $multiply: [
                { $floor: { $divide: [{ $arrayElemAt: ['$coordinates.coordinates', 0] }, gridSize] } },
                gridSize
              ]
            }
          }
        }
      },
      
      // Group by grid cells
      {
        $group: {
          _id: {
            lat: '$gridCell.lat',
            lng: '$gridCell.lng'
          },
          
          locationCount: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
          averageAccuracy: { $avg: '$accuracy' },
          
          timeDistribution: {
            $push: {
              $dateToString: { format: '%H', date: '$recordedAt' }
            }
          },
          
          locationSources: { $addToSet: '$locationSource' }
        }
      },
      
      // Filter cells with minimum density
      {
        $match: {
          locationCount: { $gte: minDensity }
        }
      },
      
      // Calculate density metrics
      {
        $addFields: {
          density: '$locationCount',
          uniqueUsersCount: { $size: '$uniqueUsers' },
          
          // Calculate time-based activity patterns
          hourlyActivity: {
            $reduce: {
              input: { $range: [0, 24] },
              initialValue: {},
              in: {
                $mergeObjects: [
                  '$$value',
                  {
                    $let: {
                      vars: { hour: '$$this' },
                      in: {
                        $arrayToObject: [[{
                          k: { $toString: '$$hour' },
                          v: {
                            $size: {
                              $filter: {
                                input: '$timeDistribution',
                                cond: { $eq: ['$$this', { $toString: '$$hour' }] }
                              }
                            }
                          }
                        }]]
                      }
                    }
                  }
                ]
              }
            }
          },
          
          // Density classification
          densityLevel: {
            $switch: {
              branches: [
                { case: { $gte: ['$locationCount', 100] }, then: 'very_high' },
                { case: { $gte: ['$locationCount', 50] }, then: 'high' },
                { case: { $gte: ['$locationCount', 20] }, then: 'medium' }
              ],
              default: 'low'
            }
          }
        }
      },
      
      // Generate heatmap coordinates
      {
        $project: {
          coordinates: {
            lat: '$_id.lat',
            lng: '$_id.lng'
          },
          
          heatmapMetrics: {
            density: '$density',
            uniqueUsers: '$uniqueUsersCount',
            densityLevel: '$densityLevel',
            averageAccuracy: { $round: ['$averageAccuracy', 2] }
          },
          
          temporalPatterns: {
            hourlyActivity: '$hourlyActivity',
            peakHour: {
              $let: {
                vars: { 
                  maxHour: { $max: { $objectToArray: '$hourlyActivity' } } 
                },
                in: '$$maxHour.k'
              }
            }
          },
          
          insights: {
            isHighTrafficArea: { $gte: ['$locationCount', 50] },
            hasRegularActivity: { $gte: ['$uniqueUsersCount', 5] },
            isDataRich: { $gte: ['$averageAccuracy', 50] }
          }
        }
      },
      
      { $sort: { 'heatmapMetrics.density': -1 } }
    ];
    
    const heatmapData = await userLocations.aggregate(heatmapPipeline).toArray();
    
    return {
      generatedAt: new Date(),
      parameters: { gridSize, minDensity, dateRange },
      heatmapData: heatmapData,
      summary: {
        totalHotspots: heatmapData.length,
        highestDensity: heatmapData.length > 0 ? heatmapData[0].heatmapMetrics.density : 0,
        averageDensity: heatmapData.length > 0 ? 
          Math.round(heatmapData.reduce((sum, cell) => sum + cell.heatmapMetrics.density, 0) / heatmapData.length) : 0
      }
    };
  }

  async performRouteAnalysis(userId, analysisType = 'daily') {
    console.log(`Performing ${analysisType} route analysis for user ${userId}...`);
    
    const userLocations = this.spatialCollections.get('userLocations');
    
    const routeAnalysisPipeline = [
      // Match user locations
      { $match: { userId: userId } },
      { $sort: { recordedAt: 1 } },
      
      // Group by analysis period (daily, weekly, etc.)
      {
        $group: {
          _id: {
            period: {
              $dateToString: { 
                format: analysisType === 'daily' ? '%Y-%m-%d' : '%Y-%W',
                date: '$recordedAt' 
              }
            }
          },
          
          locations: {
            $push: {
              coordinates: '$coordinates',
              timestamp: '$recordedAt',
              accuracy: '$accuracy'
            }
          },
          
          startTime: { $first: '$recordedAt' },
          endTime: { $last: '$recordedAt' }
        }
      },
      
      // Calculate route metrics
      {
        $addFields: {
          routeMetrics: {
            $let: {
              vars: {
                locationCount: { $size: '$locations' }
              },
              in: {
                totalPoints: '$$locationCount',
                timeSpanHours: {
                  $divide: [
                    { $subtract: ['$endTime', '$startTime'] },
                    3600000 // Convert to hours
                  ]
                },
                
                // Simplified route distance calculation
                estimatedDistance: {
                  $reduce: {
                    input: { $range: [1, '$$locationCount'] },
                    initialValue: 0,
                    in: {
                      $add: [
                        '$$value',
                        {
                          $let: {
                            vars: {
                              current: { $arrayElemAt: ['$locations', '$$this'] },
                              previous: { $arrayElemAt: ['$locations', { $subtract: ['$$this', 1] }] }
                            },
                            in: {
                              // Simplified distance using coordinate differences
                              $sqrt: {
                                $add: [
                                  {
                                    $pow: [
                                      {
                                        $multiply: [
                                          { $subtract: [
                                            { $arrayElemAt: ['$$current.coordinates.coordinates', 0] },
                                            { $arrayElemAt: ['$$previous.coordinates.coordinates', 0] }
                                          ] },
                                          111320 // Approximate meters per degree
                                        ]
                                      },
                                      2
                                    ]
                                  },
                                  {
                                    $pow: [
                                      {
                                        $multiply: [
                                          { $subtract: [
                                            { $arrayElemAt: ['$$current.coordinates.coordinates', 1] },
                                            { $arrayElemAt: ['$$previous.coordinates.coordinates', 1] }
                                          ] },
                                          110540
                                        ]
                                      },
                                      2
                                    ]
                                  }
                                ]
                              }
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      
      // Calculate route insights
      {
        $addFields: {
          routeInsights: {
            distanceKm: { $divide: ['$routeMetrics.estimatedDistance', 1000] },
            averageSpeed: {
              $cond: {
                if: { $gt: ['$routeMetrics.timeSpanHours', 0] },
                then: {
                  $divide: [
                    { $divide: ['$routeMetrics.estimatedDistance', 1000] },
                    '$routeMetrics.timeSpanHours'
                  ]
                },
                else: 0
              }
            },
            
            routeComplexity: {
              $switch: {
                branches: [
                  { case: { $gte: ['$routeMetrics.totalPoints', 100] }, then: 'complex' },
                  { case: { $gte: ['$routeMetrics.totalPoints', 50] }, then: 'moderate' }
                ],
                default: 'simple'
              }
            },
            
            mobilityType: {
              $let: {
                vars: { avgSpeed: '$averageSpeed' },
                in: {
                  $switch: {
                    branches: [
                      { case: { $lte: ['$$avgSpeed', 5] }, then: 'walking' },
                      { case: { $lte: ['$$avgSpeed', 25] }, then: 'cycling' },
                      { case: { $lte: ['$$avgSpeed', 60] }, then: 'driving' }
                    ],
                    default: 'high_speed_transport'
                  }
                }
              }
            }
          }
        }
      },
      
      {
        $project: {
          period: '$_id.period',
          startTime: 1,
          endTime: 1,
          
          route: {
            totalPoints: '$routeMetrics.totalPoints',
            distanceKm: { $round: ['$routeInsights.distanceKm', 2] },
            timeSpanHours: { $round: ['$routeMetrics.timeSpanHours', 2] },
            averageSpeedKmh: { $round: ['$routeInsights.averageSpeed', 2] }
          },
          
          classification: {
            routeComplexity: '$routeInsights.routeComplexity',
            mobilityType: '$routeInsights.mobilityType'
          },
          
          insights: {
            isLongDistance: { $gte: ['$routeInsights.distanceKm', 10] },
            isHighSpeed: { $gte: ['$routeInsights.averageSpeed', 30] },
            hasExtendedActivity: { $gte: ['$routeMetrics.timeSpanHours', 4] }
          }
        }
      },
      
      { $sort: { startTime: -1 } }
    ];
    
    const routeAnalysis = await userLocations.aggregate(routeAnalysisPipeline).toArray();
    
    return {
      userId: userId,
      analysisType: analysisType,
      analysisTimestamp: new Date(),
      routes: routeAnalysis,
      summary: this.generateRouteSummary(routeAnalysis)
    };
  }

  generateRouteSummary(routes) {
    if (!routes.length) {
      return { message: 'No routes found for analysis period' };
    }
    
    const totalDistance = routes.reduce((sum, route) => sum + route.route.distanceKm, 0);
    const mobilityTypes = routes.map(route => route.classification.mobilityType);
    const mostCommonMobility = this.findMostCommon(mobilityTypes);
    
    return {
      totalRoutes: routes.length,
      totalDistanceKm: Math.round(totalDistance * 100) / 100,
      averageRouteDistance: Math.round((totalDistance / routes.length) * 100) / 100,
      primaryMobilityType: mostCommonMobility,
      longDistanceRoutes: routes.filter(r => r.insights.isLongDistance).length,
      highSpeedRoutes: routes.filter(r => r.insights.isHighSpeed).length
    };
  }

  findMostCommon(array) {
    return array.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
  }
}

// Export the enhanced location intelligence processor
module.exports = { LocationIntelligenceProcessor };
```

## SQL-Style Geospatial Analytics with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB geospatial analytics and spatial operations:

```sql
-- QueryLeaf geospatial analytics with SQL-familiar patterns

-- Create location tracking collection with geospatial indexes
CREATE COLLECTION user_locations (
  user_id OBJECTID NOT NULL,
  device_id VARCHAR(100),
  
  -- GeoJSON point coordinates
  coordinates GEOMETRY(POINT) NOT NULL,
  accuracy_meters DECIMAL(8,2),
  altitude_meters DECIMAL(8,2),
  
  -- Address information
  address JSON,
  
  -- Location metadata
  location_source ENUM('gps', 'network', 'passive', 'manual'),
  location_method ENUM('checkin', 'automatic', 'manual', 'passive'),
  
  -- Timestamps
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create geospatial indexes for optimal query performance
CREATE INDEX idx_user_locations_geo ON user_locations (coordinates) 
WITH (index_type = '2dsphere');

CREATE INDEX idx_user_locations_user_time ON user_locations (user_id, recorded_at);

-- Points of interest collection with spatial data
CREATE COLLECTION points_of_interest (
  poi_name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  
  coordinates GEOMETRY(POINT) NOT NULL,
  
  -- POI details
  description TEXT,
  business_hours JSON,
  amenities ARRAY<STRING>,
  rating_average DECIMAL(3,2),
  review_count INTEGER DEFAULT 0,
  
  -- Address
  address JSON,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_poi_geo ON points_of_interest (coordinates) 
WITH (index_type = '2dsphere');

CREATE INDEX idx_poi_category ON points_of_interest (category, subcategory);

-- Advanced geospatial analytics with proximity analysis
WITH user_mobility_analysis AS (
  SELECT 
    user_id,
    DATE(recorded_at) as tracking_date,
    
    -- Calculate daily movement patterns using geospatial functions
    COUNT(*) as location_points,
    MIN(recorded_at) as first_location,
    MAX(recorded_at) as last_location,
    
    -- Geographic bounds calculation
    ST_X(ST_ENVELOPE(ST_COLLECT(coordinates))) as min_longitude,
    ST_Y(ST_ENVELOPE(ST_COLLECT(coordinates))) as min_latitude,
    ST_X(ST_ENVELOPE(ST_COLLECT(coordinates))) as max_longitude,
    ST_Y(ST_ENVELOPE(ST_COLLECT(coordinates))) as max_latitude,
    
    -- Distance calculations using geospatial aggregation
    SUM(
      ST_DISTANCE(
        coordinates,
        LAG(coordinates) OVER (
          PARTITION BY user_id, DATE(recorded_at)
          ORDER BY recorded_at
        )
      )
    ) as total_distance_meters,
    
    -- Create daily path geometry
    ST_MAKELINE(coordinates ORDER BY recorded_at) as daily_path,
    
    -- Average location accuracy
    AVG(accuracy_meters) as avg_accuracy
    
  FROM user_locations
  WHERE recorded_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY user_id, DATE(recorded_at)
  HAVING COUNT(*) >= 5  -- Only days with sufficient tracking data
),

poi_proximity_analysis AS (
  -- Analyze user proximity to points of interest using spatial operations
  SELECT 
    ul.user_id,
    ul.recorded_at,
    poi.poi_name,
    poi.category,
    poi.subcategory,
    
    -- Distance calculation using native geospatial functions
    ST_DISTANCE(ul.coordinates, poi.coordinates) as distance_meters,
    
    -- Proximity categorization using geospatial predicates
    CASE 
      WHEN ST_DWITHIN(ul.coordinates, poi.coordinates, 100) THEN 'immediate_vicinity'
      WHEN ST_DWITHIN(ul.coordinates, poi.coordinates, 500) THEN 'nearby'
      WHEN ST_DWITHIN(ul.coordinates, poi.coordinates, 1000) THEN 'walking_distance'
      ELSE 'distant'
    END as proximity_category,
    
    -- Calculate time spent near POI using window functions
    CASE 
      WHEN ST_DWITHIN(ul.coordinates, poi.coordinates, 200) THEN
        EXTRACT(EPOCH FROM (
          LEAD(ul.recorded_at) OVER (
            PARTITION BY ul.user_id 
            ORDER BY ul.recorded_at
          ) - ul.recorded_at
        )) / 60.0  -- Convert to minutes
      ELSE 0
    END as time_spent_minutes
    
  FROM user_locations ul
  -- Use spatial join for efficient proximity queries
  INNER JOIN points_of_interest poi ON ST_DWITHIN(ul.coordinates, poi.coordinates, 5000)
  WHERE ul.recorded_at >= CURRENT_DATE - INTERVAL '7 days'
),

geospatial_insights AS (
  -- Generate comprehensive location-based insights
  SELECT 
    uma.user_id,
    uma.tracking_date,
    
    -- Movement analysis
    uma.total_distance_meters,
    ROUND(uma.total_distance_meters / 1000.0, 2) as total_distance_km,
    
    -- Calculate movement velocity
    CASE 
      WHEN EXTRACT(EPOCH FROM (uma.last_location - uma.first_location)) > 0 THEN
        ROUND(
          uma.total_distance_meters / 
          EXTRACT(EPOCH FROM (uma.last_location - uma.first_location)) * 3.6,
          2
        )
      ELSE 0
    END as average_speed_kmh,
    
    -- Geographic coverage analysis using spatial functions
    ST_AREA(
      ST_MAKEENVELOPE(
        uma.min_longitude, uma.min_latitude,
        uma.max_longitude, uma.max_latitude
      )
    ) / 1000000.0 as coverage_area_km2,  -- Convert to square kilometers
    
    uma.location_points,
    uma.avg_accuracy,
    
    -- POI interaction aggregations
    (
      SELECT COUNT(DISTINCT poi_name)
      FROM poi_proximity_analysis ppa
      WHERE ppa.user_id = uma.user_id
        AND DATE(ppa.recorded_at) = uma.tracking_date
        AND ppa.proximity_category IN ('immediate_vicinity', 'nearby')
    ) as unique_pois_visited,
    
    (
      SELECT SUM(time_spent_minutes)
      FROM poi_proximity_analysis ppa
      WHERE ppa.user_id = uma.user_id
        AND DATE(ppa.recorded_at) = uma.tracking_date
        AND ppa.time_spent_minutes > 0
    ) as total_poi_time_minutes,
    
    -- Most frequent POI categories using spatial aggregation
    (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'category', category,
          'visit_count', visit_count
        ) ORDER BY visit_count DESC
      )
      FROM (
        SELECT category, COUNT(*) as visit_count
        FROM poi_proximity_analysis ppa
        WHERE ppa.user_id = uma.user_id
          AND DATE(ppa.recorded_at) = uma.tracking_date
          AND ppa.proximity_category = 'immediate_vicinity'
        GROUP BY category
        ORDER BY visit_count DESC
        LIMIT 3
      ) top_categories
    ) as top_poi_categories,
    
    -- Mobility pattern classification
    CASE 
      WHEN uma.total_distance_meters < 1000 THEN 'stationary'
      WHEN uma.total_distance_meters < 5000 THEN 'local_movement'
      WHEN uma.total_distance_meters < 20000 THEN 'moderate_travel'
      ELSE 'extensive_travel'
    END as mobility_pattern,
    
    -- Route complexity analysis
    CASE 
      WHEN uma.location_points > 100 THEN 'complex_route'
      WHEN uma.location_points > 50 THEN 'moderate_route'
      ELSE 'simple_route'
    END as route_complexity
    
  FROM user_mobility_analysis uma
)

SELECT 
  gi.user_id,
  gi.tracking_date,
  gi.total_distance_km,
  gi.average_speed_kmh,
  ROUND(gi.coverage_area_km2, 4) as coverage_area_km2,
  gi.location_points,
  gi.unique_pois_visited,
  ROUND(gi.total_poi_time_minutes, 1) as total_poi_time_minutes,
  gi.top_poi_categories,
  gi.mobility_pattern,
  gi.route_complexity,
  
  -- User behavior profiling using geospatial insights
  CASE 
    WHEN gi.unique_pois_visited > 5 AND gi.total_distance_km > 10 THEN 'high_mobility_explorer'
    WHEN gi.unique_pois_visited > 3 AND gi.total_distance_km < 5 THEN 'local_explorer'
    WHEN gi.total_distance_km > 20 THEN 'long_distance_traveler'
    WHEN gi.total_poi_time_minutes > 60 THEN 'poi_focused_user'
    ELSE 'standard_user'
  END as user_behavior_profile,
  
  -- Transportation mode inference
  CASE 
    WHEN gi.average_speed_kmh <= 6 THEN 'walking'
    WHEN gi.average_speed_kmh <= 25 THEN 'cycling'
    WHEN gi.average_speed_kmh <= 60 THEN 'driving'
    ELSE 'high_speed_transport'
  END as inferred_transport_mode,
  
  -- Temporal patterns
  EXTRACT(DOW FROM gi.tracking_date) as day_of_week,
  CASE 
    WHEN EXTRACT(DOW FROM gi.tracking_date) IN (0, 6) THEN 'weekend'
    ELSE 'weekday'
  END as day_type,
  
  -- Data quality assessment
  CASE 
    WHEN gi.location_points < 10 THEN 'insufficient_data'
    WHEN gi.location_points < 50 THEN 'moderate_tracking'
    ELSE 'comprehensive_tracking'
  END as tracking_quality,
  
  ROUND(gi.avg_accuracy, 1) as average_accuracy_meters

FROM geospatial_insights gi
ORDER BY gi.user_id, gi.tracking_date DESC;

-- Location density heatmap generation using spatial aggregation
WITH location_density_grid AS (
  SELECT 
    -- Create spatial grid for heatmap visualization
    FLOOR(ST_X(coordinates) / 0.01) * 0.01 as grid_lng,
    FLOOR(ST_Y(coordinates) / 0.01) * 0.01 as grid_lat,
    
    COUNT(*) as location_count,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(accuracy_meters) as avg_accuracy,
    
    -- Time-based activity patterns
    COUNT(*) FILTER (
      WHERE EXTRACT(HOUR FROM recorded_at) BETWEEN 6 AND 11
    ) as morning_activity,
    
    COUNT(*) FILTER (
      WHERE EXTRACT(HOUR FROM recorded_at) BETWEEN 12 AND 17
    ) as afternoon_activity,
    
    COUNT(*) FILTER (
      WHERE EXTRACT(HOUR FROM recorded_at) BETWEEN 18 AND 21
    ) as evening_activity,
    
    COUNT(*) FILTER (
      WHERE EXTRACT(HOUR FROM recorded_at) BETWEEN 22 AND 5
    ) as night_activity,
    
    -- Location source analysis
    JSON_OBJECTAGG(
      location_source, 
      COUNT(*)
    ) as source_distribution
    
  FROM user_locations
  WHERE recorded_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  GROUP BY 
    FLOOR(ST_X(coordinates) / 0.01) * 0.01,
    FLOOR(ST_Y(coordinates) / 0.01) * 0.01
  HAVING COUNT(*) >= 5  -- Minimum density threshold
),

heatmap_analysis AS (
  SELECT 
    grid_lng,
    grid_lat,
    
    -- Create heatmap center point
    ST_POINT(grid_lng + 0.005, grid_lat + 0.005) as cell_center,
    
    location_count,
    unique_users,
    ROUND(avg_accuracy, 1) as avg_accuracy,
    
    -- Activity distribution
    morning_activity,
    afternoon_activity, 
    evening_activity,
    night_activity,
    
    -- Calculate peak activity time
    CASE 
      WHEN morning_activity >= GREATEST(afternoon_activity, evening_activity, night_activity) 
        THEN 'morning'
      WHEN afternoon_activity >= GREATEST(evening_activity, night_activity) 
        THEN 'afternoon'
      WHEN evening_activity >= night_activity 
        THEN 'evening'
      ELSE 'night'
    END as peak_activity_period,
    
    -- Density classification for visualization
    CASE 
      WHEN location_count >= 100 THEN 'very_high'
      WHEN location_count >= 50 THEN 'high'
      WHEN location_count >= 20 THEN 'medium'
      ELSE 'low'
    END as density_level,
    
    source_distribution,
    
    -- Calculate density score for heatmap intensity
    LOG(location_count) * LOG(unique_users + 1) as heatmap_intensity
    
  FROM location_density_grid
  ORDER BY location_count DESC
)

SELECT 
  -- Heatmap coordinates
  ST_X(cell_center) as center_longitude,
  ST_Y(cell_center) as center_latitude,
  
  -- Density metrics for visualization
  location_count as total_locations,
  unique_users,
  density_level,
  ROUND(heatmap_intensity, 2) as intensity_score,
  
  -- Temporal activity patterns
  JSON_OBJECT(
    'morning', morning_activity,
    'afternoon', afternoon_activity,
    'evening', evening_activity,
    'night', night_activity,
    'peak_period', peak_activity_period
  ) as activity_patterns,
  
  -- Data quality indicators
  avg_accuracy,
  source_distribution,
  
  -- Insights for location intelligence
  CASE 
    WHEN unique_users > location_count * 0.8 THEN 'transient_area'
    WHEN unique_users < location_count * 0.2 THEN 'regular_destination'
    ELSE 'mixed_usage'
  END as area_usage_pattern,
  
  CASE 
    WHEN peak_activity_period IN ('morning', 'evening') THEN 'commuter_zone'
    WHEN peak_activity_period = 'afternoon' THEN 'business_district'
    WHEN peak_activity_period = 'night' THEN 'entertainment_area'
    ELSE 'residential_area'
  END as inferred_area_type

FROM heatmap_analysis
WHERE density_level IN ('medium', 'high', 'very_high')
ORDER BY intensity_score DESC;

-- Geographic region analysis with spatial joins
CREATE COLLECTION geographic_regions (
  region_name VARCHAR(200) NOT NULL,
  region_type ENUM('city', 'district', 'neighborhood', 'zone'),
  geometry GEOMETRY(POLYGON) NOT NULL,
  properties JSON,
  population INTEGER,
  area_km2 DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_geographic_regions_geo ON geographic_regions (geometry) 
WITH (index_type = '2dsphere');

-- Analyze user activity within geographic regions
WITH regional_activity_analysis AS (
  SELECT 
    gr.region_name,
    gr.region_type,
    gr.population,
    gr.area_km2,
    
    -- Count location visits within each region using spatial containment
    COUNT(ul.user_id) as total_visits,
    COUNT(DISTINCT ul.user_id) as unique_visitors,
    
    -- Calculate visit density
    ROUND(
      COUNT(ul.user_id)::DECIMAL / NULLIF(gr.area_km2, 0),
      2
    ) as visits_per_km2,
    
    -- Time-based visit patterns
    COUNT(*) FILTER (
      WHERE EXTRACT(DOW FROM ul.recorded_at) IN (0, 6)
    ) as weekend_visits,
    
    COUNT(*) FILTER (
      WHERE EXTRACT(DOW FROM ul.recorded_at) BETWEEN 1 AND 5
    ) as weekday_visits,
    
    -- Peak activity times within regions
    MODE() WITHIN GROUP (
      ORDER BY EXTRACT(HOUR FROM ul.recorded_at)
    ) as peak_hour,
    
    -- Average visit duration (simplified calculation)
    AVG(
      EXTRACT(EPOCH FROM (
        LEAD(ul.recorded_at) OVER (
          PARTITION BY ul.user_id, gr.region_name
          ORDER BY ul.recorded_at
        ) - ul.recorded_at
      )) / 60.0
    ) as avg_visit_duration_minutes,
    
    -- First and last visits
    MIN(ul.recorded_at) as first_visit,
    MAX(ul.recorded_at) as last_visit
    
  FROM geographic_regions gr
  -- Spatial join to find locations within regions
  LEFT JOIN user_locations ul ON ST_CONTAINS(gr.geometry, ul.coordinates)
  WHERE ul.recorded_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  GROUP BY gr.region_name, gr.region_type, gr.population, gr.area_km2
),

region_insights AS (
  SELECT 
    region_name,
    region_type,
    population,
    area_km2,
    total_visits,
    unique_visitors,
    visits_per_km2,
    weekend_visits,
    weekday_visits,
    peak_hour,
    ROUND(avg_visit_duration_minutes, 2) as avg_visit_duration_minutes,
    first_visit,
    last_visit,
    
    -- Calculate regional activity metrics
    ROUND(
      total_visits::DECIMAL / NULLIF(unique_visitors, 0),
      2
    ) as avg_visits_per_user,
    
    ROUND(
      weekend_visits::DECIMAL / NULLIF(total_visits, 0) * 100,
      1
    ) as weekend_activity_percent,
    
    -- Population-adjusted activity
    CASE 
      WHEN population > 0 THEN 
        ROUND(unique_visitors::DECIMAL / population * 100, 2)
      ELSE NULL
    END as visitor_penetration_percent,
    
    -- Activity level classification
    CASE 
      WHEN total_visits >= 1000 THEN 'very_high'
      WHEN total_visits >= 500 THEN 'high'
      WHEN total_visits >= 100 THEN 'medium'
      WHEN total_visits >= 10 THEN 'low'
      ELSE 'very_low'
    END as activity_level,
    
    -- Regional characteristics inference
    CASE 
      WHEN weekend_visits > weekday_visits * 1.2 THEN 'leisure_destination'
      WHEN weekday_visits > weekend_visits * 1.5 THEN 'business_district'
      WHEN peak_hour BETWEEN 7 AND 9 OR peak_hour BETWEEN 17 AND 19 THEN 'commuter_area'
      ELSE 'mixed_use'
    END as inferred_usage_type
    
  FROM regional_activity_analysis
  WHERE total_visits > 0
)

SELECT 
  region_name,
  region_type,
  activity_level,
  inferred_usage_type,
  
  -- Core metrics
  total_visits,
  unique_visitors,
  avg_visits_per_user,
  visits_per_km2,
  
  -- Temporal patterns
  weekend_activity_percent,
  CONCAT(peak_hour, ':00') as peak_hour,
  avg_visit_duration_minutes,
  
  -- Geographic and demographic insights
  area_km2,
  population,
  visitor_penetration_percent,
  
  -- Activity insights
  CASE 
    WHEN visits_per_km2 > 100 THEN 'high_density_destination'
    WHEN visitor_penetration_percent > 10 THEN 'popular_local_area'
    WHEN avg_visit_duration_minutes > 60 THEN 'extended_stay_location'
    ELSE 'standard_activity_area'
  END as location_characteristic,
  
  -- Planning and optimization insights
  CASE 
    WHEN activity_level = 'very_high' AND inferred_usage_type = 'business_district' 
      THEN 'Consider infrastructure optimization'
    WHEN activity_level IN ('low', 'very_low') AND region_type = 'commercial'
      THEN 'Potential for development or marketing focus'
    WHEN weekend_activity_percent > 70 AND inferred_usage_type = 'leisure_destination'
      THEN 'Tourism and recreation optimization opportunity'
    ELSE 'Monitor for changes in activity patterns'
  END as planning_recommendation

FROM region_insights
ORDER BY total_visits DESC, visits_per_km2 DESC;

-- QueryLeaf provides comprehensive geospatial analytics capabilities:
-- 1. Native MongoDB 2dsphere indexing with SQL-familiar syntax
-- 2. Advanced spatial queries using ST_ geospatial functions
-- 3. Location-based proximity analysis with distance calculations
-- 4. Geographic aggregation and density heatmap generation
-- 5. Route analysis and mobility pattern detection
-- 6. Regional activity analysis with spatial joins
-- 7. Real-time location intelligence with temporal pattern analysis
-- 8. Integration with MongoDB's native geospatial capabilities
-- 9. Production-ready spatial analytics with performance optimization
-- 10. Enterprise-grade location-based insights accessible through familiar SQL patterns
```

## Best Practices for MongoDB Geospatial Analytics Implementation

### Spatial Index Optimization Strategies

Essential practices for maximizing geospatial query performance:

1. **2dsphere Index Creation**: Use 2dsphere indexes for all location-based queries and proximity analysis
2. **Compound Spatial Indexes**: Combine geospatial indexes with other frequently queried fields
3. **Query Pattern Analysis**: Design indexes to match common spatial query patterns and proximity searches
4. **Coordinate System Consistency**: Ensure consistent coordinate reference systems across all spatial data
5. **Distance Calculation Optimization**: Use appropriate distance calculations based on accuracy requirements
6. **Spatial Data Validation**: Implement comprehensive validation for coordinate data quality and accuracy

### Production Deployment Considerations

Key factors for enterprise geospatial analytics deployments:

1. **Real-time Processing**: Design aggregation pipelines for real-time location intelligence and stream processing
2. **Scalability Planning**: Implement sharding strategies that work effectively with geospatial data distribution
3. **Privacy and Security**: Ensure location data privacy compliance and implement appropriate access controls
4. **Data Quality Management**: Monitor and maintain high-quality location data with accuracy tracking
5. **Performance Monitoring**: Track spatial query performance and optimize based on usage patterns
6. **Integration Architecture**: Design seamless integration with mapping services and location-based applications

## Conclusion

MongoDB's Aggregation Framework provides comprehensive geospatial analytics capabilities that enable sophisticated location intelligence applications through native spatial operators, advanced proximity analysis, and high-performance spatial indexing. The combination of 2dsphere indexes, spatial aggregation operators, and flexible coordinate system support delivers enterprise-grade geospatial processing without the complexity of traditional GIS systems.

Key MongoDB geospatial analytics benefits include:

- **Native Spatial Processing**: Built-in 2dsphere indexes and spatial operators provide optimized geospatial query performance
- **Advanced Location Intelligence**: Sophisticated proximity analysis, route tracking, and mobility pattern detection
- **Real-time Spatial Analytics**: High-performance aggregation pipelines for streaming location data processing
- **Flexible Coordinate Support**: Comprehensive support for different coordinate systems and projection transformations
- **Scalable Spatial Operations**: Distributed geospatial processing that scales across sharded MongoDB deployments
- **SQL Compatibility**: Familiar spatial operations accessible through SQL-style syntax and functions

Whether you're building location-based services, analyzing user mobility patterns, or implementing proximity marketing applications, MongoDB's geospatial capabilities with QueryLeaf's SQL-familiar interface provide the foundation for scalable location intelligence that maintains high performance while simplifying spatial analytics development.

> **QueryLeaf Integration**: QueryLeaf automatically optimizes MongoDB geospatial operations while providing SQL-familiar syntax for spatial queries, proximity analysis, and location-based aggregations. Advanced geospatial analytics patterns, heatmap generation, and route analysis are seamlessly accessible through familiar SQL constructs, making sophisticated location intelligence both powerful and approachable for SQL-oriented teams.

The combination of MongoDB's robust geospatial capabilities with familiar SQL-style management makes it an ideal platform for applications that require both advanced spatial analytics and operational simplicity, ensuring your location-based applications can scale efficiently while maintaining familiar development and operational patterns.