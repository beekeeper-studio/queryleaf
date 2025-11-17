---
title: "MongoDB Schema Validation and Data Quality Management: Enterprise Data Integrity and Governance"
description: "Master MongoDB schema validation and data quality management for enterprise applications. Learn document validation rules, data quality enforcement, compliance strategies, and SQL-familiar data governance patterns."
date: 2025-11-16
tags: [mongodb, schema-validation, data-quality, data-governance, compliance, document-validation, sql]
---

# MongoDB Schema Validation and Data Quality Management: Enterprise Data Integrity and Governance

Enterprise applications demand rigorous data quality standards to ensure compliance with regulatory requirements, maintain data integrity across distributed systems, and support reliable business intelligence and analytics. Traditional relational databases enforce data quality through rigid schema constraints, foreign key relationships, and check constraints, but these approaches often lack the flexibility required for modern applications dealing with evolving data structures and diverse data sources.

MongoDB Schema Validation provides comprehensive data quality management capabilities that combine flexible document validation rules with sophisticated data governance patterns. Unlike traditional database systems that require extensive schema migrations and rigid constraints, MongoDB's validation framework enables adaptive data quality enforcement that evolves with changing business requirements while maintaining enterprise-grade compliance and governance standards.

## The Traditional Data Quality Challenge

Relational database data quality management often involves complex constraint management and limited flexibility:

```sql
-- Traditional PostgreSQL data quality management - rigid and maintenance-heavy

-- Customer data with extensive validation rules
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(500) NOT NULL,
    legal_entity_type VARCHAR(50) NOT NULL,
    
    -- Contact information with validation
    primary_email VARCHAR(320) NOT NULL,
    secondary_email VARCHAR(320),
    phone_primary VARCHAR(20) NOT NULL,
    phone_secondary VARCHAR(20),
    
    -- Address validation
    billing_address_line1 VARCHAR(200) NOT NULL,
    billing_address_line2 VARCHAR(200),
    billing_city VARCHAR(100) NOT NULL,
    billing_state VARCHAR(50) NOT NULL,
    billing_postal_code VARCHAR(20) NOT NULL,
    billing_country VARCHAR(3) NOT NULL DEFAULT 'USA',
    
    shipping_address_line1 VARCHAR(200),
    shipping_address_line2 VARCHAR(200),
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(50),
    shipping_postal_code VARCHAR(20),
    shipping_country VARCHAR(3),
    
    -- Business information
    tax_id VARCHAR(50),
    business_registration_number VARCHAR(100),
    industry_code VARCHAR(10),
    annual_revenue DECIMAL(15,2),
    employee_count INTEGER,
    
    -- Account status and compliance
    account_status VARCHAR(20) NOT NULL DEFAULT 'active',
    credit_limit DECIMAL(12,2) DEFAULT 0.00,
    payment_terms INTEGER DEFAULT 30,
    
    -- Regulatory compliance fields
    gdpr_consent BOOLEAN DEFAULT false,
    gdpr_consent_date TIMESTAMP,
    ccpa_opt_out BOOLEAN DEFAULT false,
    data_retention_category VARCHAR(50) DEFAULT 'standard',
    
    -- Audit fields
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    
    -- Complex constraint validation
    CONSTRAINT chk_email_format 
        CHECK (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_secondary_email_format 
        CHECK (secondary_email IS NULL OR secondary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_phone_format 
        CHECK (phone_primary ~ '^\+?[1-9]\d{1,14}$'),
    CONSTRAINT chk_postal_code_format 
        CHECK (
            (billing_country = 'USA' AND billing_postal_code ~ '^\d{5}(-\d{4})?$') OR
            (billing_country = 'CAN' AND billing_postal_code ~ '^[A-Z]\d[A-Z] ?\d[A-Z]\d$') OR
            (billing_country != 'USA' AND billing_country != 'CAN')
        ),
    CONSTRAINT chk_account_status 
        CHECK (account_status IN ('active', 'suspended', 'closed', 'pending_approval')),
    CONSTRAINT chk_legal_entity_type 
        CHECK (legal_entity_type IN ('corporation', 'llc', 'partnership', 'sole_proprietorship', 'non_profit')),
    CONSTRAINT chk_revenue_positive 
        CHECK (annual_revenue IS NULL OR annual_revenue >= 0),
    CONSTRAINT chk_employee_count_positive 
        CHECK (employee_count IS NULL OR employee_count >= 0),
    CONSTRAINT chk_credit_limit_positive 
        CHECK (credit_limit >= 0),
    CONSTRAINT chk_payment_terms_valid 
        CHECK (payment_terms IN (15, 30, 45, 60, 90)),
    CONSTRAINT chk_gdpr_consent_date 
        CHECK (gdpr_consent = false OR gdpr_consent_date IS NOT NULL),
    
    -- Foreign key constraints
    CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES users(user_id),
    CONSTRAINT fk_updated_by FOREIGN KEY (updated_by) REFERENCES users(user_id)
);

-- Additional validation through triggers for complex business rules
CREATE OR REPLACE FUNCTION validate_customer_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate business registration requirements
    IF NEW.annual_revenue > 1000000 AND NEW.business_registration_number IS NULL THEN
        RAISE EXCEPTION 'Business registration number required for companies with revenue > $1M';
    END IF;
    
    -- Validate tax ID requirements
    IF NEW.legal_entity_type IN ('corporation', 'llc') AND NEW.tax_id IS NULL THEN
        RAISE EXCEPTION 'Tax ID required for corporations and LLCs';
    END IF;
    
    -- Validate shipping address consistency
    IF NEW.shipping_address_line1 IS NOT NULL THEN
        IF NEW.shipping_city IS NULL OR NEW.shipping_state IS NULL OR NEW.shipping_postal_code IS NULL THEN
            RAISE EXCEPTION 'Complete shipping address required when shipping address is provided';
        END IF;
    END IF;
    
    -- Industry-specific validation
    IF NEW.industry_code IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM industry_codes WHERE code = NEW.industry_code AND active = true
    ) THEN
        RAISE EXCEPTION 'Invalid or inactive industry code: %', NEW.industry_code;
    END IF;
    
    -- Credit limit validation based on business tier
    IF NEW.annual_revenue IS NOT NULL THEN
        CASE 
            WHEN NEW.annual_revenue < 100000 AND NEW.credit_limit > 10000 THEN
                RAISE EXCEPTION 'Credit limit too high for small business tier';
            WHEN NEW.annual_revenue < 1000000 AND NEW.credit_limit > 50000 THEN
                RAISE EXCEPTION 'Credit limit too high for medium business tier';
            WHEN NEW.annual_revenue >= 1000000 AND NEW.credit_limit > 500000 THEN
                RAISE EXCEPTION 'Credit limit exceeds maximum allowed';
        END CASE;
    END IF;
    
    -- Data retention policy validation
    IF NEW.data_retention_category NOT IN ('standard', 'extended', 'permanent', 'gdpr_restricted') THEN
        RAISE EXCEPTION 'Invalid data retention category';
    END IF;
    
    -- Update audit fields
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_validation_trigger
    BEFORE INSERT OR UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION validate_customer_data();

-- Comprehensive data quality monitoring
CREATE VIEW customer_data_quality_report AS
WITH validation_checks AS (
    SELECT 
        customer_id,
        company_name,
        
        -- Email validation
        CASE WHEN primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' 
             THEN 'Valid' ELSE 'Invalid' END as primary_email_quality,
        CASE WHEN secondary_email IS NULL OR secondary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' 
             THEN 'Valid' ELSE 'Invalid' END as secondary_email_quality,
             
        -- Phone validation
        CASE WHEN phone_primary ~ '^\+?[1-9]\d{1,14}$' 
             THEN 'Valid' ELSE 'Invalid' END as phone_quality,
             
        -- Address completeness
        CASE WHEN billing_address_line1 IS NOT NULL AND billing_city IS NOT NULL AND 
                  billing_state IS NOT NULL AND billing_postal_code IS NOT NULL 
             THEN 'Complete' ELSE 'Incomplete' END as billing_address_quality,
             
        -- Business data completeness
        CASE WHEN (legal_entity_type IN ('corporation', 'llc') AND tax_id IS NOT NULL) OR
                  (legal_entity_type NOT IN ('corporation', 'llc')) 
             THEN 'Valid' ELSE 'Missing Tax ID' END as tax_compliance_quality,
             
        -- GDPR compliance
        CASE WHEN gdpr_consent = true AND gdpr_consent_date IS NOT NULL 
             THEN 'Compliant' ELSE 'Non-Compliant' END as gdpr_compliance_quality,
             
        -- Data freshness
        CASE WHEN updated_at >= CURRENT_TIMESTAMP - INTERVAL '90 days' 
             THEN 'Fresh' ELSE 'Stale' END as data_freshness_quality
    FROM customers
),
quality_scores AS (
    SELECT *,
        -- Calculate overall quality score (0-100)
        (
            (CASE WHEN primary_email_quality = 'Valid' THEN 15 ELSE 0 END) +
            (CASE WHEN secondary_email_quality = 'Valid' THEN 5 ELSE 0 END) +
            (CASE WHEN phone_quality = 'Valid' THEN 10 ELSE 0 END) +
            (CASE WHEN billing_address_quality = 'Complete' THEN 20 ELSE 0 END) +
            (CASE WHEN tax_compliance_quality = 'Valid' THEN 25 ELSE 0 END) +
            (CASE WHEN gdpr_compliance_quality = 'Compliant' THEN 15 ELSE 0 END) +
            (CASE WHEN data_freshness_quality = 'Fresh' THEN 10 ELSE 0 END)
        ) as overall_quality_score
    FROM validation_checks
)
SELECT 
    customer_id,
    company_name,
    overall_quality_score,
    
    -- Quality classification
    CASE 
        WHEN overall_quality_score >= 90 THEN 'Excellent'
        WHEN overall_quality_score >= 75 THEN 'Good'
        WHEN overall_quality_score >= 60 THEN 'Fair'
        ELSE 'Poor'
    END as quality_rating,
    
    -- Specific quality issues
    CASE WHEN primary_email_quality = 'Invalid' THEN 'Fix primary email format' END as primary_issue,
    CASE WHEN billing_address_quality = 'Incomplete' THEN 'Complete billing address' END as address_issue,
    CASE WHEN tax_compliance_quality = 'Missing Tax ID' THEN 'Add required tax ID' END as compliance_issue,
    CASE WHEN gdpr_compliance_quality = 'Non-Compliant' THEN 'Update GDPR consent' END as gdpr_issue,
    CASE WHEN data_freshness_quality = 'Stale' THEN 'Data needs refresh' END as freshness_issue
    
FROM quality_scores
ORDER BY overall_quality_score ASC;

-- Problems with traditional data quality management:
-- 1. Rigid schema constraints that are difficult to modify as requirements evolve
-- 2. Complex trigger-based validation that is hard to maintain and debug
-- 3. Limited support for nested data structures and dynamic field validation
-- 4. Extensive migration requirements when adding new validation rules
-- 5. Performance overhead from complex constraint checking during writes
-- 6. Difficulty handling semi-structured data with varying field requirements
-- 7. Limited flexibility for different validation rules across data sources
-- 8. Complex reporting and monitoring of data quality across multiple tables
-- 9. Difficulty implementing conditional validation based on document context
-- 10. Expensive maintenance of validation logic across application and database layers
```

