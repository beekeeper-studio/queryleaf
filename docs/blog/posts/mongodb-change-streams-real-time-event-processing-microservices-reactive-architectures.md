---
title: "MongoDB Change Streams: Real-Time Event Processing and Reactive Microservices Architecture for Modern Applications"
description: "Master MongoDB Change Streams for building reactive applications, real-time event processing, and microservices communication. Learn advanced change detection, event sourcing patterns, and SQL-familiar change stream operations for scalable real-time systems."
date: 2025-12-11
tags: [mongodb, change-streams, real-time, event-processing, microservices, reactive-architecture, sql, event-sourcing]
---

# MongoDB Change Streams: Real-Time Event Processing and Reactive Microservices Architecture for Modern Applications

Modern applications require real-time reactivity to data changes - instant notifications, live dashboards, automatic synchronization, and event-driven microservices communication. Traditional relational databases provide limited change detection through triggers, polling mechanisms, or third-party CDC (Change Data Capture) solutions that add complexity, latency, and operational overhead to real-time application architectures.

MongoDB Change Streams provide native real-time change detection capabilities that enable applications to react instantly to data modifications across collections, databases, or entire deployments. Unlike external CDC tools that require complex setup and maintenance, Change Streams deliver real-time event streams with resume capability, filtering, and transformation - essential for building responsive, event-driven applications that scale.

## The Traditional Change Detection Challenge

Conventional database change detection approaches face significant limitations for real-time applications:

```sql
-- Traditional PostgreSQL change detection - complex triggers and polling overhead

-- User activity tracking with trigger-based change capture
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    profile_data JSONB DEFAULT '{}',
    last_login TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Change log table for tracking modifications
CREATE TABLE user_profile_changes (
    change_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(user_id),
    change_type VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    change_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Change metadata
    trigger_source VARCHAR(50),
    session_info JSONB,
    application_context JSONB
);

-- Complex trigger function for change detection
CREATE OR REPLACE FUNCTION track_user_profile_changes()
RETURNS TRIGGER AS $$
DECLARE
    change_type_val VARCHAR(10);
    old_data JSONB DEFAULT NULL;
    new_data JSONB DEFAULT NULL;
    changed_fields_array TEXT[];
    field_name TEXT;
    
BEGIN
    -- Determine change type
    CASE TG_OP
        WHEN 'INSERT' THEN 
            change_type_val := 'INSERT';
            new_data := row_to_json(NEW)::jsonb;
        WHEN 'UPDATE' THEN
            change_type_val := 'UPDATE';
            old_data := row_to_json(OLD)::jsonb;
            new_data := row_to_json(NEW)::jsonb;
            
            -- Detect changed fields
            changed_fields_array := ARRAY[]::TEXT[];
            FOR field_name IN SELECT jsonb_object_keys(new_data) LOOP
                IF old_data->>field_name IS DISTINCT FROM new_data->>field_name THEN
                    changed_fields_array := array_append(changed_fields_array, field_name);
                END IF;
            END LOOP;
            
        WHEN 'DELETE' THEN
            change_type_val := 'DELETE';
            old_data := row_to_json(OLD)::jsonb;
    END CASE;
    
    -- Insert change record
    INSERT INTO user_profile_changes (
        user_id, 
        change_type, 
        old_values, 
        new_values, 
        changed_fields,
        trigger_source,
        session_info
    ) VALUES (
        COALESCE(NEW.user_id, OLD.user_id),
        change_type_val,
        old_data,
        new_data,
        changed_fields_array,
        TG_TABLE_NAME,
        jsonb_build_object(
            'user', current_user,
            'application_name', current_setting('application_name', true),
            'client_addr', inet_client_addr()
        )
    );
    
    -- Notify external applications (limited payload size)
    PERFORM pg_notify(
        'user_profile_changes',
        json_build_object(
            'change_id', (SELECT change_id FROM user_profile_changes ORDER BY change_timestamp DESC LIMIT 1),
            'user_id', COALESCE(NEW.user_id, OLD.user_id),
            'change_type', change_type_val,
            'timestamp', CURRENT_TIMESTAMP
        )::text
    );
    
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all DML operations
CREATE TRIGGER user_profile_changes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION track_user_profile_changes();

-- Application code to listen for notifications (complex polling)
CREATE OR REPLACE FUNCTION process_change_notifications()
RETURNS VOID AS $$
DECLARE
    notification_payload RECORD;
    change_details RECORD;
    processing_start TIMESTAMP := CURRENT_TIMESTAMP;
    processed_count INTEGER := 0;
    
BEGIN
    RAISE NOTICE 'Starting change notification processing at %', processing_start;
    
    -- Listen for notifications (requires persistent connection)
    LISTEN user_profile_changes;
    
    -- Process pending changes (polling approach)
    FOR change_details IN 
        SELECT 
            change_id,
            user_id,
            change_type,
            old_values,
            new_values,
            changed_fields,
            change_timestamp
        FROM user_profile_changes
        WHERE change_timestamp > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
          AND processed = FALSE
        ORDER BY change_timestamp ASC
    LOOP
        BEGIN
            -- Process individual change
            CASE change_details.change_type
                WHEN 'INSERT' THEN
                    RAISE NOTICE 'Processing new user registration: %', change_details.user_id;
                    -- Trigger welcome email, setup defaults, etc.
                    
                WHEN 'UPDATE' THEN
                    RAISE NOTICE 'Processing user profile update: % fields changed', 
                        array_length(change_details.changed_fields, 1);
                    
                    -- Handle specific field changes
                    IF 'email' = ANY(change_details.changed_fields) THEN
                        RAISE NOTICE 'Email changed for user %, verification required', change_details.user_id;
                        -- Trigger email verification workflow
                    END IF;
                    
                    IF 'status' = ANY(change_details.changed_fields) THEN
                        RAISE NOTICE 'Status changed for user %: % -> %', 
                            change_details.user_id,
                            change_details.old_values->>'status',
                            change_details.new_values->>'status';
                        -- Handle status-specific logic
                    END IF;
                    
                WHEN 'DELETE' THEN
                    RAISE NOTICE 'Processing user deletion: %', change_details.user_id;
                    -- Cleanup related data, send notifications
            END CASE;
            
            -- Mark as processed
            UPDATE user_profile_changes 
            SET processed = TRUE, processed_at = CURRENT_TIMESTAMP
            WHERE change_id = change_details.change_id;
            
            processed_count := processed_count + 1;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'Error processing change %: %', change_details.change_id, SQLERRM;
                
                UPDATE user_profile_changes 
                SET processing_error = SQLERRM,
                    error_count = COALESCE(error_count, 0) + 1
                WHERE change_id = change_details.change_id;
        END;
    END LOOP;
    
    RAISE NOTICE 'Change notification processing completed: % changes processed in %',
        processed_count, CURRENT_TIMESTAMP - processing_start;
END;
$$ LANGUAGE plpgsql;

-- Polling-based change detection (performance overhead)
CREATE OR REPLACE FUNCTION detect_recent_changes()
RETURNS TABLE (
    table_name TEXT,
    change_count BIGINT,
    latest_change TIMESTAMP,
    change_summary JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH change_summary AS (
        SELECT 
            'user_profiles' as table_name,
            COUNT(*) as change_count,
            MAX(change_timestamp) as latest_change,
            jsonb_build_object(
                'inserts', COUNT(*) FILTER (WHERE change_type = 'INSERT'),
                'updates', COUNT(*) FILTER (WHERE change_type = 'UPDATE'),
                'deletes', COUNT(*) FILTER (WHERE change_type = 'DELETE'),
                'most_changed_fields', (
                    SELECT jsonb_agg(field_name ORDER BY field_count DESC)
                    FROM (
                        SELECT unnest(changed_fields) as field_name, COUNT(*) as field_count
                        FROM user_profile_changes 
                        WHERE change_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
                        GROUP BY unnest(changed_fields)
                        ORDER BY field_count DESC
                        LIMIT 5
                    ) field_stats
                ),
                'peak_activity_hour', (
                    SELECT EXTRACT(HOUR FROM change_timestamp)
                    FROM user_profile_changes 
                    WHERE change_timestamp >= CURRENT_DATE
                    GROUP BY EXTRACT(HOUR FROM change_timestamp)
                    ORDER BY COUNT(*) DESC 
                    LIMIT 1
                )
            ) as change_summary
        FROM user_profile_changes
        WHERE change_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    )
    SELECT 
        cs.table_name,
        cs.change_count,
        cs.latest_change,
        cs.change_summary
    FROM change_summary cs;
END;
$$ LANGUAGE plpgsql;

-- Problems with traditional change detection:
-- 1. Complex trigger logic and maintenance overhead requiring database expertise
-- 2. Limited notification payload size affecting real-time application integration
-- 3. Polling overhead and latency impacting application performance and responsiveness
-- 4. Manual change tracking implementation for every table requiring modifications
-- 5. No built-in resume capability for handling connection failures or processing errors
-- 6. Performance impact on write operations due to trigger execution overhead
-- 7. Difficulty filtering changes and implementing business logic within database constraints
-- 8. Complex error handling and retry logic for failed change processing
-- 9. Limited scalability for high-volume change scenarios affecting database performance
-- 10. Tight coupling between database schema changes and change detection logic
```

