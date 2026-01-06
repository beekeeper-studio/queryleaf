---
title: "MongoDB Change Streams and Event-Driven Architecture: Real-Time Data Processing and Reactive Application Development with SQL-Compatible Operations"
description: "Master MongoDB Change Streams for event-driven architecture, real-time data processing, and reactive application development. Learn advanced patterns for building responsive systems with streaming data pipelines and SQL-familiar change event operations."
date: 2025-01-05
tags: [mongodb, change-streams, event-driven, real-time, reactive, data-processing, streaming, sql]
---

# MongoDB Change Streams and Event-Driven Architecture: Real-Time Data Processing and Reactive Application Development with SQL-Compatible Operations

Modern applications increasingly require real-time responsiveness to data changes, enabling immediate updates across distributed systems, live dashboards, notification systems, and collaborative features. Traditional polling-based approaches create significant performance overhead, increase database load, and introduce unacceptable latency for responsive user experiences.

MongoDB Change Streams provide native event-driven capabilities that eliminate polling overhead through real-time change notifications, enabling sophisticated reactive architectures with guaranteed delivery, resumability, and comprehensive filtering. Unlike traditional database triggers or external message queues that require complex infrastructure management, Change Streams deliver enterprise-grade real-time data processing with automatic failover, distributed coordination, and seamless integration with MongoDB's operational model.

## The Traditional Change Detection Challenge

Conventional approaches to detecting data changes involve significant complexity, performance penalties, and reliability issues:

```sql
-- Traditional PostgreSQL change detection - complex polling with performance overhead

-- Audit table approach with triggers (complex maintenance and performance impact)
CREATE TABLE product_audit (
    audit_id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL,
    operation_type VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    change_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id BIGINT,
    session_id VARCHAR(100),
    application_context JSONB,
    
    -- Performance indexes
    INDEX audit_product_time_idx (product_id, change_timestamp DESC),
    INDEX audit_operation_time_idx (operation_type, change_timestamp DESC)
);

-- Complex trigger function for change tracking
CREATE OR REPLACE FUNCTION track_product_changes()
RETURNS TRIGGER AS $$
DECLARE
    old_json JSONB;
    new_json JSONB;
    changed_fields TEXT[] := ARRAY[]::TEXT[];
    field_name TEXT;
    field_value_old TEXT;
    field_value_new TEXT;
BEGIN
    -- Handle different operation types
    CASE TG_OP
        WHEN 'INSERT' THEN
            new_json := row_to_json(NEW)::JSONB;
            INSERT INTO product_audit (
                product_id, operation_type, new_data, 
                changed_fields, user_id, session_id
            ) VALUES (
                NEW.product_id, 'INSERT', new_json,
                array(select key from jsonb_each(new_json)),
                NEW.last_modified_by, NEW.session_id
            );
            RETURN NEW;
            
        WHEN 'UPDATE' THEN
            old_json := row_to_json(OLD)::JSONB;
            new_json := row_to_json(NEW)::JSONB;
            
            -- Complex field-by-field comparison for change detection
            FOR field_name IN SELECT key FROM jsonb_each(new_json) LOOP
                field_value_old := COALESCE((old_json->>field_name), '');
                field_value_new := COALESCE((new_json->>field_name), '');
                
                IF field_value_old != field_value_new THEN
                    changed_fields := array_append(changed_fields, field_name);
                END IF;
            END LOOP;
            
            -- Only log if there are actual changes
            IF array_length(changed_fields, 1) > 0 THEN
                INSERT INTO product_audit (
                    product_id, operation_type, old_data, new_data,
                    changed_fields, user_id, session_id
                ) VALUES (
                    NEW.product_id, 'UPDATE', old_json, new_json,
                    changed_fields, NEW.last_modified_by, NEW.session_id
                );
            END IF;
            RETURN NEW;
            
        WHEN 'DELETE' THEN
            old_json := row_to_json(OLD)::JSONB;
            INSERT INTO product_audit (
                product_id, operation_type, old_data,
                changed_fields, user_id, session_id
            ) VALUES (
                OLD.product_id, 'DELETE', old_json,
                array(select key from jsonb_each(old_json)),
                OLD.last_modified_by, OLD.session_id
            );
            RETURN OLD;
    END CASE;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers on multiple tables (maintenance overhead)
CREATE TRIGGER product_changes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION track_product_changes();

CREATE TRIGGER inventory_changes_trigger  
    AFTER INSERT OR UPDATE OR DELETE ON inventory
    FOR EACH ROW EXECUTE FUNCTION track_inventory_changes();

-- Polling-based change consumption (expensive and unreliable)
WITH recent_changes AS (
    SELECT 
        pa.audit_id,
        pa.product_id,
        pa.operation_type,
        pa.old_data,
        pa.new_data,
        pa.changed_fields,
        pa.change_timestamp,
        pa.user_id,
        pa.session_id,
        
        -- Product context enrichment (expensive joins)
        p.name as product_name,
        p.category_id,
        p.current_price,
        p.status,
        c.category_name,
        
        -- Change analysis
        CASE 
            WHEN pa.operation_type = 'INSERT' THEN 'Product Created'
            WHEN pa.operation_type = 'UPDATE' AND 'current_price' = ANY(pa.changed_fields) THEN 'Price Updated'
            WHEN pa.operation_type = 'UPDATE' AND 'status' = ANY(pa.changed_fields) THEN 'Status Changed'
            WHEN pa.operation_type = 'UPDATE' THEN 'Product Modified'
            WHEN pa.operation_type = 'DELETE' THEN 'Product Removed'
        END as change_description,
        
        -- Business impact assessment
        CASE 
            WHEN pa.operation_type = 'UPDATE' AND 'current_price' = ANY(pa.changed_fields) THEN
                CASE 
                    WHEN (pa.new_data->>'current_price')::DECIMAL > (pa.old_data->>'current_price')::DECIMAL 
                    THEN 'Price Increase'
                    ELSE 'Price Decrease'
                END
            WHEN pa.operation_type = 'UPDATE' AND 'inventory_count' = ANY(pa.changed_fields) THEN
                CASE 
                    WHEN (pa.new_data->>'inventory_count')::INTEGER <= 5 THEN 'Low Stock Alert'
                    WHEN (pa.new_data->>'inventory_count')::INTEGER = 0 THEN 'Out of Stock'
                    ELSE 'Inventory Updated'
                END
        END as business_impact,
        
        -- Notification targeting
        CASE 
            WHEN pa.operation_type = 'INSERT' THEN ARRAY['product_managers', 'inventory_team']
            WHEN pa.operation_type = 'UPDATE' AND 'current_price' = ANY(pa.changed_fields) 
                THEN ARRAY['pricing_team', 'sales_team', 'customers']
            WHEN pa.operation_type = 'UPDATE' AND 'inventory_count' = ANY(pa.changed_fields) 
                THEN ARRAY['inventory_team', 'fulfillment']
            WHEN pa.operation_type = 'DELETE' THEN ARRAY['product_managers', 'customers']
            ELSE ARRAY['general_subscribers']
        END as notification_targets
        
    FROM product_audit pa
    LEFT JOIN products p ON pa.product_id = p.product_id
    LEFT JOIN categories c ON p.category_id = c.category_id
    WHERE pa.change_timestamp > (
        -- Get last processed timestamp (requires external state management)
        SELECT COALESCE(last_processed_timestamp, CURRENT_TIMESTAMP - INTERVAL '5 minutes')
        FROM change_processing_checkpoint 
        WHERE processor_name = 'product_change_handler'
    )
    ORDER BY pa.change_timestamp ASC
),

change_aggregation AS (
    -- Complex aggregation for batch processing
    SELECT 
        rc.product_id,
        rc.product_name,
        rc.category_name,
        COUNT(*) as total_changes,
        
        -- Change type counts
        COUNT(*) FILTER (WHERE operation_type = 'INSERT') as creates,
        COUNT(*) FILTER (WHERE operation_type = 'UPDATE') as updates, 
        COUNT(*) FILTER (WHERE operation_type = 'DELETE') as deletes,
        
        -- Business impact analysis
        COUNT(*) FILTER (WHERE business_impact LIKE '%Price%') as price_changes,
        COUNT(*) FILTER (WHERE business_impact LIKE '%Stock%') as inventory_changes,
        
        -- Change timeline
        MIN(change_timestamp) as first_change,
        MAX(change_timestamp) as last_change,
        EXTRACT(SECONDS FROM (MAX(change_timestamp) - MIN(change_timestamp))) as change_window_seconds,
        
        -- Most recent change details
        (array_agg(rc.operation_type ORDER BY rc.change_timestamp DESC))[1] as latest_operation,
        (array_agg(rc.change_description ORDER BY rc.change_timestamp DESC))[1] as latest_description,
        (array_agg(rc.business_impact ORDER BY rc.change_timestamp DESC))[1] as latest_impact,
        
        -- Notification consolidation
        array_agg(DISTINCT unnest(rc.notification_targets)) as all_notification_targets,
        
        -- Change velocity (changes per minute)
        CASE 
            WHEN EXTRACT(SECONDS FROM (MAX(change_timestamp) - MIN(change_timestamp))) > 0 
            THEN COUNT(*)::DECIMAL / (EXTRACT(SECONDS FROM (MAX(change_timestamp) - MIN(change_timestamp))) / 60)
            ELSE COUNT(*)::DECIMAL
        END as changes_per_minute
        
    FROM recent_changes rc
    GROUP BY rc.product_id, rc.product_name, rc.category_name
),

notification_prioritization AS (
    SELECT 
        ca.*,
        
        -- Priority scoring
        (
            -- Change frequency component
            LEAST(changes_per_minute * 2, 10) +
            
            -- Business impact component  
            CASE 
                WHEN price_changes > 0 THEN 5
                WHEN inventory_changes > 0 THEN 4
                WHEN creates > 0 THEN 3
                WHEN deletes > 0 THEN 6
                ELSE 1
            END +
            
            -- Recency component
            CASE 
                WHEN change_window_seconds < 300 THEN 3  -- Within 5 minutes
                WHEN change_window_seconds < 3600 THEN 2 -- Within 1 hour
                ELSE 1
            END
        ) as priority_score,
        
        -- Alert classification
        CASE 
            WHEN deletes > 0 THEN 'critical'
            WHEN price_changes > 0 AND changes_per_minute > 1 THEN 'high'
            WHEN inventory_changes > 0 THEN 'medium'
            WHEN creates > 0 THEN 'low'
            ELSE 'informational'
        END as alert_level,
        
        -- Message formatting
        CASE 
            WHEN total_changes = 1 THEN latest_description
            ELSE CONCAT(total_changes, ' changes to ', product_name, ' (', latest_description, ')')
        END as notification_message
        
    FROM change_aggregation ca
)

-- Final change processing output (still requires external message queue)
SELECT 
    np.product_id,
    np.product_name, 
    np.category_name,
    np.total_changes,
    np.priority_score,
    np.alert_level,
    np.notification_message,
    np.all_notification_targets,
    np.last_change,
    
    -- Processing metadata
    CURRENT_TIMESTAMP as processed_at,
    'product_change_handler' as processor_name,
    
    -- External system integration requirements
    CASE alert_level
        WHEN 'critical' THEN 'immediate_push_notification'
        WHEN 'high' THEN 'priority_email_and_push' 
        WHEN 'medium' THEN 'email_notification'
        ELSE 'dashboard_update_only'
    END as delivery_method,
    
    -- Routing information for message queue
    CASE 
        WHEN 'customers' = ANY(all_notification_targets) THEN 'customer_notifications_queue'
        WHEN 'pricing_team' = ANY(all_notification_targets) THEN 'internal_alerts_queue'
        ELSE 'general_updates_queue'
    END as routing_key,
    
    -- Deduplication key (manual implementation required)
    MD5(CONCAT(product_id, ':', array_to_string(all_notification_targets, ','), ':', DATE_TRUNC('minute', last_change))) as deduplication_key

FROM notification_prioritization np
WHERE priority_score >= 3  -- Filter low-priority notifications
ORDER BY priority_score DESC, last_change DESC;

-- Update checkpoint after processing (manual transaction management)
UPDATE change_processing_checkpoint 
SET 
    last_processed_timestamp = CURRENT_TIMESTAMP,
    processed_count = processed_count + (SELECT COUNT(*) FROM recent_changes),
    last_updated = CURRENT_TIMESTAMP
WHERE processor_name = 'product_change_handler';

-- Traditional polling approach problems:
-- 1. Expensive polling operations creating unnecessary database load
-- 2. Complex trigger-based audit tables requiring extensive maintenance
-- 3. Race conditions and missed changes during high-concurrency periods
-- 4. Manual checkpoint management and external state tracking required
-- 5. Complex field-level change detection with performance overhead
-- 6. No guaranteed delivery or automatic failure recovery mechanisms
-- 7. Difficult horizontal scaling of change processing systems
-- 8. External message queue infrastructure required for reliability
-- 9. Manual deduplication and ordering logic implementation required
-- 10. Limited filtering capabilities and expensive context enrichment queries
```

