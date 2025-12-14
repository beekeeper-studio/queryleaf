---
title: "MongoDB Document Validation and Schema Evolution Strategies: Flexible Data Governance for Dynamic Applications"
description: "Master MongoDB document validation and schema evolution techniques for maintaining data integrity while preserving application flexibility. Learn validation rules, schema versioning patterns, and SQL-familiar data governance strategies for enterprise applications."
date: 2025-12-13
tags: [mongodb, document-validation, schema-evolution, data-governance, enterprise, sql, flexible-schema]
---

# MongoDB Document Validation and Schema Evolution Strategies: Flexible Data Governance for Dynamic Applications

Modern enterprise applications must balance data integrity requirements with the flexibility to adapt quickly to changing business needs, evolving user requirements, and regulatory compliance updates. Traditional relational databases enforce rigid schema constraints that ensure data consistency but often require complex migration procedures and application downtime when requirements change, creating significant barriers to agile development and rapid feature deployment.

MongoDB's flexible document structure provides powerful capabilities for maintaining data quality through configurable validation rules while preserving the schema flexibility essential for dynamic applications. Understanding how to implement effective document validation strategies and manage schema evolution enables development teams to maintain data integrity standards while preserving the agility that makes MongoDB ideal for modern application architectures.

## The Traditional Rigid Schema Challenge

Conventional relational database schema management creates significant constraints on application evolution and data governance flexibility:

```sql
-- Traditional PostgreSQL rigid schema with complex constraint management overhead

-- User profile management with strict constraints requiring schema migrations
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    date_of_birth DATE,
    
    -- Strict validation constraints
    profile_status VARCHAR(20) NOT NULL DEFAULT 'active',
    account_type VARCHAR(20) NOT NULL DEFAULT 'standard',
    subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',
    
    -- Business rule constraints
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Rigid constraints that resist business requirement changes
    CONSTRAINT valid_profile_status CHECK (profile_status IN ('active', 'inactive', 'suspended', 'deleted')),
    CONSTRAINT valid_account_type CHECK (account_type IN ('standard', 'premium', 'enterprise')),
    CONSTRAINT valid_subscription_tier CHECK (subscription_tier IN ('free', 'basic', 'pro', 'enterprise')),
    CONSTRAINT valid_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_phone_format CHECK (phone_number ~* '^\+?[1-9]\d{1,14}$'),
    CONSTRAINT valid_birth_date CHECK (date_of_birth >= '1900-01-01' AND date_of_birth <= CURRENT_DATE),
    CONSTRAINT username_length CHECK (length(username) >= 3 AND length(username) <= 50),
    CONSTRAINT name_validation CHECK (length(first_name) >= 1 AND length(last_name) >= 1)
);

-- User preferences with complex relationship constraints
CREATE TABLE user_preferences (
    preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    preference_category VARCHAR(50) NOT NULL,
    preference_key VARCHAR(100) NOT NULL,
    preference_value JSONB NOT NULL,
    preference_type VARCHAR(20) NOT NULL DEFAULT 'string',
    is_public BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Complex validation requiring multiple checks
    CONSTRAINT valid_preference_category CHECK (preference_category IN (
        'notifications', 'privacy', 'display', 'communication', 'security', 'accessibility'
    )),
    CONSTRAINT valid_preference_type CHECK (preference_type IN (
        'string', 'number', 'boolean', 'array', 'object'
    )),
    CONSTRAINT preference_value_validation CHECK (
        CASE preference_type
            WHEN 'boolean' THEN preference_value::text IN ('true', 'false')
            WHEN 'number' THEN preference_value::text ~ '^-?[0-9]+\.?[0-9]*$'
            ELSE TRUE -- String and complex types need application validation
        END
    ),
    
    -- Unique constraint prevents duplicate preferences
    UNIQUE (user_id, preference_category, preference_key)
);

-- Complex schema migration procedure for adding new business requirements
-- Example: Adding new subscription tiers and validation rules

-- Step 1: Add new constraint values (requires exclusive table lock)
ALTER TABLE user_profiles 
DROP CONSTRAINT valid_subscription_tier;

ALTER TABLE user_profiles 
ADD CONSTRAINT valid_subscription_tier CHECK (subscription_tier IN (
    'free', 'basic', 'pro', 'premium', 'enterprise', 'custom'
));

-- Step 2: Add new preference categories (requires constraint recreation)
ALTER TABLE user_preferences 
DROP CONSTRAINT valid_preference_category;

ALTER TABLE user_preferences 
ADD CONSTRAINT valid_preference_category CHECK (preference_category IN (
    'notifications', 'privacy', 'display', 'communication', 'security', 
    'accessibility', 'billing', 'integration', 'analytics'
));

-- Step 3: Add new validation rules for complex business logic
ALTER TABLE user_profiles 
ADD COLUMN profile_metadata JSONB DEFAULT '{}';

-- Step 4: Create complex validation function for new business rules
CREATE OR REPLACE FUNCTION validate_profile_metadata(metadata JSONB)
RETURNS BOOLEAN AS $$
DECLARE
    subscription_tier TEXT;
    required_fields TEXT[];
    field TEXT;
BEGIN
    -- Extract subscription tier for validation
    subscription_tier := metadata->>'subscriptionTier';
    
    -- Define required fields based on tier
    IF subscription_tier IN ('premium', 'enterprise', 'custom') THEN
        required_fields := ARRAY['company', 'industry', 'employeeCount'];
    ELSE
        required_fields := ARRAY['userType'];
    END IF;
    
    -- Validate required fields exist
    FOREACH field IN ARRAY required_fields LOOP
        IF NOT metadata ? field OR metadata->>field IS NULL OR metadata->>field = '' THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    
    -- Validate specific field formats
    IF metadata ? 'employeeCount' THEN
        IF NOT (metadata->>'employeeCount')::TEXT ~ '^[0-9]+$' THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    IF metadata ? 'industry' THEN
        IF NOT metadata->>'industry' IN ('technology', 'healthcare', 'finance', 'education', 'retail', 'other') THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 5: Add constraint using validation function
ALTER TABLE user_profiles 
ADD CONSTRAINT valid_profile_metadata CHECK (validate_profile_metadata(profile_metadata));

-- Complex view for business logic validation across related tables
CREATE OR REPLACE VIEW validated_user_profiles AS
SELECT 
    up.*,
    
    -- Preference validation aggregation
    CASE 
        WHEN COUNT(pref.preference_id) = 0 THEN 'incomplete_profile'
        WHEN COUNT(pref.preference_id) FILTER (WHERE pref.preference_category = 'privacy') = 0 THEN 'missing_privacy_settings'
        WHEN COUNT(pref.preference_id) >= 5 THEN 'complete_profile'
        ELSE 'partial_profile'
    END as profile_completion_status,
    
    -- Business rule validation
    CASE 
        WHEN up.subscription_tier IN ('premium', 'enterprise') AND up.profile_metadata->>'company' IS NULL THEN 'invalid_business_profile'
        WHEN up.subscription_tier = 'free' AND COUNT(pref.preference_id) > 10 THEN 'exceeds_free_limit'
        ELSE 'valid_profile'
    END as business_rule_status,
    
    -- Compliance validation
    CASE 
        WHEN up.created_at < CURRENT_TIMESTAMP - INTERVAL '2 years' 
             AND up.last_login_at IS NULL THEN 'dormant_account'
        WHEN up.profile_metadata->>'gdprConsent' IS NULL 
             AND up.created_at > '2018-05-25' THEN 'missing_gdpr_consent'
        ELSE 'compliant'
    END as compliance_status
    
FROM user_profiles up
LEFT JOIN user_preferences pref ON up.user_id = pref.user_id
GROUP BY up.user_id, up.email, up.username, up.first_name, up.last_name, 
         up.phone_number, up.date_of_birth, up.profile_status, up.account_type, 
         up.subscription_tier, up.created_at, up.updated_at, up.last_login_at, 
         up.profile_metadata;

-- Complex migration script for schema evolution
DO $$
DECLARE
    migration_start TIMESTAMP := CURRENT_TIMESTAMP;
    records_updated INTEGER := 0;
    validation_errors INTEGER := 0;
    user_record RECORD;
BEGIN
    RAISE NOTICE 'Starting schema migration at %', migration_start;
    
    -- Update existing records to comply with new validation rules
    FOR user_record IN 
        SELECT user_id, subscription_tier, profile_metadata
        FROM user_profiles 
        WHERE profile_metadata = '{}'::JSONB
    LOOP
        BEGIN
            -- Set default metadata based on subscription tier
            UPDATE user_profiles 
            SET profile_metadata = CASE subscription_tier
                WHEN 'enterprise' THEN '{"userType": "business", "company": "Unknown", "industry": "other"}'::JSONB
                WHEN 'premium' THEN '{"userType": "professional", "company": "Individual"}'::JSONB
                ELSE '{"userType": "personal"}'::JSONB
            END
            WHERE user_id = user_record.user_id;
            
            records_updated := records_updated + 1;
            
        EXCEPTION
            WHEN check_violation THEN
                validation_errors := validation_errors + 1;
                RAISE WARNING 'Validation error for user %: %', user_record.user_id, SQLERRM;
                
                -- Handle validation errors with fallback values
                UPDATE user_profiles 
                SET profile_metadata = '{"userType": "personal"}'::JSONB
                WHERE user_id = user_record.user_id;
        END;
    END LOOP;
    
    RAISE NOTICE 'Schema migration completed: % records updated, % validation errors', 
        records_updated, validation_errors;
    RAISE NOTICE 'Migration duration: %', CURRENT_TIMESTAMP - migration_start;
END $$;

-- Problems with traditional rigid schema management:
-- 1. Complex schema migrations requiring downtime and exclusive table locks affecting availability
-- 2. Rigid constraint validation preventing rapid business requirement adaptation
-- 3. Application-database coupling requiring coordinated deployments for schema changes
-- 4. Complex validation function maintenance and versioning overhead
-- 5. Difficult rollback procedures for schema changes affecting production stability
-- 6. Performance impact from complex constraint checking on high-volume operations
-- 7. Limited flexibility for optional or conditional field validation
-- 8. Version management complexity across multiple database environments
-- 9. Testing challenges for schema changes across different application versions
-- 10. Operational overhead for managing constraint dependencies and relationships
```

