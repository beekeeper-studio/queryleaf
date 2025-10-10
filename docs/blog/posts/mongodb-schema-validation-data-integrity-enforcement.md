---
title: "MongoDB Schema Validation and Data Integrity: Advanced Document Validation for Robust Database Design"
description: "Master MongoDB schema validation, document validation patterns, and data integrity enforcement. Learn advanced validation rules, custom validators, and SQL-familiar data validation techniques for production MongoDB deployments."
date: 2025-10-09
tags: [mongodb, schema-validation, data-integrity, document-validation, database-design, sql, production]
---

# MongoDB Schema Validation and Data Integrity: Advanced Document Validation for Robust Database Design

Modern applications require robust data validation mechanisms to ensure data quality, maintain business rules, and prevent data corruption in production databases. Traditional NoSQL databases often sacrifice data validation for flexibility, leading to inconsistent data structures and difficult-to-debug application issues. MongoDB's document validation capabilities provide comprehensive schema enforcement while preserving the flexibility that makes document databases powerful for evolving applications.

MongoDB Schema Validation offers sophisticated document validation rules that can enforce field types, value constraints, required fields, and complex business logic at the database level. Unlike application-level validation that can be bypassed or inconsistently applied, database-level validation ensures data integrity regardless of how data enters the system, providing a critical safety net for production applications.

## The Traditional Data Validation Challenge

Conventional approaches to data validation in both SQL and NoSQL systems have significant limitations:

```sql
-- Traditional relational database constraints - rigid but limited flexibility

-- PostgreSQL table with basic constraints
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(320) NOT NULL,
    username VARCHAR(50) NOT NULL,
    full_name VARCHAR(200),
    age INTEGER,
    account_status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Basic constraints
    CONSTRAINT ck_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT ck_age_valid CHECK (age >= 0 AND age <= 150),
    CONSTRAINT ck_status_valid CHECK (account_status IN ('active', 'inactive', 'suspended', 'pending')),
    CONSTRAINT ck_username_length CHECK (char_length(username) >= 3),
    
    -- Unique constraints
    UNIQUE(email),
    UNIQUE(username)
);

-- User preferences table with limited JSON validation
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}',
    notification_settings JSONB,
    privacy_settings JSONB,
    
    -- Basic JSON structure validation (limited)
    CONSTRAINT ck_preferences_not_empty CHECK (jsonb_typeof(preferences) = 'object'),
    CONSTRAINT ck_notifications_structure CHECK (
        notification_settings IS NULL OR 
        (jsonb_typeof(notification_settings) = 'object' AND 
         notification_settings ? 'email' AND 
         notification_settings ? 'push')
    )
);

-- Product catalog with rigid structure
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    availability_status VARCHAR(20) NOT NULL DEFAULT 'available',
    
    -- Product specifications (limited flexibility)
    specifications JSONB,
    dimensions JSONB,
    weight_grams INTEGER,
    
    -- Basic validation constraints
    CONSTRAINT ck_price_positive CHECK (price > 0),
    CONSTRAINT ck_currency_code CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_availability CHECK (availability_status IN ('available', 'out_of_stock', 'discontinued')),
    CONSTRAINT ck_weight_positive CHECK (weight_grams > 0),
    
    -- Limited JSON validation
    CONSTRAINT ck_specifications_object CHECK (
        specifications IS NULL OR jsonb_typeof(specifications) = 'object'
    ),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attempting complex validation with triggers (maintenance overhead)
CREATE OR REPLACE FUNCTION validate_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
    -- Manual JSON validation logic
    IF NEW.notification_settings IS NOT NULL THEN
        IF NOT (NEW.notification_settings ? 'email' AND 
                NEW.notification_settings ? 'push' AND
                NEW.notification_settings ? 'sms') THEN
            RAISE EXCEPTION 'notification_settings must contain email, push, and sms keys';
        END IF;
        
        -- Validate nested structure
        IF NOT (jsonb_typeof(NEW.notification_settings->'email') = 'object' AND
                NEW.notification_settings->'email' ? 'enabled' AND
                jsonb_typeof(NEW.notification_settings->'email'->'enabled') = 'boolean') THEN
            RAISE EXCEPTION 'notification_settings.email must have enabled boolean field';
        END IF;
    END IF;
    
    -- Privacy settings validation
    IF NEW.privacy_settings IS NOT NULL THEN
        IF NOT (NEW.privacy_settings ? 'profile_visibility' AND
                NEW.privacy_settings->'profile_visibility' IN ('"public"', '"private"', '"friends"')) THEN
            RAISE EXCEPTION 'privacy_settings.profile_visibility must be public, private, or friends';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_preferences_trigger
    BEFORE INSERT OR UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION validate_user_preferences();

-- Complex business rule validation (difficult to maintain)
CREATE OR REPLACE FUNCTION validate_product_business_rules()
RETURNS TRIGGER AS $$
BEGIN
    -- Price validation based on category
    IF NEW.category = 'electronics' AND NEW.price < 10.00 THEN
        RAISE EXCEPTION 'Electronics products must have minimum price of $10.00';
    END IF;
    
    IF NEW.category = 'luxury' AND NEW.price < 100.00 THEN
        RAISE EXCEPTION 'Luxury products must have minimum price of $100.00';
    END IF;
    
    -- Specifications validation by category
    IF NEW.category = 'electronics' THEN
        IF NEW.specifications IS NULL OR 
           NOT (NEW.specifications ? 'brand' AND NEW.specifications ? 'model') THEN
            RAISE EXCEPTION 'Electronics products must specify brand and model in specifications';
        END IF;
    END IF;
    
    -- Weight requirements
    IF NEW.category IN ('furniture', 'appliances') AND NEW.weight_grams IS NULL THEN
        RAISE EXCEPTION 'Furniture and appliances must specify weight';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_product_rules_trigger
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION validate_product_business_rules();

-- Attempt to query with validation checks (complex and inefficient)
WITH validation_summary AS (
    SELECT 
        'user_profiles' as table_name,
        COUNT(*) as total_records,
        COUNT(*) FILTER (WHERE email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') as invalid_emails,
        COUNT(*) FILTER (WHERE age < 0 OR age > 150) as invalid_ages,
        COUNT(*) FILTER (WHERE account_status NOT IN ('active', 'inactive', 'suspended', 'pending')) as invalid_statuses
    FROM user_profiles
    
    UNION ALL
    
    SELECT 
        'products' as table_name,
        COUNT(*) as total_records,
        COUNT(*) FILTER (WHERE price <= 0) as invalid_prices,
        COUNT(*) FILTER (WHERE currency !~ '^[A-Z]{3}$') as invalid_currencies,
        COUNT(*) FILTER (WHERE specifications IS NOT NULL AND jsonb_typeof(specifications) != 'object') as invalid_specs
    FROM products
)
SELECT 
    table_name,
    total_records,
    invalid_emails,
    invalid_ages,
    invalid_statuses,
    invalid_prices,
    invalid_currencies,
    invalid_specs,
    
    -- Overall data quality score
    CASE 
        WHEN table_name = 'user_profiles' THEN
            (total_records - COALESCE(invalid_emails, 0) - COALESCE(invalid_ages, 0) - COALESCE(invalid_statuses, 0))::float / total_records * 100
        ELSE 
            (total_records - COALESCE(invalid_prices, 0) - COALESCE(invalid_currencies, 0) - COALESCE(invalid_specs, 0))::float / total_records * 100
    END as data_quality_percent

FROM validation_summary;

-- Problems with traditional validation approaches:
-- 1. Limited flexibility for evolving schemas and nested structures
-- 2. Complex trigger logic that's difficult to maintain and debug
-- 3. Performance overhead from extensive validation triggers
-- 4. Limited support for conditional validation based on document context
-- 5. No built-in support for array validation and nested object constraints
-- 6. Difficulty enforcing business rules that span multiple fields
-- 7. Poor integration with application development workflows
-- 8. Limited error messaging and validation feedback
-- 9. Complex migration procedures when validation rules change
-- 10. No support for schema versioning and gradual migration strategies
```

MongoDB Schema Validation provides comprehensive document validation capabilities:

```javascript
// MongoDB Advanced Schema Validation - comprehensive document validation system
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('advanced_validation_platform');

// Advanced MongoDB Schema Validation System
class MongoDBSchemaValidator {
  constructor(db, options = {}) {
    this.db = db;
    this.options = {
      validationLevel: options.validationLevel || 'strict', // strict, moderate
      validationAction: options.validationAction || 'error', // error, warn
      enableVersioning: options.enableVersioning || true,
      enableMetrics: options.enableMetrics || true,
      customValidators: options.customValidators || new Map(),
      ...options
    };
    
    this.validationSchemas = new Map();
    this.validationMetrics = {
      validationsPassed: 0,
      validationsFailed: 0,
      validationErrors: [],
      lastUpdated: new Date()
    };
    
    this.setupValidationCollections();
  }

  async setupValidationCollections() {
    console.log('Setting up advanced schema validation system...');
    
    try {
      // User profiles with comprehensive validation
      await this.createValidatedCollection('user_profiles', {
        $jsonSchema: {
          bsonType: 'object',
          title: 'User Profile Validation Schema',
          required: ['email', 'username', 'profile_type', 'created_at'],
          additionalProperties: false,
          
          properties: {
            _id: {
              bsonType: 'objectId',
              description: 'Unique identifier for user profile'
            },
            
            // Basic user information with comprehensive validation
            email: {
              bsonType: 'string',
              pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
              maxLength: 320,
              description: 'Valid email address following RFC 5322 standard'
            },
            
            username: {
              bsonType: 'string',
              pattern: '^[a-zA-Z0-9_-]{3,30}$',
              description: 'Username: 3-30 characters, alphanumeric, underscore, or dash only'
            },
            
            full_name: {
              bsonType: 'string',
              minLength: 2,
              maxLength: 200,
              description: 'Full name: 2-200 characters'
            },
            
            profile_type: {
              enum: ['individual', 'business', 'organization', 'developer'],
              description: 'Type of user profile'
            },
            
            // Age validation with business rules
            age: {
              bsonType: 'int',
              minimum: 13, // Minimum age for account creation
              maximum: 150,
              description: 'User age: must be between 13 and 150'
            },
            
            // Account status with workflow validation
            account_status: {
              bsonType: 'object',
              required: ['status', 'last_updated'],
              additionalProperties: false,
              properties: {
                status: {
                  enum: ['active', 'inactive', 'suspended', 'pending_verification', 'closed'],
                  description: 'Current account status'
                },
                last_updated: {
                  bsonType: 'date',
                  description: 'When status was last updated'
                },
                reason: {
                  bsonType: 'string',
                  maxLength: 500,
                  description: 'Reason for status change (optional)'
                },
                updated_by: {
                  bsonType: 'objectId',
                  description: 'ID of user/admin who updated status'
                }
              }
            },
            
            // Contact information with regional validation
            contact_info: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                phone: {
                  bsonType: 'object',
                  properties: {
                    country_code: {
                      bsonType: 'string',
                      pattern: '^\\+[1-9][0-9]{0,3}$',
                      description: 'Country code with + prefix'
                    },
                    number: {
                      bsonType: 'string',
                      pattern: '^[0-9]{7,15}$',
                      description: 'Phone number: 7-15 digits'
                    },
                    verified: {
                      bsonType: 'bool',
                      description: 'Whether phone number is verified'
                    },
                    verified_at: {
                      bsonType: 'date',
                      description: 'When phone was verified'
                    }
                  },
                  required: ['country_code', 'number', 'verified']
                },
                
                address: {
                  bsonType: 'object',
                  properties: {
                    street: { bsonType: 'string', maxLength: 200 },
                    city: { bsonType: 'string', maxLength: 100 },
                    state_province: { bsonType: 'string', maxLength: 100 },
                    postal_code: { bsonType: 'string', maxLength: 20 },
                    country: {
                      bsonType: 'string',
                      pattern: '^[A-Z]{2}$', // ISO 3166-1 alpha-2 country codes
                      description: 'Two-letter country code (ISO 3166-1)'
                    }
                  },
                  required: ['city', 'country']
                }
              }
            },
            
            // Nested preferences with conditional validation
            preferences: {
              bsonType: 'object',
              additionalProperties: false,
              properties: {
                notifications: {
                  bsonType: 'object',
                  required: ['email', 'push', 'sms'],
                  additionalProperties: false,
                  properties: {
                    email: {
                      bsonType: 'object',
                      required: ['enabled'],
                      properties: {
                        enabled: { bsonType: 'bool' },
                        frequency: {
                          enum: ['immediate', 'daily', 'weekly', 'never'],
                          description: 'Email notification frequency'
                        },
                        categories: {
                          bsonType: 'array',
                          items: {
                            enum: ['security', 'marketing', 'product_updates', 'billing']
                          },
                          uniqueItems: true,
                          description: 'Notification categories to receive'
                        }
                      }
                    },
                    push: {
                      bsonType: 'object',
                      required: ['enabled'],
                      properties: {
                        enabled: { bsonType: 'bool' },
                        quiet_hours: {
                          bsonType: 'object',
                          properties: {
                            enabled: { bsonType: 'bool' },
                            start_time: {
                              bsonType: 'string',
                              pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$',
                              description: 'Start time in HH:MM format'
                            },
                            end_time: {
                              bsonType: 'string',
                              pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$',
                              description: 'End time in HH:MM format'
                            }
                          },
                          required: ['enabled']
                        }
                      }
                    },
                    sms: {
                      bsonType: 'object',
                      required: ['enabled'],
                      properties: {
                        enabled: { bsonType: 'bool' },
                        emergency_only: {
                          bsonType: 'bool',
                          description: 'Only send SMS for emergency notifications'
                        }
                      }
                    }
                  }
                },
                
                privacy: {
                  bsonType: 'object',
                  required: ['profile_visibility', 'data_processing_consent'],
                  properties: {
                    profile_visibility: {
                      enum: ['public', 'friends_only', 'private'],
                      description: 'Who can view this profile'
                    },
                    search_visibility: {
                      bsonType: 'bool',
                      description: 'Whether profile appears in search results'
                    },
                    data_processing_consent: {
                      bsonType: 'object',
                      required: ['analytics', 'marketing', 'given_at'],
                      properties: {
                        analytics: { bsonType: 'bool' },
                        marketing: { bsonType: 'bool' },
                        third_party_sharing: { bsonType: 'bool' },
                        given_at: { bsonType: 'date' },
                        ip_address: { bsonType: 'string' },
                        user_agent: { bsonType: 'string' }
                      }
                    }
                  }
                },
                
                // User interface preferences
                ui_preferences: {
                  bsonType: 'object',
                  properties: {
                    theme: {
                      enum: ['light', 'dark', 'auto'],
                      description: 'User interface theme preference'
                    },
                    language: {
                      bsonType: 'string',
                      pattern: '^[a-z]{2}(-[A-Z]{2})?$',
                      description: 'Language code (ISO 639-1 with optional country)'
                    },
                    timezone: {
                      bsonType: 'string',
                      description: 'IANA timezone identifier'
                    },
                    date_format: {
                      enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
                      description: 'Preferred date display format'
                    }
                  }
                }
              }
            },
            
            // Security settings with validation
            security: {
              bsonType: 'object',
              properties: {
                two_factor_enabled: { bsonType: 'bool' },
                backup_codes: {
                  bsonType: 'array',
                  maxItems: 10,
                  items: {
                    bsonType: 'string',
                    pattern: '^[A-Z0-9]{8}$',
                    description: '8-character backup codes'
                  },
                  uniqueItems: true
                },
                security_questions: {
                  bsonType: 'array',
                  maxItems: 5,
                  items: {
                    bsonType: 'object',
                    required: ['question', 'answer_hash'],
                    properties: {
                      question: {
                        bsonType: 'string',
                        maxLength: 200
                      },
                      answer_hash: {
                        bsonType: 'string',
                        description: 'Hashed security question answer'
                      },
                      created_at: { bsonType: 'date' }
                    }
                  }
                },
                login_restrictions: {
                  bsonType: 'object',
                  properties: {
                    allowed_countries: {
                      bsonType: 'array',
                      items: {
                        bsonType: 'string',
                        pattern: '^[A-Z]{2}$'
                      },
                      description: 'ISO country codes where login is allowed'
                    },
                    require_device_verification: { bsonType: 'bool' }
                  }
                }
              }
            },
            
            // Audit trail information
            created_at: {
              bsonType: 'date',
              description: 'Account creation timestamp'
            },
            
            updated_at: {
              bsonType: 'date',
              description: 'Last profile update timestamp'
            },
            
            created_by: {
              bsonType: 'objectId',
              description: 'ID of user/system that created this profile'
            },
            
            // Schema versioning
            schema_version: {
              bsonType: 'string',
              pattern: '^\\d+\\.\\d+\\.\\d+$',
              description: 'Schema version (semantic versioning)'
            }
          }
        }
      }, {
        validationLevel: 'strict',
        validationAction: 'error'
      });

      // Products collection with complex business rule validation
      await this.createValidatedCollection('products', {
        $jsonSchema: {
          bsonType: 'object',
          title: 'Product Validation Schema',
          required: ['name', 'category', 'pricing', 'availability', 'created_at'],
          additionalProperties: false,
          
          properties: {
            _id: { bsonType: 'objectId' },
            
            // Basic product information
            name: {
              bsonType: 'string',
              minLength: 2,
              maxLength: 500,
              description: 'Product name: 2-500 characters'
            },
            
            description: {
              bsonType: 'string',
              maxLength: 5000,
              description: 'Product description: max 5000 characters'
            },
            
            sku: {
              bsonType: 'string',
              pattern: '^[A-Z0-9]{3,20}$',
              description: 'Stock Keeping Unit: 3-20 uppercase alphanumeric characters'
            },
            
            category: {
              bsonType: 'object',
              required: ['primary', 'path'],
              properties: {
                primary: {
                  enum: ['electronics', 'clothing', 'home_garden', 'books', 'sports', 'automotive', 'health', 'toys'],
                  description: 'Primary product category'
                },
                secondary: {
                  bsonType: 'string',
                  maxLength: 100,
                  description: 'Secondary category classification'
                },
                path: {
                  bsonType: 'array',
                  items: { bsonType: 'string' },
                  minItems: 1,
                  maxItems: 5,
                  description: 'Category hierarchy path'
                },
                tags: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'string',
                    pattern: '^[a-z0-9_-]+$',
                    maxLength: 50
                  },
                  maxItems: 20,
                  uniqueItems: true,
                  description: 'Product tags for search and filtering'
                }
              }
            },
            
            // Complex pricing structure with conditional validation
            pricing: {
              bsonType: 'object',
              required: ['base_price', 'currency', 'pricing_model'],
              additionalProperties: false,
              properties: {
                base_price: {
                  bsonType: 'decimal',
                  minimum: 0.01,
                  description: 'Base price must be positive'
                },
                currency: {
                  bsonType: 'string',
                  pattern: '^[A-Z]{3}$',
                  description: 'ISO 4217 currency code'
                },
                pricing_model: {
                  enum: ['fixed', 'tiered', 'subscription', 'auction', 'negotiable'],
                  description: 'Product pricing model'
                },
                
                // Conditional pricing based on model
                tier_pricing: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    required: ['min_quantity', 'price_per_unit'],
                    properties: {
                      min_quantity: {
                        bsonType: 'int',
                        minimum: 1
                      },
                      price_per_unit: {
                        bsonType: 'decimal',
                        minimum: 0.01
                      },
                      description: { bsonType: 'string', maxLength: 200 }
                    }
                  },
                  description: 'Tiered pricing structure (required if pricing_model is tiered)'
                },
                
                subscription_options: {
                  bsonType: 'object',
                  properties: {
                    billing_cycles: {
                      bsonType: 'array',
                      items: {
                        enum: ['monthly', 'quarterly', 'annually', 'biennial']
                      },
                      minItems: 1
                    },
                    trial_period_days: {
                      bsonType: 'int',
                      minimum: 0,
                      maximum: 365
                    }
                  },
                  required: ['billing_cycles'],
                  description: 'Subscription details (required if pricing_model is subscription)'
                },
                
                discounts: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    required: ['type', 'value', 'valid_from', 'valid_until'],
                    properties: {
                      type: {
                        enum: ['percentage', 'fixed_amount', 'buy_x_get_y'],
                        description: 'Type of discount'
                      },
                      value: {
                        bsonType: 'decimal',
                        minimum: 0,
                        description: 'Discount value (percentage or amount)'
                      },
                      min_purchase_amount: {
                        bsonType: 'decimal',
                        minimum: 0
                      },
                      valid_from: { bsonType: 'date' },
                      valid_until: { bsonType: 'date' },
                      max_uses: {
                        bsonType: 'int',
                        minimum: 1
                      },
                      code: {
                        bsonType: 'string',
                        pattern: '^[A-Z0-9]{4,20}$'
                      }
                    }
                  },
                  maxItems: 10
                }
              }
            },
            
            // Availability and inventory
            availability: {
              bsonType: 'object',
              required: ['status', 'stock_tracking'],
              properties: {
                status: {
                  enum: ['available', 'out_of_stock', 'discontinued', 'coming_soon', 'back_order'],
                  description: 'Product availability status'
                },
                stock_tracking: {
                  bsonType: 'object',
                  required: ['enabled'],
                  properties: {
                    enabled: { bsonType: 'bool' },
                    current_stock: {
                      bsonType: 'int',
                      minimum: 0,
                      description: 'Current stock quantity (required if tracking enabled)'
                    },
                    reserved_stock: {
                      bsonType: 'int',
                      minimum: 0,
                      description: 'Stock reserved for pending orders'
                    },
                    low_stock_threshold: {
                      bsonType: 'int',
                      minimum: 0,
                      description: 'Threshold for low stock alerts'
                    },
                    max_order_quantity: {
                      bsonType: 'int',
                      minimum: 1,
                      description: 'Maximum quantity per order'
                    }
                  }
                },
                estimated_delivery: {
                  bsonType: 'object',
                  properties: {
                    min_days: { bsonType: 'int', minimum: 0 },
                    max_days: { bsonType: 'int', minimum: 0 },
                    shipping_regions: {
                      bsonType: 'array',
                      items: {
                        bsonType: 'string',
                        pattern: '^[A-Z]{2}$'
                      }
                    }
                  }
                }
              }
            },
            
            // Product specifications with category-specific validation
            specifications: {
              bsonType: 'object',
              properties: {
                dimensions: {
                  bsonType: 'object',
                  required: ['unit'],
                  properties: {
                    length: { bsonType: 'decimal', minimum: 0 },
                    width: { bsonType: 'decimal', minimum: 0 },
                    height: { bsonType: 'decimal', minimum: 0 },
                    weight: { bsonType: 'decimal', minimum: 0 },
                    unit: {
                      enum: ['metric', 'imperial'],
                      description: 'Measurement unit system'
                    }
                  }
                },
                
                materials: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    required: ['name', 'percentage'],
                    properties: {
                      name: { bsonType: 'string', maxLength: 100 },
                      percentage: {
                        bsonType: 'decimal',
                        minimum: 0,
                        maximum: 100
                      },
                      certified: { bsonType: 'bool' },
                      certification: { bsonType: 'string', maxLength: 200 }
                    }
                  }
                },
                
                care_instructions: {
                  bsonType: 'array',
                  items: { bsonType: 'string', maxLength: 200 },
                  maxItems: 10
                },
                
                warranty: {
                  bsonType: 'object',
                  properties: {
                    duration_months: {
                      bsonType: 'int',
                      minimum: 0,
                      maximum: 600 // 50 years max
                    },
                    type: {
                      enum: ['manufacturer', 'store', 'extended', 'none']
                    },
                    coverage: {
                      bsonType: 'array',
                      items: {
                        enum: ['defects', 'wear_and_tear', 'accidental_damage', 'theft']
                      }
                    }
                  }
                },
                
                // Category-specific specifications (conditional validation)
                electronics: {
                  bsonType: 'object',
                  properties: {
                    brand: {
                      bsonType: 'string',
                      minLength: 2,
                      maxLength: 100,
                      description: 'Electronics must have a brand'
                    },
                    model: {
                      bsonType: 'string',
                      minLength: 1,
                      maxLength: 100,
                      description: 'Electronics must have a model'
                    },
                    power_requirements: {
                      bsonType: 'object',
                      properties: {
                        voltage: { bsonType: 'int', minimum: 1 },
                        wattage: { bsonType: 'int', minimum: 1 },
                        frequency: { bsonType: 'int', minimum: 50, maximum: 60 }
                      }
                    },
                    connectivity: {
                      bsonType: 'array',
                      items: {
                        enum: ['wifi', 'bluetooth', 'ethernet', 'usb', 'hdmi', 'aux', 'nfc']
                      }
                    }
                  }
                }
              }
            },
            
            // Quality and compliance
            quality_control: {
              bsonType: 'object',
              properties: {
                certifications: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    required: ['name', 'issuing_body', 'valid_until'],
                    properties: {
                      name: { bsonType: 'string', maxLength: 200 },
                      issuing_body: { bsonType: 'string', maxLength: 200 },
                      certificate_number: { bsonType: 'string', maxLength: 100 },
                      valid_until: { bsonType: 'date' },
                      document_url: { bsonType: 'string', maxLength: 500 }
                    }
                  }
                },
                safety_warnings: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    required: ['type', 'description'],
                    properties: {
                      type: {
                        enum: ['choking_hazard', 'electrical', 'chemical', 'fire', 'sharp_edges', 'other']
                      },
                      description: { bsonType: 'string', maxLength: 500 },
                      age_restriction: { bsonType: 'int', minimum: 0, maximum: 21 }
                    }
                  }
                }
              }
            },
            
            // Audit and metadata
            created_at: { bsonType: 'date' },
            updated_at: { bsonType: 'date' },
            created_by: { bsonType: 'objectId' },
            last_modified_by: { bsonType: 'objectId' },
            schema_version: {
              bsonType: 'string',
              pattern: '^\\d+\\.\\d+\\.\\d+$'
            }
          }
        }
      }, {
        validationLevel: 'strict',
        validationAction: 'error'
      });

      // Order validation with complex business rules
      await this.createValidatedCollection('orders', {
        $jsonSchema: {
          bsonType: 'object',
          title: 'Order Validation Schema',
          required: ['customer_id', 'items', 'totals', 'status', 'created_at'],
          additionalProperties: false,
          
          properties: {
            _id: { bsonType: 'objectId' },
            
            order_number: {
              bsonType: 'string',
              pattern: '^ORD-[0-9]{8}-[A-Z]{3}$',
              description: 'Order number format: ORD-12345678-ABC'
            },
            
            customer_id: {
              bsonType: 'objectId',
              description: 'Reference to customer profile'
            },
            
            // Order items with validation
            items: {
              bsonType: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                bsonType: 'object',
                required: ['product_id', 'quantity', 'unit_price', 'total_price'],
                additionalProperties: false,
                properties: {
                  product_id: { bsonType: 'objectId' },
                  product_name: { bsonType: 'string', maxLength: 500 },
                  sku: { bsonType: 'string' },
                  quantity: {
                    bsonType: 'int',
                    minimum: 1,
                    maximum: 1000
                  },
                  unit_price: {
                    bsonType: 'decimal',
                    minimum: 0
                  },
                  total_price: {
                    bsonType: 'decimal',
                    minimum: 0
                  },
                  discounts_applied: {
                    bsonType: 'array',
                    items: {
                      bsonType: 'object',
                      required: ['type', 'amount'],
                      properties: {
                        type: { bsonType: 'string' },
                        amount: { bsonType: 'decimal' },
                        code: { bsonType: 'string' }
                      }
                    }
                  },
                  customizations: {
                    bsonType: 'object',
                    description: 'Product customization options'
                  }
                }
              },
              description: 'Order must contain 1-100 items'
            },
            
            // Order totals with validation
            totals: {
              bsonType: 'object',
              required: ['subtotal', 'tax_amount', 'shipping_cost', 'total_amount', 'currency'],
              additionalProperties: false,
              properties: {
                subtotal: {
                  bsonType: 'decimal',
                  minimum: 0,
                  description: 'Subtotal before taxes and shipping'
                },
                tax_amount: {
                  bsonType: 'decimal',
                  minimum: 0,
                  description: 'Total tax amount'
                },
                tax_breakdown: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    required: ['type', 'rate', 'amount'],
                    properties: {
                      type: { bsonType: 'string', maxLength: 50 },
                      rate: { bsonType: 'decimal', minimum: 0, maximum: 1 },
                      amount: { bsonType: 'decimal', minimum: 0 }
                    }
                  }
                },
                shipping_cost: {
                  bsonType: 'decimal',
                  minimum: 0,
                  description: 'Shipping and handling cost'
                },
                discount_amount: {
                  bsonType: 'decimal',
                  minimum: 0,
                  description: 'Total discount amount'
                },
                total_amount: {
                  bsonType: 'decimal',
                  minimum: 0.01,
                  description: 'Final order total'
                },
                currency: {
                  bsonType: 'string',
                  pattern: '^[A-Z]{3}$',
                  description: 'ISO 4217 currency code'
                }
              }
            },
            
            // Order status workflow
            status: {
              bsonType: 'object',
              required: ['current', 'history'],
              additionalProperties: false,
              properties: {
                current: {
                  enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
                  description: 'Current order status'
                },
                history: {
                  bsonType: 'array',
                  minItems: 1,
                  items: {
                    bsonType: 'object',
                    required: ['status', 'timestamp'],
                    properties: {
                      status: {
                        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']
                      },
                      timestamp: { bsonType: 'date' },
                      notes: { bsonType: 'string', maxLength: 1000 },
                      updated_by: { bsonType: 'objectId' }
                    }
                  }
                }
              }
            },
            
            // Shipping information
            shipping: {
              bsonType: 'object',
              required: ['method', 'address'],
              properties: {
                method: {
                  bsonType: 'object',
                  required: ['carrier', 'service_type', 'estimated_delivery'],
                  properties: {
                    carrier: { bsonType: 'string', maxLength: 100 },
                    service_type: { bsonType: 'string', maxLength: 100 },
                    tracking_number: { bsonType: 'string', maxLength: 100 },
                    estimated_delivery: { bsonType: 'date' },
                    actual_delivery: { bsonType: 'date' }
                  }
                },
                address: {
                  bsonType: 'object',
                  required: ['recipient_name', 'street_address', 'city', 'country'],
                  properties: {
                    recipient_name: { bsonType: 'string', maxLength: 200 },
                    street_address: { bsonType: 'string', maxLength: 500 },
                    city: { bsonType: 'string', maxLength: 100 },
                    state_province: { bsonType: 'string', maxLength: 100 },
                    postal_code: { bsonType: 'string', maxLength: 20 },
                    country: {
                      bsonType: 'string',
                      pattern: '^[A-Z]{2}$',
                      description: 'ISO 3166-1 alpha-2 country code'
                    },
                    special_instructions: { bsonType: 'string', maxLength: 500 }
                  }
                }
              }
            },
            
            // Payment information
            payment: {
              bsonType: 'object',
              required: ['method', 'status'],
              properties: {
                method: {
                  enum: ['credit_card', 'debit_card', 'paypal', 'bank_transfer', 'digital_wallet', 'cryptocurrency', 'cash_on_delivery'],
                  description: 'Payment method used'
                },
                status: {
                  enum: ['pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded'],
                  description: 'Payment processing status'
                },
                transaction_id: { bsonType: 'string', maxLength: 200 },
                authorization_code: { bsonType: 'string', maxLength: 100 },
                payment_processor: { bsonType: 'string', maxLength: 100 },
                processed_at: { bsonType: 'date' },
                failure_reason: { bsonType: 'string', maxLength: 500 },
                refund_details: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    required: ['amount', 'reason', 'processed_at'],
                    properties: {
                      amount: { bsonType: 'decimal', minimum: 0 },
                      reason: { bsonType: 'string', maxLength: 500 },
                      processed_at: { bsonType: 'date' },
                      refund_id: { bsonType: 'string' }
                    }
                  }
                }
              }
            },
            
            // Audit trail
            created_at: { bsonType: 'date' },
            updated_at: { bsonType: 'date' },
            schema_version: {
              bsonType: 'string',
              pattern: '^\\d+\\.\\d+\\.\\d+$'
            }
          }
        }
      }, {
        validationLevel: 'strict',
        validationAction: 'error'
      });

      console.log('Advanced validation schemas created successfully');
      return true;

    } catch (error) {
      console.error('Error setting up validation collections:', error);
      throw error;
    }
  }

  async createValidatedCollection(collectionName, validationSchema, options = {}) {
    console.log(`Creating validated collection: ${collectionName}`);
    
    try {
      // Check if collection already exists
      const collections = await this.db.listCollections({ name: collectionName }).toArray();
      
      if (collections.length > 0) {
        console.log(`Collection ${collectionName} already exists, updating validation`);
        
        // Update existing collection validation
        await this.db.command({
          collMod: collectionName,
          validator: validationSchema,
          validationLevel: options.validationLevel || this.options.validationLevel,
          validationAction: options.validationAction || this.options.validationAction
        });
      } else {
        // Create new collection with validation
        await this.db.createCollection(collectionName, {
          validator: validationSchema,
          validationLevel: options.validationLevel || this.options.validationLevel,
          validationAction: options.validationAction || this.options.validationAction
        });
      }
      
      // Store schema for versioning
      this.validationSchemas.set(collectionName, {
        schema: validationSchema,
        version: options.version || '1.0.0',
        createdAt: new Date(),
        ...options
      });
      
      console.log(`Validation schema applied to collection: ${collectionName}`);
      return true;
      
    } catch (error) {
      console.error(`Error creating validated collection ${collectionName}:`, error);
      throw error;
    }
  }

  async validateDocument(collectionName, document) {
    console.log(`Validating document for collection: ${collectionName}`);
    
    try {
      const schema = this.validationSchemas.get(collectionName);
      if (!schema) {
        throw new Error(`No validation schema found for collection: ${collectionName}`);
      }
      
      // Perform pre-validation checks
      const preValidationResult = await this.performPreValidation(collectionName, document);
      if (!preValidationResult.valid) {
        this.validationMetrics.validationsFailed++;
        return {
          valid: false,
          errors: preValidationResult.errors,
          warnings: preValidationResult.warnings || []
        };
      }
      
      // Test document against schema by attempting insertion with validation
      const testCollection = this.db.collection(collectionName);
      
      try {
        // Use a transaction to test validation without persisting
        const session = this.db.client.startSession();
        
        await session.withTransaction(async () => {
          await testCollection.insertOne(document, { session });
          // Abort transaction to avoid persisting test document
          await session.abortTransaction();
        });
        
        await session.endSession();
        
        this.validationMetrics.validationsPassed++;
        return {
          valid: true,
          errors: [],
          warnings: preValidationResult.warnings || []
        };
        
      } catch (validationError) {
        this.validationMetrics.validationsFailed++;
        this.validationMetrics.validationErrors.push({
          collection: collectionName,
          error: validationError.message,
          document: document,
          timestamp: new Date()
        });
        
        return {
          valid: false,
          errors: [this.parseValidationError(validationError)],
          warnings: preValidationResult.warnings || []
        };
      }
      
    } catch (error) {
      console.error(`Error validating document:`, error);
      return {
        valid: false,
        errors: [`Validation system error: ${error.message}`],
        warnings: []
      };
    }
  }

  async performPreValidation(collectionName, document) {
    // Custom pre-validation logic for business rules
    const warnings = [];
    const errors = [];
    
    if (collectionName === 'products') {
      // Category-specific validation
      if (document.category?.primary === 'electronics' && !document.specifications?.electronics) {
        errors.push('Electronics products must include electronics specifications');
      }
      
      // Pricing model validation
      if (document.pricing?.pricing_model === 'tiered' && !document.pricing?.tier_pricing) {
        errors.push('Tiered pricing model requires tier_pricing configuration');
      }
      
      if (document.pricing?.pricing_model === 'subscription' && !document.pricing?.subscription_options) {
        errors.push('Subscription pricing model requires subscription_options configuration');
      }
      
      // Stock validation
      if (document.availability?.stock_tracking?.enabled && 
          document.availability?.stock_tracking?.current_stock === undefined) {
        errors.push('Stock tracking enabled but current_stock not provided');
      }
      
      // Price validation by category
      if (document.category?.primary === 'electronics' && document.pricing?.base_price < 1.00) {
        warnings.push('Electronics products with price below $1.00 are unusual');
      }
      
      // Warranty validation
      if (document.specifications?.warranty?.duration_months > 120) {
        warnings.push('Warranty period over 10 years is unusual');
      }
    }
    
    if (collectionName === 'orders') {
      // Order total validation
      const itemsTotal = document.items?.reduce((sum, item) => sum + parseFloat(item.total_price), 0) || 0;
      const calculatedTotal = itemsTotal + parseFloat(document.totals?.tax_amount || 0) + 
                             parseFloat(document.totals?.shipping_cost || 0) - 
                             parseFloat(document.totals?.discount_amount || 0);
      
      if (Math.abs(calculatedTotal - parseFloat(document.totals?.total_amount || 0)) > 0.01) {
        errors.push('Order total calculation does not match sum of items, tax, and shipping');
      }
      
      // Status workflow validation
      if (document.status?.current === 'delivered' && !document.shipping?.method?.actual_delivery) {
        warnings.push('Order marked as delivered but no actual delivery date provided');
      }
      
      if (document.payment?.status === 'failed' && document.status?.current !== 'cancelled') {
        errors.push('Order with failed payment must be cancelled');
      }
    }
    
    if (collectionName === 'user_profiles') {
      // Age and contact validation
      if (document.age && document.age < 18 && document.contact_info?.phone) {
        warnings.push('Phone contact for users under 18 may require parental consent');
      }
      
      // Privacy compliance validation
      if (document.preferences?.privacy?.data_processing_consent?.marketing && 
          !document.preferences?.privacy?.data_processing_consent?.given_at) {
        errors.push('Marketing consent requires timestamp when consent was given');
      }
      
      // Security settings validation
      if (document.security?.two_factor_enabled && !document.security?.backup_codes) {
        warnings.push('Two-factor authentication enabled but no backup codes provided');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  parseValidationError(error) {
    // Parse MongoDB validation error messages into user-friendly format
    let message = error.message;
    
    // Extract specific field errors from MongoDB validation messages
    const fieldMatch = message.match(/Document failed validation.*properties\.(\w+)/);
    if (fieldMatch) {
      const field = fieldMatch[1];
      return `Validation failed for field '${field}': ${message}`;
    }
    
    // Extract type errors
    const typeMatch = message.match(/Expected type (\w+) but found (\w+)/);
    if (typeMatch) {
      return `Type mismatch: Expected ${typeMatch[1]} but received ${typeMatch[2]}`;
    }
    
    // Extract pattern errors
    const patternMatch = message.match(/String does not match regex pattern/);
    if (patternMatch) {
      return 'Value does not match required format pattern';
    }
    
    return message;
  }

  async getValidationMetrics(collectionName = null) {
    const metrics = {
      ...this.validationMetrics,
      collectionsWithValidation: this.validationSchemas.size,
      schemas: {}
    };
    
    // Add schema-specific metrics
    for (const [name, schema] of this.validationSchemas.entries()) {
      if (!collectionName || name === collectionName) {
        metrics.schemas[name] = {
          version: schema.version,
          createdAt: schema.createdAt,
          validationLevel: schema.validationLevel,
          validationAction: schema.validationAction
        };
      }
    }
    
    // Add recent validation errors
    if (collectionName) {
      metrics.recentErrors = this.validationMetrics.validationErrors
        .filter(error => error.collection === collectionName)
        .slice(-10);
    } else {
      metrics.recentErrors = this.validationMetrics.validationErrors.slice(-20);
    }
    
    return metrics;
  }

  async updateValidationSchema(collectionName, newSchema, version) {
    console.log(`Updating validation schema for collection: ${collectionName}`);
    
    try {
      // Backup current schema
      const currentSchema = this.validationSchemas.get(collectionName);
      if (currentSchema) {
        await this.backupSchema(collectionName, currentSchema);
      }
      
      // Update collection validation
      await this.db.command({
        collMod: collectionName,
        validator: newSchema,
        validationLevel: this.options.validationLevel,
        validationAction: this.options.validationAction
      });
      
      // Update stored schema
      this.validationSchemas.set(collectionName, {
        schema: newSchema,
        version: version,
        createdAt: new Date(),
        previousVersion: currentSchema?.version
      });
      
      console.log(`Schema updated for collection: ${collectionName} to version: ${version}`);
      return true;
      
    } catch (error) {
      console.error(`Error updating schema for ${collectionName}:`, error);
      throw error;
    }
  }

  async backupSchema(collectionName, schema) {
    // Store schema backup for rollback purposes
    const backupCollection = this.db.collection('_schema_backups');
    
    await backupCollection.insertOne({
      collectionName: collectionName,
      schema: schema,
      backedUpAt: new Date()
    });
    
    console.log(`Schema backed up for collection: ${collectionName}`);
  }

  async generateValidationReport() {
    console.log('Generating comprehensive validation report...');
    
    const report = {
      reportId: require('crypto').randomUUID(),
      generatedAt: new Date(),
      
      // Overall metrics
      overview: {
        totalCollectionsWithValidation: this.validationSchemas.size,
        totalValidationsPassed: this.validationMetrics.validationsPassed,
        totalValidationsFailed: this.validationMetrics.validationsFailed,
        successRate: this.validationMetrics.validationsPassed + this.validationMetrics.validationsFailed > 0 ?
          (this.validationMetrics.validationsPassed / (this.validationMetrics.validationsPassed + this.validationMetrics.validationsFailed) * 100).toFixed(2) :
          0,
        lastUpdated: this.validationMetrics.lastUpdated
      },
      
      // Collection-specific details
      collections: {},
      
      // Error analysis
      errorAnalysis: {
        totalErrors: this.validationMetrics.validationErrors.length,
        errorsByCollection: {},
        commonErrors: {},
        recentErrors: this.validationMetrics.validationErrors.slice(-10)
      },
      
      // Recommendations
      recommendations: []
    };
    
    // Analyze each collection
    for (const [collectionName, schema] of this.validationSchemas.entries()) {
      const collectionErrors = this.validationMetrics.validationErrors
        .filter(error => error.collection === collectionName);
      
      report.collections[collectionName] = {
        schemaVersion: schema.version,
        validationLevel: schema.validationLevel,
        validationAction: schema.validationAction,
        errorCount: collectionErrors.length,
        lastError: collectionErrors.length > 0 ? collectionErrors[collectionErrors.length - 1] : null
      };
      
      report.errorAnalysis.errorsByCollection[collectionName] = collectionErrors.length;
      
      // Generate recommendations
      if (collectionErrors.length > 10) {
        report.recommendations.push({
          type: 'high_error_rate',
          collection: collectionName,
          message: `Collection ${collectionName} has ${collectionErrors.length} validation errors. Consider reviewing schema requirements.`
        });
      }
      
      if (schema.validationLevel === 'moderate') {
        report.recommendations.push({
          type: 'validation_level',
          collection: collectionName,
          message: `Collection ${collectionName} uses moderate validation. Consider upgrading to strict for better data integrity.`
        });
      }
    }
    
    // Analyze common error patterns
    const errorMessages = this.validationMetrics.validationErrors.map(error => error.error);
    const errorCounts = {};
    errorMessages.forEach(msg => {
      const key = msg.substring(0, 50) + '...';
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });
    
    report.errorAnalysis.commonErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [key, count]) => ({ ...obj, [key]: count }), {});
    
    return report;
  }
}

// Example usage and testing
const validationSystem = new MongoDBSchemaValidator(db, {
  validationLevel: 'strict',
  validationAction: 'error',
  enableVersioning: true,
  enableMetrics: true
});

// Benefits of MongoDB Schema Validation:
// - Database-level data integrity enforcement
// - Flexible validation rules with conditional logic
// - Support for complex nested document validation
// - Real-time validation with detailed error reporting
// - Schema versioning and migration capabilities
// - Business rule enforcement at the database level
// - Integration with application development workflows
// - Comprehensive validation metrics and reporting
// - Support for gradual migration and validation levels
// - Advanced error handling and user-friendly feedback

module.exports = {
  MongoDBSchemaValidator
};
```

