---
title: "MongoDB Document Validation and Schema Enforcement: Building Data Integrity with Flexible Schema Design and SQL-Style Constraints"
description: "Master MongoDB document validation for data integrity and schema enforcement. Learn validation rules, constraint patterns, and SQL-familiar schema management for reliable document databases with flexible data models."
date: 2025-09-27
tags: [mongodb, validation, schema, data-integrity, constraints, sql, document-database]
---

# MongoDB Document Validation and Schema Enforcement: Building Data Integrity with Flexible Schema Design and SQL-Style Constraints

Modern applications require the flexibility of document databases while maintaining data integrity and consistency that traditional relational systems provide through rigid schemas and constraints. MongoDB's document validation system bridges this gap by offering configurable schema enforcement that adapts to evolving business requirements without sacrificing data quality.

MongoDB Document Validation provides rule-based data validation that can enforce structure, data types, value ranges, and business logic constraints at the database level. Unlike rigid relational schemas that require expensive migrations for changes, MongoDB validation rules can evolve incrementally, supporting both strict schema enforcement and flexible document structures within the same database.

## The Traditional Schema Rigidity Challenge

Conventional relational database approaches impose inflexible schema constraints that become obstacles to application evolution:

```sql
-- Traditional PostgreSQL schema with rigid constraints and migration challenges

-- User table with fixed schema structure
CREATE TABLE users (
  user_id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  birth_date DATE,
  phone_number VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Rigid constraints that are difficult to modify
  CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  CONSTRAINT users_phone_format CHECK (phone_number ~* '^\+?[1-9]\d{1,14}$'),
  CONSTRAINT users_birth_date_range CHECK (birth_date >= '1900-01-01' AND birth_date <= CURRENT_DATE),
  CONSTRAINT users_name_length CHECK (LENGTH(first_name) >= 2 AND LENGTH(last_name) >= 2)
);

-- User profile table with limited JSON support
CREATE TABLE user_profiles (
  profile_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  bio TEXT,
  avatar_url VARCHAR(500),
  social_links JSONB,
  preferences JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Limited JSON validation capabilities
  CONSTRAINT profile_bio_length CHECK (LENGTH(bio) <= 1000),
  CONSTRAINT profile_avatar_url_format CHECK (avatar_url ~* '^https?://.*'),
  CONSTRAINT profile_social_links_structure CHECK (
    social_links IS NULL OR (
      jsonb_typeof(social_links) = 'object' AND
      jsonb_array_length(jsonb_object_keys(social_links)) <= 10
    )
  )
);

-- User settings table with enum constraints
CREATE TYPE notification_frequency AS ENUM ('immediate', 'hourly', 'daily', 'weekly', 'never');
CREATE TYPE privacy_level AS ENUM ('public', 'friends', 'private');
CREATE TYPE theme_preference AS ENUM ('light', 'dark', 'auto');

CREATE TABLE user_settings (
  setting_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  email_notifications notification_frequency DEFAULT 'daily',
  push_notifications notification_frequency DEFAULT 'immediate',
  privacy_level privacy_level DEFAULT 'friends',
  theme theme_preference DEFAULT 'auto',
  language_code VARCHAR(5) DEFAULT 'en-US',
  timezone VARCHAR(50) DEFAULT 'UTC',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Rigid enum constraints that require schema changes
  CONSTRAINT settings_language_format CHECK (language_code ~* '^[a-z]{2}(-[A-Z]{2})?$'),
  CONSTRAINT settings_timezone_valid CHECK (timezone IN (
    SELECT name FROM pg_timezone_names WHERE name NOT LIKE '%/%/%'
  ))
);

-- Complex data insertion with rigid validation
INSERT INTO users (
  email, username, password_hash, first_name, last_name, birth_date, phone_number
) VALUES (
  'john.doe@example.com',
  'johndoe123',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBxJzybKlJNcX.',
  'John',
  'Doe', 
  '1990-05-15',
  '+1-555-123-4567'
);

-- Profile insertion with limited JSON flexibility
INSERT INTO user_profiles (
  user_id, bio, avatar_url, social_links, preferences, metadata
) VALUES (
  1,
  'Software engineer passionate about technology and innovation.',
  'https://example.com/avatars/johndoe.jpg',
  '{"twitter": "@johndoe", "linkedin": "john-doe-dev", "github": "johndoe"}',
  '{"newsletter": true, "marketing_emails": false, "beta_features": true}',
  '{"account_type": "premium", "registration_source": "web", "referral_code": "FRIEND123"}'
);

-- Settings insertion with enum constraints
INSERT INTO user_settings (
  user_id, email_notifications, push_notifications, privacy_level, theme, language_code, timezone
) VALUES (
  1, 'daily', 'immediate', 'friends', 'dark', 'en-US', 'America/New_York'
);

-- Complex query with multiple table joins and JSON operations
WITH user_analysis AS (
  SELECT 
    u.user_id,
    u.email,
    u.username,
    u.first_name,
    u.last_name,
    u.created_at as registration_date,
    
    -- Profile information with JSON extraction
    up.bio,
    up.avatar_url,
    jsonb_extract_path_text(up.social_links, 'twitter') as twitter_handle,
    jsonb_extract_path_text(up.social_links, 'github') as github_username,
    
    -- Preferences with type casting
    CAST(jsonb_extract_path_text(up.preferences, 'newsletter') AS BOOLEAN) as newsletter_subscription,
    CAST(jsonb_extract_path_text(up.preferences, 'beta_features') AS BOOLEAN) as beta_participant,
    
    -- Metadata extraction
    jsonb_extract_path_text(up.metadata, 'account_type') as account_type,
    jsonb_extract_path_text(up.metadata, 'registration_source') as registration_source,
    
    -- Settings information
    us.email_notifications,
    us.push_notifications,
    us.privacy_level,
    us.theme,
    us.language_code,
    us.timezone,
    
    -- Calculated fields
    EXTRACT(YEAR FROM AGE(u.birth_date)) as age,
    EXTRACT(DAYS FROM (NOW() - u.created_at)) as days_since_registration,
    
    -- JSON array processing for social links
    jsonb_array_length(jsonb_object_keys(COALESCE(up.social_links, '{}'::jsonb))) as social_link_count,
    
    -- Complex JSON validation checking
    CASE 
      WHEN up.preferences IS NULL THEN 'incomplete'
      WHEN jsonb_typeof(up.preferences) != 'object' THEN 'invalid'
      WHEN NOT up.preferences ? 'newsletter' THEN 'missing_required'
      ELSE 'valid'
    END as preferences_status
    
  FROM users u
  LEFT JOIN user_profiles up ON u.user_id = up.user_id
  LEFT JOIN user_settings us ON u.user_id = us.user_id
  WHERE u.created_at >= NOW() - INTERVAL '1 year'
)

SELECT 
  user_id,
  email,
  username,
  first_name || ' ' || last_name as full_name,
  registration_date,
  bio,
  twitter_handle,
  github_username,
  account_type,
  registration_source,
  age,
  days_since_registration,
  
  -- User categorization based on engagement
  CASE 
    WHEN beta_participant AND newsletter_subscription THEN 'highly_engaged'
    WHEN newsletter_subscription OR social_link_count > 2 THEN 'moderately_engaged' 
    WHEN days_since_registration < 30 THEN 'new_user'
    ELSE 'basic_user'
  END as engagement_level,
  
  -- Notification preference summary
  CASE 
    WHEN email_notifications = 'immediate' AND push_notifications = 'immediate' THEN 'high_frequency'
    WHEN email_notifications IN ('daily', 'hourly') OR push_notifications IN ('daily', 'hourly') THEN 'moderate_frequency'
    ELSE 'low_frequency'
  END as notification_preference,
  
  -- Data completeness assessment
  CASE 
    WHEN bio IS NOT NULL AND avatar_url IS NOT NULL AND social_link_count > 0 THEN 'complete'
    WHEN bio IS NOT NULL OR avatar_url IS NOT NULL THEN 'partial'
    ELSE 'minimal'
  END as profile_completeness,
  
  preferences_status

FROM user_analysis
WHERE preferences_status = 'valid'
ORDER BY 
  CASE engagement_level
    WHEN 'highly_engaged' THEN 1
    WHEN 'moderately_engaged' THEN 2  
    WHEN 'new_user' THEN 3
    ELSE 4
  END,
  days_since_registration DESC;

-- Schema evolution challenges with traditional approaches:
-- 1. Adding new fields requires ALTER TABLE statements with potential downtime
-- 2. Changing data types requires complex migrations and data conversion
-- 3. Enum modifications require dropping and recreating types
-- 4. JSON structure changes are difficult to validate and enforce
-- 5. Cross-table constraints become complex to maintain
-- 6. Schema changes require coordinated application deployments
-- 7. Rollback of schema changes is complex and often impossible
-- 8. Performance impact during large table alterations
-- 9. Limited flexibility for storing varying document structures
-- 10. Complex validation logic requires triggers or application-level enforcement

-- MySQL approach with even more limitations
CREATE TABLE mysql_users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  profile_data JSON,
  settings JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Basic JSON validation (limited in older versions)
  CONSTRAINT email_format CHECK (email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
);

-- Simple query with limited JSON capabilities
SELECT 
  id,
  email,
  username,
  JSON_EXTRACT(profile_data, '$.first_name') as first_name,
  JSON_EXTRACT(profile_data, '$.last_name') as last_name,
  JSON_EXTRACT(settings, '$.theme') as theme_preference
FROM mysql_users
WHERE JSON_EXTRACT(profile_data, '$.account_type') = 'premium';

-- MySQL limitations:
-- - Very limited JSON validation and constraint capabilities
-- - Basic JSON functions with poor performance on large datasets
-- - No sophisticated document structure validation
-- - Minimal support for nested object validation
-- - Limited flexibility for evolving JSON schemas
-- - Poor indexing support for JSON fields
-- - Basic constraint checking without complex business logic
```