MongoDB provides flexible document validation that maintains data integrity while preserving schema evolution capabilities:

```javascript
// MongoDB Document Validation - Flexible schema governance with evolution support
const { MongoClient, ObjectId } = require('mongodb');

// Advanced MongoDB Document Validation and Schema Evolution Manager
class MongoDBValidationManager {
  constructor(client, config = {}) {
    this.client = client;
    this.db = client.db(config.database || 'flexible_validation_db');
    
    this.config = {
      // Validation configuration
      enableFlexibleValidation: config.enableFlexibleValidation !== false,
      enableSchemaVersioning: config.enableSchemaVersioning !== false,
      enableGradualValidation: config.enableGradualValidation !== false,
      
      // Evolution management
      enableSchemaEvolution: config.enableSchemaEvolution !== false,
      enableBackwardCompatibility: config.enableBackwardCompatibility !== false,
      enableValidationMigration: config.enableValidationMigration !== false,
      
      // Governance and compliance
      enableComplianceValidation: config.enableComplianceValidation !== false,
      enableBusinessRuleValidation: config.enableBusinessRuleValidation !== false,
      enableDataQualityMonitoring: config.enableDataQualityMonitoring !== false,
      
      // Performance optimization
      enableValidationOptimization: config.enableValidationOptimization !== false,
      enableValidationCaching: config.enableValidationCaching !== false,
      enablePartialValidation: config.enablePartialValidation !== false
    };
    
    // Schema management
    this.schemaVersions = new Map();
    this.validationRules = new Map();
    this.evolutionHistory = new Map();
    
    this.initializeValidationManager();
  }

  async initializeValidationManager() {
    console.log('Initializing MongoDB Document Validation Manager...');
    
    try {
      // Setup validation collections
      await this.setupValidationCollections();
      
      // Initialize schema versioning
      if (this.config.enableSchemaVersioning) {
        await this.initializeSchemaVersioning();
      }
      
      // Setup validation rules
      await this.setupFlexibleValidationRules();
      
      // Initialize compliance validation
      if (this.config.enableComplianceValidation) {
        await this.initializeComplianceValidation();
      }
      
      console.log('MongoDB Validation Manager initialized successfully');
      
    } catch (error) {
      console.error('Error initializing validation manager:', error);
      throw error;
    }
  }

  async setupValidationCollections() {
    console.log('Setting up document validation collections...');
    
    try {
      // Schema version tracking collection
      const schemaVersionsCollection = this.db.collection('schema_versions');
      await schemaVersionsCollection.createIndexes([
        { key: { collection: 1, version: 1 }, unique: true, background: true },
        { key: { effectiveDate: 1 }, background: true },
        { key: { isActive: 1, collection: 1 }, background: true }
      ]);
      
      // Validation error tracking
      const validationErrorsCollection = this.db.collection('validation_errors');
      await validationErrorsCollection.createIndexes([
        { key: { timestamp: -1 }, background: true },
        { key: { collection: 1, errorType: 1 }, background: true },
        { key: { severity: 1, timestamp: -1 }, background: true }
      ]);
      
      console.log('Validation collections configured successfully');
      
    } catch (error) {
      console.error('Error setting up validation collections:', error);
      throw error;
    }
  }

  async createFlexibleValidationSchema(collectionName, validationConfig) {
    console.log(`Creating flexible validation schema for: ${collectionName}`);
    
    try {
      const collection = this.db.collection(collectionName);
      
      // Build flexible validation schema
      const validationSchema = this.buildValidationSchema(validationConfig);
      
      // Create collection with validation
      await this.db.createCollection(collectionName, {
        validator: validationSchema,
        validationLevel: validationConfig.level || 'moderate', // strict, moderate, off
        validationAction: validationConfig.action || 'error' // error, warn
      });
      
      // Store validation configuration for evolution tracking
      await this.storeValidationConfig(collectionName, validationConfig, validationSchema);
      
      console.log(`Flexible validation schema created for: ${collectionName}`);
      
      return {
        collection: collectionName,
        validationLevel: validationConfig.level || 'moderate',
        validationAction: validationConfig.action || 'error',
        schema: validationSchema,
        flexibility: 'high',
        evolutionSupport: true
      };
      
    } catch (error) {
      console.error(`Error creating validation schema for ${collectionName}:`, error);
      throw error;
    }
  }

  buildValidationSchema(config) {
    const schema = {
      $jsonSchema: {
        bsonType: 'object',
        title: config.title || 'Document Validation Schema',
        description: config.description || 'Flexible document validation',
        properties: {},
        additionalProperties: config.allowAdditionalProperties !== false // Default: allow flexibility
      }
    };
    
    // Add required fields
    if (config.required && config.required.length > 0) {
      schema.$jsonSchema.required = config.required;
    }
    
    // Build field properties with flexible validation
    if (config.fields) {
      Object.keys(config.fields).forEach(fieldName => {
        const fieldConfig = config.fields[fieldName];
        schema.$jsonSchema.properties[fieldName] = this.buildFieldValidation(fieldConfig);
      });
    }
    
    // Add custom validation expressions
    if (config.customValidation) {
      schema = { ...schema, ...config.customValidation };
    }
    
    return schema;
  }

  buildFieldValidation(fieldConfig) {
    const validation = {
      bsonType: fieldConfig.type || 'string',
      description: fieldConfig.description || `Validation for ${fieldConfig.type} field`
    };
    
    // Type-specific validations
    switch (fieldConfig.type) {
      case 'string':
        if (fieldConfig.minLength) validation.minLength = fieldConfig.minLength;
        if (fieldConfig.maxLength) validation.maxLength = fieldConfig.maxLength;
        if (fieldConfig.pattern) validation.pattern = fieldConfig.pattern;
        if (fieldConfig.enum) validation.enum = fieldConfig.enum;
        break;
        
      case 'number':
      case 'int':
        if (fieldConfig.minimum !== undefined) validation.minimum = fieldConfig.minimum;
        if (fieldConfig.maximum !== undefined) validation.maximum = fieldConfig.maximum;
        if (fieldConfig.exclusiveMinimum !== undefined) validation.exclusiveMinimum = fieldConfig.exclusiveMinimum;
        if (fieldConfig.exclusiveMaximum !== undefined) validation.exclusiveMaximum = fieldConfig.exclusiveMaximum;
        break;
        
      case 'array':
        if (fieldConfig.minItems) validation.minItems = fieldConfig.minItems;
        if (fieldConfig.maxItems) validation.maxItems = fieldConfig.maxItems;
        if (fieldConfig.uniqueItems) validation.uniqueItems = fieldConfig.uniqueItems;
        if (fieldConfig.items) validation.items = this.buildFieldValidation(fieldConfig.items);
        break;
        
      case 'object':
        if (fieldConfig.properties) {
          validation.properties = {};
          Object.keys(fieldConfig.properties).forEach(prop => {
            validation.properties[prop] = this.buildFieldValidation(fieldConfig.properties[prop]);
          });
        }
        if (fieldConfig.required) validation.required = fieldConfig.required;
        if (fieldConfig.additionalProperties !== undefined) {
          validation.additionalProperties = fieldConfig.additionalProperties;
        }
        break;
    }
    
    // Conditional validation
    if (fieldConfig.conditional) {
      validation.if = fieldConfig.conditional.if;
      validation.then = fieldConfig.conditional.then;
      validation.else = fieldConfig.conditional.else;
    }
    
    return validation;
  }

  async setupUserProfileValidation() {
    console.log('Setting up flexible user profile validation...');
    
    const userProfileValidation = {
      title: 'User Profile Validation Schema',
      description: 'Flexible validation for user profiles with business rule support',
      level: 'moderate', // Allow some flexibility
      action: 'error',
      allowAdditionalProperties: true, // Support schema evolution
      
      required: ['email', 'username', 'profileStatus'],
      
      fields: {
        email: {
          type: 'string',
          description: 'User email address',
          pattern: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$',
          maxLength: 255
        },
        username: {
          type: 'string',
          description: 'Unique username',
          minLength: 3,
          maxLength: 50,
          pattern: '^[a-zA-Z0-9_-]+$'
        },
        firstName: {
          type: 'string',
          description: 'User first name',
          minLength: 1,
          maxLength: 100
        },
        lastName: {
          type: 'string',
          description: 'User last name',
          minLength: 1,
          maxLength: 100
        },
        phoneNumber: {
          type: 'string',
          description: 'Phone number in international format',
          pattern: '^\\+?[1-9]\\d{1,14}$'
        },
        dateOfBirth: {
          type: 'date',
          description: 'User date of birth'
        },
        profileStatus: {
          type: 'string',
          description: 'Current profile status',
          enum: ['active', 'inactive', 'suspended', 'pending', 'archived']
        },
        accountType: {
          type: 'string',
          description: 'Account type classification',
          enum: ['standard', 'premium', 'enterprise', 'trial']
        },
        subscriptionTier: {
          type: 'string',
          description: 'Subscription tier level',
          enum: ['free', 'basic', 'pro', 'premium', 'enterprise', 'custom']
        },
        profileMetadata: {
          type: 'object',
          description: 'Flexible profile metadata',
          additionalProperties: true,
          properties: {
            theme: {
              type: 'string',
              enum: ['light', 'dark', 'auto']
            },
            language: {
              type: 'string',
              pattern: '^[a-z]{2}(-[A-Z]{2})?$'
            },
            timezone: {
              type: 'string',
              description: 'IANA timezone identifier'
            }
          }
        },
        preferences: {
          type: 'array',
          description: 'User preference settings',
          items: {
            type: 'object',
            required: ['category', 'key', 'value'],
            properties: {
              category: {
                type: 'string',
                enum: ['notifications', 'privacy', 'display', 'communication', 'security', 'accessibility', 'billing', 'integration']
              },
              key: {
                type: 'string',
                minLength: 1,
                maxLength: 100
              },
              value: {
                description: 'Preference value (flexible type)'
              },
              dataType: {
                type: 'string',
                enum: ['string', 'number', 'boolean', 'array', 'object']
              }
            }
          }
        },
        addresses: {
          type: 'array',
          description: 'User addresses',
          maxItems: 10,
          items: {
            type: 'object',
            required: ['type', 'country'],
            properties: {
              type: {
                type: 'string',
                enum: ['home', 'work', 'billing', 'shipping', 'other']
              },
              streetAddress: { type: 'string', maxLength: 500 },
              city: { type: 'string', maxLength: 100 },
              stateProvince: { type: 'string', maxLength: 100 },
              postalCode: { type: 'string', maxLength: 20 },
              country: { type: 'string', minLength: 2, maxLength: 3 },
              isPrimary: { type: 'boolean' }
            }
          }
        },
        complianceData: {
          type: 'object',
          description: 'Compliance and regulatory data',
          properties: {
            gdprConsent: {
              type: 'object',
              properties: {
                granted: { type: 'boolean' },
                timestamp: { type: 'date' },
                version: { type: 'string' }
              }
            },
            dataRetentionPolicy: { type: 'string' },
            rightToBeForgotenRequests: { type: 'array' }
          }
        }
      },
      
      // Custom validation expressions for business rules
      customValidation: {
        // Business rule: Premium accounts require company information
        $or: [
          { subscriptionTier: { $nin: ['premium', 'enterprise'] } },
          { 
            $and: [
              { subscriptionTier: { $in: ['premium', 'enterprise'] } },
              { 'profileMetadata.company': { $exists: true, $ne: '' } }
            ]
          }
        ]
      }
    };
    
    await this.createFlexibleValidationSchema('user_profiles', userProfileValidation);
    
    console.log('User profile validation configured with business rules');
    
    return userProfileValidation;
  }

  async setupOrderValidation() {
    console.log('Setting up flexible order validation...');
    
    const orderValidation = {
      title: 'Order Validation Schema',
      description: 'Flexible order validation supporting multiple business models',
      level: 'strict', // Orders need stricter validation
      action: 'error',
      allowAdditionalProperties: true,
      
      required: ['customerId', 'orderDate', 'status', 'items', 'totalAmount'],
      
      fields: {
        customerId: {
          type: 'objectId',
          description: 'Reference to customer'
        },
        orderNumber: {
          type: 'string',
          description: 'Unique order identifier',
          pattern: '^ORD-[0-9]{8,12}$'
        },
        orderDate: {
          type: 'date',
          description: 'Order creation date'
        },
        status: {
          type: 'string',
          description: 'Order processing status',
          enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']
        },
        orderType: {
          type: 'string',
          description: 'Order type classification',
          enum: ['standard', 'express', 'subscription', 'bulk', 'dropship', 'preorder']
        },
        items: {
          type: 'array',
          description: 'Order line items',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            required: ['productId', 'quantity', 'unitPrice', 'totalPrice'],
            properties: {
              productId: { type: 'objectId' },
              productName: { type: 'string', maxLength: 200 },
              quantity: { 
                type: 'number', 
                minimum: 1, 
                maximum: 1000,
                multipleOf: 1
              },
              unitPrice: { 
                type: 'number', 
                minimum: 0,
                multipleOf: 0.01
              },
              totalPrice: { 
                type: 'number', 
                minimum: 0,
                multipleOf: 0.01
              },
              category: { type: 'string' },
              sku: { type: 'string', maxLength: 50 },
              customizations: {
                type: 'object',
                additionalProperties: true
              }
            }
          }
        },
        totalAmount: {
          type: 'number',
          description: 'Order total amount',
          minimum: 0,
          multipleOf: 0.01
        },
        currency: {
          type: 'string',
          description: 'Currency code',
          pattern: '^[A-Z]{3}$',
          enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY']
        },
        shippingAddress: {
          type: 'object',
          required: ['country'],
          properties: {
            fullName: { type: 'string', maxLength: 200 },
            streetAddress: { type: 'string', maxLength: 500 },
            city: { type: 'string', maxLength: 100 },
            stateProvince: { type: 'string', maxLength: 100 },
            postalCode: { type: 'string', maxLength: 20 },
            country: { type: 'string', minLength: 2, maxLength: 3 },
            phoneNumber: { type: 'string' }
          }
        },
        billingAddress: {
          type: 'object',
          description: 'Billing address (can reference shipping if same)'
        },
        paymentInformation: {
          type: 'object',
          properties: {
            paymentMethod: {
              type: 'string',
              enum: ['credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash_on_delivery', 'store_credit']
            },
            paymentStatus: {
              type: 'string', 
              enum: ['pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded']
            },
            transactionId: { type: 'string' },
            authorizationCode: { type: 'string' }
          }
        },
        fulfillmentData: {
          type: 'object',
          properties: {
            warehouseId: { type: 'string' },
            shippingMethod: { type: 'string' },
            estimatedDelivery: { type: 'date' },
            trackingNumber: { type: 'string' },
            shippingCost: { type: 'number', minimum: 0 }
          }
        },
        orderMetadata: {
          type: 'object',
          description: 'Flexible order metadata',
          additionalProperties: true
        }
      },
      
      // Complex business rule validations
      customValidation: {
        $expr: {
          $and: [
            // Total amount should equal sum of item totals plus shipping
            {
              $lte: [
                { $abs: { $subtract: [
                  '$totalAmount',
                  { $add: [
                    { $sum: '$items.totalPrice' },
                    { $ifNull: ['$fulfillmentData.shippingCost', 0] }
                  ]}
                ]}},
                0.02 // Allow 2 cent rounding difference
              ]
            },
            // Each item total should equal quantity * unit price
            {
              $allElementsTrue: {
                $map: {
                  input: '$items',
                  as: 'item',
                  in: {
                    $lte: [
                      { $abs: { $subtract: [
                        '$$item.totalPrice',
                        { $multiply: ['$$item.quantity', '$$item.unitPrice'] }
                      ]}},
                      0.01
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    };
    
    await this.createFlexibleValidationSchema('orders', orderValidation);
    
    console.log('Order validation configured with business logic');
    
    return orderValidation;
  }

  async evolveValidationSchema(collectionName, newValidationConfig, migrationOptions = {}) {
    console.log(`Evolving validation schema for: ${collectionName}`);
    
    try {
      // Get current validation configuration
      const currentConfig = await this.getCurrentValidationConfig(collectionName);
      
      // Create new schema version
      const newVersion = await this.createSchemaVersion(collectionName, newValidationConfig, currentConfig);
      
      // Apply gradual migration if specified
      if (migrationOptions.gradual) {
        await this.applyGradualMigration(collectionName, newValidationConfig, migrationOptions);
      } else {
        // Direct schema update
        await this.applySchemaUpdate(collectionName, newValidationConfig);
      }
      
      // Track evolution history
      await this.trackSchemaEvolution(collectionName, currentConfig, newValidationConfig);
      
      console.log(`Schema evolution completed for: ${collectionName}, version: ${newVersion}`);
      
      return {
        collection: collectionName,
        previousVersion: currentConfig?.version,
        newVersion: newVersion,
        migrationApplied: true,
        gradualMigration: migrationOptions.gradual || false,
        backwardCompatible: this.isBackwardCompatible(currentConfig, newValidationConfig)
      };
      
    } catch (error) {
      console.error(`Error evolving schema for ${collectionName}:`, error);
      throw error;
    }
  }

  async applyGradualMigration(collectionName, newValidationConfig, options) {
    console.log(`Applying gradual migration for: ${collectionName}`);
    
    try {
      // Phase 1: Set validation to 'warn' to allow transition
      await this.db.runCommand({
        collMod: collectionName,
        validator: this.buildValidationSchema(newValidationConfig),
        validationLevel: 'moderate',
        validationAction: 'warn' // Don't block operations during transition
      });
      
      // Phase 2: Identify and migrate non-compliant documents
      const migrationResults = await this.migrateNonCompliantDocuments(
        collectionName, 
        newValidationConfig, 
        options
      );
      
      // Phase 3: Restore strict validation after migration
      if (migrationResults.success) {
        await this.db.runCommand({
          collMod: collectionName,
          validationLevel: newValidationConfig.level || 'strict',
          validationAction: newValidationConfig.action || 'error'
        });
      }
      
      console.log(`Gradual migration completed: ${JSON.stringify(migrationResults)}`);
      
      return migrationResults;
      
    } catch (error) {
      console.error(`Error in gradual migration for ${collectionName}:`, error);
      throw error;
    }
  }

  async migrateNonCompliantDocuments(collectionName, validationConfig, options) {
    console.log(`Migrating non-compliant documents in: ${collectionName}`);
    
    try {
      const collection = this.db.collection(collectionName);
      let migratedCount = 0;
      let errorCount = 0;
      const batchSize = options.batchSize || 100;
      
      // Find documents that would fail new validation
      const cursor = collection.find({}, { batchSize });
      
      while (await cursor.hasNext()) {
        const batch = [];
        for (let i = 0; i < batchSize && await cursor.hasNext(); i++) {
          batch.push(await cursor.next());
        }
        
        for (const doc of batch) {
          try {
            // Attempt to migrate document to new schema
            const migratedDoc = await this.migrateDocument(doc, validationConfig);
            
            if (migratedDoc !== doc) {
              await collection.replaceOne({ _id: doc._id }, migratedDoc);
              migratedCount++;
            }
            
          } catch (migrationError) {
            errorCount++;
            
            // Log migration error for analysis
            await this.logValidationError(collectionName, doc._id, 'migration_error', {
              error: migrationError.message,
              document: doc,
              validationConfig: validationConfig
            });
            
            // Handle based on migration strategy
            if (options.skipErrors) {
              console.warn(`Skipping migration for document ${doc._id}: ${migrationError.message}`);
            } else {
              throw migrationError;
            }
          }
        }
      }
      
      return {
        success: errorCount === 0 || options.skipErrors,
        migratedCount: migratedCount,
        errorCount: errorCount,
        strategy: 'gradual_migration'
      };
      
    } catch (error) {
      console.error(`Error migrating documents in ${collectionName}:`, error);
      throw error;
    }
  }

  async migrateDocument(document, validationConfig) {
    const migrated = { ...document };
    
    // Apply field transformations based on new schema
    if (validationConfig.migrations) {
      for (const migration of validationConfig.migrations) {
        migrated = await this.applyFieldMigration(migrated, migration);
      }
    }
    
    // Set default values for newly required fields
    if (validationConfig.required) {
      for (const requiredField of validationConfig.required) {
        if (!(requiredField in migrated)) {
          migrated[requiredField] = this.getDefaultValueForField(requiredField, validationConfig.fields?.[requiredField]);
        }
      }
    }
    
    // Apply data transformations for type compatibility
    if (validationConfig.fields) {
      Object.keys(validationConfig.fields).forEach(fieldName => {
        if (fieldName in migrated) {
          migrated[fieldName] = this.transformFieldValue(
            migrated[fieldName], 
            validationConfig.fields[fieldName]
          );
        }
      });
    }
    
    return migrated;
  }

  async validateDocumentCompliance(collectionName, document) {
    console.log(`Validating document compliance for: ${collectionName}`);
    
    try {
      const validationConfig = await this.getCurrentValidationConfig(collectionName);
      
      if (!validationConfig) {
        return { isValid: true, reason: 'no_validation_configured' };
      }
      
      // Basic schema validation
      const schemaValidation = await this.validateAgainstSchema(document, validationConfig);
      
      // Business rule validation
      const businessRuleValidation = await this.validateBusinessRules(document, validationConfig);
      
      // Compliance validation
      const complianceValidation = await this.validateCompliance(document, collectionName);
      
      const overallValidation = {
        isValid: schemaValidation.isValid && businessRuleValidation.isValid && complianceValidation.isValid,
        schemaValidation: schemaValidation,
        businessRuleValidation: businessRuleValidation,
        complianceValidation: complianceValidation,
        validationTimestamp: new Date()
      };
      
      // Log validation result if there are issues
      if (!overallValidation.isValid) {
        await this.logValidationError(collectionName, document._id, 'validation_failure', overallValidation);
      }
      
      return overallValidation;
      
    } catch (error) {
      console.error(`Error validating document compliance:`, error);
      throw error;
    }
  }

  async validateAgainstSchema(document, validationConfig) {
    // Implement JSON schema validation logic
    // This would typically use a JSON schema validation library
    
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };
    
    try {
      // Validate required fields
      if (validationConfig.required) {
        for (const requiredField of validationConfig.required) {
          if (!(requiredField in document) || document[requiredField] == null) {
            validationResult.isValid = false;
            validationResult.errors.push({
              field: requiredField,
              error: 'required_field_missing',
              message: `Required field '${requiredField}' is missing`
            });
          }
        }
      }
      
      // Validate field types and constraints
      if (validationConfig.fields) {
        Object.keys(validationConfig.fields).forEach(fieldName => {
          if (fieldName in document) {
            const fieldValidation = this.validateField(
              document[fieldName], 
              validationConfig.fields[fieldName], 
              fieldName
            );
            
            if (!fieldValidation.isValid) {
              validationResult.isValid = false;
              validationResult.errors.push(...fieldValidation.errors);
            }
            
            validationResult.warnings.push(...fieldValidation.warnings);
          }
        });
      }
      
      return validationResult;
      
    } catch (error) {
      validationResult.isValid = false;
      validationResult.errors.push({
        error: 'schema_validation_error',
        message: error.message
      });
      return validationResult;
    }
  }

  validateField(value, fieldConfig, fieldName) {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };
    
    // Type validation
    if (!this.isValidType(value, fieldConfig.type)) {
      result.isValid = false;
      result.errors.push({
        field: fieldName,
        error: 'invalid_type',
        message: `Field '${fieldName}' should be of type '${fieldConfig.type}'`
      });
      return result;
    }
    
    // String validations
    if (fieldConfig.type === 'string' && typeof value === 'string') {
      if (fieldConfig.minLength && value.length < fieldConfig.minLength) {
        result.isValid = false;
        result.errors.push({
          field: fieldName,
          error: 'min_length_violation',
          message: `Field '${fieldName}' is too short`
        });
      }
      
      if (fieldConfig.maxLength && value.length > fieldConfig.maxLength) {
        result.isValid = false;
        result.errors.push({
          field: fieldName,
          error: 'max_length_violation', 
          message: `Field '${fieldName}' is too long`
        });
      }
      
      if (fieldConfig.pattern && !new RegExp(fieldConfig.pattern).test(value)) {
        result.isValid = false;
        result.errors.push({
          field: fieldName,
          error: 'pattern_violation',
          message: `Field '${fieldName}' does not match required pattern`
        });
      }
      
      if (fieldConfig.enum && !fieldConfig.enum.includes(value)) {
        result.isValid = false;
        result.errors.push({
          field: fieldName,
          error: 'enum_violation',
          message: `Field '${fieldName}' is not one of allowed values`
        });
      }
    }
    
    // Number validations
    if ((fieldConfig.type === 'number' || fieldConfig.type === 'int') && typeof value === 'number') {
      if (fieldConfig.minimum !== undefined && value < fieldConfig.minimum) {
        result.isValid = false;
        result.errors.push({
          field: fieldName,
          error: 'minimum_violation',
          message: `Field '${fieldName}' is below minimum value`
        });
      }
      
      if (fieldConfig.maximum !== undefined && value > fieldConfig.maximum) {
        result.isValid = false;
        result.errors.push({
          field: fieldName,
          error: 'maximum_violation',
          message: `Field '${fieldName}' exceeds maximum value`
        });
      }
    }
    
    // Array validations
    if (fieldConfig.type === 'array' && Array.isArray(value)) {
      if (fieldConfig.minItems && value.length < fieldConfig.minItems) {
        result.isValid = false;
        result.errors.push({
          field: fieldName,
          error: 'min_items_violation',
          message: `Field '${fieldName}' has too few items`
        });
      }
      
      if (fieldConfig.maxItems && value.length > fieldConfig.maxItems) {
        result.isValid = false;
        result.errors.push({
          field: fieldName,
          error: 'max_items_violation',
          message: `Field '${fieldName}' has too many items`
        });
      }
    }
    
    return result;
  }

  // Utility methods for validation management
  
  isValidType(value, expectedType) {
    switch (expectedType) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number' && !isNaN(value);
      case 'int': return Number.isInteger(value);
      case 'boolean': return typeof value === 'boolean';
      case 'array': return Array.isArray(value);
      case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'date': return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
      case 'objectId': return ObjectId.isValid(value);
      default: return true;
    }
  }

  getDefaultValueForField(fieldName, fieldConfig) {
    if (fieldConfig?.default !== undefined) {
      return fieldConfig.default;
    }
    
    switch (fieldConfig?.type) {
      case 'string': return '';
      case 'number':
      case 'int': return 0;
      case 'boolean': return false;
      case 'array': return [];
      case 'object': return {};
      case 'date': return new Date();
      default: return null;
    }
  }

  transformFieldValue(value, fieldConfig) {
    // Apply type transformations for backward compatibility
    switch (fieldConfig.type) {
      case 'string':
        return typeof value === 'string' ? value : String(value);
      case 'number':
        return typeof value === 'number' ? value : Number(value);
      case 'int':
        return Number.isInteger(value) ? value : parseInt(value);
      case 'boolean':
        return typeof value === 'boolean' ? value : Boolean(value);
      case 'date':
        return value instanceof Date ? value : new Date(value);
      default:
        return value;
    }
  }

  async getCurrentValidationConfig(collectionName) {
    const schemaVersionsCollection = this.db.collection('schema_versions');
    
    const currentVersion = await schemaVersionsCollection.findOne(
      { 
        collection: collectionName, 
        isActive: true 
      },
      { sort: { version: -1 } }
    );
    
    return currentVersion;
  }

  async createSchemaVersion(collectionName, newConfig, currentConfig) {
    const schemaVersionsCollection = this.db.collection('schema_versions');
    
    const newVersion = (currentConfig?.version || 0) + 1;
    
    // Deactivate current version
    if (currentConfig) {
      await schemaVersionsCollection.updateOne(
        { collection: collectionName, version: currentConfig.version },
        { $set: { isActive: false, deactivatedAt: new Date() } }
      );
    }
    
    // Create new version record
    await schemaVersionsCollection.insertOne({
      collection: collectionName,
      version: newVersion,
      validationConfig: newConfig,
      isActive: true,
      effectiveDate: new Date(),
      createdBy: 'system',
      migrationCompleted: false
    });
    
    return newVersion;
  }

  async logValidationError(collectionName, documentId, errorType, errorDetails) {
    const validationErrorsCollection = this.db.collection('validation_errors');
    
    await validationErrorsCollection.insertOne({
      collection: collectionName,
      documentId: documentId,
      errorType: errorType,
      errorDetails: errorDetails,
      timestamp: new Date(),
      severity: this.getErrorSeverity(errorType),
      resolved: false
    });
  }

  getErrorSeverity(errorType) {
    switch (errorType) {
      case 'validation_failure': return 'high';
      case 'migration_error': return 'medium';
      case 'compliance_violation': return 'high';
      case 'business_rule_violation': return 'medium';
      default: return 'low';
    }
  }

  isBackwardCompatible(oldConfig, newConfig) {
    // Simplified backward compatibility check
    if (!oldConfig) return true;
    
    // Check if new required fields were added
    const oldRequired = oldConfig.required || [];
    const newRequired = newConfig.required || [];
    
    const addedRequired = newRequired.filter(field => !oldRequired.includes(field));
    if (addedRequired.length > 0) return false;
    
    // Check for removed allowed enum values
    // This would need more sophisticated logic in a real implementation
    
    return true;
  }

  async getValidationStatus() {
    console.log('Retrieving validation system status...');
    
    try {
      const schemaVersionsCollection = this.db.collection('schema_versions');
      const validationErrorsCollection = this.db.collection('validation_errors');
      
      const activeSchemas = await schemaVersionsCollection
        .find({ isActive: true })
        .toArray();
      
      const recentErrors = await validationErrorsCollection
        .find({ timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
        .sort({ timestamp: -1 })
        .limit(100)
        .toArray();
      
      const errorSummary = recentErrors.reduce((acc, error) => {
        acc[error.errorType] = (acc[error.errorType] || 0) + 1;
        return acc;
      }, {});
      
      return {
        activeSchemas: activeSchemas.length,
        schemaDetails: activeSchemas.map(schema => ({
          collection: schema.collection,
          version: schema.version,
          effectiveDate: schema.effectiveDate
        })),
        recentErrors: recentErrors.length,
        errorBreakdown: errorSummary,
        systemHealth: recentErrors.length < 10 ? 'healthy' : 'needs_attention'
      };
      
    } catch (error) {
      console.error('Error retrieving validation status:', error);
      throw error;
    }
  }

  async cleanup() {
    console.log('Cleaning up Validation Manager...');
    
    this.schemaVersions.clear();
    this.validationRules.clear();
    this.evolutionHistory.clear();
    
    console.log('Validation Manager cleanup completed');
  }
}

// Example usage demonstrating flexible validation and schema evolution
async function demonstrateFlexibleValidation() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  const validationManager = new MongoDBValidationManager(client, {
    database: 'flexible_validation_demo',
    enableFlexibleValidation: true,
    enableSchemaVersioning: true,
    enableComplianceValidation: true
  });
  
  try {
    // Setup initial validation schemas
    console.log('Setting up flexible validation schemas...');
    
    const userProfileValidation = await validationManager.setupUserProfileValidation();
    console.log('User Profile Validation:', userProfileValidation.collection);
    
    const orderValidation = await validationManager.setupOrderValidation();
    console.log('Order Validation:', orderValidation.collection);
    
    // Test document validation
    const sampleUser = {
      email: 'john.doe@example.com',
      username: 'johndoe123',
      firstName: 'John',
      lastName: 'Doe',
      profileStatus: 'active',
      accountType: 'premium',
      subscriptionTier: 'premium',
      profileMetadata: {
        theme: 'dark',
        company: 'Tech Corp',
        industry: 'technology'
      },
      preferences: [
        {
          category: 'notifications',
          key: 'email_frequency',
          value: 'daily',
          dataType: 'string'
        }
      ]
    };
    
    const validationResult = await validationManager.validateDocumentCompliance('user_profiles', sampleUser);
    console.log('Validation Result:', validationResult.isValid);
    
    // Demonstrate schema evolution
    console.log('Demonstrating schema evolution...');
    
    const evolvedValidation = {
      ...userProfileValidation,
      required: [...(userProfileValidation.required || []), 'phoneNumber'],
      fields: {
        ...userProfileValidation.fields,
        phoneNumber: {
          type: 'string',
          description: 'Required phone number',
          pattern: '^\\+?[1-9]\\d{1,14}$'
        },
        emergencyContact: {
          type: 'object',
          description: 'Emergency contact information',
          properties: {
            name: { type: 'string', minLength: 1 },
            phoneNumber: { type: 'string', pattern: '^\\+?[1-9]\\d{1,14}$' },
            relationship: { type: 'string', enum: ['spouse', 'parent', 'sibling', 'friend', 'other'] }
          }
        }
      },
      migrations: [
        {
          field: 'phoneNumber',
          action: 'set_default',
          defaultValue: '+1-000-000-0000'
        }
      ]
    };
    
    const evolutionResult = await validationManager.evolveValidationSchema(
      'user_profiles', 
      evolvedValidation,
      { 
        gradual: true, 
        skipErrors: false,
        batchSize: 100
      }
    );
    
    console.log('Schema Evolution Result:', evolutionResult);
    
    // Get validation system status
    const systemStatus = await validationManager.getValidationStatus();
    console.log('Validation System Status:', systemStatus);
    
    return {
      userProfileValidation,
      orderValidation,
      validationResult,
      evolutionResult,
      systemStatus
    };
    
  } catch (error) {
    console.error('Error demonstrating flexible validation:', error);
    throw error;
  } finally {
    await validationManager.cleanup();
    await client.close();
  }
}

// Benefits of MongoDB Flexible Document Validation:
// - Configurable validation levels supporting gradual schema enforcement and evolution
// - Schema versioning and migration capabilities enabling controlled validation updates
// - Business rule integration allowing complex validation logic beyond basic type checking
// - Compliance validation supporting regulatory and governance requirements
// - Flexible validation actions (error, warn) enabling different enforcement strategies
// - Performance optimization through selective and conditional validation rules
// - Backward compatibility management preserving application functionality during updates
// - Real-time validation monitoring and error tracking for operational excellence

module.exports = {
  MongoDBValidationManager,
  demonstrateFlexibleValidation
};
```