MongoDB Change Streams eliminate polling complexity with native real-time change notifications:

```javascript
// MongoDB Change Streams - native real-time change processing with comprehensive event handling
const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('ecommerce_platform');

// Advanced MongoDB Change Streams Manager
class MongoDBChangeStreamsManager {
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      // Change stream configuration
      enableChangeStreams: config.enableChangeStreams !== false,
      resumeAfterFailure: config.resumeAfterFailure !== false,
      batchSize: config.batchSize || 100,
      maxAwaitTimeMS: config.maxAwaitTimeMS || 1000,
      
      // Event processing configuration
      enableEventEnrichment: config.enableEventEnrichment !== false,
      enableEventFiltering: config.enableEventFiltering !== false,
      enableEventAggregation: config.enableEventAggregation !== false,
      enableEventRouting: config.enableEventRouting !== false,
      
      // Reliability and resilience  
      enableAutoResume: config.enableAutoResume !== false,
      enableDeadLetterQueue: config.enableDeadLetterQueue !== false,
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 1000,
      
      // Performance optimization
      enableParallelProcessing: config.enableParallelProcessing !== false,
      processingConcurrency: config.processingConcurrency || 10,
      enableBatchProcessing: config.enableBatchProcessing !== false,
      batchProcessingWindowMs: config.batchProcessingWindowMs || 5000,
      
      // Monitoring and observability
      enableMetrics: config.enableMetrics !== false,
      enableLogging: config.enableLogging !== false,
      logLevel: config.logLevel || 'info',
      
      ...config
    };
    
    // Collection references
    this.collections = {
      products: db.collection('products'),
      inventory: db.collection('inventory'),
      orders: db.collection('orders'),
      customers: db.collection('customers'),
      
      // Event processing collections
      changeEvents: db.collection('change_events'),
      processingCheckpoints: db.collection('processing_checkpoints'),
      deadLetterQueue: db.collection('dead_letter_queue'),
      eventMetrics: db.collection('event_metrics')
    };
    
    // Change stream management
    this.changeStreams = new Map();
    this.eventProcessors = new Map();
    this.processingQueues = new Map();
    this.resumeTokens = new Map();
    
    // Performance metrics
    this.metrics = {
      eventsProcessed: 0,
      eventsFailured: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      lastProcessedAt: null,
      processingErrors: []
    };
    
    this.initializeChangeStreams();
  }

  async initializeChangeStreams() {
    console.log('Initializing MongoDB Change Streams for real-time data processing...');
    
    try {
      // Setup change streams for different collections
      await this.setupProductChangeStream();
      await this.setupInventoryChangeStream();
      await this.setupOrderChangeStream();
      await this.setupCustomerChangeStream();
      
      // Setup cross-collection change aggregation
      await this.setupDatabaseChangeStream();
      
      // Initialize event processing infrastructure
      await this.setupEventProcessingInfrastructure();
      
      console.log('Change streams initialized successfully');
      
    } catch (error) {
      console.error('Error initializing change streams:', error);
      throw error;
    }
  }

  async setupProductChangeStream() {
    console.log('Setting up product change stream...');
    
    const productsCollection = this.collections.products;
    
    // Advanced change stream pipeline with filtering and enrichment
    const changeStreamPipeline = [
      // Stage 1: Filter relevant operations
      {
        $match: {
          $or: [
            { 'operationType': 'insert' },
            { 'operationType': 'update' },
            { 'operationType': 'delete' },
            { 'operationType': 'replace' }
          ],
          
          // Optional namespace filtering
          'ns.db': this.db.databaseName,
          'ns.coll': 'products'
        }
      },
      
      // Stage 2: Enrich change events with business context
      {
        $lookup: {
          from: 'categories',
          localField: 'fullDocument.categoryId',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      
      // Stage 3: Add computed fields and change analysis
      {
        $addFields: {
          // Event metadata
          eventId: { $toString: '$_id' },
          eventTimestamp: '$$NOW',
          collectionName: '$ns.coll',
          
          // Change analysis
          changedFields: {
            $cond: {
              if: { $eq: ['$operationType', 'update'] },
              then: { $objectToArray: '$updateDescription.updatedFields' },
              else: []
            }
          },
          
          // Business context
          categoryInfo: { $arrayElemAt: ['$categoryInfo', 0] },
          
          // Priority assessment
          eventPriority: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$operationType', 'delete'] },
                  then: 'critical'
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$operationType', 'update'] },
                      { $ne: [{ $type: '$updateDescription.updatedFields.price' }, 'missing'] }
                    ]
                  },
                  then: 'high'
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$operationType', 'update'] },
                      { $ne: [{ $type: '$updateDescription.updatedFields.inventory' }, 'missing'] }
                    ]
                  },
                  then: 'medium'
                },
                {
                  case: { $eq: ['$operationType', 'insert'] },
                  then: 'low'
                }
              ],
              default: 'informational'
            }
          },
          
          // Notification routing
          notificationTargets: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$operationType', 'insert'] },
                  then: ['product_managers', 'inventory_team']
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$operationType', 'update'] },
                      { $ne: [{ $type: '$updateDescription.updatedFields.price' }, 'missing'] }
                    ]
                  },
                  then: ['pricing_team', 'sales_team', 'customers']
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$operationType', 'update'] },
                      { $ne: [{ $type: '$updateDescription.updatedFields.inventory' }, 'missing'] }
                    ]
                  },
                  then: ['inventory_team', 'fulfillment']
                },
                {
                  case: { $eq: ['$operationType', 'delete'] },
                  then: ['product_managers', 'customers']
                }
              ],
              default: ['general_subscribers']
            }
          }
        }
      }
    ];
    
    // Create change stream with pipeline and options
    const productChangeStream = productsCollection.watch(changeStreamPipeline, {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
      batchSize: this.config.batchSize,
      maxAwaitTimeMS: this.config.maxAwaitTimeMS,
      resumeAfter: this.resumeTokens.get('products')
    });
    
    // Event processing handler
    productChangeStream.on('change', async (changeEvent) => {
      await this.processProductChangeEvent(changeEvent);
    });
    
    // Error handling and resume token management
    productChangeStream.on('error', async (error) => {
      console.error('Product change stream error:', error);
      await this.handleChangeStreamError('products', error);
    });
    
    productChangeStream.on('resumeTokenChanged', (resumeToken) => {
      this.resumeTokens.set('products', resumeToken);
      this.persistResumeToken('products', resumeToken);
    });
    
    this.changeStreams.set('products', productChangeStream);
    console.log('Product change stream setup complete');
  }

  async processProductChangeEvent(changeEvent) {
    const startTime = Date.now();
    
    try {
      console.log(`Processing product change event: ${changeEvent.operationType} for product ${changeEvent.documentKey._id}`);
      
      // Enrich change event with additional context
      const enrichedEvent = await this.enrichProductChangeEvent(changeEvent);
      
      // Apply business logic and routing
      const processedEvent = await this.applyProductBusinessLogic(enrichedEvent);
      
      // Route to appropriate handlers
      await this.routeProductChangeEvent(processedEvent);
      
      // Store event for audit and analytics
      await this.storeChangeEvent(processedEvent);
      
      // Update metrics
      this.updateProcessingMetrics(startTime, 'success');
      
    } catch (error) {
      console.error('Error processing product change event:', error);
      
      // Handle processing failure
      await this.handleEventProcessingError(changeEvent, error);
      this.updateProcessingMetrics(startTime, 'error');
    }
  }

  async enrichProductChangeEvent(changeEvent) {
    console.log('Enriching product change event with business context...');
    
    try {
      const enrichedEvent = {
        ...changeEvent,
        
        // Processing metadata
        processingId: new ObjectId(),
        processingTimestamp: new Date(),
        processorVersion: '1.0',
        
        // Document context (current and previous state)
        currentDocument: changeEvent.fullDocument,
        previousDocument: changeEvent.fullDocumentBeforeChange,
        
        // Change analysis
        changeAnalysis: await this.analyzeProductChange(changeEvent),
        
        // Business impact assessment
        businessImpact: await this.assessProductBusinessImpact(changeEvent),
        
        // Related data enrichment
        relatedData: await this.getRelatedProductData(changeEvent.documentKey._id),
        
        // Notification configuration
        notificationConfig: await this.getProductNotificationConfig(changeEvent),
        
        // Processing context
        processingContext: {
          correlationId: changeEvent.eventId,
          sourceCollection: changeEvent.collectionName,
          processingPipeline: 'product_changes',
          retryCount: 0,
          maxRetries: this.config.maxRetries
        }
      };
      
      return enrichedEvent;
      
    } catch (error) {
      console.error('Error enriching product change event:', error);
      throw error;
    }
  }

  async analyzeProductChange(changeEvent) {
    const analysis = {
      operationType: changeEvent.operationType,
      affectedFields: [],
      fieldChanges: {},
      changeType: 'unknown',
      changeSignificance: 'low'
    };
    
    switch (changeEvent.operationType) {
      case 'insert':
        analysis.changeType = 'product_creation';
        analysis.changeSignificance = 'medium';
        analysis.affectedFields = Object.keys(changeEvent.fullDocument || {});
        break;
        
      case 'update':
        if (changeEvent.updateDescription && changeEvent.updateDescription.updatedFields) {
          analysis.affectedFields = Object.keys(changeEvent.updateDescription.updatedFields);
          
          // Analyze specific field changes
          const updatedFields = changeEvent.updateDescription.updatedFields;
          
          for (const [field, newValue] of Object.entries(updatedFields)) {
            const oldValue = changeEvent.fullDocumentBeforeChange?.[field];
            
            analysis.fieldChanges[field] = {
              oldValue,
              newValue,
              changeType: this.classifyFieldChange(field, oldValue, newValue)
            };
          }
          
          // Determine change type and significance
          if ('price' in updatedFields) {
            analysis.changeType = 'price_update';
            analysis.changeSignificance = 'high';
          } else if ('inventory' in updatedFields) {
            analysis.changeType = 'inventory_update';
            analysis.changeSignificance = 'medium';
          } else if ('status' in updatedFields) {
            analysis.changeType = 'status_change';
            analysis.changeSignificance = 'medium';
          } else {
            analysis.changeType = 'product_modification';
            analysis.changeSignificance = 'low';
          }
        }
        break;
        
      case 'delete':
        analysis.changeType = 'product_deletion';
        analysis.changeSignificance = 'critical';
        break;
        
      case 'replace':
        analysis.changeType = 'product_replacement';
        analysis.changeSignificance = 'high';
        break;
    }
    
    return analysis;
  }

  classifyFieldChange(fieldName, oldValue, newValue) {
    switch (fieldName) {
      case 'price':
        if (newValue > oldValue) return 'price_increase';
        if (newValue < oldValue) return 'price_decrease';
        return 'price_change';
        
      case 'inventory':
        if (newValue === 0) return 'out_of_stock';
        if (newValue <= 5) return 'low_stock';
        if (newValue > oldValue) return 'stock_increase';
        if (newValue < oldValue) return 'stock_decrease';
        return 'inventory_adjustment';
        
      case 'status':
        if (newValue === 'discontinued') return 'product_discontinued';
        if (newValue === 'active' && oldValue !== 'active') return 'product_activated';
        if (newValue !== 'active' && oldValue === 'active') return 'product_deactivated';
        return 'status_change';
        
      default:
        return 'field_update';
    }
  }

  async assessProductBusinessImpact(changeEvent) {
    const impact = {
      impactLevel: 'low',
      impactAreas: [],
      affectedSystems: [],
      businessMetrics: {},
      actionRequired: false,
      recommendations: []
    };
    
    const productId = changeEvent.documentKey._id;
    const analysis = await this.analyzeProductChange(changeEvent);
    
    // Assess impact based on change type
    switch (analysis.changeType) {
      case 'price_update':
        impact.impactLevel = 'high';
        impact.impactAreas = ['revenue', 'customer_experience', 'competitive_positioning'];
        impact.affectedSystems = ['pricing_engine', 'recommendation_system', 'customer_notifications'];
        impact.actionRequired = true;
        impact.recommendations = [
          'Notify customers of price changes',
          'Update marketing materials',
          'Review competitive pricing'
        ];
        
        // Calculate price change impact
        const priceChange = analysis.fieldChanges?.price;
        if (priceChange) {
          impact.businessMetrics.priceChangePercentage = 
            ((priceChange.newValue - priceChange.oldValue) / priceChange.oldValue * 100).toFixed(2);
        }
        break;
        
      case 'inventory_update':
        impact.impactLevel = 'medium';
        impact.impactAreas = ['fulfillment', 'customer_experience'];
        impact.affectedSystems = ['inventory_management', 'order_processing'];
        
        const inventoryChange = analysis.fieldChanges?.inventory;
        if (inventoryChange) {
          if (inventoryChange.newValue === 0) {
            impact.impactLevel = 'high';
            impact.actionRequired = true;
            impact.recommendations = ['Update product availability', 'Notify backordered customers'];
          } else if (inventoryChange.newValue <= 5) {
            impact.recommendations = ['Monitor inventory levels', 'Plan restocking'];
          }
        }
        break;
        
      case 'product_deletion':
        impact.impactLevel = 'critical';
        impact.impactAreas = ['customer_experience', 'revenue', 'data_integrity'];
        impact.affectedSystems = ['catalog_management', 'order_processing', 'recommendations'];
        impact.actionRequired = true;
        impact.recommendations = [
          'Handle existing orders',
          'Update customer wishlists',
          'Archive product data',
          'Redirect product URLs'
        ];
        break;
        
      case 'product_creation':
        impact.impactLevel = 'medium';
        impact.impactAreas = ['catalog_expansion', 'revenue_opportunity'];
        impact.affectedSystems = ['search_indexing', 'recommendation_system', 'inventory_tracking'];
        impact.recommendations = [
          'Index for search',
          'Generate recommendations',
          'Create marketing content'
        ];
        break;
    }
    
    return impact;
  }

  async getRelatedProductData(productId) {
    try {
      // Get product relationships and context
      const relatedData = await Promise.allSettled([
        // Category information
        this.collections.products.aggregate([
          { $match: { _id: productId } },
          {
            $lookup: {
              from: 'categories',
              localField: 'categoryId',
              foreignField: '_id',
              as: 'category'
            }
          },
          { $project: { category: { $arrayElemAt: ['$category', 0] } } }
        ]).toArray(),
        
        // Inventory information
        this.collections.inventory.findOne({ productId: productId }),
        
        // Recent orders for this product
        this.collections.orders.find({
          'items.productId': productId,
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
        }).limit(10).toArray(),
        
        // Customer interest metrics
        this.collections.analytics.findOne({
          productId: productId,
          type: 'product_engagement'
        })
      ]);
      
      const [categoryResult, inventoryResult, ordersResult, analyticsResult] = relatedData;
      
      return {
        category: categoryResult.status === 'fulfilled' ? categoryResult.value[0]?.category : null,
        inventory: inventoryResult.status === 'fulfilled' ? inventoryResult.value : null,
        recentOrders: ordersResult.status === 'fulfilled' ? ordersResult.value : [],
        analytics: analyticsResult.status === 'fulfilled' ? analyticsResult.value : null,
        dataRetrievedAt: new Date()
      };
      
    } catch (error) {
      console.error('Error getting related product data:', error);
      return { error: error.message };
    }
  }

  async getProductNotificationConfig(changeEvent) {
    const config = {
      enableNotifications: true,
      notificationTargets: changeEvent.notificationTargets || [],
      deliveryMethods: ['push', 'email'],
      priority: changeEvent.eventPriority || 'low',
      batching: {
        enabled: true,
        windowMs: 60000, // 1 minute
        maxBatchSize: 10
      },
      filtering: {
        enabled: true,
        rules: []
      }
    };
    
    // Customize based on event type and priority
    switch (changeEvent.operationType) {
      case 'delete':
        config.deliveryMethods = ['push', 'email', 'sms'];
        config.batching.enabled = false; // Immediate delivery
        break;
        
      case 'update':
        if (changeEvent.eventPriority === 'high') {
          config.deliveryMethods = ['push', 'email'];
          config.batching.windowMs = 30000; // 30 seconds
        }
        break;
    }
    
    return config;
  }

  async applyProductBusinessLogic(enrichedEvent) {
    console.log('Applying business logic to product change event...');
    
    try {
      const processedEvent = {
        ...enrichedEvent,
        
        // Business rules execution results
        businessRules: await this.executeProductBusinessRules(enrichedEvent),
        
        // Workflow triggers
        workflowTriggers: await this.identifyWorkflowTriggers(enrichedEvent),
        
        // Integration requirements
        integrationRequirements: await this.identifyIntegrationRequirements(enrichedEvent),
        
        // Compliance and governance
        complianceChecks: await this.performComplianceChecks(enrichedEvent)
      };
      
      return processedEvent;
      
    } catch (error) {
      console.error('Error applying business logic:', error);
      throw error;
    }
  }

  async executeProductBusinessRules(enrichedEvent) {
    const rules = [];
    const analysis = enrichedEvent.changeAnalysis;
    
    // Price change rules
    if (analysis.changeType === 'price_update') {
      const priceChange = analysis.fieldChanges.price;
      const changePercent = Math.abs(
        ((priceChange.newValue - priceChange.oldValue) / priceChange.oldValue) * 100
      );
      
      if (changePercent > 20) {
        rules.push({
          rule: 'significant_price_change',
          triggered: true,
          severity: 'high',
          action: 'require_manager_approval',
          details: `Price change of ${changePercent.toFixed(2)}% requires approval`
        });
      }
      
      if (priceChange.newValue < priceChange.oldValue * 0.5) {
        rules.push({
          rule: 'deep_discount_alert',
          triggered: true,
          severity: 'medium',
          action: 'fraud_detection_review',
          details: 'Price reduced by more than 50%'
        });
      }
    }
    
    // Inventory rules
    if (analysis.changeType === 'inventory_update') {
      const inventoryChange = analysis.fieldChanges.inventory;
      
      if (inventoryChange?.newValue === 0) {
        rules.push({
          rule: 'out_of_stock',
          triggered: true,
          severity: 'high',
          action: 'update_product_availability',
          details: 'Product is now out of stock'
        });
      }
      
      if (inventoryChange?.newValue <= 5 && inventoryChange?.newValue > 0) {
        rules.push({
          rule: 'low_stock_warning',
          triggered: true,
          severity: 'medium',
          action: 'reorder_notification',
          details: `Low stock: ${inventoryChange.newValue} units remaining`
        });
      }
    }
    
    // Product lifecycle rules
    if (analysis.changeType === 'product_deletion') {
      rules.push({
        rule: 'product_deletion',
        triggered: true,
        severity: 'critical',
        action: 'cleanup_related_data',
        details: 'Product deleted - cleanup required'
      });
    }
    
    return rules;
  }

  async routeProductChangeEvent(processedEvent) {
    console.log('Routing product change event to appropriate handlers...');
    
    try {
      const routingTasks = [];
      
      // Real-time notification routing
      if (processedEvent.notificationConfig.enableNotifications) {
        routingTasks.push(this.routeToNotificationSystem(processedEvent));
      }
      
      // Search index updates
      if (['insert', 'update', 'replace'].includes(processedEvent.operationType)) {
        routingTasks.push(this.routeToSearchIndexing(processedEvent));
      }
      
      // Analytics and reporting
      routingTasks.push(this.routeToAnalytics(processedEvent));
      
      // Integration webhooks
      if (processedEvent.integrationRequirements?.webhooks?.length > 0) {
        routingTasks.push(this.routeToWebhooks(processedEvent));
      }
      
      // Workflow automation
      if (processedEvent.workflowTriggers?.length > 0) {
        routingTasks.push(this.routeToWorkflowEngine(processedEvent));
      }
      
      // Business intelligence
      routingTasks.push(this.routeToBusinessIntelligence(processedEvent));
      
      // Execute routing tasks concurrently
      await Promise.allSettled(routingTasks);
      
    } catch (error) {
      console.error('Error routing product change event:', error);
      throw error;
    }
  }

  async routeToNotificationSystem(processedEvent) {
    console.log('Routing to notification system...');
    
    const notification = {
      eventId: processedEvent.processingId,
      eventType: 'product_change',
      operationType: processedEvent.operationType,
      productId: processedEvent.documentKey._id,
      priority: processedEvent.eventPriority,
      targets: processedEvent.notificationTargets,
      deliveryMethods: processedEvent.notificationConfig.deliveryMethods,
      
      message: this.generateNotificationMessage(processedEvent),
      payload: {
        productDetails: processedEvent.currentDocument,
        changeAnalysis: processedEvent.changeAnalysis,
        businessImpact: processedEvent.businessImpact
      },
      
      routing: {
        immediate: processedEvent.eventPriority === 'critical',
        batchable: processedEvent.notificationConfig.batching.enabled,
        batchWindowMs: processedEvent.notificationConfig.batching.windowMs
      },
      
      createdAt: new Date()
    };
    
    // Route to notification queue (could be MongoDB collection, message queue, etc.)
    await this.collections.notifications.insertOne(notification);
    
    return notification;
  }

  generateNotificationMessage(processedEvent) {
    const analysis = processedEvent.changeAnalysis;
    const product = processedEvent.currentDocument;
    
    switch (analysis.changeType) {
      case 'product_creation':
        return `New product added: ${product.name}`;
        
      case 'price_update':
        const priceChange = analysis.fieldChanges.price;
        const direction = priceChange.newValue > priceChange.oldValue ? 'increased' : 'decreased';
        return `Price ${direction} for ${product.name}: $${priceChange.oldValue} → $${priceChange.newValue}`;
        
      case 'inventory_update':
        const inventoryChange = analysis.fieldChanges.inventory;
        if (inventoryChange.newValue === 0) {
          return `${product.name} is now out of stock`;
        } else if (inventoryChange.newValue <= 5) {
          return `Low stock alert: ${product.name} (${inventoryChange.newValue} remaining)`;
        } else {
          return `Inventory updated for ${product.name}: ${inventoryChange.newValue} units`;
        }
        
      case 'product_deletion':
        return `Product removed: ${product.name}`;
        
      default:
        return `Product updated: ${product.name}`;
    }
  }

  async routeToSearchIndexing(processedEvent) {
    console.log('Routing to search indexing system...');
    
    const indexUpdate = {
      eventId: processedEvent.processingId,
      operationType: processedEvent.operationType,
      documentId: processedEvent.documentKey._id,
      collection: 'products',
      
      document: processedEvent.currentDocument,
      priority: processedEvent.eventPriority === 'critical' ? 'immediate' : 'normal',
      
      indexingInstructions: {
        fullReindex: processedEvent.operationType === 'insert',
        partialUpdate: processedEvent.operationType === 'update',
        deleteFromIndex: processedEvent.operationType === 'delete',
        affectedFields: processedEvent.changeAnalysis.affectedFields
      },
      
      createdAt: new Date()
    };
    
    await this.collections.searchIndexUpdates.insertOne(indexUpdate);
    return indexUpdate;
  }

  async setupDatabaseChangeStream() {
    console.log('Setting up database-wide change stream for cross-collection analytics...');
    
    // Database-level change stream for comprehensive monitoring
    const databaseChangeStream = this.db.watch([
      {
        $match: {
          'operationType': { $in: ['insert', 'update', 'delete'] },
          'ns.db': this.db.databaseName,
          'ns.coll': { $in: ['products', 'orders', 'customers', 'inventory'] }
        }
      },
      {
        $addFields: {
          eventId: { $toString: '$_id' },
          eventTimestamp: '$$NOW',
          
          // Cross-collection correlation
          correlationContext: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$ns.coll', 'products'] },
                  then: {
                    type: 'product_event',
                    productId: '$documentKey._id',
                    correlationKey: '$documentKey._id'
                  }
                },
                {
                  case: { $eq: ['$ns.coll', 'orders'] },
                  then: {
                    type: 'order_event',
                    orderId: '$documentKey._id',
                    correlationKey: '$fullDocument.customerId'
                  }
                }
              ],
              default: { type: 'generic_event' }
            }
          }
        }
      }
    ], {
      fullDocument: 'updateLookup'
    });
    
    databaseChangeStream.on('change', async (changeEvent) => {
      await this.processDatabaseChangeEvent(changeEvent);
    });
    
    this.changeStreams.set('database', databaseChangeStream);
    console.log('Database change stream setup complete');
  }

  async processDatabaseChangeEvent(changeEvent) {
    try {
      // Cross-collection event correlation and analytics
      await this.performCrossCollectionAnalytics(changeEvent);
      
      // Real-time business metrics updates
      await this.updateRealTimeMetrics(changeEvent);
      
      // Event pattern detection
      await this.detectEventPatterns(changeEvent);
      
    } catch (error) {
      console.error('Error processing database change event:', error);
    }
  }

  async storeChangeEvent(processedEvent) {
    try {
      const changeEventRecord = {
        eventId: processedEvent.processingId,
        resumeToken: processedEvent._id,
        
        // Event identification
        operationType: processedEvent.operationType,
        collection: processedEvent.ns?.coll,
        documentId: processedEvent.documentKey._id,
        
        // Timing information
        clusterTime: processedEvent.clusterTime,
        eventTimestamp: processedEvent.eventTimestamp,
        processingTimestamp: processedEvent.processingTimestamp,
        
        // Change details
        changeAnalysis: processedEvent.changeAnalysis,
        businessImpact: processedEvent.businessImpact,
        
        // Processing results
        businessRules: processedEvent.businessRules,
        routingResults: processedEvent.routingResults,
        
        // Status and metadata
        processingStatus: 'completed',
        processingVersion: processedEvent.processorVersion,
        
        // Audit trail
        createdAt: new Date(),
        retentionPolicy: 'standard' // Keep for standard retention period
      };
      
      await this.collections.changeEvents.insertOne(changeEventRecord);
      
    } catch (error) {
      console.error('Error storing change event:', error);
      // Don't throw - storage failure shouldn't stop processing
    }
  }

  async handleEventProcessingError(changeEvent, error) {
    console.log('Handling event processing error...');
    
    try {
      const errorRecord = {
        eventId: new ObjectId(),
        originalEventId: changeEvent.eventId,
        
        // Error details
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code
        },
        
        // Event context
        changeEvent: changeEvent,
        processingAttempt: (changeEvent.processingContext?.retryCount || 0) + 1,
        maxRetries: this.config.maxRetries,
        
        // Status
        status: 'pending_retry',
        nextRetryAt: new Date(Date.now() + this.config.retryDelayMs),
        
        createdAt: new Date()
      };
      
      // Store in dead letter queue if max retries exceeded
      if (errorRecord.processingAttempt >= this.config.maxRetries) {
        errorRecord.status = 'dead_letter';
        errorRecord.nextRetryAt = null;
      }
      
      await this.collections.deadLetterQueue.insertOne(errorRecord);
      
      // Schedule retry if applicable
      if (errorRecord.status === 'pending_retry') {
        setTimeout(() => {
          this.retryEventProcessing(errorRecord);
        }, this.config.retryDelayMs);
      }
      
    } catch (storeError) {
      console.error('Error storing failed event:', storeError);
    }
  }

  updateProcessingMetrics(startTime, status) {
    const processingTime = Date.now() - startTime;
    
    this.metrics.eventsProcessed++;
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.eventsProcessed;
    this.metrics.lastProcessedAt = new Date();
    
    if (status === 'error') {
      this.metrics.eventsFailured++;
    }
    
    if (this.config.enableMetrics) {
      // Log metrics periodically
      if (this.metrics.eventsProcessed % 100 === 0) {
        console.log(`Processing metrics: ${this.metrics.eventsProcessed} events processed, ` +
                   `${this.metrics.averageProcessingTime.toFixed(2)}ms avg processing time, ` +
                   `${this.metrics.eventsFailured} failures`);
      }
    }
  }

  async persistResumeToken(streamName, resumeToken) {
    try {
      await this.collections.processingCheckpoints.updateOne(
        { streamName: streamName },
        {
          $set: {
            resumeToken: resumeToken,
            lastUpdated: new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error(`Error persisting resume token for ${streamName}:`, error);
    }
  }

  async loadResumeTokens() {
    try {
      const checkpoints = await this.collections.processingCheckpoints.find({}).toArray();
      
      for (const checkpoint of checkpoints) {
        this.resumeTokens.set(checkpoint.streamName, checkpoint.resumeToken);
      }
      
      console.log(`Loaded ${checkpoints.length} resume tokens`);
    } catch (error) {
      console.error('Error loading resume tokens:', error);
    }
  }

  async getProcessingStatistics() {
    return {
      activeStreams: this.changeStreams.size,
      eventsProcessed: this.metrics.eventsProcessed,
      eventsFailured: this.metrics.eventsFailured,
      averageProcessingTime: this.metrics.averageProcessingTime,
      successRate: ((this.metrics.eventsProcessed - this.metrics.eventsFailured) / this.metrics.eventsProcessed * 100).toFixed(2),
      lastProcessedAt: this.metrics.lastProcessedAt,
      
      // Stream-specific metrics
      streamMetrics: Object.fromEntries(this.changeStreams.keys().map(name => [
        name, 
        { active: true, resumeToken: this.resumeTokens.has(name) }
      ]))
    };
  }

  async shutdown() {
    console.log('Shutting down Change Streams Manager...');
    
    // Close all change streams
    for (const [name, stream] of this.changeStreams) {
      try {
        await stream.close();
        console.log(`Closed change stream: ${name}`);
      } catch (error) {
        console.error(`Error closing change stream ${name}:`, error);
      }
    }
    
    // Final metrics log
    const stats = await this.getProcessingStatistics();
    console.log('Final processing statistics:', stats);
    
    console.log('Change Streams Manager shutdown complete');
  }
}

// Benefits of MongoDB Change Streams:
// - Real-time change notifications without polling overhead
// - Guaranteed delivery with automatic resume capability and failure recovery
// - Advanced filtering and aggregation pipelines for targeted event processing
// - Comprehensive change context including before/after document state
// - Native integration with MongoDB's replica set and sharding architecture
// - Atomic change detection with cluster-wide ordering guarantees
// - Efficient resource utilization with intelligent batching and buffering
// - Seamless integration with existing MongoDB operations and security
// - SQL-compatible event processing through QueryLeaf integration
// - Production-ready reliability with built-in error handling and retry logic

module.exports = {
  MongoDBChangeStreamsManager
};
```

