---
title: "MongoDB Document Validation and Schema Enforcement: Data Integrity and Governance for Enterprise Applications"
description: "Master MongoDB document validation and schema enforcement for enterprise data integrity. Learn advanced validation rules, schema governance, and SQL-familiar validation patterns for production-grade data quality management."
date: 2025-12-06
tags: [mongodb, document-validation, schema-enforcement, data-integrity, governance, enterprise, sql]
---

# MongoDB Document Validation and Schema Enforcement: Data Integrity and Governance for Enterprise Applications

Enterprise applications require robust data integrity mechanisms that ensure consistent data quality, enforce business rules, and maintain compliance standards across complex document structures and evolving application requirements. Traditional relational databases rely heavily on strict schema definitions and constraints, but these rigid approaches often become barriers to agility in modern applications that need to adapt to changing business requirements and diverse data structures.

MongoDB's document validation provides flexible yet powerful schema enforcement capabilities that balance data integrity requirements with the agility benefits of document-oriented storage. Unlike rigid table schemas that require expensive migrations for structural changes, MongoDB validation allows you to define comprehensive validation rules that evolve with your application while maintaining data quality and business rule compliance across your entire dataset.

## The Traditional Schema Constraint Challenge

Relational databases enforce data integrity through rigid schema definitions that become increasingly problematic as applications evolve:

```sql
-- Traditional PostgreSQL schema with rigid constraints that become maintenance burdens

-- User profile management with complex validation requirements
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    
    -- Contact information with rigid structure
    phone_number VARCHAR(20),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(3) NOT NULL DEFAULT 'USA',
    
    -- Profile metadata
    date_of_birth DATE,
    gender VARCHAR(20),
    preferred_language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Account settings
    account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'inactive', 'deleted')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    
    -- Privacy and preferences
    privacy_level VARCHAR(20) DEFAULT 'standard' CHECK (privacy_level IN ('public', 'standard', 'private', 'restricted')),
    marketing_consent BOOLEAN DEFAULT FALSE,
    analytics_consent BOOLEAN DEFAULT TRUE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_by UUID,
    version INTEGER DEFAULT 1,
    
    -- Complex business validation constraints
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'),
    CONSTRAINT valid_username CHECK (username ~* '^[a-zA-Z0-9_]{3,50}$'),
    CONSTRAINT valid_phone CHECK (phone_number IS NULL OR phone_number ~* '^\+?[1-9]\d{1,14}$'),
    CONSTRAINT valid_postal_code CHECK (postal_code ~* '^[A-Z0-9\s-]{3,12}$'),
    CONSTRAINT valid_gender CHECK (gender IS NULL OR gender IN ('male', 'female', 'non-binary', 'prefer_not_to_say')),
    CONSTRAINT valid_date_of_birth CHECK (date_of_birth IS NULL OR date_of_birth < CURRENT_DATE),
    CONSTRAINT valid_timezone CHECK (timezone ~* '^[A-Za-z_]+/[A-Za-z_]+$' OR timezone = 'UTC'),
    
    -- Complex interdependent constraints
    CONSTRAINT email_verified_requires_email CHECK (NOT email_verified OR email IS NOT NULL),
    CONSTRAINT phone_verified_requires_phone CHECK (NOT phone_verified OR phone_number IS NOT NULL),
    CONSTRAINT two_factor_requires_verified_contact CHECK (
        NOT two_factor_enabled OR (email_verified = TRUE OR phone_verified = TRUE)
    )
);

-- User preferences with evolving JSON structure that becomes difficult to validate
CREATE TABLE user_preferences (
    preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    preference_category VARCHAR(50) NOT NULL,
    preference_data JSONB NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Basic JSON validation (limited capabilities)
    CONSTRAINT valid_preference_data CHECK (jsonb_typeof(preference_data) = 'object'),
    CONSTRAINT valid_category CHECK (preference_category IN (
        'notification_settings', 'display_preferences', 'privacy_settings', 
        'content_preferences', 'accessibility_options', 'integration_settings'
    ))
);

-- Complex stored procedure for comprehensive user data validation
CREATE OR REPLACE FUNCTION validate_user_profile_data(
    p_user_id UUID,
    p_email VARCHAR(255),
    p_username VARCHAR(50),
    p_profile_data JSONB
) RETURNS TABLE (
    is_valid BOOLEAN,
    validation_errors TEXT[],
    warnings TEXT[]
) AS $$
DECLARE
    errors TEXT[] := ARRAY[]::TEXT[];
    warnings TEXT[] := ARRAY[]::TEXT[];
    existing_email_count INTEGER;
    existing_username_count INTEGER;
    profile_completeness_score DECIMAL;
    
BEGIN
    -- Email validation beyond basic format checking
    IF p_email IS NOT NULL THEN
        -- Check for disposable email domains
        IF p_email ~* '@(tempmail|guerrillamail|10minutemail|mailinator)' THEN
            errors := array_append(errors, 'Disposable email addresses are not allowed');
        END IF;
        
        -- Check for duplicate email (excluding current user)
        SELECT COUNT(*) INTO existing_email_count
        FROM user_profiles 
        WHERE email = p_email AND (p_user_id IS NULL OR user_id != p_user_id);
        
        IF existing_email_count > 0 THEN
            errors := array_append(errors, 'Email address already exists');
        END IF;
    END IF;
    
    -- Username validation with business rules
    IF p_username IS NOT NULL THEN
        -- Check for inappropriate content (simplified)
        IF p_username ~* '(admin|root|system|test|null|undefined)' THEN
            errors := array_append(errors, 'Username contains reserved words');
        END IF;
        
        -- Check for duplicate username
        SELECT COUNT(*) INTO existing_username_count
        FROM user_profiles 
        WHERE username = p_username AND (p_user_id IS NULL OR user_id != p_user_id);
        
        IF existing_username_count > 0 THEN
            errors := array_append(errors, 'Username already exists');
        END IF;
    END IF;
    
    -- Complex profile data validation
    IF p_profile_data IS NOT NULL THEN
        -- Validate notification preferences structure
        IF p_profile_data ? 'notifications' THEN
            IF NOT (p_profile_data->'notifications' ? 'email_frequency' AND
                   p_profile_data->'notifications' ? 'push_enabled' AND
                   p_profile_data->'notifications' ? 'categories') THEN
                errors := array_append(errors, 'Notification preferences missing required fields');
            END IF;
            
            -- Validate email frequency options
            IF p_profile_data->'notifications'->>'email_frequency' NOT IN ('immediate', 'daily', 'weekly', 'never') THEN
                errors := array_append(errors, 'Invalid email frequency setting');
            END IF;
        END IF;
        
        -- Validate privacy settings
        IF p_profile_data ? 'privacy' THEN
            IF NOT (p_profile_data->'privacy' ? 'profile_visibility' AND
                   p_profile_data->'privacy' ? 'contact_permissions') THEN
                warnings := array_append(warnings, 'Privacy settings incomplete');
            END IF;
        END IF;
        
        -- Calculate profile completeness score
        profile_completeness_score := (
            CASE WHEN p_profile_data ? 'avatar_url' THEN 10 ELSE 0 END +
            CASE WHEN p_profile_data ? 'bio' THEN 15 ELSE 0 END +
            CASE WHEN p_profile_data ? 'location' THEN 10 ELSE 0 END +
            CASE WHEN p_profile_data ? 'website' THEN 10 ELSE 0 END +
            CASE WHEN p_profile_data ? 'social_links' THEN 15 ELSE 0 END +
            CASE WHEN p_profile_data ? 'interests' THEN 20 ELSE 0 END +
            CASE WHEN p_profile_data ? 'skills' THEN 20 ELSE 0 END
        );
        
        IF profile_completeness_score < 50 THEN
            warnings := array_append(warnings, 'Profile completeness below recommended threshold');
        END IF;
    END IF;
    
    -- Return validation results
    RETURN QUERY SELECT 
        array_length(errors, 1) IS NULL as is_valid,
        errors as validation_errors,
        warnings;
END;
$$ LANGUAGE plpgsql;

-- User social connections with complex validation
CREATE TABLE user_connections (
    connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_user_id UUID NOT NULL REFERENCES user_profiles(user_id),
    requested_user_id UUID NOT NULL REFERENCES user_profiles(user_id),
    connection_type VARCHAR(30) NOT NULL,
    connection_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    connection_metadata JSONB,
    
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Complex validation constraints
    CONSTRAINT no_self_connection CHECK (requester_user_id != requested_user_id),
    CONSTRAINT valid_connection_type CHECK (connection_type IN (
        'friendship', 'professional', 'family', 'acquaintance', 'blocked', 'follow'
    )),
    CONSTRAINT valid_connection_status CHECK (connection_status IN (
        'pending', 'accepted', 'declined', 'blocked', 'expired', 'cancelled'
    )),
    CONSTRAINT valid_response_timing CHECK (
        (connection_status = 'pending' AND responded_at IS NULL) OR
        (connection_status != 'pending' AND responded_at IS NOT NULL)
    ),
    CONSTRAINT valid_expiration CHECK (
        expires_at IS NULL OR expires_at > requested_at
    ),
    
    -- Unique constraint to prevent duplicate connections
    UNIQUE (requester_user_id, requested_user_id, connection_type)
);

-- Trigger for complex business rule validation
CREATE OR REPLACE FUNCTION validate_connection_business_rules()
RETURNS TRIGGER AS $$
DECLARE
    requester_profile RECORD;
    requested_profile RECORD;
    existing_connection_count INTEGER;
    blocked_connection_exists BOOLEAN := FALSE;
    
BEGIN
    -- Get user profiles for validation
    SELECT * INTO requester_profile FROM user_profiles WHERE user_id = NEW.requester_user_id;
    SELECT * INTO requested_profile FROM user_profiles WHERE user_id = NEW.requested_user_id;
    
    -- Validate account status
    IF requester_profile.account_status != 'active' THEN
        RAISE EXCEPTION 'Cannot create connection from inactive account';
    END IF;
    
    IF requested_profile.account_status NOT IN ('active', 'inactive') THEN
        RAISE EXCEPTION 'Cannot create connection to suspended or deleted account';
    END IF;
    
    -- Check for existing blocked connections
    SELECT EXISTS(
        SELECT 1 FROM user_connections
        WHERE ((requester_user_id = NEW.requester_user_id AND requested_user_id = NEW.requested_user_id) OR
               (requester_user_id = NEW.requested_user_id AND requested_user_id = NEW.requester_user_id))
        AND connection_status = 'blocked'
    ) INTO blocked_connection_exists;
    
    IF blocked_connection_exists AND NEW.connection_type != 'blocked' THEN
        RAISE EXCEPTION 'Cannot create connection with blocked user';
    END IF;
    
    -- Validate connection limits based on type
    IF NEW.connection_type = 'friendship' THEN
        SELECT COUNT(*) INTO existing_connection_count
        FROM user_connections
        WHERE requester_user_id = NEW.requester_user_id 
        AND connection_type = 'friendship' 
        AND connection_status = 'accepted';
        
        IF existing_connection_count >= 5000 THEN
            RAISE EXCEPTION 'Maximum friendship connections exceeded';
        END IF;
    END IF;
    
    -- Set automatic expiration for pending requests
    IF NEW.connection_status = 'pending' AND NEW.expires_at IS NULL THEN
        NEW.expires_at := NEW.requested_at + INTERVAL '30 days';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_connection_trigger
    BEFORE INSERT OR UPDATE ON user_connections
    FOR EACH ROW EXECUTE FUNCTION validate_connection_business_rules();

-- Problems with traditional schema validation approaches:
-- 1. Rigid schema changes require expensive ALTER TABLE operations affecting entire datasets
-- 2. Complex CHECK constraints become performance bottlenecks with limited expressiveness
-- 3. Limited JSON validation capabilities that cannot enforce nested structure requirements
-- 4. Difficult schema evolution requiring coordinated application and database changes
-- 5. Poor support for optional fields and polymorphic document structures
-- 6. Complex trigger-based validation logic that's difficult to maintain and debug
-- 7. Limited ability to enforce cross-document validation rules and referential constraints
-- 8. Poor integration with modern application frameworks and validation libraries
-- 9. Inflexible validation rules that cannot adapt to different user roles or contexts
-- 10. Expensive validation operations that impact application performance and scalability

-- Traditional validation limitations with JSON data
WITH user_validation_attempts AS (
    SELECT 
        up.user_id,
        up.email,
        up.username,
        
        -- Manual JSON structure validation (limited capabilities)
        CASE 
            WHEN uprefs.preference_data IS NULL THEN 'missing_preferences'
            WHEN NOT (uprefs.preference_data ? 'notifications') THEN 'missing_notifications'
            WHEN jsonb_typeof(uprefs.preference_data->'notifications') != 'object' THEN 'invalid_notifications_type'
            WHEN NOT (uprefs.preference_data->'notifications' ? 'email_frequency') THEN 'missing_email_frequency'
            ELSE 'valid'
        END as validation_status,
        
        -- Complex nested validation queries (poor performance)
        CASE 
            WHEN uprefs.preference_data->'notifications'->>'email_frequency' IN ('immediate', 'daily', 'weekly', 'never') 
            THEN TRUE ELSE FALSE 
        END as valid_email_frequency,
        
        -- Limited validation of array structures
        CASE 
            WHEN jsonb_typeof(uprefs.preference_data->'interests') = 'array' AND
                 jsonb_array_length(uprefs.preference_data->'interests') BETWEEN 1 AND 10
            THEN TRUE ELSE FALSE 
        END as valid_interests_array,
        
        -- Difficult cross-field validation
        CASE 
            WHEN up.email_verified = TRUE AND 
                 uprefs.preference_data->'notifications'->>'email_frequency' != 'never'
            THEN TRUE ELSE FALSE 
        END as consistent_email_settings
        
    FROM user_profiles up
    LEFT JOIN user_preferences uprefs ON up.user_id = uprefs.user_id 
    WHERE uprefs.preference_category = 'notification_settings'
),

validation_summary AS (
    SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE validation_status = 'valid') as valid_users,
        COUNT(*) FILTER (WHERE validation_status != 'valid') as invalid_users,
        COUNT(*) FILTER (WHERE NOT valid_email_frequency) as invalid_email_frequency,
        COUNT(*) FILTER (WHERE NOT valid_interests_array) as invalid_interests,
        COUNT(*) FILTER (WHERE NOT consistent_email_settings) as inconsistent_settings,
        
        -- Performance impact of manual validation
        EXTRACT(MILLISECONDS FROM (CURRENT_TIMESTAMP - CURRENT_TIMESTAMP)) as validation_time_ms
        
    FROM user_validation_attempts
)

SELECT 
    vs.total_users,
    vs.valid_users,
    vs.invalid_users,
    ROUND((vs.valid_users::decimal / vs.total_users::decimal) * 100, 2) as validation_success_rate,
    
    -- Manual validation issues identified
    vs.invalid_email_frequency as email_frequency_violations,
    vs.invalid_interests as interests_structure_violations, 
    vs.inconsistent_settings as cross_field_consistency_violations,
    
    -- Validation challenges
    'Complex manual validation queries' as primary_challenge,
    'Limited JSON schema enforcement capabilities' as technical_limitation,
    'Poor performance with large datasets' as scalability_concern,
    'Difficult maintenance and evolution' as operational_issue

FROM validation_summary vs;

-- Traditional relational database limitations for document validation:
-- 1. Rigid schema definitions that resist evolution and require expensive migrations
-- 2. Limited JSON validation capabilities with poor performance and expressiveness
-- 3. Complex trigger-based validation logic that's difficult to maintain and debug
-- 4. Poor support for polymorphic document structures and optional field validation
-- 5. Expensive CHECK constraints that impact insert/update performance significantly
-- 6. Limited ability to enforce context-aware validation rules based on user roles
-- 7. Difficult integration with modern application validation frameworks and libraries
-- 8. Poor support for nested document validation and cross-document referential integrity
-- 9. Complex migration procedures required for validation rule changes and schema updates
-- 10. Limited expressiveness for business rule validation requiring extensive stored procedure logic
```