MongoDB provides native Change Streams with comprehensive real-time change detection:

```javascript
// MongoDB Change Streams - Native real-time change detection and event processing
const { MongoClient } = require('mongodb');

// Advanced MongoDB Change Streams Manager for Real-Time Applications
class MongoDBChangeStreamsManager {
  constructor(client, config = {}) {
    this.client = client;
    this.db = client.db(config.database || 'real_time_app');
    
    this.config = {
      // Change stream configuration
      enableChangeStreams: config.enableChangeStreams !== false,
      enableResumeTokens: config.enableResumeTokens !== false,
      enablePrePostImages: config.enablePrePostImages || false,
      
      // Real-time processing
      batchSize: config.batchSize || 100,
      maxAwaitTimeMS: config.maxAwaitTimeMS || 1000,
      processingTimeout: config.processingTimeout || 30000,
      
      // Error handling
      enableRetryLogic: config.enableRetryLogic !== false,
      maxRetryAttempts: config.maxRetryAttempts || 3,
      retryDelayMs: config.retryDelayMs || 1000,
      
      // Event processing
      enableEventSourcing: config.enableEventSourcing || false,
      enableEventFiltering: config.enableEventFiltering !== false,
      enableEventTransformation: config.enableEventTransformation !== false
    };
    
    // Change stream management
    this.activeStreams = new Map();
    this.resumeTokens = new Map();
    this.eventProcessors = new Map();
    
    this.initializeChangeStreamsManager();
  }

  async initializeChangeStreamsManager() {
    console.log('Initializing MongoDB Change Streams Manager...');
    
    try {
      // Setup collections for change stream management
      await this.setupChangeStreamCollections();
      
      // Initialize event processors
      await this.initializeEventProcessors();
      
      // Setup default change streams
      if (this.config.enableChangeStreams) {
        await this.setupDefaultChangeStreams();
      }
      
      console.log('MongoDB Change Streams Manager initialized successfully');
      
    } catch (error) {
      console.error('Error initializing change streams manager:', error);
      throw error;
    }
  }

  async setupChangeStreamCollections() {
    console.log('Setting up change stream tracking collections...');
    
    try {
      // Resume tokens collection for fault tolerance
      const resumeTokensCollection = this.db.collection('change_stream_resume_tokens');
      await resumeTokensCollection.createIndexes([
        { key: { streamId: 1 }, unique: true, background: true },
        { key: { lastUpdated: 1 }, background: true }
      ]);
      
      // Event processing log
      const eventLogCollection = this.db.collection('change_event_log');
      await eventLogCollection.createIndexes([
        { key: { eventId: 1 }, unique: true, background: true },
        { key: { timestamp: -1 }, background: true },
        { key: { collection: 1, operationType: 1, timestamp: -1 }, background: true },
        { key: { processed: 1, timestamp: 1 }, background: true }
      ]);
      
      // Event processor status tracking
      const processorStatusCollection = this.db.collection('event_processor_status');
      await processorStatusCollection.createIndexes([
        { key: { processorId: 1 }, unique: true, background: true },
        { key: { lastHeartbeat: 1 }, background: true }
      ]);
      
      console.log('Change stream collections configured successfully');
      
    } catch (error) {
      console.error('Error setting up change stream collections:', error);
      throw error;
    }
  }

  async createCollectionChangeStream(collectionName, options = {}) {
    console.log(`Creating change stream for collection: ${collectionName}`);
    
    try {
      const collection = this.db.collection(collectionName);
      const streamId = `${collectionName}_stream`;
      
      // Load resume token if available
      const resumeToken = await this.loadResumeToken(streamId);
      
      // Configure change stream options
      const changeStreamOptions = {
        fullDocument: options.fullDocument || 'updateLookup',
        fullDocumentBeforeChange: options.fullDocumentBeforeChange || 'whenAvailable',
        batchSize: options.batchSize || this.config.batchSize,
        maxAwaitTimeMS: options.maxAwaitTimeMS || this.config.maxAwaitTimeMS,
        ...( resumeToken && { resumeAfter: resumeToken })
      };
      
      // Create change stream with pipeline
      const pipeline = this.buildChangeStreamPipeline(options.filters || {});
      const changeStream = collection.watch(pipeline, changeStreamOptions);
      
      // Store change stream reference
      this.activeStreams.set(streamId, {
        changeStream: changeStream,
        collection: collectionName,
        options: options,
        createdAt: new Date(),
        status: 'active'
      });
      
      // Setup event processing
      this.setupChangeStreamEventHandler(streamId, changeStream, options.eventProcessor);
      
      console.log(`Change stream created for ${collectionName}: ${streamId}`);
      
      return {
        streamId: streamId,
        changeStream: changeStream,
        collection: collectionName
      };
      
    } catch (error) {
      console.error(`Error creating change stream for ${collectionName}:`, error);
      throw error;
    }
  }

  buildChangeStreamPipeline(filters = {}) {
    const pipeline = [];
    
    // Operation type filtering
    if (filters.operationType) {
      const operationTypes = Array.isArray(filters.operationType) 
        ? filters.operationType 
        : [filters.operationType];
        
      pipeline.push({
        $match: {
          operationType: { $in: operationTypes }
        }
      });
    }
    
    // Field-level filtering
    if (filters.updatedFields) {
      pipeline.push({
        $match: {
          $or: filters.updatedFields.map(field => ({
            [`updateDescription.updatedFields.${field}`]: { $exists: true }
          }))
        }
      });
    }
    
    // Document filtering
    if (filters.documentFilter) {
      pipeline.push({
        $match: {
          'fullDocument': filters.documentFilter
        }
      });
    }
    
    // Custom pipeline stages
    if (filters.customPipeline) {
      pipeline.push(...filters.customPipeline);
    }
    
    return pipeline;
  }

  async setupChangeStreamEventHandler(streamId, changeStream, eventProcessor) {
    console.log(`Setting up event handler for stream: ${streamId}`);
    
    const eventHandler = async (changeEvent) => {
      try {
        const eventId = this.generateEventId(changeEvent);
        const timestamp = new Date();
        
        // Log the event
        await this.logChangeEvent(eventId, changeEvent, streamId, timestamp);
        
        // Update resume token
        await this.saveResumeToken(streamId, changeEvent._id);
        
        // Process the event
        if (eventProcessor) {
          await this.processChangeEvent(eventId, changeEvent, eventProcessor);
        } else {
          await this.defaultEventProcessing(eventId, changeEvent);
        }
        
        // Update processor heartbeat
        await this.updateProcessorHeartbeat(streamId);
        
      } catch (error) {
        console.error(`Error processing change event for ${streamId}:`, error);
        await this.handleEventProcessingError(streamId, changeEvent, error);
      }
    };

    // Setup event listeners
    changeStream.on('change', eventHandler);
    
    changeStream.on('error', async (error) => {
      console.error(`Change stream error for ${streamId}:`, error);
      await this.handleStreamError(streamId, error);
    });
    
    changeStream.on('close', async () => {
      console.log(`Change stream closed for ${streamId}`);
      await this.handleStreamClose(streamId);
    });
    
    changeStream.on('end', async () => {
      console.log(`Change stream ended for ${streamId}`);
      await this.handleStreamEnd(streamId);
    });
  }

  async createUserProfileChangeStream() {
    console.log('Creating user profile change stream with business logic...');
    
    return await this.createCollectionChangeStream('user_profiles', {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
      filters: {
        operationType: ['insert', 'update', 'delete'],
        updatedFields: ['email', 'status', 'profile_data.preferences']
      },
      eventProcessor: async (eventId, changeEvent) => {
        const { operationType, fullDocument, fullDocumentBeforeChange } = changeEvent;
        
        switch (operationType) {
          case 'insert':
            await this.handleUserRegistration(eventId, fullDocument);
            break;
            
          case 'update':
            await this.handleUserProfileUpdate(
              eventId, 
              fullDocument, 
              fullDocumentBeforeChange,
              changeEvent.updateDescription
            );
            break;
            
          case 'delete':
            await this.handleUserDeletion(eventId, fullDocumentBeforeChange);
            break;
        }
      }
    });
  }

  async handleUserRegistration(eventId, userDocument) {
    console.log(`Processing new user registration: ${userDocument._id}`);
    
    try {
      // Welcome email workflow
      await this.triggerWelcomeWorkflow(userDocument);
      
      // Setup default preferences
      await this.initializeUserDefaults(userDocument._id);
      
      // Analytics tracking
      await this.trackUserRegistrationEvent(userDocument);
      
      // Notifications to admin systems
      await this.notifyUserManagementSystems('user_registered', {
        userId: userDocument._id,
        email: userDocument.email,
        registrationDate: userDocument.created_at
      });
      
      console.log(`User registration processed successfully: ${userDocument._id}`);
      
    } catch (error) {
      console.error(`Error processing user registration for ${userDocument._id}:`, error);
      throw error;
    }
  }

  async handleUserProfileUpdate(eventId, currentDocument, previousDocument, updateDescription) {
    console.log(`Processing user profile update: ${currentDocument._id}`);
    
    try {
      const updatedFields = Object.keys(updateDescription.updatedFields || {});
      const removedFields = updateDescription.removedFields || [];
      
      // Email change handling
      if (updatedFields.includes('email')) {
        await this.handleEmailChange(
          currentDocument._id,
          previousDocument.email,
          currentDocument.email
        );
      }
      
      // Status change handling
      if (updatedFields.includes('status')) {
        await this.handleStatusChange(
          currentDocument._id,
          previousDocument.status,
          currentDocument.status
        );
      }
      
      // Preferences change handling
      const preferencesFields = updatedFields.filter(field => 
        field.startsWith('profile_data.preferences')
      );
      if (preferencesFields.length > 0) {
        await this.handlePreferencesChange(
          currentDocument._id,
          preferencesFields,
          currentDocument.profile_data?.preferences,
          previousDocument.profile_data?.preferences
        );
      }
      
      // Update analytics
      await this.trackUserUpdateEvent(currentDocument._id, updatedFields);
      
      console.log(`User profile update processed: ${currentDocument._id}`);
      
    } catch (error) {
      console.error(`Error processing user profile update:`, error);
      throw error;
    }
  }

  async handleEmailChange(userId, oldEmail, newEmail) {
    console.log(`Processing email change for user ${userId}: ${oldEmail} -> ${newEmail}`);
    
    // Trigger email verification
    await this.db.collection('email_verification_requests').insertOne({
      userId: userId,
      newEmail: newEmail,
      oldEmail: oldEmail,
      verificationToken: this.generateVerificationToken(),
      requestedAt: new Date(),
      status: 'pending'
    });
    
    // Send verification email
    await this.sendEmailVerificationRequest(userId, newEmail);
    
    // Update user status to pending verification
    await this.db.collection('user_profiles').updateOne(
      { _id: userId },
      { 
        $set: { 
          emailVerificationStatus: 'pending',
          emailVerificationRequestedAt: new Date()
        }
      }
    );
  }

  async handleStatusChange(userId, oldStatus, newStatus) {
    console.log(`Processing status change for user ${userId}: ${oldStatus} -> ${newStatus}`);
    
    // Status-specific logic
    switch (newStatus) {
      case 'suspended':
        await this.handleUserSuspension(userId, oldStatus);
        break;
        
      case 'active':
        if (oldStatus === 'suspended') {
          await this.handleUserReactivation(userId);
        }
        break;
        
      case 'deleted':
        await this.handleUserDeletion(null, { _id: userId, status: oldStatus });
        break;
    }
    
    // Notify related systems
    await this.notifyUserManagementSystems('status_changed', {
      userId: userId,
      oldStatus: oldStatus,
      newStatus: newStatus,
      changedAt: new Date()
    });
  }

  async createOrderChangeStream() {
    console.log('Creating order processing change stream...');
    
    return await this.createCollectionChangeStream('orders', {
      fullDocument: 'updateLookup',
      filters: {
        operationType: ['insert', 'update'],
        updatedFields: ['status', 'payment_status', 'fulfillment_status']
      },
      eventProcessor: async (eventId, changeEvent) => {
        const { operationType, fullDocument, updateDescription } = changeEvent;
        
        if (operationType === 'insert') {
          await this.handleNewOrder(eventId, fullDocument);
        } else if (operationType === 'update') {
          await this.handleOrderUpdate(eventId, fullDocument, updateDescription);
        }
      }
    });
  }

  async handleNewOrder(eventId, orderDocument) {
    console.log(`Processing new order: ${orderDocument._id}`);
    
    try {
      // Inventory management
      await this.updateInventoryForOrder(orderDocument);
      
      // Payment processing workflow
      if (orderDocument.payment_method === 'credit_card') {
        await this.initiatePaymentProcessing(orderDocument);
      }
      
      // Order confirmation
      await this.sendOrderConfirmation(orderDocument);
      
      // Analytics tracking
      await this.trackOrderEvent('order_created', orderDocument);
      
      console.log(`New order processed successfully: ${orderDocument._id}`);
      
    } catch (error) {
      console.error(`Error processing new order ${orderDocument._id}:`, error);
      
      // Update order with error status
      await this.db.collection('orders').updateOne(
        { _id: orderDocument._id },
        { 
          $set: { 
            processing_error: error.message,
            status: 'processing_failed',
            last_error_at: new Date()
          }
        }
      );
      
      throw error;
    }
  }

  async handleOrderUpdate(eventId, orderDocument, updateDescription) {
    console.log(`Processing order update: ${orderDocument._id}`);
    
    const updatedFields = Object.keys(updateDescription.updatedFields || {});
    
    try {
      // Status change handling
      if (updatedFields.includes('status')) {
        await this.handleOrderStatusChange(orderDocument);
      }
      
      // Payment status change
      if (updatedFields.includes('payment_status')) {
        await this.handlePaymentStatusChange(orderDocument);
      }
      
      // Fulfillment status change
      if (updatedFields.includes('fulfillment_status')) {
        await this.handleFulfillmentStatusChange(orderDocument);
      }
      
      console.log(`Order update processed: ${orderDocument._id}`);
      
    } catch (error) {
      console.error(`Error processing order update:`, error);
      throw error;
    }
  }

  async createAggregatedChangeStream() {
    console.log('Creating aggregated change stream across multiple collections...');
    
    try {
      // Database-level change stream
      const changeStreamOptions = {
        fullDocument: 'updateLookup',
        batchSize: this.config.batchSize
      };
      
      // Multi-collection pipeline
      const pipeline = [
        {
          $match: {
            'ns.coll': { $in: ['user_profiles', 'orders', 'products', 'inventory'] },
            operationType: { $in: ['insert', 'update', 'delete'] }
          }
        },
        {
          $addFields: {
            eventType: {
              $concat: ['$ns.coll', '_', '$operationType']
            },
            timestamp: '$clusterTime'
          }
        }
      ];
      
      const changeStream = this.db.watch(pipeline, changeStreamOptions);
      const streamId = 'aggregated_database_stream';
      
      this.activeStreams.set(streamId, {
        changeStream: changeStream,
        collection: 'database',
        type: 'aggregated',
        createdAt: new Date(),
        status: 'active'
      });
      
      // Setup aggregated event processing
      changeStream.on('change', async (changeEvent) => {
        try {
          await this.processAggregatedEvent(changeEvent);
        } catch (error) {
          console.error('Error processing aggregated change event:', error);
        }
      });
      
      console.log('Aggregated change stream created successfully');
      
      return {
        streamId: streamId,
        changeStream: changeStream,
        type: 'aggregated'
      };
      
    } catch (error) {
      console.error('Error creating aggregated change stream:', error);
      throw error;
    }
  }

  async processAggregatedEvent(changeEvent) {
    const { ns, operationType, fullDocument } = changeEvent;
    const collection = ns.coll;
    const eventType = `${collection}_${operationType}`;
    
    // Route to appropriate handler
    switch (eventType) {
      case 'user_profiles_insert':
      case 'user_profiles_update':
        await this.handleUserEvent(changeEvent);
        break;
        
      case 'orders_insert':
      case 'orders_update':
        await this.handleOrderEvent(changeEvent);
        break;
        
      case 'products_update':
        await this.handleProductEvent(changeEvent);
        break;
        
      case 'inventory_update':
        await this.handleInventoryEvent(changeEvent);
        break;
    }
    
    // Update real-time analytics
    await this.updateRealTimeAnalytics(eventType, fullDocument);
  }

  async handleUserEvent(changeEvent) {
    // Real-time user activity tracking
    const userId = changeEvent.fullDocument?._id;
    if (userId) {
      await this.updateUserActivityMetrics(userId, changeEvent.operationType);
    }
  }

  async handleOrderEvent(changeEvent) {
    // Real-time order analytics
    if (changeEvent.operationType === 'insert') {
      await this.updateOrderMetrics('new_order', changeEvent.fullDocument);
    } else if (changeEvent.operationType === 'update') {
      await this.updateOrderMetrics('order_updated', changeEvent.fullDocument);
    }
  }

  async createRealtimeDashboardStream() {
    console.log('Creating real-time dashboard change stream...');
    
    const pipeline = [
      {
        $match: {
          $or: [
            // New orders
            {
              'ns.coll': 'orders',
              operationType: 'insert'
            },
            // Order status updates
            {
              'ns.coll': 'orders',
              operationType: 'update',
              'updateDescription.updatedFields.status': { $exists: true }
            },
            // New user registrations
            {
              'ns.coll': 'user_profiles',
              operationType: 'insert'
            },
            // Inventory changes
            {
              'ns.coll': 'products',
              operationType: 'update',
              'updateDescription.updatedFields.inventory_count': { $exists: true }
            }
          ]
        }
      },
      {
        $project: {
          eventType: { $concat: ['$ns.coll', '_', '$operationType'] },
          timestamp: '$clusterTime',
          documentKey: '$documentKey',
          operationType: 1,
          updateDescription: 1,
          fullDocument: 1
        }
      }
    ];
    
    const changeStream = this.db.watch(pipeline, {
      fullDocument: 'updateLookup',
      batchSize: 50
    });
    
    changeStream.on('change', async (changeEvent) => {
      try {
        await this.broadcastDashboardUpdate(changeEvent);
      } catch (error) {
        console.error('Error broadcasting dashboard update:', error);
      }
    });
    
    return changeStream;
  }

  async broadcastDashboardUpdate(changeEvent) {
    const { eventType, timestamp, fullDocument } = changeEvent;
    
    const dashboardUpdate = {
      eventType: eventType,
      timestamp: timestamp,
      data: this.extractDashboardData(eventType, fullDocument)
    };
    
    // Broadcast to WebSocket clients, Redis pub/sub, etc.
    await this.broadcastToClients('dashboard_update', dashboardUpdate);
    
    // Update real-time metrics
    await this.updateRealTimeMetrics(eventType, fullDocument);
  }

  extractDashboardData(eventType, document) {
    switch (eventType) {
      case 'orders_insert':
        return {
          orderId: document._id,
          total: document.total_amount,
          customerId: document.customer_id,
          status: document.status
        };
        
      case 'user_profiles_insert':
        return {
          userId: document._id,
          email: document.email,
          registrationDate: document.created_at
        };
        
      case 'products_update':
        return {
          productId: document._id,
          name: document.name,
          inventoryCount: document.inventory_count,
          lowStock: document.inventory_count < document.low_stock_threshold
        };
        
      default:
        return document;
    }
  }

  // Utility methods for change stream management

  generateEventId(changeEvent) {
    const timestamp = changeEvent.clusterTime.toString();
    const documentKey = JSON.stringify(changeEvent.documentKey);
    const operation = changeEvent.operationType;
    
    return `${operation}_${timestamp}_${this.hashString(documentKey)}`;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  async logChangeEvent(eventId, changeEvent, streamId, timestamp) {
    const eventLogDoc = {
      eventId: eventId,
      streamId: streamId,
      collection: changeEvent.ns?.coll || 'unknown',
      operationType: changeEvent.operationType,
      documentKey: changeEvent.documentKey,
      timestamp: timestamp,
      clusterTime: changeEvent.clusterTime,
      
      // Event metadata
      hasFullDocument: !!changeEvent.fullDocument,
      hasUpdateDescription: !!changeEvent.updateDescription,
      updateFields: changeEvent.updateDescription ? 
        Object.keys(changeEvent.updateDescription.updatedFields || {}) : [],
      
      // Processing status
      processed: false,
      processingAttempts: 0,
      processingErrors: []
    };
    
    await this.db.collection('change_event_log').insertOne(eventLogDoc);
  }

  async saveResumeToken(streamId, resumeToken) {
    await this.db.collection('change_stream_resume_tokens').updateOne(
      { streamId: streamId },
      { 
        $set: { 
          resumeToken: resumeToken,
          lastUpdated: new Date()
        }
      },
      { upsert: true }
    );
  }

  async loadResumeToken(streamId) {
    const tokenDoc = await this.db.collection('change_stream_resume_tokens')
      .findOne({ streamId: streamId });
    
    return tokenDoc ? tokenDoc.resumeToken : null;
  }

  async updateProcessorHeartbeat(streamId) {
    await this.db.collection('event_processor_status').updateOne(
      { processorId: streamId },
      {
        $set: { 
          lastHeartbeat: new Date(),
          status: 'active'
        },
        $inc: { eventCount: 1 }
      },
      { upsert: true }
    );
  }

  async getChangeStreamStatus() {
    console.log('Retrieving change stream status...');
    
    const status = {
      activeStreams: this.activeStreams.size,
      streams: {},
      summary: {
        totalEvents: 0,
        processingErrors: 0,
        avgProcessingTime: 0
      }
    };
    
    // Get stream details
    for (const [streamId, streamInfo] of this.activeStreams) {
      const events = await this.db.collection('change_event_log')
        .find({ streamId: streamId })
        .sort({ timestamp: -1 })
        .limit(100)
        .toArray();
        
      const errors = await this.db.collection('change_event_log')
        .countDocuments({ 
          streamId: streamId,
          processingErrors: { $ne: [] }
        });
      
      status.streams[streamId] = {
        collection: streamInfo.collection,
        createdAt: streamInfo.createdAt,
        status: streamInfo.status,
        recentEvents: events.length,
        processingErrors: errors,
        lastEvent: events[0]?.timestamp
      };
      
      status.summary.totalEvents += events.length;
      status.summary.processingErrors += errors;
    }
    
    return status;
  }

  async cleanup() {
    console.log('Cleaning up Change Streams Manager...');
    
    // Close all active streams
    for (const [streamId, streamInfo] of this.activeStreams) {
      try {
        await streamInfo.changeStream.close();
        console.log(`Closed change stream: ${streamId}`);
      } catch (error) {
        console.error(`Error closing change stream ${streamId}:`, error);
      }
    }
    
    this.activeStreams.clear();
    this.resumeTokens.clear();
    this.eventProcessors.clear();
    
    console.log('Change Streams Manager cleanup completed');
  }
}

// Example usage demonstrating real-time event processing
async function demonstrateRealtimeEventProcessing() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  const changeStreamsManager = new MongoDBChangeStreamsManager(client, {
    database: 'realtime_application',
    enablePrePostImages: true,
    enableEventSourcing: true
  });
  
  try {
    // Create user profile change stream
    const userStream = await changeStreamsManager.createUserProfileChangeStream();
    console.log('User profile change stream created');
    
    // Create order processing change stream
    const orderStream = await changeStreamsManager.createOrderChangeStream();
    console.log('Order processing change stream created');
    
    // Create aggregated change stream
    const aggregatedStream = await changeStreamsManager.createAggregatedChangeStream();
    console.log('Aggregated change stream created');
    
    // Create real-time dashboard stream
    const dashboardStream = await changeStreamsManager.createRealtimeDashboardStream();
    console.log('Real-time dashboard stream created');
    
    // Simulate some data changes
    const db = client.db('realtime_application');
    
    // Insert test user
    await db.collection('user_profiles').insertOne({
      username: 'john_doe',
      email: 'john@example.com',
      status: 'active',
      profile_data: {
        preferences: {
          theme: 'dark',
          notifications: true
        }
      },
      created_at: new Date()
    });
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update user email
    await db.collection('user_profiles').updateOne(
      { username: 'john_doe' },
      { 
        $set: { 
          email: 'john.doe@example.com',
          'profile_data.preferences.theme': 'light'
        }
      }
    );
    
    // Insert test order
    await db.collection('orders').insertOne({
      customer_id: 'customer_123',
      items: [
        { product_id: 'product_1', quantity: 2, price: 29.99 },
        { product_id: 'product_2', quantity: 1, price: 59.99 }
      ],
      total_amount: 119.97,
      status: 'pending',
      payment_status: 'pending',
      created_at: new Date()
    });
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get change stream status
    const status = await changeStreamsManager.getChangeStreamStatus();
    console.log('Change Stream Status:', JSON.stringify(status, null, 2));
    
    return {
      userStream,
      orderStream,
      aggregatedStream,
      dashboardStream,
      status
    };
    
  } catch (error) {
    console.error('Error demonstrating real-time event processing:', error);
    throw error;
  } finally {
    // Note: In a real application, don't immediately cleanup
    // Let streams run continuously
    setTimeout(async () => {
      await changeStreamsManager.cleanup();
      await client.close();
    }, 5000);
  }
}

// Benefits of MongoDB Change Streams:
// - Native real-time change detection without external tools or polling overhead
// - Resume capability for fault-tolerant event processing and guaranteed delivery
// - Flexible filtering and aggregation for sophisticated event routing and processing
// - Pre and post-image support for complete change context and audit trails
// - Scalable real-time processing that handles high-volume change scenarios
// - Database-level and collection-level streams for granular or comprehensive monitoring
// - Built-in clustering support for distributed real-time applications
// - Integration with MongoDB's ACID guarantees for consistent event processing

module.exports = {
  MongoDBChangeStreamsManager,
  demonstrateRealtimeEventProcessing
};
```