## Understanding MongoDB Change Streams Architecture

### Advanced Event-Driven Patterns for Real-Time Applications

Implement sophisticated change stream patterns for production event-driven systems:

```javascript
// Production-ready Change Streams with advanced event processing and routing
class ProductionChangeStreamsProcessor extends MongoDBChangeStreamsManager {
  constructor(db, productionConfig) {
    super(db, productionConfig);
    
    this.productionConfig = {
      ...productionConfig,
      enableEventSourcing: true,
      enableCQRS: true,
      enableEventStore: true,
      enableSagaOrchestration: true,
      enableEventProjections: true,
      enableSnapshotting: true
    };
    
    this.setupProductionEventProcessing();
    this.initializeEventSourcing();
    this.setupCQRSProjections();
    this.setupSagaOrchestration();
  }

  async implementEventSourcingPattern() {
    console.log('Implementing event sourcing pattern with Change Streams...');
    
    const eventSourcingStrategy = {
      // Event store management
      eventStore: {
        enableEventPersistence: true,
        enableEventReplay: true,
        enableSnapshotting: true,
        snapshotFrequency: 1000
      },
      
      // Command handling
      commandHandling: {
        enableCommandValidation: true,
        enableCommandProjections: true,
        enableCommandSagas: true
      },
      
      // Query projections
      queryProjections: {
        enableRealTimeProjections: true,
        enableMaterializedViews: true,
        enableProjectionRecovery: true
      }
    };

    return await this.deployEventSourcing(eventSourcingStrategy);
  }

  async setupAdvancedEventRouting() {
    console.log('Setting up advanced event routing and distribution...');
    
    const routingStrategy = {
      // Message routing
      messageRouting: {
        enableTopicRouting: true,
        enableContentRouting: true,
        enableGeographicRouting: true,
        enableLoadBalancing: true
      },
      
      // Event transformation
      eventTransformation: {
        enableEventEnrichment: true,
        enableEventFiltering: true,
        enableEventAggregation: true,
        enableEventSplitting: true
      },
      
      // Delivery guarantees
      deliveryGuarantees: {
        enableAtLeastOnceDelivery: true,
        enableExactlyOnceDelivery: true,
        enableOrderedDelivery: true,
        enableDuplicateDetection: true
      }
    };

    return await this.deployAdvancedRouting(routingStrategy);
  }

  async implementReactiveStreams() {
    console.log('Implementing reactive streams for backpressure management...');
    
    const reactiveConfig = {
      // Backpressure handling
      backpressure: {
        enableFlowControl: true,
        bufferStrategy: 'drop_oldest',
        maxBufferSize: 10000,
        backpressureThreshold: 0.8
      },
      
      // Stream processing
      streamProcessing: {
        enableParallelProcessing: true,
        parallelismLevel: 10,
        enableBatching: true,
        batchSize: 100
      },
      
      // Error handling
      errorHandling: {
        enableCircuitBreaker: true,
        enableRetryLogic: true,
        enableDeadLetterQueue: true,
        enableGracefulDegradation: true
      }
    };

    return await this.deployReactiveStreams(reactiveConfig);
  }
}
```