## SQL-Style Document Validation with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB document validation and schema evolution management:

```sql
-- QueryLeaf document validation with SQL-familiar schema governance and evolution syntax

-- Configure validation system settings
SET enable_flexible_validation = true;
SET enable_schema_versioning = true;
SET enable_gradual_validation = true;
SET enable_compliance_validation = true;
SET validation_error_tracking = true;
SET schema_evolution_monitoring = true;

-- Create flexible validation schema with business rules
CREATE VALIDATION SCHEMA user_profile_validation
FOR COLLECTION user_profiles
WITH (
  validation_level = 'moderate',  -- strict, moderate, off
  validation_action = 'error',    -- error, warn
  allow_additional_properties = true,  -- Support schema evolution
  schema_version = 1,
  effective_date = CURRENT_TIMESTAMP
)
AS JSON_SCHEMA({
  "bsonType": "object",
  "title": "User Profile Validation Schema",
  "description": "Flexible user profile validation with business rule support",
  "required": ["email", "username", "profile_status"],
  "properties": {
    "email": {
      "bsonType": "string",
      "pattern": "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$",
      "maxLength": 255,
      "description": "Valid email address"
    },
    "username": {
      "bsonType": "string", 
      "minLength": 3,
      "maxLength": 50,
      "pattern": "^[a-zA-Z0-9_-]+$",
      "description": "Unique alphanumeric username"
    },
    "first_name": {
      "bsonType": "string",
      "minLength": 1, 
      "maxLength": 100
    },
    "last_name": {
      "bsonType": "string",
      "minLength": 1,
      "maxLength": 100  
    },
    "phone_number": {
      "bsonType": "string",
      "pattern": "^\\+?[1-9]\\d{1,14}$",
      "description": "International phone number format"
    },
    "date_of_birth": {
      "bsonType": "date"
    },
    "profile_status": {
      "bsonType": "string",
      "enum": ["active", "inactive", "suspended", "pending", "archived"],
      "description": "Current profile status"
    },
    "account_type": {
      "bsonType": "string",
      "enum": ["standard", "premium", "enterprise", "trial"]
    },
    "subscription_tier": {
      "bsonType": "string", 
      "enum": ["free", "basic", "pro", "premium", "enterprise", "custom"]
    },
    "profile_metadata": {
      "bsonType": "object",
      "additionalProperties": true,
      "properties": {
        "theme": {
          "bsonType": "string",
          "enum": ["light", "dark", "auto"]
        },
        "language": {
          "bsonType": "string",
          "pattern": "^[a-z]{2}(-[A-Z]{2})?$"
        },
        "company": {
          "bsonType": "string",
          "minLength": 1
        }
      }
    },
    "preferences": {
      "bsonType": "array",
      "items": {
        "bsonType": "object",
        "required": ["category", "key", "value"],
        "properties": {
          "category": {
            "bsonType": "string",
            "enum": [
              "notifications", "privacy", "display", "communication", 
              "security", "accessibility", "billing", "integration"
            ]
          },
          "key": {
            "bsonType": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "value": {
            "description": "Flexible preference value"
          },
          "data_type": {
            "bsonType": "string", 
            "enum": ["string", "number", "boolean", "array", "object"]
          }
        }
      }
    },
    "compliance_data": {
      "bsonType": "object",
      "properties": {
        "gdpr_consent": {
          "bsonType": "object",
          "properties": {
            "granted": { "bsonType": "bool" },
            "timestamp": { "bsonType": "date" },
            "version": { "bsonType": "string" }
          }
        }
      }
    }
  },
  
  -- Custom business rule validation expressions
  "$expr": {
    "$or": [
      -- Non-premium accounts don't need company info
      { "subscription_tier": { "$nin": ["premium", "enterprise"] } },
      -- Premium accounts must have company information
      { 
        "$and": [
          { "subscription_tier": { "$in": ["premium", "enterprise"] } },
          { "profile_metadata.company": { "$exists": true, "$ne": "" } }
        ]
      }
    ]
  }
});

-- Create order validation schema with complex business logic
CREATE VALIDATION SCHEMA order_validation  
FOR COLLECTION orders
WITH (
  validation_level = 'strict',    -- Orders need strict validation
  validation_action = 'error',
  allow_additional_properties = true
)
AS JSON_SCHEMA({
  "bsonType": "object",
  "title": "Order Validation Schema",
  "required": ["customer_id", "order_date", "status", "items", "total_amount"],
  "properties": {
    "customer_id": {
      "bsonType": "objectId"
    },
    "order_number": {
      "bsonType": "string",
      "pattern": "^ORD-[0-9]{8,12}$"
    },
    "order_date": {
      "bsonType": "date"
    },
    "status": {
      "bsonType": "string",
      "enum": ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]
    },
    "items": {
      "bsonType": "array",
      "minItems": 1,
      "maxItems": 100,
      "items": {
        "bsonType": "object",
        "required": ["product_id", "quantity", "unit_price", "total_price"],
        "properties": {
          "product_id": { "bsonType": "objectId" },
          "quantity": { 
            "bsonType": "number", 
            "minimum": 1, 
            "maximum": 1000
          },
          "unit_price": { 
            "bsonType": "number", 
            "minimum": 0
          },
          "total_price": { 
            "bsonType": "number", 
            "minimum": 0
          }
        }
      }
    },
    "total_amount": {
      "bsonType": "number",
      "minimum": 0
    },
    "currency": {
      "bsonType": "string",
      "pattern": "^[A-Z]{3}$",
      "enum": ["USD", "EUR", "GBP", "CAD", "AUD"]
    }
  },
  
  -- Complex validation expressions for business logic
  "$expr": {
    "$and": [
      -- Total amount equals sum of item totals (with tolerance for rounding)
      {
        "$lte": [
          { "$abs": { "$subtract": [
            "$total_amount",
            { "$sum": "$items.total_price" }
          ]}},
          0.02
        ]
      },
      -- Each item total equals quantity * unit price
      {
        "$allElementsTrue": {
          "$map": {
            "input": "$items",
            "as": "item",
            "in": {
              "$lte": [
                { "$abs": { "$subtract": [
                  "$$item.total_price",
                  { "$multiply": ["$$item.quantity", "$$item.unit_price"] }
                ]}},
                0.01
              ]
            }
          }
        }
      }
    ]
  }
});

-- Demonstrate schema evolution with backward compatibility
BEGIN TRANSACTION;

-- Step 1: Evolve user profile schema to add new requirements
CREATE VALIDATION SCHEMA user_profile_validation_v2
FOR COLLECTION user_profiles  
WITH (
  validation_level = 'moderate',
  validation_action = 'warn',  -- Warn initially during migration
  schema_version = 2,
  replaces_version = 1,
  migration_strategy = 'gradual'
)
AS JSON_SCHEMA({
  -- Inherit from previous schema with additions
  "$ref": "user_profile_validation_v1",
  
  -- Add new required fields
  "required": ["email", "username", "profile_status", "phone_number"],
  
  -- Add new field definitions
  "properties": {
    -- All existing properties inherited
    "emergency_contact": {
      "bsonType": "object", 
      "description": "Emergency contact information",
      "properties": {
        "name": { 
          "bsonType": "string", 
          "minLength": 1 
        },
        "phone_number": { 
          "bsonType": "string",
          "pattern": "^\\+?[1-9]\\d{1,14}$"
        },
        "relationship": { 
          "bsonType": "string",
          "enum": ["spouse", "parent", "sibling", "friend", "other"]
        }
      }
    },
    "security_settings": {
      "bsonType": "object",
      "properties": {
        "two_factor_enabled": { "bsonType": "bool" },
        "backup_codes_generated": { "bsonType": "bool" },
        "last_password_change": { "bsonType": "date" }
      }
    }
  }
});

-- Step 2: Migrate existing documents to new schema
WITH migration_analysis AS (
  -- Identify documents that need migration
  SELECT 
    _id,
    email,
    username,
    profile_status,
    phone_number,
    
    -- Check what's missing for new schema
    CASE 
      WHEN phone_number IS NULL THEN 'missing_phone'
      WHEN emergency_contact IS NULL THEN 'missing_emergency_contact'
      WHEN security_settings IS NULL THEN 'missing_security_settings'
      ELSE 'compliant'
    END as migration_requirement,
    
    -- Determine migration strategy
    CASE 
      WHEN phone_number IS NULL THEN 'set_default_phone'
      WHEN emergency_contact IS NULL THEN 'skip_optional_field'
      ELSE 'no_action_needed'
    END as migration_action
    
  FROM user_profiles
  WHERE validation_version < 2 OR validation_version IS NULL
),

-- Apply gradual migrations
migration_execution AS (
  UPDATE user_profiles 
  SET 
    -- Set default phone number for existing users
    phone_number = COALESCE(phone_number, '+1-000-000-0000'),
    
    -- Initialize security settings with defaults
    security_settings = COALESCE(security_settings, JSON_BUILD_OBJECT(
      'two_factor_enabled', false,
      'backup_codes_generated', false,
      'last_password_change', created_at
    )),
    
    -- Track validation version
    validation_version = 2,
    validation_migrated_at = CURRENT_TIMESTAMP,
    
    -- Preserve existing data
    updated_at = CURRENT_TIMESTAMP
    
  FROM migration_analysis ma
  WHERE user_profiles._id = ma._id
  AND ma.migration_requirement != 'compliant'
  
  RETURNING 
    _id,
    migration_requirement,
    migration_action,
    'migration_applied' as result
)

-- Track migration results
INSERT INTO schema_migration_log
SELECT 
  'user_profiles' as collection_name,
  2 as target_version,
  1 as source_version,
  COUNT(*) as documents_migrated,
  COUNT(*) FILTER (WHERE result = 'migration_applied') as successful_migrations,
  COUNT(*) FILTER (WHERE result != 'migration_applied') as failed_migrations,
  CURRENT_TIMESTAMP as migration_timestamp,
  'gradual_migration' as migration_strategy,
  
  JSON_BUILD_OBJECT(
    'migration_summary', JSON_AGG(DISTINCT migration_requirement),
    'actions_applied', JSON_AGG(DISTINCT migration_action),
    'success_rate', ROUND(
      COUNT(*) FILTER (WHERE result = 'migration_applied')::decimal / COUNT(*) * 100, 
      2
    )
  ) as migration_metadata

FROM migration_execution
GROUP BY collection_name, target_version, source_version;

-- Step 3: Update validation to strict mode after migration
UPDATE VALIDATION SCHEMA user_profile_validation_v2
SET 
  validation_level = 'strict',
  validation_action = 'error',
  migration_completed = true,
  activated_at = CURRENT_TIMESTAMP;

COMMIT TRANSACTION;

-- Validate document compliance with business rules
WITH document_compliance_analysis AS (
  SELECT 
    _id,
    email,
    username,
    profile_status,
    subscription_tier,
    
    -- Schema compliance checks
    CASE 
      WHEN email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$' THEN 'invalid_email_format'
      WHEN LENGTH(username) < 3 OR LENGTH(username) > 50 THEN 'invalid_username_length'
      WHEN phone_number !~ '^\\+?[1-9]\\d{1,14}$' THEN 'invalid_phone_format'
      ELSE 'schema_compliant'
    END as schema_compliance_status,
    
    -- Business rule compliance
    CASE 
      WHEN subscription_tier IN ('premium', 'enterprise') AND profile_metadata->>'company' IS NULL THEN 'business_rule_violation'
      WHEN profile_status = 'active' AND last_login_at < CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'dormant_account_warning'
      WHEN JSON_ARRAY_LENGTH(COALESCE(preferences, '[]'::JSON)) = 0 THEN 'incomplete_profile'
      ELSE 'business_rules_compliant'
    END as business_rule_compliance,
    
    -- Regulatory compliance (GDPR example)
    CASE 
      WHEN created_at > '2018-05-25' AND compliance_data->>'gdpr_consent' IS NULL THEN 'gdpr_consent_required'
      WHEN profile_status = 'inactive' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '2 years' THEN 'data_retention_review'
      ELSE 'regulatory_compliant'
    END as regulatory_compliance,
    
    -- Overall compliance scoring
    CASE 
      WHEN schema_compliance_status = 'schema_compliant' 
           AND business_rule_compliance = 'business_rules_compliant'
           AND regulatory_compliance = 'regulatory_compliant' THEN 100
      WHEN schema_compliance_status = 'schema_compliant' 
           AND business_rule_compliance = 'business_rules_compliant' THEN 85
      WHEN schema_compliance_status = 'schema_compliant' THEN 70
      ELSE 50
    END as compliance_score,
    
    -- Validation metadata
    validation_version,
    CURRENT_TIMESTAMP as validation_timestamp
    
  FROM user_profiles
),

-- Generate compliance report with recommendations
compliance_recommendations AS (
  SELECT 
    dca.*,
    
    -- Remediation recommendations
    ARRAY_REMOVE(ARRAY[
      CASE schema_compliance_status WHEN 'schema_compliant' THEN NULL ELSE 'Fix schema validation errors' END,
      CASE business_rule_compliance WHEN 'business_rules_compliant' THEN NULL ELSE 'Address business rule violations' END,
      CASE regulatory_compliance WHEN 'regulatory_compliant' THEN NULL ELSE 'Ensure regulatory compliance' END
    ], NULL) as remediation_actions,
    
    -- Priority classification
    CASE 
      WHEN compliance_score < 60 THEN 'high_priority'
      WHEN compliance_score < 80 THEN 'medium_priority' 
      ELSE 'low_priority'
    END as remediation_priority,
    
    -- Specific action items
    CASE schema_compliance_status
      WHEN 'invalid_email_format' THEN 'Update email to valid format'
      WHEN 'invalid_username_length' THEN 'Adjust username length (3-50 characters)'
      WHEN 'invalid_phone_format' THEN 'Correct phone number format'
      ELSE 'No schema remediation needed'
    END as schema_remediation,
    
    CASE business_rule_compliance
      WHEN 'business_rule_violation' THEN 'Add required company information for premium accounts'
      WHEN 'dormant_account_warning' THEN 'Review dormant account status and policies'
      WHEN 'incomplete_profile' THEN 'Complete user preference settings'
      ELSE 'Business rules compliant'
    END as business_remediation
    
  FROM document_compliance_analysis dca
)

-- Comprehensive validation and compliance dashboard
SELECT 
  -- Summary statistics
  COUNT(*) as total_documents,
  COUNT(*) FILTER (WHERE compliance_score = 100) as fully_compliant,
  COUNT(*) FILTER (WHERE compliance_score >= 80) as substantially_compliant,
  COUNT(*) FILTER (WHERE compliance_score < 60) as non_compliant,
  
  -- Compliance breakdown
  ROUND(AVG(compliance_score), 2) as avg_compliance_score,
  
  -- Issue distribution
  COUNT(*) FILTER (WHERE schema_compliance_status != 'schema_compliant') as schema_issues,
  COUNT(*) FILTER (WHERE business_rule_compliance != 'business_rules_compliant') as business_rule_issues,
  COUNT(*) FILTER (WHERE regulatory_compliance != 'regulatory_compliant') as regulatory_issues,
  
  -- Priority distribution
  COUNT(*) FILTER (WHERE remediation_priority = 'high_priority') as high_priority_issues,
  COUNT(*) FILTER (WHERE remediation_priority = 'medium_priority') as medium_priority_issues,
  
  -- Validation system health
  CASE 
    WHEN AVG(compliance_score) >= 95 THEN 'excellent'
    WHEN AVG(compliance_score) >= 85 THEN 'good'
    WHEN AVG(compliance_score) >= 70 THEN 'acceptable' 
    ELSE 'needs_attention'
  END as validation_system_health,
  
  -- Most common issues
  MODE() WITHIN GROUP (ORDER BY schema_compliance_status) as most_common_schema_issue,
  MODE() WITHIN GROUP (ORDER BY business_rule_compliance) as most_common_business_issue,
  
  -- Recommendations summary
  JSON_BUILD_OBJECT(
    'immediate_actions', ARRAY[
      CASE WHEN COUNT(*) FILTER (WHERE remediation_priority = 'high_priority') > 0 
           THEN 'Address high priority compliance issues immediately'
           ELSE 'Continue monitoring compliance metrics' END,
      CASE WHEN AVG(compliance_score) < 80 
           THEN 'Review and strengthen validation rules'
           ELSE 'Maintain current validation standards' END
    ],
    'system_improvements', ARRAY[
      'Implement automated compliance monitoring',
      'Setup real-time validation alerts',
      'Schedule regular compliance audits'
    ]
  ) as system_recommendations

FROM compliance_recommendations;

-- QueryLeaf provides comprehensive MongoDB document validation capabilities:
-- 1. Flexible validation schema creation with SQL-familiar syntax and business rule integration
-- 2. Schema versioning and evolution management with backward compatibility support
-- 3. Gradual migration strategies for schema updates with minimal application disruption
-- 4. Business rule validation enabling complex logic beyond basic type checking
-- 5. Compliance validation supporting regulatory requirements and governance standards
-- 6. Real-time validation monitoring and error tracking for operational excellence
-- 7. Performance-optimized validation with selective enforcement and caching strategies
-- 8. Migration automation with rollback capabilities and impact analysis
-- 9. Comprehensive compliance reporting with remediation recommendations
-- 10. Integration with MongoDB's native validation features through familiar SQL patterns
```

