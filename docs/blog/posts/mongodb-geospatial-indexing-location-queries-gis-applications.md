---
title: "MongoDB Geospatial Indexing and Location-Based Queries: Building High-Performance GIS Applications with Advanced Spatial Analysis and SQL-Compatible Operations"
description: "Master MongoDB geospatial indexing for location-based applications. Learn spatial query patterns, proximity search, geofencing, route optimization, and advanced GIS operations with SQL-familiar syntax for modern mapping and location services."
date: 2025-01-03
tags: [mongodb, geospatial, gis, location, indexing, spatial-queries, mapping, sql]
---

# MongoDB Geospatial Indexing and Location-Based Queries: Building High-Performance GIS Applications with Advanced Spatial Analysis and SQL-Compatible Operations

Modern location-aware applications require sophisticated geospatial data management capabilities to deliver real-time proximity searches, route optimization, geofencing, and spatial analytics at massive scale. Traditional relational databases struggle with the complex geometric calculations, multi-dimensional indexing requirements, and performance demands of location-based services, often requiring expensive third-party GIS extensions or external spatial processing systems.

MongoDB provides native geospatial indexing and query capabilities that enable applications to efficiently store, index, and query location data using industry-standard GeoJSON formats. Unlike traditional database approaches that require complex extensions or specialized spatial databases, MongoDB's built-in geospatial features deliver high-performance spatial operations, intelligent indexing strategies, and comprehensive query capabilities designed for modern mapping, logistics, and location-aware applications.

## Traditional Geospatial Data Challenges

Managing location data with conventional database approaches creates significant performance, complexity, and scalability challenges:

```sql
-- Traditional PostgreSQL geospatial implementation (complex setup and limited performance)

-- Requires PostGIS extension for spatial capabilities
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Location-based application schema with complex spatial types
CREATE TABLE business_locations (
    business_id BIGSERIAL PRIMARY KEY,
    business_name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    
    -- Complex spatial column requiring PostGIS
    location GEOMETRY(POINT, 4326) NOT NULL, -- WGS84 coordinate system
    service_area GEOMETRY(POLYGON, 4326),    -- Service boundary polygon
    
    -- Business metadata
    phone VARCHAR(20),
    email VARCHAR(100),
    website VARCHAR(200),
    operating_hours JSONB,
    rating NUMERIC(3,2),
    price_level INTEGER CHECK (price_level BETWEEN 1 AND 4),
    
    -- Operational data
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spatial indexes (PostGIS-specific syntax)
CREATE INDEX idx_business_location_gist ON business_locations 
    USING GIST (location);
CREATE INDEX idx_business_service_area_gist ON business_locations 
    USING GIST (service_area);

-- Customer location tracking table
CREATE TABLE customer_locations (
    location_id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    location_accuracy_meters NUMERIC(8,2),
    location_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Location context
    location_type VARCHAR(20) DEFAULT 'gps', -- 'gps', 'network', 'manual'
    address_geocoded TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    country VARCHAR(50),
    postal_code VARCHAR(20)
);

CREATE INDEX idx_customer_location_gist ON customer_locations 
    USING GIST (location);
CREATE INDEX idx_customer_location_timestamp ON customer_locations 
    (customer_id, location_timestamp DESC);

-- Delivery routes and logistics
CREATE TABLE delivery_routes (
    route_id BIGSERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL,
    vehicle_id INTEGER NOT NULL,
    route_date DATE NOT NULL,
    
    -- Route geometry as LineString
    route_path GEOMETRY(LINESTRING, 4326),
    planned_stops GEOMETRY(MULTIPOINT, 4326),
    
    -- Route metrics
    estimated_distance_km NUMERIC(10,3),
    estimated_duration_minutes INTEGER,
    actual_distance_km NUMERIC(10,3),
    actual_duration_minutes INTEGER,
    
    -- Route status
    status VARCHAR(20) DEFAULT 'planned', -- 'planned', 'in_progress', 'completed', 'cancelled'
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_delivery_route_path_gist ON delivery_routes 
    USING GIST (route_path);

-- Complex proximity search with PostGIS functions
WITH nearby_businesses AS (
    SELECT 
        bl.business_id,
        bl.business_name,
        bl.category,
        bl.address,
        bl.rating,
        bl.price_level,
        
        -- Spatial calculations using PostGIS functions
        ST_Distance(
            bl.location::geography, 
            ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography
        ) as distance_meters,
        
        -- Convert geometry to GeoJSON for application consumption
        ST_AsGeoJSON(bl.location) as location_geojson,
        
        -- Additional spatial analysis
        ST_Within(
            ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
            bl.service_area
        ) as within_service_area,
        
        -- Bearing calculation
        ST_Azimuth(
            bl.location,
            ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)
        ) * 180 / PI() as bearing_degrees
        
    FROM business_locations bl
    WHERE 
        bl.is_active = true
        
        -- Spatial filter using bounding box for initial filtering
        AND ST_DWithin(
            bl.location::geography,
            ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
            5000  -- 5km radius
        )
),

ranked_results AS (
    SELECT 
        nb.*,
        
        -- Complex scoring algorithm
        (
            -- Distance component (closer is better)
            (1.0 - (distance_meters / 5000.0)) * 0.4 +
            
            -- Rating component
            (COALESCE(rating, 0) / 5.0) * 0.3 +
            
            -- Service area bonus
            CASE WHEN within_service_area THEN 0.2 ELSE 0 END +
            
            -- Category relevance (hardcoded for example)
            CASE 
                WHEN category = 'restaurant' THEN 0.1
                WHEN category = 'retail' THEN 0.05
                ELSE 0
            END
        ) as relevance_score,
        
        -- Categorize distance for user display
        CASE 
            WHEN distance_meters <= 500 THEN 'Very Close'
            WHEN distance_meters <= 1000 THEN 'Walking Distance'
            WHEN distance_meters <= 2000 THEN 'Short Drive'
            ELSE 'Moderate Distance'
        END as distance_category
        
    FROM nearby_businesses nb
)

SELECT 
    business_id,
    business_name,
    category,
    address,
    ROUND(distance_meters::numeric, 0) as distance_meters,
    distance_category,
    rating,
    price_level,
    ROUND(relevance_score::numeric, 3) as relevance_score,
    ROUND(bearing_degrees::numeric, 1) as bearing_from_user,
    within_service_area,
    location_geojson

FROM ranked_results
WHERE distance_meters <= 5000  -- 5km maximum distance
ORDER BY relevance_score DESC, distance_meters ASC
LIMIT 20;

-- Problems with PostGIS approach:
-- 1. Complex extension setup and maintenance requirements
-- 2. Specialized spatial syntax different from standard SQL
-- 3. Performance challenges with complex spatial calculations
-- 4. Limited integration with application development workflows
-- 5. Complex data type management and coordinate system handling
-- 6. Difficult debugging and query optimization for spatial operations
-- 7. Expensive licensing and infrastructure requirements for enterprise features
-- 8. Limited support for modern GeoJSON standards and web mapping libraries
-- 9. Complex backup and replication handling for spatial indexes
-- 10. Steep learning curve for developers without GIS background
```

MongoDB provides native, high-performance geospatial capabilities:

```javascript
// MongoDB native geospatial operations - powerful and developer-friendly
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('geospatial_app');

// Advanced Geospatial Application Manager
class MongoGeospatialManager {
  constructor(db) {
    this.db = db;
    this.collections = new Map();
    this.spatialIndexes = new Map();
    this.geoQueryCache = new Map();
  }

  async initializeGeospatialCollections() {
    console.log('Initializing geospatial collections with spatial indexes...');
    
    // Business locations collection
    const businessCollection = this.db.collection('business_locations');
    await this.createBusinessLocationIndexes(businessCollection);
    
    // Customer tracking collection
    const customerCollection = this.db.collection('customer_locations');
    await this.createCustomerLocationIndexes(customerCollection);
    
    // Delivery routes collection
    const routesCollection = this.db.collection('delivery_routes');
    await this.createDeliveryRouteIndexes(routesCollection);
    
    // Geofences and zones collection
    const geofencesCollection = this.db.collection('geofences');
    await this.createGeofenceIndexes(geofencesCollection);
    
    this.collections.set('businesses', businessCollection);
    this.collections.set('customers', customerCollection);
    this.collections.set('routes', routesCollection);
    this.collections.set('geofences', geofencesCollection);
    
    console.log('✅ Geospatial collections initialized with optimized indexes');
    return this.collections;
  }

  async createBusinessLocationIndexes(collection) {
    console.log('Creating business location spatial indexes...');
    
    // 2dsphere index for location-based queries (GeoJSON format)
    await collection.createIndexes([
      {
        key: { "location": "2dsphere" },
        name: "idx_business_location_2dsphere",
        background: true
      },
      {
        key: { "service_area": "2dsphere" },
        name: "idx_business_service_area_2dsphere", 
        background: true
      },
      {
        key: { "category": 1, "location": "2dsphere" },
        name: "idx_category_location_compound",
        background: true
      },
      {
        key: { "rating": -1, "location": "2dsphere" },
        name: "idx_rating_location_compound",
        background: true
      },
      {
        key: { "price_level": 1, "category": 1, "location": "2dsphere" },
        name: "idx_price_category_location_compound",
        background: true
      }
    ]);
    
    console.log('✅ Business location indexes created');
  }

  async createCustomerLocationIndexes(collection) {
    console.log('Creating customer location tracking indexes...');
    
    await collection.createIndexes([
      {
        key: { "location": "2dsphere" },
        name: "idx_customer_location_2dsphere",
        background: true
      },
      {
        key: { "customer_id": 1, "location_timestamp": -1 },
        name: "idx_customer_timeline",
        background: true
      },
      {
        key: { "location_timestamp": -1, "location": "2dsphere" },
        name: "idx_timeline_location_compound",
        background: true
      }
    ]);
    
    console.log('✅ Customer location indexes created');
  }

  async createDeliveryRouteIndexes(collection) {
    console.log('Creating delivery route spatial indexes...');
    
    await collection.createIndexes([
      {
        key: { "route_path": "2dsphere" },
        name: "idx_route_path_2dsphere",
        background: true
      },
      {
        key: { "planned_stops": "2dsphere" },
        name: "idx_planned_stops_2dsphere",
        background: true
      },
      {
        key: { "driver_id": 1, "route_date": -1 },
        name: "idx_driver_date",
        background: true
      },
      {
        key: { "status": 1, "route_date": -1 },
        name: "idx_status_date",
        background: true
      }
    ]);
    
    console.log('✅ Delivery route indexes created');
  }

  async createGeofenceIndexes(collection) {
    console.log('Creating geofence spatial indexes...');
    
    await collection.createIndexes([
      {
        key: { "boundary": "2dsphere" },
        name: "idx_geofence_boundary_2dsphere",
        background: true
      },
      {
        key: { "fence_type": 1, "boundary": "2dsphere" },
        name: "idx_fence_type_boundary_compound",
        background: true
      }
    ]);
    
    console.log('✅ Geofence indexes created');
  }

  async insertBusinessLocations(businesses) {
    console.log(`Inserting ${businesses.length} business locations...`);
    
    const businessCollection = this.collections.get('businesses');
    const businessDocuments = businesses.map(business => ({
      business_name: business.name,
      category: business.category,
      address: business.address,
      
      // GeoJSON Point format for location
      location: {
        type: "Point",
        coordinates: [business.longitude, business.latitude]  // [lng, lat]
      },
      
      // Optional service area as GeoJSON Polygon
      service_area: business.service_radius ? this.createCirclePolygon(
        [business.longitude, business.latitude], 
        business.service_radius
      ) : null,
      
      // Business metadata
      contact: {
        phone: business.phone,
        email: business.email,
        website: business.website
      },
      
      operating_hours: business.hours || {},
      rating: business.rating || 0,
      price_level: business.price_level || 1,
      
      // Operational data
      is_active: business.is_active !== false,
      created_at: new Date(),
      updated_at: new Date(),
      
      // Additional location context
      location_metadata: {
        address_components: business.address_components || {},
        geocoding_accuracy: business.geocoding_accuracy || 'high',
        timezone: business.timezone,
        locale: business.locale || 'en-US'
      }
    }));

    const result = await businessCollection.insertMany(businessDocuments, {
      ordered: false
    });
    
    console.log(`✅ Inserted ${result.insertedCount} business locations`);
    return result;
  }

  async findNearbyBusinesses(userLocation, options = {}) {
    console.log(`Finding nearby businesses around [${userLocation.longitude}, ${userLocation.latitude}]...`);
    
    const {
      maxDistance = 5000,        // 5km default radius
      category = null,
      minRating = 0,
      priceLevel = null,
      limit = 20,
      sortBy = 'distance'        // 'distance', 'rating', 'relevance'
    } = options;

    const businessCollection = this.collections.get('businesses');
    const userPoint = [userLocation.longitude, userLocation.latitude];
    
    try {
      const searchPipeline = [
        // Stage 1: Geospatial proximity filter
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: userPoint
            },
            distanceField: "distance_meters",
            maxDistance: maxDistance,
            spherical: true,
            query: {
              is_active: true,
              ...(category && { category: category }),
              ...(minRating > 0 && { rating: { $gte: minRating } }),
              ...(priceLevel && { price_level: priceLevel })
            }
          }
        },
        
        // Stage 2: Add computed fields for analysis
        {
          $addFields: {
            // Distance categorization
            distance_category: {
              $switch: {
                branches: [
                  { case: { $lte: ["$distance_meters", 500] }, then: "very_close" },
                  { case: { $lte: ["$distance_meters", 1000] }, then: "walking_distance" },
                  { case: { $lte: ["$distance_meters", 2000] }, then: "short_drive" },
                  { case: { $lte: ["$distance_meters", 5000] }, then: "moderate_distance" }
                ],
                default: "far"
              }
            },
            
            // Check if user is within business service area
            within_service_area: {
              $cond: {
                if: { $ne: ["$service_area", null] },
                then: {
                  $function: {
                    body: function(serviceArea, userPoint) {
                      // Simple point-in-polygon check (simplified for example)
                      return serviceArea != null;
                    },
                    args: ["$service_area", userPoint],
                    lang: "js"
                  }
                },
                else: false
              }
            },
            
            // Calculate bearing from user to business
            bearing_degrees: {
              $function: {
                body: function(businessCoords, userCoords) {
                  // Calculate bearing using geographic formulas
                  const lat1 = userCoords[1] * Math.PI / 180;
                  const lat2 = businessCoords[1] * Math.PI / 180;
                  const deltaLng = (businessCoords[0] - userCoords[0]) * Math.PI / 180;
                  
                  const y = Math.sin(deltaLng) * Math.cos(lat2);
                  const x = Math.cos(lat1) * Math.sin(lat2) - 
                           Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
                  
                  let bearing = Math.atan2(y, x) * 180 / Math.PI;
                  return (bearing + 360) % 360;
                },
                args: ["$location.coordinates", userPoint],
                lang: "js"
              }
            },
            
            // Relevance score calculation
            relevance_score: {
              $add: [
                // Distance component (closer is better) - 40% weight
                {
                  $multiply: [
                    { $subtract: [1, { $divide: ["$distance_meters", maxDistance] }] },
                    0.4
                  ]
                },
                
                // Rating component - 30% weight
                { $multiply: [{ $divide: [{ $ifNull: ["$rating", 0] }, 5] }, 0.3] },
                
                // Service area bonus - 20% weight
                { $cond: ["$within_service_area", 0.2, 0] },
                
                // Category relevance bonus - 10% weight
                {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$category", "restaurant"] }, then: 0.1 },
                      { case: { $eq: ["$category", "retail"] }, then: 0.05 }
                    ],
                    default: 0
                  }
                }
              ]
            }
          }
        },
        
        // Stage 3: Add directional information
        {
          $addFields: {
            direction_compass: {
              $switch: {
                branches: [
                  { case: { $and: [{ $gte: ["$bearing_degrees", 337.5] }, { $lt: ["$bearing_degrees", 22.5] }] }, then: "N" },
                  { case: { $and: [{ $gte: ["$bearing_degrees", 22.5] }, { $lt: ["$bearing_degrees", 67.5] }] }, then: "NE" },
                  { case: { $and: [{ $gte: ["$bearing_degrees", 67.5] }, { $lt: ["$bearing_degrees", 112.5] }] }, then: "E" },
                  { case: { $and: [{ $gte: ["$bearing_degrees", 112.5] }, { $lt: ["$bearing_degrees", 157.5] }] }, then: "SE" },
                  { case: { $and: [{ $gte: ["$bearing_degrees", 157.5] }, { $lt: ["$bearing_degrees", 202.5] }] }, then: "S" },
                  { case: { $and: [{ $gte: ["$bearing_degrees", 202.5] }, { $lt: ["$bearing_degrees", 247.5] }] }, then: "SW" },
                  { case: { $and: [{ $gte: ["$bearing_degrees", 247.5] }, { $lt: ["$bearing_degrees", 292.5] }] }, then: "W" },
                  { case: { $and: [{ $gte: ["$bearing_degrees", 292.5] }, { $lt: ["$bearing_degrees", 337.5] }] }, then: "NW" }
                ],
                default: "N"
              }
            },
            
            // Human-readable distance
            distance_display: {
              $switch: {
                branches: [
                  { 
                    case: { $lt: ["$distance_meters", 1000] },
                    then: { $concat: [{ $toString: { $round: ["$distance_meters", 0] } }, "m"] }
                  },
                  {
                    case: { $lt: ["$distance_meters", 10000] },
                    then: { $concat: [{ $toString: { $round: [{ $divide: ["$distance_meters", 1000] }, 1] } }, "km"] }
                  }
                ],
                default: { $concat: [{ $toString: { $round: [{ $divide: ["$distance_meters", 1000] }, 0] } }, "km"] }
              }
            }
          }
        },
        
        // Stage 4: Sort based on user preference
        {
          $sort: sortBy === 'rating' ? { rating: -1, distance_meters: 1 } :
                 sortBy === 'relevance' ? { relevance_score: -1, distance_meters: 1 } :
                 { distance_meters: 1 }
        },
        
        // Stage 5: Limit results
        { $limit: limit },
        
        // Stage 6: Project final output
        {
          $project: {
            business_name: 1,
            category: 1,
            address: 1,
            location: 1,
            contact: 1,
            rating: 1,
            price_level: 1,
            
            // Calculated fields
            distance_meters: { $round: ["$distance_meters", 0] },
            distance_display: 1,
            distance_category: 1,
            bearing_degrees: { $round: ["$bearing_degrees", 1] },
            direction_compass: 1,
            relevance_score: { $round: ["$relevance_score", 3] },
            within_service_area: 1,
            
            // Metadata
            created_at: 1,
            location_metadata: 1
          }
        }
      ];

      const startTime = Date.now();
      const nearbyBusinesses = await businessCollection.aggregate(searchPipeline, {
        allowDiskUse: true
      }).toArray();
      const queryTime = Date.now() - startTime;

      console.log(`✅ Found ${nearbyBusinesses.length} nearby businesses in ${queryTime}ms`);
      
      return {
        user_location: userLocation,
        search_params: options,
        query_time_ms: queryTime,
        total_results: nearbyBusinesses.length,
        businesses: nearbyBusinesses
      };

    } catch (error) {
      console.error('Error finding nearby businesses:', error);
      throw error;
    }
  }

  async implementGeofencingSystem() {
    console.log('Setting up advanced geofencing system...');
    
    const geofencesCollection = this.collections.get('geofences');
    
    // Create various types of geofences
    const sampleGeofences = [
      {
        fence_id: 'delivery_zone_downtown',
        fence_name: 'Downtown Delivery Zone',
        fence_type: 'delivery_boundary',
        
        // GeoJSON Polygon for complex delivery zone
        boundary: {
          type: "Polygon",
          coordinates: [[
            [-122.4194, 37.7749],  // San Francisco downtown area
            [-122.4094, 37.7849],
            [-122.3994, 37.7849],
            [-122.3994, 37.7649],
            [-122.4194, 37.7649],
            [-122.4194, 37.7749]   // Close the polygon
          ]]
        },
        
        // Geofence properties
        properties: {
          delivery_fee: 2.99,
          estimated_delivery_time: 30,
          service_level: 'premium',
          operating_hours: {
            monday: { start: '08:00', end: '22:00' },
            tuesday: { start: '08:00', end: '22:00' },
            wednesday: { start: '08:00', end: '22:00' },
            thursday: { start: '08:00', end: '22:00' },
            friday: { start: '08:00', end: '23:00' },
            saturday: { start: '09:00', end: '23:00' },
            sunday: { start: '10:00', end: '21:00' }
          }
        },
        
        is_active: true,
        created_at: new Date()
      },
      
      {
        fence_id: 'high_demand_area_financial',
        fence_name: 'Financial District High Demand Zone',
        fence_type: 'pricing_zone',
        
        // Circular geofence using buffered point
        boundary: {
          type: "Polygon",
          coordinates: [this.createCirclePolygon([-122.4000, 37.7900], 1000).coordinates[0]]
        },
        
        properties: {
          surge_multiplier: 1.5,
          priority_processing: true,
          rush_hour_bonus: true
        },
        
        is_active: true,
        created_at: new Date()
      }
    ];
    
    await geofencesCollection.insertMany(sampleGeofences);
    console.log('✅ Geofencing system configured with sample zones');
  }

  async checkGeofenceEntries(location, customer_id) {
    console.log(`Checking geofence entries for customer ${customer_id}...`);
    
    const geofencesCollection = this.collections.get('geofences');
    const point = [location.longitude, location.latitude];
    
    try {
      // Find all geofences containing the location
      const containingGeofences = await geofencesCollection.find({
        is_active: true,
        boundary: {
          $geoIntersects: {
            $geometry: {
              type: "Point",
              coordinates: point
            }
          }
        }
      }).toArray();

      const geofenceEvents = [];
      
      for (const geofence of containingGeofences) {
        // Check if this is a new entry (simplified logic)
        const event = {
          customer_id: customer_id,
          geofence_id: geofence.fence_id,
          geofence_name: geofence.fence_name,
          fence_type: geofence.fence_type,
          event_type: 'entry',
          event_timestamp: new Date(),
          location: {
            type: "Point",
            coordinates: point
          },
          properties: geofence.properties
        };
        
        geofenceEvents.push(event);
        
        // Trigger appropriate business logic based on geofence type
        await this.handleGeofenceEvent(event);
      }

      console.log(`✅ Processed ${geofenceEvents.length} geofence events`);
      return geofenceEvents;

    } catch (error) {
      console.error('Error checking geofence entries:', error);
      throw error;
    }
  }

  async handleGeofenceEvent(event) {
    console.log(`Handling geofence event: ${event.event_type} for ${event.geofence_name}`);
    
    // Store geofence event
    await this.db.collection('geofence_events').insertOne(event);
    
    // Business logic based on geofence type
    switch (event.fence_type) {
      case 'delivery_boundary':
        await this.handleDeliveryZoneEntry(event);
        break;
      case 'pricing_zone':
        await this.handlePricingZoneEntry(event);
        break;
      default:
        console.log(`No specific handler for fence type: ${event.fence_type}`);
    }
  }

  async handleDeliveryZoneEntry(event) {
    console.log(`Customer entered delivery zone: ${event.geofence_name}`);
    
    // Update customer delivery preferences
    await this.db.collection('customer_profiles').updateOne(
      { customer_id: event.customer_id },
      {
        $set: {
          current_delivery_zone: event.geofence_id,
          delivery_fee: event.properties.delivery_fee,
          estimated_delivery_time: event.properties.estimated_delivery_time
        },
        $push: {
          zone_history: {
            zone_id: event.geofence_id,
            entered_at: event.event_timestamp,
            properties: event.properties
          }
        }
      },
      { upsert: true }
    );
  }

  async handlePricingZoneEntry(event) {
    console.log(`Customer entered high-demand pricing zone: ${event.geofence_name}`);
    
    // Apply dynamic pricing
    await this.db.collection('pricing_adjustments').insertOne({
      customer_id: event.customer_id,
      zone_id: event.geofence_id,
      surge_multiplier: event.properties.surge_multiplier,
      applied_at: event.event_timestamp,
      expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    });
  }

  async optimizeDeliveryRoutes(deliveries, startLocation) {
    console.log(`Optimizing delivery route for ${deliveries.length} stops...`);
    
    const routesCollection = this.collections.get('routes');
    
    try {
      // Simple nearest-neighbor route optimization
      let currentLocation = startLocation;
      const optimizedRoute = [];
      const remainingDeliveries = [...deliveries];
      
      while (remainingDeliveries.length > 0) {
        // Find nearest delivery location
        let nearestIndex = 0;
        let shortestDistance = Number.MAX_VALUE;
        
        for (let i = 0; i < remainingDeliveries.length; i++) {
          const delivery = remainingDeliveries[i];
          const distance = this.calculateDistance(
            currentLocation,
            delivery.location.coordinates
          );
          
          if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestIndex = i;
          }
        }
        
        // Add nearest delivery to route
        const nextDelivery = remainingDeliveries.splice(nearestIndex, 1)[0];
        optimizedRoute.push({
          ...nextDelivery,
          distance_from_previous: shortestDistance,
          estimated_travel_time: Math.ceil(shortestDistance / 30 * 60) // Assume 30 km/h average
        });
        
        currentLocation = nextDelivery.location.coordinates;
      }
      
      // Calculate total route metrics
      const totalDistance = optimizedRoute.reduce((sum, stop) => sum + stop.distance_from_previous, 0);
      const totalTime = optimizedRoute.reduce((sum, stop) => sum + stop.estimated_travel_time, 0);
      
      // Create route path as LineString
      const routePath = {
        type: "LineString",
        coordinates: [
          [startLocation[0], startLocation[1]], // Start point
          ...optimizedRoute.map(stop => stop.location.coordinates)
        ]
      };
      
      // Store optimized route
      const routeDocument = {
        route_id: `route_${Date.now()}`,
        driver_id: null, // To be assigned
        vehicle_id: null, // To be assigned
        route_date: new Date(),
        
        route_path: routePath,
        planned_stops: {
          type: "MultiPoint",
          coordinates: optimizedRoute.map(stop => stop.location.coordinates)
        },
        
        deliveries: optimizedRoute,
        
        metrics: {
          total_distance_km: Math.round(totalDistance / 1000 * 100) / 100,
          estimated_duration_minutes: totalTime,
          stop_count: optimizedRoute.length,
          optimization_algorithm: 'nearest_neighbor'
        },
        
        status: 'planned',
        created_at: new Date()
      };
      
      const result = await routesCollection.insertOne(routeDocument);
      
      console.log(`✅ Route optimized: ${optimizedRoute.length} stops, ${Math.round(totalDistance/1000*10)/10}km, ${totalTime}min`);
      
      return {
        route_id: result.insertedId,
        optimized_route: optimizedRoute,
        route_path: routePath,
        metrics: routeDocument.metrics
      };

    } catch (error) {
      console.error('Error optimizing delivery route:', error);
      throw error;
    }
  }

  async performSpatialAnalytics(analysisType, parameters = {}) {
    console.log(`Performing spatial analysis: ${analysisType}`);
    
    const businessCollection = this.collections.get('businesses');
    
    try {
      switch (analysisType) {
        case 'density_analysis':
          return await this.performDensityAnalysis(parameters);
        case 'coverage_analysis':
          return await this.performCoverageAnalysis(parameters);
        case 'competition_analysis':
          return await this.performCompetitionAnalysis(parameters);
        default:
          throw new Error(`Unknown analysis type: ${analysisType}`);
      }
    } catch (error) {
      console.error(`Error performing ${analysisType}:`, error);
      throw error;
    }
  }

  async performDensityAnalysis(parameters) {
    const { 
      center, 
      radius = 5000, 
      gridSize = 1000,
      category = null 
    } = parameters;
    
    const businessCollection = this.collections.get('businesses');
    
    // Create analysis grid around center point
    const densityPipeline = [
      // Find businesses within analysis area
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [center.longitude, center.latitude]
          },
          distanceField: "distance",
          maxDistance: radius,
          spherical: true,
          query: {
            is_active: true,
            ...(category && { category: category })
          }
        }
      },
      
      // Group businesses into grid cells
      {
        $group: {
          _id: {
            // Simple grid cell calculation
            grid_x: {
              $floor: {
                $divide: [
                  { $multiply: [
                    { $subtract: [{ $arrayElemAt: ["$location.coordinates", 0] }, center.longitude] },
                    111320  // Approximate meters per degree longitude
                  ]},
                  gridSize
                ]
              }
            },
            grid_y: {
              $floor: {
                $divide: [
                  { $multiply: [
                    { $subtract: [{ $arrayElemAt: ["$location.coordinates", 1] }, center.latitude] },
                    110540  // Approximate meters per degree latitude
                  ]},
                  gridSize
                ]
              }
            }
          },
          business_count: { $sum: 1 },
          avg_rating: { $avg: "$rating" },
          business_types: { $addToSet: "$category" },
          businesses: { $push: {
            name: "$business_name",
            rating: "$rating",
            location: "$location"
          }}
        }
      },
      
      // Calculate density metrics
      {
        $addFields: {
          density_per_km2: {
            $multiply: [
              "$business_count",
              { $divide: [1000000, { $multiply: [gridSize, gridSize] }] }
            ]
          },
          diversity_index: { $size: "$business_types" }
        }
      },
      
      // Sort by density
      {
        $sort: { business_count: -1 }
      }
    ];
    
    const densityResults = await businessCollection.aggregate(densityPipeline).toArray();
    
    return {
      analysis_type: 'density_analysis',
      parameters: parameters,
      grid_size_meters: gridSize,
      total_grid_cells: densityResults.length,
      density_results: densityResults
    };
  }

  // Utility methods
  createCirclePolygon(center, radiusMeters) {
    const points = 64; // Number of points in circle
    const coordinates = [];
    
    for (let i = 0; i <= points; i++) {
      const angle = (i * 2 * Math.PI) / points;
      const dx = radiusMeters * Math.cos(angle);
      const dy = radiusMeters * Math.sin(angle);
      
      // Convert meters to degrees (approximate)
      const deltaLat = dy / 110540;
      const deltaLng = dx / (111320 * Math.cos(center[1] * Math.PI / 180));
      
      coordinates.push([
        center[0] + deltaLng,
        center[1] + deltaLat
      ]);
    }
    
    return {
      type: "Polygon",
      coordinates: [coordinates]
    };
  }

  calculateDistance(point1, point2) {
    // Haversine formula for calculating distance between two points
    const R = 6371e3; // Earth's radius in meters
    const lat1 = point1[1] * Math.PI / 180;
    const lat2 = point2[1] * Math.PI / 180;
    const deltaLat = (point2[1] - point1[1]) * Math.PI / 180;
    const deltaLng = (point2[0] - point1[0]) * Math.PI / 180;
    
    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  }

  async generateSpatialReport() {
    console.log('Generating comprehensive spatial analytics report...');
    
    const report = {
      generated_at: new Date(),
      collections: {}
    };
    
    const collectionNames = ['business_locations', 'customer_locations', 'delivery_routes', 'geofences'];
    
    for (const collectionName of collectionNames) {
      try {
        const collection = this.db.collection(collectionName);
        
        // Get basic collection statistics
        const stats = await this.db.runCommand({ collStats: collectionName });
        
        // Get spatial index statistics
        const indexes = await collection.listIndexes().toArray();
        const spatialIndexes = indexes.filter(idx => 
          Object.values(idx.key || {}).includes('2dsphere') || 
          Object.values(idx.key || {}).includes('2d')
        );
        
        // Get document count and sample
        const documentCount = await collection.countDocuments();
        const sampleDocs = await collection.find({}).limit(3).toArray();
        
        report.collections[collectionName] = {
          document_count: documentCount,
          storage_size: stats.storageSize,
          avg_document_size: stats.avgObjSize,
          spatial_indexes: spatialIndexes.length,
          spatial_index_details: spatialIndexes.map(idx => ({
            name: idx.name,
            key: idx.key,
            sparse: idx.sparse || false
          })),
          sample_documents: sampleDocs.map(doc => {
            // Remove sensitive data for reporting
            const { _id, location, ...metadata } = doc;
            return { location, metadata: Object.keys(metadata) };
          })
        };
      } catch (error) {
        report.collections[collectionName] = { error: error.message };
      }
    }
    
    return report;
  }

  async shutdown() {
    console.log('Shutting down geospatial manager...');
    await this.client.close();
    console.log('Geospatial manager shutdown completed');
  }
}

// Export the geospatial manager
module.exports = { MongoGeospatialManager };

// MongoDB Geospatial Benefits:
// - Native GeoJSON support with industry-standard spatial data formats
// - High-performance 2dsphere indexes optimized for spherical geometry calculations
// - Comprehensive spatial query operators for proximity, intersection, and containment
// - Efficient geospatial aggregation pipelines for spatial analytics
// - Built-in support for complex geometries: Point, LineString, Polygon, MultiPolygon
// - Real-time geofencing capabilities with change streams integration
// - Seamless integration with mapping libraries and GIS applications
// - SQL-compatible spatial operations through QueryLeaf integration
// - Automatic spatial index optimization for query performance
// - Scalable architecture supporting massive location datasets
```