MongoDB's document validation provides flexible, powerful schema enforcement with JSON Schema integration:

```javascript
// MongoDB Document Validation - comprehensive schema enforcement with flexible evolution capabilities
const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('enterprise_user_platform');

// Advanced Document Validation Manager for Enterprise Schema Governance
class AdvancedDocumentValidationManager {
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      // Validation configuration
      enableStrictValidation: config.enableStrictValidation !== false,
      enableWarningMode: config.enableWarningMode || false,
      enableValidationBypass: config.enableValidationBypass || false,
      enableCustomValidators: config.enableCustomValidators !== false,
      
      // Schema governance
      enableSchemaVersioning: config.enableSchemaVersioning !== false,
      enableSchemaEvolution: config.enableSchemaEvolution !== false,
      enableValidationAnalytics: config.enableValidationAnalytics !== false,
      
      // Performance optimization
      enableValidationCaching: config.enableValidationCaching || false,
      enableAsyncValidation: config.enableAsyncValidation || false,
      validationTimeout: config.validationTimeout || 5000,
      
      // Error handling
      detailedErrorReporting: config.detailedErrorReporting !== false,
      enableValidationLogging: config.enableValidationLogging !== false,
      errorAggregationEnabled: config.errorAggregationEnabled !== false
    };
    
    this.validationStats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      warningCount: 0,
      averageValidationTime: 0,
      schemaEvolutions: 0
    };
    
    this.schemaRegistry = new Map();
    this.validationCache = new Map();
    this.customValidators = new Map();
    
    this.initializeValidationFramework();
  }

  async initializeValidationFramework() {
    console.log('Initializing comprehensive document validation framework...');
    
    try {
      // Setup user profile validation
      await this.setupUserProfileValidation();
      
      // Setup user preferences validation
      await this.setupUserPreferencesValidation();
      
      // Setup user connections validation
      await this.setupUserConnectionsValidation();
      
      // Setup dynamic content validation
      await this.setupDynamicContentValidation();
      
      // Initialize custom validators
      await this.setupCustomValidators();
      
      // Setup validation analytics
      if (this.config.enableValidationAnalytics) {
        await this.initializeValidationAnalytics();
      }
      
      console.log('Document validation framework initialized successfully');
      
    } catch (error) {
      console.error('Error initializing validation framework:', error);
      throw error;
    }
  }

  async setupUserProfileValidation() {
    console.log('Setting up user profile validation schema...');
    
    try {
      const userProfileSchema = {
        $jsonSchema: {
          bsonType: 'object',
          required: ['email', 'username', 'firstName', 'lastName', 'accountStatus'],
          additionalProperties: true, // Allow for schema evolution
          
          properties: {
            _id: {
              bsonType: 'objectId',
              description: 'Unique identifier for the user profile'
            },
            
            // Core identity fields with comprehensive validation
            email: {
              bsonType: 'string',
              pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
              maxLength: 255,
              description: 'Valid email address with proper format validation'
            },
            
            username: {
              bsonType: 'string',
              pattern: '^[a-zA-Z0-9_]{3,50}$',
              minLength: 3,
              maxLength: 50,
              description: 'Alphanumeric username with underscores allowed'
            },
            
            firstName: {
              bsonType: 'string',
              minLength: 1,
              maxLength: 100,
              pattern: '^[a-zA-ZÀ-ÿ\\s\\-\\.\']{1,100}$',
              description: 'First name with international character support'
            },
            
            lastName: {
              bsonType: 'string',
              minLength: 1,
              maxLength: 100,
              pattern: '^[a-zA-ZÀ-ÿ\\s\\-\\.\']{1,100}$',
              description: 'Last name with international character support'
            },
            
            // Contact information with flexible validation
            contactInfo: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                phoneNumber: {
                  bsonType: 'string',
                  pattern: '^\\+?[1-9]\\d{1,14}$',
                  description: 'E.164 format phone number'
                },
                address: {
                  bsonType: 'object',
                  properties: {
                    street: { bsonType: 'string', maxLength: 255 },
                    city: { bsonType: 'string', maxLength: 100 },
                    state: { bsonType: 'string', maxLength: 100 },
                    postalCode: { bsonType: 'string', pattern: '^[A-Z0-9\\s-]{3,12}$' },
                    country: { 
                      bsonType: 'string', 
                      enum: ['US', 'CA', 'GB', 'DE', 'FR', 'AU', 'JP', 'BR', 'IN', 'MX'],
                      description: 'ISO country code'
                    }
                  },
                  additionalProperties: false
                }
              }
            },
            
            // Profile metadata with comprehensive validation
            profileMetadata: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                dateOfBirth: {
                  bsonType: 'date',
                  description: 'Date of birth for age verification'
                },
                gender: {
                  bsonType: 'string',
                  enum: ['male', 'female', 'non-binary', 'prefer_not_to_say'],
                  description: 'Gender identity selection'
                },
                preferredLanguage: {
                  bsonType: 'string',
                  pattern: '^[a-z]{2}(-[A-Z]{2})?$',
                  description: 'ISO language code (e.g., en, en-US)'
                },
                timezone: {
                  bsonType: 'string',
                  pattern: '^[A-Za-z_]+/[A-Za-z_]+$|^UTC$',
                  description: 'IANA timezone identifier'
                },
                bio: {
                  bsonType: 'string',
                  maxLength: 2000,
                  description: 'User biography or description'
                },
                avatarUrl: {
                  bsonType: 'string',
                  pattern: '^https?://[\\w\\-._~:/?#[\\]@!$&\'()*+,;=]+$',
                  description: 'Valid URL for profile avatar'
                },
                socialLinks: {
                  bsonType: 'array',
                  maxItems: 10,
                  items: {
                    bsonType: 'object',
                    required: ['platform', 'url'],
                    properties: {
                      platform: {
                        bsonType: 'string',
                        enum: ['twitter', 'linkedin', 'github', 'facebook', 'instagram', 'website'],
                        description: 'Social media platform identifier'
                      },
                      url: {
                        bsonType: 'string',
                        pattern: '^https?://[\\w\\-._~:/?#[\\]@!$&\'()*+,;=]+$',
                        description: 'Valid URL for social profile'
                      },
                      verified: {
                        bsonType: 'bool',
                        description: 'Whether the social link has been verified'
                      }
                    },
                    additionalProperties: false
                  }
                }
              }
            },
            
            // Account settings with business logic validation
            accountStatus: {
              bsonType: 'string',
              enum: ['active', 'inactive', 'suspended', 'pending_verification', 'deleted'],
              description: 'Current account status'
            },
            
            verification: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                emailVerified: {
                  bsonType: 'bool',
                  description: 'Email verification status'
                },
                phoneVerified: {
                  bsonType: 'bool',
                  description: 'Phone verification status'
                },
                identityVerified: {
                  bsonType: 'bool',
                  description: 'Identity verification status'
                },
                verificationDate: {
                  bsonType: 'date',
                  description: 'Date of last verification'
                },
                verificationLevel: {
                  bsonType: 'string',
                  enum: ['none', 'basic', 'enhanced', 'premium'],
                  description: 'Level of account verification'
                }
              }
            },
            
            // Privacy and security settings
            privacySettings: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                profileVisibility: {
                  bsonType: 'string',
                  enum: ['public', 'friends', 'private'],
                  description: 'Profile visibility setting'
                },
                contactPermissions: {
                  bsonType: 'object',
                  properties: {
                    allowMessages: { bsonType: 'bool' },
                    allowConnections: { bsonType: 'bool' },
                    allowPhoneContact: { bsonType: 'bool' },
                    allowEmailContact: { bsonType: 'bool' }
                  },
                  additionalProperties: false
                },
                dataSharing: {
                  bsonType: 'object',
                  properties: {
                    marketingConsent: { bsonType: 'bool' },
                    analyticsConsent: { bsonType: 'bool' },
                    thirdPartySharing: { bsonType: 'bool' },
                    personalizedAds: { bsonType: 'bool' }
                  },
                  additionalProperties: false
                }
              }
            },
            
            // Security configuration
            security: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                twoFactorEnabled: {
                  bsonType: 'bool',
                  description: 'Two-factor authentication status'
                },
                twoFactorMethod: {
                  bsonType: 'string',
                  enum: ['sms', 'email', 'authenticator', 'hardware'],
                  description: 'Two-factor authentication method'
                },
                passwordLastChanged: {
                  bsonType: 'date',
                  description: 'Date of last password change'
                },
                loginAttempts: {
                  bsonType: 'int',
                  minimum: 0,
                  maximum: 10,
                  description: 'Number of recent failed login attempts'
                },
                accountLocked: {
                  bsonType: 'bool',
                  description: 'Account lock status due to security issues'
                },
                lockoutExpires: {
                  bsonType: 'date',
                  description: 'Account lockout expiration date'
                }
              }
            },
            
            // Audit and versioning information
            audit: {
              bsonType: 'object',
              required: ['createdAt', 'version'],
              additionalProperties: false,
              properties: {
                createdAt: {
                  bsonType: 'date',
                  description: 'Document creation timestamp'
                },
                updatedAt: {
                  bsonType: 'date',
                  description: 'Last modification timestamp'
                },
                createdBy: {
                  bsonType: 'objectId',
                  description: 'ID of user who created this document'
                },
                updatedBy: {
                  bsonType: 'objectId',
                  description: 'ID of user who last updated this document'
                },
                version: {
                  bsonType: 'int',
                  minimum: 1,
                  description: 'Document version for optimistic locking'
                },
                changeLog: {
                  bsonType: 'array',
                  maxItems: 100,
                  items: {
                    bsonType: 'object',
                    required: ['timestamp', 'action', 'field'],
                    properties: {
                      timestamp: { bsonType: 'date' },
                      action: { 
                        bsonType: 'string', 
                        enum: ['created', 'updated', 'deleted', 'verified', 'suspended'] 
                      },
                      field: { bsonType: 'string' },
                      oldValue: { bsonType: ['string', 'number', 'bool', 'null'] },
                      newValue: { bsonType: ['string', 'number', 'bool', 'null'] },
                      reason: { bsonType: 'string', maxLength: 500 }
                    },
                    additionalProperties: false
                  }
                }
              }
            }
          }
        }
      };

      // Create collection with validation
      await this.createCollectionWithValidation('userProfiles', userProfileSchema, {
        validationLevel: 'strict',
        validationAction: this.config.enableWarningMode ? 'warn' : 'error'
      });
      
      // Register schema for versioning
      this.schemaRegistry.set('userProfiles', {
        version: '1.0',
        schema: userProfileSchema,
        createdAt: new Date(),
        description: 'User profile schema with comprehensive validation'
      });
      
      console.log('User profile validation schema configured successfully');
      
    } catch (error) {
      console.error('Error setting up user profile validation:', error);
      throw error;
    }
  }

  async setupUserPreferencesValidation() {
    console.log('Setting up user preferences validation schema...');
    
    try {
      const userPreferencesSchema = {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'preferenceCategory', 'preferences'],
          additionalProperties: true,
          
          properties: {
            _id: {
              bsonType: 'objectId'
            },
            
            userId: {
              bsonType: 'objectId',
              description: 'Reference to user profile'
            },
            
            preferenceCategory: {
              bsonType: 'string',
              enum: [
                'notification_settings',
                'display_preferences', 
                'privacy_settings',
                'content_preferences',
                'accessibility_options',
                'integration_settings',
                'security_preferences'
              ],
              description: 'Category of user preference'
            },
            
            preferences: {
              bsonType: 'object',
              description: 'Category-specific preference object',
              
              // Use conditional validation based on category
              if: { properties: { preferenceCategory: { const: 'notification_settings' } } },
              then: {
                properties: {
                  preferences: {
                    bsonType: 'object',
                    required: ['emailFrequency', 'pushEnabled', 'categories'],
                    additionalProperties: false,
                    properties: {
                      emailFrequency: {
                        bsonType: 'string',
                        enum: ['immediate', 'hourly', 'daily', 'weekly', 'never'],
                        description: 'Email notification frequency'
                      },
                      pushEnabled: {
                        bsonType: 'bool',
                        description: 'Push notification enabled status'
                      },
                      smsEnabled: {
                        bsonType: 'bool',
                        description: 'SMS notification enabled status'
                      },
                      categories: {
                        bsonType: 'object',
                        additionalProperties: false,
                        properties: {
                          security: { bsonType: 'bool' },
                          social: { bsonType: 'bool' },
                          marketing: { bsonType: 'bool' },
                          system: { bsonType: 'bool' },
                          updates: { bsonType: 'bool' }
                        }
                      },
                      quietHours: {
                        bsonType: 'object',
                        properties: {
                          enabled: { bsonType: 'bool' },
                          startTime: { 
                            bsonType: 'string',
                            pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
                          },
                          endTime: { 
                            bsonType: 'string',
                            pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
                          },
                          timezone: { bsonType: 'string' }
                        },
                        additionalProperties: false
                      }
                    }
                  }
                }
              },
              
              // Display preferences validation
              else: {
                if: { properties: { preferenceCategory: { const: 'display_preferences' } } },
                then: {
                  properties: {
                    preferences: {
                      bsonType: 'object',
                      additionalProperties: false,
                      properties: {
                        theme: {
                          bsonType: 'string',
                          enum: ['light', 'dark', 'auto', 'high_contrast'],
                          description: 'UI theme preference'
                        },
                        language: {
                          bsonType: 'string',
                          pattern: '^[a-z]{2}(-[A-Z]{2})?$',
                          description: 'Display language preference'
                        },
                        dateFormat: {
                          bsonType: 'string',
                          enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY'],
                          description: 'Date display format'
                        },
                        timeFormat: {
                          bsonType: 'string',
                          enum: ['12h', '24h'],
                          description: 'Time display format'
                        },
                        timezone: {
                          bsonType: 'string',
                          pattern: '^[A-Za-z_]+/[A-Za-z_]+$|^UTC$',
                          description: 'Display timezone'
                        },
                        itemsPerPage: {
                          bsonType: 'int',
                          minimum: 10,
                          maximum: 100,
                          description: 'Number of items per page'
                        },
                        fontSize: {
                          bsonType: 'string',
                          enum: ['small', 'medium', 'large', 'extra-large'],
                          description: 'Font size preference'
                        }
                      }
                    }
                  }
                }
              }
            },
            
            isActive: {
              bsonType: 'bool',
              description: 'Whether preferences are currently active'
            },
            
            lastSyncedAt: {
              bsonType: 'date',
              description: 'Last synchronization timestamp'
            },
            
            metadata: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                source: {
                  bsonType: 'string',
                  enum: ['user_input', 'system_default', 'import', 'sync'],
                  description: 'Source of preference data'
                },
                deviceType: {
                  bsonType: 'string',
                  enum: ['desktop', 'mobile', 'tablet', 'api'],
                  description: 'Device type where preferences were set'
                },
                appVersion: {
                  bsonType: 'string',
                  pattern: '^\\d+\\.\\d+\\.\\d+$',
                  description: 'Application version when preferences were set'
                },
                migrationVersion: {
                  bsonType: 'int',
                  description: 'Schema migration version'
                }
              }
            },
            
            createdAt: {
              bsonType: 'date',
              description: 'Creation timestamp'
            },
            
            updatedAt: {
              bsonType: 'date',
              description: 'Last update timestamp'
            }
          }
        }
      };

      // Create collection with validation
      await this.createCollectionWithValidation('userPreferences', userPreferencesSchema, {
        validationLevel: 'moderate', // Allow some flexibility for preferences
        validationAction: 'warn'     // Don't block for preference inconsistencies
      });
      
      // Register schema
      this.schemaRegistry.set('userPreferences', {
        version: '1.0',
        schema: userPreferencesSchema,
        createdAt: new Date(),
        description: 'User preferences with conditional validation based on category'
      });
      
      console.log('User preferences validation schema configured successfully');
      
    } catch (error) {
      console.error('Error setting up user preferences validation:', error);
      throw error;
    }
  }

  async setupUserConnectionsValidation() {
    console.log('Setting up user connections validation schema...');
    
    try {
      const userConnectionsSchema = {
        $jsonSchema: {
          bsonType: 'object',
          required: ['requesterUserId', 'requestedUserId', 'connectionType', 'connectionStatus'],
          additionalProperties: true,
          
          properties: {
            _id: {
              bsonType: 'objectId'
            },
            
            requesterUserId: {
              bsonType: 'objectId',
              description: 'User who initiated the connection'
            },
            
            requestedUserId: {
              bsonType: 'objectId',
              description: 'User who received the connection request'
            },
            
            connectionType: {
              bsonType: 'string',
              enum: ['friendship', 'professional', 'family', 'acquaintance', 'blocked', 'follow'],
              description: 'Type of connection relationship'
            },
            
            connectionStatus: {
              bsonType: 'string',
              enum: ['pending', 'accepted', 'declined', 'blocked', 'expired', 'cancelled'],
              description: 'Current status of the connection'
            },
            
            connectionMetadata: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                message: {
                  bsonType: 'string',
                  maxLength: 500,
                  description: 'Optional message with connection request'
                },
                tags: {
                  bsonType: 'array',
                  maxItems: 10,
                  items: {
                    bsonType: 'string',
                    maxLength: 50
                  },
                  description: 'Tags for categorizing the connection'
                },
                context: {
                  bsonType: 'string',
                  enum: ['work', 'school', 'mutual_friends', 'event', 'online', 'family', 'other'],
                  description: 'How the users know each other'
                },
                priority: {
                  bsonType: 'int',
                  minimum: 1,
                  maximum: 5,
                  description: 'Connection priority level'
                },
                isCloseFriend: {
                  bsonType: 'bool',
                  description: 'Whether this is marked as a close friend'
                },
                mutualConnections: {
                  bsonType: 'int',
                  minimum: 0,
                  description: 'Number of mutual connections'
                }
              }
            },
            
            timeline: {
              bsonType: 'object',
              required: ['requestedAt'],
              additionalProperties: false,
              properties: {
                requestedAt: {
                  bsonType: 'date',
                  description: 'When the connection was requested'
                },
                respondedAt: {
                  bsonType: 'date',
                  description: 'When the connection was responded to'
                },
                expiresAt: {
                  bsonType: 'date',
                  description: 'When pending connection expires'
                },
                lastInteractionAt: {
                  bsonType: 'date',
                  description: 'Last interaction between users'
                }
              }
            },
            
            privacy: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                isVisible: {
                  bsonType: 'bool',
                  description: 'Whether connection is visible to others'
                },
                shareWith: {
                  bsonType: 'string',
                  enum: ['public', 'friends', 'mutual_connections', 'private'],
                  description: 'Who can see this connection'
                },
                allowNotifications: {
                  bsonType: 'bool',
                  description: 'Whether to allow notifications from this connection'
                }
              }
            }
          },
          
          // Custom validation rules using MongoDB's expression syntax
          $expr: {
            $and: [
              // Prevent self-connections
              { $ne: ['$requesterUserId', '$requestedUserId'] },
              
              // Validate response timing logic
              {
                $or: [
                  { $eq: ['$connectionStatus', 'pending'] },
                  { $ne: ['$timeline.respondedAt', null] }
                ]
              },
              
              // Validate expiration logic
              {
                $or: [
                  { $eq: ['$timeline.expiresAt', null] },
                  { $gt: ['$timeline.expiresAt', '$timeline.requestedAt'] }
                ]
              }
            ]
          }
        }
      };

      // Create collection with validation
      await this.createCollectionWithValidation('userConnections', userConnectionsSchema, {
        validationLevel: 'strict',
        validationAction: 'error'
      });
      
      // Create compound unique index to prevent duplicate connections
      await this.db.collection('userConnections').createIndex(
        { requesterUserId: 1, requestedUserId: 1, connectionType: 1 },
        { 
          unique: true,
          partialFilterExpression: { 
            connectionStatus: { $nin: ['declined', 'cancelled', 'expired'] } 
          },
          background: true,
          name: 'unique_active_connections'
        }
      );
      
      // Register schema
      this.schemaRegistry.set('userConnections', {
        version: '1.0',
        schema: userConnectionsSchema,
        createdAt: new Date(),
        description: 'User connections with complex business logic validation'
      });
      
      console.log('User connections validation schema configured successfully');
      
    } catch (error) {
      console.error('Error setting up user connections validation:', error);
      throw error;
    }
  }

  async createCollectionWithValidation(collectionName, schema, options = {}) {
    console.log(`Creating collection ${collectionName} with validation...`);
    
    try {
      // Check if collection exists
      const collections = await this.db.listCollections({ name: collectionName }).toArray();
      
      if (collections.length > 0) {
        // Collection exists, modify validation
        console.log(`Updating validation for existing collection: ${collectionName}`);
        
        await this.db.command({
          collMod: collectionName,
          validator: schema,
          validationLevel: options.validationLevel || 'strict',
          validationAction: options.validationAction || 'error'
        });
        
      } else {
        // Create new collection with validation
        console.log(`Creating new collection with validation: ${collectionName}`);
        
        await this.db.createCollection(collectionName, {
          validator: schema,
          validationLevel: options.validationLevel || 'strict',
          validationAction: options.validationAction || 'error'
        });
      }
      
      console.log(`Collection ${collectionName} validation configured successfully`);
      
    } catch (error) {
      console.error(`Error creating collection ${collectionName} with validation:`, error);
      throw error;
    }
  }

  async validateDocument(collectionName, document, options = {}) {
    console.log(`Validating document for collection: ${collectionName}`);
    const validationStart = Date.now();
    
    try {
      const collection = this.db.collection(collectionName);
      const schemaInfo = this.schemaRegistry.get(collectionName);
      
      if (!schemaInfo) {
        throw new Error(`No validation schema found for collection: ${collectionName}`);
      }
      
      // Perform document validation
      const validationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        validatedFields: [],
        skippedFields: []
      };
      
      // Custom validation logic
      if (this.config.enableCustomValidators) {
        const customValidation = await this.runCustomValidators(collectionName, document);
        if (!customValidation.isValid) {
          validationResult.isValid = false;
          validationResult.errors.push(...customValidation.errors);
        }
        validationResult.warnings.push(...customValidation.warnings);
      }
      
      // Business logic validation
      const businessValidation = await this.validateBusinessRules(collectionName, document, options);
      if (!businessValidation.isValid) {
        validationResult.isValid = false;
        validationResult.errors.push(...businessValidation.errors);
      }
      validationResult.warnings.push(...businessValidation.warnings);
      
      // Update validation statistics
      const validationTime = Date.now() - validationStart;
      this.validationStats.totalValidations++;
      
      if (validationResult.isValid) {
        this.validationStats.successfulValidations++;
      } else {
        this.validationStats.failedValidations++;
      }
      
      this.validationStats.warningCount += validationResult.warnings.length;
      this.validationStats.averageValidationTime = 
        ((this.validationStats.averageValidationTime * (this.validationStats.totalValidations - 1)) + validationTime) / 
        this.validationStats.totalValidations;
      
      // Log validation result if enabled
      if (this.config.enableValidationLogging) {
        await this.logValidationResult(collectionName, document._id, validationResult, validationTime);
      }
      
      console.log(`Document validation completed for ${collectionName}: ${validationResult.isValid ? 'valid' : 'invalid'} (${validationTime}ms)`);
      
      return {
        ...validationResult,
        validationTime,
        schemaVersion: schemaInfo.version
      };
      
    } catch (error) {
      console.error(`Document validation failed for ${collectionName}:`, error);
      throw error;
    }
  }

  async validateBusinessRules(collectionName, document, options) {
    const businessValidation = {
      isValid: true,
      errors: [],
      warnings: []
    };
    
    switch (collectionName) {
      case 'userProfiles':
        return await this.validateUserProfileBusinessRules(document, options);
        
      case 'userConnections':
        return await this.validateConnectionBusinessRules(document, options);
        
      case 'userPreferences':
        return await this.validatePreferencesBusinessRules(document, options);
        
      default:
        return businessValidation;
    }
  }

  async validateUserProfileBusinessRules(document, options) {
    const validation = { isValid: true, errors: [], warnings: [] };
    
    try {
      // Check for duplicate email (excluding current document)
      if (document.email) {
        const emailExists = await this.db.collection('userProfiles').findOne({
          email: document.email,
          _id: { $ne: document._id }
        });
        
        if (emailExists) {
          validation.isValid = false;
          validation.errors.push('Email address already exists');
        }
      }
      
      // Check for duplicate username
      if (document.username) {
        const usernameExists = await this.db.collection('userProfiles').findOne({
          username: document.username,
          _id: { $ne: document._id }
        });
        
        if (usernameExists) {
          validation.isValid = false;
          validation.errors.push('Username already exists');
        }
        
        // Check for reserved usernames
        const reservedUsernames = ['admin', 'root', 'system', 'test', 'null', 'undefined', 'api'];
        if (reservedUsernames.some(reserved => 
          document.username.toLowerCase().includes(reserved.toLowerCase())
        )) {
          validation.errors.push('Username contains reserved words');
          validation.isValid = false;
        }
      }
      
      // Validate two-factor authentication requirements
      if (document.security?.twoFactorEnabled && 
          !document.verification?.emailVerified && 
          !document.verification?.phoneVerified) {
        validation.warnings.push('Two-factor authentication requires verified email or phone');
      }
      
      // Validate profile completeness
      const requiredFields = ['firstName', 'lastName', 'email'];
      const recommendedFields = ['profileMetadata.bio', 'contactInfo.phoneNumber', 'profileMetadata.avatarUrl'];
      
      const missingRequired = requiredFields.filter(field => !this.getNestedValue(document, field));
      const missingRecommended = recommendedFields.filter(field => !this.getNestedValue(document, field));
      
      if (missingRequired.length > 0) {
        validation.isValid = false;
        validation.errors.push(`Missing required fields: ${missingRequired.join(', ')}`);
      }
      
      if (missingRecommended.length > 2) {
        validation.warnings.push('Profile is incomplete - consider adding more information');
      }
      
      return validation;
      
    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Business rule validation failed: ${error.message}`);
      return validation;
    }
  }

  async validateConnectionBusinessRules(document, options) {
    const validation = { isValid: true, errors: [], warnings: [] };
    
    try {
      // Validate that users exist
      const [requester, requested] = await Promise.all([
        this.db.collection('userProfiles').findOne({ _id: document.requesterUserId }),
        this.db.collection('userProfiles').findOne({ _id: document.requestedUserId })
      ]);
      
      if (!requester) {
        validation.isValid = false;
        validation.errors.push('Requester user does not exist');
      } else if (requester.accountStatus !== 'active') {
        validation.isValid = false;
        validation.errors.push('Cannot create connection from inactive account');
      }
      
      if (!requested) {
        validation.isValid = false;
        validation.errors.push('Requested user does not exist');
      } else if (!['active', 'inactive'].includes(requested.accountStatus)) {
        validation.isValid = false;
        validation.errors.errors.push('Cannot create connection to suspended or deleted account');
      }
      
      // Check for existing blocked connections
      const blockedConnection = await this.db.collection('userConnections').findOne({
        $or: [
          { requesterUserId: document.requesterUserId, requestedUserId: document.requestedUserId },
          { requesterUserId: document.requestedUserId, requestedUserId: document.requesterUserId }
        ],
        connectionStatus: 'blocked'
      });
      
      if (blockedConnection && document.connectionType !== 'blocked') {
        validation.isValid = false;
        validation.errors.push('Cannot create connection with blocked user');
      }
      
      // Validate connection limits
      if (document.connectionType === 'friendship') {
        const connectionCount = await this.db.collection('userConnections').countDocuments({
          requesterUserId: document.requesterUserId,
          connectionType: 'friendship',
          connectionStatus: 'accepted'
        });
        
        if (connectionCount >= 5000) {
          validation.isValid = false;
          validation.errors.push('Maximum friendship connections exceeded');
        }
      }
      
      return validation;
      
    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Connection business rule validation failed: ${error.message}`);
      return validation;
    }
  }

  getNestedValue(object, path) {
    return path.split('.').reduce((current, key) => current && current[key], object);
  }

  async setupCustomValidators() {
    console.log('Setting up custom validators...');
    
    // Email domain validator
    this.customValidators.set('emailDomainValidator', async (document, field) => {
      const email = this.getNestedValue(document, field);
      if (!email) return { isValid: true, warnings: [] };
      
      const domain = email.split('@')[1]?.toLowerCase();
      const disposableEmailDomains = ['tempmail.com', 'guerrillamail.com', '10minutemail.com'];
      
      if (disposableEmailDomains.includes(domain)) {
        return {
          isValid: false,
          errors: ['Disposable email addresses are not allowed']
        };
      }
      
      return { isValid: true, warnings: [] };
    });
    
    // Profile completeness validator
    this.customValidators.set('profileCompletenessValidator', async (document) => {
      const completenessScore = this.calculateProfileCompleteness(document);
      
      if (completenessScore < 30) {
        return {
          isValid: true,
          warnings: ['Profile completeness is very low - consider adding more information']
        };
      }
      
      return { isValid: true, warnings: [] };
    });
    
    console.log('Custom validators configured successfully');
  }

  async runCustomValidators(collectionName, document) {
    const results = { isValid: true, errors: [], warnings: [] };
    
    for (const [validatorName, validator] of this.customValidators) {
      try {
        const validatorResult = await validator(document);
        
        if (!validatorResult.isValid) {
          results.isValid = false;
          results.errors.push(...(validatorResult.errors || []));
        }
        
        results.warnings.push(...(validatorResult.warnings || []));
        
      } catch (error) {
        console.error(`Custom validator ${validatorName} failed:`, error);
        results.warnings.push(`Validator ${validatorName} encountered an error`);
      }
    }
    
    return results;
  }

  calculateProfileCompleteness(userProfile) {
    let score = 0;
    
    // Basic required fields (40 points)
    if (userProfile.email) score += 10;
    if (userProfile.firstName) score += 10;
    if (userProfile.lastName) score += 10;
    if (userProfile.username) score += 10;
    
    // Profile metadata (30 points)
    if (userProfile.profileMetadata?.bio) score += 10;
    if (userProfile.profileMetadata?.avatarUrl) score += 10;
    if (userProfile.profileMetadata?.dateOfBirth) score += 5;
    if (userProfile.profileMetadata?.preferredLanguage) score += 5;
    
    // Contact information (20 points)
    if (userProfile.contactInfo?.phoneNumber) score += 10;
    if (userProfile.contactInfo?.address) score += 10;
    
    // Verification status (10 points)
    if (userProfile.verification?.emailVerified) score += 5;
    if (userProfile.verification?.phoneVerified) score += 5;
    
    return Math.min(score, 100); // Cap at 100%
  }

  async logValidationResult(collectionName, documentId, validationResult, validationTime) {
    try {
      const validationLog = {
        timestamp: new Date(),
        collectionName,
        documentId,
        isValid: validationResult.isValid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length,
        validationTime,
        errors: validationResult.errors,
        warnings: validationResult.warnings
      };
      
      await this.db.collection('validationLogs').insertOne(validationLog);
      
    } catch (error) {
      console.error('Error logging validation result:', error);
    }
  }

  async getValidationStatistics() {
    return {
      ...this.validationStats,
      timestamp: new Date(),
      registeredSchemas: this.schemaRegistry.size,
      customValidators: this.customValidators.size
    };
  }

  async evolveSchema(collectionName, newSchema, options = {}) {
    console.log(`Evolving schema for collection: ${collectionName}`);
    
    try {
      const currentSchemaInfo = this.schemaRegistry.get(collectionName);
      if (!currentSchemaInfo) {
        throw new Error(`No existing schema found for collection: ${collectionName}`);
      }
      
      // Backup current schema
      const backupSchema = {
        ...currentSchemaInfo,
        backupTimestamp: new Date()
      };
      
      // Update validation
      await this.db.command({
        collMod: collectionName,
        validator: newSchema,
        validationLevel: options.validationLevel || 'moderate',
        validationAction: options.validationAction || 'warn'
      });
      
      // Update schema registry
      this.schemaRegistry.set(collectionName, {
        version: options.version || `${parseFloat(currentSchemaInfo.version) + 0.1}`,
        schema: newSchema,
        createdAt: new Date(),
        description: options.description || 'Schema evolution',
        previousVersion: backupSchema
      });
      
      this.validationStats.schemaEvolutions++;
      
      console.log(`Schema evolved successfully for collection: ${collectionName}`);
      
      return {
        success: true,
        newVersion: this.schemaRegistry.get(collectionName).version,
        evolutionTimestamp: new Date()
      };
      
    } catch (error) {
      console.error(`Schema evolution failed for ${collectionName}:`, error);
      throw error;
    }
  }
}

// Example usage demonstrating comprehensive document validation
async function demonstrateAdvancedDocumentValidation() {
  const validationManager = new AdvancedDocumentValidationManager(db, {
    enableStrictValidation: true,
    enableValidationAnalytics: true,
    enableCustomValidators: true,
    detailedErrorReporting: true
  });

  try {
    // Test user profile validation
    const userProfile = {
      email: 'john.doe@example.com',
      username: 'johndoe123',
      firstName: 'John',
      lastName: 'Doe',
      contactInfo: {
        phoneNumber: '+1234567890',
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US'
        }
      },
      profileMetadata: {
        dateOfBirth: new Date('1990-01-15'),
        preferredLanguage: 'en-US',
        timezone: 'America/New_York',
        bio: 'Software developer passionate about technology',
        socialLinks: [
          {
            platform: 'github',
            url: 'https://github.com/johndoe',
            verified: true
          }
        ]
      },
      accountStatus: 'active',
      verification: {
        emailVerified: true,
        phoneVerified: false,
        verificationLevel: 'basic'
      },
      privacySettings: {
        profileVisibility: 'public',
        contactPermissions: {
          allowMessages: true,
          allowConnections: true
        }
      },
      security: {
        twoFactorEnabled: false,
        passwordLastChanged: new Date(),
        loginAttempts: 0
      },
      audit: {
        createdAt: new Date(),
        version: 1
      }
    };

    console.log('Validating user profile...');
    const profileValidation = await validationManager.validateDocument('userProfiles', userProfile);
    console.log('Profile validation result:', profileValidation);

    // Test user preferences validation
    const userPreferences = {
      userId: new ObjectId(),
      preferenceCategory: 'notification_settings',
      preferences: {
        emailFrequency: 'daily',
        pushEnabled: true,
        smsEnabled: false,
        categories: {
          security: true,
          social: true,
          marketing: false,
          system: true,
          updates: true
        },
        quietHours: {
          enabled: true,
          startTime: '22:00',
          endTime: '08:00',
          timezone: 'America/New_York'
        }
      },
      isActive: true,
      metadata: {
        source: 'user_input',
        deviceType: 'desktop',
        appVersion: '2.1.0'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('Validating user preferences...');
    const preferencesValidation = await validationManager.validateDocument('userPreferences', userPreferences);
    console.log('Preferences validation result:', preferencesValidation);

    // Get validation statistics
    const stats = await validationManager.getValidationStatistics();
    console.log('Validation statistics:', stats);

    return {
      profileValidation,
      preferencesValidation,
      validationStats: stats
    };

  } catch (error) {
    console.error('Document validation demonstration failed:', error);
    throw error;
  }
}

// Benefits of MongoDB Document Validation:
// - Flexible JSON Schema-based validation that evolves with application requirements
// - Comprehensive business rule validation with custom validator support
// - Context-aware validation rules that can adapt to different scenarios
// - Rich error reporting and validation analytics for operational insight
// - Schema versioning and evolution capabilities for production environments
// - Performance-optimized validation with caching and async processing options
// - Integration with MongoDB's native validation engine for optimal performance
// - SQL-compatible validation patterns through QueryLeaf integration

module.exports = {
  AdvancedDocumentValidationManager,
  demonstrateAdvancedDocumentValidation
};
```

## SQL-Style Document Validation with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB document validation and schema enforcement:

```sql
-- QueryLeaf document validation with SQL-familiar schema definition and constraint syntax

-- Create validation schema for user profiles with comprehensive constraints
CREATE VALIDATION SCHEMA user_profiles_schema AS (
  -- Core identity validation
  email VARCHAR(255) NOT NULL 
    PATTERN '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    UNIQUE CONSTRAINT 'email_already_exists',
  
  username VARCHAR(50) NOT NULL 
    PATTERN '^[a-zA-Z0-9_]{3,50}$'
    UNIQUE CONSTRAINT 'username_already_exists'
    CHECK username NOT IN ('admin', 'root', 'system', 'test'),
  
  first_name VARCHAR(100) NOT NULL 
    PATTERN '^[a-zA-ZÀ-ÿ\s\-\.'\']{1,100}$',
  
  last_name VARCHAR(100) NOT NULL 
    PATTERN '^[a-zA-ZÀ-ÿ\s\-\.'\']{1,100}$',
  
  -- Nested contact information validation
  contact_info JSON OBJECT (
    phone_number VARCHAR(20) 
      PATTERN '^\+?[1-9]\d{1,14}$'
      DESCRIPTION 'E.164 format phone number',
    
    address JSON OBJECT (
      street VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      postal_code VARCHAR(12) PATTERN '^[A-Z0-9\s-]{3,12}$',
      country ENUM('US', 'CA', 'GB', 'DE', 'FR', 'AU', 'JP', 'BR', 'IN', 'MX')
    ) ADDITIONAL_PROPERTIES false
  ),
  
  -- Profile metadata with complex validation
  profile_metadata JSON OBJECT (
    date_of_birth DATE CHECK date_of_birth < CURRENT_DATE,
    gender ENUM('male', 'female', 'non-binary', 'prefer_not_to_say'),
    preferred_language VARCHAR(10) PATTERN '^[a-z]{2}(-[A-Z]{2})?$',
    timezone VARCHAR(50) PATTERN '^[A-Za-z_]+/[A-Za-z_]+$|^UTC$',
    bio VARCHAR(2000),
    avatar_url VARCHAR(500) PATTERN '^https?://[\w\-._~:/?#[\]@!$&\'()*+,;=]+$',
    
    -- Array validation with nested objects
    social_links ARRAY OF JSON OBJECT (
      platform ENUM('twitter', 'linkedin', 'github', 'facebook', 'instagram', 'website'),
      url VARCHAR(500) PATTERN '^https?://[\w\-._~:/?#[\]@!$&\'()*+,;=]+$',
      verified BOOLEAN DEFAULT false
    ) MAX_ITEMS 10
  ),
  
  -- Account status with business logic
  account_status ENUM('active', 'inactive', 'suspended', 'pending_verification', 'deleted'),
  
  -- Verification status with interdependent validation
  verification JSON OBJECT (
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    identity_verified BOOLEAN DEFAULT false,
    verification_date TIMESTAMP,
    verification_level ENUM('none', 'basic', 'enhanced', 'premium')
  ),
  
  -- Privacy settings validation
  privacy_settings JSON OBJECT (
    profile_visibility ENUM('public', 'friends', 'private'),
    contact_permissions JSON OBJECT (
      allow_messages BOOLEAN DEFAULT true,
      allow_connections BOOLEAN DEFAULT true,
      allow_phone_contact BOOLEAN DEFAULT false,
      allow_email_contact BOOLEAN DEFAULT true
    ),
    data_sharing JSON OBJECT (
      marketing_consent BOOLEAN DEFAULT false,
      analytics_consent BOOLEAN DEFAULT true,
      third_party_sharing BOOLEAN DEFAULT false,
      personalized_ads BOOLEAN DEFAULT false
    )
  ),
  
  -- Security configuration with complex validation
  security JSON OBJECT (
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_method ENUM('sms', 'email', 'authenticator', 'hardware'),
    password_last_changed TIMESTAMP,
    login_attempts INTEGER MIN 0 MAX 10 DEFAULT 0,
    account_locked BOOLEAN DEFAULT false,
    lockout_expires TIMESTAMP
  ),
  
  -- Audit information with required fields
  audit JSON OBJECT NOT NULL (
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by OBJECTID,
    updated_by OBJECTID,
    version INTEGER MIN 1 DEFAULT 1,
    
    -- Change log with structured history
    change_log ARRAY OF JSON OBJECT (
      timestamp TIMESTAMP NOT NULL,
      action ENUM('created', 'updated', 'deleted', 'verified', 'suspended'),
      field VARCHAR(100),
      old_value VARCHAR(1000),
      new_value VARCHAR(1000),
      reason VARCHAR(500)
    ) MAX_ITEMS 100
  ),
  
  -- Cross-field validation constraints
  CONSTRAINT email_verification_consistency 
    CHECK (NOT verification.email_verified OR email IS NOT NULL),
  
  CONSTRAINT phone_verification_consistency 
    CHECK (NOT verification.phone_verified OR contact_info.phone_number IS NOT NULL),
  
  CONSTRAINT two_factor_requirements 
    CHECK (NOT security.two_factor_enabled OR 
           verification.email_verified = true OR 
           verification.phone_verified = true),
  
  CONSTRAINT account_lock_expiration 
    CHECK (NOT security.account_locked OR security.lockout_expires > CURRENT_TIMESTAMP),
  
  -- Business rule validation
  CONSTRAINT username_content_policy 
    CHECK (username NOT SIMILAR TO '.*(admin|root|system|test|null|undefined).*'),
  
  CONSTRAINT profile_completeness 
    CHECK (first_name IS NOT NULL AND 
           last_name IS NOT NULL AND 
           email IS NOT NULL AND 
           audit.version >= 1)
);

-- Apply validation schema to collection with configurable strictness
ALTER COLLECTION user_profiles 
SET VALIDATION SCHEMA user_profiles_schema
WITH (
  validation_level = 'strict',
  validation_action = 'error',
  enable_custom_validators = true,
  enable_business_rule_validation = true,
  validation_timeout_ms = 5000,
  detailed_error_reporting = true
);

-- Create conditional validation for user preferences based on category
CREATE VALIDATION SCHEMA user_preferences_schema AS (
  user_id OBJECTID NOT NULL REFERENCES user_profiles(_id),
  preference_category ENUM(
    'notification_settings',
    'display_preferences', 
    'privacy_settings',
    'content_preferences',
    'accessibility_options',
    'integration_settings',
    'security_preferences'
  ) NOT NULL,
  
  -- Conditional validation based on preference category
  preferences JSON OBJECT CONDITIONAL VALIDATION (
    WHEN preference_category = 'notification_settings' THEN 
      JSON OBJECT (
        email_frequency ENUM('immediate', 'hourly', 'daily', 'weekly', 'never') NOT NULL,
        push_enabled BOOLEAN NOT NULL,
        sms_enabled BOOLEAN DEFAULT false,
        categories JSON OBJECT (
          security BOOLEAN DEFAULT true,
          social BOOLEAN DEFAULT true,
          marketing BOOLEAN DEFAULT false,
          system BOOLEAN DEFAULT true,
          updates BOOLEAN DEFAULT true
        ),
        quiet_hours JSON OBJECT (
          enabled BOOLEAN DEFAULT false,
          start_time VARCHAR(5) PATTERN '^([01]?[0-9]|2[0-3]):[0-5][0-9]$',
          end_time VARCHAR(5) PATTERN '^([01]?[0-9]|2[0-3]):[0-5][0-9]$',
          timezone VARCHAR(50)
        )
      ),
    
    WHEN preference_category = 'display_preferences' THEN
      JSON OBJECT (
        theme ENUM('light', 'dark', 'auto', 'high_contrast') DEFAULT 'light',
        language VARCHAR(10) PATTERN '^[a-z]{2}(-[A-Z]{2})?$',
        date_format ENUM('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY'),
        time_format ENUM('12h', '24h') DEFAULT '12h',
        timezone VARCHAR(50) PATTERN '^[A-Za-z_]+/[A-Za-z_]+$|^UTC$',
        items_per_page INTEGER MIN 10 MAX 100 DEFAULT 25,
        font_size ENUM('small', 'medium', 'large', 'extra-large') DEFAULT 'medium'
      ),
    
    WHEN preference_category = 'privacy_settings' THEN
      JSON OBJECT (
        data_retention_period INTEGER MIN 30 MAX 2555 DEFAULT 365,
        automatic_deletion_enabled BOOLEAN DEFAULT false,
        third_party_integrations BOOLEAN DEFAULT false,
        data_export_format ENUM('json', 'csv', 'xml') DEFAULT 'json',
        activity_logging BOOLEAN DEFAULT true
      ),
    
    ELSE 
      JSON OBJECT ADDITIONAL_PROPERTIES true  -- Allow flexible structure for other categories
  ),
  
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMP,
  
  metadata JSON OBJECT (
    source ENUM('user_input', 'system_default', 'import', 'sync') DEFAULT 'user_input',
    device_type ENUM('desktop', 'mobile', 'tablet', 'api'),
    app_version VARCHAR(20) PATTERN '^\d+\.\d+\.\d+$',
    migration_version INTEGER DEFAULT 1
  ),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Complex cross-field validation
  CONSTRAINT notification_consistency 
    CHECK (preference_category != 'notification_settings' OR 
           (preferences.email_frequency IS NOT NULL AND preferences.push_enabled IS NOT NULL)),
  
  CONSTRAINT sync_timestamp_validation 
    CHECK (NOT is_active OR last_synced_at >= created_at),
  
  CONSTRAINT quiet_hours_logic 
    CHECK (preference_category != 'notification_settings' OR
           preferences.quiet_hours.enabled = false OR
           (preferences.quiet_hours.start_time IS NOT NULL AND 
            preferences.quiet_hours.end_time IS NOT NULL))
);

-- Apply conditional validation schema
ALTER COLLECTION user_preferences 
SET VALIDATION SCHEMA user_preferences_schema
WITH (
  validation_level = 'moderate',  -- Allow some flexibility
  validation_action = 'warn',     -- Don't block operations
  enable_conditional_validation = true
);

-- Complex validation for user connections with business logic
CREATE VALIDATION SCHEMA user_connections_schema AS (
  requester_user_id OBJECTID NOT NULL REFERENCES user_profiles(_id),
  requested_user_id OBJECTID NOT NULL REFERENCES user_profiles(_id),
  
  connection_type ENUM('friendship', 'professional', 'family', 'acquaintance', 'blocked', 'follow') NOT NULL,
  connection_status ENUM('pending', 'accepted', 'declined', 'blocked', 'expired', 'cancelled') NOT NULL,
  
  connection_metadata JSON OBJECT (
    message VARCHAR(500),
    tags ARRAY OF VARCHAR(50) MAX_ITEMS 10,
    context ENUM('work', 'school', 'mutual_friends', 'event', 'online', 'family', 'other'),
    priority INTEGER MIN 1 MAX 5 DEFAULT 3,
    is_close_friend BOOLEAN DEFAULT false,
    mutual_connections INTEGER MIN 0 DEFAULT 0
  ),
  
  timeline JSON OBJECT NOT NULL (
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,
    expires_at TIMESTAMP,
    last_interaction_at TIMESTAMP
  ),
  
  privacy JSON OBJECT (
    is_visible BOOLEAN DEFAULT true,
    share_with ENUM('public', 'friends', 'mutual_connections', 'private') DEFAULT 'friends',
    allow_notifications BOOLEAN DEFAULT true
  ),
  
  -- Complex business logic validation
  CONSTRAINT no_self_connection 
    CHECK (requester_user_id != requested_user_id),
  
  CONSTRAINT response_timing_logic 
    CHECK ((connection_status = 'pending' AND timeline.responded_at IS NULL) OR
           (connection_status != 'pending' AND timeline.responded_at IS NOT NULL)),
  
  CONSTRAINT expiration_logic 
    CHECK (timeline.expires_at IS NULL OR 
           timeline.expires_at > timeline.requested_at),
  
  CONSTRAINT interaction_timing 
    CHECK (timeline.last_interaction_at IS NULL OR 
           timeline.last_interaction_at >= timeline.requested_at),
  
  -- Unique constraint simulation
  CONSTRAINT unique_active_connection
    CHECK (NOT EXISTS (
      SELECT 1 FROM user_connections uc 
      WHERE uc.requester_user_id = requester_user_id 
      AND uc.requested_user_id = requested_user_id 
      AND uc.connection_type = connection_type
      AND uc.connection_status NOT IN ('declined', 'cancelled', 'expired')
      AND uc._id != _id
    ))
);

-- Advanced validation with custom business rules
CREATE CUSTOM VALIDATOR email_domain_validator(email VARCHAR) RETURNS VALIDATION_RESULT AS (
  DECLARE disposable_domains TEXT[] := ARRAY['tempmail.com', 'guerrillamail.com', '10minutemail.com', 'mailinator.com'];
  DECLARE email_domain TEXT := SPLIT_PART(email, '@', 2);
  
  IF email_domain = ANY(disposable_domains) THEN
    RETURN VALIDATION_ERROR('Disposable email addresses are not allowed');
  END IF;
  
  RETURN VALIDATION_SUCCESS();
);

CREATE CUSTOM VALIDATOR connection_limit_validator(user_id OBJECTID, connection_type VARCHAR) RETURNS VALIDATION_RESULT AS (
  DECLARE connection_count INTEGER;
  DECLARE max_connections INTEGER;
  
  -- Set limits based on connection type
  max_connections := CASE connection_type
    WHEN 'friendship' THEN 5000
    WHEN 'professional' THEN 10000
    WHEN 'follow' THEN 50000
    ELSE 1000
  END;
  
  -- Count existing connections
  SELECT COUNT(*) INTO connection_count
  FROM user_connections 
  WHERE requester_user_id = user_id 
  AND connection_type = connection_type 
  AND connection_status = 'accepted';
  
  IF connection_count >= max_connections THEN
    RETURN VALIDATION_ERROR('Maximum ' || connection_type || ' connections exceeded (' || max_connections || ')');
  END IF;
  
  RETURN VALIDATION_SUCCESS();
);

-- Apply custom validators to collections
ALTER COLLECTION user_profiles 
ADD CUSTOM VALIDATOR email_domain_validator(email);

ALTER COLLECTION user_connections 
ADD CUSTOM VALIDATOR connection_limit_validator(requester_user_id, connection_type);

-- Validation analytics and monitoring
WITH validation_performance AS (
  SELECT 
    collection_name,
    validation_schema_version,
    
    -- Validation success metrics
    COUNT(*) as total_validations,
    COUNT(*) FILTER (WHERE validation_result = 'success') as successful_validations,
    COUNT(*) FILTER (WHERE validation_result = 'error') as failed_validations,
    COUNT(*) FILTER (WHERE validation_result = 'warning') as warning_validations,
    
    -- Performance metrics
    AVG(validation_time_ms) as avg_validation_time,
    MAX(validation_time_ms) as max_validation_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY validation_time_ms) as p95_validation_time,
    
    -- Error analysis
    COUNT(DISTINCT error_type) as unique_error_types,
    array_agg(DISTINCT error_type) FILTER (WHERE error_type IS NOT NULL) as common_errors,
    
    -- Business impact metrics
    SUM(CASE WHEN validation_result = 'error' THEN 1 ELSE 0 END) as blocked_operations,
    ROUND(
      (COUNT(*) FILTER (WHERE validation_result = 'success') * 100.0 / COUNT(*)),
      2
    ) as validation_success_rate
    
  FROM validation_logs
  WHERE validation_timestamp >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY collection_name, validation_schema_version
),

schema_evolution_analysis AS (
  SELECT 
    collection_name,
    schema_version,
    schema_evolution_date,
    
    -- Schema complexity metrics
    json_array_length(schema_definition->'properties') as field_count,
    json_array_length(schema_definition->'constraints') as constraint_count,
    
    -- Evolution impact
    LAG(validation_success_rate) OVER (
      PARTITION BY collection_name 
      ORDER BY schema_evolution_date
    ) as previous_success_rate,
    
    validation_success_rate - LAG(validation_success_rate) OVER (
      PARTITION BY collection_name 
      ORDER BY schema_evolution_date
    ) as success_rate_change,
    
    -- Performance impact
    avg_validation_time - LAG(avg_validation_time) OVER (
      PARTITION BY collection_name 
      ORDER BY schema_evolution_date
    ) as validation_time_change
    
  FROM validation_performance vp
  JOIN schema_evolution_history seh ON vp.collection_name = seh.collection_name
),

validation_recommendations AS (
  SELECT 
    vp.collection_name,
    vp.validation_success_rate,
    vp.avg_validation_time,
    vp.common_errors,
    
    -- Performance assessment
    CASE 
      WHEN vp.validation_success_rate >= 95 THEN 'Excellent'
      WHEN vp.validation_success_rate >= 90 THEN 'Good'
      WHEN vp.validation_success_rate >= 80 THEN 'Fair'
      ELSE 'Needs Improvement'
    END as validation_quality,
    
    -- Optimization recommendations
    CASE 
      WHEN vp.avg_validation_time > 100 THEN 'Optimize validation performance - consider schema simplification'
      WHEN vp.blocked_operations > 100 THEN 'Review validation rules - high error rate impacting operations'
      WHEN array_length(vp.common_errors, 1) > 5 THEN 'Address common validation errors through improved data quality'
      WHEN vp.validation_success_rate < 90 THEN 'Review validation schema for overly restrictive rules'
      ELSE 'Validation configuration is well-optimized'
    END as primary_recommendation,
    
    -- Schema evolution guidance
    CASE 
      WHEN sea.success_rate_change < -5 THEN 'Recent schema changes negatively impacted validation success - consider rollback'
      WHEN sea.validation_time_change > 50 THEN 'Schema complexity increase affecting performance - optimize constraints'
      WHEN sea.success_rate_change > 10 THEN 'Schema evolution improved data quality significantly'
      ELSE 'Schema evolution impact within acceptable parameters'
    END as evolution_guidance,
    
    -- Operational insights
    JSON_OBJECT(
      'total_validations', vp.total_validations,
      'daily_average', ROUND(vp.total_validations / 30.0, 0),
      'error_rate', ROUND((vp.failed_validations * 100.0 / vp.total_validations), 2),
      'performance_rating', 
        CASE 
          WHEN vp.avg_validation_time <= 10 THEN 'Excellent'
          WHEN vp.avg_validation_time <= 50 THEN 'Good'
          WHEN vp.avg_validation_time <= 100 THEN 'Fair'
          ELSE 'Poor'
        END,
      'schema_complexity', 
        CASE 
          WHEN sea.field_count > 50 THEN 'High'
          WHEN sea.field_count > 20 THEN 'Medium'
          ELSE 'Low'
        END
    ) as operational_insights
    
  FROM validation_performance vp
  LEFT JOIN schema_evolution_analysis sea ON vp.collection_name = sea.collection_name
)

-- Comprehensive validation governance dashboard
SELECT 
  vr.collection_name,
  vr.validation_success_rate || '%' as success_rate,
  vr.validation_quality,
  vr.avg_validation_time || 'ms' as avg_response_time,
  
  -- Optimization guidance
  vr.primary_recommendation,
  vr.evolution_guidance,
  
  -- Error insights
  CASE 
    WHEN array_length(vr.common_errors, 1) > 0 THEN 
      array_to_string(array(SELECT UNNEST(vr.common_errors) LIMIT 3), ', ')
    ELSE 'No common errors'
  END as top_validation_errors,
  
  -- Operational metrics
  vr.operational_insights,
  
  -- Next actions
  CASE vr.validation_quality
    WHEN 'Needs Improvement' THEN 
      JSON_ARRAY(
        'Review and simplify overly restrictive validation rules',
        'Analyze common error patterns and improve data quality',
        'Consider implementing graduated validation levels',
        'Provide better validation error messages to users'
      )
    WHEN 'Fair' THEN 
      JSON_ARRAY(
        'Optimize validation performance for better response times',
        'Address top validation errors through improved input handling',
        'Consider conditional validation for optional fields'
      )
    ELSE 
      JSON_ARRAY('Monitor validation trends for early issue detection', 'Maintain current validation excellence')
  END as recommended_actions,
  
  -- Governance metrics
  JSON_OBJECT(
    'data_quality_score', vr.validation_success_rate,
    'schema_maintainability', 
      CASE 
        WHEN vr.operational_insights->>'schema_complexity' = 'High' THEN 'Review for simplification'
        WHEN vr.operational_insights->>'schema_complexity' = 'Medium' THEN 'Well-balanced'
        ELSE 'Simple and maintainable'
      END,
    'business_rule_coverage', 
      CASE 
        WHEN vr.validation_success_rate >= 95 THEN 'Comprehensive'
        WHEN vr.validation_success_rate >= 85 THEN 'Good'
        ELSE 'Incomplete'
      END,
    'operational_impact', 
      CASE 
        WHEN vr.operational_insights->>'performance_rating' IN ('Excellent', 'Good') THEN 'Minimal'
        WHEN vr.operational_insights->>'performance_rating' = 'Fair' THEN 'Moderate'
        ELSE 'Significant'
      END
  ) as governance_assessment

FROM validation_recommendations vr
ORDER BY 
  CASE vr.validation_quality
    WHEN 'Needs Improvement' THEN 1
    WHEN 'Fair' THEN 2
    WHEN 'Good' THEN 3
    ELSE 4
  END,
  vr.validation_success_rate ASC;

-- QueryLeaf provides comprehensive document validation capabilities:
-- 1. SQL-familiar schema definition syntax with JSON Schema integration
-- 2. Complex conditional validation based on document structure and business logic
-- 3. Custom validator functions with sophisticated business rule enforcement
-- 4. Comprehensive validation analytics and performance monitoring
-- 5. Schema evolution management with impact analysis and rollback capabilities
-- 6. Cross-field validation constraints with sophisticated dependency checking
-- 7. Flexible validation levels and actions for different operational requirements
-- 8. Rich error reporting and validation guidance for improved data quality
-- 9. Integration with MongoDB's native validation engine for optimal performance
-- 10. Enterprise-grade governance framework with compliance and audit support
```

## Best Practices for MongoDB Document Validation Implementation

### Schema Design and Governance Principles

Essential practices for implementing effective document validation in production environments:

1. **Schema Evolution Strategy**: Design validation schemas that can evolve gracefully with application requirements while maintaining data integrity
2. **Graduated Validation Levels**: Implement different validation strictness levels for development, staging, and production environments  
3. **Business Rule Integration**: Embed critical business logic into validation rules while maintaining flexibility for edge cases
4. **Performance Optimization**: Balance comprehensive validation with performance requirements through selective field validation
5. **Error Message Quality**: Provide clear, actionable error messages that help developers and users understand validation failures
6. **Conditional Validation**: Use conditional validation rules that adapt based on document context and user roles

### Operational Excellence and Monitoring

Optimize document validation for enterprise-scale deployments:

1. **Validation Analytics**: Implement comprehensive monitoring of validation performance, success rates, and error patterns
2. **Schema Versioning**: Maintain proper schema versioning with rollback capabilities for production safety
3. **Custom Validator Management**: Develop reusable custom validators that can be shared across multiple collections
4. **Integration Testing**: Create comprehensive test suites that validate schema changes against real-world data patterns
5. **Documentation Standards**: Maintain clear documentation of validation rules and business logic for team collaboration
6. **Compliance Integration**: Ensure validation rules support regulatory compliance requirements and audit trails

## Conclusion

MongoDB document validation provides comprehensive schema enforcement capabilities that balance data integrity requirements with the flexibility benefits of document-oriented storage. The JSON Schema-based validation system enables sophisticated business rule enforcement while allowing schemas to evolve gracefully as applications grow and change, eliminating the rigid constraints and expensive migration procedures associated with traditional relational database schemas.

Key MongoDB document validation benefits include:

- **Flexible Schema Evolution**: JSON Schema-based validation that adapts to changing requirements without expensive migrations
- **Rich Business Logic**: Comprehensive validation rules that enforce complex business requirements and cross-field dependencies
- **Performance Optimization**: Native MongoDB integration with intelligent validation processing and caching capabilities
- **Custom Validation**: Extensible custom validator framework for specialized business rule enforcement
- **Operational Excellence**: Comprehensive analytics, monitoring, and schema governance capabilities for production environments  
- **SQL Accessibility**: Familiar validation syntax through QueryLeaf for accessible enterprise schema management

Whether you're building user management systems, content management platforms, e-commerce applications, or any system requiring robust data integrity, MongoDB document validation with QueryLeaf's familiar SQL interface provides the foundation for maintainable, scalable, and compliant data validation solutions.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL-style validation schemas into MongoDB's native JSON Schema format while providing familiar constraint syntax for complex business rule enforcement. Advanced validation patterns, custom validators, and schema evolution capabilities are seamlessly accessible through SQL constructs, making sophisticated document validation both powerful and approachable for SQL-oriented development teams.

The combination of MongoDB's flexible validation capabilities with SQL-style schema definition makes it an ideal platform for applications requiring both robust data integrity and agile schema management, ensuring your validation rules can evolve with your business while maintaining data quality and compliance standards.