## Understanding MongoDB Schema Validation Architecture

### Advanced Validation Patterns and Business Rule Enforcement

Implement sophisticated validation strategies for production MongoDB deployments:

```javascript
// Production-ready MongoDB Schema Validation with advanced business rules
class ProductionSchemaValidationManager extends MongoDBSchemaValidator {
  constructor(db, productionConfig) {
    super(db, productionConfig);
    
    this.productionConfig = {
      ...productionConfig,
      enableConditionalValidation: true,
      enableCrossCollectionValidation: true,
      enableDataMigration: true,
      enableComplianceValidation: true,
      enablePerformanceOptimization: true
    };
    
    this.setupProductionValidationFeatures();
    this.initializeComplianceFrameworks();
    this.setupValidationMiddleware();
  }

  async implementAdvancedValidationPatterns() {
    console.log('Implementing advanced validation patterns...');
    
    // Conditional validation based on document context
    const conditionalValidationRules = {
      // User profile validation based on account type
      userProfileConditional: {
        $or: [
          {
            profile_type: 'individual',
            $and: [
              { age: { $gte: 13 } },
              { full_name: { $exists: true } }
            ]
          },
          {
            profile_type: 'business',
            $and: [
              { business_info: { $exists: true } },
              { 'business_info.registration_number': { $exists: true } },
              { 'business_info.tax_id': { $exists: true } }
            ]
          },
          {
            profile_type: 'organization',
            $and: [
              { organization_info: { $exists: true } },
              { 'organization_info.type': { $in: ['nonprofit', 'government', 'educational'] } }
            ]
          }
        ]
      },
      
      // Product validation based on category
      productCategoryConditional: {
        $or: [
          {
            'category.primary': 'electronics',
            $and: [
              { 'specifications.electronics.brand': { $exists: true } },
              { 'specifications.electronics.model': { $exists: true } },
              { 'specifications.warranty.duration_months': { $gte: 12 } }
            ]
          },
          {
            'category.primary': 'clothing',
            $and: [
              { 'specifications.materials': { $exists: true } },
              { 'specifications.care_instructions': { $exists: true } }
            ]
          },
          {
            'category.primary': { $in: ['food', 'supplements'] },
            $and: [
              { 'specifications.nutrition_facts': { $exists: true } },
              { 'specifications.allergen_info': { $exists: true } },
              { expiration_date: { $exists: true } }
            ]
          }
        ]
      }
    };

    return await this.deployConditionalValidationRules(conditionalValidationRules);
  }

  async setupComplianceValidationFrameworks() {
    console.log('Setting up compliance validation frameworks...');
    
    const complianceFrameworks = {
      // GDPR compliance validation
      gdprCompliance: {
        userDataProcessing: {
          $and: [
            { 'preferences.privacy.data_processing_consent.given_at': { $exists: true } },
            { 'preferences.privacy.data_processing_consent.ip_address': { $exists: true } },
            { 'preferences.privacy.data_processing_consent.analytics': { $type: 'bool' } },
            { 'preferences.privacy.data_processing_consent.marketing': { $type: 'bool' } }
          ]
        },
        dataRetention: {
          $or: [
            { account_status: 'active' },
            { 
              $and: [
                { account_status: 'closed' },
                { data_retention_expiry: { $gte: new Date() } }
              ]
            }
          ]
        }
      },
      
      // PCI DSS compliance for payment data
      pciCompliance: {
        paymentDataHandling: {
          $and: [
            { 'payment.card_number': { $exists: false } }, // No plain text card numbers
            { 'payment.cvv': { $exists: false } }, // No CVV storage
            { 'payment.transaction_id': { $exists: true } },
            { 'payment.payment_processor': { $exists: true } }
          ]
        }
      },
      
      // SOX compliance for financial records
      soxCompliance: {
        financialRecordIntegrity: {
          $and: [
            { audit_trail: { $exists: true } },
            { 'audit_trail.created_by': { $exists: true } },
            { 'audit_trail.last_modified_by': { $exists: true } },
            { 'audit_trail.approval_chain': { $exists: true } }
          ]
        }
      }
    };

    return await this.implementComplianceFrameworks(complianceFrameworks);
  }

  async performCrossCollectionValidation(collectionName, document) {
    console.log(`Performing cross-collection validation for: ${collectionName}`);
    
    const crossValidationRules = [];
    
    if (collectionName === 'orders') {
      // Validate customer exists
      const customer = await this.db.collection('user_profiles')
        .findOne({ _id: document.customer_id });
      
      if (!customer) {
        crossValidationRules.push({
          field: 'customer_id',
          error: 'Customer does not exist'
        });
      } else if (customer.account_status?.status !== 'active') {
        crossValidationRules.push({
          field: 'customer_id',
          error: 'Customer account is not active'
        });
      }
      
      // Validate products exist and are available
      for (const item of document.items || []) {
        const product = await this.db.collection('products')
          .findOne({ _id: item.product_id });
        
        if (!product) {
          crossValidationRules.push({
            field: `items.product_id`,
            error: `Product ${item.product_id} does not exist`
          });
        } else {
          // Check product availability
          if (product.availability?.status !== 'available') {
            crossValidationRules.push({
              field: `items.product_id`,
              error: `Product ${product.name} is not available`
            });
          }
          
          // Check stock if tracking is enabled
          if (product.availability?.stock_tracking?.enabled) {
            const availableStock = product.availability.stock_tracking.current_stock - 
                                  (product.availability.stock_tracking.reserved_stock || 0);
            
            if (item.quantity > availableStock) {
              crossValidationRules.push({
                field: `items.quantity`,
                error: `Insufficient stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}`
              });
            }
          }
          
          // Validate pricing consistency
          if (Math.abs(parseFloat(item.unit_price) - parseFloat(product.pricing.base_price)) > 0.01) {
            crossValidationRules.push({
              field: `items.unit_price`,
              warning: `Unit price for ${product.name} may be outdated`
            });
          }
        }
      }
    }
    
    if (collectionName === 'user_profiles') {
      // Check for duplicate email addresses
      const existingUser = await this.db.collection('user_profiles')
        .findOne({ 
          email: document.email,
          _id: { $ne: document._id }
        });
      
      if (existingUser) {
        crossValidationRules.push({
          field: 'email',
          error: 'Email address is already registered'
        });
      }
      
      // Check for duplicate usernames
      const existingUsername = await this.db.collection('user_profiles')
        .findOne({ 
          username: document.username,
          _id: { $ne: document._id }
        });
      
      if (existingUsername) {
        crossValidationRules.push({
          field: 'username',
          error: 'Username is already taken'
        });
      }
    }
    
    return {
      valid: crossValidationRules.filter(rule => rule.error).length === 0,
      errors: crossValidationRules.filter(rule => rule.error),
      warnings: crossValidationRules.filter(rule => rule.warning)
    };
  }

  async implementDataMigrationValidation() {
    console.log('Implementing data migration validation strategies...');
    
    const migrationStrategies = {
      // Gradual validation rollout
      gradualValidation: {
        phase1: { validationLevel: 'off' }, // No validation
        phase2: { validationLevel: 'moderate', validationAction: 'warn' }, // Warnings only
        phase3: { validationLevel: 'moderate', validationAction: 'error' }, // Moderate validation
        phase4: { validationLevel: 'strict', validationAction: 'error' } // Full validation
      },
      
      // Schema version migration
      schemaVersioning: {
        v1_to_v2: {
          transformationRules: {
            'old_field': 'new_field',
            'deprecated_structure': 'new_structure'
          },
          validationOverrides: {
            allowMissingFields: ['optional_new_field'],
            temporaryRules: {
              'legacy_format': { $exists: true }
            }
          }
        }
      },
      
      // Data quality improvement
      dataQualityEnforcement: {
        cleanupRules: [
          { field: 'email', action: 'trim_and_lowercase' },
          { field: 'phone', action: 'normalize_format' },
          { field: 'tags', action: 'remove_duplicates' }
        ],
        enrichmentRules: [
          { field: 'created_at', action: 'set_if_missing', value: new Date() },
          { field: 'schema_version', action: 'set_current_version' }
        ]
      }
    };

    return await this.deployMigrationStrategies(migrationStrategies);
  }
}
```