## Understanding MongoDB Geospatial Architecture

### Advanced Location-Based Query Patterns

MongoDB's geospatial capabilities enable sophisticated location-based application patterns:

```javascript
// Advanced geospatial query patterns for real-world applications
class AdvancedGeospatialQueries {
  constructor(db) {
    this.db = db;
    this.queryCache = new Map();
  }

  async implementAdvancedSpatialQueries() {
    console.log('Demonstrating advanced geospatial query patterns...');
    
    // Pattern 1: Multi-criteria proximity search
    await this.multiCriteriaProximitySearch();
    
    // Pattern 2: Route intersection analysis
    await this.routeIntersectionAnalysis();
    
    // Pattern 3: Spatial clustering and heat map generation
    await this.spatialClusteringAnalysis();
    
    // Pattern 4: Dynamic geofence management
    await this.dynamicGeofenceManagement();
    
    console.log('Advanced geospatial patterns demonstrated');
  }

  async multiCriteriaProximitySearch() {
    console.log('Performing multi-criteria proximity search...');
    
    const businessCollection = this.db.collection('business_locations');
    
    // Complex search combining multiple spatial and business criteria
    const complexSearchPipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [-122.4194, 37.7749] // San Francisco
          },
          distanceField: "distance_meters",
          maxDistance: 3000,
          spherical: true,
          query: {
            is_active: true,
            rating: { $gte: 4.0 }
          }
        }
      },
      
      // Add time-based availability filtering
      {
        $addFields: {
          is_currently_open: {
            $function: {
              body: function(operatingHours) {
                const now = new Date();
                const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
                const currentTime = now.getHours() * 100 + now.getMinutes();
                
                if (!operatingHours || !operatingHours[currentDay]) {
                  return false;
                }
                
                const dayHours = operatingHours[currentDay];
                const startTime = parseInt(dayHours.start.replace(':', ''));
                const endTime = parseInt(dayHours.end.replace(':', ''));
                
                return currentTime >= startTime && currentTime <= endTime;
              },
              args: ["$operating_hours"],
              lang: "js"
            }
          }
        }
      },
      
      // Service area intersection check
      {
        $addFields: {
          provides_delivery_to_user: {
            $cond: {
              if: { $ne: ["$service_area", null] },
              then: {
                $function: {
                  body: function(serviceArea, userLocation) {
                    // Simplified point-in-polygon check
                    // In production, use more sophisticated algorithms
                    return serviceArea != null;
                  },
                  args: ["$service_area", [-122.4194, 37.7749]],
                  lang: "js"
                }
              },
              else: false
            }
          }
        }
      },
      
      // Calculate composite score
      {
        $addFields: {
          composite_score: {
            $add: [
              // Distance component (40%)
              { $multiply: [
                { $subtract: [1, { $divide: ["$distance_meters", 3000] }] },
                0.4
              ]},
              
              // Rating component (30%)
              { $multiply: [{ $divide: ["$rating", 5] }, 0.3] },
              
              // Current availability bonus (20%)
              { $cond: ["$is_currently_open", 0.2, 0] },
              
              // Delivery service bonus (10%)
              { $cond: ["$provides_delivery_to_user", 0.1, 0] }
            ]
          }
        }
      },
      
      // Filter and sort by composite score
      {
        $match: {
          composite_score: { $gte: 0.5 } // Minimum quality threshold
        }
      },
      
      {
        $sort: { composite_score: -1, distance_meters: 1 }
      },
      
      { $limit: 15 },
      
      {
        $project: {
          business_name: 1,
          category: 1,
          rating: 1,
          distance_meters: { $round: ["$distance_meters", 0] },
          is_currently_open: 1,
          provides_delivery_to_user: 1,
          composite_score: { $round: ["$composite_score", 3] },
          location: 1
        }
      }
    ];
    
    const results = await businessCollection.aggregate(complexSearchPipeline).toArray();
    console.log(`✅ Found ${results.length} businesses matching complex criteria`);
    return results;
  }

  async routeIntersectionAnalysis() {
    console.log('Analyzing route intersections with geofences...');
    
    const routesCollection = this.db.collection('delivery_routes');
    const geofencesCollection = this.db.collection('geofences');
    
    // Find routes that intersect with specific geofences
    const intersectionPipeline = [
      {
        $match: {
          status: 'in_progress',
          route_path: { $exists: true }
        }
      },
      
      // Lookup intersecting geofences
      {
        $lookup: {
          from: 'geofences',
          let: { route_path: '$route_path' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$is_active', true] },
                    {
                      $function: {
                        body: function(geofenceBoundary, routePath) {
                          // Simplified intersection logic
                          // In production, use proper geometric intersection algorithms
                          return geofenceBoundary && routePath;
                        },
                        args: ['$boundary', '$$route_path'],
                        lang: 'js'
                      }
                    }
                  ]
                }
              }
            }
          ],
          as: 'intersecting_geofences'
        }
      },
      
      // Filter routes with intersections
      {
        $match: {
          'intersecting_geofences.0': { $exists: true }
        }
      },
      
      // Calculate intersection impact
      {
        $addFields: {
          intersection_analysis: {
            $map: {
              input: '$intersecting_geofences',
              as: 'geofence',
              in: {
                fence_id: '$$geofence.fence_id',
                fence_type: '$$geofence.fence_type',
                impact_type: {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$$geofence.fence_type', 'pricing_zone'] }, then: 'cost_increase' },
                      { case: { $eq: ['$$geofence.fence_type', 'restricted_zone'] }, then: 'route_restriction' },
                      { case: { $eq: ['$$geofence.fence_type', 'priority_zone'] }, then: 'priority_handling' }
                    ],
                    default: 'monitoring'
                  }
                },
                properties: '$$geofence.properties'
              }
            }
          }
        }
      },
      
      {
        $project: {
          route_id: 1,
          driver_id: 1,
          route_date: 1,
          status: 1,
          intersection_count: { $size: '$intersecting_geofences' },
          intersection_analysis: 1,
          estimated_impact: {
            $reduce: {
              input: '$intersection_analysis',
              initialValue: { cost_multiplier: 1.0, priority_boost: 0 },
              in: {
                cost_multiplier: {
                  $cond: [
                    { $eq: ['$$this.impact_type', 'cost_increase'] },
                    { $multiply: ['$$value.cost_multiplier', '$$this.properties.surge_multiplier'] },
                    '$$value.cost_multiplier'
                  ]
                },
                priority_boost: {
                  $cond: [
                    { $eq: ['$$this.impact_type', 'priority_handling'] },
                    { $add: ['$$value.priority_boost', 1] },
                    '$$value.priority_boost'
                  ]
                }
              }
            }
          }
        }
      }
    ];
    
    const intersectionResults = await routesCollection.aggregate(intersectionPipeline).toArray();
    console.log(`✅ Analyzed ${intersectionResults.length} routes with geofence intersections`);
    return intersectionResults;
  }

  async spatialClusteringAnalysis() {
    console.log('Performing spatial clustering analysis...');
    
    const businessCollection = this.db.collection('business_locations');
    
    // Density-based clustering for business locations
    const clusteringPipeline = [
      {
        $match: {
          is_active: true,
          location: { $exists: true }
        }
      },
      
      // Create spatial grid for clustering
      {
        $addFields: {
          grid_cell: {
            x: {
              $floor: {
                $multiply: [
                  { $arrayElemAt: ['$location.coordinates', 0] },
                  1000  // Grid precision
                ]
              }
            },
            y: {
              $floor: {
                $multiply: [
                  { $arrayElemAt: ['$location.coordinates', 1] },
                  1000  // Grid precision
                ]
              }
            }
          }
        }
      },
      
      // Group by grid cells
      {
        $group: {
          _id: '$grid_cell',
          business_count: { $sum: 1 },
          categories: { $addToSet: '$category' },
          avg_rating: { $avg: '$rating' },
          businesses: { $push: {
            business_id: '$_id',
            business_name: '$business_name',
            category: '$category',
            location: '$location',
            rating: '$rating'
          }},
          
          // Calculate cluster center
          center_longitude: { $avg: { $arrayElemAt: ['$location.coordinates', 0] } },
          center_latitude: { $avg: { $arrayElemAt: ['$location.coordinates', 1] } }
        }
      },
      
      // Filter significant clusters
      {
        $match: {
          business_count: { $gte: 3 }  // Minimum cluster size
        }
      },
      
      // Add cluster analysis
      {
        $addFields: {
          cluster_center: {
            type: 'Point',
            coordinates: ['$center_longitude', '$center_latitude']
          },
          diversity_index: { $size: '$categories' },
          cluster_density: '$business_count', // Simplified density metric
          
          cluster_characteristics: {
            $switch: {
              branches: [
                {
                  case: { $gte: ['$business_count', 10] },
                  then: 'high_density_commercial'
                },
                {
                  case: { $and: [
                    { $gte: ['$business_count', 5] },
                    { $gte: ['$diversity_index', 4] }
                  ]},
                  then: 'diverse_business_district'
                },
                {
                  case: { $eq: [{ $size: '$categories' }, 1] },
                  then: 'specialized_cluster'
                }
              ],
              default: 'mixed_commercial'
            }
          }
        }
      },
      
      // Sort by cluster significance
      {
        $sort: { business_count: -1, diversity_index: -1 }
      }
    ];
    
    const clusterResults = await businessCollection.aggregate(clusteringPipeline).toArray();
    
    // Generate heat map data
    const heatMapData = clusterResults.map(cluster => ({
      lat: cluster.center_latitude,
      lng: cluster.center_longitude,
      intensity: Math.min(cluster.business_count / 10, 1), // Normalized intensity
      business_count: cluster.business_count,
      characteristics: cluster.cluster_characteristics
    }));
    
    console.log(`✅ Identified ${clusterResults.length} business clusters`);
    return {
      clusters: clusterResults,
      heat_map_data: heatMapData
    };
  }

  async dynamicGeofenceManagement() {
    console.log('Implementing dynamic geofence management...');
    
    const geofencesCollection = this.db.collection('geofences');
    const eventsCollection = this.db.collection('geofence_events');
    
    // Analyze geofence performance and adjust boundaries
    const performancePipeline = [
      {
        $match: {
          event_timestamp: { 
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      },
      
      // Group by geofence
      {
        $group: {
          _id: '$geofence_id',
          total_events: { $sum: 1 },
          unique_customers: { $addToSet: '$customer_id' },
          event_types: { $addToSet: '$event_type' },
          avg_dwell_time: { $avg: '$dwell_time_minutes' },
          
          // Collect event locations for boundary analysis
          event_locations: { $push: '$location' },
          
          latest_properties: { $last: '$properties' }
        }
      },
      
      // Calculate performance metrics
      {
        $addFields: {
          unique_customer_count: { $size: '$unique_customers' },
          event_rate_per_hour: { $divide: ['$total_events', 24] },
          
          // Analyze spatial distribution of events
          boundary_efficiency: {
            $function: {
              body: function(eventLocations) {
                // Simplified efficiency calculation
                // In production, analyze point distribution within geofence
                return eventLocations.length > 10 ? 0.8 : 0.6;
              },
              args: ['$event_locations'],
              lang: 'js'
            }
          }
        }
      },
      
      // Identify geofences needing adjustment
      {
        $addFields: {
          needs_adjustment: {
            $or: [
              { $lt: ['$boundary_efficiency', 0.7] },
              { $lt: ['$event_rate_per_hour', 1] },
              { $gt: ['$event_rate_per_hour', 20] }
            ]
          },
          
          adjustment_type: {
            $switch: {
              branches: [
                { 
                  case: { $lt: ['$event_rate_per_hour', 1] },
                  then: 'expand_boundary'
                },
                {
                  case: { $gt: ['$event_rate_per_hour', 20] },
                  then: 'contract_boundary'
                },
                {
                  case: { $lt: ['$boundary_efficiency', 0.7] },
                  then: 'reshape_boundary'
                }
              ],
              default: 'no_change'
            }
          }
        }
      },
      
      // Filter geofences that need updates
      {
        $match: {
          needs_adjustment: true
        }
      }
    ];
    
    const adjustmentCandidates = await eventsCollection.aggregate(performancePipeline).toArray();
    
    // Apply recommended adjustments
    for (const candidate of adjustmentCandidates) {
      await this.applyGeofenceAdjustment(candidate);
    }
    
    console.log(`✅ Analyzed ${adjustmentCandidates.length} geofences for dynamic adjustment`);
    return adjustmentCandidates;
  }

  async applyGeofenceAdjustment(adjustmentCandidate) {
    const geofencesCollection = this.db.collection('geofences');
    const geofenceId = adjustmentCandidate._id;
    
    console.log(`Applying ${adjustmentCandidate.adjustment_type} to geofence ${geofenceId}`);
    
    // Create adjustment record
    const adjustment = {
      geofence_id: geofenceId,
      adjustment_type: adjustmentCandidate.adjustment_type,
      reason: `Performance optimization - ${adjustmentCandidate.adjustment_type}`,
      applied_at: new Date(),
      previous_metrics: {
        event_rate_per_hour: adjustmentCandidate.event_rate_per_hour,
        boundary_efficiency: adjustmentCandidate.boundary_efficiency,
        unique_customer_count: adjustmentCandidate.unique_customer_count
      }
    };
    
    // Store adjustment history
    await this.db.collection('geofence_adjustments').insertOne(adjustment);
    
    // Update geofence properties based on adjustment type
    const updateDoc = {
      $set: {
        last_adjusted: new Date(),
        adjustment_history: adjustment
      }
    };
    
    switch (adjustmentCandidate.adjustment_type) {
      case 'expand_boundary':
        // Implement boundary expansion logic
        updateDoc.$inc = { 'properties.expansion_factor': 0.1 };
        break;
      case 'contract_boundary':
        // Implement boundary contraction logic
        updateDoc.$inc = { 'properties.contraction_factor': 0.1 };
        break;
      case 'reshape_boundary':
        // Implement boundary reshaping logic
        updateDoc.$set['properties.needs_manual_review'] = true;
        break;
    }
    
    await geofencesCollection.updateOne(
      { fence_id: geofenceId },
      updateDoc
    );
  }
}

// Export the advanced queries class
module.exports = { AdvancedGeospatialQueries };
```

