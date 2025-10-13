---
title: "MongoDB Geospatial Queries and Location Data Management: Advanced Geographic Indexing and Spatial Analysis for Modern Applications"
description: "Master MongoDB geospatial capabilities for location-based applications. Learn advanced geographic indexing, proximity queries, geofencing, and SQL-familiar spatial operations for comprehensive location data management."
date: 2025-10-12
tags: [mongodb, geospatial, location-data, geographic-indexing, proximity-queries, gis, spatial-analysis, sql]
---

# MongoDB Geospatial Queries and Location Data Management: Advanced Geographic Indexing and Spatial Analysis for Modern Applications

Modern applications increasingly rely on location-aware functionality to provide contextual services, from ride-sharing and delivery apps to social networks and real estate platforms. Managing geographic data efficiently requires sophisticated spatial indexing, proximity calculations, and complex geospatial queries that traditional databases struggle to handle effectively. MongoDB's comprehensive geospatial capabilities provide advanced geographic indexing and spatial analysis features that enable location-based applications to scale efficiently.

MongoDB's geospatial features support both 2D and spherical geometry operations, enabling applications to perform complex spatial queries including proximity searches, geofencing, route optimization, and area calculations. Unlike traditional approaches that require specialized GIS extensions or complex spatial calculations in application code, MongoDB integrates geospatial functionality directly into the database with optimized indexing strategies and query operators.

## The Traditional Geographic Data Challenge

Conventional approaches to managing location data in relational databases face significant limitations:

```sql
-- Traditional PostgreSQL geographic data handling - complex and limited functionality

-- Basic location storage with separate latitude/longitude columns
CREATE TABLE locations (
    location_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Basic constraints for valid coordinates
    CONSTRAINT valid_latitude CHECK (latitude >= -90 AND latitude <= 90),
    CONSTRAINT valid_longitude CHECK (longitude >= -180 AND longitude <= 180)
);

-- Create basic index for coordinate lookups (limited efficiency)
CREATE INDEX idx_locations_lat_lng ON locations(latitude, longitude);

-- Simple proximity query using Haversine formula (inefficient for large datasets)
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 DECIMAL, lng1 DECIMAL,
    lat2 DECIMAL, lng2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
    earth_radius DECIMAL := 6371; -- Earth radius in kilometers
    lat1_rad DECIMAL;
    lng1_rad DECIMAL;
    lat2_rad DECIMAL;
    lng2_rad DECIMAL;
    dlat DECIMAL;
    dlng DECIMAL;
    a DECIMAL;
    c DECIMAL;
BEGIN
    -- Convert degrees to radians
    lat1_rad := radians(lat1);
    lng1_rad := radians(lng1);
    lat2_rad := radians(lat2);
    lng2_rad := radians(lng2);
    
    -- Haversine formula
    dlat := lat2_rad - lat1_rad;
    dlng := lng2_rad - lng1_rad;
    
    a := sin(dlat/2) * sin(dlat/2) + 
         cos(lat1_rad) * cos(lat2_rad) * 
         sin(dlng/2) * sin(dlng/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    
    RETURN earth_radius * c;
END;
$$ LANGUAGE plpgsql;

-- Find nearby locations (slow for large datasets)
WITH nearby_locations AS (
    SELECT 
        l.*,
        calculate_distance(
            40.7128, -74.0060,  -- New York City coordinates
            l.latitude, l.longitude
        ) as distance_km
    FROM locations l
    WHERE 
        -- Basic bounding box filter (rectangular approximation)
        latitude BETWEEN 40.7128 - 0.1 AND 40.7128 + 0.1
        AND longitude BETWEEN -74.0060 - 0.1 AND -74.0060 + 0.1
)
SELECT 
    location_id,
    name,
    address,
    latitude,
    longitude,
    distance_km,
    
    -- Categories for results
    CASE 
        WHEN distance_km <= 1 THEN 'very_close'
        WHEN distance_km <= 5 THEN 'nearby'
        WHEN distance_km <= 10 THEN 'moderate_distance'
        ELSE 'far'
    END as proximity_category
    
FROM nearby_locations
WHERE distance_km <= 10  -- Within 10km
ORDER BY distance_km
LIMIT 50;

-- Geofencing implementation (complex and inefficient)
CREATE TABLE geofences (
    geofence_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    center_latitude DECIMAL(10, 8) NOT NULL,
    center_longitude DECIMAL(11, 8) NOT NULL,
    radius_meters INTEGER NOT NULL,
    fence_type VARCHAR(50) DEFAULT 'circular',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Check if location is within geofence (expensive operation)
CREATE OR REPLACE FUNCTION point_in_geofence(
    point_lat DECIMAL, point_lng DECIMAL,
    fence_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    fence_record geofences%ROWTYPE;
    distance_m DECIMAL;
BEGIN
    SELECT * INTO fence_record 
    FROM geofences 
    WHERE geofence_id = fence_id AND active = true;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Calculate distance in meters
    distance_m := calculate_distance(
        point_lat, point_lng,
        fence_record.center_latitude, fence_record.center_longitude
    ) * 1000;
    
    RETURN distance_m <= fence_record.radius_meters;
END;
$$ LANGUAGE plpgsql;

-- Area-based queries (extremely limited without proper GIS support)
WITH service_areas AS (
    SELECT 
        sa.area_id,
        sa.area_name,
        -- Simple rectangular area definition (very limited)
        sa.min_latitude,
        sa.max_latitude,
        sa.min_longitude,
        sa.max_longitude,
        sa.service_type
    FROM service_areas sa
    WHERE sa.active = true
),
area_coverage AS (
    SELECT 
        sa.*,
        COUNT(l.location_id) as locations_in_area,
        AVG(l.latitude) as avg_latitude,
        AVG(l.longitude) as avg_longitude
    FROM service_areas sa
    LEFT JOIN locations l ON (
        l.latitude BETWEEN sa.min_latitude AND sa.max_latitude
        AND l.longitude BETWEEN sa.min_longitude AND sa.max_longitude
    )
    GROUP BY sa.area_id, sa.area_name, sa.min_latitude, sa.max_latitude, 
             sa.min_longitude, sa.max_longitude, sa.service_type
)
SELECT 
    area_id,
    area_name,
    service_type,
    locations_in_area,
    
    -- Calculate approximate area (very rough rectangle calculation)
    (max_latitude - min_latitude) * (max_longitude - min_longitude) * 111000 as approx_area_sqm,
    
    -- Service density calculation
    CASE 
        WHEN locations_in_area > 0 THEN 
            locations_in_area::DECIMAL / 
            ((max_latitude - min_latitude) * (max_longitude - min_longitude) * 111000)
        ELSE 0
    END as service_density_per_sqkm
    
FROM area_coverage
ORDER BY locations_in_area DESC;

-- Route planning (extremely basic and inefficient)
WITH route_waypoints AS (
    SELECT 
        ROW_NUMBER() OVER (ORDER BY waypoint_order) as sequence,
        latitude,
        longitude,
        location_name
    FROM route_points
    WHERE route_id = :route_id
    ORDER BY waypoint_order
),
route_segments AS (
    SELECT 
        rw1.sequence as from_seq,
        rw1.location_name as from_location,
        rw1.latitude as from_lat,
        rw1.longitude as from_lng,
        rw2.sequence as to_seq,
        rw2.location_name as to_location,
        rw2.latitude as to_lat,
        rw2.longitude as to_lng,
        
        -- Calculate segment distance
        calculate_distance(
            rw1.latitude, rw1.longitude,
            rw2.latitude, rw2.longitude
        ) as segment_distance_km
        
    FROM route_waypoints rw1
    JOIN route_waypoints rw2 ON rw2.sequence = rw1.sequence + 1
)
SELECT 
    from_location,
    to_location,
    segment_distance_km,
    
    -- Running total distance
    SUM(segment_distance_km) OVER (
        ORDER BY from_seq 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as cumulative_distance_km,
    
    -- Estimated time (very basic calculation)
    segment_distance_km * 60 / 50 as estimated_minutes  -- Assume 50 km/h average
    
FROM route_segments
ORDER BY from_seq;

-- Problems with traditional geographic approaches:
-- 1. No native spatial indexing - queries are slow on large datasets
-- 2. Limited geometric operations - only basic distance calculations
-- 3. No support for complex shapes or polygons
-- 4. Inefficient bounding box calculations
-- 5. No proper coordinate system support
-- 6. Manual implementation of spatial algorithms
-- 7. Limited geospatial query operators
-- 8. Poor performance for proximity searches
-- 9. No native support for geographic data types
-- 10. Complex implementation for basic geospatial functionality
```