## SQL-Style Schema Validation with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB schema validation and data integrity operations:

```sql
-- QueryLeaf advanced schema validation with SQL-familiar syntax

-- Create collections with comprehensive validation rules
CREATE COLLECTION user_profiles
WITH VALIDATION (
  -- Basic field requirements and types
  email VARCHAR(320) NOT NULL UNIQUE 
    PATTERN '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
  username VARCHAR(30) NOT NULL UNIQUE 
    PATTERN '^[a-zA-Z0-9_-]{3,30}$',
  full_name VARCHAR(200) NOT NULL,
  profile_type ENUM('individual', 'business', 'organization', 'developer') NOT NULL,
  age INT CHECK (age >= 13 AND age <= 150),
  
  -- Complex nested object validation
  account_status OBJECT (
    status ENUM('active', 'inactive', 'suspended', 'pending_verification', 'closed') NOT NULL,
    last_updated DATETIME NOT NULL,
    reason VARCHAR(500),
    updated_by OBJECTID
  ) NOT NULL,
  
  -- Contact information with regional validation
  contact_info OBJECT (
    phone OBJECT (
      country_code VARCHAR(5) PATTERN '^\+[1-9][0-9]{0,3}$' NOT NULL,
      number VARCHAR(15) PATTERN '^[0-9]{7,15}$' NOT NULL,
      verified BOOLEAN NOT NULL,
      verified_at DATETIME
    ),
    address OBJECT (
      street VARCHAR(200),
      city VARCHAR(100) NOT NULL,
      state_province VARCHAR(100),
      postal_code VARCHAR(20),
      country CHAR(2) PATTERN '^[A-Z]{2}$' NOT NULL
    )
  ),
  
  -- Nested preferences with conditional validation
  preferences OBJECT (
    notifications OBJECT (
      email OBJECT (
        enabled BOOLEAN NOT NULL,
        frequency ENUM('immediate', 'daily', 'weekly', 'never'),
        categories ARRAY OF ENUM('security', 'marketing', 'product_updates', 'billing') UNIQUE
      ) NOT NULL,
      push OBJECT (
        enabled BOOLEAN NOT NULL,
        quiet_hours OBJECT (
          enabled BOOLEAN NOT NULL,
          start_time TIME PATTERN '^([01]?[0-9]|2[0-3]):[0-5][0-9]$',
          end_time TIME PATTERN '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
        )
      ) NOT NULL,
      sms OBJECT (
        enabled BOOLEAN NOT NULL,
        emergency_only BOOLEAN
      ) NOT NULL
    ),
    privacy OBJECT (
      profile_visibility ENUM('public', 'friends_only', 'private') NOT NULL,
      search_visibility BOOLEAN,
      data_processing_consent OBJECT (
        analytics BOOLEAN NOT NULL,
        marketing BOOLEAN NOT NULL,
        third_party_sharing BOOLEAN,
        given_at DATETIME NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT
      ) NOT NULL
    ) NOT NULL
  ),
  
  -- Security settings
  security OBJECT (
    two_factor_enabled BOOLEAN,
    backup_codes ARRAY OF VARCHAR(8) PATTERN '^[A-Z0-9]{8}$' MAX_SIZE 10 UNIQUE,
    security_questions ARRAY OF OBJECT (
      question VARCHAR(200) NOT NULL,
      answer_hash VARCHAR(255) NOT NULL,
      created_at DATETIME
    ) MAX_SIZE 5
  ),
  
  -- Audit fields
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE,
  created_by OBJECTID,
  schema_version VARCHAR(10) PATTERN '^\d+\.\d+\.\d+$'
  
) WITH (
  validation_level = 'strict',
  validation_action = 'error',
  additional_properties = false
);

-- Product collection with category-specific conditional validation
CREATE COLLECTION products
WITH VALIDATION (
  name VARCHAR(500) NOT NULL,
  description TEXT MAX_LENGTH 5000,
  sku VARCHAR(20) PATTERN '^[A-Z0-9]{3,20}$' UNIQUE,
  
  -- Category with hierarchical structure
  category OBJECT (
    primary ENUM('electronics', 'clothing', 'home_garden', 'books', 'sports', 'automotive', 'health', 'toys') NOT NULL,
    secondary VARCHAR(100),
    path ARRAY OF VARCHAR(100) MIN_SIZE 1 MAX_SIZE 5 NOT NULL,
    tags ARRAY OF VARCHAR(50) PATTERN '^[a-z0-9_-]+$' MAX_SIZE 20 UNIQUE
  ) NOT NULL,
  
  -- Complex pricing structure
  pricing OBJECT (
    base_price DECIMAL(10,2) CHECK (base_price > 0) NOT NULL,
    currency CHAR(3) PATTERN '^[A-Z]{3}$' NOT NULL,
    pricing_model ENUM('fixed', 'tiered', 'subscription', 'auction', 'negotiable') NOT NULL,
    
    -- Conditional validation based on pricing model
    tier_pricing ARRAY OF OBJECT (
      min_quantity INT CHECK (min_quantity >= 1) NOT NULL,
      price_per_unit DECIMAL(10,2) CHECK (price_per_unit > 0) NOT NULL,
      description VARCHAR(200)
    ) -- Required when pricing_model = 'tiered'
    CHECK (
      (pricing_model != 'tiered') OR 
      (pricing_model = 'tiered' AND tier_pricing IS NOT NULL AND ARRAY_LENGTH(tier_pricing) > 0)
    ),
    
    subscription_options OBJECT (
      billing_cycles ARRAY OF ENUM('monthly', 'quarterly', 'annually', 'biennial') MIN_SIZE 1 NOT NULL,
      trial_period_days INT CHECK (trial_period_days >= 0 AND trial_period_days <= 365)
    ) -- Required when pricing_model = 'subscription'
    CHECK (
      (pricing_model != 'subscription') OR 
      (pricing_model = 'subscription' AND subscription_options IS NOT NULL)
    ),
    
    discounts ARRAY OF OBJECT (
      type ENUM('percentage', 'fixed_amount', 'buy_x_get_y') NOT NULL,
      value DECIMAL(8,2) CHECK (value >= 0) NOT NULL,
      min_purchase_amount DECIMAL(10,2) CHECK (min_purchase_amount >= 0),
      valid_from DATETIME NOT NULL,
      valid_until DATETIME NOT NULL,
      max_uses INT CHECK (max_uses >= 1),
      code VARCHAR(20) PATTERN '^[A-Z0-9]{4,20}$',
      CHECK (valid_until > valid_from)
    ) MAX_SIZE 10
  ) NOT NULL,
  
  -- Availability and inventory
  availability OBJECT (
    status ENUM('available', 'out_of_stock', 'discontinued', 'coming_soon', 'back_order') NOT NULL,
    stock_tracking OBJECT (
      enabled BOOLEAN NOT NULL,
      current_stock INT CHECK (current_stock >= 0), -- Required when enabled = true
      reserved_stock INT CHECK (reserved_stock >= 0),
      low_stock_threshold INT CHECK (low_stock_threshold >= 0),
      max_order_quantity INT CHECK (max_order_quantity >= 1),
      CHECK (
        (enabled = false) OR 
        (enabled = true AND current_stock IS NOT NULL)
      )
    ) NOT NULL
  ) NOT NULL,
  
  -- Category-specific specifications with conditional validation
  specifications OBJECT (
    -- Electronics-specific fields (required when category.primary = 'electronics')
    electronics OBJECT (
      brand VARCHAR(100) NOT NULL,
      model VARCHAR(100) NOT NULL,
      power_requirements OBJECT (
        voltage INT CHECK (voltage > 0),
        wattage INT CHECK (wattage > 0),
        frequency INT CHECK (frequency IN (50, 60))
      ),
      connectivity ARRAY OF ENUM('wifi', 'bluetooth', 'ethernet', 'usb', 'hdmi', 'aux', 'nfc')
    ) CHECK (
      (category.primary != 'electronics') OR 
      (category.primary = 'electronics' AND electronics IS NOT NULL)
    ),
    
    -- Clothing-specific fields (required when category.primary = 'clothing')
    clothing OBJECT (
      sizes ARRAY OF VARCHAR(10) MIN_SIZE 1 NOT NULL,
      colors ARRAY OF VARCHAR(50) MIN_SIZE 1 NOT NULL,
      materials ARRAY OF OBJECT (
        name VARCHAR(100) NOT NULL,
        percentage DECIMAL(5,2) CHECK (percentage > 0 AND percentage <= 100) NOT NULL
      ) NOT NULL,
      care_instructions ARRAY OF VARCHAR(200) MAX_SIZE 10
    ) CHECK (
      (category.primary != 'clothing') OR 
      (category.primary = 'clothing' AND clothing IS NOT NULL)
    ),
    
    -- Common specifications for all products
    dimensions OBJECT (
      length DECIMAL(8,2) CHECK (length > 0),
      width DECIMAL(8,2) CHECK (width > 0),
      height DECIMAL(8,2) CHECK (height > 0),
      weight DECIMAL(8,2) CHECK (weight > 0),
      unit ENUM('metric', 'imperial') NOT NULL
    ),
    
    warranty OBJECT (
      duration_months INT CHECK (duration_months >= 0 AND duration_months <= 600),
      type ENUM('manufacturer', 'store', 'extended', 'none'),
      coverage ARRAY OF ENUM('defects', 'wear_and_tear', 'accidental_damage', 'theft')
    )
  ),
  
  -- Quality and compliance
  quality_control OBJECT (
    certifications ARRAY OF OBJECT (
      name VARCHAR(200) NOT NULL,
      issuing_body VARCHAR(200) NOT NULL,
      certificate_number VARCHAR(100),
      valid_until DATETIME NOT NULL,
      document_url TEXT
    ),
    safety_warnings ARRAY OF OBJECT (
      type ENUM('choking_hazard', 'electrical', 'chemical', 'fire', 'sharp_edges', 'other') NOT NULL,
      description VARCHAR(500) NOT NULL,
      age_restriction INT CHECK (age_restriction >= 0 AND age_restriction <= 21)
    )
  ),
  
  -- Audit trail
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE,
  created_by OBJECTID,
  last_modified_by OBJECTID,
  schema_version VARCHAR(10) PATTERN '^\d+\.\d+\.\d+$'
  
) WITH (
  validation_level = 'strict',
  validation_action = 'error'
);

-- Order collection with complex business rule validation
CREATE COLLECTION orders
WITH VALIDATION (
  order_number VARCHAR(20) PATTERN '^ORD-[0-9]{8}-[A-Z]{3}$' UNIQUE,
  customer_id OBJECTID NOT NULL REFERENCES user_profiles(_id),
  
  -- Order items with item-level validation
  items ARRAY OF OBJECT (
    product_id OBJECTID NOT NULL REFERENCES products(_id),
    product_name VARCHAR(500),
    sku VARCHAR(20),
    quantity INT CHECK (quantity >= 1 AND quantity <= 1000) NOT NULL,
    unit_price DECIMAL(10,2) CHECK (unit_price >= 0) NOT NULL,
    total_price DECIMAL(10,2) CHECK (total_price >= 0) NOT NULL,
    
    -- Validate that total_price = quantity * unit_price
    CHECK (ABS(total_price - (quantity * unit_price)) < 0.01),
    
    discounts_applied ARRAY OF OBJECT (
      type VARCHAR(50) NOT NULL,
      amount DECIMAL(8,2) NOT NULL,
      code VARCHAR(20)
    ),
    customizations OBJECT
  ) MIN_SIZE 1 MAX_SIZE 100 NOT NULL,
  
  -- Order totals with cross-field validation
  totals OBJECT (
    subtotal DECIMAL(10,2) CHECK (subtotal >= 0) NOT NULL,
    tax_amount DECIMAL(10,2) CHECK (tax_amount >= 0) NOT NULL,
    shipping_cost DECIMAL(10,2) CHECK (shipping_cost >= 0) NOT NULL,
    discount_amount DECIMAL(10,2) CHECK (discount_amount >= 0),
    total_amount DECIMAL(10,2) CHECK (total_amount >= 0.01) NOT NULL,
    currency CHAR(3) PATTERN '^[A-Z]{3}$' NOT NULL,
    
    tax_breakdown ARRAY OF OBJECT (
      type VARCHAR(50) NOT NULL,
      rate DECIMAL(6,4) CHECK (rate >= 0 AND rate <= 1) NOT NULL,
      amount DECIMAL(10,2) CHECK (amount >= 0) NOT NULL
    ),
    
    -- Validate total calculation
    CHECK (
      ABS(total_amount - (subtotal + tax_amount + shipping_cost - COALESCE(discount_amount, 0))) < 0.01
    )
  ) NOT NULL,
  
  -- Order status with workflow validation
  status OBJECT (
    current ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') NOT NULL,
    history ARRAY OF OBJECT (
      status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') NOT NULL,
      timestamp DATETIME NOT NULL,
      notes TEXT,
      updated_by OBJECTID
    ) MIN_SIZE 1 NOT NULL
  ) NOT NULL,
  
  -- Shipping information
  shipping OBJECT (
    method OBJECT (
      carrier VARCHAR(100) NOT NULL,
      service_type VARCHAR(100) NOT NULL,
      tracking_number VARCHAR(100),
      estimated_delivery DATETIME NOT NULL,
      actual_delivery DATETIME,
      CHECK (actual_delivery IS NULL OR actual_delivery >= estimated_delivery)
    ) NOT NULL,
    address OBJECT (
      recipient_name VARCHAR(200) NOT NULL,
      street_address VARCHAR(500) NOT NULL,
      city VARCHAR(100) NOT NULL,
      state_province VARCHAR(100),
      postal_code VARCHAR(20),
      country CHAR(2) PATTERN '^[A-Z]{2}$' NOT NULL,
      special_instructions TEXT
    ) NOT NULL
  ),
  
  -- Payment information with validation
  payment OBJECT (
    method ENUM('credit_card', 'debit_card', 'paypal', 'bank_transfer', 'digital_wallet', 'cryptocurrency', 'cash_on_delivery') NOT NULL,
    status ENUM('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded') NOT NULL,
    transaction_id VARCHAR(200),
    authorization_code VARCHAR(100),
    payment_processor VARCHAR(100),
    processed_at DATETIME,
    failure_reason TEXT,
    
    refund_details ARRAY OF OBJECT (
      amount DECIMAL(10,2) CHECK (amount > 0) NOT NULL,
      reason TEXT NOT NULL,
      processed_at DATETIME NOT NULL,
      refund_id VARCHAR(100)
    ),
    
    -- Business rule: failed payments must result in cancelled orders
    CHECK (
      (status != 'failed') OR 
      (status = 'failed' AND status.current = 'cancelled')
    )
  ),
  
  -- Audit fields
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE,
  schema_version VARCHAR(10) PATTERN '^\d+\.\d+\.\d+$'
  
) WITH (
  validation_level = 'strict',
  validation_action = 'error'
);

-- Data validation analysis and reporting queries

-- Comprehensive validation status report
WITH validation_metrics AS (
  SELECT 
    collection_name,
    validation_level,
    validation_action,
    schema_version,
    
    -- Document count and validation statistics
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE validation_passed = true) as valid_documents,
    COUNT(*) FILTER (WHERE validation_passed = false) as invalid_documents,
    
    -- Calculate data quality score
    (COUNT(*) FILTER (WHERE validation_passed = true)::numeric / COUNT(*)) * 100 as data_quality_percent,
    
    -- Validation error analysis
    COUNT(DISTINCT validation_error_type) as unique_error_types,
    MODE() WITHIN GROUP (ORDER BY validation_error_type) as most_common_error,
    
    -- Recent validation trends
    COUNT(*) FILTER (WHERE validated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as validations_last_24h,
    COUNT(*) FILTER (WHERE validation_passed = false AND validated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as errors_last_24h
    
  FROM VALIDATION_RESULTS()
  GROUP BY collection_name, validation_level, validation_action, schema_version
),

validation_error_details AS (
  SELECT 
    collection_name,
    validation_error_type,
    validation_error_field,
    COUNT(*) as error_frequency,
    AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - first_occurred))) as avg_age_seconds,
    array_agg(
      json_build_object(
        'document_id', document_id,
        'error_message', validation_error_message,
        'occurred_at', occurred_at
      ) ORDER BY occurred_at DESC
    )[1:5] as recent_examples
    
  FROM VALIDATION_ERRORS()
  WHERE occurred_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
  GROUP BY collection_name, validation_error_type, validation_error_field
),

collection_health_assessment AS (
  SELECT 
    vm.collection_name,
    vm.total_documents,
    vm.data_quality_percent,
    vm.validations_last_24h,
    vm.errors_last_24h,
    
    -- Health status determination
    CASE 
      WHEN vm.data_quality_percent >= 99.5 THEN 'EXCELLENT'
      WHEN vm.data_quality_percent >= 95.0 THEN 'GOOD'
      WHEN vm.data_quality_percent >= 90.0 THEN 'FAIR'
      WHEN vm.data_quality_percent >= 80.0 THEN 'POOR'
      ELSE 'CRITICAL'
    END as health_status,
    
    -- Trending analysis
    CASE 
      WHEN vm.errors_last_24h = 0 THEN 'STABLE'
      WHEN vm.errors_last_24h <= vm.total_documents * 0.01 THEN 'MINOR_ISSUES'
      WHEN vm.errors_last_24h <= vm.total_documents * 0.05 THEN 'MODERATE_ISSUES'
      ELSE 'SIGNIFICANT_ISSUES'
    END as trend_status,
    
    -- Top error types
    array_agg(
      json_build_object(
        'error_type', ved.validation_error_type,
        'field', ved.validation_error_field,
        'frequency', ved.error_frequency,
        'avg_age_hours', ROUND(ved.avg_age_seconds / 3600.0, 1)
      ) ORDER BY ved.error_frequency DESC
    )[1:3] as top_errors
    
  FROM validation_metrics vm
  LEFT JOIN validation_error_details ved ON vm.collection_name = ved.collection_name
  GROUP BY vm.collection_name, vm.total_documents, vm.data_quality_percent, 
           vm.validations_last_24h, vm.errors_last_24h
)

SELECT 
  collection_name,
  total_documents,
  ROUND(data_quality_percent, 2) as data_quality_pct,
  health_status,
  trend_status,
  validations_last_24h,
  errors_last_24h,
  top_errors,
  
  -- Recommendations based on health status
  CASE health_status
    WHEN 'CRITICAL' THEN 'URGENT: Review validation rules and fix data quality issues immediately'
    WHEN 'POOR' THEN 'Review validation errors and implement data cleanup procedures'
    WHEN 'FAIR' THEN 'Monitor validation trends and address recurring error patterns'
    WHEN 'GOOD' THEN 'Continue monitoring and maintain current validation standards'
    ELSE 'Data quality is excellent - consider sharing best practices'
  END as recommendation,
  
  -- Priority level for remediation
  CASE 
    WHEN health_status IN ('CRITICAL', 'POOR') AND trend_status = 'SIGNIFICANT_ISSUES' THEN 'P0_CRITICAL'
    WHEN health_status = 'POOR' OR trend_status = 'SIGNIFICANT_ISSUES' THEN 'P1_HIGH'
    WHEN health_status = 'FAIR' AND trend_status = 'MODERATE_ISSUES' THEN 'P2_MEDIUM'
    WHEN trend_status = 'MINOR_ISSUES' THEN 'P3_LOW'
    ELSE 'P4_MONITORING'
  END as priority_level,
  
  CURRENT_TIMESTAMP as report_generated_at

FROM collection_health_assessment
ORDER BY 
  CASE health_status
    WHEN 'CRITICAL' THEN 1
    WHEN 'POOR' THEN 2 
    WHEN 'FAIR' THEN 3
    WHEN 'GOOD' THEN 4
    ELSE 5
  END,
  errors_last_24h DESC;

-- Advanced validation rule analysis
WITH validation_rule_effectiveness AS (
  SELECT 
    vr.collection_name,
    vr.rule_name,
    vr.rule_type,
    vr.field_path,
    
    -- Rule utilization metrics
    COUNT(DISTINCT ve.document_id) as documents_validated,
    COUNT(*) FILTER (WHERE ve.validation_passed = false) as violations_caught,
    COUNT(*) FILTER (WHERE ve.validation_passed = true) as validations_passed,
    
    -- Effectiveness calculation
    CASE 
      WHEN COUNT(*) > 0 THEN
        (COUNT(*) FILTER (WHERE ve.validation_passed = false)::numeric / COUNT(*)) * 100
      ELSE 0
    END as violation_rate_percent,
    
    -- Performance impact
    AVG(ve.validation_duration_ms) as avg_validation_time_ms,
    MAX(ve.validation_duration_ms) as max_validation_time_ms,
    
    -- Rule complexity assessment
    CASE vr.rule_type
      WHEN 'simple_type_check' THEN 1
      WHEN 'pattern_match' THEN 2
      WHEN 'range_check' THEN 2
      WHEN 'conditional_logic' THEN 4
      WHEN 'cross_field_validation' THEN 5
      WHEN 'cross_collection_validation' THEN 8
      ELSE 3
    END as complexity_score
    
  FROM VALIDATION_RULES() vr
  LEFT JOIN VALIDATION_EVENTS() ve ON (
    vr.collection_name = ve.collection_name AND 
    vr.rule_name = ve.rule_triggered
  )
  WHERE ve.validated_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  GROUP BY vr.collection_name, vr.rule_name, vr.rule_type, vr.field_path
),

rule_optimization_analysis AS (
  SELECT 
    vre.*,
    
    -- Performance classification
    CASE 
      WHEN avg_validation_time_ms > 1000 THEN 'SLOW'
      WHEN avg_validation_time_ms > 100 THEN 'MODERATE'
      ELSE 'FAST'
    END as performance_class,
    
    -- Effectiveness classification  
    CASE 
      WHEN violation_rate_percent > 10 THEN 'HIGH_VIOLATION'
      WHEN violation_rate_percent > 5 THEN 'MODERATE_VIOLATION'
      WHEN violation_rate_percent > 0 THEN 'LOW_VIOLATION'
      ELSE 'NO_VIOLATIONS'
    END as effectiveness_class,
    
    -- Optimization recommendations
    CASE 
      WHEN avg_validation_time_ms > 1000 AND violation_rate_percent = 0 THEN 'Consider removing or simplifying unused rule'
      WHEN avg_validation_time_ms > 500 AND violation_rate_percent < 1 THEN 'Rule may be too strict or complex'
      WHEN violation_rate_percent > 15 THEN 'High violation rate indicates data quality issues'
      WHEN complexity_score > 6 AND avg_validation_time_ms > 100 THEN 'Complex rule impacting performance'
      ELSE 'Rule is operating within normal parameters'
    END as optimization_recommendation
    
  FROM validation_rule_effectiveness vre
)

SELECT 
  collection_name,
  rule_name,
  rule_type,
  field_path,
  documents_validated,
  violations_caught,
  ROUND(violation_rate_percent, 2) as violation_rate_pct,
  ROUND(avg_validation_time_ms, 2) as avg_validation_ms,
  complexity_score,
  performance_class,
  effectiveness_class,
  optimization_recommendation,
  
  -- Priority for optimization
  CASE 
    WHEN performance_class = 'SLOW' AND effectiveness_class = 'NO_VIOLATIONS' THEN 'HIGH_PRIORITY'
    WHEN performance_class = 'SLOW' AND violation_rate_percent < 1 THEN 'MEDIUM_PRIORITY'
    WHEN effectiveness_class = 'HIGH_VIOLATION' THEN 'DATA_QUALITY_ISSUE'
    ELSE 'LOW_PRIORITY'
  END as optimization_priority

FROM rule_optimization_analysis
WHERE documents_validated > 0
ORDER BY 
  CASE optimization_priority
    WHEN 'HIGH_PRIORITY' THEN 1
    WHEN 'DATA_QUALITY_ISSUE' THEN 2
    WHEN 'MEDIUM_PRIORITY' THEN 3
    ELSE 4
  END,
  avg_validation_time_ms DESC;

-- QueryLeaf provides comprehensive MongoDB schema validation capabilities:
-- 1. SQL-familiar validation syntax with complex nested object support
-- 2. Conditional validation rules based on document context and business logic
-- 3. Cross-field and cross-collection validation for referential integrity
-- 4. Advanced pattern matching and constraint enforcement
-- 5. Comprehensive validation reporting and error analysis
-- 6. Performance monitoring and rule optimization recommendations
-- 7. Schema versioning and migration support with gradual enforcement
-- 8. Compliance framework integration for regulatory requirements
-- 9. Real-time validation metrics and health monitoring
-- 10. Production-ready validation management with automated optimization
```