MongoDB Document Validation provides flexible, powerful schema enforcement:

```javascript
// MongoDB Document Validation - flexible schema enforcement with powerful validation rules
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('user_management_platform');

// Comprehensive document validation and schema management system
class MongoDBValidationManager {
  constructor(db) {
    this.db = db;
    this.collections = new Map();
    this.validationRules = new Map();
    this.migrationHistory = [];
  }

  async initializeCollectionsWithValidation() {
    console.log('Initializing collections with comprehensive document validation...');
    
    // Create users collection with sophisticated validation rules
    try {
      await this.db.createCollection('users', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['email', 'username', 'password_hash', 'profile', 'created_at'],
            additionalProperties: false,
            properties: {
              _id: {
                bsonType: 'objectId'
              },
              
              // Core identity fields with validation
              email: {
                bsonType: 'string',
                pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
                description: 'Valid email address required'
              },
              
              username: {
                bsonType: 'string',
                minLength: 3,
                maxLength: 30,
                pattern: '^[a-zA-Z0-9_-]+$',
                description: 'Username must be 3-30 characters, alphanumeric with underscore/dash'
              },
              
              password_hash: {
                bsonType: 'string',
                minLength: 60,
                maxLength: 60,
                description: 'BCrypt hash must be exactly 60 characters'
              },
              
              // Nested profile object with detailed validation
              profile: {
                bsonType: 'object',
                required: ['first_name', 'last_name'],
                additionalProperties: true,
                properties: {
                  first_name: {
                    bsonType: 'string',
                    minLength: 1,
                    maxLength: 100,
                    description: 'First name is required'
                  },
                  
                  last_name: {
                    bsonType: 'string',
                    minLength: 1,
                    maxLength: 100,
                    description: 'Last name is required'
                  },
                  
                  middle_name: {
                    bsonType: ['string', 'null'],
                    maxLength: 100
                  },
                  
                  birth_date: {
                    bsonType: 'date',
                    description: 'Birth date must be a valid date'
                  },
                  
                  phone_number: {
                    bsonType: ['string', 'null'],
                    pattern: '^\\+?[1-9]\\d{1,14}$',
                    description: 'Valid international phone number format'
                  },
                  
                  bio: {
                    bsonType: ['string', 'null'],
                    maxLength: 1000,
                    description: 'Bio must not exceed 1000 characters'
                  },
                  
                  avatar_url: {
                    bsonType: ['string', 'null'],
                    pattern: '^https?://.*\\.(jpg|jpeg|png|gif|webp)$',
                    description: 'Avatar must be a valid image URL'
                  },
                  
                  // Social links with nested validation
                  social_links: {
                    bsonType: ['object', 'null'],
                    additionalProperties: false,
                    properties: {
                      twitter: {
                        bsonType: 'string',
                        pattern: '^@?[a-zA-Z0-9_]{1,15}$'
                      },
                      linkedin: {
                        bsonType: 'string',
                        pattern: '^[a-zA-Z0-9-]{3,100}$'
                      },
                      github: {
                        bsonType: 'string',
                        pattern: '^[a-zA-Z0-9-]{1,39}$'
                      },
                      website: {
                        bsonType: 'string',
                        pattern: '^https?://[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}.*$'
                      },
                      instagram: {
                        bsonType: 'string',
                        pattern: '^@?[a-zA-Z0-9_.]{1,30}$'
                      }
                    }
                  },
                  
                  // Address with geolocation support
                  address: {
                    bsonType: ['object', 'null'],
                    properties: {
                      street: { bsonType: 'string', maxLength: 200 },
                      city: { bsonType: 'string', maxLength: 100 },
                      state: { bsonType: 'string', maxLength: 100 },
                      postal_code: { bsonType: 'string', maxLength: 20 },
                      country: { bsonType: 'string', maxLength: 100 },
                      coordinates: {
                        bsonType: 'object',
                        properties: {
                          type: { enum: ['Point'] },
                          coordinates: {
                            bsonType: 'array',
                            minItems: 2,
                            maxItems: 2,
                            items: { bsonType: 'number' }
                          }
                        }
                      }
                    }
                  }
                }
              },
              
              // User preferences with detailed validation
              preferences: {
                bsonType: 'object',
                additionalProperties: true,
                properties: {
                  notifications: {
                    bsonType: 'object',
                    properties: {
                      email: {
                        bsonType: 'object',
                        properties: {
                          marketing: { bsonType: 'bool' },
                          security: { bsonType: 'bool' },
                          product_updates: { bsonType: 'bool' },
                          frequency: { enum: ['immediate', 'daily', 'weekly', 'never'] }
                        }
                      },
                      push: {
                        bsonType: 'object',
                        properties: {
                          enabled: { bsonType: 'bool' },
                          sound: { bsonType: 'bool' },
                          vibration: { bsonType: 'bool' },
                          frequency: { enum: ['immediate', 'hourly', 'daily', 'never'] }
                        }
                      }
                    }
                  },
                  
                  privacy: {
                    bsonType: 'object',
                    properties: {
                      profile_visibility: { enum: ['public', 'friends', 'private'] },
                      search_visibility: { bsonType: 'bool' },
                      activity_status: { bsonType: 'bool' },
                      data_collection: { bsonType: 'bool' }
                    }
                  },
                  
                  interface: {
                    bsonType: 'object',
                    properties: {
                      theme: { enum: ['light', 'dark', 'auto'] },
                      language: {
                        bsonType: 'string',
                        pattern: '^[a-z]{2}(-[A-Z]{2})?$'
                      },
                      timezone: {
                        bsonType: 'string',
                        description: 'Valid IANA timezone'
                      },
                      date_format: { enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] },
                      time_format: { enum: ['12h', '24h'] }
                    }
                  }
                }
              },
              
              // Account status and metadata
              account: {
                bsonType: 'object',
                required: ['status', 'type', 'verification'],
                properties: {
                  status: { enum: ['active', 'inactive', 'suspended', 'pending'] },
                  type: { enum: ['free', 'premium', 'enterprise', 'admin'] },
                  subscription_expires_at: { bsonType: ['date', 'null'] },
                  
                  verification: {
                    bsonType: 'object',
                    properties: {
                      email_verified: { bsonType: 'bool' },
                      email_verified_at: { bsonType: ['date', 'null'] },
                      phone_verified: { bsonType: 'bool' },
                      phone_verified_at: { bsonType: ['date', 'null'] },
                      identity_verified: { bsonType: 'bool' },
                      identity_verified_at: { bsonType: ['date', 'null'] },
                      verification_level: { enum: ['none', 'email', 'phone', 'identity', 'full'] }
                    }
                  },
                  
                  security: {
                    bsonType: 'object',
                    properties: {
                      two_factor_enabled: { bsonType: 'bool' },
                      two_factor_method: { enum: ['none', 'sms', 'app', 'email'] },
                      password_changed_at: { bsonType: 'date' },
                      last_password_reset: { bsonType: ['date', 'null'] },
                      failed_login_attempts: { bsonType: 'int', minimum: 0, maximum: 10 },
                      account_locked_until: { bsonType: ['date', 'null'] }
                    }
                  }
                }
              },
              
              // Activity tracking
              activity: {
                bsonType: 'object',
                properties: {
                  last_login_at: { bsonType: ['date', 'null'] },
                  last_activity_at: { bsonType: ['date', 'null'] },
                  login_count: { bsonType: 'int', minimum: 0 },
                  session_count: { bsonType: 'int', minimum: 0 },
                  ip_address: {
                    bsonType: ['string', 'null'],
                    pattern: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$'
                  },
                  user_agent: { bsonType: ['string', 'null'], maxLength: 500 }
                }
              },
              
              // Flexible metadata for application-specific data
              metadata: {
                bsonType: ['object', 'null'],
                additionalProperties: true,
                properties: {
                  registration_source: {
                    enum: ['web', 'mobile_app', 'api', 'admin', 'import', 'social_oauth']
                  },
                  referral_code: {
                    bsonType: ['string', 'null'],
                    pattern: '^[A-Z0-9]{6,12}$'
                  },
                  campaign_id: { bsonType: ['string', 'null'] },
                  utm_source: { bsonType: ['string', 'null'] },
                  utm_medium: { bsonType: ['string', 'null'] },
                  utm_campaign: { bsonType: ['string', 'null'] },
                  affiliate_id: { bsonType: ['string', 'null'] }
                }
              },
              
              // Audit timestamps
              created_at: {
                bsonType: 'date',
                description: 'Account creation timestamp required'
              },
              
              updated_at: {
                bsonType: 'date',
                description: 'Last update timestamp'
              },
              
              deleted_at: {
                bsonType: ['date', 'null'],
                description: 'Soft delete timestamp'
              }
            }
          }
        },
        validationLevel: 'strict',
        validationAction: 'error'
      });
      
      console.log('Created users collection with comprehensive validation');
      this.collections.set('users', this.db.collection('users'));
      
    } catch (error) {
      if (error.code !== 48) { // Collection already exists
        throw error;
      }
      console.log('Users collection already exists');
      this.collections.set('users', this.db.collection('users'));
    }

    // Create additional collections with validation
    await this.createSessionsCollection();
    await this.createAuditLogCollection();
    await this.createNotificationsCollection();
    
    // Create indexes optimized for validation and queries
    await this.createOptimizedIndexes();
    
    return Array.from(this.collections.keys());
  }

  async createSessionsCollection() {
    try {
      await this.db.createCollection('user_sessions', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['user_id', 'session_token', 'created_at', 'expires_at', 'is_active'],
            properties: {
              _id: { bsonType: 'objectId' },
              
              user_id: {
                bsonType: 'objectId',
                description: 'Reference to user document'
              },
              
              session_token: {
                bsonType: 'string',
                minLength: 32,
                maxLength: 128,
                description: 'Secure session token'
              },
              
              refresh_token: {
                bsonType: ['string', 'null'],
                minLength: 32,
                maxLength: 128
              },
              
              device_info: {
                bsonType: 'object',
                properties: {
                  device_type: { enum: ['desktop', 'mobile', 'tablet', 'unknown'] },
                  browser: { bsonType: 'string', maxLength: 100 },
                  os: { bsonType: 'string', maxLength: 100 },
                  ip_address: { bsonType: 'string' },
                  user_agent: { bsonType: 'string', maxLength: 500 }
                }
              },
              
              location: {
                bsonType: ['object', 'null'],
                properties: {
                  country: { bsonType: 'string', maxLength: 100 },
                  region: { bsonType: 'string', maxLength: 100 },
                  city: { bsonType: 'string', maxLength: 100 },
                  coordinates: {
                    bsonType: 'array',
                    minItems: 2,
                    maxItems: 2,
                    items: { bsonType: 'number' }
                  }
                }
              },
              
              is_active: { bsonType: 'bool' },
              
              created_at: { bsonType: 'date' },
              updated_at: { bsonType: 'date' },
              expires_at: { bsonType: 'date' },
              last_activity_at: { bsonType: ['date', 'null'] }
            }
          }
        },
        validationLevel: 'strict'
      });
      
      // Create TTL index for automatic session cleanup
      await this.db.collection('user_sessions').createIndex(
        { expires_at: 1 }, 
        { expireAfterSeconds: 0 }
      );
      
      this.collections.set('user_sessions', this.db.collection('user_sessions'));
      console.log('Created user_sessions collection with validation');
      
    } catch (error) {
      if (error.code !== 48) throw error;
      this.collections.set('user_sessions', this.db.collection('user_sessions'));
    }
  }

  async createAuditLogCollection() {
    try {
      await this.db.createCollection('audit_log', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['user_id', 'action', 'resource_type', 'timestamp'],
            properties: {
              _id: { bsonType: 'objectId' },
              
              user_id: {
                bsonType: ['objectId', 'null'],
                description: 'User who performed the action'
              },
              
              action: {
                enum: [
                  'create', 'read', 'update', 'delete',
                  'login', 'logout', 'password_change', 'email_change',
                  'profile_update', 'settings_change', 'verification',
                  'admin_action', 'api_access', 'export_data'
                ],
                description: 'Type of action performed'
              },
              
              resource_type: {
                bsonType: 'string',
                maxLength: 100,
                description: 'Type of resource affected'
              },
              
              resource_id: {
                bsonType: ['string', 'objectId', 'null'],
                description: 'ID of the affected resource'
              },
              
              details: {
                bsonType: ['object', 'null'],
                additionalProperties: true,
                description: 'Additional action details'
              },
              
              changes: {
                bsonType: ['object', 'null'],
                properties: {
                  before: { bsonType: ['object', 'null'] },
                  after: { bsonType: ['object', 'null'] },
                  fields_changed: {
                    bsonType: 'array',
                    items: { bsonType: 'string' }
                  }
                }
              },
              
              request_info: {
                bsonType: ['object', 'null'],
                properties: {
                  ip_address: { bsonType: 'string' },
                  user_agent: { bsonType: 'string', maxLength: 500 },
                  method: { enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
                  endpoint: { bsonType: 'string', maxLength: 200 },
                  session_id: { bsonType: ['string', 'null'] }
                }
              },
              
              result: {
                bsonType: 'object',
                properties: {
                  success: { bsonType: 'bool' },
                  error_message: { bsonType: ['string', 'null'] },
                  error_code: { bsonType: ['string', 'null'] },
                  duration_ms: { bsonType: 'int', minimum: 0 }
                }
              },
              
              timestamp: { bsonType: 'date' }
            }
          }
        }
      });
      
      this.collections.set('audit_log', this.db.collection('audit_log'));
      console.log('Created audit_log collection with validation');
      
    } catch (error) {
      if (error.code !== 48) throw error;
      this.collections.set('audit_log', this.db.collection('audit_log'));
    }
  }

  async createNotificationsCollection() {
    try {
      await this.db.createCollection('notifications', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['user_id', 'type', 'title', 'content', 'status', 'created_at'],
            properties: {
              _id: { bsonType: 'objectId' },
              
              user_id: {
                bsonType: 'objectId',
                description: 'Target user for notification'
              },
              
              type: {
                enum: [
                  'security_alert', 'account_update', 'welcome', 'verification',
                  'password_reset', 'login_alert', 'subscription', 'feature_announcement',
                  'maintenance', 'privacy_update', 'marketing', 'system'
                ],
                description: 'Notification category'
              },
              
              priority: {
                enum: ['low', 'normal', 'high', 'urgent'],
                description: 'Notification priority level'
              },
              
              title: {
                bsonType: 'string',
                minLength: 1,
                maxLength: 200,
                description: 'Notification title'
              },
              
              content: {
                bsonType: 'string',
                minLength: 1,
                maxLength: 2000,
                description: 'Notification message content'
              },
              
              action: {
                bsonType: ['object', 'null'],
                properties: {
                  label: { bsonType: 'string', maxLength: 50 },
                  url: { bsonType: 'string', maxLength: 500 },
                  action_type: { enum: ['link', 'button', 'dismiss', 'confirm'] }
                }
              },
              
              channels: {
                bsonType: 'array',
                items: {
                  enum: ['email', 'push', 'in_app', 'sms', 'webhook']
                },
                description: 'Delivery channels for notification'
              },
              
              delivery: {
                bsonType: 'object',
                properties: {
                  email: {
                    bsonType: ['object', 'null'],
                    properties: {
                      sent_at: { bsonType: ['date', 'null'] },
                      delivered_at: { bsonType: ['date', 'null'] },
                      opened_at: { bsonType: ['date', 'null'] },
                      clicked_at: { bsonType: ['date', 'null'] },
                      bounced: { bsonType: 'bool' },
                      error_message: { bsonType: ['string', 'null'] }
                    }
                  },
                  push: {
                    bsonType: ['object', 'null'],
                    properties: {
                      sent_at: { bsonType: ['date', 'null'] },
                      delivered_at: { bsonType: ['date', 'null'] },
                      clicked_at: { bsonType: ['date', 'null'] },
                      error_message: { bsonType: ['string', 'null'] }
                    }
                  },
                  in_app: {
                    bsonType: ['object', 'null'],
                    properties: {
                      shown_at: { bsonType: ['date', 'null'] },
                      clicked_at: { bsonType: ['date', 'null'] },
                      dismissed_at: { bsonType: ['date', 'null'] }
                    }
                  }
                }
              },
              
              status: {
                enum: ['pending', 'sent', 'delivered', 'read', 'dismissed', 'failed'],
                description: 'Current notification status'
              },
              
              metadata: {
                bsonType: ['object', 'null'],
                additionalProperties: true,
                description: 'Additional notification metadata'
              },
              
              expires_at: {
                bsonType: ['date', 'null'],
                description: 'Notification expiration date'
              },
              
              created_at: { bsonType: 'date' },
              updated_at: { bsonType: 'date' }
            }
          }
        }
      });
      
      this.collections.set('notifications', this.db.collection('notifications'));
      console.log('Created notifications collection with validation');
      
    } catch (error) {
      if (error.code !== 48) throw error;
      this.collections.set('notifications', this.db.collection('notifications'));
    }
  }

  async createOptimizedIndexes() {
    console.log('Creating optimized indexes for validated collections...');
    
    const users = this.collections.get('users');
    const sessions = this.collections.get('user_sessions');
    const audit = this.collections.get('audit_log');
    const notifications = this.collections.get('notifications');

    // User collection indexes
    const userIndexes = [
      { email: 1 },
      { username: 1 },
      { 'account.status': 1 },
      { 'account.type': 1 },
      { created_at: -1 },
      { 'activity.last_login_at': -1 },
      { 'profile.phone_number': 1 },
      { 'account.verification.email_verified': 1 },
      { 'metadata.registration_source': 1 },
      
      // Compound indexes for common queries
      { 'account.status': 1, 'account.type': 1 },
      { 'account.type': 1, created_at: -1 },
      { 'account.verification.verification_level': 1, created_at: -1 }
    ];

    for (const indexSpec of userIndexes) {
      try {
        await users.createIndex(indexSpec, { background: true });
      } catch (error) {
        console.warn('Index creation warning:', error.message);
      }
    }

    // Session collection indexes
    await sessions.createIndex({ user_id: 1, is_active: 1 }, { background: true });
    await sessions.createIndex({ session_token: 1 }, { unique: true, background: true });
    await sessions.createIndex({ created_at: -1 }, { background: true });

    // Audit log indexes
    await audit.createIndex({ user_id: 1, timestamp: -1 }, { background: true });
    await audit.createIndex({ action: 1, timestamp: -1 }, { background: true });
    await audit.createIndex({ resource_type: 1, resource_id: 1 }, { background: true });

    // Notification indexes
    await notifications.createIndex({ user_id: 1, status: 1 }, { background: true });
    await notifications.createIndex({ type: 1, created_at: -1 }, { background: true });
    await notifications.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

    console.log('Optimized indexes created successfully');
  }

  async insertValidatedUserData(userData) {
    console.log('Inserting user data with comprehensive validation...');
    
    const users = this.collections.get('users');
    const currentTime = new Date();
    
    // Prepare validated user document
    const validatedUser = {
      email: userData.email,
      username: userData.username,
      password_hash: userData.password_hash,
      
      profile: {
        first_name: userData.profile.first_name,
        last_name: userData.profile.last_name,
        middle_name: userData.profile.middle_name || null,
        birth_date: userData.profile.birth_date ? new Date(userData.profile.birth_date) : null,
        phone_number: userData.profile.phone_number || null,
        bio: userData.profile.bio || null,
        avatar_url: userData.profile.avatar_url || null,
        
        social_links: userData.profile.social_links || null,
        
        address: userData.profile.address ? {
          street: userData.profile.address.street,
          city: userData.profile.address.city,
          state: userData.profile.address.state,
          postal_code: userData.profile.address.postal_code,
          country: userData.profile.address.country,
          coordinates: userData.profile.address.coordinates ? {
            type: 'Point',
            coordinates: userData.profile.address.coordinates
          } : null
        } : null
      },
      
      preferences: {
        notifications: {
          email: {
            marketing: userData.preferences?.notifications?.email?.marketing ?? false,
            security: userData.preferences?.notifications?.email?.security ?? true,
            product_updates: userData.preferences?.notifications?.email?.product_updates ?? true,
            frequency: userData.preferences?.notifications?.email?.frequency || 'daily'
          },
          push: {
            enabled: userData.preferences?.notifications?.push?.enabled ?? true,
            sound: userData.preferences?.notifications?.push?.sound ?? true,
            vibration: userData.preferences?.notifications?.push?.vibration ?? true,
            frequency: userData.preferences?.notifications?.push?.frequency || 'immediate'
          }
        },
        
        privacy: {
          profile_visibility: userData.preferences?.privacy?.profile_visibility || 'friends',
          search_visibility: userData.preferences?.privacy?.search_visibility ?? true,
          activity_status: userData.preferences?.privacy?.activity_status ?? true,
          data_collection: userData.preferences?.privacy?.data_collection ?? true
        },
        
        interface: {
          theme: userData.preferences?.interface?.theme || 'auto',
          language: userData.preferences?.interface?.language || 'en-US',
          timezone: userData.preferences?.interface?.timezone || 'UTC',
          date_format: userData.preferences?.interface?.date_format || 'MM/DD/YYYY',
          time_format: userData.preferences?.interface?.time_format || '12h'
        }
      },
      
      account: {
        status: userData.account?.status || 'active',
        type: userData.account?.type || 'free',
        subscription_expires_at: userData.account?.subscription_expires_at ? 
          new Date(userData.account.subscription_expires_at) : null,
        
        verification: {
          email_verified: false,
          email_verified_at: null,
          phone_verified: false,
          phone_verified_at: null,
          identity_verified: false,
          identity_verified_at: null,
          verification_level: 'none'
        },
        
        security: {
          two_factor_enabled: false,
          two_factor_method: 'none',
          password_changed_at: currentTime,
          last_password_reset: null,
          failed_login_attempts: 0,
          account_locked_until: null
        }
      },
      
      activity: {
        last_login_at: null,
        last_activity_at: null,
        login_count: 0,
        session_count: 0,
        ip_address: userData.activity?.ip_address || null,
        user_agent: userData.activity?.user_agent || null
      },
      
      metadata: userData.metadata || null,
      
      created_at: currentTime,
      updated_at: currentTime,
      deleted_at: null
    };

    try {
      const result = await users.insertOne(validatedUser);
      
      // Log successful user creation
      await this.logAuditEvent({
        user_id: result.insertedId,
        action: 'create',
        resource_type: 'user',
        resource_id: result.insertedId.toString(),
        details: {
          username: validatedUser.username,
          email: validatedUser.email,
          account_type: validatedUser.account.type
        },
        request_info: {
          ip_address: validatedUser.activity.ip_address,
          user_agent: validatedUser.activity.user_agent
        },
        result: {
          success: true,
          duration_ms: 0 // Would be calculated in real implementation
        },
        timestamp: currentTime
      });
      
      console.log(`User created successfully with ID: ${result.insertedId}`);
      return result;
      
    } catch (validationError) {
      console.error('User validation failed:', validationError);
      
      // Log failed user creation attempt
      await this.logAuditEvent({
        user_id: null,
        action: 'create',
        resource_type: 'user',
        details: {
          attempted_email: userData.email,
          attempted_username: userData.username
        },
        result: {
          success: false,
          error_message: validationError.message,
          error_code: validationError.code?.toString()
        },
        timestamp: currentTime
      });
      
      throw validationError;
    }
  }

  async logAuditEvent(eventData) {
    const auditLog = this.collections.get('audit_log');
    
    try {
      await auditLog.insertOne(eventData);
    } catch (error) {
      console.warn('Failed to log audit event:', error.message);
    }
  }

  async performValidationMigration(collectionName, newValidationRules, options = {}) {
    console.log(`Performing validation migration for collection: ${collectionName}`);
    
    const {
      validationLevel = 'strict',
      validationAction = 'error',
      dryRun = false,
      batchSize = 1000
    } = options;

    const collection = this.db.collection(collectionName);
    
    if (dryRun) {
      // Test validation rules against existing documents
      console.log('Running dry run validation test...');
      
      const validationErrors = [];
      let processedCount = 0;
      
      const cursor = collection.find({}).limit(batchSize);
      
      for await (const document of cursor) {
        try {
          // Test document against new validation rules (simplified)
          const testResult = await this.testDocumentValidation(document, newValidationRules);
          
          if (!testResult.valid) {
            validationErrors.push({
              documentId: document._id,
              errors: testResult.errors
            });
          }
          
          processedCount++;
          
        } catch (error) {
          validationErrors.push({
            documentId: document._id,
            errors: [error.message]
          });
        }
      }
      
      console.log(`Dry run completed: ${processedCount} documents tested, ${validationErrors.length} validation errors found`);
      
      return {
        dryRun: true,
        documentsProcessed: processedCount,
        validationErrors: validationErrors,
        migrationFeasible: validationErrors.length === 0
      };
    }

    // Apply new validation rules
    try {
      await this.db.runCommand({
        collMod: collectionName,
        validator: newValidationRules,
        validationLevel: validationLevel,
        validationAction: validationAction
      });
      
      // Record migration in history
      this.migrationHistory.push({
        collection: collectionName,
        timestamp: new Date(),
        validationRules: newValidationRules,
        validationLevel: validationLevel,
        validationAction: validationAction,
        success: true
      });
      
      console.log(`Validation migration completed successfully for ${collectionName}`);
      
      return {
        success: true,
        collection: collectionName,
        timestamp: new Date(),
        validationLevel: validationLevel,
        validationAction: validationAction
      };
      
    } catch (error) {
      console.error('Validation migration failed:', error);
      
      this.migrationHistory.push({
        collection: collectionName,
        timestamp: new Date(),
        success: false,
        error: error.message
      });
      
      throw error;
    }
  }

  async testDocumentValidation(document, validationRules) {
    // Simplified validation testing (in real implementation, would use MongoDB's validator)
    try {
      // This would use MongoDB's internal validation logic
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  async generateValidationReport() {
    console.log('Generating comprehensive validation report...');
    
    const report = {
      collections: new Map(),
      summary: {
        totalCollections: 0,
        validatedCollections: 0,
        totalDocuments: 0,
        validationCoverage: 0
      },
      recommendations: []
    };

    for (const [collectionName, collection] of this.collections) {
      console.log(`Analyzing validation for collection: ${collectionName}`);
      
      try {
        // Get collection info including validation rules
        const collectionInfo = await this.db.runCommand({ listCollections: { filter: { name: collectionName } } });
        const stats = await collection.stats();
        
        const collectionData = {
          name: collectionName,
          documentCount: stats.count,
          avgDocumentSize: stats.avgObjSize,
          indexCount: stats.nindexes,
          hasValidation: false,
          validationLevel: null,
          validationAction: null,
          validationRules: null
        };

        // Check if validation is configured
        if (collectionInfo.cursor.firstBatch[0]?.options?.validator) {
          collectionData.hasValidation = true;
          collectionData.validationLevel = collectionInfo.cursor.firstBatch[0].options.validationLevel || 'strict';
          collectionData.validationAction = collectionInfo.cursor.firstBatch[0].options.validationAction || 'error';
          collectionData.validationRules = collectionInfo.cursor.firstBatch[0].options.validator;
        }

        report.collections.set(collectionName, collectionData);
        report.summary.totalCollections++;
        report.summary.totalDocuments += stats.count;
        
        if (collectionData.hasValidation) {
          report.summary.validatedCollections++;
        }

        // Generate recommendations
        if (!collectionData.hasValidation && stats.count > 1000) {
          report.recommendations.push(`Consider adding validation rules to ${collectionName} (${stats.count} documents)`);
        }
        
        if (collectionData.hasValidation && collectionData.validationLevel === 'moderate') {
          report.recommendations.push(`Consider upgrading ${collectionName} to strict validation for better data integrity`);
        }
        
      } catch (error) {
        console.warn(`Could not analyze collection ${collectionName}:`, error.message);
      }
    }

    report.summary.validationCoverage = report.summary.totalCollections > 0 ? 
      (report.summary.validatedCollections / report.summary.totalCollections * 100) : 0;

    console.log('Validation report generated successfully');
    return report;
  }
}

// Benefits of MongoDB Document Validation:
// - Flexible schema evolution without complex migrations or downtime
// - Rich validation rules supporting nested objects, arrays, and complex business logic
// - Configurable validation levels (strict, moderate, off) for different environments
// - JSON Schema standard compliance with MongoDB-specific extensions
// - Integration with MongoDB's native indexing and query optimization
// - Support for custom validation logic and conditional constraints
// - Gradual validation enforcement for existing data migration scenarios
// - Real-time validation feedback during development and testing
// - Audit trail capabilities for tracking schema changes and validation events
// - Performance optimizations that leverage MongoDB's document-oriented architecture

module.exports = {
  MongoDBValidationManager
};
```