## SQL-Style Change Stream Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Change Streams and event-driven operations:

```sql
-- QueryLeaf change stream operations with SQL-familiar syntax

-- Create change stream monitoring with SQL-style syntax
CREATE CHANGE_STREAM product_changes 
ON products 
WITH (
  -- Change stream configuration
  full_document = 'updateLookup',
  full_document_before_change = 'whenAvailable',
  batch_size = 100,
  max_await_time_ms = 1000,
  
  -- Event filtering
  FILTER (
    operation_type IN ('insert', 'update', 'delete') AND
    namespace.database = 'ecommerce' AND
    namespace.collection = 'products'
  ),
  
  -- Event enrichment pipeline
  ENRICH (
    -- Add business context
    category_info FROM categories USING fullDocument.categoryId,
    inventory_info FROM inventory USING documentKey._id,
    
    -- Compute derived fields
    event_priority = CASE 
      WHEN operation_type = 'delete' THEN 'critical'
      WHEN operation_type = 'update' AND updateDescription.updatedFields.price IS NOT NULL THEN 'high'
      WHEN operation_type = 'update' AND updateDescription.updatedFields.inventory IS NOT NULL THEN 'medium'
      ELSE 'low'
    END,
    
    -- Change analysis
    change_type = CASE
      WHEN operation_type = 'insert' THEN 'product_creation'
      WHEN operation_type = 'update' AND updateDescription.updatedFields.price IS NOT NULL THEN 'price_update'
      WHEN operation_type = 'update' AND updateDescription.updatedFields.inventory IS NOT NULL THEN 'inventory_update'
      WHEN operation_type = 'delete' THEN 'product_deletion'
      ELSE 'product_modification'
    END
  )
);

-- Monitor change events with SQL queries
SELECT 
  event_id,
  operation_type,
  document_key._id as product_id,
  full_document.name as product_name,
  full_document.price as current_price,
  
  -- Change analysis
  change_type,
  event_priority,
  cluster_time,
  
  -- Business context
  category_info.name as category_name,
  inventory_info.quantity as current_inventory,
  
  -- Change details for updates
  CASE 
    WHEN operation_type = 'update' THEN
      JSON_BUILD_OBJECT(
        'updated_fields', updateDescription.updatedFields,
        'removed_fields', updateDescription.removedFields,
        'truncated_arrays', updateDescription.truncatedArrays
      )
    ELSE NULL
  END as update_details,
  
  -- Price change analysis
  CASE 
    WHEN change_type = 'price_update' THEN
      JSON_BUILD_OBJECT(
        'old_price', fullDocumentBeforeChange.price,
        'new_price', fullDocument.price,
        'change_amount', fullDocument.price - fullDocumentBeforeChange.price,
        'change_percentage', 
          ROUND(
            ((fullDocument.price - fullDocumentBeforeChange.price) / 
             fullDocumentBeforeChange.price) * 100, 
            2
          )
      )
    ELSE NULL
  END as price_change_analysis,
  
  -- Inventory change analysis
  CASE 
    WHEN change_type = 'inventory_update' THEN
      JSON_BUILD_OBJECT(
        'old_inventory', fullDocumentBeforeChange.inventory,
        'new_inventory', fullDocument.inventory,
        'change_amount', fullDocument.inventory - fullDocumentBeforeChange.inventory,
        'stock_status', 
          CASE 
            WHEN fullDocument.inventory = 0 THEN 'out_of_stock'
            WHEN fullDocument.inventory <= 5 THEN 'low_stock'
            WHEN fullDocument.inventory > fullDocumentBeforeChange.inventory THEN 'restocked'
            ELSE 'normal'
          END
      )
    ELSE NULL
  END as inventory_change_analysis

FROM CHANGE_STREAM product_changes
WHERE cluster_time > TIMESTAMP '2025-01-05 00:00:00'
ORDER BY cluster_time DESC;

-- Event aggregation and analytics
WITH change_events AS (
  SELECT 
    *,
    DATE_TRUNC('hour', cluster_time) as hour_bucket,
    DATE_TRUNC('day', cluster_time) as day_bucket
  FROM CHANGE_STREAM product_changes
  WHERE cluster_time >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
),

hourly_change_metrics AS (
  SELECT 
    hour_bucket,
    
    -- Operation counts
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE operation_type = 'insert') as product_creates,
    COUNT(*) FILTER (WHERE operation_type = 'update') as product_updates,
    COUNT(*) FILTER (WHERE operation_type = 'delete') as product_deletes,
    
    -- Change type analysis
    COUNT(*) FILTER (WHERE change_type = 'price_update') as price_changes,
    COUNT(*) FILTER (WHERE change_type = 'inventory_update') as inventory_changes,
    COUNT(*) FILTER (WHERE change_type = 'product_creation') as new_products,
    
    -- Priority distribution
    COUNT(*) FILTER (WHERE event_priority = 'critical') as critical_events,
    COUNT(*) FILTER (WHERE event_priority = 'high') as high_priority_events,
    COUNT(*) FILTER (WHERE event_priority = 'medium') as medium_priority_events,
    COUNT(*) FILTER (WHERE event_priority = 'low') as low_priority_events,
    
    -- Business impact metrics
    AVG(CAST(price_change_analysis->>'change_percentage' AS DECIMAL)) as avg_price_change_pct,
    COUNT(*) FILTER (WHERE inventory_change_analysis->>'stock_status' = 'out_of_stock') as out_of_stock_events,
    COUNT(*) FILTER (WHERE inventory_change_analysis->>'stock_status' = 'low_stock') as low_stock_events,
    
    -- Unique products affected
    COUNT(DISTINCT document_key._id) as unique_products_affected,
    COUNT(DISTINCT category_info.name) as categories_affected
    
  FROM change_events
  GROUP BY hour_bucket
),

change_velocity_analysis AS (
  SELECT 
    hcm.*,
    
    -- Change velocity metrics
    total_events / 60.0 as events_per_minute,
    unique_products_affected / 60.0 as products_changed_per_minute,
    
    -- Change intensity scoring
    CASE 
      WHEN critical_events > 10 THEN 'very_high_intensity'
      WHEN high_priority_events > 50 THEN 'high_intensity'
      WHEN total_events > 100 THEN 'moderate_intensity'
      ELSE 'normal_intensity'
    END as change_intensity,
    
    -- Business activity classification
    CASE 
      WHEN price_changes > total_events * 0.3 THEN 'pricing_focused'
      WHEN inventory_changes > total_events * 0.4 THEN 'inventory_focused'
      WHEN new_products > total_events * 0.2 THEN 'catalog_expansion'
      ELSE 'general_maintenance'
    END as activity_pattern,
    
    -- Alert thresholds
    CASE 
      WHEN critical_events > 5 OR out_of_stock_events > 20 THEN 'alert_required'
      WHEN high_priority_events > 30 OR events_per_minute > 5 THEN 'monitoring_required'
      ELSE 'normal_operations'
    END as operational_status
    
  FROM hourly_change_metrics hcm
)

SELECT 
  TO_CHAR(hour_bucket, 'YYYY-MM-DD HH24:00') as hour,
  
  -- Core metrics
  total_events,
  ROUND(events_per_minute, 2) as events_per_minute,
  unique_products_affected,
  categories_affected,
  
  -- Operation breakdown
  product_creates,
  product_updates,
  product_deletes,
  
  -- Change type breakdown  
  price_changes,
  inventory_changes,
  
  -- Priority breakdown
  critical_events,
  high_priority_events,
  medium_priority_events,
  low_priority_events,
  
  -- Business insights
  change_intensity,
  activity_pattern,
  operational_status,
  
  -- Impact metrics
  ROUND(COALESCE(avg_price_change_pct, 0), 2) as avg_price_change_pct,
  out_of_stock_events,
  low_stock_events,
  
  -- Health indicators
  ROUND((total_events - critical_events)::DECIMAL / total_events * 100, 1) as operational_health_pct,
  
  -- Recommendations
  CASE operational_status
    WHEN 'alert_required' THEN 'Immediate attention required - high critical event volume'
    WHEN 'monitoring_required' THEN 'Increased monitoring recommended'
    ELSE 'Normal operations - continue monitoring'
  END as recommendation

FROM change_velocity_analysis
ORDER BY hour_bucket DESC;

-- Real-time event routing and notifications
CREATE TRIGGER change_event_router
  ON CHANGE_STREAM product_changes
  FOR EACH CHANGE_EVENT
  EXECUTE FUNCTION (
    -- Route critical events immediately
    WHEN event_priority = 'critical' THEN
      NOTIFY 'critical_alerts' WITH PAYLOAD JSON_BUILD_OBJECT(
        'event_id', event_id,
        'product_id', document_key._id,
        'operation', operation_type,
        'priority', event_priority,
        'timestamp', cluster_time
      ),
    
    -- Batch medium/low priority events
    WHEN event_priority IN ('medium', 'low') THEN
      INSERT INTO event_batch_queue (
        event_id, event_priority, event_data, batch_window
      ) VALUES (
        event_id, 
        event_priority, 
        JSON_BUILD_OBJECT(
          'product_id', document_key._id,
          'operation', operation_type,
          'change_type', change_type,
          'details', full_document
        ),
        DATE_TRUNC('minute', CURRENT_TIMESTAMP, 5) -- 5-minute batching window
      ),
    
    -- Route to search indexing
    WHEN operation_type IN ('insert', 'update') THEN
      INSERT INTO search_index_updates (
        document_id, collection_name, operation_type, 
        document_data, priority, created_at
      ) VALUES (
        document_key._id, 
        'products', 
        operation_type,
        full_document,
        CASE WHEN event_priority = 'critical' THEN 'immediate' ELSE 'normal' END,
        CURRENT_TIMESTAMP
      ),
    
    -- Route to analytics pipeline
    ALWAYS THEN
      INSERT INTO analytics_events (
        event_id, event_type, collection_name, document_id,
        operation_type, event_data, processing_priority, created_at
      ) VALUES (
        event_id,
        'change_stream_event',
        'products',
        document_key._id,
        operation_type,
        JSON_BUILD_OBJECT(
          'change_type', change_type,
          'priority', event_priority,
          'business_context', JSON_BUILD_OBJECT(
            'category', category_info.name,
            'inventory', inventory_info.quantity
          )
        ),
        event_priority,
        CURRENT_TIMESTAMP
      )
  );

-- Event sourcing and audit trail queries
CREATE VIEW product_change_audit AS
SELECT 
  event_id,
  document_key._id as product_id,
  operation_type,
  cluster_time as event_time,
  
  -- Change details
  change_type,
  
  -- Document states
  full_document as current_state,
  full_document_before_change as previous_state,
  
  -- Change delta for updates
  CASE 
    WHEN operation_type = 'update' THEN
      JSON_BUILD_OBJECT(
        'updated_fields', updateDescription.updatedFields,
        'removed_fields', updateDescription.removedFields
      )
    ELSE NULL
  END as change_delta,
  
  -- Business impact
  event_priority,
  
  -- Audit metadata
  resume_token,
  wall_time,
  
  -- Computed audit fields
  ROW_NUMBER() OVER (
    PARTITION BY document_key._id 
    ORDER BY cluster_time
  ) as change_sequence,
  
  LAG(cluster_time) OVER (
    PARTITION BY document_key._id 
    ORDER BY cluster_time
  ) as previous_change_time,
  
  -- Time between changes
  EXTRACT(SECONDS FROM (
    cluster_time - LAG(cluster_time) OVER (
      PARTITION BY document_key._id 
      ORDER BY cluster_time
    )
  )) as seconds_since_last_change

FROM CHANGE_STREAM product_changes
ORDER BY document_key._id, cluster_time;

-- Advanced pattern detection
WITH product_lifecycle_events AS (
  SELECT 
    document_key._id as product_id,
    operation_type,
    change_type,
    cluster_time,
    
    -- Lifecycle stage detection
    CASE 
      WHEN operation_type = 'insert' THEN 'creation'
      WHEN operation_type = 'delete' THEN 'deletion'
      WHEN change_type = 'price_update' THEN 'pricing_management'
      WHEN change_type = 'inventory_update' THEN 'inventory_management'
      ELSE 'maintenance'
    END as lifecycle_stage,
    
    -- Change frequency analysis
    COUNT(*) OVER (
      PARTITION BY document_key._id 
      ORDER BY cluster_time 
      RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
    ) as changes_last_hour,
    
    -- Pattern detection
    LAG(change_type) OVER (
      PARTITION BY document_key._id 
      ORDER BY cluster_time
    ) as previous_change_type,
    
    LEAD(change_type) OVER (
      PARTITION BY document_key._id 
      ORDER BY cluster_time
    ) as next_change_type
    
  FROM CHANGE_STREAM product_changes
  WHERE cluster_time >= CURRENT_TIMESTAMP - INTERVAL '7 days'
),

change_patterns AS (
  SELECT 
    product_id,
    lifecycle_stage,
    change_type,
    previous_change_type,
    next_change_type,
    changes_last_hour,
    cluster_time,
    
    -- Pattern identification
    CASE 
      WHEN changes_last_hour > 10 THEN 'high_frequency_changes'
      WHEN change_type = 'price_update' AND previous_change_type = 'price_update' THEN 'price_oscillation'
      WHEN change_type = 'inventory_update' AND changes_last_hour > 5 THEN 'inventory_volatility'
      WHEN lifecycle_stage = 'creation' AND next_change_type = 'price_update' THEN 'immediate_pricing_adjustment'
      WHEN lifecycle_stage = 'deletion' AND previous_change_type = 'inventory_update' THEN 'clearance_deletion'
      ELSE 'normal_pattern'
    END as pattern_type,
    
    -- Anomaly scoring
    CASE 
      WHEN changes_last_hour > 20 THEN 5  -- Very high frequency
      WHEN changes_last_hour > 10 THEN 3  -- High frequency
      WHEN change_type = previous_change_type AND change_type = next_change_type THEN 2  -- Repetitive changes
      ELSE 0
    END as anomaly_score
    
  FROM product_lifecycle_events
),

pattern_alerts AS (
  SELECT 
    cp.*,
    
    -- Alert classification
    CASE 
      WHEN anomaly_score >= 5 THEN 'critical_pattern_anomaly'
      WHEN anomaly_score >= 3 THEN 'unusual_pattern_detected'
      WHEN pattern_type IN ('price_oscillation', 'inventory_volatility') THEN 'business_pattern_concern'
      ELSE 'normal_pattern'
    END as alert_level,
    
    -- Recommended actions
    CASE pattern_type
      WHEN 'high_frequency_changes' THEN 'Investigate automated system behavior'
      WHEN 'price_oscillation' THEN 'Review pricing strategy and rules'
      WHEN 'inventory_volatility' THEN 'Check inventory management system'
      WHEN 'clearance_deletion' THEN 'Verify clearance process completion'
      ELSE 'Continue monitoring'
    END as recommended_action
    
  FROM change_patterns cp
  WHERE anomaly_score > 0 OR pattern_type != 'normal_pattern'
)

SELECT 
  product_id,
  lifecycle_stage,
  pattern_type,
  alert_level,
  anomaly_score,
  changes_last_hour,
  TO_CHAR(cluster_time, 'YYYY-MM-DD HH24:MI:SS') as event_time,
  recommended_action,
  
  -- Pattern context
  CASE 
    WHEN alert_level = 'critical_pattern_anomaly' THEN 
      'CRITICAL: Unusual change frequency detected - immediate investigation required'
    WHEN alert_level = 'unusual_pattern_detected' THEN
      'WARNING: Pattern anomaly detected - monitoring recommended'
    WHEN alert_level = 'business_pattern_concern' THEN
      'BUSINESS ALERT: Review business process associated with detected pattern'
    ELSE 'INFO: Pattern identified for awareness'
  END as alert_description

FROM pattern_alerts
ORDER BY anomaly_score DESC, cluster_time DESC
LIMIT 100;

-- QueryLeaf provides comprehensive change stream capabilities:
-- 1. SQL-familiar change stream creation and monitoring syntax
-- 2. Advanced event filtering and enrichment with business context
-- 3. Real-time event routing and notification triggers
-- 4. Comprehensive change analytics and velocity analysis
-- 5. Pattern detection and anomaly identification
-- 6. Event sourcing and audit trail capabilities
-- 7. Business rule integration and automated responses  
-- 8. Cross-collection change correlation and analysis
-- 9. Production-ready error handling and resume capabilities
-- 10. Native integration with MongoDB Change Streams performance optimization
```