## Best Practices for Production Schema Validation

### Validation Strategy Design

Essential principles for effective MongoDB schema validation implementation:

1. **Incremental Implementation**: Start with moderate validation levels and gradually increase strictness
2. **Business Rule Alignment**: Ensure validation rules reflect actual business requirements and constraints
3. **Performance Consideration**: Balance comprehensive validation with acceptable performance overhead
4. **Error Handling**: Implement user-friendly error messages and validation feedback systems
5. **Schema Evolution**: Plan for schema changes and maintain backwards compatibility during transitions
6. **Monitoring and Alerting**: Continuously monitor validation effectiveness and data quality metrics

### Compliance and Data Integrity

Implement validation frameworks for regulatory and business compliance:

1. **Regulatory Compliance**: Integrate validation rules for GDPR, PCI DSS, SOX, and industry-specific requirements
2. **Data Quality Enforcement**: Establish validation rules that maintain high data quality standards
3. **Audit Trail Maintenance**: Ensure all validation events and changes are properly logged and tracked
4. **Cross-System Validation**: Implement validation that works across multiple applications and data sources
5. **Documentation Standards**: Maintain comprehensive documentation of validation rules and business logic
6. **Testing Procedures**: Establish thorough testing procedures for validation rule changes and updates

## Conclusion