## Best Practices for MongoDB Document Validation Implementation

### Strategic Validation Design

Essential practices for implementing effective document validation strategies:

1. **Validation Level Strategy**: Choose appropriate validation levels (strict, moderate, off) based on data criticality and application requirements
2. **Gradual Implementation**: Implement validation rules gradually to avoid disrupting existing data and application functionality
3. **Business Rule Integration**: Design validation rules that reflect actual business requirements rather than just technical constraints
4. **Performance Optimization**: Balance validation thoroughness with query performance impact and system responsiveness
5. **Error Handling Strategy**: Implement comprehensive error handling for validation failures with meaningful user feedback
6. **Compliance Alignment**: Ensure validation rules support regulatory compliance requirements and data governance policies

### Schema Evolution and Management

Optimize document validation for long-term schema evolution:

1. **Version Control**: Implement schema versioning to track validation changes and enable rollback capabilities
2. **Migration Planning**: Design migration strategies that minimize downtime and preserve data integrity during schema evolution
3. **Backward Compatibility**: Maintain backward compatibility when possible to support gradual application updates
4. **Testing Strategies**: Implement comprehensive testing for validation rules and schema migrations before production deployment
5. **Monitoring and Alerting**: Establish monitoring for validation failures, schema compliance, and migration success rates
6. **Documentation Standards**: Maintain clear documentation of validation rules, business logic, and evolution history