## Understanding MongoDB Document Validation Architecture

### Advanced Validation Patterns and Schema Evolution

Implement sophisticated validation strategies for production applications with evolving requirements:

```javascript
// Advanced document validation patterns and schema evolution strategies
class AdvancedValidationManager {
  constructor(db) {
    this.db = db;
    this.schemaVersions = new Map();
    this.validationProfiles = new Map();
    this.migrationQueue = [];
  }

  async implementConditionalValidation(collectionName, validationProfiles) {
    console.log(`Implementing conditional validation for ${collectionName}`);
    
    // Create validation rules that adapt based on document type or version
    const conditionalValidator = {
      $or: validationProfiles.map(profile => ({
        $and: [
          profile.condition,
          { $jsonSchema: profile.schema }
        ]
      }))
    };

    await this.db.runCommand({
      collMod: collectionName,
      validator: conditionalValidator,
      validationLevel: 'strict'
    });

    this.validationProfiles.set(collectionName, validationProfiles);
    return conditionalValidator;
  }

  async implementVersionedValidation(collectionName, versions) {
    console.log(`Setting up versioned validation for ${collectionName}`);
    
    const versionedValidator = {
      $or: versions.map(version => ({
        $and: [
          { schema_version: { $eq: version.version } },
          { $jsonSchema: version.schema }
        ]
      }))
    };

    // Store version history
    this.schemaVersions.set(collectionName, {
      current: Math.max(...versions.map(v => v.version)),
      versions: versions,
      created_at: new Date()
    });

    await this.db.runCommand({
      collMod: collectionName,
      validator: versionedValidator,
      validationLevel: 'strict'
    });

    return versionedValidator;
  }

  async performGradualMigration(collectionName, targetValidation, options = {}) {
    console.log(`Starting gradual migration for ${collectionName}`);
    
    const {
      batchSize = 1000,
      delayMs = 100,
      validationMode = 'warn_then_error'
    } = options;

    // Phase 1: Warning mode
    if (validationMode === 'warn_then_error') {
      console.log('Phase 1: Enabling validation in warning mode');
      await this.db.runCommand({
        collMod: collectionName,
        validator: targetValidation,
        validationLevel: 'moderate',
        validationAction: 'warn'
      });
      
      // Allow time for monitoring and fixing validation warnings
      console.log('Monitoring validation warnings for 24 hours...');
      // In production, this would be a longer monitoring period
    }

    // Phase 2: Strict enforcement
    console.log('Phase 2: Enabling strict validation');
    await this.db.runCommand({
      collMod: collectionName,
      validator: targetValidation,
      validationLevel: 'strict',
      validationAction: 'error'
    });

    console.log('Gradual migration completed successfully');
    return { success: true, phases: 2 };
  }

  generateBusinessLogicValidation(rules) {
    // Convert business rules into MongoDB validation expressions
    const validationExpressions = [];
    
    for (const rule of rules) {
      switch (rule.type) {
        case 'date_range':
          validationExpressions.push({
            [rule.field]: {
              $gte: new Date(rule.min),
              $lte: new Date(rule.max)
            }
          });
          break;
          
        case 'conditional_required':
          validationExpressions.push({
            $or: [
              { [rule.condition.field]: { $ne: rule.condition.value } },
              { [rule.requiredField]: { $exists: true, $ne: null } }
            ]
          });
          break;
          
        case 'mutual_exclusion':
          validationExpressions.push({
            $or: rule.fields.map(field => ({ [field]: { $exists: false } }))
              .concat([
                { $expr: { 
                  $lte: [
                    { $size: { $filter: {
                      input: rule.fields,
                      cond: { $ne: [`$$this`, null] }
                    }}},
                    1
                  ]
                }}
              ])
          });
          break;
          
        case 'cross_field_validation':
          validationExpressions.push({
            $expr: {
              [rule.operator]: [
                `$${rule.field1}`,
                `$${rule.field2}`
              ]
            }
          });
          break;
      }
    }
    
    return validationExpressions.length > 0 ? { $and: validationExpressions } : {};
  }

  async validateDataQuality(collectionName, qualityRules) {
    console.log(`Running data quality validation for ${collectionName}`);
    
    const collection = this.db.collection(collectionName);
    const qualityReport = {
      collection: collectionName,
      totalDocuments: await collection.countDocuments(),
      qualityIssues: [],
      qualityScore: 0
    };

    for (const rule of qualityRules) {
      const issueCount = await collection.countDocuments(rule.condition);
      
      if (issueCount > 0) {
        qualityReport.qualityIssues.push({
          rule: rule.name,
          description: rule.description,
          affectedDocuments: issueCount,
          severity: rule.severity,
          suggestion: rule.suggestion
        });
      }
    }

    // Calculate quality score
    const totalIssues = qualityReport.qualityIssues.reduce((sum, issue) => sum + issue.affectedDocuments, 0);
    qualityReport.qualityScore = Math.max(0, 100 - (totalIssues / qualityReport.totalDocuments * 100));

    return qualityReport;
  }
}
```