MongoDB provides comprehensive geospatial capabilities with advanced indexing and query operators:

```javascript
// MongoDB Advanced Geospatial Data Management
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('geospatial_applications');

// Comprehensive MongoDB Geospatial Manager
class AdvancedGeospatialManager {
  constructor(db, config = {}) {
    this.db = db;
    this.collections = {
      locations: db.collection('locations'),
      geofences: db.collection('geofences'),
      routes: db.collection('routes'),
      serviceAreas: db.collection('service_areas'),
      trackingData: db.collection('tracking_data'),
      spatialAnalytics: db.collection('spatial_analytics')
    };
    
    // Advanced geospatial configuration
    this.config = {
      // Coordinate system settings
      coordinateSystem: config.coordinateSystem || 'WGS84',
      defaultSRID: config.defaultSRID || 4326,
      
      // Index optimization settings
      enable2dSphereIndexes: config.enable2dSphereIndexes !== false,
      enableGeoHashIndexes: config.enableGeoHashIndexes || false,
      indexPrecision: config.indexPrecision || 26,
      
      // Query optimization settings
      defaultDistanceUnit: config.defaultDistanceUnit || 'meters',
      maxProximityDistance: config.maxProximityDistance || 50000, // 50km
      defaultResultLimit: config.defaultResultLimit || 100,
      
      // Performance settings
      enableSpatialCaching: config.enableSpatialCaching || false,
      cacheExpirySeconds: config.cacheExpirySeconds || 300,
      enableParallelQueries: config.enableParallelQueries || false
    };
    
    this.initializeGeospatialSystem();
  }

  async initializeGeospatialSystem() {
    console.log('Initializing advanced geospatial system...');
    
    try {
      // Create optimized geospatial indexes
      await this.setupGeospatialIndexes();
      
      // Initialize spatial analysis capabilities
      await this.setupSpatialAnalytics();
      
      // Setup geospatial data validation
      await this.setupGeospatialValidation();
      
      console.log('Advanced geospatial system initialized successfully');
      
    } catch (error) {
      console.error('Error initializing geospatial system:', error);
      throw error;
    }
  }

  async setupGeospatialIndexes() {
    console.log('Setting up optimized geospatial indexes...');
    
    try {
      // Locations collection - 2dsphere index for spherical geometry
      await this.collections.locations.createIndex(
        { location: '2dsphere' },
        { 
          name: 'location_2dsphere_idx',
          background: true,
          '2dsphereIndexVersion': 3
        }
      );

      // Compound index for location + category queries
      await this.collections.locations.createIndex(
        { location: '2dsphere', category: 1, active: 1 },
        { 
          name: 'location_category_active_idx',
          background: true 
        }
      );

      // Geofences collection - optimized for area queries
      await this.collections.geofences.createIndex(
        { geometry: '2dsphere' },
        { 
          name: 'geofence_geometry_idx',
          background: true 
        }
      );

      // Tracking data - time-series with geospatial
      await this.collections.trackingData.createIndex(
        { location: '2dsphere', timestamp: -1, user_id: 1 },
        { 
          name: 'tracking_location_time_user_idx',
          background: true 
        }
      );

      // Service areas - polygon-based spatial index
      await this.collections.serviceAreas.createIndex(
        { coverage_area: '2dsphere', service_type: 1, active: 1 },
        { 
          name: 'service_area_coverage_idx',
          background: true 
        }
      );

      console.log('Geospatial indexes created successfully');
      
    } catch (error) {
      console.error('Error creating geospatial indexes:', error);
      throw error;
    }
  }

  async findNearbyLocations(centerPoint, radiusMeters, options = {}) {
    console.log(`Finding locations within ${radiusMeters}m of point [${centerPoint.coordinates}]...`);
    
    try {
      const query = {
        location: {
          $near: {
            $geometry: centerPoint,
            $maxDistance: radiusMeters
          }
        }
      };

      // Add additional filters
      if (options.category) {
        query.category = options.category;
      }
      
      if (options.active !== undefined) {
        query.active = options.active;
      }

      if (options.excludeIds) {
        query._id = { $nin: options.excludeIds };
      }

      // Execute proximity query with optimization
      const nearbyLocations = await this.collections.locations
        .find(query)
        .limit(options.limit || this.config.defaultResultLimit)
        .toArray();

      // Calculate precise distances and additional metadata
      const enrichedResults = nearbyLocations.map(location => {
        const distance = this.calculateDistance(centerPoint, location.location);
        
        return {
          ...location,
          distance: {
            meters: Math.round(distance),
            kilometers: Math.round(distance / 1000 * 100) / 100,
            miles: Math.round(distance * 0.000621371 * 100) / 100
          },
          proximityCategory: this.categorizeDistance(distance),
          bearing: this.calculateBearing(centerPoint, location.location)
        };
      });

      // Sort by distance (MongoDB $near already does this, but ensure precision)
      enrichedResults.sort((a, b) => a.distance.meters - b.distance.meters);

      return {
        success: true,
        centerPoint: centerPoint,
        searchRadius: radiusMeters,
        totalResults: enrichedResults.length,
        locations: enrichedResults,
        searchMetadata: {
          queryOptions: options,
          executionTime: Date.now(),
          coordinateSystem: this.config.coordinateSystem
        }
      };

    } catch (error) {
      console.error('Error finding nearby locations:', error);
      return {
        success: false,
        error: error.message,
        centerPoint: centerPoint,
        searchRadius: radiusMeters
      };
    }
  }

  async implementAdvancedGeofencing(geofenceData, monitoringOptions = {}) {
    console.log('Implementing advanced geofencing system...');
    
    try {
      // Create comprehensive geofence document
      const geofenceDocument = {
        _id: this.generateGeofenceId(),
        name: geofenceData.name,
        description: geofenceData.description,
        
        // Geofence geometry (supports various shapes)
        geometry: this.normalizeGeometry(geofenceData.geometry),
        
        // Geofence properties
        properties: {
          type: geofenceData.type || 'monitoring',
          priority: geofenceData.priority || 'normal',
          active: geofenceData.active !== false,
          
          // Trigger conditions
          triggerEvents: geofenceData.triggerEvents || ['enter', 'exit'],
          dwellTime: geofenceData.dwellTime || 0, // Minimum time in seconds
          
          // Notification settings
          notifications: {
            enabled: monitoringOptions.enableNotifications || false,
            webhookUrl: monitoringOptions.webhookUrl,
            emailRecipients: monitoringOptions.emailRecipients || []
          },
          
          // Analytics settings
          analytics: {
            trackDwellTime: monitoringOptions.trackDwellTime || false,
            trackEntryExitPatterns: monitoringOptions.trackEntryExitPatterns || false,
            aggregateStatistics: monitoringOptions.aggregateStatistics || false
          }
        },
        
        // Metadata
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: geofenceData.createdBy,
        
        // Performance optimization hints
        indexingHints: {
          expectedQueryVolume: monitoringOptions.expectedQueryVolume || 'medium',
          primaryUseCase: monitoringOptions.primaryUseCase || 'point_in_polygon'
        }
      };

      // Insert geofence with validation
      const insertResult = await this.collections.geofences.insertOne(geofenceDocument);

      if (!insertResult.acknowledged) {
        throw new Error('Failed to create geofence');
      }

      console.log(`Geofence created successfully: ${geofenceDocument.name}`);

      return {
        success: true,
        geofenceId: geofenceDocument._id,
        geometry: geofenceDocument.geometry,
        properties: geofenceDocument.properties
      };

    } catch (error) {
      console.error('Error implementing geofencing:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkGeofenceViolations(pointLocation, userContext = {}) {
    console.log('Checking geofence violations for location...');
    
    try {
      // Find all active geofences that contain the point
      const geofenceQuery = {
        'properties.active': true,
        geometry: {
          $geoIntersects: {
            $geometry: pointLocation
          }
        }
      };

      const violatedGeofences = await this.collections.geofences
        .find(geofenceQuery)
        .toArray();

      const violations = [];
      
      for (const geofence of violatedGeofences) {
        // Check if this is a new entry or continued presence
        const previousStatus = await this.getPreviousGeofenceStatus(
          userContext.userId, 
          geofence._id
        );

        const violationData = {
          geofenceId: geofence._id,
          geofenceName: geofence.name,
          violationType: this.determineViolationType(previousStatus, geofence),
          timestamp: new Date(),
          location: pointLocation,
          userContext: userContext,
          
          // Geofence-specific data
          geofenceType: geofence.properties.type,
          priority: geofence.properties.priority,
          triggerEvents: geofence.properties.triggerEvents,
          
          // Additional context
          dwellTimeRequired: geofence.properties.dwellTime,
          currentDwellTime: this.calculateCurrentDwellTime(userContext.userId, geofence._id)
        };

        violations.push(violationData);

        // Update geofence status tracking
        await this.updateGeofenceStatus(userContext.userId, geofence._id, violationData);

        // Trigger notifications if configured
        if (geofence.properties.notifications.enabled) {
          await this.triggerGeofenceNotification(geofence, violationData);
        }

        // Record analytics if enabled
        if (geofence.properties.analytics.trackEntryExitPatterns) {
          await this.recordGeofenceAnalytics(geofence, violationData);
        }
      }

      // Check for geofence exits (locations user was in but no longer in)
      const exitViolations = await this.checkGeofenceExits(
        userContext.userId, 
        violatedGeofences.map(g => g._id),
        pointLocation
      );

      violations.push(...exitViolations);

      return {
        success: true,
        location: pointLocation,
        totalViolations: violations.length,
        violations: violations,
        userContext: userContext
      };

    } catch (error) {
      console.error('Error checking geofence violations:', error);
      return {
        success: false,
        error: error.message,
        location: pointLocation
      };
    }
  }

  async performSpatialAnalysis(analysisType, parameters) {
    console.log(`Performing spatial analysis: ${analysisType}...`);
    
    try {
      let analysisResult = {};

      switch (analysisType) {
        case 'density_heatmap':
          analysisResult = await this.generateDensityHeatmap(parameters);
          break;
          
        case 'service_coverage':
          analysisResult = await this.analyzeServiceCoverage(parameters);
          break;
          
        case 'route_optimization':
          analysisResult = await this.optimizeRoutes(parameters);
          break;
          
        case 'clustering_analysis':
          analysisResult = await this.performClusteringAnalysis(parameters);
          break;
          
        case 'accessibility_analysis':
          analysisResult = await this.analyzeAccessibility(parameters);
          break;
          
        default:
          throw new Error(`Unsupported analysis type: ${analysisType}`);
      }

      // Store analysis results for future reference
      const analysisRecord = {
        analysisType: analysisType,
        parameters: parameters,
        results: analysisResult,
        executedAt: new Date(),
        executionTime: Date.now() - parameters.startTime
      };

      await this.collections.spatialAnalytics.insertOne(analysisRecord);

      return {
        success: true,
        analysisType: analysisType,
        ...analysisResult
      };

    } catch (error) {
      console.error(`Error performing spatial analysis (${analysisType}):`, error);
      return {
        success: false,
        analysisType: analysisType,
        error: error.message
      };
    }
  }

  async generateDensityHeatmap(parameters) {
    console.log('Generating location density heatmap...');
    
    const { bounds, gridSize, category } = parameters;
    
    // Create grid cells for heatmap
    const gridCells = this.createSpatialGrid(bounds, gridSize);
    const heatmapData = [];

    for (const cell of gridCells) {
      // Count locations in each grid cell
      const cellQuery = {
        location: {
          $geoWithin: {
            $geometry: cell.geometry
          }
        }
      };

      if (category) {
        cellQuery.category = category;
      }

      const locationCount = await this.collections.locations.countDocuments(cellQuery);
      
      if (locationCount > 0) {
        heatmapData.push({
          cellId: cell.id,
          geometry: cell.geometry,
          center: cell.center,
          locationCount: locationCount,
          density: locationCount / cell.area // locations per square meter
        });
      }
    }

    // Calculate density statistics
    const densities = heatmapData.map(cell => cell.density);
    const maxDensity = Math.max(...densities);
    const avgDensity = densities.reduce((sum, d) => sum + d, 0) / densities.length;

    // Normalize density values for heatmap visualization
    const normalizedHeatmap = heatmapData.map(cell => ({
      ...cell,
      normalizedDensity: cell.density / maxDensity,
      intensityLevel: this.categorizeDensity(cell.density, maxDensity, avgDensity)
    }));

    return {
      heatmapData: normalizedHeatmap,
      statistics: {
        totalCells: gridCells.length,
        activeCells: heatmapData.length,
        maxDensity: maxDensity,
        averageDensity: avgDensity,
        totalLocations: heatmapData.reduce((sum, cell) => sum + cell.locationCount, 0)
      },
      metadata: {
        bounds: bounds,
        gridSize: gridSize,
        category: category,
        generatedAt: new Date()
      }
    };
  }

  async analyzeServiceCoverage(parameters) {
    console.log('Analyzing service coverage areas...');
    
    const { serviceType, analysisArea, coverageRadius } = parameters;
    
    // Get all service locations of the specified type
    const serviceLocations = await this.collections.locations
      .find({
        category: serviceType,
        active: true,
        location: {
          $geoWithin: {
            $geometry: analysisArea
          }
        }
      })
      .toArray();

    // Create coverage areas around each service location
    const coverageAreas = serviceLocations.map(location => ({
      serviceLocation: location,
      coverageArea: {
        type: 'Polygon',
        coordinates: [this.createCircleCoordinates(location.location, coverageRadius)]
      },
      radius: coverageRadius
    }));

    // Calculate union of all coverage areas
    const totalCoverage = await this.calculateCoverageUnion(coverageAreas);
    
    // Calculate coverage metrics
    const analysisAreaSize = this.calculatePolygonArea(analysisArea);
    const coveredAreaSize = this.calculatePolygonArea(totalCoverage);
    const coveragePercentage = (coveredAreaSize / analysisAreaSize) * 100;

    // Find coverage gaps
    const coverageGaps = await this.findCoverageGaps(analysisArea, totalCoverage);

    // Identify optimal locations for new services
    const optimalNewLocations = await this.findOptimalServiceLocations(
      coverageGaps, 
      serviceLocations, 
      coverageRadius
    );

    return {
      serviceType: serviceType,
      analysisArea: analysisArea,
      serviceLocations: serviceLocations,
      coverageAreas: coverageAreas,
      totalCoverage: totalCoverage,
      
      // Coverage metrics
      metrics: {
        totalServiceLocations: serviceLocations.length,
        analysisAreaSqKm: Math.round(analysisAreaSize / 1000000 * 100) / 100,
        coveredAreaSqKm: Math.round(coveredAreaSize / 1000000 * 100) / 100,
        coveragePercentage: Math.round(coveragePercentage * 100) / 100,
        gapCount: coverageGaps.length
      },
      
      // Recommendations
      recommendations: {
        coverageGaps: coverageGaps,
        optimalNewLocations: optimalNewLocations,
        serviceEfficiency: this.calculateServiceEfficiency(serviceLocations, totalCoverage)
      }
    };
  }

  async optimizeRoutes(parameters) {
    console.log('Optimizing routes for multiple stops...');
    
    const { startPoint, waypoints, endPoint, optimizationCriteria } = parameters;
    
    // Prepare all points for route optimization
    const allPoints = [startPoint, ...waypoints];
    if (endPoint && !this.pointsEqual(startPoint, endPoint)) {
      allPoints.push(endPoint);
    }

    // Calculate distance matrix between all points
    const distanceMatrix = await this.calculateDistanceMatrix(allPoints);
    
    // Apply route optimization algorithm based on criteria
    let optimizedRoute = {};
    
    switch (optimizationCriteria) {
      case 'shortest_distance':
        optimizedRoute = await this.optimizeForShortestDistance(allPoints, distanceMatrix);
        break;
        
      case 'fastest_time':
        optimizedRoute = await this.optimizeForFastestTime(allPoints, distanceMatrix);
        break;
        
      case 'balanced':
        optimizedRoute = await this.optimizeBalanced(allPoints, distanceMatrix);
        break;
        
      default:
        optimizedRoute = await this.optimizeForShortestDistance(allPoints, distanceMatrix);
    }

    // Calculate route statistics
    const routeStatistics = this.calculateRouteStatistics(optimizedRoute, distanceMatrix);
    
    // Generate turn-by-turn directions
    const directions = await this.generateRouteDirections(optimizedRoute.orderedPoints);

    return {
      originalPoints: {
        start: startPoint,
        waypoints: waypoints,
        end: endPoint
      },
      optimizedRoute: optimizedRoute,
      routeStatistics: routeStatistics,
      directions: directions,
      optimizationCriteria: optimizationCriteria,
      
      // Performance comparison
      improvement: {
        distanceReduction: routeStatistics.totalDistance < parameters.originalDistance 
          ? parameters.originalDistance - routeStatistics.totalDistance 
          : 0,
        timeReduction: routeStatistics.estimatedTime < parameters.originalTime 
          ? parameters.originalTime - routeStatistics.estimatedTime 
          : 0
      }
    };
  }

  // Utility methods for geospatial calculations

  calculateDistance(point1, point2) {
    // Use MongoDB's geospatial calculation or implement Haversine formula
    const R = 6371000; // Earth's radius in meters
    const lat1Rad = this.toRadians(point1.coordinates[1]);
    const lat2Rad = this.toRadians(point2.coordinates[1]);
    const deltaLatRad = this.toRadians(point2.coordinates[1] - point1.coordinates[1]);
    const deltaLngRad = this.toRadians(point2.coordinates[0] - point1.coordinates[0]);

    const a = Math.sin(deltaLatRad/2) * Math.sin(deltaLatRad/2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad/2) * Math.sin(deltaLngRad/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  calculateBearing(point1, point2) {
    const lat1Rad = this.toRadians(point1.coordinates[1]);
    const lat2Rad = this.toRadians(point2.coordinates[1]);
    const deltaLngRad = this.toRadians(point2.coordinates[0] - point1.coordinates[0]);

    const y = Math.sin(deltaLngRad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLngRad);

    const bearingRad = Math.atan2(y, x);
    return (this.toDegrees(bearingRad) + 360) % 360;
  }

  categorizeDistance(distanceMeters) {
    if (distanceMeters <= 100) return 'very_close';
    if (distanceMeters <= 500) return 'walking_distance';
    if (distanceMeters <= 2000) return 'nearby';
    if (distanceMeters <= 10000) return 'moderate_distance';
    return 'far';
  }

  normalizeGeometry(geometry) {
    // Ensure geometry follows GeoJSON specification
    if (!geometry || !geometry.type || !geometry.coordinates) {
      throw new Error('Invalid geometry format');
    }
    
    // Validate coordinate ranges
    this.validateCoordinates(geometry);
    
    return geometry;
  }

  validateCoordinates(geometry) {
    const validatePoint = (coords) => {
      if (!Array.isArray(coords) || coords.length < 2) {
        throw new Error('Invalid coordinate format');
      }
      
      const [lng, lat] = coords;
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new Error(`Invalid coordinates: [${lng}, ${lat}]`);
      }
    };

    switch (geometry.type) {
      case 'Point':
        validatePoint(geometry.coordinates);
        break;
        
      case 'LineString':
      case 'MultiPoint':
        geometry.coordinates.forEach(validatePoint);
        break;
        
      case 'Polygon':
      case 'MultiLineString':
        geometry.coordinates.forEach(ring => ring.forEach(validatePoint));
        break;
        
      case 'MultiPolygon':
        geometry.coordinates.forEach(polygon => 
          polygon.forEach(ring => ring.forEach(validatePoint))
        );
        break;
    }
  }

  createSpatialGrid(bounds, gridSize) {
    const grid = [];
    const { southwest, northeast } = bounds;
    
    const latStep = (northeast.coordinates[1] - southwest.coordinates[1]) / gridSize;
    const lngStep = (northeast.coordinates[0] - southwest.coordinates[0]) / gridSize;
    
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const sw = [
          southwest.coordinates[0] + (j * lngStep),
          southwest.coordinates[1] + (i * latStep)
        ];
        const ne = [
          southwest.coordinates[0] + ((j + 1) * lngStep),
          southwest.coordinates[1] + ((i + 1) * latStep)
        ];
        
        const cellGeometry = {
          type: 'Polygon',
          coordinates: [[
            sw,
            [ne[0], sw[1]],
            ne,
            [sw[0], ne[1]],
            sw
          ]]
        };
        
        grid.push({
          id: `cell_${i}_${j}`,
          geometry: cellGeometry,
          center: {
            type: 'Point',
            coordinates: [(sw[0] + ne[0]) / 2, (sw[1] + ne[1]) / 2]
          },
          area: this.calculatePolygonArea(cellGeometry)
        });
      }
    }
    
    return grid;
  }

  createCircleCoordinates(center, radiusMeters, points = 32) {
    const coords = [];
    const earthRadius = 6371000; // Earth radius in meters
    
    for (let i = 0; i < points; i++) {
      const angle = (i * 2 * Math.PI) / points;
      const lat = this.toRadians(center.coordinates[1]);
      const lng = this.toRadians(center.coordinates[0]);
      
      const newLat = Math.asin(
        Math.sin(lat) * Math.cos(radiusMeters / earthRadius) +
        Math.cos(lat) * Math.sin(radiusMeters / earthRadius) * Math.cos(angle)
      );
      
      const newLng = lng + Math.atan2(
        Math.sin(angle) * Math.sin(radiusMeters / earthRadius) * Math.cos(lat),
        Math.cos(radiusMeters / earthRadius) - Math.sin(lat) * Math.sin(newLat)
      );
      
      coords.push([this.toDegrees(newLng), this.toDegrees(newLat)]);
    }
    
    // Close the polygon
    coords.push(coords[0]);
    return coords;
  }

  calculatePolygonArea(polygon) {
    // Simplified area calculation for demonstration
    // In production, use proper spherical geometry calculations
    if (polygon.type !== 'Polygon') return 0;
    
    const coords = polygon.coordinates[0];
    let area = 0;
    
    for (let i = 0; i < coords.length - 1; i++) {
      area += coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1];
    }
    
    return Math.abs(area / 2) * 111000 * 111000; // Rough conversion to square meters
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  toDegrees(radians) {
    return radians * (180 / Math.PI);
  }

  generateGeofenceId() {
    return `geofence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Additional methods would include implementations for:
  // - setupSpatialAnalytics()
  // - setupGeospatialValidation()
  // - getPreviousGeofenceStatus()
  // - determineViolationType()
  // - updateGeofenceStatus()
  // - triggerGeofenceNotification()
  // - recordGeofenceAnalytics()
  // - checkGeofenceExits()
  // - calculateCoverageUnion()
  // - findCoverageGaps()
  // - findOptimalServiceLocations()
  // - calculateServiceEfficiency()
  // - calculateDistanceMatrix()
  // - optimizeForShortestDistance()
  // - optimizeForFastestTime()
  // - optimizeBalanced()
  // - calculateRouteStatistics()
  // - generateRouteDirections()
  // - performClusteringAnalysis()
  // - analyzeAccessibility()
  // - categorizeDensity()
  // - pointsEqual()
}