## Conclusion

MongoDB's flexible document validation provides powerful capabilities for maintaining data integrity while preserving the schema flexibility essential for modern applications. The combination of configurable validation levels, business rule integration, and schema evolution support enables development teams to implement robust data governance without sacrificing application agility.

Key MongoDB Document Validation benefits include:

- **Flexible Enforcement**: Configurable validation levels supporting different data integrity requirements and application needs
- **Schema Evolution**: Versioned validation schemas with migration capabilities enabling controlled schema updates
- **Business Logic Integration**: Custom validation expressions supporting complex business rules and compliance requirements
- **Performance Optimization**: Selective validation strategies balancing data integrity with query performance
- **Compliance Support**: Regulatory validation capabilities supporting governance requirements and audit needs
- **SQL Accessibility**: Familiar SQL-style syntax for validation rule management and schema evolution

Whether you're building user management systems, e-commerce platforms, content management applications, or compliance-driven systems, MongoDB's document validation with QueryLeaf's familiar SQL interface provides the foundation for maintainable, compliant, and scalable data governance.

> **QueryLeaf Integration**: QueryLeaf automatically manages MongoDB document validation while providing SQL-familiar syntax for validation rule creation, schema evolution, and compliance monitoring. Advanced validation strategies, migration automation, and business rule integration are seamlessly accessible through familiar SQL constructs, making sophisticated data governance both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's flexible validation capabilities with SQL-style governance management makes it an ideal platform for applications requiring both data integrity assurance and schema flexibility, ensuring your data governance strategies can evolve with changing requirements while maintaining operational excellence and compliance standards.