## SQL-Style Document Validation with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB document validation and schema management:

```sql
-- QueryLeaf document validation with SQL-familiar constraints

-- Create table with comprehensive validation rules
CREATE TABLE users (
  _id ObjectId PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE 
    CHECK (email REGEXP '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'),
  username VARCHAR(30) NOT NULL UNIQUE 
    CHECK (username REGEXP '^[a-zA-Z0-9_-]+$' AND LENGTH(username) >= 3),
  password_hash CHAR(60) NOT NULL,
  
  -- Nested object validation with JSON schema
  profile JSONB NOT NULL CHECK (
    JSON_VALID(profile) AND
    JSON_EXTRACT(profile, '$.first_name') IS NOT NULL AND
    JSON_EXTRACT(profile, '$.last_name') IS NOT NULL AND
    LENGTH(JSON_UNQUOTE(JSON_EXTRACT(profile, '$.first_name'))) >= 1 AND
    LENGTH(JSON_UNQUOTE(JSON_EXTRACT(profile, '$.last_name'))) >= 1
  ),
  
  -- Complex nested preferences with validation
  preferences JSONB CHECK (
    JSON_VALID(preferences) AND
    JSON_EXTRACT(preferences, '$.notifications.email.frequency') IN ('immediate', 'daily', 'weekly', 'never') AND
    JSON_EXTRACT(preferences, '$.privacy.profile_visibility') IN ('public', 'friends', 'private') AND
    JSON_EXTRACT(preferences, '$.interface.theme') IN ('light', 'dark', 'auto')
  ),
  
  -- Account information with business logic validation
  account JSONB NOT NULL CHECK (
    JSON_VALID(account) AND
    JSON_EXTRACT(account, '$.status') IN ('active', 'inactive', 'suspended', 'pending') AND
    JSON_EXTRACT(account, '$.type') IN ('free', 'premium', 'enterprise', 'admin') AND
    (
      JSON_EXTRACT(account, '$.type') != 'premium' OR 
      JSON_EXTRACT(account, '$.subscription_expires_at') IS NOT NULL
    )
  ),
  
  -- Audit timestamps with constraints
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  
  -- Complex business logic constraints
  CONSTRAINT valid_birth_date CHECK (
    JSON_EXTRACT(profile, '$.birth_date') IS NULL OR
    JSON_EXTRACT(profile, '$.birth_date') <= CURRENT_DATE
  ),
  
  CONSTRAINT profile_completeness CHECK (
    (JSON_EXTRACT(account, '$.type') != 'premium') OR
    (
      JSON_EXTRACT(profile, '$.phone_number') IS NOT NULL AND
      JSON_EXTRACT(profile, '$.bio') IS NOT NULL
    )
  ),
  
  -- Conditional validation based on account type
  CONSTRAINT admin_verification CHECK (
    (JSON_EXTRACT(account, '$.type') != 'admin') OR
    (JSON_EXTRACT(account, '$.verification.identity_verified') = true)
  )
) WITH (
  validation_level = 'strict',
  validation_action = 'error'
);

-- Insert data with comprehensive validation
INSERT INTO users (
  email, username, password_hash, profile, preferences, account
) VALUES (
  'john.doe@example.com',
  'johndoe123', 
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBxJzybKlJNcX.',
  JSON_OBJECT(
    'first_name', 'John',
    'last_name', 'Doe',
    'birth_date', '1990-05-15',
    'phone_number', '+1-555-123-4567',
    'bio', 'Software engineer passionate about technology',
    'social_links', JSON_OBJECT(
      'twitter', '@johndoe',
      'github', 'johndoe',
      'linkedin', 'john-doe-dev'
    )
  ),
  JSON_OBJECT(
    'notifications', JSON_OBJECT(
      'email', JSON_OBJECT(
        'marketing', false,
        'security', true,
        'frequency', 'daily'
      ),
      'push', JSON_OBJECT(
        'enabled', true,
        'frequency', 'immediate'
      )
    ),
    'privacy', JSON_OBJECT(
      'profile_visibility', 'friends',
      'search_visibility', true
    ),
    'interface', JSON_OBJECT(
      'theme', 'dark',
      'language', 'en-US',
      'timezone', 'America/New_York'
    )
  ),
  JSON_OBJECT(
    'status', 'active',
    'type', 'free',
    'verification', JSON_OBJECT(
      'email_verified', false,
      'verification_level', 'none'
    ),
    'security', JSON_OBJECT(
      'two_factor_enabled', false,
      'failed_login_attempts', 0
    )
  )
);

-- Advanced validation queries and data quality checks
WITH validation_analysis AS (
  SELECT 
    _id,
    email,
    username,
    
    -- Profile completeness scoring
    CASE 
      WHEN JSON_EXTRACT(profile, '$.bio') IS NOT NULL 
           AND JSON_EXTRACT(profile, '$.phone_number') IS NOT NULL
           AND JSON_EXTRACT(profile, '$.social_links') IS NOT NULL THEN 100
      WHEN JSON_EXTRACT(profile, '$.bio') IS NOT NULL 
           OR JSON_EXTRACT(profile, '$.phone_number') IS NOT NULL THEN 70
      WHEN JSON_EXTRACT(profile, '$.first_name') IS NOT NULL 
           AND JSON_EXTRACT(profile, '$.last_name') IS NOT NULL THEN 40
      ELSE 20
    END as profile_completeness_score,
    
    -- Preference configuration analysis
    CASE 
      WHEN JSON_EXTRACT(preferences, '$.notifications') IS NOT NULL
           AND JSON_EXTRACT(preferences, '$.privacy') IS NOT NULL
           AND JSON_EXTRACT(preferences, '$.interface') IS NOT NULL THEN 'complete'
      WHEN JSON_EXTRACT(preferences, '$.notifications') IS NOT NULL THEN 'partial'
      ELSE 'minimal'
    END as preferences_status,
    
    -- Account validation status
    JSON_EXTRACT(account, '$.status') as account_status,
    JSON_EXTRACT(account, '$.type') as account_type,
    JSON_EXTRACT(account, '$.verification.verification_level') as verification_level,
    
    -- Data quality flags
    JSON_VALID(profile) as profile_valid,
    JSON_VALID(preferences) as preferences_valid,
    JSON_VALID(account) as account_valid,
    
    -- Business rule compliance
    CASE 
      WHEN JSON_EXTRACT(account, '$.type') = 'premium' 
           AND JSON_EXTRACT(account, '$.subscription_expires_at') IS NULL THEN false
      ELSE true
    END as subscription_rule_compliant,
    
    created_at,
    updated_at
    
  FROM users
  WHERE deleted_at IS NULL
),

data_quality_report AS (
  SELECT 
    COUNT(*) as total_users,
    
    -- Profile quality metrics
    AVG(profile_completeness_score) as avg_profile_completeness,
    COUNT(*) FILTER (WHERE profile_completeness_score >= 80) as high_quality_profiles,
    COUNT(*) FILTER (WHERE profile_completeness_score < 50) as low_quality_profiles,
    
    -- Validation compliance
    COUNT(*) FILTER (WHERE profile_valid = false) as invalid_profiles,
    COUNT(*) FILTER (WHERE preferences_valid = false) as invalid_preferences,
    COUNT(*) FILTER (WHERE account_valid = false) as invalid_accounts,
    
    -- Business rule compliance
    COUNT(*) FILTER (WHERE subscription_rule_compliant = false) as subscription_violations,
    
    -- Account distribution
    COUNT(*) FILTER (WHERE account_type = 'free') as free_accounts,
    COUNT(*) FILTER (WHERE account_type = 'premium') as premium_accounts,
    COUNT(*) FILTER (WHERE account_type = 'enterprise') as enterprise_accounts,
    
    -- Verification status
    COUNT(*) FILTER (WHERE verification_level = 'none') as unverified_users,
    COUNT(*) FILTER (WHERE verification_level IN ('email', 'phone', 'identity', 'full')) as verified_users,
    
    -- Recent activity
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_users_30d,
    COUNT(*) FILTER (WHERE updated_at >= CURRENT_DATE - INTERVAL '7 days') as active_users_7d
    
  FROM validation_analysis
)

SELECT 
  total_users,
  ROUND(avg_profile_completeness, 1) as avg_profile_quality,
  ROUND((high_quality_profiles / total_users::float * 100), 1) as high_quality_pct,
  ROUND((low_quality_profiles / total_users::float * 100), 1) as low_quality_pct,
  
  -- Data integrity summary
  CASE 
    WHEN (invalid_profiles + invalid_preferences + invalid_accounts) = 0 THEN 'excellent'
    WHEN (invalid_profiles + invalid_preferences + invalid_accounts) < total_users * 0.01 THEN 'good'
    WHEN (invalid_profiles + invalid_preferences + invalid_accounts) < total_users * 0.05 THEN 'acceptable'
    ELSE 'poor'
  END as data_integrity_status,
  
  -- Business rule compliance
  CASE 
    WHEN subscription_violations = 0 THEN 'compliant'
    WHEN subscription_violations < total_users * 0.01 THEN 'minor_issues'
    ELSE 'major_violations'
  END as business_rule_compliance,
  
  -- Account distribution summary
  JSON_OBJECT(
    'free', free_accounts,
    'premium', premium_accounts, 
    'enterprise', enterprise_accounts
  ) as account_distribution,
  
  -- Verification summary
  ROUND((verified_users / total_users::float * 100), 1) as verification_rate_pct,
  
  -- Growth metrics
  new_users_30d,
  active_users_7d,
  
  -- Recommendations
  CASE 
    WHEN low_quality_profiles > total_users * 0.3 THEN 'Focus on profile completion campaigns'
    WHEN unverified_users > total_users * 0.5 THEN 'Improve verification processes'
    WHEN subscription_violations > 0 THEN 'Review premium account management'
    ELSE 'Data quality is good'
  END as primary_recommendation

FROM data_quality_report;

-- Schema evolution with validation migration
-- Add new validation rules with backward compatibility
ALTER TABLE users 
ADD CONSTRAINT enhanced_email_validation CHECK (
  email REGEXP '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' AND
  email NOT LIKE '%@example.com' AND
  email NOT LIKE '%@test.%' AND
  LENGTH(email) >= 5 AND
  LENGTH(email) <= 254
);

-- Modify existing constraints with migration support
ALTER TABLE users 
MODIFY CONSTRAINT profile_completeness CHECK (
  (JSON_EXTRACT(account, '$.type') NOT IN ('premium', 'enterprise')) OR
  (
    JSON_EXTRACT(profile, '$.phone_number') IS NOT NULL AND
    JSON_EXTRACT(profile, '$.bio') IS NOT NULL AND
    JSON_EXTRACT(profile, '$.social_links') IS NOT NULL
  )
);

-- Add conditional validation based on account age
ALTER TABLE users
ADD CONSTRAINT mature_account_validation CHECK (
  (DATEDIFF(CURRENT_DATE, created_at) < 30) OR
  (
    JSON_EXTRACT(account, '$.verification.email_verified') = true AND
    profile_completeness_score >= 60
  )
);

-- Create validation monitoring view
CREATE VIEW user_validation_status AS
SELECT 
  _id,
  email,
  username,
  JSON_EXTRACT(account, '$.status') as status,
  JSON_EXTRACT(account, '$.type') as type,
  
  -- Validation status flags
  JSON_VALID(profile) as profile_structure_valid,
  JSON_VALID(preferences) as preferences_structure_valid,
  JSON_VALID(account) as account_structure_valid,
  
  -- Business rule compliance checks
  (
    JSON_EXTRACT(account, '$.type') != 'premium' OR 
    JSON_EXTRACT(account, '$.subscription_expires_at') IS NOT NULL
  ) as subscription_valid,
  
  (
    JSON_EXTRACT(account, '$.type') != 'admin' OR
    JSON_EXTRACT(account, '$.verification.identity_verified') = true
  ) as admin_verification_valid,
  
  -- Data completeness assessment  
  CASE 
    WHEN JSON_EXTRACT(profile, '$.first_name') IS NULL THEN 'missing_required_profile_data'
    WHEN JSON_EXTRACT(profile, '$.phone_number') IS NULL 
         AND JSON_EXTRACT(account, '$.type') IN ('premium', 'enterprise') THEN 'incomplete_premium_profile'
    WHEN email NOT REGEXP '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' THEN 'invalid_email_format'
    ELSE 'valid'
  END as validation_status,
  
  created_at,
  updated_at
  
FROM users
WHERE deleted_at IS NULL;

-- QueryLeaf provides comprehensive document validation capabilities:
-- 1. SQL-familiar constraint syntax with CHECK clauses and business logic
-- 2. JSON validation functions for nested object and array validation  
-- 3. Conditional validation based on field values and account types
-- 4. Complex business rule enforcement through constraint expressions
-- 5. Schema evolution support with backward compatibility options
-- 6. Data quality monitoring and validation status reporting
-- 7. Integration with MongoDB's native document validation features
-- 8. Familiar SQL patterns for constraint management and modification
-- 9. Real-time validation feedback and error handling
-- 10. Comprehensive validation reporting and compliance tracking
```