MongoDB provides flexible and comprehensive data quality management:

```javascript
// MongoDB Schema Validation - flexible and comprehensive data quality management
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('enterprise_data_platform');

// Advanced Schema Validation and Data Quality Management
class MongoSchemaValidator {
  constructor(db) {
    this.db = db;
    this.validationRules = new Map();
    this.qualityMetrics = new Map();
    this.complianceReports = new Map();
  }

  async createComprehensiveCustomerValidation() {
    console.log('Creating comprehensive customer data validation schema...');

    const customersCollection = db.collection('customers');

    // Define comprehensive validation schema
    const customerValidationSchema = {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "companyName", 
          "legalEntityType", 
          "primaryContact", 
          "billingAddress", 
          "accountStatus",
          "audit"
        ],
        properties: {
          _id: {
            bsonType: "objectId"
          },
          
          // Company identification
          companyName: {
            bsonType: "string",
            minLength: 2,
            maxLength: 500,
            pattern: "^[A-Za-z0-9\\s\\-.,&'()]+$",
            description: "Company name must be 2-500 characters, alphanumeric with common punctuation"
          },
          
          legalEntityType: {
            enum: ["corporation", "llc", "partnership", "sole_proprietorship", "non_profit", "government"],
            description: "Must be a valid legal entity type"
          },
          
          businessRegistrationNumber: {
            bsonType: "string",
            pattern: "^[A-Z0-9\\-]{5,20}$",
            description: "Business registration number format validation"
          },
          
          taxId: {
            bsonType: "string",
            pattern: "^\\d{2}-\\d{7}$|^\\d{9}$",
            description: "Tax ID must be EIN format (XX-XXXXXXX) or SSN format (XXXXXXXXX)"
          },
          
          // Contact information with nested validation
          primaryContact: {
            bsonType: "object",
            required: ["firstName", "lastName", "email", "phone"],
            properties: {
              title: {
                bsonType: "string",
                enum: ["Mr", "Mrs", "Ms", "Dr", "Prof"]
              },
              firstName: {
                bsonType: "string",
                minLength: 1,
                maxLength: 50,
                pattern: "^[A-Za-z\\s\\-']+$"
              },
              lastName: {
                bsonType: "string", 
                minLength: 1,
                maxLength: 50,
                pattern: "^[A-Za-z\\s\\-']+$"
              },
              email: {
                bsonType: "string",
                pattern: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$",
                description: "Must be a valid email format"
              },
              phone: {
                bsonType: "string",
                pattern: "^\\+?[1-9]\\d{1,14}$",
                description: "Must be a valid international phone format"
              },
              mobile: {
                bsonType: "string",
                pattern: "^\\+?[1-9]\\d{1,14}$"
              },
              jobTitle: {
                bsonType: "string",
                maxLength: 100
              },
              department: {
                bsonType: "string",
                maxLength: 50
              }
            },
            additionalProperties: false
          },
          
          // Additional contacts array validation
          additionalContacts: {
            bsonType: "array",
            maxItems: 10,
            items: {
              bsonType: "object",
              required: ["firstName", "lastName", "email", "role"],
              properties: {
                firstName: { bsonType: "string", minLength: 1, maxLength: 50 },
                lastName: { bsonType: "string", minLength: 1, maxLength: 50 },
                email: { bsonType: "string", pattern: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$" },
                phone: { bsonType: "string", pattern: "^\\+?[1-9]\\d{1,14}$" },
                role: {
                  enum: ["billing", "technical", "executive", "procurement", "legal"]
                }
              }
            }
          },
          
          // Address validation with conditional requirements
          billingAddress: {
            bsonType: "object",
            required: ["street1", "city", "state", "postalCode", "country"],
            properties: {
              street1: {
                bsonType: "string",
                minLength: 5,
                maxLength: 200
              },
              street2: {
                bsonType: "string",
                maxLength: 200
              },
              city: {
                bsonType: "string",
                minLength: 2,
                maxLength: 100,
                pattern: "^[A-Za-z\\s\\-']+$"
              },
              state: {
                bsonType: "string",
                minLength: 2,
                maxLength: 50
              },
              postalCode: {
                bsonType: "string",
                minLength: 3,
                maxLength: 20
              },
              country: {
                bsonType: "string",
                enum: ["USA", "CAN", "MEX", "GBR", "FRA", "DEU", "AUS", "JPN", "IND"],
                description: "Must be a supported country code"
              },
              coordinates: {
                bsonType: "object",
                properties: {
                  latitude: {
                    bsonType: "double",
                    minimum: -90,
                    maximum: 90
                  },
                  longitude: {
                    bsonType: "double", 
                    minimum: -180,
                    maximum: 180
                  }
                }
              }
            },
            additionalProperties: false
          },
          
          // Optional shipping address with same validation
          shippingAddress: {
            bsonType: "object",
            properties: {
              street1: { bsonType: "string", minLength: 5, maxLength: 200 },
              street2: { bsonType: "string", maxLength: 200 },
              city: { bsonType: "string", minLength: 2, maxLength: 100 },
              state: { bsonType: "string", minLength: 2, maxLength: 50 },
              postalCode: { bsonType: "string", minLength: 3, maxLength: 20 },
              country: { bsonType: "string", enum: ["USA", "CAN", "MEX", "GBR", "FRA", "DEU", "AUS", "JPN", "IND"] }
            }
          },
          
          // Business metrics with conditional validation
          businessMetrics: {
            bsonType: "object",
            properties: {
              annualRevenue: {
                bsonType: "double",
                minimum: 0,
                maximum: 999999999999.99
              },
              employeeCount: {
                bsonType: "int",
                minimum: 1,
                maximum: 1000000
              },
              industryCode: {
                bsonType: "string",
                pattern: "^[0-9]{4,6}$",
                description: "NAICS industry code format"
              },
              establishedYear: {
                bsonType: "int",
                minimum: 1800,
                maximum: 2025
              },
              publiclyTraded: {
                bsonType: "bool"
              },
              stockSymbol: {
                bsonType: "string",
                pattern: "^[A-Z]{1,5}$"
              }
            }
          },
          
          // Account management
          accountStatus: {
            enum: ["active", "suspended", "closed", "pending_approval", "under_review"],
            description: "Must be a valid account status"
          },
          
          creditProfile: {
            bsonType: "object",
            properties: {
              creditLimit: {
                bsonType: "double",
                minimum: 0,
                maximum: 10000000
              },
              paymentTerms: {
                bsonType: "int",
                enum: [15, 30, 45, 60, 90]
              },
              creditRating: {
                bsonType: "string",
                enum: ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "CC", "C", "D"]
              },
              lastCreditReview: {
                bsonType: "date"
              }
            }
          },
          
          // Compliance and regulatory requirements
          compliance: {
            bsonType: "object",
            properties: {
              gdprConsent: {
                bsonType: "object",
                required: ["hasConsent", "consentDate"],
                properties: {
                  hasConsent: { bsonType: "bool" },
                  consentDate: { bsonType: "date" },
                  consentVersion: { bsonType: "string" },
                  consentMethod: { 
                    enum: ["website", "email", "phone", "written", "implied"] 
                  },
                  dataProcessingPurposes: {
                    bsonType: "array",
                    items: {
                      enum: ["marketing", "analytics", "service_delivery", "legal_compliance", "research"]
                    }
                  }
                }
              },
              ccpaOptOut: {
                bsonType: "bool"
              },
              dataRetentionCategory: {
                enum: ["standard", "extended", "permanent", "gdpr_restricted", "legal_hold"],
                description: "Data retention policy classification"
              },
              piiClassification: {
                enum: ["none", "low", "medium", "high", "restricted"],
                description: "PII sensitivity classification"
              },
              regulatoryJurisdictions: {
                bsonType: "array",
                items: {
                  enum: ["US", "EU", "UK", "CA", "AU", "JP", "IN"]
                }
              }
            }
          },
          
          // Data quality and audit tracking
          audit: {
            bsonType: "object",
            required: ["createdAt", "updatedAt", "createdBy"],
            properties: {
              createdAt: { bsonType: "date" },
              updatedAt: { bsonType: "date" },
              createdBy: { bsonType: "objectId" },
              updatedBy: { bsonType: "objectId" },
              version: { bsonType: "int", minimum: 1 },
              lastValidated: { bsonType: "date" },
              dataSource: {
                enum: ["manual_entry", "import_csv", "api_integration", "web_form", "migration"]
              },
              validationStatus: {
                enum: ["pending", "validated", "needs_review", "rejected"]
              },
              changeHistory: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  properties: {
                    field: { bsonType: "string" },
                    oldValue: {},
                    newValue: {},
                    changedAt: { bsonType: "date" },
                    changedBy: { bsonType: "objectId" },
                    reason: { bsonType: "string" }
                  }
                }
              }
            }
          },
          
          // Integration and system metadata
          systemMetadata: {
            bsonType: "object",
            properties: {
              externalIds: {
                bsonType: "object",
                properties: {
                  crmId: { bsonType: "string" },
                  erpId: { bsonType: "string" }, 
                  accountingId: { bsonType: "string" },
                  legacyId: { bsonType: "string" }
                }
              },
              tags: {
                bsonType: "array",
                maxItems: 20,
                items: {
                  bsonType: "string",
                  pattern: "^[A-Za-z0-9\\-_]+$",
                  maxLength: 50
                }
              },
              customFields: {
                bsonType: "object",
                additionalProperties: true
              }
            }
          }
        },
        additionalProperties: false
      }
    };

    // Apply validation to collection
    await customersCollection.createCollection({
      validator: customerValidationSchema,
      validationLevel: "strict",
      validationAction: "error"
    });

    // Store validation schema for reference
    this.validationRules.set('customers', customerValidationSchema);

    console.log('✅ Comprehensive customer validation schema created');
    return customerValidationSchema;
  }

  async implementConditionalValidation() {
    console.log('Implementing advanced conditional validation rules...');

    // Create validation for different document types with conditional requirements
    const conditionalValidationRules = [
      {
        collectionName: 'customers',
        ruleName: 'corporation_tax_id_requirement',
        condition: {
          $expr: {
            $and: [
              { $in: ["$legalEntityType", ["corporation", "llc"]] },
              { $eq: [{ $type: "$taxId" }, "missing"] }
            ]
          }
        },
        errorMessage: "Tax ID is required for corporations and LLCs"
      },
      
      {
        collectionName: 'customers', 
        ruleName: 'high_revenue_business_registration',
        condition: {
          $expr: {
            $and: [
              { $gt: ["$businessMetrics.annualRevenue", 1000000] },
              { $eq: [{ $type: "$businessRegistrationNumber" }, "missing"] }
            ]
          }
        },
        errorMessage: "Business registration number required for companies with revenue > $1M"
      },
      
      {
        collectionName: 'customers',
        ruleName: 'public_company_stock_symbol',
        condition: {
          $expr: {
            $and: [
              { $eq: ["$businessMetrics.publiclyTraded", true] },
              { $eq: [{ $type: "$businessMetrics.stockSymbol" }, "missing"] }
            ]
          }
        },
        errorMessage: "Stock symbol required for publicly traded companies"
      },
      
      {
        collectionName: 'customers',
        ruleName: 'gdpr_consent_date_requirement',
        condition: {
          $expr: {
            $and: [
              { $in: ["EU", "$compliance.regulatoryJurisdictions"] },
              { $eq: ["$compliance.gdprConsent.hasConsent", true] },
              { $eq: [{ $type: "$compliance.gdprConsent.consentDate" }, "missing"] }
            ]
          }
        },
        errorMessage: "GDPR consent date required for EU jurisdiction customers"
      },
      
      {
        collectionName: 'customers',
        ruleName: 'high_credit_limit_validation',
        condition: {
          $expr: {
            $or: [
              {
                $and: [
                  { $lt: ["$businessMetrics.annualRevenue", 100000] },
                  { $gt: ["$creditProfile.creditLimit", 10000] }
                ]
              },
              {
                $and: [
                  { $lt: ["$businessMetrics.annualRevenue", 1000000] },
                  { $gt: ["$creditProfile.creditLimit", 50000] }
                ]
              },
              { $gt: ["$creditProfile.creditLimit", 500000] }
            ]
          }
        },
        errorMessage: "Credit limit exceeds allowed amount for business tier"
      }
    ];

    // Implement conditional validation using MongoDB's advanced features
    for (const rule of conditionalValidationRules) {
      try {
        const collection = this.db.collection(rule.collectionName);
        
        // Create a compound validator that includes the conditional rule
        const existingValidator = await collection.options();
        const currentSchema = existingValidator.validator || {};
        
        // Add conditional validation using $expr
        const enhancedSchema = {
          $and: [
            currentSchema,
            {
              $expr: {
                $not: rule.condition.$expr
              }
            }
          ]
        };

        await collection.updateOptions({
          validator: enhancedSchema,
          validationLevel: "strict",
          validationAction: "error"
        });

        console.log(`✅ Applied conditional rule: ${rule.ruleName}`);

      } catch (error) {
        console.error(`❌ Failed to apply rule ${rule.ruleName}:`, error.message);
      }
    }

    return conditionalValidationRules;
  }

  async validateDocumentQuality(collection, document) {
    console.log('Performing comprehensive document quality validation...');

    try {
      const qualityChecks = {
        documentId: document._id,
        timestamp: new Date(),
        overallScore: 0,
        checks: {},
        issues: [],
        recommendations: []
      };

      // 1. Schema compliance check
      try {
        const testResult = await collection.insertOne(document, { 
          bypassDocumentValidation: false,
          dryRun: true // MongoDB 5.0+ feature for validation testing
        });
        qualityChecks.checks.schemaCompliance = {
          status: 'PASS',
          score: 25,
          message: 'Document passes schema validation'
        };
        qualityChecks.overallScore += 25;
      } catch (validationError) {
        qualityChecks.checks.schemaCompliance = {
          status: 'FAIL',
          score: 0,
          message: validationError.message,
          details: validationError.errInfo
        };
        qualityChecks.issues.push('Schema validation failed: ' + validationError.message);
      }

      // 2. Data completeness analysis
      const completenessScore = this.analyzeDataCompleteness(document);
      qualityChecks.checks.completeness = completenessScore;
      qualityChecks.overallScore += completenessScore.score;

      // 3. Data consistency validation
      const consistencyScore = this.validateDataConsistency(document);
      qualityChecks.checks.consistency = consistencyScore;
      qualityChecks.overallScore += consistencyScore.score;

      // 4. Business rule validation
      const businessRuleScore = await this.validateBusinessRules(document);
      qualityChecks.checks.businessRules = businessRuleScore;
      qualityChecks.overallScore += businessRuleScore.score;

      // 5. Data freshness analysis
      const freshnessScore = this.analyzeFreshness(document);
      qualityChecks.checks.freshness = freshnessScore;
      qualityChecks.overallScore += freshnessScore.score;

      // Generate quality rating and recommendations
      qualityChecks.qualityRating = this.calculateQualityRating(qualityChecks.overallScore);
      qualityChecks.recommendations = this.generateQualityRecommendations(qualityChecks);

      // Store quality metrics
      await this.recordQualityMetrics(qualityChecks);

      return qualityChecks;

    } catch (error) {
      console.error('Error during quality validation:', error);
      throw error;
    }
  }

  analyzeDataCompleteness(document) {
    const analysis = {
      status: 'PASS',
      score: 0,
      details: {},
      recommendations: []
    };

    // Define critical fields and their weights
    const criticalFields = {
      'companyName': 5,
      'legalEntityType': 3,
      'primaryContact.email': 5,
      'primaryContact.phone': 3,
      'billingAddress.street1': 4,
      'billingAddress.city': 3,
      'billingAddress.state': 3,
      'billingAddress.postalCode': 3,
      'billingAddress.country': 2,
      'accountStatus': 2
    };

    let totalWeight = 0;
    let presentWeight = 0;

    Object.entries(criticalFields).forEach(([fieldPath, weight]) => {
      totalWeight += weight;
      
      const fieldValue = this.getNestedValue(document, fieldPath);
      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        presentWeight += weight;
        analysis.details[fieldPath] = { present: true, weight };
      } else {
        analysis.details[fieldPath] = { present: false, weight };
        analysis.recommendations.push(`Complete missing field: ${fieldPath}`);
      }
    });

    analysis.score = Math.round((presentWeight / totalWeight) * 20); // Max 20 points
    analysis.completenessPercentage = Math.round((presentWeight / totalWeight) * 100);

    if (analysis.completenessPercentage < 80) {
      analysis.status = 'NEEDS_IMPROVEMENT';
    }

    return analysis;
  }

  validateDataConsistency(document) {
    const analysis = {
      status: 'PASS',
      score: 15, // Start with full points, deduct for issues
      issues: [],
      recommendations: []
    };

    // Consistency checks
    const checks = [
      // Email format consistency
      {
        check: () => {
          const emails = [
            document.primaryContact?.email,
            ...(document.additionalContacts || []).map(c => c.email)
          ].filter(email => email);

          const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
          return emails.every(email => emailPattern.test(email));
        },
        name: 'Email Format Consistency',
        penalty: 3,
        recommendation: 'Fix invalid email formats'
      },
      
      // Phone format consistency  
      {
        check: () => {
          const phones = [
            document.primaryContact?.phone,
            document.primaryContact?.mobile,
            ...(document.additionalContacts || []).map(c => c.phone)
          ].filter(phone => phone);

          const phonePattern = /^\+?[1-9]\d{1,14}$/;
          return phones.every(phone => phonePattern.test(phone));
        },
        name: 'Phone Format Consistency',
        penalty: 2,
        recommendation: 'Standardize phone number formats'
      },
      
      // Address consistency
      {
        check: () => {
          if (!document.shippingAddress) return true;
          
          const billing = document.billingAddress;
          const shipping = document.shippingAddress;
          
          return billing.country === shipping.country;
        },
        name: 'Address Country Consistency',
        penalty: 2,
        recommendation: 'Verify address country consistency'
      },
      
      // Legal entity and tax ID consistency
      {
        check: () => {
          const entityType = document.legalEntityType;
          const hasTaxId = !!document.taxId;
          
          if (['corporation', 'llc'].includes(entityType)) {
            return hasTaxId;
          }
          return true;
        },
        name: 'Tax ID Requirement Consistency',
        penalty: 5,
        recommendation: 'Add required tax ID for legal entity type'
      }
    ];

    checks.forEach(check => {
      try {
        if (!check.check()) {
          analysis.score -= check.penalty;
          analysis.issues.push(check.name);
          analysis.recommendations.push(check.recommendation);
        }
      } catch (error) {
        console.warn(`Consistency check failed: ${check.name}`, error);
      }
    });

    if (analysis.issues.length > 0) {
      analysis.status = 'NEEDS_IMPROVEMENT';
    }

    analysis.score = Math.max(0, analysis.score);
    return analysis;
  }

  async validateBusinessRules(document) {
    const analysis = {
      status: 'PASS',
      score: 20, // Start with full points
      violations: [],
      recommendations: []
    };

    // Business rule validations
    const businessRules = [
      {
        name: 'High Revenue Registration Requirement',
        validate: (doc) => {
          const revenue = doc.businessMetrics?.annualRevenue;
          return !revenue || revenue <= 1000000 || !!doc.businessRegistrationNumber;
        },
        penalty: 8,
        message: 'Companies with >$1M revenue require business registration number'
      },
      
      {
        name: 'Public Company Stock Symbol',
        validate: (doc) => {
          const isPublic = doc.businessMetrics?.publiclyTraded;
          return !isPublic || !!doc.businessMetrics?.stockSymbol;
        },
        penalty: 3,
        message: 'Publicly traded companies must have stock symbol'
      },
      
      {
        name: 'Credit Limit Business Tier Validation',
        validate: (doc) => {
          const revenue = doc.businessMetrics?.annualRevenue;
          const creditLimit = doc.creditProfile?.creditLimit;
          
          if (!revenue || !creditLimit) return true;
          
          if (revenue < 100000 && creditLimit > 10000) return false;
          if (revenue < 1000000 && creditLimit > 50000) return false;
          if (creditLimit > 500000) return false;
          
          return true;
        },
        penalty: 5,
        message: 'Credit limit exceeds allowed amount for business tier'
      },
      
      {
        name: 'GDPR Compliance for EU Customers',
        validate: (doc) => {
          const jurisdictions = doc.compliance?.regulatoryJurisdictions || [];
          const hasGdprConsent = doc.compliance?.gdprConsent?.hasConsent;
          const hasConsentDate = !!doc.compliance?.gdprConsent?.consentDate;
          
          if (jurisdictions.includes('EU')) {
            return hasGdprConsent && hasConsentDate;
          }
          return true;
        },
        penalty: 7,
        message: 'EU customers require GDPR consent with date'
      }
    ];

    for (const rule of businessRules) {
      try {
        if (!rule.validate(document)) {
          analysis.score -= rule.penalty;
          analysis.violations.push(rule.name);
          analysis.recommendations.push(rule.message);
        }
      } catch (error) {
        console.warn(`Business rule validation failed: ${rule.name}`, error);
      }
    }

    if (analysis.violations.length > 0) {
      analysis.status = 'NEEDS_REVIEW';
    }

    analysis.score = Math.max(0, analysis.score);
    return analysis;
  }

  analyzeFreshness(document) {
    const analysis = {
      status: 'PASS',
      score: 0,
      ageInDays: 0,
      recommendations: []
    };

    const updatedAt = new Date(document.audit?.updatedAt || document.audit?.createdAt);
    const now = new Date();
    const daysDifference = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24));
    
    analysis.ageInDays = daysDifference;

    // Freshness scoring
    if (daysDifference <= 30) {
      analysis.score = 20; // Fresh data
      analysis.status = 'FRESH';
    } else if (daysDifference <= 90) {
      analysis.score = 15; // Recent data
      analysis.status = 'RECENT';
    } else if (daysDifference <= 180) {
      analysis.score = 10; // Aging data
      analysis.status = 'AGING';
      analysis.recommendations.push('Consider updating customer information');
    } else if (daysDifference <= 365) {
      analysis.score = 5; // Stale data
      analysis.status = 'STALE';
      analysis.recommendations.push('Customer data needs refresh - over 6 months old');
    } else {
      analysis.score = 0; // Very stale
      analysis.status = 'VERY_STALE';
      analysis.recommendations.push('Critical: Customer data is over 1 year old');
    }

    return analysis;
  }

  calculateQualityRating(overallScore) {
    if (overallScore >= 90) return 'EXCELLENT';
    if (overallScore >= 75) return 'GOOD';
    if (overallScore >= 60) return 'FAIR';
    if (overallScore >= 40) return 'POOR';
    return 'CRITICAL';
  }

  generateQualityRecommendations(qualityChecks) {
    const recommendations = [];
    
    // Collect recommendations from all checks
    Object.values(qualityChecks.checks).forEach(check => {
      if (check.recommendations) {
        recommendations.push(...check.recommendations);
      }
    });

    // Add overall recommendations based on score
    if (qualityChecks.overallScore < 40) {
      recommendations.unshift('CRITICAL: Immediate data quality improvement required');
    } else if (qualityChecks.overallScore < 60) {
      recommendations.unshift('Multiple data quality issues need addressing');
    } else if (qualityChecks.overallScore < 75) {
      recommendations.unshift('Minor improvements needed for optimal data quality');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  async recordQualityMetrics(qualityChecks) {
    try {
      await this.db.collection('data_quality_metrics').insertOne({
        ...qualityChecks,
        recordedAt: new Date()
      });
      
      // Update in-memory metrics for reporting
      const key = `${qualityChecks.documentId}_${Date.now()}`;
      this.qualityMetrics.set(key, qualityChecks);
      
    } catch (error) {
      console.warn('Failed to record quality metrics:', error);
    }
  }

  async generateComplianceReport() {
    console.log('Generating comprehensive compliance and data quality report...');

    try {
      const customersCollection = this.db.collection('customers');
      
      // Comprehensive compliance analysis pipeline
      const complianceAnalysis = await customersCollection.aggregate([
        // Stage 1: Add computed compliance fields
        {
          $addFields: {
            // GDPR compliance status
            gdprCompliant: {
              $cond: {
                if: { $in: ["EU", "$compliance.regulatoryJurisdictions"] },
                then: {
                  $and: [
                    { $eq: ["$compliance.gdprConsent.hasConsent", true] },
                    { $ne: ["$compliance.gdprConsent.consentDate", null] }
                  ]
                },
                else: true
              }
            },
            
            // Tax compliance status
            taxCompliant: {
              $cond: {
                if: { $in: ["$legalEntityType", ["corporation", "llc"]] },
                then: { $ne: ["$taxId", null] },
                else: true
              }
            },
            
            // Data completeness score
            completenessScore: {
              $let: {
                vars: {
                  requiredFields: [
                    { $ne: ["$companyName", null] },
                    { $ne: ["$primaryContact.email", null] },
                    { $ne: ["$primaryContact.phone", null] },
                    { $ne: ["$billingAddress.street1", null] },
                    { $ne: ["$billingAddress.city", null] },
                    { $ne: ["$accountStatus", null] }
                  ]
                },
                in: {
                  $multiply: [
                    { $divide: [
                      { $size: { $filter: {
                        input: "$$requiredFields",
                        cond: { $eq: ["$$this", true] }
                      }}},
                      { $size: "$$requiredFields" }
                    ]},
                    100
                  ]
                }
              }
            },
            
            // Data freshness
            dataAge: {
              $divide: [
                { $subtract: [new Date(), "$audit.updatedAt"] },
                86400000 // Convert to days
              ]
            }
          }
        },
        
        // Stage 2: Quality classification
        {
          $addFields: {
            qualityRating: {
              $switch: {
                branches: [
                  { 
                    case: { 
                      $and: [
                        { $gte: ["$completenessScore", 95] },
                        "$gdprCompliant",
                        "$taxCompliant",
                        { $lte: ["$dataAge", 90] }
                      ]
                    }, 
                    then: "EXCELLENT" 
                  },
                  { 
                    case: { 
                      $and: [
                        { $gte: ["$completenessScore", 80] },
                        "$gdprCompliant",
                        "$taxCompliant",
                        { $lte: ["$dataAge", 180] }
                      ]
                    }, 
                    then: "GOOD" 
                  },
                  { 
                    case: { 
                      $and: [
                        { $gte: ["$completenessScore", 60] },
                        { $lte: ["$dataAge", 365] }
                      ]
                    }, 
                    then: "FAIR" 
                  }
                ],
                default: "POOR"
              }
            },
            
            complianceIssues: {
              $concatArrays: [
                { $cond: [{ $not: "$gdprCompliant" }, ["GDPR_NON_COMPLIANT"], []] },
                { $cond: [{ $not: "$taxCompliant" }, ["MISSING_TAX_ID"], []] },
                { $cond: [{ $lt: ["$completenessScore", 80] }, ["INCOMPLETE_DATA"], []] },
                { $cond: [{ $gt: ["$dataAge", 365] }, ["STALE_DATA"], []] }
              ]
            }
          }
        },
        
        // Stage 3: Aggregate compliance statistics
        {
          $group: {
            _id: null,
            
            // Total counts
            totalCustomers: { $sum: 1 },
            
            // Compliance counts
            gdprCompliantCount: { $sum: { $cond: ["$gdprCompliant", 1, 0] } },
            taxCompliantCount: { $sum: { $cond: ["$taxCompliant", 1, 0] } },
            
            // Quality distribution
            excellentQuality: { $sum: { $cond: [{ $eq: ["$qualityRating", "EXCELLENT"] }, 1, 0] } },
            goodQuality: { $sum: { $cond: [{ $eq: ["$qualityRating", "GOOD"] }, 1, 0] } },
            fairQuality: { $sum: { $cond: [{ $eq: ["$qualityRating", "FAIR"] }, 1, 0] } },
            poorQuality: { $sum: { $cond: [{ $eq: ["$qualityRating", "POOR"] }, 1, 0] } },
            
            // Completeness metrics
            avgCompletenessScore: { $avg: "$completenessScore" },
            minCompletenessScore: { $min: "$completenessScore" },
            
            // Freshness metrics
            avgDataAge: { $avg: "$dataAge" },
            staleDataCount: { $sum: { $cond: [{ $gt: ["$dataAge", 365] }, 1, 0] } },
            
            // Issue tracking
            allIssues: { $push: "$complianceIssues" },
            
            // Sample records for detailed analysis
            qualityExamples: {
              $push: {
                $cond: [
                  { $lte: [{ $rand: {} }, 0.1] }, // Sample 10%
                  {
                    customerId: "$_id",
                    companyName: "$companyName",
                    qualityRating: "$qualityRating",
                    completenessScore: "$completenessScore",
                    dataAge: "$dataAge",
                    issues: "$complianceIssues"
                  },
                  null
                ]
              }
            }
          }
        },
        
        // Stage 4: Calculate percentages and final metrics
        {
          $addFields: {
            // Compliance percentages
            gdprComplianceRate: { $multiply: [{ $divide: ["$gdprCompliantCount", "$totalCustomers"] }, 100] },
            taxComplianceRate: { $multiply: [{ $divide: ["$taxCompliantCount", "$totalCustomers"] }, 100] },
            
            // Quality distribution percentages
            excellentQualityPct: { $multiply: [{ $divide: ["$excellentQuality", "$totalCustomers"] }, 100] },
            goodQualityPct: { $multiply: [{ $divide: ["$goodQuality", "$totalCustomers"] }, 100] },
            fairQualityPct: { $multiply: [{ $divide: ["$fairQuality", "$totalCustomers"] }, 100] },
            poorQualityPct: { $multiply: [{ $divide: ["$poorQuality", "$totalCustomers"] }, 100] },
            
            // Data freshness metrics
            staleDataRate: { $multiply: [{ $divide: ["$staleDataCount", "$totalCustomers"] }, 100] },
            
            // Issue analysis
            issueFrequency: {
              $reduce: {
                input: "$allIssues",
                initialValue: {},
                in: {
                  $mergeObjects: [
                    "$$value",
                    {
                      $arrayToObject: {
                        $map: {
                          input: "$$this",
                          as: "issue",
                          in: {
                            k: "$$issue",
                            v: { $add: [{ $ifNull: [{ $getField: { field: "$$issue", input: "$$value" } }, 0] }, 1] }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            },
            
            // Filter null examples
            qualityExamples: {
              $filter: {
                input: "$qualityExamples",
                cond: { $ne: ["$$this", null] }
              }
            }
          }
        },
        
        // Stage 5: Final report structure
        {
          $project: {
            _id: 0,
            reportGenerated: new Date(),
            summary: {
              totalCustomers: "$totalCustomers",
              overallComplianceScore: {
                $round: [
                  { $avg: ["$gdprComplianceRate", "$taxComplianceRate"] }, 
                  1
                ]
              },
              avgDataQuality: {
                $round: ["$avgCompletenessScore", 1]
              },
              avgDataAgedays: {
                $round: ["$avgDataAge", 0]
              }
            },
            
            compliance: {
              gdpr: {
                compliantCount: "$gdprCompliantCount",
                complianceRate: { $round: ["$gdprComplianceRate", 1] }
              },
              tax: {
                compliantCount: "$taxCompliantCount", 
                complianceRate: { $round: ["$taxComplianceRate", 1] }
              }
            },
            
            dataQuality: {
              distribution: {
                excellent: { count: "$excellentQuality", percentage: { $round: ["$excellentQualityPct", 1] } },
                good: { count: "$goodQuality", percentage: { $round: ["$goodQualityPct", 1] } },
                fair: { count: "$fairQuality", percentage: { $round: ["$fairQualityPct", 1] } },
                poor: { count: "$poorQuality", percentage: { $round: ["$poorQualityPct", 1] } }
              },
              completeness: {
                average: { $round: ["$avgCompletenessScore", 1] },
                minimum: { $round: ["$minCompletenessScore", 1] }
              }
            },
            
            dataFreshness: {
              averageAge: { $round: ["$avgDataAge", 0] },
              staleRecords: { count: "$staleDataCount", percentage: { $round: ["$staleDataRate", 1] } }
            },
            
            topIssues: "$issueFrequency",
            sampleRecords: { $slice: ["$qualityExamples", 10] }
          }
        }
      ]).toArray();

      const report = complianceAnalysis[0] || {};
      
      // Generate recommendations based on findings
      report.recommendations = this.generateComplianceRecommendations(report);
      
      // Store report for historical tracking
      await this.db.collection('compliance_reports').insertOne({
        ...report,
        reportType: 'comprehensive_compliance_audit',
        generatedBy: 'schema_validator_system'
      });
      
      this.complianceReports.set('latest', report);

      console.log('\n📋 Compliance and Data Quality Report Summary:');
      console.log(`Total Customers Analyzed: ${report.summary?.totalCustomers || 0}`);
      console.log(`Overall Compliance Score: ${report.summary?.overallComplianceScore || 0}%`);
      console.log(`Average Data Quality: ${report.summary?.avgDataQuality || 0}%`);
      console.log(`GDPR Compliance Rate: ${report.compliance?.gdpr?.complianceRate || 0}%`);
      console.log(`Tax Compliance Rate: ${report.compliance?.tax?.complianceRate || 0}%`);
      
      if (report.recommendations?.length > 0) {
        console.log('\n💡 Key Recommendations:');
        report.recommendations.slice(0, 5).forEach(rec => {
          console.log(`  • ${rec}`);
        });
      }

      return report;

    } catch (error) {
      console.error('Error generating compliance report:', error);
      throw error;
    }
  }

  generateComplianceRecommendations(report) {
    const recommendations = [];
    
    // GDPR compliance recommendations
    if (report.compliance?.gdpr?.complianceRate < 95) {
      recommendations.push('Improve GDPR compliance by ensuring all EU customers have documented consent');
    }
    
    // Tax compliance recommendations
    if (report.compliance?.tax?.complianceRate < 95) {
      recommendations.push('Add missing tax IDs for corporations and LLCs');
    }
    
    // Data quality recommendations
    const qualityDist = report.dataQuality?.distribution;
    if (qualityDist?.poor?.percentage > 10) {
      recommendations.push('Critical: Over 10% of customer records have poor data quality');
    }
    
    if (qualityDist?.excellent?.percentage < 50) {
      recommendations.push('Implement data quality improvement program - less than 50% excellent quality');
    }
    
    // Data freshness recommendations
    if (report.dataFreshness?.staleRecords?.percentage > 15) {
      recommendations.push('Establish customer data refresh program for stale records');
    }
    
    // Issue-specific recommendations
    const topIssues = report.topIssues || {};
    if (topIssues.INCOMPLETE_DATA > topIssues.totalCustomers * 0.2) {
      recommendations.push('Implement required field completion workflows');
    }
    
    return recommendations;
  }

  // Utility methods
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}

// Export the schema validator
module.exports = { MongoSchemaValidator };

// Benefits of MongoDB Schema Validation:
// - Flexible document validation with evolving schema requirements
// - Comprehensive data quality management and automated quality scoring
// - Advanced conditional validation based on document context
// - Enterprise-grade compliance tracking and regulatory reporting
// - Automated data quality monitoring and issue identification
// - Integration with business rules and custom validation logic
// - Real-time validation feedback and quality metrics
// - Support for complex nested document validation
// - Automated compliance reporting and audit trails
// - SQL-compatible data governance patterns through QueryLeaf integration
```