MongoDB Schema Validation provides comprehensive document validation capabilities that ensure data integrity, enforce business rules, and maintain data quality at the database level. Unlike application-level validation that can be bypassed or inconsistently applied, MongoDB's validation system provides a reliable foundation for data governance and compliance in production environments.

Key MongoDB Schema Validation benefits include:

- **Database-Level Integrity**: Enforcement of data validation rules regardless of application or data source
- **Flexible Rule Definition**: Support for complex nested validation, conditional logic, and business rule enforcement
- **Real-Time Validation**: Immediate validation feedback with detailed error reporting and user guidance
- **Schema Evolution**: Support for gradual migration strategies and schema versioning for evolving applications
- **Performance Optimization**: Efficient validation processing with minimal impact on application performance
- **Compliance Support**: Built-in frameworks for regulatory compliance and data governance requirements

Whether you're building new applications with strict data requirements, migrating existing systems to enforce better data quality, or implementing compliance frameworks, MongoDB Schema Validation with QueryLeaf's familiar SQL interface provides the foundation for robust data integrity management.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL-style validation rules into MongoDB's native JSON Schema validation, making advanced document validation accessible through familiar SQL constraint syntax. Complex nested object validation, conditional business rules, and cross-collection integrity checks are seamlessly handled through familiar SQL patterns, enabling sophisticated data validation without requiring deep MongoDB expertise.

The combination of MongoDB's powerful validation capabilities with SQL-style rule definition makes it an ideal platform for applications requiring both flexible document storage and rigorous data integrity enforcement, ensuring your data remains consistent and reliable as your application scales and evolves.