## Best Practices for Document Validation Implementation

### Validation Strategy Design

Essential principles for effective MongoDB document validation:

1. **Progressive Validation**: Start with loose validation and progressively tighten rules as data quality improves
2. **Business Rule Integration**: Embed business logic directly into validation rules for consistency
3. **Schema Versioning**: Implement versioning strategies for smooth schema evolution
4. **Performance Consideration**: Balance validation thoroughness with insertion performance
5. **Error Handling**: Design clear, actionable error messages for validation failures
6. **Testing Strategy**: Thoroughly test validation rules with edge cases and invalid data

### Production Implementation

Optimize MongoDB document validation for production environments:

1. **Validation Levels**: Use appropriate validation levels (strict, moderate, off) for different environments
2. **Migration Planning**: Plan validation changes with proper testing and rollback strategies
3. **Performance Monitoring**: Monitor validation impact on write performance and throughput
4. **Data Quality Tracking**: Implement comprehensive data quality monitoring and alerting
5. **Documentation**: Maintain clear documentation of validation rules and business logic
6. **Compliance Integration**: Align validation rules with regulatory and compliance requirements

## Conclusion

MongoDB Document Validation provides the perfect balance between schema flexibility and data integrity, enabling applications to evolve rapidly while maintaining data quality and consistency. The powerful validation system supports complex business logic, nested object validation, and gradual schema evolution without the rigid constraints and expensive migrations of traditional relational systems.