// Benefits of MongoDB Advanced Geospatial Operations:
// - Native 2dsphere indexing for efficient spherical geometry queries
// - Comprehensive geospatial operators for proximity, intersection, and containment
// - Support for complex geometric shapes and polygon operations
// - Optimized spatial indexing with configurable precision
// - Built-in coordinate system support and transformations
// - Advanced geofencing with real-time violation detection
// - Spatial aggregation and analytics capabilities
// - Route optimization and path planning functionality
// - High-performance location-based queries at scale
// - Integration with external mapping and routing services

module.exports = {
  AdvancedGeospatialManager
};
```

## Advanced Geospatial Query Patterns

### Location-Based Service Discovery

Implement sophisticated location-aware service discovery systems:

```javascript
// Advanced location-based service discovery
class LocationBasedServiceDiscovery extends AdvancedGeospatialManager {
  constructor(db, serviceConfig) {
    super(db, serviceConfig);
    
    this.serviceConfig = {
      ...serviceConfig,
      enableServiceRanking: true,
      enableCapacityAwareness: true,
      enableRealTimeUpdates: true,
      enableServiceQuality: true
    };
    
    this.setupServiceDiscovery();
  }

  async findOptimalServices(userLocation, serviceRequest) {
    console.log('Finding optimal services based on location and requirements...');
    
    const { serviceType, maxDistance, requirements, preferences } = serviceRequest;
    
    try {
      // Multi-criteria service discovery
      const serviceDiscoveryPipeline = [
        // Geographic proximity filter
        {
          $geoNear: {
            near: userLocation,
            distanceField: 'distance',
            maxDistance: maxDistance,
            spherical: true,
            query: {
              serviceType: serviceType,
              active: true,
              
              // Service availability filter
              'availability.currentlyAvailable': true,
              'availability.capacity': { $gt: 0 }
            }
          }
        },
        
        // Requirements matching
        {
          $match: this.buildRequirementsFilter(requirements)
        },
        
        // Service quality and rating filtering
        {
          $addFields: {
            qualityScore: {
              $multiply: [
                '$ratings.averageRating',
                { $divide: ['$ratings.totalReviews', 100] }
              ]
            },
            
            // Proximity score (closer = higher score)
            proximityScore: {
              $subtract: [
                maxDistance,
                '$distance'
              ]
            },
            
            // Availability score
            availabilityScore: {
              $divide: [
                '$availability.capacity',
                '$availability.maxCapacity'
              ]
            }
          }
        },
        
        // Calculate composite service score
        {
          $addFields: {
            compositeScore: {
              $add: [
                { $multiply: ['$qualityScore', 0.3] },
                { $multiply: ['$proximityScore', 0.4] },
                { $multiply: ['$availabilityScore', 0.3] }
              ]
            }
          }
        },
        
        // Apply preference-based boosting
        {
          $addFields: {
            finalScore: this.applyPreferenceBoosts('$compositeScore', preferences)
          }
        },
        
        // Sort by final score and limit results
        { $sort: { finalScore: -1, distance: 1 } },
        { $limit: 20 }
      ];

      const optimalServices = await this.collections.locations
        .aggregate(serviceDiscoveryPipeline)
        .toArray();

      // Enrich results with additional context
      const enrichedServices = await Promise.all(
        optimalServices.map(async service => ({
          ...service,
          
          // Estimated arrival time
          estimatedArrivalTime: await this.calculateEstimatedArrival(
            userLocation, 
            service.location
          ),
          
          // Real-time availability
          realTimeAvailability: await this.getRealTimeAvailability(service._id),
          
          // Service-specific recommendations
          recommendations: await this.generateServiceRecommendations(
            service, 
            userLocation, 
            preferences
          ),
          
          // Booking options
          bookingOptions: await this.getBookingOptions(service._id)
        }))
      );

      return {
        success: true,
        userLocation: userLocation,
        serviceRequest: serviceRequest,
        totalResults: enrichedServices.length,
        services: enrichedServices,
        
        // Discovery metadata
        discoveryMetadata: {
          searchRadius: maxDistance,
          averageDistance: this.calculateAverageDistance(enrichedServices),
          qualityDistribution: this.analyzeQualityDistribution(enrichedServices),
          availabilityRate: this.calculateAvailabilityRate(enrichedServices)
        }
      };

    } catch (error) {
      console.error('Error in service discovery:', error);
      return {
        success: false,
        error: error.message,
        userLocation: userLocation,
        serviceRequest: serviceRequest
      };
    }
  }