## Understanding MongoDB Schema Validation Architecture

### Advanced Validation Patterns

MongoDB's validation system supports sophisticated data governance strategies for enterprise applications:

```javascript
// Advanced validation patterns and data governance implementation
class EnterpriseDataGovernance {
  constructor(db) {
    this.db = db;
    this.governanceRules = new Map();
    this.qualityDashboards = new Map();
    this.complianceAudits = new Map();
  }

  async implementDataLineageTracking() {
    console.log('Implementing comprehensive data lineage and governance tracking...');

    // Create data lineage collection with validation
    const lineageSchema = {
      $jsonSchema: {
        bsonType: "object",
        required: ["sourceSystem", "targetCollection", "transformationRules", "timestamp", "dataClassification"],
        properties: {
          sourceSystem: {
            bsonType: "string",
            enum: ["crm", "erp", "web_form", "api", "batch_import", "manual_entry"]
          },
          targetCollection: { bsonType: "string" },
          documentId: { bsonType: "objectId" },
          
          transformationRules: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["field", "operation", "appliedAt"],
              properties: {
                field: { bsonType: "string" },
                operation: {
                  enum: ["validation", "enrichment", "standardization", "encryption", "anonymization"]
                },
                appliedAt: { bsonType: "date" },
                appliedBy: { bsonType: "string" },
                previousValue: {},
                newValue: {},
                validationResult: {
                  bsonType: "object",
                  properties: {
                    passed: { bsonType: "bool" },
                    score: { bsonType: "double", minimum: 0, maximum: 100 },
                    issues: { bsonType: "array", items: { bsonType: "string" } }
                  }
                }
              }
            }
          },
          
          dataClassification: {
            bsonType: "object",
            required: ["piiLevel", "retentionClass", "accessLevel"],
            properties: {
              piiLevel: {
                enum: ["none", "low", "medium", "high", "restricted"]
              },
              retentionClass: {
                enum: ["standard", "extended", "permanent", "legal_hold", "gdpr_restricted"]
              },
              accessLevel: {
                enum: ["public", "internal", "confidential", "restricted", "top_secret"]
              },
              encryptionRequired: { bsonType: "bool" },
              auditRequired: { bsonType: "bool" }
            }
          },
          
          qualityMetrics: {
            bsonType: "object",
            properties: {
              completenessScore: { bsonType: "double", minimum: 0, maximum: 100 },
              accuracyScore: { bsonType: "double", minimum: 0, maximum: 100 },
              consistencyScore: { bsonType: "double", minimum: 0, maximum: 100 },
              timelinessScore: { bsonType: "double", minimum: 0, maximum: 100 },
              overallQualityScore: { bsonType: "double", minimum: 0, maximum: 100 }
            }
          },
          
          complianceChecks: {
            bsonType: "object",
            properties: {
              gdprCompliant: { bsonType: "bool" },
              ccpaCompliant: { bsonType: "bool" },
              hipaaCompliant: { bsonType: "bool" },
              sox404Compliant: { bsonType: "bool" },
              complianceScore: { bsonType: "double", minimum: 0, maximum: 100 },
              lastAuditDate: { bsonType: "date" },
              nextAuditDue: { bsonType: "date" }
            }
          },
          
          timestamp: { bsonType: "date" },
          processingLatency: { bsonType: "double" },
          
          audit: {
            bsonType: "object",
            required: ["createdBy", "createdAt"],
            properties: {
              createdBy: { bsonType: "string" },
              createdAt: { bsonType: "date" },
              version: { bsonType: "string" },
              correlationId: { bsonType: "string" }
            }
          }
        }
      }
    };

    await this.db.createCollection('data_lineage', {
      validator: lineageSchema,
      validationLevel: "strict",
      validationAction: "error"
    });

    console.log('✅ Data lineage tracking implemented');
    return lineageSchema;
  }

  async createDataQualityDashboard() {
    console.log('Creating real-time data quality monitoring dashboard...');

    const dashboard = await this.db.collection('customers').aggregate([
      // Stage 1: Real-time quality analysis
      {
        $addFields: {
          qualityChecks: {
            emailValid: {
              $regexMatch: {
                input: "$primaryContact.email",
                regex: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"
              }
            },
            phoneValid: {
              $regexMatch: {
                input: "$primaryContact.phone", 
                regex: "^\\+?[1-9]\\d{1,14}$"
              }
            },
            addressComplete: {
              $and: [
                { $ne: ["$billingAddress.street1", null] },
                { $ne: ["$billingAddress.city", null] },
                { $ne: ["$billingAddress.state", null] },
                { $ne: ["$billingAddress.postalCode", null] }
              ]
            },
            taxIdPresent: {
              $cond: {
                if: { $in: ["$legalEntityType", ["corporation", "llc"]] },
                then: { $ne: ["$taxId", null] },
                else: true
              }
            },
            dataFresh: {
              $lt: [
                { $subtract: [new Date(), "$audit.updatedAt"] },
                7776000000 // 90 days in milliseconds
              ]
            }
          }
        }
      },
      
      // Stage 2: Calculate individual record scores
      {
        $addFields: {
          individualQualityScore: {
            $multiply: [
              {
                $divide: [
                  {
                    $add: [
                      { $cond: ["$qualityChecks.emailValid", 20, 0] },
                      { $cond: ["$qualityChecks.phoneValid", 15, 0] },
                      { $cond: ["$qualityChecks.addressComplete", 25, 0] },
                      { $cond: ["$qualityChecks.taxIdPresent", 25, 0] },
                      { $cond: ["$qualityChecks.dataFresh", 15, 0] }
                    ]
                  },
                  100
                ]
              },
              100
            ]
          }
        }
      },
      
      // Stage 3: Aggregate dashboard metrics
      {
        $group: {
          _id: null,
          
          // Volume metrics
          totalRecords: { $sum: 1 },
          recordsProcessedToday: {
            $sum: {
              $cond: [
                { $gte: ["$audit.createdAt", new Date(Date.now() - 86400000)] },
                1, 0
              ]
            }
          },
          
          // Quality distribution
          excellentQuality: {
            $sum: { $cond: [{ $gte: ["$individualQualityScore", 90] }, 1, 0] }
          },
          goodQuality: {
            $sum: { $cond: [
              { $and: [{ $gte: ["$individualQualityScore", 70] }, { $lt: ["$individualQualityScore", 90] }] },
              1, 0
            ]}
          },
          fairQuality: {
            $sum: { $cond: [
              { $and: [{ $gte: ["$individualQualityScore", 50] }, { $lt: ["$individualQualityScore", 70] }] },
              1, 0
            ]}
          },
          poorQuality: {
            $sum: { $cond: [{ $lt: ["$individualQualityScore", 50] }, 1, 0] }
          },
          
          // Field-specific quality metrics
          validEmails: { $sum: { $cond: ["$qualityChecks.emailValid", 1, 0] } },
          validPhones: { $sum: { $cond: ["$qualityChecks.phoneValid", 1, 0] } },
          completeAddresses: { $sum: { $cond: ["$qualityChecks.addressComplete", 1, 0] } },
          compliantTaxIds: { $sum: { $cond: ["$qualityChecks.taxIdPresent", 1, 0] } },
          freshData: { $sum: { $cond: ["$qualityChecks.dataFresh", 1, 0] } },
          
          // Quality score statistics
          avgQualityScore: { $avg: "$individualQualityScore" },
          minQualityScore: { $min: "$individualQualityScore" },
          maxQualityScore: { $max: "$individualQualityScore" },
          
          // Compliance tracking
          gdprComplianceCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["EU", { $ifNull: ["$compliance.regulatoryJurisdictions", []] }] },
                    { $eq: ["$compliance.gdprConsent.hasConsent", true] },
                    { $ne: ["$compliance.gdprConsent.consentDate", null] }
                  ]
                },
                1, 0
              ]
            }
          },
          
          // Data freshness metrics
          staleRecordsCount: {
            $sum: { $cond: [{ $not: "$qualityChecks.dataFresh" }, 1, 0] }
          }
        }
      },
      
      // Stage 4: Calculate percentages and dashboard KPIs
      {
        $addFields: {
          timestamp: new Date(),
          
          qualityDistribution: {
            excellent: {
              count: "$excellentQuality",
              percentage: { $round: [{ $multiply: [{ $divide: ["$excellentQuality", "$totalRecords"] }, 100] }, 1] }
            },
            good: {
              count: "$goodQuality", 
              percentage: { $round: [{ $multiply: [{ $divide: ["$goodQuality", "$totalRecords"] }, 100] }, 1] }
            },
            fair: {
              count: "$fairQuality",
              percentage: { $round: [{ $multiply: [{ $divide: ["$fairQuality", "$totalRecords"] }, 100] }, 1] }
            },
            poor: {
              count: "$poorQuality",
              percentage: { $round: [{ $multiply: [{ $divide: ["$poorQuality", "$totalRecords"] }, 100] }, 1] }
            }
          },
          
          fieldQualityRates: {
            emailValidityRate: { $round: [{ $multiply: [{ $divide: ["$validEmails", "$totalRecords"] }, 100] }, 1] },
            phoneValidityRate: { $round: [{ $multiply: [{ $divide: ["$validPhones", "$totalRecords"] }, 100] }, 1] },
            addressCompletenessRate: { $round: [{ $multiply: [{ $divide: ["$completeAddresses", "$totalRecords"] }, 100] }, 1] },
            taxComplianceRate: { $round: [{ $multiply: [{ $divide: ["$compliantTaxIds", "$totalRecords"] }, 100] }, 1] },
            dataFreshnessRate: { $round: [{ $multiply: [{ $divide: ["$freshData", "$totalRecords"] }, 100] }, 1] }
          },
          
          overallHealthScore: {
            $round: [
              {
                $avg: [
                  { $multiply: [{ $divide: ["$validEmails", "$totalRecords"] }, 100] },
                  { $multiply: [{ $divide: ["$validPhones", "$totalRecords"] }, 100] },
                  { $multiply: [{ $divide: ["$completeAddresses", "$totalRecords"] }, 100] },
                  { $multiply: [{ $divide: ["$compliantTaxIds", "$totalRecords"] }, 100] },
                  { $multiply: [{ $divide: ["$freshData", "$totalRecords"] }, 100] }
                ]
              },
              1
            ]
          },
          
          alerts: {
            criticalIssues: { $cond: [{ $gt: ["$poorQuality", { $multiply: ["$totalRecords", 0.1] }] }, "High poor quality rate", null] },
            warningIssues: {
              $switch: {
                branches: [
                  { case: { $lt: [{ $multiply: [{ $divide: ["$validEmails", "$totalRecords"] }, 100] }, 90] }, then: "Email validity below 90%" },
                  { case: { $lt: [{ $multiply: [{ $divide: ["$completeAddresses", "$totalRecords"] }, 100] }, 85] }, then: "Address completeness below 85%" },
                  { case: { $gt: ["$staleRecordsCount", { $multiply: ["$totalRecords", 0.2] }] }, then: "Over 20% stale data" }
                ],
                default: null
              }
            }
          }
        }
      }
    ]).toArray();

    const dashboardData = dashboard[0];
    if (dashboardData) {
      // Store dashboard for historical tracking
      await this.db.collection('quality_dashboards').insertOne(dashboardData);
      this.qualityDashboards.set('current', dashboardData);
      
      // Display dashboard summary
      console.log('\n📊 Real-Time Data Quality Dashboard:');
      console.log(`Overall Health Score: ${dashboardData.overallHealthScore}%`);
      console.log(`Total Records: ${dashboardData.totalRecords?.toLocaleString()}`);
      console.log(`Records Processed Today: ${dashboardData.recordsProcessedToday?.toLocaleString()}`);
      console.log('\nQuality Distribution:');
      console.log(`  Excellent: ${dashboardData.qualityDistribution?.excellent?.count} (${dashboardData.qualityDistribution?.excellent?.percentage}%)`);
      console.log(`  Good: ${dashboardData.qualityDistribution?.good?.count} (${dashboardData.qualityDistribution?.good?.percentage}%)`);
      console.log(`  Fair: ${dashboardData.qualityDistribution?.fair?.count} (${dashboardData.qualityDistribution?.fair?.percentage}%)`);
      console.log(`  Poor: ${dashboardData.qualityDistribution?.poor?.count} (${dashboardData.qualityDistribution?.poor?.percentage}%)`);
      
      if (dashboardData.alerts?.criticalIssues) {
        console.log(`\n🚨 Critical Alert: ${dashboardData.alerts.criticalIssues}`);
      }
      if (dashboardData.alerts?.warningIssues) {
        console.log(`\n⚠️ Warning: ${dashboardData.alerts.warningIssues}`);
      }
    }

    return dashboardData;
  }

  async automateDataQualityRemediation() {
    console.log('Implementing automated data quality remediation workflows...');

    const remediationRules = [
      {
        name: 'email_standardization',
        condition: { $not: { $regexMatch: { input: "$primaryContact.email", regex: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$" } } },
        action: 'flag_for_review',
        priority: 'high'
      },
      
      {
        name: 'phone_formatting',
        condition: { $not: { $regexMatch: { input: "$primaryContact.phone", regex: "^\\+?[1-9]\\d{1,14}$" } } },
        action: 'auto_format',
        priority: 'medium'
      },
      
      {
        name: 'missing_tax_id',
        condition: {
          $and: [
            { $in: ["$legalEntityType", ["corporation", "llc"]] },
            { $eq: ["$taxId", null] }
          ]
        },
        action: 'request_completion',
        priority: 'high'
      },
      
      {
        name: 'stale_data_refresh',
        condition: { $gt: [{ $subtract: [new Date(), "$audit.updatedAt"] }, 15552000000] }, // 180 days
        action: 'schedule_refresh',
        priority: 'low'
      }
    ];

    // Execute remediation workflows
    const remediationResults = [];
    
    for (const rule of remediationRules) {
      try {
        const affectedDocuments = await this.db.collection('customers').find({
          $expr: rule.condition
        }).limit(1000).toArray();

        if (affectedDocuments.length > 0) {
          const remediation = {
            ruleName: rule.name,
            affectedCount: affectedDocuments.length,
            action: rule.action,
            priority: rule.priority,
            processedAt: new Date(),
            results: []
          };

          // Process based on action type
          for (const doc of affectedDocuments) {
            switch (rule.action) {
              case 'flag_for_review':
                await this.flagForReview(doc._id, rule.name);
                remediation.results.push({ documentId: doc._id, status: 'flagged' });
                break;
                
              case 'auto_format':
                const formatted = await this.autoFormatData(doc, rule.name);
                if (formatted) {
                  remediation.results.push({ documentId: doc._id, status: 'formatted' });
                }
                break;
                
              case 'request_completion':
                await this.requestDataCompletion(doc._id, rule.name);
                remediation.results.push({ documentId: doc._id, status: 'completion_requested' });
                break;
                
              case 'schedule_refresh':
                await this.scheduleDataRefresh(doc._id);
                remediation.results.push({ documentId: doc._id, status: 'refresh_scheduled' });
                break;
            }
          }

          remediationResults.push(remediation);
          console.log(`✅ Processed ${rule.name}: ${remediation.results.length} documents`);
        }

      } catch (error) {
        console.error(`❌ Failed to process rule ${rule.name}:`, error.message);
      }
    }

    // Store remediation audit trail
    if (remediationResults.length > 0) {
      await this.db.collection('remediation_audit').insertOne({
        executionTimestamp: new Date(),
        totalRulesExecuted: remediationRules.length,
        rulesWithMatches: remediationResults.length,
        results: remediationResults,
        executedBy: 'automated_quality_system'
      });
    }

    console.log(`Automated remediation completed: ${remediationResults.length} rules processed`);
    return remediationResults;
  }

  // Helper methods for remediation actions
  async flagForReview(documentId, reason) {
    return await this.db.collection('quality_review_queue').insertOne({
      documentId: documentId,
      reason: reason,
      priority: 'high',
      status: 'pending_review',
      flaggedAt: new Date(),
      assignedTo: null
    });
  }

  async autoFormatData(document, ruleName) {
    // Example: Auto-format phone numbers
    if (ruleName === 'phone_formatting' && document.primaryContact?.phone) {
      const phone = document.primaryContact.phone.replace(/\D/g, '');
      if (phone.length === 10) {
        const formatted = `+1${phone}`;
        
        await this.db.collection('customers').updateOne(
          { _id: document._id },
          { 
            $set: { 
              "primaryContact.phone": formatted,
              "audit.updatedAt": new Date(),
              "audit.lastAutoFormatted": new Date()
            }
          }
        );
        
        return true;
      }
    }
    return false;
  }

  async requestDataCompletion(documentId, reason) {
    return await this.db.collection('data_completion_requests').insertOne({
      documentId: documentId,
      reason: reason,
      requestedAt: new Date(),
      status: 'pending',
      priority: 'high',
      assignedTo: null,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
  }

  async scheduleDataRefresh(documentId) {
    return await this.db.collection('data_refresh_schedule').insertOne({
      documentId: documentId,
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next day
      priority: 'low',
      status: 'scheduled',
      refreshType: 'stale_data_update'
    });
  }
}

// Export the enterprise governance class
module.exports = { EnterpriseDataGovernance };
```