## Best Practices for Change Streams Implementation

### Event Processing Strategy and Performance Optimization

Essential principles for effective MongoDB Change Streams deployment:

1. **Resume Token Management**: Implement robust resume token persistence and recovery strategies for guaranteed delivery
2. **Pipeline Optimization**: Design change stream pipelines that minimize network traffic and processing overhead
3. **Error Handling**: Implement comprehensive error handling with retry logic and dead letter queue management
4. **Filtering Strategy**: Apply server-side filtering to reduce client processing load and network usage
5. **Batch Processing**: Implement intelligent batching for high-volume event processing scenarios
6. **Performance Monitoring**: Track change stream performance metrics and optimize based on usage patterns

### Production Event-Driven Architecture

Optimize Change Streams for enterprise-scale event-driven systems:

1. **Scalability Design**: Plan for horizontal scaling with appropriate sharding and replica set configurations
2. **Fault Tolerance**: Implement automatic failover and recovery mechanisms for change stream processors
3. **Event Enrichment**: Design efficient event enrichment patterns that balance context with performance
4. **Integration Patterns**: Establish clear integration patterns with external systems and message queues
5. **Security Considerations**: Implement proper authentication and authorization for change stream access
6. **Operational Monitoring**: Deploy comprehensive monitoring and alerting for change stream health