## SQL-Style Geospatial Operations with QueryLeaf

QueryLeaf enables familiar SQL syntax for MongoDB geospatial operations:

```sql
-- QueryLeaf geospatial operations with SQL-familiar syntax

-- Create geospatial table with spatial column
CREATE TABLE business_locations (
  business_id SERIAL PRIMARY KEY,
  business_name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  location POINT NOT NULL,  -- GeoJSON Point stored as POINT type
  service_area POLYGON,     -- GeoJSON Polygon for service boundaries
  rating DECIMAL(3,2) DEFAULT 0,
  price_level INTEGER CHECK (price_level BETWEEN 1 AND 4),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) WITH (
  spatial_indexes = '{"location": "2dsphere", "service_area": "2dsphere"}'
);

-- Insert geospatial data using standard SQL syntax
INSERT INTO business_locations (
  business_name, category, address, location, service_area, rating, price_level
) VALUES 
  ('Downtown Cafe', 'restaurant', '123 Main St', ST_Point(-122.4194, 37.7749), ST_Buffer(ST_Point(-122.4194, 37.7749), 0.01), 4.5, 2),
  ('Tech Bookstore', 'retail', '456 Tech Ave', ST_Point(-122.4094, 37.7849), ST_Buffer(ST_Point(-122.4094, 37.7849), 0.015), 4.2, 3),
  ('Local Grocery', 'grocery', '789 Local Rd', ST_Point(-122.3994, 37.7649), ST_Buffer(ST_Point(-122.3994, 37.7649), 0.008), 3.8, 1);

-- Proximity-based queries with familiar SQL spatial functions
WITH nearby_businesses AS (
  SELECT 
    business_id,
    business_name,
    category,
    address,
    rating,
    price_level,
    
    -- Calculate distance using SQL spatial functions
    ST_Distance(location, ST_Point(-122.4150, 37.7750)) as distance_meters,
    
    -- Check if user location is within service area
    ST_Within(ST_Point(-122.4150, 37.7750), service_area) as within_service_area,
    
    -- Calculate bearing from user to business
    ST_Azimuth(ST_Point(-122.4150, 37.7750), location) * 180 / PI() as bearing_degrees,
    
    -- Convert geometry to GeoJSON for application use
    ST_AsGeoJSON(location) as location_geojson
    
  FROM business_locations
  WHERE 
    is_active = true
    
    -- Spatial proximity filter (5km radius)
    AND ST_DWithin(location, ST_Point(-122.4150, 37.7750), 5000)
),

scored_results AS (
  SELECT 
    nb.*,
    
    -- Multi-criteria scoring algorithm
    (
      -- Distance component (40% weight) - closer is better
      (1.0 - (distance_meters / 5000.0)) * 0.4 +
      
      -- Rating component (30% weight)
      (rating / 5.0) * 0.3 +
      
      -- Service area coverage bonus (20% weight)
      CASE WHEN within_service_area THEN 0.2 ELSE 0 END +
      
      -- Category preference bonus (10% weight)
      CASE 
        WHEN category = 'restaurant' THEN 0.1
        WHEN category = 'grocery' THEN 0.05
        ELSE 0
      END
    ) as relevance_score,
    
    -- Categorize distance for user-friendly display
    CASE 
      WHEN distance_meters <= 500 THEN 'Very Close'
      WHEN distance_meters <= 1000 THEN 'Walking Distance'
      WHEN distance_meters <= 2000 THEN 'Short Drive'
      WHEN distance_meters <= 5000 THEN 'Moderate Distance'
      ELSE 'Far'
    END as distance_category,
    
    -- Convert bearing to compass direction
    CASE 
      WHEN bearing_degrees >= 337.5 OR bearing_degrees < 22.5 THEN 'North'
      WHEN bearing_degrees >= 22.5 AND bearing_degrees < 67.5 THEN 'Northeast'
      WHEN bearing_degrees >= 67.5 AND bearing_degrees < 112.5 THEN 'East'
      WHEN bearing_degrees >= 112.5 AND bearing_degrees < 157.5 THEN 'Southeast'
      WHEN bearing_degrees >= 157.5 AND bearing_degrees < 202.5 THEN 'South'
      WHEN bearing_degrees >= 202.5 AND bearing_degrees < 247.5 THEN 'Southwest'
      WHEN bearing_degrees >= 247.5 AND bearing_degrees < 292.5 THEN 'West'
      ELSE 'Northwest'
    END as direction_compass
    
  FROM nearby_businesses nb
)

SELECT 
  business_id,
  business_name,
  category,
  address,
  ROUND(distance_meters::NUMERIC, 0) as distance_meters,
  distance_category,
  direction_compass,
  ROUND(bearing_degrees::NUMERIC, 1) as bearing_degrees,
  rating,
  price_level,
  within_service_area,
  ROUND(relevance_score::NUMERIC, 3) as relevance_score,
  location_geojson

FROM scored_results
WHERE 
  distance_meters <= 5000  -- 5km maximum distance
  AND relevance_score >= 0.3  -- Minimum relevance threshold

ORDER BY relevance_score DESC, distance_meters ASC
LIMIT 20;

-- Geofencing and spatial containment analysis
CREATE TABLE geofences (
  fence_id VARCHAR(50) PRIMARY KEY,
  fence_name VARCHAR(200) NOT NULL,
  fence_type VARCHAR(50) NOT NULL,  -- 'delivery_zone', 'pricing_zone', 'restricted_area'
  boundary POLYGON NOT NULL,
  properties JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) WITH (
  spatial_indexes = '{"boundary": "2dsphere"}'
);

-- Insert geofence boundaries
INSERT INTO geofences (fence_id, fence_name, fence_type, boundary, properties) VALUES 
  ('downtown_delivery', 'Downtown Delivery Zone', 'delivery_zone', 
   ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-122.42,-37.77],[-122.40,-37.78],[-122.39,-37.76],[-122.42,-37.77]]]}'),
   '{"delivery_fee": 2.99, "estimated_time": 30}'),
  ('high_demand_pricing', 'Financial District Surge Zone', 'pricing_zone',
   ST_Buffer(ST_Point(-122.4000, 37.7900), 0.01),
   '{"surge_multiplier": 1.5, "peak_hours": ["08:00-10:00", "17:00-19:00"]}');

-- Check which geofences contain a specific location
WITH location_analysis AS (
  SELECT 
    ST_Point(-122.4100, 37.7800) as user_location
),

geofence_containment AS (
  SELECT 
    gf.fence_id,
    gf.fence_name,
    gf.fence_type,
    gf.properties,
    
    -- Check if user location is within geofence
    ST_Within(la.user_location, gf.boundary) as user_inside_fence,
    
    -- Calculate distance to geofence boundary
    ST_Distance(la.user_location, ST_Boundary(gf.boundary)) as distance_to_boundary,
    
    -- Calculate area of geofence
    ST_Area(gf.boundary) as fence_area_sq_degrees
    
  FROM geofences gf
  CROSS JOIN location_analysis la
  WHERE gf.is_active = true
)

SELECT 
  fence_id,
  fence_name,
  fence_type,
  user_inside_fence,
  CASE 
    WHEN user_inside_fence THEN 'Inside geofence'
    WHEN distance_to_boundary <= 0.001 THEN 'Near boundary'
    ELSE 'Outside geofence'
  END as proximity_status,
  ROUND(distance_to_boundary::NUMERIC * 111000, 0) as distance_to_boundary_meters,
  properties

FROM geofence_containment
WHERE 
  user_inside_fence = true 
  OR distance_to_boundary <= 0.005  -- Within ~500m of boundary

ORDER BY distance_to_boundary ASC;

-- Route optimization and path analysis
CREATE TABLE delivery_routes (
  route_id VARCHAR(50) PRIMARY KEY,
  driver_id INTEGER NOT NULL,
  route_date DATE NOT NULL,
  route_path LINESTRING NOT NULL,  -- Path as LineString geometry
  planned_stops MULTIPOINT NOT NULL,  -- Stop locations as MultiPoint
  total_distance_km DECIMAL(10,3),
  estimated_duration_minutes INTEGER,
  status VARCHAR(20) DEFAULT 'planned',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) WITH (
  spatial_indexes = '{"route_path": "2dsphere", "planned_stops": "2dsphere"}'
);

-- Analyze route intersections with geofences
WITH route_geofence_analysis AS (
  SELECT 
    dr.route_id,
    dr.driver_id,
    dr.route_date,
    dr.status,
    
    -- Find intersecting geofences
    ARRAY_AGG(
      CASE 
        WHEN ST_Intersects(dr.route_path, gf.boundary) 
        THEN JSON_BUILD_OBJECT(
          'fence_id', gf.fence_id,
          'fence_type', gf.fence_type,
          'properties', gf.properties
        )
        ELSE NULL
      END
    ) FILTER (WHERE ST_Intersects(dr.route_path, gf.boundary)) as intersecting_geofences,
    
    -- Calculate route metrics
    ST_Length(dr.route_path) * 111000 as route_length_meters,  -- Convert to meters
    ST_NumPoints(dr.planned_stops) as stop_count,
    
    -- Check if route passes through restricted areas
    BOOL_OR(
      CASE 
        WHEN gf.fence_type = 'restricted_area' AND ST_Intersects(dr.route_path, gf.boundary)
        THEN true 
        ELSE false 
      END
    ) as passes_through_restricted_area
    
  FROM delivery_routes dr
  LEFT JOIN geofences gf ON ST_Intersects(dr.route_path, gf.boundary)
  WHERE 
    dr.route_date = CURRENT_DATE
    AND dr.status IN ('planned', 'in_progress')
  GROUP BY dr.route_id, dr.driver_id, dr.route_date, dr.status, dr.route_path, dr.planned_stops
),

route_impact_analysis AS (
  SELECT 
    rga.*,
    
    -- Calculate impact of geofence intersections
    CASE 
      WHEN passes_through_restricted_area THEN 'Route requires rerouting'
      WHEN ARRAY_LENGTH(intersecting_geofences, 1) > 0 THEN 'Route has cost/time implications'
      ELSE 'Route clear'
    END as route_status,
    
    -- Estimate cost impact
    COALESCE(
      (
        SELECT SUM(
          CASE 
            WHEN fence->>'fence_type' = 'pricing_zone' 
            THEN (fence->>'properties'->>'surge_multiplier')::NUMERIC - 1
            ELSE 0
          END
        )
        FROM UNNEST(intersecting_geofences) as fence
      ), 0
    ) as estimated_cost_increase_multiplier
    
  FROM route_geofence_analysis rga
)

SELECT 
  route_id,
  driver_id,
  route_date,
  status,
  ROUND(route_length_meters::NUMERIC, 0) as route_length_meters,
  stop_count,
  route_status,
  passes_through_restricted_area,
  ARRAY_LENGTH(intersecting_geofences, 1) as geofence_intersection_count,
  ROUND(estimated_cost_increase_multiplier::NUMERIC, 2) as cost_multiplier,
  intersecting_geofences

FROM route_impact_analysis
ORDER BY 
  passes_through_restricted_area DESC,
  estimated_cost_increase_multiplier DESC,
  route_length_meters ASC;

-- Spatial analytics and density analysis
CREATE VIEW business_density_analysis AS
WITH spatial_grid AS (
  -- Create analysis grid for density calculation
  SELECT 
    grid_x,
    grid_y,
    ST_MakeBox2D(
      ST_Point(grid_x * 0.01 - 122.5, grid_y * 0.01 + 37.7),
      ST_Point((grid_x + 1) * 0.01 - 122.5, (grid_y + 1) * 0.01 + 37.7)
    ) as grid_cell
  FROM 
    GENERATE_SERIES(0, 50) as grid_x,
    GENERATE_SERIES(0, 50) as grid_y
),

grid_business_counts AS (
  SELECT 
    sg.grid_x,
    sg.grid_y,
    sg.grid_cell,
    
    -- Count businesses in each grid cell
    COUNT(bl.business_id) as business_count,
    ARRAY_AGG(bl.category) as categories,
    AVG(bl.rating) as avg_rating,
    
    -- Calculate grid cell center point
    ST_Centroid(sg.grid_cell) as cell_center
    
  FROM spatial_grid sg
  LEFT JOIN business_locations bl ON ST_Within(bl.location, sg.grid_cell)
  WHERE bl.is_active = true OR bl.business_id IS NULL
  GROUP BY sg.grid_x, sg.grid_y, sg.grid_cell
),

density_analysis AS (
  SELECT 
    gbc.*,
    
    -- Calculate density metrics
    business_count * 100.0 as businesses_per_km2,  -- Approximate conversion
    ARRAY_LENGTH(ARRAY_REMOVE(categories, NULL), 1) as category_diversity,
    
    -- Classify density level
    CASE 
      WHEN business_count >= 10 THEN 'high_density'
      WHEN business_count >= 5 THEN 'medium_density'
      WHEN business_count >= 1 THEN 'low_density'
      ELSE 'no_businesses'
    END as density_classification,
    
    -- Generate GeoJSON for mapping
    ST_AsGeoJSON(cell_center) as center_geojson,
    ST_AsGeoJSON(grid_cell) as cell_boundary_geojson
    
  FROM grid_business_counts gbc
  WHERE business_count > 0  -- Only include cells with businesses
)

SELECT 
  grid_x,
  grid_y,
  business_count,
  ROUND(businesses_per_km2::NUMERIC, 1) as businesses_per_km2,
  category_diversity,
  density_classification,
  ROUND(avg_rating::NUMERIC, 2) as avg_rating,
  categories,
  center_geojson,
  cell_boundary_geojson

FROM density_analysis
ORDER BY business_count DESC, category_diversity DESC;

-- QueryLeaf provides comprehensive geospatial capabilities:
-- 1. Standard SQL spatial data types (POINT, POLYGON, LINESTRING)
-- 2. Familiar spatial functions (ST_Distance, ST_Within, ST_Buffer, etc.)
-- 3. Geospatial indexing with MongoDB's 2dsphere indexes
-- 4. Complex proximity searches with multi-criteria scoring
-- 5. Geofencing and spatial containment analysis
-- 6. Route optimization and intersection analysis
-- 7. Spatial analytics and density calculations
-- 8. Integration with GeoJSON for web mapping libraries
-- 9. Performance-optimized spatial queries
-- 10. Seamless conversion between SQL spatial syntax and MongoDB operations
```