  async implementDynamicServiceZones(serviceArea, demandData) {
    console.log('Implementing dynamic service zones based on demand patterns...');
    
    try {
      // Analyze demand patterns
      const demandAnalysis = await this.analyzeDemandPatterns(demandData);
      
      // Create dynamic zones based on demand density
      const dynamicZones = await this.createDemandBasedZones(
        serviceArea, 
        demandAnalysis
      );
      
      // Optimize service allocation across zones
      const serviceAllocation = await this.optimizeServiceAllocation(
        dynamicZones, 
        demandAnalysis
      );
      
      // Update service areas and routing
      const updateResults = await this.updateServiceAreas(serviceAllocation);
      
      return {
        success: true,
        serviceArea: serviceArea,
        dynamicZones: dynamicZones,
        serviceAllocation: serviceAllocation,
        updateResults: updateResults,
        
        // Performance metrics
        metrics: {
          totalZones: dynamicZones.length,
          averageResponseTime: serviceAllocation.averageResponseTime,
          coverageEfficiency: serviceAllocation.coverageEfficiency,
          demandSatisfaction: serviceAllocation.demandSatisfaction
        }
      };

    } catch (error) {
      console.error('Error implementing dynamic service zones:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

## SQL-Style Geospatial Queries with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB geospatial operations:

```sql
-- QueryLeaf advanced geospatial operations with SQL-familiar syntax for MongoDB

-- Proximity queries with distance calculations
SELECT 
    name,
    address,
    category,
    location,
    
    -- Calculate distance from center point
    ST_DISTANCE(
        location,
        ST_GEOMFROMTEXT('POINT(-74.0060 40.7128)', 4326)  -- NYC coordinates
    ) as distance_meters,
    
    -- Categorize proximity
    CASE 
        WHEN ST_DISTANCE(location, ST_GEOMFROMTEXT('POINT(-74.0060 40.7128)', 4326)) <= 500 THEN 'walking_distance'
        WHEN ST_DISTANCE(location, ST_GEOMFROMTEXT('POINT(-74.0060 40.7128)', 4326)) <= 2000 THEN 'nearby'
        WHEN ST_DISTANCE(location, ST_GEOMFROMTEXT('POINT(-74.0060 40.7128)', 4326)) <= 10000 THEN 'moderate_distance'
        ELSE 'far'
    END as proximity_category,
    
    -- Calculate bearing
    ST_AZIMUTH(
        ST_GEOMFROMTEXT('POINT(-74.0060 40.7128)', 4326),
        location
    ) as bearing_degrees,
    
    -- Additional location context
    ratings.average_rating,
    availability.currently_available,
    hours.is_open_now
    
FROM locations
WHERE 
    -- Proximity filter using spatial index
    ST_DWITHIN(
        location, 
        ST_GEOMFROMTEXT('POINT(-74.0060 40.7128)', 4326), 
        10000  -- 10km radius
    )
    
    -- Additional filters
    AND category = 'restaurant'
    AND active = true
    AND ratings.average_rating >= 4.0
    
    -- Availability constraints
    AND availability.currently_available = true
    AND availability.capacity > 0
    
ORDER BY 
    -- Primary sort by distance
    ST_DISTANCE(location, ST_GEOMFROMTEXT('POINT(-74.0060 40.7128)', 4326)),
    -- Secondary sort by rating
    ratings.average_rating DESC,
    -- Tertiary sort by availability
    availability.capacity DESC
    
LIMIT 50;

-- Advanced geofencing with violation detection
WITH user_movements AS (
    SELECT 
        user_id,
        location,
        timestamp,
        
        -- Previous location for movement analysis
        LAG(location) OVER (
            PARTITION BY user_id 
            ORDER BY timestamp
        ) as previous_location,
        
        LAG(timestamp) OVER (
            PARTITION BY user_id 
            ORDER BY timestamp
        ) as previous_timestamp
        
    FROM tracking_data
    WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
),

geofence_violations AS (
    SELECT 
        um.user_id,
        um.location,
        um.timestamp,
        gf.geofence_id,
        gf.name as geofence_name,
        gf.properties.type as geofence_type,
        
        -- Check if current location is within geofence
        ST_CONTAINS(gf.geometry, um.location) as currently_inside,
        
        -- Check if previous location was within geofence
        CASE 
            WHEN um.previous_location IS NOT NULL THEN
                ST_CONTAINS(gf.geometry, um.previous_location)
            ELSE false
        END as previously_inside,
        
        -- Determine violation type
        CASE 
            WHEN ST_CONTAINS(gf.geometry, um.location) 
                 AND NOT ST_CONTAINS(gf.geometry, um.previous_location) THEN 'entry'
            WHEN NOT ST_CONTAINS(gf.geometry, um.location) 
                 AND ST_CONTAINS(gf.geometry, um.previous_location) THEN 'exit'
            WHEN ST_CONTAINS(gf.geometry, um.location) 
                 AND ST_CONTAINS(gf.geometry, um.previous_location) THEN 'dwell'
            ELSE 'outside'
        END as violation_type,
        
        -- Calculate dwell time for entry violations
        CASE 
            WHEN ST_CONTAINS(gf.geometry, um.location) THEN
                EXTRACT(SECONDS FROM (um.timestamp - um.previous_timestamp))
            ELSE 0
        END as dwell_seconds,
        
        -- Distance to geofence boundary
        ST_DISTANCE(
            um.location,
            ST_BOUNDARY(gf.geometry)
        ) as distance_to_boundary
        
    FROM user_movements um
    CROSS JOIN geofences gf
    WHERE 
        gf.properties.active = true
        
        -- Only check geofences that are relevant to current location
        AND ST_DWITHIN(
            um.location, 
            gf.geometry, 
            gf.properties.buffer_distance
        )
),

violation_summary AS (
    SELECT 
        user_id,
        geofence_id,
        geofence_name,
        geofence_type,
        violation_type,
        COUNT(*) as violation_count,
        MIN(timestamp) as first_violation,
        MAX(timestamp) as last_violation,
        AVG(dwell_seconds) as average_dwell_time,
        SUM(dwell_seconds) as total_dwell_time,
        
        -- Risk assessment
        CASE 
            WHEN geofence_type = 'restricted' AND violation_type = 'entry' THEN 'high'
            WHEN geofence_type = 'monitoring' AND violation_type = 'dwell' 
                 AND SUM(dwell_seconds) > 300 THEN 'medium'
            ELSE 'low'
        END as risk_level
        
    FROM geofence_violations
    WHERE violation_type IN ('entry', 'exit', 'dwell')
    GROUP BY user_id, geofence_id, geofence_name, geofence_type, violation_type
)

SELECT 
    user_id,
    geofence_name,
    geofence_type,
    violation_type,
    violation_count,
    first_violation,
    last_violation,
    
    -- Time-based analysis
    EXTRACT(MINUTES FROM (last_violation - first_violation)) as violation_duration_minutes,
    ROUND(average_dwell_time, 2) as avg_dwell_seconds,
    ROUND(total_dwell_time / 60.0, 2) as total_dwell_minutes,
    
    -- Risk and priority
    risk_level,
    
    -- Priority score for alerts
    CASE risk_level
        WHEN 'high' THEN 100
        WHEN 'medium' THEN 50
        ELSE 10
    END as priority_score,
    
    -- Recommended actions
    CASE 
        WHEN risk_level = 'high' THEN 'immediate_notification'
        WHEN risk_level = 'medium' AND total_dwell_time > 600 THEN 'monitor_closely'
        ELSE 'log_only'
    END as recommended_action
    
FROM violation_summary
WHERE risk_level != 'low'
ORDER BY priority_score DESC, first_violation DESC;

-- Spatial aggregation and density analysis
WITH spatial_grid AS (
    -- Create grid cells for spatial analysis
    SELECT 
        grid_id,
        ST_MAKEENVELOPE(
            grid_x * 0.01 - 74.1,     -- Grid cell boundaries
            grid_y * 0.01 + 40.6,
            (grid_x + 1) * 0.01 - 74.1,
            (grid_y + 1) * 0.01 + 40.6,
            4326
        ) as grid_cell,
        
        -- Grid cell center point
        ST_CENTROID(
            ST_MAKEENVELOPE(
                grid_x * 0.01 - 74.1,
                grid_y * 0.01 + 40.6,
                (grid_x + 1) * 0.01 - 74.1,
                (grid_y + 1) * 0.01 + 40.6,
                4326
            )
        ) as grid_center
        
    FROM generate_series(0, 20) as grid_x
    CROSS JOIN generate_series(0, 20) as grid_y
),

location_density AS (
    SELECT 
        sg.grid_id,
        sg.grid_cell,
        sg.grid_center,
        
        -- Count locations in each grid cell
        COUNT(l.location_id) as location_count,
        
        -- Category breakdown
        COUNT(*) FILTER (WHERE l.category = 'restaurant') as restaurant_count,
        COUNT(*) FILTER (WHERE l.category = 'retail') as retail_count,
        COUNT(*) FILTER (WHERE l.category = 'service') as service_count,
        
        -- Rating analysis
        AVG(l.ratings.average_rating) as avg_rating,
        COUNT(*) FILTER (WHERE l.ratings.average_rating >= 4.5) as high_rated_count,
        
        -- Calculate density per square kilometer
        COUNT(l.location_id) / ST_AREA(
            ST_TRANSFORM(sg.grid_cell, 3857)  -- Transform to projected CRS for area calculation
        ) * 1000000 as density_per_sqkm,
        
        -- Grid cell area in square kilometers
        ST_AREA(ST_TRANSFORM(sg.grid_cell, 3857)) / 1000000 as cell_area_sqkm
        
    FROM spatial_grid sg
    LEFT JOIN locations l ON ST_CONTAINS(sg.grid_cell, l.location)
    GROUP BY sg.grid_id, sg.grid_cell, sg.grid_center
),

density_analysis AS (
    SELECT 
        *,
        
        -- Density classification
        CASE 
            WHEN density_per_sqkm >= 100 THEN 'very_dense'
            WHEN density_per_sqkm >= 50 THEN 'dense'
            WHEN density_per_sqkm >= 20 THEN 'moderate'
            WHEN density_per_sqkm >= 5 THEN 'sparse'
            ELSE 'very_sparse'
        END as density_class,
        
        -- Service diversity index
        CASE 
            WHEN restaurant_count + retail_count + service_count = 0 THEN 0
            ELSE (
                CASE WHEN restaurant_count > 0 THEN 1 ELSE 0 END +
                CASE WHEN retail_count > 0 THEN 1 ELSE 0 END +
                CASE WHEN service_count > 0 THEN 1 ELSE 0 END
            )
        END as service_diversity,
        
        -- Quality score
        CASE 
            WHEN location_count = 0 THEN 0
            ELSE (high_rated_count::DECIMAL / location_count) * 100
        END as quality_percentage
        
    FROM location_density
)

SELECT 
    grid_id,
    ST_X(grid_center) as center_longitude,
    ST_Y(grid_center) as center_latitude,
    location_count,
    
    -- Category distribution
    restaurant_count,
    retail_count,
    service_count,
    
    -- Density metrics
    ROUND(density_per_sqkm, 2) as density_per_sqkm,
    density_class,
    
    -- Quality metrics
    ROUND(avg_rating, 2) as avg_rating,
    high_rated_count,
    ROUND(quality_percentage, 1) as quality_percentage,
    
    -- Diversity and mixed-use analysis
    service_diversity,
    
    -- Area characteristics
    ROUND(cell_area_sqkm, 4) as cell_area_sqkm,
    
    -- Heat map values for visualization
    CASE density_class
        WHEN 'very_dense' THEN 1.0
        WHEN 'dense' THEN 0.8
        WHEN 'moderate' THEN 0.6
        WHEN 'sparse' THEN 0.3
        ELSE 0.1
    END as heat_intensity,
    
    -- Recommendations
    CASE 
        WHEN density_class = 'very_sparse' AND service_diversity = 0 THEN 'expansion_opportunity'
        WHEN density_class IN ('dense', 'very_dense') AND quality_percentage < 50 THEN 'quality_improvement_needed'
        WHEN service_diversity <= 1 AND location_count >= 5 THEN 'diversification_opportunity'
        ELSE 'well_served'
    END as area_recommendation
    
FROM density_analysis
WHERE location_count > 0  -- Only show areas with locations
ORDER BY density_per_sqkm DESC, quality_percentage DESC;

-- Route optimization with multiple waypoints
WITH route_waypoints AS (
    SELECT 
        waypoint_id,
        ST_GEOMFROMTEXT(waypoint_coordinates, 4326) as waypoint_location,
        waypoint_order,
        waypoint_type,
        service_time_minutes,
        priority_level
    FROM route_stops
    WHERE route_id = :route_id
),

distance_matrix AS (
    SELECT 
        w1.waypoint_id as from_waypoint,
        w2.waypoint_id as to_waypoint,
        
        -- Calculate distances between all waypoint pairs
        ST_DISTANCE(w1.waypoint_location, w2.waypoint_location) as distance_meters,
        
        -- Estimate travel time (simplified - would use routing service in production)
        (ST_DISTANCE(w1.waypoint_location, w2.waypoint_location) / 1000) / 50 * 60 as estimated_minutes,
        
        -- Calculate bearing for navigation
        ST_AZIMUTH(w1.waypoint_location, w2.waypoint_location) as bearing_radians
        
    FROM route_waypoints w1
    CROSS JOIN route_waypoints w2
    WHERE w1.waypoint_id != w2.waypoint_id
),

optimized_sequence AS (
    -- Simplified optimization (in production would use advanced algorithms)
    SELECT 
        rw.*,
        
        -- Calculate priority-weighted score for ordering
        (rw.priority_level * 0.4) + 
        ((10 - rw.waypoint_order) * 0.3) +  -- Original order preference
        (rw.service_time_minutes * 0.3) as optimization_score,
        
        -- Assign new optimized order
        ROW_NUMBER() OVER (ORDER BY 
            rw.priority_level DESC,
            rw.waypoint_order ASC
        ) as optimized_order
        
    FROM route_waypoints rw
),

route_segments AS (
    SELECT 
        os1.waypoint_id as from_waypoint,
        os1.waypoint_location as from_location,
        os1.waypoint_type as from_type,
        os1.service_time_minutes as from_service_time,
        
        os2.waypoint_id as to_waypoint,
        os2.waypoint_location as to_location,
        os2.waypoint_type as to_type,
        os2.service_time_minutes as to_service_time,
        
        -- Segment details from distance matrix
        dm.distance_meters as segment_distance,
        dm.estimated_minutes as travel_time,
        dm.bearing_radians,
        
        -- Convert bearing to compass direction
        CASE 
            WHEN dm.bearing_radians BETWEEN 0 AND PI()/8 OR dm.bearing_radians > 15*PI()/8 THEN 'North'
            WHEN dm.bearing_radians BETWEEN PI()/8 AND 3*PI()/8 THEN 'Northeast'
            WHEN dm.bearing_radians BETWEEN 3*PI()/8 AND 5*PI()/8 THEN 'East'
            WHEN dm.bearing_radians BETWEEN 5*PI()/8 AND 7*PI()/8 THEN 'Southeast'
            WHEN dm.bearing_radians BETWEEN 7*PI()/8 AND 9*PI()/8 THEN 'South'
            WHEN dm.bearing_radians BETWEEN 9*PI()/8 AND 11*PI()/8 THEN 'Southwest'
            WHEN dm.bearing_radians BETWEEN 11*PI()/8 AND 13*PI()/8 THEN 'West'
            ELSE 'Northwest'
        END as compass_direction,
        
        os1.optimized_order as segment_order
        
    FROM optimized_sequence os1
    JOIN optimized_sequence os2 ON os2.optimized_order = os1.optimized_order + 1
    JOIN distance_matrix dm ON dm.from_waypoint = os1.waypoint_id 
                              AND dm.to_waypoint = os2.waypoint_id
),

route_summary AS (
    SELECT 
        COUNT(*) as total_segments,
        SUM(segment_distance) as total_distance_meters,
        SUM(travel_time) as total_travel_minutes,
        SUM(to_service_time) as total_service_minutes,
        AVG(segment_distance) as avg_segment_distance,
        
        -- Route efficiency metrics
        SUM(segment_distance) / 1000 as total_distance_km,
        (SUM(travel_time) + SUM(to_service_time)) as total_route_time,
        
        -- Calculate route efficiency (distance/time ratio)
        CASE 
            WHEN SUM(travel_time) > 0 THEN 
                (SUM(segment_distance) / 1000) / (SUM(travel_time) / 60)
            ELSE 0
        END as avg_speed_kmh
        
    FROM route_segments
)

SELECT 
    -- Route segment details
    segment_order,
    from_waypoint,
    to_waypoint,
    from_type,
    to_type,
    
    -- Distance and time
    ROUND(segment_distance, 0) as distance_meters,
    ROUND(segment_distance / 1000.0, 2) as distance_km,
    ROUND(travel_time, 1) as travel_minutes,
    from_service_time as service_minutes,
    
    -- Navigation details
    compass_direction,
    ROUND(DEGREES(bearing_radians), 1) as bearing_degrees,
    
    -- Cumulative totals
    SUM(segment_distance) OVER (
        ORDER BY segment_order 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) / 1000.0 as cumulative_distance_km,
    
    SUM(travel_time + from_service_time) OVER (
        ORDER BY segment_order 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as cumulative_time_minutes,
    
    -- Route coordinates for mapping
    ST_ASTEXT(from_location) as from_coordinates,
    ST_ASTEXT(to_location) as to_coordinates
    
FROM route_segments
ORDER BY segment_order;

-- Show route summary
SELECT 
    total_segments,
    ROUND(total_distance_km, 2) as total_distance_km,
    ROUND(total_travel_minutes, 1) as travel_time_minutes,
    ROUND(total_service_minutes, 1) as service_time_minutes,
    ROUND(total_route_time, 1) as total_time_minutes,
    ROUND(avg_speed_kmh, 1) as average_speed_kmh,
    
    -- Time breakdown
    ROUND(total_travel_minutes / total_route_time * 100, 1) as travel_time_percentage,
    ROUND(total_service_minutes / total_route_time * 100, 1) as service_time_percentage,
    
    -- Efficiency assessment
    CASE 
        WHEN avg_speed_kmh >= 40 THEN 'efficient'
        WHEN avg_speed_kmh >= 25 THEN 'moderate'
        ELSE 'inefficient'
    END as route_efficiency,
    
    -- Estimated completion time
    CURRENT_TIMESTAMP + (total_route_time * INTERVAL '1 minute') as estimated_completion
    
FROM route_summary;

-- QueryLeaf provides comprehensive MongoDB geospatial capabilities:
-- 1. Native 2dsphere indexing for efficient spherical geometry
-- 2. Advanced spatial operators for proximity and containment queries
-- 3. Geofencing with real-time violation detection
-- 4. Spatial aggregation and density analysis
-- 5. Route optimization with multiple waypoints
-- 6. SQL-familiar syntax for complex geospatial operations
-- 7. Integration with coordinate reference systems
-- 8. High-performance location-based queries
-- 9. Advanced spatial analytics and reporting
-- 10. Seamless integration with mapping and routing services
```

## Best Practices for Production Geospatial Applications

### Performance Optimization and Indexing Strategy

Essential principles for effective MongoDB geospatial application deployment:

1. **Spatial Indexing**: Create appropriate 2dsphere indexes for spherical geometry operations
2. **Query Optimization**: Use bounding box filters before expensive spatial operations
3. **Data Modeling**: Store coordinates in GeoJSON format for optimal performance
4. **Precision Management**: Configure appropriate coordinate precision for use case requirements
5. **Caching Strategy**: Implement spatial caching for frequently accessed location data
6. **Connection Pooling**: Optimize database connections for geospatial query patterns

### Scalability and Production Deployment

Optimize geospatial operations for enterprise-scale requirements:

1. **Sharding Strategy**: Design shard keys that support geospatial query patterns
2. **Load Balancing**: Distribute geospatial queries across replica set members
3. **Real-Time Processing**: Implement efficient real-time location tracking and updates
4. **Data Archiving**: Manage historical location data with appropriate retention policies
5. **Monitoring Integration**: Track geospatial query performance and resource utilization
6. **Error Handling**: Implement robust error handling for location service failures

## Conclusion

MongoDB geospatial queries provide comprehensive location data management capabilities that enable sophisticated location-based applications with advanced geographic indexing, proximity searches, geofencing, and spatial analysis features. The native geospatial support ensures that location-aware applications can scale efficiently while maintaining high query performance and accurate spatial calculations.

Key MongoDB Geospatial benefits include:

- **Advanced Spatial Indexing**: Optimized 2dsphere indexes for efficient spherical geometry operations
- **Comprehensive Query Operators**: Rich set of spatial operators for proximity, intersection, and containment queries
- **Real-Time Geofencing**: Efficient geofence violation detection with customizable trigger conditions
- **Spatial Analytics**: Built-in aggregation capabilities for density analysis and geographic reporting
- **Route Optimization**: Advanced algorithms for multi-waypoint route planning and optimization
- **SQL Accessibility**: Familiar SQL-style geospatial operations through QueryLeaf for accessible location data management

Whether you're building ride-sharing platforms, delivery applications, location-based social networks, or asset tracking systems, MongoDB geospatial capabilities with QueryLeaf's familiar SQL interface provide the foundation for sophisticated location-aware applications.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL-style spatial operations into MongoDB's native geospatial queries, making advanced location-based functionality accessible to SQL-oriented development teams. Complex spatial calculations, proximity searches, and geofencing operations are seamlessly handled through familiar SQL constructs, enabling sophisticated location-based applications without requiring deep MongoDB geospatial expertise.

The combination of MongoDB's robust geospatial capabilities with SQL-style spatial operations makes it an ideal platform for applications requiring both sophisticated location-based functionality and familiar database management patterns, ensuring your geospatial operations can scale efficiently while maintaining accuracy and performance as data volume and query complexity grow.