## SQL-Style Change Stream Operations with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB Change Streams and real-time event processing:

```sql
-- QueryLeaf change stream operations with SQL-familiar syntax

-- Create change stream for real-time monitoring
CREATE CHANGE STREAM user_activity_stream 
ON user_profiles
WITH (
  full_document = 'updateLookup',
  full_document_before_change = 'whenAvailable',
  operation_types = ARRAY['insert', 'update', 'delete'],
  batch_size = 100,
  max_await_time_ms = 1000
)
FILTER (
  -- Only monitor specific operations
  operation_type IN ('insert', 'update', 'delete')
  AND (
    -- New user registrations
    operation_type = 'insert'
    OR 
    -- Status or email changes
    (operation_type = 'update' AND (
      updated_fields ? 'status' OR 
      updated_fields ? 'email' OR
      updated_fields ? 'profile_data.preferences'
    ))
  )
);

-- Process change stream events with SQL-style handling
WITH change_events AS (
  SELECT 
    change_id,
    cluster_time,
    operation_type,
    document_key,
    
    -- Document details
    full_document,
    full_document_before_change,
    update_description,
    
    -- Extract key fields
    full_document->>'_id' as user_id,
    full_document->>'email' as current_email,
    full_document->>'status' as current_status,
    full_document_before_change->>'email' as previous_email,
    full_document_before_change->>'status' as previous_status,
    
    -- Change analysis
    CASE operation_type
      WHEN 'insert' THEN 'user_registration'
      WHEN 'update' THEN 
        CASE 
          WHEN update_description->'updatedFields' ? 'email' THEN 'email_change'
          WHEN update_description->'updatedFields' ? 'status' THEN 'status_change'
          WHEN update_description->'updatedFields' ? 'profile_data.preferences' THEN 'preferences_change'
          ELSE 'profile_update'
        END
      WHEN 'delete' THEN 'user_deletion'
    END as event_type,
    
    -- Event metadata
    CURRENT_TIMESTAMP as processed_at,
    JSON_OBJECT_KEYS(update_description->'updatedFields') as changed_fields
    
  FROM CHANGE_STREAM('user_activity_stream')
  WHERE operation_type IN ('insert', 'update', 'delete')
),

-- Route events to appropriate handlers
event_routing AS (
  SELECT 
    *,
    -- Determine processing priority
    CASE event_type
      WHEN 'user_registration' THEN 1
      WHEN 'email_change' THEN 2
      WHEN 'status_change' THEN 2
      WHEN 'user_deletion' THEN 3
      ELSE 4
    END as priority,
    
    -- Business logic flags
    CASE 
      WHEN event_type = 'email_change' THEN true
      ELSE false
    END as requires_verification,
    
    CASE
      WHEN event_type = 'user_registration' THEN true
      WHEN event_type = 'status_change' AND current_status = 'active' AND previous_status = 'suspended' THEN true
      ELSE false
    END as triggers_welcome_workflow
)

-- Process events with business logic
SELECT 
  event_type,
  user_id,
  priority,
  
  -- User registration processing
  CASE WHEN event_type = 'user_registration' THEN
    JSON_BUILD_OBJECT(
      'action', 'process_registration',
      'user_id', user_id,
      'email', current_email,
      'welcome_workflow', true,
      'setup_defaults', true,
      'send_verification', true
    )
  END as registration_actions,
  
  -- Email change processing
  CASE WHEN event_type = 'email_change' THEN
    JSON_BUILD_OBJECT(
      'action', 'process_email_change',
      'user_id', user_id,
      'old_email', previous_email,
      'new_email', current_email,
      'requires_verification', true,
      'suspend_until_verified', true
    )
  END as email_change_actions,
  
  -- Status change processing
  CASE WHEN event_type = 'status_change' THEN
    JSON_BUILD_OBJECT(
      'action', 'process_status_change',
      'user_id', user_id,
      'old_status', previous_status,
      'new_status', current_status,
      'notify_admin', CASE WHEN current_status = 'suspended' THEN true ELSE false END,
      'cleanup_sessions', CASE WHEN current_status IN ('suspended', 'deleted') THEN true ELSE false END
    )
  END as status_change_actions,
  
  -- Analytics and tracking
  JSON_BUILD_OBJECT(
    'event_id', change_id,
    'event_type', event_type,
    'user_id', user_id,
    'timestamp', processed_at,
    'changed_fields', changed_fields,
    'processing_priority', priority
  ) as analytics_payload

FROM event_routing
ORDER BY priority ASC, processed_at ASC;

-- Real-time order processing with change streams
CREATE CHANGE STREAM order_processing_stream
ON orders
WITH (
  full_document = 'updateLookup',
  operation_types = ARRAY['insert', 'update']
)
FILTER (
  operation_type = 'insert'
  OR (
    operation_type = 'update' AND (
      updated_fields ? 'status' OR
      updated_fields ? 'payment_status' OR
      updated_fields ? 'fulfillment_status'
    )
  )
);

-- Process order changes with inventory and fulfillment logic
WITH order_changes AS (
  SELECT 
    change_id,
    operation_type,
    full_document->>'_id' as order_id,
    full_document->>'customer_id' as customer_id,
    full_document->'items' as order_items,
    full_document->>'status' as order_status,
    full_document->>'payment_status' as payment_status,
    full_document->>'fulfillment_status' as fulfillment_status,
    full_document->>'total_amount' as total_amount,
    
    -- Change analysis
    update_description->'updatedFields' as updated_fields,
    
    CASE operation_type
      WHEN 'insert' THEN 'new_order'
      WHEN 'update' THEN
        CASE 
          WHEN update_description->'updatedFields' ? 'status' THEN 'status_change'
          WHEN update_description->'updatedFields' ? 'payment_status' THEN 'payment_change'
          WHEN update_description->'updatedFields' ? 'fulfillment_status' THEN 'fulfillment_change'
          ELSE 'order_update'
        END
    END as change_type
    
  FROM CHANGE_STREAM('order_processing_stream')
),

-- Inventory impact analysis
inventory_updates AS (
  SELECT 
    oc.*,
    -- Calculate inventory requirements
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'product_id', item->>'product_id',
        'quantity_required', (item->>'quantity')::INTEGER,
        'reserved_quantity', CASE WHEN oc.change_type = 'new_order' THEN (item->>'quantity')::INTEGER ELSE 0 END
      )
    ) as inventory_impact
  FROM order_changes oc
  CROSS JOIN JSON_ARRAY_ELEMENTS(oc.order_items) as item
  WHERE oc.change_type = 'new_order'
  GROUP BY oc.change_id, oc.operation_type, oc.order_id, oc.customer_id, 
           oc.order_status, oc.payment_status, oc.total_amount, oc.change_type
),

-- Order processing workflows
order_workflows AS (
  SELECT 
    oc.*,
    
    -- New order workflow
    CASE WHEN oc.change_type = 'new_order' THEN
      JSON_BUILD_OBJECT(
        'workflow', 'new_order_processing',
        'steps', ARRAY[
          'validate_order',
          'reserve_inventory', 
          'process_payment',
          'send_confirmation',
          'trigger_fulfillment'
        ],
        'priority', 'high',
        'estimated_processing_time', '5 minutes'
      )
    END as new_order_workflow,
    
    -- Payment status workflow
    CASE WHEN oc.change_type = 'payment_change' THEN
      JSON_BUILD_OBJECT(
        'workflow', 'payment_status_processing',
        'payment_status', oc.payment_status,
        'actions', 
          CASE oc.payment_status
            WHEN 'completed' THEN ARRAY['release_inventory', 'trigger_fulfillment', 'send_receipt']
            WHEN 'failed' THEN ARRAY['restore_inventory', 'cancel_order', 'notify_customer']
            WHEN 'pending' THEN ARRAY['hold_inventory', 'monitor_payment']
            ELSE ARRAY['investigate_status']
          END
      )
    END as payment_workflow,
    
    -- Fulfillment workflow
    CASE WHEN oc.change_type = 'fulfillment_change' THEN
      JSON_BUILD_OBJECT(
        'workflow', 'fulfillment_processing',
        'fulfillment_status', oc.fulfillment_status,
        'actions',
          CASE oc.fulfillment_status
            WHEN 'shipped' THEN ARRAY['send_tracking', 'update_customer', 'schedule_delivery_confirmation']
            WHEN 'delivered' THEN ARRAY['confirm_delivery', 'request_review', 'process_loyalty_points']
            WHEN 'cancelled' THEN ARRAY['restore_inventory', 'process_refund', 'notify_cancellation']
            ELSE ARRAY['monitor_fulfillment']
          END
      )
    END as fulfillment_workflow
  
  FROM order_changes oc
  LEFT JOIN inventory_updates iu ON oc.order_id = iu.order_id
)

-- Generate processing instructions
SELECT 
  change_type,
  order_id,
  customer_id,
  
  -- Workflow instructions
  COALESCE(new_order_workflow, payment_workflow, fulfillment_workflow) as workflow_config,
  
  -- Real-time notifications
  JSON_BUILD_OBJECT(
    'notification_type', 
      CASE change_type
        WHEN 'new_order' THEN 'order_received'
        WHEN 'payment_change' THEN 'payment_update'
        WHEN 'fulfillment_change' THEN 'fulfillment_update'
        ELSE 'order_update'
      END,
    'customer_id', customer_id,
    'order_id', order_id,
    'timestamp', CURRENT_TIMESTAMP,
    'requires_immediate_action', 
      CASE change_type 
        WHEN 'new_order' THEN true
        WHEN 'payment_change' AND payment_status = 'failed' THEN true
        ELSE false
      END
  ) as customer_notification,
  
  -- Analytics tracking
  JSON_BUILD_OBJECT(
    'event_type', change_type,
    'order_value', total_amount,
    'processing_timestamp', CURRENT_TIMESTAMP,
    'workflow_triggered', true
  ) as analytics_data

FROM order_workflows
WHERE workflow_config IS NOT NULL;

-- Multi-collection aggregated change stream monitoring
CREATE CHANGE STREAM business_intelligence_stream
ON DATABASE real_time_app
WITH (
  full_document = 'updateLookup',
  operation_types = ARRAY['insert', 'update', 'delete']
)
FILTER (
  namespace_collection IN ('user_profiles', 'orders', 'products', 'reviews')
  AND (
    -- New records across all collections
    operation_type = 'insert'
    OR
    -- Important field changes
    (operation_type = 'update' AND (
      (namespace_collection = 'orders' AND updated_fields ? 'status') OR
      (namespace_collection = 'user_profiles' AND updated_fields ? 'status') OR
      (namespace_collection = 'products' AND updated_fields ? 'inventory_count') OR
      (namespace_collection = 'reviews' AND updated_fields ? 'rating')
    ))
  )
);

-- Real-time business intelligence aggregation
WITH cross_collection_events AS (
  SELECT 
    cluster_time,
    namespace_collection as collection,
    operation_type,
    full_document,
    
    -- Collection-specific metrics extraction
    CASE namespace_collection
      WHEN 'user_profiles' THEN
        JSON_BUILD_OBJECT(
          'metric_type', 'user_activity',
          'user_id', full_document->>'_id',
          'action', operation_type,
          'user_status', full_document->>'status',
          'registration_date', full_document->>'created_at'
        )
      WHEN 'orders' THEN
        JSON_BUILD_OBJECT(
          'metric_type', 'sales_activity', 
          'order_id', full_document->>'_id',
          'customer_id', full_document->>'customer_id',
          'order_value', (full_document->>'total_amount')::DECIMAL,
          'order_status', full_document->>'status',
          'item_count', JSON_ARRAY_LENGTH(full_document->'items')
        )
      WHEN 'products' THEN
        JSON_BUILD_OBJECT(
          'metric_type', 'inventory_activity',
          'product_id', full_document->>'_id',
          'product_name', full_document->>'name',
          'inventory_count', (full_document->>'inventory_count')::INTEGER,
          'low_stock_alert', (full_document->>'inventory_count')::INTEGER < (full_document->>'low_stock_threshold')::INTEGER
        )
      WHEN 'reviews' THEN
        JSON_BUILD_OBJECT(
          'metric_type', 'customer_feedback',
          'review_id', full_document->>'_id',
          'product_id', full_document->>'product_id',
          'customer_id', full_document->>'customer_id',
          'rating', (full_document->>'rating')::DECIMAL,
          'sentiment', full_document->>'sentiment'
        )
    END as metrics_data,
    
    -- Event timing
    DATE_TRUNC('hour', TO_TIMESTAMP(cluster_time)) as event_hour,
    DATE_TRUNC('day', TO_TIMESTAMP(cluster_time)) as event_date
    
  FROM CHANGE_STREAM('business_intelligence_stream')
),

-- Real-time KPI aggregation
realtime_kpis AS (
  SELECT 
    event_hour,
    
    -- User activity KPIs
    COUNT(*) FILTER (WHERE metrics_data->>'metric_type' = 'user_activity' AND operation_type = 'insert') as new_user_registrations,
    COUNT(*) FILTER (WHERE metrics_data->>'metric_type' = 'user_activity') as total_user_events,
    
    -- Sales KPIs  
    COUNT(*) FILTER (WHERE metrics_data->>'metric_type' = 'sales_activity' AND operation_type = 'insert') as new_orders,
    SUM((metrics_data->>'order_value')::DECIMAL) FILTER (WHERE metrics_data->>'metric_type' = 'sales_activity' AND operation_type = 'insert') as hourly_revenue,
    AVG((metrics_data->>'order_value')::DECIMAL) FILTER (WHERE metrics_data->>'metric_type' = 'sales_activity' AND operation_type = 'insert') as avg_order_value,
    
    -- Inventory KPIs
    COUNT(*) FILTER (WHERE metrics_data->>'metric_type' = 'inventory_activity' AND (metrics_data->>'low_stock_alert')::BOOLEAN = true) as low_stock_alerts,
    
    -- Customer satisfaction KPIs
    COUNT(*) FILTER (WHERE metrics_data->>'metric_type' = 'customer_feedback') as new_reviews,
    AVG((metrics_data->>'rating')::DECIMAL) FILTER (WHERE metrics_data->>'metric_type' = 'customer_feedback') as avg_rating_hour,
    
    -- Real-time alerts
    ARRAY_AGG(
      CASE 
        WHEN metrics_data->>'metric_type' = 'inventory_activity' AND (metrics_data->>'low_stock_alert')::BOOLEAN = true THEN
          JSON_BUILD_OBJECT(
            'alert_type', 'low_stock',
            'product_id', metrics_data->>'product_id',
            'product_name', metrics_data->>'product_name',
            'current_inventory', metrics_data->>'inventory_count'
          )
        WHEN metrics_data->>'metric_type' = 'customer_feedback' AND (metrics_data->>'rating')::DECIMAL <= 2 THEN
          JSON_BUILD_OBJECT(
            'alert_type', 'negative_review',
            'product_id', metrics_data->>'product_id',
            'customer_id', metrics_data->>'customer_id',
            'rating', metrics_data->>'rating'
          )
      END
    ) FILTER (WHERE 
      (metrics_data->>'metric_type' = 'inventory_activity' AND (metrics_data->>'low_stock_alert')::BOOLEAN = true) OR
      (metrics_data->>'metric_type' = 'customer_feedback' AND (metrics_data->>'rating')::DECIMAL <= 2)
    ) as real_time_alerts
    
  FROM cross_collection_events
  GROUP BY event_hour
)

-- Generate real-time business intelligence dashboard
SELECT 
  TO_CHAR(event_hour, 'YYYY-MM-DD HH24:00') as hour_period,
  new_user_registrations,
  new_orders,
  ROUND(hourly_revenue, 2) as hourly_revenue,
  ROUND(avg_order_value, 2) as avg_order_value,
  low_stock_alerts,
  new_reviews,
  ROUND(avg_rating_hour, 2) as avg_hourly_rating,
  
  -- Business health indicators
  CASE 
    WHEN new_orders > 50 THEN 'high_activity'
    WHEN new_orders > 20 THEN 'normal_activity'
    WHEN new_orders > 0 THEN 'low_activity'
    ELSE 'no_activity'
  END as sales_activity_level,
  
  CASE
    WHEN avg_rating_hour >= 4.5 THEN 'excellent'
    WHEN avg_rating_hour >= 4.0 THEN 'good' 
    WHEN avg_rating_hour >= 3.5 THEN 'fair'
    ELSE 'needs_attention'
  END as customer_satisfaction_level,
  
  -- Immediate action items
  CASE
    WHEN low_stock_alerts > 0 THEN 'restock_required'
    WHEN array_length(real_time_alerts, 1) > 5 THEN 'multiple_alerts_require_attention'
    WHEN avg_rating_hour < 3.0 THEN 'investigate_customer_issues'
    ELSE 'normal_operations'
  END as operational_status,
  
  real_time_alerts,
  
  -- Performance metrics
  JSON_BUILD_OBJECT(
    'data_freshness', 'real_time',
    'processing_timestamp', CURRENT_TIMESTAMP,
    'events_processed', total_user_events + new_orders + new_reviews,
    'alert_count', array_length(real_time_alerts, 1)
  ) as dashboard_metadata

FROM realtime_kpis  
ORDER BY event_hour DESC;

-- Change stream performance monitoring
SELECT 
  stream_name,
  collection_name,
  
  -- Stream health metrics
  COUNT(*) as total_events_processed,
  COUNT(*) FILTER (WHERE processed_successfully = true) as successful_events,
  COUNT(*) FILTER (WHERE processed_successfully = false) as failed_events,
  
  -- Performance metrics
  AVG(processing_duration_ms) as avg_processing_time_ms,
  MAX(processing_duration_ms) as max_processing_time_ms,
  MIN(processing_duration_ms) as min_processing_time_ms,
  
  -- Latency analysis
  AVG(EXTRACT(EPOCH FROM (processed_at - event_timestamp)) * 1000) as avg_latency_ms,
  MAX(EXTRACT(EPOCH FROM (processed_at - event_timestamp)) * 1000) as max_latency_ms,
  
  -- Stream reliability
  ROUND(
    (COUNT(*) FILTER (WHERE processed_successfully = true)::DECIMAL / COUNT(*)) * 100, 
    2
  ) as success_rate_percent,
  
  -- Recent activity
  COUNT(*) FILTER (WHERE event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour') as events_last_hour,
  COUNT(*) FILTER (WHERE event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 day') as events_last_day,
  
  -- Error analysis
  STRING_AGG(DISTINCT error_message, '; ') as common_errors,
  
  -- Performance recommendations
  CASE 
    WHEN AVG(processing_duration_ms) > 5000 THEN 'Optimize event processing logic'
    WHEN ROUND((COUNT(*) FILTER (WHERE processed_successfully = true)::DECIMAL / COUNT(*)) * 100, 2) < 95 THEN 'Investigate processing failures'
    WHEN MAX(EXTRACT(EPOCH FROM (processed_at - event_timestamp)) * 1000) > 10000 THEN 'Review processing latency'
    ELSE 'Stream performing within acceptable parameters'
  END as optimization_recommendation

FROM change_stream_processing_log
WHERE event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY stream_name, collection_name
ORDER BY total_events_processed DESC;

-- QueryLeaf provides comprehensive change stream capabilities:
-- 1. SQL-familiar change stream creation and configuration
-- 2. Real-time event filtering and processing with business logic
-- 3. Cross-collection aggregated monitoring for comprehensive insights
-- 4. Automated workflow triggers based on change patterns
-- 5. Real-time business intelligence and KPI tracking
-- 6. Performance monitoring and optimization recommendations
-- 7. Fault-tolerant event processing with resume capabilities
-- 8. Integration with MongoDB's native change stream features
-- 9. Scalable real-time architectures for modern applications
-- 10. Event sourcing patterns with SQL-style event processing
```