## Best Practices for Geospatial Implementation

### Collection Design and Index Optimization

Essential practices for production geospatial deployments:

1. **Coordinate System**: Use WGS84 (EPSG:4326) coordinate system for global compatibility
2. **GeoJSON Standards**: Store location data in standard GeoJSON format for interoperability
3. **Index Strategy**: Create 2dsphere indexes on location fields for optimal query performance
4. **Compound Indexes**: Combine spatial indexes with business logic fields for efficient filtering
5. **Data Validation**: Implement proper validation for coordinate ranges and geometry types
6. **Precision Management**: Choose appropriate precision levels for coordinate storage and calculations

### Performance and Scalability

Optimize geospatial operations for high-throughput location-based applications:

1. **Query Optimization**: Use `$geoNear` for proximity searches with distance-based sorting
2. **Bounding Box Filtering**: Apply initial bounding box filters before complex spatial calculations
3. **Aggregation Pipelines**: Leverage aggregation frameworks for complex spatial analytics
4. **Caching Strategies**: Implement intelligent caching for frequently accessed location data
5. **Data Modeling**: Design schemas that align with common geospatial query patterns
6. **Sharding Considerations**: Plan geospatial sharding strategies for global applications

## Conclusion

MongoDB's native geospatial capabilities provide comprehensive location-based application development features that eliminate the complexity and overhead of traditional GIS database approaches. The combination of efficient spatial indexing, sophisticated query operators, and seamless GeoJSON integration enables high-performance location-aware applications that scale effectively with growing user bases and data volumes.