## SQL-Style Schema Validation with QueryLeaf

QueryLeaf provides familiar SQL syntax for MongoDB schema validation and data quality management:

```sql
-- QueryLeaf schema validation with SQL-familiar syntax

-- Create collection with comprehensive validation rules
CREATE TABLE customers (
  _id OBJECTID PRIMARY KEY,
  company_name VARCHAR(500) NOT NULL,
  legal_entity_type VARCHAR(50) NOT NULL,
  
  -- Contact information with validation
  primary_contact JSON NOT NULL CHECK (
    JSON_VALID(primary_contact) AND
    JSON_EXTRACT(primary_contact, '$.email') REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$' AND
    JSON_EXTRACT(primary_contact, '$.phone') REGEXP '^\\+?[1-9]\\d{1,14}$'
  ),
  
  -- Address validation
  billing_address JSON NOT NULL CHECK (
    JSON_VALID(billing_address) AND
    JSON_LENGTH(JSON_EXTRACT(billing_address, '$.street1')) >= 5 AND
    JSON_LENGTH(JSON_EXTRACT(billing_address, '$.city')) >= 2 AND
    JSON_EXTRACT(billing_address, '$.country') IN ('USA', 'CAN', 'MEX', 'GBR', 'FRA', 'DEU')
  ),
  
  -- Business metrics with constraints
  business_metrics JSON CHECK (
    business_metrics IS NULL OR (
      JSON_VALID(business_metrics) AND
      COALESCE(JSON_EXTRACT(business_metrics, '$.annual_revenue'), 0) >= 0 AND
      COALESCE(JSON_EXTRACT(business_metrics, '$.employee_count'), 1) >= 1
    )
  ),
  
  account_status VARCHAR(20) NOT NULL DEFAULT 'active',
  
  -- Compliance fields
  compliance JSON CHECK (
    compliance IS NULL OR (
      JSON_VALID(compliance) AND
      JSON_TYPE(JSON_EXTRACT(compliance, '$.gdpr_consent.has_consent')) = 'BOOLEAN'
    )
  ),
  
  -- Audit fields
  audit JSON NOT NULL CHECK (
    JSON_VALID(audit) AND
    JSON_EXTRACT(audit, '$.created_at') IS NOT NULL AND
    JSON_EXTRACT(audit, '$.updated_at') IS NOT NULL
  ),
  
  -- Conditional constraints
  CONSTRAINT chk_legal_entity_tax_id CHECK (
    legal_entity_type NOT IN ('corporation', 'llc') OR 
    JSON_EXTRACT(compliance, '$.tax_id') IS NOT NULL
  ),
  
  CONSTRAINT chk_public_company_stock_symbol CHECK (
    JSON_EXTRACT(business_metrics, '$.publicly_traded') != TRUE OR
    JSON_EXTRACT(business_metrics, '$.stock_symbol') IS NOT NULL
  ),
  
  CONSTRAINT chk_gdpr_consent_date CHECK (
    'EU' NOT IN (SELECT value FROM JSON_TABLE(
      COALESCE(JSON_EXTRACT(compliance, '$.regulatory_jurisdictions'), '[]'),
      '$[*]' COLUMNS (value VARCHAR(10) PATH '$')
    ) AS jt) OR (
      JSON_EXTRACT(compliance, '$.gdpr_consent.has_consent') = TRUE AND
      JSON_EXTRACT(compliance, '$.gdpr_consent.consent_date') IS NOT NULL
    )
  )
) WITH (
  collection_options = JSON_OBJECT(
    'validation_level', 'strict',
    'validation_action', 'error'
  )
);

-- Data quality analysis with SQL aggregations
WITH data_quality_metrics AS (
  SELECT 
    _id,
    company_name,
    
    -- Email validation
    CASE 
      WHEN JSON_EXTRACT(primary_contact, '$.email') REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'
      THEN 1 ELSE 0 
    END as email_valid,
    
    -- Phone validation  
    CASE
      WHEN JSON_EXTRACT(primary_contact, '$.phone') REGEXP '^\\+?[1-9]\\d{1,14}$'
      THEN 1 ELSE 0
    END as phone_valid,
    
    -- Address completeness
    CASE
      WHEN JSON_EXTRACT(billing_address, '$.street1') IS NOT NULL AND
           JSON_EXTRACT(billing_address, '$.city') IS NOT NULL AND
           JSON_EXTRACT(billing_address, '$.state') IS NOT NULL AND
           JSON_EXTRACT(billing_address, '$.postal_code') IS NOT NULL
      THEN 1 ELSE 0
    END as address_complete,
    
    -- Tax compliance
    CASE
      WHEN legal_entity_type NOT IN ('corporation', 'llc') OR
           JSON_EXTRACT(compliance, '$.tax_id') IS NOT NULL
      THEN 1 ELSE 0
    END as tax_compliant,
    
    -- Data freshness
    CASE
      WHEN TIMESTAMPDIFF(DAY, 
           STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(audit, '$.updated_at')), '%Y-%m-%dT%H:%i:%s.%fZ'),
           NOW()) <= 90
      THEN 1 ELSE 0
    END as data_fresh,
    
    -- GDPR compliance for EU customers
    CASE
      WHEN 'EU' NOT IN (
        SELECT value FROM JSON_TABLE(
          COALESCE(JSON_EXTRACT(compliance, '$.regulatory_jurisdictions'), '[]'),
          '$[*]' COLUMNS (value VARCHAR(10) PATH '$')
        ) AS jt
      ) OR (
        JSON_EXTRACT(compliance, '$.gdpr_consent.has_consent') = TRUE AND
        JSON_EXTRACT(compliance, '$.gdpr_consent.consent_date') IS NOT NULL
      )
      THEN 1 ELSE 0
    END as gdpr_compliant
    
  FROM customers
),
quality_scores AS (
  SELECT *,
    -- Calculate overall quality score (0-100)
    (email_valid * 20 + phone_valid * 15 + address_complete * 25 + 
     tax_compliant * 25 + data_fresh * 15) as overall_quality_score,
     
    -- Quality rating classification
    CASE 
      WHEN (email_valid * 20 + phone_valid * 15 + address_complete * 25 + 
            tax_compliant * 25 + data_fresh * 15) >= 90 THEN 'EXCELLENT'
      WHEN (email_valid * 20 + phone_valid * 15 + address_complete * 25 + 
            tax_compliant * 25 + data_fresh * 15) >= 75 THEN 'GOOD'  
      WHEN (email_valid * 20 + phone_valid * 15 + address_complete * 25 + 
            tax_compliant * 25 + data_fresh * 15) >= 60 THEN 'FAIR'
      ELSE 'POOR'
    END as quality_rating
    
  FROM data_quality_metrics
)

SELECT 
  -- Summary statistics
  COUNT(*) as total_customers,
  AVG(overall_quality_score) as avg_quality_score,
  
  -- Quality distribution
  COUNT(*) FILTER (WHERE quality_rating = 'EXCELLENT') as excellent_count,
  COUNT(*) FILTER (WHERE quality_rating = 'GOOD') as good_count,
  COUNT(*) FILTER (WHERE quality_rating = 'FAIR') as fair_count, 
  COUNT(*) FILTER (WHERE quality_rating = 'POOR') as poor_count,
  
  -- Quality percentages
  ROUND(COUNT(*) FILTER (WHERE quality_rating = 'EXCELLENT') * 100.0 / COUNT(*), 2) as excellent_pct,
  ROUND(COUNT(*) FILTER (WHERE quality_rating = 'GOOD') * 100.0 / COUNT(*), 2) as good_pct,
  ROUND(COUNT(*) FILTER (WHERE quality_rating = 'FAIR') * 100.0 / COUNT(*), 2) as fair_pct,
  ROUND(COUNT(*) FILTER (WHERE quality_rating = 'POOR') * 100.0 / COUNT(*), 2) as poor_pct,
  
  -- Field-specific quality metrics
  ROUND(AVG(email_valid) * 100, 2) as email_validity_rate,
  ROUND(AVG(phone_valid) * 100, 2) as phone_validity_rate,
  ROUND(AVG(address_complete) * 100, 2) as address_completeness_rate,
  ROUND(AVG(tax_compliant) * 100, 2) as tax_compliance_rate,
  ROUND(AVG(data_fresh) * 100, 2) as data_freshness_rate,
  ROUND(AVG(gdpr_compliant) * 100, 2) as gdpr_compliance_rate,
  
  -- Data quality health score
  ROUND((AVG(email_valid) + AVG(phone_valid) + AVG(address_complete) + 
         AVG(tax_compliant) + AVG(data_fresh) + AVG(gdpr_compliant)) / 6 * 100, 2) as overall_health_score
         
FROM quality_scores;

-- Automated data quality monitoring view
CREATE VIEW data_quality_dashboard AS 
WITH real_time_quality AS (
  SELECT 
    DATE_FORMAT(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(audit, '$.created_at')), 
                '%Y-%m-%dT%H:%i:%s.%fZ'), '%Y-%m-%d %H:00:00') as hour_bucket,
    
    -- Quality metrics by hour
    COUNT(*) as records_processed,
    
    AVG(CASE WHEN JSON_EXTRACT(primary_contact, '$.email') REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$' 
             THEN 1 ELSE 0 END) as email_validity_rate,
             
    AVG(CASE WHEN JSON_EXTRACT(primary_contact, '$.phone') REGEXP '^\\+?[1-9]\\d{1,14}$'
             THEN 1 ELSE 0 END) as phone_validity_rate,
             
    AVG(CASE WHEN JSON_EXTRACT(billing_address, '$.street1') IS NOT NULL AND
                   JSON_EXTRACT(billing_address, '$.city') IS NOT NULL
             THEN 1 ELSE 0 END) as address_completeness_rate,
             
    -- Compliance rates
    AVG(CASE WHEN legal_entity_type NOT IN ('corporation', 'llc') OR 
                   JSON_EXTRACT(compliance, '$.tax_id') IS NOT NULL
             THEN 1 ELSE 0 END) as tax_compliance_rate,
             
    -- Alert conditions
    COUNT(*) FILTER (WHERE 
      JSON_EXTRACT(primary_contact, '$.email') NOT REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'
    ) as invalid_email_count,
    
    COUNT(*) FILTER (WHERE
      legal_entity_type IN ('corporation', 'llc') AND
      JSON_EXTRACT(compliance, '$.tax_id') IS NULL
    ) as missing_tax_id_count
    
  FROM customers
  WHERE STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(audit, '$.created_at')), 
                    '%Y-%m-%dT%H:%i:%s.%fZ') >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
  GROUP BY DATE_FORMAT(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(audit, '$.created_at')), 
                       '%Y-%m-%dT%H:%i:%s.%fZ'), '%Y-%m-%d %H:00:00')
)

SELECT 
  hour_bucket as monitoring_hour,
  records_processed,
  ROUND(email_validity_rate * 100, 2) as email_validity_pct,
  ROUND(phone_validity_rate * 100, 2) as phone_validity_pct,
  ROUND(address_completeness_rate * 100, 2) as address_completeness_pct,
  ROUND(tax_compliance_rate * 100, 2) as tax_compliance_pct,
  
  -- Overall quality score for the hour
  ROUND((email_validity_rate + phone_validity_rate + address_completeness_rate + tax_compliance_rate) / 4 * 100, 2) as hourly_quality_score,
  
  -- Issue counts
  invalid_email_count,
  missing_tax_id_count,
  
  -- Alert status
  CASE 
    WHEN invalid_email_count > records_processed * 0.1 THEN '🔴 High Invalid Email Rate'
    WHEN missing_tax_id_count > 0 THEN '🟠 Missing Tax IDs'
    WHEN (email_validity_rate + phone_validity_rate + address_completeness_rate + tax_compliance_rate) / 4 < 0.8 THEN '🟡 Below Quality Threshold'
    ELSE '🟢 Quality Within Target'
  END as quality_status,
  
  -- Recommendations
  CASE
    WHEN invalid_email_count > records_processed * 0.05 THEN 'Implement email validation at point of entry'
    WHEN missing_tax_id_count > 5 THEN 'Review tax ID collection process'  
    WHEN address_completeness_rate < 0.9 THEN 'Improve address validation workflow'
    ELSE 'Monitor quality trends'
  END as recommendation

FROM real_time_quality  
ORDER BY hour_bucket DESC;

-- Data quality remediation workflow
WITH quality_issues AS (
  SELECT 
    _id,
    company_name,
    
    -- Identify specific issues
    CASE WHEN JSON_EXTRACT(primary_contact, '$.email') NOT REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'
         THEN 'INVALID_EMAIL' END as email_issue,
         
    CASE WHEN JSON_EXTRACT(primary_contact, '$.phone') NOT REGEXP '^\\+?[1-9]\\d{1,14}$'
         THEN 'INVALID_PHONE' END as phone_issue,
         
    CASE WHEN JSON_EXTRACT(billing_address, '$.street1') IS NULL OR 
              JSON_EXTRACT(billing_address, '$.city') IS NULL
         THEN 'INCOMPLETE_ADDRESS' END as address_issue,
         
    CASE WHEN legal_entity_type IN ('corporation', 'llc') AND
              JSON_EXTRACT(compliance, '$.tax_id') IS NULL
         THEN 'MISSING_TAX_ID' END as tax_issue,
         
    -- Priority calculation
    CASE 
      WHEN legal_entity_type IN ('corporation', 'llc') AND 
           JSON_EXTRACT(compliance, '$.tax_id') IS NULL THEN 'HIGH'
      WHEN JSON_EXTRACT(primary_contact, '$.email') NOT REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$' THEN 'HIGH'
      WHEN JSON_EXTRACT(billing_address, '$.street1') IS NULL THEN 'MEDIUM'
      ELSE 'LOW'
    END as issue_priority
    
  FROM customers
  WHERE 
    JSON_EXTRACT(primary_contact, '$.email') NOT REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$' OR
    JSON_EXTRACT(primary_contact, '$.phone') NOT REGEXP '^\\+?[1-9]\\d{1,14}$' OR
    JSON_EXTRACT(billing_address, '$.street1') IS NULL OR
    JSON_EXTRACT(billing_address, '$.city') IS NULL OR
    (legal_entity_type IN ('corporation', 'llc') AND JSON_EXTRACT(compliance, '$.tax_id') IS NULL)
)

SELECT 
  _id as customer_id,
  company_name,
  
  -- Consolidate issues
  CONCAT_WS(', ', 
    email_issue,
    phone_issue, 
    address_issue,
    tax_issue
  ) as identified_issues,
  
  issue_priority,
  
  -- Recommended actions
  CASE issue_priority
    WHEN 'HIGH' THEN 'Immediate manual review and correction required'
    WHEN 'MEDIUM' THEN 'Schedule for data completion workflow'
    WHEN 'LOW' THEN 'Include in next batch quality improvement'
  END as recommended_action,
  
  -- Auto-remediation possibility
  CASE 
    WHEN phone_issue = 'INVALID_PHONE' AND 
         JSON_EXTRACT(primary_contact, '$.phone') REGEXP '^[0-9]{10}$' THEN 'AUTO_FORMAT_PHONE'
    WHEN address_issue = 'INCOMPLETE_ADDRESS' AND
         JSON_EXTRACT(billing_address, '$.street1') IS NOT NULL THEN 'REQUEST_COMPLETION'
    ELSE 'MANUAL_REVIEW'
  END as remediation_type,
  
  NOW() as identified_at

FROM quality_issues
ORDER BY 
  CASE issue_priority 
    WHEN 'HIGH' THEN 1 
    WHEN 'MEDIUM' THEN 2 
    ELSE 3 
  END,
  company_name;

-- QueryLeaf provides comprehensive schema validation capabilities:
-- 1. SQL-familiar constraint syntax for MongoDB document validation
-- 2. Advanced JSON validation with nested field constraints
-- 3. Conditional validation rules based on document context
-- 4. Real-time data quality monitoring with SQL aggregations
-- 5. Automated quality scoring and rating classification
-- 6. Data quality dashboard views with trend analysis
-- 7. Compliance reporting with regulatory requirement tracking
-- 8. Quality issue identification and remediation workflows
-- 9. Integration with MongoDB's native validation features
-- 10. Familiar SQL patterns for complex data governance requirements
```