## Best Practices for Change Streams Implementation

### Real-Time Architecture Design

Essential practices for building reliable change stream applications:

1. **Resume Token Management**: Implement robust resume token storage for fault-tolerant event processing
2. **Event Filtering**: Use precise filtering to minimize processing overhead and focus on relevant changes
3. **Error Handling**: Design comprehensive error handling with retry logic and dead letter queues
4. **Performance Monitoring**: Track processing latency, throughput, and error rates for optimization
5. **Scalability Planning**: Design change stream processors to scale horizontally with application growth
6. **Testing Strategies**: Implement thorough testing including failure scenarios and resume capability

### Event Processing Optimization

Optimize change stream processing for enterprise-scale applications:

1. **Batch Processing**: Group related events for efficient processing while maintaining real-time responsiveness
2. **Async Processing**: Use asynchronous patterns to prevent blocking and improve throughput
3. **Event Prioritization**: Implement priority queues for critical business events
4. **Resource Management**: Monitor memory usage and connection pools for sustained operation
5. **Observability**: Implement comprehensive logging and metrics for operational excellence
6. **Data Consistency**: Ensure proper ordering and exactly-once processing semantics

## Conclusion

MongoDB Change Streams provide native real-time change detection that enables building responsive, event-driven applications without the complexity and overhead of external CDC solutions. The combination of comprehensive change detection, fault tolerance, and familiar SQL-style operations makes implementing real-time features both powerful and accessible.

Key Change Streams benefits include:

- **Native Real-Time**: Built-in change detection without external tools or polling overhead
- **Fault Tolerant**: Resume capability ensures reliable event processing and delivery
- **Flexible Filtering**: Sophisticated filtering for precise event routing and processing
- **Scalable Processing**: High-performance event streams that scale with application demand
- **Complete Context**: Pre and post-image support for comprehensive change understanding
- **SQL Integration**: Familiar query patterns for change stream operations and event processing

Whether you're building real-time dashboards, microservices communication, event sourcing architectures, or reactive applications, MongoDB Change Streams with QueryLeaf's familiar SQL interface provide the foundation for modern real-time systems.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB Change Streams while providing SQL-familiar syntax for change stream creation, event processing, and real-time analytics. Advanced event routing, business logic integration, and performance optimization are seamlessly handled through familiar SQL patterns, making sophisticated real-time applications both powerful and maintainable.

The integration of native change detection with SQL-style event processing makes MongoDB an ideal platform for applications requiring both real-time reactivity and familiar database interaction patterns, ensuring your real-time solutions remain both effective and maintainable as they scale and evolve.