Key MongoDB Geospatial benefits include:

- **Native GeoJSON Support**: Industry-standard spatial data formats with seamless web integration
- **High-Performance Indexing**: 2dsphere indexes optimized for spherical geometry calculations
- **Comprehensive Query Operators**: Complete set of spatial operations for proximity, intersection, and containment
- **Scalable Architecture**: Efficient handling of massive location datasets with intelligent partitioning
- **Real-time Capabilities**: Change streams enable immediate geofence and location event processing
- **SQL Compatibility**: Familiar spatial query patterns for existing SQL development teams

Whether you're building ride-sharing platforms, delivery logistics systems, real estate applications, location-based social networks, or any geospatial application requiring sophisticated spatial analysis, MongoDB's geospatial features with QueryLeaf's SQL-familiar interface provide the foundation for modern location-based services that remain both powerful and approachable for traditional SQL development teams.

> **QueryLeaf Integration**: QueryLeaf automatically leverages MongoDB's geospatial capabilities while providing familiar SQL spatial functions and syntax. Complex proximity searches, geofencing operations, and spatial analytics are seamlessly accessible through standard SQL spatial constructs, making sophisticated geospatial development both efficient and maintainable for SQL-oriented development teams.

The integration of enterprise-grade geospatial capabilities with SQL-style operations makes MongoDB an ideal platform for location-based applications that require both high-performance spatial processing and familiar development patterns, ensuring your geospatial solutions remain both effective and maintainable as they scale to global deployments.