## Conclusion

MongoDB Change Streams provide comprehensive real-time event-driven capabilities that eliminate the complexity and performance overhead of traditional polling-based change detection. The combination of guaranteed delivery, automatic resume capabilities, and sophisticated filtering makes Change Streams ideal for building responsive, event-driven applications that scale efficiently with growing data volumes.

Key MongoDB Change Streams benefits include:

- **Real-Time Notifications**: Native change notifications without polling overhead or database performance impact
- **Guaranteed Delivery**: Automatic resume capability and failure recovery with cluster-wide ordering guarantees
- **Advanced Filtering**: Server-side aggregation pipelines for targeted event processing and context enrichment
- **Production Ready**: Built-in error handling, retry logic, and integration with MongoDB's operational model
- **Event-Driven Architecture**: Native support for reactive patterns, event sourcing, and CQRS implementations
- **SQL Accessibility**: Familiar SQL-style change stream operations through QueryLeaf for accessible event processing

Whether you're building real-time dashboards, notification systems, data synchronization services, or comprehensive event-driven architectures, MongoDB Change Streams with QueryLeaf's familiar SQL interface provide the foundation for scalable, responsive applications.

> **QueryLeaf Integration**: QueryLeaf seamlessly manages MongoDB Change Streams while providing SQL-familiar syntax for change event monitoring, filtering, and processing. Advanced event-driven patterns including real-time analytics, pattern detection, and automated routing are elegantly handled through familiar SQL constructs, making sophisticated event processing both powerful and accessible to SQL-oriented development teams.

The combination of MongoDB's robust change stream capabilities with SQL-style event operations makes it an ideal platform for applications requiring both real-time responsiveness and familiar database interaction patterns, ensuring your event-driven systems can evolve with changing requirements while maintaining reliable, high-performance operation.