## Best Practices for Schema Validation Implementation

### Validation Strategy Design

Essential practices for effective MongoDB schema validation:

1. **Progressive Validation**: Start with warning-level validation and gradually enforce strict rules
2. **Conditional Logic**: Use document context to apply appropriate validation rules
3. **Business Rule Integration**: Align validation rules with actual business requirements
4. **Performance Consideration**: Balance validation thoroughness with write performance
5. **Error Messaging**: Provide clear, actionable error messages for validation failures
6. **Version Management**: Plan for schema evolution and backward compatibility

### Data Quality Management

Implement comprehensive data quality monitoring for production environments:

1. **Continuous Monitoring**: Track data quality metrics in real-time with automated dashboards
2. **Quality Scoring**: Develop standardized quality scores across different document types
3. **Remediation Workflows**: Implement automated and manual remediation processes
4. **Compliance Tracking**: Monitor regulatory compliance requirements continuously
5. **Historical Analysis**: Track data quality trends over time for improvement insights
6. **Integration Patterns**: Coordinate validation across multiple data sources and systems

## Conclusion

MongoDB Schema Validation provides comprehensive data quality management capabilities that eliminate the complexity and rigidity of traditional database constraint systems. The combination of flexible document validation, sophisticated business rule enforcement, and automated quality monitoring enables enterprise-grade data governance that adapts to evolving requirements while maintaining strict compliance standards.