Key MongoDB Document Validation benefits include:

- **Flexible Schema Evolution**: Modify validation rules without downtime or complex migrations
- **Rich Validation Logic**: Support for complex business rules, nested objects, and conditional constraints
- **JSON Schema Standard**: Industry-standard validation with MongoDB-specific enhancements
- **Performance Integration**: Validation optimizations that work with MongoDB's document architecture
- **Development Agility**: Real-time validation feedback that accelerates development cycles
- **Data Quality Assurance**: Comprehensive validation reporting and quality monitoring capabilities

Whether you're building user management systems, e-commerce platforms, content management applications, or any system requiring reliable data integrity with flexible schema design, MongoDB Document Validation with QueryLeaf's familiar SQL interface provides the foundation for robust, maintainable data validation.

> **QueryLeaf Integration**: QueryLeaf automatically handles MongoDB document validation while providing SQL-familiar constraint syntax, validation functions, and schema management operations. Complex validation rules, business logic constraints, and data quality monitoring are seamlessly managed through familiar SQL constructs, making sophisticated document validation both powerful and accessible to SQL-oriented development teams.

The combination of flexible document validation with SQL-style operations makes MongoDB an ideal platform for applications requiring both rigorous data integrity and rapid schema evolution, ensuring your applications can adapt to changing requirements while maintaining the highest standards of data quality and consistency.