Key Schema Validation benefits include:

- **Flexible Validation**: Document-based validation that adapts to varying data structures and requirements
- **Business Logic Integration**: Advanced conditional validation based on document context and business rules  
- **Automated Quality Management**: Real-time quality monitoring with automated remediation workflows
- **Compliance Reporting**: Comprehensive regulatory compliance tracking and audit capabilities
- **Performance Optimization**: Efficient validation that scales with data volume and complexity
- **Developer Productivity**: SQL-familiar validation patterns that reduce implementation complexity

Whether you're building financial services applications, healthcare systems, e-commerce platforms, or any enterprise application requiring strict data quality standards, MongoDB Schema Validation with QueryLeaf's SQL-familiar interface provides the foundation for robust data governance. This combination enables sophisticated validation strategies while preserving familiar database interaction patterns.

> **QueryLeaf Integration**: QueryLeaf automatically translates SQL constraint definitions into MongoDB validation schemas, providing familiar CREATE TABLE syntax with CHECK constraints, conditional validation rules, and data quality monitoring queries. Advanced validation patterns, compliance reporting, and automated remediation workflows are seamlessly accessible through SQL constructs, making enterprise data governance both powerful and approachable for SQL-oriented teams.

The integration of flexible validation capabilities with SQL-style operations makes MongoDB an ideal platform for applications requiring both strict data quality enforcement and adaptive schema evolution, ensuring your data governance solutions remain both effective and maintainable as requirements evolve and data volumes scale.